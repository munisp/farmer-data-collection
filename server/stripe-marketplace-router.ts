import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base.js";
import Stripe from "stripe";
import { getDb } from "./db.js";
import { marketplaceOrders, orderItems } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { logger } from './logger.js';

// Initialize Stripe only if API key is available
const stripeApiKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeApiKey ? new Stripe(stripeApiKey, {
  apiVersion: "2026-02-25.clover",
}) : null;

if (!stripe) {
  logger.warn('[Stripe] No STRIPE_SECRET_KEY configured - payment features will be disabled');
}

export const stripeMarketplaceRouter = router({
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if Stripe is configured
      if (!stripe) {
        throw new Error("Payment processing is not configured. Please contact support.");
      }
      
      // Get order details
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const order = await db
        .select()
        .from(marketplaceOrders)
        .where(
          and(
            eq(marketplaceOrders.id, input.orderId),
            eq(marketplaceOrders.buyerId, ctx.user.id)
          )
        )
        .limit(1);

      if (!order || order.length === 0) {
        throw new Error("Order not found");
      }

      const orderData = order[0];

      // Get order items
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, input.orderId));

      if (!items || items.length === 0) {
        throw new Error("Order has no items");
      }

      // Create line items for Stripe
      const lineItems = items.map((item) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: item.productTitle,
            description: `${item.quantity} ${item.productUnit}`,
          },
          unit_amount: Math.round(item.pricePerUnit), // Already in cents
        },
        quantity: item.quantity,
      }));

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `${process.env.VITE_FRONTEND_URL || "http://localhost:3000"}/my-orders?payment=success&order=${orderData.orderNumber}`,
        cancel_url: `${process.env.VITE_FRONTEND_URL || "http://localhost:3000"}/checkout?payment=cancelled`,
        customer_email: ctx.user.email,
        client_reference_id: ctx.user.id.toString(),
        metadata: {
          user_id: ctx.user.id.toString(),
          order_id: input.orderId.toString(),
          order_number: orderData.orderNumber,
          customer_email: ctx.user.email,
          customer_name: `${ctx.user.firstName} ${ctx.user.lastName}`,
        },
        allow_promotion_codes: true,
      });

      return {
        sessionId: session.id,
        checkoutUrl: session.url,
      };
    }),

  getPaymentStatus: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database connection failed");
      const order = await db
        .select()
        .from(marketplaceOrders)
        .where(
          and(
            eq(marketplaceOrders.id, input.orderId),
            eq(marketplaceOrders.buyerId, ctx.user.id)
          )
        )
        .limit(1);

      if (!order || order.length === 0) {
        throw new Error("Order not found");
      }

      return {
        paymentStatus: order[0].paymentStatus,
        stripePaymentIntentId: order[0].stripePaymentIntentId,
      };
    }),

  confirmPayment: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!stripe) {
        throw new Error("Payment processing is not configured");
      }

      const session = await stripe.checkout.sessions.retrieve(input.sessionId);
      
      if (!session || session.status !== 'complete') {
        return { success: false, message: 'Payment not completed' };
      }

      const orderId = session.metadata?.order_id;
      if (!orderId) {
        throw new Error('Missing order_id in session metadata');
      }

      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      await db.update(marketplaceOrders)
        .set({
          paymentStatus: 'paid',
          stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(marketplaceOrders.id, parseInt(orderId, 10)),
            eq(marketplaceOrders.buyerId, ctx.user.id)
          )
        );

      return { success: true, message: 'Payment confirmed', orderId: parseInt(orderId, 10) };
    }),

  requestRefund: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!stripe) {
        throw new Error("Payment processing is not configured");
      }

      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const order = await db
        .select()
        .from(marketplaceOrders)
        .where(
          and(
            eq(marketplaceOrders.id, input.orderId),
            eq(marketplaceOrders.buyerId, ctx.user.id)
          )
        )
        .limit(1);

      if (!order || order.length === 0) {
        throw new Error("Order not found");
      }

      const orderData = order[0];
      if (orderData.paymentStatus !== 'paid') {
        throw new Error("Only paid orders can be refunded");
      }

      if (!orderData.stripePaymentIntentId) {
        throw new Error("No payment intent found for this order");
      }

      const refund = await stripe.refunds.create({
        payment_intent: orderData.stripePaymentIntentId,
        reason: 'requested_by_customer',
        metadata: {
          order_id: input.orderId.toString(),
          order_number: orderData.orderNumber,
          user_id: ctx.user.id.toString(),
          refund_reason: input.reason || 'customer_request',
        },
      });

      await db.update(marketplaceOrders)
        .set({
          paymentStatus: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(marketplaceOrders.id, input.orderId));

      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status,
      };
    }),

  createSellerPayout: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        sellerStripeAccountId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!stripe) {
        throw new Error("Payment processing is not configured");
      }

      const db = await getDb();
      if (!db) throw new Error("Database connection failed");

      const order = await db
        .select()
        .from(marketplaceOrders)
        .where(eq(marketplaceOrders.id, input.orderId))
        .limit(1);

      if (!order || order.length === 0) {
        throw new Error("Order not found");
      }

      const orderData = order[0];
      if (orderData.paymentStatus !== 'paid') {
        throw new Error("Order must be paid before payout");
      }

      // Get order items to calculate seller payout amount
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, input.orderId));

      const totalAmount = items.reduce((sum, item) => sum + (item.pricePerUnit * item.quantity), 0);
      const platformFee = Math.round(totalAmount * 0.05); // 5% platform fee
      const sellerAmount = totalAmount - platformFee;

      // Create transfer to connected seller account
      const transfer = await stripe.transfers.create({
        amount: sellerAmount,
        currency: 'usd',
        destination: input.sellerStripeAccountId,
        transfer_group: orderData.orderNumber,
        metadata: {
          order_id: input.orderId.toString(),
          order_number: orderData.orderNumber,
          platform_fee: platformFee.toString(),
        },
      });

      return {
        success: true,
        transferId: transfer.id,
        sellerAmount,
        platformFee,
        currency: 'usd',
      };
    }),
});
