/**
 * IoT Business Rules Engine Router
 * 
 * Configurable rules for sensor anomaly detection, automated alerts,
 * irrigation triggers, environmental compliance, and device health monitoring.
 * Transforms raw IoT data into actionable farm decisions.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { iotDevices, iotReadings } from "../../drizzle/supply-chain-schema.js";
import { alertThresholds, alertHistory } from "../../drizzle/schema.js";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";

// Anomaly detection thresholds by sensor type
const SENSOR_RANGES: Record<string, { min: number; max: number; unit: string; spikeThreshold: number }> = {
  temperature: { min: -10, max: 55, unit: "°C", spikeThreshold: 5 },
  humidity: { min: 0, max: 100, unit: "%", spikeThreshold: 15 },
  soil_moisture: { min: 0, max: 100, unit: "%", spikeThreshold: 20 },
  soil_ph: { min: 3.0, max: 9.0, unit: "pH", spikeThreshold: 1.0 },
  soil_nitrogen: { min: 0, max: 500, unit: "mg/kg", spikeThreshold: 50 },
  soil_phosphorus: { min: 0, max: 200, unit: "mg/kg", spikeThreshold: 30 },
  soil_potassium: { min: 0, max: 400, unit: "mg/kg", spikeThreshold: 40 },
  rainfall: { min: 0, max: 200, unit: "mm/h", spikeThreshold: 30 },
  wind_speed: { min: 0, max: 150, unit: "km/h", spikeThreshold: 20 },
  light_intensity: { min: 0, max: 120000, unit: "lux", spikeThreshold: 30000 },
  water_level: { min: 0, max: 500, unit: "cm", spikeThreshold: 30 },
  co2: { min: 300, max: 2000, unit: "ppm", spikeThreshold: 200 },
  battery_voltage: { min: 2.0, max: 4.2, unit: "V", spikeThreshold: 0.5 },
};

// Crop-specific optimal conditions
const CROP_OPTIMAL_CONDITIONS: Record<string, {
  soilMoistureMin: number; soilMoistureMax: number;
  tempMin: number; tempMax: number;
  humidityMin: number; humidityMax: number;
  phMin: number; phMax: number;
}> = {
  maize: { soilMoistureMin: 35, soilMoistureMax: 70, tempMin: 18, tempMax: 32, humidityMin: 40, humidityMax: 80, phMin: 5.5, phMax: 7.5 },
  rice: { soilMoistureMin: 60, soilMoistureMax: 95, tempMin: 20, tempMax: 35, humidityMin: 60, humidityMax: 95, phMin: 5.0, phMax: 7.0 },
  wheat: { soilMoistureMin: 30, soilMoistureMax: 65, tempMin: 10, tempMax: 25, humidityMin: 30, humidityMax: 70, phMin: 6.0, phMax: 7.5 },
  tomato: { soilMoistureMin: 40, soilMoistureMax: 70, tempMin: 18, tempMax: 30, humidityMin: 40, humidityMax: 75, phMin: 6.0, phMax: 7.0 },
  beans: { soilMoistureMin: 35, soilMoistureMax: 65, tempMin: 15, tempMax: 28, humidityMin: 40, humidityMax: 75, phMin: 6.0, phMax: 7.0 },
  coffee: { soilMoistureMin: 45, soilMoistureMax: 75, tempMin: 15, tempMax: 28, humidityMin: 60, humidityMax: 85, phMin: 6.0, phMax: 6.5 },
  cassava: { soilMoistureMin: 25, soilMoistureMax: 60, tempMin: 20, tempMax: 35, humidityMin: 50, humidityMax: 85, phMin: 5.5, phMax: 7.0 },
};

interface AnomalyResult {
  type: "out_of_range" | "spike" | "stale_data" | "sensor_drift" | "flatline";
  severity: "info" | "warning" | "critical";
  readingType: string;
  currentValue: number;
  expectedRange?: { min: number; max: number };
  message: string;
  recommendation: string;
}

interface RuleEvaluationResult {
  ruleId: string;
  triggered: boolean;
  severity: "info" | "warning" | "critical";
  message: string;
  action: string;
  data: Record<string, unknown>;
}

export const iotRulesEngineRouter = router({
  /**
   * Create a custom alert rule for a device.
   */
  createRule: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      deviceId: z.number().optional(),
      name: z.string().min(3),
      readingType: z.string(),
      condition: z.enum(["above", "below", "between", "outside", "spike", "flatline"]),
      thresholdValue: z.number(),
      thresholdValue2: z.number().optional(),
      severity: z.enum(["info", "warning", "critical"]).default("warning"),
      action: z.enum(["alert_sms", "alert_push", "alert_email", "trigger_irrigation", "log_only"]).default("alert_push"),
      cooldownMinutes: z.number().min(5).max(1440).default(30),
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      const [rule] = await db.insert(alertThresholds).values({
        userId: ctx.user.id,
        metricName: `${input.farmId}:${input.deviceId || 'all'}:${input.readingType}`,
        thresholdType: input.condition,
        thresholdValue: input.thresholdValue,
        isActive: input.enabled,
        notificationChannel: input.action,
      }).returning();

      logger.info(`[IoTRules] Rule created: ${input.name} for farm ${input.farmId}`);
      return rule;
    }),

  /**
   * Get all rules for a farm.
   */
  getRules: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const farmPrefix = `${input.farmId}:`;
      return db.select().from(alertThresholds)
        .where(and(
          eq(alertThresholds.userId, ctx.user.id),
          sql`${alertThresholds.metricName} LIKE ${farmPrefix + '%'}`,
        ))
        .orderBy(desc(alertThresholds.createdAt));
    }),

  /**
   * Toggle a rule on/off.
   */
  toggleRule: protectedProcedure
    .input(z.object({ ruleId: z.number(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.update(alertThresholds)
        .set({ isActive: input.enabled })
        .where(and(eq(alertThresholds.id, input.ruleId), eq(alertThresholds.userId, ctx.user.id)));
      return { success: true };
    }),

  /**
   * Delete a rule.
   */
  deleteRule: protectedProcedure
    .input(z.object({ ruleId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.delete(alertThresholds)
        .where(and(eq(alertThresholds.id, input.ruleId), eq(alertThresholds.userId, ctx.user.id)));
      return { deleted: true };
    }),

  /**
   * Detect anomalies in recent sensor readings for a device.
   * Checks: out-of-range, spike detection, stale data, flatline, sensor drift.
   */
  detectAnomalies: protectedProcedure
    .input(z.object({
      deviceId: z.number(),
      lookbackMinutes: z.number().min(5).max(1440).default(60),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const cutoff = new Date(Date.now() - input.lookbackMinutes * 60_000);

      const readings = await db.select().from(iotReadings)
        .where(and(
          eq(iotReadings.deviceId, input.deviceId),
          gte(iotReadings.recordedAt, cutoff),
        ))
        .orderBy(desc(iotReadings.recordedAt))
        .limit(500);

      if (readings.length === 0) {
        return {
          deviceId: input.deviceId,
          anomalies: [{
            type: "stale_data" as const,
            severity: "warning" as const,
            readingType: "all",
            currentValue: 0,
            message: `No readings in the last ${input.lookbackMinutes} minutes`,
            recommendation: "Check device connectivity and battery level",
          }],
          healthScore: 0,
        };
      }

      const anomalies: AnomalyResult[] = [];

      // Group by reading type
      const byType: Record<string, Array<{ value: number; timestamp: Date }>> = {};
      for (const r of readings) {
        const val = parseFloat(r.value?.toString() || "0");
        if (!byType[r.readingType]) byType[r.readingType] = [];
        byType[r.readingType].push({ value: val, timestamp: r.recordedAt || new Date() });
      }

      for (const [readingType, values] of Object.entries(byType)) {
        const range = SENSOR_RANGES[readingType];
        if (!range) continue;

        // 1. Out-of-range detection
        const latest = values[0];
        if (latest.value < range.min || latest.value > range.max) {
          anomalies.push({
            type: "out_of_range",
            severity: "critical",
            readingType,
            currentValue: latest.value,
            expectedRange: { min: range.min, max: range.max },
            message: `${readingType} reading ${latest.value}${range.unit} outside valid range [${range.min}, ${range.max}]`,
            recommendation: `Check ${readingType} sensor calibration or replace sensor`,
          });
        }

        // 2. Spike detection (rapid change between consecutive readings)
        if (values.length >= 2) {
          const delta = Math.abs(values[0].value - values[1].value);
          if (delta > range.spikeThreshold) {
            anomalies.push({
              type: "spike",
              severity: "warning",
              readingType,
              currentValue: latest.value,
              message: `${readingType} changed by ${delta.toFixed(1)}${range.unit} (threshold: ${range.spikeThreshold})`,
              recommendation: "Verify reading with manual measurement; may indicate sensor malfunction",
            });
          }
        }

        // 3. Flatline detection (no variation over many readings)
        if (values.length >= 10) {
          const allSame = values.slice(0, 10).every(v => v.value === values[0].value);
          if (allSame) {
            anomalies.push({
              type: "flatline",
              severity: "warning",
              readingType,
              currentValue: latest.value,
              message: `${readingType} flatlined at ${latest.value}${range.unit} for ${values.length} consecutive readings`,
              recommendation: "Sensor may be stuck; clean or recalibrate",
            });
          }
        }

        // 4. Sensor drift (gradual systematic shift)
        if (values.length >= 20) {
          const first10Avg = values.slice(10, 20).reduce((s, v) => s + v.value, 0) / 10;
          const last10Avg = values.slice(0, 10).reduce((s, v) => s + v.value, 0) / 10;
          const drift = Math.abs(last10Avg - first10Avg);
          if (drift > range.spikeThreshold * 0.5) {
            anomalies.push({
              type: "sensor_drift",
              severity: "info",
              readingType,
              currentValue: latest.value,
              message: `${readingType} shows drift of ${drift.toFixed(1)}${range.unit} over recent readings`,
              recommendation: "Schedule sensor calibration",
            });
          }
        }
      }

      // Health score: 100 - penalty per anomaly
      const healthScore = Math.max(0, 100 - anomalies.reduce((sum, a) =>
        sum + (a.severity === "critical" ? 30 : a.severity === "warning" ? 15 : 5), 0));

      return { deviceId: input.deviceId, anomalies, healthScore, readingCount: readings.length };
    }),

  /**
   * Evaluate all rules against latest readings for a farm.
   * Returns which rules triggered and what actions to take.
   */
  evaluateRules: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      // Get all enabled rules for farm
      const farmPrefix = `${input.farmId}:`;
      const rules = await db.select().from(alertThresholds)
        .where(and(
          sql`${alertThresholds.metricName} LIKE ${farmPrefix + '%'}`,
          eq(alertThresholds.isActive, true),
        ));

      // Get all devices for farm
      const devices = await db.select().from(iotDevices)
        .where(and(eq(iotDevices.farmId, input.farmId), eq(iotDevices.status, "active")));

      const results: RuleEvaluationResult[] = [];

      for (const rule of rules) {
        // Get latest reading matching rule's metric type
        // Parse rule metricName format: "farmId:deviceId:readingType"
        const parts = (rule.metricName || "").split(":");
        const ruleDeviceId = parts[1] !== "all" ? parseInt(parts[1]) : null;
        const ruleReadingType = parts[2] || "";

        for (const device of devices) {
          if (ruleDeviceId && ruleDeviceId !== device.id) continue;

          const [latest] = await db.select().from(iotReadings)
            .where(and(
              eq(iotReadings.deviceId, device.id),
              eq(iotReadings.readingType, ruleReadingType),
            ))
            .orderBy(desc(iotReadings.recordedAt))
            .limit(1);

          if (!latest) continue;

          const value = parseFloat(latest.value?.toString() || "0");
          let triggered = false;

          switch (rule.thresholdType) {
            case "above":
              triggered = value > (rule.thresholdValue || 0);
              break;
            case "below":
              triggered = value < (rule.thresholdValue || 0);
              break;
            default:
              triggered = false;
          }

          if (triggered) {
            const result: RuleEvaluationResult = {
              ruleId: `rule_${rule.id}`,
              triggered: true,
              severity: "warning",
              message: `Rule "${rule.metricName}" triggered: ${ruleReadingType} = ${value} (${rule.thresholdType} ${rule.thresholdValue})`,
              action: rule.notificationChannel || "log_only",
              data: { deviceId: device.id, deviceName: device.deviceName, value, threshold: rule.thresholdValue },
            };
            results.push(result);

            // Record alert in history
            await db.insert(alertHistory).values({
              thresholdId: rule.id,
              userId: ctx.user.id,
              metricName: ruleReadingType,
              actualValue: Math.round(value),
              thresholdValue: rule.thresholdValue,
              message: result.message,
            });

            // Publish to Kafka for async processing
            const producer = await getProducer();
            if (producer) {
              await producer.send({
                topic: "iot-alert-events",
                messages: [{ value: JSON.stringify({
                  type: "rule_triggered",
                  ruleId: rule.id,
                  farmId: input.farmId,
                  deviceId: device.id,
                  severity: result.severity,
                  value,
                  action: result.action,
                })}],
              });
            }
          }
        }
      }

      logger.info(`[IoTRules] Evaluated ${rules.length} rules for farm ${input.farmId}: ${results.length} triggered`);

      return {
        farmId: input.farmId,
        rulesEvaluated: rules.length,
        devicesChecked: devices.length,
        triggered: results,
        summary: {
          critical: results.filter(r => r.severity === "critical").length,
          warning: results.filter(r => r.severity === "warning").length,
          info: results.filter(r => r.severity === "info").length,
        },
      };
    }),

  /**
   * Get crop-specific environmental assessment.
   * Compares current IoT readings against optimal conditions for the specified crop.
   */
  cropEnvironmentAssessment: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      cropType: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const optimal = CROP_OPTIMAL_CONDITIONS[input.cropType.toLowerCase()];
      if (!optimal) {
        return { error: `No conditions model for ${input.cropType}`, supportedCrops: Object.keys(CROP_OPTIMAL_CONDITIONS) };
      }

      const devices = await db.select().from(iotDevices)
        .where(and(eq(iotDevices.farmId, input.farmId), eq(iotDevices.status, "active")));

      const latestReadings: Record<string, number> = {};
      for (const device of devices) {
        for (const readingType of ["temperature", "humidity", "soil_moisture", "soil_ph"]) {
          if (latestReadings[readingType] !== undefined) continue;
          const [reading] = await db.select().from(iotReadings)
            .where(and(eq(iotReadings.deviceId, device.id), eq(iotReadings.readingType, readingType)))
            .orderBy(desc(iotReadings.recordedAt)).limit(1);
          if (reading) latestReadings[readingType] = parseFloat(reading.value?.toString() || "0");
        }
      }

      const assessments: Array<{
        parameter: string;
        current: number | null;
        optimalMin: number;
        optimalMax: number;
        status: "optimal" | "suboptimal" | "critical" | "no_data";
        recommendation: string;
      }> = [];

      // Soil moisture
      const moisture = latestReadings["soil_moisture"];
      assessments.push({
        parameter: "Soil Moisture",
        current: moisture ?? null,
        optimalMin: optimal.soilMoistureMin,
        optimalMax: optimal.soilMoistureMax,
        status: moisture === undefined ? "no_data"
          : moisture >= optimal.soilMoistureMin && moisture <= optimal.soilMoistureMax ? "optimal"
          : moisture < optimal.soilMoistureMin * 0.7 || moisture > optimal.soilMoistureMax * 1.3 ? "critical"
          : "suboptimal",
        recommendation: moisture === undefined ? "Install soil moisture sensor"
          : moisture < optimal.soilMoistureMin ? `Irrigate: moisture ${moisture}% below ${optimal.soilMoistureMin}% minimum for ${input.cropType}`
          : moisture > optimal.soilMoistureMax ? `Reduce watering: moisture ${moisture}% above ${optimal.soilMoistureMax}% maximum`
          : `Soil moisture ${moisture}% is optimal for ${input.cropType}`,
      });

      // Temperature
      const temp = latestReadings["temperature"];
      assessments.push({
        parameter: "Temperature",
        current: temp ?? null,
        optimalMin: optimal.tempMin,
        optimalMax: optimal.tempMax,
        status: temp === undefined ? "no_data"
          : temp >= optimal.tempMin && temp <= optimal.tempMax ? "optimal"
          : temp < optimal.tempMin - 5 || temp > optimal.tempMax + 5 ? "critical"
          : "suboptimal",
        recommendation: temp === undefined ? "Install temperature sensor"
          : temp < optimal.tempMin ? `Temperature ${temp}°C below optimal ${optimal.tempMin}°C — consider mulching or greenhouse cover`
          : temp > optimal.tempMax ? `Temperature ${temp}°C above optimal ${optimal.tempMax}°C — increase irrigation and apply shade nets`
          : `Temperature ${temp}°C is optimal for ${input.cropType}`,
      });

      // Humidity
      const hum = latestReadings["humidity"];
      assessments.push({
        parameter: "Humidity",
        current: hum ?? null,
        optimalMin: optimal.humidityMin,
        optimalMax: optimal.humidityMax,
        status: hum === undefined ? "no_data"
          : hum >= optimal.humidityMin && hum <= optimal.humidityMax ? "optimal"
          : "suboptimal",
        recommendation: hum === undefined ? "Install humidity sensor"
          : hum < optimal.humidityMin ? "Increase irrigation or misting"
          : hum > optimal.humidityMax ? "Improve ventilation to reduce disease risk"
          : `Humidity ${hum}% is optimal for ${input.cropType}`,
      });

      // Soil pH
      const ph = latestReadings["soil_ph"];
      assessments.push({
        parameter: "Soil pH",
        current: ph ?? null,
        optimalMin: optimal.phMin,
        optimalMax: optimal.phMax,
        status: ph === undefined ? "no_data"
          : ph >= optimal.phMin && ph <= optimal.phMax ? "optimal"
          : "suboptimal",
        recommendation: ph === undefined ? "Conduct soil test for pH"
          : ph < optimal.phMin ? `pH ${ph} too acidic — apply agricultural lime`
          : ph > optimal.phMax ? `pH ${ph} too alkaline — apply sulfur or organic matter`
          : `pH ${ph} is optimal for ${input.cropType}`,
      });

      const optimalCount = assessments.filter(a => a.status === "optimal").length;
      const dataCount = assessments.filter(a => a.status !== "no_data").length;
      const overallScore = dataCount === 0 ? 0 : Math.round((optimalCount / dataCount) * 100);

      return {
        farmId: input.farmId,
        cropType: input.cropType,
        overallScore,
        overallStatus: overallScore >= 80 ? "excellent" : overallScore >= 60 ? "good" : overallScore >= 40 ? "needs_attention" : "critical",
        assessments,
        urgentActions: assessments.filter(a => a.status === "critical").map(a => a.recommendation),
      };
    }),

  /**
   * Get alert history for a farm.
   */
  getAlertHistory: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      limit: z.number().min(1).max(200).default(50),
      severity: z.enum(["info", "warning", "critical"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const conditions = [eq(alertHistory.userId, ctx.user.id)];

      return db.select().from(alertHistory)
        .where(and(...conditions))
        .orderBy(desc(alertHistory.createdAt))
        .limit(input.limit);
    }),

  /**
   * Device health dashboard — battery, signal, last-seen, anomaly count.
   */
  deviceHealthDashboard: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const devices = await db.select().from(iotDevices)
        .where(eq(iotDevices.farmId, input.farmId));

      const now = Date.now();
      const healthReports = devices.map(device => {
        const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
        const minutesSinceLastSeen = Math.round((now - lastSeen) / 60_000);
        const battery = parseFloat(device.batteryPct?.toString() || "100");

        let connectivity: "online" | "degraded" | "offline" = "offline";
        if (minutesSinceLastSeen < 30) connectivity = "online";
        else if (minutesSinceLastSeen < 120) connectivity = "degraded";

        let batteryStatus: "good" | "low" | "critical" = "good";
        if (battery < 10) batteryStatus = "critical";
        else if (battery < 25) batteryStatus = "low";

        return {
          deviceId: device.id,
          deviceName: device.deviceName,
          deviceType: device.deviceType,
          protocol: device.protocol,
          status: device.status,
          connectivity,
          batteryPercent: battery,
          batteryStatus,
          minutesSinceLastSeen,
          needsAttention: connectivity !== "online" || batteryStatus !== "good",
        };
      });

      return {
        farmId: input.farmId,
        totalDevices: devices.length,
        online: healthReports.filter(d => d.connectivity === "online").length,
        degraded: healthReports.filter(d => d.connectivity === "degraded").length,
        offline: healthReports.filter(d => d.connectivity === "offline").length,
        lowBattery: healthReports.filter(d => d.batteryStatus !== "good").length,
        devices: healthReports,
        needsAttention: healthReports.filter(d => d.needsAttention),
      };
    }),
});
