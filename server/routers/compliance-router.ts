/**
 * Compliance Automation Router
 * 
 * AML/CFT monitoring, regulatory reporting, transaction screening,
 * suspicious activity detection, and compliance audit trail.
 * Implements FATF recommendations for agricultural financial services.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { mobileMoneyTransactions } from "../../drizzle/supply-chain-schema.js";
import { users, auditLogs } from "../../drizzle/schema.js";
import { loans } from "../../drizzle/financial-schema.js";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";

// AML thresholds loaded from centralized config (env-overridable)
import { AML_THRESHOLDS as AML_CONFIG } from '../config/business-rules.js';

// Risk scoring weights
const RISK_WEIGHTS = {
  transactionAmount: 0.25,
  transactionFrequency: 0.20,
  geographicRisk: 0.15,
  accountAge: 0.10,
  kycLevel: 0.15,
  behavioralPattern: 0.15,
};

// High-risk jurisdictions loaded from centralized config (env-overridable)
import { HIGH_RISK_JURISDICTIONS, MEDIUM_RISK_JURISDICTIONS } from '../config/business-rules.js';

type RiskLevel = "low" | "medium" | "high" | "critical";
type AlertType = "large_transaction" | "structuring" | "rapid_movement" | "velocity_breach" | "high_risk_country" | "behavioral_anomaly" | "pep_transaction" | "dormant_reactivation";

interface ComplianceAlert {
  alertType: AlertType;
  severity: RiskLevel;
  userId: number;
  description: string;
  details: Record<string, unknown>;
  requiresReview: boolean;
  autoAction: string | null;
}

function calculateRiskScore(params: {
  transactionAmount: number;
  threshold: number;
  dailyCount: number;
  weeklyCount: number;
  accountAgeDays: number;
  kycVerified: boolean;
  country: string;
}): { score: number; level: RiskLevel; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  // Transaction amount risk
  const amountRatio = params.transactionAmount / params.threshold;
  if (amountRatio >= 1.0) {
    score += 25;
    factors.push(`Transaction ≥ reporting threshold (${Math.round(amountRatio * 100)}%)`);
  } else if (amountRatio >= 0.8) {
    score += 15;
    factors.push(`Transaction near threshold (${Math.round(amountRatio * 100)}%)`);
  }

  // Frequency risk
  if (params.dailyCount > AML_CONFIG.maxDailyTransactions) {
    score += 20;
    factors.push(`Daily transaction count ${params.dailyCount} exceeds limit ${AML_CONFIG.maxDailyTransactions}`);
  } else if (params.dailyCount > AML_CONFIG.maxDailyTransactions * 0.7) {
    score += 10;
    factors.push(`High daily transaction count: ${params.dailyCount}`);
  }

  // Geographic risk
  if (HIGH_RISK_JURISDICTIONS.has(params.country)) {
    score += 15;
    factors.push(`High-risk jurisdiction: ${params.country}`);
  } else if (MEDIUM_RISK_JURISDICTIONS.has(params.country)) {
    score += 8;
    factors.push(`Medium-risk jurisdiction: ${params.country}`);
  }

  // Account age risk
  if (params.accountAgeDays < 30) {
    score += 10;
    factors.push(`New account (${params.accountAgeDays} days old)`);
  } else if (params.accountAgeDays < 90) {
    score += 5;
    factors.push(`Recent account (${params.accountAgeDays} days old)`);
  }

  // KYC verification risk
  if (!params.kycVerified) {
    score += 15;
    factors.push("KYC not verified");
  }

  const level: RiskLevel = score >= 70 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low";
  return { score: Math.min(100, score), level, factors };
}

export const complianceRouter = router({
  /**
   * Screen a transaction for AML/CFT compliance.
   * Returns risk assessment and any triggered alerts.
   */
  screenTransaction: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      currency: z.string().default("NGN"),
      country: z.string().default("NG"),
      transactionType: z.enum(["payment", "disbursement", "transfer", "loan_repayment"]),
      counterpartyPhone: z.string().optional(),
      counterpartyName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const userId = ctx.user.id;

      const threshold = AML_CONFIG.singleTransactionThreshold[input.currency as keyof typeof AML_CONFIG.singleTransactionThreshold] || 5000000;
      const dailyThreshold = AML_CONFIG.dailyCumulativeThreshold[input.currency as keyof typeof AML_CONFIG.dailyCumulativeThreshold] || 10000000;

      // Get user info
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const accountAgeDays = user ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000) : 0;
      // KYC verification status inferred from role (enhanced/premium = verified)
      const kycVerified = user?.role === 'admin' || user?.role === 'verified_farmer';

      // Get daily transactions
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const dailyTxs = await db.select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(amount), 0)`,
      }).from(mobileMoneyTransactions)
        .where(and(
          eq(mobileMoneyTransactions.userId, userId),
          gte(mobileMoneyTransactions.createdAt, startOfDay),
        ));

      const dailyCount = Number(dailyTxs[0]?.count ?? 0);
      const dailyTotal = Number(dailyTxs[0]?.total ?? 0);

      // Weekly transactions
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - 7);

      const weeklyTxs = await db.select({
        count: sql<number>`count(*)`,
      }).from(mobileMoneyTransactions)
        .where(and(
          eq(mobileMoneyTransactions.userId, userId),
          gte(mobileMoneyTransactions.createdAt, startOfWeek),
        ));
      const weeklyCount = Number(weeklyTxs[0]?.count ?? 0);

      // Calculate risk score
      const risk = calculateRiskScore({
        transactionAmount: input.amount,
        threshold,
        dailyCount,
        weeklyCount,
        accountAgeDays,
        kycVerified,
        country: input.country,
      });

      // Check for specific alert conditions
      const alerts: ComplianceAlert[] = [];

      // 1. Large transaction alert
      if (input.amount >= threshold) {
        alerts.push({
          alertType: "large_transaction",
          severity: "high",
          userId,
          description: `Transaction ${input.amount} ${input.currency} exceeds reporting threshold ${threshold}`,
          details: { amount: input.amount, threshold },
          requiresReview: true,
          autoAction: "flag_for_ctr",
        });
      }

      // 2. Cumulative daily threshold
      if (dailyTotal + input.amount >= dailyThreshold) {
        alerts.push({
          alertType: "structuring",
          severity: "high",
          userId,
          description: `Daily cumulative ${dailyTotal + input.amount} ${input.currency} exceeds threshold ${dailyThreshold}`,
          details: { dailyTotal: dailyTotal + input.amount, threshold: dailyThreshold },
          requiresReview: true,
          autoAction: "flag_for_ctr",
        });
      }

      // 3. Structuring detection (multiple transactions just below threshold)
      if (dailyCount >= AML_CONFIG.structuringMinTransactions) {
        const structuringThreshold = threshold * AML_CONFIG.structuringThresholdPercent;
        if (input.amount >= structuringThreshold && input.amount < threshold) {
          // Check if previous transactions also cluster near threshold
          const recentTxs = await db.select().from(mobileMoneyTransactions)
            .where(and(
              eq(mobileMoneyTransactions.userId, userId),
              gte(mobileMoneyTransactions.createdAt, startOfDay),
            ))
            .orderBy(desc(mobileMoneyTransactions.createdAt))
            .limit(10);

          const nearThreshold = recentTxs.filter(t => t.amount >= structuringThreshold && t.amount < threshold);
          if (nearThreshold.length >= 2) {
            alerts.push({
              alertType: "structuring",
              severity: "critical",
              userId,
              description: `Possible structuring: ${nearThreshold.length + 1} transactions near reporting threshold`,
              details: {
                transactionCount: nearThreshold.length + 1,
                amounts: [...nearThreshold.map(t => t.amount), input.amount],
                threshold,
              },
              requiresReview: true,
              autoAction: "file_sar",
            });
          }
        }
      }

      // 4. Velocity breach
      if (dailyCount >= AML_CONFIG.maxDailyTransactions) {
        alerts.push({
          alertType: "velocity_breach",
          severity: "medium",
          userId,
          description: `Daily transaction limit exceeded: ${dailyCount + 1} transactions (max: ${AML_CONFIG.maxDailyTransactions})`,
          details: { count: dailyCount + 1, limit: AML_CONFIG.maxDailyTransactions },
          requiresReview: false,
          autoAction: "block_transaction",
        });
      }

      // 5. Rapid movement
      const oneHourAgo = new Date(Date.now() - AML_CONFIG.rapidMovementWindowMs);
      const recentRapid = await db.select({ count: sql<number>`count(*)` })
        .from(mobileMoneyTransactions)
        .where(and(
          eq(mobileMoneyTransactions.userId, userId),
          gte(mobileMoneyTransactions.createdAt, oneHourAgo),
        ));
      if (Number(recentRapid[0]?.count ?? 0) >= AML_CONFIG.rapidMovementMinTransactions) {
        alerts.push({
          alertType: "rapid_movement",
          severity: "medium",
          userId,
          description: `${Number(recentRapid[0]?.count ?? 0) + 1} transactions in 1 hour`,
          details: { count: Number(recentRapid[0]?.count ?? 0) + 1, window: "1h" },
          requiresReview: true,
          autoAction: null,
        });
      }

      // Log compliance check
      await db.insert(auditLogs).values({
        userId,
        eventId: `compliance_${Date.now()}_${userId}`,
        eventType: "compliance_screening",
        entityType: "transaction",
        entityId: String(userId),
        timestamp: new Date(),
        data: {
          amount: input.amount,
          currency: input.currency,
          riskScore: risk.score,
          riskLevel: risk.level,
          alertCount: alerts.length,
          alertTypes: alerts.map(a => a.alertType),
        },
      });

      // Publish compliance events
      if (alerts.length > 0) {
        const producer = await getProducer();
        if (producer) {
          await producer.send({
            topic: "compliance-events",
            messages: [{ value: JSON.stringify({
              type: "transaction_screened",
              userId,
              amount: input.amount,
              riskScore: risk.score,
              riskLevel: risk.level,
              alerts: alerts.map(a => ({ type: a.alertType, severity: a.severity })),
            })}],
          });
        }
      }

      const blocked = alerts.some(a => a.autoAction === "block_transaction");

      return {
        approved: !blocked,
        riskScore: risk.score,
        riskLevel: risk.level,
        riskFactors: risk.factors,
        alerts,
        requiresManualReview: alerts.some(a => a.requiresReview),
        decision: blocked ? "blocked" : alerts.length > 0 ? "flagged" : "approved",
      };
    }),

  /**
   * Get compliance dashboard — overview of alerts, risk distribution, and reporting status.
   */
  getDashboard: protectedProcedure
    .input(z.object({
      periodDays: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const cutoff = new Date(Date.now() - input.periodDays * 86400000);

      // Transaction volume
      const txVolume = await db.select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(amount), 0)`,
        completed: sql<number>`count(*) filter (where status = 'completed')`,
        failed: sql<number>`count(*) filter (where status = 'failed')`,
      }).from(mobileMoneyTransactions)
        .where(gte(mobileMoneyTransactions.createdAt, cutoff));

      // Compliance audit entries
      const auditEntries = await db.select({
        count: sql<number>`count(*)`,
      }).from(auditLogs)
        .where(and(
          eq(auditLogs.eventType, "compliance_screening"),
          gte(auditLogs.createdAt, cutoff),
        ));

      // Active loans at risk
      const atRiskLoans = await db.select({
        count: sql<number>`count(*)`,
        totalExposure: sql<number>`coalesce(sum(outstanding_balance), 0)`,
      }).from(loans)
        .where(eq(loans.status, "defaulted"));

      return {
        period: `${input.periodDays} days`,
        transactions: {
          total: Number(txVolume[0]?.count ?? 0),
          volume: Number(txVolume[0]?.total ?? 0),
          completed: Number(txVolume[0]?.completed ?? 0),
          failed: Number(txVolume[0]?.failed ?? 0),
        },
        compliance: {
          screeningsPerformed: Number(auditEntries[0]?.count ?? 0),
        },
        creditRisk: {
          defaultedLoans: Number(atRiskLoans[0]?.count ?? 0),
          totalExposure: Number(atRiskLoans[0]?.totalExposure ?? 0),
        },
      };
    }),

  /**
   * Generate a regulatory report (CTR — Currency Transaction Report).
   */
  generateCTR: protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      currency: z.string().default("NGN"),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const threshold = AML_CONFIG.singleTransactionThreshold[input.currency as keyof typeof AML_CONFIG.singleTransactionThreshold] || 5000000;
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      const largeTxs = await db.select().from(mobileMoneyTransactions)
        .where(and(
          gte(mobileMoneyTransactions.createdAt, start),
          sql`${mobileMoneyTransactions.createdAt} <= ${end}`,
          sql`${mobileMoneyTransactions.amount} >= ${threshold}`,
          eq(mobileMoneyTransactions.status, "completed"),
        ))
        .orderBy(desc(mobileMoneyTransactions.amount));

      return {
        reportType: "CTR",
        period: { start: input.startDate, end: input.endDate },
        currency: input.currency,
        threshold,
        reportableTransactions: largeTxs.length,
        transactions: largeTxs.map(tx => ({
          transactionId: tx.id,
          date: tx.createdAt,
          amount: tx.amount,
          provider: tx.provider,
          userId: tx.userId,
          phoneNumber: tx.phoneNumber,
          type: tx.transactionType,
        })),
        generatedAt: new Date().toISOString(),
        status: "draft",
      };
    }),

  /**
   * User risk profile — aggregate risk assessment for a specific user.
   */
  getUserRiskProfile: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();

      const [user] = await db.select().from(users).where(eq(users.id, input.userId));
      if (!user) throw new Error("User not found");

      const accountAgeDays = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / 86400000);

      // Transaction summary (last 90 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
      const txSummary = await db.select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(amount), 0)`,
        maxAmount: sql<number>`coalesce(max(amount), 0)`,
        avgAmount: sql<number>`coalesce(avg(amount), 0)`,
        failedCount: sql<number>`count(*) filter (where status = 'failed')`,
      }).from(mobileMoneyTransactions)
        .where(and(
          eq(mobileMoneyTransactions.userId, input.userId),
          gte(mobileMoneyTransactions.createdAt, ninetyDaysAgo),
        ));

      // Loan default history
      const defaultHistory = await db.select({ count: sql<number>`count(*)` })
        .from(loans)
        .where(and(eq(loans.userId, input.userId), eq(loans.status, "defaulted")));

      const txCount = Number(txSummary[0]?.count ?? 0);
      const txTotal = Number(txSummary[0]?.total ?? 0);
      const maxAmount = Number(txSummary[0]?.maxAmount ?? 0);
      const failedCount = Number(txSummary[0]?.failedCount ?? 0);
      const defaults = Number(defaultHistory[0]?.count ?? 0);

      // Calculate composite risk score
      let riskScore = 0;
      const factors: string[] = [];

      if (accountAgeDays < 30) { riskScore += 15; factors.push("New account"); }
      const isKycVerified = user.role === 'admin' || user.role === 'verified_farmer';
      if (!isKycVerified) { riskScore += 20; factors.push("KYC not verified"); }
      if (txCount > 100) { riskScore += 10; factors.push("High transaction volume"); }
      if (maxAmount > 1000000) { riskScore += 10; factors.push("Large transaction history"); }
      if (failedCount > txCount * 0.2) { riskScore += 15; factors.push("High failure rate"); }
      if (defaults > 0) { riskScore += 20; factors.push(`${defaults} loan default(s)`); }

      const riskLevel: RiskLevel = riskScore >= 60 ? "critical" : riskScore >= 40 ? "high" : riskScore >= 20 ? "medium" : "low";

      return {
        userId: input.userId,
        username: user.email,
        accountAgeDays,
        kycVerified: isKycVerified,
        riskScore: Math.min(100, riskScore),
        riskLevel,
        riskFactors: factors,
        transactionProfile: {
          last90Days: {
            count: txCount,
            totalVolume: txTotal,
            maxTransaction: maxAmount,
            avgTransaction: Math.round(Number(txSummary[0]?.avgAmount ?? 0)),
            failureRate: txCount > 0 ? Math.round(failedCount / txCount * 100) : 0,
          },
        },
        creditProfile: {
          loanDefaults: defaults,
        },
        enhancedDueDiligence: riskLevel === "critical" || riskLevel === "high",
        recommendations: [
          ...(!isKycVerified ? ["Complete KYC verification to reduce risk score"] : []),
          ...(defaults > 0 ? ["Review and resolve defaulted loans"] : []),
          ...(riskLevel === "critical" ? ["Flag for enhanced due diligence review"] : []),
        ],
      };
    }),

  /**
   * Get compliance audit trail.
   */
  getAuditTrail: protectedProcedure
    .input(z.object({
      userId: z.number().optional(),
      action: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input.userId) conditions.push(eq(auditLogs.userId, input.userId));
      if (input.action) conditions.push(eq(auditLogs.eventType, input.action));

      const entries = await db.select().from(auditLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit);

      return entries;
    }),
});
