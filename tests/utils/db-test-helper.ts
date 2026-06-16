/**
 * Database Test Helper
 * Provides utilities for tests that require a live PostgreSQL connection.
 * Tests using this helper will be skipped gracefully when DB is unavailable.
 */
import { describe, it, beforeAll } from 'vitest';

let dbAvailable: boolean | null = null;

/**
 * Check if PostgreSQL is reachable. Caches result for the test run.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  if (dbAvailable !== null) return dbAvailable;
  
  if (!process.env.DATABASE_URL) {
    dbAvailable = false;
    return false;
  }

  try {
    const { getDb } = await import('../../server/db.js');
    const db = await getDb();
    dbAvailable = db !== null;
  } catch {
    dbAvailable = false;
  }
  return dbAvailable;
}

/**
 * Wrapper for describe() that skips the suite if DB is unavailable.
 * Usage: describeWithDb('My Suite', () => { ... })
 */
export function describeWithDb(name: string, fn: () => void) {
  describe(name, () => {
    let skipSuite = false;

    beforeAll(async () => {
      const available = await isDatabaseAvailable();
      if (!available) {
        skipSuite = true;
        console.log(`⏭️  Skipping "${name}" — PostgreSQL not available`);
      }
    });

    // We still define the tests but they'll check skipSuite
    fn();
  });
}
