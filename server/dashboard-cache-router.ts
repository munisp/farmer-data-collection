import { router, publicProcedure } from "./_core/trpc-base.js";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "./db.js";
import { cache } from "./redis.js";
import { logger } from './logger.js';
import {
  farmers,
  farms,
  crops,
  livestock,
  harvests,
  expenses,
} from "../drizzle/schema.js";

/**
 * Dashboard router with Redis caching
 * Caches dashboard statistics for 60 seconds to reduce database load
 */
export const dashboardCacheRouter = router({
  /**
   * Get dashboard statistics with caching
   */
  getStats: publicProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .query(async ({ input }) => {
      const cacheKey = `dashboard:stats:user:${input.userId}`;
      
      return await cache.getOrSet(
        cacheKey,
        async () => {
          logger.info(`[Dashboard] Fetching platform-wide stats from database`);
          const db = await getDb();
          if (!db) throw new Error('Database not available');

          const [
            farmerCount,
            farmCount,
            cropCount,
            livestockCount,
            harvestCount,
            expenseCount,
            totalExpenses,
            totalHarvests,
          ] = await Promise.all([
            db.select({ count: sql<number>`count(*)` }).from(farmers)
              .then((rows) => Number(rows[0]?.count || 0)),
            db.select({ count: sql<number>`count(*)` }).from(farms)
              .then((rows) => Number(rows[0]?.count || 0)),
            db.select({ count: sql<number>`count(*)` }).from(crops)
              .then((rows) => Number(rows[0]?.count || 0)),
            db.select({ count: sql<number>`count(*)` }).from(livestock)
              .then((rows) => Number(rows[0]?.count || 0)),
            db.select({ count: sql<number>`count(*)` }).from(harvests)
              .then((rows) => Number(rows[0]?.count || 0)),
            db.select({ count: sql<number>`count(*)` }).from(expenses)
              .then((rows) => Number(rows[0]?.count || 0)),
            db.select({ total: sql<number>`COALESCE(SUM(amount), 0)` }).from(expenses)
              .then((rows) => Number(rows[0]?.total || 0)),
            db.select({ total: sql<number>`COALESCE(SUM(quantity), 0)` }).from(harvests)
              .then((rows) => Number(rows[0]?.total || 0)),
          ]);

          return {
            farmers: farmerCount,
            farms: farmCount,
            crops: cropCount,
            livestock: livestockCount,
            harvests: harvestCount,
            expenses: expenseCount,
            totalExpenses,
            totalHarvests,
          };
        },
        60
      );
    }),

  /**
   * Get recent activities with caching
   */
  getRecentActivities: publicProcedure
    .input(z.object({
      userId: z.number(),
      limit: z.number().optional().default(10),
    }))
    .query(async ({ input }) => {
      const cacheKey = `dashboard:activities:user:${input.userId}:limit:${input.limit}`;
      
      return await cache.getOrSet(
        cacheKey,
        async () => {
          logger.info(`[Dashboard] Fetching recent activities for user ${input.userId} from database`);
          const db = await getDb();
          if (!db) throw new Error('Database not available');

          const [recentHarvests, recentExpenses] = await Promise.all([
            db
              .select()
              .from(harvests)
              .orderBy(sql`${harvests.harvestDate} DESC`)
              .limit(input.limit),

            db
              .select()
              .from(expenses)
              .orderBy(sql`${expenses.expenseDate} DESC`)
              .limit(input.limit),
          ]);

          // Combine and sort by date
          const activities = [
            ...recentHarvests.map((h) => ({
              type: 'harvest' as const,
              date: h.harvestDate,
              description: `Harvested ${h.quantity} ${h.unit}`,
              amount: Number(h.quantity),
            })),
            ...recentExpenses.map((e) => ({
              type: 'expense' as const,
              date: e.expenseDate,
              description: `${e.category}: ${e.description || 'No description'}`,
              amount: Number(e.amount),
            })),
          ]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, input.limit);

          return activities;
        },
        30 // Cache for 30 seconds
      );
    }),

  /**
   * Compatibility procedure for farm selection surfaces that still read farms from the dashboard namespace.
   */
  getFarms: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      return await db
        .select({
          id: farms.id,
          userId: farms.userId,
          farmerId: farms.farmerId,
          farmName: farms.farmName,
          location: farms.location,
          latitude: farms.latitude,
          longitude: farms.longitude,
          soilType: farms.soilType,
          irrigationType: farms.irrigationType,
          updatedAt: farms.updatedAt,
        })
        .from(farms)
        .orderBy(sql`${farms.updatedAt} DESC`);
    }),

  /**
   * Compatibility mutation for geotagging flows that update a farm center point through the dashboard namespace.
   */
  updateFarm: publicProcedure
    .input(z.object({
      id: z.number(),
      latitude: z.string(),
      longitude: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const [updatedFarm] = await db
        .update(farms)
        .set({
          latitude: input.latitude,
          longitude: input.longitude,
          updatedAt: new Date(),
          version: sql`${farms.version} + 1`,
        })
        .where(eq(farms.id, input.id))
        .returning({
          id: farms.id,
          farmName: farms.farmName,
          latitude: farms.latitude,
          longitude: farms.longitude,
          updatedAt: farms.updatedAt,
        });

      if (!updatedFarm) {
        throw new Error('Farm not found');
      }

      await cache.delPattern('dashboard:*');
      return updatedFarm;
    }),

  /**
   * Invalidate dashboard cache for a user
   */
  invalidateCache: publicProcedure
    .input(z.object({
      userId: z.number(),
    }))
    .mutation(async ({ input }) => {
      logger.info(`[Dashboard] Invalidating cache for user ${input.userId}`);
      
      // Delete all dashboard cache keys for this user
      await cache.delPattern(`dashboard:*:user:${input.userId}*`);
      
      return { success: true };
    }),

  /**
   * Get cache statistics
   */
  getCacheStats: publicProcedure
    .query(async () => {
      const stats = await cache.getStats();
      return stats;
    }),
});
