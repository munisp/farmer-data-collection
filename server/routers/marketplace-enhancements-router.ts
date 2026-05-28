import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import {
  negotiationOffers,
  bulkDiscountTiers,
  savingsGoals,
  equipmentBookings,
  insuranceClaims,
} from "../../drizzle/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";

export const marketplaceEnhancementsRouter = router({
  // ======================== NEGOTIATION / BIDDING ========================

  makeOffer: protectedProcedure
    .input(z.object({
      listingId: z.number(),
      sellerId: z.number(),
      offerPricePerUnit: z.number().min(1),
      quantity: z.number().min(1),
      message: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [offer] = await db.insert(negotiationOffers).values({
        listingId: input.listingId,
        buyerId: ctx.user.id,
        sellerId: input.sellerId,
        offerPricePerUnit: input.offerPricePerUnit,
        quantity: input.quantity,
        message: input.message ?? null,
        status: "pending",
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return offer;
    }),

  counterOffer: protectedProcedure
    .input(z.object({
      offerId: z.number(),
      counterPrice: z.number().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [offer] = await db.select().from(negotiationOffers).where(eq(negotiationOffers.id, input.offerId)).limit(1);
      if (!offer || offer.sellerId !== ctx.user.id) throw new Error("Not authorized");
      await db.update(negotiationOffers).set({
        counterPrice: input.counterPrice,
        status: "countered",
        updatedAt: new Date(),
      }).where(eq(negotiationOffers.id, input.offerId));
      return { success: true };
    }),

  respondToOffer: protectedProcedure
    .input(z.object({
      offerId: z.number(),
      action: z.enum(["accept", "reject"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [offer] = await db.select().from(negotiationOffers).where(eq(negotiationOffers.id, input.offerId)).limit(1);
      if (!offer) throw new Error("Offer not found");
      if (offer.sellerId !== ctx.user.id && offer.buyerId !== ctx.user.id) {
        throw new Error("Not authorized");
      }
      await db.update(negotiationOffers).set({
        status: input.action === "accept" ? "accepted" : "rejected",
        updatedAt: new Date(),
      }).where(eq(negotiationOffers.id, input.offerId));
      return { success: true };
    }),

  getOffersForListing: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select().from(negotiationOffers)
        .where(eq(negotiationOffers.listingId, input.listingId))
        .orderBy(desc(negotiationOffers.createdAt));
    }),

  getMyOffers: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(negotiationOffers)
      .where(eq(negotiationOffers.buyerId, ctx.user.id))
      .orderBy(desc(negotiationOffers.createdAt));
  }),

  // ======================== BULK DISCOUNTS ========================

  setBulkDiscountTiers: protectedProcedure
    .input(z.object({
      listingId: z.number(),
      tiers: z.array(z.object({
        minQuantity: z.number().min(1),
        discountPct: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(bulkDiscountTiers).where(eq(bulkDiscountTiers.listingId, input.listingId));
      const rows = input.tiers.map(t => ({
        listingId: input.listingId,
        minQuantity: t.minQuantity,
        discountPct: t.discountPct,
        createdAt: new Date(),
      }));
      if (rows.length > 0) {
        await db.insert(bulkDiscountTiers).values(rows);
      }
      return { success: true };
    }),

  getBulkDiscounts: publicProcedure
    .input(z.object({ listingId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select().from(bulkDiscountTiers)
        .where(eq(bulkDiscountTiers.listingId, input.listingId))
        .orderBy(bulkDiscountTiers.minQuantity);
    }),

  // ======================== SAVINGS GOALS ========================

  createSavingsGoal: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      targetAmount: z.number().min(100),
      currency: z.string().default("NGN"),
      autoDeductPct: z.string().default("0"),
      deadline: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [goal] = await db.insert(savingsGoals).values({
        userId: ctx.user.id,
        name: input.name,
        targetAmount: input.targetAmount,
        currency: input.currency,
        autoDeductPct: input.autoDeductPct,
        deadline: input.deadline ? new Date(input.deadline) : null,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return goal;
    }),

  getMySavingsGoals: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(savingsGoals)
      .where(eq(savingsGoals.userId, ctx.user.id))
      .orderBy(desc(savingsGoals.createdAt));
  }),

  contributToGoal: protectedProcedure
    .input(z.object({ goalId: z.number(), amount: z.number().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [goal] = await db.select().from(savingsGoals)
        .where(and(eq(savingsGoals.id, input.goalId), eq(savingsGoals.userId, ctx.user.id)))
        .limit(1);
      if (!goal) throw new Error("Goal not found");
      await db.update(savingsGoals).set({
        currentAmount: goal.currentAmount + input.amount,
        status: goal.currentAmount + input.amount >= goal.targetAmount ? "completed" : "active",
        updatedAt: new Date(),
      }).where(eq(savingsGoals.id, input.goalId));
      return { success: true, newBalance: goal.currentAmount + input.amount };
    }),

  // ======================== EQUIPMENT BOOKING ========================

  bookEquipment: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(),
      equipmentName: z.string(),
      equipmentType: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      dailyRate: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (86400000)));
      const [booking] = await db.insert(equipmentBookings).values({
        cooperativeId: input.cooperativeId,
        userId: ctx.user.id,
        equipmentName: input.equipmentName,
        equipmentType: input.equipmentType,
        startDate: start,
        endDate: end,
        dailyRate: input.dailyRate,
        totalCost: days * input.dailyRate,
        status: "pending",
        createdAt: new Date(),
      }).returning();
      return booking;
    }),

  getCooperativeBookings: protectedProcedure
    .input(z.object({ cooperativeId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select().from(equipmentBookings)
        .where(eq(equipmentBookings.cooperativeId, input.cooperativeId))
        .orderBy(desc(equipmentBookings.startDate));
    }),

  // ======================== PARAMETRIC INSURANCE ========================

  triggerParametricClaim: protectedProcedure
    .input(z.object({
      policyId: z.number(),
      claimType: z.enum(["drought", "flood", "frost", "heatwave", "pest_outbreak"]),
      triggerData: z.string(),
      amount: z.number(),
      satelliteDataRef: z.string().optional(),
      weatherDataRef: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [claim] = await db.insert(insuranceClaims).values({
        policyId: input.policyId,
        userId: ctx.user.id,
        claimType: input.claimType,
        triggerType: "parametric",
        triggerData: input.triggerData,
        amount: input.amount,
        satelliteDataRef: input.satelliteDataRef ?? null,
        weatherDataRef: input.weatherDataRef ?? null,
        autoApproved: true,
        status: "approved",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return claim;
    }),

  getMyClaims: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(insuranceClaims)
      .where(eq(insuranceClaims.userId, ctx.user.id))
      .orderBy(desc(insuranceClaims.createdAt));
  }),

  // ======================== SEASONAL PRICING ENGINE ========================

  getSeasonalPriceRecommendation: publicProcedure
    .input(z.object({ crop: z.string(), region: z.string().default("kenya") }))
    .query(async ({ input }) => {
      const now = new Date();
      const month = now.getMonth();

      const seasonalFactors: Record<string, number[]> = {
        maize: [1.3, 1.2, 1.1, 0.9, 0.8, 0.7, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2],
        beans: [1.2, 1.1, 1.0, 0.8, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.3],
        tomatoes: [1.0, 0.9, 0.8, 0.7, 0.8, 1.0, 1.2, 1.3, 1.2, 1.1, 1.0, 1.0],
        potatoes: [1.1, 1.0, 0.9, 0.8, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.2, 1.1],
        onions: [1.2, 1.1, 0.9, 0.8, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.3],
      };

      const basePrices: Record<string, number> = {
        maize: 45, beans: 120, tomatoes: 80, potatoes: 35, onions: 50,
        wheat: 55, rice: 90, cabbage: 30, carrots: 40, bananas: 25,
      };

      const cropLower = input.crop.toLowerCase();
      const factor = (seasonalFactors[cropLower] ?? Array(12).fill(1.0))[month];
      const basePrice = basePrices[cropLower] ?? 50;
      const suggestedPrice = Math.round(basePrice * factor);

      const trend = factor > 1.0 ? "high_demand" : factor < 0.9 ? "low_demand" : "normal";
      const recommendation = factor > 1.0
        ? `Good time to sell ${input.crop} — prices are ${Math.round((factor - 1) * 100)}% above average`
        : factor < 0.9
        ? `Consider holding ${input.crop} — prices are ${Math.round((1 - factor) * 100)}% below average`
        : `${input.crop} prices are near average`;

      return {
        crop: input.crop,
        region: input.region,
        basePrice,
        seasonalFactor: factor,
        suggestedPricePerKg: suggestedPrice,
        trend,
        recommendation,
        month: now.toLocaleString("default", { month: "long" }),
      };
    }),

  // ======================== CROSS-BORDER SETTLEMENT ========================

  initiateCrossBorderSettlement: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string(),
      destinationCurrency: z.string(),
      amount: z.number().min(1),
      recipientPhone: z.string(),
      recipientCountry: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const exchangeRates: Record<string, number> = {
        "KES_UGX": 28.5, "KES_TZS": 18.2, "KES_NGN": 3.4,
        "UGX_KES": 0.035, "TZS_KES": 0.055, "NGN_KES": 0.29,
      };
      const key = `${input.sourceCurrency}_${input.destinationCurrency}`;
      const rate = exchangeRates[key];
      if (!rate) throw new Error(`Exchange rate not available for ${key}`);
      const convertedAmount = Math.round(input.amount * rate * 100) / 100;
      const txId = `XBORDER-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      return {
        transactionId: txId,
        sourceAmount: input.amount,
        sourceCurrency: input.sourceCurrency,
        destinationAmount: convertedAmount,
        destinationCurrency: input.destinationCurrency,
        exchangeRate: rate,
        recipientPhone: input.recipientPhone,
        recipientCountry: input.recipientCountry,
        fee: Math.round(input.amount * 0.015),
        status: "pending_mojaloop",
        estimatedSettlement: "2-5 minutes via Mojaloop ILP",
      };
    }),
});
