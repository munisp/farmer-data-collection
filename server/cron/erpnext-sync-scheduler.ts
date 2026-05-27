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
    console.error('[ERPNext Sync] Database not available');
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

    console.log(`[ERPNext Sync] Processing ${pendingItems.length} queued items`);

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
              result = await syncService.pushCustomer(item.userId, item.entityId!);
              break;
            case 'supplier':
              result = await syncService.pushSupplier(item.userId, item.entityId!);
              break;
            case 'item':
              result = await syncService.pushItem(item.userId, item.entityId!);
              break;
            case 'invoice':
              result = await syncService.pushInvoice(item.userId, item.entityId!);
              break;
            case 'payment':
              result = await syncService.pushPayment(item.userId, item.entityId!);
              break;
            case 'journal':
              result = await syncService.pushJournalEntry(item.userId, item.entityId!);
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

          console.log(`[ERPNext Sync] Completed: ${item.entityType} ${item.entityId}`);
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

          console.error(`[ERPNext Sync] Failed: ${item.entityType} ${item.entityId} - ${(result && 'errors' in result && result.errors) ? result.errors.join(', ') : 'Unknown error'}`);
        }

      } catch (error: any) {
        console.error(`[ERPNext Sync] Error processing queue item ${item.id}:`, error);

        // Mark as failed
        await db
          .update(erpnextSyncQueue)
          .set({
            status: 'failed',
            errorMessage: error.message || 'Unknown error',
            updatedAt: new Date()
          })
          .where(eq(erpnextSyncQueue.id, item.id));
      }
    }

  } catch (error) {
    console.error('[ERPNext Sync] Error processing sync queue:', error);
  }
}

/**
 * Perform scheduled sync for all enabled users
 */
async function performScheduledSync() {
  const db = await getDb();
  if (!db) {
    console.error('[ERPNext Sync] Database not available');
    return;
  }

  try {
    console.log('[ERPNext Sync] Starting scheduled sync...');

    // Get all users with sync enabled
    const configs = await db
      .select()
      .from(erpnextConfig)
      .where(eq(erpnextConfig.syncEnabled, true));

    console.log(`[ERPNext Sync] Found ${configs.length} users with sync enabled`);

    for (const config of configs) {
      try {
        // Get sync configuration for this user
        const syncConfigs = await db
          .select()
          .from(erpnextSyncConfig)
          .where(
            and(
              eq(erpnextSyncConfig.userId, config.userId),
              eq(erpnextSyncConfig.syncEnabled, true)
            )
          );

        // Initialize sync service
        const syncService = new ERPNextSyncService();
        await syncService.initialize(config.userId);

        // Perform sync for each enabled entity type
        for (const syncConfig of syncConfigs) {
          const shouldPull = syncConfig.syncDirection === 'pull' || syncConfig.syncDirection === 'both';
          const shouldPush = syncConfig.syncDirection === 'push' || syncConfig.syncDirection === 'both';

          // Pull sync (ERPNext → Platform)
          if (shouldPull) {
            console.log(`[ERPNext Sync] Pulling ${syncConfig.entityType} for user ${config.userId}`);

            try {
              let result;
              const lastSyncTime = syncConfig.lastSyncAt || undefined;

              switch (syncConfig.entityType) {
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

              if (result?.success) {
                console.log(`[ERPNext Sync] Pull completed: ${syncConfig.entityType} - ${result.recordsProcessed} records`);

                // Update last sync time
                await db
                  .update(erpnextSyncConfig)
                  .set({
                    lastSyncAt: new Date(),
                    updatedAt: new Date()
                  })
                  .where(eq(erpnextSyncConfig.id, syncConfig.id));
              } else {
                console.error(`[ERPNext Sync] Pull failed: ${syncConfig.entityType} - ${result?.errors?.join(', ') || 'Unknown error'}`);
              }
            } catch (error: any) {
              console.error(`[ERPNext Sync] Error pulling ${syncConfig.entityType}:`, error.message);
            }
          }

          // Push sync would require tracking changed records
          // For now, push is handled via queue when records are created/updated
        }

        // Update global last sync time
        await db
          .update(erpnextConfig)
          .set({
            lastSyncAt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(erpnextConfig.id, config.id));

      } catch (error: any) {
        console.error(`[ERPNext Sync] Error syncing for user ${config.userId}:`, error.message);
      }
    }

    console.log('[ERPNext Sync] Scheduled sync completed');

  } catch (error) {
    console.error('[ERPNext Sync] Error in scheduled sync:', error);
  }
}

/**
 * Main scheduler function
 */
export async function runERPNextSyncScheduler() {
  if (!DEFAULT_CONFIG.enabled) {
    console.log('[ERPNext Sync] Scheduler is disabled');
    return;
  }

  console.log('[ERPNext Sync] Scheduler started');

  // Process sync queue immediately
  await processSyncQueue();

  // Perform scheduled sync
  await performScheduledSync();

  console.log('[ERPNext Sync] Scheduler completed');
}

/**
 * Initialize scheduler with interval
 */
export function initERPNextSyncScheduler() {
  if (!DEFAULT_CONFIG.enabled) {
    console.log('[ERPNext Sync] Scheduler is disabled');
    return;
  }

  console.log(`[ERPNext Sync] Initializing scheduler (interval: ${DEFAULT_CONFIG.interval} minutes)`);

  // Run immediately on startup
  runERPNextSyncScheduler().catch(error => {
    console.error('[ERPNext Sync] Error in initial run:', error);
  });

  // Schedule recurring runs
  setInterval(() => {
    runERPNextSyncScheduler().catch(error => {
      console.error('[ERPNext Sync] Error in scheduled run:', error);
    });
  }, DEFAULT_CONFIG.interval * 60 * 1000); // Convert minutes to milliseconds
}

// Export for manual triggering
export { processSyncQueue, performScheduledSync };
