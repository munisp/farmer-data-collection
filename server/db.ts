import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "../drizzle/schema.js";
import * as financialSchema from "../drizzle/financial-schema.js";
import * as platformExtSchema from "../drizzle/platform-extensions-schema.js";
import * as schemaPlatformExtended from "../drizzle/schema-platform-extended.js";
import * as supplyChainSchema from "../drizzle/supply-chain-schema.js";
import * as cooperativeSchema from "../drizzle/cooperative-schema.js";
import * as creditScoringSchema from "../drizzle/credit-scoring-schema.js";
import * as traceabilitySchema from "../drizzle/traceability-schema.js";
import * as ledgerSchema from "../drizzle/ledger-schema.js";
import * as disbursementSchema from "../drizzle/disbursement-schema.js";
import * as loanApplicationSchema from "../drizzle/loan-application-schema.js";
import * as notificationSchema from "../drizzle/notification-schema.js";
import * as userPreferencesSchema from "../drizzle/user-preferences-schema.js";
import * as userJourneySchema from "../drizzle/user-journey-schema.js";
import * as agentProductivitySchema from "../drizzle/agent-productivity-schema.js";
import * as alertThresholdsSchema from "../drizzle/alert-thresholds-schema.js";
import * as smsLogsSchema from "../drizzle/sms-logs-schema.js";
import * as smsResponsesSchema from "../drizzle/sms-responses-schema.js";
import * as smsTemplatesSchema from "../drizzle/sms-templates-schema.js";
import * as dairySchema from "../drizzle/schema-dairy.js";
import * as mlModelsSchema from "../drizzle/schema-ml-models.js";
import * as spatialAnalysisSchema from "../drizzle/schema-spatial-analysis.js";
import * as subsidySchema from "../drizzle/schema-subsidy.js";
import * as agriculturalIntelligenceSchema from "../drizzle/schema-agricultural-intelligence.js";
import * as exportSchedulesSchema from "../drizzle/schema-export-schedules.js";
import * as precisionAgricultureSchema from "../drizzle/precision-agriculture-schema.js";
import * as distributorSchema from "../drizzle/distributor-schema.js";
import * as exchangeSchema from "../drizzle/exchange-schema.js";
import * as kycSchema from "../drizzle/kyc-schema.js";
import * as gpsModelsSchema from "../drizzle/schema-gps-models.js";
import { logger } from "./logger.js";

const fullSchema = {
  ...schema,
  ...financialSchema,
  ...platformExtSchema,
  ...schemaPlatformExtended,
  ...supplyChainSchema,
  ...cooperativeSchema,
  ...creditScoringSchema,
  ...traceabilitySchema,
  ...ledgerSchema,
  ...disbursementSchema,
  ...loanApplicationSchema,
  ...notificationSchema,
  ...userPreferencesSchema,
  ...userJourneySchema,
  ...agentProductivitySchema,
  ...alertThresholdsSchema,
  ...smsLogsSchema,
  ...smsResponsesSchema,
  ...smsTemplatesSchema,
  ...dairySchema,
  ...mlModelsSchema,
  ...spatialAnalysisSchema,
  ...subsidySchema,
  ...agriculturalIntelligenceSchema,
  ...exportSchedulesSchema,
  ...precisionAgricultureSchema,
  ...distributorSchema,
  ...exchangeSchema,
  ...kycSchema,
  ...gpsModelsSchema,
};

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
        schemas: Object.keys(fullSchema).length + " tables registered",
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
  latencyMs?: number;
  poolStats?: { total: number; idle: number; waiting: number };
}> {
  if (!_pool) return { healthy: false };
  const now = Date.now();
  if (_healthy && now - _lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
    return { healthy: true, poolStats: { total: _pool.totalCount, idle: _pool.idleCount, waiting: _pool.waitingCount } };
  }
  try {
    const start = Date.now();
    const client = await _pool.connect();
    await client.query("SELECT 1");
    client.release();
    const latencyMs = Date.now() - start;
    _healthy = true;
    _lastHealthCheck = now;
    return { healthy: true, latencyMs, poolStats: { total: _pool.totalCount, idle: _pool.idleCount, waiting: _pool.waitingCount } };
  } catch {
    _healthy = false;
    return { healthy: false };
  }
}

export async function closeDb() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
    _healthy = false;
    logger.info("[Database] Connection pool closed");
  }
}

function startPoolMonitor() {
  setInterval(async () => {
    if (_pool) {
      const waiting = _pool.waitingCount;
      if (waiting > 5) {
        logger.warn("[Database] High pool wait count", { waiting, total: _pool.totalCount, idle: _pool.idleCount });
      }
    }
  }, 60_000);
}
