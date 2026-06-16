/**
 * Offline Sync Service for Web Client
 * Provides IndexedDB-based offline storage and background sync capabilities
 */

// IndexedDB database name and version
const DB_NAME = 'agrifinance-offline';
const DB_VERSION = 1;

// Store names
const STORES = {
  HARVESTS: 'harvests',
  EXPENSES: 'expenses',
  ORDERS: 'orders',
  SYNC_QUEUE: 'sync_queue',
  CACHE_META: 'cache_meta',
} as const;

// Sync status
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

// Sync queue item
export interface SyncQueueItem {
  id: string;
  entityType: keyof typeof STORES;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: string;
  retryCount: number;
  createdAt: string;
  lastAttempt?: string;
  error?: string;
}

// Offline harvest record
export interface OfflineHarvest {
  id: string;
  cropType: string;
  quantity: number;
  unit: string;
  harvestDate: string;
  locationLat?: number;
  locationLng?: number;
  photoUri?: string;
  notes?: string;
  synced: boolean;
  createdAt: string;
  updatedAt: string;
}

// Offline expense record
export interface OfflineExpense {
  id: string;
  category: string;
  amount: number;
  description?: string;
  expenseDate: string;
  receiptUri?: string;
  notes?: string;
  synced: boolean;
  createdAt: string;
  updatedAt: string;
}

// Offline order item
export interface OfflineOrderItem {
  productId: string;
  quantity: number;
  price: number;
}

// Offline order record - supports multi-item cart orders
export interface OfflineOrder {
  id: string;
  items: OfflineOrderItem[];
  totalAmount: number;
  shippingAddress?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  notes?: string;
  status: string;
  synced: boolean;
  createdAt: string;
  updatedAt: string;
}

class OfflineSyncService {
  private db: IDBDatabase | null = null;
  private syncInProgress = false;
  private listeners: Set<(status: { syncing: boolean; pendingCount: number; error?: string }) => void> = new Set();

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        console.warn('[OfflineSync] IndexedDB not supported');
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[OfflineSync] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.warn('[OfflineSync] Database initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.warn('[OfflineSync] Upgrading database schema');

        // Harvests store
        if (!db.objectStoreNames.contains(STORES.HARVESTS)) {
          const harvestStore = db.createObjectStore(STORES.HARVESTS, { keyPath: 'id' });
          harvestStore.createIndex('synced', 'synced', { unique: false });
          harvestStore.createIndex('harvestDate', 'harvestDate', { unique: false });
        }

        // Expenses store
        if (!db.objectStoreNames.contains(STORES.EXPENSES)) {
          const expenseStore = db.createObjectStore(STORES.EXPENSES, { keyPath: 'id' });
          expenseStore.createIndex('synced', 'synced', { unique: false });
          expenseStore.createIndex('expenseDate', 'expenseDate', { unique: false });
        }

        // Orders store
        if (!db.objectStoreNames.contains(STORES.ORDERS)) {
          const orderStore = db.createObjectStore(STORES.ORDERS, { keyPath: 'id' });
          orderStore.createIndex('synced', 'synced', { unique: false });
          orderStore.createIndex('status', 'status', { unique: false });
        }

        // Sync queue store
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
          syncStore.createIndex('entityType', 'entityType', { unique: false });
          syncStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Cache metadata store
        if (!db.objectStoreNames.contains(STORES.CACHE_META)) {
          db.createObjectStore(STORES.CACHE_META, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Check if the database is initialized
   */
  private ensureDb(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============================================
  // HARVEST OPERATIONS
  // ============================================

  async saveHarvest(harvest: Omit<OfflineHarvest, 'id' | 'synced' | 'createdAt' | 'updatedAt'>): Promise<OfflineHarvest> {
    const db = this.ensureDb();
    const now = new Date().toISOString();
    
    const record: OfflineHarvest = {
      ...harvest,
      id: this.generateId(),
      synced: false,
      createdAt: now,
      updatedAt: now,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.HARVESTS, 'readwrite');
      const store = transaction.objectStore(STORES.HARVESTS);
      const request = store.add(record);

      request.onsuccess = () => {
        console.warn('[OfflineSync] Harvest saved:', record.id);
        this.addToSyncQueue('HARVESTS', record.id, 'create', record);
        resolve(record);
      };

      request.onerror = () => {
        console.error('[OfflineSync] Failed to save harvest:', request.error);
        reject(request.error);
      };
    });
  }

  async getHarvests(): Promise<OfflineHarvest[]> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.HARVESTS, 'readonly');
      const store = transaction.objectStore(STORES.HARVESTS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedHarvests(): Promise<OfflineHarvest[]> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.HARVESTS, 'readonly');
      const store = transaction.objectStore(STORES.HARVESTS);
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markHarvestSynced(id: string): Promise<void> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.HARVESTS, 'readwrite');
      const store = transaction.objectStore(STORES.HARVESTS);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const harvest = getRequest.result;
        if (harvest) {
          harvest.synced = true;
          harvest.updatedAt = new Date().toISOString();
          const putRequest = store.put(harvest);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // ============================================
  // EXPENSE OPERATIONS
  // ============================================

  async saveExpense(expense: Omit<OfflineExpense, 'id' | 'synced' | 'createdAt' | 'updatedAt'>): Promise<OfflineExpense> {
    const db = this.ensureDb();
    const now = new Date().toISOString();
    
    const record: OfflineExpense = {
      ...expense,
      id: this.generateId(),
      synced: false,
      createdAt: now,
      updatedAt: now,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.EXPENSES, 'readwrite');
      const store = transaction.objectStore(STORES.EXPENSES);
      const request = store.add(record);

      request.onsuccess = () => {
        console.warn('[OfflineSync] Expense saved:', record.id);
        this.addToSyncQueue('EXPENSES', record.id, 'create', record);
        resolve(record);
      };

      request.onerror = () => {
        console.error('[OfflineSync] Failed to save expense:', request.error);
        reject(request.error);
      };
    });
  }

  async getExpenses(): Promise<OfflineExpense[]> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.EXPENSES, 'readonly');
      const store = transaction.objectStore(STORES.EXPENSES);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getUnsyncedExpenses(): Promise<OfflineExpense[]> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.EXPENSES, 'readonly');
      const store = transaction.objectStore(STORES.EXPENSES);
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(false));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markExpenseSynced(id: string): Promise<void> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.EXPENSES, 'readwrite');
      const store = transaction.objectStore(STORES.EXPENSES);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const expense = getRequest.result;
        if (expense) {
          expense.synced = true;
          expense.updatedAt = new Date().toISOString();
          const putRequest = store.put(expense);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // ============================================
  // ORDER OPERATIONS
  // ============================================

  async saveOrder(order: Omit<OfflineOrder, 'id' | 'synced' | 'createdAt' | 'updatedAt'>): Promise<OfflineOrder> {
    const db = this.ensureDb();
    const now = new Date().toISOString();
    
    const record: OfflineOrder = {
      ...order,
      id: this.generateId(),
      synced: false,
      createdAt: now,
      updatedAt: now,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.ORDERS, 'readwrite');
      const store = transaction.objectStore(STORES.ORDERS);
      const request = store.add(record);

      request.onsuccess = () => {
        console.warn('[OfflineSync] Order saved:', record.id);
        this.addToSyncQueue('ORDERS', record.id, 'create', record);
        resolve(record);
      };

      request.onerror = () => {
        console.error('[OfflineSync] Failed to save order:', request.error);
        reject(request.error);
      };
    });
  }

  async getOrders(): Promise<OfflineOrder[]> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.ORDERS, 'readonly');
      const store = transaction.objectStore(STORES.ORDERS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async markOrderSynced(id: string): Promise<void> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.ORDERS, 'readwrite');
      const store = transaction.objectStore(STORES.ORDERS);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const order = getRequest.result;
        if (order) {
          order.synced = true;
          order.updatedAt = new Date().toISOString();
          const putRequest = store.put(order);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // ============================================
  // SYNC QUEUE OPERATIONS
  // ============================================

  private async addToSyncQueue(
    entityType: keyof typeof STORES,
    entityId: string,
    operation: 'create' | 'update' | 'delete',
    payload: unknown
  ): Promise<void> {
    const db = this.ensureDb();

    const item: SyncQueueItem = {
      id: this.generateId(),
      entityType,
      entityId,
      operation,
      payload: JSON.stringify(payload),
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.add(item);

      request.onsuccess = () => {
        console.warn('[OfflineSync] Added to sync queue:', item.id);
        this.notifyListeners();
        this.requestBackgroundSync();
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getSyncQueue(): Promise<SyncQueueItem[]> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.SYNC_QUEUE, 'readonly');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removeSyncQueueItem(id: string): Promise<void> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.delete(id);

      request.onsuccess = () => {
        this.notifyListeners();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async updateSyncQueueItem(item: SyncQueueItem): Promise<void> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = transaction.objectStore(STORES.SYNC_QUEUE);
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================
  // SYNC OPERATIONS
  // ============================================

  /**
   * Request background sync if supported
   */
  private async requestBackgroundSync(): Promise<void> {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await (registration as any).sync.register('sync-all');
        console.warn('[OfflineSync] Background sync registered');
      } catch (error) {
        console.warn('[OfflineSync] Background sync not available:', error);
      }
    }
  }

  /**
   * Sync all pending items
   */
  async syncAll(apiClient: {
    syncHarvest: (data: OfflineHarvest) => Promise<void>;
    syncExpense: (data: OfflineExpense) => Promise<void>;
    syncOrder: (data: OfflineOrder) => Promise<void>;
  }): Promise<{ success: number; failed: number }> {
    if (this.syncInProgress) {
      console.warn('[OfflineSync] Sync already in progress');
      return { success: 0, failed: 0 };
    }

    if (!navigator.onLine) {
      console.warn('[OfflineSync] Offline, skipping sync');
      return { success: 0, failed: 0 };
    }

    this.syncInProgress = true;
    this.notifyListeners();

    let success = 0;
    let failed = 0;

    try {
      const queue = await this.getSyncQueue();
      console.warn(`[OfflineSync] Processing ${queue.length} items`);

      for (const item of queue) {
        if (item.retryCount >= 3) {
          console.warn(`[OfflineSync] Max retries reached for ${item.id}`);
          await this.removeSyncQueueItem(item.id);
          failed++;
          continue;
        }

        try {
          const payload = JSON.parse(item.payload);

          switch (item.entityType) {
            case 'HARVESTS':
              await apiClient.syncHarvest(payload);
              await this.markHarvestSynced(item.entityId);
              break;
            case 'EXPENSES':
              await apiClient.syncExpense(payload);
              await this.markExpenseSynced(item.entityId);
              break;
            case 'ORDERS':
              await apiClient.syncOrder(payload);
              await this.markOrderSynced(item.entityId);
              break;
          }

          await this.removeSyncQueueItem(item.id);
          success++;
          console.warn(`[OfflineSync] Synced ${item.entityType} ${item.entityId}`);
        } catch (error) {
          console.error(`[OfflineSync] Failed to sync ${item.id}:`, error);
          item.retryCount++;
          item.lastAttempt = new Date().toISOString();
          item.error = String(error);
          await this.updateSyncQueueItem(item);
          failed++;
        }
      }
    } finally {
      this.syncInProgress = false;
      this.notifyListeners();
    }

    console.warn(`[OfflineSync] Sync complete: ${success} success, ${failed} failed`);
    return { success, failed };
  }

  // ============================================
  // STATUS & LISTENERS
  // ============================================

  /**
   * Get pending sync count
   */
  async getPendingCount(): Promise<number> {
    try {
      const queue = await this.getSyncQueue();
      return queue.length;
    } catch (err) {
      console.warn('[OfflineSync] Failed to get pending count:', String(err));
      return 0;
    }
  }

  /**
   * Subscribe to sync status changes
   */
  onStatusChange(callback: (status: { syncing: boolean; pendingCount: number; error?: string }) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of status change
   */
  private async notifyListeners(): Promise<void> {
    const pendingCount = await this.getPendingCount();
    const status = {
      syncing: this.syncInProgress,
      pendingCount,
    };

    this.listeners.forEach((callback) => {
      try {
        callback(status);
      } catch (error) {
        console.error('[OfflineSync] Listener error:', error);
      }
    });
  }

  // ============================================
  // CACHE METADATA
  // ============================================

  async setCacheMeta(key: string, value: unknown): Promise<void> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.CACHE_META, 'readwrite');
      const store = transaction.objectStore(STORES.CACHE_META);
      const request = store.put({ key, value, updatedAt: new Date().toISOString() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getCacheMeta<T>(key: string): Promise<T | null> {
    const db = this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.CACHE_META, 'readonly');
      const store = transaction.objectStore(STORES.CACHE_META);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================
  // CLEANUP
  // ============================================

  async clearAll(): Promise<void> {
    const db = this.ensureDb();

    const storeNames = Object.values(STORES);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeNames, 'readwrite');
      
      let completed = 0;
      
      storeNames.forEach((storeName) => {
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        
        request.onsuccess = () => {
          completed++;
          if (completed === storeNames.length) {
            console.warn('[OfflineSync] All stores cleared');
            this.notifyListeners();
            resolve();
          }
        };
        
        request.onerror = () => reject(request.error);
      });
    });
  }
}

// Export singleton instance
export const offlineSyncService = new OfflineSyncService();

// Auto-initialize when module loads
if (typeof window !== 'undefined') {
  offlineSyncService.init().catch((error) => {
    console.error('[OfflineSync] Failed to initialize:', error);
  });

  // Listen for online events to trigger sync
  window.addEventListener('online', () => {
    console.warn('[OfflineSync] Back online, will sync on next API call');
  });

  // Listen for service worker sync messages
  window.addEventListener('sync-harvests', () => {
    console.warn('[OfflineSync] Received sync-harvests event');
  });

  window.addEventListener('sync-expenses', () => {
    console.warn('[OfflineSync] Received sync-expenses event');
  });

  window.addEventListener('sync-orders', () => {
    console.warn('[OfflineSync] Received sync-orders event');
  });
}
