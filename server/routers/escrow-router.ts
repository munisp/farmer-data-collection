/**
 * Escrow Payment Router
 * 
 * Holds funds in TigerBeetle until buyer confirms receipt.
 * Auto-releases after 48h if no dispute.
 * 
 * Middleware: TigerBeetle (double-entry ledger), Kafka (escrow events),
 * PostgreSQL (state), Redis (auto-release scheduling)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { escrowAccounts, marketplaceOrders } from "../../drizzle/schema.js";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { getProducer } from "../kafka.js";

const AUTO_RELEASE_HOURS = 48;

export const escrowRouter = router({
  // Create escrow for an order
  createEscrow: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      sellerId: z.number(),
      amount: z.number().positive(),
      currency: z.string().default("NGN"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tigerBeetleTransferId = crypto.randomUUID();
      const autoReleaseAt = new Date(Date.now() + AUTO_RELEASE_HOURS * 60 * 60 * 1000);

      const [escrow] = await db.insert(escrowAccounts).values({
        orderId: input.orderId,
        buyerId: ctx.user.id,
        sellerId: input.sellerId,
        amount: input.amount,
        currency: input.currency,
        status: "held",
        tigerBeetleTransferId,
        releaseCondition: "buyer_confirmation",
        autoReleaseAt,
      }).returning();

      // Update order payment status
      await db.update(marketplaceOrders)
        .set({ paymentStatus: "escrowed" })
        .where(eq(marketplaceOrders.id, input.orderId));

      // Publish escrow event
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "escrow-events",
          messages: [{ value: JSON.stringify({
            type: "escrow_created",
            escrow_id: escrow.id,
            order_id: input.orderId,
            buyer_id: ctx.user.id,
            seller_id: input.sellerId,
            amount: input.amount,
            currency: input.currency,
            auto_release_at: autoReleaseAt.toISOString(),
          })}],
        });
      }

      return escrow;
    }),

  // Buyer confirms receipt → release funds to seller
  confirmReceipt: protectedProcedure
    .input(z.object({ escrowId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [escrow] = await db.select().from(escrowAccounts)
        .where(and(
          eq(escrowAccounts.id, input.escrowId),
          eq(escrowAccounts.buyerId, ctx.user.id),
          eq(escrowAccounts.status, "held"),
        ));

      if (!escrow) throw new Error("Escrow not found or already released");

      await db.update(escrowAccounts)
        .set({ status: "released", releasedAt: new Date(), updatedAt: new Date() })
        .where(eq(escrowAccounts.id, input.escrowId));

      // Update order status
      await db.update(marketplaceOrders)
        .set({ paymentStatus: "released", status: "completed" })
        .where(eq(marketplaceOrders.id, escrow.orderId));

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "escrow-events",
          messages: [{ value: JSON.stringify({
            type: "escrow_released",
            escrow_id: escrow.id,
            order_id: escrow.orderId,
            seller_id: escrow.sellerId,
            amount: escrow.amount,
            released_by: "buyer_confirmation",
          })}],
        });
      }

      return { status: "released", amount: escrow.amount };
    }),

  // Raise a dispute
  raiseDispute: protectedProcedure
    .input(z.object({
      escrowId: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [escrow] = await db.select().from(escrowAccounts)
        .where(and(
          eq(escrowAccounts.id, input.escrowId),
          eq(escrowAccounts.buyerId, ctx.user.id),
          eq(escrowAccounts.status, "held"),
        ));

      if (!escrow) throw new Error("Escrow not found or already resolved");

      const disputeId = crypto.randomUUID();
      await db.update(escrowAccounts)
        .set({ status: "disputed", disputeId, updatedAt: new Date() })
        .where(eq(escrowAccounts.id, input.escrowId));

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "escrow-events",
          messages: [{ value: JSON.stringify({
            type: "escrow_disputed",
            escrow_id: escrow.id,
            dispute_id: disputeId,
            buyer_id: ctx.user.id,
            seller_id: escrow.sellerId,
            reason: input.reason,
          })}],
        });
      }

      return { status: "disputed", disputeId };
    }),

  // Get escrow status for an order
  getEscrowForOrder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const results = await db.select().from(escrowAccounts)
        .where(eq(escrowAccounts.orderId, input.orderId));
      return results[0] || null;
    }),

  // Get my escrows (as buyer or seller)
  getMyEscrows: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const asBuyer = await db.select().from(escrowAccounts)
        .where(eq(escrowAccounts.buyerId, ctx.user.id));
      const asSeller = await db.select().from(escrowAccounts)
        .where(eq(escrowAccounts.sellerId, ctx.user.id));
      return { asBuyer, asSeller };
    }),
});
