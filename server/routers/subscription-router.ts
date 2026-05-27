/**
 * Subscription Boxes & Standing Orders Router
 * 
 * Weekly/biweekly produce subscriptions for consumers.
 * Contract farming standing orders for retail buyers.
 * 
 * Middleware: Kafka (order events), Redis (scheduling cache),
 * PostgreSQL (subscription state), Temporal (recurring workflow)
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { subscriptionPlans, subscriptions, standingOrders, supplyContracts } from "../../drizzle/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { getProducer } from "../kafka.js";

export const subscriptionRouter = router({
  // ============================================================================
  // Subscription Plans (for consumers)
  // ============================================================================

  listPlans: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      active: z.boolean().default(true),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.active, input.active));
    }),

  createPlan: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string(),
      category: z.string(), // vegetables, fruits, mixed, organic
      items: z.array(z.object({
        crop: z.string(),
        quantityKg: z.number(),
      })),
      pricePerDelivery: z.number().positive(),
      currency: z.string().default("KES"),
      frequency: z.enum(["weekly", "biweekly", "monthly"]),
      maxSubscribers: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [plan] = await db.insert(subscriptionPlans).values({
        name: input.name,
        description: input.description,
        category: input.category,
        items: JSON.stringify(input.items),
        pricePerDelivery: input.pricePerDelivery,
        currency: input.currency,
        frequency: input.frequency,
        maxSubscribers: input.maxSubscribers || null,
      }).returning();
      return plan;
    }),

  // ============================================================================
  // Consumer Subscriptions
  // ============================================================================

  subscribe: protectedProcedure
    .input(z.object({
      planId: z.number(),
      deliveryAddress: z.object({
        street: z.string(),
        city: z.string(),
        latitude: z.number(),
        longitude: z.number(),
      }),
      startDate: z.string(),
      paymentMethod: z.enum(["mpesa", "mtn_momo", "card"]).default("mpesa"),
      preferences: z.object({
        noDislikes: z.array(z.string()).optional(),
        organicOnly: z.boolean().optional(),
        extraFruits: z.boolean().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [plan] = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, input.planId));
      if (!plan) throw new Error("Plan not found");

      const [sub] = await db.insert(subscriptions).values({
        userId: ctx.user.id,
        planId: input.planId,
        deliveryAddress: JSON.stringify(input.deliveryAddress),
        startDate: new Date(input.startDate),
        paymentMethod: input.paymentMethod,
        preferences: input.preferences ? JSON.stringify(input.preferences) : null,
        status: "active",
      }).returning();

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "subscription-events",
          messages: [{ value: JSON.stringify({
            type: "subscription_created",
            subscription_id: sub.id,
            user_id: ctx.user.id,
            plan_id: input.planId,
          })}],
        });
      }

      return sub;
    }),

  getMySubscriptions: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select().from(subscriptions)
        .where(eq(subscriptions.userId, ctx.user.id))
        .orderBy(desc(subscriptions.createdAt));
    }),

  pauseSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.update(subscriptions)
        .set({ status: "paused", updatedAt: new Date() })
        .where(and(
          eq(subscriptions.id, input.subscriptionId),
          eq(subscriptions.userId, ctx.user.id),
        ));
      return { status: "paused" };
    }),

  resumeSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.update(subscriptions)
        .set({ status: "active", updatedAt: new Date() })
        .where(and(
          eq(subscriptions.id, input.subscriptionId),
          eq(subscriptions.userId, ctx.user.id),
        ));
      return { status: "active" };
    }),

  cancelSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.update(subscriptions)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(subscriptions.id, input.subscriptionId),
          eq(subscriptions.userId, ctx.user.id),
        ));
      return { status: "cancelled" };
    }),

  // ============================================================================
  // Standing Orders (B2B — retail buyers)
  // ============================================================================

  createStandingOrder: protectedProcedure
    .input(z.object({
      cropType: z.string(),
      quantityKg: z.number().positive(),
      frequency: z.enum(["daily", "twice_weekly", "weekly", "biweekly", "monthly"]),
      deliveryDay: z.string().optional(),
      deliveryTime: z.string().optional(),
      maxPricePerKg: z.number().positive().optional(),
      minGrade: z.enum(["A", "B", "C"]).default("B"),
      deliveryAddress: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      startDate: z.string(),
      endDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [order] = await db.insert(standingOrders).values({
        buyerId: ctx.user.id,
        cropType: input.cropType,
        quantityKg: input.quantityKg,
        frequency: input.frequency,
        deliveryDay: input.deliveryDay || null,
        deliveryTime: input.deliveryTime || null,
        maxPricePerKg: input.maxPricePerKg || null,
        minGrade: input.minGrade,
        deliveryAddress: input.deliveryAddress,
        deliveryLatitude: String(input.latitude),
        deliveryLongitude: String(input.longitude),
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        status: "active",
      }).returning();
      return order;
    }),

  getStandingOrders: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select().from(standingOrders)
        .where(eq(standingOrders.buyerId, ctx.user.id))
        .orderBy(desc(standingOrders.createdAt));
    }),

  // ============================================================================
  // Supply Contracts (farmer-buyer agreements)
  // ============================================================================

  createContract: protectedProcedure
    .input(z.object({
      buyerId: z.number(),
      cropType: z.string(),
      totalQuantityKg: z.number().positive(),
      pricePerKg: z.number().positive(),
      currency: z.string().default("KES"),
      qualityGrade: z.string().default("B"),
      deliverySchedule: z.array(z.object({
        date: z.string(),
        quantityKg: z.number(),
      })),
      startDate: z.string(),
      endDate: z.string(),
      penaltyClause: z.string().optional(),
      advancePaymentPct: z.number().min(0).max(100).default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [contract] = await db.insert(supplyContracts).values({
        farmerId: ctx.user.id,
        buyerId: input.buyerId,
        cropType: input.cropType,
        totalQuantityKg: input.totalQuantityKg,
        pricePerKg: String(input.pricePerKg),
        currency: input.currency,
        qualityGrade: input.qualityGrade,
        deliverySchedule: JSON.stringify(input.deliverySchedule),
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        penaltyClause: input.penaltyClause || null,
        advancePaymentPct: String(input.advancePaymentPct),
        status: "draft",
      }).returning();

      return contract;
    }),

  acceptContract: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.update(supplyContracts)
        .set({ status: "active", updatedAt: new Date() })
        .where(and(
          eq(supplyContracts.id, input.contractId),
          eq(supplyContracts.buyerId, ctx.user.id),
        ));
      return { status: "active" };
    }),

  getContracts: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const asfarmer = await db.select().from(supplyContracts)
        .where(eq(supplyContracts.farmerId, ctx.user.id));
      const asBuyer = await db.select().from(supplyContracts)
        .where(eq(supplyContracts.buyerId, ctx.user.id));
      return { asFarmer: asfarmer, asBuyer };
    }),
});
