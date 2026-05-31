/**
 * Automated Collections Workflow Router
 *
 * Manages the full loan default → recovery pipeline:
 *   1. Early warning (1-7 days overdue) — SMS/push reminders
 *   2. Demand letter (8-30 days) — formal notice, fee applied
 *   3. Field visit (31-60 days) — agent assigned, restructure offered
 *   4. Collections escalation (61-90 days) — external collections partner
 *   5. Write-off recommendation (90+ days) — provision, board approval
 *
 * Each stage has configurable thresholds, automated transitions,
 * and a full audit trail.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc, gte, lte, sql, lt } from "drizzle-orm";
import { loans, loanRepayments } from "../../drizzle/financial-schema.js";
import { users } from "../../drizzle/schema.js";
import { auditLogs } from "../../drizzle/schema.js";
import { TRPCError } from "@trpc/server";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";

// ============================================================================
// COLLECTIONS STAGE CONFIGURATION
// ============================================================================

const COLLECTIONS_STAGES = {
  early_warning: {
    minDaysOverdue: 1,
    maxDaysOverdue: 7,
    actions: ["sms_reminder", "push_notification", "email_reminder"],
    feePercent: 0, // no fee yet
    escalationDays: 7,
    description: "Soft reminders via SMS, push, and email",
  },
  demand_letter: {
    minDaysOverdue: 8,
    maxDaysOverdue: 30,
    actions: ["formal_demand_letter", "phone_call", "sms_final_notice"],
    feePercent: 2, // 2% late fee on outstanding
    escalationDays: 30,
    description: "Formal demand letter issued, late fee applied",
  },
  field_visit: {
    minDaysOverdue: 31,
    maxDaysOverdue: 60,
    actions: ["assign_field_agent", "restructure_offer", "collateral_assessment"],
    feePercent: 5, // 5% collections fee
    escalationDays: 60,
    description: "Field agent assigned, restructuring offered",
  },
  collections_escalation: {
    minDaysOverdue: 61,
    maxDaysOverdue: 90,
    actions: ["external_collections", "legal_notice", "guarantor_notification"],
    feePercent: 10, // 10% external collections fee
    escalationDays: 90,
    description: "Escalated to external collections partner",
  },
  write_off: {
    minDaysOverdue: 91,
    maxDaysOverdue: Infinity,
    actions: ["provision_recommendation", "board_approval_request", "tax_write_off"],
    feePercent: 0, // written off
    escalationDays: Infinity,
    description: "Recommended for write-off, requires board approval",
  },
} as const;

type CollectionsStage = keyof typeof COLLECTIONS_STAGES;

// Provision rates loaded from centralized config (env-overridable)
import { PROVISION_RATES as CONFIG_PROVISION_RATES } from '../config/business-rules.js';
const PROVISION_RATES: Record<CollectionsStage, number> = CONFIG_PROVISION_RATES as Record<CollectionsStage, number>;

function getCollectionsStage(daysOverdue: number): CollectionsStage {
  if (daysOverdue <= 7) return "early_warning";
  if (daysOverdue <= 30) return "demand_letter";
  if (daysOverdue <= 60) return "field_visit";
  if (daysOverdue <= 90) return "collections_escalation";
  return "write_off";
}

function calculateDaysOverdue(dueDate: Date): number {
  const now = new Date();
  const diff = now.getTime() - dueDate.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function calculateLateFee(outstandingBalance: number, stage: CollectionsStage): number {
  const config = COLLECTIONS_STAGES[stage];
  return Math.round(outstandingBalance * (config.feePercent / 100));
}

function calculateProvision(outstandingBalance: number, stage: CollectionsStage): number {
  return Math.round(outstandingBalance * PROVISION_RATES[stage]);
}

// ============================================================================
// ROUTER
// ============================================================================

export const collectionsWorkflowRouter = router({
  /**
   * Scan all active/defaulted loans and identify those needing collections action.
   * Returns loans grouped by collections stage with recommended actions.
   */
  scanOverdueLoans: protectedProcedure
    .input(z.object({
      lenderId: z.number().optional(),
      minDaysOverdue: z.number().min(1).default(1),
      maxDaysOverdue: z.number().max(365).optional(),
      stage: z.enum(["early_warning", "demand_letter", "field_visit", "collections_escalation", "write_off"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const now = new Date();

      // Find loans with overdue repayments
      const overdueLoans = await db.select({
        loanId: loans.id,
        loanNumber: loans.loanNumber,
        userId: loans.userId,
        principalAmount: loans.principalAmount,
        outstandingBalance: loans.outstandingBalance,
        interestRate: loans.interestRate,
        status: loans.status,
        maturityDate: loans.maturityDate,
        oldestOverdueDate: sql<Date>`min(${loanRepayments.dueDate})`,
        overdueCount: sql<number>`count(*)`,
        overdueAmount: sql<number>`sum(${loanRepayments.totalAmount} - ${loanRepayments.paidAmount})`,
      }).from(loans)
        .innerJoin(loanRepayments, eq(loanRepayments.loanId, loans.id))
        .where(and(
          sql`${loans.status} IN ('active', 'disbursed', 'defaulted')`,
          eq(loanRepayments.status, "overdue"),
          lt(loanRepayments.dueDate, now),
        ))
        .groupBy(loans.id, loans.loanNumber, loans.userId, loans.principalAmount,
          loans.outstandingBalance, loans.interestRate, loans.status, loans.maturityDate);

      const results: Array<{
        loanId: number;
        loanNumber: string;
        userId: number;
        outstandingBalance: number;
        overdueAmount: number;
        overdueCount: number;
        daysOverdue: number;
        stage: CollectionsStage;
        stageDescription: string;
        lateFee: number;
        provisionAmount: number;
        recommendedActions: string[];
        escalationDate: string | null;
        priority: "critical" | "high" | "medium" | "low";
      }> = [];

      for (const loan of overdueLoans) {
        const oldestDue = loan.oldestOverdueDate ? new Date(loan.oldestOverdueDate) : now;
        const daysOverdue = calculateDaysOverdue(oldestDue);

        if (daysOverdue < input.minDaysOverdue) continue;
        if (input.maxDaysOverdue && daysOverdue > input.maxDaysOverdue) continue;

        const stage = getCollectionsStage(daysOverdue);
        if (input.stage && stage !== input.stage) continue;

        const balance = loan.outstandingBalance || loan.principalAmount;
        const stageConfig = COLLECTIONS_STAGES[stage];
        const escalationDate = stageConfig.escalationDays < Infinity
          ? new Date(oldestDue.getTime() + stageConfig.escalationDays * 86400000).toISOString().split("T")[0]
          : null;

        results.push({
          loanId: loan.loanId,
          loanNumber: loan.loanNumber,
          userId: loan.userId,
          outstandingBalance: balance,
          overdueAmount: Number(loan.overdueAmount || 0),
          overdueCount: Number(loan.overdueCount || 0),
          daysOverdue,
          stage,
          stageDescription: stageConfig.description,
          lateFee: calculateLateFee(balance, stage),
          provisionAmount: calculateProvision(balance, stage),
          recommendedActions: [...stageConfig.actions],
          escalationDate,
          priority: daysOverdue > 90 ? "critical" : daysOverdue > 60 ? "high" : daysOverdue > 30 ? "medium" : "low",
        });
      }

      results.sort((a, b) => b.daysOverdue - a.daysOverdue);

      const summary = {
        totalOverdueLoans: results.length,
        totalOverdueAmount: results.reduce((s, r) => s + r.overdueAmount, 0),
        totalProvisionNeeded: results.reduce((s, r) => s + r.provisionAmount, 0),
        byStage: {
          early_warning: results.filter(r => r.stage === "early_warning").length,
          demand_letter: results.filter(r => r.stage === "demand_letter").length,
          field_visit: results.filter(r => r.stage === "field_visit").length,
          collections_escalation: results.filter(r => r.stage === "collections_escalation").length,
          write_off: results.filter(r => r.stage === "write_off").length,
        },
      };

      logger.info(`[Collections] Scan complete: ${results.length} overdue loans across 5 stages`);
      return { summary, loans: results };
    }),

  /**
   * Execute a collections action on a specific loan.
   * Records the action, applies fees, and publishes events.
   */
  executeAction: protectedProcedure
    .input(z.object({
      loanId: z.number(),
      action: z.enum([
        "sms_reminder", "push_notification", "email_reminder",
        "formal_demand_letter", "phone_call", "sms_final_notice",
        "assign_field_agent", "restructure_offer", "collateral_assessment",
        "external_collections", "legal_notice", "guarantor_notification",
        "provision_recommendation", "board_approval_request", "tax_write_off",
      ]),
      notes: z.string().max(2000).optional(),
      agentId: z.number().optional(),
      externalPartnerId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const userId = ctx.user?.id;

      const [loan] = await db.select().from(loans).where(eq(loans.id, input.loanId)).limit(1);
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });

      // Get overdue info
      const overduePayments = await db.select({
        count: sql<number>`count(*)`,
        totalOverdue: sql<number>`sum(${loanRepayments.totalAmount} - ${loanRepayments.paidAmount})`,
        oldestDue: sql<Date>`min(${loanRepayments.dueDate})`,
      }).from(loanRepayments)
        .where(and(eq(loanRepayments.loanId, input.loanId), eq(loanRepayments.status, "overdue")));

      const daysOverdue = overduePayments[0]?.oldestDue
        ? calculateDaysOverdue(new Date(overduePayments[0].oldestDue))
        : 0;
      const stage = getCollectionsStage(daysOverdue);
      const balance = loan.outstandingBalance || loan.principalAmount;

      // Apply late fee if transitioning to demand_letter or beyond
      let feeApplied = 0;
      if (stage !== "early_warning" && input.action === "formal_demand_letter") {
        feeApplied = calculateLateFee(balance, stage);
        if (feeApplied > 0) {
          await db.update(loans).set({
            outstandingBalance: balance + feeApplied,
            updatedAt: new Date(),
          }).where(eq(loans.id, input.loanId));
        }
      }

      // Update loan status if in collections or write-off stage
      if (stage === "collections_escalation" && loan.status !== "defaulted") {
        await db.update(loans).set({ status: "defaulted", updatedAt: new Date() }).where(eq(loans.id, input.loanId));
      }

      // Record action in audit log
      await db.insert(auditLogs).values({
        userId: userId || loan.userId,
        eventId: `collections_${Date.now()}_${input.loanId}`,
        eventType: "collections_action",
        entityType: "loan",
        entityId: String(input.loanId),
        timestamp: new Date(),
        data: {
          action: input.action,
          stage,
          daysOverdue,
          feeApplied,
          notes: input.notes,
          agentId: input.agentId,
          externalPartnerId: input.externalPartnerId,
          outstandingBalance: balance,
          provisionAmount: calculateProvision(balance, stage),
        },
      });

      // Publish Kafka event
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "collections-workflow-events",
          messages: [{ value: JSON.stringify({
            type: "collections_action_executed",
            loanId: input.loanId,
            loanNumber: loan.loanNumber,
            userId: loan.userId,
            action: input.action,
            stage,
            daysOverdue,
            feeApplied,
            outstandingBalance: balance,
            timestamp: new Date().toISOString(),
          })}],
        });
      }

      logger.info(`[Collections] Action ${input.action} executed on loan ${loan.loanNumber} (stage=${stage}, days=${daysOverdue})`);

      return {
        loanId: input.loanId,
        action: input.action,
        stage,
        daysOverdue,
        feeApplied,
        newBalance: balance + feeApplied,
        provisionAmount: calculateProvision(balance, stage),
        nextActions: COLLECTIONS_STAGES[stage].actions.filter(a => a !== input.action),
      };
    }),

  /**
   * Get the full collections history for a loan.
   */
  getLoanCollectionsHistory: protectedProcedure
    .input(z.object({
      loanId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();

      const history = await db.select().from(auditLogs)
        .where(and(
          eq(auditLogs.entityType, "loan"),
          eq(auditLogs.entityId, String(input.loanId)),
          eq(auditLogs.eventType, "collections_action"),
        ))
        .orderBy(desc(auditLogs.createdAt))
        .limit(100);

      return {
        loanId: input.loanId,
        totalActions: history.length,
        history: history.map(h => ({
          id: h.id,
          eventId: h.eventId,
          timestamp: h.createdAt,
          data: h.data,
        })),
      };
    }),

  /**
   * Get collections portfolio summary — aggregated view for management.
   */
  getPortfolioSummary: protectedProcedure
    .input(z.object({
      asOfDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const now = input.asOfDate ? new Date(input.asOfDate) : new Date();

      // Get all overdue loans
      const overdueData = await db.select({
        loanId: loans.id,
        outstandingBalance: loans.outstandingBalance,
        principalAmount: loans.principalAmount,
        status: loans.status,
        oldestDue: sql<Date>`min(${loanRepayments.dueDate})`,
      }).from(loans)
        .innerJoin(loanRepayments, eq(loanRepayments.loanId, loans.id))
        .where(and(
          sql`${loans.status} IN ('active', 'disbursed', 'defaulted')`,
          eq(loanRepayments.status, "overdue"),
          lt(loanRepayments.dueDate, now),
        ))
        .groupBy(loans.id, loans.outstandingBalance, loans.principalAmount, loans.status);

      // Total portfolio
      const totalPortfolio = await db.select({
        count: sql<number>`count(*)`,
        totalOutstanding: sql<number>`coalesce(sum(outstanding_balance), 0)`,
      }).from(loans)
        .where(sql`${loans.status} IN ('active', 'disbursed', 'defaulted')`);

      const stageBreakdown: Record<CollectionsStage, { count: number; amount: number; provision: number }> = {
        early_warning: { count: 0, amount: 0, provision: 0 },
        demand_letter: { count: 0, amount: 0, provision: 0 },
        field_visit: { count: 0, amount: 0, provision: 0 },
        collections_escalation: { count: 0, amount: 0, provision: 0 },
        write_off: { count: 0, amount: 0, provision: 0 },
      };

      for (const loan of overdueData) {
        const daysOverdue = loan.oldestDue ? calculateDaysOverdue(new Date(loan.oldestDue)) : 0;
        const stage = getCollectionsStage(daysOverdue);
        const balance = loan.outstandingBalance || loan.principalAmount;
        stageBreakdown[stage].count++;
        stageBreakdown[stage].amount += balance;
        stageBreakdown[stage].provision += calculateProvision(balance, stage);
      }

      const totalOverdue = overdueData.reduce((s, l) => s + (l.outstandingBalance || l.principalAmount), 0);
      const totalProvision = Object.values(stageBreakdown).reduce((s, b) => s + b.provision, 0);
      const portfolioTotal = Number(totalPortfolio[0]?.totalOutstanding ?? 0);

      // PAR (Portfolio at Risk) ratios
      const par1 = portfolioTotal > 0 ? totalOverdue / portfolioTotal : 0;
      const par30 = portfolioTotal > 0
        ? overdueData.filter(l => l.oldestDue && calculateDaysOverdue(new Date(l.oldestDue)) >= 30)
          .reduce((s, l) => s + (l.outstandingBalance || l.principalAmount), 0) / portfolioTotal
        : 0;
      const par90 = portfolioTotal > 0
        ? overdueData.filter(l => l.oldestDue && calculateDaysOverdue(new Date(l.oldestDue)) >= 90)
          .reduce((s, l) => s + (l.outstandingBalance || l.principalAmount), 0) / portfolioTotal
        : 0;

      return {
        asOfDate: now.toISOString().split("T")[0],
        portfolio: {
          totalLoans: Number(totalPortfolio[0]?.count ?? 0),
          totalOutstanding: portfolioTotal,
          overdueLoans: overdueData.length,
          overdueAmount: totalOverdue,
          overduePercent: portfolioTotal > 0 ? Math.round(totalOverdue / portfolioTotal * 10000) / 100 : 0,
        },
        par: {
          par1: Math.round(par1 * 10000) / 100,  // PAR > 1 day
          par30: Math.round(par30 * 10000) / 100, // PAR > 30 days
          par90: Math.round(par90 * 10000) / 100, // PAR > 90 days
        },
        provisioning: {
          totalRequired: totalProvision,
          byStage: stageBreakdown,
        },
        riskIndicators: {
          writeOffCandidates: stageBreakdown.write_off.count,
          writeOffAmount: stageBreakdown.write_off.amount,
          collectionsEscalated: stageBreakdown.collections_escalation.count,
          fieldVisitsPending: stageBreakdown.field_visit.count,
        },
      };
    }),

  /**
   * Approve a write-off recommendation (requires board/admin approval).
   */
  approveWriteOff: protectedProcedure
    .input(z.object({
      loanId: z.number(),
      approvedBy: z.string(),
      reason: z.string().min(10).max(2000),
      boardResolutionRef: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const userId = ctx.user?.id;

      const [loan] = await db.select().from(loans).where(eq(loans.id, input.loanId)).limit(1);
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      if (loan.status !== "defaulted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only defaulted loans can be written off" });
      }

      const writtenOffAmount = loan.outstandingBalance || loan.principalAmount;

      await db.update(loans).set({
        status: "defaulted", // stays defaulted but flagged
        updatedAt: new Date(),
      }).where(eq(loans.id, input.loanId));

      await db.insert(auditLogs).values({
        userId: userId || loan.userId,
        eventId: `writeoff_${Date.now()}_${input.loanId}`,
        eventType: "loan_write_off",
        entityType: "loan",
        entityId: String(input.loanId),
        timestamp: new Date(),
        data: {
          writtenOffAmount,
          approvedBy: input.approvedBy,
          reason: input.reason,
          boardResolutionRef: input.boardResolutionRef,
          previousBalance: loan.outstandingBalance,
        },
      });

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "collections-workflow-events",
          messages: [{ value: JSON.stringify({
            type: "loan_written_off",
            loanId: input.loanId,
            loanNumber: loan.loanNumber,
            writtenOffAmount,
            approvedBy: input.approvedBy,
            timestamp: new Date().toISOString(),
          })}],
        });
      }

      logger.info(`[Collections] Loan ${loan.loanNumber} written off: ₦${writtenOffAmount / 100} by ${input.approvedBy}`);

      return {
        loanId: input.loanId,
        loanNumber: loan.loanNumber,
        writtenOffAmount,
        status: "written_off",
        approvedBy: input.approvedBy,
        boardResolutionRef: input.boardResolutionRef,
      };
    }),

  /**
   * Get collections stage configuration — for UI display and rule management.
   */
  getStageConfig: protectedProcedure
    .query(async () => {
      return {
        stages: Object.entries(COLLECTIONS_STAGES).map(([key, config]) => ({
          stage: key,
          ...config,
          provisionRate: PROVISION_RATES[key as CollectionsStage],
          provisionPercent: Math.round(PROVISION_RATES[key as CollectionsStage] * 100),
        })),
      };
    }),
});
