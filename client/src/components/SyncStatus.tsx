import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Cloud, CloudOff, RefreshCw, AlertCircle, CheckCircle2, Upload, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getClient } from "@/db";

// Sync configuration
const SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes - conservative for 2G/slow connections
const SYNC_JITTER_MS = 2 * 60 * 1000; // ±2 minutes jitter to spread load across 1000+ farmers
const MIN_SYNC_COOLDOWN_MS = 30 * 1000; // 30 seconds minimum between syncs
const OFFLINE_QUEUE_KEY = 'offline_sync_queue';

// Conflict record interface
interface ConflictRecord {
  id: number;
  table: string;
  clientVersion: number;
  serverVersion: number;
  localData: Record<string, any>;
  serverData: Record<string, any>;
  timestamp: Date;
}

// Offline change record interface
interface OfflineChange {
  id: string; // UUID for the change
  table: string;
  recordId: number | null; // null for new records
  operation: 'create' | 'update' | 'delete';
  data: Record<string, any>;
  version: number;
  timestamp: Date;
  retryCount: number;
}

interface SyncStatusType {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  error: string | null;
  pendingChanges: number;
  conflicts: ConflictRecord[];
  isPushing: boolean;
}

// Generate a stable client ID for this device/browser
const getClientId = (): string => {
  let clientId = localStorage.getItem('sync_client_id');
  if (!clientId) {
    clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('sync_client_id', clientId);
  }
  return clientId;
};

// Get offline queue from localStorage
const getOfflineQueue = (): OfflineChange[] => {
  try {
    const queue = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
  } catch (err) {
    console.warn('[Sync] Failed to parse offline queue:', String(err));
    return [];
  }
};

// Save offline queue to localStorage
const saveOfflineQueue = (queue: OfflineChange[]): void => {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
};

// Add a change to the offline queue (called when user edits data while offline)
export const queueOfflineChange = (
  table: string,
  recordId: number | null,
  operation: 'create' | 'update' | 'delete',
  data: Record<string, any>,
  version: number = 1
): void => {
  const queue = getOfflineQueue();
  const change: OfflineChange = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    table,
    recordId,
    operation,
    data,
    version,
    timestamp: new Date(),
    retryCount: 0,
  };
  queue.push(change);
  saveOfflineQueue(queue);
  console.warn('[OfflineSync] Queued change:', change);
};

export function SyncStatus() {
  const [status, setStatus] = useState<SyncStatusType>({
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    pendingChanges: getOfflineQueue().length,
    conflicts: [],
    isPushing: false,
  });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const clientRef = useRef<any>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false); // Track sync state without re-renders
  const hasInitialSyncRef = useRef(false); // Track if initial sync has been done
  const clientId = useRef(getClientId());

  // Check if enough time has passed since last sync
  const canSync = useCallback(() => {
    const lastSyncStr = localStorage.getItem('lastSyncTime');
    if (!lastSyncStr) return true;
    const lastSync = new Date(lastSyncStr).getTime();
    return Date.now() - lastSync >= MIN_SYNC_COOLDOWN_MS;
  }, []);

  // Get sync interval with jitter to spread load across 1000+ farmers
  const getSyncIntervalWithJitter = useCallback(() => {
    const jitter = Math.random() * SYNC_JITTER_MS * 2 - SYNC_JITTER_MS; // ±SYNC_JITTER_MS
    return SYNC_INTERVAL_MS + jitter;
  }, []);

  // Push offline changes to server with conflict detection
  const pushOfflineChanges = useCallback(async (): Promise<{ pushed: number; conflicts: ConflictRecord[] }> => {
    const queue = getOfflineQueue();
    if (queue.length === 0) {
      return { pushed: 0, conflicts: [] };
    }

    console.warn(`[PushSync] Pushing ${queue.length} offline changes...`);
    setStatus(prev => ({ ...prev, isPushing: true }));

    const conflicts: ConflictRecord[] = [];
    const successfulIds: string[] = [];

    // Group changes by table for batch processing
    const changesByTable: Record<string, OfflineChange[]> = {};
    for (const change of queue) {
      if (!changesByTable[change.table]) {
        changesByTable[change.table] = [];
      }
      changesByTable[change.table].push(change);
    }

    // Process each table's changes
    for (const [table, changes] of Object.entries(changesByTable)) {
      try {
        // Prepare records for push
        const records = changes.map(change => ({
          ...change.data,
          id: change.recordId,
          version: change.version,
          _operation: change.operation,
          _changeId: change.id,
        }));

        // Call sync.push via tRPC
        const response = await fetch('/api/trpc/sync.push', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            json: {
              table,
              records,
              clientId: clientId.current,
            },
          }),
        });

        if (!response.ok) {
          console.error(`[PushSync] Failed to push ${table}:`, response.statusText);
          continue;
        }

        const result = await response.json();
        console.warn(`[PushSync] ${table} response:`, result);

        const { success, conflicts: serverConflicts, synced } = result.result?.data?.json || {};

        // Track successful pushes
        if (synced > 0) {
          // Mark changes as successful based on server response
          for (const change of changes) {
            const hasConflict = serverConflicts?.some((c: any) => c.id === change.recordId);
            if (!hasConflict) {
              successfulIds.push(change.id);
            }
          }
        }

        // Process conflicts
        if (serverConflicts && serverConflicts.length > 0) {
          for (const conflict of serverConflicts) {
            const localChange = changes.find(c => c.recordId === conflict.id);
            if (localChange) {
              conflicts.push({
                id: conflict.id,
                table,
                clientVersion: conflict.clientVersion,
                serverVersion: conflict.serverVersion,
                localData: localChange.data,
                serverData: conflict.record,
                timestamp: new Date(),
              });
            }
          }
        }
      } catch (error) {
        console.error(`[PushSync] Error pushing ${table}:`, error);
      }
    }

    // Remove successful changes from queue
    const remainingQueue = queue.filter(change => !successfulIds.includes(change.id));
    saveOfflineQueue(remainingQueue);

    setStatus(prev => ({
      ...prev,
      isPushing: false,
      pendingChanges: remainingQueue.length,
      conflicts: [...prev.conflicts, ...conflicts],
    }));

    if (conflicts.length > 0) {
      setShowConflictDialog(true);
      toast.warning(`${conflicts.length} conflict(s) detected. Please resolve them.`);
    }

    console.warn(`[PushSync] Pushed ${successfulIds.length} changes, ${conflicts.length} conflicts`);
    return { pushed: successfulIds.length, conflicts };
  }, []);

  // Resolve a conflict by choosing local or server version
  const resolveConflict = useCallback(async (
    conflict: ConflictRecord,
    resolution: 'local' | 'server'
  ): Promise<void> => {
    console.warn(`[ConflictResolution] Resolving conflict for ${conflict.table}#${conflict.id} with ${resolution}`);

    if (resolution === 'server') {
      // Accept server version - just remove from conflicts, pull will update local
      setStatus(prev => ({
        ...prev,
        conflicts: prev.conflicts.filter(c => !(c.id === conflict.id && c.table === conflict.table)),
      }));
      toast.success('Accepted server version');
    } else {
      // Force push local version with incremented version
      try {
        const response = await fetch('/api/trpc/sync.push', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            json: {
              table: conflict.table,
              records: [{
                ...conflict.localData,
                id: conflict.id,
                version: conflict.serverVersion + 1, // Increment from server version
              }],
              clientId: clientId.current,
              forceOverwrite: true,
            },
          }),
        });

        if (response.ok) {
          setStatus(prev => ({
            ...prev,
            conflicts: prev.conflicts.filter(c => !(c.id === conflict.id && c.table === conflict.table)),
          }));
          toast.success('Local changes saved to server');
        } else {
          toast.error('Failed to save local changes');
        }
      } catch (error) {
        console.error('[ConflictResolution] Error:', error);
        toast.error('Failed to resolve conflict');
      }
    }

    // Close dialog if no more conflicts
    setStatus(prev => {
      if (prev.conflicts.length === 0) {
        setShowConflictDialog(false);
      }
      return prev;
    });
  }, []);

  useEffect(() => {
    // Load initial sync status
    loadSyncStatus();
    
    // Update pending changes count
    setStatus(prev => ({ ...prev, pendingChanges: getOfflineQueue().length }));

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online (with cooldown check)
      if (!isSyncingRef.current && canSync()) {
        console.warn('[AutoSync] Coming back online, triggering sync...');
        setTimeout(() => {
          if (!isSyncingRef.current) {
            triggerAutoSync('reconnect');
          }
        }, 1000); // Small delay to ensure network is stable
      }
    };
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Auto-sync on app startup (if online)
    if (navigator.onLine && !hasInitialSyncRef.current) {
      hasInitialSyncRef.current = true;
      console.warn('[AutoSync] App startup, triggering initial sync...');
      setTimeout(() => {
        if (!isSyncingRef.current) {
          triggerAutoSync('startup');
        }
      }, 2000); // Wait 2 seconds for app to fully initialize
    }

    // Set up periodic background sync with jitter to spread load across 1000+ farmers
    const scheduleNextSync = () => {
      const interval = getSyncIntervalWithJitter();
      console.warn(`[AutoSync] Next sync scheduled in ${Math.round(interval / 1000 / 60)} minutes`);
      syncIntervalRef.current = setTimeout(() => {
        if (navigator.onLine && !isSyncingRef.current && canSync()) {
          console.warn('[AutoSync] Periodic sync triggered...');
          triggerAutoSync('periodic');
        }
        scheduleNextSync(); // Schedule next sync with new jitter
      }, interval);
    };
    scheduleNextSync();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (syncIntervalRef.current) {
        clearTimeout(syncIntervalRef.current);
      }
    };
  }, [canSync, getSyncIntervalWithJitter]);

  // Trigger auto-sync without showing toast for background syncs
  const triggerAutoSync = async (reason: 'startup' | 'reconnect' | 'periodic') => {
    if (!navigator.onLine || isSyncingRef.current) return;
    
    console.warn(`[AutoSync] Starting ${reason} sync...`);
    isSyncingRef.current = true;
    setStatus(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      // Step 1: Push any pending offline changes first
      const { pushed, conflicts } = await pushOfflineChanges();
      if (pushed > 0) {
        console.warn(`[AutoSync] Pushed ${pushed} offline changes`);
      }
      if (conflicts.length > 0) {
        console.warn(`[AutoSync] ${conflicts.length} conflicts need resolution`);
      }

      // Step 2: Pull latest from server
      await performSync(reason !== 'periodic'); // Show toast only for startup/reconnect
    } catch (error) {
      console.error(`[AutoSync] ${reason} sync failed:`, error);
    } finally {
      isSyncingRef.current = false;
    }
  };

  const loadSyncStatus = async () => {
    try {
      const lastSyncStr = localStorage.getItem('lastSyncTime');
      if (lastSyncStr) {
        setStatus(prev => ({
          ...prev,
          lastSyncTime: new Date(lastSyncStr),
        }));
      }
    } catch (error) {
      console.error('Failed to load sync status:', error);
    }
  };

  // Core sync logic - can be called by manual sync or auto-sync
  const performSync = async (showToast: boolean = true, reloadOnChanges: boolean = true): Promise<number> => {
    // Get the client for direct SQL queries
    if (!clientRef.current) {
      clientRef.current = await getClient();
    }
    const client = clientRef.current;

    // Map server table names to local table names (camelCase to snake_case)
    const tableMapping: Record<string, string> = {
      farmers: "farmers",
      farms: "farms",
      crops: "crops",
      livestock: "livestock",
      farmInputs: "farm_inputs",
      harvests: "harvests",
      expenses: "expenses",
    };

    // Sync each table
    const tables = ["farmers", "farms", "crops", "livestock", "farmInputs", "harvests", "expenses"] as const;
    let totalRecords = 0;

    for (const table of tables) {
      try {
        // Get last sync time for this table from localStorage
        const lastSyncKey = `lastSync_${table}`;

        // Build tRPC query URL with superjson format
        // Note: We're not sending lastSyncTime to avoid 400 errors
        // This means we'll always fetch all records (full sync)
        const inputData: any = {
          json: {
            table,
            clientId: `user-${Date.now()}`,
          },
        };

        const params = new URLSearchParams({
          input: JSON.stringify(inputData),
        });

        // Call sync.pull via tRPC
        const response = await fetch(`/api/trpc/sync.pull?${params}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error(`Failed to sync ${table}:`, response.statusText);
          continue;
        }

        const result = await response.json();
        console.warn(`[Sync] ${table} response:`, result);
        const { records, serverTime } = result.result.data.json;
        console.warn(`[Sync] ${table} records count:`, records?.length || 0);

        // Get the local table name
        const localTable = tableMapping[table] || table;

        // Insert records into local database
        if (records && records.length > 0) {
          console.warn(`[Sync] Inserting ${records.length} records into ${localTable}`);
          for (const record of records) {
            // Convert camelCase keys to snake_case for local DB
            const snakeCaseRecord: Record<string, any> = {};
            for (const [key, value] of Object.entries(record)) {
              const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
              snakeCaseRecord[snakeKey] = value;
            }

            const columns = Object.keys(snakeCaseRecord);
            const values = Object.values(snakeCaseRecord);
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
            const updateSet = columns
              .filter((k) => k !== "id")
              .map((k) => `"${k}" = EXCLUDED."${k}"`)
              .join(", ");

            try {
              await client.query(
                `INSERT INTO ${localTable} (${columns.map(c => `"${c}"`).join(", ")})
                 VALUES (${placeholders})
                 ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
                values
              );
            } catch (insertError) {
              console.error(`Error inserting record into ${localTable}:`, insertError);
            }
          }
          totalRecords += records.length;
        }

        // Update last sync time
        localStorage.setItem(lastSyncKey, serverTime);
      } catch (tableError) {
        console.error(`Error syncing ${table}:`, tableError);
      }
    }

    console.warn(`Sync completed: ${totalRecords} records synced`);
    
    const now = new Date();
    setStatus(prev => ({
      ...prev,
      isSyncing: false,
      lastSyncTime: now,
      error: null,
      pendingChanges: getOfflineQueue().length,
    }));
    localStorage.setItem('lastSyncTime', now.toISOString());
    
    if (showToast) {
      toast.success(`Synced ${totalRecords} records successfully`);
    }

    // Reload the page to reflect changes (only for manual sync or significant changes)
    if (reloadOnChanges && totalRecords > 0) {
      setTimeout(() => window.location.reload(), 500);
    }

    return totalRecords;
  };

  // Manual sync handler (called by Sync Now button)
  const handleSync = async () => {
    if (!isOnline || status.isSyncing) return;

    isSyncingRef.current = true;
    setStatus(prev => ({ ...prev, isSyncing: true, error: null }));

    try {
      await performSync(true, true); // Show toast and reload on changes
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        error: errorMsg,
      }));
      toast.error(`Sync failed: ${errorMsg}`);
    } finally {
      isSyncingRef.current = false;
    }
  };

  const getStatusIcon = () => {
    if (!isOnline) {
      return <CloudOff className="h-4 w-4 text-muted-foreground" />;
    }

    if (status.isSyncing) {
      return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
    }

    if (status.error) {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }

    if (status.lastSyncTime) {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }

    return <Cloud className="h-4 w-4 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (!isOnline) {
      return "Offline";
    }

    if (status.isSyncing) {
      return "Syncing...";
    }

    if (status.error) {
      return "Sync failed";
    }

    if (status.lastSyncTime) {
      const timeDiff = Date.now() - status.lastSyncTime.getTime();
      const seconds = Math.floor(timeDiff / 1000);
      const minutes = Math.floor(seconds / 60);

      if (minutes === 0) {
        return "Synced just now";
      } else if (minutes === 1) {
        return "Synced 1 minute ago";
      } else if (minutes < 60) {
        return `Synced ${minutes} minutes ago`;
      } else {
        const hours = Math.floor(minutes / 60);
        return `Synced ${hours} hour${hours > 1 ? "s" : ""} ago`;
      }
    }

    return "Not synced";
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 bg-card border-b" data-tutorial="sync-status">
        <div className="flex items-center gap-2 flex-1">
          {getStatusIcon()}
          <span className={cn(
            "text-sm",
            status.error ? "text-red-500" : "text-muted-foreground"
          )}>
            {getStatusText()}
          </span>
          {status.error && (
            <span className="text-xs text-red-500">({status.error})</span>
          )}
          {status.pendingChanges > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <Upload className="h-3 w-3" />
              {status.pendingChanges} pending
            </span>
          )}
          {status.conflicts.length > 0 && (
            <button
              onClick={() => setShowConflictDialog(true)}
              className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full hover:bg-red-100"
            >
              <AlertTriangle className="h-3 w-3" />
              {status.conflicts.length} conflict{status.conflicts.length > 1 ? 's' : ''}
            </button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSync}
          disabled={status.isSyncing || !isOnline}
          className="h-8"
        >
          <RefreshCw className={cn(
            "h-4 w-4 mr-2",
            status.isSyncing && "animate-spin"
          )} />
          Sync Now
        </Button>
      </div>

      {/* Conflict Resolution Dialog */}
      {showConflictDialog && status.conflicts.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b bg-red-50">
              <h2 className="text-lg font-semibold text-red-800 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Sync Conflicts Detected
              </h2>
              <p className="text-sm text-red-600 mt-1">
                Another user modified these records while you were offline. Choose which version to keep.
              </p>
            </div>
            <div className="p-4 overflow-y-auto max-h-[50vh]">
              {status.conflicts.map((conflict, index) => (
                <div key={`${conflict.table}-${conflict.id}`} className="border rounded-lg p-4 mb-4 last:mb-0">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        {conflict.table} #{conflict.id}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        Your version: v{conflict.clientVersion} | Server version: v{conflict.serverVersion}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-blue-50 p-3 rounded">
                      <div className="font-medium text-blue-800 mb-2">Your Changes</div>
                      <pre className="text-xs text-blue-700 overflow-auto max-h-32">
                        {JSON.stringify(conflict.localData, null, 2)}
                      </pre>
                    </div>
                    <div className="bg-green-50 p-3 rounded">
                      <div className="font-medium text-green-800 mb-2">Server Version</div>
                      <pre className="text-xs text-green-700 overflow-auto max-h-32">
                        {JSON.stringify(conflict.serverData, null, 2)}
                      </pre>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={() => resolveConflict(conflict, 'local')}
                    >
                      Keep My Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-green-300 text-green-700 hover:bg-green-50"
                      onClick={() => resolveConflict(conflict, 'server')}
                    >
                      Accept Server Version
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <Button
                variant="ghost"
                onClick={() => setShowConflictDialog(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
