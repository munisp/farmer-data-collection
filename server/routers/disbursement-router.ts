import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { disbursementService } from "../services/disbursement-service.js";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db.js";
import { loanDisbursements } from "../../drizzle/disbursement-schema.js";
import { loans, lenders } from "../../drizzle/financial-schema.js";
import { users } from "../../drizzle/schema.js";
import { eq, desc } from "drizzle-orm";
import { checkLoanDisbursementKyc } from "../middleware/kyc-enforcement.js";

// Admin middleware - checks if user has admin role
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx });
});

export const disbursementRouter = router({
  /**
   * Create a new disbursement
   * Admin only
   */
    create: adminProcedure
      .input(
        z.object({
          loanId: z.number(),
          userId: z.number(),
          amount: z.number().positive(),
          method: z.enum(["bank_transfer", "mobile_money", "cash", "check"]),
          bankName: z.string().optional(),
          accountNumber: z.string().optional(),
          accountName: z.string().optional(),
          mobileMoneyProvider: z.string().optional(),
          mobileMoneyNumber: z.string().optional(),
          scheduledAt: z.date().optional(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        // Enforce KYC requirements before disbursement
        const kycCheck = await checkLoanDisbursementKyc(input.userId, input.amount);
        if (!kycCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: kycCheck.reason || "KYC verification required for disbursements",
          });
        }

        try {
          return await disbursementService.createDisbursement(input);
      } catch (error: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (error instanceof Error ? error.message : String(error)),
        });
      }
    }),

  /**
   * Process a pending disbursement
   * Admin only
   */
  process: adminProcedure
    .input(
      z.object({
        disbursementId: z.number(),
        transactionReference: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await disbursementService.processDisbursement({
          ...input,
          processedBy: ctx.user.id,
        });
      } catch (error: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (error instanceof Error ? error.message : String(error)),
        });
      }
    }),

  /**
   * Complete a disbursement
   * Admin only
   */
  complete: adminProcedure
    .input(
      z.object({
        disbursementId: z.number(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await disbursementService.completeDisbursement(
          input.disbursementId,
          ctx.user.id,
          input.notes
        );
      } catch (error: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (error instanceof Error ? error.message : String(error)),
        });
      }
    }),

  /**
   * Mark disbursement as failed
   * Admin only
   */
  fail: adminProcedure
    .input(
      z.object({
        disbursementId: z.number(),
        failureReason: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await disbursementService.failDisbursement(
          input.disbursementId,
          ctx.user.id,
          input.failureReason
        );
      } catch (error: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (error instanceof Error ? error.message : String(error)),
        });
      }
    }),

  /**
   * Cancel a pending disbursement
   * Admin only
   */
  cancel: adminProcedure
    .input(
      z.object({
        disbursementId: z.number(),
        reason: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await disbursementService.cancelDisbursement(
          input.disbursementId,
          ctx.user.id,
          input.reason
        );
      } catch (error: unknown) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: (error instanceof Error ? error.message : String(error)),
        });
      }
    }),

  /**
   * Get disbursement by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const disbursement = await disbursementService.getDisbursement(input.id);

      if (!disbursement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Disbursement not found",
        });
      }

      // Only allow user to view their own disbursements (unless admin)
      if (disbursement.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      return disbursement;
    }),

  /**
   * Get all disbursements for a loan
   */
  getByLoan: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ input }) => {
      return await disbursementService.getDisbursementsByLoan(input.loanId);
    }),

  /**
   * Get all disbursements for current user
   */
  getMyDisbursements: protectedProcedure.query(async ({ ctx }) => {
    return await disbursementService.getDisbursementsByUser(ctx.user.id);
  }),

  /**
   * Get all disbursements (admin only)
   * Returns disbursements with loan and user information
   */
  getAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get all disbursements with loan, lender, and user details
    const disbursements = await db
      .select({
        disbursement: loanDisbursements,
        loan: loans,
        lender: lenders,
        user: users,
      })
      .from(loanDisbursements)
      .leftJoin(loans, eq(loanDisbursements.loanId, loans.id))
      .leftJoin(lenders, eq(loans.lenderId, lenders.id))
      .leftJoin(users, eq(loanDisbursements.userId, users.id))
      .orderBy(desc(loanDisbursements.createdAt));

    // Transform to include needed fields
    return disbursements.map((d) => ({
      ...d.disbursement,
      loanNumber: d.loan?.loanNumber || `LOAN-${d.disbursement.loanId}`,
      borrowerName: d.user ? `${d.user.firstName || ''} ${d.user.lastName || ''}`.trim() || d.user.email || "Unknown" : "Unknown",
      lenderName: d.lender?.name || "Unknown Lender",
    }));
  }),

  /**
   * Get disbursements by status
   * Admin only
   */
  getByStatus: adminProcedure
    .input(
      z.object({
        status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]),
      })
    )
    .query(async ({ input }) => {
      return await disbursementService.getDisbursementsByStatus(input.status);
    }),

  /**
   * Get status history for a disbursement
   */
  getStatusHistory: protectedProcedure
    .input(z.object({ disbursementId: z.number() }))
    .query(async ({ input, ctx }) => {
      // First check if user has access to this disbursement
      const disbursement = await disbursementService.getDisbursement(input.disbursementId);

      if (!disbursement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Disbursement not found",
        });
      }

      if (disbursement.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      return await disbursementService.getStatusHistory(input.disbursementId);
    }),

  /**
   * Get disbursement analytics
   * Admin only
   */
  getAnalytics: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get all disbursements with timestamps
    const allDisbursements = await db
      .select()
      .from(loanDisbursements)
      .orderBy(desc(loanDisbursements.createdAt));

    // Calculate summary statistics
    const total = allDisbursements.length;
    const completed = allDisbursements.filter((d) => d.status === "completed").length;
    const failed = allDisbursements.filter((d) => d.status === "failed").length;
    const successRate = total > 0 ? (completed / total) * 100 : 0;

    // Calculate average processing time (scheduled to completed)
    const completedDisbursements = allDisbursements.filter(
      (d) => d.status === "completed" && d.scheduledAt && d.completedAt
    );
    const avgProcessingTime = completedDisbursements.length > 0
      ? completedDisbursements.reduce((sum, d) => {
          const scheduled = new Date(d.scheduledAt!);
          const completed = new Date(d.completedAt!);
          return sum + (completed.getTime() - scheduled.getTime()) / (1000 * 60 * 60 * 24); // days
        }, 0) / completedDisbursements.length
      : 0;

    // Monthly volume (last 12 months)
    const now = new Date();
    const monthlyVolume: Array<{ month: string; count: number; amount: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      
      const monthDisbursements = allDisbursements.filter((d) => {
        const createdAt = new Date(d.createdAt);
        return createdAt >= date && createdAt < nextMonth;
      });

      monthlyVolume.push({
        month: monthKey,
        count: monthDisbursements.length,
        amount: monthDisbursements.reduce((sum, d) => sum + (d.amount || 0), 0),
      });
    }

    // Success rate by payment method
    const methodStats: Record<string, { total: number; completed: number }> = {};
    allDisbursements.forEach((d) => {
      const method = d.method || "unknown";
      if (!methodStats[method]) {
        methodStats[method] = { total: 0, completed: 0 };
      }
      methodStats[method].total++;
      if (d.status === "completed") {
        methodStats[method].completed++;
      }
    });

    const successRateByMethod = Object.entries(methodStats).map(([method, stats]) => ({
      method,
      successRate: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
      total: stats.total,
    }));

    // Processing time trend (last 12 months)
    const processingTimeTrend: Array<{ month: string; avgDays: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      
      const monthCompleted = completedDisbursements.filter((d) => {
        const completedAt = new Date(d.completedAt!);
        return completedAt >= date && completedAt < nextMonth;
      });

      const avgDays = monthCompleted.length > 0
        ? monthCompleted.reduce((sum, d) => {
            const scheduled = new Date(d.scheduledAt!);
            const completed = new Date(d.completedAt!);
            return sum + (completed.getTime() - scheduled.getTime()) / (1000 * 60 * 60 * 24);
          }, 0) / monthCompleted.length
        : 0;

      processingTimeTrend.push({ month: monthKey, avgDays });
    }

    return {
      summary: {
        total,
        completed,
        failed,
        successRate: Math.round(successRate * 100) / 100,
        avgProcessingTime: Math.round(avgProcessingTime * 100) / 100,
      },
      monthlyVolume,
      successRateByMethod,
      processingTimeTrend,
    };
  }),
});
