/**
 * React Hook for Offline Sync Service
 * Provides easy access to offline sync functionality in React components
 */

import { useState, useEffect, useCallback } from 'react';
import { offlineSyncService, type OfflineHarvest, type OfflineExpense, type OfflineOrder } from '../services/offline-sync';

interface OfflineSyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: Date | null;
  error: string | null;
}

interface UseOfflineSyncReturn {
  status: OfflineSyncStatus;
  saveHarvest: (harvest: Omit<OfflineHarvest, 'id' | 'synced' | 'createdAt' | 'updatedAt'>) => Promise<OfflineHarvest>;
  saveExpense: (expense: Omit<OfflineExpense, 'id' | 'synced' | 'createdAt' | 'updatedAt'>) => Promise<OfflineExpense>;
  saveOrder: (order: Omit<OfflineOrder, 'id' | 'synced' | 'createdAt' | 'updatedAt'>) => Promise<OfflineOrder>;
  getHarvests: () => Promise<OfflineHarvest[]>;
  getExpenses: () => Promise<OfflineExpense[]>;
  getOrders: () => Promise<OfflineOrder[]>;
  syncNow: () => Promise<{ success: number; failed: number }>;
  clearOfflineData: () => Promise<void>;
}

/**
 * Hook to use offline sync functionality in React components
 */
export function useOfflineSync(): UseOfflineSyncReturn {
  const [status, setStatus] = useState<OfflineSyncStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    error: null,
  });

  // Update online status
  useEffect(() => {
    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, isOnline: true }));
    };

    const handleOffline = () => {
      setStatus((prev) => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Subscribe to sync status changes
  useEffect(() => {
    const unsubscribe = offlineSyncService.onStatusChange(({ syncing, pendingCount, error }) => {
      setStatus((prev) => ({
        ...prev,
        isSyncing: syncing,
        pendingCount,
        error: error || null,
      }));
    });

    // Get initial pending count
    offlineSyncService.getPendingCount().then((count) => {
      setStatus((prev) => ({ ...prev, pendingCount: count }));
    });

    return unsubscribe;
  }, []);

  // Save harvest offline
  const saveHarvest = useCallback(
    async (harvest: Omit<OfflineHarvest, 'id' | 'synced' | 'createdAt' | 'updatedAt'>) => {
      try {
        return await offlineSyncService.saveHarvest(harvest);
      } catch (error) {
        setStatus((prev) => ({ ...prev, error: String(error) }));
        throw error;
      }
    },
    []
  );

  // Save expense offline
  const saveExpense = useCallback(
    async (expense: Omit<OfflineExpense, 'id' | 'synced' | 'createdAt' | 'updatedAt'>) => {
      try {
        return await offlineSyncService.saveExpense(expense);
      } catch (error) {
        setStatus((prev) => ({ ...prev, error: String(error) }));
        throw error;
      }
    },
    []
  );

  // Save order offline
  const saveOrder = useCallback(
    async (order: Omit<OfflineOrder, 'id' | 'synced' | 'createdAt' | 'updatedAt'>) => {
      try {
        return await offlineSyncService.saveOrder(order);
      } catch (error) {
        setStatus((prev) => ({ ...prev, error: String(error) }));
        throw error;
      }
    },
    []
  );

  // Get all harvests
  const getHarvests = useCallback(async () => {
    return await offlineSyncService.getHarvests();
  }, []);

  // Get all expenses
  const getExpenses = useCallback(async () => {
    return await offlineSyncService.getExpenses();
  }, []);

  // Get all orders
  const getOrders = useCallback(async () => {
    return await offlineSyncService.getOrders();
  }, []);

  // Sync now (requires API client to be passed)
  const syncNow = useCallback(async () => {
    // This is a placeholder - in real usage, you'd pass the actual API client
    // For now, we'll just return a mock result
    console.warn('[useOfflineSync] syncNow called - implement with actual API client');
    return { success: 0, failed: 0 };
  }, []);

  // Clear all offline data
  const clearOfflineData = useCallback(async () => {
    try {
      await offlineSyncService.clearAll();
      setStatus((prev) => ({ ...prev, pendingCount: 0, error: null }));
    } catch (error) {
      setStatus((prev) => ({ ...prev, error: String(error) }));
      throw error;
    }
  }, []);

  return {
    status,
    saveHarvest,
    saveExpense,
    saveOrder,
    getHarvests,
    getExpenses,
    getOrders,
    syncNow,
    clearOfflineData,
  };
}

/**
 * Hook to check if the app is online
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook to show offline indicator
 */
export function useOfflineIndicator(): {
  isOffline: boolean;
  pendingCount: number;
  showIndicator: boolean;
} {
  const { status } = useOfflineSync();

  return {
    isOffline: !status.isOnline,
    pendingCount: status.pendingCount,
    showIndicator: !status.isOnline || status.pendingCount > 0,
  };
}
