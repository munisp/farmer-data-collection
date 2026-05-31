/**
 * Unified Payment Orchestrator Router
 * 
 * Cross-provider payment routing with automatic failover, retry logic,
 * fee optimization, and unified transaction lifecycle management.
 * Supports: M-Pesa, MTN MoMo, Airtel Money, Flutterwave, bank transfers.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { mobileMoneyAccounts, mobileMoneyTransactions } from "../../drizzle/supply-chain-schema.js";
import { resilientPost } from "../services/resilient-http.js";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";
import crypto from "crypto";

const MOBILE_MONEY_SERVICE_URL = process.env.MOBILE_MONEY_SERVICE_URL || "http://localhost:8090";

// Provider configuration
const PROVIDERS: Record<string, {
  name: string;
  countries: string[];
  currencies: string[];
  minAmount: number;
  maxAmount: number;
  feeStructure: { fixed: number; percentBps: number };
  apiPath: string;
  avgSettlementMinutes: number;
  reliability: number; // 0-1 score, higher = more reliable
}> = {
  mpesa: {
    name: "M-Pesa (Safaricom)",
    countries: ["KE", "TZ"],
    currencies: ["KES", "TZS"],
    minAmount: 10,
    maxAmount: 300000,
    feeStructure: { fixed: 0, percentBps: 100 }, // 1%
    apiPath: "/api/mpesa/stk-push",
    avgSettlementMinutes: 2,
    reliability: 0.97,
  },
  mtn_momo: {
    name: "MTN Mobile Money",
    countries: ["UG", "GH", "CM", "NG"],
    currencies: ["UGX", "GHS", "XAF", "NGN"],
    minAmount: 100,
    maxAmount: 5000000,
    feeStructure: { fixed: 50, percentBps: 150 }, // ₦50 + 1.5%
    apiPath: "/api/mtn/request-payment",
    avgSettlementMinutes: 5,
    reliability: 0.93,
  },
  airtel_money: {
    name: "Airtel Money",
    countries: ["KE", "UG", "TZ", "NG"],
    currencies: ["KES", "UGX", "TZS", "NGN"],
    minAmount: 50,
    maxAmount: 500000,
    feeStructure: { fixed: 25, percentBps: 120 }, // ₦25 + 1.2%
    apiPath: "/api/airtel/collect",
    avgSettlementMinutes: 3,
    reliability: 0.91,
  },
  flutterwave: {
    name: "Flutterwave",
    countries: ["NG", "KE", "GH", "ZA", "TZ", "UG"],
    currencies: ["NGN", "KES", "GHS", "ZAR", "TZS", "UGX"],
    minAmount: 100,
    maxAmount: 10000000,
    feeStructure: { fixed: 0, percentBps: 140 }, // 1.4% (capped at ₦2000)
    apiPath: "/api/flutterwave/charge",
    avgSettlementMinutes: 10,
    reliability: 0.95,
  },
  bank_transfer: {
    name: "Bank Transfer (NIP)",
    countries: ["NG"],
    currencies: ["NGN"],
    minAmount: 1000,
    maxAmount: 50000000,
    feeStructure: { fixed: 10, percentBps: 25 }, // ₦10 + 0.25%
    apiPath: "/api/bank/transfer",
    avgSettlementMinutes: 30,
    reliability: 0.98,
  },
};

// Retry configuration per attempt
const RETRY_DELAYS_MS = [0, 3000, 10000, 30000]; // immediate, 3s, 10s, 30s

function calculateFee(provider: string, amount: number): number {
  const config = PROVIDERS[provider];
  if (!config) return 0;
  let fee = config.feeStructure.fixed + Math.round(amount * config.feeStructure.percentBps / 10000);
  // Flutterwave cap
  if (provider === "flutterwave") fee = Math.min(fee, 2000);
  return fee;
}

function selectOptimalProvider(
  amount: number,
  currency: string,
  country: string,
  preferredProvider?: string,
  excludeProviders?: string[],
): { provider: string; fee: number; reason: string } | null {
  const excluded = new Set(excludeProviders || []);
  const candidates = Object.entries(PROVIDERS)
    .filter(([key, p]) => {
      if (excluded.has(key)) return false;
      if (!p.currencies.includes(currency)) return false;
      if (!p.countries.includes(country)) return false;
      if (amount < p.minAmount || amount > p.maxAmount) return false;
      return true;
    })
    .map(([key, p]) => ({
      key,
      fee: calculateFee(key, amount),
      reliability: p.reliability,
      settlement: p.avgSettlementMinutes,
    }));

  if (candidates.length === 0) return null;

  // If preferred provider is available, use it
  if (preferredProvider) {
    const preferred = candidates.find(c => c.key === preferredProvider);
    if (preferred) return { provider: preferred.key, fee: preferred.fee, reason: "user_preferred" };
  }

  // Score: 40% fee (lower=better), 40% reliability, 20% settlement speed
  const maxFee = Math.max(...candidates.map(c => c.fee)) || 1;
  const maxSettlement = Math.max(...candidates.map(c => c.settlement)) || 1;

  const scored = candidates.map(c => ({
    ...c,
    score: (1 - c.fee / maxFee) * 0.4 + c.reliability * 0.4 + (1 - c.settlement / maxSettlement) * 0.2,
  }));

  scored.sort((a, b) => b.score - a.score);
  return { provider: scored[0].key, fee: scored[0].fee, reason: "optimal_routing" };
}

export const paymentOrchestratorRouter = router({
  /**
   * Initiate a payment with automatic provider selection and failover.
   */
  initiatePayment: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      currency: z.string().default("NGN"),
      country: z.string().default("NG"),
      phoneNumber: z.string().min(10),
      purpose: z.enum(["purchase", "subscription", "loan_repayment", "chama_contribution", "escrow_deposit", "subsidy_disbursement"]),
      orderId: z.number().optional(),
      preferredProvider: z.string().optional(),
      idempotencyKey: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const userId = ctx.user.id;

      // Idempotency check via metadata
      const idempotencyKey = input.idempotencyKey || crypto.randomUUID();
      const [existing] = await db.select().from(mobileMoneyTransactions)
        .where(sql`${mobileMoneyTransactions.metadata}::text LIKE ${'%"idempotencyKey":"' + idempotencyKey + '"%'}`);
      if (existing) {
        return {
          transactionId: existing.id,
          status: existing.status,
          provider: existing.provider,
          idempotencyKey,
          message: "Duplicate request — returning existing transaction",
        };
      }

      // Select optimal provider
      const selection = selectOptimalProvider(input.amount, input.currency, input.country, input.preferredProvider);
      if (!selection) {
        throw new Error(`No payment provider available for ${input.amount} ${input.currency} in ${input.country}`);
      }

      const providerConfig = PROVIDERS[selection.provider];

      // Create transaction record
      const [tx] = await db.insert(mobileMoneyTransactions).values({
        userId,
        provider: selection.provider,
        transactionType: "payment",
        amount: input.amount,
        currency: input.currency,
        phoneNumber: input.phoneNumber,
        status: "pending",
        orderId: input.orderId || null,
        metadata: JSON.stringify({
          purpose: input.purpose,
          routingReason: selection.reason,
          providerFee: selection.fee,
          idempotencyKey,
          ...(input.metadata || {}),
        }),
      }).returning();

      // Attempt payment with the selected provider
      let attemptNumber = 0;
      let lastError: string | null = null;
      let success = false;
      let providerTransactionId: string | null = null;
      const failedProviders: string[] = [];
      let currentProvider = selection.provider;

      while (attemptNumber < RETRY_DELAYS_MS.length && !success) {
        if (attemptNumber > 0) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attemptNumber]));
        }

        try {
          const currentConfig = PROVIDERS[currentProvider];
          const result = await resilientPost<Record<string, unknown>>(
            `payment-${currentProvider}`,
            `${MOBILE_MONEY_SERVICE_URL}${currentConfig.apiPath}`,
            {
              phone: input.phoneNumber,
              amount: input.amount,
              currency: input.currency,
              reference: `TX-${tx.id}`,
              narration: `FarmConnect ${input.purpose}`,
            },
            { maxRetries: 1, timeoutMs: 30_000 },
          );

          if (result.status === "success" || result.CheckoutRequestID || result.transaction_id) {
            success = true;
            providerTransactionId = String(result.CheckoutRequestID || result.transaction_id || result.reference || "");
          } else {
            lastError = String(result.error || result.message || "Provider returned non-success");
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Provider communication error";
        }

        if (!success) {
          attemptNumber++;
          failedProviders.push(currentProvider);

          // Try failover to next provider
          const fallback = selectOptimalProvider(
            input.amount, input.currency, input.country,
            undefined,
            failedProviders,
          );
          if (fallback) {
            currentProvider = fallback.provider;
            logger.info(`[PaymentOrchestrator] Failing over from ${failedProviders[failedProviders.length - 1]} to ${currentProvider}`);
          }
        }
      }

      // Update transaction with result
      await db.update(mobileMoneyTransactions)
        .set({
          status: success ? "processing" : "failed",
          provider: currentProvider,
          providerTransactionId: providerTransactionId || null,
          failureReason: success ? null : lastError,
          metadata: JSON.stringify({
            purpose: input.purpose,
            routingReason: selection.reason,
            attempts: attemptNumber + 1,
            failedProviders,
            finalProvider: currentProvider,
          }),
          updatedAt: new Date(),
        })
        .where(eq(mobileMoneyTransactions.id, tx.id));

      // Publish Kafka event
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "payment-orchestrator-events",
          messages: [{ value: JSON.stringify({
            type: success ? "payment_initiated" : "payment_failed",
            transactionId: tx.id,
            userId,
            amount: input.amount,
            provider: currentProvider,
            purpose: input.purpose,
            attempts: attemptNumber + 1,
            failedProviders,
          })}],
        });
      }

      logger.info(`[PaymentOrchestrator] Payment ${tx.id}: ${success ? "initiated" : "failed"} via ${currentProvider} (${attemptNumber + 1} attempts)`);

      return {
        transactionId: tx.id,
        status: success ? "processing" : "failed",
        provider: currentProvider,
        providerTransactionId,
        fee: calculateFee(currentProvider, input.amount),
        idempotencyKey,
        attempts: attemptNumber + 1,
        failedProviders,
        error: success ? null : lastError,
      };
    }),

  /**
   * Get fee comparison across all available providers for a given amount.
   */
  compareFees: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      currency: z.string().default("NGN"),
      country: z.string().default("NG"),
    }))
    .query(async ({ input }) => {
      const comparisons = Object.entries(PROVIDERS)
        .filter(([, p]) => p.currencies.includes(input.currency) && p.countries.includes(input.country))
        .filter(([, p]) => input.amount >= p.minAmount && input.amount <= p.maxAmount)
        .map(([key, p]) => {
          const fee = calculateFee(key, input.amount);
          return {
            provider: key,
            providerName: p.name,
            fee,
            feePercent: Math.round(fee / input.amount * 10000) / 100,
            totalCost: input.amount + fee,
            settlementMinutes: p.avgSettlementMinutes,
            reliability: Math.round(p.reliability * 100),
            available: true,
          };
        });

      comparisons.sort((a, b) => a.fee - b.fee);

      const optimal = selectOptimalProvider(input.amount, input.currency, input.country);

      return {
        amount: input.amount,
        currency: input.currency,
        providers: comparisons,
        recommended: optimal?.provider || null,
        recommendedReason: optimal?.reason || "no_provider_available",
        cheapest: comparisons[0]?.provider || null,
      };
    }),

  /**
   * Initiate a disbursement (payout to farmer/seller).
   */
  disburseFunds: protectedProcedure
    .input(z.object({
      recipientPhone: z.string().min(10),
      amount: z.number().positive(),
      currency: z.string().default("NGN"),
      country: z.string().default("NG"),
      reason: z.enum(["loan_disbursement", "subsidy_payment", "escrow_release", "chama_payout", "marketplace_settlement"]),
      recipientName: z.string().optional(),
      referenceId: z.number().optional(),
      preferredProvider: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const idempotencyKey = crypto.randomUUID();

      const selection = selectOptimalProvider(input.amount, input.currency, input.country, input.preferredProvider);
      if (!selection) throw new Error("No provider available for disbursement");

      const [tx] = await db.insert(mobileMoneyTransactions).values({
        userId: ctx.user.id,
        provider: selection.provider,
        transactionType: "disbursement",
        amount: input.amount,
        currency: input.currency,
        phoneNumber: input.recipientPhone,
        status: "pending",
        metadata: JSON.stringify({
          reason: input.reason,
          recipientName: input.recipientName,
          referenceId: input.referenceId,
          idempotencyKey,
          fee: selection.fee,
        }),
      }).returning();

      // Attempt disbursement
      try {
        const providerConfig = PROVIDERS[selection.provider];
        const result = await resilientPost<Record<string, unknown>>(
          `disburse-${selection.provider}`,
          `${MOBILE_MONEY_SERVICE_URL}${providerConfig.apiPath.replace("stk-push", "b2c").replace("request-payment", "transfer").replace("collect", "disbursement")}`,
          {
            phone: input.recipientPhone,
            amount: input.amount,
            currency: input.currency,
            reference: `DISB-${tx.id}`,
            narration: `FarmConnect ${input.reason}`,
          },
          { maxRetries: 2, timeoutMs: 30_000 },
        );

        const providerTxId = String(result.transaction_id || result.ConversationID || result.reference || "");

        await db.update(mobileMoneyTransactions)
          .set({
            status: "processing",
            providerTransactionId: providerTxId,
            updatedAt: new Date(),
          })
          .where(eq(mobileMoneyTransactions.id, tx.id));

        const producer = await getProducer();
        if (producer) {
          await producer.send({
            topic: "payment-orchestrator-events",
            messages: [{ value: JSON.stringify({
              type: "disbursement_initiated",
              transactionId: tx.id,
              amount: input.amount,
              provider: selection.provider,
              reason: input.reason,
            })}],
          });
        }

        return {
          transactionId: tx.id,
          status: "processing",
          provider: selection.provider,
          fee: selection.fee,
          providerTransactionId: providerTxId,
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Disbursement failed";
        await db.update(mobileMoneyTransactions)
          .set({ status: "failed", failureReason: errorMsg, updatedAt: new Date() })
          .where(eq(mobileMoneyTransactions.id, tx.id));

        return { transactionId: tx.id, status: "failed", error: errorMsg };
      }
    }),

  /**
   * Check transaction status and reconcile with provider.
   */
  checkTransactionStatus: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const [tx] = await db.select().from(mobileMoneyTransactions)
        .where(and(
          eq(mobileMoneyTransactions.id, input.transactionId),
          eq(mobileMoneyTransactions.userId, ctx.user.id),
        ));

      if (!tx) throw new Error("Transaction not found");

      // If still pending/processing, query provider
      if (tx.status === "pending" || tx.status === "processing") {
        const providerConfig = PROVIDERS[tx.provider];
        if (providerConfig && tx.providerTransactionId) {
          try {
            const statusResult = await resilientPost<Record<string, unknown>>(
              `status-${tx.provider}`,
              `${MOBILE_MONEY_SERVICE_URL}/api/${tx.provider}/status`,
              { transaction_id: tx.providerTransactionId },
              { maxRetries: 1, timeoutMs: 10_000 },
            );

            const providerStatus = String(statusResult.status || "unknown");
            if (providerStatus === "completed" || providerStatus === "successful") {
              await db.update(mobileMoneyTransactions)
                .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
                .where(eq(mobileMoneyTransactions.id, tx.id));
              return { ...tx, status: "completed", reconciled: true };
            } else if (providerStatus === "failed" || providerStatus === "cancelled") {
              await db.update(mobileMoneyTransactions)
                .set({ status: "failed", failureReason: String(statusResult.reason || "Provider reported failure"), updatedAt: new Date() })
                .where(eq(mobileMoneyTransactions.id, tx.id));
              return { ...tx, status: "failed", reconciled: true };
            }
          } catch (error) { logger.error("[Service] Operation failed", { error: error instanceof Error ? error.message : String(error) });
            // Status check failed, return current state
          }
        }
      }

      return { ...tx, reconciled: false };
    }),

  /**
   * Get transaction history with filtering.
   */
  getTransactionHistory: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
      provider: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const conditions = [eq(mobileMoneyTransactions.userId, ctx.user.id)];
      if (input.status) conditions.push(eq(mobileMoneyTransactions.status, input.status));
      if (input.provider) conditions.push(eq(mobileMoneyTransactions.provider, input.provider));

      const txs = await db.select().from(mobileMoneyTransactions)
        .where(and(...conditions))
        .orderBy(desc(mobileMoneyTransactions.createdAt))
        .limit(input.limit);

      const totals = await db.select({
        total: sql<number>`sum(amount)`,
        count: sql<number>`count(*)`,
      }).from(mobileMoneyTransactions)
        .where(and(
          eq(mobileMoneyTransactions.userId, ctx.user.id),
          eq(mobileMoneyTransactions.status, "completed"),
        ));

      return {
        transactions: txs,
        summary: {
          totalCompleted: Number(totals[0]?.total ?? 0),
          transactionCount: Number(totals[0]?.count ?? 0),
        },
      };
    }),

  /**
   * Get available providers for a country/currency combination.
   */
  getAvailableProviders: protectedProcedure
    .input(z.object({
      country: z.string().default("NG"),
      currency: z.string().default("NGN"),
    }))
    .query(async ({ input }) => {
      return Object.entries(PROVIDERS)
        .filter(([, p]) => p.countries.includes(input.country) && p.currencies.includes(input.currency))
        .map(([key, p]) => ({
          key,
          name: p.name,
          minAmount: p.minAmount,
          maxAmount: p.maxAmount,
          feeFixed: p.feeStructure.fixed,
          feePercent: p.feeStructure.percentBps / 100,
          avgSettlementMinutes: p.avgSettlementMinutes,
          reliability: Math.round(p.reliability * 100),
        }));
    }),

  /**
   * Reconcile stale transactions (admin/cron).
   * Checks provider for final status on transactions stuck in pending/processing.
   */
  reconcileStaleTransactions: protectedProcedure
    .input(z.object({
      staleMinutes: z.number().min(5).max(1440).default(60),
      limit: z.number().min(1).max(100).default(50),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const cutoff = new Date(Date.now() - input.staleMinutes * 60_000);

      const staleTxs = await db.select().from(mobileMoneyTransactions)
        .where(and(
          sql`${mobileMoneyTransactions.status} IN ('pending', 'processing')`,
          sql`${mobileMoneyTransactions.createdAt} < ${cutoff}`,
        ))
        .limit(input.limit);

      let reconciled = 0;
      let failed = 0;

      for (const tx of staleTxs) {
        if (!tx.providerTransactionId) {
          // No provider ID = failed to even initiate
          await db.update(mobileMoneyTransactions)
            .set({ status: "failed", failureReason: "Transaction timed out without provider confirmation", updatedAt: new Date() })
            .where(eq(mobileMoneyTransactions.id, tx.id));
          failed++;
          continue;
        }

        try {
          const statusResult = await resilientPost<Record<string, unknown>>(
            `reconcile-${tx.provider}`,
            `${MOBILE_MONEY_SERVICE_URL}/api/${tx.provider}/status`,
            { transaction_id: tx.providerTransactionId },
            { maxRetries: 1, timeoutMs: 10_000 },
          );

          const providerStatus = String(statusResult.status || "unknown");
          if (providerStatus === "completed" || providerStatus === "successful") {
            await db.update(mobileMoneyTransactions)
              .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
              .where(eq(mobileMoneyTransactions.id, tx.id));
            reconciled++;
          } else if (providerStatus === "failed" || providerStatus === "cancelled") {
            await db.update(mobileMoneyTransactions)
              .set({ status: "failed", failureReason: "Provider confirmed failure", updatedAt: new Date() })
              .where(eq(mobileMoneyTransactions.id, tx.id));
            failed++;
          }
        } catch (error) { logger.error("[Service] Operation failed", { error: error instanceof Error ? error.message : String(error) });
          // Skip, will retry next run
        }
      }

      logger.info(`[PaymentOrchestrator] Reconciled ${reconciled} completed, ${failed} failed of ${staleTxs.length} stale transactions`);
      return { checked: staleTxs.length, reconciled, failed, remaining: staleTxs.length - reconciled - failed };
    }),
});
