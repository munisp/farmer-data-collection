/**
 * Parametric Insurance Router — DB-backed
 * Climate insurance with satellite/IoT-triggered auto-payouts.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc } from "drizzle-orm";
import { insurancePolicies } from "../../drizzle/platform-extensions-schema.js";


export const parametricInsuranceRouter = router({
  listPolicies: protectedProcedure
    .input(z.object({
      farmerId: z.number().optional(), status: z.string().optional(),
      limit: z.number().default(50), offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [];
      if (input?.farmerId) conds.push(eq(insurancePolicies.farmerId, input.farmerId));
      if (input?.status) conds.push(eq(insurancePolicies.status, input.status));
      const rows = await db.select().from(insurancePolicies)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(insurancePolicies.createdAt)).limit(input?.limit ?? 50).offset(input?.offset ?? 0);
      return rows.map(r => ({ ...r, coverageAmount: Number(r.coverageAmount), premiumAmount: Number(r.premiumAmount) }));
    }),

  getPolicy: protectedProcedure
    .input(z.object({ policyId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(insurancePolicies).where(eq(insurancePolicies.id, input.policyId));
      if (!row) return null;
      const now = new Date();
      const isExpired = row.endDate < now;
      const daysRemaining = isExpired ? 0 : Math.floor((row.endDate.getTime() - now.getTime()) / 86400000);
      return { ...row, coverageAmount: Number(row.coverageAmount), premiumAmount: Number(row.premiumAmount), isExpired, daysRemaining };
    }),

  createPolicy: protectedProcedure
    .input(z.object({
      farmerId: z.number(), farmId: z.number().optional(), policyType: z.string(),
      coverageAmount: z.number().min(10000), triggerConditions: z.record(z.string(), z.any()),
      startDate: z.string(), endDate: z.string(), dataSource: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const premiumRate = Number(process.env.INSURANCE_PREMIUM_RATE_PCT ?? "5");
      const premiumAmount = input.coverageAmount * (premiumRate / 100);
      const code = `PI-${Date.now().toString(36).toUpperCase()}`;
      const [created] = await db.insert(insurancePolicies).values({
        policyCode: code, farmerId: input.farmerId, farmId: input.farmId,
        policyType: input.policyType, coverageAmount: String(input.coverageAmount),
        premiumAmount: String(premiumAmount), triggerConditions: input.triggerConditions,
        startDate: new Date(input.startDate), endDate: new Date(input.endDate),
        dataSource: input.dataSource,
      }).returning();
      logger.info("[Insurance] Policy created", { id: created.id, code, farmerId: input.farmerId, type: input.policyType });
      return { success: true, policy: created, premiumAmount };
    }),

  evaluateTrigger: protectedProcedure
    .input(z.object({ policyId: z.number(), sensorData: z.object({ rainfallMm: z.number().optional(), ndvi: z.number().optional(), temperatureC: z.number().optional() }) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [policy] = await db.select().from(insurancePolicies).where(eq(insurancePolicies.id, input.policyId));
      if (!policy) return { triggered: false, error: "Policy not found" };
      if (policy.status !== "active") return { triggered: false, error: `Policy is ${policy.status}` };

      const conditions = policy.triggerConditions as Record<string, unknown>;
      let triggered = false;
      let reason = "";
      const sd = input.sensorData;

      if (conditions.type === "rainfall_deficit" && sd.rainfallMm !== undefined) {
        triggered = sd.rainfallMm < (Number(conditions.threshold_mm) || 50);
        reason = triggered ? `Rainfall ${sd.rainfallMm}mm < threshold ${conditions.threshold_mm}mm` : "Rainfall within normal range";
      } else if (conditions.type === "excess_rainfall" && sd.rainfallMm !== undefined) {
        triggered = sd.rainfallMm > (Number(conditions.threshold_mm) || 200);
        reason = triggered ? `Excess rainfall ${sd.rainfallMm}mm > threshold ${conditions.threshold_mm}mm` : "Rainfall within normal range";
      } else if (conditions.type === "ndvi_anomaly" && sd.ndvi !== undefined) {
        triggered = sd.ndvi < (Number(conditions.threshold) || -0.3);
        reason = triggered ? `NDVI anomaly ${sd.ndvi} < threshold ${conditions.threshold}` : "NDVI within normal range";
      } else if (conditions.type === "temperature_extreme" && sd.temperatureC !== undefined) {
        triggered = sd.temperatureC > (Number(conditions.max_temp_c) || 45) || sd.temperatureC < (Number(conditions.min_temp_c) || 5);
        reason = triggered ? `Temperature ${sd.temperatureC}°C outside bounds` : "Temperature normal";
      }

      if (triggered) {
        const payoutHistory = (policy.payoutHistory as any[]) ?? [];
        payoutHistory.push({ date: new Date().toISOString(), amount: Number(policy.coverageAmount), reason, sensorData: input.sensorData });
        await db.update(insurancePolicies).set({ payoutHistory, status: "triggered", updatedAt: new Date() }).where(eq(insurancePolicies.id, input.policyId));
        logger.info("[Insurance] Trigger activated", { policyId: input.policyId, reason, payout: Number(policy.coverageAmount) });
      }
      return { triggered, reason, payoutAmount: triggered ? Number(policy.coverageAmount) : 0, dataSource: policy.dataSource };
    }),

  getPolicyTypes: publicProcedure.query(() => [
    { type: "drought", name: "Drought Protection", description: "Auto-payout when satellite confirms rainfall deficit", dataSource: "satellite:CHIRPS", premiumRatePercent: 5, triggerExample: { type: "rainfall_deficit", threshold_mm: 50, monitoring_period_days: 30 } },
    { type: "flood", name: "Flood Protection", description: "Auto-payout on excess rainfall events", dataSource: "satellite:GPM", premiumRatePercent: 5, triggerExample: { type: "excess_rainfall", threshold_mm: 200, monitoring_period_days: 7 } },
    { type: "pest_outbreak", name: "Pest Outbreak Cover", description: "Auto-payout on vegetation index anomaly", dataSource: "satellite:MODIS", premiumRatePercent: 5, triggerExample: { type: "ndvi_anomaly", threshold: -0.3, monitoring_period_days: 14 } },
    { type: "temperature_extreme", name: "Temperature Extreme Cover", description: "Auto-payout on extreme temperature events", dataSource: "IoT:soil_sensor", premiumRatePercent: 4, triggerExample: { type: "temperature_extreme", max_temp_c: 45, min_temp_c: 5 } },
  ]),
});
