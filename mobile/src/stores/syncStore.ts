import { create } from 'zustand';
import { syncService } from '@/services/sync';

interface SyncState {
  syncing: boolean;
  lastSync: string | null;
  pendingCount: number;
  error: string | null;
  
  // Actions
  sync: () => Promise<void>;
  updatePendingCount: () => Promise<void>;
  setLastSync: (date: string) => void;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  syncing: false,
  lastSync: null,
  pendingCount: 0,
  error: null,

  sync: async () => {
    try {
      await syncService.syncAll();
      set({ lastSync: new Date().toISOString(), error: null });
      await get().updatePendingCount();
    } catch (error) {
      set({ error: String(error) });
    }
  },

  updatePendingCount: async () => {
    const count = await syncService.getPendingCount();
    set({ pendingCount: count });
  },

  setLastSync: (date: string) => set({ lastSync: date }),
}));

// Subscribe to sync status changes
syncService.onSyncStatusChange((status) => {
  useSyncStore.setState({ syncing: status.syncing, error: status.error });
});
