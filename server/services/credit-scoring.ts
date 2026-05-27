import { getDb } from "../db.js";
import { loans, loanRepayments } from "../../drizzle/financial-schema.js";
import { eq, and, sql } from "drizzle-orm";

export interface CreditScoreFactors {
  paymentHistory: number; // 0-100
  loanUtilization: number; // 0-100
  creditHistoryLength: number; // 0-100
  loanDiversity: number; // 0-100
  recentInquiries: number; // 0-100
}

export interface CreditScoreResult {
  score: number; // 300-850
  riskCategory: "low" | "medium" | "high";
  factors: CreditScoreFactors;
}

/**
 * Credit Scoring Service
 * 
 * Calculates credit scores based on:
 * 1. Payment History (35%) - On-time payments, late payments, defaults
 * 2. Loan Utilization (30%) - Amount borrowed vs. repaid
 * 3. Credit History Length (15%) - How long the user has had loans
 * 4. Loan Diversity (10%) - Mix of different loan types
 * 5. Recent Inquiries (10%) - Recent loan applications
 */
export class CreditScoringService {
  /**
   * Calculate credit score for a user
   */
  async calculateCreditScore(userId: number): Promise<CreditScoreResult> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get all user loans
    const userLoans = await db
      .select()
      .from(loans)
      .where(eq(loans.userId, userId));

    if (userLoans.length === 0) {
      // No credit history - return default score
      return {
        score: 500, // Neutral score
        riskCategory: "medium",
        factors: {
          paymentHistory: 50,
          loanUtilization: 50,
          creditHistoryLength: 0,
          loanDiversity: 0,
          recentInquiries: 50,
        },
      };
    }

    // Calculate each factor
    const paymentHistory = await this.calculatePaymentHistory(userId, userLoans);
    const loanUtilization = await this.calculateLoanUtilization(userId, userLoans);
    const creditHistoryLength = this.calculateCreditHistoryLength(userLoans);
    const loanDiversity = this.calculateLoanDiversity(userLoans);
    const recentInquiries = this.calculateRecentInquiries(userLoans);

    // Calculate weighted score (300-850 range)
    const weightedScore =
      paymentHistory * 0.35 +
      loanUtilization * 0.30 +
      creditHistoryLength * 0.15 +
      loanDiversity * 0.10 +
      recentInquiries * 0.10;

    // Convert to 300-850 scale
    const score = Math.round(300 + (weightedScore / 100) * 550);

    // Determine risk category
    let riskCategory: "low" | "medium" | "high";
    if (score >= 700) {
      riskCategory = "low";
    } else if (score >= 600) {
      riskCategory = "medium";
    } else {
      riskCategory = "high";
    }

    return {
      score,
      riskCategory,
      factors: {
        paymentHistory,
        loanUtilization,
        creditHistoryLength,
        loanDiversity,
        recentInquiries,
      },
    };
  }

  /**
   * Calculate payment history score (0-100)
   * Based on on-time payments, late payments, and defaults
   */
  private async calculatePaymentHistory(
    userId: number,
    userLoans: any[]
  ): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    let totalScore = 0;
    let loanCount = 0;

    for (const loan of userLoans) {
      if (loan.status === "pending" || loan.status === "rejected") {
        continue; // Skip pending/rejected loans
      }

      loanCount++;

      // Get repayments for this loan
      const repayments = await db
        .select()
        .from(loanRepayments)
        .where(eq(loanRepayments.loanId, loan.id));

      if (loan.status === "defaulted") {
        totalScore += 0; // Defaulted loan = 0 points
      } else if (loan.status === "completed") {
        totalScore += 100; // Completed loan = 100 points
      } else if (loan.status === "active" || loan.status === "disbursed") {
        // Active loan - check payment history
        if (repayments.length > 0) {
          const onTimePayments = repayments.filter(r => r.status === "completed").length;
          const totalPayments = repayments.length;
          totalScore += (onTimePayments / totalPayments) * 100;
        } else {
          totalScore += 50; // No payments yet - neutral score
        }
      }
    }

    return loanCount > 0 ? totalScore / loanCount : 50;
  }

  /**
   * Calculate loan utilization score (0-100)
   * Based on amount borrowed vs. repaid
   */
  private async calculateLoanUtilization(
    userId: number,
    userLoans: any[]
  ): Promise<number> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    let totalBorrowed = 0;
    let totalRepaid = 0;

    for (const loan of userLoans) {
      if (loan.approvedAmount) {
        totalBorrowed += loan.approvedAmount;

        // Get repayments
        const repayments = await db
          .select()
          .from(loanRepayments)
          .where(eq(loanRepayments.loanId, loan.id));

          totalRepaid += repayments.reduce((sum, r) => sum + r.paidAmount, 0);
      }
    }

    if (totalBorrowed === 0) {
      return 50; // No loans - neutral score
    }

    // Higher repayment ratio = better score
    const repaymentRatio = totalRepaid / totalBorrowed;
    return Math.min(100, repaymentRatio * 100);
  }

  /**
   * Calculate credit history length score (0-100)
   * Based on how long the user has had credit
   */
  private calculateCreditHistoryLength(userLoans: any[]): number {
    if (userLoans.length === 0) {
      return 0;
    }

    // Find oldest loan
    const oldestLoan = userLoans.reduce((oldest, loan) => {
      return loan.createdAt < oldest.createdAt ? loan : oldest;
    });

    // Calculate months since oldest loan
    const monthsSinceOldest = Math.floor(
      (Date.now() - new Date(oldestLoan.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30)
    );

    // Score increases with history length (max at 5 years = 60 months)
    return Math.min(100, (monthsSinceOldest / 60) * 100);
  }

  /**
   * Calculate loan diversity score (0-100)
   * Based on mix of different loan types
   */
  private calculateLoanDiversity(userLoans: any[]): number {
    if (userLoans.length === 0) {
      return 0;
    }

    // Count unique loan types
    const uniqueTypes = new Set(userLoans.map(loan => loan.loanType));
    const diversityScore = (uniqueTypes.size / 4) * 100; // Max 4 types

    return Math.min(100, diversityScore);
  }

  /**
   * Calculate recent inquiries score (0-100)
   * Based on recent loan applications (fewer is better)
   */
  private calculateRecentInquiries(userLoans: any[]): number {
    // Count loans applied for in last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const recentApplications = userLoans.filter(
      loan => new Date(loan.createdAt) > sixMonthsAgo
    ).length;

    // More applications = lower score
    if (recentApplications === 0) {
      return 100;
    } else if (recentApplications === 1) {
      return 80;
    } else if (recentApplications === 2) {
      return 60;
    } else if (recentApplications === 3) {
      return 40;
    } else {
      return 20;
    }
  }

  /**
   * Get risk category from score
   */
  getRiskCategory(score: number): "low" | "medium" | "high" {
    if (score >= 700) {
      return "low";
    } else if (score >= 600) {
      return "medium";
    } else {
      return "high";
    }
  }

  /**
   * Get credit score rating
   */
  getRating(score: number): string {
    if (score >= 800) {
      return "Excellent";
    } else if (score >= 740) {
      return "Very Good";
    } else if (score >= 670) {
      return "Good";
    } else if (score >= 580) {
      return "Fair";
    } else {
      return "Poor";
    }
  }
}
