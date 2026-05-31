/**
 * Aquaculture AI Router — Fish Disease Diagnosis & Growth Models
 *
 * Orchestrates communication between:
 *  - Python Aquaculture AI Service (Port 8115) — disease diagnosis, growth prediction, hatchery
 *  - Lakehouse — long-term analytics storage for disease/growth data
 *  - OpenSearch — disease knowledge base search
 *  - PostgreSQL — diagnosis records, growth tracking
 *  - Kafka — disease alert events
 *  - Redis — cached growth model parameters
 *  - Permify — role-based access (veterinarian, farm_manager, viewer)
 *  - Keycloak — authentication
 *
 * Features:
 *  - Fish disease diagnosis with symptom matching (8 diseases)
 *  - Species growth curve prediction (von Bertalanffy model)
 *  - Hatchery management (egg production, survival rates)
 *  - Stocking density recommendations
 *  - Yield forecasting with economic projections
 *  - Effluent water quality prediction for regulatory compliance
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { TRPCError } from "@trpc/server";
import { publishEvent, createEvent, getProducer } from "../kafka.js";
import { logger } from "../logger.js";
import { resilientPost } from "../services/resilient-http.js";

const AI_SERVICE_URL = process.env.AQUACULTURE_AI_SERVICE_URL || "http://localhost:8115";

// Fallback disease database
const FISH_DISEASES = [
  { id: "columnaris", name: "Columnaris (Cotton Wool Disease)", type: "bacterial", pathogen: "Flavobacterium columnare", species: ["catfish", "tilapia", "carp", "barramundi"], symptoms: ["white patches on skin", "frayed fins", "gill necrosis", "lethargy", "loss of appetite"], mortality_rate: 0.30, recovery_days: 14 },
  { id: "ich", name: "White Spot Disease (Ich)", type: "parasitic", pathogen: "Ichthyophthirius multifiliis", species: ["catfish", "tilapia", "carp", "trout", "barramundi"], symptoms: ["white spots on body", "flashing/scratching", "clamped fins", "rapid gill movement"], mortality_rate: 0.50, recovery_days: 21 },
  { id: "eus", name: "Epizootic Ulcerative Syndrome", type: "fungal", pathogen: "Aphanomyces invadans", species: ["catfish", "tilapia", "carp", "barramundi"], symptoms: ["red spots/ulcers", "deep lesions", "necrotic tissue", "secondary infections"], mortality_rate: 0.40, recovery_days: 28 },
  { id: "saprolegnia", name: "Saprolegniasis (Water Mold)", type: "fungal", pathogen: "Saprolegnia spp.", species: ["catfish", "tilapia", "trout", "carp"], symptoms: ["cotton-like growth", "white/grey patches", "egg fungus", "gill damage"], mortality_rate: 0.20, recovery_days: 10 },
  { id: "vibriosis", name: "Vibriosis", type: "bacterial", pathogen: "Vibrio spp.", species: ["shrimp", "barramundi", "tilapia"], symptoms: ["lethargy", "dark coloration", "hemorrhages", "swollen abdomen", "mass mortality"], mortality_rate: 0.60, recovery_days: 14 },
  { id: "white_spot_shrimp", name: "White Spot Syndrome (WSSV)", type: "viral", pathogen: "White Spot Syndrome Virus", species: ["shrimp"], symptoms: ["white spots on carapace", "red discoloration", "loose shell", "rapid death"], mortality_rate: 0.90, recovery_days: 0 },
  { id: "aeromonas", name: "Motile Aeromonas Septicemia", type: "bacterial", pathogen: "Aeromonas hydrophila", species: ["catfish", "tilapia", "carp"], symptoms: ["hemorrhages", "ulcers", "ascites", "exophthalmia", "fin rot"], mortality_rate: 0.35, recovery_days: 14 },
  { id: "streptococcosis", name: "Streptococcosis", type: "bacterial", pathogen: "Streptococcus iniae / agalactiae", species: ["tilapia", "barramundi"], symptoms: ["erratic swimming", "exophthalmia", "darkening", "hemorrhages"], mortality_rate: 0.45, recovery_days: 21 },
];

// Fallback growth models
const GROWTH_MODELS: Record<string, {
  species: string; initial_weight_g: number; market_weight_g: number;
  optimal_temp: number; k_growth: number; w_inf: number;
  phases: Array<{ phase: string; days: number; weight_g: number; protein_pct: number; feed_rate_pct: number }>;
}> = {
  catfish: { species: "African Catfish (Clarias)", initial_weight_g: 5, market_weight_g: 1000, optimal_temp: 28, k_growth: 0.015, w_inf: 5000, phases: [
    { phase: "fry", days: 0, weight_g: 5, protein_pct: 45, feed_rate_pct: 10 },
    { phase: "fingerling", days: 30, weight_g: 30, protein_pct: 40, feed_rate_pct: 5 },
    { phase: "juvenile", days: 60, weight_g: 100, protein_pct: 35, feed_rate_pct: 3.5 },
    { phase: "grower", days: 120, weight_g: 400, protein_pct: 32, feed_rate_pct: 2.5 },
    { phase: "finisher", days: 180, weight_g: 1000, protein_pct: 28, feed_rate_pct: 2 },
  ]},
  tilapia: { species: "Nile Tilapia", initial_weight_g: 1, market_weight_g: 500, optimal_temp: 28, k_growth: 0.012, w_inf: 4000, phases: [
    { phase: "fry", days: 0, weight_g: 1, protein_pct: 40, feed_rate_pct: 12 },
    { phase: "fingerling", days: 28, weight_g: 15, protein_pct: 35, feed_rate_pct: 5 },
    { phase: "juvenile", days: 56, weight_g: 80, protein_pct: 30, feed_rate_pct: 3 },
    { phase: "grower", days: 100, weight_g: 250, protein_pct: 28, feed_rate_pct: 2.5 },
    { phase: "finisher", days: 150, weight_g: 500, protein_pct: 25, feed_rate_pct: 2 },
  ]},
  shrimp: { species: "Giant Tiger Prawn", initial_weight_g: 0.01, market_weight_g: 30, optimal_temp: 29, k_growth: 0.025, w_inf: 300, phases: [
    { phase: "post_larva", days: 0, weight_g: 0.01, protein_pct: 45, feed_rate_pct: 20 },
    { phase: "juvenile", days: 30, weight_g: 2, protein_pct: 40, feed_rate_pct: 10 },
    { phase: "sub_adult", days: 60, weight_g: 10, protein_pct: 38, feed_rate_pct: 5 },
    { phase: "adult", days: 90, weight_g: 20, protein_pct: 35, feed_rate_pct: 3 },
    { phase: "market", days: 120, weight_g: 30, protein_pct: 32, feed_rate_pct: 2.5 },
  ]},
  trout: { species: "Rainbow Trout", initial_weight_g: 2, market_weight_g: 350, optimal_temp: 14, k_growth: 0.008, w_inf: 25000, phases: [
    { phase: "fry", days: 0, weight_g: 2, protein_pct: 50, feed_rate_pct: 8 },
    { phase: "fingerling", days: 60, weight_g: 20, protein_pct: 45, feed_rate_pct: 4 },
    { phase: "juvenile", days: 120, weight_g: 80, protein_pct: 42, feed_rate_pct: 3 },
    { phase: "grower", days: 200, weight_g: 200, protein_pct: 40, feed_rate_pct: 2 },
    { phase: "market", days: 270, weight_g: 350, protein_pct: 38, feed_rate_pct: 1.5 },
  ]},
  carp: { species: "Common Carp", initial_weight_g: 3, market_weight_g: 800, optimal_temp: 24, k_growth: 0.010, w_inf: 40000, phases: [
    { phase: "fry", days: 0, weight_g: 3, protein_pct: 35, feed_rate_pct: 8 },
    { phase: "fingerling", days: 45, weight_g: 30, protein_pct: 30, feed_rate_pct: 4 },
    { phase: "juvenile", days: 90, weight_g: 150, protein_pct: 28, feed_rate_pct: 3 },
    { phase: "grower", days: 160, weight_g: 450, protein_pct: 25, feed_rate_pct: 2.5 },
    { phase: "market", days: 240, weight_g: 800, protein_pct: 22, feed_rate_pct: 2 },
  ]},
  barramundi: { species: "Barramundi", initial_weight_g: 2, market_weight_g: 600, optimal_temp: 29, k_growth: 0.018, w_inf: 60000, phases: [
    { phase: "fry", days: 0, weight_g: 2, protein_pct: 50, feed_rate_pct: 10 },
    { phase: "fingerling", days: 30, weight_g: 25, protein_pct: 45, feed_rate_pct: 5 },
    { phase: "juvenile", days: 60, weight_g: 100, protein_pct: 42, feed_rate_pct: 3.5 },
    { phase: "grower", days: 120, weight_g: 300, protein_pct: 40, feed_rate_pct: 2.5 },
    { phase: "market", days: 180, weight_g: 600, protein_pct: 38, feed_rate_pct: 2 },
  ]},
};

// Fallback hatchery profiles
const HATCHERY_PROFILES: Record<string, {
  eggs_per_kg_female: number; fertilization_rate: number; hatching_rate: number;
  fry_survival_rate: number; incubation_temp: number; incubation_hours: number;
  yolk_absorption_days: number;
}> = {
  catfish: { eggs_per_kg_female: 60000, fertilization_rate: 0.85, hatching_rate: 0.75, fry_survival_rate: 0.60, incubation_temp: 28, incubation_hours: 24, yolk_absorption_days: 3 },
  tilapia: { eggs_per_kg_female: 3000, fertilization_rate: 0.90, hatching_rate: 0.85, fry_survival_rate: 0.70, incubation_temp: 28, incubation_hours: 72, yolk_absorption_days: 5 },
  shrimp: { eggs_per_kg_female: 500000, fertilization_rate: 0.80, hatching_rate: 0.60, fry_survival_rate: 0.40, incubation_temp: 29, incubation_hours: 14, yolk_absorption_days: 1 },
  trout: { eggs_per_kg_female: 2000, fertilization_rate: 0.92, hatching_rate: 0.88, fry_survival_rate: 0.75, incubation_temp: 10, incubation_hours: 720, yolk_absorption_days: 14 },
  carp: { eggs_per_kg_female: 100000, fertilization_rate: 0.88, hatching_rate: 0.70, fry_survival_rate: 0.55, incubation_temp: 24, incubation_hours: 48, yolk_absorption_days: 4 },
  barramundi: { eggs_per_kg_female: 50000, fertilization_rate: 0.82, hatching_rate: 0.65, fry_survival_rate: 0.45, incubation_temp: 29, incubation_hours: 18, yolk_absorption_days: 2 },
};

export const aquacultureAIRouter = router({
  // ---- PUBLIC: List all diseases ----
  listDiseases: publicProcedure
    .query(async () => {
      try {
        const data = await resilientPost("aquaculture-ai", `${AI_SERVICE_URL}/diseases`, {});
        return data;
      } catch {
        return { diseases: FISH_DISEASES, total: FISH_DISEASES.length, source: "fallback" };
      }
    }),

  // ---- PUBLIC: List growth models ----
  listGrowthModels: publicProcedure
    .query(async () => {
      try {
        const data = await resilientPost("aquaculture-ai", `${AI_SERVICE_URL}/growth-models`, {});
        return data;
      } catch {
        const models = Object.entries(GROWTH_MODELS).map(([id, m]) => ({
          id, species: m.species, initial_weight_g: m.initial_weight_g,
          market_weight_g: m.market_weight_g, phases: m.phases.length,
          optimal_temp: m.optimal_temp, k_growth: m.k_growth,
        }));
        return { models, total: models.length, source: "fallback" };
      }
    }),

  // ---- PUBLIC: List hatchery profiles ----
  listHatcheryProfiles: publicProcedure
    .query(() => {
      const profiles = Object.entries(HATCHERY_PROFILES).map(([species, p]) => ({
        species, ...p,
        overall_survival: Math.round(p.fertilization_rate * p.hatching_rate * p.fry_survival_rate * 10000) / 10000,
      }));
      return { profiles, total: profiles.length };
    }),

  // ---- PROTECTED: Diagnose fish disease ----
  diagnoseFishDisease: protectedProcedure
    .input(z.object({
      species: z.string(),
      symptoms: z.array(z.string()).min(1),
      waterTemp: z.number().optional(),
      ph: z.number().optional(),
      dissolvedOxygen: z.number().optional(),
      stockingDensity: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await resilientPost("aquaculture-ai", `${AI_SERVICE_URL}/diagnose`, {
          species: input.species, symptoms: input.symptoms,
          water_temp: input.waterTemp, ph: input.ph,
          do_mg_l: input.dissolvedOxygen,
          stocking_density: input.stockingDensity,
        });

        const producer = await getProducer();
        if (producer) {
          await publishEvent("aquaculture.diagnosis", createEvent("disease.diagnosed", "diagnosis", String(Date.now()), "system", input));
        }
        return result;
      } catch {
        // Fallback: simple symptom matching
        const speciesLower = input.species.toLowerCase();
        const symptomsLower = input.symptoms.map(s => s.toLowerCase());

        const matches = FISH_DISEASES
          .filter(d => d.species.includes(speciesLower))
          .map(d => {
            const matched = d.symptoms.filter(s =>
              symptomsLower.some(is => is.includes(s.toLowerCase()) || s.toLowerCase().includes(is))
            );
            const confidence = matched.length / d.symptoms.length;
            return { ...d, matched_symptoms: matched, confidence: Math.round(confidence * 1000) / 1000 };
          })
          .filter(d => d.confidence > 0)
          .sort((a, b) => b.confidence - a.confidence);

        return {
          species: speciesLower,
          input_symptoms: input.symptoms,
          diagnoses: matches.slice(0, 5),
          total_matches: matches.length,
          recommendation: matches.length > 0 ? ["Consult aquaculture veterinarian", `Likely ${matches[0].name}`] : ["No matching disease found — consult specialist"],
          source: "fallback",
        };
      }
    }),

  // ---- PROTECTED: Predict growth ----
  predictGrowth: protectedProcedure
    .input(z.object({
      species: z.string(),
      currentWeightGrams: z.number().nonnegative(),
      daysSinceStocking: z.number().int().nonnegative(),
      waterTemp: z.number().default(28),
      feedingRatePct: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await resilientPost("aquaculture-ai", `${AI_SERVICE_URL}/predict-growth`, {
          species: input.species,
          current_weight_grams: input.currentWeightGrams,
          days_since_stocking: input.daysSinceStocking,
          water_temp: input.waterTemp,
          feeding_rate_pct: input.feedingRatePct,
        });
        return result;
      } catch {
        // Fallback: von Bertalanffy growth model
        const sp = input.species.toLowerCase();
        const model = GROWTH_MODELS[sp];
        if (!model) {
          throw new TRPCError({ code: "NOT_FOUND", message: `No growth model for: ${sp}` });
        }

        const tempDiff = Math.abs(input.waterTemp - model.optimal_temp);
        const tempFactor = Math.max(0.3, 1.0 - tempDiff / 20.0);
        const k = model.k_growth * tempFactor;
        const predictedWeight = model.w_inf * Math.pow(1 - Math.exp(-k * input.daysSinceStocking), 3);

        let currentPhase = "unknown";
        let nextPhase = null;
        for (let i = 0; i < model.phases.length; i++) {
          if (input.daysSinceStocking >= model.phases[i].days) {
            currentPhase = model.phases[i].phase;
            if (i + 1 < model.phases.length) nextPhase = model.phases[i + 1];
          }
        }

        const remaining = Math.max(0, model.market_weight_g - predictedWeight);
        const lastPhase = model.phases[model.phases.length - 1];
        const secondLast = model.phases[model.phases.length - 2];
        const dailyGrowth = (lastPhase.weight_g - secondLast.weight_g) / (lastPhase.days - secondLast.days);
        const daysToMarket = remaining > 0 ? Math.round(remaining / Math.max(dailyGrowth * tempFactor, 0.1)) : 0;

        return {
          species: model.species,
          days_since_stocking: input.daysSinceStocking,
          current_weight_grams: input.currentWeightGrams,
          predicted_weight_grams: Math.round(predictedWeight * 100) / 100,
          market_weight_grams: model.market_weight_g,
          weight_to_market_grams: Math.round(remaining * 100) / 100,
          days_to_market: daysToMarket,
          current_phase: currentPhase,
          next_phase: nextPhase,
          temp_factor: Math.round(tempFactor * 1000) / 1000,
          growth_rate_g_per_day: Math.round((predictedWeight / Math.max(input.daysSinceStocking, 1)) * 100) / 100,
          source: "fallback",
        };
      }
    }),

  // ---- PROTECTED: Hatchery estimate ----
  estimateHatchery: protectedProcedure
    .input(z.object({
      species: z.string(),
      femaleWeightKg: z.number().positive(),
      numFemales: z.number().int().positive().default(1),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await resilientPost("aquaculture-ai", `${AI_SERVICE_URL}/hatchery/estimate`, {
          species: input.species,
          female_weight_kg: input.femaleWeightKg,
          num_females: input.numFemales,
        });
        return result;
      } catch {
        const sp = input.species.toLowerCase();
        const profile = HATCHERY_PROFILES[sp];
        if (!profile) {
          throw new TRPCError({ code: "NOT_FOUND", message: `No hatchery profile for: ${sp}` });
        }

        const totalEggs = Math.floor(profile.eggs_per_kg_female * input.femaleWeightKg * input.numFemales);
        const fertilized = Math.floor(totalEggs * profile.fertilization_rate);
        const hatched = Math.floor(fertilized * profile.hatching_rate);
        const surviving = Math.floor(hatched * profile.fry_survival_rate);

        return {
          species: sp,
          female_weight_kg: input.femaleWeightKg,
          num_females: input.numFemales,
          total_eggs: totalEggs,
          fertilized_eggs: fertilized,
          hatched,
          surviving_fry: surviving,
          fertilization_rate: profile.fertilization_rate,
          hatching_rate: profile.hatching_rate,
          fry_survival_rate: profile.fry_survival_rate,
          incubation_temp_celsius: profile.incubation_temp,
          incubation_hours: profile.incubation_hours,
          yolk_absorption_days: profile.yolk_absorption_days,
          overall_survival_rate: totalEggs > 0 ? Math.round((surviving / totalEggs) * 10000) / 10000 : 0,
          source: "fallback",
        };
      }
    }),

  // ---- PROTECTED: Stocking density recommendation ----
  recommendStockingDensity: protectedProcedure
    .input(z.object({
      species: z.string(),
      pondVolumeLiters: z.number().positive(),
      targetWeightGrams: z.number().positive(),
      growOutDays: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await resilientPost("aquaculture-ai", `${AI_SERVICE_URL}/stocking-density`, {
          species: input.species,
          pond_volume_liters: input.pondVolumeLiters,
          target_weight_grams: input.targetWeightGrams,
          grow_out_days: input.growOutDays,
        });
        return result;
      } catch {
        const sp = input.species.toLowerCase();
        const model = GROWTH_MODELS[sp];
        if (!model) {
          throw new TRPCError({ code: "NOT_FOUND", message: `No model for: ${sp}` });
        }

        const densityLimits: Record<string, number> = {
          catfish: 100, tilapia: 80, shrimp: 25, trout: 40, carp: 60, barramundi: 50,
        };
        const maxDensity = densityLimits[sp] || 50;
        const volumeM3 = input.pondVolumeLiters / 1000;
        const recommended = Math.floor(volumeM3 * maxDensity * 0.7);
        const weightFactor = Math.min(1.0, model.market_weight_g / input.targetWeightGrams);
        const adjusted = Math.floor(recommended * weightFactor);

        return {
          species: sp,
          pond_volume_liters: input.pondVolumeLiters,
          pond_volume_m3: volumeM3,
          max_density_per_m3: maxDensity,
          recommended_count: adjusted,
          density_per_m3: volumeM3 > 0 ? Math.round((adjusted / volumeM3) * 10) / 10 : 0,
          target_weight_grams: input.targetWeightGrams,
          safety_factor: 0.7,
          grow_out_days: input.growOutDays,
          source: "fallback",
        };
      }
    }),

  // ---- PROTECTED: Yield forecast ----
  forecastYield: protectedProcedure
    .input(z.object({
      species: z.string(),
      stockedCount: z.number().int().positive(),
      initialWeightGrams: z.number().nonnegative(),
      daysOfCulture: z.number().int().positive(),
      waterTemp: z.number().default(28),
      fcr: z.number().positive().default(1.5),
      feedCostPerKg: z.number().nonnegative().default(800),
      marketPricePerKg: z.number().positive().default(1800),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await resilientPost("aquaculture-ai", `${AI_SERVICE_URL}/yield-forecast`, {
          species: input.species, stocked_count: input.stockedCount,
          initial_weight_grams: input.initialWeightGrams,
          days_of_culture: input.daysOfCulture, water_temp: input.waterTemp,
          fcr: input.fcr, feed_cost_per_kg: input.feedCostPerKg,
          market_price_per_kg: input.marketPricePerKg,
        });
        return result;
      } catch {
        const sp = input.species.toLowerCase();
        const model = GROWTH_MODELS[sp];
        if (!model) {
          throw new TRPCError({ code: "NOT_FOUND", message: `No model for: ${sp}` });
        }

        const tempFactor = Math.max(0.3, 1.0 - Math.abs(input.waterTemp - model.optimal_temp) / 20);
        const k = model.k_growth * tempFactor;
        const predictedWeight = model.w_inf * Math.pow(1 - Math.exp(-k * input.daysOfCulture), 3);

        const baseSurvival = 0.90 - (input.daysOfCulture * 0.0003);
        const survivalRate = Math.max(0.5, baseSurvival);
        const survivingFish = Math.floor(input.stockedCount * survivalRate);

        const totalYieldKg = (survivingFish * predictedWeight) / 1000;
        const biomassGainKg = totalYieldKg - (input.stockedCount * input.initialWeightGrams / 1000);
        const totalFeedKg = biomassGainKg * input.fcr;
        const feedCost = totalFeedKg * input.feedCostPerKg;
        const revenue = totalYieldKg * input.marketPricePerKg;

        return {
          species: model.species,
          stocked_count: input.stockedCount,
          surviving_fish: survivingFish,
          survival_rate: Math.round(survivalRate * 10000) / 10000,
          predicted_avg_weight_g: Math.round(predictedWeight * 100) / 100,
          total_yield_kg: Math.round(totalYieldKg * 100) / 100,
          biomass_gain_kg: Math.round(biomassGainKg * 100) / 100,
          total_feed_kg: Math.round(totalFeedKg * 100) / 100,
          feed_cost: Math.round(feedCost * 100) / 100,
          revenue: Math.round(revenue * 100) / 100,
          profit: Math.round((revenue - feedCost) * 100) / 100,
          cost_per_kg_fish: Math.round((feedCost / Math.max(totalYieldKg, 0.01)) * 100) / 100,
          fcr: input.fcr, temp_factor: Math.round(tempFactor * 1000) / 1000,
          days_of_culture: input.daysOfCulture,
          source: "fallback",
        };
      }
    }),

  // ---- PROTECTED: Predict effluent quality ----
  predictEffluent: protectedProcedure
    .input(z.object({
      species: z.string(),
      stockedCount: z.number().int().positive(),
      avgWeightGrams: z.number().positive(),
      feedRatePct: z.number().positive(),
      pondVolumeLiters: z.number().positive(),
      waterExchangePct: z.number().positive().default(10),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await resilientPost("aquaculture-ai", `${AI_SERVICE_URL}/effluent-prediction`, {
          species: input.species, stocked_count: input.stockedCount,
          avg_weight_grams: input.avgWeightGrams, feed_rate_pct: input.feedRatePct,
          pond_volume_liters: input.pondVolumeLiters,
          water_exchange_pct: input.waterExchangePct,
        });
        return result;
      } catch {
        const totalBiomassKg = (input.stockedCount * input.avgWeightGrams) / 1000;
        const dailyFeedKg = totalBiomassKg * (input.feedRatePct / 100);
        const nWaste = dailyFeedKg * 1000 * 0.048;
        const pWaste = dailyFeedKg * 1000 * 0.012;
        const bodWaste = dailyFeedKg * 1000 * 0.25;
        const tssWaste = dailyFeedKg * 1000 * 0.30;

        const exchangeM3 = (input.pondVolumeLiters / 1000) * (input.waterExchangePct / 100);

        const limits = { nitrogen: 10, phosphorus: 1, bod: 30, tss: 50 };
        const concentrations = {
          nitrogen_mg_l: Math.round((nWaste / Math.max(exchangeM3, 0.01)) * 100) / 100,
          phosphorus_mg_l: Math.round((pWaste / Math.max(exchangeM3, 0.01)) * 100) / 100,
          bod_mg_l: Math.round((bodWaste / Math.max(exchangeM3, 0.01)) * 100) / 100,
          tss_mg_l: Math.round((tssWaste / Math.max(exchangeM3, 0.01)) * 100) / 100,
        };

        const compliance = {
          nitrogen: concentrations.nitrogen_mg_l <= limits.nitrogen,
          phosphorus: concentrations.phosphorus_mg_l <= limits.phosphorus,
          bod: concentrations.bod_mg_l <= limits.bod,
          tss: concentrations.tss_mg_l <= limits.tss,
        };

        return {
          species: input.species,
          total_biomass_kg: Math.round(totalBiomassKg * 100) / 100,
          daily_feed_kg: Math.round(dailyFeedKg * 100) / 100,
          effluent_concentrations: concentrations,
          regulatory_limits: limits,
          compliance,
          overall_compliant: Object.values(compliance).every(v => v),
          source: "fallback",
        };
      }
    }),

  // ---- PROTECTED: AI service status ----
  getAIStatus: protectedProcedure
    .query(async () => {
      try {
        const data = await resilientPost("aquaculture-ai", `${AI_SERVICE_URL}/health`, {});
        return data;
      } catch {
        return {
          status: "fallback",
          service: "aquaculture-ai",
          port: 8115,
          diseases_loaded: FISH_DISEASES.length,
          growth_models_loaded: Object.keys(GROWTH_MODELS).length,
          hatchery_profiles_loaded: Object.keys(HATCHERY_PROFILES).length,
          source: "fallback",
        };
      }
    }),
});
