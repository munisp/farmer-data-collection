/**
 * Digital Twin Router
 * Farm digital twin with zone management, sensor data, simulation, and alerts.
 * Middleware: PostgreSQL, Redis (cache), Kafka (events)
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { eq, desc } from "drizzle-orm";
import { digitalTwins, iotDevices, iotReadings } from "../../drizzle/schema-platform-extended.js";
import { applyMiddleware, financialMiddleware, marketplaceMiddleware, dataMiddleware } from "../middleware/deep-integration.js";
import { logger } from "../logger.js";

type DigitalTwin = typeof digitalTwins.$inferSelect;
type IotDevice = typeof iotDevices.$inferSelect;
type IotReading = typeof iotReadings.$inferSelect;

function runSimulation(state: Record<string, unknown>, scenario: string, params: Record<string, unknown>): Record<string, unknown> {
  const zones = (state as { zones?: Array<{ cropType: string; acres: number; healthScore: number }> }).zones ?? [];
  const baseYield = zones.reduce((s: number, z: { cropType: string; acres: number; healthScore: number }) => {
    const yieldPerAcre: Record<string, number> = { maize: 1000, rice: 800, beans: 500, cassava: 3000, tomatoes: 2500 };
    return s + (yieldPerAcre[z.cropType] || 500) * z.acres * (z.healthScore / 100);
  }, 0);

  let yieldChange = 0;
  let costImpact = 0;
  let riskLevel = "low";
  const recommendations: string[] = [];

  switch (scenario) {
    case "add_fertilizer":
      yieldChange = Math.round(baseYield * 0.15);
      costImpact = ((params.amount as number) || 50) * 220;
      recommendations.push("Apply in split doses: 50% at planting, 50% at top-dress");
      break;
    case "increase_irrigation":
      yieldChange = Math.round(baseYield * 0.12);
      costImpact = 15000;
      recommendations.push("Increase irrigation frequency during flowering");
      break;
    case "drought_stress":
      yieldChange = -Math.round(baseYield * ((params.severity as number) || 0.3));
      riskLevel = ((params.severity as number) || 0) > 0.5 ? "high" : "medium";
      recommendations.push("Activate drip irrigation immediately", "Apply mulch to conserve soil moisture");
      break;
    case "pest_outbreak":
      yieldChange = -Math.round(baseYield * ((params.severity as number) || 0.2));
      costImpact = 8000;
      riskLevel = ((params.severity as number) || 0) > 0.4 ? "high" : "medium";
      recommendations.push("Scout all zones within 48 hours", "Apply targeted pesticide");
      break;
    default:
      recommendations.push("No simulation model available for this scenario");
  }

  return {
    id: `SIM-${Date.now()}`, scenario, parameters: params,
    predictedYield: baseYield + yieldChange, yieldChange, costImpact, riskLevel, recommendations,
  };
}

export const digitalTwinRouter = router({
  getFarmTwin: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [twin] = await db.select().from(digitalTwins).where(eq(digitalTwins.farmId, input.farmId));
      if (!twin) return null;
      const devices = await db.select().from(iotDevices).where(eq(iotDevices.farmId, input.farmId));
      return { ...twin, devices, deviceCount: devices.length };
    }),

  getZoneDetail: protectedProcedure
    .input(z.object({ farmId: z.number(), zoneId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [twin] = await db.select().from(digitalTwins).where(eq(digitalTwins.farmId, input.farmId));
      if (!twin) return null;
      const state = twin.state as { zones?: Array<Record<string, unknown>> };
      const zone = (state.zones ?? []).find((z: Record<string, unknown>) => z.id === input.zoneId);
      return zone ?? null;
    }),

  runSimulation: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      scenario: z.enum(["add_fertilizer", "increase_irrigation", "drought_stress", "pest_outbreak", "expand_acreage"]),
      parameters: z.record(z.string(), z.number()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, error: "Database not available" };
      const [twin] = await db.select().from(digitalTwins).where(eq(digitalTwins.farmId, input.farmId));
      if (!twin) return { success: false, error: "Farm twin not found" };
      const result = runSimulation(twin.state as Record<string, unknown>, input.scenario, input.parameters || {});
      logger.info(`Digital twin simulation: ${input.farmId} / ${input.scenario}`);
      return { success: true, result };
    }),

  getSensorData: protectedProcedure
    .input(z.object({ farmId: z.number(), sensorType: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      if (!input?.farmId) return [];
      const devices = await db.select().from(iotDevices).where(eq(iotDevices.farmId, input.farmId));
      if (devices.length === 0) return [];
      const deviceIds = devices.map((d: IotDevice) => d.id);
      const allReadings = await db.select().from(iotReadings).orderBy(desc(iotReadings.timestamp)).limit(100);
      const filtered = allReadings.filter((r: IotReading) => deviceIds.includes(r.deviceId));
      return input.sensorType ? filtered.filter((r: IotReading) => r.metric === input.sensorType) : filtered;
    }),

  getAlerts: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const [twin] = await db.select().from(digitalTwins).where(eq(digitalTwins.farmId, input.farmId));
      if (!twin) return [];
      const alerts: { type: string; severity: string; message: string; timestamp: string }[] = [];
      const state = twin.state as { zones?: Array<{ healthScore?: number; pestRisk?: string; soilPH?: number; name?: string }> };
      (state.zones ?? []).forEach((z: { healthScore?: number; pestRisk?: string; soilPH?: number; name?: string }) => {
        if ((z.healthScore ?? 100) < 70) alerts.push({ type: "health", severity: "warning", message: `Zone ${z.name} health below threshold (${z.healthScore}/100)`, timestamp: twin.lastSync?.toISOString() ?? "" });
        if (z.pestRisk === "high") alerts.push({ type: "pest", severity: "critical", message: `High pest risk in ${z.name}`, timestamp: twin.lastSync?.toISOString() ?? "" });
      });
      return alerts;
    }),

  compareScenarios: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      scenarios: z.array(z.object({ scenario: z.string(), parameters: z.record(z.string(), z.number()).optional() })).min(2).max(5),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [twin] = await db.select().from(digitalTwins).where(eq(digitalTwins.farmId, input.farmId));
      if (!twin) return null;
      const results = input.scenarios.map((s) => runSimulation(twin.state as Record<string, unknown>, s.scenario, s.parameters || {}));
      const best = results.reduce((best, r) => ((r.yieldChange as number) > (best.yieldChange as number)) ? r : best, results[0]);
      return { comparisons: results, bestScenario: best.scenario, bestYieldChange: best.yieldChange };
    }),
});
