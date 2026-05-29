/**
 * ERPNext Sync Scheduler
 * 
 * Automated cron job for bidirectional ERPNext synchronization
 * Runs at configurable intervals to keep data in sync
 */

import { getDb } from '../db';
import { erpnextConfig, erpnextSyncConfig, erpnextSyncQueue } from '../../drizzle/erpnext-schema';
import { eq, and, lte } from 'drizzle-orm';
import { ERPNextSyncService } from '../services/erpnext/erpnext-sync-service';
import { logger } from '../logger.js';

interface SyncSchedulerConfig {
  enabled: boolean;
  interval: number; // in minutes
  batchSize: number;
  retryFailedSync: boolean;
}

const DEFAULT_CONFIG: SyncSchedulerConfig = {
  enabled: true,
  interval: 60, // 1 hour
  batchSize: 100,
  retryFailedSync: true
};

/**
 * Process sync queue items
 */
async function processSyncQueue() {
  const db = await getDb();
  if (!db) {
    logger.error('[ERPNext Sync] Database not available');
    return;
  }

  try {
    // Get pending sync items from queue
    const pendingItems = await db
      .select()
      .from(erpnextSyncQueue)
      .where(
        and(
          eq(erpnextSyncQueue.status, 'pending'),
          lte(erpnextSyncQueue.scheduledAt, new Date())
        )
      )
      .orderBy(erpnextSyncQueue.priority, erpnextSyncQueue.scheduledAt)
      .limit(DEFAULT_CONFIG.batchSize);

    logger.info(`[ERPNext Sync] Processing ${pendingItems.length} queued items`);

    for (const item of pendingItems) {
      try {
        // Mark as processing
        await db
          .update(erpnextSyncQueue)
          .set({ status: 'processing', updatedAt: new Date() })
          .where(eq(erpnextSyncQueue.id, item.id));

        // Initialize sync service for user
        const syncService = new ERPNextSyncService();
        await syncService.initialize(item.userId);

        // Perform sync based on entity type and direction
        let result;

        if (item.syncDirection === 'push') {
          // Push sync (Platform → ERPNext)
          switch (item.entityType) {
            case 'customer':
              result = await syncService.pushCustomer(item.userId, { id: item.entityId! } as Record<string, unknown>);
              break;
            case 'supplier':
              result = await syncService.pushSupplier(item.userId, { id: item.entityId! } as Record<string, unknown>);
              break;
            case 'item':
              result = await syncService.pushItem(item.userId, { id: item.entityId! } as Record<string, unknown>);
              break;
            case 'invoice':
              result = await syncService.pushInvoice(item.userId, { id: item.entityId! } as Record<string, unknown>);
              break;
            case 'payment':
              result = await syncService.pushPayment(item.userId, { id: item.entityId! } as Record<string, unknown>);
              break;
            case 'journal':
              result = await syncService.pushJournalEntry(item.userId, { id: item.entityId! } as Record<string, unknown>);
              break;
          }
        } else if (item.syncDirection === 'pull') {
          // Pull sync (ERPNext → Platform)
          switch (item.entityType) {
            case 'customer':
              result = await syncService.pullCustomers();
              break;
            case 'supplier':
              result = await syncService.pullSuppliers();
              break;
            case 'item':
              result = await syncService.pullItems();
              break;
            case 'invoice':
              result = await syncService.pullInvoices();
              break;
            case 'payment':
              result = await syncService.pullPayments();
              break;
            case 'journal':
              result = await syncService.pullJournalEntries();
              break;
          }
        }

        // Mark as completed or failed
        if (result?.success) {
          await db
            .update(erpnextSyncQueue)
            .set({
              status: 'completed',
              processedAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(erpnextSyncQueue.id, item.id));

          logger.info(`[ERPNext Sync] Completed: ${item.entityType} ${item.entityId}`);
        } else {
          // Increment retry count
          const newRetryCount = item.retryCount + 1;
          const shouldRetry = newRetryCount < item.maxRetries && DEFAULT_CONFIG.retryFailedSync;

          await db
            .update(erpnextSyncQueue)
            .set({
              status: shouldRetry ? 'pending' : 'failed',
              retryCount: newRetryCount,
              errorMessage: (result && 'errors' in result && result.errors) ? result.errors.join(', ') : 'Unknown error',
              scheduledAt: shouldRetry ? new Date(Date.now() + 5 * 60 * 1000) : new Date(), // Retry in 5 minutes
              updatedAt: new Date()
            })
            .where(eq(erpnextSyncQueue.id, item.id));

          logger.error(`[ERPNext Sync] Failed: ${item.entityType} ${item.entityId} - ${(result && 'errors' in result && result.errors) ? result.errors.join(', ') : 'Unknown error'}`);
        }

      } catch (error: unknown) {
        logger.error(`[ERPNext Sync] Error processing queue item ${item.id}:`, error);

        // Mark as failed
        await db
          .update(erpnextSyncQueue)
          .set({
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            updatedAt: new Date()
          })
          .where(eq(erpnextSyncQueue.id, item.id));
      }
    }
  } catch (error: unknown) {
    logger.error('[ERPNext Sync] Queue processing error:', error instanceof Error ? error.message : String(error));
  }
}

function performScheduledSync() {
  if (!DEFAULT_CONFIG.enabled) {
    logger.info('[ERPNext Sync] Scheduled sync is disabled');
    return;
  }

  setInterval(async () => {
    logger.info('[ERPNext Sync] Running scheduled sync...');
    await processSyncQueue();
  }, DEFAULT_CONFIG.interval * 60 * 1000);
}

// Export for manual triggering
export { processSyncQueue, performScheduledSync };
