/**
 * ML Predictions Router
 * 
 * tRPC router for ML-powered predictions and forecasts
 * Integrates with Python ML service for crop yield prediction and price forecasting
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base.js";
import { pythonMLClient, validateYieldRequest, validatePriceForecastRequest } from "./clients/python-ml-client";
import { getDb } from "./db.js";
import { eq, and, gte, desc } from "drizzle-orm";
import { crops, harvests, produceListings, farms, farmInputs } from "../drizzle/schema.js";
import { logger } from './logger.js';

// ============================================================================
// Input Schemas
// ============================================================================

const predictYieldSchema = z.object({
  crop: z.string().min(1, "Crop type is required"),
  farmSize: z.number().positive("Farm size must be positive"),
  soilType: z.string().min(1, "Soil type is required"),
  rainfall: z.number().nonnegative("Rainfall cannot be negative"),
  temperature: z.number(),
  fertilizer: z.string().min(1, "Fertilizer type is required"),
  season: z.enum(["Wet", "Dry", "Both"]),
});

const forecastPriceSchema = z.object({
  crop: z.string().min(1, "Crop type is required"),
  location: z.string().min(1, "Location is required"),
  forecastDays: z.number().int().min(1).max(90).default(30),
});

const cropIdSchema = z.object({
  cropId: z.number().int().positive(),
});

// ============================================================================
// ML Predictions Router
// ============================================================================

export const mlPredictionsRouter = router({
  /**
   * Predict crop yield based on farm conditions
   */
  predictYield: protectedProcedure
    .input(predictYieldSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Validate request
        const errors = validateYieldRequest(input);
        if (errors.length > 0) {
          throw new Error(`Validation failed: ${errors.join(', ')}`);
        }

        // Check if ML service is healthy
        const isHealthy = await pythonMLClient.isHealthy();
        if (!isHealthy) {
          throw new Error('ML service is currently unavailable. Please try again later.');
        }

        // Call Python ML service
        const prediction = await pythonMLClient.predictYield(input);

        return {
          success: true,
          data: prediction,
        };
      } catch (error) {
        logger.error('[ML] Yield prediction error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to predict yield',
        };
      }
    }),

  /**
   * Get yield prediction for a specific crop
   * Uses crop data from database to auto-fill parameters
   */
  predictYieldForCrop: protectedProcedure
    .input(cropIdSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new Error('Database not available');
        }

        // Get crop details
        const crop = await db
          .select()
          .from(crops)
          .where(and(eq(crops.id, input.cropId), eq(crops.userId, ctx.user.id)))
          .limit(1);

        if (crop.length === 0) {
          throw new Error('Crop not found');
        }

        const cropData = crop[0];

        // Get farm data for the crop
        const farm = await db!.select().from(farms).where(eq(farms.id, cropData.farmId)).limit(1);
        const farmData = farm[0];

        // Get farm inputs (fertilizers) for this crop
        const inputs = await db!.select().from(farmInputs)
          .where(
            and(
              eq(farmInputs.cropId, cropData.id),
              eq(farmInputs.inputType, 'fertilizer')
            )
          )
          .orderBy(desc(farmInputs.applicationDate))
          .limit(1);

        // Determine season from planting date
        const plantingMonth = new Date(cropData.plantingDate).getMonth();
        // Wet season: April-October (months 3-9), Dry season: November-March (months 10-2)
        const season = (plantingMonth >= 3 && plantingMonth <= 9) ? 'Wet' : 'Dry';

        // Prepare prediction request with real farm data
        const predictionRequest = {
          crop: cropData.cropName,
          farmSize: farmData?.farmSize ? parseFloat(farmData.farmSize.toString()) : 5.0,
          soilType: farmData?.soilType || 'Loamy',
          rainfall: season === 'Wet' ? 1200 : 600, // Estimated based on season
          temperature: season === 'Wet' ? 26 : 30, // Estimated based on season
          fertilizer: inputs.length > 0 ? inputs[0].inputName : 'NPK',
          season: season as 'Wet' | 'Dry',
        };

        const prediction = await pythonMLClient.predictYield(predictionRequest);

        return {
          success: true,
          cropId: input.cropId,
          cropName: cropData.cropName,
          data: prediction,
        };
      } catch (error) {
        logger.error('[ML] Crop yield prediction error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to predict yield for crop',
        };
      }
    }),

  /**
   * Forecast crop prices
   * Uses historical marketplace data
   */
  forecastPrice: protectedProcedure
    .input(forecastPriceSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const db = await getDb();
        if (!db) {
          throw new Error('Database not available');
        }

        // Get historical price data from marketplace listings
        const historicalListings = await db
          .select({
            createdAt: produceListings.createdAt,
            pricePerUnit: produceListings.pricePerUnit,
          })
          .from(produceListings)
          .where(eq(produceListings.category, input.crop))
          .orderBy(desc(produceListings.createdAt))
          .limit(90); // Last 90 days

        if (historicalListings.length < 7) {
          return {
            success: false,
            error: 'Insufficient historical price data. At least 7 days of data required.',
          };
        }

        // Format historical prices for ML service
        const historicalPrices = historicalListings.map(listing => ({
          date: listing.createdAt.toISOString().split('T')[0],
          price: listing.pricePerUnit / 100, // Convert cents to dollars
        }));

        // Validate request
        const errors = validatePriceForecastRequest({
          ...input,
          historicalPrices,
        });
        if (errors.length > 0) {
          throw new Error(`Validation failed: ${errors.join(', ')}`);
        }

        // Check if ML service is healthy
        const isHealthy = await pythonMLClient.isHealthy();
        if (!isHealthy) {
          throw new Error('ML service is currently unavailable. Please try again later.');
        }

        // Call Python ML service
        const forecast = await pythonMLClient.forecastPrice({
          crop: input.crop,
          location: input.location,
          forecastDays: input.forecastDays,
          historicalPrices,
        });

        return {
          success: true,
          data: forecast,
          historicalDataPoints: historicalListings.length,
        };
      } catch (error) {
        logger.error('[ML] Price forecast error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to forecast prices',
        };
      }
    }),

  /**
   * Get ML service health status
   */
  getMLServiceHealth: protectedProcedure.query(async () => {
    try {
      const health = await pythonMLClient.healthCheck();
      return {
        success: true,
        data: health,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'ML service unavailable',
        data: {
          status: 'unhealthy',
          service: 'ml-service',
          version: 'unknown',
          models: {
            crop_yield: 'unavailable',
            price_forecast: 'unavailable',
          },
        },
      };
    }
  }),

  /**
   * Get ML model status
   */
  getModelStatus: protectedProcedure.query(async () => {
    try {
      const models = await pythonMLClient.getModelStatus();
      return {
        success: true,
        data: models,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get model status',
      };
    }
  }),

  /**
   * Get yield predictions for all user's crops
   * Useful for dashboard overview
   */
  getPredictionsForAllCrops: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      // Get all active crops for user
      const userCrops = await db
        .select()
        .from(crops)
        .where(
          and(
            eq(crops.userId, ctx.user.id),
            eq(crops.status, 'growing')
          )
        )
        .limit(10); // Limit to avoid too many API calls

      if (userCrops.length === 0) {
        return {
          success: true,
          data: [],
          message: 'No active crops found',
        };
      }

      // Check if ML service is healthy
      const isHealthy = await pythonMLClient.isHealthy();
      if (!isHealthy) {
        return {
          success: false,
          error: 'ML service is currently unavailable',
        };
      }

      // Get predictions for each crop
      const predictions = await Promise.all(
        userCrops.map(async (crop) => {
          try {
            // Get farm data for the crop
            const farm = await db!.select().from(farms).where(eq(farms.id, crop.farmId)).limit(1);
            const farmData = farm[0];

            // Get farm inputs (fertilizers) for this crop
            const inputs = await db!.select().from(farmInputs)
              .where(
                and(
                  eq(farmInputs.cropId, crop.id),
                  eq(farmInputs.inputType, 'fertilizer')
                )
              )
              .orderBy(desc(farmInputs.applicationDate))
              .limit(1);

            // Determine season from planting date
            const plantingMonth = new Date(crop.plantingDate).getMonth();
            const season = (plantingMonth >= 3 && plantingMonth <= 9) ? 'Wet' : 'Dry';

            const prediction = await pythonMLClient.predictYield({
              crop: crop.cropName,
              farmSize: farmData?.farmSize ? parseFloat(farmData.farmSize.toString()) : 5.0,
              soilType: farmData?.soilType || 'Loamy',
              rainfall: season === 'Wet' ? 1200 : 600,
              temperature: season === 'Wet' ? 26 : 30,
              fertilizer: inputs.length > 0 ? inputs[0].inputName : 'NPK',
              season: season as 'Wet' | 'Dry',
            });

            return {
              cropId: crop.id,
              cropName: crop.cropName,
              variety: crop.cropVariety,
              prediction,
            };
          } catch (error) {
            logger.error(`[ML] Failed to predict yield for crop ${crop.id}:`, error);
            return null;
          }
        })
      );

      // Filter out failed predictions
      const successfulPredictions = predictions.filter(p => p !== null);

      return {
        success: true,
        data: successfulPredictions,
        total: userCrops.length,
        successful: successfulPredictions.length,
      };
    } catch (error) {
      logger.error('[ML] Batch prediction error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get predictions',
      };
    }
  }),
});
