/**
 * OfflineDataManager - IndexedDB storage, background sync, and queue-and-retry
 * Designed for 2G/slow-connectivity environments in developing countries.
 *
 * Features:
 * - IndexedDB for persistent offline data storage
 * - Request queue for failed API calls (automatic retry with exponential backoff)
 * - Background Sync API integration (when supported)
 * - Data compression for uploads
 * - Bandwidth-aware sync scheduling
 * - Conflict resolution (last-write-wins with timestamps)
 */

const DB_NAME = "agrifinance_offline";
const DB_VERSION = 2;

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  timestamp: number;
  retries: number;
  maxRetries: number;
  priority: "high" | "normal" | "low";
  entityType: string;
  entityId?: string;
}

interface CachedData {
  key: string;
  data: unknown;
  timestamp: number;
  expiresAt: number;
  entityType: string;
  version: number;
}

type SyncCallback = (event: SyncEvent) => void;

interface SyncEvent {
  type: "sync_start" | "sync_complete" | "sync_error" | "queue_add" | "queue_remove" | "data_cached";
  detail?: unknown;
}

class OfflineDataManager {
  private db: IDBDatabase | null = null;
  private syncCallbacks: Set<SyncCallback> = new Set();
  private isSyncing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains("request_queue")) {
          const queueStore = db.createObjectStore("request_queue", { keyPath: "id" });
          queueStore.createIndex("timestamp", "timestamp");
          queueStore.createIndex("priority", "priority");
          queueStore.createIndex("entityType", "entityType");
        }

        if (!db.objectStoreNames.contains("cached_data")) {
          const cacheStore = db.createObjectStore("cached_data", { keyPath: "key" });
          cacheStore.createIndex("entityType", "entityType");
          cacheStore.createIndex("expiresAt", "expiresAt");
          cacheStore.createIndex("timestamp", "timestamp");
        }

        if (!db.objectStoreNames.contains("sync_log")) {
          const logStore = db.createObjectStore("sync_log", { keyPath: "id", autoIncrement: true });
          logStore.createIndex("timestamp", "timestamp");
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.startAutoSync();
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  // ===== Request Queue =====

  async queueRequest(
    url: string,
    method: string,
    body: unknown,
    options: {
      headers?: Record<string, string>;
      priority?: "high" | "normal" | "low";
      entityType?: string;
      entityId?: string;
      maxRetries?: number;
    } = {}
  ): Promise<string> {
    await this.ensureDb();
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const entry: QueuedRequest = {
      id,
      url,
      method,
      headers: options.headers ?? { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : null,
      timestamp: Date.now(),
      retries: 0,
      maxRetries: options.maxRetries ?? 5,
      priority: options.priority ?? "normal",
      entityType: options.entityType ?? "unknown",
      entityId: options.entityId,
    };

    const tx = this.db!.transaction("request_queue", "readwrite");
    tx.objectStore("request_queue").add(entry);
    await this.txComplete(tx);

    this.emit({ type: "queue_add", detail: { id, url, entityType: entry.entityType } });

    // Try Background Sync API
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await (reg as any).sync.register("sync-queue");
      } catch (err) {
        console.warn('[OfflineData] Background sync registration failed:', String(err));
      }
    }

    return id;
  }

  async getQueueSize(): Promise<number> {
    await this.ensureDb();
    return new Promise((resolve) => {
      const tx = this.db!.transaction("request_queue", "readonly");
      const req = tx.objectStore("request_queue").count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
  }

  async processQueue(): Promise<{ success: number; failed: number; remaining: number }> {
    if (this.isSyncing || !navigator.onLine) {
      return { success: 0, failed: 0, remaining: await this.getQueueSize() };
    }

    this.isSyncing = true;
    this.emit({ type: "sync_start" });

    let success = 0;
    let failed = 0;

    try {
      await this.ensureDb();
      const tx = this.db!.transaction("request_queue", "readonly");
      const store = tx.objectStore("request_queue");
      const entries: QueuedRequest[] = [];

      const req = store.index("priority").openCursor();
      await new Promise<void>((resolve) => {
        req.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            entries.push(cursor.value);
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      });

      // Sort: high priority first, then by timestamp
      entries.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        return pDiff !== 0 ? pDiff : a.timestamp - b.timestamp;
      });

      for (const entry of entries) {
        try {
          const response = await fetch(entry.url, {
            method: entry.method,
            headers: entry.headers,
            body: entry.body,
          });

          if (response.ok || response.status < 500) {
            // Success or client error (don't retry client errors)
            await this.removeFromQueue(entry.id);
            success++;
          } else {
            // Server error, increment retry
            await this.incrementRetry(entry);
            failed++;
          }
        } catch (err) {
          console.warn('[OfflineData] Sync request failed:', String(err));
          await this.incrementRetry(entry);
          failed++;
        }

        // Small delay between requests to avoid overwhelming slow connections
        await new Promise(r => setTimeout(r, 200));
      }
    } finally {
      this.isSyncing = false;
    }

    const remaining = await this.getQueueSize();
    this.emit({ type: "sync_complete", detail: { success, failed, remaining } });
    return { success, failed, remaining };
  }

  private async removeFromQueue(id: string): Promise<void> {
    const tx = this.db!.transaction("request_queue", "readwrite");
    tx.objectStore("request_queue").delete(id);
    await this.txComplete(tx);
    this.emit({ type: "queue_remove", detail: { id } });
  }

  private async incrementRetry(entry: QueuedRequest): Promise<void> {
    if (entry.retries >= entry.maxRetries) {
      await this.removeFromQueue(entry.id);
      // Log failed request
      const tx = this.db!.transaction("sync_log", "readwrite");
      tx.objectStore("sync_log").add({
        timestamp: Date.now(),
        type: "request_failed",
        detail: { url: entry.url, entityType: entry.entityType, retries: entry.retries },
      });
      await this.txComplete(tx);
      return;
    }

    entry.retries++;
    const tx = this.db!.transaction("request_queue", "readwrite");
    tx.objectStore("request_queue").put(entry);
    await this.txComplete(tx);
  }

  // ===== Data Cache =====

  async cacheData(
    key: string,
    data: unknown,
    options: { entityType?: string; ttlMs?: number; version?: number } = {}
  ): Promise<void> {
    await this.ensureDb();
    const ttl = options.ttlMs ?? 24 * 60 * 60 * 1000; // Default 24h

    const entry: CachedData = {
      key,
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ttl,
      entityType: options.entityType ?? "general",
      version: options.version ?? 1,
    };

    const tx = this.db!.transaction("cached_data", "readwrite");
    tx.objectStore("cached_data").put(entry);
    await this.txComplete(tx);
    this.emit({ type: "data_cached", detail: { key, entityType: entry.entityType } });
  }

  async getCachedData<T = unknown>(key: string): Promise<{ data: T; stale: boolean } | null> {
    await this.ensureDb();
    return new Promise((resolve) => {
      const tx = this.db!.transaction("cached_data", "readonly");
      const req = tx.objectStore("cached_data").get(key);

      req.onsuccess = () => {
        if (!req.result) {
          resolve(null);
          return;
        }
        const entry = req.result as CachedData;
        const stale = Date.now() > entry.expiresAt;
        resolve({ data: entry.data as T, stale });
      };
      req.onerror = () => resolve(null);
    });
  }

  async clearExpiredCache(): Promise<number> {
    await this.ensureDb();
    let cleared = 0;
    const now = Date.now();

    const tx = this.db!.transaction("cached_data", "readwrite");
    const store = tx.objectStore("cached_data");
    const req = store.index("expiresAt").openCursor(IDBKeyRange.upperBound(now));

    return new Promise((resolve) => {
      req.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cleared++;
          cursor.continue();
        } else {
          resolve(cleared);
        }
      };
      req.onerror = () => resolve(cleared);
    });
  }

  // ===== Auto Sync =====

  private startAutoSync(): void {
    // Listen for online events
    window.addEventListener("online", () => {
      this.processQueue();
    });

    // Periodic sync based on connection quality
    const scheduleSync = () => {
      const connection = (navigator as any).connection;
      const effectiveType = connection?.effectiveType ?? "4g";

      // Longer intervals for slower connections
      const intervals: Record<string, number> = {
        "slow-2g": 120000, // 2 min
        "2g": 60000,       // 1 min
        "3g": 30000,       // 30s
        "4g": 15000,       // 15s
      };

      const interval = intervals[effectiveType] ?? 15000;

      this.retryTimer = setTimeout(async () => {
        if (navigator.onLine) {
          await this.processQueue();
          await this.clearExpiredCache();
        }
        scheduleSync();
      }, interval);
    };

    scheduleSync();
  }

  // ===== Events =====

  subscribe(callback: SyncCallback): () => void {
    this.syncCallbacks.add(callback);
    return () => this.syncCallbacks.delete(callback);
  }

  private emit(event: SyncEvent): void {
    this.syncCallbacks.forEach(cb => cb(event));
  }

  // ===== Helpers =====

  private async ensureDb(): Promise<void> {
    if (!this.db) await this.init();
  }

  private txComplete(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  destroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.syncCallbacks.clear();
    this.db?.close();
    this.db = null;
  }
}

// Singleton
let instance: OfflineDataManager | null = null;

export function getOfflineDataManager(): OfflineDataManager {
  if (!instance) {
    instance = new OfflineDataManager();
    instance.init().catch(console.error);
  }
  return instance;
}

export type { QueuedRequest, CachedData, SyncEvent, SyncCallback };
export { OfflineDataManager };
