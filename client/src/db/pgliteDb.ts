/**
 * PGlite Backend Implementation (Legacy)
 * 
 * Wraps the existing PGlite database to implement the LocalDb interface.
 * This allows for gradual migration to SQLite WASM + OPFS.
 */

import { PGlite } from '@electric-sql/pglite';
import {
  LocalDb,
  PendingChange,
  ReplicationCheckpoint,
  QueryResult,
  CURRENT_SCHEMA_VERSION,
  generateId,
  dbEvents,
} from './localDb';

// PGlite implementation of LocalDb
export class PgliteDb implements LocalDb {
  private client: PGlite | null = null;
  private ready: boolean = false;
  private querySubscriptions: Map<string, Set<(data: any[]) => void>> = new Map();
  
  constructor(private dataDir: string = 'idb://farmer-data-collection') {}
  
  async init(): Promise<void> {
    if (this.ready) return;
    
    console.log('[PGlite] Initializing database...');
    
    // Create PGlite instance
    this.client = await PGlite.create({
      dataDir: this.dataDir,
    });
    
    // Create sync metadata tables
    await this.createSyncTables();
    
    // Create application tables (using existing schema from useDatabase.ts)
    await this.createAppTables();
    
    this.ready = true;
    console.log('[PGlite] Database initialized successfully');
  }
  
  private async createSyncTables(): Promise<void> {
    if (!this.client) throw new Error('Database not initialized');
    
    // Pending changes queue
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS _pending_changes (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
        data JSONB NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at BIGINT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_pending_changes_status ON _pending_changes(status);
      CREATE INDEX IF NOT EXISTS idx_pending_changes_table ON _pending_changes(table_name);
    `);
    
    // Replication checkpoints
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS _replication_checkpoints (
        table_name TEXT PRIMARY KEY,
        last_synced_version INTEGER NOT NULL,
        last_synced_at BIGINT NOT NULL,
        server_cursor TEXT
      );
    `);
    
    // Conflict store
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS _conflicts (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        local_data JSONB NOT NULL,
        server_data JSONB NOT NULL,
        created_at BIGINT NOT NULL,
        resolved_at BIGINT,
        resolution TEXT CHECK (resolution IN ('local', 'server', 'merge', NULL))
      );
      
      CREATE INDEX IF NOT EXISTS idx_conflicts_table ON _conflicts(table_name);
      CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved ON _conflicts(resolved_at) WHERE resolved_at IS NULL;
    `);
    
    // Schema version
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS _schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL,
        updated_at BIGINT NOT NULL
      );
    `);
    
    // Initialize schema version if not exists
    const versionResult = await this.client.query('SELECT version FROM _schema_version WHERE id = 1');
    if (versionResult.rows.length === 0) {
      await this.client.exec(`
        INSERT INTO _schema_version (id, version, updated_at) VALUES (1, ${CURRENT_SCHEMA_VERSION}, ${Date.now()})
      `);
    }
  }
  
  private async createAppTables(): Promise<void> {
    if (!this.client) throw new Error('Database not initialized');
    
    // Farmers table with sync metadata
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS farmers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20),
        email VARCHAR(255),
        address TEXT,
        village VARCHAR(100),
        district VARCHAR(100),
        region VARCHAR(100),
        national_id VARCHAR(50),
        photo_url VARCHAR(500),
        registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        verification_status VARCHAR(20) DEFAULT 'pending' NOT NULL,
        verified_by INTEGER,
        verified_at TIMESTAMP,
        verification_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100),
        last_synced_at BIGINT,
        last_server_version INTEGER,
        sync_status VARCHAR(20) DEFAULT 'pending'
      );
    `);
    
    // Farms table
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS farms (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        farmer_id INTEGER NOT NULL REFERENCES farmers(id),
        farm_name VARCHAR(200) NOT NULL,
        farm_size DECIMAL(10, 2),
        farm_size_unit VARCHAR(20) DEFAULT 'acres',
        location TEXT,
        latitude DECIMAL(10, 7),
        longitude DECIMAL(10, 7),
        soil_type VARCHAR(100),
        irrigation_type VARCHAR(100),
        boundary TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100),
        last_synced_at BIGINT,
        last_server_version INTEGER,
        sync_status VARCHAR(20) DEFAULT 'pending'
      );
    `);
    
    // Crops table
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS crops (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        farm_id INTEGER NOT NULL REFERENCES farms(id),
        crop_name VARCHAR(100) NOT NULL,
        crop_variety VARCHAR(100),
        planting_date TIMESTAMP NOT NULL,
        expected_harvest_date TIMESTAMP,
        actual_harvest_date TIMESTAMP,
        area_planted DECIMAL(10, 2),
        area_unit VARCHAR(20) DEFAULT 'acres',
        season VARCHAR(50),
        status VARCHAR(50) DEFAULT 'planted',
        price_per_unit INTEGER DEFAULT 1000,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100),
        last_synced_at BIGINT,
        last_server_version INTEGER,
        sync_status VARCHAR(20) DEFAULT 'pending'
      );
    `);
    
    // Livestock table
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS livestock (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        farm_id INTEGER NOT NULL REFERENCES farms(id),
        animal_type VARCHAR(100) NOT NULL,
        breed VARCHAR(100),
        quantity INTEGER NOT NULL,
        purpose VARCHAR(100),
        acquisition_date TIMESTAMP NOT NULL,
        acquisition_cost INTEGER,
        current_value INTEGER,
        health_status VARCHAR(50) DEFAULT 'healthy',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100),
        last_synced_at BIGINT,
        last_server_version INTEGER,
        sync_status VARCHAR(20) DEFAULT 'pending'
      );
    `);
    
    // Farm inputs table
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS farm_inputs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        farm_id INTEGER NOT NULL REFERENCES farms(id),
        crop_id INTEGER REFERENCES crops(id),
        input_type VARCHAR(50) NOT NULL,
        input_name VARCHAR(200) NOT NULL,
        quantity DECIMAL(10, 2) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        cost_per_unit INTEGER,
        total_cost INTEGER,
        supplier VARCHAR(200),
        purchase_date TIMESTAMP NOT NULL,
        application_date TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100),
        last_synced_at BIGINT,
        last_server_version INTEGER,
        sync_status VARCHAR(20) DEFAULT 'pending'
      );
    `);
    
    // Harvests table
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS harvests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        crop_id INTEGER NOT NULL REFERENCES crops(id),
        harvest_date TIMESTAMP NOT NULL,
        quantity DECIMAL(10, 2) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        quality VARCHAR(50),
        storage_location VARCHAR(200),
        market_price INTEGER,
        sold_quantity DECIMAL(10, 2),
        revenue INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100),
        last_synced_at BIGINT,
        last_server_version INTEGER,
        sync_status VARCHAR(20) DEFAULT 'pending'
      );
    `);
    
    // Expenses table
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        farm_id INTEGER NOT NULL REFERENCES farms(id),
        crop_id INTEGER REFERENCES crops(id),
        category VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        amount INTEGER NOT NULL,
        expense_date TIMESTAMP NOT NULL,
        payment_method VARCHAR(50),
        receipt VARCHAR(500),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100),
        last_synced_at BIGINT,
        last_server_version INTEGER,
        sync_status VARCHAR(20) DEFAULT 'pending'
      );
    `);
    
    // Notifications table
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false NOT NULL,
        related_id INTEGER,
        related_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    
    // GPS tracks table
    await this.client.exec(`
      CREATE TABLE IF NOT EXISTS gps_tracks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        farm_id INTEGER REFERENCES farms(id),
        track_name VARCHAR(200),
        coordinates JSONB NOT NULL,
        accuracy DECIMAL(10, 2),
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100),
        sync_status VARCHAR(20) DEFAULT 'pending'
      );
    `);
  }
  
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.ready = false;
    console.log('[PGlite] Database closed');
  }
  
  isReady(): boolean {
    return this.ready;
  }
  
  async run(sql: string, params?: any[]): Promise<void> {
    if (!this.client) throw new Error('Database not initialized');
    
    try {
      if (params && params.length > 0) {
        // Convert params to $1, $2, etc. format
        let paramIndex = 1;
        const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
        await this.client.query(pgSql, params);
      } else {
        await this.client.exec(sql);
      }
      
      // Emit change event for reactive queries
      const tableName = this.extractTableName(sql);
      if (tableName) {
        dbEvents.emitTableChange(tableName);
      }
    } catch (error) {
      console.error('[PGlite] Run error:', error, sql);
      throw error;
    }
  }
  
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.client) throw new Error('Database not initialized');
    
    try {
      let result;
      if (params && params.length > 0) {
        // Convert params to $1, $2, etc. format
        let paramIndex = 1;
        const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
        result = await this.client.query(pgSql, params);
      } else {
        result = await this.client.query(sql);
      }
      
      return result.rows as T[];
    } catch (error) {
      console.error('[PGlite] Query error:', error, sql);
      throw error;
    }
  }
  
  async get<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }
  
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.client) throw new Error('Database not initialized');
    
    try {
      await this.client.exec('BEGIN');
      const result = await fn();
      await this.client.exec('COMMIT');
      return result;
    } catch (error) {
      await this.client.exec('ROLLBACK');
      throw error;
    }
  }
  
  // Sync operations
  async listPendingChanges(): Promise<PendingChange[]> {
    const rows = await this.query<{
      id: string;
      table_name: string;
      record_id: string;
      operation: string;
      data: any;
      idempotency_key: string;
      created_at: string;
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
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      idempotencyKey: row.idempotency_key,
      createdAt: parseInt(row.created_at),
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
      VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, 0, 'pending')
    `, [id, change.tableName, String(change.recordId), change.operation, JSON.stringify(change.data), change.idempotencyKey, createdAt]);
    
    return id;
  }
  
  async markChangesSynced(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await this.client?.query(`
      UPDATE _pending_changes 
      SET status = 'completed'
      WHERE id IN (${placeholders})
    `, ids);
  }
  
  async markChangesFailed(ids: string[], error: string): Promise<void> {
    if (ids.length === 0) return;
    
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    await this.client?.query(`
      UPDATE _pending_changes 
      SET status = 'failed', last_error = $1
      WHERE id IN (${placeholders})
    `, [error, ...ids]);
  }
  
  async incrementRetryCount(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await this.client?.query(`
      UPDATE _pending_changes 
      SET retry_count = retry_count + 1, status = 'pending'
      WHERE id IN (${placeholders})
    `, ids);
  }
  
  // Replication checkpoints
  async getCheckpoint(tableName: string): Promise<ReplicationCheckpoint | null> {
    const row = await this.get<{
      table_name: string;
      last_synced_version: number;
      last_synced_at: string;
      server_cursor: string | null;
    }>('SELECT * FROM _replication_checkpoints WHERE table_name = ?', [tableName]);
    
    if (!row) return null;
    
    return {
      tableName: row.table_name,
      lastSyncedVersion: row.last_synced_version,
      lastSyncedAt: parseInt(row.last_synced_at),
      serverCursor: row.server_cursor || undefined,
    };
  }
  
  async setCheckpoint(checkpoint: ReplicationCheckpoint): Promise<void> {
    await this.run(`
      INSERT INTO _replication_checkpoints (table_name, last_synced_version, last_synced_at, server_cursor)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (table_name) DO UPDATE SET
        last_synced_version = EXCLUDED.last_synced_version,
        last_synced_at = EXCLUDED.last_synced_at,
        server_cursor = EXCLUDED.server_cursor
    `, [checkpoint.tableName, checkpoint.lastSyncedVersion, checkpoint.lastSyncedAt, checkpoint.serverCursor || null]);
  }
  
  // Reactive queries
  observeQuery<T = any>(sql: string, params?: any[]): QueryResult<T> {
    const queryKey = `${sql}:${JSON.stringify(params || [])}`;
    
    let currentData: T[] = [];
    const fetchData = async () => {
      currentData = await this.query<T>(sql, params);
      return currentData;
    };
    
    if (!this.querySubscriptions.has(queryKey)) {
      this.querySubscriptions.set(queryKey, new Set());
    }
    
    const subscribers = this.querySubscriptions.get(queryKey)!;
    
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
        fetchData().then(data => callback(data));
        
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
  
  // Schema version
  async getSchemaVersion(): Promise<number> {
    const row = await this.get<{ version: number }>('SELECT version FROM _schema_version WHERE id = 1');
    return row?.version || 0;
  }
  
  async setSchemaVersion(version: number): Promise<void> {
    await this.run(`
      INSERT INTO _schema_version (id, version, updated_at) VALUES (1, ?, ?)
      ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, updated_at = EXCLUDED.updated_at
    `, [version, Date.now()]);
  }
  
  // Conflict resolution
  async storeConflict(tableName: string, recordId: number | string, localData: any, serverData: any): Promise<void> {
    const id = generateId();
    await this.run(`
      INSERT INTO _conflicts (id, table_name, record_id, local_data, server_data, created_at)
      VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?)
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
      local_data: any;
      server_data: any;
      created_at: string;
    }>(sql, params);
    
    return rows.map(row => ({
      tableName: row.table_name,
      recordId: row.record_id,
      localData: typeof row.local_data === 'string' ? JSON.parse(row.local_data) : row.local_data,
      serverData: typeof row.server_data === 'string' ? JSON.parse(row.server_data) : row.server_data,
      createdAt: parseInt(row.created_at),
    }));
  }
  
  async resolveConflict(tableName: string, recordId: number | string, resolution: 'local' | 'server' | 'merge', mergedData?: any): Promise<void> {
    await this.run(`
      UPDATE _conflicts 
      SET resolved_at = ?, resolution = ?
      WHERE table_name = ? AND record_id = ? AND resolved_at IS NULL
    `, [Date.now(), resolution, tableName, String(recordId)]);
    
    if (resolution === 'merge' && mergedData) {
      const columns = Object.keys(mergedData);
      const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
      const values = columns.map(col => mergedData[col]);
      
      await this.client?.query(`UPDATE ${tableName} SET ${setClause} WHERE id = $${columns.length + 1}`, [...values, recordId]);
    }
  }
  
  // Diagnostics
  async getStats(): Promise<{ tableCount: number; totalRows: number; pendingChanges: number; lastSync: number | null }> {
    const tables = ['farmers', 'farms', 'crops', 'livestock', 'farm_inputs', 'harvests', 'expenses', 'notifications', 'gps_tracks'];
    
    let totalRows = 0;
    for (const table of tables) {
      try {
        const result = await this.get<{ count: string }>(`SELECT COUNT(*) as count FROM ${table}`);
        totalRows += parseInt(result?.count || '0');
      } catch (e) {
        // Table might not exist
      }
    }
    
    const pendingResult = await this.get<{ count: string }>(
      "SELECT COUNT(*) as count FROM _pending_changes WHERE status IN ('pending', 'in_progress')"
    );
    
    const checkpointResult = await this.get<{ last_synced_at: string }>(
      'SELECT MAX(last_synced_at) as last_synced_at FROM _replication_checkpoints'
    );
    
    return {
      tableCount: tables.length,
      totalRows,
      pendingChanges: parseInt(pendingResult?.count || '0'),
      lastSync: checkpointResult?.last_synced_at ? parseInt(checkpointResult.last_synced_at) : null,
    };
  }
  
  // Helper to extract table name from SQL
  private extractTableName(sql: string): string | null {
    const match = sql.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
    return match ? match[1].toLowerCase() : null;
  }
  
  // Export all data for migration
  async exportAllData(): Promise<Record<string, any[]>> {
    const tables = ['farmers', 'farms', 'crops', 'livestock', 'farm_inputs', 'harvests', 'expenses', 'notifications', 'gps_tracks', '_pending_changes', '_replication_checkpoints', '_conflicts'];
    const data: Record<string, any[]> = {};
    
    for (const table of tables) {
      try {
        data[table] = await this.query(`SELECT * FROM ${table}`);
      } catch (e) {
        data[table] = [];
      }
    }
    
    return data;
  }
}

// Factory function to create PGlite database
export async function createPgliteDb(dataDir?: string): Promise<LocalDb> {
  const db = new PgliteDb(dataDir);
  await db.init();
  return db;
}
