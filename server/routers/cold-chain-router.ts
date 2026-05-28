/**
 * Cold Chain IoT Monitoring Router
 * 
 * Manages cold chain sensors, readings, alerts, and crop compliance.
 * Integrates with Python cold-chain-service for IoT processing.
 * 
 * Middleware: Kafka (sensor events), Redis (latest readings cache),
 * PostgreSQL (history), OpenSearch (analytics queries)
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { coldChainSensors, coldChainReadings } from "../../drizzle/schema.js";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { getProducer } from "../kafka.js";
import { resilientPost, resilientFetch } from "../services/resilient-http.js";

const COLD_CHAIN_SERVICE_URL = process.env.COLD_CHAIN_SERVICE_URL || "http://localhost:8092";

async function callColdChainService(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    return await resilientPost<Record<string, unknown>>(
      "cold-chain-service",
      `${COLD_CHAIN_SERVICE_URL}${path}`,
      body,
      { maxRetries: 3, timeoutMs: 10_000 },
    );
  } catch (err) {
    return { error: "Cold chain service unavailable" };
  }
}

export const coldChainRouter = router({
  // Register a sensor
  registerSensor: protectedProcedure
    .input(z.object({
      sensorId: z.string(),
      sensorType: z.enum(["temperature", "humidity", "gps", "multi"]),
      vehicleId: z.number().optional(),
      facilityId: z.number().optional(),
      alertThresholdHigh: z.number().default(8),
      alertThresholdLow: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [sensor] = await db.insert(coldChainSensors).values({
        sensorId: input.sensorId,
        sensorType: input.sensorType,
        vehicleId: input.vehicleId || null,
        facilityId: input.facilityId || null,
        alertThresholdHigh: String(input.alertThresholdHigh),
        alertThresholdLow: String(input.alertThresholdLow),
      }).returning();

      // Register with Python service
      await callColdChainService("/api/sensors/register", {
        sensor_id: input.sensorId,
        sensor_type: input.sensorType,
        vehicle_id: input.vehicleId,
        facility_id: input.facilityId,
        alert_threshold_high: input.alertThresholdHigh,
        alert_threshold_low: input.alertThresholdLow,
      });

      return sensor;
    }),

  // Submit a reading
  submitReading: protectedProcedure
    .input(z.object({
      sensorId: z.string(),
      temperature: z.number(),
      humidity: z.number().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      batteryLevel: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      // Store in PostgreSQL
      const [reading] = await db.insert(coldChainReadings).values({
        sensorId: input.sensorId,
        temperature: String(input.temperature),
        humidity: input.humidity ? String(input.humidity) : null,
        latitude: input.latitude ? String(input.latitude) : null,
        longitude: input.longitude ? String(input.longitude) : null,
        batteryLevel: input.batteryLevel || null,
      }).returning();

      // Process through Python service for alerts
      const result = await callColdChainService("/api/readings", {
        sensor_id: input.sensorId,
        temperature: input.temperature,
        humidity: input.humidity,
        latitude: input.latitude,
        longitude: input.longitude,
        battery_level: input.batteryLevel,
      });

      // Publish Kafka event for any alerts
      if (result.alert_count && Number(result.alert_count) > 0) {
        const producer = await getProducer();
        if (producer) {
          await producer.send({
            topic: "cold-chain-alerts",
            messages: [{ value: JSON.stringify({
              type: "temperature_alert",
              sensor_id: input.sensorId,
              temperature: input.temperature,
              alerts: result.alerts,
            })}],
          });
        }
      }

      return { reading, alerts: result.alerts || [] };
    }),

  // Batch readings (for IoT gateways sending multiple sensor data)
  submitBatchReadings: protectedProcedure
    .input(z.object({
      readings: z.array(z.object({
        sensorId: z.string(),
        temperature: z.number(),
        humidity: z.number().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        batteryLevel: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      // Bulk insert to PostgreSQL
      if (input.readings.length > 0) {
        await db.insert(coldChainReadings).values(
          input.readings.map(r => ({
            sensorId: r.sensorId,
            temperature: String(r.temperature),
            humidity: r.humidity ? String(r.humidity) : null,
            latitude: r.latitude ? String(r.latitude) : null,
            longitude: r.longitude ? String(r.longitude) : null,
            batteryLevel: r.batteryLevel || null,
          }))
        );
      }

      // Process through Python service
      const result = await callColdChainService("/api/readings/batch", {
        readings: input.readings.map(r => ({
          sensor_id: r.sensorId,
          temperature: r.temperature,
          humidity: r.humidity,
          latitude: r.latitude,
          longitude: r.longitude,
          battery_level: r.batteryLevel,
        })),
      });

      return { processed: input.readings.length, alerts: result.alerts || [] };
    }),

  // Get sensor readings history
  getSensorReadings: protectedProcedure
    .input(z.object({
      sensorId: z.string(),
      limit: z.number().default(100),
      hoursBack: z.number().default(24),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const since = new Date(Date.now() - input.hoursBack * 60 * 60 * 1000);
      return db.select().from(coldChainReadings)
        .where(and(
          eq(coldChainReadings.sensorId, input.sensorId),
          gte(coldChainReadings.createdAt, since),
        ))
        .orderBy(desc(coldChainReadings.createdAt))
        .limit(input.limit);
    }),

  // List all sensors
  listSensors: protectedProcedure
    .query(async () => {
      const db = await requireDb();
      return db.select().from(coldChainSensors).where(eq(coldChainSensors.active, true));
    }),

  // Check crop compliance with cold chain requirements
  checkCropCompliance: publicProcedure
    .input(z.object({
      crop: z.string(),
      temperature: z.number(),
      humidity: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return callColdChainService("/api/crop-compliance", {
        crop: input.crop,
        temperature: input.temperature,
        humidity: input.humidity,
      });
    }),

  // Estimate remaining shelf life
  estimateShelfLife: publicProcedure
    .input(z.object({
      crop: z.string(),
      avgTemperature: z.number(),
      storageHours: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return callColdChainService("/api/shelf-life", {
        crop: input.crop,
        avg_temperature: input.avgTemperature,
        storage_hours: input.storageHours,
      });
    }),

  // Get supported crops with cold chain requirements
  getCropRequirements: publicProcedure
    .query(async () => {
      const db = await requireDb();
      try {
        const resp = await resilientFetch("cold-chain-service", `${COLD_CHAIN_SERVICE_URL}/api/crops`, undefined, { timeoutMs: 5000 });
        return await resp.json();
      } catch (err) {
        return { error: "Cold chain service unavailable" };
      }
    }),
});
