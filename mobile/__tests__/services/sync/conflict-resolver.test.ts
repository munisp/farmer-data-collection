import { ConflictResolver, ConflictResolutionStrategy, SyncableEntity } from '../../../src/services/sync/conflict-resolver';

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;

  beforeEach(() => {
    resolver = new ConflictResolver();
  });

  describe('detectConflict', () => {
    it('should detect conflict when versions differ', () => {
      const local: SyncableEntity = {
        id: '1',
        version: 2,
        updatedAt: '2024-01-01T10:00:00Z',
        syncedAt: '2024-01-01T09:00:00Z',
      };
      const server: SyncableEntity = {
        id: '1',
        version: 3,
        updatedAt: '2024-01-01T11:00:00Z',
        syncedAt: '2024-01-01T09:00:00Z',
      };

      expect(resolver.detectConflict(local, server)).toBe(true);
    });

    it('should not detect conflict when versions match', () => {
      const local: SyncableEntity = {
        id: '1',
        version: 2,
        updatedAt: '2024-01-01T10:00:00Z',
        syncedAt: '2024-01-01T09:00:00Z',
      };
      const server: SyncableEntity = {
        id: '1',
        version: 2,
        updatedAt: '2024-01-01T10:00:00Z',
        syncedAt: '2024-01-01T09:00:00Z',
      };

      expect(resolver.detectConflict(local, server)).toBe(false);
    });

    it('should detect conflict when local is newer but server has different version', () => {
      const local: SyncableEntity = {
        id: '1',
        version: 2,
        updatedAt: '2024-01-01T12:00:00Z',
        syncedAt: '2024-01-01T09:00:00Z',
      };
      const server: SyncableEntity = {
        id: '1',
        version: 3,
        updatedAt: '2024-01-01T11:00:00Z',
        syncedAt: '2024-01-01T09:00:00Z',
      };

      expect(resolver.detectConflict(local, server)).toBe(true);
    });
  });

  describe('getConflictingFields', () => {
    it('should identify conflicting fields', () => {
      const local = {
        id: '1',
        name: 'Local Name',
        quantity: 100,
        status: 'active',
      };
      const server = {
        id: '1',
        name: 'Server Name',
        quantity: 100,
        status: 'pending',
      };

      const conflicts = resolver.getConflictingFields(local, server);
      expect(conflicts).toContain('name');
      expect(conflicts).toContain('status');
      expect(conflicts).not.toContain('quantity');
      expect(conflicts).not.toContain('id');
    });

    it('should exclude specified fields', () => {
      const local = {
        id: '1',
        name: 'Local Name',
        updatedAt: '2024-01-01T10:00:00Z',
      };
      const server = {
        id: '1',
        name: 'Server Name',
        updatedAt: '2024-01-01T11:00:00Z',
      };

      const conflicts = resolver.getConflictingFields(local, server, ['updatedAt']);
      expect(conflicts).toContain('name');
      expect(conflicts).not.toContain('updatedAt');
    });

    it('should return empty array when no conflicts', () => {
      const local = { id: '1', name: 'Same Name' };
      const server = { id: '1', name: 'Same Name' };

      const conflicts = resolver.getConflictingFields(local, server);
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('resolveConflict', () => {
    const localEntity: SyncableEntity = {
      id: '1',
      version: 2,
      updatedAt: '2024-01-01T10:00:00Z',
      syncedAt: '2024-01-01T09:00:00Z',
      name: 'Local Name',
      quantity: 100,
    };

    const serverEntity: SyncableEntity = {
      id: '1',
      version: 3,
      updatedAt: '2024-01-01T11:00:00Z',
      syncedAt: '2024-01-01T09:00:00Z',
      name: 'Server Name',
      quantity: 150,
    };

    it('should resolve using last_write_wins strategy (server wins)', async () => {
      const result = await resolver.resolveConflict(
        'harvest',
        localEntity,
        serverEntity,
        'last_write_wins'
      );

      expect(result.strategy).toBe('last_write_wins');
      expect(result.resolved.name).toBe('Server Name');
      expect(result.resolved.quantity).toBe(150);
    });

    it('should resolve using local_wins strategy', async () => {
      const result = await resolver.resolveConflict(
        'harvest',
        localEntity,
        serverEntity,
        'local_wins'
      );

      expect(result.strategy).toBe('local_wins');
      expect(result.resolved.name).toBe('Local Name');
      expect(result.resolved.quantity).toBe(100);
    });

    it('should resolve using server_wins strategy', async () => {
      const result = await resolver.resolveConflict(
        'harvest',
        localEntity,
        serverEntity,
        'server_wins'
      );

      expect(result.strategy).toBe('server_wins');
      expect(result.resolved.name).toBe('Server Name');
      expect(result.resolved.quantity).toBe(150);
    });

    it('should resolve using merge strategy', async () => {
      const olderLocal: SyncableEntity = {
        ...localEntity,
        updatedAt: '2024-01-01T08:00:00Z',
      };

      const result = await resolver.resolveConflict(
        'harvest',
        olderLocal,
        serverEntity,
        'merge'
      );

      expect(result.strategy).toBe('merge');
      // Merge should take server values for conflicting fields when server is newer
      expect(result.resolved.name).toBe('Server Name');
    });
  });

  describe('registerConflictCallback', () => {
    it('should register and use custom callback for manual resolution', async () => {
      const customResolution: SyncableEntity = {
        id: '1',
        version: 4,
        updatedAt: '2024-01-01T12:00:00Z',
        syncedAt: '2024-01-01T12:00:00Z',
        name: 'Custom Resolved Name',
      };

      const callback = jest.fn().mockResolvedValue(customResolution);
      resolver.registerConflictCallback('harvest', callback);

      const local: SyncableEntity = {
        id: '1',
        version: 2,
        updatedAt: '2024-01-01T10:00:00Z',
        syncedAt: '2024-01-01T09:00:00Z',
        name: 'Local',
      };

      const server: SyncableEntity = {
        id: '1',
        version: 3,
        updatedAt: '2024-01-01T11:00:00Z',
        syncedAt: '2024-01-01T09:00:00Z',
        name: 'Server',
      };

      const result = await resolver.resolveConflict('harvest', local, server, 'manual');

      expect(callback).toHaveBeenCalled();
      expect(result.strategy).toBe('manual');
      expect(result.resolved.name).toBe('Custom Resolved Name');
    });
  });

  describe('createConflictLog', () => {
    it('should create a conflict log entry', () => {
      const local: SyncableEntity = {
        id: '1',
        version: 2,
        updatedAt: '2024-01-01T10:00:00Z',
        syncedAt: '2024-01-01T09:00:00Z',
      };

      const server: SyncableEntity = {
        id: '1',
        version: 3,
        updatedAt: '2024-01-01T11:00:00Z',
        syncedAt: '2024-01-01T09:00:00Z',
      };

      const log = resolver.createConflictLog('harvest', local, server, 'last_write_wins');

      expect(log.entityType).toBe('harvest');
      expect(log.entityId).toBe('1');
      expect(log.localVersion).toBe(2);
      expect(log.serverVersion).toBe(3);
      expect(log.resolution).toBe('last_write_wins');
      expect(log.timestamp).toBeDefined();
    });
  });
});
