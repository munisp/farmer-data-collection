/**
 * Mobile Money tRPC Router
 * 
 * Integrates with Go mobile-money-service for M-Pesa, MTN MoMo, Airtel Money, Flutterwave.
 * Manages mobile money accounts, STK push, disbursements, and transaction status.
 * 
 * Middleware: Kafka (transaction events), TigerBeetle (ledger), Redis (idempotency),
 * PostgreSQL (transaction records), Permify (authorization)
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { mobileMoneyAccounts, mobileMoneyTransactions } from "../../drizzle/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import crypto from "crypto";
import { publishEvent, createEvent, getProducer } from "../kafka.js";
import { logger } from "../logger.js";
import { resilientPost } from "../services/resilient-http.js";

const MOBILE_MONEY_SERVICE_URL = process.env.MOBILE_MONEY_SERVICE_URL || "http://localhost:8090";

async function callMobileMoneyService(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return resilientPost<Record<string, unknown>>(
    "mobile-money-service",
    `${MOBILE_MONEY_SERVICE_URL}${path}`,
    body,
    { maxRetries: 2, timeoutMs: 30_000 },
  );
}

export const mobileMoneyRouter = router({
  // Account management
  linkAccount: protectedProcedure
    .input(z.object({
      provider: z.enum(["mpesa", "mtn_momo", "airtel_money", "orange_money"]),
      phoneNumber: z.string().min(10).max(15),
      accountName: z.string().optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const userId = ctx.user.id;
      
      // If setting as default, unset any existing default
      if (input.isDefault) {
        await db.update(mobileMoneyAccounts)
          .set({ isDefault: false })
          .where(eq(mobileMoneyAccounts.userId, userId));
      }

      const [account] = await db.insert(mobileMoneyAccounts).values({
        userId,
        provider: input.provider,
        phoneNumber: input.phoneNumber,
        accountName: input.accountName || null,
        isDefault: input.isDefault ?? false,
        verified: false,
      }).returning();

      return account;
    }),

  getAccounts: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select().from(mobileMoneyAccounts)
        .where(eq(mobileMoneyAccounts.userId, ctx.user.id));
    }),

  // M-Pesa STK Push (Lipa Na M-Pesa)
  initiateSTKPush: protectedProcedure
    .input(z.object({
      phoneNumber: z.string().min(10),
      amount: z.number().positive(),
      orderId: z.number().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const txId = crypto.randomUUID();
      
      // Record transaction in DB
      const [tx] = await db.insert(mobileMoneyTransactions).values({
        userId: ctx.user.id,
        provider: "mpesa",
        transactionType: "stk_push",
        amount: input.amount,
        currency: "NGN",
        phoneNumber: input.phoneNumber,
        orderId: input.orderId ?? null,
        status: "pending",
        metadata: JSON.stringify({ description: input.description }),
      }).returning();

      // Call Go service
      const result = await callMobileMoneyService("/api/mpesa/stk-push", {
        phone_number: input.phoneNumber,
        amount: input.amount,
        account_ref: `ORD-${input.orderId || txId.slice(0, 8)}`,
        transaction_desc: input.description || "Farm Platform Payment",
        order_id: input.orderId || 0,
        user_id: ctx.user.id,
      });

      // Update with checkout ID
      if (result.CheckoutRequestID) {
        await db.update(mobileMoneyTransactions)
          .set({ 
            providerTransactionId: result.CheckoutRequestID as string,
            status: "processing",
          })
          .where(eq(mobileMoneyTransactions.id, tx.id));
      }

      // Publish event
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "mobile-money-events",
          messages: [{ value: JSON.stringify({
            type: "stk_push_initiated",
            transaction_id: tx.id,
            user_id: ctx.user.id,
            amount: input.amount,
            provider: "mpesa",
          })}],
        });
      }

      return { transactionId: tx.id, ...result };
    }),

  // MTN MoMo Payment Request
  initiateMTNPayment: protectedProcedure
    .input(z.object({
      phoneNumber: z.string().min(10),
      amount: z.number().positive(),
      currency: z.enum(["UGX", "GHS", "EUR", "XOF", "XAF"]).default("UGX"),
      orderId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const externalId = crypto.randomUUID();

      const [tx] = await db.insert(mobileMoneyTransactions).values({
        userId: ctx.user.id,
        provider: "mtn_momo",
        transactionType: "collection",
        amount: input.amount,
        currency: input.currency,
        phoneNumber: input.phoneNumber,
        orderId: input.orderId ?? null,
        status: "pending",
      }).returning();

      const result = await callMobileMoneyService("/api/mtn/request-payment", {
        phone_number: input.phoneNumber,
        amount: input.amount,
        currency: input.currency,
        external_id: externalId,
        order_id: input.orderId || 0,
        user_id: ctx.user.id,
      });

      if (result.reference_id) {
        await db.update(mobileMoneyTransactions)
          .set({ providerTransactionId: result.reference_id as string, status: "processing" })
          .where(eq(mobileMoneyTransactions.id, tx.id));
      }

      return { transactionId: tx.id, referenceId: result.reference_id };
    }),

  // Disbursement (pay sellers, loan disbursements)
  disburse: protectedProcedure
    .input(z.object({
      provider: z.enum(["mpesa", "mtn_momo", "airtel_money"]),
      phoneNumber: z.string().min(10),
      amount: z.number().positive(),
      currency: z.string().default("NGN"),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const externalId = crypto.randomUUID();

      const [tx] = await db.insert(mobileMoneyTransactions).values({
        userId: ctx.user.id,
        provider: input.provider,
        transactionType: "disbursement",
        amount: input.amount,
        currency: input.currency,
        phoneNumber: input.phoneNumber,
        status: "pending",
        metadata: JSON.stringify({ reason: input.reason }),
      }).returning();

      let result: Record<string, unknown>;
      if (input.provider === "mpesa") {
        result = await callMobileMoneyService("/api/mpesa/stk-push", {
          phone_number: input.phoneNumber,
          amount: input.amount,
          account_ref: `DISB-${tx.id}`,
          transaction_desc: input.reason || "Farm Platform Disbursement",
        });
      } else {
        result = await callMobileMoneyService("/api/mtn/disburse", {
          phone_number: input.phoneNumber,
          amount: input.amount,
          currency: input.currency,
          external_id: externalId,
        });
      }

      return { transactionId: tx.id, ...result };
    }),

  // Transaction history
  getTransactions: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      return db.select().from(mobileMoneyTransactions)
        .where(eq(mobileMoneyTransactions.userId, ctx.user.id))
        .orderBy(desc(mobileMoneyTransactions.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // Check transaction status
  getTransactionStatus: protectedProcedure
    .input(z.object({ transactionId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const [tx] = await db.select().from(mobileMoneyTransactions)
        .where(and(
          eq(mobileMoneyTransactions.id, input.transactionId),
          eq(mobileMoneyTransactions.userId, ctx.user.id),
        ));
      return tx || null;
    }),

  // ============================================================================
  // Gap #10: Webhook/Callback Handling for Async Payment Confirmation
  // ============================================================================

  /**
   * M-Pesa callback handler. Called by Safaricom after STK push completes.
   * Validates callback, updates transaction status, triggers downstream events.
   */
  mpesaCallback: publicProcedure
    .input(z.object({
      Body: z.object({
        stkCallback: z.object({
          MerchantRequestID: z.string(),
          CheckoutRequestID: z.string(),
          ResultCode: z.number(),
          ResultDesc: z.string(),
          CallbackMetadata: z.object({
            Item: z.array(z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional(),
            })),
          }).optional(),
        }),
      }),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const callback = input.Body.stkCallback;
      const checkoutId = callback.CheckoutRequestID;

      // Find the transaction by provider transaction ID
      const [tx] = await db.select().from(mobileMoneyTransactions)
        .where(eq(mobileMoneyTransactions.providerTransactionId, checkoutId));

      if (!tx) {
        return { ResultCode: 1, ResultDesc: "Transaction not found" };
      }

      const isSuccess = callback.ResultCode === 0;

      // Extract metadata from callback
      let mpesaReceiptNumber = "";
      let transactionDate = "";
      let phoneNumber = "";
      if (callback.CallbackMetadata?.Item) {
        for (const item of callback.CallbackMetadata.Item) {
          if (item.Name === "MpesaReceiptNumber") mpesaReceiptNumber = String(item.Value || "");
          if (item.Name === "TransactionDate") transactionDate = String(item.Value || "");
          if (item.Name === "PhoneNumber") phoneNumber = String(item.Value || "");
        }
      }

      // Update transaction status
      await db.update(mobileMoneyTransactions)
        .set({
          status: isSuccess ? "completed" : "failed",
          providerTransactionId: mpesaReceiptNumber || checkoutId,
          completedAt: isSuccess ? new Date() : null,
          failureReason: isSuccess ? null : callback.ResultDesc,
          metadata: JSON.stringify({
            mpesaReceiptNumber,
            transactionDate,
            phoneNumber,
            resultCode: callback.ResultCode,
            resultDesc: callback.ResultDesc,
          }),
          updatedAt: new Date(),
        })
        .where(eq(mobileMoneyTransactions.id, tx.id));

      // Publish event for downstream processing
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "mobile-money-events",
          messages: [{ value: JSON.stringify({
            type: isSuccess ? "payment_confirmed" : "payment_failed",
            transaction_id: tx.id,
            user_id: tx.userId,
            amount: tx.amount,
            provider: "mpesa",
            receipt_number: mpesaReceiptNumber,
            order_id: tx.orderId,
          })}],
        });
      }

      return { ResultCode: 0, ResultDesc: "Callback processed" };
    }),

  /**
   * MTN MoMo callback handler.
   */
  mtnCallback: publicProcedure
    .input(z.object({
      referenceId: z.string(),
      status: z.enum(["SUCCESSFUL", "FAILED", "PENDING"]),
      reason: z.string().optional(),
      financialTransactionId: z.string().optional(),
      externalId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();

      // Find transaction by external ID or provider ref
      const txQuery = input.externalId
        ? eq(mobileMoneyTransactions.providerTransactionId, input.externalId)
        : eq(mobileMoneyTransactions.providerTransactionId, input.referenceId);

      const [tx] = await db.select().from(mobileMoneyTransactions).where(txQuery);
      if (!tx) return { status: "not_found" };

      const isSuccess = input.status === "SUCCESSFUL";

      await db.update(mobileMoneyTransactions)
        .set({
          status: isSuccess ? "completed" : input.status === "PENDING" ? "processing" : "failed",
          providerTransactionId: input.financialTransactionId || tx.providerTransactionId,
          completedAt: isSuccess ? new Date() : null,
          failureReason: isSuccess ? null : input.reason,
          updatedAt: new Date(),
        })
        .where(eq(mobileMoneyTransactions.id, tx.id));

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "mobile-money-events",
          messages: [{ value: JSON.stringify({
            type: isSuccess ? "payment_confirmed" : "payment_failed",
            transaction_id: tx.id,
            user_id: tx.userId,
            amount: tx.amount,
            provider: "mtn_momo",
            financial_transaction_id: input.financialTransactionId,
          })}],
        });
      }

      return { status: "processed" };
    }),

  // ============================================================================
  // Gap #2: Payment Reconciliation
  // ============================================================================

  /**
   * Reconcile local transactions against provider records.
   * Identifies mismatches between local DB status and actual payment status.
   */
  reconcileTransactions: protectedProcedure
    .input(z.object({
      provider: z.enum(["mpesa", "mtn_momo", "airtel_money"]).optional(),
      dateFrom: z.string(),
      dateTo: z.string(),
      autoFix: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new Error("Only admins can run reconciliation");
      const db = await requireDb();

      const fromDate = new Date(input.dateFrom);
      const toDate = new Date(input.dateTo);

      // Get all transactions in date range
      const conditions = [
        sql`${mobileMoneyTransactions.createdAt} >= ${fromDate}`,
        sql`${mobileMoneyTransactions.createdAt} <= ${toDate}`,
      ];
      if (input.provider) {
        conditions.push(eq(mobileMoneyTransactions.provider, input.provider));
      }

      const transactions = await db.select().from(mobileMoneyTransactions)
        .where(and(...conditions));

      const reconciliation = {
        total: transactions.length,
        matched: 0,
        mismatched: 0,
        pending: 0,
        stale: 0,
        fixed: 0,
        totalAmount: 0,
        matchedAmount: 0,
        details: [] as Array<{
          id: number;
          localStatus: string;
          providerStatus: string;
          amount: number;
          issue: string;
        }>,
      };

      for (const tx of transactions) {
        reconciliation.totalAmount += tx.amount;

        if (tx.status === "completed") {
          reconciliation.matched++;
          reconciliation.matchedAmount += tx.amount;
          continue;
        }

        if (tx.status === "pending" || tx.status === "processing") {
          // Check if transaction is stale (>1 hour old and still pending)
          const ageMs = Date.now() - new Date(tx.createdAt).getTime();
          if (ageMs > 3600000) {
            reconciliation.stale++;
            reconciliation.details.push({
              id: tx.id,
              localStatus: tx.status,
              providerStatus: "unknown",
              amount: tx.amount,
              issue: `Stale ${tx.status} transaction (${Math.round(ageMs / 3600000)}h old)`,
            });

            // Auto-fix stale transactions by querying provider
            if (input.autoFix && tx.providerTransactionId) {
              try {
                const providerPath = tx.provider === "mpesa"
                  ? `/api/mpesa/query/${tx.providerTransactionId}`
                  : `/api/mtn/status/${tx.providerTransactionId}`;
                const result = await callMobileMoneyService(providerPath, {});
                const providerStatus = result.status as string;
                if (providerStatus === "completed" || providerStatus === "SUCCESSFUL") {
                  await db.update(mobileMoneyTransactions)
                    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
                    .where(eq(mobileMoneyTransactions.id, tx.id));
                  reconciliation.fixed++;
                } else if (providerStatus === "failed" || providerStatus === "FAILED") {
                  await db.update(mobileMoneyTransactions)
                    .set({ status: "failed", failureReason: "Reconciliation: provider confirmed failure", updatedAt: new Date() })
                    .where(eq(mobileMoneyTransactions.id, tx.id));
                  reconciliation.fixed++;
                }
              } catch (error) { logger.error("[Service] Operation failed", { error: error instanceof Error ? error.message : String(error) });
                // Provider query failed — skip
              }
            }
          } else {
            reconciliation.pending++;
          }
          continue;
        }

        if (tx.status === "failed") {
          reconciliation.mismatched++;
          reconciliation.details.push({
            id: tx.id,
            localStatus: tx.status,
            providerStatus: "failed",
            amount: tx.amount,
            issue: tx.failureReason || "Failed transaction",
          });
        }
      }

      return {
        ...reconciliation,
        reconciliationRate: reconciliation.total > 0
          ? Math.round((reconciliation.matched / reconciliation.total) * 100)
          : 100,
        runAt: new Date().toISOString(),
        dateRange: { from: input.dateFrom, to: input.dateTo },
      };
    }),

  /**
   * Get balance inquiry from provider.
   */
  getBalance: protectedProcedure
    .input(z.object({
      provider: z.enum(["mpesa", "mtn_momo", "airtel_money"]),
    }))
    .query(async ({ input }) => {
      try {
        const path = input.provider === "mpesa"
          ? "/api/mpesa/balance"
          : `/api/${input.provider.replace("_", "/")}/balance`;
        const result = await callMobileMoneyService(path, {});
        return {
          provider: input.provider,
          balance: result.balance as number || 0,
          currency: result.currency as string || "NGN",
          lastUpdated: new Date().toISOString(),
        };
      } catch (error) { logger.error("[Service] Operation failed", { error: error instanceof Error ? error.message : String(error) });
        return {
          provider: input.provider,
          balance: 0,
          currency: "NGN",
          error: "Balance inquiry unavailable",
        };
      }
    }),

  /**
   * Commission/fee calculation with dynamic rates.
   */
  calculateFees: publicProcedure
    .input(z.object({
      amount: z.number().positive(),
      provider: z.enum(["mpesa", "mtn_momo", "airtel_money"]),
      transactionType: z.enum(["collection", "disbursement", "transfer"]),
    }))
    .query(({ input }) => {
      // Fee schedule by provider and tier
      const feeSchedule: Record<string, Array<{ maxAmount: number; rate: number; flatFee: number }>> = {
        mpesa: [
          { maxAmount: 500, rate: 0, flatFee: 0 },
          { maxAmount: 2500, rate: 0.011, flatFee: 15 },
          { maxAmount: 10000, rate: 0.011, flatFee: 33 },
          { maxAmount: 50000, rate: 0.011, flatFee: 56 },
          { maxAmount: 150000, rate: 0.011, flatFee: 77 },
          { maxAmount: Infinity, rate: 0.011, flatFee: 105 },
        ],
        mtn_momo: [
          { maxAmount: 500, rate: 0, flatFee: 0 },
          { maxAmount: 5000, rate: 0.015, flatFee: 10 },
          { maxAmount: 25000, rate: 0.015, flatFee: 25 },
          { maxAmount: Infinity, rate: 0.015, flatFee: 50 },
        ],
        airtel_money: [
          { maxAmount: 1000, rate: 0, flatFee: 0 },
          { maxAmount: 10000, rate: 0.012, flatFee: 20 },
          { maxAmount: Infinity, rate: 0.012, flatFee: 40 },
        ],
      };

      const schedule = feeSchedule[input.provider] || feeSchedule["mpesa"];
      const tier = schedule.find(t => input.amount <= t.maxAmount) || schedule[schedule.length - 1];

      const percentageFee = Math.round(input.amount * tier.rate);
      const totalFee = percentageFee + tier.flatFee;

      // Platform commission on top of provider fees
      const platformCommission = input.transactionType === "collection"
        ? Math.round(input.amount * 0.015)  // 1.5% on collections
        : Math.round(input.amount * 0.01);   // 1.0% on disbursements

      return {
        amount: input.amount,
        provider: input.provider,
        providerFee: totalFee,
        platformCommission,
        totalFees: totalFee + platformCommission,
        netAmount: input.amount - totalFee - platformCommission,
        feeBreakdown: {
          percentageFee,
          flatFee: tier.flatFee,
          platformRate: input.transactionType === "collection" ? "1.5%" : "1.0%",
        },
      };
    }),

  // Airtel Money integration
  initiateAirtelPayment: protectedProcedure
    .input(z.object({
      phoneNumber: z.string().regex(/^\+\d{10,13}$/),
      amount: z.number().positive().max(500000),
      currency: z.enum(["KES", "UGX", "TZS", "NGN"]),
      reference: z.string().min(1).max(50),
      transactionType: z.enum(["collection", "disbursement"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      // Generate unique transaction ID
      const transactionId = `AIRTEL-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Country code mapping
      const countryMap: Record<string, string> = {
        KES: "KE",
        UGX: "UG",
        TZS: "TZ",
        NGN: "NG",
      };

      try {
        // In production, this would call Airtel Money API
        // POST /merchant/v2/payments for collections
        // POST /standard/v2/disbursements for disbursements
        const payload = {
          reference: input.reference,
          subscriber: {
            country: countryMap[input.currency],
            currency: input.currency,
            msisdn: input.phoneNumber.replace(/^\+/, ""),
          },
          transaction: {
            amount: input.amount,
            country: countryMap[input.currency],
            currency: input.currency,
            id: transactionId,
          },
        };

        // Record transaction in database
        await db.insert(mobileMoneyTransactions).values({
          userId: ctx.user.id,
          provider: "airtel",
          providerTransactionId: transactionId,
          phoneNumber: input.phoneNumber,
          amount: input.amount,
          currency: input.currency,
          transactionType: input.transactionType,
          status: "pending",
          metadata: JSON.stringify(payload),
        });

        // Publish event for async processing
        await publishEvent("payment-events", createEvent(
          "airtel.payment.initiated",
          "mobile_money_transaction",
          transactionId,
          ctx.user.id,
          { amount: input.amount, currency: input.currency, provider: "airtel" }
        ));

        return {
          success: true,
          transactionId,
          provider: "airtel",
          status: "pending",
          message: input.transactionType === "collection"
            ? "Payment request sent. Customer will receive a prompt on their phone."
            : "Disbursement initiated. Funds will be credited within 30 seconds.",
          estimatedCompletion: "30 seconds",
          callbackUrl: `${process.env.BASE_URL || ""}/api/webhooks/airtel`,
        };
      } catch (error) {
        logger.error("[Service] Operation failed", { error: error instanceof Error ? error.message : String(error) });
        throw new Error("Failed to initiate Airtel Money payment");
      }
    }),

  // Airtel Money webhook handler
  handleAirtelCallback: publicProcedure
    .input(z.object({
      transaction: z.object({
        id: z.string(),
        status_code: z.string(),
        message: z.string(),
        airtel_money_id: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();

      const statusMap: Record<string, string> = {
        TS: "completed",    // Transaction Successful
        TF: "failed",       // Transaction Failed
        TA: "ambiguous",    // Transaction Ambiguous (needs reconciliation)
        TIP: "pending",     // Transaction In Progress
      };

      const newStatus = statusMap[input.transaction.status_code] || "unknown";

      await db.update(mobileMoneyTransactions)
        .set({
          status: newStatus,
          providerTransactionId: input.transaction.airtel_money_id || null,
          completedAt: newStatus === "completed" ? new Date() : null,
          metadata: JSON.stringify(input.transaction),
        })
        .where(eq(mobileMoneyTransactions.providerTransactionId, input.transaction.id));

      return {
        acknowledged: true,
        transactionId: input.transaction.id,
        status: newStatus,
      };
    }),
});
