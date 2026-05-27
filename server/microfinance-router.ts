import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc-base.js";
import { getDb } from "./db.js";
import {
  lenders,
  loans,
  loanRepayments,
  creditScores,
  creditScoreHistory,
} from "../drizzle/financial-schema.js";
import { CreditScoringService } from "./services/credit-scoring.js";

const creditScoringService = new CreditScoringService();

export const microfinanceRouter = router({
  // Lender Management
  getLenders: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const allLenders = await db.select().from(lenders);
    return allLenders;
  }),

  getLenderById: protectedProcedure
    .input(z.object({ lenderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [lender] = await db
        .select()
        .from(lenders)
        .where(eq(lenders.id, input.lenderId));

      if (!lender) {
        throw new Error("Lender not found");
      }

      // Get statistics
      const [stats] = await db
        .select({
          totalLoans: sql<number>`count(*)::int`,
          activeLoans: sql<number>`count(case when ${loans.status} in ('approved', 'disbursed', 'active') then 1 end)::int`,
          totalDisbursed: sql<number>`coalesce(sum(case when ${loans.status} in ('disbursed', 'active', 'completed') then ${loans.principalAmount} end), 0)::int`,
          completedLoans: sql<number>`count(case when ${loans.status} = 'completed' then 1 end)::int`,
          defaultedLoans: sql<number>`count(case when ${loans.status} = 'defaulted' then 1 end)::int`,
        })
        .from(loans)
        .where(eq(loans.lenderId, input.lenderId));

      const defaultRate = stats.totalLoans > 0 
        ? (stats.defaultedLoans / stats.totalLoans) * 100 
        : 0;

      return {
        ...lender,
        statistics: {
          totalLoans: stats.totalLoans,
          activeLoans: stats.activeLoans,
          totalDisbursed: stats.totalDisbursed,
          completedLoans: stats.completedLoans,
          defaultedLoans: stats.defaultedLoans,
          defaultRate: Math.round(defaultRate * 100) / 100,
        },
      };
    }),

  // Loan Management
  applyForLoan: protectedProcedure
    .input(
      z.object({
        lenderId: z.number(),
        loanType: z.enum(["agricultural", "equipment", "working_capital", "emergency"]),
        requestedAmount: z.number().positive(),
        purpose: z.string().min(10),
        repaymentPeriodMonths: z.number().min(1).max(60),
        collateralDescription: z.string().optional(),
        guarantorName: z.string().optional(),
        guarantorPhone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify lender exists
      const [lender] = await db
        .select()
        .from(lenders)
        .where(eq(lenders.id, input.lenderId));

      if (!lender) {
        throw new Error("Lender not found");
      }

      // Check if amount is within lender's limits
      if (lender.minLoanAmount && input.requestedAmount * 100 < lender.minLoanAmount) {
        throw new Error(`Loan amount below minimum (${lender.minLoanAmount / 100})`);
      }
      if (lender.maxLoanAmount && input.requestedAmount * 100 > lender.maxLoanAmount) {
        throw new Error(`Loan amount exceeds maximum (${lender.maxLoanAmount / 100})`);
      }

      // Create loan application
      const loanNumber = `LOAN-${Date.now()}-${Number(ctx.user.id)}`;
      
      const [loan] = await db
        .insert(loans)
        .values({
          userId: Number(ctx.user.id),
          loanNumber,
          lenderId: input.lenderId,
          loanType: input.loanType,
          principalAmount: Math.round(input.requestedAmount * 100), // Convert to cents
          interestRate: 1500, // Default 15% (in basis points), will be updated on approval
          term: input.repaymentPeriodMonths,
          termMonths: input.repaymentPeriodMonths,
          purpose: input.purpose,
          collateral: input.collateralDescription,
          status: "pending",
          applicationDate: new Date(),
        })
        .returning();

      return loan;
    }),

  getMyLoans: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "approved", "rejected", "disbursed", "active", "completed", "defaulted"]).optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let conditions = [eq(loans.userId, Number(ctx.user.id))];

      if (input.status) {
        conditions.push(eq(loans.status, input.status));
      }

      const userLoans = await db
        .select({
          id: loans.id,
          userId: loans.userId,
          loanNumber: loans.loanNumber,
          lenderId: loans.lenderId,
          lenderName: lenders.name,
          loanType: loans.loanType,
          principalAmount: loans.principalAmount,
          interestRate: loans.interestRate,
          term: loans.term,
          termMonths: loans.termMonths,
          monthlyPayment: loans.monthlyPayment,
          totalAmount: loans.totalAmount,
          outstandingBalance: loans.outstandingBalance,
          purpose: loans.purpose,
          collateral: loans.collateral,
          status: loans.status,
          applicationDate: loans.applicationDate,
          approvedAt: loans.approvedAt,
          disbursementDate: loans.disbursementDate,
          nextPaymentDue: loans.nextPaymentDue,
          rejectionReason: loans.rejectionReason,
          approvedBy: loans.approvedBy,
          createdAt: loans.createdAt,
          updatedAt: loans.updatedAt,
        })
        .from(loans)
        .leftJoin(lenders, eq(loans.lenderId, lenders.id))
        .where(and(...conditions))
        .orderBy(desc(loans.createdAt))
        .limit(input.limit);

      return userLoans;
    }),

  getLoanById: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [loan] = await db
        .select()
        .from(loans)
        .where(
          and(
            eq(loans.id, input.loanId),
            eq(loans.userId, Number(ctx.user.id))
          )
        );

      if (!loan) {
        throw new Error("Loan not found");
      }

      return loan;
    }),

  // Loan Repayment
  makeRepayment: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        amount: z.number().positive(),
        paymentMethod: z.enum(["cash", "bank_transfer", "mobile_money", "mojaloop"]),
        transactionReference: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify loan ownership and status
      const [loan] = await db
        .select()
        .from(loans)
        .where(
          and(
            eq(loans.id, input.loanId),
            eq(loans.userId, Number(ctx.user.id))
          )
        );

      if (!loan) {
        throw new Error("Loan not found");
      }

      if (loan.status !== "active" && loan.status !== "disbursed") {
        throw new Error("Loan is not active");
      }

      // Record repayment
      const [repayment] = await db
        .insert(loanRepayments)
        .values({
          loanId: input.loanId,
          paymentNumber: 1, // This should be calculated based on existing repayments
          dueDate: new Date(), // This should come from loan schedule
          paidDate: new Date(),
          principalAmount: Math.round(input.amount * 100), // Convert to cents
          interestAmount: 0, // Should be calculated
          totalAmount: Math.round(input.amount * 100),
          paidAmount: Math.round(input.amount * 100),
          paymentMethod: input.paymentMethod,
          transactionReference: input.transactionReference,
          status: "paid",
        })
        .returning();

      // Calculate total repaid
      const repayments = await db
        .select()
        .from(loanRepayments)
        .where(eq(loanRepayments.loanId, input.loanId));

      const totalRepaid = repayments.reduce((sum, r) => sum + r.paidAmount, 0);

      // Update loan status if fully repaid
      if (loan.principalAmount && totalRepaid >= loan.principalAmount) {
        await db
          .update(loans)
          .set({ status: "completed" })
          .where(eq(loans.id, input.loanId));
      }

      return repayment;
    }),

  getLoanRepayments: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify loan ownership
      const [loan] = await db
        .select()
        .from(loans)
        .where(
          and(
            eq(loans.id, input.loanId),
            eq(loans.userId, Number(ctx.user.id))
          )
        );

      if (!loan) {
        throw new Error("Loan not found");
      }

      const repayments = await db
        .select()
        .from(loanRepayments)
        .where(eq(loanRepayments.loanId, input.loanId))
        .orderBy(desc(loanRepayments.paidDate));

      return repayments;
    }),

  getLoanSummary: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get loan
      const [loan] = await db
        .select()
        .from(loans)
        .where(
          and(
            eq(loans.id, input.loanId),
            eq(loans.userId, Number(ctx.user.id))
          )
        );

      if (!loan) {
        throw new Error("Loan not found");
      }

      // Get repayments
      const repayments = await db
        .select()
        .from(loanRepayments)
        .where(eq(loanRepayments.loanId, input.loanId));

      const totalRepaid = repayments.reduce((sum, r) => sum + r.paidAmount, 0);
      const approvedAmount = loan.principalAmount || 0;
      const remainingBalance = approvedAmount - totalRepaid;

      // Calculate interest
      const interestAmount = loan.interestRate
        ? Math.round((approvedAmount * loan.interestRate) / 100)
        : 0;

      const totalDue = approvedAmount + interestAmount;
      const totalRemaining = totalDue - totalRepaid;

      return {
        loanId: loan.id,
        approvedAmount: approvedAmount / 100,
        interestRate: loan.interestRate,
        interestAmount: interestAmount / 100,
        totalDue: totalDue / 100,
        totalRepaid: totalRepaid / 100,
        remainingBalance: totalRemaining / 100,
        repaymentPeriodMonths: loan.termMonths || loan.term,
        monthlyPayment: (loan.termMonths || loan.term)
          ? totalDue / (loan.termMonths || loan.term) / 100
          : 0,
        paymentsCount: repayments.length,
        status: loan.status,
      };
    }),

  // Credit Scoring
  getMyCreditScore: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [score] = await db
      .select()
      .from(creditScores)
      .where(eq(creditScores.userId, Number(ctx.user.id)))
      .orderBy(desc(creditScores.updatedAt))
      .limit(1);

    if (!score) {
      // Calculate initial credit score
      const calculatedScore = await creditScoringService.calculateCreditScore(Number(ctx.user.id));
      
      // Save to database
      const [newScore] = await db
        .insert(creditScores)
        .values({
          userId: Number(ctx.user.id),
          score: calculatedScore.score,
          riskCategory: calculatedScore.riskCategory,
          calculatedAt: new Date(),
          factors: JSON.stringify(calculatedScore.factors),
        })
        .returning();

      return newScore;
    }

    return score;
  }),

  getCreditScoreHistory: protectedProcedure
    .input(z.object({ limit: z.number().default(12) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const history = await db
        .select()
        .from(creditScoreHistory)
        .where(eq(creditScoreHistory.userId, Number(ctx.user.id)))
        .orderBy(desc(creditScoreHistory.calculatedAt))
        .limit(input.limit);

      return history;
    }),

  refreshCreditScore: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Calculate new credit score
    const calculatedScore = await creditScoringService.calculateCreditScore(Number(ctx.user.id));

    // Get current score
    const [currentScore] = await db
      .select()
      .from(creditScores)
      .where(eq(creditScores.userId, Number(ctx.user.id)))
      .orderBy(desc(creditScores.updatedAt))
      .limit(1);

    // Save to history if score exists
    if (currentScore) {
      await db.insert(creditScoreHistory).values({
        userId: Number(ctx.user.id),
        score: currentScore.score,
        rating: currentScore.riskCategory,
        factors: currentScore.factors,
        calculatedAt: currentScore.calculatedAt,
      });
    }

    // Update or create current score
    if (currentScore) {
      const [updated] = await db
        .update(creditScores)
        .set({
          previousScore: currentScore.score,
          score: calculatedScore.score,
          riskCategory: calculatedScore.riskCategory,
          calculatedAt: new Date(),
          factors: JSON.stringify(calculatedScore.factors),
          updatedAt: new Date(),
        })
        .where(eq(creditScores.id, currentScore.id))
        .returning();

      return updated;
    } else {
      const [newScore] = await db
        .insert(creditScores)
        .values({
          userId: Number(ctx.user.id),
          score: calculatedScore.score,
          riskCategory: calculatedScore.riskCategory,
          calculatedAt: new Date(),
          factors: JSON.stringify(calculatedScore.factors),
        })
        .returning();

      return newScore;
    }
  }),

  // Admin Loan Approval Workflow
  getAllPendingLoans: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get all pending loan applications with lender and user details
    const pendingLoans = await db
      .select({
        loan: loans,
        lender: lenders,
      })
      .from(loans)
      .leftJoin(lenders, eq(loans.lenderId, lenders.id))
      .where(eq(loans.status, "pending"))
      .orderBy(desc(loans.applicationDate));

    return pendingLoans;
  }),

  approveLoan: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        approvedAmount: z.number().positive(),
        interestRate: z.number().min(0).max(100), // Annual interest rate percentage
        termMonths: z.number().min(1).max(60),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get loan details
      const [loan] = await db
        .select()
        .from(loans)
        .where(eq(loans.id, input.loanId));

      if (!loan) {
        throw new Error("Loan not found");
      }

      if (loan.status !== "pending") {
        throw new Error("Loan is not pending approval");
      }

      // Update loan with approval details
      const [approvedLoan] = await db
        .update(loans)
        .set({
          status: "approved",
          totalAmount: Math.round(input.approvedAmount * 100), // Convert to cents
          interestRate: Math.round(input.interestRate * 100), // Convert to basis points
          termMonths: input.termMonths,
          approvedAt: new Date(),
          approvedBy: Number(ctx.user.id),
          updatedAt: new Date(),
        })
        .where(eq(loans.id, input.loanId))
        .returning();

      return approvedLoan;
    }),

  rejectLoan: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        rejectionReason: z.string().min(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get loan details
      const [loan] = await db
        .select()
        .from(loans)
        .where(eq(loans.id, input.loanId));

      if (!loan) {
        throw new Error("Loan not found");
      }

      if (loan.status !== "pending") {
        throw new Error("Loan is not pending approval");
      }

      // Update loan with rejection
      const [rejectedLoan] = await db
        .update(loans)
        .set({
          status: "rejected",
          rejectionReason: input.rejectionReason,
          approvedBy: Number(ctx.user.id), // Track who rejected it
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(loans.id, input.loanId))
        .returning();

      return rejectedLoan;
    }),

  disburseLoan: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        disbursementMethod: z.enum(["bank_transfer", "mobile_money", "cash", "mojaloop"]),
        transactionReference: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get loan details
      const [loan] = await db
        .select()
        .from(loans)
        .where(eq(loans.id, input.loanId));

      if (!loan) {
        throw new Error("Loan not found");
      }

      if (loan.status !== "approved") {
        throw new Error("Loan must be approved before disbursement");
      }

      // Update loan with disbursement details
      const [disbursedLoan] = await db
        .update(loans)
        .set({
          status: "disbursed",
          disbursedAt: new Date(),
          disbursementDate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(loans.id, input.loanId))
        .returning();

      return disbursedLoan;
    }),

  getLoanDetails: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get loan with lender details
      const [result] = await db
        .select({
          loan: loans,
          lender: lenders,
        })
        .from(loans)
        .leftJoin(lenders, eq(loans.lenderId, lenders.id))
        .where(eq(loans.id, input.loanId));

      if (!result) {
        throw new Error("Loan not found");
      }

      return result;
    }),

  getCreditScoreBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [score] = await db
      .select()
      .from(creditScores)
      .where(eq(creditScores.userId, Number(ctx.user.id)))
      .orderBy(desc(creditScores.updatedAt))
      .limit(1);

    if (!score) {
      return null;
    }

    const factors = score.factors ? JSON.parse(score.factors) : {};

    return {
      totalScore: score.score,
      riskCategory: score.riskCategory,
      factors: [
        {
          name: "Payment History",
          score: factors.paymentHistory || 0,
          weight: 35,
          description: "On-time payment record",
        },
        {
          name: "Loan Utilization",
          score: factors.loanUtilization || 0,
          weight: 30,
          description: "Amount borrowed vs. available credit",
        },
        {
          name: "Credit History Length",
          score: factors.creditHistoryLength || 0,
          weight: 15,
          description: "Length of credit history",
        },
        {
          name: "Loan Diversity",
          score: factors.loanDiversity || 0,
          weight: 10,
          description: "Mix of different loan types",
        },
        {
          name: "Recent Inquiries",
          score: factors.recentInquiries || 0,
          weight: 10,
          description: "Recent loan applications",
        },
      ],
    };
  }),
});
