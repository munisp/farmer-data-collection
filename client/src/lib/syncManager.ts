import { getDb } from "@/db";
import { eq, sql } from "drizzle-orm";
import { farmers, farms, crops, livestock, farmInputs, harvests, expenses } from "@/db/schema";
import type { AppRouter } from "../../../server/trpc";
import type { TRPCClientError } from "@trpc/client";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { getAdaptiveSyncManager, AdaptiveSyncConfig } from "./networkAwareSync";

// Generate unique client ID (persisted in localStorage for consistency across sessions)
const getClientId = (): string => {
  const storedId = localStorage.getItem("sync_client_id");
  if (storedId) return storedId;
  const newId = `client-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  localStorage.setItem("sync_client_id", newId);
  return newId;
};

const CLIENT_ID = getClientId();

// Default values - will be overridden by adaptive sync
const DEFAULT_SYNC_INTERVAL = 30000; // 30 seconds
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

// ============================================================================
// Idempotency Key Support for Client-Side Sync
// ============================================================================

// Generate SHA-256 hash for idempotency key (browser-compatible)
async function generateIdempotencyKey(clientId: string, table: string, recordId: string | number, operation: string): Promise<string> {
  const data = `${clientId}:${table}:${recordId}:${operation}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Store processed idempotency keys in IndexedDB for persistence
const IDEMPOTENCY_STORE_KEY = "sync_idempotency_keys";
const IDEMPOTENCY_TTL_HOURS = 24;

interface IdempotencyRecord {
  key: string;
  result: any;
  expiresAt: number;
}

function getIdempotencyStore(): Map<string, IdempotencyRecord> {
  try {
    const stored = localStorage.getItem(IDEMPOTENCY_STORE_KEY);
    if (!stored) return new Map();
    const records: IdempotencyRecord[] = JSON.parse(stored);
    const now = Date.now();
    // Filter out expired records
    const validRecords = records.filter(r => r.expiresAt > now);
    return new Map(validRecords.map(r => [r.key, r]));
  } catch (err) {
    console.warn('[SyncManager] Failed to load idempotency store:', String(err));
    return new Map();
  }
}

function saveIdempotencyStore(store: Map<string, IdempotencyRecord>): void {
  try {
    const records = Array.from(store.values());
    localStorage.setItem(IDEMPOTENCY_STORE_KEY, JSON.stringify(records));
  } catch (error) {
    console.warn("[SyncManager] Failed to save idempotency store:", error);
  }
}

function checkClientIdempotency(key: string): { exists: boolean; result?: any } {
  const store = getIdempotencyStore();
  const record = store.get(key);
  if (!record) return { exists: false };
  if (record.expiresAt < Date.now()) {
    store.delete(key);
    saveIdempotencyStore(store);
    return { exists: false };
  }
  return { exists: true, result: record.result };
}

function recordClientIdempotency(key: string, result: any): void {
  const store = getIdempotencyStore();
  const expiresAt = Date.now() + (IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);
  store.set(key, { key, result, expiresAt });
  saveIdempotencyStore(store);
}

// Clean up expired idempotency keys periodically
function cleanupIdempotencyStore(): void {
  const store = getIdempotencyStore();
  const now = Date.now();
  let changed = false;
  for (const [key, record] of store.entries()) {
    if (record.expiresAt < now) {
      store.delete(key);
      changed = true;
    }
  }
  if (changed) {
    saveIdempotencyStore(store);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupIdempotencyStore, 5 * 60 * 1000);

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  error: string | null;
  pendingChanges: number;
  lastSyncedTables: string[];
}

export interface TableSyncResult {
  table: string;
  success: boolean;
  error?: string;
  pulledRecords: number;
  pushedRecords: number;
}

export class SyncManager {
  private syncInterval: NodeJS.Timeout | null = null;
  private listeners: Array<(status: SyncStatus) => void> = [];
  private trpcClient: ReturnType<typeof createTRPCProxyClient<AppRouter>>;
  private adaptiveSyncManager = getAdaptiveSyncManager();
  private adaptiveConfig: AdaptiveSyncConfig | null = null;
  private configUnsubscribe: (() => void) | null = null;
  private status: SyncStatus = {
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    pendingChanges: 0,
    lastSyncedTables: [],
  };

  constructor(private serverUrl: string) {
    // Create tRPC client with authentication
    this.trpcClient = createTRPCProxyClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${serverUrl}/api/trpc`,
          transformer: superjson,
          headers: () => {
            const token = localStorage.getItem("auth_token");
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
        }),
      ],
    });

    // Subscribe to adaptive sync config changes
    this.configUnsubscribe = this.adaptiveSyncManager.subscribe((config) => {
      this.adaptiveConfig = config;
      // Restart auto-sync with new interval if running
      if (this.syncInterval) {
        this.restartAutoSync();
      }
    });
  }

  // Get current sync configuration (adaptive or default)
  private getConfig(): { syncInterval: number; maxRetries: number; retryDelay: number; batchSize: number } {
    if (this.adaptiveConfig) {
      return {
        syncInterval: this.adaptiveConfig.syncInterval,
        maxRetries: this.adaptiveConfig.maxRetries,
        retryDelay: this.adaptiveConfig.retryDelay,
        batchSize: this.adaptiveConfig.batchSize,
      };
    }
    return {
      syncInterval: DEFAULT_SYNC_INTERVAL,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelay: DEFAULT_RETRY_DELAY,
      batchSize: 50,
    };
  }

  getClientId() {
    return CLIENT_ID;
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  subscribe(listener: (status: SyncStatus) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.getStatus()));
  }

  private updateStatus(updates: Partial<SyncStatus>) {
    this.status = { ...this.status, ...updates };
    this.notifyListeners();
  }

    async startAutoSync() {
      if (this.syncInterval) {
        return; // Already running
      }

      // Check if sync should be attempted based on adaptive config
      const config = this.getConfig();
    
      // If sync interval is Infinity (manual mode), don't start auto-sync
      if (config.syncInterval === Infinity) {
        console.warn('[SyncManager] Auto-sync disabled (manual mode or critical battery)');
        return;
      }

      // Initial sync
      await this.sync();

      // Set up periodic sync with adaptive interval
      this.syncInterval = setInterval(() => {
        // Re-check if we should sync (network/battery conditions may have changed)
        if (this.adaptiveSyncManager.shouldSync()) {
          this.sync();
        }
      }, config.syncInterval);
    
      console.warn(`[SyncManager] Auto-sync started with interval: ${config.syncInterval}ms`);
    }

    // Restart auto-sync with new configuration (called when network/battery changes)
    private restartAutoSync() {
      const wasRunning = this.syncInterval !== null;
      this.stopAutoSync();
    
      if (wasRunning) {
        const config = this.getConfig();
        if (config.syncInterval !== Infinity) {
          this.syncInterval = setInterval(() => {
            if (this.adaptiveSyncManager.shouldSync()) {
              this.sync();
            }
          }, config.syncInterval);
          console.warn(`[SyncManager] Auto-sync restarted with new interval: ${config.syncInterval}ms`);
        } else {
          console.warn('[SyncManager] Auto-sync paused (manual mode or critical battery)');
        }
      }
    }

    stopAutoSync() {
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
      }
    }

    // Cleanup resources
    destroy() {
      this.stopAutoSync();
      if (this.configUnsubscribe) {
        this.configUnsubscribe();
        this.configUnsubscribe = null;
      }
    }

    async sync(): Promise<TableSyncResult[]> {
      if (this.status.isSyncing) {
        return []; // Already syncing
      }

      // Check network status before syncing
      const networkState = this.adaptiveSyncManager.getNetworkState();
      if (!networkState.online) {
        console.warn('[SyncManager] Skipping sync - offline');
        return [];
      }

      this.updateStatus({ isSyncing: true, error: null });

    const results: TableSyncResult[] = [];
    const tables: Array<{
      name: "farmers" | "farms" | "crops" | "livestock" | "farmInputs" | "harvests" | "expenses";
      schema: any;
    }> = [
      { name: "farmers", schema: farmers },
      { name: "farms", schema: farms },
      { name: "crops", schema: crops },
      { name: "livestock", schema: livestock },
      { name: "farmInputs", schema: farmInputs },
      { name: "harvests", schema: harvests },
      { name: "expenses", schema: expenses },
    ];

    // Sync tables in parallel for better performance
    const syncPromises = tables.map(async ({ name, schema }) => {
      const result: TableSyncResult = {
        table: name,
        success: false,
        pulledRecords: 0,
        pushedRecords: 0,
      };

      try {
        // Pull changes from server
        const pullResult = await this.pullChanges(name, schema);
        result.pulledRecords = pullResult;

        // Push local changes to server
        const pushResult = await this.pushChanges(name, schema);
        result.pushedRecords = pushResult;

        result.success = true;
      } catch (error) {
        console.error(`Sync error for ${name}:`, error);
        result.error = error instanceof Error ? error.message : "Unknown sync error";
      }

      return result;
    });

    const allResults = await Promise.allSettled(syncPromises);
    
    // Process results
    allResults.forEach((promiseResult, index) => {
      if (promiseResult.status === "fulfilled") {
        results.push(promiseResult.value);
      } else {
        results.push({
          table: tables[index].name,
          success: false,
          error: promiseResult.reason?.message || "Promise rejected",
          pulledRecords: 0,
          pushedRecords: 0,
        });
      }
    });

    const successfulTables = results.filter((r) => r.success).map((r) => r.table);
    const failedTables = results.filter((r) => !r.success);

    this.updateStatus({
      isSyncing: false,
      lastSyncTime: new Date(),
      pendingChanges: 0,
      lastSyncedTables: successfulTables,
      error: failedTables.length > 0 
        ? `Failed to sync: ${failedTables.map((t) => t.table).join(", ")}`
        : null,
    });

    return results;
  }

  private async pullChanges(
    tableName: "farmers" | "farms" | "crops" | "livestock" | "farmInputs" | "harvests" | "expenses",
    tableSchema: any
  ): Promise<number> {
    try {
      // Use tRPC client to pull changes
      const result = await this.retryOperation(async () => {
        return await this.trpcClient.sync.pull.query({
          table: tableName,
          clientId: CLIENT_ID,
          lastSyncTime: this.status.lastSyncTime || undefined,
        });
      });

      const { records } = result;

      if (!records || records.length === 0) {
        return 0;
      }

      const db = await getDb();

      // Apply server changes to local database using proper Drizzle ORM methods
      for (const record of records) {
        try {
          // Check if record exists locally
          const existing = await db
            .select()
            .from(tableSchema)
            .where(eq(tableSchema.id, record.id))
            .limit(1);

          if (existing.length > 0) {
            const localRecord = existing[0];

            // Conflict resolution: server wins if version is higher or equal
            if ((record.version || 1) >= (localRecord.version || 1)) {
              await db
                .update(tableSchema)
                .set({
                  ...record,
                  updatedAt: new Date(record.updatedAt),
                })
                .where(eq(tableSchema.id, record.id));
            }
          } else {
            // Insert new record from server
            await db.insert(tableSchema).values({
              ...record,
              createdAt: new Date(record.createdAt),
              updatedAt: new Date(record.updatedAt),
            });
          }
        } catch (recordError) {
          console.error(`Error applying record ${record.id} to ${tableName}:`, recordError);
          // Continue with other records
        }
      }

      return records.length;
    } catch (error) {
      console.error(`Pull changes error for ${tableName}:`, error);
      throw error;
    }
  }

  private async pushChanges(
    tableName: "farmers" | "farms" | "crops" | "livestock" | "farmInputs" | "harvests" | "expenses",
    tableSchema: any
  ): Promise<number> {
    try {
      const db = await getDb();

      // Get records that need syncing (modified since last sync or never synced)
      let records: any[];
      
      if (this.status.lastSyncTime) {
        records = await db
          .select()
          .from(tableSchema)
          .where(sql`${tableSchema.updatedAt} > ${this.status.lastSyncTime}`);
      } else {
        records = await db.select().from(tableSchema);
      }

      if (records.length === 0) {
        return 0; // Nothing to push
      }

      // Filter out records that have already been synced (idempotency check)
      const recordsToSync: any[] = [];
      const skippedRecords: string[] = [];
      
      for (const record of records) {
        const recordId = record.id || `new-${Date.now()}`;
        const operation = record.id ? 'push-update' : 'push-create';
        const idempotencyKey = await generateIdempotencyKey(CLIENT_ID, tableName, recordId, operation);
        
        const idempotencyCheck = checkClientIdempotency(idempotencyKey);
        if (idempotencyCheck.exists) {
          console.warn(`[SyncManager] Idempotent push detected, skipping: ${tableName}/${recordId}`);
          skippedRecords.push(String(recordId));
          continue;
        }
        
        // Add idempotency key to record for server-side tracking
        recordsToSync.push({
          ...record,
          _idempotencyKey: idempotencyKey,
        });
      }

      if (recordsToSync.length === 0) {
        console.warn(`[SyncManager] All ${records.length} records already synced for ${tableName}`);
        return skippedRecords.length; // Return count of already-synced records
      }

      // Use tRPC client to push changes
      const result = await this.retryOperation(async () => {
        return await this.trpcClient.sync.push.mutate({
          table: tableName,
          records: recordsToSync,
          clientId: CLIENT_ID,
          lastSyncTime: this.status.lastSyncTime || undefined,
        });
      });

      const { conflicts } = result;

      // Record successful syncs in idempotency store
      for (const record of recordsToSync) {
        if (!conflicts?.some((c: any) => c.id === record.id)) {
          // Record was synced successfully
          recordClientIdempotency(record._idempotencyKey, { 
            success: true, 
            recordId: record.id,
            syncedAt: Date.now(),
          });
        }
      }

      if (conflicts && conflicts.length > 0) {
        console.warn(`Sync conflicts detected for ${tableName}:`, conflicts);
        // Re-pull to get latest server state for conflicted records
        for (const conflict of conflicts) {
          try {
            const serverRecord = conflict.record as Record<string, unknown> | undefined;
            if (serverRecord) {
              await db
                .update(tableSchema)
                .set({
                  ...serverRecord,
                  updatedAt: new Date(serverRecord.updatedAt as string),
                })
                .where(eq(tableSchema.id, serverRecord.id as number));
            }
          } catch (conflictError) {
            console.error(`Error resolving conflict for record ${conflict.id}:`, conflictError);
          }
        }
      }

      return recordsToSync.length + skippedRecords.length;
    } catch (error) {
      console.error(`Push changes error for ${tableName}:`, error);
      throw error;
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries = DEFAULT_MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on authentication errors
        if (this.isAuthError(error)) {
          throw lastError;
        }

        if (attempt < retries) {
          // Exponential backoff
          const delay = DEFAULT_RETRY_DELAY * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Operation failed after retries");
  }

  private isAuthError(error: unknown): boolean {
    if (typeof error === "object" && error !== null) {
      const trpcError = error as TRPCClientError<AppRouter>;
      return trpcError.data?.code === "UNAUTHORIZED";
    }
    return false;
  }
}

// Global sync manager instance
let syncManagerInstance: SyncManager | null = null;

export function getSyncManager(): SyncManager {
  if (!syncManagerInstance) {
    const serverUrl = window.location.origin;
    syncManagerInstance = new SyncManager(serverUrl);
  }
  return syncManagerInstance;
}
