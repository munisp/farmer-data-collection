/**
 * Dairy Management Router
 *
 * SmartAlex-inspired dairy value chain endpoints for herd management,
 * milk production tracking, breeding records, health monitoring,
 * supplier marketplace, and processor/market connectivity.
 *
 * Middleware: PostgreSQL (state), Kafka (events), Redis (cache),
 * Permify (authorization), APISIX (rate limiting), OpenAppSec (WAF)
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc, sql, gte, lte, count, avg, sum } from "drizzle-orm";
import {
  dairyCows, milkRecords, breedingRecords, dairyHealthLogs,
  dairySuppliers, dairySupplierProducts, dairyProcessors,
  milkCollections, dairySupplierOrders
} from "../../drizzle/schema-dairy.js";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";
import { checkRateLimit, scanForThreats, publishKafkaEvent, withRedisCache } from "../integrations/middleware-router-hooks.js";

export const dairyManagementRouter = router({

  // ============================================================================
  // HERD MANAGEMENT
  // ============================================================================

  registerCow: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      tagNumber: z.string().max(50),
      name: z.string().max(100).optional(),
      breed: z.string().max(100),
      dateOfBirth: z.string().max(20).optional(),
      gender: z.enum(["female", "male"]).default("female"),
      acquisitionMethod: z.enum(["born_on_farm", "purchased", "gifted", "inherited"]).optional(),
      acquisitionCost: z.number().optional(),
      sireTag: z.string().max(50).optional(),
      damTag: z.string().max(50).optional(),
      currentWeight: z.number().optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit("dairy.registerCow", (ctx as any).user?.id, 20, 60);
      await scanForThreats("dairy.registerCow", input);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const [cow] = await db.insert(dairyCows).values({
        userId,
        farmId: input.farmId,
        tagNumber: input.tagNumber,
        name: input.name,
        breed: input.breed,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        acquisitionMethod: input.acquisitionMethod,
        acquisitionCost: input.acquisitionCost,
        sireTag: input.sireTag,
        damTag: input.damTag,
        currentWeight: input.currentWeight,
        notes: input.notes,
      }).returning();

      await publishKafkaEvent("dairy.events", "dairy.cow.registered", { cowId: cow.id, farmId: input.farmId, userId });
      return cow;
    }),

  getCows: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      status: z.string().max(30).optional(),
      breed: z.string().max(100).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await checkRateLimit("dairy.getCows", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const conditions = [eq(dairyCows.userId, userId)];
      if (input.farmId) conditions.push(eq(dairyCows.farmId, input.farmId));
      if (input.status) conditions.push(eq(dairyCows.status, input.status as any));
      if (input.breed) conditions.push(eq(dairyCows.breed, input.breed));

      return db.select().from(dairyCows)
        .where(and(...conditions))
        .orderBy(desc(dairyCows.createdAt));
    }),

  updateCow: protectedProcedure
    .input(z.object({
      cowId: z.number(),
      name: z.string().max(100).optional(),
      status: z.enum(["active", "dry", "pregnant", "calving", "sick", "sold", "deceased"]).optional(),
      currentWeight: z.number().optional(),
      bodyConditionScore: z.number().min(1).max(5).optional(),
      lactationNumber: z.number().optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit("dairy.updateCow", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const { cowId, ...updates } = input;
      const [updated] = await db.update(dairyCows)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(dairyCows.id, cowId), eq(dairyCows.userId, userId)))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Cow not found" });
      return updated;
    }),

  // ============================================================================
  // MILK PRODUCTION TRACKING
  // ============================================================================

  recordMilk: protectedProcedure
    .input(z.object({
      cowId: z.number(),
      recordDate: z.string().max(20),
      session: z.enum(["morning", "afternoon", "evening"]),
      quantityLiters: z.number().min(0).max(100),
      fatPercentage: z.number().min(0).max(15).optional(),
      proteinPercentage: z.number().min(0).max(10).optional(),
      somaticCellCount: z.number().optional(),
      temperature: z.number().optional(),
      quality: z.enum(["grade_a", "grade_b", "grade_c", "rejected"]).default("grade_a"),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit("dairy.recordMilk", (ctx as any).user?.id, 20, 60);
      await scanForThreats("dairy.recordMilk", input);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const [record] = await db.insert(milkRecords).values({
        userId,
        cowId: input.cowId,
        recordDate: input.recordDate,
        session: input.session,
        quantityLiters: input.quantityLiters,
        fatPercentage: input.fatPercentage,
        proteinPercentage: input.proteinPercentage,
        somaticCellCount: input.somaticCellCount,
        temperature: input.temperature,
        quality: input.quality,
        rejected: input.quality === "rejected",
        notes: input.notes,
      }).returning();

      await publishKafkaEvent("dairy.events", "dairy.milk.recorded", {
        recordId: record.id,
        cowId: input.cowId,
        liters: input.quantityLiters,
        userId,
      });

      return record;
    }),

  getMilkRecords: protectedProcedure
    .input(z.object({
      cowId: z.number().optional(),
      startDate: z.string().max(20).optional(),
      endDate: z.string().max(20).optional(),
      limit: z.number().min(1).max(500).default(100),
    }))
    .query(async ({ input, ctx }) => {
      await checkRateLimit("dairy.getMilkRecords", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const conditions = [eq(milkRecords.userId, userId)];
      if (input.cowId) conditions.push(eq(milkRecords.cowId, input.cowId));
      if (input.startDate) conditions.push(gte(milkRecords.recordDate, input.startDate));
      if (input.endDate) conditions.push(lte(milkRecords.recordDate, input.endDate));

      return db.select().from(milkRecords)
        .where(and(...conditions))
        .orderBy(desc(milkRecords.recordDate))
        .limit(input.limit);
    }),

  getMilkAnalytics: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      period: z.enum(["7d", "30d", "90d", "365d"]).default("30d"),
    }))
    .query(async ({ input, ctx }) => {
      await checkRateLimit("dairy.getMilkAnalytics", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const daysMap = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
      const days = daysMap[input.period];
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split("T")[0];

      const records = await db.select({
        totalLiters: sum(milkRecords.quantityLiters),
        avgLiters: avg(milkRecords.quantityLiters),
        avgFat: avg(milkRecords.fatPercentage),
        avgProtein: avg(milkRecords.proteinPercentage),
        recordCount: count(),
      })
        .from(milkRecords)
        .where(and(
          eq(milkRecords.userId, userId),
          gte(milkRecords.recordDate, startDateStr),
        ));

      const cowCount = await db.select({ total: count() })
        .from(dairyCows)
        .where(and(eq(dairyCows.userId, userId), eq(dairyCows.status, "active")));

      return {
        totalLiters: Number(records[0]?.totalLiters) || 0,
        avgLitersPerSession: Number(records[0]?.avgLiters) || 0,
        avgFatPercentage: Number(records[0]?.avgFat) || 0,
        avgProteinPercentage: Number(records[0]?.avgProtein) || 0,
        totalRecords: Number(records[0]?.recordCount) || 0,
        activeCows: Number(cowCount[0]?.total) || 0,
        period: input.period,
      };
    }),

  // ============================================================================
  // BREEDING MANAGEMENT
  // ============================================================================

  recordBreeding: protectedProcedure
    .input(z.object({
      cowId: z.number(),
      breedingDate: z.string().max(20),
      method: z.enum(["artificial_insemination", "natural_mating", "embryo_transfer"]),
      sireBreed: z.string().max(100).optional(),
      sireTag: z.string().max(50).optional(),
      aiTechnicianName: z.string().max(200).optional(),
      strawNumber: z.string().max(100).optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit("dairy.recordBreeding", (ctx as any).user?.id, 20, 60);
      await scanForThreats("dairy.recordBreeding", input);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const [record] = await db.insert(breedingRecords).values({
        userId,
        cowId: input.cowId,
        breedingDate: input.breedingDate,
        method: input.method,
        sireBreed: input.sireBreed,
        sireTag: input.sireTag,
        aiTechnicianName: input.aiTechnicianName,
        strawNumber: input.strawNumber,
        notes: input.notes,
      }).returning();

      await publishKafkaEvent("dairy.events", "dairy.breeding.recorded", { recordId: record.id, cowId: input.cowId, userId });
      return record;
    }),

  getBreedingRecords: protectedProcedure
    .input(z.object({
      cowId: z.number().optional(),
      outcome: z.string().max(30).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await checkRateLimit("dairy.getBreedingRecords", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const conditions = [eq(breedingRecords.userId, userId)];
      if (input.cowId) conditions.push(eq(breedingRecords.cowId, input.cowId));
      if (input.outcome) conditions.push(eq(breedingRecords.outcome, input.outcome));

      return db.select().from(breedingRecords)
        .where(and(...conditions))
        .orderBy(desc(breedingRecords.breedingDate));
    }),

  confirmPregnancy: protectedProcedure
    .input(z.object({
      breedingId: z.number(),
      confirmed: z.boolean(),
      checkDate: z.string().max(20),
      expectedCalvingDate: z.string().max(20).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit("dairy.confirmPregnancy", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const [updated] = await db.update(breedingRecords)
        .set({
          pregnancyConfirmed: input.confirmed,
          pregnancyCheckDate: input.checkDate,
          expectedCalvingDate: input.expectedCalvingDate,
          outcome: input.confirmed ? "pregnant" : "failed",
        })
        .where(and(eq(breedingRecords.id, input.breedingId), eq(breedingRecords.userId, userId)))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Breeding record not found" });

      if (input.confirmed) {
        await db.update(dairyCows)
          .set({ status: "pregnant", updatedAt: new Date() })
          .where(eq(dairyCows.id, updated.cowId));
      }

      return updated;
    }),

  // ============================================================================
  // HEALTH MONITORING
  // ============================================================================

  logHealth: protectedProcedure
    .input(z.object({
      cowId: z.number(),
      logDate: z.string().max(20),
      category: z.enum(["vaccination", "deworming", "treatment", "checkup", "injury", "disease"]),
      condition: z.string().max(200),
      severity: z.enum(["mild", "moderate", "severe", "critical"]).default("mild"),
      treatment: z.string().max(500).optional(),
      medication: z.string().max(200).optional(),
      dosage: z.string().max(100).optional(),
      vetName: z.string().max(200).optional(),
      withdrawalPeriodDays: z.number().optional(),
      cost: z.number().optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit("dairy.logHealth", (ctx as any).user?.id, 20, 60);
      await scanForThreats("dairy.logHealth", input);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      let withdrawalEndDate: string | undefined;
      if (input.withdrawalPeriodDays) {
        const end = new Date(input.logDate);
        end.setDate(end.getDate() + input.withdrawalPeriodDays);
        withdrawalEndDate = end.toISOString().split("T")[0];
      }

      const [log] = await db.insert(dairyHealthLogs).values({
        userId,
        cowId: input.cowId,
        logDate: input.logDate,
        category: input.category,
        condition: input.condition,
        severity: input.severity,
        treatment: input.treatment,
        medication: input.medication,
        dosage: input.dosage,
        vetName: input.vetName,
        withdrawalPeriodDays: input.withdrawalPeriodDays,
        withdrawalEndDate,
        cost: input.cost,
        notes: input.notes,
      }).returning();

      if (input.severity === "severe" || input.severity === "critical") {
        await db.update(dairyCows)
          .set({ status: "sick", updatedAt: new Date() })
          .where(eq(dairyCows.id, input.cowId));
      }

      await publishKafkaEvent("dairy.events", "dairy.health.logged", { logId: log.id, cowId: input.cowId, severity: input.severity, userId });
      return log;
    }),

  getHealthLogs: protectedProcedure
    .input(z.object({
      cowId: z.number().optional(),
      category: z.string().max(30).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await checkRateLimit("dairy.getHealthLogs", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const conditions = [eq(dairyHealthLogs.userId, userId)];
      if (input.cowId) conditions.push(eq(dairyHealthLogs.cowId, input.cowId));
      if (input.category) conditions.push(eq(dairyHealthLogs.category, input.category));

      return db.select().from(dairyHealthLogs)
        .where(and(...conditions))
        .orderBy(desc(dairyHealthLogs.logDate));
    }),

  // ============================================================================
  // SUPPLIER MARKETPLACE
  // ============================================================================

  getSuppliers: protectedProcedure
    .input(z.object({
      type: z.enum(["feed", "vet_drugs", "breeding_services", "equipment"]).optional(),
      state: z.string().max(50).optional(),
      verifiedOnly: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }) => {
      await checkRateLimit("dairy.getSuppliers", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();

      const conditions = [eq(dairySuppliers.status, "active")];
      if (input.type) conditions.push(eq(dairySuppliers.supplierType, input.type));
      if (input.state) conditions.push(eq(dairySuppliers.state, input.state));
      if (input.verifiedOnly) conditions.push(eq(dairySuppliers.verified, true));

      return db.select().from(dairySuppliers)
        .where(and(...conditions))
        .orderBy(desc(dairySuppliers.rating));
    }),

  getSupplierProducts: protectedProcedure
    .input(z.object({
      supplierId: z.number(),
      category: z.string().max(50).optional(),
    }))
    .query(async ({ input, ctx }) => {
      await checkRateLimit("dairy.getSupplierProducts", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();

      const conditions = [eq(dairySupplierProducts.supplierId, input.supplierId)];
      if (input.category) conditions.push(eq(dairySupplierProducts.category, input.category));

      return db.select().from(dairySupplierProducts)
        .where(and(...conditions))
        .orderBy(dairySupplierProducts.productName);
    }),

  placeSupplierOrder: protectedProcedure
    .input(z.object({
      supplierId: z.number(),
      items: z.array(z.object({
        productId: z.number(),
        productName: z.string().max(200),
        quantity: z.number().min(1),
        unitPrice: z.number(),
      })),
      deliveryAddress: z.string().max(500),
      deliveryDate: z.string().max(20).optional(),
      paymentMethod: z.enum(["mobile_money", "bank_transfer", "cash_on_delivery"]).optional(),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit("dairy.placeSupplierOrder", (ctx as any).user?.id, 20, 60);
      await scanForThreats("dairy.placeSupplierOrder", input);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const totalAmount = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

      const [order] = await db.insert(dairySupplierOrders).values({
        userId,
        supplierId: input.supplierId,
        items: input.items,
        totalAmount,
        deliveryAddress: input.deliveryAddress,
        deliveryDate: input.deliveryDate,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
      }).returning();

      await publishKafkaEvent("dairy.events", "dairy.order.placed", { orderId: order.id, supplierId: input.supplierId, totalAmount, userId });
      return order;
    }),

  // ============================================================================
  // MARKET CONNECTIVITY — Processors & Buyers
  // ============================================================================

  getProcessors: protectedProcedure
    .input(z.object({
      type: z.string().max(50).optional(),
      state: z.string().max(50).optional(),
      verifiedOnly: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }) => {
      await checkRateLimit("dairy.getProcessors", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();

      const conditions = [eq(dairyProcessors.status, "active")];
      if (input.type) conditions.push(eq(dairyProcessors.processorType, input.type));
      if (input.state) conditions.push(eq(dairyProcessors.state, input.state));
      if (input.verifiedOnly) conditions.push(eq(dairyProcessors.verified, true));

      return db.select().from(dairyProcessors)
        .where(and(...conditions))
        .orderBy(desc(dairyProcessors.rating));
    }),

  scheduleMilkCollection: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      processorId: z.number(),
      collectionDate: z.string().max(20),
      scheduledTime: z.string().max(10).optional(),
      estimatedLiters: z.number().min(1),
      notes: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await checkRateLimit("dairy.scheduleMilkCollection", (ctx as any).user?.id, 20, 60);
      await scanForThreats("dairy.scheduleMilkCollection", input);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const processor = await db.select().from(dairyProcessors)
        .where(eq(dairyProcessors.id, input.processorId))
        .limit(1);

      if (!processor.length) throw new TRPCError({ code: "NOT_FOUND", message: "Processor not found" });

      const pricePerLiter = processor[0].pricePerLiter ?? 0;
      const totalAmount = Math.round(input.estimatedLiters * pricePerLiter);

      const [collection] = await db.insert(milkCollections).values({
        userId,
        farmId: input.farmId,
        processorId: input.processorId,
        collectionDate: input.collectionDate,
        scheduledTime: input.scheduledTime,
        totalLiters: input.estimatedLiters,
        pricePerLiter,
        totalAmount,
        notes: input.notes,
      }).returning();

      await publishKafkaEvent("dairy.events", "dairy.collection.scheduled", { collectionId: collection.id, processorId: input.processorId, userId });
      return collection;
    }),

  getMilkCollections: protectedProcedure
    .input(z.object({
      status: z.string().max(20).optional(),
      processorId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      await checkRateLimit("dairy.getMilkCollections", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const conditions = [eq(milkCollections.userId, userId)];
      if (input.status) conditions.push(eq(milkCollections.status, input.status as any));
      if (input.processorId) conditions.push(eq(milkCollections.processorId, input.processorId));

      return db.select().from(milkCollections)
        .where(and(...conditions))
        .orderBy(desc(milkCollections.collectionDate));
    }),

  // ============================================================================
  // DASHBOARD SUMMARY
  // ============================================================================

  getDashboardSummary: protectedProcedure
    .query(async ({ ctx }) => {
      await checkRateLimit("dairy.getDashboardSummary", (ctx as any).user?.id, 20, 60);
      const db = await requireDb();
      const userId = (ctx as any).user.id;

      const today = new Date().toISOString().split("T")[0];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

      const [cowStats] = await db.select({
        total: count(),
      }).from(dairyCows).where(eq(dairyCows.userId, userId));

      const [activeCows] = await db.select({
        total: count(),
      }).from(dairyCows).where(and(eq(dairyCows.userId, userId), eq(dairyCows.status, "active")));

      const [milkStats] = await db.select({
        totalLiters: sum(milkRecords.quantityLiters),
        avgLiters: avg(milkRecords.quantityLiters),
        records: count(),
      }).from(milkRecords).where(and(
        eq(milkRecords.userId, userId),
        gte(milkRecords.recordDate, thirtyDaysAgoStr),
      ));

      const [breedingStats] = await db.select({
        total: count(),
      }).from(breedingRecords).where(and(
        eq(breedingRecords.userId, userId),
        eq(breedingRecords.outcome, "pregnant"),
      ));

      const [healthAlerts] = await db.select({
        total: count(),
      }).from(dairyHealthLogs).where(and(
        eq(dairyHealthLogs.userId, userId),
        eq(dairyHealthLogs.resolved, false),
      ));

      const [collectionStats] = await db.select({
        totalRevenue: sum(milkCollections.totalAmount),
        totalLiters: sum(milkCollections.totalLiters),
        collections: count(),
      }).from(milkCollections).where(and(
        eq(milkCollections.userId, userId),
        gte(milkCollections.collectionDate, thirtyDaysAgoStr),
      ));

      return {
        herd: {
          totalCows: Number(cowStats?.total) || 0,
          activeCows: Number(activeCows?.total) || 0,
        },
        milk: {
          totalLiters30d: Number(milkStats?.totalLiters) || 0,
          avgPerSession: Number(milkStats?.avgLiters) || 0,
          records30d: Number(milkStats?.records) || 0,
        },
        breeding: {
          pregnantCows: Number(breedingStats?.total) || 0,
        },
        health: {
          unresolvedAlerts: Number(healthAlerts?.total) || 0,
        },
        market: {
          revenue30d: Number(collectionStats?.totalRevenue) || 0,
          litersCollected30d: Number(collectionStats?.totalLiters) || 0,
          collections30d: Number(collectionStats?.collections) || 0,
        },
      };
    }),
});
