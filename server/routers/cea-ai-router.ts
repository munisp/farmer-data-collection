/**
 * CEA AI Router — Controlled Environment Agriculture Intelligence
 *
 * Orchestrates communication between:
 *  - Python Indoor Farming AI Service (Port 8112) — grow recipes, crop health,
 *    yield prediction, planting schedules, resource forecasting, growth stage classification
 *  - PostgreSQL — crop profile persistence, prediction history
 *  - Kafka — AI event streaming
 *
 * Features:
 *  - Grow recipe generation (nutrients, pH, EC, lighting for indoor crops)
 *  - Real-time crop health assessment from sensor data
 *  - Indoor yield prediction (leafy greens, herbs, microgreens, fruits)
 *  - Staggered planting schedule for continuous harvesting
 *  - Resource consumption forecasting (water, energy, nutrients, CO2)
 *  - Growth stage classification with stage-specific advice
 *  - 8 indoor crop profiles (lettuce, kale, basil, spinach, microgreens, strawberry, mint, cherry tomato)
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { TRPCError } from "@trpc/server";
import { logger } from "../logger.js";
import { resilientPost } from "../services/resilient-http.js";

const INDOOR_AI_URL = process.env.INDOOR_FARMING_AI_URL || "http://localhost:8112";

async function callAIService<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  if (method === "GET") {
    const resp = await fetch(`${INDOOR_AI_URL}${path}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return (await resp.json()) as T;
  }
  return await resilientPost<T>("indoor-farming-ai", `${INDOOR_AI_URL}${path}`, body || {});
}

// Fallback crop profiles when Python service is unavailable
const FALLBACK_CROPS: Record<string, Record<string, unknown>> = {
  lettuce: { category: "leafy_green", grow_days: 35, yield_per_sqm_kg: 3.5, stages: ["germination", "seedling", "vegetative", "heading", "harvest"], temp_optimal: 20, ph_optimal: 6.0, ec_optimal: 1.0 },
  kale: { category: "leafy_green", grow_days: 55, yield_per_sqm_kg: 2.8, stages: ["germination", "seedling", "vegetative", "mature", "harvest"], temp_optimal: 18, ph_optimal: 6.0, ec_optimal: 1.4 },
  basil: { category: "herb", grow_days: 28, yield_per_sqm_kg: 2.5, stages: ["germination", "seedling", "vegetative", "mature", "harvest"], temp_optimal: 25, ph_optimal: 6.0, ec_optimal: 1.2 },
  spinach: { category: "leafy_green", grow_days: 40, yield_per_sqm_kg: 3.0, stages: ["germination", "seedling", "vegetative", "mature", "harvest"], temp_optimal: 17, ph_optimal: 6.5, ec_optimal: 1.6 },
  microgreens: { category: "microgreen", grow_days: 12, yield_per_sqm_kg: 1.5, stages: ["soak", "germination", "blackout", "greening", "harvest"], temp_optimal: 21, ph_optimal: 6.0, ec_optimal: 0.8 },
  strawberry: { category: "fruit", grow_days: 90, yield_per_sqm_kg: 4.0, stages: ["transplant", "vegetative", "flowering", "fruiting", "harvest"], temp_optimal: 22, ph_optimal: 5.8, ec_optimal: 1.5 },
  mint: { category: "herb", grow_days: 30, yield_per_sqm_kg: 2.0, stages: ["cutting", "rooting", "vegetative", "mature", "harvest"], temp_optimal: 22, ph_optimal: 6.0, ec_optimal: 1.3 },
  cherry_tomato: { category: "fruit", grow_days: 75, yield_per_sqm_kg: 5.0, stages: ["seedling", "vegetative", "flowering", "fruiting", "harvest"], temp_optimal: 24, ph_optimal: 6.0, ec_optimal: 2.2 },
};

export const ceaAIRouter = router({
  // ========================================================================
  // CROP PROFILES
  // ========================================================================

  listIndoorCrops: publicProcedure.query(async () => {
    try {
      return await callAIService("GET", "/api/crops");
    } catch {
      return {
        crops: Object.entries(FALLBACK_CROPS).map(([name, p]) => ({
          name,
          category: p.category,
          grow_days: p.grow_days,
          yield_per_sqm_kg: p.yield_per_sqm_kg,
          stages: p.stages,
        })),
      };
    }
  }),

  getCropProfile: publicProcedure
    .input(z.object({ crop: z.string() }))
    .query(async ({ input }) => {
      try {
        return await callAIService("GET", `/api/crops/${input.crop.toLowerCase()}`);
      } catch {
        const profile = FALLBACK_CROPS[input.crop.toLowerCase()];
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: `Crop '${input.crop}' not supported` });
        return { crop: input.crop.toLowerCase(), profile };
      }
    }),

  // ========================================================================
  // GROW RECIPE GENERATION
  // ========================================================================

  generateGrowRecipe: protectedProcedure
    .input(z.object({
      crop: z.string(),
      growMedia: z.string().default("nft"),
      spaceSqm: z.number().default(10),
      targetYieldKg: z.number().optional(),
      growthStage: z.string().optional(),
      currentTemp: z.number().optional(),
      currentHumidity: z.number().optional(),
      currentPh: z.number().optional(),
      currentEc: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await callAIService("POST", "/api/grow-recipe", {
          crop: input.crop.toLowerCase(),
          grow_media: input.growMedia,
          space_sqm: input.spaceSqm,
          target_yield_kg: input.targetYieldKg,
          growth_stage: input.growthStage,
          current_temp: input.currentTemp,
          current_humidity: input.currentHumidity,
          current_ph: input.currentPh,
          current_ec: input.currentEc,
        });
      } catch (err) {
        logger.warn(`[cea-ai] Python AI service unavailable: ${err}`);
        const profile = FALLBACK_CROPS[input.crop.toLowerCase()];
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: `Crop '${input.crop}' not supported` });

        return {
          success: true,
          crop: input.crop.toLowerCase(),
          recipe: {
            environment: { temperature_c: { optimal: profile.temp_optimal }, humidity_pct: { optimal: 60 }, co2_ppm: 1000 },
            nutrient_solution: { ph: { optimal: profile.ph_optimal }, ec_ms_cm: { optimal: profile.ec_optimal } },
            lighting: { photoperiod_hours: 16, spectrum: "full_spectrum_led" },
            grow_media: input.growMedia,
            total_days: profile.grow_days,
          },
          adjustments: [],
          estimated_yield_kg: (profile.yield_per_sqm_kg as number) * input.spaceSqm,
          estimated_days: profile.grow_days,
          resource_forecast: { water_liters: (profile.yield_per_sqm_kg as number) * input.spaceSqm * 20, energy_kwh: input.spaceSqm * 16 * (profile.grow_days as number) * 0.04 },
          fallback: true,
        };
      }
    }),

  // ========================================================================
  // CROP HEALTH ASSESSMENT
  // ========================================================================

  assessCropHealth: protectedProcedure
    .input(z.object({
      crop: z.string(),
      temperature: z.number(),
      humidity: z.number(),
      ph: z.number(),
      ec: z.number(),
      lightDli: z.number(),
      co2Ppm: z.number().optional(),
      leafColor: z.string().optional(),
      growthRateMmPerDay: z.number().optional(),
      daysSincePlanting: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      try {
        return await callAIService("POST", "/api/crop-health", {
          crop: input.crop.toLowerCase(),
          temperature: input.temperature,
          humidity: input.humidity,
          ph: input.ph,
          ec: input.ec,
          light_dli: input.lightDli,
          co2_ppm: input.co2Ppm,
          leaf_color: input.leafColor,
          growth_rate_mm_per_day: input.growthRateMmPerDay,
          days_since_planting: input.daysSincePlanting,
        });
      } catch (err) {
        logger.warn(`[cea-ai] Crop health assessment unavailable: ${err}`);
        const profile = FALLBACK_CROPS[input.crop.toLowerCase()];
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: `Crop '${input.crop}' not supported` });

        const issues: Array<Record<string, unknown>> = [];
        const recommendations: string[] = [];

        if (input.temperature < ((profile.temp_optimal as number) - 5) || input.temperature > ((profile.temp_optimal as number) + 5)) {
          issues.push({ parameter: "temperature", severity: "high", current: input.temperature, target: profile.temp_optimal });
          recommendations.push(`Adjust temperature to ${profile.temp_optimal}°C`);
        }
        if (input.ph < ((profile.ph_optimal as number) - 0.5) || input.ph > ((profile.ph_optimal as number) + 0.5)) {
          issues.push({ parameter: "ph", severity: "high", current: input.ph, target: profile.ph_optimal });
          recommendations.push(`Adjust pH to ${profile.ph_optimal}`);
        }

        const score = issues.length === 0 ? 95 : issues.length === 1 ? 70 : 50;
        return { success: true, overall_score: score, status: score >= 80 ? "healthy" : "attention_needed", issues, recommendations: recommendations.length ? recommendations : ["All parameters within range"], fallback: true };
      }
    }),

  // ========================================================================
  // YIELD PREDICTION
  // ========================================================================

  predictYield: protectedProcedure
    .input(z.object({
      crop: z.string(),
      spaceSqm: z.number(),
      temperature: z.number(),
      humidity: z.number(),
      ph: z.number(),
      ec: z.number(),
      lightDli: z.number(),
      co2Ppm: z.number().default(800),
      growMedia: z.string().default("nft"),
      daysGrowing: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      try {
        return await callAIService("POST", "/api/yield-prediction", {
          crop: input.crop.toLowerCase(),
          space_sqm: input.spaceSqm,
          temperature: input.temperature,
          humidity: input.humidity,
          ph: input.ph,
          ec: input.ec,
          light_dli: input.lightDli,
          co2_ppm: input.co2Ppm,
          grow_media: input.growMedia,
          days_growing: input.daysGrowing,
        });
      } catch {
        const profile = FALLBACK_CROPS[input.crop.toLowerCase()];
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: `Crop '${input.crop}' not supported` });

        const baseYield = (profile.yield_per_sqm_kg as number) * input.spaceSqm;
        const envFactor = 0.85; // assume decent conditions
        const predicted = Math.round(baseYield * envFactor * 100) / 100;
        return {
          success: true,
          predicted_yield_kg: predicted,
          confidence: 70,
          yield_per_sqm: Math.round(predicted / input.spaceSqm * 100) / 100,
          days_to_harvest: Math.max(0, (profile.grow_days as number) - input.daysGrowing),
          optimal_vs_actual: { optimal_yield_kg: baseYield, actual_yield_kg: predicted, gap_pct: 15 },
          improvement_potential_pct: 15,
          fallback: true,
        };
      }
    }),

  // ========================================================================
  // PLANTING SCHEDULE
  // ========================================================================

  generatePlantingSchedule: protectedProcedure
    .input(z.object({
      crops: z.array(z.string()),
      totalSpaceSqm: z.number(),
      targetWeeklyHarvestKg: z.number(),
      maxConcurrentCrops: z.number().default(4),
    }))
    .mutation(async ({ input }) => {
      try {
        return await callAIService("POST", "/api/planting-schedule", {
          crops: input.crops.map((c) => c.toLowerCase()),
          total_space_sqm: input.totalSpaceSqm,
          target_weekly_harvest_kg: input.targetWeeklyHarvestKg,
          max_concurrent_crops: input.maxConcurrentCrops,
        });
      } catch {
        // Fallback schedule
        const schedule = input.crops.slice(0, input.maxConcurrentCrops).map((crop, i) => {
          const profile = FALLBACK_CROPS[crop.toLowerCase()];
          if (!profile) return null;
          return {
            crop: crop.toLowerCase(),
            batch: 1,
            plant_week: i,
            harvest_week: i + Math.ceil((profile.grow_days as number) / 7),
            space_sqm: input.totalSpaceSqm / Math.min(input.crops.length, input.maxConcurrentCrops),
            expected_yield_kg: (profile.yield_per_sqm_kg as number) * (input.totalSpaceSqm / Math.min(input.crops.length, input.maxConcurrentCrops)),
          };
        }).filter(Boolean);

        return { success: true, schedule, weekly_yield_projection: [], space_utilization_pct: 80, crops_in_rotation: schedule.length, fallback: true };
      }
    }),

  // ========================================================================
  // RESOURCE FORECASTING
  // ========================================================================

  forecastResources: protectedProcedure
    .input(z.object({
      crop: z.string(),
      spaceSqm: z.number(),
      growDays: z.number(),
      growMedia: z.string().default("nft"),
    }))
    .mutation(async ({ input }) => {
      try {
        return await callAIService("POST", "/api/resource-forecast", {
          crop: input.crop.toLowerCase(),
          space_sqm: input.spaceSqm,
          grow_days: input.growDays,
          grow_media: input.growMedia,
        });
      } catch {
        const profile = FALLBACK_CROPS[input.crop.toLowerCase()];
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: `Crop '${input.crop}' not supported` });

        const estYield = (profile.yield_per_sqm_kg as number) * input.spaceSqm;
        const water = 20 * estYield;
        const energy = input.spaceSqm * 16 * input.growDays * 0.04;
        return {
          success: true,
          water_liters: Math.round(water),
          energy_kwh: Math.round(energy),
          nutrients: { N: 150, P: 50, K: 200, Ca: 150, Mg: 50 },
          co2_kg: Math.round(input.spaceSqm * input.growDays * 0.001 * 100) / 100,
          cost_estimate: {
            water_kes: Math.round(water * 0.05),
            energy_kes: Math.round(energy * 15),
            total_kes: Math.round(water * 0.05 + energy * 15),
            currency: "KES",
          },
          fallback: true,
        };
      }
    }),

  // ========================================================================
  // GROWTH STAGE CLASSIFICATION
  // ========================================================================

  classifyGrowthStage: protectedProcedure
    .input(z.object({
      crop: z.string(),
      daysSincePlanting: z.number(),
      heightCm: z.number().optional(),
      leafCount: z.number().optional(),
      rootLengthCm: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        return await callAIService("POST", "/api/growth-stage", {
          crop: input.crop.toLowerCase(),
          days_since_planting: input.daysSincePlanting,
          height_cm: input.heightCm,
          leaf_count: input.leafCount,
          root_length_cm: input.rootLengthCm,
        });
      } catch {
        const profile = FALLBACK_CROPS[input.crop.toLowerCase()];
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: `Crop '${input.crop}' not supported` });

        const stages = profile.stages as string[];
        const totalDays = profile.grow_days as number;
        const daysPerStage = totalDays / stages.length;
        const stageIdx = Math.min(Math.floor(input.daysSincePlanting / daysPerStage), stages.length - 1);

        return {
          success: true,
          predicted_stage: stages[stageIdx],
          stage_index: stageIdx,
          total_stages: stages.length,
          days_in_current_stage: Math.floor(input.daysSincePlanting - stageIdx * daysPerStage),
          days_to_next_stage: stageIdx < stages.length - 1 ? Math.ceil(daysPerStage - (input.daysSincePlanting - stageIdx * daysPerStage)) : 0,
          stage_specific_advice: ["Monitor conditions and maintain optimal parameters"],
          fallback: true,
        };
      }
    }),

  // ========================================================================
  // AI SERVICE STATUS
  // ========================================================================

  getAIStatus: protectedProcedure.query(async () => {
    try {
      const health = await callAIService<Record<string, unknown>>("GET", "/health");
      return { ...health, available: true };
    } catch {
      return {
        status: "unavailable",
        available: false,
        supported_crops: Object.keys(FALLBACK_CROPS),
        fallback_mode: true,
      };
    }
  }),
});
