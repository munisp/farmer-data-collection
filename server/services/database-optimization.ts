/**
 * Database Optimization Service
 * Provides connection pooling, read replicas, and query optimization
 */

import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../logger.js';

interface DatabaseConfig {
  primary: PoolConfig;
  readReplicas?: PoolConfig[];
  maxPoolSize?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

interface QueryOptions {
  useReadReplica?: boolean;
  timeout?: number;
}

// Connection pool manager
export class DatabasePoolManager {
  private primaryPool: Pool;
  private replicaPools: Pool[] = [];
  private currentReplicaIndex: number = 0;

  constructor(config: DatabaseConfig) {
    // Primary pool configuration
    const primaryConfig: PoolConfig = {
      ...config.primary,
      max: config.maxPoolSize || 20,
      idleTimeoutMillis: config.idleTimeoutMs || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMs || 5000,
    };

    this.primaryPool = new Pool(primaryConfig);

    // Set up error handling
    this.primaryPool.on('error', (err) => {
      logger.error('Primary pool error:', err);
    });

    // Read replica pools
    if (config.readReplicas && config.readReplicas.length > 0) {
      for (const replicaConfig of config.readReplicas) {
        const pool = new Pool({
          ...replicaConfig,
          max: config.maxPoolSize || 20,
          idleTimeoutMillis: config.idleTimeoutMs || 30000,
          connectionTimeoutMillis: config.connectionTimeoutMs || 5000,
        });

        pool.on('error', (err) => {
          logger.error('Replica pool error:', err);
        });

        this.replicaPools.push(pool);
      }
    }
  }

  // Get primary pool for writes
  getPrimaryPool(): Pool {
    return this.primaryPool;
  }

  // Get read replica pool (round-robin)
  getReadPool(): Pool {
    if (this.replicaPools.length === 0) {
      return this.primaryPool;
    }

    const pool = this.replicaPools[this.currentReplicaIndex];
    this.currentReplicaIndex = (this.currentReplicaIndex + 1) % this.replicaPools.length;
    return pool;
  }

  // Execute query with automatic pool selection
  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    const pool = options.useReadReplica ? this.getReadPool() : this.primaryPool;
    
    const client = await pool.connect();
    try {
      if (options.timeout) {
        await client.query(`SET statement_timeout = ${options.timeout}`);
      }
      return await client.query<T>(sql, params);
    } finally {
      client.release();
    }
  }

  // Transaction support
  async transaction<T>(
    callback: (client: any) => Promise<T>
  ): Promise<T> {
    const client = await this.primaryPool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Health check
  async healthCheck(): Promise<{
    primary: boolean;
    replicas: boolean[];
  }> {
    const primaryHealth = await this.checkPoolHealth(this.primaryPool);
    const replicaHealth = await Promise.all(
      this.replicaPools.map(pool => this.checkPoolHealth(pool))
    );

    return {
      primary: primaryHealth,
      replicas: replicaHealth,
    };
  }

  private async checkPoolHealth(pool: Pool): Promise<boolean> {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (err) {
      return false;
    }
  }

  // Pool statistics
  getPoolStats(): {
    primary: { total: number; idle: number; waiting: number };
    replicas: Array<{ total: number; idle: number; waiting: number }>;
  } {
    return {
      primary: {
        total: this.primaryPool.totalCount,
        idle: this.primaryPool.idleCount,
        waiting: this.primaryPool.waitingCount,
      },
      replicas: this.replicaPools.map(pool => ({
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      })),
    };
  }

  // Cleanup
  async close(): Promise<void> {
    await this.primaryPool.end();
    await Promise.all(this.replicaPools.map(pool => pool.end()));
  }
}

// Index recommendations based on common query patterns
export const recommendedIndexes = [
  // Farmers table
  {
    table: 'farmers',
    columns: ['created_at'],
    name: 'idx_farmers_created_at',
    sql: 'CREATE INDEX IF NOT EXISTS idx_farmers_created_at ON farmers (created_at DESC);',
  },
  {
    table: 'farmers',
    columns: ['status'],
    name: 'idx_farmers_status',
    sql: 'CREATE INDEX IF NOT EXISTS idx_farmers_status ON farmers (status);',
  },
  {
    table: 'farmers',
    columns: ['region', 'district'],
    name: 'idx_farmers_location',
    sql: 'CREATE INDEX IF NOT EXISTS idx_farmers_location ON farmers (region, district);',
  },
  {
    table: 'farmers',
    columns: ['phone'],
    name: 'idx_farmers_phone',
    sql: 'CREATE INDEX IF NOT EXISTS idx_farmers_phone ON farmers (phone);',
  },

  // Loan applications table
  {
    table: 'loan_applications',
    columns: ['farmer_id'],
    name: 'idx_loan_applications_farmer_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_loan_applications_farmer_id ON loan_applications (farmer_id);',
  },
  {
    table: 'loan_applications',
    columns: ['status'],
    name: 'idx_loan_applications_status',
    sql: 'CREATE INDEX IF NOT EXISTS idx_loan_applications_status ON loan_applications (status);',
  },
  {
    table: 'loan_applications',
    columns: ['created_at'],
    name: 'idx_loan_applications_created_at',
    sql: 'CREATE INDEX IF NOT EXISTS idx_loan_applications_created_at ON loan_applications (created_at DESC);',
  },
  {
    table: 'loan_applications',
    columns: ['status', 'created_at'],
    name: 'idx_loan_applications_status_created',
    sql: 'CREATE INDEX IF NOT EXISTS idx_loan_applications_status_created ON loan_applications (status, created_at DESC);',
  },

  // Harvests table
  {
    table: 'harvests',
    columns: ['farmer_id'],
    name: 'idx_harvests_farmer_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_harvests_farmer_id ON harvests (farmer_id);',
  },
  {
    table: 'harvests',
    columns: ['farm_id'],
    name: 'idx_harvests_farm_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_harvests_farm_id ON harvests (farm_id);',
  },
  {
    table: 'harvests',
    columns: ['harvest_date'],
    name: 'idx_harvests_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_harvests_date ON harvests (harvest_date DESC);',
  },

  // Transactions table
  {
    table: 'transactions',
    columns: ['farmer_id'],
    name: 'idx_transactions_farmer_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_transactions_farmer_id ON transactions (farmer_id);',
  },
  {
    table: 'transactions',
    columns: ['created_at'],
    name: 'idx_transactions_created_at',
    sql: 'CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);',
  },
  {
    table: 'transactions',
    columns: ['type', 'status'],
    name: 'idx_transactions_type_status',
    sql: 'CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON transactions (type, status);',
  },

  // Marketplace listings
  {
    table: 'marketplace_listings',
    columns: ['status', 'created_at'],
    name: 'idx_listings_status_created',
    sql: 'CREATE INDEX IF NOT EXISTS idx_listings_status_created ON marketplace_listings (status, created_at DESC);',
  },
  {
    table: 'marketplace_listings',
    columns: ['seller_id'],
    name: 'idx_listings_seller_id',
    sql: 'CREATE INDEX IF NOT EXISTS idx_listings_seller_id ON marketplace_listings (seller_id);',
  },
  {
    table: 'marketplace_listings',
    columns: ['category'],
    name: 'idx_listings_category',
    sql: 'CREATE INDEX IF NOT EXISTS idx_listings_category ON marketplace_listings (category);',
  },

  // Exchange orders
  {
    table: 'exchange_orders',
    columns: ['commodity_id', 'side', 'status'],
    name: 'idx_exchange_orders_commodity_side_status',
    sql: 'CREATE INDEX IF NOT EXISTS idx_exchange_orders_commodity_side_status ON exchange_orders (commodity_id, side, status);',
  },
  {
    table: 'exchange_orders',
    columns: ['user_id', 'status'],
    name: 'idx_exchange_orders_user_status',
    sql: 'CREATE INDEX IF NOT EXISTS idx_exchange_orders_user_status ON exchange_orders (user_id, status);',
  },

  // Sync queue
  {
    table: 'sync_queue',
    columns: ['user_id', 'synced'],
    name: 'idx_sync_queue_user_synced',
    sql: 'CREATE INDEX IF NOT EXISTS idx_sync_queue_user_synced ON sync_queue (user_id, synced);',
  },
  {
    table: 'sync_queue',
    columns: ['created_at'],
    name: 'idx_sync_queue_created_at',
    sql: 'CREATE INDEX IF NOT EXISTS idx_sync_queue_created_at ON sync_queue (created_at);',
  },
];

// Apply all recommended indexes
export async function applyRecommendedIndexes(pool: Pool): Promise<{
  applied: string[];
  failed: Array<{ name: string; error: string }>;
}> {
  const applied: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const index of recommendedIndexes) {
    try {
      await pool.query(index.sql);
      applied.push(index.name);
    } catch (error: unknown) {
      failed.push({ name: index.name, error: (error instanceof Error ? error.message : String(error)) });
    }
  }

  return { applied, failed };
}

// Query analyzer for slow query detection
export class QueryAnalyzer {
  private slowQueryThreshold: number;
  private slowQueries: Array<{
    sql: string;
    duration: number;
    timestamp: Date;
  }> = [];

  constructor(slowQueryThresholdMs: number = 1000) {
    this.slowQueryThreshold = slowQueryThresholdMs;
  }

  async analyzeQuery<T extends QueryResultRow = QueryResultRow>(
    pool: Pool,
    sql: string,
    params?: unknown[]
  ): Promise<{ result: QueryResult<T>; duration: number; explain?: any }> {
    const start = Date.now();
    const result = await pool.query<T>(sql, params);
    const duration = Date.now() - start;

    if (duration > this.slowQueryThreshold) {
      this.slowQueries.push({
        sql,
        duration,
        timestamp: new Date(),
      });

      // Get query plan for slow queries
      try {
        const explainResult = await pool.query(`EXPLAIN ANALYZE ${sql}`, params);
        return { result, duration, explain: explainResult.rows };
      } catch (err) {
        return { result, duration };
      }
    }

    return { result, duration };
  }

  getSlowQueries(): Array<{ sql: string; duration: number; timestamp: Date }> {
    return [...this.slowQueries];
  }

  clearSlowQueries(): void {
    this.slowQueries = [];
  }
}

// Database maintenance utilities
export class DatabaseMaintenance {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // Vacuum analyze tables
  async vacuumAnalyze(tables?: string[]): Promise<void> {
    if (tables && tables.length > 0) {
      for (const table of tables) {
        await this.pool.query(`VACUUM ANALYZE ${table}`);
      }
    } else {
      await this.pool.query('VACUUM ANALYZE');
    }
  }

  // Reindex tables
  async reindex(tables?: string[]): Promise<void> {
    if (tables && tables.length > 0) {
      for (const table of tables) {
        await this.pool.query(`REINDEX TABLE ${table}`);
      }
    } else {
      await this.pool.query('REINDEX DATABASE CONCURRENTLY');
    }
  }

  // Get table statistics
  async getTableStats(): Promise<Array<{
    table: string;
    rowCount: number;
    totalSize: string;
    indexSize: string;
  }>> {
    const result = await this.pool.query(`
      SELECT
        relname as table,
        n_live_tup as row_count,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size,
        pg_size_pretty(pg_indexes_size(relid)) as index_size
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
    `);

    return result.rows.map(row => ({
      table: row.table,
      rowCount: parseInt(row.row_count, 10),
      totalSize: row.total_size,
      indexSize: row.index_size,
    }));
  }

  // Get index usage statistics
  async getIndexUsage(): Promise<Array<{
    table: string;
    index: string;
    scans: number;
    size: string;
  }>> {
    const result = await this.pool.query(`
      SELECT
        schemaname || '.' || relname as table,
        indexrelname as index,
        idx_scan as scans,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
    `);

    return result.rows.map(row => ({
      table: row.table,
      index: row.index,
      scans: parseInt(row.scans, 10),
      size: row.size,
    }));
  }

  // Find unused indexes
  async findUnusedIndexes(): Promise<Array<{
    table: string;
    index: string;
    size: string;
  }>> {
    const result = await this.pool.query(`
      SELECT
        schemaname || '.' || relname as table,
        indexrelname as index,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      WHERE idx_scan = 0
        AND indexrelname NOT LIKE '%_pkey'
      ORDER BY pg_relation_size(indexrelid) DESC
    `);

    return result.rows.map(row => ({
      table: row.table,
      index: row.index,
      size: row.size,
    }));
  }

  // Get connection statistics
  async getConnectionStats(): Promise<{
    active: number;
    idle: number;
    waiting: number;
    maxConnections: number;
  }> {
    const result = await this.pool.query(`
      SELECT
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) FILTER (WHERE wait_event IS NOT NULL) as waiting,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);

    const row = result.rows[0];
    return {
      active: parseInt(row.active, 10),
      idle: parseInt(row.idle, 10),
      waiting: parseInt(row.waiting, 10),
      maxConnections: parseInt(row.max_connections, 10),
    };
  }
}

// Factory function
export function createDatabasePoolManager(config?: Partial<DatabaseConfig>): DatabasePoolManager {
  const defaultConfig: DatabaseConfig = {
    primary: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      database: process.env.DATABASE_NAME || 'agrifinance',
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || '',
    },
    readReplicas: process.env.DATABASE_REPLICA_HOSTS
      ? process.env.DATABASE_REPLICA_HOSTS.split(',').map(host => ({
          host: host.trim(),
          port: parseInt(process.env.DATABASE_PORT || '5432', 10),
          database: process.env.DATABASE_NAME || 'agrifinance',
          user: process.env.DATABASE_USER || 'postgres',
          password: process.env.DATABASE_PASSWORD || '',
        }))
      : undefined,
    maxPoolSize: parseInt(process.env.DATABASE_POOL_SIZE || '20', 10),
    idleTimeoutMs: 30000,
    connectionTimeoutMs: 5000,
  };

  return new DatabasePoolManager({ ...defaultConfig, ...config });
}

export default {
  DatabasePoolManager,
  QueryAnalyzer,
  DatabaseMaintenance,
  recommendedIndexes,
  applyRecommendedIndexes,
  createDatabasePoolManager,
};
