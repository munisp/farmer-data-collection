/**
 * GPS Analytics Service
 * 
 * Reads GPS analytics results from the Lakehouse Gold layer
 * and exposes them to the platform via tRPC endpoints.
 * 
 * Data sources:
 * - gold.gps_farm_activity: Farm activity aggregates from Sedona
 * - gold.gps_device_coverage: Device coverage analysis from Sedona
 * - gold.gps_heatmap: Spatial heatmap data from Sedona
 */

import { getLakehouseClient, type QueryResult } from './lakehouse-client.js';
import { logger } from '../../logger.js';

// ============================================================================
// Types
// ============================================================================

export interface GPSFarmActivity {
  farm_id: number;
  farm_name: string | null;
  boundary_name: string | null;
  activity_date: string;
  total_tracks: number;
  unique_devices: number;
  first_activity: string | null;
  last_activity: string | null;
  avg_speed: number | null;
  tracks_with_activity: number;
  report_generated_at: string;
}

export interface GPSDeviceCoverage {
  device_id: number;
  user_id: number;
  total_tracks: number;
  first_track: string | null;
  last_track: string | null;
  coverage_hectares: number | null;
  coverage_wkt: string | null;
  report_generated_at: string;
}

export interface GPSHeatmapCell {
  grid_lat: number;
  grid_lon: number;
  point_count: number;
  unique_devices: number;
  unique_users: number;
  avg_speed: number | null;
  first_activity: string | null;
  last_activity: string | null;
  intensity: number;
  grid_size: number;
  report_generated_at: string;
}

export interface GPSAnalyticsSummary {
  total_tracks: number;
  total_devices: number;
  total_farms_with_activity: number;
  total_coverage_hectares: number;
  avg_tracks_per_farm: number;
  last_updated: string | null;
}

// ============================================================================
// GPS Analytics Service
// ============================================================================

export class GPSAnalyticsService {
  private client = getLakehouseClient();

  /**
   * Get GPS farm activity data
   */
  async getFarmActivity(options: {
    farmId?: number;
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {}): Promise<GPSFarmActivity[]> {
    try {
      const result = await this.client.readTable<GPSFarmActivity>(
        'gold.gps_farm_activity',
        {
          filter: options.farmId ? `farm_id = ${options.farmId}` : undefined,
          limit: options.limit || 100,
        }
      );

      let data = result.rows;

      // Apply date filters in memory (lakehouse client has limited filter support)
      if (options.startDate) {
        data = data.filter(r => r.activity_date >= options.startDate!);
      }
      if (options.endDate) {
        data = data.filter(r => r.activity_date <= options.endDate!);
      }

      return data;
    } catch (error) {
      logger.warn('[GPS Analytics] Failed to read farm activity from lakehouse:', error);
      return [];
    }
  }

  /**
   * Get GPS device coverage data
   */
  async getDeviceCoverage(options: {
    userId?: number;
    deviceId?: number;
    limit?: number;
  } = {}): Promise<GPSDeviceCoverage[]> {
    try {
      const result = await this.client.readTable<GPSDeviceCoverage>(
        'gold.gps_device_coverage',
        {
          filter: options.userId ? `user_id = ${options.userId}` : undefined,
          limit: options.limit || 100,
        }
      );

      let data = result.rows;

      if (options.deviceId) {
        data = data.filter(r => r.device_id === options.deviceId);
      }

      return data;
    } catch (error) {
      logger.warn('[GPS Analytics] Failed to read device coverage from lakehouse:', error);
      return [];
    }
  }

  /**
   * Get GPS heatmap data
   */
  async getHeatmap(options: {
    bounds?: {
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
    };
    minIntensity?: number;
    limit?: number;
  } = {}): Promise<GPSHeatmapCell[]> {
    try {
      const result = await this.client.readTable<GPSHeatmapCell>(
        'gold.gps_heatmap',
        {
          limit: options.limit || 1000,
        }
      );

      let data = result.rows;

      // Apply bounds filter
      if (options.bounds) {
        const { minLat, maxLat, minLon, maxLon } = options.bounds;
        data = data.filter(r =>
          r.grid_lat >= minLat &&
          r.grid_lat <= maxLat &&
          r.grid_lon >= minLon &&
          r.grid_lon <= maxLon
        );
      }

      // Apply intensity filter
      if (options.minIntensity !== undefined) {
        data = data.filter(r => r.intensity >= options.minIntensity!);
      }

      return data;
    } catch (error) {
      logger.warn('[GPS Analytics] Failed to read heatmap from lakehouse:', error);
      return [];
    }
  }

  /**
   * Get GPS analytics summary
   */
  async getSummary(): Promise<GPSAnalyticsSummary> {
    try {
      const [farmActivity, deviceCoverage] = await Promise.all([
        this.getFarmActivity({ limit: 10000 }),
        this.getDeviceCoverage({ limit: 10000 }),
      ]);

      const totalTracks = farmActivity.reduce((sum, r) => sum + r.total_tracks, 0);
      const uniqueFarms = new Set(farmActivity.map(r => r.farm_id)).size;
      const uniqueDevices = new Set(deviceCoverage.map(r => r.device_id)).size;
      const totalCoverage = deviceCoverage.reduce(
        (sum, r) => sum + (r.coverage_hectares || 0),
        0
      );

      const lastUpdated = farmActivity.length > 0
        ? farmActivity.reduce((latest, r) =>
            r.report_generated_at > latest ? r.report_generated_at : latest,
            farmActivity[0].report_generated_at
          )
        : null;

      return {
        total_tracks: totalTracks,
        total_devices: uniqueDevices,
        total_farms_with_activity: uniqueFarms,
        total_coverage_hectares: totalCoverage,
        avg_tracks_per_farm: uniqueFarms > 0 ? totalTracks / uniqueFarms : 0,
        last_updated: lastUpdated,
      };
    } catch (error) {
      logger.warn('[GPS Analytics] Failed to compute summary:', error);
      return {
        total_tracks: 0,
        total_devices: 0,
        total_farms_with_activity: 0,
        total_coverage_hectares: 0,
        avg_tracks_per_farm: 0,
        last_updated: null,
      };
    }
  }

  /**
   * Get farm activity time series for a specific farm
   */
  async getFarmActivityTimeSeries(
    farmId: number,
    days: number = 30
  ): Promise<{ date: string; tracks: number; devices: number }[]> {
    const activity = await this.getFarmActivity({
      farmId,
      limit: days,
    });

    return activity
      .sort((a, b) => a.activity_date.localeCompare(b.activity_date))
      .map(r => ({
        date: r.activity_date,
        tracks: r.total_tracks,
        devices: r.unique_devices,
      }));
  }

  /**
   * Get top farms by GPS activity
   */
  async getTopFarmsByActivity(limit: number = 10): Promise<{
    farm_id: number;
    farm_name: string | null;
    total_tracks: number;
    unique_devices: number;
    last_activity: string | null;
  }[]> {
    const activity = await this.getFarmActivity({ limit: 10000 });

    // Aggregate by farm
    const farmMap = new Map<number, {
      farm_id: number;
      farm_name: string | null;
      total_tracks: number;
      unique_devices: Set<number>;
      last_activity: string | null;
    }>();

    for (const record of activity) {
      const existing = farmMap.get(record.farm_id);
      if (existing) {
        existing.total_tracks += record.total_tracks;
        // Note: unique_devices is per-day, so we can't accurately aggregate
        // For now, take the max
        if (record.last_activity && (!existing.last_activity || record.last_activity > existing.last_activity)) {
          existing.last_activity = record.last_activity;
        }
      } else {
        farmMap.set(record.farm_id, {
          farm_id: record.farm_id,
          farm_name: record.farm_name,
          total_tracks: record.total_tracks,
          unique_devices: new Set([record.unique_devices]),
          last_activity: record.last_activity,
        });
      }
    }

    return Array.from(farmMap.values())
      .sort((a, b) => b.total_tracks - a.total_tracks)
      .slice(0, limit)
      .map(f => ({
        farm_id: f.farm_id,
        farm_name: f.farm_name,
        total_tracks: f.total_tracks,
        unique_devices: f.unique_devices.size,
        last_activity: f.last_activity,
      }));
  }
}

// Singleton instance
let gpsAnalyticsService: GPSAnalyticsService | null = null;

export function getGPSAnalyticsService(): GPSAnalyticsService {
  if (!gpsAnalyticsService) {
    gpsAnalyticsService = new GPSAnalyticsService();
  }
  return gpsAnalyticsService;
}

export default {
  GPSAnalyticsService,
  getGPSAnalyticsService,
};
