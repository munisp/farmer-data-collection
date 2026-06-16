/**
 * LocalDb Abstraction Layer
 * 
 * Provides a unified interface for local database operations using
 * SQLite WASM + OPFS as the storage backend.
 * 
 * Features inspired by:
 * - ElectricSQL: Versioning, incremental sync, conflict metadata
 * - RxDB: Reactive queries, replication state machine, checkpoints
 */

type Listener = () => void;

class BrowserEventEmitter {
  private listeners = new Map<string, Set<Listener>>();
  private maxListeners = 100;

  setMaxListeners(count: number): void {
    this.maxListeners = count;
  }

  on(event: string, listener: Listener): void {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    if (listeners.size >= this.maxListeners) {
      console.warn(`[LocalDbEventEmitter] Max listeners exceeded for ${event}`);
    }
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: Listener): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit(event: string): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch (error) {
        console.error(`[LocalDbEventEmitter] Listener failed for ${event}:`, error);
      }
    }
  }
}

// Types for sync metadata (ElectricSQL-inspired)
export interface SyncMetadata {
  version: number;
  clientId: string;
  lastSyncedAt: number | null;
  lastServerVersion: number | null;
  syncStatus: 'pending' | 'synced' | 'conflict' | 'error';
  conflictData?: any;
}

// Types for pending changes (RxDB-inspired replication state machine)
export interface PendingChange {
  id: string;
  tableName: string;
  recordId: number | string;
  operation: 'insert' | 'update' | 'delete';
  data: any;
  idempotencyKey: string;
  createdAt: number;
  retryCount: number;
  lastError?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

// Types for replication checkpoints (RxDB-inspired)
export interface ReplicationCheckpoint {
  tableName: string;
  lastSyncedVersion: number;
  lastSyncedAt: number;
  serverCursor?: string;
}

// Query result with reactive subscription support
export interface QueryResult<T> {
  data: T[];
  subscribe: (callback: (data: T[]) => void) => () => void;
}

// LocalDb interface - abstraction over SQLite WASM backend
export interface LocalDb {
  // Lifecycle
  init(): Promise<void>;
  close(): Promise<void>;
  isReady(): boolean;
  
  // Basic CRUD operations
  run(sql: string, params?: any[]): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | null>;
  
  // Transaction support
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  
  // Sync operations (ElectricSQL-inspired)
  listPendingChanges(): Promise<PendingChange[]>;
  addPendingChange(change: Omit<PendingChange, 'id' | 'createdAt' | 'retryCount' | 'status'>): Promise<string>;
  markChangesSynced(ids: string[]): Promise<void>;
  markChangesFailed(ids: string[], error: string): Promise<void>;
  incrementRetryCount(ids: string[]): Promise<void>;
  
  // Replication checkpoints (RxDB-inspired)
  getCheckpoint(tableName: string): Promise<ReplicationCheckpoint | null>;
  setCheckpoint(checkpoint: ReplicationCheckpoint): Promise<void>;
  
  // Reactive queries (RxDB-inspired)
  observeQuery<T = any>(sql: string, params?: any[]): QueryResult<T>;
  
  // Migration support
  getSchemaVersion(): Promise<number>;
  setSchemaVersion(version: number): Promise<void>;
  
  // Conflict resolution metadata (ElectricSQL-inspired)
  storeConflict(tableName: string, recordId: number | string, localData: any, serverData: any): Promise<void>;
  getConflicts(tableName?: string): Promise<Array<{ tableName: string; recordId: number | string; localData: any; serverData: any; createdAt: number }>>;
  resolveConflict(tableName: string, recordId: number | string, resolution: 'local' | 'server' | 'merge', mergedData?: any): Promise<void>;
  
  // Diagnostics
  getStats(): Promise<{ tableCount: number; totalRows: number; pendingChanges: number; lastSync: number | null }>;
}

// Event emitter for reactive queries
class LocalDbEventEmitter extends BrowserEventEmitter {
  private static instance: LocalDbEventEmitter;
  
  static getInstance(): LocalDbEventEmitter {
    if (!LocalDbEventEmitter.instance) {
      LocalDbEventEmitter.instance = new LocalDbEventEmitter();
      LocalDbEventEmitter.instance.setMaxListeners(100);
    }
    return LocalDbEventEmitter.instance;
  }
  
  emitTableChange(tableName: string): void {
    this.emit(`table:${tableName}`);
    this.emit('any-change');
  }
  
  onTableChange(tableName: string, callback: () => void): () => void {
    this.on(`table:${tableName}`, callback);
    return () => this.off(`table:${tableName}`, callback);
  }
  
  onAnyChange(callback: () => void): () => void {
    this.on('any-change', callback);
    return () => this.off('any-change', callback);
  }
}

export const dbEvents = LocalDbEventEmitter.getInstance();

// Helper to generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// Helper to generate idempotency keys
export async function generateIdempotencyKey(clientId: string, table: string, recordId: string | number, operation: string): Promise<string> {
  const data = `${clientId}:${table}:${recordId}:${operation}`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Get or create persistent client ID
export function getClientId(): string {
  const storedId = localStorage.getItem('sync_client_id');
  if (storedId) return storedId;
  const newId = `client-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  localStorage.setItem('sync_client_id', newId);
  return newId;
}

// Schema for sync metadata tables (used by both backends)
export const SYNC_SCHEMA = `
  -- Pending changes queue (RxDB-inspired replication state machine)
  CREATE TABLE IF NOT EXISTS _pending_changes (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
    data TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed'))
  );
  
  -- Replication checkpoints (RxDB-inspired)
  CREATE TABLE IF NOT EXISTS _replication_checkpoints (
    table_name TEXT PRIMARY KEY,
    last_synced_version INTEGER NOT NULL,
    last_synced_at INTEGER NOT NULL,
    server_cursor TEXT
  );
  
  -- Conflict store (ElectricSQL-inspired)
  CREATE TABLE IF NOT EXISTS _conflicts (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    local_data TEXT NOT NULL,
    server_data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    resolution TEXT CHECK (resolution IN ('local', 'server', 'merge', NULL))
  );
  
  -- Schema version tracking
  CREATE TABLE IF NOT EXISTS _schema_version (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  
  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_pending_changes_status ON _pending_changes(status);
  CREATE INDEX IF NOT EXISTS idx_pending_changes_table ON _pending_changes(table_name);
  CREATE INDEX IF NOT EXISTS idx_conflicts_table ON _conflicts(table_name);
  CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved ON _conflicts(resolved_at) WHERE resolved_at IS NULL;
`;

// Application schema (farmers, farms, crops, etc.)
export const APP_SCHEMA = `
  -- Farmers table
  CREATE TABLE IF NOT EXISTS farmers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone_number TEXT,
    email TEXT,
    address TEXT,
    village TEXT,
    district TEXT,
    region TEXT,
    national_id TEXT,
    photo_url TEXT,
    registration_date TEXT DEFAULT (datetime('now')),
    is_active INTEGER DEFAULT 1,
    verification_status TEXT DEFAULT 'pending',
    verified_by INTEGER,
    verified_at TEXT,
    verification_notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    version INTEGER DEFAULT 1,
    client_id TEXT,
    last_synced_at INTEGER,
    last_server_version INTEGER,
    sync_status TEXT DEFAULT 'pending'
  );
  
  -- Farms table
  CREATE TABLE IF NOT EXISTS farms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    farmer_id INTEGER NOT NULL REFERENCES farmers(id),
    farm_name TEXT NOT NULL,
    farm_size REAL,
    farm_size_unit TEXT DEFAULT 'acres',
    location TEXT,
    latitude REAL,
    longitude REAL,
    soil_type TEXT,
    irrigation_type TEXT,
    boundary TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    version INTEGER DEFAULT 1,
    client_id TEXT,
    last_synced_at INTEGER,
    last_server_version INTEGER,
    sync_status TEXT DEFAULT 'pending'
  );
  
  -- Crops table
  CREATE TABLE IF NOT EXISTS crops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    farm_id INTEGER NOT NULL REFERENCES farms(id),
    crop_name TEXT NOT NULL,
    crop_variety TEXT,
    planting_date TEXT NOT NULL,
    expected_harvest_date TEXT,
    actual_harvest_date TEXT,
    area_planted REAL,
    area_unit TEXT DEFAULT 'acres',
    season TEXT,
    status TEXT DEFAULT 'planted',
    price_per_unit INTEGER DEFAULT 1000,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    version INTEGER DEFAULT 1,
    client_id TEXT,
    last_synced_at INTEGER,
    last_server_version INTEGER,
    sync_status TEXT DEFAULT 'pending'
  );
  
  -- Livestock table
  CREATE TABLE IF NOT EXISTS livestock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    farm_id INTEGER NOT NULL REFERENCES farms(id),
    animal_type TEXT NOT NULL,
    breed TEXT,
    quantity INTEGER NOT NULL,
    purpose TEXT,
    acquisition_date TEXT NOT NULL,
    acquisition_cost INTEGER,
    current_value INTEGER,
    health_status TEXT DEFAULT 'healthy',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    version INTEGER DEFAULT 1,
    client_id TEXT,
    last_synced_at INTEGER,
    last_server_version INTEGER,
    sync_status TEXT DEFAULT 'pending'
  );
  
  -- Farm inputs table
  CREATE TABLE IF NOT EXISTS farm_inputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    farm_id INTEGER NOT NULL REFERENCES farms(id),
    crop_id INTEGER REFERENCES crops(id),
    input_type TEXT NOT NULL,
    input_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    cost_per_unit INTEGER,
    total_cost INTEGER,
    supplier TEXT,
    purchase_date TEXT NOT NULL,
    application_date TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    version INTEGER DEFAULT 1,
    client_id TEXT,
    last_synced_at INTEGER,
    last_server_version INTEGER,
    sync_status TEXT DEFAULT 'pending'
  );
  
  -- Harvests table
  CREATE TABLE IF NOT EXISTS harvests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    crop_id INTEGER NOT NULL REFERENCES crops(id),
    harvest_date TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT NOT NULL,
    quality TEXT,
    storage_location TEXT,
    market_price INTEGER,
    sold_quantity REAL,
    revenue INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    version INTEGER DEFAULT 1,
    client_id TEXT,
    last_synced_at INTEGER,
    last_server_version INTEGER,
    sync_status TEXT DEFAULT 'pending'
  );
  
  -- Expenses table
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    farm_id INTEGER NOT NULL REFERENCES farms(id),
    crop_id INTEGER REFERENCES crops(id),
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL,
    expense_date TEXT NOT NULL,
    payment_method TEXT,
    receipt TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    version INTEGER DEFAULT 1,
    client_id TEXT,
    last_synced_at INTEGER,
    last_server_version INTEGER,
    sync_status TEXT DEFAULT 'pending'
  );
  
  -- Notifications table
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    related_id INTEGER,
    related_type TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  
  -- GPS tracks table (for field boundary mapping)
  CREATE TABLE IF NOT EXISTS gps_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    farm_id INTEGER REFERENCES farms(id),
    track_name TEXT,
    coordinates TEXT NOT NULL,
    accuracy REAL,
    recorded_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    version INTEGER DEFAULT 1,
    client_id TEXT,
    sync_status TEXT DEFAULT 'pending'
  );
  
  -- Indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_farmers_user ON farmers(user_id);
  CREATE INDEX IF NOT EXISTS idx_farms_farmer ON farms(farmer_id);
  CREATE INDEX IF NOT EXISTS idx_farms_user ON farms(user_id);
  CREATE INDEX IF NOT EXISTS idx_crops_farm ON crops(farm_id);
  CREATE INDEX IF NOT EXISTS idx_crops_user ON crops(user_id);
  CREATE INDEX IF NOT EXISTS idx_livestock_farm ON livestock(farm_id);
  CREATE INDEX IF NOT EXISTS idx_farm_inputs_farm ON farm_inputs(farm_id);
  CREATE INDEX IF NOT EXISTS idx_harvests_crop ON harvests(crop_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_farm ON expenses(farm_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_gps_tracks_farm ON gps_tracks(farm_id);
  
  -- Sync status indexes
  CREATE INDEX IF NOT EXISTS idx_farmers_sync ON farmers(sync_status);
  CREATE INDEX IF NOT EXISTS idx_farms_sync ON farms(sync_status);
  CREATE INDEX IF NOT EXISTS idx_crops_sync ON crops(sync_status);
`;

// Current schema version
export const CURRENT_SCHEMA_VERSION = 1;
