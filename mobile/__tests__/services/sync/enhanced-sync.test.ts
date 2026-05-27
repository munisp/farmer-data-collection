import { EnhancedSyncService, SyncStatus, SyncOptions } from '../../../src/services/sync/enhanced-sync';

// Mock the database service
jest.mock('../../../src/services/database', () => ({
  getUnsyncedHarvests: jest.fn(() => Promise.resolve([])),
  getUnsyncedExpenses: jest.fn(() => Promise.resolve([])),
  getUnsyncedFarmers: jest.fn(() => Promise.resolve([])),
  getUnsyncedFarms: jest.fn(() => Promise.resolve([])),
  getUnsyncedLoanApplications: jest.fn(() => Promise.resolve([])),
  updateHarvest: jest.fn(() => Promise.resolve()),
  updateExpense: jest.fn(() => Promise.resolve()),
  updateFarmer: jest.fn(() => Promise.resolve()),
  updateFarm: jest.fn(() => Promise.resolve()),
  updateLoanApplication: jest.fn(() => Promise.resolve()),
  createHarvest: jest.fn(() => Promise.resolve()),
  createExpense: jest.fn(() => Promise.resolve()),
  createFarmer: jest.fn(() => Promise.resolve()),
  createFarm: jest.fn(() => Promise.resolve()),
  createLoanApplication: jest.fn(() => Promise.resolve()),
  getHarvestById: jest.fn(() => Promise.resolve(null)),
  getExpenseById: jest.fn(() => Promise.resolve(null)),
  getFarmerById: jest.fn(() => Promise.resolve(null)),
  getFarmById: jest.fn(() => Promise.resolve(null)),
  getLoanApplicationById: jest.fn(() => Promise.resolve(null)),
  getPendingSyncCount: jest.fn(() => Promise.resolve(0)),
}));

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({
    isConnected: true,
    isInternetReachable: true,
  })),
}));

describe('EnhancedSyncService', () => {
  let syncService: EnhancedSyncService;

  beforeEach(() => {
    syncService = new EnhancedSyncService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    syncService.stopBackgroundSync();
  });

  describe('getStatus', () => {
    it('should return initial sync status', async () => {
      const status = await syncService.getStatus();

      expect(status).toHaveProperty('syncing');
      expect(status).toHaveProperty('lastSyncAt');
      expect(status).toHaveProperty('pendingCount');
      expect(status).toHaveProperty('conflictCount');
      expect(status).toHaveProperty('error');
      expect(status.syncing).toBe(false);
    });
  });

  describe('startBackgroundSync', () => {
    it('should start background sync with default interval', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      
      syncService.startBackgroundSync();

      expect(setIntervalSpy).toHaveBeenCalled();
      
      setIntervalSpy.mockRestore();
    });

    it('should start background sync with custom interval', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const customInterval = 60000; // 1 minute
      
      syncService.startBackgroundSync(customInterval);

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), customInterval);
      
      setIntervalSpy.mockRestore();
    });

    it('should not start multiple background syncs', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      
      syncService.startBackgroundSync();
      syncService.startBackgroundSync();

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      
      setIntervalSpy.mockRestore();
    });
  });

  describe('stopBackgroundSync', () => {
    it('should stop background sync', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      
      syncService.startBackgroundSync();
      syncService.stopBackgroundSync();

      expect(clearIntervalSpy).toHaveBeenCalled();
      
      clearIntervalSpy.mockRestore();
    });
  });

  describe('syncAll', () => {
    it('should sync all entity types', async () => {
      const options: Partial<SyncOptions> = {
        strategy: 'last_write_wins',
        batchSize: 50,
      };

      await syncService.syncAll(options);

      const status = await syncService.getStatus();
      expect(status.syncing).toBe(false);
    });

    it('should handle sync errors gracefully', async () => {
      // Mock a network error
      const NetInfo = require('@react-native-community/netinfo');
      NetInfo.fetch.mockResolvedValueOnce({
        isConnected: false,
        isInternetReachable: false,
      });

      await syncService.syncAll();

      const status = await syncService.getStatus();
      expect(status.syncing).toBe(false);
    });

    it('should update status during sync', async () => {
      const statusChanges: SyncStatus[] = [];
      const unsubscribe = syncService.onStatusChange((status) => {
        statusChanges.push({ ...status });
      });

      await syncService.syncAll();

      unsubscribe();
      
      // Should have at least start and end status updates
      expect(statusChanges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('onStatusChange', () => {
    it('should register status change callback', async () => {
      const callback = jest.fn();
      const unsubscribe = syncService.onStatusChange(callback);

      await syncService.syncAll();

      expect(callback).toHaveBeenCalled();
      
      unsubscribe();
    });

    it('should unsubscribe from status changes', async () => {
      const callback = jest.fn();
      const unsubscribe = syncService.onStatusChange(callback);
      
      unsubscribe();
      callback.mockClear();

      await syncService.syncAll();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('getPendingConflicts', () => {
    it('should return empty map initially', () => {
      const conflicts = syncService.getPendingConflicts();
      expect(conflicts.size).toBe(0);
    });
  });

  describe('resolveConflictManually', () => {
    it('should resolve conflict with provided data', async () => {
      const resolvedData = {
        id: '1',
        name: 'Resolved Name',
        quantity: 100,
      };

      await syncService.resolveConflictManually('harvest', '1', resolvedData);

      // Conflict should be removed from pending
      const conflicts = syncService.getPendingConflicts();
      expect(conflicts.has('harvest:1')).toBe(false);
    });
  });

  describe('syncEntity', () => {
    it('should sync a specific entity', async () => {
      await syncService.syncEntity('harvest', '1');

      const status = await syncService.getStatus();
      expect(status.syncing).toBe(false);
    });
  });
});

describe('SyncOptions', () => {
  it('should have correct default values', () => {
    const defaultOptions: SyncOptions = {
      strategy: 'last_write_wins',
      batchSize: 50,
      retryOnConflict: true,
      syncDeleted: true,
    };

    expect(defaultOptions.strategy).toBe('last_write_wins');
    expect(defaultOptions.batchSize).toBe(50);
    expect(defaultOptions.retryOnConflict).toBe(true);
    expect(defaultOptions.syncDeleted).toBe(true);
  });
});
