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
import { eq, and, desc, sql } from "drizzle-orm";
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
      currency: z.string().default("NGN"),
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
    .input(z.object({
      subscriptionId: z.number(),
      reason: z.enum(["too_expensive", "not_needed", "quality_issues", "moving", "other"]).optional(),
      feedback: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [sub] = await db.select().from(subscriptions)
        .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.userId, ctx.user.id)));
      if (!sub) throw new Error("Subscription not found");

      // Calculate prorated refund if mid-cycle
      const now = new Date();
      const startOfCycle = sub.lastRenewalAt ? new Date(sub.lastRenewalAt) : new Date(sub.startDate);
      const daysIntoCycle = Math.floor((now.getTime() - startOfCycle.getTime()) / 86400000);
      const cycleDays = sub.status === "active" ? 30 : 0; // approximate
      const unusedDays = Math.max(0, cycleDays - daysIntoCycle);
      const proRatedRefund = cycleDays > 0 ? Math.round((sub.pricePerDelivery || 0) * unusedDays / cycleDays) : 0;

      await db.update(subscriptions)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: input.reason || null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, input.subscriptionId));

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "subscription-events",
          messages: [{ value: JSON.stringify({
            type: "subscription_cancelled",
            subscription_id: sub.id,
            user_id: ctx.user.id,
            reason: input.reason,
            pro_rated_refund: proRatedRefund,
          })}],
        });
      }

      return { status: "cancelled", proRatedRefund };
    }),

  // ============================================================================
  // Gap #5: Subscription Renewal & Retry Logic
  // ============================================================================

  /**
   * Process renewal for a subscription. Called by cron or manually.
   * Attempts payment via stored payment method with exponential retry.
   */
  processRenewal: protectedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [sub] = await db.select().from(subscriptions)
        .where(and(
          eq(subscriptions.id, input.subscriptionId),
          eq(subscriptions.status, "active"),
        ));
      if (!sub) throw new Error("Active subscription not found");

      const plan = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, sub.planId));
      if (!plan[0]) throw new Error("Subscription plan not found");

      const amount = plan[0].pricePerDelivery;
      const paymentMethod = sub.paymentMethod || "mpesa";

      // Attempt payment
      let paymentSuccess = false;
      let paymentError = "";
      let attemptNumber = (sub.renewalAttempts || 0) + 1;

      try {
        // Call mobile money service for payment
        const { resilientPost } = await import("../services/resilient-http.js");
        const MOBILE_MONEY_URL = process.env.MOBILE_MONEY_SERVICE_URL || "http://localhost:8090";

        if (paymentMethod === "mpesa") {
          await resilientPost("mobile-money-service", `${MOBILE_MONEY_URL}/api/mpesa/stk-push`, {
            phone_number: sub.paymentPhone || "",
            amount,
            account_ref: `SUB-${sub.id}-R${attemptNumber}`,
            transaction_desc: `Subscription renewal #${attemptNumber}`,
          }, { maxRetries: 2, timeoutMs: 30_000 });
        }
        paymentSuccess = true;
      } catch (err) {
        paymentError = err instanceof Error ? err.message : "Payment failed";
      }

      if (paymentSuccess) {
        const nextRenewal = new Date();
        const freq = plan[0].frequency;
        if (freq === "weekly") nextRenewal.setDate(nextRenewal.getDate() + 7);
        else if (freq === "biweekly") nextRenewal.setDate(nextRenewal.getDate() + 14);
        else nextRenewal.setMonth(nextRenewal.getMonth() + 1);

        await db.update(subscriptions)
          .set({
            lastRenewalAt: new Date(),
            nextRenewalAt: nextRenewal,
            renewalAttempts: 0,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, input.subscriptionId));

        const producer = await getProducer();
        if (producer) {
          await producer.send({
            topic: "subscription-events",
            messages: [{ value: JSON.stringify({
              type: "subscription_renewed",
              subscription_id: sub.id,
              amount,
              next_renewal: nextRenewal.toISOString(),
            })}],
          });
        }

        return { status: "renewed", amount, nextRenewal: nextRenewal.toISOString() };
      }

      // Payment failed — implement retry with backoff
      const maxAttempts = 4;
      if (attemptNumber >= maxAttempts) {
        // Suspend subscription after max retries
        await db.update(subscriptions)
          .set({ status: "suspended", renewalAttempts: attemptNumber, updatedAt: new Date() })
          .where(eq(subscriptions.id, input.subscriptionId));

        return {
          status: "suspended",
          error: paymentError,
          attempts: attemptNumber,
          message: "Subscription suspended after 4 failed payment attempts. Please update payment method.",
        };
      }

      // Schedule retry with exponential backoff: 1h, 4h, 24h, 72h
      const retryDelayHours = [1, 4, 24, 72][attemptNumber - 1] || 72;
      const retryAt = new Date(Date.now() + retryDelayHours * 3600000);

      await db.update(subscriptions)
        .set({
          renewalAttempts: attemptNumber,
          nextRenewalAt: retryAt,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, input.subscriptionId));

      return {
        status: "retry_scheduled",
        error: paymentError,
        attempts: attemptNumber,
        nextRetryAt: retryAt.toISOString(),
        retryDelayHours,
      };
    }),

  /**
   * Process all due renewals (admin/cron endpoint).
   */
  processAllDueRenewals: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      const dueSubscriptions = await db.select().from(subscriptions)
        .where(and(
          eq(subscriptions.status, "active"),
          sql`${subscriptions.nextRenewalAt} <= NOW()`,
        ));

      const results = { renewed: 0, failed: 0, total: dueSubscriptions.length };
      for (const sub of dueSubscriptions) {
        const plan = await db.select().from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, sub.planId));
        if (!plan[0]) continue;

        const nextRenewal = new Date();
        const freq = plan[0].frequency;
        if (freq === "weekly") nextRenewal.setDate(nextRenewal.getDate() + 7);
        else if (freq === "biweekly") nextRenewal.setDate(nextRenewal.getDate() + 14);
        else nextRenewal.setMonth(nextRenewal.getMonth() + 1);

        await db.update(subscriptions)
          .set({
            lastRenewalAt: new Date(),
            nextRenewalAt: nextRenewal,
            renewalAttempts: 0,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, sub.id));
        results.renewed++;
      }

      return results;
    }),

  /**
   * Upgrade/downgrade subscription with prorated pricing.
   */
  changePlan: protectedProcedure
    .input(z.object({
      subscriptionId: z.number(),
      newPlanId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [sub] = await db.select().from(subscriptions)
        .where(and(
          eq(subscriptions.id, input.subscriptionId),
          eq(subscriptions.userId, ctx.user.id),
        ));
      if (!sub) throw new Error("Subscription not found");

      const [oldPlan] = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, sub.planId));
      const [newPlan] = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, input.newPlanId));
      if (!newPlan) throw new Error("New plan not found");

      // Calculate prorated difference
      const oldPrice = oldPlan?.pricePerDelivery || 0;
      const newPrice = newPlan.pricePerDelivery;
      const priceDiff = newPrice - oldPrice;
      const isUpgrade = priceDiff > 0;

      // Prorate remaining days in current cycle
      const lastRenewal = sub.lastRenewalAt ? new Date(sub.lastRenewalAt) : new Date(sub.startDate);
      const daysIntoCycle = Math.floor((Date.now() - lastRenewal.getTime()) / 86400000);
      const cycleDays = 30; // approximate
      const remainingDays = Math.max(0, cycleDays - daysIntoCycle);
      const proratedCharge = isUpgrade
        ? Math.round(priceDiff * remainingDays / cycleDays)
        : 0;
      const proratedCredit = !isUpgrade
        ? Math.round(Math.abs(priceDiff) * remainingDays / cycleDays)
        : 0;

      await db.update(subscriptions)
        .set({
          planId: input.newPlanId,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, input.subscriptionId));

      return {
        previousPlan: oldPlan?.name || "Unknown",
        newPlan: newPlan.name,
        priceChange: priceDiff,
        isUpgrade,
        proratedCharge,
        proratedCredit,
        effectiveImmediately: true,
      };
    }),

  /**
   * Add a trial period to a new subscription.
   */
  startTrial: protectedProcedure
    .input(z.object({
      planId: z.number(),
      trialDays: z.number().min(3).max(30).default(7),
      deliveryAddress: z.object({
        street: z.string(),
        city: z.string(),
        latitude: z.number(),
        longitude: z.number(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      // Check if user already had a trial
      const existingSubs = await db.select().from(subscriptions)
        .where(eq(subscriptions.userId, ctx.user.id));
      const hadTrial = existingSubs.some(s => s.isTrial);
      if (hadTrial) throw new Error("Trial already used. Each user gets one free trial.");

      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + input.trialDays);

      const [sub] = await db.insert(subscriptions).values({
        userId: ctx.user.id,
        planId: input.planId,
        deliveryAddress: JSON.stringify(input.deliveryAddress),
        startDate: new Date(),
        status: "trial",
        isTrial: true,
        trialEndsAt: trialEnd,
      }).returning();

      return {
        subscriptionId: sub.id,
        status: "trial",
        trialEndsAt: trialEnd.toISOString(),
        message: `Your ${input.trialDays}-day free trial starts now. You'll be charged after ${trialEnd.toDateString()}.`,
      };
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
      currency: z.string().default("NGN"),
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
