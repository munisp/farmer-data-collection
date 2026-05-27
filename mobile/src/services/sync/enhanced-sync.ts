/**
 * Enhanced Sync Service with Conflict Resolution
 * 
 * Features:
 * - Version-based sync similar to web PWA
 * - Conflict detection and resolution
 * - Batch sync with transaction support
 * - Background sync scheduling
 * - Sync status tracking and notifications
 */

import NetInfo from '@react-native-community/netinfo';
import { database } from '../database';
import { apiClient } from '../api/client';
import { conflictResolver, ConflictResolutionStrategy, SyncableEntity } from './conflict-resolver';
import { MAX_RETRY_ATTEMPTS } from '@/utils/constants';

export interface SyncStatus {
  syncing: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  conflictCount: number;
  error?: string;
  progress?: {
    total: number;
    completed: number;
    entityType: string;
  };
}

export interface SyncOptions {
  strategy: ConflictResolutionStrategy;
  batchSize: number;
  retryOnConflict: boolean;
  syncDeleted: boolean;
}

const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  strategy: 'last_write_wins',
  batchSize: 50,
  retryOnConflict: true,
  syncDeleted: true,
};

class EnhancedSyncService {
  private isSyncing = false;
  private lastSyncAt: string | null = null;
  private pendingConflicts: Map<string, any> = new Map();
  private statusCallbacks: Array<(status: SyncStatus) => void> = [];
  private syncInterval: NodeJS.Timeout | null = null;

  /**
   * Start background sync with specified interval
   */
  startBackgroundSync(intervalMs: number = 5 * 60 * 1000): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      const netInfo = await NetInfo.fetch();
      if (netInfo.isConnected) {
        await this.syncAll();
      }
    }, intervalMs);

    console.log(`[EnhancedSync] Background sync started with ${intervalMs}ms interval`);
  }

  /**
   * Stop background sync
   */
  stopBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[EnhancedSync] Background sync stopped');
    }
  }

  /**
   * Perform full sync of all entities
   */
  async syncAll(options: Partial<SyncOptions> = {}): Promise<void> {
    if (this.isSyncing) {
      console.log('[EnhancedSync] Already syncing, skipping...');
      return;
    }

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      console.log('[EnhancedSync] No internet connection, skipping...');
      this.notifyStatus({ syncing: false, error: 'No internet connection' });
      return;
    }

    const syncOptions = { ...DEFAULT_SYNC_OPTIONS, ...options };
    this.isSyncing = true;
    this.notifyStatus({ syncing: true });

    try {
      // Sync each entity type
      await this.syncEntityType('farmer', syncOptions);
      await this.syncEntityType('farm', syncOptions);
      await this.syncEntityType('harvest', syncOptions);
      await this.syncEntityType('expense', syncOptions);
      await this.syncEntityType('loan_application', syncOptions);

      // Process any remaining items in sync queue
      await this.processSyncQueue(syncOptions);

      this.lastSyncAt = new Date().toISOString();
      console.log('[EnhancedSync] Sync completed successfully');
      this.notifyStatus({ syncing: false, lastSyncAt: this.lastSyncAt });
    } catch (error) {
      console.error('[EnhancedSync] Sync failed:', error);
      this.notifyStatus({ syncing: false, error: String(error) });
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync a specific entity type with conflict resolution
   */
  private async syncEntityType(
    entityType: string,
    options: SyncOptions
  ): Promise<void> {
    console.log(`[EnhancedSync] Syncing ${entityType}...`);

    // Get unsynced local entities
    const unsyncedLocal = await this.getUnsyncedEntities(entityType);
    
    // Get server changes since last sync
    const serverChanges = await this.getServerChanges(entityType);

    const total = unsyncedLocal.length + serverChanges.length;
    let completed = 0;

    // Push local changes to server
    for (const local of unsyncedLocal) {
      try {
        // Check if server has a newer version
        const serverVersion = await this.getServerEntity(entityType, local.id);
        
        if (serverVersion && conflictResolver.detectConflict(local, serverVersion)) {
          // Resolve conflict
          const resolution = await conflictResolver.resolveConflict(
            entityType,
            local,
            serverVersion,
            options.strategy
          );

          if (resolution.requiresManualResolution) {
            this.pendingConflicts.set(`${entityType}:${local.id}`, {
              local,
              server: serverVersion,
            });
            console.log(`[EnhancedSync] Conflict requires manual resolution: ${entityType}:${local.id}`);
          } else {
            // Apply resolved data
            await this.pushToServer(entityType, resolution.resolvedData);
            await this.updateLocalEntity(entityType, resolution.resolvedData);
            console.log(`[EnhancedSync] Conflict resolved for ${entityType}:${local.id} using ${resolution.strategy}`);
          }
        } else {
          // No conflict, push to server
          await this.pushToServer(entityType, local);
          await this.markAsSynced(entityType, local.id);
        }

        completed++;
        this.notifyStatus({
          syncing: true,
          progress: { total, completed, entityType },
        });
      } catch (error) {
        console.error(`[EnhancedSync] Failed to sync ${entityType}:${local.id}:`, error);
        await this.addToSyncQueue(entityType, local, 'push');
      }
    }

    // Pull server changes to local
    for (const server of serverChanges) {
      try {
        const localVersion = await this.getLocalEntity(entityType, server.id);
        
        if (localVersion) {
          if (conflictResolver.detectConflict(localVersion, server)) {
            // Resolve conflict
            const resolution = await conflictResolver.resolveConflict(
              entityType,
              localVersion,
              server,
              options.strategy
            );

            if (!resolution.requiresManualResolution) {
              await this.updateLocalEntity(entityType, resolution.resolvedData);
            } else {
              this.pendingConflicts.set(`${entityType}:${server.id}`, {
                local: localVersion,
                server,
              });
            }
          } else {
            // Server is newer, update local
            await this.updateLocalEntity(entityType, server);
          }
        } else {
          // New entity from server, create locally
          await this.createLocalEntity(entityType, server);
        }

        completed++;
        this.notifyStatus({
          syncing: true,
          progress: { total, completed, entityType },
        });
      } catch (error) {
        console.error(`[EnhancedSync] Failed to pull ${entityType}:${server.id}:`, error);
      }
    }
  }

  /**
   * Get unsynced entities from local database
   */
  private async getUnsyncedEntities(entityType: string): Promise<any[]> {
    switch (entityType) {
      case 'farmer':
        return database.getUnsyncedFarmers();
      case 'farm':
        return database.getUnsyncedFarms();
      case 'harvest':
        return database.getUnsyncedHarvests();
      case 'expense':
        return database.getUnsyncedExpenses();
      case 'loan_application':
        return database.getUnsyncedLoanApplications();
      default:
        return [];
    }
  }

  /**
   * Get changes from server since last sync
   */
  private async getServerChanges(entityType: string): Promise<any[]> {
    try {
      const since = this.lastSyncAt || new Date(0).toISOString();
      return await apiClient.getChanges(entityType, since);
    } catch (error) {
      console.error(`[EnhancedSync] Failed to get server changes for ${entityType}:`, error);
      return [];
    }
  }

  /**
   * Get a specific entity from server
   */
  private async getServerEntity(entityType: string, id: string): Promise<any | null> {
    try {
      return await apiClient.getEntity(entityType, id);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get a specific entity from local database
   */
  private async getLocalEntity(entityType: string, id: string): Promise<any | null> {
    switch (entityType) {
      case 'farmer':
        return database.getFarmerById(id);
      case 'farm':
        return database.getFarmById(id);
      case 'harvest':
        return database.getHarvestById(id);
      case 'expense':
        return database.getExpenseById(id);
      case 'loan_application':
        return database.getLoanApplicationById(id);
      default:
        return null;
    }
  }

  /**
   * Push entity to server
   */
  private async pushToServer(entityType: string, entity: any): Promise<void> {
    switch (entityType) {
      case 'farmer':
        await apiClient.syncFarmer(entity);
        break;
      case 'farm':
        await apiClient.syncFarm(entity);
        break;
      case 'harvest':
        await apiClient.syncHarvest(entity);
        break;
      case 'expense':
        await apiClient.syncExpense(entity);
        break;
      case 'loan_application':
        await apiClient.syncLoanApplication(entity);
        break;
    }
  }

  /**
   * Update local entity
   */
  private async updateLocalEntity(entityType: string, entity: any): Promise<void> {
    entity.synced = true;
    switch (entityType) {
      case 'farmer':
        await database.updateFarmer(entity);
        break;
      case 'farm':
        await database.updateFarm(entity);
        break;
      case 'harvest':
        await database.updateHarvest(entity);
        break;
      case 'expense':
        await database.updateExpense(entity);
        break;
      case 'loan_application':
        await database.updateLoanApplication(entity);
        break;
    }
  }

  /**
   * Create local entity
   */
  private async createLocalEntity(entityType: string, entity: any): Promise<void> {
    entity.synced = true;
    switch (entityType) {
      case 'farmer':
        await database.createFarmer(entity);
        break;
      case 'farm':
        await database.createFarm(entity);
        break;
      case 'harvest':
        await database.createHarvest(entity);
        break;
      case 'expense':
        await database.createExpense(entity);
        break;
      case 'loan_application':
        await database.createLoanApplication(entity);
        break;
    }
  }

  /**
   * Mark entity as synced
   */
  private async markAsSynced(entityType: string, id: string): Promise<void> {
    const entity = await this.getLocalEntity(entityType, id);
    if (entity) {
      entity.synced = true;
      await this.updateLocalEntity(entityType, entity);
    }
  }

  /**
   * Add failed sync to queue for retry
   */
  private async addToSyncQueue(entityType: string, entity: any, operation: string): Promise<void> {
    await database.addToSyncQueue({
      entityType,
      entityId: entity.id,
      operation,
      payload: JSON.stringify(entity),
    });
  }

  /**
   * Process sync queue with retries
   */
  private async processSyncQueue(options: SyncOptions): Promise<void> {
    const queue = await database.getSyncQueue();

    for (const item of queue) {
      if (item.retryCount >= MAX_RETRY_ATTEMPTS) {
        console.warn(`[EnhancedSync] Max retries reached for ${item.entityType}:${item.entityId}`);
        await database.removeSyncQueueItem(item.id);
        continue;
      }

      try {
        const payload = JSON.parse(item.payload);
        await this.pushToServer(item.entityType, payload);
        await this.markAsSynced(item.entityType, item.entityId);
        await database.removeSyncQueueItem(item.id);
        console.log(`[EnhancedSync] Queue item processed: ${item.entityType}:${item.entityId}`);
      } catch (error) {
        console.error(`[EnhancedSync] Failed to process queue item:`, error);
        await database.incrementSyncQueueRetry(item.id);
      }
    }
  }

  /**
   * Get pending conflicts that require manual resolution
   */
  getPendingConflicts(): Map<string, any> {
    return this.pendingConflicts;
  }

  /**
   * Resolve a pending conflict manually
   */
  async resolveConflictManually(
    entityType: string,
    entityId: string,
    resolvedData: any
  ): Promise<void> {
    const key = `${entityType}:${entityId}`;
    
    if (!this.pendingConflicts.has(key)) {
      throw new Error(`No pending conflict found for ${key}`);
    }

    // Push resolved data to server
    await this.pushToServer(entityType, resolvedData);
    
    // Update local
    await this.updateLocalEntity(entityType, resolvedData);
    
    // Remove from pending
    this.pendingConflicts.delete(key);
    
    console.log(`[EnhancedSync] Conflict manually resolved: ${key}`);
  }

  /**
   * Subscribe to sync status updates
   */
  onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all status callbacks
   */
  private notifyStatus(partialStatus: Partial<SyncStatus>): void {
    const status: SyncStatus = {
      syncing: this.isSyncing,
      lastSyncAt: this.lastSyncAt,
      pendingCount: 0, // Will be calculated
      conflictCount: this.pendingConflicts.size,
      ...partialStatus,
    };

    this.statusCallbacks.forEach(callback => callback(status));
  }

  /**
   * Get current sync status
   */
  async getStatus(): Promise<SyncStatus> {
    const pendingCount = await database.getPendingSyncCount();
    
    return {
      syncing: this.isSyncing,
      lastSyncAt: this.lastSyncAt,
      pendingCount,
      conflictCount: this.pendingConflicts.size,
    };
  }

  /**
   * Force sync a specific entity
   */
  async syncEntity(entityType: string, entityId: string): Promise<void> {
    const local = await this.getLocalEntity(entityType, entityId);
    if (!local) {
      throw new Error(`Entity not found: ${entityType}:${entityId}`);
    }

    const server = await this.getServerEntity(entityType, entityId);
    
    if (server && conflictResolver.detectConflict(local, server)) {
      const resolution = await conflictResolver.resolveConflict(
        entityType,
        local,
        server,
        'last_write_wins'
      );

      if (!resolution.requiresManualResolution) {
        await this.pushToServer(entityType, resolution.resolvedData);
        await this.updateLocalEntity(entityType, resolution.resolvedData);
      }
    } else {
      await this.pushToServer(entityType, local);
      await this.markAsSynced(entityType, entityId);
    }
  }
}

export const enhancedSyncService = new EnhancedSyncService();
