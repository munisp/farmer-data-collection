type DrizzleDatabase = any;
type PGliteClient = any;

// Create a promise that will resolve to the initialized database
let dbInstance: DrizzleDatabase | null = null;
let clientInstance: PGliteClient | null = null;
let initPromise: Promise<void> | null = null;

async function initializeDatabase() {
  if (!initPromise) {
    initPromise = (async () => {
      const [{ PGlite }, { drizzle }, schema] = await Promise.all([
        import('@electric-sql/pglite'),
        import('drizzle-orm/pglite'),
        import('./schema'),
      ]);

      // Initialize PGlite database (client-side PostgreSQL)
      clientInstance = await PGlite.create({
        dataDir: 'idb://farmer-data-collection',
      });

      // Create Drizzle ORM instance
      dbInstance = drizzle(clientInstance, { schema });
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

export const client = new Proxy({} as PGliteClient, {
  get: () => {
    throw new Error('Client not initialized. Use getClient() instead.');
  },
});
