import { getDb } from '../db';
import { loans, loanRepayments } from '../../drizzle/financial-schema';
import { users } from '../../drizzle/schema';
import { eq, and, sql, desc, gte } from 'drizzle-orm';
import { logger } from '../logger.js';

export type RiskCategory = 'low' | 'medium' | 'high' | 'critical';

export interface BorrowerRiskProfile {
  userId: number;
  borrowerName: string;
  borrowerEmail: string;
  riskScore: number; // 0-100, lower is better
  riskCategory: RiskCategory;
  factors: {
    paymentHistory: {
      score: number;
      onTimePayments: number;
      latePayments: number;
      missedPayments: number;
      averageDaysLate: number;
    };
    debtToIncome: {
      score: number;
      totalDebt: number;
      estimatedIncome: number;
      ratio: number;
    };
    creditUtilization: {
      score: number;
      totalBorrowed: number;
      totalRepaid: number;
      outstandingBalance: number;
    };
    loanHistory: {
      score: number;
      totalLoans: number;
      activeLoans: number;
      defaultedLoans: number;
      paidOffLoans: number;
    };
  };
  recommendations: string[];
  lastAssessment: Date;
}

/**
 * Calculate payment history score (0-100, lower is better)
 */
async function calculatePaymentHistoryScore(userId: number): Promise<{
  score: number;
  onTimePayments: number;
  latePayments: number;
  missedPayments: number;
  averageDaysLate: number;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get all repayments for user's loans
  const userLoans = await db
    .select({ id: loans.id })
    .from(loans)
    .where(eq(loans.userId, userId));

  const loanIds = userLoans.map(l => l.id);

  if (loanIds.length === 0) {
    return {
      score: 50, // Neutral score for no history
      onTimePayments: 0,
      latePayments: 0,
      missedPayments: 0,
      averageDaysLate: 0,
    };
  }

  const repayments = await db
    .select()
    .from(loanRepayments)
    .where(sql`${loanRepayments.loanId} IN (${sql.join(loanIds.map(id => sql`${id}`), sql`, `)})`);

  let onTimePayments = 0;
  let latePayments = 0;
  let missedPayments = 0;
  let totalDaysLate = 0;

  for (const repayment of repayments) {
    if (repayment.status === 'paid' && repayment.paidDate) {
      const daysLate = Math.ceil(
        (repayment.paidDate.getTime() - repayment.dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysLate <= 0) {
        onTimePayments++;
      } else {
        latePayments++;
        totalDaysLate += daysLate;
      }
    } else if (repayment.status === 'overdue') {
      missedPayments++;
    }
  }

  const totalPayments = onTimePayments + latePayments + missedPayments;
  const averageDaysLate = latePayments > 0 ? totalDaysLate / latePayments : 0;

  // Calculate score: 0 (perfect) to 100 (terrible)
  const onTimeRate = totalPayments > 0 ? onTimePayments / totalPayments : 0.5;
  const lateRate = totalPayments > 0 ? latePayments / totalPayments : 0;
  const missedRate = totalPayments > 0 ? missedPayments / totalPayments : 0;

  const score = Math.min(100, Math.round(
    (1 - onTimeRate) * 40 + // On-time payment rate (40 points)
    lateRate * 30 + // Late payment rate (30 points)
    missedRate * 30 + // Missed payment rate (30 points)
    Math.min(averageDaysLate / 30, 1) * 20 // Average days late (20 points)
  ));

  return {
    score,
    onTimePayments,
    latePayments,
    missedPayments,
    averageDaysLate,
  };
}

/**
 * Calculate debt-to-income score (0-100, lower is better)
 */
async function calculateDebtToIncomeScore(userId: number): Promise<{
  score: number;
  totalDebt: number;
  estimatedIncome: number;
  ratio: number;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get total outstanding debt
  const userLoans = await db
    .select({
      outstandingBalance: loans.outstandingBalance,
    })
    .from(loans)
    .where(
      and(
        eq(loans.userId, userId),
        sql`${loans.status} IN ('disbursed', 'active')`
      )
    );

  const totalDebt = userLoans.reduce((sum, loan) => sum + (loan.outstandingBalance || 0), 0);

  // Get actual income from farmer profile
  const { farms, harvests, expenses } = await import('../../drizzle/schema.js');
  const { sum } = await import('drizzle-orm');
  
  // First try to get farm profile with size data (farmSize is on farms table, not farmers)
  const farmProfile = await db
    .select({
      farmSize: farms.farmSize,
    })
    .from(farms)
    .where(eq(farms.userId, userId))
    .limit(1);

  // Calculate estimated annual income from harvest data (last 12 months)
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  // harvests table uses userId directly and has 'revenue' field (not totalValue)
  const harvestIncome = await db
    .select({
      totalIncome: sql<number>`COALESCE(SUM(${harvests.revenue}), 0)`,
    })
    .from(harvests)
    .where(
      and(
        eq(harvests.userId, userId),
        gte(harvests.harvestDate, oneYearAgo)
      )
    );

  // Calculate expenses (last 12 months)
  // expenses table uses userId directly and has 'expenseDate' field (not date)
  const farmerExpenses = await db
    .select({
      totalExpenses: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        gte(expenses.expenseDate, oneYearAgo)
      )
    );

  const grossIncome = Number(harvestIncome[0]?.totalIncome || 0);
  const totalExpenses = Number(farmerExpenses[0]?.totalExpenses || 0);
  const netIncome = grossIncome - totalExpenses;

  // If we have actual income data, use it; otherwise estimate from farm size or loan history
  let estimatedIncome: number;
  if (netIncome > 0) {
    estimatedIncome = netIncome;
  } else if (farmProfile.length > 0 && farmProfile[0].farmSize) {
    // Estimate based on farm size (rough estimate: $500-1000 per hectare per year)
    estimatedIncome = Number(farmProfile[0].farmSize) * 750;
  } else {
    // Fallback: estimate based on loan amounts (assumption: lenders approve based on income)
    const allLoans = await db
      .select({ principalAmount: loans.principalAmount })
      .from(loans)
      .where(eq(loans.userId, userId));
    const totalBorrowed = allLoans.reduce((sum, loan) => sum + loan.principalAmount, 0);
    estimatedIncome = totalBorrowed > 0 ? totalBorrowed * 2 : 100000;
  }

  const ratio = estimatedIncome > 0 ? totalDebt / estimatedIncome : 0;

  // Calculate score: 0 (low debt) to 100 (high debt)
  // DTI < 20% = excellent, 20-35% = good, 35-50% = fair, >50% = poor
  let score = 0;
  if (ratio < 0.2) {
    score = ratio * 100; // 0-20
  } else if (ratio < 0.35) {
    score = 20 + (ratio - 0.2) * 200; // 20-50
  } else if (ratio < 0.5) {
    score = 50 + (ratio - 0.35) * 200; // 50-80
  } else {
    score = Math.min(100, 80 + (ratio - 0.5) * 100); // 80-100
  }

  return {
    score: Math.round(score),
    totalDebt,
    estimatedIncome,
    ratio,
  };
}

/**
 * Calculate credit utilization score (0-100, lower is better)
 */
async function calculateCreditUtilizationScore(userId: number): Promise<{
  score: number;
  totalBorrowed: number;
  totalRepaid: number;
  outstandingBalance: number;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const userLoans = await db
    .select({
      principalAmount: loans.principalAmount,
      outstandingBalance: loans.outstandingBalance,
    })
    .from(loans)
    .where(eq(loans.userId, userId));

  const totalBorrowed = userLoans.reduce((sum, loan) => sum + loan.principalAmount, 0);
  const outstandingBalance = userLoans.reduce((sum, loan) => sum + (loan.outstandingBalance || 0), 0);
  const totalRepaid = totalBorrowed - outstandingBalance;

  const utilizationRate = totalBorrowed > 0 ? outstandingBalance / totalBorrowed : 0;

  // Score: 0 (low utilization) to 100 (high utilization)
  const score = Math.round(utilizationRate * 100);

  return {
    score,
    totalBorrowed,
    totalRepaid,
    outstandingBalance,
  };
}

/**
 * Calculate loan history score (0-100, lower is better)
 */
async function calculateLoanHistoryScore(userId: number): Promise<{
  score: number;
  totalLoans: number;
  activeLoans: number;
  defaultedLoans: number;
  paidOffLoans: number;
}> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const userLoans = await db
    .select({ status: loans.status })
    .from(loans)
    .where(eq(loans.userId, userId));

  const totalLoans = userLoans.length;
  const activeLoans = userLoans.filter(l => l.status === 'disbursed' || l.status === 'active').length;
  const defaultedLoans = userLoans.filter(l => l.status === 'defaulted').length;
  const paidOffLoans = userLoans.filter(l => l.status === 'paid_off').length;

  if (totalLoans === 0) {
    return {
      score: 50, // Neutral for no history
      totalLoans: 0,
      activeLoans: 0,
      defaultedLoans: 0,
      paidOffLoans: 0,
    };
  }

  const defaultRate = defaultedLoans / totalLoans;
  const paidOffRate = paidOffLoans / totalLoans;

  // Score: defaults are heavily penalized, paid-off loans reduce score
  const score = Math.round(
    defaultRate * 80 + // Defaults (80 points)
    (1 - paidOffRate) * 20 // Lack of paid-off loans (20 points)
  );

  return {
    score,
    totalLoans,
    activeLoans,
    defaultedLoans,
    paidOffLoans,
  };
}

/**
 * Calculate overall risk score and category
 */
function calculateOverallRiskScore(factors: BorrowerRiskProfile['factors']): {
  riskScore: number;
  riskCategory: RiskCategory;
} {
  // Weighted average of all factors
  const weights = {
    paymentHistory: 0.4,
    debtToIncome: 0.25,
    creditUtilization: 0.2,
    loanHistory: 0.15,
  };

  const riskScore = Math.round(
    factors.paymentHistory.score * weights.paymentHistory +
    factors.debtToIncome.score * weights.debtToIncome +
    factors.creditUtilization.score * weights.creditUtilization +
    factors.loanHistory.score * weights.loanHistory
  );

  let riskCategory: RiskCategory;
  if (riskScore < 25) {
    riskCategory = 'low';
  } else if (riskScore < 50) {
    riskCategory = 'medium';
  } else if (riskScore < 75) {
    riskCategory = 'high';
  } else {
    riskCategory = 'critical';
  }

  return { riskScore, riskCategory };
}

/**
 * Generate recommendations based on risk factors
 */
function generateRecommendations(factors: BorrowerRiskProfile['factors'], riskCategory: RiskCategory): string[] {
  const recommendations: string[] = [];

  if (factors.paymentHistory.latePayments > 0) {
    recommendations.push('Improve payment timeliness to build better credit history');
  }

  if (factors.paymentHistory.missedPayments > 0) {
    recommendations.push('Avoid missed payments by setting up automatic reminders');
  }

  if (factors.debtToIncome.ratio > 0.5) {
    recommendations.push('Reduce debt-to-income ratio before taking new loans');
  } else if (factors.debtToIncome.ratio > 0.35) {
    recommendations.push('Consider consolidating existing debts');
  }

  if (factors.creditUtilization.score > 70) {
    recommendations.push('Pay down existing balances to improve credit utilization');
  }

  if (factors.loanHistory.defaultedLoans > 0) {
    recommendations.push('Work on resolving defaulted loans to rebuild credit');
  }

  if (riskCategory === 'low') {
    recommendations.push('Excellent credit profile - eligible for best rates');
  } else if (riskCategory === 'medium') {
    recommendations.push('Good credit profile - continue maintaining on-time payments');
  } else if (riskCategory === 'high') {
    recommendations.push('Requires improvement - focus on timely payments and debt reduction');
  } else {
    recommendations.push('High risk - loan approval unlikely without significant improvement');
  }

  return recommendations;
}

/**
 * Assess borrower risk profile
 */
export async function assessBorrowerRisk(userId: number): Promise<BorrowerRiskProfile> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get user info
  const user = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (user.length === 0) {
    throw new Error('User not found');
  }

  const borrowerName = `${user[0].firstName} ${user[0].lastName}`;
  const borrowerEmail = user[0].email;

  // Calculate all risk factors
  const paymentHistory = await calculatePaymentHistoryScore(userId);
  const debtToIncome = await calculateDebtToIncomeScore(userId);
  const creditUtilization = await calculateCreditUtilizationScore(userId);
  const loanHistory = await calculateLoanHistoryScore(userId);

  const factors = {
    paymentHistory,
    debtToIncome,
    creditUtilization,
    loanHistory,
  };

  const { riskScore, riskCategory } = calculateOverallRiskScore(factors);
  const recommendations = generateRecommendations(factors, riskCategory);

  return {
    userId,
    borrowerName,
    borrowerEmail,
    riskScore,
    riskCategory,
    factors,
    recommendations,
    lastAssessment: new Date(),
  };
}

/**
 * Get risk profiles for all borrowers
 */
export async function getAllBorrowerRiskProfiles(): Promise<BorrowerRiskProfile[]> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Get all users who have loans
  const borrowers = await db
    .select({ userId: loans.userId })
    .from(loans)
    .groupBy(loans.userId);

  const profiles: BorrowerRiskProfile[] = [];

  for (const borrower of borrowers) {
    try {
      const profile = await assessBorrowerRisk(borrower.userId);
      profiles.push(profile);
    } catch (error) {
      logger.error(`Failed to assess risk for user ${borrower.userId}:`, error);
    }
  }

  // Sort by risk score (highest risk first)
  return profiles.sort((a, b) => b.riskScore - a.riskScore);
}
