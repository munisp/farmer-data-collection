/**
 * Database Factory
 * 
 * Provides a unified interface for creating and managing local databases.
 * Supports feature flags for gradual migration from PGlite to SQLite WASM + OPFS.
 * Includes migration utilities for data transfer between backends.
 */

import type { LocalDb } from './localDb';
import { SqliteWasmDb, createSqliteWasmDb } from './sqliteWasmDb';

async function loadPgliteModule() {
  return import('./pgliteDb');
}

// Database backend types
export type DatabaseBackend = 'pglite' | 'sqlite-wasm';

// Configuration for database factory
export interface DbFactoryConfig {
  backend: DatabaseBackend;
  enableMigration: boolean;
  enableDualWrite: boolean;
  sqliteDbName?: string;
  pgliteDataDir?: string;
}

// Default configuration
const DEFAULT_CONFIG: DbFactoryConfig = {
  backend: getDefaultBackend(),
  enableMigration: true,
  enableDualWrite: false,
  sqliteDbName: 'farmer-data.sqlite',
  pgliteDataDir: 'idb://farmer-data-collection',
};

// Get default backend from environment or localStorage
function getDefaultBackend(): DatabaseBackend {
  // Check environment variable (Vite)
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_USE_SQLITE_WASM === 'true') {
    return 'sqlite-wasm';
  }
  
  // Check localStorage for user preference
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('db_backend');
    if (stored === 'sqlite-wasm' || stored === 'pglite') {
      return stored;
    }
  }
  
  // Default to SQLite WASM for new installations
  return 'sqlite-wasm';
}

// Migration status
export interface MigrationStatus {
  completed: boolean;
  startedAt: number | null;
  completedAt: number | null;
  tablesProcessed: string[];
  totalRows: number;
  errors: string[];
}

// Global database instance
let dbInstance: LocalDb | null = null;
let currentConfig: DbFactoryConfig = { ...DEFAULT_CONFIG };

// Migration state
const MIGRATION_KEY = 'db_migration_status';

function getMigrationStatus(): MigrationStatus {
  if (typeof localStorage === 'undefined') {
    return { completed: false, startedAt: null, completedAt: null, tablesProcessed: [], totalRows: 0, errors: [] };
  }
  
  const stored = localStorage.getItem(MIGRATION_KEY);
  if (!stored) {
    return { completed: false, startedAt: null, completedAt: null, tablesProcessed: [], totalRows: 0, errors: [] };
  }
  
  try {
    return JSON.parse(stored);
  } catch {
    return { completed: false, startedAt: null, completedAt: null, tablesProcessed: [], totalRows: 0, errors: [] };
  }
}

function setMigrationStatus(status: MigrationStatus): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MIGRATION_KEY, JSON.stringify(status));
  }
}

/**
 * Migrate data from PGlite to SQLite WASM
 */
export async function migrateToSqliteWasm(
  onProgress?: (table: string, rowCount: number) => void
): Promise<MigrationStatus> {
  console.log('[Migration] Starting PGlite to SQLite WASM migration...');
  
  const status: MigrationStatus = {
    completed: false,
    startedAt: Date.now(),
    completedAt: null,
    tablesProcessed: [],
    totalRows: 0,
    errors: [],
  };
  
  setMigrationStatus(status);
  
  try {
    // Create both database instances
    const { PgliteDb } = await loadPgliteModule();
    const pgliteDb = new PgliteDb(currentConfig.pgliteDataDir);
    await pgliteDb.init();
    
    const sqliteDb = new SqliteWasmDb(currentConfig.sqliteDbName);
    await sqliteDb.init();
    
    // Export all data from PGlite
    const allData = await (pgliteDb as any).exportAllData();
    
    // Tables to migrate (in order to respect foreign keys)
    const tables = [
      'farmers',
      'farms',
      'crops',
      'livestock',
      'farm_inputs',
      'harvests',
      'expenses',
      'notifications',
      'gps_tracks',
      '_pending_changes',
      '_replication_checkpoints',
      '_conflicts',
    ];
    
    // Migrate each table
    for (const table of tables) {
      const rows = allData[table] || [];
      
      if (rows.length === 0) {
        console.log(`[Migration] Skipping empty table: ${table}`);
        continue;
      }
      
      console.log(`[Migration] Migrating ${rows.length} rows from ${table}...`);
      
      try {
        await sqliteDb.transaction(async () => {
          for (const row of rows) {
            const columns = Object.keys(row);
            const values = columns.map(col => {
              const val = row[col];
              // Handle JSON/JSONB columns
              if (typeof val === 'object' && val !== null) {
                return JSON.stringify(val);
              }
              // Handle boolean to integer conversion for SQLite
              if (typeof val === 'boolean') {
                return val ? 1 : 0;
              }
              return val;
            });
            
            const placeholders = columns.map(() => '?').join(', ');
            const columnNames = columns.map(col => {
              // Convert camelCase to snake_case if needed
              return col.replace(/([A-Z])/g, '_$1').toLowerCase();
            }).join(', ');
            
            await sqliteDb.run(
              `INSERT OR REPLACE INTO ${table} (${columnNames}) VALUES (${placeholders})`,
              values
            );
          }
        });
        
        status.tablesProcessed.push(table);
        status.totalRows += rows.length;
        
        if (onProgress) {
          onProgress(table, rows.length);
        }
      } catch (error) {
        const errorMsg = `Failed to migrate table ${table}: ${error}`;
        console.error(`[Migration] ${errorMsg}`);
        status.errors.push(errorMsg);
      }
    }
    
    // Close PGlite (we're done with it)
    await pgliteDb.close();
    
    // Mark migration as complete
    status.completed = status.errors.length === 0;
    status.completedAt = Date.now();
    setMigrationStatus(status);
    
    // Update the global database instance to use SQLite
    dbInstance = sqliteDb;
    
    // Store backend preference
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('db_backend', 'sqlite-wasm');
    }
    
    console.log(`[Migration] Migration completed. ${status.totalRows} rows migrated across ${status.tablesProcessed.length} tables.`);
    
    return status;
  } catch (error) {
    status.errors.push(`Migration failed: ${error}`);
    setMigrationStatus(status);
    throw error;
  }
}

/**
 * Check if migration is needed
 */
export function isMigrationNeeded(): boolean {
  const status = getMigrationStatus();
  
  // If already migrated, no need
  if (status.completed) {
    return false;
  }
  
  // Check if PGlite data exists
  if (typeof indexedDB !== 'undefined') {
    // Check for PGlite IndexedDB database
    return new Promise<boolean>((resolve) => {
      const request = indexedDB.open('farmer-data-collection', 1);
      request.onsuccess = () => {
        const db = request.result;
        const hasData = db.objectStoreNames.length > 0;
        db.close();
        resolve(hasData);
      };
      request.onerror = () => resolve(false);
    }) as any; // This is a sync check, actual async check happens in getDatabase
  }
  
  return false;
}

/**
 * Get or create the database instance
 */
export async function getDatabase(config?: Partial<DbFactoryConfig>): Promise<LocalDb> {
  // Merge config with defaults
  if (config) {
    currentConfig = { ...currentConfig, ...config };
  }
  
  // Return existing instance if available
  if (dbInstance && dbInstance.isReady()) {
    return dbInstance;
  }
  
  console.log(`[DbFactory] Creating database with backend: ${currentConfig.backend}`);
  
  // Check if migration is needed
  const migrationStatus = getMigrationStatus();
  
  if (currentConfig.backend === 'sqlite-wasm') {
    // If migration is enabled and not completed, check for PGlite data
    if (currentConfig.enableMigration && !migrationStatus.completed) {
      try {
        // Try to check if PGlite has data
        const { PgliteDb } = await loadPgliteModule();
    const pgliteDb = new PgliteDb(currentConfig.pgliteDataDir);
        await pgliteDb.init();
        const stats = await pgliteDb.getStats();
        
        if (stats.totalRows > 0) {
          console.log(`[DbFactory] Found ${stats.totalRows} rows in PGlite, starting migration...`);
          await migrateToSqliteWasm();
          return dbInstance!;
        } else {
          await pgliteDb.close();
        }
      } catch (error) {
        console.log('[DbFactory] No existing PGlite data found, creating fresh SQLite database');
      }
    }
    
    // Create SQLite WASM database
    dbInstance = await createSqliteWasmDb(currentConfig.sqliteDbName);
  } else {
    // Create PGlite database
    const { createPgliteDb } = await loadPgliteModule();
    dbInstance = await createPgliteDb(currentConfig.pgliteDataDir);
  }
  
  return dbInstance;
}

/**
 * Close the database
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Get current database backend
 */
export function getCurrentBackend(): DatabaseBackend {
  return currentConfig.backend;
}

/**
 * Set database backend (requires restart)
 */
export function setBackend(backend: DatabaseBackend): void {
  currentConfig.backend = backend;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('db_backend', backend);
  }
}

/**
 * Reset migration status (for testing)
 */
export function resetMigrationStatus(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(MIGRATION_KEY);
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  backend: DatabaseBackend;
  stats: { tableCount: number; totalRows: number; pendingChanges: number; lastSync: number | null };
  migrationStatus: MigrationStatus;
}> {
  const db = await getDatabase();
  const stats = await db.getStats();
  
  return {
    backend: currentConfig.backend,
    stats,
    migrationStatus: getMigrationStatus(),
  };
}

// Export for testing
export { getMigrationStatus };
