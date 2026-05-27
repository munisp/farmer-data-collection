import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "../drizzle/schema.js";
import * as financialSchema from "../drizzle/financial-schema.js";

const fullSchema = { ...schema, ...financialSchema };

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: pkg.Pool | null = null;

// Synchronous db export for services that need direct access
// Note: This will be null until getDb() is called at least once
export { _db as db };

export async function getDb() {
  // Use PostgreSQL from DATABASE_URL environment variable
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[Database] DATABASE_URL environment variable not set");
    return null;
  }
  
  if (!_db) {
    try {
      // Create PostgreSQL connection pool
      _pool = new Pool({
        connectionString: databaseUrl,
      });
      _db = drizzle(_pool, { schema: fullSchema });
      console.log("[Database] Connected to PostgreSQL database");
    } catch (error) {
      console.error("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

export async function closeDb() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
