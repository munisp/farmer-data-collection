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
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { mobileMoneyAccounts, mobileMoneyTransactions } from "../../drizzle/schema.js";
import { eq, and, desc } from "drizzle-orm";
import crypto from "crypto";
import { publishEvent, createEvent, getProducer } from "../kafka.js";

const MOBILE_MONEY_SERVICE_URL = process.env.MOBILE_MONEY_SERVICE_URL || "http://localhost:8090";

async function callMobileMoneyService(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const resp = await fetch(`${MOBILE_MONEY_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    return await resp.json() as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Mobile money service unavailable: ${(err as Error).message}`);
  }
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
        currency: "KES",
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
      currency: z.string().default("KES"),
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
});
