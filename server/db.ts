import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "../drizzle/schema.js";
import * as financialSchema from "../drizzle/financial-schema.js";
import * as platformExtSchema from "../drizzle/platform-extensions-schema.js";
import { logger } from "./logger.js";

const fullSchema = { ...schema, ...financialSchema, ...platformExtSchema };

export type AppDatabase = ReturnType<typeof drizzle<typeof fullSchema>>;
export type DbClient = AppDatabase;

let _db: AppDatabase | null = null;
let _pool: pkg.Pool | null = null;
let _healthy = false;
let _lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL_MS = 30_000;

// Synchronous db export for services that need direct access
// Note: This will be null until getDb() is called at least once
export { _db as db };

function buildPoolConfig() {
  return {
    connectionString: process.env.DATABASE_URL,
    max: parseInt(process.env.DB_POOL_MAX || "20", 10),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || "30000", 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || "5000", 10),
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || "30000", 10),
    allowExitOnIdle: false,
  };
}

export async function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.error("[Database] DATABASE_URL environment variable not set");
    return null;
  }

  if (!_db) {
    try {
      const poolConfig = buildPoolConfig();
      _pool = new Pool(poolConfig);

      _pool.on("error", (err) => {
        logger.error("[Database] Pool error", { error: err.message });
        _healthy = false;
      });

      _pool.on("connect", () => {
        _healthy = true;
      });

      // Verify connectivity with a probe query
      const client = await _pool.connect();
      await client.query("SELECT 1");
      client.release();

      _db = drizzle(_pool, { schema: fullSchema });
      _healthy = true;
      _lastHealthCheck = Date.now();
      startPoolMonitor();
      logger.info("[Database] Connected to PostgreSQL", {
        maxPool: poolConfig.max,
        host: databaseUrl.replace(/:[^:@]+@/, ":***@").split("?")[0],
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("[Database] Failed to connect", { error: errMsg });
      _db = null;
      _pool = null;
      _healthy = false;
    }
  }
  return _db;
}

export async function checkDbHealth(): Promise<{
  healthy: boolean;
  poolSize: number;
  idleCount: number;
  waitingCount: number;
}> {
  if (!_pool) {
    return { healthy: false, poolSize: 0, idleCount: 0, waitingCount: 0 };
  }

  const now = Date.now();
  if (now - _lastHealthCheck < HEALTH_CHECK_INTERVAL_MS && _healthy) {
    return {
      healthy: true,
      poolSize: _pool.totalCount,
      idleCount: _pool.idleCount,
      waitingCount: _pool.waitingCount,
    };
  }

  try {
    const client = await _pool.connect();
    await client.query("SELECT 1");
    client.release();
    _healthy = true;
    _lastHealthCheck = now;
  } catch (err) {
    _healthy = false;
  }

  return {
    healthy: _healthy,
    poolSize: _pool.totalCount,
    idleCount: _pool.idleCount,
    waitingCount: _pool.waitingCount,
  };
}

export function isDbHealthy(): boolean {
  return _healthy;
}

export function getPool(): pkg.Pool | null {
  return _pool;
}

let _monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startPoolMonitor(intervalMs = 60_000): void {
  if (_monitorInterval) return;
  _monitorInterval = setInterval(async () => {
    if (!_pool) return;
    const stats = {
      total: _pool.totalCount,
      idle: _pool.idleCount,
      waiting: _pool.waitingCount,
    };
    logger.info("[Database] Pool stats", stats);
    if (stats.waiting > 5) {
      logger.warn("[Database] High pool wait queue", stats);
    }
    if (stats.idle === 0 && stats.total >= parseInt(process.env.DB_POOL_MAX || "20", 10)) {
      logger.warn("[Database] Pool exhausted", stats);
    }
  }, intervalMs);
}

export function stopPoolMonitor(): void {
  if (_monitorInterval) {
    clearInterval(_monitorInterval);
    _monitorInterval = null;
  }
}

export async function closeDb() {
  stopPoolMonitor();
  if (_pool) {
    logger.info("[Database] Closing connection pool...");
    await _pool.end();
    _pool = null;
    _db = null;
    _healthy = false;
    logger.info("[Database] Connection pool closed");
  }
}
