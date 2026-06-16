/**
 * Spatial Analysis Router
 *
 * GeoLibre-inspired server-side spatial analysis endpoints.
 * Provides PostGIS-backed spatial queries, H3 coverage analysis,
 * field collection sync, spectral index metadata, and tile cache management.
 *
 * Middleware: PostgreSQL (state), Kafka (events), Redis (cache),
 * Permify (authorization), APISIX (rate limiting), OpenAppSec (WAF)
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { sql, eq, and, desc } from "drizzle-orm";
import { fieldCollections, spectralAnalyses, cachedTileAreas } from "../../drizzle/schema-spatial-analysis.js";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";
import { checkRateLimit, scanForThreats, checkPermission } from "../integrations/middleware-router-hooks.js";

export const spatialAnalysisRouter = router({
  // ============================================================================
  // FIELD COLLECTION — Sync collected features from mobile/offline
  // ============================================================================

  syncFieldCollection: protectedProcedure
    .input(z.object({
      collectionId: z.string().max(100),
      collectionName: z.string().max(200),
      features: z.array(z.object({
        id: z.string(),
        geometryType: z.enum(["Point", "LineString", "Polygon"]),
        coordinates: z.unknown(),
        properties: z.record(z.string(), z.unknown()),
        collectedAt: z.string(),
        accuracy: z.number().nullable(),
        altitude: z.number().nullable(),
        photos: z.array(z.string()).optional(),
      })).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("spatial-sync", userId, 10, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const wafScan = await scanForThreats("spatial-sync", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: "Request blocked by WAF" });

      const db = await requireDb();
      const numUserId = (ctx as { user?: { id: number } }).user?.id;
      if (!numUserId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const geojson = {
        type: "FeatureCollection",
        features: input.features.map(f => ({
          type: "Feature",
          geometry: { type: f.geometryType, coordinates: f.coordinates },
          properties: {
            ...f.properties,
            _collectedAt: f.collectedAt,
            _accuracy: f.accuracy,
            _altitude: f.altitude,
          },
        })),
      };

      await db.insert(fieldCollections)
        .values({
          id: input.collectionId,
          userId: numUserId,
          name: input.collectionName,
          featureCount: input.features.length,
          geojson,
          syncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: fieldCollections.id,
          set: {
            geojson,
            featureCount: input.features.length,
            syncedAt: new Date(),
          },
        });

      // Publish sync event
      try {
        const producer = await getProducer();
        if (producer) {
          await producer.send({
            topic: "field-collection-events",
            messages: [{
              key: input.collectionId,
              value: JSON.stringify({
                type: "field_collection.synced",
                userId: numUserId,
                collectionId: input.collectionId,
                featureCount: input.features.length,
                timestamp: new Date().toISOString(),
              }),
            }],
          });
        }
      } catch (e) {
        logger.warn("[Kafka] Failed to publish field collection sync event", e);
      }

      return {
        success: true,
        collectionId: input.collectionId,
        featuresSynced: input.features.length,
      };
    }),

  getFieldCollections: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("spatial-list", userId, 30, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const db = await requireDb();
      const numUserId = (ctx as { user?: { id: number } }).user?.id;
      if (!numUserId) throw new TRPCError({ code: "UNAUTHORIZED" });

      try {
        const result = await db.select({
          id: fieldCollections.id,
          name: fieldCollections.name,
          featureCount: fieldCollections.featureCount,
          syncedAt: fieldCollections.syncedAt,
          createdAt: fieldCollections.createdAt,
        })
          .from(fieldCollections)
          .where(eq(fieldCollections.userId, numUserId))
          .orderBy(desc(fieldCollections.syncedAt));
        return { collections: result };
      } catch {
        return { collections: [] };
      }
    }),

  getFieldCollectionGeoJSON: protectedProcedure
    .input(z.object({ collectionId: z.string().max(100) }))
    .query(async ({ input, ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("spatial-geojson", userId, 30, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const db = await requireDb();
      const numUserId = (ctx as { user?: { id: number } }).user?.id;
      if (!numUserId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const result = await db.select({ geojson: fieldCollections.geojson })
        .from(fieldCollections)
        .where(and(
          eq(fieldCollections.id, input.collectionId),
          eq(fieldCollections.userId, numUserId),
        ));
      if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found" });
      return { geojson: result[0].geojson };
    }),

  // ============================================================================
  // SPATIAL QUERIES — PostGIS-backed analysis
  // ============================================================================

  findDistributorsNearby: protectedProcedure
    .input(z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusKm: z.number().min(1).max(500),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input, ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("spatial-nearby", userId, 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const db = await requireDb();

      const result = await db.execute(sql`
        SELECT
          id, business_name, warehouse_address, latitude, longitude,
          status, kyc_status, coverage_regions,
          (6371 * acos(
            cos(radians(${input.lat})) * cos(radians(latitude)) *
            cos(radians(longitude) - radians(${input.lng})) +
            sin(radians(${input.lat})) * sin(radians(latitude))
          )) AS distance_km
        FROM distributors
        WHERE status IN ('approved', 'active')
          AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND (6371 * acos(
            cos(radians(${input.lat})) * cos(radians(latitude)) *
            cos(radians(longitude) - radians(${input.lng})) +
            sin(radians(${input.lat})) * sin(radians(latitude))
          )) < ${input.radiusKm}
        ORDER BY distance_km
        LIMIT ${input.limit}
      `);

      return { distributors: result.rows || [] };
    }),

  getDistributorCoverageGeoJSON: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("spatial-coverage", userId, 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const db = await requireDb();

      const result = await db.execute(sql`
        SELECT id, business_name, latitude, longitude, status, warehouse_capacity,
               coverage_regions, kyc_level
        FROM distributors
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      `);

      const features = (result.rows || []).map((d: Record<string, unknown>) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [d.longitude, d.latitude],
        },
        properties: {
          id: d.id,
          name: d.business_name,
          status: d.status,
          capacity: d.warehouse_capacity,
          regions: d.coverage_regions,
          kycLevel: d.kyc_level,
        },
      }));

      return {
        type: "FeatureCollection" as const,
        features,
      };
    }),

  // ============================================================================
  // H3 COVERAGE ANALYSIS — Server-side hexagonal analysis
  // ============================================================================

  getH3CoverageAnalysis: protectedProcedure
    .input(z.object({
      resolution: z.number().min(1).max(10).default(5),
    }))
    .query(async ({ ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("spatial-h3", userId, 10, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const db = await requireDb();

      const distResult = await db.execute(sql`
        SELECT id, latitude, longitude, warehouse_capacity
        FROM distributors
        WHERE status IN ('approved', 'active')
          AND latitude IS NOT NULL AND longitude IS NOT NULL
      `);

      const farmerResult = await db.execute(sql`
        SELECT DISTINCT farmer_id FROM distributor_partnerships
        WHERE status = 'active'
      `);

      return {
        distributors: distResult.rows || [],
        activeFarmerCount: (farmerResult.rows || []).length,
      };
    }),

  // ============================================================================
  // SPECTRAL INDEX RESULTS — Store/retrieve crop health analysis
  // ============================================================================

  saveSpectralAnalysis: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      indexType: z.enum(["NDVI", "NDWI", "EVI", "SAVI", "NDMI", "NDBI", "NBR", "GNDVI"]),
      mean: z.number(),
      min: z.number(),
      max: z.number(),
      stdDev: z.number(),
      healthDistribution: z.record(z.string(), z.number()).optional(),
      bbox: z.array(z.number()).length(4).optional(),
      sourceUrl: z.string().max(2000).optional(),
      analysisDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("spectral-save", userId, 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const db = await requireDb();
      const numUserId = (ctx as { user?: { id: number } }).user?.id;
      if (!numUserId) throw new TRPCError({ code: "UNAUTHORIZED" });

      await db.insert(spectralAnalyses).values({
        userId: numUserId,
        farmId: input.farmId ?? null,
        indexType: input.indexType,
        meanValue: input.mean,
        minValue: input.min,
        maxValue: input.max,
        stdDev: input.stdDev,
        healthDistribution: input.healthDistribution || {},
        sourceUrl: input.sourceUrl ?? null,
        analysisDate: new Date(input.analysisDate),
      });

      return { success: true };
    }),

  getSpectralHistory: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      indexType: z.enum(["NDVI", "NDWI", "EVI", "SAVI", "NDMI", "NDBI", "NBR", "GNDVI"]).optional(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("spectral-history", userId, 30, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const db = await requireDb();
      const numUserId = (ctx as { user?: { id: number } }).user?.id;
      if (!numUserId) throw new TRPCError({ code: "UNAUTHORIZED" });

      try {
        const conditions = [eq(spectralAnalyses.userId, numUserId)];
        if (input.farmId) conditions.push(eq(spectralAnalyses.farmId, input.farmId));
        if (input.indexType) conditions.push(eq(spectralAnalyses.indexType, input.indexType));

        const result = await db.select()
          .from(spectralAnalyses)
          .where(and(...conditions))
          .orderBy(desc(spectralAnalyses.analysisDate))
          .limit(input.limit);
        return { analyses: result };
      } catch {
        return { analyses: [] };
      }
    }),

  // ============================================================================
  // OFFLINE TILE CACHE — Track cached areas server-side
  // ============================================================================

  registerCachedArea: protectedProcedure
    .input(z.object({
      areaId: z.string().max(100),
      name: z.string().max(200),
      boundsNorth: z.number().min(-90).max(90),
      boundsSouth: z.number().min(-90).max(90),
      boundsEast: z.number().min(-180).max(180),
      boundsWest: z.number().min(-180).max(180),
      minZoom: z.number().min(0).max(22),
      maxZoom: z.number().min(0).max(22),
      tileCount: z.number().min(0),
      sizeBytes: z.number().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("tile-cache", userId, 5, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const db = await requireDb();
      const numUserId = (ctx as { user?: { id: number } }).user?.id;
      if (!numUserId) throw new TRPCError({ code: "UNAUTHORIZED" });

      await db.insert(cachedTileAreas)
        .values({
          id: input.areaId,
          userId: numUserId,
          name: input.name,
          boundsNorth: input.boundsNorth,
          boundsSouth: input.boundsSouth,
          boundsEast: input.boundsEast,
          boundsWest: input.boundsWest,
          minZoom: input.minZoom,
          maxZoom: input.maxZoom,
          tileCount: input.tileCount,
          sizeBytes: input.sizeBytes,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
        .onConflictDoUpdate({
          target: cachedTileAreas.id,
          set: {
            tileCount: input.tileCount,
            sizeBytes: input.sizeBytes,
          },
        });

      return { success: true };
    }),

  // ============================================================================
  // ADMIN GIS WORKSPACE — Embedded GeoLibre viewer config
  // ============================================================================

  getGISWorkspaceConfig: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("gis-config", userId, 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      await checkPermission(userId, "spatial-analysis", "admin");

      return {
        geolibreEmbedUrl: process.env.GEOLIBRE_EMBED_URL || "https://viewer.geolibre.app",
        enabledTools: [
          "field-collection",
          "spectral-index",
          "vector-analysis",
          "raster-analysis",
          "h3-grid",
          "tile-cache",
        ],
        defaultCenter: { lat: 9.0820, lng: 8.6753 },
        defaultZoom: 6,
        basemaps: [
          { id: "osm", name: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png" },
          { id: "satellite", name: "Satellite", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" },
          { id: "terrain", name: "Terrain", url: "https://tile.opentopomap.org/{z}/{x}/{y}.png" },
        ],
        layers: [
          { id: "distributors", name: "Distributors", type: "geojson", endpoint: "/api/spatial/distributors" },
          { id: "farms", name: "Farm Boundaries", type: "geojson", endpoint: "/api/spatial/farms" },
          { id: "coverage", name: "Coverage Areas", type: "geojson", endpoint: "/api/spatial/coverage" },
        ],
      };
    }),
});
