/**
 * Predictive Analytics Router
 * 
 * ML-based forecasting for crop prices, weather impacts, pest outbreaks,
 * yield predictions, and market demand. Integrates with Python ML services
 * and provides actionable insights for farmers.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { crops, harvests, farms } from "../../drizzle/schema.js";
import { iotReadings, iotDevices } from "../../drizzle/supply-chain-schema.js";
import { resilientFetch } from "../services/resilient-http.js";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8093";
const WEATHER_SERVICE_URL = process.env.WEATHER_SERVICE_URL || "http://localhost:8094";

async function callMLService(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const resp = await resilientFetch(
      "ml-prediction-service",
      `${ML_SERVICE_URL}${path}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      { maxRetries: 2, timeoutMs: 30_000 },
    );
    return await resp.json() as Record<string, unknown>;
  } catch (error) { logger.error("[Service] Operation failed", { error: error instanceof Error ? error.message : String(error) });
    return { error: "ML service unavailable", fallback: true };
  }
}

// Crop growth stage coefficients for yield estimation
const CROP_YIELD_MODELS: Record<string, {
  baseYieldKgPerHa: number;
  optimalRainMm: number;
  optimalTempC: number;
  growingDays: number;
  droughtSensitivity: number;
  floodSensitivity: number;
}> = {
  maize: { baseYieldKgPerHa: 4500, optimalRainMm: 600, optimalTempC: 25, growingDays: 120, droughtSensitivity: 0.7, floodSensitivity: 0.4 },
  rice: { baseYieldKgPerHa: 5000, optimalRainMm: 1200, optimalTempC: 28, growingDays: 140, droughtSensitivity: 0.9, floodSensitivity: 0.2 },
  wheat: { baseYieldKgPerHa: 3500, optimalRainMm: 450, optimalTempC: 20, growingDays: 130, droughtSensitivity: 0.6, floodSensitivity: 0.5 },
  cassava: { baseYieldKgPerHa: 12000, optimalRainMm: 1000, optimalTempC: 27, growingDays: 270, droughtSensitivity: 0.3, floodSensitivity: 0.4 },
  sorghum: { baseYieldKgPerHa: 2500, optimalRainMm: 500, optimalTempC: 30, growingDays: 110, droughtSensitivity: 0.3, floodSensitivity: 0.5 },
  beans: { baseYieldKgPerHa: 2000, optimalRainMm: 500, optimalTempC: 22, growingDays: 90, droughtSensitivity: 0.5, floodSensitivity: 0.6 },
  coffee: { baseYieldKgPerHa: 1500, optimalRainMm: 1500, optimalTempC: 22, growingDays: 270, droughtSensitivity: 0.8, floodSensitivity: 0.3 },
  tea: { baseYieldKgPerHa: 2000, optimalRainMm: 1800, optimalTempC: 20, growingDays: 365, droughtSensitivity: 0.9, floodSensitivity: 0.2 },
  tomato: { baseYieldKgPerHa: 30000, optimalRainMm: 500, optimalTempC: 25, growingDays: 75, droughtSensitivity: 0.7, floodSensitivity: 0.8 },
  potato: { baseYieldKgPerHa: 20000, optimalRainMm: 600, optimalTempC: 18, growingDays: 100, droughtSensitivity: 0.6, floodSensitivity: 0.7 },
};

// Pest risk models by crop and conditions
const PEST_RISK_MODELS: Record<string, Array<{
  pest: string;
  tempRangeC: [number, number];
  humidityRangePercent: [number, number];
  riskMultiplier: number;
  treatmentCostPerHa: number;
  yieldLossPercent: number;
}>> = {
  maize: [
    { pest: "Fall Armyworm", tempRangeC: [20, 35], humidityRangePercent: [60, 95], riskMultiplier: 1.2, treatmentCostPerHa: 5000, yieldLossPercent: 30 },
    { pest: "Stem Borer", tempRangeC: [22, 32], humidityRangePercent: [50, 80], riskMultiplier: 0.8, treatmentCostPerHa: 3000, yieldLossPercent: 20 },
    { pest: "Maize Weevil", tempRangeC: [25, 35], humidityRangePercent: [70, 95], riskMultiplier: 0.6, treatmentCostPerHa: 2000, yieldLossPercent: 15 },
  ],
  rice: [
    { pest: "Rice Blast", tempRangeC: [20, 30], humidityRangePercent: [80, 100], riskMultiplier: 1.5, treatmentCostPerHa: 8000, yieldLossPercent: 40 },
    { pest: "Brown Planthopper", tempRangeC: [25, 35], humidityRangePercent: [70, 95], riskMultiplier: 1.0, treatmentCostPerHa: 4000, yieldLossPercent: 25 },
  ],
  tomato: [
    { pest: "Tuta Absoluta", tempRangeC: [18, 30], humidityRangePercent: [50, 85], riskMultiplier: 1.3, treatmentCostPerHa: 6000, yieldLossPercent: 50 },
    { pest: "Early Blight", tempRangeC: [22, 30], humidityRangePercent: [75, 100], riskMultiplier: 0.9, treatmentCostPerHa: 4000, yieldLossPercent: 30 },
  ],
  coffee: [
    { pest: "Coffee Berry Borer", tempRangeC: [20, 30], humidityRangePercent: [60, 90], riskMultiplier: 1.4, treatmentCostPerHa: 10000, yieldLossPercent: 35 },
    { pest: "Coffee Leaf Rust", tempRangeC: [18, 28], humidityRangePercent: [80, 100], riskMultiplier: 1.6, treatmentCostPerHa: 12000, yieldLossPercent: 50 },
  ],
};

// Market price seasonal patterns (monthly index, 1.0 = average)
const SEASONAL_PRICE_INDEX: Record<string, number[]> = {
  maize: [1.15, 1.20, 1.10, 1.05, 0.95, 0.85, 0.80, 0.85, 0.90, 1.00, 1.05, 1.10],
  rice: [1.10, 1.15, 1.05, 1.00, 0.95, 0.90, 0.88, 0.90, 0.95, 1.00, 1.05, 1.08],
  tomato: [0.80, 0.75, 0.85, 1.00, 1.20, 1.30, 1.25, 1.10, 0.95, 0.85, 0.80, 0.78],
  beans: [1.20, 1.15, 1.00, 0.90, 0.85, 0.80, 0.85, 0.95, 1.05, 1.10, 1.15, 1.18],
  coffee: [1.05, 1.00, 0.98, 0.95, 0.92, 0.90, 0.92, 0.95, 1.00, 1.05, 1.08, 1.10],
};

export const predictiveAnalyticsRouter = router({
  /**
   * Predict crop yield based on environmental conditions, soil data, and historical harvests.
   */
  predictYield: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      cropType: z.string(),
      plantingDate: z.string(),
      areaHectares: z.number().positive(),
      soilMoisturePercent: z.number().min(0).max(100).optional(),
      currentTempC: z.number().optional(),
      rainfallMm: z.number().min(0).optional(),
      fertilizerApplied: z.boolean().default(false),
      irrigated: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const cropModel = CROP_YIELD_MODELS[input.cropType.toLowerCase()];
      if (!cropModel) {
        return { error: `No yield model available for ${input.cropType}`, supportedCrops: Object.keys(CROP_YIELD_MODELS) };
      }

      // Try ML service first
      const mlResult = await callMLService("/api/yield/predict", {
        farm_id: input.farmId,
        crop_type: input.cropType,
        planting_date: input.plantingDate,
        area_ha: input.areaHectares,
        soil_moisture: input.soilMoisturePercent,
        temperature: input.currentTempC,
        rainfall: input.rainfallMm,
      });

      if (!mlResult.fallback && !mlResult.error) {
        return { source: "ml_model", ...mlResult };
      }

      // Fallback to rule-based model
      let yieldMultiplier = 1.0;

      // Rainfall adjustment
      const rainfall = input.rainfallMm ?? cropModel.optimalRainMm;
      const rainRatio = rainfall / cropModel.optimalRainMm;
      if (rainRatio < 0.5) {
        yieldMultiplier *= (1 - cropModel.droughtSensitivity * (1 - rainRatio * 2));
      } else if (rainRatio > 1.5) {
        yieldMultiplier *= (1 - cropModel.floodSensitivity * (rainRatio - 1.5));
      } else {
        yieldMultiplier *= (0.8 + 0.4 * Math.min(1, rainRatio));
      }

      // Temperature adjustment
      const temp = input.currentTempC ?? cropModel.optimalTempC;
      const tempDeviation = Math.abs(temp - cropModel.optimalTempC);
      yieldMultiplier *= Math.max(0.3, 1 - tempDeviation * 0.03);

      // Soil moisture
      if (input.soilMoisturePercent !== undefined) {
        if (input.soilMoisturePercent < 20) yieldMultiplier *= 0.6;
        else if (input.soilMoisturePercent < 35) yieldMultiplier *= 0.85;
        else if (input.soilMoisturePercent > 80) yieldMultiplier *= 0.9;
      }

      // Fertilizer and irrigation bonuses
      if (input.fertilizerApplied) yieldMultiplier *= 1.25;
      if (input.irrigated) yieldMultiplier *= 1.15;

      // Historical yield adjustment via crops linked to farm
      const farmCrops = await db.select().from(crops)
        .where(eq(crops.farmId, input.farmId)).limit(20);
      const farmCropIds = farmCrops.map(c => c.id);
      const historicalHarvests = farmCropIds.length > 0
        ? await db.select().from(harvests)
            .where(sql`${harvests.cropId} IN (${sql.join(farmCropIds.map(id => sql`${id}`), sql`, `)})`)
            .orderBy(desc(harvests.harvestDate))
            .limit(5)
        : [];

      let historicalAdjustment = 1.0;
      if (historicalHarvests.length >= 2) {
        const avgYield = historicalHarvests.reduce((sum, h) => sum + parseFloat(h.quantity || "0"), 0) / historicalHarvests.length;
        const expectedBase = cropModel.baseYieldKgPerHa * input.areaHectares;
        if (expectedBase > 0) {
          historicalAdjustment = 0.7 + 0.3 * Math.min(2, avgYield / expectedBase);
        }
      }

      const predictedYield = Math.round(cropModel.baseYieldKgPerHa * input.areaHectares * yieldMultiplier * historicalAdjustment);
      const expectedHarvestDate = new Date(input.plantingDate);
      expectedHarvestDate.setDate(expectedHarvestDate.getDate() + cropModel.growingDays);

      const confidenceLevel = historicalHarvests.length >= 3 ? "high" : historicalHarvests.length >= 1 ? "medium" : "low";

      return {
        source: "rule_based",
        cropType: input.cropType,
        predictedYieldKg: predictedYield,
        predictedYieldPerHa: Math.round(predictedYield / input.areaHectares),
        baseYieldPerHa: cropModel.baseYieldKgPerHa,
        yieldMultiplier: Math.round(yieldMultiplier * historicalAdjustment * 100) / 100,
        expectedHarvestDate: expectedHarvestDate.toISOString().split("T")[0],
        growingDays: cropModel.growingDays,
        confidenceLevel,
        factors: {
          rainfall: { value: rainfall, optimal: cropModel.optimalRainMm, impact: rainRatio < 0.5 ? "negative" : rainRatio > 1.5 ? "negative" : "positive" },
          temperature: { value: temp, optimal: cropModel.optimalTempC, impact: tempDeviation > 5 ? "negative" : "positive" },
          soilMoisture: input.soilMoisturePercent !== undefined ? { value: input.soilMoisturePercent, impact: input.soilMoisturePercent < 20 ? "negative" : "positive" } : null,
          fertilizer: { applied: input.fertilizerApplied, impact: input.fertilizerApplied ? "+25%" : "none" },
          irrigation: { applied: input.irrigated, impact: input.irrigated ? "+15%" : "none" },
          historicalData: { harvests: historicalHarvests.length, adjustment: Math.round(historicalAdjustment * 100) / 100 },
        },
      };
    }),

  /**
   * Forecast crop prices for the next N weeks.
   */
  forecastPrices: protectedProcedure
    .input(z.object({
      cropType: z.string(),
      region: z.string().default("kenya"),
      weeksAhead: z.number().min(1).max(52).default(12),
      currentPricePerKg: z.number().positive(),
      weatherOutlook: z.enum(["drought", "below_normal", "normal", "above_normal", "flood"]).default("normal"),
      supplyLevel: z.enum(["shortage", "low", "normal", "high", "surplus"]).default("normal"),
    }))
    .query(async ({ input }) => {
      // Try ML service
      const mlResult = await callMLService("/api/price/forecast", {
        crop: input.cropType,
        region: input.region,
        weeks: input.weeksAhead,
        current_price: input.currentPricePerKg,
        weather: input.weatherOutlook,
        supply: input.supplyLevel,
      });

      if (!mlResult.fallback && !mlResult.error) {
        return { source: "ml_model", ...mlResult };
      }

      // Rule-based price forecasting
      const seasonalIndex = SEASONAL_PRICE_INDEX[input.cropType.toLowerCase()] || Array(12).fill(1.0);
      const now = new Date();
      const forecasts: Array<{ weekNumber: number; date: string; predictedPrice: number; confidence: number; factors: string[] }> = [];

      const weatherMultiplier: Record<string, number> = {
        drought: 1.25, below_normal: 1.10, normal: 1.00, above_normal: 0.95, flood: 1.15,
      };
      const supplyMultiplier: Record<string, number> = {
        shortage: 1.30, low: 1.15, normal: 1.00, high: 0.85, surplus: 0.70,
      };

      const wMult = weatherMultiplier[input.weatherOutlook] || 1.0;
      const sMult = supplyMultiplier[input.supplyLevel] || 1.0;

      for (let w = 1; w <= input.weeksAhead; w++) {
        const forecastDate = new Date(now);
        forecastDate.setDate(forecastDate.getDate() + w * 7);
        const monthIndex = forecastDate.getMonth();
        const seasonal = seasonalIndex[monthIndex];

        // Price dampening over longer horizons
        const horizonDampening = 1 - (w / input.weeksAhead) * 0.05;

        const predicted = Math.round(input.currentPricePerKg * seasonal * wMult * sMult * horizonDampening * 100) / 100;
        const confidence = Math.max(30, 90 - w * 2);

        const factors: string[] = [];
        if (wMult !== 1.0) factors.push(`Weather: ${input.weatherOutlook} (${wMult > 1 ? "+" : ""}${Math.round((wMult - 1) * 100)}%)`);
        if (sMult !== 1.0) factors.push(`Supply: ${input.supplyLevel} (${sMult > 1 ? "+" : ""}${Math.round((sMult - 1) * 100)}%)`);
        if (seasonal !== 1.0) factors.push(`Seasonal: ${seasonal > 1 ? "+" : ""}${Math.round((seasonal - 1) * 100)}%`);

        forecasts.push({
          weekNumber: w,
          date: forecastDate.toISOString().split("T")[0],
          predictedPrice: predicted,
          confidence,
          factors,
        });
      }

      return {
        source: "rule_based",
        cropType: input.cropType,
        currentPrice: input.currentPricePerKg,
        forecasts,
        summary: {
          minPrice: Math.min(...forecasts.map(f => f.predictedPrice)),
          maxPrice: Math.max(...forecasts.map(f => f.predictedPrice)),
          avgPrice: Math.round(forecasts.reduce((s, f) => s + f.predictedPrice, 0) / forecasts.length * 100) / 100,
          trend: forecasts[forecasts.length - 1].predictedPrice > input.currentPricePerKg ? "upward" : "downward",
          bestSellWeek: forecasts.reduce((best, f) => f.predictedPrice > best.predictedPrice ? f : best).weekNumber,
        },
      };
    }),

  /**
   * Predict pest and disease risk based on IoT sensor data and weather conditions.
   */
  predictPestRisk: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      cropType: z.string(),
      temperatureC: z.number().optional(),
      humidityPercent: z.number().optional(),
      recentRainfallMm: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();

      // If no temp/humidity provided, try to get from IoT
      let temp = input.temperatureC;
      let humidity = input.humidityPercent;

      if (temp === undefined || humidity === undefined) {
        const devices = await db.select().from(iotDevices)
          .where(and(eq(iotDevices.farmId, input.farmId), eq(iotDevices.status, "active")))
          .limit(5);

        for (const device of devices) {
          if (temp === undefined) {
            const [tempReading] = await db.select().from(iotReadings)
              .where(and(eq(iotReadings.deviceId, device.id), eq(iotReadings.readingType, "temperature")))
              .orderBy(desc(iotReadings.recordedAt)).limit(1);
            if (tempReading) temp = parseFloat(tempReading.value?.toString() || "25");
          }
          if (humidity === undefined) {
            const [humReading] = await db.select().from(iotReadings)
              .where(and(eq(iotReadings.deviceId, device.id), eq(iotReadings.readingType, "humidity")))
              .orderBy(desc(iotReadings.recordedAt)).limit(1);
            if (humReading) humidity = parseFloat(humReading.value?.toString() || "60");
          }
        }
      }

      temp = temp ?? 25;
      humidity = humidity ?? 60;

      const pestModels = PEST_RISK_MODELS[input.cropType.toLowerCase()] || [];
      const risks: Array<{
        pest: string;
        riskLevel: "low" | "medium" | "high" | "critical";
        riskScore: number;
        conditions: string[];
        preventiveMeasures: string[];
        estimatedYieldLoss: number;
        estimatedTreatmentCost: number;
      }> = [];

      for (const model of pestModels) {
        const tempInRange = temp >= model.tempRangeC[0] && temp <= model.tempRangeC[1];
        const humidityInRange = humidity >= model.humidityRangePercent[0] && humidity <= model.humidityRangePercent[1];

        let riskScore = 0;
        const conditions: string[] = [];

        if (tempInRange) {
          riskScore += 35;
          conditions.push(`Temperature ${temp}°C within risk range ${model.tempRangeC[0]}-${model.tempRangeC[1]}°C`);
        }
        if (humidityInRange) {
          riskScore += 35;
          conditions.push(`Humidity ${humidity}% within risk range ${model.humidityRangePercent[0]}-${model.humidityRangePercent[1]}%`);
        }
        if (input.recentRainfallMm && input.recentRainfallMm > 50) {
          riskScore += 20;
          conditions.push(`Recent rainfall ${input.recentRainfallMm}mm increases moisture`);
        }

        riskScore = Math.round(riskScore * model.riskMultiplier);

        const riskLevel = riskScore >= 80 ? "critical" : riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low";

        const preventiveMeasures: string[] = [];
        if (riskLevel === "critical" || riskLevel === "high") {
          preventiveMeasures.push(`Apply targeted pesticide for ${model.pest}`);
          preventiveMeasures.push("Increase field monitoring frequency to daily");
          preventiveMeasures.push("Set up pheromone traps");
        } else if (riskLevel === "medium") {
          preventiveMeasures.push("Monitor fields every 3 days");
          preventiveMeasures.push("Prepare biological control agents");
        }

        risks.push({
          pest: model.pest,
          riskLevel,
          riskScore: Math.min(100, riskScore),
          conditions,
          preventiveMeasures,
          estimatedYieldLoss: model.yieldLossPercent,
          estimatedTreatmentCost: model.treatmentCostPerHa,
        });
      }

      risks.sort((a, b) => b.riskScore - a.riskScore);

      return {
        farmId: input.farmId,
        cropType: input.cropType,
        environmentalConditions: { temperature: temp, humidity, recentRainfall: input.recentRainfallMm },
        overallRisk: risks.length > 0 ? risks[0].riskLevel : "low",
        risks,
        recommendedActions: risks.filter(r => r.riskLevel === "critical" || r.riskLevel === "high").flatMap(r => r.preventiveMeasures),
      };
    }),

  /**
   * Weather impact analysis — how upcoming weather affects active crops.
   */
  weatherImpactAnalysis: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      forecastTempC: z.number(),
      forecastRainfallMm: z.number(),
      forecastHumidityPercent: z.number(),
      daysAhead: z.number().min(1).max(30).default(7),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();

      // Get active crops for farm
      const weatherCrops = await db.select().from(crops)
        .where(eq(crops.farmId, input.farmId));

      const impacts: Array<{
        cropType: string;
        yieldImpact: string;
        riskFactors: string[];
        recommendations: string[];
      }> = [];

      for (const crop of weatherCrops) {
        const model = CROP_YIELD_MODELS[crop.cropName?.toLowerCase() || ""];
        if (!model) continue;

        const riskFactors: string[] = [];
        const recommendations: string[] = [];

        // Temperature analysis
        const tempDev = Math.abs(input.forecastTempC - model.optimalTempC);
        if (tempDev > 8) {
          riskFactors.push(`Temperature ${input.forecastTempC}°C deviates ${tempDev}°C from optimal ${model.optimalTempC}°C`);
          recommendations.push(input.forecastTempC > model.optimalTempC ? "Apply mulch to reduce soil temperature" : "Consider frost protection measures");
        }

        // Rainfall analysis
        const weeklyOptimal = model.optimalRainMm / 52 * (input.daysAhead / 7);
        if (input.forecastRainfallMm < weeklyOptimal * 0.3) {
          riskFactors.push(`Expected rainfall ${input.forecastRainfallMm}mm well below optimal ${Math.round(weeklyOptimal)}mm`);
          recommendations.push("Activate irrigation if available");
        } else if (input.forecastRainfallMm > weeklyOptimal * 3) {
          riskFactors.push(`Expected rainfall ${input.forecastRainfallMm}mm significantly exceeds optimal`);
          recommendations.push("Ensure drainage channels are clear");
          recommendations.push("Consider harvesting early if crop is near maturity");
        }

        // Humidity and disease risk
        if (input.forecastHumidityPercent > 85) {
          riskFactors.push(`High humidity ${input.forecastHumidityPercent}% increases fungal disease risk`);
          recommendations.push("Apply preventive fungicide");
        }

        const yieldImpactPercent = riskFactors.length === 0 ? 0 : -(riskFactors.length * 8);

        impacts.push({
          cropType: crop.cropName || "unknown",
          yieldImpact: yieldImpactPercent === 0 ? "no_impact" : `${yieldImpactPercent}%`,
          riskFactors,
          recommendations,
        });
      }

      return {
        farmId: input.farmId,
        forecastPeriodDays: input.daysAhead,
        conditions: {
          temperature: input.forecastTempC,
          rainfall: input.forecastRainfallMm,
          humidity: input.forecastHumidityPercent,
        },
        cropImpacts: impacts,
        urgentActions: impacts.filter(i => i.riskFactors.length >= 2).flatMap(i => i.recommendations),
      };
    }),

  /**
   * Optimal planting window recommendation.
   */
  optimalPlantingWindow: protectedProcedure
    .input(z.object({
      cropType: z.string(),
      region: z.string().default("kenya"),
      latitude: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const model = CROP_YIELD_MODELS[input.cropType.toLowerCase()];
      if (!model) {
        return { error: `No model for ${input.cropType}`, supportedCrops: Object.keys(CROP_YIELD_MODELS) };
      }

      // Regional planting calendars (month ranges, 1-indexed)
      const plantingCalendars: Record<string, Record<string, { longRains: [number, number]; shortRains: [number, number] }>> = {
        kenya: {
          maize: { longRains: [3, 4], shortRains: [10, 11] },
          beans: { longRains: [3, 4], shortRains: [10, 11] },
          rice: { longRains: [4, 5], shortRains: [10, 11] },
          wheat: { longRains: [6, 7], shortRains: [11, 12] },
          coffee: { longRains: [4, 5], shortRains: [10, 11] },
          tomato: { longRains: [3, 4], shortRains: [9, 10] },
        },
        nigeria: {
          maize: { longRains: [4, 5], shortRains: [8, 9] },
          rice: { longRains: [5, 6], shortRains: [9, 10] },
          cassava: { longRains: [3, 4], shortRains: [9, 10] },
          beans: { longRains: [4, 5], shortRains: [9, 10] },
          sorghum: { longRains: [5, 6], shortRains: [9, 10] },
          tomato: { longRains: [4, 5], shortRains: [10, 11] },
        },
      };

      const regionCalendar = plantingCalendars[input.region.toLowerCase()];
      const cropCalendar = regionCalendar?.[input.cropType.toLowerCase()];

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      if (cropCalendar) {
        const longRainsStart = monthNames[cropCalendar.longRains[0] - 1];
        const longRainsEnd = monthNames[cropCalendar.longRains[1] - 1];
        const shortRainsStart = monthNames[cropCalendar.shortRains[0] - 1];
        const shortRainsEnd = monthNames[cropCalendar.shortRains[1] - 1];

        const expectedHarvestLong = new Date();
        expectedHarvestLong.setMonth(cropCalendar.longRains[0] - 1 + Math.ceil(model.growingDays / 30));
        const expectedHarvestShort = new Date();
        expectedHarvestShort.setMonth(cropCalendar.shortRains[0] - 1 + Math.ceil(model.growingDays / 30));

        return {
          cropType: input.cropType,
          region: input.region,
          growingDays: model.growingDays,
          windows: [
            {
              season: "Long Rains",
              plantingPeriod: `${longRainsStart}–${longRainsEnd}`,
              expectedHarvest: monthNames[expectedHarvestLong.getMonth()],
              recommended: true,
            },
            {
              season: "Short Rains",
              plantingPeriod: `${shortRainsStart}–${shortRainsEnd}`,
              expectedHarvest: monthNames[expectedHarvestShort.getMonth()],
              recommended: false,
            },
          ],
          optimalConditions: {
            temperatureC: model.optimalTempC,
            rainfallMm: model.optimalRainMm,
          },
        };
      }

      return {
        cropType: input.cropType,
        region: input.region,
        growingDays: model.growingDays,
        windows: [],
        optimalConditions: {
          temperatureC: model.optimalTempC,
          rainfallMm: model.optimalRainMm,
        },
        note: `No specific calendar for ${input.cropType} in ${input.region}. Use general guidelines: plant when soil moisture ≥35% and temperature near ${model.optimalTempC}°C.`,
      };
    }),

  /**
   * Market demand forecast — predict demand volumes by crop and region.
   */
  forecastDemand: protectedProcedure
    .input(z.object({
      cropType: z.string(),
      region: z.string().default("nairobi"),
      weeksAhead: z.number().min(1).max(52).default(8),
    }))
    .query(async ({ input }) => {
      const mlResult = await callMLService("/api/demand/forecast", {
        crop: input.cropType,
        region: input.region,
        weeks: input.weeksAhead,
      });

      if (!mlResult.fallback && !mlResult.error) {
        return { source: "ml_model", ...mlResult };
      }

      const baseDemandTons: Record<string, number> = {
        maize: 500, rice: 400, wheat: 300, tomato: 200, beans: 150, cassava: 250, coffee: 100, tea: 80,
      };
      const base = baseDemandTons[input.cropType.toLowerCase()] || 100;
      const seasonal = SEASONAL_PRICE_INDEX[input.cropType.toLowerCase()] || Array(12).fill(1.0);
      const now = new Date();

      const forecasts = Array.from({ length: input.weeksAhead }, (_, i) => {
        const date = new Date(now);
        date.setDate(date.getDate() + (i + 1) * 7);
        const monthIdx = date.getMonth();
        const demandTons = Math.round(base * seasonal[monthIdx] * (0.9 + Math.random() * 0.2));

        return {
          weekNumber: i + 1,
          date: date.toISOString().split("T")[0],
          demandTons,
          demandLevel: demandTons > base * 1.1 ? "high" : demandTons < base * 0.9 ? "low" : "normal",
        };
      });

      return {
        source: "rule_based",
        cropType: input.cropType,
        region: input.region,
        forecasts,
        recommendation: forecasts.some(f => f.demandLevel === "high")
          ? `High demand expected — consider increasing ${input.cropType} allocation`
          : `Stable demand for ${input.cropType}`,
      };
    }),
});
