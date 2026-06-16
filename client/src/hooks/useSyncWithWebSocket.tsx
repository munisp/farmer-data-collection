/**
 * Enhanced Sync Hook with WebSocket Integration
 * 
 * Combines SyncManager with WebSocket events to provide:
 * - Auto-sync on app focus
 * - Incremental sync triggered by WebSocket events
 * - Conflict resolution UI integration
 * - Sync metrics and observability
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getSyncManager, SyncStatus, TableSyncResult } from '@/lib/syncManager';
import { queryClient } from '@/lib/trpc';

// ============================================================================
// Types
// ============================================================================

export interface SyncEvent {
  type: 'sync_push' | 'sync_pull' | 'sync_conflict' | 'record_updated' | 'record_created' | 'record_deleted';
  entityType: string;
  entityId: string;
  userId: number;
  clientId: string;
  data: unknown;
  timestamp: string;
}

export interface SyncConflict {
  id: string;
  entityType: string;
  entityId: string;
  localVersion: number;
  serverVersion: number;
  conflictFields: string[];
  strategy: 'last_write_wins' | 'local_wins' | 'server_wins' | 'merge' | 'manual';
  resolved: boolean;
  resolvedAt?: string;
  createdAt: string;
}

export interface EnhancedSyncStatus extends SyncStatus {
  websocketConnected: boolean;
  pendingConflicts: SyncConflict[];
  lastSyncEvent: SyncEvent | null;
  syncMetrics: {
    totalSyncs: number;
    totalConflicts: number;
    avgLatencyMs: number;
    lastSyncDurationMs: number;
  };
}

// ============================================================================
// Configuration
// ============================================================================

const SYNC_ON_FOCUS_DELAY = 1000; // 1 second delay after focus
const SYNC_ON_RECONNECT_DELAY = 500; // 500ms delay after reconnect
const SYNC_DEBOUNCE_MS = 2000; // Debounce rapid sync triggers
const GO_SYNC_SERVICE_URL = import.meta.env.VITE_GO_SYNC_SERVICE_URL || 'http://localhost:8090';
const PYTHON_ANALYTICS_URL = import.meta.env.VITE_PYTHON_ANALYTICS_URL || 'http://localhost:8091';

// ============================================================================
// Enhanced Sync Hook
// ============================================================================

export function useSyncWithWebSocket() {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const syncManager = useRef(getSyncManager());
  const lastSyncTrigger = useRef<number>(0);
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [status, setStatus] = useState<EnhancedSyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    pendingChanges: 0,
    lastSyncedTables: [],
    websocketConnected: false,
    pendingConflicts: [],
    lastSyncEvent: null,
    syncMetrics: {
      totalSyncs: 0,
      totalConflicts: 0,
      avgLatencyMs: 0,
      lastSyncDurationMs: 0,
    },
  });

  // ============================================================================
  // Sync Trigger with Debouncing
  // ============================================================================

  const triggerSync = useCallback(async (reason: string, entityTypes?: string[]) => {
    const now = Date.now();
    if (now - lastSyncTrigger.current < SYNC_DEBOUNCE_MS) {
      console.warn('[Sync] Debounced sync trigger:', reason);
      return;
    }
    lastSyncTrigger.current = now;

    console.warn('[Sync] Triggering sync:', reason);
    const startTime = Date.now();

    try {
      const results = await syncManager.current.sync();
      const duration = Date.now() - startTime;

      // Update metrics
      setStatus(prev => ({
        ...prev,
        syncMetrics: {
          ...prev.syncMetrics,
          totalSyncs: prev.syncMetrics.totalSyncs + 1,
          lastSyncDurationMs: duration,
          avgLatencyMs: Math.round(
            (prev.syncMetrics.avgLatencyMs * prev.syncMetrics.totalSyncs + duration) /
            (prev.syncMetrics.totalSyncs + 1)
          ),
        },
      }));

      // Invalidate React Query cache for synced tables
      const syncedTables = results.filter(r => r.success).map(r => r.table);
      for (const table of syncedTables) {
        queryClient.invalidateQueries({ queryKey: [table] });
      }

      // Report metrics to Python analytics service
      reportSyncMetrics(results, duration);

      return results;
    } catch (error) {
      console.error('[Sync] Error:', error);
      setStatus(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Sync failed',
      }));
    }
  }, [queryClient]);

  // ============================================================================
  // WebSocket Connection
  // ============================================================================

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setStatus(prev => ({ ...prev, websocketConnected: false }));
      }
      return;
    }

    // Connect to Socket.IO server
    const socket = io({
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity, // Keep trying to reconnect
      reconnectionDelayMax: 30000,
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      console.warn('[WebSocket] Connected:', socket.id);
      setStatus(prev => ({ ...prev, websocketConnected: true }));
      
      // Authenticate
      socket.emit('authenticate', user.id);
      
      // Trigger sync after reconnection
      setTimeout(() => {
        triggerSync('websocket_reconnect');
      }, SYNC_ON_RECONNECT_DELAY);
    });

    socket.on('disconnect', () => {
      console.warn('[WebSocket] Disconnected');
      setStatus(prev => ({ ...prev, websocketConnected: false }));
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      setStatus(prev => ({ ...prev, websocketConnected: false }));
    });

    // Handle real-time sync events
    socket.on('realtime_event', (event: SyncEvent) => {
      console.warn('[WebSocket] Received sync event:', event);
      handleSyncEvent(event);
    });

    // Handle sync-specific events from Go service
    socket.on('sync_event', (event: SyncEvent) => {
      console.warn('[WebSocket] Received sync_event:', event);
      handleSyncEvent(event);
    });

    // Handle conflict notifications
    socket.on('sync_conflict', (conflict: SyncConflict) => {
      console.warn('[WebSocket] Received conflict:', conflict);
      handleConflict(conflict);
    });

    return () => {
      socket.disconnect();
    };
  }, [user, triggerSync]);

  // ============================================================================
  // Handle Sync Events
  // ============================================================================

  const handleSyncEvent = useCallback((event: SyncEvent) => {
    setStatus(prev => ({ ...prev, lastSyncEvent: event }));

    // Skip events from our own client
    if (event.clientId === syncManager.current.getClientId()) {
      return;
    }

    // Trigger incremental sync for the affected entity type
    switch (event.type) {
      case 'record_updated':
      case 'record_created':
      case 'record_deleted':
        // Invalidate React Query cache immediately
        queryClient.invalidateQueries({ queryKey: [event.entityType] });
        
        // Trigger sync for this entity type
        triggerSync(`event_${event.type}_${event.entityType}`, [event.entityType]);
        
        // Show notification
        showEventNotification(event);
        break;

      case 'sync_push':
      case 'sync_pull':
        // Another client synced, refresh our data
        triggerSync(`remote_sync_${event.type}`);
        break;
    }
  }, [queryClient, triggerSync]);

  const handleConflict = useCallback((conflict: SyncConflict) => {
    setStatus(prev => ({
      ...prev,
      pendingConflicts: [...prev.pendingConflicts, conflict],
      syncMetrics: {
        ...prev.syncMetrics,
        totalConflicts: prev.syncMetrics.totalConflicts + 1,
      },
    }));

    // Show conflict notification
    toast.warning('Sync Conflict Detected', {
      description: `Conflict in ${conflict.entityType} record. Please review.`,
      action: {
        label: 'Review',
        onClick: () => {
          // Navigate to conflict resolution page
          window.location.href = `/sync/conflicts/${conflict.id}`;
        },
      },
      duration: 10000,
    });
  }, []);

  const showEventNotification = useCallback((event: SyncEvent) => {
    const entityName = event.entityType.replace(/s$/, ''); // Remove trailing 's'
    
    switch (event.type) {
      case 'record_created':
        toast.success(`New ${entityName} added`, {
          description: `A new ${entityName} was synced from another device`,
          duration: 3000,
        });
        break;
      case 'record_updated':
        toast.info(`${entityName} updated`, {
          description: `A ${entityName} was updated from another device`,
          duration: 3000,
        });
        break;
      case 'record_deleted':
        toast.info(`${entityName} removed`, {
          description: `A ${entityName} was deleted from another device`,
          duration: 3000,
        });
        break;
    }
  }, []);

  // ============================================================================
  // Auto-sync on App Focus
  // ============================================================================

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        // Clear any existing timeout
        if (focusTimeoutRef.current) {
          clearTimeout(focusTimeoutRef.current);
        }
        
        // Delay sync slightly to avoid rapid triggers
        focusTimeoutRef.current = setTimeout(() => {
          triggerSync('app_focus');
        }, SYNC_ON_FOCUS_DELAY);
      }
    };

    const handleOnline = () => {
      if (user) {
        console.warn('[Sync] Network online, triggering sync');
        triggerSync('network_online');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, [user, triggerSync]);

  // ============================================================================
  // Subscribe to SyncManager Status
  // ============================================================================

  useEffect(() => {
    const unsubscribe = syncManager.current.subscribe((syncStatus) => {
      setStatus(prev => ({
        ...prev,
        ...syncStatus,
      }));
    });

    return unsubscribe;
  }, []);

  // ============================================================================
  // Start Auto-sync on Mount
  // ============================================================================

  useEffect(() => {
    if (user) {
      syncManager.current.startAutoSync();
    }

    return () => {
      syncManager.current.stopAutoSync();
    };
  }, [user]);

  // ============================================================================
  // Report Metrics to Analytics Service
  // ============================================================================

  const reportSyncMetrics = async (results: TableSyncResult[], durationMs: number) => {
    if (!user) return;

    try {
      const metrics = {
        timestamp: Math.floor(Date.now() / 1000),
        user_id: user.id,
        client_id: syncManager.current.getClientId(),
        entity_type: 'all',
        operation: 'sync',
        record_count: results.reduce((sum, r) => sum + r.pulledRecords + r.pushedRecords, 0),
        synced_count: results.filter(r => r.success).length,
        conflict_count: results.filter(r => !r.success).length,
        duration_ms: durationMs,
        conflict_rate: results.filter(r => !r.success).length / Math.max(results.length, 1),
        success: results.every(r => r.success),
      };

      await fetch(`${PYTHON_ANALYTICS_URL}/api/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metrics),
      });
    } catch (error) {
      console.warn('[Sync] Failed to report metrics:', error);
    }
  };

  // ============================================================================
  // Conflict Resolution
  // ============================================================================

  const resolveConflict = useCallback(async (
    conflictId: string,
    resolution: 'local' | 'server' | 'merge' | 'custom',
    customData?: unknown
  ) => {
    if (!user) return false;

    try {
      const response = await fetch(`${PYTHON_ANALYTICS_URL}/api/conflicts/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conflict_id: conflictId,
          resolution,
          custom_data: customData,
          resolved_by: user.id,
        }),
      });

      if (response.ok) {
        // Remove from pending conflicts
        setStatus(prev => ({
          ...prev,
          pendingConflicts: prev.pendingConflicts.filter(c => c.id !== conflictId),
        }));

        // Trigger sync to apply resolution
        await triggerSync('conflict_resolved');

        toast.success('Conflict Resolved', {
          description: 'The sync conflict has been resolved successfully',
        });

        return true;
      }
    } catch (error) {
      console.error('[Sync] Failed to resolve conflict:', error);
      toast.error('Failed to resolve conflict', {
        description: 'Please try again or contact support',
      });
    }

    return false;
  }, [user, triggerSync]);

  // ============================================================================
  // Manual Sync Trigger
  // ============================================================================

  const manualSync = useCallback(async () => {
    return triggerSync('manual');
  }, [triggerSync]);

  // ============================================================================
  // Return Hook API
  // ============================================================================

  return {
    status,
    sync: manualSync,
    resolveConflict,
    isOnline: navigator.onLine,
    socket: socketRef.current,
  };
}

// ============================================================================
// Sync Status Provider Context
// ============================================================================

import { createContext, useContext, ReactNode } from 'react';

interface SyncContextValue {
  status: EnhancedSyncStatus;
  sync: () => Promise<TableSyncResult[] | undefined>;
  resolveConflict: (conflictId: string, resolution: 'local' | 'server' | 'merge' | 'custom', customData?: unknown) => Promise<boolean>;
  isOnline: boolean;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const syncHook = useSyncWithWebSocket();

  return (
    <SyncContext.Provider value={syncHook}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

// ============================================================================
// Sync Status Display Component
// ============================================================================

export function SyncStatusDisplay() {
  const { status, sync, isOnline } = useSync();

  return (
    <div className="flex items-center gap-2 text-sm">
      {/* Online/Offline indicator */}
      <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
      
      {/* WebSocket connection status */}
      <div className={`w-2 h-2 rounded-full ${status.websocketConnected ? 'bg-blue-500' : 'bg-gray-400'}`} />
      
      {/* Sync status */}
      {status.isSyncing ? (
        <span className="text-muted-foreground">Syncing...</span>
      ) : status.lastSyncTime ? (
        <span className="text-muted-foreground">
          Last sync: {new Date(status.lastSyncTime).toLocaleTimeString()}
        </span>
      ) : (
        <span className="text-muted-foreground">Not synced</span>
      )}
      
      {/* Pending conflicts badge */}
      {status.pendingConflicts.length > 0 && (
        <span className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-xs">
          {status.pendingConflicts.length} conflicts
        </span>
      )}
      
      {/* Manual sync button */}
      <button
        onClick={() => sync()}
        disabled={status.isSyncing}
        className="text-primary hover:underline disabled:opacity-50"
      >
        Sync Now
      </button>
    </div>
  );
}
