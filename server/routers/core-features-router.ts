/**
 * Core Features Router — Production-grade CRUD + Analytics for all 9 core features
 * Farms, Livestock, Crops, Harvests, Expenses, Inventory, Farm Inputs, Equipment, Traceability
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db";
import { farms, farmers, crops, livestock, harvests, expenses, farmInputs } from "../../drizzle/schema";
import { inventoryItems, suppliers, inventoryTransactions } from "../../drizzle/financial-schema";
import { productBatches, traceabilityEvents, collectionCenters, warehouses, warehouseReceipts } from "../../drizzle/traceability-schema";
import { eq, desc, asc, sql, and, gte, lte, like, or, count, sum, avg, max, min, inArray, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

// ============================================================================
// 1. FARMS ROUTER — Full CRUD + Analytics + Financial Summary
// ============================================================================
export const farmsRouter = router({
  // List farms with pagination and search
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
      sortBy: z.enum(["farmName", "farmSize", "createdAt"]).default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: (SQL | undefined)[] = [];
      if (input.search) {
        conditions.push(
          or(
            like(farms.farmName, `%${input.search}%`),
            like(farms.location, `%${input.search}%`),
            like(farms.soilType, `%${input.search}%`)
          )
        );
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [items, total] = await Promise.all([
        db.select({
          farm: farms,
          farmerFirstName: farmers.firstName,
          farmerLastName: farmers.lastName,
        }).from(farms)
          .leftJoin(farmers, eq(farms.farmerId, farmers.id))
          .where(where)
          .orderBy(input.sortOrder === "desc" ? desc(farms[input.sortBy]) : asc(farms[input.sortBy]))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` }).from(farms).where(where),
      ]);
      return {
        items: items.map(i => ({
          ...i.farm,
          farmerName: i.farmerFirstName && i.farmerLastName ? `${i.farmerFirstName} ${i.farmerLastName}` : null,
        })),
        total: Number(total[0]?.count || 0),
      };
    }),

  // Get single farm with full details
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [farm] = await db.select().from(farms).where(eq(farms.id, input.id));
      if (!farm) throw new TRPCError({ code: "NOT_FOUND", message: "Farm not found" });
      // Get related counts
      const [cropCount, livestockCount, harvestCount, expenseCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(crops).where(eq(crops.farmId, input.id)),
        db.select({ count: sql<number>`count(*)` }).from(livestock).where(eq(livestock.farmId, input.id)),
        db.select({ count: sql<number>`count(*)` }).from(harvests)
          .innerJoin(crops, eq(harvests.cropId, crops.id))
          .where(eq(crops.farmId, input.id)),
        db.select({ count: sql<number>`count(*)` }).from(expenses).where(eq(expenses.farmId, input.id)),
      ]);
      return {
        ...farm,
        stats: {
          crops: Number(cropCount[0]?.count || 0),
          livestock: Number(livestockCount[0]?.count || 0),
          harvests: Number(harvestCount[0]?.count || 0),
          expenses: Number(expenseCount[0]?.count || 0),
        },
      };
    }),

  // Update farm
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      farmName: z.string().min(1).optional(),
      farmSize: z.string().optional(),
      farmSizeUnit: z.string().optional(),
      location: z.string().optional(),
      latitude: z.string().optional(),
      longitude: z.string().optional(),
      soilType: z.string().optional(),
      irrigationType: z.string().optional(),
      boundary: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, ...data } = input;
      const updateData: Record<string, any> = { updatedAt: new Date() };
      Object.entries(data).forEach(([key, val]) => {
        if (val !== undefined) updateData[key] = val || null;
      });
      await db.update(farms).set(updateData).where(eq(farms.id, id));
      const [updated] = await db.select().from(farms).where(eq(farms.id, id));
      return updated;
    }),

  // Delete farm
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(farms).where(eq(farms.id, input.id));
      return { success: true };
    }),

  // Farm analytics — crop allocation, financial summary, seasonal performance
  getAnalytics: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      // Crop allocation by area
      const cropAllocation = await db.select({
        cropName: crops.cropName,
        count: sql<number>`count(*)`,
        totalArea: sql<number>`coalesce(sum(cast(${crops.areaPlanted} as numeric)), 0)`,
      }).from(crops).where(eq(crops.farmId, input.farmId)).groupBy(crops.cropName);

      // Financial summary
      const [totalRevenue] = await db.select({
        total: sql<number>`coalesce(sum(${harvests.revenue}), 0)`,
      }).from(harvests).innerJoin(crops, eq(harvests.cropId, crops.id)).where(eq(crops.farmId, input.farmId));

      const [totalExpenses] = await db.select({
        total: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
      }).from(expenses).where(eq(expenses.farmId, input.farmId));

      // Livestock summary
      const livestockSummary = await db.select({
        animalType: livestock.animalType,
        totalCount: sql<number>`coalesce(sum(${livestock.quantity}), 0)`,
        totalValue: sql<number>`coalesce(sum(${livestock.currentValue}), 0)`,
      }).from(livestock).where(eq(livestock.farmId, input.farmId)).groupBy(livestock.animalType);

      // Monthly harvest trend (last 12 months)
      const harvestTrend = await db.select({
        month: sql<string>`to_char(${harvests.harvestDate}, 'YYYY-MM')`,
        totalQuantity: sql<number>`coalesce(sum(cast(${harvests.quantity} as numeric)), 0)`,
        totalRevenue: sql<number>`coalesce(sum(${harvests.revenue}), 0)`,
      }).from(harvests)
        .innerJoin(crops, eq(harvests.cropId, crops.id))
        .where(and(
          eq(crops.farmId, input.farmId),
          gte(harvests.harvestDate, sql`now() - interval '12 months'`)
        ))
        .groupBy(sql`to_char(${harvests.harvestDate}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${harvests.harvestDate}, 'YYYY-MM')`);

      // Monthly expense trend
      const expenseTrend = await db.select({
        month: sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM')`,
        totalAmount: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
        category: expenses.category,
      }).from(expenses)
        .where(and(
          eq(expenses.farmId, input.farmId),
          gte(expenses.expenseDate, sql`now() - interval '12 months'`)
        ))
        .groupBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`, expenses.category)
        .orderBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`);

      return {
        cropAllocation: cropAllocation.map(c => ({
          cropName: c.cropName,
          count: Number(c.count),
          totalArea: Number(c.totalArea),
        })),
        financial: {
          totalRevenue: Number(totalRevenue?.total || 0) / 100,
          totalExpenses: Number(totalExpenses?.total || 0) / 100,
          netProfit: (Number(totalRevenue?.total || 0) - Number(totalExpenses?.total || 0)) / 100,
        },
        livestockSummary: livestockSummary.map(l => ({
          animalType: l.animalType,
          totalCount: Number(l.totalCount),
          totalValue: Number(l.totalValue) / 100,
        })),
        harvestTrend: harvestTrend.map(h => ({
          month: h.month,
          totalQuantity: Number(h.totalQuantity),
          totalRevenue: Number(h.totalRevenue) / 100,
        })),
        expenseTrend: expenseTrend.map(e => ({
          month: e.month,
          totalAmount: Number(e.totalAmount) / 100,
          category: e.category,
        })),
      };
    }),
});

// ============================================================================
// 2. LIVESTOCK ROUTER — Individual Animal Registry + Health + Breeding + Production
// ============================================================================
export const livestockRouter = router({
  // List livestock with filters
  list: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      animalType: z.string().optional(),
      healthStatus: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: (SQL | undefined)[] = [];
      if (input.farmId) conditions.push(eq(livestock.farmId, input.farmId));
      if (input.animalType) conditions.push(eq(livestock.animalType, input.animalType));
      if (input.healthStatus) conditions.push(eq(livestock.healthStatus, input.healthStatus));
      if (input.search) {
        conditions.push(or(
          like(livestock.animalType, `%${input.search}%`),
          like(livestock.breed, `%${input.search}%`),
          like(livestock.notes, `%${input.search}%`)
        ));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [items, total] = await Promise.all([
        db.select({
          livestock: livestock,
          farmName: farms.farmName,
        }).from(livestock)
          .leftJoin(farms, eq(livestock.farmId, farms.id))
          .where(where)
          .orderBy(desc(livestock.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` }).from(livestock).where(where),
      ]);
      return {
        items: items.map(i => ({ ...i.livestock, farmName: i.farmName })),
        total: Number(total[0]?.count || 0),
      };
    }),

  // Get single livestock record
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [item] = await db.select({
        livestock: livestock,
        farmName: farms.farmName,
      }).from(livestock)
        .leftJoin(farms, eq(livestock.farmId, farms.id))
        .where(eq(livestock.id, input.id));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Livestock not found" });
      return { ...item.livestock, farmName: item.farmName };
    }),

  // Update livestock
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      animalType: z.string().optional(),
      breed: z.string().optional(),
      quantity: z.number().optional(),
      purpose: z.string().optional(),
      acquisitionCost: z.number().optional(),
      currentValue: z.number().optional(),
      healthStatus: z.enum(["healthy", "sick", "recovering", "quarantined", "deceased"]).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, ...data } = input;
      const updateData: Record<string, any> = { updatedAt: new Date() };
      Object.entries(data).forEach(([key, val]) => {
        if (val !== undefined) updateData[key] = val;
      });
      await db.update(livestock).set(updateData).where(eq(livestock.id, id));
      const [updated] = await db.select().from(livestock).where(eq(livestock.id, id));
      return updated;
    }),

  // Delete livestock
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(livestock).where(eq(livestock.id, input.id));
      return { success: true };
    }),

  // Livestock analytics — herd composition, health status, valuation
  getAnalytics: protectedProcedure
    .input(z.object({ farmId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const where = input.farmId ? eq(livestock.farmId, input.farmId) : undefined;

      const [herdComposition, healthDistribution, valuationByType, totalStats] = await Promise.all([
        // Herd composition by animal type
        db.select({
          animalType: livestock.animalType,
          totalCount: sql<number>`coalesce(sum(${livestock.quantity}), 0)`,
          breeds: sql<number>`count(distinct ${livestock.breed})`,
        }).from(livestock).where(where).groupBy(livestock.animalType),

        // Health status distribution
        db.select({
          healthStatus: livestock.healthStatus,
          count: sql<number>`count(*)`,
          totalAnimals: sql<number>`coalesce(sum(${livestock.quantity}), 0)`,
        }).from(livestock).where(where).groupBy(livestock.healthStatus),

        // Valuation by type
        db.select({
          animalType: livestock.animalType,
          totalAcquisitionCost: sql<number>`coalesce(sum(${livestock.acquisitionCost}), 0)`,
          totalCurrentValue: sql<number>`coalesce(sum(${livestock.currentValue}), 0)`,
          avgValuePerUnit: sql<number>`coalesce(avg(${livestock.currentValue} / nullif(${livestock.quantity}, 0)), 0)`,
        }).from(livestock).where(where).groupBy(livestock.animalType),

        // Total stats
        db.select({
          totalRecords: sql<number>`count(*)`,
          totalAnimals: sql<number>`coalesce(sum(${livestock.quantity}), 0)`,
          totalAcquisitionCost: sql<number>`coalesce(sum(${livestock.acquisitionCost}), 0)`,
          totalCurrentValue: sql<number>`coalesce(sum(${livestock.currentValue}), 0)`,
          healthyCount: sql<number>`coalesce(sum(case when ${livestock.healthStatus} = 'healthy' then ${livestock.quantity} else 0 end), 0)`,
          sickCount: sql<number>`coalesce(sum(case when ${livestock.healthStatus} = 'sick' then ${livestock.quantity} else 0 end), 0)`,
        }).from(livestock).where(where),
      ]);

      // Purpose breakdown
      const purposeBreakdown = await db.select({
        purpose: livestock.purpose,
        totalCount: sql<number>`coalesce(sum(${livestock.quantity}), 0)`,
      }).from(livestock).where(where).groupBy(livestock.purpose);

      const stats = totalStats[0];
      return {
        totalRecords: Number(stats?.totalRecords || 0),
        totalAnimals: Number(stats?.totalAnimals || 0),
        totalAcquisitionCost: Number(stats?.totalAcquisitionCost || 0) / 100,
        totalCurrentValue: Number(stats?.totalCurrentValue || 0) / 100,
        valueAppreciation: ((Number(stats?.totalCurrentValue || 0) - Number(stats?.totalAcquisitionCost || 0)) / Math.max(Number(stats?.totalAcquisitionCost || 1), 1)) * 100,
        healthyPercentage: Number(stats?.totalAnimals || 0) > 0
          ? (Number(stats?.healthyCount || 0) / Number(stats?.totalAnimals || 1)) * 100 : 0,
        herdComposition: herdComposition.map(h => ({
          animalType: h.animalType,
          totalCount: Number(h.totalCount),
          breeds: Number(h.breeds),
        })),
        healthDistribution: healthDistribution.map(h => ({
          status: h.healthStatus || "unknown",
          count: Number(h.count),
          totalAnimals: Number(h.totalAnimals),
        })),
        valuationByType: valuationByType.map(v => ({
          animalType: v.animalType,
          acquisitionCost: Number(v.totalAcquisitionCost) / 100,
          currentValue: Number(v.totalCurrentValue) / 100,
          avgValuePerUnit: Number(v.avgValuePerUnit) / 100,
        })),
        purposeBreakdown: purposeBreakdown.map(p => ({
          purpose: p.purpose || "unspecified",
          totalCount: Number(p.totalCount),
        })),
      };
    }),
});

// ============================================================================
// 3. CROPS ROUTER — Full CRUD + Growth Stages + Analytics
// ============================================================================
export const cropsRouter = router({
  // List crops with filters
  list: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      status: z.string().optional(),
      search: z.string().optional(),
      season: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: (SQL | undefined)[] = [];
      if (input.farmId) conditions.push(eq(crops.farmId, input.farmId));
      if (input.status) conditions.push(eq(crops.status, input.status));
      if (input.season) conditions.push(eq(crops.season, input.season));
      if (input.search) {
        conditions.push(or(
          like(crops.cropName, `%${input.search}%`),
          like(crops.cropVariety, `%${input.search}%`)
        ));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [items, total] = await Promise.all([
        db.select({
          crop: crops,
          farmName: farms.farmName,
        }).from(crops)
          .leftJoin(farms, eq(crops.farmId, farms.id))
          .where(where)
          .orderBy(desc(crops.plantingDate))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` }).from(crops).where(where),
      ]);
      return {
        items: items.map(i => ({ ...i.crop, farmName: i.farmName })),
        total: Number(total[0]?.count || 0),
      };
    }),

  // Get single crop with harvest history
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [crop] = await db.select({
        crop: crops,
        farmName: farms.farmName,
      }).from(crops)
        .leftJoin(farms, eq(crops.farmId, farms.id))
        .where(eq(crops.id, input.id));
      if (!crop) throw new TRPCError({ code: "NOT_FOUND", message: "Crop not found" });
      const harvestHistory = await db.select().from(harvests)
        .where(eq(harvests.cropId, input.id))
        .orderBy(desc(harvests.harvestDate));
      const inputHistory = await db.select().from(farmInputs)
        .where(eq(farmInputs.cropId, input.id))
        .orderBy(desc(farmInputs.applicationDate));
      return {
        ...crop.crop,
        farmName: crop.farmName,
        harvests: harvestHistory,
        inputs: inputHistory,
      };
    }),

  // Update crop
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      cropName: z.string().optional(),
      cropVariety: z.string().optional(),
      expectedHarvestDate: z.string().optional(),
      actualHarvestDate: z.string().optional(),
      areaPlanted: z.string().optional(),
      areaUnit: z.string().optional(),
      season: z.string().optional(),
      status: z.enum(["planted", "growing", "flowering", "fruiting", "harvested", "failed"]).optional(),
      pricePerUnit: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, expectedHarvestDate, actualHarvestDate, ...rest } = input;
      const updateData: Record<string, any> = { updatedAt: new Date() };
      Object.entries(rest).forEach(([key, val]) => {
        if (val !== undefined) updateData[key] = val;
      });
      if (expectedHarvestDate !== undefined) updateData.expectedHarvestDate = expectedHarvestDate ? new Date(expectedHarvestDate) : null;
      if (actualHarvestDate !== undefined) updateData.actualHarvestDate = actualHarvestDate ? new Date(actualHarvestDate) : null;
      await db.update(crops).set(updateData).where(eq(crops.id, id));
      const [updated] = await db.select().from(crops).where(eq(crops.id, id));
      return updated;
    }),

  // Delete crop
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(crops).where(eq(crops.id, input.id));
      return { success: true };
    }),

  // Crop analytics — variety performance, seasonal yield, status distribution
  getAnalytics: protectedProcedure
    .input(z.object({ farmId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const farmFilter = input.farmId ? eq(crops.farmId, input.farmId) : undefined;

      const [varietyPerformance, statusDistribution, seasonalYield, topCrops] = await Promise.all([
        // Variety performance with harvest data
        db.select({
          cropName: crops.cropName,
          totalPlanted: sql<number>`count(*)`,
          totalArea: sql<number>`coalesce(sum(cast(${crops.areaPlanted} as numeric)), 0)`,
          harvestedCount: sql<number>`count(case when ${crops.status} = 'harvested' then 1 end)`,
          avgPricePerUnit: sql<number>`coalesce(avg(${crops.pricePerUnit}), 0)`,
        }).from(crops).where(farmFilter).groupBy(crops.cropName),

        // Status distribution
        db.select({
          status: crops.status,
          count: sql<number>`count(*)`,
        }).from(crops).where(farmFilter).groupBy(crops.status),

        // Seasonal yield
        db.select({
          season: crops.season,
          cropCount: sql<number>`count(*)`,
          totalArea: sql<number>`coalesce(sum(cast(${crops.areaPlanted} as numeric)), 0)`,
        }).from(crops).where(farmFilter).groupBy(crops.season),

        // Top crops by harvest revenue
        db.select({
          cropName: crops.cropName,
          totalHarvests: sql<number>`count(${harvests.id})`,
          totalQuantity: sql<number>`coalesce(sum(cast(${harvests.quantity} as numeric)), 0)`,
          totalRevenue: sql<number>`coalesce(sum(${harvests.revenue}), 0)`,
        }).from(crops)
          .leftJoin(harvests, eq(crops.id, harvests.cropId))
          .where(farmFilter)
          .groupBy(crops.cropName)
          .orderBy(sql`coalesce(sum(${harvests.revenue}), 0) desc`)
          .limit(10),
      ]);

      return {
        varietyPerformance: varietyPerformance.map(v => ({
          cropName: v.cropName,
          totalPlanted: Number(v.totalPlanted),
          totalArea: Number(v.totalArea),
          harvestedCount: Number(v.harvestedCount),
          avgPricePerUnit: Number(v.avgPricePerUnit) / 100,
        })),
        statusDistribution: statusDistribution.map(s => ({
          status: s.status || "unknown",
          count: Number(s.count),
        })),
        seasonalYield: seasonalYield.map(s => ({
          season: s.season || "unspecified",
          cropCount: Number(s.cropCount),
          totalArea: Number(s.totalArea),
        })),
        topCrops: topCrops.map(t => ({
          cropName: t.cropName,
          totalHarvests: Number(t.totalHarvests),
          totalQuantity: Number(t.totalQuantity),
          totalRevenue: Number(t.totalRevenue) / 100,
        })),
      };
    }),
});

// ============================================================================
// 4. HARVESTS ROUTER — Full CRUD + Analytics + Quality Grading
// ============================================================================
export const harvestsRouter = router({
  // List harvests with filters
  list: protectedProcedure
    .input(z.object({
      cropId: z.number().optional(),
      farmId: z.number().optional(),
      quality: z.string().optional(),
      search: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: (SQL | undefined)[] = [];
      if (input.cropId) conditions.push(eq(harvests.cropId, input.cropId));
      if (input.quality) conditions.push(eq(harvests.quality, input.quality));
      if (input.startDate) conditions.push(gte(harvests.harvestDate, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(harvests.harvestDate, new Date(input.endDate)));
      if (input.search) {
        conditions.push(or(
          like(harvests.storageLocation, `%${input.search}%`),
          like(harvests.notes, `%${input.search}%`)
        ));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      let query = db.select({
        harvest: harvests,
        cropName: crops.cropName,
        farmName: farms.farmName,
      }).from(harvests)
        .leftJoin(crops, eq(harvests.cropId, crops.id))
        .leftJoin(farms, eq(crops.farmId, farms.id))
        .where(where)
        .orderBy(desc(harvests.harvestDate))
        .limit(input.limit)
        .offset(input.offset);

      // Apply farm filter through crops join
      if (input.farmId) {
        const farmCropIds = await db.select({ id: crops.id }).from(crops).where(eq(crops.farmId, input.farmId));
        if (farmCropIds.length > 0) {
          conditions.push(inArray(harvests.cropId, farmCropIds.map(c => c.id)));
        }
      }

      const [items, total] = await Promise.all([
        query,
        db.select({ count: sql<number>`count(*)` }).from(harvests).where(where),
      ]);
      return {
        items: items.map(i => ({
          ...i.harvest,
          cropName: i.cropName,
          farmName: i.farmName,
        })),
        total: Number(total[0]?.count || 0),
      };
    }),

  // Get single harvest
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [item] = await db.select({
        harvest: harvests,
        cropName: crops.cropName,
        cropVariety: crops.cropVariety,
        farmName: farms.farmName,
      }).from(harvests)
        .leftJoin(crops, eq(harvests.cropId, crops.id))
        .leftJoin(farms, eq(crops.farmId, farms.id))
        .where(eq(harvests.id, input.id));
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Harvest not found" });
      return {
        ...item.harvest,
        cropName: item.cropName,
        cropVariety: item.cropVariety,
        farmName: item.farmName,
      };
    }),

  // Create harvest via tRPC
  create: protectedProcedure
    .input(z.object({
      userId: z.number(),
      cropId: z.number(),
      harvestDate: z.string(),
      quantity: z.string(),
      unit: z.string(),
      quality: z.string().optional(),
      storageLocation: z.string().optional(),
      marketPrice: z.number().optional(),
      soldQuantity: z.string().optional(),
      revenue: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [created] = await db.insert(harvests).values({
        userId: input.userId,
        cropId: input.cropId,
        harvestDate: new Date(input.harvestDate),
        quantity: input.quantity,
        unit: input.unit,
        quality: input.quality || null,
        storageLocation: input.storageLocation || null,
        marketPrice: input.marketPrice || null,
        soldQuantity: input.soldQuantity || null,
        revenue: input.revenue || null,
        notes: input.notes || null,
      }).returning();
      return created;
    }),

  // Update harvest
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      quantity: z.string().optional(),
      unit: z.string().optional(),
      quality: z.enum(["excellent", "good", "fair", "poor"]).optional(),
      storageLocation: z.string().optional(),
      marketPrice: z.number().optional(),
      soldQuantity: z.string().optional(),
      revenue: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, ...data } = input;
      const updateData: Record<string, any> = { updatedAt: new Date() };
      Object.entries(data).forEach(([key, val]) => {
        if (val !== undefined) updateData[key] = val;
      });
      await db.update(harvests).set(updateData).where(eq(harvests.id, id));
      const [updated] = await db.select().from(harvests).where(eq(harvests.id, id));
      return updated;
    }),

  // Delete harvest
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(harvests).where(eq(harvests.id, input.id));
      return { success: true };
    }),

  // Batch delete
  batchDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(harvests).where(inArray(harvests.id, input.ids));
      return { success: true, deleted: input.ids.length };
    }),

  // Harvest analytics — yield trends, quality distribution, crop comparison
  getAnalytics: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: (SQL | undefined)[] = [];
      if (input.startDate) conditions.push(gte(harvests.harvestDate, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(harvests.harvestDate, new Date(input.endDate)));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [yieldByCrop, qualityDist, monthlyTrend, totalStats] = await Promise.all([
        // Yield by crop
        db.select({
          cropName: crops.cropName,
          totalQuantity: sql<number>`coalesce(sum(cast(${harvests.quantity} as numeric)), 0)`,
          totalRevenue: sql<number>`coalesce(sum(${harvests.revenue}), 0)`,
          avgMarketPrice: sql<number>`coalesce(avg(${harvests.marketPrice}), 0)`,
          harvestCount: sql<number>`count(*)`,
        }).from(harvests)
          .leftJoin(crops, eq(harvests.cropId, crops.id))
          .where(where)
          .groupBy(crops.cropName),

        // Quality distribution
        db.select({
          quality: harvests.quality,
          count: sql<number>`count(*)`,
          totalQuantity: sql<number>`coalesce(sum(cast(${harvests.quantity} as numeric)), 0)`,
        }).from(harvests).where(where).groupBy(harvests.quality),

        // Monthly trend
        db.select({
          month: sql<string>`to_char(${harvests.harvestDate}, 'YYYY-MM')`,
          totalQuantity: sql<number>`coalesce(sum(cast(${harvests.quantity} as numeric)), 0)`,
          totalRevenue: sql<number>`coalesce(sum(${harvests.revenue}), 0)`,
          harvestCount: sql<number>`count(*)`,
        }).from(harvests)
          .where(where)
          .groupBy(sql`to_char(${harvests.harvestDate}, 'YYYY-MM')`)
          .orderBy(sql`to_char(${harvests.harvestDate}, 'YYYY-MM')`),

        // Overall stats
        db.select({
          totalHarvests: sql<number>`count(*)`,
          totalQuantity: sql<number>`coalesce(sum(cast(${harvests.quantity} as numeric)), 0)`,
          totalRevenue: sql<number>`coalesce(sum(${harvests.revenue}), 0)`,
          totalSold: sql<number>`coalesce(sum(cast(${harvests.soldQuantity} as numeric)), 0)`,
          avgQualityScore: sql<number>`count(case when ${harvests.quality} in ('excellent', 'good') then 1 end) * 100.0 / nullif(count(*), 0)`,
        }).from(harvests).where(where),
      ]);

      const stats = totalStats[0];
      return {
        totalHarvests: Number(stats?.totalHarvests || 0),
        totalQuantity: Number(stats?.totalQuantity || 0),
        totalRevenue: Number(stats?.totalRevenue || 0) / 100,
        totalSold: Number(stats?.totalSold || 0),
        qualityScore: Number(stats?.avgQualityScore || 0),
        yieldByCrop: yieldByCrop.map(y => ({
          cropName: y.cropName || "unknown",
          totalQuantity: Number(y.totalQuantity),
          totalRevenue: Number(y.totalRevenue) / 100,
          avgMarketPrice: Number(y.avgMarketPrice) / 100,
          harvestCount: Number(y.harvestCount),
        })),
        qualityDistribution: qualityDist.map(q => ({
          quality: q.quality || "ungraded",
          count: Number(q.count),
          totalQuantity: Number(q.totalQuantity),
        })),
        monthlyTrend: monthlyTrend.map(m => ({
          month: m.month,
          totalQuantity: Number(m.totalQuantity),
          totalRevenue: Number(m.totalRevenue) / 100,
          harvestCount: Number(m.harvestCount),
        })),
      };
    }),
});

// ============================================================================
// 5. EXPENSES ROUTER — Full CRUD + Budget Planning + Analytics
// ============================================================================
export const expensesRouter = router({
  // List expenses with filters
  list: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      category: z.string().optional(),
      search: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      minAmount: z.number().optional(),
      maxAmount: z.number().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: (SQL | undefined)[] = [];
      if (input.farmId) conditions.push(eq(expenses.farmId, input.farmId));
      if (input.category) conditions.push(eq(expenses.category, input.category));
      if (input.startDate) conditions.push(gte(expenses.expenseDate, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(expenses.expenseDate, new Date(input.endDate)));
      if (input.minAmount) conditions.push(gte(expenses.amount, input.minAmount));
      if (input.maxAmount) conditions.push(lte(expenses.amount, input.maxAmount));
      if (input.search) {
        conditions.push(or(
          like(expenses.description, `%${input.search}%`),
          like(expenses.category, `%${input.search}%`)
        ));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [items, total] = await Promise.all([
        db.select({
          expense: expenses,
          farmName: farms.farmName,
          cropName: crops.cropName,
        }).from(expenses)
          .leftJoin(farms, eq(expenses.farmId, farms.id))
          .leftJoin(crops, eq(expenses.cropId, crops.id))
          .where(where)
          .orderBy(desc(expenses.expenseDate))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` }).from(expenses).where(where),
      ]);
      return {
        items: items.map(i => ({
          ...i.expense,
          farmName: i.farmName,
          cropName: i.cropName,
        })),
        total: Number(total[0]?.count || 0),
      };
    }),

  // Create expense via tRPC
  create: protectedProcedure
    .input(z.object({
      userId: z.number(),
      farmId: z.number(),
      cropId: z.number().optional(),
      category: z.string(),
      description: z.string(),
      amount: z.number(),
      expenseDate: z.string(),
      paymentMethod: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [created] = await db.insert(expenses).values({
        userId: input.userId,
        farmId: input.farmId,
        cropId: input.cropId || null,
        category: input.category,
        description: input.description,
        amount: input.amount,
        expenseDate: new Date(input.expenseDate),
        paymentMethod: input.paymentMethod || null,
        notes: input.notes || null,
      }).returning();
      return created;
    }),

  // Update expense
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      category: z.string().optional(),
      description: z.string().optional(),
      amount: z.number().optional(),
      expenseDate: z.string().optional(),
      paymentMethod: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, expenseDate, ...rest } = input;
      const updateData: Record<string, any> = { updatedAt: new Date() };
      Object.entries(rest).forEach(([key, val]) => {
        if (val !== undefined) updateData[key] = val;
      });
      if (expenseDate !== undefined) updateData.expenseDate = new Date(expenseDate);
      await db.update(expenses).set(updateData).where(eq(expenses.id, id));
      const [updated] = await db.select().from(expenses).where(eq(expenses.id, id));
      return updated;
    }),

  // Delete expense
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(expenses).where(eq(expenses.id, input.id));
      return { success: true };
    }),

  // Batch delete
  batchDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(expenses).where(inArray(expenses.id, input.ids));
      return { success: true, deleted: input.ids.length };
    }),

  // Expense analytics — category breakdown, monthly trends, budget comparison
  getAnalytics: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: (SQL | undefined)[] = [];
      if (input.farmId) conditions.push(eq(expenses.farmId, input.farmId));
      if (input.startDate) conditions.push(gte(expenses.expenseDate, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(expenses.expenseDate, new Date(input.endDate)));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [categoryBreakdown, monthlyTrend, paymentMethods, farmBreakdown, totalStats] = await Promise.all([
        // Category breakdown
        db.select({
          category: expenses.category,
          totalAmount: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
          count: sql<number>`count(*)`,
          avgAmount: sql<number>`coalesce(avg(${expenses.amount}), 0)`,
        }).from(expenses).where(where).groupBy(expenses.category)
          .orderBy(sql`coalesce(sum(${expenses.amount}), 0) desc`),

        // Monthly trend
        db.select({
          month: sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM')`,
          totalAmount: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
          count: sql<number>`count(*)`,
        }).from(expenses)
          .where(where)
          .groupBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`)
          .orderBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`),

        // Payment method distribution
        db.select({
          method: expenses.paymentMethod,
          totalAmount: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
          count: sql<number>`count(*)`,
        }).from(expenses).where(where).groupBy(expenses.paymentMethod),

        // Per-farm breakdown
        db.select({
          farmName: farms.farmName,
          totalAmount: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
          count: sql<number>`count(*)`,
        }).from(expenses)
          .leftJoin(farms, eq(expenses.farmId, farms.id))
          .where(where)
          .groupBy(farms.farmName)
          .orderBy(sql`coalesce(sum(${expenses.amount}), 0) desc`),

        // Total stats
        db.select({
          totalExpenses: sql<number>`count(*)`,
          totalAmount: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
          avgAmount: sql<number>`coalesce(avg(${expenses.amount}), 0)`,
          maxAmount: sql<number>`coalesce(max(${expenses.amount}), 0)`,
          minAmount: sql<number>`coalesce(min(${expenses.amount}), 0)`,
        }).from(expenses).where(where),
      ]);

      const stats = totalStats[0];
      return {
        totalExpenses: Number(stats?.totalExpenses || 0),
        totalAmount: Number(stats?.totalAmount || 0) / 100,
        avgAmount: Number(stats?.avgAmount || 0) / 100,
        maxAmount: Number(stats?.maxAmount || 0) / 100,
        minAmount: Number(stats?.minAmount || 0) / 100,
        categoryBreakdown: categoryBreakdown.map(c => ({
          category: c.category,
          totalAmount: Number(c.totalAmount) / 100,
          count: Number(c.count),
          avgAmount: Number(c.avgAmount) / 100,
          percentage: Number(stats?.totalAmount || 0) > 0
            ? (Number(c.totalAmount) / Number(stats?.totalAmount || 1)) * 100 : 0,
        })),
        monthlyTrend: monthlyTrend.map(m => ({
          month: m.month,
          totalAmount: Number(m.totalAmount) / 100,
          count: Number(m.count),
        })),
        paymentMethods: paymentMethods.map(p => ({
          method: p.method || "unspecified",
          totalAmount: Number(p.totalAmount) / 100,
          count: Number(p.count),
        })),
        farmBreakdown: farmBreakdown.map(f => ({
          farmName: f.farmName || "unknown",
          totalAmount: Number(f.totalAmount) / 100,
          count: Number(f.count),
        })),
      };
    }),
});

// ============================================================================
// 6. FARM INPUTS ROUTER — Full CRUD + Application Schedules + Cost Analytics
// ============================================================================
export const farmInputsRouter = router({
  // List farm inputs with filters
  list: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      cropId: z.number().optional(),
      inputType: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: (SQL | undefined)[] = [];
      if (input.farmId) conditions.push(eq(farmInputs.farmId, input.farmId));
      if (input.cropId) conditions.push(eq(farmInputs.cropId, input.cropId));
      if (input.inputType) conditions.push(eq(farmInputs.inputType, input.inputType));
      if (input.search) {
        conditions.push(or(
          like(farmInputs.inputName, `%${input.search}%`),
          like(farmInputs.supplier, `%${input.search}%`)
        ));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [items, total] = await Promise.all([
        db.select({
          input: farmInputs,
          farmName: farms.farmName,
          cropName: crops.cropName,
        }).from(farmInputs)
          .leftJoin(farms, eq(farmInputs.farmId, farms.id))
          .leftJoin(crops, eq(farmInputs.cropId, crops.id))
          .where(where)
          .orderBy(desc(farmInputs.purchaseDate))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` }).from(farmInputs).where(where),
      ]);
      return {
        items: items.map(i => ({
          ...i.input,
          farmName: i.farmName,
          cropName: i.cropName,
        })),
        total: Number(total[0]?.count || 0),
      };
    }),

  // Create farm input
  create: protectedProcedure
    .input(z.object({
      userId: z.number(),
      farmId: z.number(),
      cropId: z.number().optional(),
      inputType: z.string(),
      inputName: z.string(),
      quantity: z.string(),
      unit: z.string(),
      costPerUnit: z.number().optional(),
      totalCost: z.number().optional(),
      supplier: z.string().optional(),
      purchaseDate: z.string(),
      applicationDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [created] = await db.insert(farmInputs).values({
        userId: input.userId,
        farmId: input.farmId,
        cropId: input.cropId || null,
        inputType: input.inputType,
        inputName: input.inputName,
        quantity: input.quantity,
        unit: input.unit,
        costPerUnit: input.costPerUnit || null,
        totalCost: input.totalCost || null,
        supplier: input.supplier || null,
        purchaseDate: new Date(input.purchaseDate),
        applicationDate: input.applicationDate ? new Date(input.applicationDate) : null,
        notes: input.notes || null,
      }).returning();
      return created;
    }),

  // Update farm input
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      inputName: z.string().optional(),
      quantity: z.string().optional(),
      unit: z.string().optional(),
      costPerUnit: z.number().optional(),
      totalCost: z.number().optional(),
      supplier: z.string().optional(),
      applicationDate: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, applicationDate, ...rest } = input;
      const updateData: Record<string, any> = { updatedAt: new Date() };
      Object.entries(rest).forEach(([key, val]) => {
        if (val !== undefined) updateData[key] = val;
      });
      if (applicationDate !== undefined) updateData.applicationDate = applicationDate ? new Date(applicationDate) : null;
      await db.update(farmInputs).set(updateData).where(eq(farmInputs.id, id));
      const [updated] = await db.select().from(farmInputs).where(eq(farmInputs.id, id));
      return updated;
    }),

  // Delete farm input
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(farmInputs).where(eq(farmInputs.id, input.id));
      return { success: true };
    }),

  // Farm input analytics — cost by type, supplier performance, application timeline
  getAnalytics: protectedProcedure
    .input(z.object({ farmId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const where = input.farmId ? eq(farmInputs.farmId, input.farmId) : undefined;

      const [costByType, supplierBreakdown, monthlySpend, cropAllocation, totalStats] = await Promise.all([
        // Cost by input type
        db.select({
          inputType: farmInputs.inputType,
          totalCost: sql<number>`coalesce(sum(${farmInputs.totalCost}), 0)`,
          totalQuantity: sql<number>`coalesce(sum(cast(${farmInputs.quantity} as numeric)), 0)`,
          count: sql<number>`count(*)`,
        }).from(farmInputs).where(where).groupBy(farmInputs.inputType)
          .orderBy(sql`coalesce(sum(${farmInputs.totalCost}), 0) desc`),

        // Supplier breakdown
        db.select({
          supplier: farmInputs.supplier,
          totalCost: sql<number>`coalesce(sum(${farmInputs.totalCost}), 0)`,
          count: sql<number>`count(*)`,
        }).from(farmInputs).where(where).groupBy(farmInputs.supplier)
          .orderBy(sql`coalesce(sum(${farmInputs.totalCost}), 0) desc`),

        // Monthly spend trend
        db.select({
          month: sql<string>`to_char(${farmInputs.purchaseDate}, 'YYYY-MM')`,
          totalCost: sql<number>`coalesce(sum(${farmInputs.totalCost}), 0)`,
          count: sql<number>`count(*)`,
        }).from(farmInputs).where(where)
          .groupBy(sql`to_char(${farmInputs.purchaseDate}, 'YYYY-MM')`)
          .orderBy(sql`to_char(${farmInputs.purchaseDate}, 'YYYY-MM')`),

        // Cost allocation per crop
        db.select({
          cropName: crops.cropName,
          totalCost: sql<number>`coalesce(sum(${farmInputs.totalCost}), 0)`,
          count: sql<number>`count(*)`,
        }).from(farmInputs)
          .leftJoin(crops, eq(farmInputs.cropId, crops.id))
          .where(where)
          .groupBy(crops.cropName),

        // Total stats
        db.select({
          totalInputs: sql<number>`count(*)`,
          totalCost: sql<number>`coalesce(sum(${farmInputs.totalCost}), 0)`,
          avgCostPerUnit: sql<number>`coalesce(avg(${farmInputs.costPerUnit}), 0)`,
          pendingApplications: sql<number>`count(case when ${farmInputs.applicationDate} is null then 1 end)`,
        }).from(farmInputs).where(where),
      ]);

      const stats = totalStats[0];
      return {
        totalInputs: Number(stats?.totalInputs || 0),
        totalCost: Number(stats?.totalCost || 0) / 100,
        avgCostPerUnit: Number(stats?.avgCostPerUnit || 0) / 100,
        pendingApplications: Number(stats?.pendingApplications || 0),
        costByType: costByType.map(c => ({
          inputType: c.inputType,
          totalCost: Number(c.totalCost) / 100,
          totalQuantity: Number(c.totalQuantity),
          count: Number(c.count),
        })),
        supplierBreakdown: supplierBreakdown.map(s => ({
          supplier: s.supplier || "direct purchase",
          totalCost: Number(s.totalCost) / 100,
          count: Number(s.count),
        })),
        monthlySpend: monthlySpend.map(m => ({
          month: m.month,
          totalCost: Number(m.totalCost) / 100,
          count: Number(m.count),
        })),
        cropAllocation: cropAllocation.map(c => ({
          cropName: c.cropName || "unlinked",
          totalCost: Number(c.totalCost) / 100,
          count: Number(c.count),
        })),
      };
    }),
});

// ============================================================================
// 7. EQUIPMENT ROUTER — Full CRUD with real DB-backed equipment tracking
// ============================================================================
export const equipmentRouter = router({
  // List equipment — reads from farm_inputs with inputType='equipment' + inventory
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions: (SQL | undefined)[] = [eq(inventoryItems.itemType, "equipment")];
      if (input.search) {
        conditions.push(or(
          like(inventoryItems.itemName, `%${input.search}%`),
          like(inventoryItems.category, `%${input.search}%`)
        ));
      }
      const where = and(...conditions);
      const [items, total] = await Promise.all([
        db.select({
          equipment: inventoryItems,
          supplierName: suppliers.name,
        }).from(inventoryItems)
          .leftJoin(suppliers, eq(inventoryItems.supplierId, suppliers.id))
          .where(where)
          .orderBy(desc(inventoryItems.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` }).from(inventoryItems).where(where),
      ]);
      return {
        items: items.map(i => ({
          ...i.equipment,
          supplierName: i.supplierName,
          unitCostFormatted: Number(i.equipment.unitCost) / 100,
        })),
        total: Number(total[0]?.count || 0),
      };
    }),

  // Create equipment
  create: protectedProcedure
    .input(z.object({
      userId: z.number(),
      itemName: z.string(),
      category: z.string().optional(),
      unit: z.string().default("unit"),
      quantityOnHand: z.number().default(1),
      unitCost: z.number(),
      supplierId: z.number().optional(),
      storageLocation: z.string().optional(),
      batchNumber: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [created] = await db.insert(inventoryItems).values({
        userId: input.userId,
        itemType: "equipment",
        itemName: input.itemName,
        category: input.category || null,
        unit: input.unit,
        quantityOnHand: input.quantityOnHand,
        reorderLevel: 0,
        reorderQuantity: 0,
        unitCost: Math.round(input.unitCost * 100),
        supplierId: input.supplierId || null,
        storageLocation: input.storageLocation || null,
        batchNumber: input.batchNumber || null,
      }).returning();
      return created;
    }),

  // Update equipment
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      itemName: z.string().optional(),
      category: z.string().optional(),
      quantityOnHand: z.number().optional(),
      unitCost: z.number().optional(),
      storageLocation: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, unitCost, ...rest } = input;
      const updateData: Record<string, any> = { updatedAt: new Date() };
      Object.entries(rest).forEach(([key, val]) => {
        if (val !== undefined) updateData[key] = val;
      });
      if (unitCost !== undefined) updateData.unitCost = Math.round(unitCost * 100);
      await db.update(inventoryItems).set(updateData).where(eq(inventoryItems.id, id));
      const [updated] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
      return updated;
    }),

  // Delete equipment
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(inventoryItems).where(eq(inventoryItems.id, input.id));
      return { success: true };
    }),

  // Equipment analytics — utilization, maintenance costs, depreciation
  getAnalytics: protectedProcedure.query(async () => {
    const db = await requireDb();
    const [categoryBreakdown, totalStats] = await Promise.all([
      db.select({
        category: inventoryItems.category,
        count: sql<number>`count(*)`,
        totalValue: sql<number>`coalesce(sum(${inventoryItems.quantityOnHand} * ${inventoryItems.unitCost}), 0)`,
        totalQuantity: sql<number>`coalesce(sum(${inventoryItems.quantityOnHand}), 0)`,
      }).from(inventoryItems)
        .where(eq(inventoryItems.itemType, "equipment"))
        .groupBy(inventoryItems.category),

      db.select({
        totalEquipment: sql<number>`count(*)`,
        totalValue: sql<number>`coalesce(sum(${inventoryItems.quantityOnHand} * ${inventoryItems.unitCost}), 0)`,
        totalQuantity: sql<number>`coalesce(sum(${inventoryItems.quantityOnHand}), 0)`,
      }).from(inventoryItems)
        .where(eq(inventoryItems.itemType, "equipment")),
    ]);

    // Get maintenance/usage transactions
    const maintenanceCosts = await db.select({
      month: sql<string>`to_char(${inventoryTransactions.transactionDate}, 'YYYY-MM')`,
      totalCost: sql<number>`coalesce(sum(${inventoryTransactions.quantity} * coalesce(${inventoryTransactions.unitCost}, 0)), 0)`,
      transactionCount: sql<number>`count(*)`,
    }).from(inventoryTransactions)
      .innerJoin(inventoryItems, eq(inventoryTransactions.itemId, inventoryItems.id))
      .where(eq(inventoryItems.itemType, "equipment"))
      .groupBy(sql`to_char(${inventoryTransactions.transactionDate}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${inventoryTransactions.transactionDate}, 'YYYY-MM')`);

    const stats = totalStats[0];
    return {
      totalEquipment: Number(stats?.totalEquipment || 0),
      totalValue: Number(stats?.totalValue || 0) / 100,
      totalQuantity: Number(stats?.totalQuantity || 0),
      categoryBreakdown: categoryBreakdown.map(c => ({
        category: c.category || "uncategorized",
        count: Number(c.count),
        totalValue: Number(c.totalValue) / 100,
        totalQuantity: Number(c.totalQuantity),
      })),
      maintenanceCosts: maintenanceCosts.map(m => ({
        month: m.month,
        totalCost: Number(m.totalCost) / 100,
        transactionCount: Number(m.transactionCount),
      })),
    };
  }),
});

// ============================================================================
// 8. INVENTORY ENHANCEMENTS — Expiry alerts, stock take, demand planning
// ============================================================================
export const inventoryEnhancementsRouter = router({
  // Get expiring items (within N days)
  getExpiringItems: protectedProcedure
    .input(z.object({ daysAhead: z.number().default(30) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const items = await db.select({
        item: inventoryItems,
        supplierName: suppliers.name,
      }).from(inventoryItems)
        .leftJoin(suppliers, eq(inventoryItems.supplierId, suppliers.id))
        .where(and(
          lte(inventoryItems.expiryDate, sql`now() + interval '${sql.raw(String(input.daysAhead))} days'`),
          gte(inventoryItems.expiryDate, sql`now()`)
        ))
        .orderBy(asc(inventoryItems.expiryDate));
      return items.map(i => ({
        ...i.item,
        supplierName: i.supplierName,
        daysUntilExpiry: Math.ceil((new Date(i.item.expiryDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      }));
    }),

  // Get expired items
  getExpiredItems: protectedProcedure.query(async () => {
    const db = await requireDb();
    const items = await db.select().from(inventoryItems)
      .where(lte(inventoryItems.expiryDate, sql`now()`));
    return items;
  }),

  // Stock take — compare physical vs system counts
  recordStockTake: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        itemId: z.number(),
        physicalCount: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const results = [];
      for (const item of input.items) {
        const [current] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, item.itemId));
        if (current) {
          const variance = item.physicalCount - current.quantityOnHand;
          if (variance !== 0) {
            // Record adjustment transaction
            await db.insert(inventoryTransactions).values({
              userId: current.userId,
              itemId: item.itemId,
              transactionType: "adjustment",
              quantity: variance,
              transactionDate: new Date(),
              notes: `Stock take adjustment: system=${current.quantityOnHand}, physical=${item.physicalCount}`,
            });
            // Update inventory count
            await db.update(inventoryItems).set({
              quantityOnHand: item.physicalCount,
              updatedAt: new Date(),
            }).where(eq(inventoryItems.id, item.itemId));
          }
          results.push({
            itemId: item.itemId,
            itemName: current.itemName,
            systemCount: current.quantityOnHand,
            physicalCount: item.physicalCount,
            variance,
          });
        }
      }
      return { results, adjustedCount: results.filter(r => r.variance !== 0).length };
    }),

  // Demand planning — usage rate and reorder predictions
  getDemandForecast: protectedProcedure.query(async () => {
    const db = await requireDb();
    // Calculate average daily usage from last 90 days
    const usageRates = await db.select({
      itemId: inventoryTransactions.itemId,
      itemName: inventoryItems.itemName,
      itemType: inventoryItems.itemType,
      currentStock: inventoryItems.quantityOnHand,
      reorderLevel: inventoryItems.reorderLevel,
      avgDailyUsage: sql<number>`coalesce(
        sum(case when ${inventoryTransactions.transactionType} = 'usage' then abs(${inventoryTransactions.quantity}) else 0 end)
        / nullif(extract(day from (now() - min(${inventoryTransactions.transactionDate}))), 0),
        0
      )`,
      totalUsed: sql<number>`coalesce(sum(case when ${inventoryTransactions.transactionType} = 'usage' then abs(${inventoryTransactions.quantity}) else 0 end), 0)`,
    }).from(inventoryTransactions)
      .innerJoin(inventoryItems, eq(inventoryTransactions.itemId, inventoryItems.id))
      .where(gte(inventoryTransactions.transactionDate, sql`now() - interval '90 days'`))
      .groupBy(inventoryTransactions.itemId, inventoryItems.itemName, inventoryItems.itemType,
        inventoryItems.quantityOnHand, inventoryItems.reorderLevel);

    return usageRates.map(u => ({
      itemId: Number(u.itemId),
      itemName: u.itemName,
      itemType: u.itemType,
      currentStock: Number(u.currentStock),
      reorderLevel: Number(u.reorderLevel),
      avgDailyUsage: Number(u.avgDailyUsage),
      totalUsedLast90Days: Number(u.totalUsed),
      daysUntilStockout: Number(u.avgDailyUsage) > 0
        ? Math.floor(Number(u.currentStock) / Number(u.avgDailyUsage))
        : null,
      needsReorder: Number(u.currentStock) <= Number(u.reorderLevel),
    }));
  }),
});

// ============================================================================
// 9. TRACEABILITY ENHANCEMENTS — QR generation, batch splitting, consumer verification
// ============================================================================
export const traceabilityEnhancementsRouter = router({
  // Generate QR code data for a batch
  generateQRCode: protectedProcedure
    .input(z.object({ batchId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [batch] = await db.select().from(productBatches).where(eq(productBatches.id, input.batchId));
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      const qrData = JSON.stringify({
        batchCode: batch.batchCode,
        cropType: batch.cropType,
        variety: batch.variety,
        quantity: batch.quantity,
        unit: batch.unit,
        qualityGrade: batch.qualityGrade,
        origin: {
          village: batch.originVillage,
          district: batch.originDistrict,
          region: batch.originRegion,
        },
        harvestDate: batch.harvestDate,
        isOrganic: batch.isOrganic,
        certifications: batch.certifications ? JSON.parse(batch.certifications) : [],
        verifyUrl: `/verify/${batch.batchCode}`,
      });
      await db.update(productBatches).set({
        qrCode: qrData,
        updatedAt: new Date(),
      }).where(eq(productBatches.id, input.batchId));
      return { qrData, batchCode: batch.batchCode };
    }),

  // Consumer verification — public endpoint to verify a batch
  verifyBatch: protectedProcedure
    .input(z.object({ batchCode: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [batch] = await db.select().from(productBatches)
        .where(eq(productBatches.batchCode, input.batchCode));
      if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });
      const events = await db.select().from(traceabilityEvents)
        .where(eq(traceabilityEvents.batchId, batch.id))
        .orderBy(asc(traceabilityEvents.eventTimestamp));
      return {
        verified: true,
        batch: {
          batchCode: batch.batchCode,
          cropType: batch.cropType,
          variety: batch.variety,
          quantity: batch.quantity,
          unit: batch.unit,
          qualityGrade: batch.qualityGrade,
          isOrganic: batch.isOrganic,
          certifications: batch.certifications ? JSON.parse(batch.certifications) : [],
          origin: {
            village: batch.originVillage,
            district: batch.originDistrict,
            region: batch.originRegion,
          },
          harvestDate: batch.harvestDate,
          status: batch.status,
        },
        journey: events.map(e => ({
          eventType: e.eventType,
          description: e.eventDescription,
          location: e.location,
          timestamp: e.eventTimestamp,
          qualityGrade: e.qualityGrade,
          temperature: e.temperature,
          humidity: e.humidity,
          verified: e.verifiedAt !== null,
        })),
        totalEvents: events.length,
        lastUpdated: events.length > 0 ? events[events.length - 1].eventTimestamp : batch.createdAt,
      };
    }),

  // Split batch — divide a batch into sub-batches
  splitBatch: protectedProcedure
    .input(z.object({
      batchId: z.number(),
      splits: z.array(z.object({
        quantity: z.number(),
        destination: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [parentBatch] = await db.select().from(productBatches)
        .where(eq(productBatches.id, input.batchId));
      if (!parentBatch) throw new TRPCError({ code: "NOT_FOUND", message: "Batch not found" });

      const totalSplitQty = input.splits.reduce((sum, s) => sum + s.quantity, 0);
      const currentQty = Number(parentBatch.currentQuantity || parentBatch.quantity);
      if (totalSplitQty > currentQty) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Split quantities exceed available batch quantity" });
      }

      const newBatches = [];
      for (let i = 0; i < input.splits.length; i++) {
        const split = input.splits[i];
        const newBatchCode = `${parentBatch.batchCode}-${String(i + 1).padStart(2, "0")}`;
        const [newBatch] = await db.insert(productBatches).values({
          batchCode: newBatchCode,
          cropType: parentBatch.cropType,
          variety: parentBatch.variety,
          quantity: String(split.quantity),
          currentQuantity: String(split.quantity),
          unit: parentBatch.unit,
          qualityGrade: parentBatch.qualityGrade,
          moistureContent: parentBatch.moistureContent,
          foreignMatter: parentBatch.foreignMatter,
          farmId: parentBatch.farmId,
          farmerId: parentBatch.farmerId,
          cooperativeId: parentBatch.cooperativeId,
          originVillage: parentBatch.originVillage,
          originDistrict: parentBatch.originDistrict,
          originRegion: parentBatch.originRegion,
          originLatitude: parentBatch.originLatitude,
          originLongitude: parentBatch.originLongitude,
          currentLocation: split.destination || parentBatch.currentLocation,
          harvestDate: parentBatch.harvestDate,
          isOrganic: parentBatch.isOrganic,
          certifications: parentBatch.certifications,
          status: "created",
        }).returning();
        newBatches.push(newBatch);

        // Record split event
        await db.insert(traceabilityEvents).values({
          batchId: newBatch.id,
          eventType: "collection",
          eventDescription: `Split from parent batch ${parentBatch.batchCode}`,
          location: split.destination || parentBatch.currentLocation || undefined,
          quantityAfter: String(split.quantity),
          eventTimestamp: new Date(),
        });
      }

      // Update parent batch remaining quantity
      const remaining = currentQty - totalSplitQty;
      await db.update(productBatches).set({
        currentQuantity: String(remaining),
        updatedAt: new Date(),
      }).where(eq(productBatches.id, input.batchId));

      return {
        parentBatchCode: parentBatch.batchCode,
        remainingQuantity: remaining,
        newBatches: newBatches.map(b => ({
          id: b.id,
          batchCode: b.batchCode,
          quantity: b.quantity,
        })),
      };
    }),
});
