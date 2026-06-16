/**
 * Database Factory
 * 
 * Provides a unified interface for creating and managing local databases.
 * Uses SQLite WASM + OPFS as the sole backend for client-side storage.
 */

import type { LocalDb } from './localDb';
import { createSqliteWasmDb } from './sqliteWasmDb';

// Database backend type
export type DatabaseBackend = 'sqlite-wasm';

// Configuration for database factory
export interface DbFactoryConfig {
  backend: DatabaseBackend;
  sqliteDbName?: string;
}

// Default configuration
const DEFAULT_CONFIG: DbFactoryConfig = {
  backend: 'sqlite-wasm',
  sqliteDbName: 'farmer-data.sqlite',
};

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
  } catch (err) {
    console.warn('[DbFactory] Failed to parse migration status:', String(err));
    return { completed: false, startedAt: null, completedAt: null, tablesProcessed: [], totalRows: 0, errors: [] };
  }
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
  
  console.warn(`[DbFactory] Creating SQLite WASM database`);
  
  // Create SQLite WASM database
  dbInstance = await createSqliteWasmDb(currentConfig.sqliteDbName);
  
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
 * Reset migration status (for testing)
 */
export function resetMigrationStatus(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(MIGRATION_KEY);
  }
}

/**
 * Migrate to SQLite WASM (no-op, kept for API compatibility)
 */
export async function migrateToSqliteWasm(
  _onProgress?: (table: string, rowCount: number) => void
): Promise<MigrationStatus> {
  return {
    completed: true,
    startedAt: Date.now(),
    completedAt: Date.now(),
    tablesProcessed: [],
    totalRows: 0,
    errors: [],
  };
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
