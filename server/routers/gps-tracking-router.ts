/**
 * GPS Tracking tRPC Router
 * Provides endpoints for GPS device management and real-time tracking
 * 
 * Production Features:
 * - Track quality filtering (outlier rejection)
 * - Geofencing for farm boundaries
 * - Redis-based rate limiting per device (with in-memory fallback)
 * - Configurable accuracy thresholds
 * - Security controls (device ownership validation)
 * - Idempotent track recording (duplicate detection via client_id)
 * - GPS ingestion monitoring and metrics
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc-base.js';
import { getDb } from '../db.js';
import { sql, eq, and, desc, gte, lte } from 'drizzle-orm';
import { rateLimiter, GPS_ACCURACY_THRESHOLDS } from '../services/redis-rate-limiter.js';
import { gpsMetrics } from '../services/gps-monitoring.js';
import { logger } from '../logger.js';

// Constants for track quality filtering
const MAX_SPEED_MS = 55.56; // 200 km/h in m/s - reject points faster than this
const DEFAULT_RATE_LIMIT_POINTS_PER_MINUTE = 60; // Max GPS points per device per minute

// Default accuracy threshold (can be overridden per request)
const DEFAULT_ACCURACY_THRESHOLD = GPS_ACCURACY_THRESHOLDS.LOW_PRECISION; // 100m for general tracking

/**
 * Calculate distance between two points using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find farm containing point using PostGIS ST_Contains
 * This is the production-ready implementation using spatial indexing
 */
async function findFarmContainingPointPostGIS(
  db: any,
  userId: number,
  longitude: number,
  latitude: number
): Promise<number | undefined> {
  try {
    // Use PostGIS ST_Contains with farm_boundaries table
    const result = await db.execute(sql`
      SELECT fb.farm_id
      FROM farm_boundaries fb
      WHERE fb.user_id = ${userId}
        AND ST_Contains(
          fb.boundary,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
        )
      ORDER BY fb.area_hectares ASC
      LIMIT 1
    `);
    
    if (result.rows.length > 0) {
      return result.rows[0].farm_id as number;
    }
    return undefined;
  } catch (error) {
    logger.warn('[GPS] PostGIS geofencing failed, falling back to JSON boundaries:', error);
    return undefined;
  }
}

/**
 * Legacy: Check if a point is inside a polygon (ray casting algorithm)
 * Used as fallback when PostGIS boundaries are not available
 */
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

export const gpsTrackingRouter = router({
  /**
   * Register a new GPS device
   */
  registerDevice: protectedProcedure
    .input(
      z.object({
        deviceId: z.string(),
        name: z.string(),
        farmId: z.number().optional(),
        deviceType: z.string().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const result = await db.execute(sql`
        INSERT INTO gps_devices (
          user_id, device_id, name, farm_id, device_type, status, metadata, created_at, updated_at
        ) VALUES (
          ${ctx.user.id}, ${input.deviceId}, ${input.name}, ${input.farmId || null},
          ${input.deviceType || 'smartphone'}, 'active', ${sql.raw(`'${JSON.stringify(input.metadata || {})}'::jsonb`)},
          NOW(), NOW()
        )
        RETURNING id, device_id, name, status
      `);

      return result.rows[0];
    }),

  /**
   * Get all GPS devices for the user
   */
  getDevices: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const result = await db.execute(sql`
      SELECT 
        d.*,
        f.farm_name as farm_name
      FROM gps_devices d
      LEFT JOIN farms f ON d.farm_id = f.id
      WHERE d.user_id = ${ctx.user.id}
      ORDER BY d.last_seen_at DESC NULLS LAST, d.created_at DESC
    `);

    return result.rows;
  }),

  /**
   * Get device details by ID
   */
  getDevice: protectedProcedure
    .input(z.object({ deviceId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const result = await db.execute(sql`
        SELECT 
          d.*,
          f.farm_name as farm_name,
          COUNT(t.id) as track_count
        FROM gps_devices d
        LEFT JOIN farms f ON d.farm_id = f.id
        LEFT JOIN gps_tracks t ON d.id = t.device_id
        WHERE d.id = ${input.deviceId} AND d.user_id = ${ctx.user.id}
        GROUP BY d.id, f.farm_name
      `);

      if (result.rows.length === 0) {
        throw new Error('Device not found');
      }

      return result.rows[0];
    }),

  /**
   * Update device status
   */
  updateDeviceStatus: protectedProcedure
    .input(
      z.object({
        deviceId: z.number(),
        status: z.enum(['active', 'inactive', 'lost', 'maintenance']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      await db.execute(sql`
        UPDATE gps_devices
        SET status = ${input.status}, updated_at = NOW()
        WHERE id = ${input.deviceId} AND user_id = ${ctx.user.id}
      `);

      return { success: true };
    }),

    /**
     * Record GPS track point with quality filtering, geofencing, rate limiting, and duplicate detection
     */
    recordTrack: protectedProcedure
      .input(
        z.object({
          deviceId: z.number(),
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          altitude: z.number().optional(),
          accuracy: z.number().optional(),
          speed: z.number().optional(),
          heading: z.number().optional(),
          farmId: z.number().optional(),
          activity: z.string().optional(),
          notes: z.string().optional(),
          metadata: z.record(z.string(), z.any()).optional(),
          // Client-generated unique ID for idempotency (duplicate detection)
          clientId: z.string().optional(),
          // Configurable accuracy threshold (defaults to 100m for general tracking)
          accuracyThreshold: z.number().min(1).max(500).optional(),
          // Configurable rate limit (defaults to 60 points/minute)
          rateLimit: z.number().min(1).max(120).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        // Record metric
        gpsMetrics.recordTrackReceived();

        // Get configurable thresholds
        const accuracyThreshold = input.accuracyThreshold || DEFAULT_ACCURACY_THRESHOLD;
        const rateLimitPerMinute = input.rateLimit || DEFAULT_RATE_LIMIT_POINTS_PER_MINUTE;

        // 1. Redis-based rate limiting check (with in-memory fallback)
        const rateLimit = await rateLimiter.checkGPSRateLimit(ctx.user.id, input.deviceId, rateLimitPerMinute);
        if (!rateLimit.allowed) {
          gpsMetrics.recordTrackRejected('rate_limit');
          throw new Error(`Rate limit exceeded. Maximum ${rateLimitPerMinute} GPS points per minute per device.`);
        }

        // 2. Duplicate detection via clientId (idempotency)
        if (input.clientId) {
          const duplicateCheck = await db.execute(sql`
            SELECT id FROM gps_tracks 
            WHERE user_id = ${ctx.user.id} 
              AND device_id = ${input.deviceId}
              AND client_id = ${input.clientId}
            LIMIT 1
          `);
          
          if (duplicateCheck.rows.length > 0) {
            gpsMetrics.recordTrackRejected('duplicate');
            logger.info(`[GPS] Duplicate track detected: clientId=${input.clientId}`);
            return {
              id: (duplicateCheck.rows[0] as any).id,
              rejected: false,
              duplicate: true,
              reason: 'Track already recorded (idempotent)',
              rateLimit: { remaining: rateLimit.remaining },
            };
          }
        }

        // 3. Verify device ownership (security control)
        const deviceCheck = await db.execute(sql`
          SELECT id, last_latitude, last_longitude, last_seen_at
          FROM gps_devices
          WHERE id = ${input.deviceId} AND user_id = ${ctx.user.id}
        `);
        
        if (deviceCheck.rows.length === 0) {
          throw new Error('Device not found or access denied');
        }

        const device = deviceCheck.rows[0] as any;

        // 4. Track quality filtering - accuracy check (using configurable threshold)
        if (input.accuracy && input.accuracy > accuracyThreshold) {
          gpsMetrics.recordTrackRejected('accuracy');
          logger.info(`[GPS] Rejected point: accuracy ${input.accuracy}m > ${accuracyThreshold}m threshold`);
          return { 
            id: null, 
            rejected: true, 
            reason: `Accuracy too low: ${input.accuracy}m (threshold: ${accuracyThreshold}m)`,
            rateLimit: { remaining: rateLimit.remaining },
            accuracyThreshold,
          };
        }

        // 5. Track quality filtering - impossible speed check
        if (device.last_latitude && device.last_longitude && device.last_seen_at) {
          const lastLat = parseFloat(device.last_latitude);
          const lastLon = parseFloat(device.last_longitude);
          const lastTime = new Date(device.last_seen_at).getTime();
          const currentTime = Date.now();
          const timeDelta = (currentTime - lastTime) / 1000; // seconds

          if (timeDelta > 0 && timeDelta < 3600) { // Only check if within 1 hour
            const distance = calculateDistance(lastLat, lastLon, input.latitude, input.longitude);
            const impliedSpeed = distance / timeDelta; // m/s

            if (impliedSpeed > MAX_SPEED_MS) {
              gpsMetrics.recordTrackRejected('speed');
              logger.info(`[GPS] Rejected point: implied speed ${(impliedSpeed * 3.6).toFixed(1)} km/h > 200 km/h threshold`);
              return { 
                id: null, 
                rejected: true, 
                reason: `Impossible speed: ${(impliedSpeed * 3.6).toFixed(1)} km/h`,
                rateLimit: { remaining: rateLimit.remaining }
              };
            }
          }
        }

        // 6. Geofencing - auto-detect farm from boundaries using PostGIS
        let detectedFarmId = input.farmId;
        let postgisUsed = false;
        
        if (!detectedFarmId) {
          // First try PostGIS-based geofencing (production-ready with spatial index)
          try {
            detectedFarmId = await findFarmContainingPointPostGIS(
              db, 
              ctx.user.id, 
              input.longitude, 
              input.latitude
            );
            postgisUsed = true;
            gpsMetrics.recordPostgisQuery(true);
          } catch (error) {
            gpsMetrics.recordPostgisQuery(false);
          }
          
          // Fallback to JSON boundary_coordinates if PostGIS didn't find a match
          if (!detectedFarmId) {
            const farmsResult = await db.execute(sql`
              SELECT id, boundary_coordinates
              FROM farms
              WHERE user_id = ${ctx.user.id} 
                AND boundary_coordinates IS NOT NULL
                AND status = 'active'
            `);

            for (const farm of farmsResult.rows as any[]) {
              if (farm.boundary_coordinates) {
                try {
                  const boundary = typeof farm.boundary_coordinates === 'string' 
                    ? JSON.parse(farm.boundary_coordinates) 
                    : farm.boundary_coordinates;
                  
                  if (Array.isArray(boundary) && boundary.length >= 3) {
                    const polygon = boundary.map((coord: any) => [coord.lng || coord[0], coord.lat || coord[1]]) as [number, number][];
                    if (pointInPolygon([input.longitude, input.latitude], polygon)) {
                      detectedFarmId = farm.id;
                      break;
                    }
                  }
                } catch (e) {
                  // Skip invalid boundary data
                }
              }
            }
          }
        }

        // 7. Record track point with client_id for idempotency
        const trackResult = await db.execute(sql`
          INSERT INTO gps_tracks (
            user_id, device_id, farm_id, latitude, longitude,
            altitude, accuracy, speed, heading, timestamp,
            activity, notes, metadata, client_id, created_at
          ) VALUES (
            ${ctx.user.id}, ${input.deviceId}, ${detectedFarmId || null},
            ${input.latitude}, ${input.longitude},
            ${input.altitude || null}, ${input.accuracy || null},
            ${input.speed || null}, ${input.heading || null}, NOW(),
            ${input.activity || null}, ${input.notes || null},
            ${sql.raw(`'${JSON.stringify(input.metadata || {})}'::jsonb`)},
            ${input.clientId || null}, NOW()
          )
          RETURNING id, timestamp
        `);

        // 8. Update device last seen location
        await db.execute(sql`
          UPDATE gps_devices
          SET 
            last_latitude = ${input.latitude},
            last_longitude = ${input.longitude},
            last_altitude = ${input.altitude || null},
            last_accuracy = ${input.accuracy || null},
            last_seen_at = NOW(),
            updated_at = NOW()
          WHERE id = ${input.deviceId} AND user_id = ${ctx.user.id}
        `);

        // Record success metric
        gpsMetrics.recordTrackAccepted(detectedFarmId);

        return { 
          ...trackResult.rows[0], 
          rejected: false,
          duplicate: false,
          detectedFarmId,
          postgisUsed,
          rateLimit: { remaining: rateLimit.remaining }
        };
      }),

  /**
   * Get GPS tracks for a device
   */
  getDeviceTracks: protectedProcedure
    .input(
      z.object({
        deviceId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(1000).default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      let query = sql`
        SELECT 
          t.*,
          f.farm_name as farm_name
        FROM gps_tracks t
        LEFT JOIN farms f ON t.farm_id = f.id
        WHERE t.device_id = ${input.deviceId} AND t.user_id = ${ctx.user.id}
      `;

      if (input.startDate) {
        query = sql`${query} AND t.timestamp >= ${input.startDate}::timestamp`;
      }

      if (input.endDate) {
        query = sql`${query} AND t.timestamp <= ${input.endDate}::timestamp`;
      }

      query = sql`${query} ORDER BY t.timestamp DESC LIMIT ${input.limit}`;

      const result = await db.execute(query);
      return result.rows;
    }),

  /**
   * Get GPS tracks for a farm
   */
  getFarmTracks: protectedProcedure
    .input(
      z.object({
        farmId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().min(1).max(1000).default(100),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      let query = sql`
        SELECT 
          t.*,
          d.name as device_name,
          d.device_type
        FROM gps_tracks t
        JOIN gps_devices d ON t.device_id = d.id
        WHERE t.farm_id = ${input.farmId} AND t.user_id = ${ctx.user.id}
      `;

      if (input.startDate) {
        query = sql`${query} AND t.timestamp >= ${input.startDate}::timestamp`;
      }

      if (input.endDate) {
        query = sql`${query} AND t.timestamp <= ${input.endDate}::timestamp`;
      }

      query = sql`${query} ORDER BY t.timestamp DESC LIMIT ${input.limit}`;

      const result = await db.execute(query);
      return result.rows;
    }),

  /**
   * Get GPS track statistics
   */
  getTrackStatistics: protectedProcedure
    .input(
      z.object({
        deviceId: z.number().optional(),
        farmId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      let whereClause = sql`user_id = ${ctx.user.id}`;

      if (input.deviceId) {
        whereClause = sql`${whereClause} AND device_id = ${input.deviceId}`;
      }

      if (input.farmId) {
        whereClause = sql`${whereClause} AND farm_id = ${input.farmId}`;
      }

      if (input.startDate) {
        whereClause = sql`${whereClause} AND timestamp >= ${input.startDate}::timestamp`;
      }

      if (input.endDate) {
        whereClause = sql`${whereClause} AND timestamp <= ${input.endDate}::timestamp`;
      }

      const result = await db.execute(sql`
        SELECT 
          COUNT(*) as total_points,
          MIN(timestamp) as first_track,
          MAX(timestamp) as last_track,
          AVG(accuracy) as avg_accuracy,
          AVG(speed) as avg_speed,
          MAX(speed) as max_speed,
          COUNT(DISTINCT DATE(timestamp)) as days_tracked,
          COUNT(DISTINCT device_id) as devices_used
        FROM gps_tracks
        WHERE ${whereClause}
      `);

      return result.rows[0];
    }),

  /**
   * Delete GPS device
   */
  deleteDevice: protectedProcedure
    .input(z.object({ deviceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Delete associated tracks first
      await db.execute(sql`
        DELETE FROM gps_tracks
        WHERE device_id = ${input.deviceId} AND user_id = ${ctx.user.id}
      `);

      // Delete device
      await db.execute(sql`
        DELETE FROM gps_devices
        WHERE id = ${input.deviceId} AND user_id = ${ctx.user.id}
      `);

      return { success: true };
    }),

  /**
   * Get available accuracy thresholds for GPS tracking
   */
  getAccuracyThresholds: protectedProcedure.query(() => {
    return {
      thresholds: GPS_ACCURACY_THRESHOLDS,
      default: DEFAULT_ACCURACY_THRESHOLD,
      recommendations: {
        boundaryCapture: GPS_ACCURACY_THRESHOLDS.HIGH_PRECISION,
        preciseTracking: GPS_ACCURACY_THRESHOLDS.GOOD,
        generalTracking: GPS_ACCURACY_THRESHOLDS.STANDARD,
        roughMovement: GPS_ACCURACY_THRESHOLDS.LOW_PRECISION,
      },
    };
  }),

  /**
   * Get rate limit status for a device
   */
  getRateLimitStatus: protectedProcedure
    .input(z.object({ deviceId: z.number() }))
    .query(async ({ input, ctx }) => {
      const status = await rateLimiter.getRateLimitStatus(
        `gps:${ctx.user.id}:${input.deviceId}`,
        { windowMs: 60000, maxRequests: DEFAULT_RATE_LIMIT_POINTS_PER_MINUTE }
      );
      
      return {
        ...status,
        limit: DEFAULT_RATE_LIMIT_POINTS_PER_MINUTE,
        windowMs: 60000,
        isRedisConnected: rateLimiter.isRedisConnected(),
      };
    }),

});
