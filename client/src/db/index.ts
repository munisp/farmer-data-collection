import { getDatabase } from './dbFactory';
import type { LocalDb } from './localDb';

type DrizzleDatabase = any;

let dbInstance: DrizzleDatabase | null = null;
let clientInstance: LocalDb | null = null;
let initPromise: Promise<void> | null = null;

async function initializeDatabase() {
  if (!initPromise) {
    initPromise = (async () => {
      // Use SQLite WASM database via dbFactory
      clientInstance = await getDatabase();

      // The LocalDb instance serves as both client and db
      dbInstance = clientInstance;
    })();
  }

  return initPromise;
}

// Export a function to get the database instance
export async function getDb() {
  await initializeDatabase();
  if (!dbInstance) {
    throw new Error('Database not initialized');
  }
  return dbInstance;
}

// Export a function to get the client instance
export async function getClient() {
  await initializeDatabase();
  if (!clientInstance) {
    throw new Error('Client not initialized');
  }
  return clientInstance;
}

// For backward compatibility, export a db object that throws if used before initialization
export const db = new Proxy({} as DrizzleDatabase, {
  get: () => {
    throw new Error('Database not initialized. Use getDb() instead.');
  },
});

export const client = new Proxy({} as LocalDb, {
  get: () => {
    throw new Error('Client not initialized. Use getClient() instead.');
  },
});
