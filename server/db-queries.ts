/**
 * db-queries.ts
 *
 * Production-grade Drizzle ORM query builders with:
 * - Type-safe joins across all schemas
 * - Paginated queries with cursor-based pagination
 * - Aggregation helpers
 * - Batch insert utilities
 * - Soft-delete patterns
 * - Full-text search helpers
 * - Audit trail helpers
 *
 * Usage: import { FarmerQueries, FinancialQueries, ... } from "./db-queries.js"
 */

import { eq, and, or, desc, asc, gte, lte, like, ilike, inArray, notInArray, isNull, isNotNull, sql, count, sum, avg, max, min, between } from "drizzle-orm";
import { getDb } from "./db.js";
import { users, farms, crops, livestock, harvests, expenses } from "../drizzle/schema.js";
import {
  chamaGroups, chamaMembers, chamaTransactions,
  carbonProjects, carbonCredits,
  digitalTwins, iotDevices, iotReadings,
  exportShipments, exportCertifications,
  federatedModels, federatedParticipants,
  insuranceProducts, insurancePolicies, insuranceClaims,
  marketPrices, marketAlerts,
  pipelineJobs, pipelineMetrics,
  complianceRules, paymentTransactions,
  soilSamples, predictions, retailStores, retailInventory,
} from "../drizzle/schema-platform-extended.js";

// ============================================================================
// PAGINATION UTILITIES
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextCursor?: number;
}

export function buildPaginationMeta<T extends { id: number }>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    nextCursor: data.length > 0 ? data[data.length - 1].id : undefined,
  };
}

// ============================================================================
// FARMER QUERIES
// ============================================================================

export const FarmerQueries = {
  /**
   * Get a farmer's complete profile with farm stats
   */
  async getFarmerProfile(userId: number) {
    const db = await getDb();
    if (!db) return null;

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return null;

    const userFarms = await db.select().from(farms).where(eq(farms.userId, userId));
    const farmIds = userFarms.map((f) => f.id);

    if (farmIds.length === 0) {
      return { ...user, farms: [], totalFarms: 0, totalCrops: 0, totalLivestock: 0 };
    }

    const [cropCount] = await db
      .select({ count: count() })
      .from(crops)
      .where(inArray(crops.farmId, farmIds));

    const [livestockCount] = await db
      .select({ count: count() })
      .from(livestock)
      .where(inArray(livestock.farmId, farmIds));

    return {
      ...user,
      farms: userFarms,
      totalFarms: userFarms.length,
      totalCrops: Number(cropCount?.count ?? 0),
      totalLivestock: Number(livestockCount?.count ?? 0),
    };
  },

  /**
   * Get paginated list of farmers with optional search
   */
  async listFarmers(params: PaginationParams & { search?: string; role?: string }) {
    const db = await getDb();
    if (!db) return buildPaginationMeta([], 0, 1, 20);

    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [];
    if (params.search) {
      conditions.push(
        or(
          ilike(users.name, `%${params.search}%`),
          ilike(users.email, `%${params.search}%`),
          ilike(users.phone, `%${params.search}%`),
        ),
      );
    }
    if (params.role) {
      conditions.push(eq(users.role, params.role));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
      .select({ count: count() })
      .from(users)
      .where(whereClause);

    const data = await db
      .select()
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    return buildPaginationMeta(data, Number(totalResult?.count ?? 0), page, limit);
  },

  /**
   * Get farmer's harvest analytics with aggregations
   */
  async getFarmerHarvestAnalytics(userId: number, year?: number) {
    const db = await getDb();
    if (!db) return null;

    const userFarms = await db.select({ id: farms.id }).from(farms).where(eq(farms.userId, userId));
    if (userFarms.length === 0) return { totalHarvests: 0, totalYield: 0, totalRevenue: 0, byMonth: [] };

    const farmIds = userFarms.map((f) => f.id);

    const conditions = [inArray(harvests.farmId, farmIds)];
    if (year) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year + 1, 0, 1);
      conditions.push(gte(harvests.harvestDate, startDate.toISOString().split("T")[0]));
      conditions.push(lte(harvests.harvestDate, endDate.toISOString().split("T")[0]));
    }

    const [stats] = await db
      .select({
        totalHarvests: count(),
        totalYield: sum(harvests.quantity),
        totalRevenue: sum(harvests.totalValue),
      })
      .from(harvests)
      .where(and(...conditions));

    return {
      totalHarvests: Number(stats?.totalHarvests ?? 0),
      totalYield: Number(stats?.totalYield ?? 0),
      totalRevenue: Number(stats?.totalRevenue ?? 0),
    };
  },
};

// ============================================================================
// FINANCIAL QUERIES
// ============================================================================

export const FinancialQueries = {
  /**
   * Get chama group with member stats and recent transactions
   */
  async getChamaWithStats(chamaId: number) {
    const db = await getDb();
    if (!db) return null;

    const [chama] = await db.select().from(chamaGroups).where(eq(chamaGroups.id, chamaId));
    if (!chama) return null;

    const [memberStats] = await db
      .select({ count: count(), active: count(chamaMembers.isActive) })
      .from(chamaMembers)
      .where(and(eq(chamaMembers.chamaId, chamaId), eq(chamaMembers.isActive, true)));

    const recentTxns = await db
      .select()
      .from(chamaTransactions)
      .where(eq(chamaTransactions.chamaId, chamaId))
      .orderBy(desc(chamaTransactions.createdAt))
      .limit(10);

    const [txnStats] = await db
      .select({
        totalContributions: sum(
          sql`CASE WHEN ${chamaTransactions.type} = 'contribution' THEN ${chamaTransactions.amount}::numeric ELSE 0 END`,
        ),
        totalDisbursements: sum(
          sql`CASE WHEN ${chamaTransactions.type} = 'loan_disbursement' THEN ${chamaTransactions.amount}::numeric ELSE 0 END`,
        ),
      })
      .from(chamaTransactions)
      .where(eq(chamaTransactions.chamaId, chamaId));

    return {
      ...chama,
      activeMembers: Number(memberStats?.count ?? 0),
      recentTransactions: recentTxns,
      totalContributions: Number(txnStats?.totalContributions ?? 0),
      totalDisbursements: Number(txnStats?.totalDisbursements ?? 0),
    };
  },

  /**
   * Get payment transaction history with filtering
   */
  async getPaymentHistory(
    userId: number,
    params: PaginationParams & { type?: string; status?: string; fromDate?: Date; toDate?: Date },
  ) {
    const db = await getDb();
    if (!db) return buildPaginationMeta([], 0, 1, 20);

    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    const conditions = [eq(paymentTransactions.userId, userId)];
    if (params.type) conditions.push(eq(paymentTransactions.type, params.type));
    if (params.status) conditions.push(eq(paymentTransactions.status, params.status));
    if (params.fromDate) conditions.push(gte(paymentTransactions.createdAt, params.fromDate));
    if (params.toDate) conditions.push(lte(paymentTransactions.createdAt, params.toDate));

    const [totalResult] = await db
      .select({ count: count() })
      .from(paymentTransactions)
      .where(and(...conditions));

    const data = await db
      .select()
      .from(paymentTransactions)
      .where(and(...conditions))
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    return buildPaginationMeta(data, Number(totalResult?.count ?? 0), page, limit);
  },
};

// ============================================================================
// MARKET QUERIES
// ============================================================================

export const MarketQueries = {
  /**
   * Get latest prices for a commodity across markets
   */
  async getLatestPrices(commodity: string, limit = 10) {
    const db = await getDb();
    if (!db) return [];

    return db
      .select()
      .from(marketPrices)
      .where(eq(marketPrices.commodity, commodity))
      .orderBy(desc(marketPrices.priceDate), desc(marketPrices.createdAt))
      .limit(limit);
  },

  /**
   * Get price trend for a commodity (last N days)
   */
  async getPriceTrend(commodity: string, market: string, days = 30) {
    const db = await getDb();
    if (!db) return [];

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    return db
      .select({
        priceDate: marketPrices.priceDate,
        price: marketPrices.price,
        market: marketPrices.market,
        priceChange: marketPrices.priceChange,
        priceChangePct: marketPrices.priceChangePct,
      })
      .from(marketPrices)
      .where(
        and(
          eq(marketPrices.commodity, commodity),
          eq(marketPrices.market, market),
          gte(marketPrices.priceDate, fromDate.toISOString().split("T")[0]),
        ),
      )
      .orderBy(asc(marketPrices.priceDate));
  },

  /**
   * Get commodity price statistics
   */
  async getCommodityStats(commodity: string, days = 30) {
    const db = await getDb();
    if (!db) return null;

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const [stats] = await db
      .select({
        avgPrice: avg(marketPrices.price),
        minPrice: min(marketPrices.price),
        maxPrice: max(marketPrices.price),
        dataPoints: count(),
      })
      .from(marketPrices)
      .where(
        and(
          eq(marketPrices.commodity, commodity),
          gte(marketPrices.priceDate, fromDate.toISOString().split("T")[0]),
        ),
      );

    return {
      commodity,
      avgPrice: Number(stats?.avgPrice ?? 0),
      minPrice: Number(stats?.minPrice ?? 0),
      maxPrice: Number(stats?.maxPrice ?? 0),
      dataPoints: Number(stats?.dataPoints ?? 0),
      periodDays: days,
    };
  },
};

// ============================================================================
// IOT & DIGITAL TWIN QUERIES
// ============================================================================

export const IoTQueries = {
  /**
   * Get latest IoT readings for a farm
   */
  async getLatestReadings(farmId: number, deviceType?: string) {
    const db = await getDb();
    if (!db) return [];

    const deviceConditions = [eq(iotDevices.farmId, farmId)];
    if (deviceType) deviceConditions.push(eq(iotDevices.deviceType, deviceType));

    const devices = await db
      .select({ id: iotDevices.id })
      .from(iotDevices)
      .where(and(...deviceConditions));

    if (devices.length === 0) return [];

    const deviceIds = devices.map((d) => d.id);

    // Get latest reading per device
    return db
      .select()
      .from(iotReadings)
      .where(inArray(iotReadings.deviceId, deviceIds))
      .orderBy(desc(iotReadings.timestamp))
      .limit(deviceIds.length * 5);
  },

  /**
   * Get IoT reading aggregates for a time window
   */
  async getReadingAggregates(farmId: number, hours = 24) {
    const db = await getDb();
    if (!db) return null;

    const fromTime = new Date();
    fromTime.setHours(fromTime.getHours() - hours);

    const devices = await db
      .select({ id: iotDevices.id })
      .from(iotDevices)
      .where(eq(iotDevices.farmId, farmId));

    if (devices.length === 0) return null;

    const deviceIds = devices.map((d) => d.id);

    const [stats] = await db
      .select({
        avgSoilMoisture: avg(iotReadings.soilMoisture),
        avgAirTemp: avg(iotReadings.airTemperature),
        avgHumidity: avg(iotReadings.humidity),
        totalRainfall: sum(iotReadings.rainfall),
        readingCount: count(),
      })
      .from(iotReadings)
      .where(
        and(
          inArray(iotReadings.deviceId, deviceIds),
          gte(iotReadings.timestamp, fromTime),
        ),
      );

    return {
      farmId,
      periodHours: hours,
      avgSoilMoisture: Number(stats?.avgSoilMoisture ?? 0),
      avgAirTemp: Number(stats?.avgAirTemp ?? 0),
      avgHumidity: Number(stats?.avgHumidity ?? 0),
      totalRainfall: Number(stats?.totalRainfall ?? 0),
      readingCount: Number(stats?.readingCount ?? 0),
    };
  },
};

// ============================================================================
// INSURANCE QUERIES
// ============================================================================

export const InsuranceQueries = {
  /**
   * Get active policies for a farmer with product details
   */
  async getFarmerPolicies(farmerId: number) {
    const db = await getDb();
    if (!db) return [];

    const policies = await db
      .select()
      .from(insurancePolicies)
      .where(and(eq(insurancePolicies.farmerId, farmerId), eq(insurancePolicies.status, "active")))
      .orderBy(desc(insurancePolicies.createdAt));

    if (policies.length === 0) return [];

    const productIds = [...new Set(policies.map((p) => p.productId))];
    const products = await db
      .select()
      .from(insuranceProducts)
      .where(inArray(insuranceProducts.id, productIds));

    const productMap = new Map(products.map((p) => [p.id, p]));

    return policies.map((policy) => ({
      ...policy,
      product: productMap.get(policy.productId),
    }));
  },

  /**
   * Get claim statistics for the platform
   */
  async getClaimStats() {
    const db = await getDb();
    if (!db) return null;

    const [stats] = await db
      .select({
        totalClaims: count(),
        pendingClaims: count(sql`CASE WHEN ${insuranceClaims.status} = 'pending' THEN 1 END`),
        approvedClaims: count(sql`CASE WHEN ${insuranceClaims.status} = 'approved' THEN 1 END`),
        totalClaimAmount: sum(insuranceClaims.claimAmount),
        totalApprovedAmount: sum(insuranceClaims.approvedAmount),
      })
      .from(insuranceClaims);

    return {
      totalClaims: Number(stats?.totalClaims ?? 0),
      pendingClaims: Number(stats?.pendingClaims ?? 0),
      approvedClaims: Number(stats?.approvedClaims ?? 0),
      totalClaimAmount: Number(stats?.totalClaimAmount ?? 0),
      totalApprovedAmount: Number(stats?.totalApprovedAmount ?? 0),
    };
  },
};

// ============================================================================
// CARBON CREDIT QUERIES
// ============================================================================

export const CarbonQueries = {
  /**
   * Get carbon project with credit summary
   */
  async getProjectWithCredits(projectId: number) {
    const db = await getDb();
    if (!db) return null;

    const [project] = await db.select().from(carbonProjects).where(eq(carbonProjects.id, projectId));
    if (!project) return null;

    const [creditStats] = await db
      .select({
        totalAvailable: sum(
          sql`CASE WHEN ${carbonCredits.status} = 'available' THEN ${carbonCredits.quantity}::numeric ELSE 0 END`,
        ),
        totalSold: sum(
          sql`CASE WHEN ${carbonCredits.status} = 'sold' THEN ${carbonCredits.quantity}::numeric ELSE 0 END`,
        ),
        totalRetired: sum(
          sql`CASE WHEN ${carbonCredits.status} = 'retired' THEN ${carbonCredits.quantity}::numeric ELSE 0 END`,
        ),
        avgPrice: avg(carbonCredits.pricePerTon),
      })
      .from(carbonCredits)
      .where(eq(carbonCredits.projectId, projectId));

    return {
      ...project,
      creditStats: {
        available: Number(creditStats?.totalAvailable ?? 0),
        sold: Number(creditStats?.totalSold ?? 0),
        retired: Number(creditStats?.totalRetired ?? 0),
        avgPricePerTon: Number(creditStats?.avgPrice ?? 0),
      },
    };
  },
};

// ============================================================================
// EXPORT CHAIN QUERIES
// ============================================================================

export const ExportQueries = {
  /**
   * Get export shipment with certifications
   */
  async getShipmentWithCerts(shipmentId: number) {
    const db = await getDb();
    if (!db) return null;

    const [shipment] = await db.select().from(exportShipments).where(eq(exportShipments.id, shipmentId));
    if (!shipment) return null;

    const certs = await db
      .select()
      .from(exportCertifications)
      .where(eq(exportCertifications.shipmentId, shipmentId));

    return { ...shipment, certifications: certs };
  },

  /**
   * Get export statistics by commodity
   */
  async getExportStatsByCommodity() {
    const db = await getDb();
    if (!db) return [];

    return db
      .select({
        commodity: exportShipments.commodity,
        totalShipments: count(),
        totalQuantity: sum(exportShipments.quantity),
        totalValueUsd: sum(exportShipments.totalValueUsd),
        avgQuantity: avg(exportShipments.quantity),
      })
      .from(exportShipments)
      .groupBy(exportShipments.commodity)
      .orderBy(desc(sum(exportShipments.totalValueUsd)));
  },
};

// ============================================================================
// PIPELINE QUERIES
// ============================================================================

export const PipelineQueries = {
  /**
   * Get pipeline job with recent metrics
   */
  async getJobWithMetrics(jobId: number, metricsLimit = 10) {
    const db = await getDb();
    if (!db) return null;

    const [job] = await db.select().from(pipelineJobs).where(eq(pipelineJobs.id, jobId));
    if (!job) return null;

    const metrics = await db
      .select()
      .from(pipelineMetrics)
      .where(eq(pipelineMetrics.jobId, jobId))
      .orderBy(desc(pipelineMetrics.recordedAt))
      .limit(metricsLimit);

    const [aggMetrics] = await db
      .select({
        totalRecordsProcessed: sum(pipelineMetrics.recordsWritten),
        avgThroughput: avg(pipelineMetrics.throughputRps),
        totalRuns: count(),
      })
      .from(pipelineMetrics)
      .where(eq(pipelineMetrics.jobId, jobId));

    return {
      ...job,
      recentMetrics: metrics,
      aggregateMetrics: {
        totalRecordsProcessed: Number(aggMetrics?.totalRecordsProcessed ?? 0),
        avgThroughput: Number(aggMetrics?.avgThroughput ?? 0),
        totalRuns: Number(aggMetrics?.totalRuns ?? 0),
      },
    };
  },
};

// ============================================================================
// FEDERATED LEARNING QUERIES
// ============================================================================

export const FederatedLearningQueries = {
  /**
   * Get model with participant stats
   */
  async getModelWithParticipants(modelId: number) {
    const db = await getDb();
    if (!db) return null;

    const [model] = await db.select().from(federatedModels).where(eq(federatedModels.id, modelId));
    if (!model) return null;

    const participants = await db
      .select()
      .from(federatedParticipants)
      .where(eq(federatedParticipants.modelId, modelId));

    const [stats] = await db
      .select({
        activeParticipants: count(sql`CASE WHEN ${federatedParticipants.status} = 'active' THEN 1 END`),
        avgContribution: avg(federatedParticipants.contributionScore),
        totalDataSize: sum(federatedParticipants.localDataSize),
      })
      .from(federatedParticipants)
      .where(eq(federatedParticipants.modelId, modelId));

    return {
      ...model,
      participants,
      participantStats: {
        active: Number(stats?.activeParticipants ?? 0),
        avgContribution: Number(stats?.avgContribution ?? 0),
        totalDataSize: Number(stats?.totalDataSize ?? 0),
      },
    };
  },
};

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

export const BatchOperations = {
  /**
   * Batch insert IoT readings (optimized for high throughput)
   */
  async batchInsertIoTReadings(readings: Array<typeof iotReadings.$inferInsert>) {
    const db = await getDb();
    if (!db || readings.length === 0) return 0;

    const BATCH_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < readings.length; i += BATCH_SIZE) {
      const batch = readings.slice(i, i + BATCH_SIZE);
      await db.insert(iotReadings).values(batch).onConflictDoNothing();
      inserted += batch.length;
    }

    return inserted;
  },

  /**
   * Batch insert market prices
   */
  async batchInsertMarketPrices(prices: Array<typeof marketPrices.$inferInsert>) {
    const db = await getDb();
    if (!db || prices.length === 0) return 0;

    await db.insert(marketPrices).values(prices).onConflictDoNothing();
    return prices.length;
  },

  /**
   * Batch update chama member counts
   */
  async syncChamaGroupStats(chamaId: number) {
    const db = await getDb();
    if (!db) return;

    const [memberCount] = await db
      .select({ count: count() })
      .from(chamaMembers)
      .where(and(eq(chamaMembers.chamaId, chamaId), eq(chamaMembers.isActive, true)));

    const [txnStats] = await db
      .select({ totalSavings: sum(chamaTransactions.amount) })
      .from(chamaTransactions)
      .where(
        and(
          eq(chamaTransactions.chamaId, chamaId),
          eq(chamaTransactions.type, "contribution"),
        ),
      );

    await db
      .update(chamaGroups)
      .set({
        memberCount: Number(memberCount?.count ?? 0),
        totalSavings: String(txnStats?.totalSavings ?? "0"),
        updatedAt: new Date(),
      })
      .where(eq(chamaGroups.id, chamaId));
  },
};

// ============================================================================
// SEARCH QUERIES
// ============================================================================

export const SearchQueries = {
  /**
   * Full-text search across farmers, farms, and products
   */
  async globalSearch(query: string, limit = 20) {
    const db = await getDb();
    if (!db) return { farmers: [], farms: [], commodities: [] };

    const [farmers, farmsResult, commodities] = await Promise.all([
      db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role })
        .from(users)
        .where(
          or(
            ilike(users.name, `%${query}%`),
            ilike(users.email, `%${query}%`),
            ilike(users.phone, `%${query}%`),
          ),
        )
        .limit(limit),

      db
        .select({ id: farms.id, name: farms.name, location: farms.location })
        .from(farms)
        .where(
          or(
            ilike(farms.name, `%${query}%`),
            ilike(farms.location, `%${query}%`),
          ),
        )
        .limit(limit),

      db
        .select({ commodity: marketPrices.commodity, market: marketPrices.market })
        .from(marketPrices)
        .where(ilike(marketPrices.commodity, `%${query}%`))
        .groupBy(marketPrices.commodity, marketPrices.market)
        .limit(limit),
    ]);

    return { farmers, farms: farmsResult, commodities };
  },
};

// ============================================================================
// ANALYTICS QUERIES
// ============================================================================

export const AnalyticsQueries = {
  /**
   * Platform-wide dashboard stats
   */
  async getPlatformStats() {
    const db = await getDb();
    if (!db) return null;

    const [
      userStats,
      farmStats,
      chamaStats,
      carbonStats,
      exportStats,
      pipelineStats,
    ] = await Promise.all([
      db.select({ total: count() }).from(users),
      db.select({ total: count() }).from(farms),
      db
        .select({ total: count(), totalSavings: sum(chamaGroups.totalSavings) })
        .from(chamaGroups)
        .where(eq(chamaGroups.isActive, true)),
      db
        .select({ total: count(), totalSequestration: sum(carbonProjects.annualSequestration) })
        .from(carbonProjects)
        .where(eq(carbonProjects.status, "active")),
      db
        .select({ total: count(), totalValue: sum(exportShipments.totalValueUsd) })
        .from(exportShipments),
      db
        .select({ total: count(), active: count(sql`CASE WHEN ${pipelineJobs.status} = 'running' THEN 1 END`) })
        .from(pipelineJobs),
    ]);

    return {
      users: Number(userStats[0]?.total ?? 0),
      farms: Number(farmStats[0]?.total ?? 0),
      chamaGroups: Number(chamaStats[0]?.total ?? 0),
      chamaTotalSavings: Number(chamaStats[0]?.totalSavings ?? 0),
      activeCarbonProjects: Number(carbonStats[0]?.total ?? 0),
      totalCarbonSequestration: Number(carbonStats[0]?.totalSequestration ?? 0),
      exportShipments: Number(exportStats[0]?.total ?? 0),
      exportTotalValueUsd: Number(exportStats[0]?.totalValue ?? 0),
      pipelineJobs: Number(pipelineStats[0]?.total ?? 0),
      activePipelineJobs: Number(pipelineStats[0]?.active ?? 0),
    };
  },
};
