/**
 * Soil Analysis Router
 * 
 * End-to-end soil testing: save results, track history, generate reports,
 * calculate trends, and provide improvement plans.
 * 
 * Integrates with:
 * - Python ML inference server (:8096) for soil health model predictions
 * - PostgreSQL for test persistence and history
 * - Kafka for soil test events (analytics pipeline)
 * - Redis for latest test result caching
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { soilTests, soilHistory } from "../../drizzle/supply-chain-schema.js";
import { eq, and, desc, gte, lte, sql, asc } from "drizzle-orm";
import { getProducer } from "../kafka.js";
import { resilientPost } from "../services/resilient-http.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8096";

async function callMLService(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    return await resilientPost<Record<string, unknown>>(
      "ml-inference-service",
      `${ML_SERVICE_URL}${path}`,
      body,
      { maxRetries: 2, timeoutMs: 15_000 },
    );
  } catch (err) {
    return { error: "ML inference service unavailable" };
  }
}

export const soilAnalysisRouter = router({
  // Save a soil test result
  saveSoilTest: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      ph: z.number().min(0).max(14),
      nitrogenPpm: z.number().min(0),
      phosphorusPpm: z.number().min(0),
      potassiumPpm: z.number().min(0),
      organicMatterPct: z.number().min(0).max(100),
      cecMeq100g: z.number().min(0),
      moisturePct: z.number().min(0).max(100).default(30),
      photoHash: z.string().optional(),
      inputMethod: z.enum(["manual", "bluetooth", "nfc"]).default("manual"),
      deviceName: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      elevation: z.number().optional(),
      ndvi: z.number().optional(),
      // ML prediction results (pre-computed by mobile client or computed here)
      healthScore: z.number().min(0).max(100),
      healthCategory: z.string(),
      fertilityClass: z.string(),
      recommendations: z.string(), // JSON string
      cropSuitability: z.string().optional(),
      labInterpretation: z.string().optional(),
      inferenceMs: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const userId = ctx.user?.id ?? 1;

      const [test] = await db.insert(soilTests).values({
        farmId: input.farmId,
        userId,
        ph: String(input.ph),
        nitrogenPpm: String(input.nitrogenPpm),
        phosphorusPpm: String(input.phosphorusPpm),
        potassiumPpm: String(input.potassiumPpm),
        organicMatterPct: String(input.organicMatterPct),
        cecMeq100g: String(input.cecMeq100g),
        moisturePct: String(input.moisturePct),
        photoHash: input.photoHash ?? null,
        healthScore: String(input.healthScore),
        healthCategory: input.healthCategory,
        fertilityClass: input.fertilityClass,
        recommendations: input.recommendations,
        cropSuitability: input.cropSuitability ?? null,
        labInterpretation: input.labInterpretation ?? null,
        inputMethod: input.inputMethod,
        deviceName: input.deviceName ?? null,
        latitude: input.latitude ? String(input.latitude) : null,
        longitude: input.longitude ? String(input.longitude) : null,
        elevation: input.elevation ? String(input.elevation) : null,
        ndvi: input.ndvi ? String(input.ndvi) : null,
        inferenceMs: input.inferenceMs ? String(input.inferenceMs) : null,
      }).returning();

      // Publish to Kafka for analytics pipeline
      try {
        const producer = await getProducer();
        if (producer) {
          await producer.send({
            topic: "soil-tests",
            messages: [{
              key: String(input.farmId),
              value: JSON.stringify({
                testId: test.id,
                farmId: input.farmId,
                healthScore: input.healthScore,
                healthCategory: input.healthCategory,
                ph: input.ph,
                nitrogenPpm: input.nitrogenPpm,
                phosphorusPpm: input.phosphorusPpm,
                potassiumPpm: input.potassiumPpm,
                timestamp: test.createdAt.toISOString(),
              }),
            }],
          });
        }
      } catch (err) {
        // Non-critical: analytics will catch up
      }

      return { testId: test.id, createdAt: test.createdAt };
    }),

  // Analyze soil via ML service (called from mobile before saving)
  analyzeSoil: protectedProcedure
    .input(z.object({
      photo: z.array(z.array(z.array(z.number()))).optional(),
      ph: z.number().min(0).max(14),
      nitrogenPpm: z.number().min(0),
      phosphorusPpm: z.number().min(0),
      potassiumPpm: z.number().min(0),
      organicMatterPct: z.number().min(0).max(100),
      cecMeq100g: z.number().min(0),
      moisturePct: z.number().min(0).max(100).default(30),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      elevationM: z.number().optional(),
      annualRainfallMm: z.number().optional(),
      avgTemperatureC: z.number().optional(),
      ndvi: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await callMLService("/predict/soil", {
        photo: input.photo ?? null,
        ph: input.ph,
        nitrogen_ppm: input.nitrogenPpm,
        phosphorus_ppm: input.phosphorusPpm,
        potassium_ppm: input.potassiumPpm,
        organic_matter_pct: input.organicMatterPct,
        cec_meq_100g: input.cecMeq100g,
        moisture_pct: input.moisturePct,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        elevation_m: input.elevationM ?? null,
        annual_rainfall_mm: input.annualRainfallMm ?? null,
        avg_temperature_c: input.avgTemperatureC ?? null,
        ndvi: input.ndvi ?? null,
      });

      if ("error" in result) {
        return { success: false, error: result.error };
      }

      return { success: true, ...result };
    }),

  // Get soil test history for a farm
  getSoilHistory: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const tests = await db
        .select()
        .from(soilTests)
        .where(eq(soilTests.farmId, input.farmId))
        .orderBy(desc(soilTests.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return {
        tests,
        count: tests.length,
        hasMore: tests.length === input.limit,
      };
    }),

  // Get latest soil test for a farm
  getLatestTest: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [latest] = await db
        .select()
        .from(soilTests)
        .where(eq(soilTests.farmId, input.farmId))
        .orderBy(desc(soilTests.createdAt))
        .limit(1);

      return latest ?? null;
    }),

  // Get detailed recommendations for a farm based on latest test
  getRecommendations: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [latest] = await db
        .select()
        .from(soilTests)
        .where(eq(soilTests.farmId, input.farmId))
        .orderBy(desc(soilTests.createdAt))
        .limit(1);

      if (!latest) {
        return { hasData: false, message: "No soil tests recorded for this farm yet." };
      }

      const recommendations = JSON.parse(latest.recommendations);
      const cropSuitability = latest.cropSuitability ? JSON.parse(latest.cropSuitability) : [];
      const labInterpretation = latest.labInterpretation ? JSON.parse(latest.labInterpretation) : {};

      // Build improvement plan
      const improvementPlan = buildImprovementPlan(
        parseFloat(latest.ph),
        parseFloat(latest.nitrogenPpm),
        parseFloat(latest.phosphorusPpm),
        parseFloat(latest.potassiumPpm),
        parseFloat(latest.organicMatterPct),
        parseFloat(latest.cecMeq100g),
        parseFloat(latest.healthScore),
      );

      return {
        hasData: true,
        healthScore: parseFloat(latest.healthScore),
        healthCategory: latest.healthCategory,
        fertilityClass: latest.fertilityClass,
        testDate: latest.createdAt,
        recommendations,
        cropSuitability,
        labInterpretation,
        improvementPlan,
      };
    }),

  // Calculate soil trend for a farm (improving/stable/degrading)
  calculateTrend: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      monthsBack: z.number().min(1).max(36).default(12),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const since = new Date();
      since.setMonth(since.getMonth() - input.monthsBack);

      const tests = await db
        .select()
        .from(soilTests)
        .where(
          and(
            eq(soilTests.farmId, input.farmId),
            gte(soilTests.createdAt, since),
          ),
        )
        .orderBy(asc(soilTests.createdAt));

      if (tests.length < 2) {
        return { trend: "insufficient_data", testCount: tests.length, message: "Need at least 2 tests to calculate trend." };
      }

      const scores = tests.map(t => parseFloat(t.healthScore));
      const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
      const secondHalf = scores.slice(Math.floor(scores.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const delta = secondAvg - firstAvg;

      let trend: string;
      if (delta > 5) trend = "improving";
      else if (delta < -5) trend = "degrading";
      else trend = "stable";

      // Parameter trends
      const paramTrends = {
        ph: calculateParamTrend(tests.map(t => parseFloat(t.ph))),
        nitrogen: calculateParamTrend(tests.map(t => parseFloat(t.nitrogenPpm))),
        phosphorus: calculateParamTrend(tests.map(t => parseFloat(t.phosphorusPpm))),
        potassium: calculateParamTrend(tests.map(t => parseFloat(t.potassiumPpm))),
        organicMatter: calculateParamTrend(tests.map(t => parseFloat(t.organicMatterPct))),
        cec: calculateParamTrend(tests.map(t => parseFloat(t.cecMeq100g))),
      };

      return {
        trend,
        delta: Math.round(delta * 10) / 10,
        testCount: tests.length,
        firstPeriodAvg: Math.round(firstAvg * 10) / 10,
        secondPeriodAvg: Math.round(secondAvg * 10) / 10,
        parameterTrends: paramTrends,
        latestScore: scores[scores.length - 1],
      };
    }),

  // Generate a report summary for a farm
  generateReport: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      monthsBack: z.number().min(1).max(36).default(12),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const since = new Date();
      since.setMonth(since.getMonth() - input.monthsBack);

      const tests = await db
        .select()
        .from(soilTests)
        .where(
          and(
            eq(soilTests.farmId, input.farmId),
            gte(soilTests.createdAt, since),
          ),
        )
        .orderBy(asc(soilTests.createdAt));

      if (tests.length === 0) {
        return { hasData: false, message: "No soil tests in this period." };
      }

      // Aggregate statistics
      const scores = tests.map(t => parseFloat(t.healthScore));
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);

      const avgPh = tests.reduce((a, t) => a + parseFloat(t.ph), 0) / tests.length;
      const avgN = tests.reduce((a, t) => a + parseFloat(t.nitrogenPpm), 0) / tests.length;
      const avgP = tests.reduce((a, t) => a + parseFloat(t.phosphorusPpm), 0) / tests.length;
      const avgK = tests.reduce((a, t) => a + parseFloat(t.potassiumPpm), 0) / tests.length;
      const avgOM = tests.reduce((a, t) => a + parseFloat(t.organicMatterPct), 0) / tests.length;
      const avgCEC = tests.reduce((a, t) => a + parseFloat(t.cecMeq100g), 0) / tests.length;

      // Latest recommendations
      const latestTest = tests[tests.length - 1];
      const recommendations = JSON.parse(latestTest.recommendations);

      return {
        hasData: true,
        period: {
          start: since.toISOString(),
          end: new Date().toISOString(),
          monthsBack: input.monthsBack,
        },
        summary: {
          totalTests: tests.length,
          averageHealthScore: Math.round(avgScore * 10) / 10,
          minHealthScore: Math.round(minScore * 10) / 10,
          maxHealthScore: Math.round(maxScore * 10) / 10,
          latestHealthScore: parseFloat(latestTest.healthScore),
          latestCategory: latestTest.healthCategory,
        },
        averages: {
          ph: Math.round(avgPh * 100) / 100,
          nitrogenPpm: Math.round(avgN * 10) / 10,
          phosphorusPpm: Math.round(avgP * 10) / 10,
          potassiumPpm: Math.round(avgK * 10) / 10,
          organicMatterPct: Math.round(avgOM * 100) / 100,
          cecMeq100g: Math.round(avgCEC * 10) / 10,
        },
        latestRecommendations: recommendations,
        testTimeline: tests.map(t => ({
          date: t.createdAt.toISOString(),
          healthScore: parseFloat(t.healthScore),
          category: t.healthCategory,
        })),
      };
    }),
});

function calculateParamTrend(values: number[]): string {
  if (values.length < 2) return "insufficient_data";
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const pctChange = ((secondAvg - firstAvg) / firstAvg) * 100;
  if (pctChange > 10) return "increasing";
  if (pctChange < -10) return "decreasing";
  return "stable";
}

function buildImprovementPlan(
  ph: number, n: number, p: number, k: number,
  om: number, cec: number, healthScore: number,
): { priority: string; action: string; detail: string; timeline: string }[] {
  const plan: { priority: string; action: string; detail: string; timeline: string }[] = [];

  if (ph < 5.5) {
    plan.push({
      priority: "high",
      action: "Apply agricultural lime",
      detail: `Current pH ${ph} is too acidic. Apply dolomitic lime at 2-4 tonnes/ha to raise pH to 6.0-6.5. This will improve nutrient availability, especially phosphorus and molybdenum.`,
      timeline: "Apply before planting season. Effects take 2-3 months to stabilize.",
    });
  } else if (ph > 7.5) {
    plan.push({
      priority: "medium",
      action: "Apply elemental sulfur",
      detail: `Current pH ${ph} is alkaline. Apply sulfur at 0.5-1 tonne/ha. Consider ammonium-based fertilizers which have an acidifying effect.`,
      timeline: "Apply 6+ weeks before planting. Monitor pH quarterly.",
    });
  }

  if (n < 40) {
    plan.push({
      priority: "high",
      action: "Increase nitrogen supply",
      detail: `Nitrogen at ${n} ppm is below optimal (40-120 ppm). Apply CAN or urea at 50-100 kg/ha. Consider planting nitrogen-fixing cover crops (clover, vetch, beans) in rotation.`,
      timeline: "Split application: 40% at planting, 60% as top-dress at 4-6 weeks.",
    });
  }

  if (p < 15) {
    plan.push({
      priority: "medium",
      action: "Increase phosphorus",
      detail: `Phosphorus at ${p} ppm is low (optimal: 15-60 ppm). Apply DAP or TSP at 30-60 kg/ha. Band-place near roots for efficiency.`,
      timeline: "Apply at planting time. Phosphorus moves slowly in soil.",
    });
  }

  if (k < 100) {
    plan.push({
      priority: "medium",
      action: "Increase potassium",
      detail: `Potassium at ${k} ppm is below optimal (100-250 ppm). Apply MOP or SOP at 40-80 kg/ha. Banana stems and wood ash are organic K sources.`,
      timeline: "Apply at planting. Sandy soils may need split applications.",
    });
  }

  if (om < 2.0) {
    plan.push({
      priority: "high",
      action: "Build organic matter",
      detail: `Organic matter at ${om}% is critically low (optimal: 2-6%). Apply compost at 5-10 tonnes/ha. Use cover crops and leave crop residues. Avoid burning crop stubble.`,
      timeline: "Ongoing. OM builds slowly — expect 0.1-0.3% increase per year with good practices.",
    });
  }

  if (cec < 10) {
    plan.push({
      priority: "low",
      action: "Improve cation exchange capacity",
      detail: `CEC at ${cec} meq/100g is low — soil has limited nutrient holding capacity. Add organic matter (compost, manure) and clay amendments if available. This is typical of sandy soils.`,
      timeline: "Long-term improvement. Focus on organic matter additions each season.",
    });
  }

  if (healthScore < 40) {
    plan.push({
      priority: "high",
      action: "Comprehensive soil rehabilitation",
      detail: `Overall health score ${healthScore}/100 indicates significant issues. Consider a full season of cover cropping before cash crops. Green manure (sunn hemp, cowpeas) will fix nitrogen and build organic matter simultaneously.`,
      timeline: "Dedicate one full growing season to soil rehabilitation.",
    });
  }

  if (plan.length === 0) {
    plan.push({
      priority: "maintenance",
      action: "Maintain current practices",
      detail: "All parameters are within optimal ranges. Continue current soil management practices. Test again next season to verify stability.",
      timeline: "Re-test in 3-6 months.",
    });
  }

  return plan;
}
