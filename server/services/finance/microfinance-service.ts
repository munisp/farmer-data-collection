/**
 * Microfinance Service
 * 
 * Provides microfinance and lending services:
 * - Loan application and approval
 * - Repayment tracking
 * - Credit score calculation
 * - Lender management
 * - Default risk assessment
 */

import { getDb } from '../../db';
import {
  lenders,
  loans,
  loanRepayments,
  creditScores,
  creditScoreHistory,
  type Loan,
  type LoanRepayment,
  type CreditScore,
} from '../../../drizzle/financial-schema';
import { eq, and, sql, desc, lt, gte } from 'drizzle-orm';
import { logger } from '../../logger.js';

export interface CreateLoanInput {
  userId: number;
  lenderId: number;
  loanType: string; // working_capital, equipment, land, emergency
  principalAmount: number; // in cents
  interestRate: number; // annual percentage
  termMonths: number;
  purpose: string;
  collateral?: string;
}

export interface LoanRepaymentInput {
  loanId: number;
  amount: number; // in cents
  paymentDate: Date;
  paymentMethod?: string;
  transactionReference?: string;
}

export interface CreditScoreFactors {
  repaymentHistory: number; // 0-100
  farmProductivity: number; // 0-100
  incomeStability: number; // 0-100
  debtToIncomeRatio: number; // 0-100
  businessAge: number; // 0-100
}

export class MicrofinanceService {
  /**
   * Apply for a loan
   */
  async applyForLoan(input: CreateLoanInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Calculate credit score
    const creditScore = await this.calculateCreditScore(input.userId);

    if (creditScore < 300) {
      throw new Error('Credit score too low for loan approval');
    }

    // Calculate monthly payment (simple amortization)
    const monthlyInterestRate = input.interestRate / 100 / 12;
    const monthlyPayment = Math.round(
      (input.principalAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, input.termMonths)) /
      (Math.pow(1 + monthlyInterestRate, input.termMonths) - 1)
    );

    // Calculate total amount (principal + interest)
    const totalAmount = monthlyPayment * input.termMonths;

    // Create loan
    const loanNumber = `LN-${Date.now()}-${input.userId}`;
    const [loan] = await database.insert(loans).values({
      userId: input.userId,
      loanNumber,
      lenderId: input.lenderId,
      loanType: input.loanType,
      principalAmount: input.principalAmount,
      interestRate: input.interestRate,
      term: input.termMonths,
      termMonths: input.termMonths,
      monthlyPayment,
      totalAmount,
      outstandingBalance: totalAmount,
      purpose: input.purpose,
      collateral: input.collateral,
      status: 'pending',
      applicationDate: new Date(),
    }).returning();

    logger.info(`[Microfinance] Loan application ${loan.id} submitted for user ${input.userId}`);
    return loan.id;
  }

  /**
   * Approve loan
   */
  async approveLoan(loanId: number, approverId: number): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const [loan] = await database
      .select()
      .from(loans)
      .where(eq(loans.id, loanId))
      .limit(1);

    if (!loan) {
      throw new Error('Loan not found');
    }

    if (loan.status !== 'pending') {
      throw new Error(`Loan is already ${loan.status}`);
    }

    // Calculate first payment due date (30 days from now)
    const nextPaymentDue = new Date();
    nextPaymentDue.setDate(nextPaymentDue.getDate() + 30);

    await database.update(loans)
      .set({
        status: 'approved',
        approvedBy: approverId,
        approvedAt: new Date(),
        disbursedAt: new Date(),
        nextPaymentDue,
        updatedAt: new Date(),
      })
      .where(eq(loans.id, loanId));

    logger.info(`[Microfinance] Loan ${loanId} approved`);
  }

  /**
   * Reject loan
   */
  async rejectLoan(loanId: number, approverId: number, reason: string): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    await database.update(loans)
      .set({
        status: 'rejected',
        approvedBy: approverId,
        approvedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(loans.id, loanId));

    logger.info(`[Microfinance] Loan ${loanId} rejected`);
  }

  /**
   * Record loan repayment
   */
  async recordRepayment(input: LoanRepaymentInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get loan
    const [loan] = await database
      .select()
      .from(loans)
      .where(eq(loans.id, input.loanId))
      .limit(1);

    if (!loan) {
      throw new Error('Loan not found');
    }

    if (loan.status !== 'approved' && loan.status !== 'active') {
      throw new Error(`Cannot repay loan with status: ${loan.status}`);
    }

    // Calculate interest and principal portions
    const monthlyInterestRate = (loan.interestRate || 0) / 100 / 12;
    const outstandingBalance = loan.outstandingBalance || 0;
    const interestAmount = Math.round(outstandingBalance * monthlyInterestRate);
    const principalAmount = Math.min(input.amount - interestAmount, outstandingBalance - interestAmount);

    // Calculate actual payment number by counting existing repayments
    const existingRepayments = await database
      .select({ count: sql<number>`COUNT(*)` })
      .from(loanRepayments)
      .where(eq(loanRepayments.loanId, input.loanId));
    const paymentNumber = (Number(existingRepayments[0]?.count) || 0) + 1;

    // Create repayment record
    const [repayment] = await database.insert(loanRepayments).values({
      loanId: input.loanId,
      paymentNumber,
      dueDate: new Date(),
      paidDate: input.paymentDate,
      principalAmount,
      interestAmount,
      totalAmount: input.amount,
      paidAmount: input.amount,
      paymentMethod: input.paymentMethod,
      transactionReference: input.transactionReference,
      status: 'paid',
    }).returning();

    // Update loan outstanding balance
    const newBalance = outstandingBalance - input.amount;
    const newStatus = newBalance <= 0 ? 'paid_off' : 'active';

    // Calculate next payment due date
    const nextPaymentDue = new Date(input.paymentDate);
    nextPaymentDue.setDate(nextPaymentDue.getDate() + 30);

    await database.update(loans)
      .set({
        outstandingBalance: Math.max(0, newBalance),
        status: newStatus,
        nextPaymentDue: newBalance > 0 ? nextPaymentDue : undefined,
        paidOffAt: newBalance <= 0 ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(loans.id, input.loanId));

    // Update credit score
    await this.calculateCreditScore(loan.userId);

    logger.info(`[Microfinance] Recorded repayment ${repayment.id} for loan ${input.loanId}`);
    return repayment.id;
  }

  /**
   * Calculate credit score for user
   */
  async calculateCreditScore(userId: number): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get all user loans
    const userLoans = await database
      .select()
      .from(loans)
      .where(eq(loans.userId, userId));

    if (userLoans.length === 0) {
      // New user - default score
      return await this.saveCreditScore(userId, 500, {
        repaymentHistory: 50,
        farmProductivity: 50,
        incomeStability: 50,
        debtToIncomeRatio: 50,
        businessAge: 50,
      });
    }

    // Calculate factors
    const factors = await this.calculateCreditScoreFactors(userId);

    // Weighted scoring model
    const score = Math.round(
      factors.repaymentHistory * 0.35 +
      factors.farmProductivity * 0.25 +
      factors.incomeStability * 0.20 +
      factors.debtToIncomeRatio * 0.15 +
      factors.businessAge * 0.05
    ) * 8.5; // Scale to 300-850 range

    // Ensure score is in valid range
    const finalScore = Math.max(300, Math.min(850, score));

    return await this.saveCreditScore(userId, finalScore, factors);
  }

  /**
   * Calculate credit score factors
   */
  private async calculateCreditScoreFactors(userId: number): Promise<CreditScoreFactors> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // 1. Repayment History (35%)
    const userLoans = await database
      .select()
      .from(loans)
      .where(eq(loans.userId, userId));

    const repayments = await database
      .select()
      .from(loanRepayments)
      .where(sql`${loanRepayments.loanId} = ANY(${userLoans.map(l => l.id)})`);

    let repaymentScore = 50; // Default
    if (repayments.length > 0) {
      const onTimePayments = repayments.filter(r => r.status === 'completed').length;
      repaymentScore = Math.min(100, (onTimePayments / repayments.length) * 100);
    }

    // 2. Farm Productivity (25%) - Based on harvest yields
    const harvests = await database
      .select()
      .from(sql`harvests`)
      .where(sql`user_id = ${userId}`)
      .limit(10);

    let productivityScore = 50;
    if (harvests.length > 0) {
      // Simple productivity metric: average revenue per harvest
      const avgRevenue = harvests.reduce((sum: number, h: any) => sum + (h.revenue || 0), 0) / harvests.length;
      productivityScore = Math.min(100, (avgRevenue / 100000) * 100); // Assume ₦100k is good
    }

    // 3. Income Stability (20%) - Based on consistent revenue
    const expenses = await database
      .select()
      .from(sql`expenses`)
      .where(sql`user_id = ${userId}`)
      .limit(12);

    let stabilityScore = 50;
    if (expenses.length >= 3) {
      // Calculate coefficient of variation (lower is better)
      const amounts = expenses.map((e: Record<string, any>) => e.amount);
      const mean = amounts.reduce((sum: number, val: number) => sum + val, 0) / amounts.length;
      const variance = amounts.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / mean;
      stabilityScore = Math.max(0, Math.min(100, (1 - cv) * 100));
    }

    // 4. Debt-to-Income Ratio (15%)
    const activeLoans = userLoans.filter(l => l.status === 'active' || l.status === 'approved');
    const totalDebt = activeLoans.reduce((sum, l) => sum + (l.outstandingBalance ?? 0), 0);
    const monthlyIncome = productivityScore * 1000; // Rough estimate

    let debtRatioScore = 100;
    if (monthlyIncome > 0) {
      const debtRatio = totalDebt / (monthlyIncome * 12);
      debtRatioScore = Math.max(0, Math.min(100, (1 - debtRatio) * 100));
    }

    // 5. Business Age (5%)
    const accountAge = await database
      .select({ createdAt: sql`created_at` })
      .from(sql`users`)
      .where(sql`id = ${userId}`)
      .limit(1);

    let ageScore = 0;
    if (accountAge.length > 0 && accountAge[0].createdAt) {
      const createdAt = accountAge[0].createdAt as string | number | Date;
      const monthsOld = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30);
      ageScore = Math.min(100, (monthsOld / 24) * 100); // 24 months = 100%
    }

    return {
      repaymentHistory: repaymentScore,
      farmProductivity: productivityScore,
      incomeStability: stabilityScore,
      debtToIncomeRatio: debtRatioScore,
      businessAge: ageScore,
    };
  }

  /**
   * Save credit score
   */
  private async saveCreditScore(userId: number, score: number, factors: CreditScoreFactors): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Determine risk category
    let riskCategory = 'high';
    if (score >= 700) riskCategory = 'low';
    else if (score >= 600) riskCategory = 'medium';

    // Upsert credit score
    await database
      .insert(creditScores)
      .values({
        userId,
        score,
        riskCategory,
        factors: JSON.stringify(factors),
        calculatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [creditScores.userId],
        set: {
          score,
          riskCategory,
          factors: JSON.stringify(factors),
          calculatedAt: new Date(),
          previousScore: sql`${creditScores.score}`,
        },
      });

    // Save to history
    await database.insert(creditScoreHistory).values({
      userId,
      score,
      rating: riskCategory,
      factors: JSON.stringify(factors),
      calculatedAt: new Date(),
    });

    logger.info(`[Microfinance] Credit score for user ${userId}: ${score} (${riskCategory} risk)`);
    return score;
  }

  /**
   * Get loans for user
   */
  async getLoans(userId: number, status?: string): Promise<Loan[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    if (status) {
      return await database
        .select()
        .from(loans)
        .where(and(
          eq(loans.userId, userId),
          eq(loans.status, status)
        ))
        .orderBy(desc(loans.applicationDate));
    }

    return await database
      .select()
      .from(loans)
      .where(eq(loans.userId, userId))
      .orderBy(desc(loans.applicationDate));
  }

  /**
   * Get overdue loans
   */
  async getOverdueLoans(userId?: number): Promise<Loan[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const today = new Date();

    if (userId) {
      return await database
        .select()
        .from(loans)
        .where(and(
          eq(loans.userId, userId),
          eq(loans.status, 'active'),
          lt(loans.nextPaymentDue, today)
        ))
        .orderBy(loans.nextPaymentDue);
    }

    return await database
      .select()
      .from(loans)
      .where(and(
        eq(loans.status, 'active'),
        lt(loans.nextPaymentDue, today)
      ))
      .orderBy(loans.nextPaymentDue);
  }

  /**
   * Get credit score for user
   */
  async getCreditScore(userId: number): Promise<CreditScore | null> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const [score] = await database
      .select()
      .from(creditScores)
      .where(eq(creditScores.userId, userId))
      .limit(1);

    return score || null;
  }

  /**
   * Get credit score history
   */
  async getCreditScoreHistory(userId: number, limit: number = 12): Promise<any[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    return await database
      .select()
      .from(creditScoreHistory)
      .where(eq(creditScoreHistory.userId, userId))
      .orderBy(desc(creditScoreHistory.calculatedAt))
      .limit(limit);
  }
}

// Export singleton instance
export const microfinanceService = new MicrofinanceService();
