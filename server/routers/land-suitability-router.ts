/**
 * Land Suitability Assessment Router
 * 
 * Provides API endpoints for farmers to assess land suitability for different crops.
 * Helps answer questions like "Is my land suitable for planting palm trees?"
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import {
  assessLandSuitability,
  findSuitableCrops,
  getCropCategories,
  getCropDetails,
  getAllCrops,
  CROP_REQUIREMENTS,
  type SoilData,
  type ClimateData,
  type TopographyData,
} from "../services/land-suitability-service";

// Input schemas
const soilDataSchema = z.object({
  ph: z.number().min(0).max(14),
  texture: z.string(),
  organicMatter: z.number().min(0).max(100),
  drainage: z.enum(["well_drained", "moderate", "poor", "waterlogged"]),
  depth: z.number().min(0),
  salinity: z.enum(["low", "moderate", "high"]),
  nitrogen: z.number().optional(),
  phosphorus: z.number().optional(),
  potassium: z.number().optional(),
});

const climateDataSchema = z.object({
  avgTemperature: z.number(),
  minTemperature: z.number(),
  maxTemperature: z.number(),
  annualRainfall: z.number().min(0),
  avgHumidity: z.number().min(0).max(100),
  hasFrost: z.boolean(),
  drySeasonMonths: z.number().min(0).max(12),
});

const topographyDataSchema = z.object({
  slope: z.number().min(0).max(100),
  altitude: z.number(),
  floodRisk: z.boolean(),
});

export const landSuitabilityRouter = router({
  /**
   * Get all available crops for assessment
   */
  getAllCrops: publicProcedure.query(() => {
    return getAllCrops();
  }),

  /**
   * Get crops organized by category
   */
  getCropCategories: publicProcedure.query(() => {
    return getCropCategories();
  }),

  /**
   * Get detailed requirements for a specific crop
   */
  getCropDetails: publicProcedure
    .input(z.object({ cropId: z.string() }))
    .query(({ input }) => {
      const details = getCropDetails(input.cropId);
      if (!details) {
        throw new Error(`Crop not found: ${input.cropId}`);
      }
      return details;
    }),

  /**
   * Assess land suitability for a specific crop
   * 
   * Example: "Is my land suitable for palm trees?"
   */
  assessForCrop: protectedProcedure
    .input(
      z.object({
        cropId: z.string(),
        soil: soilDataSchema,
        climate: climateDataSchema,
        topography: topographyDataSchema,
        fieldAreaHa: z.number().min(0.01).default(1),
      })
    )
    .mutation(({ input }) => {
      const result = assessLandSuitability(
        input.cropId,
        input.soil as SoilData,
        input.climate as ClimateData,
        input.topography as TopographyData,
        input.fieldAreaHa
      );

      if (!result) {
        throw new Error(`Crop not found: ${input.cropId}`);
      }

      return result;
    }),

  /**
   * Find all suitable crops for given land conditions
   * 
   * Returns crops ranked by suitability score
   */
  findSuitableCrops: protectedProcedure
    .input(
      z.object({
        soil: soilDataSchema,
        climate: climateDataSchema,
        topography: topographyDataSchema,
        fieldAreaHa: z.number().min(0.01).default(1),
        minScore: z.number().min(0).max(100).default(50),
        category: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      let results = findSuitableCrops(
        input.soil as SoilData,
        input.climate as ClimateData,
        input.topography as TopographyData,
        input.fieldAreaHa,
        input.minScore
      );

      // Filter by category if specified
      if (input.category) {
        results = results.filter((r) => {
          const crop = CROP_REQUIREMENTS[r.cropId];
          return crop && crop.category === input.category;
        });
      }

      return {
        totalCropsAnalyzed: Object.keys(CROP_REQUIREMENTS).length,
        suitableCrops: results.length,
        results,
      };
    }),

  /**
   * Quick assessment with minimal inputs
   * Uses defaults for missing data
   */
  quickAssessment: publicProcedure
    .input(
      z.object({
        cropId: z.string(),
        soilPh: z.number().min(0).max(14),
        soilTexture: z.string(),
        annualRainfall: z.number().min(0),
        avgTemperature: z.number(),
        altitude: z.number().default(0),
      })
    )
    .query(({ input }) => {
      // Build full data objects with sensible defaults
      const soil: SoilData = {
        ph: input.soilPh,
        texture: input.soilTexture,
        organicMatter: 2.5, // Default moderate
        drainage: "well_drained",
        depth: 100, // Default 1m
        salinity: "low",
      };

      const climate: ClimateData = {
        avgTemperature: input.avgTemperature,
        minTemperature: input.avgTemperature - 5,
        maxTemperature: input.avgTemperature + 10,
        annualRainfall: input.annualRainfall,
        avgHumidity: 70, // Default moderate
        hasFrost: false,
        drySeasonMonths: 3,
      };

      const topography: TopographyData = {
        slope: 5, // Default gentle slope
        altitude: input.altitude,
        floodRisk: false,
      };

      const result = assessLandSuitability(input.cropId, soil, climate, topography, 1);

      if (!result) {
        throw new Error(`Crop not found: ${input.cropId}`);
      }

      return {
        ...result,
        note: "This is a quick assessment. For more accurate results, provide complete soil and climate data.",
      };
    }),

  /**
   * Compare multiple crops for the same land
   */
  compareCrops: protectedProcedure
    .input(
      z.object({
        cropIds: z.array(z.string()).min(2).max(10),
        soil: soilDataSchema,
        climate: climateDataSchema,
        topography: topographyDataSchema,
        fieldAreaHa: z.number().min(0.01).default(1),
      })
    )
    .mutation(({ input }) => {
      const results = input.cropIds.map((cropId) => {
        const result = assessLandSuitability(
          cropId,
          input.soil as SoilData,
          input.climate as ClimateData,
          input.topography as TopographyData,
          input.fieldAreaHa
        );
        return result;
      }).filter((r): r is NonNullable<typeof r> => r !== null);

      // Sort by overall score
      results.sort((a, b) => b.score.overall - a.score.overall);

      return {
        comparison: results,
        bestChoice: results[0]?.cropName || "None suitable",
        summary: results.map((r) => ({
          crop: r.cropName,
          score: r.score.overall,
          category: r.score.category,
          roi5Year: r.economics.roi5Year,
        })),
      };
    }),

  /**
   * Get soil amendment recommendations for a specific crop
   */
  getSoilAmendments: protectedProcedure
    .input(
      z.object({
        cropId: z.string(),
        soil: soilDataSchema,
      })
    )
    .query(({ input }) => {
      const crop = getCropDetails(input.cropId);
      if (!crop) {
        throw new Error(`Crop not found: ${input.cropId}`);
      }

      // Use a simplified assessment to get amendments
      const climate: ClimateData = {
        avgTemperature: crop.climate.tempOptimal,
        minTemperature: crop.climate.tempMin,
        maxTemperature: crop.climate.tempMax,
        annualRainfall: crop.climate.rainfallOptimal,
        avgHumidity: (crop.climate.humidityMin + crop.climate.humidityMax) / 2,
        hasFrost: false,
        drySeasonMonths: 3,
      };

      const topography: TopographyData = {
        slope: 5,
        altitude: (crop.topography.altitudeMin + crop.topography.altitudeMax) / 2,
        floodRisk: false,
      };

      const result = assessLandSuitability(
        input.cropId,
        input.soil as SoilData,
        climate,
        topography,
        1
      );

      if (!result) {
        throw new Error(`Assessment failed for: ${input.cropId}`);
      }

      return {
        cropName: result.cropName,
        currentSoilScore: result.score.soil,
        amendments: result.amendments,
        totalEstimatedCost: result.amendments.reduce((sum, a) => sum + a.estimatedCost, 0),
        priorityOrder: result.amendments
          .sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          })
          .map((a) => a.parameter),
      };
    }),

  /**
   * Get economic projections for a crop on given land
   */
  getEconomicProjection: protectedProcedure
    .input(
      z.object({
        cropId: z.string(),
        soil: soilDataSchema,
        climate: climateDataSchema,
        topography: topographyDataSchema,
        fieldAreaHa: z.number().min(0.01),
        years: z.number().min(1).max(30).default(10),
      })
    )
    .mutation(({ input }) => {
      const result = assessLandSuitability(
        input.cropId,
        input.soil as SoilData,
        input.climate as ClimateData,
        input.topography as TopographyData,
        input.fieldAreaHa
      );

      if (!result) {
        throw new Error(`Crop not found: ${input.cropId}`);
      }

      const crop = getCropDetails(input.cropId)!;
      const yieldFactor = result.score.overall / 100;

      // Generate year-by-year projection
      const yearlyProjection = [];
      let cumulativeRevenue = 0;
      let cumulativeCosts = result.economics.establishmentCost;

      for (let year = 1; year <= input.years; year++) {
        const isProducing = year > crop.economics.yearsToFirstHarvest;
        const annualYield = isProducing
          ? Math.round(crop.economics.averageYieldPerHa * yieldFactor * input.fieldAreaHa)
          : 0;
        const annualRevenue = annualYield * crop.economics.pricePerKg;
        const annualCosts = result.economics.establishmentCost * 0.15; // Maintenance

        cumulativeRevenue += annualRevenue;
        cumulativeCosts += annualCosts;

        yearlyProjection.push({
          year,
          isProducing,
          yield: annualYield,
          revenue: Math.round(annualRevenue),
          costs: Math.round(annualCosts),
          cumulativeProfit: Math.round(cumulativeRevenue - cumulativeCosts),
        });
      }

      const breakEvenYear = yearlyProjection.find((y) => y.cumulativeProfit > 0)?.year || null;

      return {
        cropName: result.cropName,
        fieldAreaHa: input.fieldAreaHa,
        suitabilityScore: result.score.overall,
        establishmentCost: result.economics.establishmentCost,
        yearsToFirstHarvest: crop.economics.yearsToFirstHarvest,
        productiveLifeYears: crop.economics.productiveLifeYears,
        yearlyProjection,
        breakEvenYear,
        totalProfitAtEndOfPeriod: yearlyProjection[yearlyProjection.length - 1]?.cumulativeProfit || 0,
      };
    }),
});
