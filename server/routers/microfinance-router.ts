import crypto from "crypto";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { loans, loanRepayments, creditScores, creditScoreHistory, lenders } from "../../drizzle/financial-schema.js";
import { users, farmers } from "../../drizzle/schema.js";
import { eq, and, desc, gte, lte, sql, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { sendPaymentReminder, sendLoanApprovalNotification, sendLoanRejectionNotification, sendPaymentConfirmation } from "../services/sms.js";
import { checkLoanApplicationKyc, checkLoanRepaymentKyc } from "../middleware/kyc-enforcement.js";

export const microfinanceRouter = router({
  // Get all loans for the current user
  getMyLoans: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const result = await db
      .select({
        id: loans.id,
        loanNumber: loans.loanNumber,
        lenderId: loans.lenderId,
        lenderName: lenders.name,
        principalAmount: loans.principalAmount,
        interestRate: loans.interestRate,
        termMonths: loans.termMonths,
        purpose: loans.purpose,
        status: loans.status,
        applicationDate: loans.applicationDate,
        approvedAt: loans.approvedAt,
        disbursedAt: loans.disbursedAt,
        outstandingBalance: loans.outstandingBalance,
        monthlyPayment: loans.monthlyPayment,
        nextPaymentDue: loans.nextPaymentDue,
        loanType: loans.loanType,
        createdAt: loans.createdAt,
      })
      .from(loans)
      .leftJoin(lenders, eq(loans.lenderId, lenders.id))
      .where(eq(loans.userId, ctx.user.id))
      .orderBy(desc(loans.applicationDate));

    return result;
  }),

  // Apply for a new loan
  applyForLoan: protectedProcedure
    .input(
      z.object({
        lenderId: z.number(),
        principalAmount: z.number().positive(),
        termMonths: z.number().int().positive(),
        purpose: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Enforce KYC requirements before loan application
      const kycCheck = await checkLoanApplicationKyc(ctx.user.id, input.principalAmount);
      if (!kycCheck.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: kycCheck.reason || "KYC verification required for loan applications",
        });
      }

      // Generate loan number
      const loanNumber = `LN${Date.now()}${crypto.randomInt(1000)}`;

      const [newLoan] = await db
        .insert(loans)
        .values({
          userId: ctx.user.id,
          lenderId: input.lenderId,
          loanNumber,
          loanType: "working_capital",
          principalAmount: input.principalAmount,
          interestRate: 1500, // 15% default, will be set by admin on approval
          term: input.termMonths,
          termMonths: input.termMonths,
          purpose: input.purpose,
          status: "pending",
          applicationDate: new Date(),
        })
        .returning();

      return newLoan;
    }),

  // Get all pending loan applications (admin only)
  getAllPendingLoans: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Check if user is admin
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can view pending loans" });
    }

    const result = await db
      .select({
        id: loans.id,
        loanNumber: loans.loanNumber,
        userId: loans.userId,
        applicantName: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
        lenderId: loans.lenderId,
        lenderName: lenders.name,
        principalAmount: loans.principalAmount,
        interestRate: loans.interestRate,
        termMonths: loans.termMonths,
        purpose: loans.purpose,
        status: loans.status,
        applicationDate: loans.applicationDate,
      })
      .from(loans)
      .leftJoin(users, eq(loans.userId, users.id))
      .leftJoin(lenders, eq(loans.lenderId, lenders.id))
      .where(eq(loans.status, "pending"))
      .orderBy(desc(loans.applicationDate));

    return result;
  }),

  // Approve a loan (admin only)
  approveLoan: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        approvedAmount: z.number().positive().optional(),
        approvedInterestRate: z.number().positive().optional(),
        approvedTermMonths: z.number().int().positive().optional(),
        approvalNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if user is admin
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can approve loans" });
      }

      const [updatedLoan] = await db
        .update(loans)
        .set({
          status: "approved",
          approvedAt: new Date(),
          ...(input.approvedAmount && { principalAmount: input.approvedAmount }),
          ...(input.approvedInterestRate && { interestRate: input.approvedInterestRate }),
          ...(input.approvedTermMonths && { termMonths: input.approvedTermMonths }),
        })
        .where(eq(loans.id, input.loanId))
        .returning();

      return updatedLoan;
    }),

  // Reject a loan (admin only)
  rejectLoan: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        rejectionReason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if user is admin
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can reject loans" });
      }

      const [updatedLoan] = await db
        .update(loans)
        .set({
          status: "rejected",
        })
        .where(eq(loans.id, input.loanId))
        .returning();

      return updatedLoan;
    }),

  // Disburse a loan (admin only)
  disburseLoan: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if user is admin
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can disburse loans" });
      }

      const [updatedLoan] = await db
        .update(loans)
        .set({
          status: "active",
          disbursedAt: new Date(),
        })
        .where(and(eq(loans.id, input.loanId), eq(loans.status, "approved")))
        .returning();

      if (!updatedLoan) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Loan not found or not approved" });
      }

      return updatedLoan;
    }),

  // Get loan details
  getLoanDetails: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [loan] = await db
        .select({
          id: loans.id,
          loanNumber: loans.loanNumber,
          userId: loans.userId,
          lenderId: loans.lenderId,
          lenderName: lenders.name,
          principalAmount: loans.principalAmount,
          interestRate: loans.interestRate,
          termMonths: loans.termMonths,
          purpose: loans.purpose,
          status: loans.status,
          applicationDate: loans.applicationDate,
          approvedAt: loans.approvedAt,
          disbursedAt: loans.disbursedAt,
          outstandingBalance: loans.outstandingBalance,
        })
        .from(loans)
        .leftJoin(lenders, eq(loans.lenderId, lenders.id))
        .where(eq(loans.id, input.loanId));

      if (!loan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      }

      // Check if user owns this loan or is admin
      if (loan.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to view this loan" });
      }

      return loan;
    }),

  // Get repayment schedule for a loan
  getRepaymentSchedule: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get loan details
      const [loan] = await db
        .select()
        .from(loans)
        .where(eq(loans.id, input.loanId));

      if (!loan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      }

      // Check if user owns this loan or is admin
      if (loan.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to view this loan" });
      }

      // Get all repayments for this loan
      const repayments = await db
        .select()
        .from(loanRepayments)
        .where(eq(loanRepayments.loanId, input.loanId))
        .orderBy(asc(loanRepayments.dueDate));

      // Calculate monthly payment
      const monthlyInterestRate = (loan.interestRate || 0) / 10000 / 12; // Convert basis points to decimal
      const termMonths = loan.termMonths || loan.term || 12;
      const monthlyPayment =
        monthlyInterestRate > 0
          ? (loan.principalAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, termMonths)) /
            (Math.pow(1 + monthlyInterestRate, termMonths) - 1)
          : loan.principalAmount / termMonths;

      // Generate schedule if no repayments exist
      if (repayments.length === 0 && loan.disbursedAt) {
        const schedule = [];
        const startDate = new Date(loan.disbursedAt);
        let remainingPrincipal = loan.principalAmount;

        for (let i = 1; i <= termMonths; i++) {
          const dueDate = new Date(startDate);
          dueDate.setMonth(dueDate.getMonth() + i);

          const interestAmount = remainingPrincipal * monthlyInterestRate;
          const principalAmount = monthlyPayment - interestAmount;
          remainingPrincipal -= principalAmount;

          schedule.push({
            paymentNumber: i,
            dueDate,
            principalAmount: Math.round(principalAmount * 100) / 100,
            interestAmount: Math.round(interestAmount * 100) / 100,
            totalAmount: Math.round(monthlyPayment * 100) / 100,
            status: "pending" as const,
            isPaid: false,
            isOverdue: dueDate < new Date(),
          });
        }

        return {
          loan,
          schedule,
          monthlyPayment: Math.round(monthlyPayment * 100) / 100,
          totalAmount: Math.round(monthlyPayment * termMonths * 100) / 100,
        };
      }

      // Map existing repayments to schedule format
      const schedule = repayments.map((r) => ({
        id: r.id,
        paymentNumber: r.paymentNumber,
        dueDate: r.dueDate,
        principalAmount: r.principalAmount,
        interestAmount: r.interestAmount,
        totalAmount: r.totalAmount,
        status: r.status,
        isPaid: r.status === "paid",
        isOverdue: r.status === "overdue",
        paidDate: r.paidDate,
        paidAmount: r.paidAmount,
      }));

      return {
        loan,
        schedule,
        monthlyPayment: Math.round(monthlyPayment * 100) / 100,
        totalAmount: Math.round(monthlyPayment * termMonths * 100) / 100,
      };
    }),

  // Make a loan payment
  makePayment: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        amount: z.number().positive(),
        paymentMethod: z.enum(["bank_transfer", "mobile_money", "cash", "check"]),
        transactionReference: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Enforce KYC requirements before loan repayment
      const kycCheck = await checkLoanRepaymentKyc(ctx.user.id, input.amount);
      if (!kycCheck.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: kycCheck.reason || "KYC verification required for loan repayments",
        });
      }

      // Get loan details
      const [loan] = await db
        .select()
        .from(loans)
        .where(eq(loans.id, input.loanId));

      if (!loan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      }

      // Check if user owns this loan
      if (loan.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to make payment for this loan" });
      }

      // Find next unpaid repayment
      const [nextRepayment] = await db
        .select()
        .from(loanRepayments)
        .where(and(eq(loanRepayments.loanId, input.loanId), eq(loanRepayments.status, "pending")))
        .orderBy(asc(loanRepayments.dueDate))
        .limit(1);

      if (!nextRepayment) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No pending repayments found" });
      }

      // Update repayment status
      const [updatedRepayment] = await db
        .update(loanRepayments)
        .set({
          status: "paid",
          paidDate: new Date(),
          paidAmount: input.amount,
          transactionReference: input.transactionReference,
        })
        .where(eq(loanRepayments.id, nextRepayment.id))
        .returning();

      // Update loan outstanding balance
      await db
        .update(loans)
        .set({
          outstandingBalance: sql`${loans.outstandingBalance} - ${input.amount}`,
        })
        .where(eq(loans.id, input.loanId));

      return updatedRepayment;
    }),

  // Alias for makePayment (for backward compatibility)
  makeRepayment: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        amount: z.number().positive(),
        paymentMethod: z.enum(["bank_transfer", "mobile_money", "cash", "check"]),
        transactionReference: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Enforce KYC requirements before loan repayment
      const kycCheck = await checkLoanRepaymentKyc(ctx.user.id, input.amount);
      if (!kycCheck.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: kycCheck.reason || "KYC verification required for loan repayments",
        });
      }

      // Get loan details
      const [loan] = await db
        .select()
        .from(loans)
        .where(eq(loans.id, input.loanId));

      if (!loan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      }

      // Check if user owns this loan
      if (loan.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to make payment for this loan" });
      }

      // Find next unpaid repayment
      const [nextRepayment] = await db
        .select()
        .from(loanRepayments)
        .where(and(eq(loanRepayments.loanId, input.loanId), eq(loanRepayments.status, "pending")))
        .orderBy(asc(loanRepayments.dueDate))
        .limit(1);

      if (!nextRepayment) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No pending repayments found" });
      }

      // Update repayment status
      const [updatedRepayment] = await db
        .update(loanRepayments)
        .set({
          status: "paid",
          paidDate: new Date(),
          paidAmount: input.amount,
          transactionReference: input.transactionReference,
        })
        .where(eq(loanRepayments.id, nextRepayment.id))
        .returning();

      // Update loan outstanding balance
      await db
        .update(loans)
        .set({
          outstandingBalance: sql`${loans.outstandingBalance} - ${input.amount}`,
        })
        .where(eq(loans.id, input.loanId));

      return updatedRepayment;
    }),

  // Get credit score history
  getCreditScoreHistory: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const history = await db
      .select()
      .from(creditScoreHistory)
      .where(eq(creditScoreHistory.userId, ctx.user.id))
      .orderBy(desc(creditScoreHistory.calculatedAt))
      .limit(12); // Last 12 months

    return history;
  }),

  // Get credit score factors breakdown
  getCreditScoreFactors: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Get latest credit score
    const [latestScore] = await db
      .select()
      .from(creditScores)
      .where(eq(creditScores.userId, ctx.user.id))
      .orderBy(desc(creditScores.updatedAt))
      .limit(1);

    if (!latestScore) {
      return {
        score: 0,
        factors: [],
        recommendations: [
          "Apply for your first loan to start building credit history",
          "Make timely payments to improve your credit score",
        ],
      };
    }

    // Parse factors from JSON or use defaults
    let factorsData;
    try {
      factorsData = latestScore.factors ? JSON.parse(latestScore.factors) : null;
    } catch (err) {
      factorsData = null;
    }

    // Calculate factor contributions
    const factors = [
      {
        name: "Payment History",
        weight: 35,
        score: factorsData?.paymentHistoryScore || 70,
        impact: "high",
        description: "Your track record of making on-time payments",
      },
      {
        name: "Credit Utilization",
        weight: 30,
        score: factorsData?.creditUtilizationScore || 70,
        impact: "high",
        description: "How much of your available credit you're using",
      },
      {
        name: "Credit History Length",
        weight: 15,
        score: factorsData?.creditHistoryLengthScore || 70,
        impact: "medium",
        description: "How long you've been using credit",
      },
      {
        name: "Credit Mix",
        weight: 10,
        score: factorsData?.creditMixScore || 70,
        impact: "low",
        description: "Variety of credit types you have",
      },
      {
        name: "Recent Inquiries",
        weight: 10,
        score: factorsData?.recentInquiriesScore || 70,
        impact: "low",
        description: "Number of recent credit applications",
      },
    ];

    // Generate recommendations based on weak areas
    const recommendations = [];
    if ((factorsData?.paymentHistoryScore || 70) < 70) {
      recommendations.push("Focus on making all payments on time to improve your payment history");
    }
    if ((factorsData?.creditUtilizationScore || 70) < 70) {
      recommendations.push("Try to keep your loan balances below 30% of your credit limits");
    }
    if ((factorsData?.creditHistoryLengthScore || 70) < 70) {
      recommendations.push("Maintain your existing credit accounts to build a longer credit history");
    }
    if ((factorsData?.creditMixScore || 70) < 70) {
      recommendations.push("Consider diversifying your credit types over time");
    }
    if ((factorsData?.recentInquiriesScore || 70) < 70) {
      recommendations.push("Avoid applying for multiple loans in a short period");
    }

    if (recommendations.length === 0) {
      recommendations.push("Excellent credit! Keep up the good work with timely payments");
    }

    return {
      score: latestScore.score,
      factors,
      recommendations,
    };
  }),

  // Get lender comparison data
  getLenderComparison: protectedProcedure
    .input(z.object({ lenderIds: z.array(z.number()).min(2).max(5) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const lenderData = await Promise.all(
        input.lenderIds.map(async (lenderId) => {
          const [lender] = await db.select().from(lenders).where(eq(lenders.id, lenderId));

          if (!lender) return null;

          // Get statistics for this lender
          const [stats] = await db
            .select({
              totalLoans: sql<number>`COUNT(*)`,
              approvedLoans: sql<number>`SUM(CASE WHEN ${loans.status} = 'approved' OR ${loans.status} = 'active' OR ${loans.status} = 'completed' THEN 1 ELSE 0 END)`,
              avgProcessingTime: sql<number>`AVG(CASE WHEN ${loans.approvedAt} IS NOT NULL THEN EXTRACT(EPOCH FROM (${loans.approvedAt} - ${loans.applicationDate})) / 86400 ELSE NULL END)`,
              totalDisbursed: sql<number>`SUM(CASE WHEN ${loans.status} = 'active' OR ${loans.status} = 'completed' THEN ${loans.principalAmount} ELSE 0 END)`,
            })
            .from(loans)
            .where(eq(loans.lenderId, lenderId));

          const approvalRate = stats.totalLoans > 0 ? (stats.approvedLoans / stats.totalLoans) * 100 : 0;

          return {
            ...lender,
            totalLoans: stats.totalLoans || 0,
            approvalRate: Math.round(approvalRate * 10) / 10,
            avgProcessingTime: Math.round((stats.avgProcessingTime || 0) * 10) / 10,
            totalDisbursed: stats.totalDisbursed || 0,
          };
        })
      );

      return lenderData.filter((l) => l !== null);
    }),

  // Get all lenders
  getAllLenders: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const allLenders = await db.select().from(lenders).orderBy(lenders.name);
    return allLenders;
  }),

  // Get lender by ID with statistics
  getLenderById: protectedProcedure
    .input(z.object({ lenderId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [lender] = await db.select().from(lenders).where(eq(lenders.id, input.lenderId));

      if (!lender) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lender not found" });
      }

      // Get statistics
      const [stats] = await db
        .select({
          totalLoans: sql<number>`COUNT(*)`,
          activeLoans: sql<number>`SUM(CASE WHEN ${loans.status} = 'active' THEN 1 ELSE 0 END)`,
          completedLoans: sql<number>`SUM(CASE WHEN ${loans.status} = 'completed' THEN 1 ELSE 0 END)`,
          defaultedLoans: sql<number>`SUM(CASE WHEN ${loans.status} = 'defaulted' THEN 1 ELSE 0 END)`,
          totalDisbursed: sql<number>`SUM(CASE WHEN ${loans.status} = 'active' OR ${loans.status} = 'completed' THEN ${loans.principalAmount} ELSE 0 END)`,
        })
        .from(loans)
        .where(eq(loans.lenderId, input.lenderId));

      const defaultRate =
        stats.totalLoans > 0 ? ((stats.defaultedLoans || 0) / stats.totalLoans) * 100 : 0;

      return {
        ...lender,
        maxTermMonths: lender.maxTermMonths || 60,
        statistics: {
          totalLoans: stats.totalLoans || 0,
          activeLoans: stats.activeLoans || 0,
          completedLoans: stats.completedLoans || 0,
          defaultedLoans: stats.defaultedLoans || 0,
          defaultRate: Math.round(defaultRate * 10) / 10,
          totalDisbursed: stats.totalDisbursed || 0,
        },
      };
    }),

  // Credit Score Management
  getMyCreditScore: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const [score] = await db
      .select()
      .from(creditScores)
      .where(eq(creditScores.userId, Number(ctx.user.id)))
      .orderBy(desc(creditScores.updatedAt))
      .limit(1);

    if (!score) {
      // Return default score for new users
      return {
        userId: Number(ctx.user.id),
        score: 300,
        riskCategory: "high",
        calculatedAt: new Date(),
        factors: "{}",
      };
    }

    return score;
  }),

  getCreditScoreBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    const [score] = await db
      .select()
      .from(creditScores)
      .where(eq(creditScores.userId, Number(ctx.user.id)))
      .orderBy(desc(creditScores.updatedAt))
      .limit(1);

    if (!score) {
      return null;
    }

    const factors = score.factors ? JSON.parse(score.factors as string) : {};

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

  refreshCreditScore: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    // Get current score
    const [currentScore] = await db
      .select()
      .from(creditScores)
      .where(eq(creditScores.userId, Number(ctx.user.id)))
      .orderBy(desc(creditScores.updatedAt))
      .limit(1);

    // Calculate a simple score based on loan performance
    const userLoans = await db
      .select()
      .from(loans)
      .where(eq(loans.userId, Number(ctx.user.id)));

    let newScore = 300; // Base score
    const completedLoans = userLoans.filter(l => l.status === 'completed').length;
    const defaultedLoans = userLoans.filter(l => l.status === 'defaulted').length;
    
    // Add points for completed loans
    newScore += completedLoans * 50;
    
    // Subtract points for defaults
    newScore -= defaultedLoans * 100;
    
    // Cap between 300-850
    newScore = Math.max(300, Math.min(850, newScore));

    const riskCategory = newScore >= 700 ? 'low' : newScore >= 600 ? 'medium' : newScore >= 500 ? 'high' : 'critical';

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
          score: newScore,
          riskCategory: riskCategory,
          calculatedAt: new Date(),
          factors: JSON.stringify({
            paymentHistory: completedLoans * 10,
            loanUtilization: 50,
            creditHistoryLength: userLoans.length * 5,
            loanDiversity: 50,
            recentInquiries: 50,
          }),
          updatedAt: new Date(),
        })
        .where(eq(creditScores.id, currentScore.id))
        .returning();

      return updated;
    } else {
      const [newScoreRecord] = await db
        .insert(creditScores)
        .values({
          userId: Number(ctx.user.id),
          score: newScore,
          riskCategory: riskCategory,
          calculatedAt: new Date(),
          factors: JSON.stringify({
            paymentHistory: completedLoans * 10,
            loanUtilization: 50,
            creditHistoryLength: userLoans.length * 5,
            loanDiversity: 50,
            recentInquiries: 50,
          }),
        })
        .returning();

      return newScoreRecord;
    }
  }),

  // Send payment reminder SMS
  sendPaymentReminder: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get loan details with user and lender info
      const [loanData] = await db
        .select({
          loan: loans,
          user: users,
          lender: lenders,
        })
        .from(loans)
        .leftJoin(users, eq(loans.userId, users.id))
        .leftJoin(lenders, eq(loans.lenderId, lenders.id))
        .where(eq(loans.id, input.loanId));

      if (!loanData || !loanData.user || !loanData.lender) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loan, user, or lender not found" });
      }

      // Check if user owns this loan or is admin
      if (loanData.loan.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to send reminders for this loan" });
      }

      if (!loanData.user.phoneNumber) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User phone number not available" });
      }

      if (!loanData.loan.nextPaymentDue) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No upcoming payment due date" });
      }

      const borrowerName = `${loanData.user.firstName || ''} ${loanData.user.lastName || ''}`.trim();
      const dueDate = loanData.loan.nextPaymentDue instanceof Date
        ? loanData.loan.nextPaymentDue.toISOString().split('T')[0]
        : String(loanData.loan.nextPaymentDue || 'N/A');
      const result = await sendPaymentReminder(
        loanData.user.phoneNumber,
        borrowerName,
        loanData.loan.monthlyPayment || 0,
        dueDate,
        'NGN'
      );

      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Failed to send SMS" });
      }

      return result;
    }),

  // Send loan approval notification (admin only)
  sendLoanApprovalNotification: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if user is admin
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can send approval notifications" });
      }

      // Get loan details with user and lender info
      const [loanData] = await db
        .select({
          loan: loans,
          user: users,
          lender: lenders,
        })
        .from(loans)
        .leftJoin(users, eq(loans.userId, users.id))
        .leftJoin(lenders, eq(loans.lenderId, lenders.id))
        .where(eq(loans.id, input.loanId));

      if (!loanData || !loanData.user || !loanData.lender) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loan, user, or lender not found" });
      }

      if (!loanData.user.phoneNumber) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User phone number not available" });
      }

      const borrowerName = `${loanData.user.firstName || ''} ${loanData.user.lastName || ''}`.trim();
      const result = await sendLoanApprovalNotification(
        loanData.user.phoneNumber,
        borrowerName,
        loanData.loan.principalAmount || 0,
        loanData.lender.name || 'Unknown Lender'
      );

      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Failed to send SMS" });
      }

      return result;
    }),

  // Send loan rejection notification (admin only)
  sendLoanRejectionNotification: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check if user is admin
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can send rejection notifications" });
      }

      // Get loan details with user and lender info
      const [loanData] = await db
        .select({
          loan: loans,
          user: users,
          lender: lenders,
        })
        .from(loans)
        .leftJoin(users, eq(loans.userId, users.id))
        .leftJoin(lenders, eq(loans.lenderId, lenders.id))
        .where(eq(loans.id, input.loanId));

      if (!loanData || !loanData.user || !loanData.lender) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loan, user, or lender not found" });
      }

      if (!loanData.user.phoneNumber) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User phone number not available" });
      }

      const borrowerName = `${loanData.user.firstName || ''} ${loanData.user.lastName || ''}`.trim();
      const result = await sendLoanRejectionNotification(
        loanData.user.phoneNumber,
        borrowerName,
        input.reason || 'eligibility criteria'
      );

      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Failed to send SMS" });
      }

      return result;
    }),

  // Send payment confirmation SMS
  sendPaymentConfirmation: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        paymentAmount: z.number().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get loan details with user and lender info
      const [loanData] = await db
        .select({
          loan: loans,
          user: users,
          lender: lenders,
        })
        .from(loans)
        .leftJoin(users, eq(loans.userId, users.id))
        .leftJoin(lenders, eq(loans.lenderId, lenders.id))
        .where(eq(loans.id, input.loanId));

      if (!loanData || !loanData.user || !loanData.lender) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loan, user, or lender not found" });
      }

      // Check if user owns this loan or is admin
      if (loanData.loan.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to send confirmations for this loan" });
      }

      if (!loanData.user.phoneNumber) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User phone number not available" });
      }

      const borrowerName = `${loanData.user.firstName || ''} ${loanData.user.lastName || ''}`.trim();
      const remainingBalance = (loanData.loan.outstandingBalance || 0) - input.paymentAmount;
      
      const result = await sendPaymentConfirmation(
        loanData.user.phoneNumber,
        borrowerName,
        loanData.lender.name || 'Unknown Lender',
        input.paymentAmount,
        Math.max(0, remainingBalance),
        'NGN'
      );

      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error || "Failed to send SMS" });
      }

      return result;
    }),

  // Portfolio at Risk Analytics - Get portfolio statistics
  getPortfolioStats: protectedProcedure
    .input(z.object({ period: z.string().optional() }))
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get portfolio statistics
      const [stats] = await db
        .select({
          totalOutstanding: sql<number>`COALESCE(SUM(${loans.outstandingBalance}), 0)::int`,
          totalBorrowers: sql<number>`COUNT(DISTINCT ${loans.userId})::int`,
          avgLoanSize: sql<number>`COALESCE(AVG(${loans.principalAmount}), 0)::int`,
          disbursementsThisMonth: sql<number>`COALESCE(SUM(CASE WHEN ${loans.disbursedAt} >= DATE_TRUNC('month', CURRENT_DATE) THEN ${loans.principalAmount} ELSE 0 END), 0)::int`,
        })
        .from(loans)
        .where(sql`${loans.status} IN ('active', 'disbursed')`);

      // Get repayments this month
      const [repaymentStats] = await db
        .select({
          repaymentsThisMonth: sql<number>`COALESCE(SUM(${loanRepayments.paidAmount}), 0)::int`,
        })
        .from(loanRepayments)
        .where(sql`${loanRepayments.paidDate} >= DATE_TRUNC('month', CURRENT_DATE)`);

      // Calculate PAR metrics (Portfolio at Risk)
      const [parStats] = await db
        .select({
          par1: sql<number>`COALESCE(
            100.0 * SUM(CASE WHEN ${loans.nextPaymentDue} < CURRENT_DATE - INTERVAL '1 day' THEN ${loans.outstandingBalance} ELSE 0 END) / 
            NULLIF(SUM(${loans.outstandingBalance}), 0), 0
          )::numeric(5,2)`,
          par30: sql<number>`COALESCE(
            100.0 * SUM(CASE WHEN ${loans.nextPaymentDue} < CURRENT_DATE - INTERVAL '30 days' THEN ${loans.outstandingBalance} ELSE 0 END) / 
            NULLIF(SUM(${loans.outstandingBalance}), 0), 0
          )::numeric(5,2)`,
          par60: sql<number>`COALESCE(
            100.0 * SUM(CASE WHEN ${loans.nextPaymentDue} < CURRENT_DATE - INTERVAL '60 days' THEN ${loans.outstandingBalance} ELSE 0 END) / 
            NULLIF(SUM(${loans.outstandingBalance}), 0), 0
          )::numeric(5,2)`,
          par90: sql<number>`COALESCE(
            100.0 * SUM(CASE WHEN ${loans.nextPaymentDue} < CURRENT_DATE - INTERVAL '90 days' THEN ${loans.outstandingBalance} ELSE 0 END) / 
            NULLIF(SUM(${loans.outstandingBalance}), 0), 0
          )::numeric(5,2)`,
        })
        .from(loans)
        .where(sql`${loans.status} IN ('active', 'disbursed')`);

      // Calculate write-off and collection rates
      const [rateStats] = await db
        .select({
          totalLoans: sql<number>`COUNT(*)::int`,
          defaultedLoans: sql<number>`COUNT(CASE WHEN ${loans.status} = 'defaulted' THEN 1 END)::int`,
          completedLoans: sql<number>`COUNT(CASE WHEN ${loans.status} = 'completed' THEN 1 END)::int`,
        })
        .from(loans);

      const writeOffRate = rateStats.totalLoans > 0 
        ? Math.round((rateStats.defaultedLoans / rateStats.totalLoans) * 10000) / 100 
        : 0;
      
      const collectionRate = rateStats.totalLoans > 0
        ? Math.round(((rateStats.completedLoans + rateStats.defaultedLoans) > 0 
            ? rateStats.completedLoans / (rateStats.completedLoans + rateStats.defaultedLoans) 
            : 0) * 10000) / 100
        : 95; // Default to 95% if no data

      return {
        totalOutstanding: stats.totalOutstanding || 0,
        totalBorrowers: stats.totalBorrowers || 0,
        avgLoanSize: stats.avgLoanSize || 0,
        par1: Number(parStats.par1) || 0,
        par30: Number(parStats.par30) || 0,
        par60: Number(parStats.par60) || 0,
        par90: Number(parStats.par90) || 0,
        writeOffRate,
        collectionRate,
        disbursementsThisMonth: stats.disbursementsThisMonth || 0,
        repaymentsThisMonth: repaymentStats.repaymentsThisMonth || 0,
      };
    }),

  // Portfolio at Risk by Region
  getParByRegion: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get PAR by region using farmer's region (join through users -> farmers)
      const regionStats = await db
        .select({
          region: sql<string>`COALESCE(${farmers.region}, 'Unknown')`,
          outstanding: sql<number>`COALESCE(SUM(${loans.outstandingBalance}), 0)::int`,
          borrowers: sql<number>`COUNT(DISTINCT ${loans.userId})::int`,
          par30: sql<number>`COALESCE(
            100.0 * SUM(CASE WHEN ${loans.nextPaymentDue} < CURRENT_DATE - INTERVAL '30 days' THEN ${loans.outstandingBalance} ELSE 0 END) / 
            NULLIF(SUM(${loans.outstandingBalance}), 0), 0
          )::numeric(5,2)`,
          par90: sql<number>`COALESCE(
            100.0 * SUM(CASE WHEN ${loans.nextPaymentDue} < CURRENT_DATE - INTERVAL '90 days' THEN ${loans.outstandingBalance} ELSE 0 END) / 
            NULLIF(SUM(${loans.outstandingBalance}), 0), 0
          )::numeric(5,2)`,
        })
        .from(loans)
        .leftJoin(users, eq(loans.userId, users.id))
        .leftJoin(farmers, eq(users.id, farmers.userId))
        .where(sql`${loans.status} IN ('active', 'disbursed')`)
        .groupBy(sql`COALESCE(${farmers.region}, 'Unknown')`);

      return regionStats.map(r => ({
        region: r.region,
        outstanding: r.outstanding,
        borrowers: r.borrowers,
        par30: Number(r.par30),
        par90: Number(r.par90),
      }));
    }),

  // Get At-Risk Loans (loans that are overdue)
  getAtRiskLoans: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get loans that are overdue (nextPaymentDue is in the past)
      const atRiskLoans = await db
        .select({
          id: loans.id,
          loanNumber: loans.loanNumber,
          borrower: sql<string>`CONCAT(${users.firstName}, ' ', ${users.lastName})`,
          region: sql<string>`COALESCE(${farmers.region}, 'Unknown')`,
          amount: loans.outstandingBalance,
          daysOverdue: sql<number>`EXTRACT(DAY FROM CURRENT_DATE - ${loans.nextPaymentDue})::int`,
          creditScore: sql<number>`COALESCE((SELECT score FROM credit_scores WHERE user_id = ${loans.userId} ORDER BY updated_at DESC LIMIT 1), 0)::int`,
          lastPayment: sql<string>`COALESCE(
            (SELECT TO_CHAR(paid_date, 'YYYY-MM-DD') FROM loan_repayments WHERE loan_id = ${loans.id} ORDER BY paid_date DESC LIMIT 1),
            'No payments'
          )`,
        })
        .from(loans)
        .leftJoin(users, eq(loans.userId, users.id))
        .leftJoin(farmers, eq(users.id, farmers.userId))
        .where(sql`${loans.status} IN ('active', 'disbursed') AND ${loans.nextPaymentDue} < CURRENT_DATE`)
        .orderBy(sql`${loans.nextPaymentDue} ASC`)
        .limit(50);

      return atRiskLoans.map(loan => ({
        id: loan.id,
        loanNumber: loan.loanNumber,
        borrower: loan.borrower || 'Unknown',
        region: loan.region,
        amount: loan.amount || 0,
        daysOverdue: Math.max(0, loan.daysOverdue || 0),
        creditScore: loan.creditScore,
        lastPayment: loan.lastPayment,
      }));
    }),

  // ============================================================================
  // Gap #1: Late Payment Penalties & Loan Restructuring
  // ============================================================================

  /**
   * Calculate late payment penalty for an overdue loan.
   * Penalty tiers:
   *   1-7 days:   1% of outstanding balance (grace period warning)
   *   8-30 days:  2% of outstanding balance
   *   31-60 days: 5% of outstanding balance + credit score impact
   *   61-90 days: 8% of outstanding balance + collections flag
   *   90+ days:   10% of outstanding + default classification
   */
  calculateLatePenalty: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [loan] = await db.select().from(loans)
        .where(eq(loans.id, ctx.user.id ? ctx.user.id : 0));

      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      if (!loan.nextPaymentDue) return { penalty: 0, daysOverdue: 0, tier: "current" };

      const now = new Date();
      const dueDate = new Date(loan.nextPaymentDue);
      const daysOverdue = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000));
      const outstanding = loan.outstandingBalance || loan.principalAmount;

      // Penalty tiers loaded from centralized config (env-overridable)
      const { getPenaltyTier } = await import('../config/business-rules.js');
      const tierInfo = getPenaltyTier(daysOverdue);
      const penaltyRate = tierInfo.rate;
      const tier = tierInfo.tier;
      const creditScoreImpact = tierInfo.creditScoreImpact;

      const penalty = Math.round(outstanding * penaltyRate);

      return {
        loanId: loan.id,
        daysOverdue,
        tier,
        penaltyRate: penaltyRate * 100,
        penalty,
        outstanding,
        totalDue: outstanding + penalty,
        creditScoreImpact,
        nextAction: tier === "grace"
          ? "Pay within 7 days to avoid penalties"
          : tier === "late"
          ? "Pay immediately to prevent credit score damage"
          : tier === "delinquent"
          ? "Contact loan officer for restructuring options"
          : tier === "collections"
          ? "Loan sent to collections. Call +234-800-FARM-HELP"
          : tier === "default"
          ? "Loan classified as default. Legal action may follow"
          : "No action needed",
      };
    }),

  /**
   * Restructure an overdue loan with new terms.
   * Options: extend term, reduce rate, capitalize arrears, payment holiday.
   */
  restructureLoan: protectedProcedure
    .input(z.object({
      loanId: z.number(),
      restructureType: z.enum([
        "term_extension",    // Extend loan term, reduce monthly payment
        "rate_reduction",    // Temporarily reduce interest rate
        "arrears_capitalize", // Roll overdue amount into principal
        "payment_holiday",   // Pause payments for N months
      ]),
      newTermMonths: z.number().int().positive().optional(),
      newInterestRate: z.number().min(0).max(100).optional(),
      holidayMonths: z.number().int().min(1).max(6).optional(),
      reason: z.string().min(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [loan] = await db.select().from(loans).where(eq(loans.id, input.loanId));
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      if (loan.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized" });
      }

      const outstanding = loan.outstandingBalance || loan.principalAmount;
      const currentRate = loan.interestRate || 1500; // basis points
      const currentTerm = loan.termMonths || 12;

      let updates: Record<string, unknown> = {};
      let newMonthlyPayment = loan.monthlyPayment || 0;
      let summary = "";

      switch (input.restructureType) {
        case "term_extension": {
          const newTerm = input.newTermMonths || currentTerm + 6;
          const monthlyRate = currentRate / 10000 / 12;
          newMonthlyPayment = monthlyRate > 0
            ? Math.round((outstanding * monthlyRate * Math.pow(1 + monthlyRate, newTerm)) / (Math.pow(1 + monthlyRate, newTerm) - 1))
            : Math.round(outstanding / newTerm);
          updates = { termMonths: newTerm, monthlyPayment: newMonthlyPayment };
          summary = `Term extended to ${newTerm} months. New payment: ${newMonthlyPayment}`;
          break;
        }
        case "rate_reduction": {
          const newRate = input.newInterestRate
            ? Math.round(input.newInterestRate * 100) // convert % to basis points
            : Math.round(currentRate * 0.7); // 30% reduction default
          const monthlyRate = newRate / 10000 / 12;
          newMonthlyPayment = monthlyRate > 0
            ? Math.round((outstanding * monthlyRate * Math.pow(1 + monthlyRate, currentTerm)) / (Math.pow(1 + monthlyRate, currentTerm) - 1))
            : Math.round(outstanding / currentTerm);
          updates = { interestRate: newRate, monthlyPayment: newMonthlyPayment };
          summary = `Rate reduced to ${newRate / 100}%. New payment: ${newMonthlyPayment}`;
          break;
        }
        case "arrears_capitalize": {
          // Calculate total overdue amount and add to principal
          const overdueRepayments = await db.select().from(loanRepayments)
            .where(and(eq(loanRepayments.loanId, input.loanId), eq(loanRepayments.status, "overdue")));
          const arrearsAmount = overdueRepayments.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
          const newPrincipal = outstanding + arrearsAmount;
          const monthlyRate = currentRate / 10000 / 12;
          newMonthlyPayment = monthlyRate > 0
            ? Math.round((newPrincipal * monthlyRate * Math.pow(1 + monthlyRate, currentTerm)) / (Math.pow(1 + monthlyRate, currentTerm) - 1))
            : Math.round(newPrincipal / currentTerm);
          updates = { outstandingBalance: newPrincipal, monthlyPayment: newMonthlyPayment };
          // Mark overdue repayments as restructured
          for (const rep of overdueRepayments) {
            await db.update(loanRepayments)
              .set({ status: "restructured" })
              .where(eq(loanRepayments.id, rep.id));
          }
          summary = `Arrears of ${arrearsAmount} capitalized. New balance: ${newPrincipal}`;
          break;
        }
        case "payment_holiday": {
          const months = input.holidayMonths || 3;
          const resumeDate = new Date();
          resumeDate.setMonth(resumeDate.getMonth() + months);
          updates = { nextPaymentDue: resumeDate };
          summary = `Payment holiday of ${months} months. Payments resume ${resumeDate.toISOString().split("T")[0]}`;
          break;
        }
      }

      await db.update(loans)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(loans.id, input.loanId));

      return {
        loanId: input.loanId,
        restructureType: input.restructureType,
        previousMonthlyPayment: loan.monthlyPayment,
        newMonthlyPayment,
        summary,
        reason: input.reason,
        effectiveDate: new Date().toISOString(),
      };
    }),

  /**
   * Pre-payment: pay off loan early (full or partial).
   * No prepayment penalty — encourages early repayment.
   */
  prepayLoan: protectedProcedure
    .input(z.object({
      loanId: z.number(),
      amount: z.number().positive(),
      paymentMethod: z.enum(["mpesa", "mtn_momo", "bank_transfer", "cash"]).default("mpesa"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [loan] = await db.select().from(loans).where(eq(loans.id, input.loanId));
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      if (loan.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your loan" });
      }

      const outstanding = loan.outstandingBalance || loan.principalAmount;
      const paymentAmount = Math.min(input.amount, outstanding);
      const newBalance = outstanding - paymentAmount;
      const isFullPayoff = newBalance <= 0;

      // Record the prepayment
      await db.insert(loanRepayments).values({
        loanId: input.loanId,
        paymentNumber: 0,
        totalAmount: paymentAmount,
        principalAmount: paymentAmount,
        interestAmount: 0,
        paidAmount: paymentAmount,
        status: "paid",
        paidDate: new Date(),
        dueDate: new Date(),
        paymentMethod: "prepayment",
      });

      // Update loan
      await db.update(loans)
        .set({
          outstandingBalance: Math.max(0, newBalance),
          status: isFullPayoff ? "completed" : loan.status,
          updatedAt: new Date(),
        })
        .where(eq(loans.id, input.loanId));

      // Recalculate remaining schedule if partial prepay
      let newMonthlyPayment = loan.monthlyPayment;
      if (!isFullPayoff && loan.termMonths) {
        const remainingMonths = Math.max(1, loan.termMonths - Math.floor(
          (Date.now() - new Date(loan.disbursedAt || loan.createdAt).getTime()) / (30 * 86400000)
        ));
        const monthlyRate = (loan.interestRate || 0) / 10000 / 12;
        newMonthlyPayment = monthlyRate > 0
          ? Math.round((newBalance * monthlyRate * Math.pow(1 + monthlyRate, remainingMonths)) / (Math.pow(1 + monthlyRate, remainingMonths) - 1))
          : Math.round(newBalance / remainingMonths);
        await db.update(loans)
          .set({ monthlyPayment: newMonthlyPayment })
          .where(eq(loans.id, input.loanId));
      }

      return {
        loanId: input.loanId,
        amountPaid: paymentAmount,
        previousBalance: outstanding,
        newBalance: Math.max(0, newBalance),
        isFullPayoff,
        newMonthlyPayment: isFullPayoff ? 0 : newMonthlyPayment,
        interestSaved: isFullPayoff
          ? Math.round(outstanding * (loan.interestRate || 0) / 10000 / 12 * (loan.termMonths || 0) * 0.3)
          : 0,
      };
    }),

  // Multi-currency loan conversion
  convertLoanCurrency: protectedProcedure
    .input(z.object({
      loanId: z.number(),
      targetCurrency: z.enum(['KES', 'NGN', 'UGX', 'TZS', 'USD']),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [loan] = await db.select().from(loans).where(
        and(eq(loans.id, input.loanId), eq(loans.userId, ctx.user.id))
      );
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });

      // Exchange rates (would be fetched from market data service in production)
      const exchangeRates: Record<string, Record<string, number>> = {
        KES: { NGN: 3.45, UGX: 28.5, TZS: 19.2, USD: 0.0065 },
        NGN: { KES: 0.29, UGX: 8.26, TZS: 5.57, USD: 0.0019 },
        UGX: { KES: 0.035, NGN: 0.121, TZS: 0.674, USD: 0.00023 },
        TZS: { KES: 0.052, NGN: 0.180, UGX: 1.484, USD: 0.00034 },
        USD: { KES: 153.5, NGN: 530.0, UGX: 4380.0, TZS: 2950.0 },
      };

      const sourceCurrency = 'KES'; // Default currency
      const rate = exchangeRates[sourceCurrency]?.[input.targetCurrency] || 1;
      const convertedPrincipal = Math.round((loan.principalAmount || 0) * rate);
      const convertedBalance = Math.round((loan.outstandingBalance || 0) * rate);
      const convertedMonthly = Math.round((loan.monthlyPayment || 0) * rate);

      return {
        loanId: input.loanId,
        sourceCurrency,
        targetCurrency: input.targetCurrency,
        exchangeRate: rate,
        originalPrincipal: loan.principalAmount,
        convertedPrincipal,
        originalBalance: loan.outstandingBalance,
        convertedBalance,
        originalMonthly: loan.monthlyPayment,
        convertedMonthly,
        rateTimestamp: new Date().toISOString(),
        disclaimer: "Exchange rates are indicative. Final conversion at disbursement rate.",
      };
    }),

  // Credit score refresh/decay mechanism
  refreshCreditScoreWithDecay: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const targetUserId = input.userId || ctx.user.id;
      const [currentScore] = await db.select().from(creditScores)
        .where(eq(creditScores.userId, targetUserId))
        .orderBy(desc(creditScores.calculatedAt))
        .limit(1);

      if (!currentScore) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No credit score found for user" });
      }

      // Decay rules: score decays if not refreshed within 90 days
      const lastCalculated = new Date(currentScore.calculatedAt || Date.now());
      const daysSinceRefresh = Math.floor((Date.now() - lastCalculated.getTime()) / (86400 * 1000));
      // Credit decay config loaded from centralized config (env-overridable)
      const { CREDIT_DECAY } = await import('../config/business-rules.js');
      const DECAY_THRESHOLD_DAYS = CREDIT_DECAY.thresholdDays;
      const DECAY_RATE_PER_DAY = CREDIT_DECAY.ratePerDay;
      const MAX_DECAY = CREDIT_DECAY.maxDecay;

      let decayAmount = 0;
      let isStale = false;

      if (daysSinceRefresh > DECAY_THRESHOLD_DAYS) {
        const daysOverThreshold = daysSinceRefresh - DECAY_THRESHOLD_DAYS;
        decayAmount = Math.min(Math.round(daysOverThreshold * DECAY_RATE_PER_DAY), MAX_DECAY);
        isStale = true;
      }

      const originalScore = currentScore.score || 500;
      const adjustedScore = Math.max(300, originalScore - decayAmount); // Floor at 300

      // Determine new band
      const getBand = (score: number) => {
        if (score >= 750) return 'A';
        if (score >= 650) return 'B';
        if (score >= 550) return 'C';
        if (score >= 450) return 'D';
        return 'E';
      };

      return {
        userId: targetUserId,
        originalScore,
        adjustedScore,
        decayAmount,
        daysSinceRefresh,
        isStale,
        originalBand: getBand(originalScore),
        currentBand: getBand(adjustedScore),
        bandChanged: getBand(originalScore) !== getBand(adjustedScore),
        nextRefreshRecommended: isStale ? 'immediately' : `in ${DECAY_THRESHOLD_DAYS - daysSinceRefresh} days`,
        decayPolicy: {
          thresholdDays: DECAY_THRESHOLD_DAYS,
          ratePerDay: DECAY_RATE_PER_DAY,
          maxDecay: MAX_DECAY,
          minimumScore: 300,
        },
      };
    }),
});
