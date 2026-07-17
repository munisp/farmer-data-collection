/**
 * latlng Router — Real-Time Geospatial Object Tracking & Geofencing
 *
 * Endpoints for fleet tracking, cold chain monitoring, distributor coverage,
 * geofence management, and live location queries.
 *
 * Architecture: latlng (primary real-time) → PostgreSQL (fallback/history)
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { sql, eq, and, desc, gte, count } from "drizzle-orm";
import {
  trackedObjects,
  trackingHistory,
  geofenceZones,
  geofenceEvents,
} from "../../drizzle/schema-spatial-engines.js";
import { getLatLngClient } from "../lib/latlng-client.js";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";
import { checkRateLimit, scanForThreats } from "../integrations/middleware-router-hooks.js";

function getUserId(ctx: unknown): number {
  const id = (ctx as { user?: { id: number } }).user?.id;
  if (!id) throw new TRPCError({ code: "UNAUTHORIZED" });
  return id;
}

export const latlngRouter = router({
  // ── Health / Status ──────────────────────────────────────────────

  status: protectedProcedure.query(async () => {
    const latlng = getLatLngClient();
    const connected = await latlng.healthCheck();

    const db = await requireDb();
    const [objectCount] = await db.select({ total: count() }).from(trackedObjects);
    const [zoneCount] = await db.select({ total: count() }).from(geofenceZones);
    const [eventCount] = await db.select({ total: count() }).from(geofenceEvents);

    return {
      latlngConnected: connected,
      trackedObjects: objectCount?.total ?? 0,
      geofenceZones: zoneCount?.total ?? 0,
      geofenceEvents: eventCount?.total ?? 0,
    };
  }),

  // ── Object Tracking ──────────────────────────────────────────────

  updatePosition: protectedProcedure
    .input(z.object({
      objectId: z.string().max(100),
      collection: z.enum(["fleet", "cold_chain", "distributors", "farmers", "sensors"]),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      altitude: z.number().optional(),
      speed: z.number().min(0).max(500).optional(),
      heading: z.number().min(0).max(360).optional(),
      accuracy: z.number().min(0).optional(),
      label: z.string().max(200).optional(),
      objectType: z.string().max(50).optional(),
      fields: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = getUserId(ctx);
      const rateCheck = await checkRateLimit("latlng-update", String(userId), 60, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });

      const db = await requireDb();
      const latlng = getLatLngClient();

      // Update in latlng if available
      let latlngSynced = false;
      if (latlng.isConnected()) {
        latlngSynced = await latlng.setPoint(
          input.collection,
          input.objectId,
          input.latitude,
          input.longitude,
          input.fields,
          input.metadata,
        );

        // Set additional fields
        if (input.speed !== undefined) {
          await latlng.setField(input.collection, input.objectId, "speed", input.speed);
        }
        if (input.fields) {
          for (const [key, val] of Object.entries(input.fields)) {
            await latlng.setField(input.collection, input.objectId, key, val);
          }
        }
      }

      // Persist to PostgreSQL
      const existing = await db.select()
        .from(trackedObjects)
        .where(and(
          eq(trackedObjects.collection, input.collection),
          eq(trackedObjects.objectId, input.objectId),
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(trackedObjects)
          .set({
            latitude: input.latitude,
            longitude: input.longitude,
            altitude: input.altitude,
            speed: input.speed,
            heading: input.heading,
            accuracy: input.accuracy,
            fields: input.fields,
            metadata: input.metadata,
            latlngSynced,
            lastUpdated: new Date(),
          })
          .where(and(
            eq(trackedObjects.collection, input.collection),
            eq(trackedObjects.objectId, input.objectId),
          ));
      } else {
        await db.insert(trackedObjects).values({
          objectId: input.objectId,
          collection: input.collection,
          objectType: input.objectType || input.collection,
          label: input.label,
          latitude: input.latitude,
          longitude: input.longitude,
          altitude: input.altitude,
          speed: input.speed,
          heading: input.heading,
          accuracy: input.accuracy,
          fields: input.fields,
          metadata: input.metadata,
          userId,
          latlngSynced,
        });
      }

      // Record in tracking history
      await db.insert(trackingHistory).values({
        objectId: input.objectId,
        collection: input.collection,
        latitude: input.latitude,
        longitude: input.longitude,
        speed: input.speed,
        heading: input.heading,
        fields: input.fields,
      });

      // Emit Kafka event
      try {
        const producer = await getProducer();
        if (producer) {
        await producer.send({
          topic: "latlng.position.updated",
          messages: [{
            key: `${input.collection}:${input.objectId}`,
            value: JSON.stringify({
              collection: input.collection,
              objectId: input.objectId,
              lat: input.latitude,
              lng: input.longitude,
              speed: input.speed,
            }),
          }],
        });
        }
      } catch { /* Kafka unavailable */ }

      return { objectId: input.objectId, collection: input.collection, latlngSynced };
    }),

  // ── Nearby Search ────────────────────────────────────────────────

  nearby: protectedProcedure
    .input(z.object({
      collection: z.enum(["fleet", "cold_chain", "distributors", "farmers", "sensors"]),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      radiusMeters: z.number().min(100).max(100000).default(5000),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input, ctx }) => {
      const userId = getUserId(ctx);
      const rateCheck = await checkRateLimit("latlng-nearby", String(userId), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });

      const latlng = getLatLngClient();

      // Try latlng first
      if (latlng.isConnected()) {
        const results = await latlng.nearby(
          input.collection,
          input.latitude,
          input.longitude,
          input.radiusMeters,
          input.limit,
        );

        if (results.length > 0) {
          return {
            source: "latlng" as const,
            objects: results.map(r => ({
              id: r.id,
              distance: r.distance,
              latitude: r.lat,
              longitude: r.lng,
              fields: r.fields,
            })),
            total: results.length,
          };
        }
      }

      // PostgreSQL fallback — Haversine distance
      const db = await requireDb();
      const objects = await db.select()
        .from(trackedObjects)
        .where(and(
          eq(trackedObjects.collection, input.collection),
          sql`(6371000 * acos(
            cos(radians(${input.latitude})) * cos(radians(${trackedObjects.latitude}))
            * cos(radians(${trackedObjects.longitude}) - radians(${input.longitude}))
            + sin(radians(${input.latitude})) * sin(radians(${trackedObjects.latitude}))
          )) < ${input.radiusMeters}`,
        ))
        .limit(input.limit);

      return {
        source: "postgresql" as const,
        objects: objects.map(o => ({
          id: o.objectId,
          label: o.label,
          objectType: o.objectType,
          latitude: o.latitude,
          longitude: o.longitude,
          speed: o.speed,
          heading: o.heading,
          fields: o.fields as Record<string, number | string> | null,
          lastUpdated: o.lastUpdated,
        })),
        total: objects.length,
      };
    }),

  // ── Get All Objects in Collection ────────────────────────────────

  listObjects: protectedProcedure
    .input(z.object({
      collection: z.enum(["fleet", "cold_chain", "distributors", "farmers", "sensors"]),
      limit: z.number().int().min(1).max(500).default(100),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const objects = await db.select()
        .from(trackedObjects)
        .where(eq(trackedObjects.collection, input.collection))
        .orderBy(desc(trackedObjects.lastUpdated))
        .limit(input.limit);

      return objects.map(o => ({
        id: o.objectId,
        label: o.label,
        objectType: o.objectType,
        latitude: o.latitude,
        longitude: o.longitude,
        speed: o.speed,
        heading: o.heading,
        fields: o.fields,
        metadata: o.metadata,
        lastUpdated: o.lastUpdated,
      }));
    }),

  // ── Tracking History ─────────────────────────────────────────────

  getTrackingHistory: protectedProcedure
    .input(z.object({
      objectId: z.string().max(100),
      collection: z.string().max(100),
      since: z.string().optional(), // ISO date string
      limit: z.number().int().min(1).max(1000).default(100),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [
        eq(trackingHistory.objectId, input.objectId),
        eq(trackingHistory.collection, input.collection),
      ];
      if (input.since) {
        conditions.push(gte(trackingHistory.recordedAt, new Date(input.since)));
      }

      const history = await db.select()
        .from(trackingHistory)
        .where(and(...conditions))
        .orderBy(desc(trackingHistory.recordedAt))
        .limit(input.limit);

      return {
        objectId: input.objectId,
        points: history.map(h => ({
          latitude: h.latitude,
          longitude: h.longitude,
          speed: h.speed,
          heading: h.heading,
          fields: h.fields,
          recordedAt: h.recordedAt,
        })),
        total: history.length,
      };
    }),

  // ── Geofence Management ──────────────────────────────────────────

  createGeofence: protectedProcedure
    .input(z.object({
      name: z.string().max(200),
      zoneType: z.enum(["farm_boundary", "delivery_zone", "cold_chain_route", "coverage_area", "warehouse", "exclusion_zone"]),
      collection: z.enum(["fleet", "cold_chain", "distributors", "farmers", "sensors"]),
      detectEvents: z.array(z.enum(["enter", "exit", "inside", "outside", "cross"])).default(["enter", "exit"]),
      geojson: z.record(z.string(), z.unknown()),
      webhookUrl: z.string().url().max(500).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = getUserId(ctx);
      const rateCheck = await checkRateLimit("latlng-geofence", String(userId), 10, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });

      const db = await requireDb();
      const latlng = getLatLngClient();

      // Create in latlng if available
      let latlngSynced = false;
      if (latlng.isConnected()) {
        latlngSynced = await latlng.createHook({
          name: input.name,
          collection: input.collection,
          detect: input.detectEvents,
          geojson: input.geojson,
          endpoint: input.webhookUrl,
        });
      }

      const [zone] = await db.insert(geofenceZones).values({
        name: input.name,
        zoneType: input.zoneType,
        collection: input.collection,
        detectEvents: input.detectEvents,
        geojson: input.geojson,
        webhookUrl: input.webhookUrl,
        latlngSynced,
        metadata: input.metadata,
        userId,
      }).returning();

      return { id: zone.id, name: zone.name, latlngSynced };
    }),

  listGeofences: protectedProcedure
    .input(z.object({
      zoneType: z.string().max(50).optional(),
      collection: z.string().max(100).optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input.zoneType) conditions.push(eq(geofenceZones.zoneType, input.zoneType));
      if (input.collection) conditions.push(eq(geofenceZones.collection, input.collection));

      const zones = await db.select()
        .from(geofenceZones)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(geofenceZones.createdAt));

      return zones.map(z => ({
        id: z.id,
        name: z.name,
        zoneType: z.zoneType,
        collection: z.collection,
        detectEvents: z.detectEvents,
        active: z.active,
        latlngSynced: z.latlngSynced,
        metadata: z.metadata,
        createdAt: z.createdAt,
      }));
    }),

  deleteGeofence: protectedProcedure
    .input(z.object({ name: z.string().max(200) }))
    .mutation(async ({ input, ctx }) => {
      const userId = getUserId(ctx);
      const db = await requireDb();
      const latlng = getLatLngClient();

      if (latlng.isConnected()) {
        await latlng.deleteHook(input.name);
      }

      await db.delete(geofenceZones).where(eq(geofenceZones.name, input.name));
      return { deleted: true };
    }),

  // ── Geofence Events ─────────────────────────────────────────────

  recordGeofenceEvent: protectedProcedure
    .input(z.object({
      zoneName: z.string().max(200),
      eventType: z.enum(["enter", "exit", "inside", "outside", "cross"]),
      objectId: z.string().max(100),
      collection: z.string().max(100),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      fields: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();

      const [event] = await db.insert(geofenceEvents).values({
        zoneName: input.zoneName,
        eventType: input.eventType,
        objectId: input.objectId,
        collection: input.collection,
        latitude: input.latitude,
        longitude: input.longitude,
        fields: input.fields,
      }).returning();

      // Emit Kafka event
      try {
        const producer = await getProducer();
        if (producer) {
        await producer.send({
          topic: "latlng.geofence.event",
          messages: [{
            key: input.zoneName,
            value: JSON.stringify({
              eventId: event.id,
              zoneName: input.zoneName,
              eventType: input.eventType,
              objectId: input.objectId,
            }),
          }],
        });
        }
      } catch { /* Kafka unavailable */ }

      return { eventId: event.id };
    }),

  getGeofenceEvents: protectedProcedure
    .input(z.object({
      zoneName: z.string().max(200).optional(),
      eventType: z.string().max(20).optional(),
      limit: z.number().int().min(1).max(500).default(50),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input.zoneName) conditions.push(eq(geofenceEvents.zoneName, input.zoneName));
      if (input.eventType) conditions.push(eq(geofenceEvents.eventType, input.eventType));

      const events = await db.select()
        .from(geofenceEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(geofenceEvents.occurredAt))
        .limit(input.limit);

      return events;
    }),

  // ── Dashboard Stats ──────────────────────────────────────────────

  dashboardStats: protectedProcedure.query(async () => {
    const db = await requireDb();
    const latlng = getLatLngClient();

    const [objectCount] = await db.select({ total: count() }).from(trackedObjects);
    const [activeCount] = await db.select({ total: count() }).from(trackedObjects)
      .where(gte(trackedObjects.lastUpdated, new Date(Date.now() - 3600000)));
    const [zoneCount] = await db.select({ total: count() }).from(geofenceZones)
      .where(eq(geofenceZones.active, true));
    const [eventCount] = await db.select({ total: count() }).from(geofenceEvents);
    const [historyCount] = await db.select({ total: count() }).from(trackingHistory);

    // Collection breakdown
    const collectionStats = await db.select({
      collection: trackedObjects.collection,
      total: count(),
    })
      .from(trackedObjects)
      .groupBy(trackedObjects.collection);

    return {
      latlngConnected: latlng.isConnected(),
      totalTracked: objectCount?.total ?? 0,
      activeLastHour: activeCount?.total ?? 0,
      activeGeofences: zoneCount?.total ?? 0,
      totalEvents: eventCount?.total ?? 0,
      historyPoints: historyCount?.total ?? 0,
      byCollection: Object.fromEntries(collectionStats.map(c => [c.collection, c.total])),
    };
  }),
});
