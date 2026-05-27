/**
 * Conflict Resolution Service for Mobile Offline Sync
 * 
 * Implements sophisticated conflict resolution strategies:
 * - Version vectors for tracking changes
 * - Last-write-wins with timestamp comparison
 * - Field-level merge for non-conflicting changes
 * - Conflict detection and resolution callbacks
 */

export interface VersionVector {
  clientId: string;
  version: number;
  timestamp: number;
}

export interface SyncableEntity {
  id: string;
  version: number;
  updatedAt: string;
  syncedAt?: string;
  localVersion?: number;
  serverVersion?: number;
  conflictStatus?: 'none' | 'pending' | 'resolved' | 'local_wins' | 'server_wins' | 'merged';
}

export interface ConflictInfo<T> {
  entityType: string;
  entityId: string;
  localData: T;
  serverData: T;
  localVersion: number;
  serverVersion: number;
  localTimestamp: number;
  serverTimestamp: number;
  conflictingFields: string[];
}

export type ConflictResolutionStrategy = 'last_write_wins' | 'local_wins' | 'server_wins' | 'merge' | 'manual';

export interface ConflictResolutionResult<T> {
  resolved: boolean;
  strategy: ConflictResolutionStrategy;
  resolvedData: T;
  requiresManualResolution: boolean;
}

class ConflictResolver {
  private clientId: string;
  private conflictCallbacks: Map<string, (conflict: ConflictInfo<any>) => Promise<any>> = new Map();

  constructor() {
    // Generate unique client ID for this device
    this.clientId = this.generateClientId();
  }

  private generateClientId(): string {
    // Use a combination of timestamp and random string for uniqueness
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `mobile-${timestamp}-${random}`;
  }

  getClientId(): string {
    return this.clientId;
  }

  /**
   * Create a new version vector for an entity
   */
  createVersionVector(): VersionVector {
    return {
      clientId: this.clientId,
      version: 1,
      timestamp: Date.now(),
    };
  }

  /**
   * Increment version vector after local change
   */
  incrementVersion(current: VersionVector): VersionVector {
    return {
      clientId: this.clientId,
      version: current.version + 1,
      timestamp: Date.now(),
    };
  }

  /**
   * Detect if there's a conflict between local and server versions
   */
  detectConflict<T extends SyncableEntity>(local: T, server: T): boolean {
    // No conflict if versions match
    if (local.version === server.version) {
      return false;
    }

    // No conflict if local hasn't been modified since last sync
    if (local.localVersion === local.serverVersion) {
      return false;
    }

    // Conflict exists if both local and server have been modified
    const localModified = local.localVersion !== local.serverVersion;
    const serverModified = server.version !== local.serverVersion;

    return localModified && serverModified;
  }

  /**
   * Get list of fields that have conflicting values
   */
  getConflictingFields<T extends object>(local: T, server: T, excludeFields: string[] = ['id', 'version', 'updatedAt', 'syncedAt', 'localVersion', 'serverVersion', 'conflictStatus']): string[] {
    const conflictingFields: string[] = [];
    const localKeys = Object.keys(local) as (keyof T)[];

    for (const key of localKeys) {
      if (excludeFields.includes(key as string)) continue;

      const localValue = local[key];
      const serverValue = server[key];

      // Compare values (handle null/undefined)
      if (JSON.stringify(localValue) !== JSON.stringify(serverValue)) {
        conflictingFields.push(key as string);
      }
    }

    return conflictingFields;
  }

  /**
   * Resolve conflict using specified strategy
   */
  async resolveConflict<T extends SyncableEntity>(
    entityType: string,
    local: T,
    server: T,
    strategy: ConflictResolutionStrategy = 'last_write_wins'
  ): Promise<ConflictResolutionResult<T>> {
    const localTimestamp = new Date(local.updatedAt).getTime();
    const serverTimestamp = new Date(server.updatedAt).getTime();
    const conflictingFields = this.getConflictingFields(local, server);

    // No actual conflict if no fields differ
    if (conflictingFields.length === 0) {
      return {
        resolved: true,
        strategy: 'merge',
        resolvedData: { ...local, version: server.version, serverVersion: server.version },
        requiresManualResolution: false,
      };
    }

    switch (strategy) {
      case 'last_write_wins':
        return this.resolveLastWriteWins(local, server, localTimestamp, serverTimestamp);

      case 'local_wins':
        return {
          resolved: true,
          strategy: 'local_wins',
          resolvedData: { ...local, version: server.version + 1, serverVersion: server.version },
          requiresManualResolution: false,
        };

      case 'server_wins':
        return {
          resolved: true,
          strategy: 'server_wins',
          resolvedData: { ...server, localVersion: server.version, serverVersion: server.version },
          requiresManualResolution: false,
        };

      case 'merge':
        return this.resolveMerge(local, server, conflictingFields);

      case 'manual':
        return {
          resolved: false,
          strategy: 'manual',
          resolvedData: local,
          requiresManualResolution: true,
        };

      default:
        return this.resolveLastWriteWins(local, server, localTimestamp, serverTimestamp);
    }
  }

  /**
   * Last-write-wins resolution based on timestamps
   */
  private resolveLastWriteWins<T extends SyncableEntity>(
    local: T,
    server: T,
    localTimestamp: number,
    serverTimestamp: number
  ): ConflictResolutionResult<T> {
    if (localTimestamp >= serverTimestamp) {
      // Local wins
      return {
        resolved: true,
        strategy: 'last_write_wins',
        resolvedData: { ...local, version: server.version + 1, serverVersion: server.version },
        requiresManualResolution: false,
      };
    } else {
      // Server wins
      return {
        resolved: true,
        strategy: 'last_write_wins',
        resolvedData: { ...server, localVersion: server.version, serverVersion: server.version },
        requiresManualResolution: false,
      };
    }
  }

  /**
   * Merge non-conflicting fields, flag conflicting ones
   */
  private resolveMerge<T extends SyncableEntity>(
    local: T,
    server: T,
    conflictingFields: string[]
  ): ConflictResolutionResult<T> {
    // Start with server data as base
    const merged = { ...server } as T;

    // For each field, use local value if it was modified more recently
    const localTimestamp = new Date(local.updatedAt).getTime();
    const serverTimestamp = new Date(server.updatedAt).getTime();

    // Apply local changes for non-conflicting fields
    const localKeys = Object.keys(local) as (keyof T)[];
    for (const key of localKeys) {
      if (!conflictingFields.includes(key as string)) {
        // Non-conflicting field - use local if modified
        if (local[key] !== undefined) {
          merged[key] = local[key];
        }
      } else {
        // Conflicting field - use last-write-wins for this field
        if (localTimestamp >= serverTimestamp) {
          merged[key] = local[key];
        }
      }
    }

    merged.version = server.version + 1;
    merged.serverVersion = server.version;
    merged.localVersion = server.version + 1;

    return {
      resolved: true,
      strategy: 'merge',
      resolvedData: merged,
      requiresManualResolution: false,
    };
  }

  /**
   * Register a callback for manual conflict resolution
   */
  registerConflictCallback<T>(
    entityType: string,
    callback: (conflict: ConflictInfo<T>) => Promise<T>
  ): void {
    this.conflictCallbacks.set(entityType, callback);
  }

  /**
   * Request manual resolution for a conflict
   */
  async requestManualResolution<T extends SyncableEntity>(
    entityType: string,
    local: T,
    server: T
  ): Promise<T | null> {
    const callback = this.conflictCallbacks.get(entityType);
    if (!callback) {
      console.warn(`[ConflictResolver] No callback registered for ${entityType}`);
      return null;
    }

    const conflictInfo: ConflictInfo<T> = {
      entityType,
      entityId: local.id,
      localData: local,
      serverData: server,
      localVersion: local.localVersion || local.version,
      serverVersion: server.version,
      localTimestamp: new Date(local.updatedAt).getTime(),
      serverTimestamp: new Date(server.updatedAt).getTime(),
      conflictingFields: this.getConflictingFields(local, server),
    };

    return callback(conflictInfo);
  }

  /**
   * Create a conflict log entry for debugging/auditing
   */
  createConflictLog<T extends SyncableEntity>(
    entityType: string,
    local: T,
    server: T,
    resolution: ConflictResolutionResult<T>
  ): object {
    return {
      timestamp: new Date().toISOString(),
      clientId: this.clientId,
      entityType,
      entityId: local.id,
      localVersion: local.version,
      serverVersion: server.version,
      conflictingFields: this.getConflictingFields(local, server),
      strategy: resolution.strategy,
      resolved: resolution.resolved,
      requiresManualResolution: resolution.requiresManualResolution,
    };
  }
}

export const conflictResolver = new ConflictResolver();
