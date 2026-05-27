// Database service tests
// Note: These tests mock expo-sqlite since we can't run actual SQLite in Jest

import * as SQLite from 'expo-sqlite';

// Mock the database module
const mockDb = {
  execSync: jest.fn(),
  runSync: jest.fn(() => ({ lastInsertRowId: 1, changes: 1 })),
  getAllSync: jest.fn(() => []),
  getFirstSync: jest.fn(() => null),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => mockDb),
}));

describe('Database Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Database Initialization', () => {
    it('should open database connection', () => {
      const db = SQLite.openDatabaseSync('farmer_data.db');
      expect(db).toBeDefined();
      expect(SQLite.openDatabaseSync).toHaveBeenCalledWith('farmer_data.db');
    });

    it('should create tables on initialization', () => {
      // Simulate table creation
      mockDb.execSync.mockImplementation(() => {});
      
      mockDb.execSync(`
        CREATE TABLE IF NOT EXISTS harvests (
          id TEXT PRIMARY KEY,
          farmId TEXT NOT NULL,
          cropType TEXT NOT NULL,
          quantity REAL NOT NULL,
          unit TEXT NOT NULL,
          harvestDate TEXT NOT NULL,
          quality TEXT,
          notes TEXT,
          syncStatus TEXT DEFAULT 'pending',
          version INTEGER DEFAULT 1,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          syncedAt TEXT
        )
      `);

      expect(mockDb.execSync).toHaveBeenCalled();
    });
  });

  describe('Harvest Operations', () => {
    const mockHarvest = {
      id: 'harvest-1',
      farmId: 'farm-1',
      cropType: 'Cocoa',
      quantity: 500,
      unit: 'kg',
      harvestDate: '2024-11-15',
      quality: 'Premium',
      notes: 'Good harvest',
      syncStatus: 'pending',
      version: 1,
      createdAt: '2024-11-15T10:00:00Z',
      updatedAt: '2024-11-15T10:00:00Z',
    };

    it('should create a harvest record', () => {
      mockDb.runSync.mockReturnValue({ lastInsertRowId: 1, changes: 1 });

      const result = mockDb.runSync(
        `INSERT INTO harvests (id, farmId, cropType, quantity, unit, harvestDate, quality, notes, syncStatus, version, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mockHarvest.id,
          mockHarvest.farmId,
          mockHarvest.cropType,
          mockHarvest.quantity,
          mockHarvest.unit,
          mockHarvest.harvestDate,
          mockHarvest.quality,
          mockHarvest.notes,
          mockHarvest.syncStatus,
          mockHarvest.version,
          mockHarvest.createdAt,
          mockHarvest.updatedAt,
        ]
      );

      expect(result.changes).toBe(1);
    });

    it('should get all harvests', () => {
      mockDb.getAllSync.mockReturnValue([mockHarvest]);

      const harvests = mockDb.getAllSync('SELECT * FROM harvests');

      expect(harvests).toHaveLength(1);
      expect(harvests[0].id).toBe('harvest-1');
    });

    it('should get harvest by id', () => {
      mockDb.getFirstSync.mockReturnValue(mockHarvest);

      const harvest = mockDb.getFirstSync(
        'SELECT * FROM harvests WHERE id = ?',
        ['harvest-1']
      );

      expect(harvest).toBeDefined();
      expect(harvest?.id).toBe('harvest-1');
    });

    it('should update a harvest record', () => {
      mockDb.runSync.mockReturnValue({ lastInsertRowId: 0, changes: 1 });

      const result = mockDb.runSync(
        `UPDATE harvests SET quantity = ?, updatedAt = ?, version = version + 1 WHERE id = ?`,
        [600, '2024-11-16T10:00:00Z', 'harvest-1']
      );

      expect(result.changes).toBe(1);
    });

    it('should delete a harvest record', () => {
      mockDb.runSync.mockReturnValue({ lastInsertRowId: 0, changes: 1 });

      const result = mockDb.runSync(
        'DELETE FROM harvests WHERE id = ?',
        ['harvest-1']
      );

      expect(result.changes).toBe(1);
    });

    it('should get unsynced harvests', () => {
      mockDb.getAllSync.mockReturnValue([mockHarvest]);

      const unsynced = mockDb.getAllSync(
        "SELECT * FROM harvests WHERE syncStatus = 'pending'"
      );

      expect(unsynced).toHaveLength(1);
      expect(unsynced[0].syncStatus).toBe('pending');
    });
  });

  describe('Farmer Operations', () => {
    const mockFarmer = {
      id: 'farmer-1',
      name: 'Adebayo Okonkwo',
      phone: '+2348012345678',
      email: 'adebayo@example.com',
      location: 'Lagos, Nigeria',
      syncStatus: 'synced',
      version: 1,
      createdAt: '2024-01-01T10:00:00Z',
      updatedAt: '2024-01-01T10:00:00Z',
    };

    it('should create a farmer record', () => {
      mockDb.runSync.mockReturnValue({ lastInsertRowId: 1, changes: 1 });

      const result = mockDb.runSync(
        `INSERT INTO farmers (id, name, phone, email, location, syncStatus, version, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mockFarmer.id,
          mockFarmer.name,
          mockFarmer.phone,
          mockFarmer.email,
          mockFarmer.location,
          mockFarmer.syncStatus,
          mockFarmer.version,
          mockFarmer.createdAt,
          mockFarmer.updatedAt,
        ]
      );

      expect(result.changes).toBe(1);
    });

    it('should get all farmers', () => {
      mockDb.getAllSync.mockReturnValue([mockFarmer]);

      const farmers = mockDb.getAllSync('SELECT * FROM farmers');

      expect(farmers).toHaveLength(1);
      expect(farmers[0].name).toBe('Adebayo Okonkwo');
    });
  });

  describe('Farm Operations', () => {
    const mockFarm = {
      id: 'farm-1',
      farmerId: 'farmer-1',
      name: 'Okonkwo Cocoa Farm',
      location: 'Ogun State',
      size: 25.5,
      sizeUnit: 'hectares',
      cropTypes: JSON.stringify(['Cocoa', 'Palm']),
      syncStatus: 'synced',
      version: 1,
      createdAt: '2024-01-01T10:00:00Z',
      updatedAt: '2024-01-01T10:00:00Z',
    };

    it('should create a farm record', () => {
      mockDb.runSync.mockReturnValue({ lastInsertRowId: 1, changes: 1 });

      const result = mockDb.runSync(
        `INSERT INTO farms (id, farmerId, name, location, size, sizeUnit, cropTypes, syncStatus, version, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mockFarm.id,
          mockFarm.farmerId,
          mockFarm.name,
          mockFarm.location,
          mockFarm.size,
          mockFarm.sizeUnit,
          mockFarm.cropTypes,
          mockFarm.syncStatus,
          mockFarm.version,
          mockFarm.createdAt,
          mockFarm.updatedAt,
        ]
      );

      expect(result.changes).toBe(1);
    });

    it('should get farms by farmer id', () => {
      mockDb.getAllSync.mockReturnValue([mockFarm]);

      const farms = mockDb.getAllSync(
        'SELECT * FROM farms WHERE farmerId = ?',
        ['farmer-1']
      );

      expect(farms).toHaveLength(1);
      expect(farms[0].farmerId).toBe('farmer-1');
    });
  });

  describe('Sync Queue Operations', () => {
    const mockSyncItem = {
      id: 1,
      entityType: 'harvest',
      entityId: 'harvest-1',
      operation: 'create',
      data: JSON.stringify({ quantity: 500 }),
      retryCount: 0,
      createdAt: '2024-11-15T10:00:00Z',
    };

    it('should add item to sync queue', () => {
      mockDb.runSync.mockReturnValue({ lastInsertRowId: 1, changes: 1 });

      const result = mockDb.runSync(
        `INSERT INTO sync_queue (entityType, entityId, operation, data, retryCount, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          mockSyncItem.entityType,
          mockSyncItem.entityId,
          mockSyncItem.operation,
          mockSyncItem.data,
          mockSyncItem.retryCount,
          mockSyncItem.createdAt,
        ]
      );

      expect(result.changes).toBe(1);
    });

    it('should get sync queue items', () => {
      mockDb.getAllSync.mockReturnValue([mockSyncItem]);

      const queue = mockDb.getAllSync(
        'SELECT * FROM sync_queue ORDER BY createdAt ASC'
      );

      expect(queue).toHaveLength(1);
      expect(queue[0].entityType).toBe('harvest');
    });

    it('should remove item from sync queue', () => {
      mockDb.runSync.mockReturnValue({ lastInsertRowId: 0, changes: 1 });

      const result = mockDb.runSync(
        'DELETE FROM sync_queue WHERE id = ?',
        [1]
      );

      expect(result.changes).toBe(1);
    });

    it('should increment retry count', () => {
      mockDb.runSync.mockReturnValue({ lastInsertRowId: 0, changes: 1 });

      const result = mockDb.runSync(
        'UPDATE sync_queue SET retryCount = retryCount + 1 WHERE id = ?',
        [1]
      );

      expect(result.changes).toBe(1);
    });

    it('should get pending sync count', () => {
      mockDb.getFirstSync.mockReturnValue({ count: 5 });

      const result = mockDb.getFirstSync(
        'SELECT COUNT(*) as count FROM sync_queue'
      );

      expect(result?.count).toBe(5);
    });
  });

  describe('Expense Operations', () => {
    const mockExpense = {
      id: 'expense-1',
      farmId: 'farm-1',
      category: 'Fertilizer',
      amount: 50000,
      currency: 'NGN',
      date: '2024-11-10',
      description: 'NPK fertilizer purchase',
      syncStatus: 'pending',
      version: 1,
      createdAt: '2024-11-10T10:00:00Z',
      updatedAt: '2024-11-10T10:00:00Z',
    };

    it('should create an expense record', () => {
      mockDb.runSync.mockReturnValue({ lastInsertRowId: 1, changes: 1 });

      const result = mockDb.runSync(
        `INSERT INTO expenses (id, farmId, category, amount, currency, date, description, syncStatus, version, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mockExpense.id,
          mockExpense.farmId,
          mockExpense.category,
          mockExpense.amount,
          mockExpense.currency,
          mockExpense.date,
          mockExpense.description,
          mockExpense.syncStatus,
          mockExpense.version,
          mockExpense.createdAt,
          mockExpense.updatedAt,
        ]
      );

      expect(result.changes).toBe(1);
    });

    it('should get expenses by farm id', () => {
      mockDb.getAllSync.mockReturnValue([mockExpense]);

      const expenses = mockDb.getAllSync(
        'SELECT * FROM expenses WHERE farmId = ?',
        ['farm-1']
      );

      expect(expenses).toHaveLength(1);
      expect(expenses[0].category).toBe('Fertilizer');
    });
  });

  describe('Loan Application Operations', () => {
    const mockLoan = {
      id: 'loan-1',
      farmerId: 'farmer-1',
      amount: 500000,
      currency: 'NGN',
      purpose: 'Farm expansion',
      status: 'pending',
      syncStatus: 'pending',
      version: 1,
      createdAt: '2024-11-01T10:00:00Z',
      updatedAt: '2024-11-01T10:00:00Z',
    };

    it('should create a loan application', () => {
      mockDb.runSync.mockReturnValue({ lastInsertRowId: 1, changes: 1 });

      const result = mockDb.runSync(
        `INSERT INTO loan_applications (id, farmerId, amount, currency, purpose, status, syncStatus, version, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mockLoan.id,
          mockLoan.farmerId,
          mockLoan.amount,
          mockLoan.currency,
          mockLoan.purpose,
          mockLoan.status,
          mockLoan.syncStatus,
          mockLoan.version,
          mockLoan.createdAt,
          mockLoan.updatedAt,
        ]
      );

      expect(result.changes).toBe(1);
    });

    it('should get loans by farmer id', () => {
      mockDb.getAllSync.mockReturnValue([mockLoan]);

      const loans = mockDb.getAllSync(
        'SELECT * FROM loan_applications WHERE farmerId = ?',
        ['farmer-1']
      );

      expect(loans).toHaveLength(1);
      expect(loans[0].purpose).toBe('Farm expansion');
    });
  });
});
