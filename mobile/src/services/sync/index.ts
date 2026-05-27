import NetInfo from '@react-native-community/netinfo';
import { database } from '../database';
import { apiClient } from '../api/client';
import { MAX_RETRY_ATTEMPTS } from '@/utils/constants';

class SyncService {
  private isSyncing = false;
  private syncCallbacks: Array<(status: { syncing: boolean; error?: string }) => void> = [];

  async syncAll(): Promise<void> {
    if (this.isSyncing) {
      console.log('[Sync] Already syncing, skipping...');
      return;
    }

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      console.log('[Sync] No internet connection, skipping...');
      this.notifyCallbacks({ syncing: false, error: 'No internet connection' });
      return;
    }

    this.isSyncing = true;
    this.notifyCallbacks({ syncing: true });

    try {
      await this.syncHarvests();
      await this.syncExpenses();
      await this.processSyncQueue();
      
      console.log('[Sync] Sync completed successfully');
      this.notifyCallbacks({ syncing: false });
    } catch (error) {
      console.error('[Sync] Sync failed:', error);
      this.notifyCallbacks({ syncing: false, error: String(error) });
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncHarvests(): Promise<void> {
    const unsynced = await database.getUnsyncedHarvests();
    
    for (const harvest of unsynced) {
      try {
        await apiClient.syncHarvest(harvest);
        harvest.synced = true;
        await database.updateHarvest(harvest);
        console.log(`[Sync] Harvest ${harvest.id} synced successfully`);
      } catch (error) {
        console.error(`[Sync] Failed to sync harvest ${harvest.id}:`, error);
        await database.addToSyncQueue({
          entityType: 'harvest',
          entityId: harvest.id,
          operation: 'create',
          payload: JSON.stringify(harvest),
        });
      }
    }
  }

  private async syncExpenses(): Promise<void> {
    const unsynced = await database.getUnsyncedExpenses();
    
    for (const expense of unsynced) {
      try {
        await apiClient.syncExpense(expense);
        expense.synced = true;
        await database.updateExpense(expense);
        console.log(`[Sync] Expense ${expense.id} synced successfully`);
      } catch (error) {
        console.error(`[Sync] Failed to sync expense ${expense.id}:`, error);
        await database.addToSyncQueue({
          entityType: 'expense',
          entityId: expense.id,
          operation: 'create',
          payload: JSON.stringify(expense),
        });
      }
    }
  }

  private async processSyncQueue(): Promise<void> {
    const queue = await database.getSyncQueue();
    
    for (const item of queue) {
      if (item.retryCount >= MAX_RETRY_ATTEMPTS) {
        console.warn(`[Sync] Max retries reached for ${item.entityType} ${item.entityId}`);
        await database.removeSyncQueueItem(item.id);
        continue;
      }

      try {
        const payload = JSON.parse(item.payload);
        
        if (item.entityType === 'harvest') {
          await apiClient.syncHarvest(payload);
        } else if (item.entityType === 'expense') {
          await apiClient.syncExpense(payload);
        }
        
        await database.removeSyncQueueItem(item.id);
        console.log(`[Sync] Queue item ${item.id} processed successfully`);
      } catch (error) {
        console.error(`[Sync] Failed to process queue item ${item.id}:`, error);
        await database.incrementSyncQueueRetry(item.id);
      }
    }
  }

  onSyncStatusChange(callback: (status: { syncing: boolean; error?: string }) => void): () => void {
    this.syncCallbacks.push(callback);
    return () => {
      this.syncCallbacks = this.syncCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyCallbacks(status: { syncing: boolean; error?: string }): void {
    this.syncCallbacks.forEach(callback => callback(status));
  }

  async getPendingCount(): Promise<number> {
    const harvests = await database.getUnsyncedHarvests();
    const expenses = await database.getUnsyncedExpenses();
    const queue = await database.getSyncQueue();
    return harvests.length + expenses.length + queue.length;
  }
}

export const syncService = new SyncService();
