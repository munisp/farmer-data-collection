/**
 * Sync Operations Tests
 * Comprehensive tests for offline sync, conflict resolution, and data synchronization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock sync service
class SyncService {
  private pendingChanges: Map<string, any[]> = new Map();
  private serverVersion: Map<string, number> = new Map();

  async pushChanges(entityType: string, changes: any[]): Promise<{
    success: number;
    failed: number;
    conflicts: any[];
  }> {
    let success = 0;
    let failed = 0;
    const conflicts: any[] = [];

    for (const change of changes) {
      try {
        // Check for conflicts
        const serverVer = this.serverVersion.get(`${entityType}:${change.id}`) || 0;
        
        if (change.baseVersion && change.baseVersion < serverVer) {
          // Conflict detected
          conflicts.push({
            entityType,
            entityId: change.id,
            clientVersion: change.baseVersion,
            serverVersion: serverVer,
            clientData: change.data,
          });
          continue;
        }

        // Apply change
        this.serverVersion.set(`${entityType}:${change.id}`, serverVer + 1);
        success++;
      } catch (error) {
        failed++;
      }
    }

    return { success, failed, conflicts };
  }

  async pullChanges(entityType: string, lastSyncTimestamp: string): Promise<{
    changes: any[];
    timestamp: string;
    hasMore: boolean;
  }> {
    // Simulate fetching changes since last sync
    const changes = this.pendingChanges.get(entityType) || [];
    const filteredChanges = changes.filter(
      (c) => new Date(c.updatedAt) > new Date(lastSyncTimestamp)
    );

    return {
      changes: filteredChanges.slice(0, 100), // Paginate
      timestamp: new Date().toISOString(),
      hasMore: filteredChanges.length > 100,
    };
  }

  resolveConflict(
    conflict: any,
    resolution: 'client' | 'server' | 'merge',
    mergedData?: any
  ): any {
    switch (resolution) {
      case 'client':
        return conflict.clientData;
      case 'server':
        return conflict.serverData;
      case 'merge':
        if (!mergedData) {
          throw new Error('Merged data required for merge resolution');
        }
        return mergedData;
      default:
        throw new Error('Invalid resolution strategy');
    }
  }

  detectConflicts(clientData: any, serverData: any): string[] {
    const conflicts: string[] = [];
    
    for (const key of Object.keys(clientData)) {
      if (serverData[key] !== undefined && clientData[key] !== serverData[key]) {
        conflicts.push(key);
      }
    }

    return conflicts;
  }

  mergeData(clientData: any, serverData: any, strategy: 'client-wins' | 'server-wins' | 'latest'): any {
    const merged = { ...serverData };

    for (const key of Object.keys(clientData)) {
      if (strategy === 'client-wins') {
        merged[key] = clientData[key];
      } else if (strategy === 'server-wins') {
        // Keep server data (already in merged)
      } else if (strategy === 'latest') {
        // Compare timestamps if available
        const clientTime = new Date(clientData.updatedAt || 0).getTime();
        const serverTime = new Date(serverData.updatedAt || 0).getTime();
        if (clientTime > serverTime) {
          merged[key] = clientData[key];
        }
      }
    }

    return merged;
  }

  // Simulate adding server changes for testing
  addServerChange(entityType: string, change: any) {
    const changes = this.pendingChanges.get(entityType) || [];
    changes.push(change);
    this.pendingChanges.set(entityType, changes);
  }

  setServerVersion(entityType: string, entityId: string, version: number) {
    this.serverVersion.set(`${entityType}:${entityId}`, version);
  }
}

describe('SyncService', () => {
  let service: SyncService;

  beforeEach(() => {
    service = new SyncService();
  });

  describe('pushChanges', () => {
    it('should successfully push changes without conflicts', async () => {
      const changes = [
        { id: '1', data: { name: 'Harvest 1' }, baseVersion: 0 },
        { id: '2', data: { name: 'Harvest 2' }, baseVersion: 0 },
      ];

      const result = await service.pushChanges('harvests', changes);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should detect conflicts when server version is newer', async () => {
      service.setServerVersion('harvests', '1', 5);

      const changes = [
        { id: '1', data: { name: 'Updated Harvest' }, baseVersion: 3 },
      ];

      const result = await service.pushChanges('harvests', changes);

      expect(result.success).toBe(0);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].entityId).toBe('1');
      expect(result.conflicts[0].clientVersion).toBe(3);
      expect(result.conflicts[0].serverVersion).toBe(5);
    });

    it('should handle mixed success and conflicts', async () => {
      service.setServerVersion('harvests', '2', 10);

      const changes = [
        { id: '1', data: { name: 'Harvest 1' }, baseVersion: 0 },
        { id: '2', data: { name: 'Harvest 2' }, baseVersion: 5 }, // Conflict
        { id: '3', data: { name: 'Harvest 3' }, baseVersion: 0 },
      ];

      const result = await service.pushChanges('harvests', changes);

      expect(result.success).toBe(2);
      expect(result.conflicts).toHaveLength(1);
    });
  });

  describe('pullChanges', () => {
    it('should return changes since last sync', async () => {
      const oldDate = '2024-01-01T00:00:00Z';
      service.addServerChange('harvests', {
        id: '1',
        name: 'New Harvest',
        updatedAt: '2024-01-15T00:00:00Z',
      });

      const result = await service.pullChanges('harvests', oldDate);

      expect(result.changes).toHaveLength(1);
      expect(result.changes[0].name).toBe('New Harvest');
    });

    it('should not return old changes', async () => {
      const recentDate = '2024-01-20T00:00:00Z';
      service.addServerChange('harvests', {
        id: '1',
        name: 'Old Harvest',
        updatedAt: '2024-01-15T00:00:00Z',
      });

      const result = await service.pullChanges('harvests', recentDate);

      expect(result.changes).toHaveLength(0);
    });

    it('should indicate when more changes are available', async () => {
      const oldDate = '2024-01-01T00:00:00Z';
      
      // Add 150 changes
      for (let i = 0; i < 150; i++) {
        service.addServerChange('harvests', {
          id: `${i}`,
          name: `Harvest ${i}`,
          updatedAt: '2024-01-15T00:00:00Z',
        });
      }

      const result = await service.pullChanges('harvests', oldDate);

      expect(result.changes).toHaveLength(100);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('resolveConflict', () => {
    const conflict = {
      entityId: '1',
      clientData: { name: 'Client Name', quantity: 100 },
      serverData: { name: 'Server Name', quantity: 150 },
    };

    it('should resolve with client data', () => {
      const result = service.resolveConflict(conflict, 'client');

      expect(result.name).toBe('Client Name');
      expect(result.quantity).toBe(100);
    });

    it('should resolve with server data', () => {
      const result = service.resolveConflict(conflict, 'server');

      expect(result.name).toBe('Server Name');
      expect(result.quantity).toBe(150);
    });

    it('should resolve with merged data', () => {
      const mergedData = { name: 'Merged Name', quantity: 125 };
      const result = service.resolveConflict(conflict, 'merge', mergedData);

      expect(result.name).toBe('Merged Name');
      expect(result.quantity).toBe(125);
    });

    it('should throw error for merge without data', () => {
      expect(() => service.resolveConflict(conflict, 'merge'))
        .toThrow('Merged data required for merge resolution');
    });
  });

  describe('detectConflicts', () => {
    it('should detect conflicting fields', () => {
      const clientData = { name: 'Client', quantity: 100, notes: 'Same' };
      const serverData = { name: 'Server', quantity: 100, notes: 'Same' };

      const conflicts = service.detectConflicts(clientData, serverData);

      expect(conflicts).toContain('name');
      expect(conflicts).not.toContain('quantity');
      expect(conflicts).not.toContain('notes');
    });

    it('should return empty array when no conflicts', () => {
      const clientData = { name: 'Same', quantity: 100 };
      const serverData = { name: 'Same', quantity: 100 };

      const conflicts = service.detectConflicts(clientData, serverData);

      expect(conflicts).toHaveLength(0);
    });
  });

  describe('mergeData', () => {
    it('should merge with client-wins strategy', () => {
      const clientData = { name: 'Client', quantity: 100 };
      const serverData = { name: 'Server', quantity: 200, extra: 'field' };

      const result = service.mergeData(clientData, serverData, 'client-wins');

      expect(result.name).toBe('Client');
      expect(result.quantity).toBe(100);
      expect(result.extra).toBe('field');
    });

    it('should merge with server-wins strategy', () => {
      const clientData = { name: 'Client', quantity: 100 };
      const serverData = { name: 'Server', quantity: 200 };

      const result = service.mergeData(clientData, serverData, 'server-wins');

      expect(result.name).toBe('Server');
      expect(result.quantity).toBe(200);
    });

    it('should merge with latest strategy', () => {
      const clientData = { 
        name: 'Client', 
        quantity: 100,
        updatedAt: '2024-01-20T00:00:00Z',
      };
      const serverData = { 
        name: 'Server', 
        quantity: 200,
        updatedAt: '2024-01-15T00:00:00Z',
      };

      const result = service.mergeData(clientData, serverData, 'latest');

      expect(result.name).toBe('Client'); // Client is newer
      expect(result.quantity).toBe(100);
    });
  });
});
