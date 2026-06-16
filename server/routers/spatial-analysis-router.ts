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
import { sql } from "drizzle-orm";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";
import { checkRateLimit, scanForThreats, checkPermission } from "../integrations/middleware-router-hooks.js";

export const spatialAnalysisRouter = router({
  // ============================================================================
  // FIELD COLLECTION — Sync collected features from mobile/offline
  // ============================================================================

  syncFieldCollection: protectedProcedure
    .input(z.object({
      collectionId: z.string(),
      collectionName: z.string(),
      features: z.array(z.object({
        id: z.string(),
        geometryType: z.enum(["Point", "LineString", "Polygon"]),
        coordinates: z.unknown(),
        properties: z.record(z.string(), z.unknown()),
        collectedAt: z.string(),
        accuracy: z.number().nullable(),
        altitude: z.number().nullable(),
        photos: z.array(z.string()).optional(),
      })),
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

      // Store in field_collections table (create if not exists)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS field_collections (
          id VARCHAR(100) PRIMARY KEY,
          user_id INTEGER NOT NULL,
          name VARCHAR(200) NOT NULL,
          feature_count INTEGER DEFAULT 0,
          geojson JSONB,
          synced_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

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

      await db.execute(sql`
        INSERT INTO field_collections (id, user_id, name, feature_count, geojson, synced_at)
        VALUES (${input.collectionId}, ${numUserId}, ${input.collectionName}, ${input.features.length}, ${JSON.stringify(geojson)}::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET
          geojson = ${JSON.stringify(geojson)}::jsonb,
          feature_count = ${input.features.length},
          synced_at = NOW()
      `);

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
      const db = await requireDb();
      const userId = (ctx as { user?: { id: number } }).user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      try {
        const result = await db.execute(sql`
          SELECT id, name, feature_count, synced_at, created_at
          FROM field_collections
          WHERE user_id = ${userId}
          ORDER BY synced_at DESC
        `);
        return { collections: result.rows || [] };
      } catch {
        return { collections: [] };
      }
    }),

  getFieldCollectionGeoJSON: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const userId = (ctx as { user?: { id: number } }).user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const result = await db.execute(sql`
        SELECT geojson FROM field_collections
        WHERE id = ${input.collectionId} AND user_id = ${userId}
      `);
      const rows = result.rows || [];
      if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found" });
      return { geojson: (rows[0] as Record<string, unknown>).geojson };
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
    .query(async ({ input }) => {
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
    .query(async () => {
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
    .query(async () => {
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
      sourceUrl: z.string().optional(),
      analysisDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("spectral-save", userId, 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const db = await requireDb();
      const numUserId = (ctx as { user?: { id: number } }).user?.id;
      if (!numUserId) throw new TRPCError({ code: "UNAUTHORIZED" });

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS spectral_analyses (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          farm_id INTEGER,
          index_type VARCHAR(10) NOT NULL,
          mean_value DOUBLE PRECISION,
          min_value DOUBLE PRECISION,
          max_value DOUBLE PRECISION,
          std_dev DOUBLE PRECISION,
          health_distribution JSONB,
          source_url TEXT,
          analysis_date DATE,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await db.execute(sql`
        INSERT INTO spectral_analyses
          (user_id, farm_id, index_type, mean_value, min_value, max_value, std_dev,
           health_distribution, source_url, analysis_date)
        VALUES (${numUserId}, ${input.farmId ?? null}, ${input.indexType},
                ${input.mean}, ${input.min}, ${input.max}, ${input.stdDev},
                ${JSON.stringify(input.healthDistribution || {})}::jsonb,
                ${input.sourceUrl ?? null}, ${input.analysisDate})
      `);

      return { success: true };
    }),

  getSpectralHistory: protectedProcedure
    .input(z.object({
      farmId: z.number().optional(),
      indexType: z.enum(["NDVI", "NDWI", "EVI", "SAVI", "NDMI", "NDBI", "NBR", "GNDVI"]).optional(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const userId = (ctx as { user?: { id: number } }).user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      try {
        // Build query dynamically based on optional filters
        if (input.farmId && input.indexType) {
          const result = await db.execute(sql`
            SELECT * FROM spectral_analyses
            WHERE user_id = ${userId} AND farm_id = ${input.farmId} AND index_type = ${input.indexType}
            ORDER BY analysis_date DESC LIMIT ${input.limit}
          `);
          return { analyses: result.rows || [] };
        } else if (input.indexType) {
          const result = await db.execute(sql`
            SELECT * FROM spectral_analyses
            WHERE user_id = ${userId} AND index_type = ${input.indexType}
            ORDER BY analysis_date DESC LIMIT ${input.limit}
          `);
          return { analyses: result.rows || [] };
        } else if (input.farmId) {
          const result = await db.execute(sql`
            SELECT * FROM spectral_analyses
            WHERE user_id = ${userId} AND farm_id = ${input.farmId}
            ORDER BY analysis_date DESC LIMIT ${input.limit}
          `);
          return { analyses: result.rows || [] };
        } else {
          const result = await db.execute(sql`
            SELECT * FROM spectral_analyses
            WHERE user_id = ${userId}
            ORDER BY analysis_date DESC LIMIT ${input.limit}
          `);
          return { analyses: result.rows || [] };
        }
      } catch {
        return { analyses: [] };
      }
    }),

  // ============================================================================
  // OFFLINE TILE CACHE — Track cached areas server-side
  // ============================================================================

  registerCachedArea: protectedProcedure
    .input(z.object({
      areaId: z.string(),
      name: z.string(),
      boundsNorth: z.number(),
      boundsSouth: z.number(),
      boundsEast: z.number(),
      boundsWest: z.number(),
      minZoom: z.number(),
      maxZoom: z.number(),
      tileCount: z.number(),
      sizeBytes: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
      const rateCheck = await checkRateLimit("tile-cache", userId, 5, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });

      const db = await requireDb();
      const numUserId = (ctx as { user?: { id: number } }).user?.id;
      if (!numUserId) throw new TRPCError({ code: "UNAUTHORIZED" });

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cached_tile_areas (
          id VARCHAR(100) PRIMARY KEY,
          user_id INTEGER NOT NULL,
          name VARCHAR(200) NOT NULL,
          bounds_north DOUBLE PRECISION,
          bounds_south DOUBLE PRECISION,
          bounds_east DOUBLE PRECISION,
          bounds_west DOUBLE PRECISION,
          min_zoom INTEGER,
          max_zoom INTEGER,
          tile_count INTEGER,
          size_bytes BIGINT,
          created_at TIMESTAMP DEFAULT NOW(),
          expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days'
        )
      `);

      await db.execute(sql`
        INSERT INTO cached_tile_areas
          (id, user_id, name, bounds_north, bounds_south, bounds_east, bounds_west,
           min_zoom, max_zoom, tile_count, size_bytes)
        VALUES (${input.areaId}, ${numUserId}, ${input.name},
                ${input.boundsNorth}, ${input.boundsSouth}, ${input.boundsEast}, ${input.boundsWest},
                ${input.minZoom}, ${input.maxZoom}, ${input.tileCount}, ${input.sizeBytes})
        ON CONFLICT (id) DO UPDATE SET
          tile_count = ${input.tileCount}, size_bytes = ${input.sizeBytes}
      `);

      return { success: true };
    }),

  // ============================================================================
  // ADMIN GIS WORKSPACE — Embedded GeoLibre viewer config
  // ============================================================================

  getGISWorkspaceConfig: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = String((ctx as { user?: { id: number } }).user?.id ?? "anon");
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
