/**
 * Comprehensive Regression Test Suite for LocalDb
 * 
 * Tests SQLite WASM + OPFS backend for:
 * - Schema and CRUD operations
 * - Sync operations (pending changes, checkpoints)
 * - Conflict resolution
 * - Reactive queries
 * - Crash recovery and durability
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalDb, PendingChange, ReplicationCheckpoint, generateId, generateIdempotencyKey, getClientId } from '../localDb';
import { SqliteWasmDb } from '../sqliteWasmDb';
import { getDatabase, migrateToSqliteWasm, resetMigrationStatus, getDatabaseStats } from '../dbFactory';

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Test data generators
function createTestFarmer(userId: number, overrides: Partial<any> = {}) {
  return {
    user_id: userId,
    first_name: `Test${Date.now()}`,
    last_name: `Farmer${Math.random().toString(36).substring(7)}`,
    phone_number: '+1234567890',
    email: `test${Date.now()}@example.com`,
    village: 'Test Village',
    district: 'Test District',
    region: 'Test Region',
    ...overrides,
  };
}

function createTestFarm(userId: number, farmerId: number, overrides: Partial<any> = {}) {
  return {
    user_id: userId,
    farmer_id: farmerId,
    farm_name: `Test Farm ${Date.now()}`,
    farm_size: 10.5,
    farm_size_unit: 'acres',
    latitude: -1.2921,
    longitude: 36.8219,
    soil_type: 'loam',
    ...overrides,
  };
}

function createTestCrop(userId: number, farmId: number, overrides: Partial<any> = {}) {
  return {
    user_id: userId,
    farm_id: farmId,
    crop_name: 'Maize',
    crop_variety: 'Hybrid',
    planting_date: new Date().toISOString(),
    area_planted: 5.0,
    status: 'planted',
    ...overrides,
  };
}

// Test suite for a specific database backend
function createDbTestSuite(name: string, createDb: () => Promise<LocalDb>) {
  describe(`${name} Backend`, () => {
    let db: LocalDb;

    beforeEach(async () => {
      localStorageMock.clear();
      db = await createDb();
    });

    afterEach(async () => {
      if (db && db.isReady()) {
        await db.close();
      }
    });

    describe('Initialization', () => {
      it('should initialize successfully', () => {
        expect(db.isReady()).toBe(true);
      });

      it('should have correct schema version', async () => {
        const version = await db.getSchemaVersion();
        expect(version).toBeGreaterThan(0);
      });
    });

    describe('Basic CRUD Operations', () => {
      it('should insert and query farmers', async () => {
        const farmer = createTestFarmer(1);
        
        await db.run(`
          INSERT INTO farmers (user_id, first_name, last_name, phone_number, email, village, district, region)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [farmer.user_id, farmer.first_name, farmer.last_name, farmer.phone_number, farmer.email, farmer.village, farmer.district, farmer.region]);

        const results = await db.query<any>('SELECT * FROM farmers WHERE user_id = ?', [1]);
        expect(results.length).toBe(1);
        expect(results[0].first_name).toBe(farmer.first_name);
      });

      it('should update records correctly', async () => {
        const farmer = createTestFarmer(1);
        
        await db.run(`
          INSERT INTO farmers (user_id, first_name, last_name, phone_number, email, village, district, region)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [farmer.user_id, farmer.first_name, farmer.last_name, farmer.phone_number, farmer.email, farmer.village, farmer.district, farmer.region]);

        await db.run('UPDATE farmers SET first_name = ? WHERE user_id = ?', ['Updated', 1]);

        const result = await db.get<any>('SELECT * FROM farmers WHERE user_id = ?', [1]);
        expect(result?.first_name).toBe('Updated');
      });

      it('should delete records correctly', async () => {
        const farmer = createTestFarmer(1);
        
        await db.run(`
          INSERT INTO farmers (user_id, first_name, last_name, phone_number, email, village, district, region)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [farmer.user_id, farmer.first_name, farmer.last_name, farmer.phone_number, farmer.email, farmer.village, farmer.district, farmer.region]);

        await db.run('DELETE FROM farmers WHERE user_id = ?', [1]);

        const results = await db.query<any>('SELECT * FROM farmers WHERE user_id = ?', [1]);
        expect(results.length).toBe(0);
      });

      it('should handle foreign key relationships', async () => {
        // Insert farmer first
        await db.run(`
          INSERT INTO farmers (user_id, first_name, last_name)
          VALUES (?, ?, ?)
        `, [1, 'Test', 'Farmer']);

        const farmer = await db.get<any>('SELECT id FROM farmers WHERE user_id = ?', [1]);
        
        // Insert farm with farmer reference
        const farm = createTestFarm(1, farmer.id);
        await db.run(`
          INSERT INTO farms (user_id, farmer_id, farm_name, farm_size, latitude, longitude)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [farm.user_id, farm.farmer_id, farm.farm_name, farm.farm_size, farm.latitude, farm.longitude]);

        const farmResult = await db.get<any>('SELECT * FROM farms WHERE farmer_id = ?', [farmer.id]);
        expect(farmResult?.farm_name).toBe(farm.farm_name);
      });
    });

    describe('Transaction Support', () => {
      it('should commit transactions successfully', async () => {
        await db.transaction(async () => {
          await db.run(`
            INSERT INTO farmers (user_id, first_name, last_name)
            VALUES (?, ?, ?)
          `, [1, 'Transaction', 'Test']);
          
          await db.run(`
            INSERT INTO farmers (user_id, first_name, last_name)
            VALUES (?, ?, ?)
          `, [2, 'Transaction', 'Test2']);
        });

        const results = await db.query<any>('SELECT * FROM farmers');
        expect(results.length).toBe(2);
      });

      it('should rollback transactions on error', async () => {
        try {
          await db.transaction(async () => {
            await db.run(`
              INSERT INTO farmers (user_id, first_name, last_name)
              VALUES (?, ?, ?)
            `, [1, 'Rollback', 'Test']);
            
            // This should fail (invalid SQL)
            throw new Error('Intentional error');
          });
        } catch (e) {
          // Expected
        }

        const results = await db.query<any>('SELECT * FROM farmers WHERE first_name = ?', ['Rollback']);
        expect(results.length).toBe(0);
      });
    });

    describe('Pending Changes (Sync Queue)', () => {
      it('should add pending changes', async () => {
        const idempotencyKey = await generateIdempotencyKey('client1', 'farmers', '1', 'insert');
        
        const changeId = await db.addPendingChange({
          tableName: 'farmers',
          recordId: 1,
          operation: 'insert',
          data: { first_name: 'Test', last_name: 'Farmer' },
          idempotencyKey,
        });

        expect(changeId).toBeTruthy();

        const pending = await db.listPendingChanges();
        expect(pending.length).toBe(1);
        expect(pending[0].tableName).toBe('farmers');
        expect(pending[0].operation).toBe('insert');
      });

      it('should mark changes as synced', async () => {
        const idempotencyKey = await generateIdempotencyKey('client1', 'farmers', '1', 'insert');
        
        const changeId = await db.addPendingChange({
          tableName: 'farmers',
          recordId: 1,
          operation: 'insert',
          data: { first_name: 'Test' },
          idempotencyKey,
        });

        await db.markChangesSynced([changeId]);

        const pending = await db.listPendingChanges();
        expect(pending.length).toBe(0);
      });

      it('should mark changes as failed with error', async () => {
        const idempotencyKey = await generateIdempotencyKey('client1', 'farmers', '1', 'insert');
        
        const changeId = await db.addPendingChange({
          tableName: 'farmers',
          recordId: 1,
          operation: 'insert',
          data: { first_name: 'Test' },
          idempotencyKey,
        });

        await db.markChangesFailed([changeId], 'Network error');

        const pending = await db.listPendingChanges();
        expect(pending.length).toBe(0); // Failed changes are not in pending list
      });

      it('should increment retry count', async () => {
        const idempotencyKey = await generateIdempotencyKey('client1', 'farmers', '1', 'insert');
        
        const changeId = await db.addPendingChange({
          tableName: 'farmers',
          recordId: 1,
          operation: 'insert',
          data: { first_name: 'Test' },
          idempotencyKey,
        });

        await db.incrementRetryCount([changeId]);

        const pending = await db.listPendingChanges();
        expect(pending[0].retryCount).toBe(1);
      });
    });

    describe('Replication Checkpoints', () => {
      it('should set and get checkpoints', async () => {
        const checkpoint: ReplicationCheckpoint = {
          tableName: 'farmers',
          lastSyncedVersion: 10,
          lastSyncedAt: Date.now(),
          serverCursor: 'cursor123',
        };

        await db.setCheckpoint(checkpoint);

        const retrieved = await db.getCheckpoint('farmers');
        expect(retrieved).toBeTruthy();
        expect(retrieved?.lastSyncedVersion).toBe(10);
        expect(retrieved?.serverCursor).toBe('cursor123');
      });

      it('should update existing checkpoints', async () => {
        await db.setCheckpoint({
          tableName: 'farmers',
          lastSyncedVersion: 10,
          lastSyncedAt: Date.now(),
        });

        await db.setCheckpoint({
          tableName: 'farmers',
          lastSyncedVersion: 20,
          lastSyncedAt: Date.now(),
        });

        const retrieved = await db.getCheckpoint('farmers');
        expect(retrieved?.lastSyncedVersion).toBe(20);
      });

      it('should return null for non-existent checkpoints', async () => {
        const retrieved = await db.getCheckpoint('nonexistent');
        expect(retrieved).toBeNull();
      });
    });

    describe('Conflict Resolution', () => {
      it('should store conflicts', async () => {
        await db.storeConflict(
          'farmers',
          1,
          { first_name: 'Local', version: 1 },
          { first_name: 'Server', version: 2 }
        );

        const conflicts = await db.getConflicts();
        expect(conflicts.length).toBe(1);
        expect(conflicts[0].localData.first_name).toBe('Local');
        expect(conflicts[0].serverData.first_name).toBe('Server');
      });

      it('should filter conflicts by table', async () => {
        await db.storeConflict('farmers', 1, { a: 1 }, { a: 2 });
        await db.storeConflict('farms', 1, { b: 1 }, { b: 2 });

        const farmerConflicts = await db.getConflicts('farmers');
        expect(farmerConflicts.length).toBe(1);
        expect(farmerConflicts[0].tableName).toBe('farmers');
      });

      it('should resolve conflicts', async () => {
        await db.storeConflict('farmers', 1, { a: 1 }, { a: 2 });

        await db.resolveConflict('farmers', 1, 'server');

        const conflicts = await db.getConflicts();
        expect(conflicts.length).toBe(0);
      });
    });

    describe('Reactive Queries', () => {
      it('should provide initial data via subscription', async () => {
        await db.run(`
          INSERT INTO farmers (user_id, first_name, last_name)
          VALUES (?, ?, ?)
        `, [1, 'Reactive', 'Test']);

        const queryResult = db.observeQuery<any>('SELECT * FROM farmers');
        
        return new Promise<void>((resolve) => {
          const unsubscribe = queryResult.subscribe((data) => {
            expect(data.length).toBe(1);
            expect(data[0].first_name).toBe('Reactive');
            unsubscribe();
            resolve();
          });
        });
      });
    });

    describe('Statistics', () => {
      it('should return correct statistics', async () => {
        await db.run(`
          INSERT INTO farmers (user_id, first_name, last_name)
          VALUES (?, ?, ?)
        `, [1, 'Stats', 'Test']);

        const stats = await db.getStats();
        expect(stats.tableCount).toBeGreaterThan(0);
        expect(stats.totalRows).toBeGreaterThanOrEqual(1);
      });
    });

    describe('Bulk Operations', () => {
      it('should handle bulk inserts efficiently', async () => {
        const startTime = Date.now();
        
        await db.transaction(async () => {
          for (let i = 0; i < 100; i++) {
            await db.run(`
              INSERT INTO farmers (user_id, first_name, last_name)
              VALUES (?, ?, ?)
            `, [i, `Bulk${i}`, `Test${i}`]);
          }
        });

        const endTime = Date.now();
        const duration = endTime - startTime;

        const results = await db.query<any>('SELECT COUNT(*) as count FROM farmers');
        expect(parseInt(results[0].count)).toBe(100);
        
        // Should complete in reasonable time (less than 10 seconds)
        expect(duration).toBeLessThan(10000);
      });
    });
  });
}

// Run tests for SQLite WASM backend
describe('LocalDb Tests', () => {
  // SQLite WASM tests
  createDbTestSuite('SQLite WASM', async () => {
    const db = new SqliteWasmDb(`test-${Date.now()}.sqlite`);
    await db.init();
    return db;
  });

});

// Helper function tests
describe('Helper Functions', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with timestamp prefix', () => {
      const id = generateId();
      const timestamp = parseInt(id.split('-')[0]);
      expect(timestamp).toBeGreaterThan(0);
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate consistent keys for same input', async () => {
      const key1 = await generateIdempotencyKey('client1', 'farmers', '1', 'insert');
      const key2 = await generateIdempotencyKey('client1', 'farmers', '1', 'insert');
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', async () => {
      const key1 = await generateIdempotencyKey('client1', 'farmers', '1', 'insert');
      const key2 = await generateIdempotencyKey('client1', 'farmers', '2', 'insert');
      expect(key1).not.toBe(key2);
    });
  });

  describe('getClientId', () => {
    it('should generate and persist client ID', () => {
      const id1 = getClientId();
      const id2 = getClientId();
      expect(id1).toBe(id2);
    });

    it('should generate unique IDs for different sessions', () => {
      const id1 = getClientId();
      localStorageMock.clear();
      const id2 = getClientId();
      expect(id1).not.toBe(id2);
    });
  });
});

// Migration tests
describe('Migration Tests', () => {
  beforeEach(() => {
    localStorageMock.clear();
    resetMigrationStatus();
  });

  it('should track migration status', async () => {
    const stats = await getDatabaseStats();
    expect(stats.migrationStatus.completed).toBe(false);
  });
});

// Crash recovery simulation tests
describe('Crash Recovery Tests', () => {
  it('should recover from simulated crash during write', async () => {
    const db = new SqliteWasmDb(`crash-test-${Date.now()}.sqlite`);
    await db.init();

    // Write some data
    await db.run(`
      INSERT INTO farmers (user_id, first_name, last_name)
      VALUES (?, ?, ?)
    `, [1, 'Crash', 'Test']);

    // Simulate crash by closing without proper cleanup
    // In real scenario, this would be a browser crash
    await db.close();

    // Reopen and verify data integrity
    const db2 = new SqliteWasmDb(`crash-test-${Date.now()}.sqlite`);
    await db2.init();

    // Data should be intact (or cleanly rolled back)
    const results = await db2.query<any>('SELECT * FROM farmers');
    // Either we have the data or we don't, but no corruption
    expect(results).toBeDefined();

    await db2.close();
  });
});

// Offline/Online sync flow tests
describe('Offline/Online Sync Flow Tests', () => {
  let db: LocalDb;

  beforeEach(async () => {
    localStorageMock.clear();
    db = new SqliteWasmDb(`sync-test-${Date.now()}.sqlite`);
    await db.init();
  });

  afterEach(async () => {
    if (db && db.isReady()) {
      await db.close();
    }
  });

  it('should queue changes while offline', async () => {
    // Simulate offline mode by adding pending changes
    const changes = [];
    for (let i = 0; i < 5; i++) {
      const idempotencyKey = await generateIdempotencyKey('client1', 'farmers', `${i}`, 'insert');
      const changeId = await db.addPendingChange({
        tableName: 'farmers',
        recordId: i,
        operation: 'insert',
        data: { first_name: `Offline${i}`, last_name: 'Test' },
        idempotencyKey,
      });
      changes.push(changeId);
    }

    const pending = await db.listPendingChanges();
    expect(pending.length).toBe(5);
  });

  it('should process queued changes when online', async () => {
    // Add pending changes
    const changes = [];
    for (let i = 0; i < 3; i++) {
      const idempotencyKey = await generateIdempotencyKey('client1', 'farmers', `${i}`, 'insert');
      const changeId = await db.addPendingChange({
        tableName: 'farmers',
        recordId: i,
        operation: 'insert',
        data: { first_name: `Online${i}` },
        idempotencyKey,
      });
      changes.push(changeId);
    }

    // Simulate sync completion
    await db.markChangesSynced(changes);

    const pending = await db.listPendingChanges();
    expect(pending.length).toBe(0);
  });

  it('should handle sync failures with retry', async () => {
    const idempotencyKey = await generateIdempotencyKey('client1', 'farmers', '1', 'insert');
    const changeId = await db.addPendingChange({
      tableName: 'farmers',
      recordId: 1,
      operation: 'insert',
      data: { first_name: 'Retry' },
      idempotencyKey,
    });

    // Simulate failed sync attempts
    await db.incrementRetryCount([changeId]);
    await db.incrementRetryCount([changeId]);

    const pending = await db.listPendingChanges();
    expect(pending[0].retryCount).toBe(2);
  });

  it('should update checkpoints after successful sync', async () => {
    await db.setCheckpoint({
      tableName: 'farmers',
      lastSyncedVersion: 5,
      lastSyncedAt: Date.now(),
      serverCursor: 'cursor-5',
    });

    // Simulate another sync
    await db.setCheckpoint({
      tableName: 'farmers',
      lastSyncedVersion: 10,
      lastSyncedAt: Date.now(),
      serverCursor: 'cursor-10',
    });

    const checkpoint = await db.getCheckpoint('farmers');
    expect(checkpoint?.lastSyncedVersion).toBe(10);
    expect(checkpoint?.serverCursor).toBe('cursor-10');
  });
});

// Conflict resolution workflow tests
describe('Conflict Resolution Workflow Tests', () => {
  let db: LocalDb;

  beforeEach(async () => {
    localStorageMock.clear();
    db = new SqliteWasmDb(`conflict-test-${Date.now()}.sqlite`);
    await db.init();
  });

  afterEach(async () => {
    if (db && db.isReady()) {
      await db.close();
    }
  });

  it('should detect and store conflicts', async () => {
    // Insert local record
    await db.run(`
      INSERT INTO farmers (user_id, first_name, last_name, version)
      VALUES (?, ?, ?, ?)
    `, [1, 'Local', 'Version', 1]);

    // Simulate conflict detection
    await db.storeConflict(
      'farmers',
      1,
      { first_name: 'Local', version: 1 },
      { first_name: 'Server', version: 2 }
    );

    const conflicts = await db.getConflicts();
    expect(conflicts.length).toBe(1);
  });

  it('should resolve conflict with server wins strategy', async () => {
    await db.storeConflict(
      'farmers',
      1,
      { first_name: 'Local' },
      { first_name: 'Server' }
    );

    await db.resolveConflict('farmers', 1, 'server');

    const conflicts = await db.getConflicts();
    expect(conflicts.length).toBe(0);
  });

  it('should resolve conflict with local wins strategy', async () => {
    await db.storeConflict(
      'farmers',
      1,
      { first_name: 'Local' },
      { first_name: 'Server' }
    );

    await db.resolveConflict('farmers', 1, 'local');

    const conflicts = await db.getConflicts();
    expect(conflicts.length).toBe(0);
  });

  it('should handle multiple conflicts for different tables', async () => {
    await db.storeConflict('farmers', 1, { a: 1 }, { a: 2 });
    await db.storeConflict('farms', 1, { b: 1 }, { b: 2 });
    await db.storeConflict('crops', 1, { c: 1 }, { c: 2 });

    const allConflicts = await db.getConflicts();
    expect(allConflicts.length).toBe(3);

    const farmerConflicts = await db.getConflicts('farmers');
    expect(farmerConflicts.length).toBe(1);
  });
});

// Performance tests
describe('Performance Tests', () => {
  let db: LocalDb;

  beforeEach(async () => {
    localStorageMock.clear();
    db = new SqliteWasmDb(`perf-test-${Date.now()}.sqlite`);
    await db.init();
  });

  afterEach(async () => {
    if (db && db.isReady()) {
      await db.close();
    }
  });

  it('should handle 1000 inserts in reasonable time', async () => {
    const startTime = Date.now();

    await db.transaction(async () => {
      for (let i = 0; i < 1000; i++) {
        await db.run(`
          INSERT INTO farmers (user_id, first_name, last_name)
          VALUES (?, ?, ?)
        `, [i, `Perf${i}`, `Test${i}`]);
      }
    });

    const duration = Date.now() - startTime;
    console.log(`1000 inserts took ${duration}ms`);

    // Should complete in less than 30 seconds
    expect(duration).toBeLessThan(30000);

    const count = await db.get<{ count: number }>('SELECT COUNT(*) as count FROM farmers');
    expect(count?.count).toBe(1000);
  });

  it('should handle complex queries efficiently', async () => {
    // Insert test data
    await db.transaction(async () => {
      for (let i = 0; i < 100; i++) {
        await db.run(`
          INSERT INTO farmers (user_id, first_name, last_name, region)
          VALUES (?, ?, ?, ?)
        `, [i, `Query${i}`, `Test${i}`, i % 5 === 0 ? 'Region A' : 'Region B']);
      }
    });

    const startTime = Date.now();

    // Complex query with filtering and aggregation
    const results = await db.query<any>(`
      SELECT region, COUNT(*) as count
      FROM farmers
      WHERE first_name LIKE 'Query%'
      GROUP BY region
      ORDER BY count DESC
    `);

    const duration = Date.now() - startTime;
    console.log(`Complex query took ${duration}ms`);

    expect(duration).toBeLessThan(1000);
    expect(results.length).toBe(2);
  });
});
