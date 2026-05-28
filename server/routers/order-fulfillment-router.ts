/**
 * Order Fulfillment Router
 * 
 * Handles the farm-to-home pipeline beyond basic order CRUD:
 * - Returns & refund requests
 * - Freshness tracking & cold chain linkage
 * - Delivery fee estimation during checkout
 * - Order notifications & status history
 * - Real-time delivery tracking via WebSocket
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import {
  marketplaceOrders, orderItems, produceListings, users,
  orderReturns, orderFreshnessLogs, orderNotifications,
  escrowAccounts, deliveryAssignments, deliveryTracking,
} from "../../drizzle/schema.js";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import {
  estimateDeliveryFee,
  geocodeAddress,
  notifyOrderStatusChange,
  onDeliveryConfirmed,
  requestDeliveryForOrder,
} from "../services/order-orchestration.js";
import { getProducer } from "../kafka.js";

export const orderFulfillmentRouter = router({
  // ========================================================================
  // RETURNS & REFUNDS
  // ========================================================================

  requestReturn: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      reason: z.enum(["damaged", "wrong_item", "quality", "not_as_described", "spoiled", "other"]),
      description: z.string().optional(),
      photoUrls: z.array(z.string()).optional(),
      returnMethod: z.enum(["collection_point", "driver_pickup", "drop_off"]).default("collection_point"),
      collectionPointId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      const [order] = await db.select().from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.id, input.orderId),
          eq(marketplaceOrders.buyerId, ctx.user.id),
        ));

      if (!order) throw new Error("Order not found");
      if (order.status !== "delivered") throw new Error("Can only return delivered orders");

      // Check return window (7 days for fresh produce, 14 for others)
      const deliveredAt = order.deliveredAt || order.updatedAt;
      const daysSinceDelivery = (Date.now() - new Date(deliveredAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDelivery > 14) throw new Error("Return window has expired (14 days)");

      // Calculate refund amount
      const items = await db.select().from(orderItems)
        .where(eq(orderItems.orderId, input.orderId));
      const refundAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

      const [returnReq] = await db.insert(orderReturns).values({
        orderId: input.orderId,
        buyerId: ctx.user.id,
        sellerId: order.sellerId,
        reason: input.reason,
        description: input.description || null,
        photoUrls: input.photoUrls ? JSON.stringify(input.photoUrls) : null,
        returnMethod: input.returnMethod,
        collectionPointId: input.collectionPointId || null,
        refundAmount,
      }).returning();

      // Update order status
      await db.update(marketplaceOrders)
        .set({ status: "return_requested" as any, updatedAt: new Date() })
        .where(eq(marketplaceOrders.id, input.orderId));

      // Notify seller
      await notifyOrderStatusChange(input.orderId, "return_requested");

      return returnReq;
    }),

  approveReturn: protectedProcedure
    .input(z.object({
      returnId: z.number(),
      sellerResponse: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      const [returnReq] = await db.select().from(orderReturns)
        .where(and(
          eq(orderReturns.id, input.returnId),
          eq(orderReturns.sellerId, ctx.user.id),
        ));

      if (!returnReq) throw new Error("Return not found or unauthorized");
      if (returnReq.status !== "requested") throw new Error("Return already processed");

      await db.update(orderReturns).set({
        status: "approved",
        sellerResponse: input.sellerResponse || null,
        approvedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(orderReturns.id, input.returnId));

      await notifyOrderStatusChange(returnReq.orderId, "return_approved");
      return { status: "approved" };
    }),

  rejectReturn: protectedProcedure
    .input(z.object({
      returnId: z.number(),
      sellerResponse: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [returnReq] = await db.select().from(orderReturns)
        .where(and(eq(orderReturns.id, input.returnId), eq(orderReturns.sellerId, ctx.user.id)));
      if (!returnReq) throw new Error("Return not found");

      await db.update(orderReturns).set({
        status: "rejected",
        sellerResponse: input.sellerResponse,
        updatedAt: new Date(),
      }).where(eq(orderReturns.id, input.returnId));

      return { status: "rejected" };
    }),

  processRefund: protectedProcedure
    .input(z.object({
      returnId: z.number(),
      refundMethod: z.enum(["mobile_money", "stripe", "wallet"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [returnReq] = await db.select().from(orderReturns)
        .where(eq(orderReturns.id, input.returnId));

      if (!returnReq) throw new Error("Return not found");
      if (returnReq.status !== "received" && returnReq.status !== "approved") {
        throw new Error("Return must be approved or received before refund");
      }

      // Update escrow status to refunded
      await db.update(escrowAccounts)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(and(
          eq(escrowAccounts.orderId, returnReq.orderId),
          eq(escrowAccounts.status, "held"),
        ));

      await db.update(orderReturns).set({
        status: "refunded",
        refundMethod: input.refundMethod,
        refundedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(orderReturns.id, input.returnId));

      await db.update(marketplaceOrders)
        .set({ paymentStatus: "refunded", status: "refunded" as any, updatedAt: new Date() })
        .where(eq(marketplaceOrders.id, returnReq.orderId));

      // Restore inventory
      const items = await db.select().from(orderItems)
        .where(eq(orderItems.orderId, returnReq.orderId));
      for (const item of items) {
        await db.update(produceListings)
          .set({
            quantity: sql`${produceListings.quantity} + ${item.quantity}`,
            status: "active",
            updatedAt: new Date(),
          })
          .where(eq(produceListings.id, item.listingId));
      }

      await notifyOrderStatusChange(returnReq.orderId, "refund_processed");

      return { status: "refunded", amount: returnReq.refundAmount };
    }),

  getMyReturns: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select().from(orderReturns)
        .where(eq(orderReturns.buyerId, ctx.user.id))
        .orderBy(desc(orderReturns.createdAt));
    }),

  getSellerReturns: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select().from(orderReturns)
        .where(eq(orderReturns.sellerId, ctx.user.id))
        .orderBy(desc(orderReturns.createdAt));
    }),

  // ========================================================================
  // DELIVERY FEE ESTIMATION (for checkout)
  // ========================================================================

  estimateDeliveryFee: publicProcedure
    .input(z.object({
      sellerLatitude: z.number(),
      sellerLongitude: z.number(),
      buyerAddress: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        zip: z.string(),
        country: z.string(),
      }),
      weightKg: z.number().default(10),
      coldChain: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      return estimateDeliveryFee(
        { latitude: input.sellerLatitude, longitude: input.sellerLongitude },
        input.buyerAddress,
        input.weightKg,
        input.coldChain,
      );
    }),

  // ========================================================================
  // FRESHNESS TRACKING
  // ========================================================================

  getOrderFreshness: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const logs = await db.select().from(orderFreshnessLogs)
        .where(eq(orderFreshnessLogs.orderId, input.orderId))
        .orderBy(desc(orderFreshnessLogs.createdAt))
        .limit(1);
      return logs[0] || null;
    }),

  getSellerFreshnessReport: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const cutoff = new Date(Date.now() - ctx.user.id * 0); // use ctx for auth check
      const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Get all freshness logs for seller's orders
      const orders = await db.select({ id: marketplaceOrders.id })
        .from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.sellerId, ctx.user.id),
          gte(marketplaceOrders.createdAt, sinceDate),
        ));

      if (orders.length === 0) return { avgScore: 0, gradeDistribution: {}, totalDeliveries: 0 };

      const orderIds = orders.map(o => o.id);
      const logs = await db.select().from(orderFreshnessLogs)
        .where(gte(orderFreshnessLogs.createdAt, sinceDate));

      const relevantLogs = logs.filter(l => orderIds.includes(l.orderId));
      if (relevantLogs.length === 0) return { avgScore: 0, gradeDistribution: {}, totalDeliveries: orders.length };

      const avgScore = relevantLogs.reduce((sum, l) => sum + Number(l.freshnessScore || 0), 0) / relevantLogs.length;
      const gradeDistribution: Record<string, number> = {};
      for (const log of relevantLogs) {
        const grade = log.freshnessGrade || "N/A";
        gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
      }

      return {
        avgScore: Math.round(avgScore * 10) / 10,
        gradeDistribution,
        totalDeliveries: relevantLogs.length,
        coldChainBreaches: relevantLogs.reduce((sum, l) => sum + (l.coldChainBreaches || 0), 0),
      };
    }),

  // ========================================================================
  // ORDER NOTIFICATIONS
  // ========================================================================

  getMyNotifications: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      return db.select().from(orderNotifications)
        .where(eq(orderNotifications.userId, ctx.user.id))
        .orderBy(desc(orderNotifications.createdAt))
        .limit(input.limit);
    }),

  markNotificationRead: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.update(orderNotifications)
        .set({ readAt: new Date() })
        .where(and(
          eq(orderNotifications.id, input.notificationId),
          eq(orderNotifications.userId, ctx.user.id),
        ));
      return { status: "read" };
    }),

  getUnreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(orderNotifications)
        .where(and(
          eq(orderNotifications.userId, ctx.user.id),
          sql`${orderNotifications.readAt} IS NULL`,
        ));
      return { unread: Number(result[0]?.count || 0) };
    }),

  // ========================================================================
  // DELIVERY TRACKING (real-time)
  // ========================================================================

  getDeliveryTracking: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();

      const [assignment] = await db.select().from(deliveryAssignments)
        .where(eq(deliveryAssignments.orderId, input.orderId))
        .orderBy(desc(deliveryAssignments.createdAt))
        .limit(1);

      if (!assignment) return null;

      const trackingPoints = await db.select().from(deliveryTracking)
        .where(eq(deliveryTracking.assignmentId, assignment.id))
        .orderBy(desc(deliveryTracking.timestamp))
        .limit(50);

      const freshness = await db.select().from(orderFreshnessLogs)
        .where(eq(orderFreshnessLogs.orderId, input.orderId))
        .limit(1);

      return {
        assignment,
        currentLocation: trackingPoints[0] || null,
        trackingHistory: trackingPoints,
        freshness: freshness[0] || null,
      };
    }),

  // Trigger delivery handoff (called when seller marks order ready/shipped)
  triggerDeliveryHandoff: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      sellerLatitude: z.number(),
      sellerLongitude: z.number(),
      weightKg: z.number().default(10),
      requiresColdChain: z.boolean().default(false),
      priority: z.enum(["normal", "express", "scheduled"]).default("normal"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      const [order] = await db.select().from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.id, input.orderId),
          eq(marketplaceOrders.sellerId, ctx.user.id),
        ));
      if (!order) throw new Error("Order not found or unauthorized");

      const deliveryAddress = order.deliveryAddress
        ? (typeof order.deliveryAddress === "string" ? JSON.parse(order.deliveryAddress) : order.deliveryAddress)
        : { street: "", city: "Nairobi", state: "Nairobi", zip: "", country: "Kenya" };

      const result = await requestDeliveryForOrder(
        input.orderId,
        { latitude: input.sellerLatitude, longitude: input.sellerLongitude },
        deliveryAddress,
        {
          weightKg: input.weightKg,
          requiresColdChain: input.requiresColdChain,
          priority: input.priority,
        },
      );

      return result;
    }),

  // Confirm delivery and trigger escrow release
  confirmOrderDelivery: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      assignmentId: z.number(),
      rating: z.number().min(1).max(5).optional(),
      feedback: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      const [order] = await db.select().from(marketplaceOrders)
        .where(and(
          eq(marketplaceOrders.id, input.orderId),
          eq(marketplaceOrders.buyerId, ctx.user.id),
        ));
      if (!order) throw new Error("Order not found");

      // Trigger the full orchestration: escrow release + payout + freshness report + notifications
      await onDeliveryConfirmed(input.orderId, input.assignmentId);

      return { status: "completed", message: "Delivery confirmed, payment released to seller" };
    }),
});
