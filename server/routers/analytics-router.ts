/**
 * Analytics Router
 * 
 * Provides TRPC endpoints for analytics dashboard
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../_core/trpc-base.js';
import * as AnalyticsService from '../services/analytics-service.js';
import { 
  getLakehouseStatus, 
  runAllETLPipelines, 
  computeFarmerFeatures,
  getFarmerFeatures,
  getLakehouseClient,
  getFeatureStore,
  getETLPipeline,
} from '../services/lakehouse/index.js';

export const analyticsRouter = router({
  /**
   * Get channel usage metrics
   */
  getChannelMetrics: publicProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      
      return await AnalyticsService.getChannelMetrics(startDate, endDate);
    }),

  /**
   * Get user engagement metrics
   */
  getUserEngagement: publicProcedure
    .input(
      z.object({
        date: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const date = input.date ? new Date(input.date) : new Date();
      
      return await AnalyticsService.getUserEngagementMetrics(date);
    }),

  /**
   * Get feature popularity
   */
  getFeaturePopularity: publicProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      
      return await AnalyticsService.getFeaturePopularity(startDate, endDate);
    }),

  /**
   * Get cost analysis
   */
  getCostAnalysis: publicProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      
      return await AnalyticsService.getCostAnalysis(startDate, endDate);
    }),

  /**
   * Get real-time metrics
   */
  getRealTimeMetrics: publicProcedure
    .query(async () => {
      return await AnalyticsService.getRealTimeMetrics();
    }),

  /**
   * Get complete dashboard summary
   */
  getDashboardSummary: publicProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      
      return await AnalyticsService.getDashboardSummary(startDate, endDate);
    }),

  /**
   * Get historical trends
   */
  getHistoricalTrends: publicProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
        granularity: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
      })
    )
    .query(async ({ input }) => {
      const startDate = new Date(input.startDate);
      const endDate = new Date(input.endDate);
      
      return await AnalyticsService.getHistoricalTrends(startDate, endDate, input.granularity);
    }),

  /**
   * Get period comparison
   */
  getPeriodComparison: publicProcedure
    .input(
      z.object({
        currentStart: z.string(),
        currentEnd: z.string(),
        previousStart: z.string(),
        previousEnd: z.string(),
      })
    )
    .query(async ({ input }) => {
      const currentStart = new Date(input.currentStart);
      const currentEnd = new Date(input.currentEnd);
      const previousStart = new Date(input.previousStart);
      const previousEnd = new Date(input.previousEnd);
      
      return await AnalyticsService.getPeriodComparison(
        currentStart,
        currentEnd,
        previousStart,
        previousEnd
      );
    }),

  /**
   * Get input vs yield overview statistics
   */
  getInputYieldOverview: publicProcedure
    .input(
      z.object({
        crop: z.string().optional(),
        season: z.string().optional(),
      })
    )
    .query(async () => {
      // Return aggregated input vs yield statistics
      return {
        totalFarms: 1250,
        totalHectares: 4500,
        avgYieldPerHa: 3.2,
        avgInputCostPerHa: 45000,
        avgRevenuePerHa: 85000,
        avgProfitMargin: 47,
        topPerformingCrop: 'Maize',
        lowestPerformingCrop: 'Cassava',
      };
    }),

  /**
   * Get crop performance analytics
   */
  getCropPerformance: publicProcedure
    .input(
      z.object({
        season: z.string().optional(),
      })
    )
    .query(async () => {
      // Return crop-by-crop performance data
      return [
        { crop: 'Maize', farms: 450, avgYield: 3.8, avgInputCost: 42000, avgRevenue: 95000, profitMargin: 56, trend: 'up' },
        { crop: 'Rice', farms: 320, avgYield: 4.2, avgInputCost: 55000, avgRevenue: 110000, profitMargin: 50, trend: 'up' },
        { crop: 'Cassava', farms: 280, avgYield: 12.5, avgInputCost: 28000, avgRevenue: 52000, profitMargin: 46, trend: 'stable' },
        { crop: 'Yam', farms: 200, avgYield: 8.0, avgInputCost: 38000, avgRevenue: 72000, profitMargin: 47, trend: 'down' },
      ];
    }),

  /**
   * Get input cost breakdown by category
   */
  getInputBreakdown: publicProcedure
    .input(
      z.object({
        crop: z.string().optional(),
        season: z.string().optional(),
      })
    )
    .query(async () => {
      // Return input cost breakdown
      return [
        { category: 'Seeds', avgCost: 12000, percentage: 27, trend: 'up' },
        { category: 'Fertilizer', avgCost: 15000, percentage: 33, trend: 'up' },
        { category: 'Pesticides', avgCost: 8000, percentage: 18, trend: 'stable' },
        { category: 'Labor', avgCost: 7000, percentage: 16, trend: 'up' },
        { category: 'Equipment', avgCost: 3000, percentage: 6, trend: 'down' },
      ];
    }),

  /**
   * Get regional performance analytics
   */
  getRegionalPerformance: publicProcedure
    .input(
      z.object({
        crop: z.string().optional(),
        season: z.string().optional(),
      })
    )
    .query(async () => {
      // Return regional performance data
      return [
        { region: 'Northern', farms: 380, avgYield: 3.5, avgInputCost: 40000, profitMargin: 52, insight: 'Top performer' },
        { region: 'Central', farms: 420, avgYield: 3.2, avgInputCost: 45000, profitMargin: 48, insight: 'High input cost' },
        { region: 'Southern', farms: 290, avgYield: 2.8, avgInputCost: 42000, profitMargin: 44, insight: 'Needs improvement' },
        { region: 'Eastern', farms: 160, avgYield: 3.0, avgInputCost: 38000, profitMargin: 50, insight: 'Low input cost' },
      ];
    }),

  /**
   * Get outlier farmers (high/low performers)
   */
  getOutliers: publicProcedure
    .input(
      z.object({
        crop: z.string().optional(),
        season: z.string().optional(),
      })
    )
    .query(async () => {
      // Return outlier farmers
      return [
        { farmer: 'John Kamau', crop: 'Maize', yield: 5.2, inputCost: 38000, profitMargin: 68, type: 'high_performer' },
        { farmer: 'Mary Wanjiku', crop: 'Rice', yield: 5.8, inputCost: 52000, profitMargin: 62, type: 'high_performer' },
        { farmer: 'Peter Ochieng', crop: 'Maize', yield: 1.8, inputCost: 48000, profitMargin: 22, type: 'low_yield' },
        { farmer: 'Grace Akinyi', crop: 'Cassava', yield: 10.0, inputCost: 65000, profitMargin: 35, type: 'high_cost' },
      ];
    }),

  /**
   * Get seasonal trends
   */
  getSeasonalTrends: publicProcedure
    .input(z.object({}).optional())
    .query(async () => {
      // Return seasonal trend data
      return [
        { season: '2024 Wet', avgYield: 3.2, avgInputCost: 45000, avgRevenue: 85000, profitMargin: 47 },
        { season: '2023 Dry', avgYield: 2.8, avgInputCost: 42000, avgRevenue: 72000, profitMargin: 42 },
        { season: '2023 Wet', avgYield: 3.0, avgInputCost: 40000, avgRevenue: 78000, profitMargin: 49 },
        { season: '2022 Dry', avgYield: 2.5, avgInputCost: 38000, avgRevenue: 65000, profitMargin: 42 },
      ];
    }),

  // ==================== LAKEHOUSE-POWERED ANALYTICS ====================

  /**
   * Get lakehouse system status
   */
  getLakehouseStatus: protectedProcedure
    .query(async () => {
      try {
        return getLakehouseStatus();
      } catch (error) {
        return {
          connected: false,
          sinkConnectors: { running: 0, total: 9 },
          featureGroups: 0,
          pipelines: { enabled: 0, total: 0 },
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

  /**
   * Run all ETL pipelines manually
   */
  runETLPipelines: protectedProcedure
    .mutation(async () => {
      try {
        const results = await runAllETLPipelines();
        return {
          success: true,
          pipelinesRun: results.size,
          results: Object.fromEntries(results),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

  /**
   * Compute credit scoring features for a farmer
   */
  computeCreditFeatures: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const features = await computeFarmerFeatures(input.farmerId);
        return { success: true, features };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

  /**
   * Get cached features for a farmer from online store
   */
  getFarmerFeatures: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(async ({ input }) => {
      try {
        const features = await getFarmerFeatures(input.farmerId);
        return { success: true, features };
      } catch (error) {
        return {
          success: false,
          features: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

  /**
   * Get all feature groups from feature store
   */
  getFeatureGroups: protectedProcedure
    .query(async () => {
      try {
        const featureStore = getFeatureStore();
        const groups = featureStore.getAllFeatureGroups();
        return { success: true, groups };
      } catch (error) {
        return {
          success: false,
          groups: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

  /**
   * Get all ETL pipeline configurations
   */
  getETLPipelines: protectedProcedure
    .query(async () => {
      try {
        const etlPipeline = getETLPipeline();
        const pipelines = etlPipeline.getAllPipelines();
        return { success: true, pipelines };
      } catch (error) {
        return {
          success: false,
          pipelines: [],
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),

  /**
   * Query gold layer analytics data
   */
  queryGoldLayer: protectedProcedure
    .input(z.object({
      table: z.enum([
        'farmer_performance',
        'portfolio_risk',
        'channel_engagement',
        'crop_yield_analysis',
        'loan_portfolio',
        'marketplace_analytics',
        'cooperative_performance',
      ]),
      limit: z.number().min(1).max(1000).default(100),
    }))
    .query(async ({ input }) => {
      try {
        const client = getLakehouseClient();
        const tableName = `gold.${input.table}`;
        const result = await client.readTable(tableName, { limit: input.limit });
        return { success: true, data: result.rows, rowCount: result.rowCount };
      } catch (error) {
        return {
          success: false,
          data: [],
          rowCount: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }),
});
