import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc-base.js";
import { protectedProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { mlModels, modelDownloads, modelBenchmarks, communityModels, modelSyncQueue, modelRatings } from "../../drizzle/schema-ml-models.js";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import axios from "axios";
import { logger } from '../logger.js';

/**
 * ML Models Router
 * 
 * Orchestrates communication between:
 * - PostgreSQL database (model metadata)
 * - Python ML Service (Port 8086) - Inference, training, optimization
 * - Go Model Serving (Port 8087) - Edge optimization, fast serving
 * 
 * Provides unified API for:
 * 1. Pre-trained Model Library
 * 2. Hybrid Mode (local + cloud)
 * 3. Accuracy Benchmarking
 * 4. Community Model Sharing
 * 5. Edge Optimization
 */

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8086";
const MODEL_SERVING_URL = process.env.MODEL_SERVING_URL || "http://localhost:8087";

// ============================================================================
// Input Schemas
// ============================================================================

const modelTypeSchema = z.enum([
  "disease_detection",
  "pest_identification",
  "yield_prediction",
  "price_forecasting",
  "crop_recommendation",
  "soil_analysis",
  "weed_detection",
  "quality_assessment",
  "growth_stage",
  "nutrient_deficiency",
]);

const modelVariantSchema = z.enum(["full", "quantized", "pruned", "compressed", "distilled"]);

const deviceCapabilitySchema = z.enum(["high", "medium", "low", "minimal"]);

const inferenceRequestSchema = z.object({
  modelId: z.number(),
  imageData: z.string().optional(),
  imageUrl: z.string().url().optional(),
  cropType: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const modelFilterSchema = z.object({
  type: modelTypeSchema.optional(),
  variant: modelVariantSchema.optional(),
  targetDevice: deviceCapabilitySchema.optional(),
  cropName: z.string().optional(),
});

const optimizationRequestSchema = z.object({
  modelId: z.number(),
  optimizationType: z.enum(["quantize", "prune", "compress", "distill"]),
  targetDevice: deviceCapabilitySchema,
  targetSizeMb: z.number().optional(),
});

const biomassRequestSchema = z.object({
  ndvi: z.number().min(0).max(1),
  cropType: z.string().min(2),
  growthStage: z.string().min(2),
});

const canopyHeightRequestSchema = z.object({
  cropType: z.string().min(2),
  daysAfterPlanting: z.number().int().positive().max(365),
  method: z.enum(["photogrammetry", "field_measurement", "satellite"]),
});

const lstAnalysisRequestSchema = z.object({
  temperature: z.number(),
  airTemperature: z.number(),
  ndvi: z.number().min(0).max(1),
});

const ndviCalculationRequestSchema = z.object({
  nir: z.number().positive(),
  red: z.number().nonnegative(),
});

const benchmarkRequestSchema = z.object({
  modelId: z.number(),
  datasetName: z.string(),
  datasetSize: z.number(),
  comparisonTarget: z.string().optional(),
});

const ratingSchema = z.object({
  modelId: z.number(),
  rating: z.number().min(1).max(5),
  review: z.string().optional(),
  accuracyRating: z.number().min(1).max(5).optional(),
  speedRating: z.number().min(1).max(5).optional(),
  easeOfUseRating: z.number().min(1).max(5).optional(),
  usedFor: z.string().optional(),
  cropsTested: z.array(z.string()).optional(),
});

// ============================================================================
// ML Models Router
// ============================================================================

export const mlModelsRouter = router({
  // ============================================================================
  // Model Library
  // ============================================================================

  /**
   * List all available models
   */
  listModels: publicProcedure
    .input(z.object({
      type: modelTypeSchema.optional(),
      variant: modelVariantSchema.optional(),
      targetDevice: deviceCapabilitySchema.optional(),
      cropName: z.string().optional(),
    }).optional())
    .query(async ({ input }: { input?: { type?: string; variant?: string; targetDevice?: string; cropName?: string } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let query = db
        .select()
        .from(mlModels)
        .where(eq(mlModels.status, "published"))
        .$dynamic();

      if (input?.type) {
        query = query.where(eq(mlModels.type, input.type as any));
      }
      if (input?.variant) {
        query = query.where(eq(mlModels.variant, input.variant as any));
      }
      if (input?.targetDevice) {
        query = query.where(eq(mlModels.targetDevice, input.targetDevice as any));
      }
      if (input?.cropName) {
        query = query.where(sql`${mlModels.supportedCrops} @> ${JSON.stringify([input.cropName])}`) as any;
      }

      const models = await query.orderBy(desc(mlModels.downloadCount));
      return { models, count: models.length };
    }),

  /**
   * Get model details
   */
  getModel: publicProcedure
    .input(z.object({ modelId: z.number() }))
    .query(async ({ input }: { input: { modelId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [model] = await db
        .select()
        .from(mlModels)
        .where(eq(mlModels.id, input.modelId))
        .limit(1);

      if (!model) {
        throw new Error(`Model ${input.modelId} not found`);
      }

      // Get download stats
      const [stats] = await db
        .select({
          totalDownloads: sql<number>`COUNT(*)`,
          installedCount: sql<number>`COUNT(*) FILTER (WHERE ${modelDownloads.installed} = true)`,
          activeUsers: sql<number>`COUNT(DISTINCT ${modelDownloads.userId}) FILTER (WHERE ${modelDownloads.lastUsedAt} > NOW() - INTERVAL '30 days')`,
        })
        .from(modelDownloads)
        .where(eq(modelDownloads.modelId, input.modelId));

      return { model, stats };
    }),

  /**
   * Get popular models
   */
  getPopularModels: publicProcedure
    .input(z.object({ limit: z.number().default(10) }))
    .query(async ({ input }: { input: { limit: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const models = await db
        .select()
        .from(mlModels)
        .where(and(eq(mlModels.isOfficial, true), eq(mlModels.status, "published")))
        .orderBy(desc(mlModels.downloadCount))
        .limit(input.limit);

      return { models };
    }),

  /**
   * Get recommended models for a crop
   */
  getRecommendedModels: publicProcedure
    .input(z.object({ cropName: z.string() }))
    .query(async ({ input }: { input: { cropName: string } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const models = await db
        .select()
        .from(mlModels)
        .where(
          and(
            eq(mlModels.isOfficial, true),
            eq(mlModels.status, "published"),
            sql`${mlModels.supportedCrops} @> ${JSON.stringify([input.cropName])}`
          ) as any
        )
        .orderBy(desc(mlModels.rating))
        .limit(5);

      return { models };
    }),

  /**
   * Get model packs
   */
  getModelPacks: publicProcedure.query(async () => {
    try {
      const response = await axios.get(`${ML_SERVICE_URL}/model-packs`);
      return response.data;
    } catch (error) {
      logger.error("Failed to fetch model packs:", error);
      throw new Error("Failed to fetch model packs from ML service");
    }
  }),

  // ============================================================================
  // Model Downloads
  // ============================================================================

  /**
   * Download a model
   */
  downloadModel: protectedProcedure
    .input(z.object({ modelId: z.number(), deviceInfo: z.record(z.string(), z.any()).optional() }))
    .mutation(async ({ input, ctx }: { input: { modelId: number; deviceInfo?: Record<string, unknown> }; ctx: { user: { id: number } } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check if model exists
      const [model] = await db
        .select()
        .from(mlModels)
        .where(eq(mlModels.id, input.modelId))
        .limit(1);

      if (!model) {
        throw new Error(`Model ${input.modelId} not found`);
      }

      // Track download
      const [download] = await db
        .insert(modelDownloads)
        .values({
          modelId: input.modelId,
          userId: ctx.user.id,
          deviceInfo: input.deviceInfo,
          downloadedAt: new Date(),
        })
        .returning();

      // Increment download count
      await db
        .update(mlModels)
        .set({
          downloadCount: sql`${mlModels.downloadCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(mlModels.id, input.modelId));

      return { downloadId: download.id, model };
    }),

  /**
   * Mark model as installed
   */
  markAsInstalled: protectedProcedure
    .input(z.object({ downloadId: z.number() }))
    .mutation(async ({ input }: { input: { downloadId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(modelDownloads)
        .set({
          installed: true,
          installedAt: new Date(),
        })
        .where(eq(modelDownloads.id, input.downloadId));

      return { success: true };
    }),

  /**
   * Get user's downloaded models
   */
  getUserDownloads: protectedProcedure.query(async ({ ctx }: { ctx: { user: { id: number } } }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const downloads = await db
      .select({
        model: mlModels,
        download: modelDownloads,
      })
      .from(modelDownloads)
      .innerJoin(mlModels, eq(modelDownloads.modelId, mlModels.id))
      .where(eq(modelDownloads.userId, ctx.user.id))
      .orderBy(desc(modelDownloads.downloadedAt));

    return { downloads };
  }),

  // ============================================================================
  // Model Inference
  // ============================================================================

  /**
   * Run inference on an image
   */
  runInference: protectedProcedure
    .input(inferenceRequestSchema)
    .mutation(async ({ input, ctx }: { input: z.infer<typeof inferenceRequestSchema>; ctx: { user: { id: number } } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get model from database
      const [model] = await db
        .select()
        .from(mlModels)
        .where(eq(mlModels.id, input.modelId))
        .limit(1);

      if (!model) {
        throw new Error(`Model ${input.modelId} not found`);
      }

      // Call Python ML Service for inference
      try {
        const response = await axios.post(`${ML_SERVICE_URL}/inference`, {
          model_id: model.name, // Use model name for ML service
          image_data: input.imageData,
          image_url: input.imageUrl,
          crop_type: input.cropType,
          metadata: input.metadata,
        });

        // Update usage stats
        await db
          .update(mlModels)
          .set({
            usageCount: sql`${mlModels.usageCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(mlModels.id, input.modelId));

        await db
          .update(modelDownloads)
          .set({
            usageCount: sql`${modelDownloads.usageCount} + 1`,
            lastUsedAt: new Date(),
            firstUsedAt: sql`COALESCE(${modelDownloads.firstUsedAt}, NOW())`,
          })
          .where(and(eq(modelDownloads.modelId, input.modelId), eq(modelDownloads.userId, ctx.user.id)));

        return response.data;
      } catch (error) {
        logger.error("Inference failed:", error);
        throw new Error("Inference failed");
      }
    }),

  estimateBiomass: protectedProcedure
    .input(biomassRequestSchema)
    .mutation(async ({ input }: { input: z.infer<typeof biomassRequestSchema> }) => {
      const stageFactors: Record<string, number> = {
        seedling: 0.45,
        vegetative: 0.85,
        flowering: 1.15,
        grain_filling: 1.28,
        maturity: 1.05,
      };

      const cropMultipliers: Record<string, number> = {
        maize: 9.8,
        rice: 8.6,
        cassava: 12.4,
        sorghum: 7.9,
        beans: 5.2,
        ginger: 6.4,
      };

      const normalizedCrop = input.cropType.toLowerCase();
      const normalizedStage = input.growthStage.toLowerCase().replace(/\s+/g, "_");
      const cropMultiplier = cropMultipliers[normalizedCrop] ?? 7.5;
      const stageFactor = stageFactors[normalizedStage] ?? 1;
      const biomassTonsHa = Number((input.ndvi * cropMultiplier * stageFactor).toFixed(2));
      const biomassKgHa = Number((biomassTonsHa * 1000).toFixed(2));
      const confidence = Math.min(97, Math.max(62, Math.round(68 + input.ndvi * 25)));

      return {
        biomass_kg_ha: biomassKgHa,
        biomass_tons_ha: biomassTonsHa,
        confidence,
        ndvi: input.ndvi,
        crop_type: input.cropType,
        growth_stage: input.growthStage,
        method: "server_ndvi_regression",
        advisory: biomassTonsHa >= 8
          ? "Biomass is strong for the selected stage. Maintain nutrition and moisture consistency."
          : "Biomass is below the optimal band. Review fertilization, spacing, and irrigation practices.",
      };
    }),

  estimateCanopyHeight: protectedProcedure
    .input(canopyHeightRequestSchema)
    .mutation(async ({ input }: { input: z.infer<typeof canopyHeightRequestSchema> }) => {
      const cropDailyGrowth: Record<string, number> = {
        maize: 0.031,
        rice: 0.018,
        cassava: 0.014,
        sorghum: 0.024,
        beans: 0.012,
        ginger: 0.01,
      };

      const methodAdjustment: Record<string, number> = {
        photogrammetry: 1,
        field_measurement: 0.97,
        satellite: 1.06,
      };

      const normalizedCrop = input.cropType.toLowerCase();
      const baseGrowthRate = cropDailyGrowth[normalizedCrop] ?? 0.02;
      const estimatedHeight = Number((baseGrowthRate * input.daysAfterPlanting * (methodAdjustment[input.method] ?? 1)).toFixed(2));
      const confidence = input.method === "field_measurement" ? 94 : input.method === "photogrammetry" ? 89 : 83;

      return {
        height_meters: estimatedHeight,
        average_height: estimatedHeight,
        max_height: Number((estimatedHeight * 1.15).toFixed(2)),
        min_height: Number(Math.max(0.05, estimatedHeight * 0.85).toFixed(2)),
        confidence,
        method: input.method,
        crop_type: input.cropType,
        days_after_planting: input.daysAfterPlanting,
        advisory: estimatedHeight < 0.8
          ? "Canopy development is still early. Monitor nutrient uptake and plant stand uniformity."
          : "Canopy height is within the expected growth band. Continue stage-appropriate crop care.",
      };
    }),

  analyzeLST: protectedProcedure
    .input(lstAnalysisRequestSchema)
    .mutation(async ({ input }: { input: z.infer<typeof lstAnalysisRequestSchema> }) => {
      const thermalGap = input.temperature - input.airTemperature;
      const cwsi = Number(Math.max(0, Math.min(1, (thermalGap / 12) * (1.15 - input.ndvi))).toFixed(3));
      const soilMoistureIndex = Number(Math.max(0, Math.min(100, (1 - cwsi) * 100)).toFixed(1));
      const stressLevel = cwsi >= 0.6 ? "high" : cwsi >= 0.3 ? "moderate" : "low";
      const irrigationRecommendation = stressLevel === "high"
        ? "Irrigation intervention is recommended within 24 hours."
        : stressLevel === "moderate"
          ? "Monitor field moisture closely and prioritize stressed plots."
          : "No immediate irrigation action is required; continue routine monitoring.";

      return {
        lst_celsius: input.temperature,
        air_temperature: input.airTemperature,
        cwsi,
        soil_moisture_index: soilMoistureIndex,
        stress_level: stressLevel,
        irrigation_recommendation: irrigationRecommendation,
        ndvi: input.ndvi,
      };
    }),

  calculateNDVI: protectedProcedure
    .input(ndviCalculationRequestSchema)
    .mutation(async ({ input }: { input: z.infer<typeof ndviCalculationRequestSchema> }) => {
      const denominator = input.nir + input.red;
      const ndvi = denominator === 0 ? 0 : Number(((input.nir - input.red) / denominator).toFixed(3));
      const interpretation = ndvi >= 0.7
        ? "Dense vegetation"
        : ndvi >= 0.45
          ? "Healthy vegetation"
          : ndvi >= 0.2
            ? "Sparse vegetation"
            : "Bare soil or stressed vegetation";
      const vegetationHealth = ndvi >= 0.7
        ? "excellent"
        : ndvi >= 0.45
          ? "good"
          : ndvi >= 0.2
            ? "moderate"
            : "poor";

      return {
        ndvi,
        nir: input.nir,
        red: input.red,
        interpretation,
        vegetation_health: vegetationHealth,
      };
    }),

  // ============================================================================
  // Model Optimization
  // ============================================================================

  /**
   * Optimize model for edge devices
   */
  optimizeModel: protectedProcedure
    .input(optimizationRequestSchema)
    .mutation(async ({ input }: { input: z.infer<typeof optimizationRequestSchema> }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get model
      const [model] = await db
        .select()
        .from(mlModels)
        .where(eq(mlModels.id, input.modelId))
        .limit(1);

      if (!model) {
        throw new Error(`Model ${input.modelId} not found`);
      }

      // Call Go Model Serving for optimization
      try {
        const response = await axios.post(`${MODEL_SERVING_URL}/optimize`, {
          model_id: model.name,
          optimization_type: input.optimizationType,
          target_device: input.targetDevice,
          target_size_mb: input.targetSizeMb,
        });

        return response.data;
      } catch (error) {
        logger.error("Optimization failed:", error);
        throw new Error("Optimization failed");
      }
    }),

  /**
   * Detect device capability
   */
  detectDeviceCapability: publicProcedure.query(async () => {
    try {
      const response = await axios.get(`${MODEL_SERVING_URL}/device/capability`);
      return response.data;
    } catch (error) {
      logger.error("Device capability detection failed:", error);
      // Return default capability
      return {
        capability: {
          device_type: "medium",
          ram_mb: 4096,
          has_gpu: false,
          cpu_cores: 4,
          network_type: "4g",
        },
        recommended_variant: "quantized",
        can_run_offline: true,
        recommended_batch_size: 8,
      };
    }
  }),

  // ============================================================================
  // Accuracy Benchmarking
  // ============================================================================

  /**
   * Benchmark model accuracy
   */
  benchmarkModel: protectedProcedure
    .input(benchmarkRequestSchema)
    .mutation(async ({ input, ctx }: { input: z.infer<typeof benchmarkRequestSchema>; ctx: { user: { id: number } } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get model
      const [model] = await db
        .select()
        .from(mlModels)
        .where(eq(mlModels.id, input.modelId))
        .limit(1);

      if (!model) {
        throw new Error(`Model ${input.modelId} not found`);
      }

      // Call Python ML Service for benchmarking
      try {
        const response = await axios.post(`${ML_SERVICE_URL}/benchmark`, {
          model_id: model.name,
          dataset_name: input.datasetName,
          dataset_size: input.datasetSize,
          comparison_target: input.comparisonTarget,
        });

        const benchmarkData = response.data;

        // Store benchmark results in database
        const [benchmark] = await db
          .insert(modelBenchmarks)
          .values({
            modelId: input.modelId,
            benchmarkName: `${input.comparisonTarget || "Standard"} Comparison`,
            datasetName: input.datasetName,
            datasetSize: input.datasetSize,
            accuracy: Math.round(benchmarkData.accuracy * 10000),
            precision: Math.round(benchmarkData.precision * 10000),
            recall: Math.round(benchmarkData.recall * 10000),
            f1Score: Math.round(benchmarkData.f1_score * 10000),
            avgInferenceMs: benchmarkData.avg_inference_ms,
            comparisonTarget: input.comparisonTarget,
            comparisonAccuracy: benchmarkData.comparison_accuracy
              ? Math.round(benchmarkData.comparison_accuracy * 10000)
              : null,
            accuracyDelta: benchmarkData.accuracy_delta
              ? Math.round(benchmarkData.accuracy_delta * 10000)
              : null,
            conductedBy: ctx.user.id,
            createdAt: new Date(),
          })
          .returning();

        return { benchmark, benchmarkData };
      } catch (error) {
        logger.error("Benchmarking failed:", error);
        throw new Error("Benchmarking failed");
      }
    }),

  /**
   * Get benchmark history for a model
   */
  getBenchmarkHistory: publicProcedure
    .input(z.object({ modelId: z.number() }))
    .query(async ({ input }: { input: { modelId: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const benchmarks = await db
        .select()
        .from(modelBenchmarks)
        .where(eq(modelBenchmarks.modelId, input.modelId))
        .orderBy(desc(modelBenchmarks.createdAt))
        .limit(20);

      return { benchmarks };
    }),

  // ============================================================================
  // Model Ratings & Reviews
  // ============================================================================

  /**
   * Rate a model
   */
  rateModel: protectedProcedure
    .input(ratingSchema)
    .mutation(async ({ input, ctx }: { input: z.infer<typeof ratingSchema>; ctx: { user: { id: number } } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check if user already rated this model
      const [existingRating] = await db
        .select()
        .from(modelRatings)
        .where(and(eq(modelRatings.modelId, input.modelId), eq(modelRatings.userId, ctx.user.id)))
        .limit(1);

      if (existingRating) {
        // Update existing rating
        const [updated] = await db
          .update(modelRatings)
          .set({
            rating: input.rating,
            review: input.review,
            accuracyRating: input.accuracyRating,
            speedRating: input.speedRating,
            easeOfUseRating: input.easeOfUseRating,
            usedFor: input.usedFor,
            cropsTested: input.cropsTested,
            updatedAt: new Date(),
          })
          .where(eq(modelRatings.id, existingRating.id))
          .returning();

        return { rating: updated };
      } else {
        // Create new rating
        const [rating] = await db
          .insert(modelRatings)
          .values({
            modelId: input.modelId,
            userId: ctx.user.id,
            rating: input.rating,
            review: input.review,
            accuracyRating: input.accuracyRating,
            speedRating: input.speedRating,
            easeOfUseRating: input.easeOfUseRating,
            usedFor: input.usedFor,
            cropsTested: input.cropsTested,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        // Update model rating
        const [avgRating] = await db
          .select({
            avgRating: sql<number>`AVG(${modelRatings.rating})`,
            count: sql<number>`COUNT(*)`,
          })
          .from(modelRatings)
          .where(eq(modelRatings.modelId, input.modelId));

        await db
          .update(mlModels)
          .set({
            rating: Math.round((avgRating.avgRating || 0) * 100),
            ratingCount: avgRating.count || 0,
            updatedAt: new Date(),
          })
          .where(eq(mlModels.id, input.modelId));

        return { rating };
      }
    }),

  /**
   * Get model ratings
   */
  getModelRatings: publicProcedure
    .input(z.object({ modelId: z.number(), limit: z.number().default(10) }))
    .query(async ({ input }: { input: { modelId: number; limit: number } }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const ratings = await db
        .select()
        .from(modelRatings)
        .where(eq(modelRatings.modelId, input.modelId))
        .orderBy(desc(modelRatings.createdAt))
        .limit(input.limit);

      return { ratings };
    }),
});
