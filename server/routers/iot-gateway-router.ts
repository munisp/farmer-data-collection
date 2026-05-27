/**
 * IoT Sensor Gateway Router
 * Integrates with Rust IoT gateway (:8100) for LoRaWAN, MQTT, BLE, Modbus sensors.
 * Features: device registration, sensor readings, alerts, irrigation triggers, frost detection
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, desc, and } from "drizzle-orm";
import { iotDevices, iotReadings } from "../../drizzle/supply-chain-schema.js";

export const iotGatewayRouter = router({
  registerDevice: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      deviceEui: z.string().optional(),
      deviceName: z.string(),
      deviceType: z.enum(["soil_sensor", "weather_station", "water_level", "livestock_collar", "camera_trap", "irrigation_controller", "grain_moisture", "leaf_wetness", "light_sensor"]),
      protocol: z.enum(["lorawan", "mqtt", "ble", "modbus", "wifi", "sigfox", "nbiot"]),
      manufacturer: z.string().optional(),
      model: z.string().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      config: z.object({
        reportingIntervalS: z.number().default(900),
        thresholds: z.record(z.string(), z.object({
          min: z.number(),
          max: z.number(),
          alertBelow: z.number().optional(),
          alertAbove: z.number().optional(),
        })).optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [device] = await db.insert(iotDevices).values({
        farmId: input.farmId,
        deviceEui: input.deviceEui,
        deviceName: input.deviceName,
        deviceType: input.deviceType,
        protocol: input.protocol,
        manufacturer: input.manufacturer,
        model: input.model,
        latitude: input.latitude?.toString(),
        longitude: input.longitude?.toString(),
        status: "active",
        config: JSON.stringify(input.config || {}),
      }).returning();
      return device;
    }),

  ingestReading: protectedProcedure
    .input(z.object({
      deviceId: z.number(),
      readings: z.array(z.object({
        readingType: z.string(),
        value: z.number(),
        unit: z.string(),
        quality: z.enum(["good", "suspect", "calibration_needed", "error"]).default("good"),
        rawValue: z.number().optional(),
        rssi: z.number().optional(),
        snr: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const records = [];
      for (const reading of input.readings) {
        const [record] = await db.insert(iotReadings).values({
          deviceId: input.deviceId,
          readingType: reading.readingType,
          value: reading.value.toString(),
          unit: reading.unit,
          quality: reading.quality,
          rawValue: reading.rawValue?.toString(),
          rssi: reading.rssi,
          snr: reading.snr?.toString(),
        }).returning();
        records.push(record);
      }

      await db.update(iotDevices)
        .set({ lastSeenAt: new Date() })
        .where(eq(iotDevices.id, input.deviceId));

      const device = await db.select().from(iotDevices).where(eq(iotDevices.id, input.deviceId)).limit(1);
      const alerts: Array<Record<string, unknown>> = [];
      if (device.length) {
        const config = JSON.parse(device[0].config || "{}") as Record<string, unknown>;
        const thresholds = (config.thresholds || {}) as Record<string, Record<string, number>>;
        for (const reading of input.readings) {
          const thresh = thresholds[reading.readingType];
          if (thresh) {
            if (thresh.alertAbove && reading.value > thresh.alertAbove) {
              alerts.push({ type: "above_threshold", readingType: reading.readingType, value: reading.value, threshold: thresh.alertAbove });
            }
            if (thresh.alertBelow && reading.value < thresh.alertBelow) {
              alerts.push({ type: "below_threshold", readingType: reading.readingType, value: reading.value, threshold: thresh.alertBelow });
            }
          }
        }
      }

      return { records, alerts };
    }),

  getReadings: protectedProcedure
    .input(z.object({
      deviceId: z.number(),
      readingType: z.string().optional(),
      limit: z.number().default(100),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [eq(iotReadings.deviceId, input.deviceId)];
      if (input.readingType) conditions.push(eq(iotReadings.readingType, input.readingType));
      return db.select()
        .from(iotReadings)
        .where(and(...conditions))
        .orderBy(desc(iotReadings.recordedAt))
        .limit(input.limit);
    }),

  getFarmDevices: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select()
        .from(iotDevices)
        .where(eq(iotDevices.farmId, input.farmId));
    }),

  checkIrrigationNeed: protectedProcedure
    .input(z.object({
      deviceId: z.number(),
      cropType: z.string().default("maize"),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const readings = await db.select()
        .from(iotReadings)
        .where(and(
          eq(iotReadings.deviceId, input.deviceId),
          eq(iotReadings.readingType, "soil_moisture"),
        ))
        .orderBy(desc(iotReadings.recordedAt))
        .limit(1);

      if (!readings.length) return { needsIrrigation: false, message: "No soil moisture data available" };

      const moisture = parseFloat(readings[0].value?.toString() || "0");
      const thresholds: Record<string, number> = {
        maize: 35, rice: 60, wheat: 30, tomato: 40, cassava: 25,
        beans: 35, coffee: 45, tea: 50, potato: 35, sorghum: 25,
      };
      const threshold = thresholds[input.cropType] || 30;

      return {
        needsIrrigation: moisture < threshold,
        currentMoisture: moisture,
        threshold,
        cropType: input.cropType,
        message: moisture < threshold
          ? `Soil moisture ${moisture}% is below ${threshold}% threshold for ${input.cropType}. Irrigate now.`
          : `Soil moisture ${moisture}% is adequate for ${input.cropType}.`,
      };
    }),

  checkFrostRisk: protectedProcedure
    .input(z.object({ deviceId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const tempReading = await db.select()
        .from(iotReadings)
        .where(and(eq(iotReadings.deviceId, input.deviceId), eq(iotReadings.readingType, "temperature")))
        .orderBy(desc(iotReadings.recordedAt)).limit(1);

      const humReading = await db.select()
        .from(iotReadings)
        .where(and(eq(iotReadings.deviceId, input.deviceId), eq(iotReadings.readingType, "humidity")))
        .orderBy(desc(iotReadings.recordedAt)).limit(1);

      const temp = parseFloat(tempReading[0]?.value?.toString() || "20");
      const humidity = parseFloat(humReading[0]?.value?.toString() || "50");

      const frostRisk = temp < 2.0 ? Math.min(1, ((2 - temp) / 5) * (humidity > 80 ? 1.3 : 1.0)) : 0;
      return {
        frostRisk: Math.round(frostRisk * 100),
        temperature: temp,
        humidity,
        warning: frostRisk > 0.5 ? "HIGH FROST RISK — protect sensitive crops" : "Low frost risk",
      };
    }),

  updateDeviceStatus: protectedProcedure
    .input(z.object({
      deviceId: z.number(),
      status: z.enum(["active", "offline", "maintenance", "decommissioned"]),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(iotDevices)
        .set({ status: input.status })
        .where(eq(iotDevices.id, input.deviceId));
      return { success: true };
    }),

  getNetworkOverview: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const devices = await db.select()
        .from(iotDevices)
        .where(eq(iotDevices.farmId, input.farmId));

      const active = devices.filter(d => d.status === "active").length;
      const offline = devices.filter(d => d.status === "offline").length;
      const lowBattery = devices.filter(d => parseFloat(d.batteryPct?.toString() || "100") < 20).length;

      return {
        totalDevices: devices.length,
        active, offline, lowBattery,
        maintenance: devices.filter(d => d.status === "maintenance").length,
        byType: devices.reduce((acc: Record<string, number>, d) => {
          acc[d.deviceType] = (acc[d.deviceType] || 0) + 1;
          return acc;
        }, {}),
        byProtocol: devices.reduce((acc: Record<string, number>, d) => {
          acc[d.protocol] = (acc[d.protocol] || 0) + 1;
          return acc;
        }, {}),
        devices,
      };
    }),
});
