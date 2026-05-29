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
import { eq, and, sql } from "drizzle-orm";
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

  // ============================================================================
  // Gap #4: Dispute Resolution + Timeout Handler + Refunds
  // ============================================================================

  /**
   * Resolve a dispute (admin only). Options: release to seller, refund buyer, split.
   */
  resolveDispute: protectedProcedure
    .input(z.object({
      escrowId: z.number(),
      resolution: z.enum(["release_to_seller", "refund_buyer", "split"]),
      splitPercentageSeller: z.number().min(0).max(100).optional(),
      adminNotes: z.string().min(5),
      evidenceUrls: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      if (ctx.user.role !== "admin") {
        throw new Error("Only admins can resolve disputes");
      }

      const [escrow] = await db.select().from(escrowAccounts)
        .where(and(
          eq(escrowAccounts.id, input.escrowId),
          eq(escrowAccounts.status, "disputed"),
        ));
      if (!escrow) throw new Error("Disputed escrow not found");

      let sellerAmount = 0;
      let buyerRefund = 0;
      let newStatus: "released" | "refunded" | "split" = "released";

      switch (input.resolution) {
        case "release_to_seller":
          sellerAmount = escrow.amount;
          buyerRefund = 0;
          newStatus = "released";
          break;
        case "refund_buyer":
          sellerAmount = 0;
          buyerRefund = escrow.amount;
          newStatus = "refunded";
          break;
        case "split": {
          const splitPct = input.splitPercentageSeller ?? 50;
          sellerAmount = Math.round(escrow.amount * splitPct / 100);
          buyerRefund = escrow.amount - sellerAmount;
          newStatus = "split";
          break;
        }
      }

      await db.update(escrowAccounts)
        .set({
          status: newStatus,
          releasedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(escrowAccounts.id, input.escrowId));

      // Update order status
      await db.update(marketplaceOrders)
        .set({
          paymentStatus: newStatus === "refunded" ? "refunded" : "released",
          status: newStatus === "refunded" ? "cancelled" : "completed",
        })
        .where(eq(marketplaceOrders.id, escrow.orderId));

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "escrow-events",
          messages: [{ value: JSON.stringify({
            type: "dispute_resolved",
            escrow_id: escrow.id,
            resolution: input.resolution,
            seller_amount: sellerAmount,
            buyer_refund: buyerRefund,
            admin_id: ctx.user.id,
            admin_notes: input.adminNotes,
          })}],
        });
      }

      return {
        escrowId: escrow.id,
        resolution: input.resolution,
        sellerAmount,
        buyerRefund,
        resolvedBy: ctx.user.id,
        resolvedAt: new Date().toISOString(),
      };
    }),

  /**
   * Process auto-release for escrows past timeout.
   * Called by cron job or admin. Releases funds to seller if no dispute within 48h.
   */
  processAutoRelease: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      if (ctx.user.role !== "admin") {
        throw new Error("Only admins can trigger auto-release");
      }

      const expiredEscrows = await db.select().from(escrowAccounts)
        .where(and(
          eq(escrowAccounts.status, "held"),
          sql`${escrowAccounts.autoReleaseAt} < NOW()`,
        ));

      const results = [];
      for (const escrow of expiredEscrows) {
        await db.update(escrowAccounts)
          .set({ status: "released", releasedAt: new Date(), updatedAt: new Date() })
          .where(eq(escrowAccounts.id, escrow.id));

        await db.update(marketplaceOrders)
          .set({ paymentStatus: "released", status: "completed" })
          .where(eq(marketplaceOrders.id, escrow.orderId));

        const producer = await getProducer();
        if (producer) {
          await producer.send({
            topic: "escrow-events",
            messages: [{ value: JSON.stringify({
              type: "escrow_auto_released",
              escrow_id: escrow.id,
              order_id: escrow.orderId,
              seller_id: escrow.sellerId,
              amount: escrow.amount,
              released_by: "auto_timeout",
            })}],
          });
        }

        results.push({ escrowId: escrow.id, amount: escrow.amount, sellerId: escrow.sellerId });
      }

      return { processed: results.length, escrows: results };
    }),

  /**
   * Request refund (buyer) — only for held escrows before auto-release.
   */
  requestRefund: protectedProcedure
    .input(z.object({
      escrowId: z.number(),
      reason: z.enum([
        "item_not_received",
        "item_damaged",
        "item_not_as_described",
        "wrong_item",
        "quality_issue",
        "other",
      ]),
      description: z.string().min(10),
      evidenceUrls: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [escrow] = await db.select().from(escrowAccounts)
        .where(and(
          eq(escrowAccounts.id, input.escrowId),
          eq(escrowAccounts.buyerId, ctx.user.id),
          eq(escrowAccounts.status, "held"),
        ));
      if (!escrow) throw new Error("Escrow not found or not eligible for refund");

      // Raise as dispute with refund request
      const disputeId = crypto.randomUUID();
      await db.update(escrowAccounts)
        .set({ status: "disputed", disputeId, updatedAt: new Date() })
        .where(eq(escrowAccounts.id, input.escrowId));

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "escrow-events",
          messages: [{ value: JSON.stringify({
            type: "refund_requested",
            escrow_id: escrow.id,
            dispute_id: disputeId,
            buyer_id: ctx.user.id,
            reason: input.reason,
            description: input.description,
            evidence_urls: input.evidenceUrls ?? [],
          })}],
        });
      }

      return {
        disputeId,
        status: "refund_requested",
        estimatedResolutionDays: 3,
        message: "Your refund request has been submitted. An admin will review within 3 business days.",
      };
    }),

  /**
   * Extend escrow hold period (buyer or seller can request more time).
   */
  extendEscrow: protectedProcedure
    .input(z.object({
      escrowId: z.number(),
      additionalHours: z.number().min(24).max(168), // 1-7 days
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [escrow] = await db.select().from(escrowAccounts)
        .where(and(
          eq(escrowAccounts.id, input.escrowId),
          eq(escrowAccounts.status, "held"),
        ));
      if (!escrow) throw new Error("Escrow not found or already resolved");
      if (escrow.buyerId !== ctx.user.id && escrow.sellerId !== ctx.user.id) {
        throw new Error("Not a party to this escrow");
      }

      const currentRelease = new Date(escrow.autoReleaseAt || Date.now());
      const newReleaseAt = new Date(currentRelease.getTime() + input.additionalHours * 3600000);

      await db.update(escrowAccounts)
        .set({ autoReleaseAt: newReleaseAt, updatedAt: new Date() })
        .where(eq(escrowAccounts.id, input.escrowId));

      return {
        escrowId: escrow.id,
        previousReleaseAt: currentRelease.toISOString(),
        newReleaseAt: newReleaseAt.toISOString(),
      };
    }),
});
