/**
 * Delivery & Supply Chain tRPC Router
 * 
 * Farm-to-table delivery: collection points, aggregation hubs, 
 * fleet management, route optimization, last-mile delivery.
 * PostGIS for spatial queries, Go delivery-service for route optimization.
 * 
 * Middleware: Kafka (delivery events), Dapr (service mesh), Redis (tracking cache),
 * PostgreSQL+PostGIS (spatial data), TigerBeetle (delivery payments)
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import {
  deliveryZones, collectionPoints, aggregationHubs, qualityGrades,
  drivers, deliveryRoutes, deliveryAssignments, deliveryTracking,
  deliveryRatings, consumerProfiles,
} from "../../drizzle/schema.js";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import crypto from "crypto";
import { publishEvent, createEvent, getProducer } from "../kafka.js";
import { resilientPost } from "../services/resilient-http.js";

const DELIVERY_SERVICE_URL = process.env.DELIVERY_SERVICE_URL || "http://localhost:8091";

async function callDeliveryService(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    return await resilientPost<Record<string, unknown>>(
      "delivery-service",
      `${DELIVERY_SERVICE_URL}${path}`,
      body,
      { maxRetries: 3, timeoutMs: 10_000 },
    );
  } catch (err) {
    return { error: "Delivery service unavailable" };
  }
}

export const deliveryRouter = router({
  // ============================================================================
  // Delivery Zones
  // ============================================================================
  
  listZones: publicProcedure
    .input(z.object({ city: z.string().optional(), active: z.boolean().default(true) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      let query = db.select().from(deliveryZones).where(eq(deliveryZones.active, input.active));
      return query;
    }),

  createZone: protectedProcedure
    .input(z.object({
      name: z.string(),
      city: z.string(),
      country: z.string().default("KE"),
      polygonWkt: z.string().optional(),
      baseFee: z.number().default(100),
      perKmFee: z.number().default(15),
      currency: z.string().default("NGN"),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [zone] = await db.insert(deliveryZones).values({
        name: input.name,
        city: input.city,
        country: input.country,
        polygonWkt: input.polygonWkt || null,
        baseFee: input.baseFee,
        perKmFee: input.perKmFee,
        currency: input.currency,
      }).returning();
      return zone;
    }),

  // PostGIS zone lookup
  findZoneForLocation: publicProcedure
    .input(z.object({ latitude: z.number(), longitude: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      try {
        const result = await db.execute(sql`
          SELECT id, name, city, country, pricing_multiplier, base_fee, per_km_fee, currency
          FROM delivery_zones 
          WHERE active = true
          AND polygon_wkt IS NOT NULL
          AND ST_Contains(
            ST_GeomFromText(polygon_wkt, 4326),
            ST_MakePoint(${input.longitude}, ${input.latitude})
          )
          LIMIT 1
        `);
        return (result as { rows: unknown[] }).rows[0] || null;
      } catch (err) {
        // PostGIS not available, return first active zone
        const zones = await db.select().from(deliveryZones).where(eq(deliveryZones.active, true)).limit(1);
        return zones[0] || null;
      }
    }),

  // ============================================================================
  // Collection Points
  // ============================================================================

  listCollectionPoints: publicProcedure
    .input(z.object({ zoneId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      if (input.zoneId) {
        return db.select().from(collectionPoints)
          .where(and(eq(collectionPoints.active, true), eq(collectionPoints.zoneId, input.zoneId)));
      }
      return db.select().from(collectionPoints).where(eq(collectionPoints.active, true));
    }),

  // PostGIS nearby collection points
  nearbyCollectionPoints: publicProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
      radiusKm: z.number().default(15),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      try {
        const result = await db.execute(sql`
          SELECT *, 
            ST_Distance(
              ST_MakePoint(longitude::float, latitude::float)::geography,
              ST_MakePoint(${input.longitude}, ${input.latitude})::geography
            ) / 1000 as distance_km
          FROM collection_points
          WHERE active = true
          AND ST_DWithin(
            ST_MakePoint(longitude::float, latitude::float)::geography,
            ST_MakePoint(${input.longitude}, ${input.latitude})::geography,
            ${input.radiusKm * 1000}
          )
          ORDER BY distance_km
          LIMIT 10
        `);
        return (result as { rows: unknown[] }).rows;
      } catch (err) {
        // Fallback: simple distance calculation
        const points = await db.select().from(collectionPoints).where(eq(collectionPoints.active, true));
        return points.filter(p => {
          const dlat = (Number(p.latitude) - input.latitude) * 111.32;
          const dlon = (Number(p.longitude) - input.longitude) * 111.32 * Math.cos(input.latitude * Math.PI / 180);
          return Math.sqrt(dlat * dlat + dlon * dlon) <= input.radiusKm;
        }).slice(0, 10);
      }
    }),

  createCollectionPoint: protectedProcedure
    .input(z.object({
      name: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      address: z.string().optional(),
      capacityTons: z.number().default(0),
      operatingHours: z.string().optional(),
      contactPhone: z.string().optional(),
      cooperativeId: z.number().optional(),
      zoneId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [point] = await db.insert(collectionPoints).values({
        name: input.name,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        address: input.address || null,
        capacityTons: String(input.capacityTons),
        operatingHours: input.operatingHours || null,
        contactPhone: input.contactPhone || null,
        cooperativeId: input.cooperativeId || null,
        zoneId: input.zoneId || null,
      }).returning();
      return point;
    }),

  // ============================================================================
  // Aggregation Hubs
  // ============================================================================

  listHubs: publicProcedure.query(async () => {
      const db = await requireDb();
    return db.select().from(aggregationHubs).where(eq(aggregationHubs.active, true));
  }),

  createHub: protectedProcedure
    .input(z.object({
      name: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      address: z.string().optional(),
      coldStorageCapacityTons: z.number().default(0),
      processingCapacityTons: z.number().default(0),
      gradingEnabled: z.boolean().default(false),
      contactPhone: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [hub] = await db.insert(aggregationHubs).values({
        name: input.name,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        address: input.address || null,
        coldStorageCapacityTons: String(input.coldStorageCapacityTons),
        processingCapacityTons: String(input.processingCapacityTons),
        gradingEnabled: input.gradingEnabled,
        contactPhone: input.contactPhone || null,
      }).returning();
      return hub;
    }),

  // ============================================================================
  // Quality Grading
  // ============================================================================

  gradeProduceAtHub: protectedProcedure
    .input(z.object({
      batchId: z.string(),
      hubId: z.number(),
      grade: z.enum(["A", "B", "C", "D", "reject"]),
      cropType: z.string(),
      moistureContent: z.number().optional(),
      foreignMatter: z.number().optional(),
      brokenGrains: z.number().optional(),
      photoUrl: z.string().optional(),
      aiGradeConfidence: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [grade] = await db.insert(qualityGrades).values({
        batchId: input.batchId,
        gradedBy: ctx.user.id,
        hubId: input.hubId,
        grade: input.grade,
        cropType: input.cropType,
        moistureContent: input.moistureContent ? String(input.moistureContent) : null,
        foreignMatter: input.foreignMatter ? String(input.foreignMatter) : null,
        brokenGrains: input.brokenGrains ? String(input.brokenGrains) : null,
        photoUrl: input.photoUrl || null,
        aiGradeConfidence: input.aiGradeConfidence ? String(input.aiGradeConfidence) : null,
        notes: input.notes || null,
      }).returning();

      // Publish grading event
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "supply-chain-events",
          messages: [{ value: JSON.stringify({
            type: "produce_graded",
            batch_id: input.batchId,
            grade: input.grade,
            hub_id: input.hubId,
            graded_by: ctx.user.id,
          })}],
        });
      }

      return grade;
    }),

  // ============================================================================
  // Driver Management
  // ============================================================================

  registerDriver: protectedProcedure
    .input(z.object({
      vehicleType: z.enum(["motorcycle", "bicycle", "pickup", "van", "truck", "refrigerated_truck"]),
      licenseNumber: z.string().optional(),
      vehicleRegistration: z.string().optional(),
      hasRefrigeration: z.boolean().default(false),
      capacityKg: z.number().default(100),
      zoneId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [driver] = await db.insert(drivers).values({
        userId: ctx.user.id,
        vehicleType: input.vehicleType,
        licenseNumber: input.licenseNumber || null,
        vehicleRegistration: input.vehicleRegistration || null,
        hasRefrigeration: input.hasRefrigeration,
        capacityKg: input.capacityKg,
        zoneId: input.zoneId || null,
      }).returning();
      return driver;
    }),

  goOnline: protectedProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [driver] = await db.select().from(drivers)
        .where(eq(drivers.userId, ctx.user.id));
      
      if (!driver) throw new Error("Not registered as a driver");

      await db.update(drivers)
        .set({
          onlineStatus: "online",
          currentLatitude: String(input.latitude),
          currentLongitude: String(input.longitude),
          updatedAt: new Date(),
        })
        .where(eq(drivers.id, driver.id));

      // Notify delivery service
      await callDeliveryService("/api/drivers/online", {
        id: driver.id,
        user_id: ctx.user.id,
        vehicle_type: driver.vehicleType,
        has_refrigeration: driver.hasRefrigeration,
        capacity_kg: driver.capacityKg,
        current_location: { latitude: input.latitude, longitude: input.longitude },
        rating: Number(driver.rating),
        total_deliveries: driver.totalDeliveries,
        online_status: "online",
      });

      return { status: "online" };
    }),

  goOffline: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      const [driver] = await db.select().from(drivers)
        .where(eq(drivers.userId, ctx.user.id));

      if (!driver) throw new Error("Not registered as a driver");

      await db.update(drivers)
        .set({ onlineStatus: "offline", updatedAt: new Date() })
        .where(eq(drivers.id, driver.id));

      await callDeliveryService("/api/drivers/offline", { driver_id: driver.id });

      return { status: "offline" };
    }),

  updateLocation: protectedProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
      speed: z.number().optional(),
      assignmentId: z.number().optional(),
      temperature: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      // Update driver location
      await db.update(drivers)
        .set({
          currentLatitude: String(input.latitude),
          currentLongitude: String(input.longitude),
          updatedAt: new Date(),
        })
        .where(eq(drivers.userId, ctx.user.id));

      // Record tracking point if assignment active
      if (input.assignmentId) {
        await db.insert(deliveryTracking).values({
          assignmentId: input.assignmentId,
          latitude: String(input.latitude),
          longitude: String(input.longitude),
          speed: input.speed ? String(input.speed) : null,
          temperature: input.temperature ? String(input.temperature) : null,
        });
      }

      return { tracked: true };
    }),

  // ============================================================================
  // Delivery Requests & Assignments
  // ============================================================================

  requestDelivery: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      pickupLatitude: z.number(),
      pickupLongitude: z.number(),
      deliveryLatitude: z.number(),
      deliveryLongitude: z.number(),
      weightKg: z.number().default(10),
      requiresColdChain: z.boolean().default(false),
      priority: z.enum(["normal", "express", "scheduled"]).default("normal"),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const result = await callDeliveryService("/api/delivery/request", {
        order_id: input.orderId,
        pickup_location: { latitude: input.pickupLatitude, longitude: input.pickupLongitude },
        delivery_location: { latitude: input.deliveryLatitude, longitude: input.deliveryLongitude },
        weight_kg: input.weightKg,
        requires_cold_chain: input.requiresColdChain,
        priority: input.priority,
      });

      if (result.driver_id) {
        const [assignment] = await db.insert(deliveryAssignments).values({
          orderId: input.orderId,
          driverId: result.driver_id as number,
          status: "assigned",
          estimatedArrival: result.estimated_arrival ? new Date(result.estimated_arrival as string) : null,
        }).returning();
        return assignment;
      }

      return { status: "queued", message: result.message };
    }),

  estimateFee: publicProcedure
    .input(z.object({
      pickupLatitude: z.number(),
      pickupLongitude: z.number(),
      deliveryLatitude: z.number(),
      deliveryLongitude: z.number(),
      weightKg: z.number().default(10),
      coldChain: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return callDeliveryService("/api/delivery/estimate-fee", {
        pickup: { latitude: input.pickupLatitude, longitude: input.pickupLongitude },
        delivery: { latitude: input.deliveryLatitude, longitude: input.deliveryLongitude },
        weight_kg: input.weightKg,
        cold_chain: input.coldChain,
      });
    }),

  calculateRoute: publicProcedure
    .input(z.object({
      pickupLatitude: z.number(),
      pickupLongitude: z.number(),
      deliveryLatitude: z.number(),
      deliveryLongitude: z.number(),
      roadQuality: z.enum(["highway", "paved", "gravel", "dirt", "seasonal"]).default("paved"),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return callDeliveryService("/api/routes/calculate", {
        pickup: { latitude: input.pickupLatitude, longitude: input.pickupLongitude },
        delivery: { latitude: input.deliveryLatitude, longitude: input.deliveryLongitude },
        road_quality: input.roadQuality,
      });
    }),

  // Get active delivery tracking for a driver
  getActiveDelivery: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const [driver] = await db.select().from(drivers)
        .where(eq(drivers.userId, ctx.user.id));
      if (!driver) return null;

      const assignments = await db.select().from(deliveryAssignments)
        .where(and(
          eq(deliveryAssignments.driverId, driver.id),
          eq(deliveryAssignments.status, "assigned"),
        ))
        .limit(1);
      return assignments[0] || null;
    }),

  // Confirm delivery
  confirmDelivery: protectedProcedure
    .input(z.object({
      assignmentId: z.number(),
      photoUrl: z.string().optional(),
      signatureUrl: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.update(deliveryAssignments)
        .set({
          status: "delivered",
          actualArrival: new Date(),
          deliveryPhotoUrl: input.photoUrl || null,
          signatureUrl: input.signatureUrl || null,
          notes: input.notes || null,
          updatedAt: new Date(),
        })
        .where(eq(deliveryAssignments.id, input.assignmentId));

      // Publish delivery completed event
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "delivery-events",
          messages: [{ value: JSON.stringify({
            type: "delivery_completed",
            assignment_id: input.assignmentId,
            delivered_by: ctx.user.id,
            timestamp: new Date().toISOString(),
          })}],
        });
      }

      return { status: "delivered" };
    }),

  // Rate a delivery
  rateDelivery: protectedProcedure
    .input(z.object({
      assignmentId: z.number(),
      rating: z.number().min(1).max(5),
      deliveryCondition: z.enum(["excellent", "good", "fair", "poor"]).optional(),
      timeliness: z.enum(["early", "on_time", "late", "very_late"]).optional(),
      feedback: z.string().optional(),
      photoUrl: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [rate] = await db.insert(deliveryRatings).values({
        assignmentId: input.assignmentId,
        ratedBy: ctx.user.id,
        rating: input.rating,
        deliveryCondition: input.deliveryCondition || null,
        timeliness: input.timeliness || null,
        feedback: input.feedback || null,
        photoUrl: input.photoUrl || null,
      }).returning();
      return rate;
    }),

  // ============================================================================
  // Consumer Profiles (Home Delivery)
  // ============================================================================

  updateConsumerProfile: protectedProcedure
    .input(z.object({
      deliveryAddresses: z.array(z.object({
        label: z.string(),
        street: z.string(),
        city: z.string(),
        latitude: z.number(),
        longitude: z.number(),
      })).optional(),
      defaultAddressIndex: z.number().optional(),
      dietaryPreferences: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const existing = await db.select().from(consumerProfiles)
        .where(eq(consumerProfiles.userId, ctx.user.id));
      
      const data = {
        deliveryAddresses: input.deliveryAddresses ? JSON.stringify(input.deliveryAddresses) : null,
        defaultAddressIndex: input.defaultAddressIndex ?? 0,
        dietaryPreferences: input.dietaryPreferences ? JSON.stringify(input.dietaryPreferences) : null,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        await db.update(consumerProfiles).set(data)
          .where(eq(consumerProfiles.userId, ctx.user.id));
        return { ...existing[0], ...data };
      } else {
        const [profile] = await db.insert(consumerProfiles).values({
          userId: ctx.user.id,
          ...data,
        }).returning();
        return profile;
      }
    }),
});
