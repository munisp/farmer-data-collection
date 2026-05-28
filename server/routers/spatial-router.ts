/**
 * Spatial queries router using PostGIS
 * Provides endpoints for spatial operations on farms and boundaries
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { logger } from '../logger.js';

export const spatialRouter = router({
  /**
   * Find farms within a radius (in meters) of a point
   */
  findFarmsWithinRadius: protectedProcedure
    .input(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusMeters: z.number().min(1).max(100000), // Max 100km
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { latitude, longitude, radiusMeters } = input;

      // Use ST_DWithin with geography for accurate distance in meters
      const result = await db.execute(sql`
        SELECT 
          f.id,
          f.name,
          f.latitude,
          f.longitude,
          ST_Distance(
            f.location::geography,
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
          ) as distance_meters
        FROM farms f
        WHERE f.user_id = ${ctx.user.id}
          AND f.location IS NOT NULL
          AND ST_DWithin(
            f.location::geography,
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
            ${radiusMeters}
          )
        ORDER BY distance_meters ASC
      `);

      return result.rows;
    }),

  /**
   * Find nearest farms to a point
   */
  findNearestFarms: protectedProcedure
    .input(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { latitude, longitude, limit } = input;

      const result = await db.execute(sql`
        SELECT 
          f.id,
          f.name,
          f.latitude,
          f.longitude,
          f.size,
          f.unit,
          ST_Distance(
            f.location::geography,
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
          ) as distance_meters
        FROM farms f
        WHERE f.user_id = ${ctx.user.id}
          AND f.location IS NOT NULL
        ORDER BY f.location <-> ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
        LIMIT ${limit}
      `);

      return result.rows;
    }),

  /**
   * Check if a point is within any farm boundary
   */
  findFarmContainingPoint: protectedProcedure
    .input(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { latitude, longitude } = input;

      const result = await db.execute(sql`
        SELECT 
          fb.id,
          fb.farm_id,
          fb.name,
          fb.area_hectares,
          f.name as farm_name
        FROM farm_boundaries fb
        JOIN farms f ON fb.farm_id = f.id
        WHERE fb.user_id = ${ctx.user.id}
          AND ST_Contains(
            fb.boundary,
            ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
          )
        LIMIT 1
      `);

      return result.rows[0] || null;
    }),

  /**
   * Find overlapping farm boundaries
   */
  findOverlappingBoundaries: protectedProcedure
    .input(
      z.object({
        farmId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db.execute(sql`
        SELECT 
          fb2.id,
          fb2.farm_id,
          fb2.name,
          fb2.area_hectares,
          ST_Area(ST_Intersection(fb1.boundary, fb2.boundary)::geography) / 10000.0 as overlap_hectares
        FROM farm_boundaries fb1
        JOIN farm_boundaries fb2 ON fb1.id != fb2.id
        WHERE fb1.farm_id = ${input.farmId}
          AND fb1.user_id = ${ctx.user.id}
          AND fb2.user_id = ${ctx.user.id}
          AND ST_Intersects(fb1.boundary, fb2.boundary)
      `);

      return result.rows;
    }),

  /**
   * Calculate distance between two farms
   */
  calculateDistance: protectedProcedure
    .input(
      z.object({
        farmId1: z.number(),
        farmId2: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db.execute(sql`
        SELECT 
          f1.id as farm1_id,
          f1.name as farm1_name,
          f2.id as farm2_id,
          f2.name as farm2_name,
          ST_Distance(f1.location::geography, f2.location::geography) as distance_meters,
          ST_Distance(f1.location::geography, f2.location::geography) / 1000.0 as distance_km
        FROM farms f1
        CROSS JOIN farms f2
        WHERE f1.id = ${input.farmId1}
          AND f2.id = ${input.farmId2}
          AND f1.user_id = ${ctx.user.id}
          AND f2.user_id = ${ctx.user.id}
          AND f1.location IS NOT NULL
          AND f2.location IS NOT NULL
      `);

      return result.rows[0] || null;
    }),

  /**
   * Get farm boundary as GeoJSON
   */
  getFarmBoundaryGeoJSON: protectedProcedure
    .input(
      z.object({
        boundaryId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db.execute(sql`
        SELECT 
          fb.id,
          fb.name,
          fb.area_hectares,
          fb.perimeter_m,
          ST_AsGeoJSON(fb.boundary)::json as geometry,
          f.name as farm_name
        FROM farm_boundaries fb
        JOIN farms f ON fb.farm_id = f.id
        WHERE fb.id = ${input.boundaryId}
          AND fb.user_id = ${ctx.user.id}
      `);

      if (!result.rows[0]) {
        throw new Error("Boundary not found");
      }

      const row = result.rows[0];
      return {
        type: "Feature",
        geometry: row.geometry,
        properties: {
          id: row.id,
          name: row.name,
          area_hectares: row.area_hectares,
          perimeter_m: row.perimeter_m,
          farm_name: row.farm_name,
        },
      };
    }),

  /**
   * Get all farm boundaries as GeoJSON FeatureCollection
   */
  getAllBoundariesGeoJSON: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db.execute(sql`
      SELECT 
        fb.id,
        fb.name,
        fb.area_hectares,
        fb.perimeter_m,
        ST_AsGeoJSON(fb.boundary)::json as geometry,
        f.name as farm_name
      FROM farm_boundaries fb
      JOIN farms f ON fb.farm_id = f.id
      WHERE fb.user_id = ${ctx.user.id}
      ORDER BY fb.created_at DESC
    `);

    const features = result.rows.map((row) => ({
      type: "Feature",
      geometry: row.geometry,
      properties: {
        id: row.id,
        name: row.name,
        area_hectares: row.area_hectares,
        perimeter_m: row.perimeter_m,
        farm_name: row.farm_name,
      },
    }));

    return {
      type: "FeatureCollection",
      features,
    };
  }),

  /**
   * Import farm boundary from GeoJSON
   */
  importBoundaryFromGeoJSON: protectedProcedure
    .input(
      z.object({
        farmId: z.number(),
        name: z.string().optional(),
        geoJSON: z.object({
          type: z.literal("Polygon"),
          coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { farmId, name, geoJSON } = input;

      // Convert GeoJSON to WKT (Well-Known Text) for PostGIS
      const coordinates = geoJSON.coordinates[0]
        .map((coord) => `${coord[0]} ${coord[1]}`)
        .join(", ");
      const wkt = `POLYGON((${coordinates}))`;

      const result = await db.execute(sql`
        INSERT INTO farm_boundaries (farm_id, user_id, boundary, name)
        VALUES (
          ${farmId},
          ${ctx.user.id},
          ST_GeomFromText(${wkt}, 4326),
          ${name || "Imported Boundary"}
        )
        RETURNING id, area_hectares, perimeter_m
      `);

      return result.rows[0];
    }),

  /**
   * Calculate total farm area for a user
   */
  getTotalFarmArea: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db.execute(sql`
      SELECT 
        COUNT(*) as total_boundaries,
        SUM(area_hectares) as total_area_hectares,
        AVG(area_hectares) as avg_area_hectares,
        MIN(area_hectares) as min_area_hectares,
        MAX(area_hectares) as max_area_hectares
      FROM farm_boundaries
      WHERE user_id = ${ctx.user.id}
    `);

    return result.rows[0];
  }),

  /**
   * Bulk import farm boundaries from GeoJSON FeatureCollection
   */
  bulkImportBoundaries: protectedProcedure
    .input(
      z.object({
        features: z.array(
          z.object({
            type: z.literal("Feature"),
            geometry: z.object({
              type: z.literal("Polygon"),
              coordinates: z.array(z.array(z.array(z.number()))),
            }),
            properties: z.object({
              farm_id: z.number().optional(),
              farm_name: z.string().optional(),
              name: z.string().optional(),
              description: z.string().optional(),
            }),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const imported = [];
      const errors = [];

      for (const feature of input.features) {
        try {
          // Convert GeoJSON coordinates to PostGIS format
          const coordinates = feature.geometry.coordinates[0];
          const wkt = `POLYGON((${coordinates.map(coord => `${coord[0]} ${coord[1]}`).join(", ")}))`;

          // Find farm by ID or name
          let farmId = feature.properties.farm_id;
          if (!farmId && feature.properties.farm_name) {
            const farmResult = await db.execute(sql`
              SELECT id FROM farms 
              WHERE user_id = ${ctx.user.id} 
                AND farm_name = ${feature.properties.farm_name}
              LIMIT 1
            `);
            if (farmResult.rows.length > 0) {
              farmId = farmResult.rows[0].id as number;
            }
          }

          if (!farmId) {
            errors.push({
              feature: feature.properties.farm_name || feature.properties.name || "Unknown",
              error: "Farm not found",
            });
            continue;
          }

          // Insert boundary
          await db.execute(sql`
            INSERT INTO farm_boundaries (farm_id, user_id, boundary, name, description, boundary_type)
            VALUES (
              ${farmId},
              ${ctx.user.id},
              ST_GeomFromText(${wkt}, 4326),
              ${feature.properties.name || null},
              ${feature.properties.description || null},
              'imported'
            )
          `);

          imported.push({
            farm_id: farmId,
            name: feature.properties.name || feature.properties.farm_name,
          });
        } catch (error: unknown) {
          errors.push({
            feature: feature.properties.farm_name || feature.properties.name || "Unknown",
            error: (error instanceof Error ? error.message : String(error)),
          });
        }
      }

      return {
        success: imported.length,
        failed: errors.length,
        imported,
        errors,
      };
    }),

  /**
   * Get spatial analytics - farm density by region
   */
  getFarmDensityByRegion: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db.execute(sql`
      SELECT 
        f.region,
        COUNT(DISTINCT fa.id) as farm_count,
        COUNT(fb.id) as boundary_count,
        SUM(fb.area_hectares) as total_area_hectares,
        AVG(fb.area_hectares) as avg_area_hectares
      FROM farmers f
      LEFT JOIN farms fa ON fa.farmer_id = f.id
      LEFT JOIN farm_boundaries fb ON fb.farm_id = fa.id
      WHERE f.user_id = ${ctx.user.id}
      GROUP BY f.region
      ORDER BY farm_count DESC
    `);

    return result.rows;
  }),

  /**
   * Get spatial analytics - total area by district
   */
  getAreaByDistrict: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db.execute(sql`
      SELECT 
        f.district,
        COUNT(DISTINCT fa.id) as farm_count,
        SUM(fb.area_hectares) as total_area_hectares,
        AVG(fb.area_hectares) as avg_area_hectares,
        MIN(fb.area_hectares) as min_area_hectares,
        MAX(fb.area_hectares) as max_area_hectares
      FROM farmers f
      LEFT JOIN farms fa ON fa.farmer_id = f.id
      LEFT JOIN farm_boundaries fb ON fb.farm_id = fa.id
      WHERE f.user_id = ${ctx.user.id}
      GROUP BY f.district
      ORDER BY total_area_hectares DESC
    `);

    return result.rows;
  }),

  /**
   * Update an existing farm boundary
   */
  updateBoundary: protectedProcedure
    .input(
      z.object({
        boundaryId: z.number(),
        coordinates: z.array(z.array(z.number())), // [[lng, lat], ...]
        name: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Convert coordinates to WKT
      const wkt = `POLYGON((${input.coordinates.map(coord => `${coord[0]} ${coord[1]}`).join(", ")}))`;

      // Update boundary
      await db.execute(sql`
        UPDATE farm_boundaries
        SET 
          boundary = ST_GeomFromText(${wkt}, 4326),
          name = COALESCE(${input.name}, name),
          description = COALESCE(${input.description}, description),
          updated_at = NOW()
        WHERE id = ${input.boundaryId}
          AND user_id = ${ctx.user.id}
      `);

      // Return updated boundary with calculated fields
      const result = await db.execute(sql`
        SELECT 
          id,
          farm_id,
          ST_AsGeoJSON(boundary)::json as geometry,
          area_hectares,
          perimeter_m,
          name,
          description
        FROM farm_boundaries
        WHERE id = ${input.boundaryId}
          AND user_id = ${ctx.user.id}
      `);

      return result.rows[0];
    }),

  /**
   * Detect overlapping farm boundaries
   */
  detectOverlappingBoundaries: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const result = await db.execute(sql`
      SELECT 
        fb1.id as boundary1_id,
        fb1.farm_id as farm1_id,
        f1.farm_name as farm1_name,
        fb2.id as boundary2_id,
        fb2.farm_id as farm2_id,
        f2.farm_name as farm2_name,
        ST_Area(ST_Intersection(fb1.boundary, fb2.boundary)::geography) / 10000 as overlap_area_hectares,
        (ST_Area(ST_Intersection(fb1.boundary, fb2.boundary)::geography) / 
         LEAST(ST_Area(fb1.boundary::geography), ST_Area(fb2.boundary::geography))) * 100 as overlap_percentage
      FROM farm_boundaries fb1
      JOIN farm_boundaries fb2 ON fb1.id < fb2.id
      JOIN farms f1 ON fb1.farm_id = f1.id
      JOIN farms f2 ON fb2.farm_id = f2.id
      WHERE fb1.user_id = ${ctx.user.id}
        AND fb2.user_id = ${ctx.user.id}
        AND ST_Intersects(fb1.boundary, fb2.boundary)
        AND ST_Area(ST_Intersection(fb1.boundary, fb2.boundary)::geography) > 100
      ORDER BY overlap_area_hectares DESC
    `);

    return result.rows;
  }),

  /**
   * Get boundary modification history
   */
  getBoundaryHistory: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Note: This requires adding an audit table for boundary changes
      // For now, return the current boundary with timestamps
      const result = await db.execute(sql`
        SELECT 
          id,
          farm_id,
          area_hectares,
          perimeter_m,
          created_at,
          updated_at,
          boundary_type
        FROM farm_boundaries
        WHERE farm_id = ${input.farmId}
          AND user_id = ${ctx.user.id}
        ORDER BY updated_at DESC
      `);

      return result.rows;
    }),

  // ============================================================================
  // GPS Analytics - Sedona/Lakehouse Integration
  // ============================================================================

  /**
   * Get GPS farm activity from Lakehouse Gold layer (Sedona analytics)
   */
  getGpsFarmActivity: protectedProcedure
    .input(
      z.object({
        farmId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(1000).default(100),
      })
    )
    .query(async ({ input }) => {
      try {
        const { getGPSAnalyticsService } = await import('../services/lakehouse/gps-analytics.js');
        const service = getGPSAnalyticsService();
        return await service.getFarmActivity({
          farmId: input.farmId,
          startDate: input.startDate,
          endDate: input.endDate,
          limit: input.limit,
        });
      } catch (error) {
        logger.warn('[Spatial] GPS farm activity not available:', error);
        return [];
      }
    }),

  /**
   * Get GPS device coverage from Lakehouse Gold layer (Sedona analytics)
   */
  getGpsDeviceCoverage: protectedProcedure
    .input(
      z.object({
        deviceId: z.number().optional(),
        limit: z.number().min(1).max(1000).default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
        const { getGPSAnalyticsService } = await import('../services/lakehouse/gps-analytics.js');
        const service = getGPSAnalyticsService();
        return await service.getDeviceCoverage({
          userId: ctx.user.id,
          deviceId: input.deviceId,
          limit: input.limit,
        });
      } catch (error) {
        logger.warn('[Spatial] GPS device coverage not available:', error);
        return [];
      }
    }),

  /**
   * Get GPS heatmap from Lakehouse Gold layer (Sedona analytics)
   */
  getGpsHeatmap: protectedProcedure
    .input(
      z.object({
        bounds: z.object({
          minLat: z.number(),
          maxLat: z.number(),
          minLon: z.number(),
          maxLon: z.number(),
        }).optional(),
        minIntensity: z.number().optional(),
        limit: z.number().min(1).max(10000).default(1000),
      })
    )
    .query(async ({ input }) => {
      try {
        const { getGPSAnalyticsService } = await import('../services/lakehouse/gps-analytics.js');
        const service = getGPSAnalyticsService();
        return await service.getHeatmap({
          bounds: input.bounds,
          minIntensity: input.minIntensity,
          limit: input.limit,
        });
      } catch (error) {
        logger.warn('[Spatial] GPS heatmap not available:', error);
        return [];
      }
    }),

  /**
   * Get GPS analytics summary from Lakehouse Gold layer
   */
  getGpsAnalyticsSummary: protectedProcedure.query(async () => {
    try {
      const { getGPSAnalyticsService } = await import('../services/lakehouse/gps-analytics.js');
      const service = getGPSAnalyticsService();
      return await service.getSummary();
    } catch (error) {
      logger.warn('[Spatial] GPS analytics summary not available:', error);
      return {
        total_tracks: 0,
        total_devices: 0,
        total_farms_with_activity: 0,
        total_coverage_hectares: 0,
        avg_tracks_per_farm: 0,
        last_updated: null,
      };
    }
  }),

  /**
   * Get top farms by GPS activity from Lakehouse Gold layer
   */
  getTopFarmsByGpsActivity: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(10) }))
    .query(async ({ input }) => {
      try {
        const { getGPSAnalyticsService } = await import('../services/lakehouse/gps-analytics.js');
        const service = getGPSAnalyticsService();
        return await service.getTopFarmsByActivity(input.limit);
      } catch (error) {
        logger.warn('[Spatial] Top farms by GPS activity not available:', error);
        return [];
      }
    }),

  /**
   * Get GPS farm activity time series for a specific farm
   */
  getGpsFarmActivityTimeSeries: protectedProcedure
    .input(
      z.object({
        farmId: z.number(),
        days: z.number().min(1).max(365).default(30),
      })
    )
    .query(async ({ input }) => {
      try {
        const { getGPSAnalyticsService } = await import('../services/lakehouse/gps-analytics.js');
        const service = getGPSAnalyticsService();
        return await service.getFarmActivityTimeSeries(input.farmId, input.days);
      } catch (error) {
        logger.warn('[Spatial] GPS farm activity time series not available:', error);
        return [];
      }
    }),
});
