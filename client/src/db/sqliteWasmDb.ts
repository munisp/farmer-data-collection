/**
 * SQLite WASM + OPFS Backend Implementation
 * 
 * Uses the official SQLite WASM build with OPFS for durable, crash-safe storage.
 * Implements the LocalDb interface with ElectricSQL and RxDB-inspired features.
 */

import {
  LocalDb,
  PendingChange,
  ReplicationCheckpoint,
  QueryResult,
  SYNC_SCHEMA,
  APP_SCHEMA,
  CURRENT_SCHEMA_VERSION,
  generateId,
  dbEvents,
} from './localDb';

// SQLite WASM types (will be loaded dynamically)
interface SqliteDb {
  exec(sql: string): void;
  run(sql: string, params?: any[]): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteStatement {
  bind(params?: any[]): SqliteStatement;
  step(): boolean;
  get(): any;
  getAsObject(): Record<string, any>;
  free(): void;
  reset(): void;
}

interface SqliteModule {
  Database: new (path: string, options?: any) => SqliteDb;
}

// Global SQLite module reference
let sqliteModule: SqliteModule | null = null;
let sqliteDb: SqliteDb | null = null;

// Load SQLite WASM module
async function loadSqliteWasm(): Promise<SqliteModule> {
  if (sqliteModule) return sqliteModule;
  
  // Try to load from CDN (official SQLite WASM build)
  try {
    // Use sql.js as it has better browser/Vite compatibility
    const initSqlJs = (await import('sql.js')).default;
    
    const SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });
    
    sqliteModule = SQL as unknown as SqliteModule;
    return sqliteModule;
  } catch (error) {
    console.error('[SQLite WASM] Failed to load SQLite module:', error);
    throw new Error('Failed to load SQLite WASM module');
  }
}

// OPFS-based persistence layer
class OpfsPersistence {
  private fileHandle: FileSystemFileHandle | null = null;
  private directoryHandle: FileSystemDirectoryHandle | null = null;
  private dbName: string;
  
  constructor(dbName: string = 'farmer-data.sqlite') {
    this.dbName = dbName;
  }
  
  async init(): Promise<void> {
    if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
      console.warn('[OPFS] OPFS not supported, falling back to in-memory with IndexedDB backup');
      return;
    }
    
    try {
      this.directoryHandle = await navigator.storage.getDirectory();
      this.fileHandle = await this.directoryHandle.getFileHandle(this.dbName, { create: true });
      console.warn('[OPFS] Initialized OPFS storage for:', this.dbName);
    } catch (error) {
      console.error('[OPFS] Failed to initialize OPFS:', error);
    }
  }
  
  async load(): Promise<Uint8Array | null> {
    if (!this.fileHandle) return null;
    
    try {
      const file = await this.fileHandle.getFile();
      if (file.size === 0) return null;
      
      const buffer = await file.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      console.error('[OPFS] Failed to load database:', error);
      return null;
    }
  }
  
  async save(data: Uint8Array): Promise<void> {
    if (!this.fileHandle) {
      // Fallback to IndexedDB if OPFS not available
      await this.saveToIndexedDB(data);
      return;
    }
    
    try {
      const writable = await this.fileHandle.createWritable();
      await writable.write(data);
      await writable.close();
      console.warn('[OPFS] Database saved successfully');
    } catch (error) {
      console.error('[OPFS] Failed to save database, falling back to IndexedDB:', error);
      await this.saveToIndexedDB(data);
    }
  }
  
  private async saveToIndexedDB(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('sqlite-backup', 1);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('databases')) {
          db.createObjectStore('databases');
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('databases', 'readwrite');
        const store = tx.objectStore('databases');
        store.put(data, this.dbName);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
  
  async loadFromIndexedDB(): Promise<Uint8Array | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('sqlite-backup', 1);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('databases')) {
          db.createObjectStore('databases');
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('databases', 'readonly');
        const store = tx.objectStore('databases');
        const getRequest = store.get(this.dbName);
        
        getRequest.onsuccess = () => {
          resolve(getRequest.result || null);
        };
        getRequest.onerror = () => reject(getRequest.error);
      };
      
      request.onerror = () => reject(request.error);
    });
  }
}

// SQLite WASM + OPFS implementation of LocalDb
export class SqliteWasmDb implements LocalDb {
  private db: SqliteDb | null = null;
  private persistence: OpfsPersistence;
  private ready: boolean = false;
  private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private querySubscriptions: Map<string, Set<(data: any[]) => void>> = new Map();
  
  constructor(dbName: string = 'farmer-data.sqlite') {
    this.persistence = new OpfsPersistence(dbName);
  }
  
  async init(): Promise<void> {
    if (this.ready) return;
    
    console.warn('[SQLite WASM] Initializing database...');
    
    // Load SQLite WASM module
    const SQL = await loadSqliteWasm();
    
    // Initialize OPFS persistence
    await this.persistence.init();
    
    // Try to load existing database from OPFS or IndexedDB
    let existingData = await this.persistence.load();
    if (!existingData) {
      existingData = await this.persistence.loadFromIndexedDB();
    }
    
    // Create database instance
    if (existingData) {
      console.warn('[SQLite WASM] Loading existing database from storage');
      this.db = new SQL.Database(existingData as any);
    } else {
      console.warn('[SQLite WASM] Creating new database');
      this.db = new SQL.Database(':memory:' as any);
    }
    
    // Enable WAL mode for better crash recovery (if supported)
    try {
      this.db.run('PRAGMA journal_mode=WAL;');
    } catch (e) {
      // WAL might not be supported in all configurations
      console.warn('[SQLite WASM] WAL mode not available, using default journal mode');
    }
    
    // Enable foreign keys
    this.db.run('PRAGMA foreign_keys=ON;');
    
    // Create sync metadata tables
    this.db.exec(SYNC_SCHEMA);
    
    // Create application tables
    this.db.exec(APP_SCHEMA);
    
    // Initialize schema version if not exists
    const versionResult = this.query<{ version: number }>('SELECT version FROM _schema_version WHERE id = 1');
    if ((await versionResult).length === 0) {
      await this.run(
        'INSERT INTO _schema_version (id, version, updated_at) VALUES (1, ?, ?)',
        [CURRENT_SCHEMA_VERSION, Date.now()]
      );
    }
    
    // Save database after initialization
    await this.saveDatabase();
    
    this.ready = true;
    console.warn('[SQLite WASM] Database initialized successfully');
  }
  
  async close(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    // Final save before closing
    await this.saveDatabase();
    
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    
    this.ready = false;
    console.warn('[SQLite WASM] Database closed');
  }
  
  isReady(): boolean {
    return this.ready;
  }
  
  private async saveDatabase(): Promise<void> {
    if (!this.db) return;
    
    try {
      const data = (this.db as any).export();
      await this.persistence.save(new Uint8Array(data));
    } catch (error) {
      console.error('[SQLite WASM] Failed to save database:', error);
    }
  }
  
  private scheduleSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    // Debounce saves to avoid excessive I/O
    this.saveDebounceTimer = setTimeout(() => {
      this.saveDatabase();
    }, 1000);
  }
  
  async run(sql: string, params?: any[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      if (params && params.length > 0) {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        stmt.step();
        stmt.free();
      } else {
        this.db.run(sql);
      }
      
      // Schedule save after write operations
      this.scheduleSave();
      
      // Emit change event for reactive queries
      const tableName = this.extractTableName(sql);
      if (tableName) {
        dbEvents.emitTableChange(tableName);
      }
    } catch (error) {
      console.error('[SQLite WASM] Run error:', error, sql);
      throw error;
    }
  }
  
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      const results: T[] = [];
      const stmt = this.db.prepare(sql);
      
      if (params && params.length > 0) {
        stmt.bind(params);
      }
      
      while (stmt.step()) {
        results.push(stmt.getAsObject() as T);
      }
      
      stmt.free();
      return results;
    } catch (error) {
      console.error('[SQLite WASM] Query error:', error, sql);
      throw error;
    }
  }
  
  async get<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }
  
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.db) throw new Error('Database not initialized');
    
    try {
      this.db.run('BEGIN TRANSACTION');
      const result = await fn();
      this.db.run('COMMIT');
      this.scheduleSave();
      return result;
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }
  
  // Sync operations (ElectricSQL-inspired)
  async listPendingChanges(): Promise<PendingChange[]> {
    const rows = await this.query<{
      id: string;
      table_name: string;
      record_id: string;
      operation: string;
      data: string;
      idempotency_key: string;
      created_at: number;
      retry_count: number;
      last_error: string | null;
      status: string;
    }>(`
      SELECT * FROM _pending_changes 
      WHERE status IN ('pending', 'in_progress')
      ORDER BY created_at ASC
    `);
    
    return rows.map(row => ({
      id: row.id,
      tableName: row.table_name,
      recordId: row.record_id,
      operation: row.operation as 'insert' | 'update' | 'delete',
      data: JSON.parse(row.data),
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at,
      retryCount: row.retry_count,
      lastError: row.last_error || undefined,
      status: row.status as 'pending' | 'in_progress' | 'completed' | 'failed',
    }));
  }
  
  async addPendingChange(change: Omit<PendingChange, 'id' | 'createdAt' | 'retryCount' | 'status'>): Promise<string> {
    const id = generateId();
    const createdAt = Date.now();
    
    await this.run(`
      INSERT INTO _pending_changes (id, table_name, record_id, operation, data, idempotency_key, created_at, retry_count, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending')
    `, [id, change.tableName, String(change.recordId), change.operation, JSON.stringify(change.data), change.idempotencyKey, createdAt]);
    
    return id;
  }
  
  async markChangesSynced(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    
    const placeholders = ids.map(() => '?').join(',');
    await this.run(`
      UPDATE _pending_changes 
      SET status = 'completed'
      WHERE id IN (${placeholders})
    `, ids);
  }
  
  async markChangesFailed(ids: string[], error: string): Promise<void> {
    if (ids.length === 0) return;
    
    const placeholders = ids.map(() => '?').join(',');
    await this.run(`
      UPDATE _pending_changes 
      SET status = 'failed', last_error = ?
      WHERE id IN (${placeholders})
    `, [error, ...ids]);
  }
  
  async incrementRetryCount(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    
    const placeholders = ids.map(() => '?').join(',');
    await this.run(`
      UPDATE _pending_changes 
      SET retry_count = retry_count + 1, status = 'pending'
      WHERE id IN (${placeholders})
    `, ids);
  }
  
  // Replication checkpoints (RxDB-inspired)
  async getCheckpoint(tableName: string): Promise<ReplicationCheckpoint | null> {
    const row = await this.get<{
      table_name: string;
      last_synced_version: number;
      last_synced_at: number;
      server_cursor: string | null;
    }>('SELECT * FROM _replication_checkpoints WHERE table_name = ?', [tableName]);
    
    if (!row) return null;
    
    return {
      tableName: row.table_name,
      lastSyncedVersion: row.last_synced_version,
      lastSyncedAt: row.last_synced_at,
      serverCursor: row.server_cursor || undefined,
    };
  }
  
  async setCheckpoint(checkpoint: ReplicationCheckpoint): Promise<void> {
    await this.run(`
      INSERT OR REPLACE INTO _replication_checkpoints (table_name, last_synced_version, last_synced_at, server_cursor)
      VALUES (?, ?, ?, ?)
    `, [checkpoint.tableName, checkpoint.lastSyncedVersion, checkpoint.lastSyncedAt, checkpoint.serverCursor || null]);
  }
  
  // Reactive queries (RxDB-inspired)
  observeQuery<T = any>(sql: string, params?: any[]): QueryResult<T> {
    const queryKey = `${sql}:${JSON.stringify(params || [])}`;
    
    // Initial query
    let currentData: T[] = [];
    const fetchData = async () => {
      currentData = await this.query<T>(sql, params);
      return currentData;
    };
    
    // Set up subscriptions
    if (!this.querySubscriptions.has(queryKey)) {
      this.querySubscriptions.set(queryKey, new Set());
    }
    
    const subscribers = this.querySubscriptions.get(queryKey)!;
    
    // Listen for table changes
    const tableName = this.extractTableName(sql);
    let unsubscribe: (() => void) | null = null;
    
    if (tableName) {
      unsubscribe = dbEvents.onTableChange(tableName, async () => {
        const newData = await fetchData();
        subscribers.forEach(callback => callback(newData));
      });
    }
    
    return {
      data: currentData,
      subscribe: (callback: (data: T[]) => void) => {
        subscribers.add(callback);
        
        // Immediately fetch and call with current data
        fetchData().then(data => callback(data));
        
        // Return unsubscribe function
        return () => {
          subscribers.delete(callback);
          if (subscribers.size === 0 && unsubscribe) {
            unsubscribe();
            this.querySubscriptions.delete(queryKey);
          }
        };
      },
    };
  }
  
  // Schema version management
  async getSchemaVersion(): Promise<number> {
    const row = await this.get<{ version: number }>('SELECT version FROM _schema_version WHERE id = 1');
    return row?.version || 0;
  }
  
  async setSchemaVersion(version: number): Promise<void> {
    await this.run(
      'INSERT OR REPLACE INTO _schema_version (id, version, updated_at) VALUES (1, ?, ?)',
      [version, Date.now()]
    );
  }
  
  // Conflict resolution (ElectricSQL-inspired)
  async storeConflict(tableName: string, recordId: number | string, localData: any, serverData: any): Promise<void> {
    const id = generateId();
    await this.run(`
      INSERT INTO _conflicts (id, table_name, record_id, local_data, server_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, tableName, String(recordId), JSON.stringify(localData), JSON.stringify(serverData), Date.now()]);
  }
  
  async getConflicts(tableName?: string): Promise<Array<{ tableName: string; recordId: number | string; localData: any; serverData: any; createdAt: number }>> {
    let sql = 'SELECT * FROM _conflicts WHERE resolved_at IS NULL';
    const params: any[] = [];
    
    if (tableName) {
      sql += ' AND table_name = ?';
      params.push(tableName);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const rows = await this.query<{
      table_name: string;
      record_id: string;
      local_data: string;
      server_data: string;
      created_at: number;
    }>(sql, params);
    
    return rows.map(row => ({
      tableName: row.table_name,
      recordId: row.record_id,
      localData: JSON.parse(row.local_data),
      serverData: JSON.parse(row.server_data),
      createdAt: row.created_at,
    }));
  }
  
  async resolveConflict(tableName: string, recordId: number | string, resolution: 'local' | 'server' | 'merge', mergedData?: any): Promise<void> {
    await this.run(`
      UPDATE _conflicts 
      SET resolved_at = ?, resolution = ?
      WHERE table_name = ? AND record_id = ? AND resolved_at IS NULL
    `, [Date.now(), resolution, tableName, String(recordId)]);
    
    // If merge resolution, apply the merged data
    if (resolution === 'merge' && mergedData) {
      // Update the actual record with merged data
      const columns = Object.keys(mergedData);
      const setClause = columns.map(col => `${col} = ?`).join(', ');
      const values = columns.map(col => mergedData[col]);
      
      await this.run(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`, [...values, recordId]);
    }
  }
  
  // Diagnostics
  async getStats(): Promise<{ tableCount: number; totalRows: number; pendingChanges: number; lastSync: number | null }> {
    const tables = ['farmers', 'farms', 'crops', 'livestock', 'farm_inputs', 'harvests', 'expenses', 'notifications', 'gps_tracks'];
    
    let totalRows = 0;
    for (const table of tables) {
      try {
        const result = await this.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${table}`);
        totalRows += result?.count || 0;
      } catch (e) {
        // Table might not exist
      }
    }
    
    const pendingResult = await this.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM _pending_changes WHERE status IN ('pending', 'in_progress')"
    );
    
    const checkpointResult = await this.get<{ last_synced_at: number }>(
      'SELECT MAX(last_synced_at) as last_synced_at FROM _replication_checkpoints'
    );
    
    return {
      tableCount: tables.length,
      totalRows,
      pendingChanges: pendingResult?.count || 0,
      lastSync: checkpointResult?.last_synced_at || null,
    };
  }
  
  // Helper to extract table name from SQL
  private extractTableName(sql: string): string | null {
    const match = sql.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
    return match ? match[1].toLowerCase() : null;
  }
}

// Factory function to create SQLite WASM database
export async function createSqliteWasmDb(dbName?: string): Promise<LocalDb> {
  const db = new SqliteWasmDb(dbName);
  await db.init();
  return db;
}
