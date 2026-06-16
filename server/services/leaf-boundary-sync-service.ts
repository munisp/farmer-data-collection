/**
 * Leaf.io Field Boundary Management Integration Service
 * 
 * Provides bidirectional sync between the platform and Leaf.io's unified
 * field boundary management API. Leaf.io aggregates boundaries from:
 * - John Deere Operations Center
 * - Climate FieldView
 * - CNH (Case IH, New Holland)
 * - AGCO (Fendt, Massey Ferguson)
 * - Trimble Ag Software
 * - And other OEM platforms
 * 
 * This service enables:
 * - Pull boundaries from farmer's existing equipment/platforms
 * - Push locally-created boundaries to connected systems
 * - Keep boundaries in sync across all platforms
 * 
 * @see https://withleaf.io/products/field-boundary-management/
 */

import { sql } from 'drizzle-orm';
import { logger } from '../logger.js';

// Leaf.io API configuration
const LEAF_API_BASE_URL = process.env.LEAF_API_URL || 'https://api.withleaf.io/services';
const LEAF_API_KEY = process.env.LEAF_API_KEY || '';
const LEAF_API_VERSION = 'v2';

// Sync configuration
const SYNC_BATCH_SIZE = 50;
const SYNC_CONFLICT_STRATEGY = process.env.LEAF_CONFLICT_STRATEGY || 'local_wins'; // local_wins, leaf_wins, newest_wins

/**
 * Leaf.io Field/Boundary representation
 */
export interface LeafField {
  id: string;
  name: string;
  providerName: string; // e.g., "JohnDeere", "ClimateFieldView"
  providerFieldId: string;
  organizationId: string;
  farmId?: string;
  boundary: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  area: {
    value: number;
    unit: string; // "ha" or "ac"
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Leaf.io API response for listing fields
 */
export interface LeafFieldsResponse {
  fields: LeafField[];
  page: number;
  totalPages: number;
  totalCount: number;
}

/**
 * Local boundary with Leaf.io sync metadata
 */
export interface SyncedBoundary {
  id: number;
  farmId: number;
  userId: number;
  name: string;
  areaHectares: number;
  sourceSystem: 'local' | 'leaf' | 'john_deere' | 'climate_fieldview' | 'cnh' | 'agco' | 'trimble';
  externalId: string | null;
  externalUpdatedAt: Date | null;
  syncStatus: 'local_only' | 'synced' | 'pending_push' | 'pending_pull' | 'conflict';
  captureMethod: 'smartphone' | 'rtk_rover' | 'survey' | 'imported';
  isRtkCalibrated: boolean;
}

/**
 * Sync result for a single boundary
 */
export interface BoundarySyncResult {
  boundaryId: number;
  action: 'created' | 'updated' | 'skipped' | 'conflict';
  source: 'local' | 'leaf';
  message: string;
}

/**
 * Leaf.io Boundary Sync Service
 */
export class LeafBoundarySyncService {
  private apiKey: string;
  private baseUrl: string;
  private isConfigured: boolean;

  constructor() {
    this.apiKey = LEAF_API_KEY;
    this.baseUrl = `${LEAF_API_BASE_URL}/${LEAF_API_VERSION}`;
    this.isConfigured = !!this.apiKey;
    
    if (!this.isConfigured) {
      logger.warn('[Leaf.io] API key not configured - sync features will use mock data');
    }
  }

  /**
   * Check if Leaf.io integration is configured
   */
  isEnabled(): boolean {
    return this.isConfigured;
  }

  /**
   * Make authenticated request to Leaf.io API
   */
  private async leafRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    if (!this.isConfigured) {
      throw new Error('Leaf.io API key not configured');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Leaf.io API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /**
   * List all fields/boundaries from Leaf.io for a user's connected accounts
   */
  async listLeafFields(leafUserId: string, page: number = 1): Promise<LeafFieldsResponse> {
    if (!this.isConfigured) {
      // Return mock data when not configured
      return this.getMockLeafFields();
    }

    return this.leafRequest<LeafFieldsResponse>(
      `/users/${leafUserId}/fields?page=${page}&size=${SYNC_BATCH_SIZE}`
    );
  }

  /**
   * Get a specific field from Leaf.io
   */
  async getLeafField(leafUserId: string, fieldId: string): Promise<LeafField> {
    if (!this.isConfigured) {
      const mock = this.getMockLeafFields();
      const field = mock.fields.find(f => f.id === fieldId);
      if (!field) throw new Error('Field not found');
      return field;
    }

    return this.leafRequest<LeafField>(`/users/${leafUserId}/fields/${fieldId}`);
  }

  /**
   * Create a new field in Leaf.io
   */
  async createLeafField(
    leafUserId: string,
    boundary: {
      name: string;
      geometry: { type: 'Polygon'; coordinates: number[][][] };
    }
  ): Promise<LeafField> {
    if (!this.isConfigured) {
      // Return mock created field
      return {
        id: `leaf-${Date.now()}`,
        name: boundary.name,
        providerName: 'Manual',
        providerFieldId: `manual-${Date.now()}`,
        organizationId: leafUserId,
        boundary: boundary.geometry,
        area: { value: 10, unit: 'ha' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    return this.leafRequest<LeafField>(
      `/users/${leafUserId}/fields`,
      'POST',
      {
        name: boundary.name,
        boundary: boundary.geometry,
      }
    );
  }

  /**
   * Update a field boundary in Leaf.io
   */
  async updateLeafField(
    leafUserId: string,
    fieldId: string,
    boundary: {
      name?: string;
      geometry?: { type: 'Polygon'; coordinates: number[][][] };
    }
  ): Promise<LeafField> {
    if (!this.isConfigured) {
      const mock = this.getMockLeafFields();
      const field = mock.fields.find(f => f.id === fieldId);
      if (!field) throw new Error('Field not found');
      return { ...field, ...boundary, updatedAt: new Date().toISOString() };
    }

    return this.leafRequest<LeafField>(
      `/users/${leafUserId}/fields/${fieldId}`,
      'PUT',
      boundary
    );
  }

  /**
   * Sync boundaries from Leaf.io to local PostGIS database
   * 
   * @param db Database connection
   * @param userId Local user ID
   * @param leafUserId Leaf.io user/organization ID
   * @returns Array of sync results
   */
  async syncFromLeaf(
    db: any,
    userId: number,
    leafUserId: string
  ): Promise<BoundarySyncResult[]> {
    const results: BoundarySyncResult[] = [];
    
    try {
      // Fetch all fields from Leaf.io
      const leafResponse = await this.listLeafFields(leafUserId);
      
      for (const leafField of leafResponse.fields) {
        try {
          // Check if we already have this boundary
          const existing = await db.execute(sql`
            SELECT id, updated_at, sync_status
            FROM farm_boundaries
            WHERE user_id = ${userId} AND external_id = ${leafField.id}
            LIMIT 1
          `);

          if (existing.rows.length > 0) {
            const localBoundary = existing.rows[0];
            const leafUpdated = new Date(leafField.updatedAt);
            const localUpdated = new Date(localBoundary.updated_at);

            // Check for conflicts
            if (localBoundary.sync_status === 'pending_push') {
              // Local changes pending - conflict
              results.push({
                boundaryId: localBoundary.id,
                action: 'conflict',
                source: 'leaf',
                message: `Conflict: local changes pending for ${leafField.name}`,
              });
              
              await db.execute(sql`
                UPDATE farm_boundaries
                SET sync_status = 'conflict'
                WHERE id = ${localBoundary.id}
              `);
              continue;
            }

            // Update if Leaf version is newer
            if (leafUpdated > localUpdated) {
              await this.updateLocalBoundaryFromLeaf(db, localBoundary.id, leafField);
              results.push({
                boundaryId: localBoundary.id,
                action: 'updated',
                source: 'leaf',
                message: `Updated ${leafField.name} from ${leafField.providerName}`,
              });
            } else {
              results.push({
                boundaryId: localBoundary.id,
                action: 'skipped',
                source: 'leaf',
                message: `${leafField.name} is up to date`,
              });
            }
          } else {
            // Create new local boundary from Leaf
            const newBoundaryId = await this.createLocalBoundaryFromLeaf(db, userId, leafField);
            results.push({
              boundaryId: newBoundaryId,
              action: 'created',
              source: 'leaf',
              message: `Imported ${leafField.name} from ${leafField.providerName}`,
            });
          }
        } catch (error: unknown) {
          logger.error(`[Leaf.io] Error syncing field ${leafField.id}:`, error);
          results.push({
            boundaryId: 0,
            action: 'skipped',
            source: 'leaf',
            message: `Error syncing ${leafField.name}: ${(error instanceof Error ? error.message : String(error))}`,
          });
        }
      }
    } catch (error: unknown) {
      logger.error('[Leaf.io] Error fetching fields:', error);
      throw error;
    }

    return results;
  }

  /**
   * Push local boundaries to Leaf.io
   */
  async syncToLeaf(
    db: any,
    userId: number,
    leafUserId: string
  ): Promise<BoundarySyncResult[]> {
    const results: BoundarySyncResult[] = [];

    try {
      // Get local boundaries that need to be pushed
      const localBoundaries = await db.execute(sql`
        SELECT 
          id, farm_id, name, 
          ST_AsGeoJSON(boundary)::json as geometry,
          area_hectares, external_id, sync_status
        FROM farm_boundaries
        WHERE user_id = ${userId}
          AND (sync_status = 'local_only' OR sync_status = 'pending_push')
      `);

      for (const boundary of localBoundaries.rows) {
        try {
          if (boundary.external_id) {
            // Update existing Leaf field
            await this.updateLeafField(leafUserId, boundary.external_id, {
              name: boundary.name,
              geometry: boundary.geometry,
            });

            await db.execute(sql`
              UPDATE farm_boundaries
              SET sync_status = 'synced', updated_at = NOW()
              WHERE id = ${boundary.id}
            `);

            results.push({
              boundaryId: boundary.id,
              action: 'updated',
              source: 'local',
              message: `Pushed updates for ${boundary.name} to Leaf.io`,
            });
          } else {
            // Create new Leaf field
            const leafField = await this.createLeafField(leafUserId, {
              name: boundary.name || `Field ${boundary.id}`,
              geometry: boundary.geometry,
            });

            await db.execute(sql`
              UPDATE farm_boundaries
              SET 
                external_id = ${leafField.id},
                source_system = 'leaf',
                sync_status = 'synced',
                external_updated_at = ${leafField.updatedAt},
                updated_at = NOW()
              WHERE id = ${boundary.id}
            `);

            results.push({
              boundaryId: boundary.id,
              action: 'created',
              source: 'local',
              message: `Created ${boundary.name} in Leaf.io`,
            });
          }
        } catch (error: unknown) {
          logger.error(`[Leaf.io] Error pushing boundary ${boundary.id}:`, error);
          results.push({
            boundaryId: boundary.id,
            action: 'skipped',
            source: 'local',
            message: `Error pushing ${boundary.name}: ${(error instanceof Error ? error.message : String(error))}`,
          });
        }
      }
    } catch (error: unknown) {
      logger.error('[Leaf.io] Error pushing boundaries:', error);
      throw error;
    }

    return results;
  }

  /**
   * Full bidirectional sync
   */
  async fullSync(
    db: any,
    userId: number,
    leafUserId: string
  ): Promise<{ fromLeaf: BoundarySyncResult[]; toLeaf: BoundarySyncResult[] }> {
    // Pull from Leaf first
    const fromLeaf = await this.syncFromLeaf(db, userId, leafUserId);
    
    // Then push local changes
    const toLeaf = await this.syncToLeaf(db, userId, leafUserId);

    return { fromLeaf, toLeaf };
  }

  /**
   * Create local boundary from Leaf.io field
   */
  private async createLocalBoundaryFromLeaf(
    db: any,
    userId: number,
    leafField: LeafField
  ): Promise<number> {
    // First, find or create a farm for this boundary
    const farmResult = await db.execute(sql`
      SELECT id FROM farms WHERE user_id = ${userId} LIMIT 1
    `);

    let farmId: number;
    if (farmResult.rows.length > 0) {
      farmId = farmResult.rows[0].id;
    } else {
      // Create a default farm
      const newFarm = await db.execute(sql`
        INSERT INTO farms (user_id, farm_name, created_at, updated_at)
        VALUES (${userId}, 'Imported Farm', NOW(), NOW())
        RETURNING id
      `);
      farmId = newFarm.rows[0].id;
    }

    // Insert the boundary
    const result = await db.execute(sql`
      INSERT INTO farm_boundaries (
        farm_id, user_id, name,
        boundary,
        area_hectares,
        source_system, external_id, external_updated_at, sync_status,
        capture_method, is_rtk_calibrated,
        created_at, updated_at
      ) VALUES (
        ${farmId}, ${userId}, ${leafField.name},
        ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(leafField.boundary)}), 4326),
        ${leafField.area.unit === 'ha' ? leafField.area.value : leafField.area.value * 0.404686},
        ${this.mapProviderToSourceSystem(leafField.providerName)}, ${leafField.id}, ${leafField.updatedAt}, 'synced',
        'imported', false,
        NOW(), NOW()
      )
      RETURNING id
    `);

    return result.rows[0].id;
  }

  /**
   * Update local boundary from Leaf.io field
   */
  private async updateLocalBoundaryFromLeaf(
    db: any,
    boundaryId: number,
    leafField: LeafField
  ): Promise<void> {
    await db.execute(sql`
      UPDATE farm_boundaries
      SET
        name = ${leafField.name},
        boundary = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(leafField.boundary)}), 4326),
        area_hectares = ${leafField.area.unit === 'ha' ? leafField.area.value : leafField.area.value * 0.404686},
        external_updated_at = ${leafField.updatedAt},
        sync_status = 'synced',
        updated_at = NOW()
      WHERE id = ${boundaryId}
    `);
  }

  /**
   * Map Leaf.io provider name to our source_system enum
   */
  private mapProviderToSourceSystem(providerName: string): string {
    const mapping: Record<string, string> = {
      'JohnDeere': 'john_deere',
      'ClimateFieldView': 'climate_fieldview',
      'CNH': 'cnh',
      'AGCO': 'agco',
      'Trimble': 'trimble',
      'Manual': 'leaf',
    };
    return mapping[providerName] || 'leaf';
  }

  /**
   * Get mock Leaf.io fields for demo/development
   */
  private getMockLeafFields(): LeafFieldsResponse {
    return {
      fields: [
        {
          id: 'leaf-field-001',
          name: 'North Field - John Deere',
          providerName: 'JohnDeere',
          providerFieldId: 'jd-12345',
          organizationId: 'org-001',
          boundary: {
            type: 'Polygon',
            coordinates: [[[3.3792, 6.5244], [3.3892, 6.5244], [3.3892, 6.5344], [3.3792, 6.5344], [3.3792, 6.5244]]],
          },
          area: { value: 45.2, unit: 'ha' },
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-12-20T14:30:00Z',
        },
        {
          id: 'leaf-field-002',
          name: 'South Field - Climate FieldView',
          providerName: 'ClimateFieldView',
          providerFieldId: 'cfv-67890',
          organizationId: 'org-001',
          boundary: {
            type: 'Polygon',
            coordinates: [[[3.3692, 6.5144], [3.3792, 6.5144], [3.3792, 6.5244], [3.3692, 6.5244], [3.3692, 6.5144]]],
          },
          area: { value: 38.5, unit: 'ha' },
          createdAt: '2024-02-20T09:00:00Z',
          updatedAt: '2024-12-18T11:15:00Z',
        },
        {
          id: 'leaf-field-003',
          name: 'East Block - Trimble',
          providerName: 'Trimble',
          providerFieldId: 'trim-11111',
          organizationId: 'org-001',
          boundary: {
            type: 'Polygon',
            coordinates: [[[3.3992, 6.5244], [3.4092, 6.5244], [3.4092, 6.5344], [3.3992, 6.5344], [3.3992, 6.5244]]],
          },
          area: { value: 52.1, unit: 'ha' },
          createdAt: '2024-03-10T08:00:00Z',
          updatedAt: '2024-12-22T16:45:00Z',
        },
      ],
      page: 1,
      totalPages: 1,
      totalCount: 3,
    };
  }
}

// Singleton instance
export const leafBoundarySyncService = new LeafBoundarySyncService();

/**
 * RTK GPS Configuration and Utilities
 * 
 * RTK (Real-Time Kinematic) GPS provides centimeter-level accuracy
 * compared to 3-30m from standard smartphone GPS.
 */
export const RTK_GPS_CONFIG = {
  // Accuracy thresholds (meters)
  RTK_FIXED_THRESHOLD: 0.05,      // 5cm - RTK fixed solution
  RTK_FLOAT_THRESHOLD: 0.5,       // 50cm - RTK float solution
  DGPS_THRESHOLD: 1.0,            // 1m - Differential GPS
  STANDARD_GPS_THRESHOLD: 10.0,   // 10m - Standard GPS
  LOW_ACCURACY_THRESHOLD: 30.0,   // 30m - Low accuracy (current default)

  // Device types
  DEVICE_TYPES: {
    RTK_ROVER: 'rtk_rover',
    RTK_BASE_STATION: 'rtk_base_station',
    TRACTOR_DISPLAY: 'tractor_display',
    HANDHELD_RTK: 'handheld_rtk',
    SMARTPHONE: 'smartphone',
    DRONE: 'drone',
  },

  // Fix status values
  FIX_STATUS: {
    RTK_FIXED: 'rtk_fixed',       // Best accuracy (1-3cm)
    RTK_FLOAT: 'rtk_float',       // Good accuracy (10-50cm)
    DGPS: 'dgps',                 // Differential GPS (0.5-1m)
    AUTONOMOUS: 'autonomous',     // Standard GPS (3-10m)
    NO_FIX: 'no_fix',            // No GPS fix
  },
};

/**
 * Determine capture method based on accuracy
 */
export function determineCaptureMethod(accuracyMeters: number): string {
  if (accuracyMeters <= RTK_GPS_CONFIG.RTK_FIXED_THRESHOLD) {
    return 'rtk_rover';
  } else if (accuracyMeters <= RTK_GPS_CONFIG.RTK_FLOAT_THRESHOLD) {
    return 'rtk_rover';
  } else if (accuracyMeters <= RTK_GPS_CONFIG.DGPS_THRESHOLD) {
    return 'survey';
  } else {
    return 'smartphone';
  }
}

/**
 * Check if accuracy qualifies as RTK-calibrated
 */
export function isRtkCalibrated(accuracyMeters: number): boolean {
  return accuracyMeters <= RTK_GPS_CONFIG.RTK_FLOAT_THRESHOLD;
}

/**
 * Get recommended accuracy threshold for boundary capture
 */
export function getRecommendedAccuracyThreshold(deviceType: string): number {
  switch (deviceType) {
    case RTK_GPS_CONFIG.DEVICE_TYPES.RTK_ROVER:
    case RTK_GPS_CONFIG.DEVICE_TYPES.HANDHELD_RTK:
      return RTK_GPS_CONFIG.RTK_FLOAT_THRESHOLD;
    case RTK_GPS_CONFIG.DEVICE_TYPES.TRACTOR_DISPLAY:
      return RTK_GPS_CONFIG.DGPS_THRESHOLD;
    case RTK_GPS_CONFIG.DEVICE_TYPES.DRONE:
      return RTK_GPS_CONFIG.STANDARD_GPS_THRESHOLD;
    default:
      return RTK_GPS_CONFIG.LOW_ACCURACY_THRESHOLD;
  }
}
