/**
 * Agricultural Intelligence tRPC Router
 * 
 * Provides endpoints for:
 * - Soil moisture monitoring and irrigation recommendations
 * - GDD tracking and harvest date prediction
 * - Pest and disease risk assessment
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc-base.js';
import { getDb } from '../db.js';
import { farms, crops } from '../../drizzle/schema.js';
import { cropCalendar, pestDiseaseRisks } from '../../drizzle/schema-agricultural-intelligence.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import {
  getSoilMoisture,
  getIrrigationRecommendation,
  estimateWaterSavings,
  type SoilType,
  type CropType as SoilCropType,
} from '../services/soil-moisture-service.js';
import {
  getCropGrowthStatus,
  calculateGDDAccumulation,
  estimateHarvestDate,
  calculateOptimalPlantingDate,
  compareGDDProgress,
  type CropTypeGDD,
  type DailyWeatherData,
} from '../services/gdd-service.js';
import {
  calculateCropRisks,
  calculateAllRisks,
  getHighPriorityAlerts,
  calculateRiskTrend,
  generateIPMRecommendations,
  type WeatherConditions,
} from '../services/pest-disease-risk-service.js';

export const agriculturalIntelligenceRouter = router({
  // ============================================================================
  // CROP SELECTION AND DISCOVERY
  // ============================================================================

  /**
   * List crops owned by the authenticated user for dashboard selection
   */
  listUserCrops: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const userCrops = await db
        .select({
          id: crops.id,
          farmId: crops.farmId,
          cropName: crops.cropName,
          cropVariety: crops.cropVariety,
          plantingDate: crops.plantingDate,
        })
        .from(crops)
        .where(eq(crops.userId, ctx.user.id))
        .orderBy(desc(crops.plantingDate));

      return userCrops.map((crop) => ({
        id: crop.id,
        farmId: crop.farmId,
        cropName: crop.cropName,
        cropVariety: crop.cropVariety,
        plantingDate: crop.plantingDate,
      }));
    }),
  
  // ============================================================================
  // SOIL MOISTURE ENDPOINTS
  // ============================================================================
  
  /**
   * Get current soil moisture data for a farm location
   */
  getSoilMoisture: protectedProcedure
    .input(
      z.object({
        farmId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Get farm location
      const farm = await db
        .select()
        .from(farms)
        .where(and(eq(farms.id, input.farmId), eq(farms.userId, ctx.user.id)))
        .limit(1);

      if (farm.length === 0) {
        throw new Error('Farm not found');
      }

      const { latitude, longitude } = farm[0];

      if (!latitude || !longitude) {
        throw new Error('Farm location not set');
      }

      const soilMoisture = await getSoilMoisture(Number(latitude), Number(longitude));

      return soilMoisture;
    }),

  /**
   * Get irrigation recommendation for a specific crop
   */
  getIrrigationRecommendation: protectedProcedure
    .input(
      z.object({
        farmId: z.number(),
        cropType: z.enum(['maize', 'rice', 'cassava', 'yam', 'sorghum', 'cowpea', 'groundnut', 'soybean', 'cotton', 'tomato']),
        soilType: z.enum(['sandy', 'loamy', 'clay', 'silty']),
        growthStage: z.enum(['vegetative', 'flowering', 'fruiting', 'maturity']).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Get farm location
      const farm = await db
        .select()
        .from(farms)
        .where(and(eq(farms.id, input.farmId), eq(farms.userId, ctx.user.id)))
        .limit(1);

      if (farm.length === 0) {
        throw new Error('Farm not found');
      }

      const { latitude, longitude } = farm[0];

      if (!latitude || !longitude) {
        throw new Error('Farm location not set');
      }

      const result = await getIrrigationRecommendation(
        Number(latitude),
        Number(longitude),
        input.cropType as SoilCropType,
        input.soilType as SoilType,
        input.growthStage
      );

      return result;
    }),

  /**
   * Calculate potential water savings from optimized irrigation
   */
  calculateWaterSavings: protectedProcedure
    .input(
      z.object({
        farmId: z.number(),
        currentWaterUseMm: z.number(),
        soilType: z.enum(['sandy', 'loamy', 'clay', 'silty']),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Get farm area
      const farm = await db
        .select()
        .from(farms)
        .where(and(eq(farms.id, input.farmId), eq(farms.userId, ctx.user.id)))
        .limit(1);

      if (farm.length === 0) {
        throw new Error('Farm not found');
      }

      const fieldAreaHa = farm[0].farmSize ? Number(farm[0].farmSize) : 1; // Default to 1 hectare if not set

      const savings = estimateWaterSavings(
        input.currentWaterUseMm,
        fieldAreaHa,
        input.soilType as SoilType
      );

      return savings;
    }),

  // ============================================================================
  // GDD (GROWING DEGREE DAYS) ENDPOINTS
  // ============================================================================

  /**
   * Get crop growth status with GDD tracking
   */
  getCropGrowthStatus: protectedProcedure
    .input(
      z.object({
        cropId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Get crop and calendar data
      const crop = await db
        .select()
        .from(crops)
        .where(and(eq(crops.id, input.cropId), eq(crops.userId, ctx.user.id)))
        .limit(1);

      if (crop.length === 0) {
        throw new Error('Crop not found');
      }

      const calendar = await db
        .select()
        .from(cropCalendar)
        .where(eq(cropCalendar.cropId, input.cropId))
        .limit(1);

      if (calendar.length === 0 || !calendar[0].plantingDate) {
        throw new Error('Crop calendar not found or planting date not set');
      }

      // For now, generate simulated weather data
      // In production, this should fetch from weather API
      const plantingDate = new Date(calendar[0].plantingDate);
      const currentDate = new Date();
      const daysAfterPlanting = Math.floor(
        (currentDate.getTime() - plantingDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const weatherData: DailyWeatherData[] = [];
      for (let i = 0; i <= daysAfterPlanting; i++) {
        const date = new Date(plantingDate);
        date.setDate(date.getDate() + i);
        
        // Deterministic weather estimate from seasonal model
        const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
        const seasonalBase = 27 + 5 * Math.sin(2 * Math.PI * (dayOfYear - 80) / 365);
        weatherData.push({
          date,
          tempMax: Math.round(seasonalBase + 5),
          tempMin: Math.round(seasonalBase - 5),
        });
      }

      const cropType = crop[0].cropName.toLowerCase() as CropTypeGDD;
      const status = getCropGrowthStatus(plantingDate, currentDate, weatherData, cropType);

      // Update calendar with latest GDD data
      await db
        .update(cropCalendar)
        .set({
          cumulativeGDD: status.cumulativeGDD,
          currentStage: status.currentStage,
          estimatedHarvestDate: status.estimatedHarvestDate,
          updatedAt: new Date(),
        })
        .where(eq(cropCalendar.cropId, input.cropId));

      return status;
    }),

  /**
   * Update GDD accumulation for a crop (manual update)
   */
  updateGDDAccumulation: protectedProcedure
    .input(
      z.object({
        cropId: z.number(),
        weatherData: z.array(
          z.object({
            date: z.date(),
            tempMax: z.number(),
            tempMin: z.number(),
            tempAvg: z.number().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Verify crop ownership
      const crop = await db
        .select()
        .from(crops)
        .where(and(eq(crops.id, input.cropId), eq(crops.userId, ctx.user.id)))
        .limit(1);

      if (crop.length === 0) {
        throw new Error('Crop not found');
      }

      const cropType = crop[0].cropName.toLowerCase() as CropTypeGDD;
      const gddCalcs = calculateGDDAccumulation(input.weatherData, cropType);
      const latestGDD = gddCalcs[gddCalcs.length - 1];

      // Update or create calendar entry
      const existing = await db
        .select()
        .from(cropCalendar)
        .where(eq(cropCalendar.cropId, input.cropId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(cropCalendar)
          .set({
            cumulativeGDD: latestGDD.cumulativeGDD,
            updatedAt: new Date(),
          })
          .where(eq(cropCalendar.cropId, input.cropId));
      } else {
        await db.insert(cropCalendar).values({
          cropId: input.cropId,
          plantingDate: input.weatherData[0].date,
          cumulativeGDD: latestGDD.cumulativeGDD,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return {
        success: true,
        cumulativeGDD: latestGDD.cumulativeGDD,
        calculations: gddCalcs,
      };
    }),

  /**
   * Compare actual vs expected GDD progress
   */
  compareGDDProgress: protectedProcedure
    .input(
      z.object({
        cropId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Get crop and calendar data
      const crop = await db
        .select()
        .from(crops)
        .where(and(eq(crops.id, input.cropId), eq(crops.userId, ctx.user.id)))
        .limit(1);

      if (crop.length === 0) {
        throw new Error('Crop not found');
      }

      const calendar = await db
        .select()
        .from(cropCalendar)
        .where(eq(cropCalendar.cropId, input.cropId))
        .limit(1);

      if (calendar.length === 0 || !calendar[0].plantingDate || !calendar[0].cumulativeGDD) {
        throw new Error('Crop calendar data incomplete');
      }

      const plantingDate = new Date(calendar[0].plantingDate);
      const currentDate = new Date();
      const daysAfterPlanting = Math.floor(
        (currentDate.getTime() - plantingDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const cropType = crop[0].cropName.toLowerCase() as CropTypeGDD;
      const comparison = compareGDDProgress(
        calendar[0].cumulativeGDD,
        daysAfterPlanting,
        cropType
      );

      return comparison;
    }),

  // ============================================================================
  // PEST & DISEASE RISK ENDPOINTS
  // ============================================================================

  /**
   * Calculate pest/disease risks for a specific crop
   */
  getCropRisks: protectedProcedure
    .input(
      z.object({
        cropId: z.number(),
        weather: z.object({
          temperature: z.number(),
          humidity: z.number(),
          rainfall: z.number(),
          windSpeed: z.number().optional(),
        }),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Get crop
      const crop = await db
        .select()
        .from(crops)
        .where(and(eq(crops.id, input.cropId), eq(crops.userId, ctx.user.id)))
        .limit(1);

      if (crop.length === 0) {
        throw new Error('Crop not found');
      }

      const cropType = crop[0].cropName.toLowerCase();
      const risks = calculateCropRisks(cropType, input.weather as WeatherConditions);

      // Store high-risk alerts in database
      const highRisks = risks.filter((r) => r.riskLevel === 'high' || r.riskLevel === 'critical');
      
      for (const risk of highRisks) {
        await db.insert(pestDiseaseRisks).values({
          cropId: input.cropId,
          pestOrDisease: risk.pestOrDisease,
          type: risk.type,
          riskLevel: risk.riskLevel,
          riskScore: risk.riskScore,
          temperature: input.weather.temperature.toString(),
          humidity: input.weather.humidity.toString(),
          rainfall: input.weather.rainfall.toString(),
          recommendation: risk.recommendation,
          assessmentDate: new Date(),
        });
      }

      return risks;
    }),

  /**
   * Get all current pest/disease risks
   */
  getAllRisks: protectedProcedure
    .input(
      z.object({
        weather: z.object({
          temperature: z.number(),
          humidity: z.number(),
          rainfall: z.number(),
          windSpeed: z.number().optional(),
        }),
      })
    )
    .query(async ({ input }) => {
      const risks = calculateAllRisks(input.weather as WeatherConditions);
      return risks;
    }),

  /**
   * Get high-priority pest/disease alerts
   */
  getHighPriorityAlerts: protectedProcedure
    .input(
      z.object({
        weather: z.object({
          temperature: z.number(),
          humidity: z.number(),
          rainfall: z.number(),
          windSpeed: z.number().optional(),
        }),
      })
    )
    .query(async ({ input }) => {
      const alerts = getHighPriorityAlerts(input.weather as WeatherConditions);
      return alerts;
    }),

  /**
   * Get pest/disease risk history for a crop
   */
  getRiskHistory: protectedProcedure
    .input(
      z.object({
        cropId: z.number(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Verify crop ownership
      const crop = await db
        .select()
        .from(crops)
        .where(and(eq(crops.id, input.cropId), eq(crops.userId, ctx.user.id)))
        .limit(1);

      if (crop.length === 0) {
        throw new Error('Crop not found');
      }

      let conditions = [eq(pestDiseaseRisks.cropId, input.cropId)];

      if (input.startDate) {
        conditions.push(gte(pestDiseaseRisks.assessmentDate, input.startDate));
      }

      if (input.endDate) {
        conditions.push(lte(pestDiseaseRisks.assessmentDate, input.endDate));
      }

      const history = await db
        .select()
        .from(pestDiseaseRisks)
        .where(and(...conditions))
        .orderBy(desc(pestDiseaseRisks.assessmentDate));

      return history;
    }),

  /**
   * Generate IPM (Integrated Pest Management) recommendations
   */
  getIPMRecommendations: protectedProcedure
    .input(
      z.object({
        cropId: z.number(),
        weather: z.object({
          temperature: z.number(),
          humidity: z.number(),
          rainfall: z.number(),
          windSpeed: z.number().optional(),
        }),
        growthStage: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Get crop
      const crop = await db
        .select()
        .from(crops)
        .where(and(eq(crops.id, input.cropId), eq(crops.userId, ctx.user.id)))
        .limit(1);

      if (crop.length === 0) {
        throw new Error('Crop not found');
      }

      const cropType = crop[0].cropName.toLowerCase();
      const recommendations = generateIPMRecommendations(
        cropType,
        input.weather as WeatherConditions,
        input.growthStage
      );

      return recommendations;
    }),
});
