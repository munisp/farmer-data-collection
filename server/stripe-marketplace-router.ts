import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base.js";
import Stripe from "stripe";
import { getDb } from "./db.js";
import { marketplaceOrders, orderItems } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Initialize Stripe only if API key is available
const stripeApiKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeApiKey ? new Stripe(stripeApiKey, {
  apiVersion: "2025-11-17.clover",
}) : null;

if (!stripe) {
  console.warn('[Stripe] No STRIPE_SECRET_KEY configured - payment features will be disabled');
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
});
