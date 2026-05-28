/**
 * Equipment Fleet Management & Autonomous Operations Router
 * Integrates with Go equipment-fleet-service (:8098), Rust ISOBUS gateway (:8101),
 * and Rust autonomous-ops orchestrator (:8102).
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, desc } from "drizzle-orm";
import {
  equipmentTelemetry, equipmentMaintenancePredictions,
  equipmentListings, equipmentRentals, farmDigitalTwins,
} from "../../drizzle/supply-chain-schema.js";

import { resilientFetch, resilientPost } from "../services/resilient-http.js";

const FLEET_SERVICE_URL = process.env.FLEET_SERVICE_URL || "http://localhost:8098";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const equipmentFleetRouter = router({
  ingestTelemetry: protectedProcedure
    .input(z.object({
      equipmentId: z.number(),
      equipmentType: z.enum(["tractor", "drone", "sprayer", "harvester", "irrigation", "planter"]),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      speedKmh: z.number().optional(),
      headingDeg: z.number().optional(),
      engineRpm: z.number().optional(),
      fuelRateLph: z.number().optional(),
      fuelLevelPct: z.number().optional(),
      ptoSpeedRpm: z.number().optional(),
      engineHours: z.number().optional(),
      implementStatus: z.string().optional(),
      operatorId: z.number().optional(),
      fieldId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [record] = await db.insert(equipmentTelemetry).values({
        equipmentId: input.equipmentId,
        equipmentType: input.equipmentType,
        latitude: input.latitude?.toString(),
        longitude: input.longitude?.toString(),
        speedKmh: input.speedKmh?.toString(),
        headingDeg: input.headingDeg?.toString(),
        engineRpm: input.engineRpm,
        fuelRateLph: input.fuelRateLph?.toString(),
        fuelLevelPct: input.fuelLevelPct?.toString(),
        ptoSpeedRpm: input.ptoSpeedRpm,
        engineHours: input.engineHours?.toString(),
        implementStatus: input.implementStatus,
        operatorId: input.operatorId,
        fieldId: input.fieldId,
      }).returning();

      try {
        await resilientPost("fleet-service", `${FLEET_SERVICE_URL}/api/v1/telemetry`, {
            equipment_id: `EQ-${input.equipmentId}`,
            lat: input.latitude,
            lon: input.longitude,
            speed_kmh: input.speedKmh,
            heading_deg: input.headingDeg,
            engine_rpm: input.engineRpm,
            fuel_rate_lph: input.fuelRateLph,
            fuel_level_pct: input.fuelLevelPct,
            pto_rpm: input.ptoSpeedRpm,
            engine_hours: input.engineHours,
          }, { maxRetries: 2 });
      } catch (err) { /* fleet service may not be running */ }

      return record;
    }),

  getTelemetryHistory: protectedProcedure
    .input(z.object({
      equipmentId: z.number(),
      limit: z.number().default(100),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select()
        .from(equipmentTelemetry)
        .where(eq(equipmentTelemetry.equipmentId, input.equipmentId))
        .orderBy(desc(equipmentTelemetry.recordedAt))
        .limit(input.limit);
    }),

  calculateGuidanceLines: protectedProcedure
    .input(z.object({
      pointA: z.object({ lat: z.number(), lon: z.number() }),
      pointB: z.object({ lat: z.number(), lon: z.number() }),
      swathM: z.number().min(1).max(50),
      headlandM: z.number().default(0),
      numLines: z.number().default(20),
      farmId: z.number(),
    }))
    .mutation(async ({ input }) => {
      try {
        const res = await resilientFetch("fleet-service", `${FLEET_SERVICE_URL}/api/v1/guidance/ab-lines`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ab_line: {
              farm_id: input.farmId,
              name: "AB Line",
              point_a: input.pointA,
              point_b: input.pointB,
              swath_m: input.swathM,
              headland_m: input.headlandM,
            },
            num_lines: input.numLines,
          }),
        }, { maxRetries: 2 });
        return res.json() as Promise<Record<string, unknown>>;
      } catch (err) {
        // Local fallback
        const lines = [];
        const swathDeg = input.swathM / 111320;
        for (let i = 0; i < input.numLines; i++) {
          lines.push({
            line_number: i,
            offset_m: i * input.swathM,
            start: { lat: input.pointA.lat + i * swathDeg, lon: input.pointA.lon },
            end: { lat: input.pointB.lat + i * swathDeg, lon: input.pointB.lon },
          });
        }
        return { lines, source: "local_fallback" };
      }
    }),

  getAutosteerCommand: protectedProcedure
    .input(z.object({
      equipmentId: z.string(),
      guideLine: z.object({
        start: z.object({ lat: z.number(), lon: z.number() }),
        end: z.object({ lat: z.number(), lon: z.number() }),
        lineNumber: z.number(),
        offsetM: z.number(),
      }),
    }))
    .query(async ({ input }) => {
      try {
        const res = await resilientFetch("fleet-service", `${FLEET_SERVICE_URL}/api/v1/guidance/autosteer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipment_id: input.equipmentId,
            guide_line: input.guideLine,
          }),
        }, { maxRetries: 2 });
        if (!res.ok) return { error: "Equipment not found or not connected" };
        return res.json() as Promise<Record<string, unknown>>;
      } catch (err) {
        return { error: "Fleet service unavailable" };
      }
    }),

  predictMaintenance: protectedProcedure
    .input(z.object({ equipmentId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      try {
        const res = await resilientFetch("fleet-service", `${FLEET_SERVICE_URL}/api/v1/maintenance/predict?equipment_id=EQ-${input.equipmentId}`);
        if (res.ok) {
          const predictions = await res.json() as Array<Record<string, unknown>>;
          for (const pred of predictions) {
            await db.insert(equipmentMaintenancePredictions).values({
              equipmentId: input.equipmentId,
              componentName: String(pred.component || ""),
              predictedFailureDate: new Date(String(pred.predicted_failure || "")),
              confidencePct: String(pred.confidence_pct || 0),
              currentWearPct: String(pred.wear_pct || 0),
              recommendedAction: String(pred.recommended_action || ""),
              estimatedCost: String(pred.estimated_cost || 0),
              priority: String(pred.priority || "low"),
              modelVersion: "fleet-service-v1",
            }).returning();
          }
          return predictions;
        }
      } catch (err) { /* service not available */ }

      return db.select()
        .from(equipmentMaintenancePredictions)
        .where(eq(equipmentMaintenancePredictions.equipmentId, input.equipmentId))
        .orderBy(desc(equipmentMaintenancePredictions.createdAt));
    }),

  createListing: protectedProcedure
    .input(z.object({
      equipmentType: z.enum(["tractor", "drone", "sprayer", "harvester", "irrigation", "planter"]),
      brand: z.string().optional(),
      model: z.string().optional(),
      yearManufactured: z.number().optional(),
      horsePower: z.number().optional(),
      pricePerHour: z.number().optional(),
      pricePerHa: z.number().optional(),
      pricePerDay: z.number().optional(),
      latitude: z.number(),
      longitude: z.number(),
      serviceRadiusKm: z.number().default(50),
      operatorIncluded: z.boolean().default(true),
      attachments: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const userId = ctx.user?.id ?? 1;
      const [listing] = await db.insert(equipmentListings).values({
        ownerId: userId,
        equipmentType: input.equipmentType,
        brand: input.brand,
        model: input.model,
        yearManufactured: input.yearManufactured,
        horsePower: input.horsePower,
        pricePerHour: input.pricePerHour?.toString(),
        pricePerHa: input.pricePerHa?.toString(),
        pricePerDay: input.pricePerDay?.toString(),
        latitude: input.latitude.toString(),
        longitude: input.longitude.toString(),
        serviceRadius: input.serviceRadiusKm.toString(),
        operatorIncluded: input.operatorIncluded,
        attachments: input.attachments ? JSON.stringify(input.attachments) : undefined,
        status: "available",
      }).returning();
      return listing;
    }),

  searchEquipment: publicProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
      radiusKm: z.number().default(50),
      equipmentType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const listings = await db.select()
        .from(equipmentListings)
        .where(eq(equipmentListings.status, "available"));

      return listings.filter(listing => {
        const lat = parseFloat(listing.latitude?.toString() || "0");
        const lon = parseFloat(listing.longitude?.toString() || "0");
        const dist = haversineKm(input.latitude, input.longitude, lat, lon);
        const matchType = !input.equipmentType || listing.equipmentType === input.equipmentType;
        return dist <= input.radiusKm && matchType;
      }).sort((a, b) => (parseFloat(b.avgRating?.toString() || "0") - parseFloat(a.avgRating?.toString() || "0")));
    }),

  bookEquipment: protectedProcedure
    .input(z.object({
      listingId: z.number(),
      farmId: z.number(),
      startDate: z.string(),
      endDate: z.string(),
      totalHours: z.number().optional(),
      totalAreaHa: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const listing = await db.select()
        .from(equipmentListings)
        .where(eq(equipmentListings.id, input.listingId))
        .limit(1);

      if (!listing.length) throw new Error("Listing not found");

      const pricePerHour = parseFloat(listing[0].pricePerHour?.toString() || "0");
      const hours = input.totalHours || 8;
      const totalPrice = pricePerHour * hours;
      const platformFee = totalPrice * 0.05;
      const userId = ctx.user?.id ?? 1;

      const [rental] = await db.insert(equipmentRentals).values({
        listingId: input.listingId,
        renterId: userId,
        farmId: input.farmId,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        totalHours: hours.toString(),
        totalArea: input.totalAreaHa?.toString(),
        totalPrice: totalPrice.toString(),
        platformFee: platformFee.toString(),
        status: "pending",
      }).returning();

      return { ...rental, totalPrice, platformFee };
    }),

  getFarmDigitalTwin: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const twins = await db.select()
        .from(farmDigitalTwins)
        .where(eq(farmDigitalTwins.farmId, input.farmId))
        .orderBy(desc(farmDigitalTwins.updatedAt))
        .limit(1);
      return twins[0] || null;
    }),

  createDigitalTwin: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      boundaryWkt: z.string().optional(),
      fieldZones: z.string().optional(),
      cropHistory: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [twin] = await db.insert(farmDigitalTwins).values({
        farmId: input.farmId,
        boundaryWkt: input.boundaryWkt,
        fieldZones: input.fieldZones,
        cropHistory: input.cropHistory,
        twinVersion: 1,
      }).returning();
      return twin;
    }),
});
