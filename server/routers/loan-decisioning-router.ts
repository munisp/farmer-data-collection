/**
 * Automated Loan Decisioning Router
 * 
 * Rules engine that converts credit scores into automated loan decisions.
 * Supports: auto-approve, auto-reject, manual review routing, conditional offers,
 * risk-based pricing, debt-to-income checks, and decision audit trail.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { loans, loanRepayments, creditScores } from "../../drizzle/financial-schema.js";
import { users, farmers } from "../../drizzle/schema.js";
import { loanApplications, applicationStatusHistory } from "../../drizzle/loan-application-schema.js";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";

// Decision rule thresholds
const DECISION_RULES = {
  autoApprove: {
    minCreditScore: 700,
    maxDtiRatio: 0.35,
    minRepaymentHistory: 6,
    maxLoanAmount: 2000000, // ₦2M auto-approve ceiling
    minFarmingYears: 2,
  },
  autoReject: {
    maxCreditScore: 300,
    existingDefaultCount: 1,
    maxDtiRatio: 0.60,
  },
  manualReview: {
    // Everything between auto-approve and auto-reject
    escalationReasons: [
      "first_time_borrower",
      "high_amount",
      "borderline_score",
      "incomplete_data",
      "recent_default_cleared",
    ],
  },
  riskPricing: {
    // Band → base interest rate (basis points)
    A: 1200, // 12%
    B: 1500, // 15%
    C: 1800, // 18%
    D: 2200, // 22%
    E: 2500, // 25%
  } as Record<string, number>,
  maxTermByBand: {
    A: 36,
    B: 24,
    C: 18,
    D: 12,
    E: 6,
  } as Record<string, number>,
  maxAmountByBand: {
    A: 5000000,
    B: 2000000,
    C: 1000000,
    D: 500000,
    E: 100000,
  } as Record<string, number>,
};

type DecisionOutcome = "auto_approved" | "auto_rejected" | "manual_review" | "conditional_offer";

interface DecisionResult {
  outcome: DecisionOutcome;
  reasons: string[];
  offeredAmount: number | null;
  offeredRate: number | null;
  offeredTermMonths: number | null;
  riskBand: string;
  dtiRatio: number;
  conditions: string[];
}

function getBandFromScore(score: number): string {
  if (score >= 800) return "A";
  if (score >= 650) return "B";
  if (score >= 500) return "C";
  if (score >= 350) return "D";
  return "E";
}

function calculateDti(
  monthlyIncome: number,
  existingMonthlyPayments: number,
  proposedMonthlyPayment: number
): number {
  if (monthlyIncome <= 0) return 1.0;
  return (existingMonthlyPayments + proposedMonthlyPayment) / monthlyIncome;
}

function calculateMonthlyPayment(principal: number, annualRateBps: number, termMonths: number): number {
  const monthlyRate = annualRateBps / 10000 / 12;
  if (monthlyRate === 0) return Math.round(principal / termMonths);
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return Math.round(principal * (monthlyRate * factor) / (factor - 1));
}

export const loanDecisioningRouter = router({
  /**
   * Run automated decisioning on a loan application.
   * Evaluates credit score, DTI, repayment history, and risk factors
   * to produce an instant decision or route to manual review.
   */
  evaluateApplication: protectedProcedure
    .input(z.object({
      applicationId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      // Fetch the loan application
      const [app] = await db.select().from(loanApplications)
        .where(eq(loanApplications.id, input.applicationId));
      if (!app) throw new Error("Application not found");
      if (app.status !== "pending" && app.status !== "under_review") {
        throw new Error(`Cannot evaluate application in ${app.status} status`);
      }

      const userId = app.userId;
      if (!userId) throw new Error("Application has no associated user");

      // Fetch credit score
      const [score] = await db.select().from(creditScores)
        .where(eq(creditScores.userId, userId));
      const creditScore = score?.score ?? 0;
      const riskBand = getBandFromScore(creditScore);

      // Fetch existing active loans for DTI
      const activeLoans = await db.select().from(loans)
        .where(and(eq(loans.userId, userId), eq(loans.status, "active")));
      const existingMonthlyPayments = activeLoans.reduce(
        (sum, l) => sum + (l.monthlyPayment || 0), 0
      );

      // Count defaults
      const defaultedLoans = await db.select().from(loans)
        .where(and(eq(loans.userId, userId), eq(loans.status, "defaulted")));

      // Fetch repayment history count
      const repaymentHistory = await db.select({ count: sql<number>`count(*)` })
        .from(loanRepayments)
        .innerJoin(loans, eq(loanRepayments.loanId, loans.id))
        .where(and(eq(loans.userId, userId), eq(loanRepayments.status, "paid")));
      const repaymentCount = Number(repaymentHistory[0]?.count ?? 0);

      // Calculate proposed monthly payment at risk-based rate
      const proposedRate = DECISION_RULES.riskPricing[riskBand] || 2500;
      const requestedTerm = app.termMonths || 12;
      const requestedAmount = app.loanAmount || 0;
      const proposedMonthlyPayment = calculateMonthlyPayment(requestedAmount, proposedRate, requestedTerm);

      // Fetch monthly income
      const monthlyIncome = app.monthlyIncome || 0;
      const dtiRatio = calculateDti(monthlyIncome, existingMonthlyPayments, proposedMonthlyPayment);

      // Farming experience
      const farmingYears = app.yearsOfFarming || 0;

      // Run decision rules
      const result = runDecisionRules({
        creditScore,
        riskBand,
        dtiRatio,
        repaymentCount,
        defaultCount: defaultedLoans.length,
        requestedAmount,
        requestedTerm,
        monthlyIncome,
        farmingYears,
        proposedRate,
      });

      // Update application status based on decision
      let newStatus: string;
      switch (result.outcome) {
        case "auto_approved":
          newStatus = "approved";
          break;
        case "auto_rejected":
          newStatus = "rejected";
          break;
        case "conditional_offer":
          newStatus = "under_review";
          break;
        default:
          newStatus = "under_review";
      }

      await db.update(loanApplications)
        .set({
          status: newStatus,
          approvedAmount: result.offeredAmount,
          approvedTermMonths: result.offeredTermMonths,
          approvedInterestRate: result.offeredRate ? Math.round(result.offeredRate * 100) : null,
          reviewNotes: JSON.stringify({
            decisionEngine: true,
            outcome: result.outcome,
            reasons: result.reasons,
            riskBand,
            dtiRatio: Math.round(dtiRatio * 100) / 100,
            creditScore,
            conditions: result.conditions,
          }),
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(loanApplications.id, input.applicationId));

      // Record status history
      await db.insert(applicationStatusHistory).values({
        applicationId: input.applicationId,
        fromStatus: app.status,
        toStatus: newStatus,
        changedBy: ctx.user?.id || null,
        notes: `Automated decisioning: ${result.outcome}`,
      });

      // Publish Kafka event
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "loan-decisioning-events",
          messages: [{ value: JSON.stringify({
            type: "loan_decision_made",
            applicationId: input.applicationId,
            userId,
            outcome: result.outcome,
            riskBand,
            creditScore,
            dtiRatio,
            offeredAmount: result.offeredAmount,
            offeredRate: result.offeredRate,
          })}],
        });
      }

      logger.info(`[LoanDecisioning] Application ${input.applicationId}: ${result.outcome} (band=${riskBand}, score=${creditScore}, dti=${Math.round(dtiRatio * 100)}%)`);

      return {
        applicationId: input.applicationId,
        ...result,
        creditScore,
        repaymentCount,
        existingDebtMonthly: existingMonthlyPayments,
        proposedMonthlyPayment,
      };
    }),

  /**
   * Get decision rules configuration (for admin transparency).
   */
  getDecisionRules: protectedProcedure
    .query(async () => {
      return {
        autoApprove: DECISION_RULES.autoApprove,
        autoReject: DECISION_RULES.autoReject,
        riskPricing: Object.entries(DECISION_RULES.riskPricing).map(([band, rate]) => ({
          band,
          interestRate: rate / 100,
          maxAmount: DECISION_RULES.maxAmountByBand[band],
          maxTerm: DECISION_RULES.maxTermByBand[band],
        })),
        escalationReasons: DECISION_RULES.manualReview.escalationReasons,
      };
    }),

  /**
   * Batch evaluate pending applications (admin/cron).
   * Processes up to `limit` pending applications through the rules engine.
   */
  batchEvaluate: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      const pendingApps = await db.select().from(loanApplications)
        .where(eq(loanApplications.status, "pending"))
        .orderBy(loanApplications.createdAt)
        .limit(input.limit);

      const results: Array<{ applicationId: number; outcome: string }> = [];

      for (const app of pendingApps) {
        try {
          const userId = app.userId;
          if (!userId) continue;

          const [score] = await db.select().from(creditScores)
            .where(eq(creditScores.userId, userId));
          const creditScore = score?.score ?? 0;
          const riskBand = getBandFromScore(creditScore);

          const activeLoans = await db.select().from(loans)
            .where(and(eq(loans.userId, userId), eq(loans.status, "active")));
          const existingMonthlyPayments = activeLoans.reduce((s, l) => s + (l.monthlyPayment || 0), 0);

          const defaultedLoans = await db.select().from(loans)
            .where(and(eq(loans.userId, userId), eq(loans.status, "defaulted")));

          const repaymentHistory = await db.select({ count: sql<number>`count(*)` })
            .from(loanRepayments)
            .innerJoin(loans, eq(loanRepayments.loanId, loans.id))
            .where(and(eq(loans.userId, userId), eq(loanRepayments.status, "paid")));

          const proposedRate = DECISION_RULES.riskPricing[riskBand] || 2500;
          const proposedMonthly = calculateMonthlyPayment(app.loanAmount || 0, proposedRate, app.termMonths || 12);
          const dtiRatio = calculateDti(app.monthlyIncome || 0, existingMonthlyPayments, proposedMonthly);

          const decision = runDecisionRules({
            creditScore,
            riskBand,
            dtiRatio,
            repaymentCount: Number(repaymentHistory[0]?.count ?? 0),
            defaultCount: defaultedLoans.length,
            requestedAmount: app.loanAmount || 0,
            requestedTerm: app.termMonths || 12,
            monthlyIncome: app.monthlyIncome || 0,
            farmingYears: app.yearsOfFarming || 0,
            proposedRate,
          });

          let newStatus: string;
          switch (decision.outcome) {
            case "auto_approved": newStatus = "approved"; break;
            case "auto_rejected": newStatus = "rejected"; break;
            default: newStatus = "under_review";
          }

          await db.update(loanApplications)
            .set({
              status: newStatus,
              approvedAmount: decision.offeredAmount,
              approvedTermMonths: decision.offeredTermMonths,
              approvedInterestRate: decision.offeredRate ? Math.round(decision.offeredRate * 100) : null,
              reviewNotes: JSON.stringify({ decisionEngine: true, outcome: decision.outcome, reasons: decision.reasons }),
              reviewedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(loanApplications.id, app.id));

          await db.insert(applicationStatusHistory).values({
            applicationId: app.id,
            fromStatus: "pending",
            toStatus: newStatus,
            changedBy: ctx.user?.id || null,
            notes: `Batch decisioning: ${decision.outcome}`,
          });

          results.push({ applicationId: app.id, outcome: decision.outcome });
        } catch (err) {
          logger.error(`[LoanDecisioning] Batch error for app ${app.id}:`, err);
          results.push({ applicationId: app.id, outcome: "error" });
        }
      }

      logger.info(`[LoanDecisioning] Batch evaluated ${results.length} applications`);
      return { processed: results.length, results };
    }),

  /**
   * Simulate a decision without persisting (what-if analysis).
   */
  simulateDecision: protectedProcedure
    .input(z.object({
      creditScore: z.number().min(0).max(1000),
      monthlyIncome: z.number().min(0),
      existingMonthlyDebt: z.number().min(0).default(0),
      requestedAmount: z.number().positive(),
      requestedTerm: z.number().min(1).max(60),
      farmingYears: z.number().min(0).default(0),
      repaymentCount: z.number().min(0).default(0),
      defaultCount: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const riskBand = getBandFromScore(input.creditScore);
      const proposedRate = DECISION_RULES.riskPricing[riskBand] || 2500;
      const proposedMonthly = calculateMonthlyPayment(input.requestedAmount, proposedRate, input.requestedTerm);
      const dtiRatio = calculateDti(input.monthlyIncome, input.existingMonthlyDebt, proposedMonthly);

      const result = runDecisionRules({
        creditScore: input.creditScore,
        riskBand,
        dtiRatio,
        repaymentCount: input.repaymentCount,
        defaultCount: input.defaultCount,
        requestedAmount: input.requestedAmount,
        requestedTerm: input.requestedTerm,
        monthlyIncome: input.monthlyIncome,
        farmingYears: input.farmingYears,
        proposedRate,
      });

      return {
        ...result,
        proposedMonthlyPayment: proposedMonthly,
        simulation: true,
      };
    }),

  /**
   * Get decision history for an application.
   */
  getDecisionHistory: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const history = await db.select().from(applicationStatusHistory)
        .where(eq(applicationStatusHistory.applicationId, input.applicationId))
        .orderBy(desc(applicationStatusHistory.changedAt));
      return history;
    }),

  /**
   * Override an automated decision (admin only).
   */
  overrideDecision: protectedProcedure
    .input(z.object({
      applicationId: z.number(),
      newStatus: z.enum(["approved", "rejected", "under_review"]),
      overrideReason: z.string().min(10),
      approvedAmount: z.number().optional(),
      approvedRate: z.number().optional(),
      approvedTerm: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      const [app] = await db.select().from(loanApplications)
        .where(eq(loanApplications.id, input.applicationId));
      if (!app) throw new Error("Application not found");

      await db.update(loanApplications)
        .set({
          status: input.newStatus,
          approvedAmount: input.approvedAmount ?? app.approvedAmount,
          approvedInterestRate: input.approvedRate ?? app.approvedInterestRate,
          approvedTermMonths: input.approvedTerm ?? app.approvedTermMonths,
          reviewNotes: JSON.stringify({
            override: true,
            overrideBy: ctx.user?.id,
            overrideReason: input.overrideReason,
            previousStatus: app.status,
          }),
          reviewedBy: ctx.user?.id || null,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(loanApplications.id, input.applicationId));

      await db.insert(applicationStatusHistory).values({
        applicationId: input.applicationId,
        fromStatus: app.status,
        toStatus: input.newStatus,
        changedBy: ctx.user?.id || null,
        notes: `Manual override: ${input.overrideReason}`,
      });

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "loan-decisioning-events",
          messages: [{ value: JSON.stringify({
            type: "decision_overridden",
            applicationId: input.applicationId,
            previousStatus: app.status,
            newStatus: input.newStatus,
            overrideBy: ctx.user?.id,
          })}],
        });
      }

      logger.info(`[LoanDecisioning] Override: app ${input.applicationId} ${app.status} → ${input.newStatus} by user ${ctx.user?.id}`);
      return { success: true };
    }),
});

function runDecisionRules(params: {
  creditScore: number;
  riskBand: string;
  dtiRatio: number;
  repaymentCount: number;
  defaultCount: number;
  requestedAmount: number;
  requestedTerm: number;
  monthlyIncome: number;
  farmingYears: number;
  proposedRate: number;
}): DecisionResult {
  const reasons: string[] = [];
  const conditions: string[] = [];
  const { creditScore, riskBand, dtiRatio, repaymentCount, defaultCount, requestedAmount, requestedTerm, monthlyIncome, farmingYears, proposedRate } = params;

  const maxAmount = DECISION_RULES.maxAmountByBand[riskBand] || 100000;
  const maxTerm = DECISION_RULES.maxTermByBand[riskBand] || 6;

  // === Auto-reject checks ===
  if (creditScore <= DECISION_RULES.autoReject.maxCreditScore) {
    reasons.push(`Credit score ${creditScore} below minimum threshold ${DECISION_RULES.autoReject.maxCreditScore}`);
    return { outcome: "auto_rejected", reasons, offeredAmount: null, offeredRate: null, offeredTermMonths: null, riskBand, dtiRatio, conditions: [] };
  }

  if (defaultCount >= DECISION_RULES.autoReject.existingDefaultCount) {
    reasons.push(`${defaultCount} existing default(s) exceed tolerance`);
    return { outcome: "auto_rejected", reasons, offeredAmount: null, offeredRate: null, offeredTermMonths: null, riskBand, dtiRatio, conditions: [] };
  }

  if (dtiRatio > DECISION_RULES.autoReject.maxDtiRatio) {
    reasons.push(`Debt-to-income ratio ${Math.round(dtiRatio * 100)}% exceeds maximum ${Math.round(DECISION_RULES.autoReject.maxDtiRatio * 100)}%`);
    return { outcome: "auto_rejected", reasons, offeredAmount: null, offeredRate: null, offeredTermMonths: null, riskBand, dtiRatio, conditions: [] };
  }

  if (monthlyIncome <= 0) {
    reasons.push("No verified monthly income");
    return { outcome: "auto_rejected", reasons, offeredAmount: null, offeredRate: null, offeredTermMonths: null, riskBand, dtiRatio, conditions: [] };
  }

  // === Auto-approve checks ===
  const cappedAmount = Math.min(requestedAmount, maxAmount);
  const cappedTerm = Math.min(requestedTerm, maxTerm);
  const offeredRate = proposedRate / 100; // convert bps to percentage

  if (
    creditScore >= DECISION_RULES.autoApprove.minCreditScore &&
    dtiRatio <= DECISION_RULES.autoApprove.maxDtiRatio &&
    repaymentCount >= DECISION_RULES.autoApprove.minRepaymentHistory &&
    requestedAmount <= DECISION_RULES.autoApprove.maxLoanAmount &&
    farmingYears >= DECISION_RULES.autoApprove.minFarmingYears
  ) {
    reasons.push(`Credit score ${creditScore} ≥ ${DECISION_RULES.autoApprove.minCreditScore}`);
    reasons.push(`DTI ${Math.round(dtiRatio * 100)}% ≤ ${DECISION_RULES.autoApprove.maxDtiRatio * 100}%`);
    reasons.push(`${repaymentCount} on-time repayments`);
    return {
      outcome: "auto_approved",
      reasons,
      offeredAmount: cappedAmount,
      offeredRate,
      offeredTermMonths: cappedTerm,
      riskBand,
      dtiRatio,
      conditions: [],
    };
  }

  // === Conditional offer ===
  if (creditScore >= 500 && dtiRatio <= 0.50) {
    if (requestedAmount > maxAmount) {
      reasons.push(`Requested ₦${requestedAmount.toLocaleString()} exceeds band ${riskBand} limit ₦${maxAmount.toLocaleString()}`);
      conditions.push(`Maximum approved amount: ₦${maxAmount.toLocaleString()}`);
    }
    if (requestedTerm > maxTerm) {
      reasons.push(`Requested ${requestedTerm} months exceeds band ${riskBand} limit ${maxTerm} months`);
      conditions.push(`Maximum term: ${maxTerm} months`);
    }
    if (repaymentCount < DECISION_RULES.autoApprove.minRepaymentHistory) {
      conditions.push("Provide guarantor or additional collateral");
    }
    if (farmingYears < DECISION_RULES.autoApprove.minFarmingYears) {
      conditions.push("Complete agricultural training module");
    }

    return {
      outcome: "conditional_offer",
      reasons,
      offeredAmount: cappedAmount,
      offeredRate,
      offeredTermMonths: cappedTerm,
      riskBand,
      dtiRatio,
      conditions,
    };
  }

  // === Manual review ===
  const escalationReasons: string[] = [];
  if (repaymentCount === 0) escalationReasons.push("first_time_borrower");
  if (requestedAmount > maxAmount) escalationReasons.push("high_amount");
  if (creditScore >= 400 && creditScore < 500) escalationReasons.push("borderline_score");
  if (monthlyIncome > 0 && !farmingYears) escalationReasons.push("incomplete_data");

  reasons.push(...escalationReasons.map(r => `Escalation: ${r}`));

  return {
    outcome: "manual_review",
    reasons,
    offeredAmount: cappedAmount,
    offeredRate,
    offeredTermMonths: cappedTerm,
    riskBand,
    dtiRatio,
    conditions: ["Requires manual underwriter review"],
  };
}
