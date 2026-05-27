/**
 * Network Status Indicator Component
 * 
 * Clear visual indicators for offline/online status and network quality.
 * Designed for low-literacy users in developing countries.
 */

import React, { useEffect, useState } from 'react';
import { 
  getAdaptiveSyncManager, 
  NetworkState, 
  BatteryState,
  AdaptiveSyncConfig 
} from '../lib/networkAwareSync';

interface NetworkStatusIndicatorProps {
  compact?: boolean;
  showBattery?: boolean;
  showSyncStatus?: boolean;
  className?: string;
}

export function NetworkStatusIndicator({
  compact = false,
  showBattery = true,
  showSyncStatus = true,
  className = '',
}: NetworkStatusIndicatorProps) {
  const [networkState, setNetworkState] = useState<NetworkState>({ online: true, quality: 'unknown' });
  const [batteryState, setBatteryState] = useState<BatteryState>({ level: 1, charging: true });
  const [config, setConfig] = useState<AdaptiveSyncConfig | null>(null);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  useEffect(() => {
    const manager = getAdaptiveSyncManager();
    
    // Initial state
    setNetworkState(manager.getNetworkState());
    setBatteryState(manager.getBatteryState());
    setConfig(manager.getConfig());

    // Subscribe to changes
    const unsubscribe = manager.subscribe((newConfig) => {
      setNetworkState(manager.getNetworkState());
      setBatteryState(manager.getBatteryState());
      setConfig(newConfig);
    });

    // Check pending changes periodically
    const checkPending = async () => {
      try {
        // This would integrate with the actual LocalDb
        const stored = localStorage.getItem('pending_changes_count');
        if (stored) {
          setPendingChanges(parseInt(stored, 10));
        }
      } catch (e) {
        // Ignore errors
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Network quality icon and color
  const getNetworkIcon = () => {
    if (!networkState.online) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3" />
        </svg>
      );
    }

    // Signal strength bars based on quality
    const bars = {
      '2g': 1,
      '3g': 2,
      '4g': 3,
      'wifi': 4,
      'unknown': 2,
      'offline': 0,
    };

    const barCount = bars[networkState.quality] || 2;

    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="16" width="4" height="6" rx="1" className={barCount >= 1 ? 'fill-current' : 'fill-gray-300'} />
        <rect x="8" y="12" width="4" height="10" rx="1" className={barCount >= 2 ? 'fill-current' : 'fill-gray-300'} />
        <rect x="14" y="8" width="4" height="14" rx="1" className={barCount >= 3 ? 'fill-current' : 'fill-gray-300'} />
        <rect x="20" y="4" width="4" height="18" rx="1" className={barCount >= 4 ? 'fill-current' : 'fill-gray-300'} />
      </svg>
    );
  };

  // Battery icon
  const getBatteryIcon = () => {
    const level = batteryState.level;
    const charging = batteryState.charging;

    return (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="2" y="7" width="18" height="10" rx="2" strokeWidth="2" />
        <rect x="20" y="10" width="2" height="4" fill="currentColor" />
        <rect 
          x="4" 
          y="9" 
          width={Math.max(1, 14 * level)} 
          height="6" 
          rx="1" 
          fill="currentColor"
          className={level < 0.2 ? 'fill-red-500' : level < 0.5 ? 'fill-yellow-500' : 'fill-green-500'}
        />
        {charging && (
          <path d="M12 8l-2 4h4l-2 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    );
  };

  // Status color
  const getStatusColor = () => {
    if (!networkState.online) return 'text-red-600 bg-red-50';
    if (networkState.quality === '2g') return 'text-orange-600 bg-orange-50';
    if (networkState.quality === '3g') return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  // Status text
  const getStatusText = () => {
    const manager = getAdaptiveSyncManager();
    return manager.getStatusMessage();
  };

  // Pending changes message
  const getPendingMessage = () => {
    if (pendingChanges === 0) return null;
    if (pendingChanges === 1) return '1 change waiting to sync';
    return `${pendingChanges} changes waiting to sync`;
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className={`p-1 rounded ${getStatusColor()}`}>
          {getNetworkIcon()}
        </div>
        {showBattery && batteryState.level < 0.3 && (
          <div className={`p-1 rounded ${batteryState.level < 0.2 ? 'text-red-600 bg-red-50' : 'text-yellow-600 bg-yellow-50'}`}>
            {getBatteryIcon()}
          </div>
        )}
        {pendingChanges > 0 && (
          <span className="text-xs text-orange-600 font-medium">
            {pendingChanges}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${getStatusColor()} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {getNetworkIcon()}
            <span className="font-medium text-sm">{getStatusText()}</span>
          </div>
          
          {showBattery && (
            <div className="flex items-center gap-1 text-gray-600">
              {getBatteryIcon()}
              <span className="text-xs">{Math.round(batteryState.level * 100)}%</span>
            </div>
          )}
        </div>

        {showSyncStatus && pendingChanges > 0 && (
          <div className="text-xs text-orange-700 bg-orange-100 px-2 py-1 rounded-full">
            {getPendingMessage()}
          </div>
        )}
      </div>

      {/* Offline message */}
      {!networkState.online && (
        <div className="mt-2 text-sm">
          <p className="font-medium">Your data is saved on this device</p>
          <p className="text-gray-600">It will sync automatically when you're back online</p>
        </div>
      )}

      {/* Low battery warning */}
      {batteryState.level < 0.2 && !batteryState.charging && (
        <div className="mt-2 text-sm text-red-700">
          <p className="font-medium">Low battery - Sync reduced to save power</p>
        </div>
      )}

      {/* 2G network notice */}
      {networkState.quality === '2g' && networkState.online && (
        <div className="mt-2 text-sm text-orange-700">
          <p>Slow network detected - Using data-saving mode</p>
        </div>
      )}
    </div>
  );
}

// Floating status bar for mobile
export function FloatingNetworkStatus() {
  const [visible, setVisible] = useState(false);
  const [networkState, setNetworkState] = useState<NetworkState>({ online: true, quality: 'unknown' });

  useEffect(() => {
    const manager = getAdaptiveSyncManager();
    
    const unsubscribe = manager.subscribe(() => {
      const state = manager.getNetworkState();
      setNetworkState(state);
      
      // Show floating bar when offline or on poor network
      if (!state.online || state.quality === '2g') {
        setVisible(true);
      } else {
        // Hide after a delay when back online
        setTimeout(() => setVisible(false), 3000);
      }
    });

    return unsubscribe;
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 animate-slide-down">
      <div className={`px-4 py-2 text-center text-sm font-medium ${
        !networkState.online 
          ? 'bg-red-600 text-white' 
          : networkState.quality === '2g'
            ? 'bg-orange-500 text-white'
            : 'bg-green-500 text-white'
      }`}>
        {!networkState.online 
          ? 'Offline - Data saved locally' 
          : networkState.quality === '2g'
            ? 'Slow network - Data-saving mode active'
            : 'Back online - Syncing...'}
      </div>
    </div>
  );
}

// Sync button with status
export function SyncButton({ onSync }: { onSync?: () => Promise<void> }) {
  const [syncing, setSyncing] = useState(false);
  const [networkState, setNetworkState] = useState<NetworkState>({ online: true, quality: 'unknown' });

  useEffect(() => {
    const manager = getAdaptiveSyncManager();
    const unsubscribe = manager.subscribe(() => {
      setNetworkState(manager.getNetworkState());
    });
    return unsubscribe;
  }, []);

  const handleSync = async () => {
    if (syncing || !networkState.online) return;
    
    setSyncing(true);
    try {
      if (onSync) {
        await onSync();
      }
      getAdaptiveSyncManager().recordSyncResult(true);
    } catch (error) {
      getAdaptiveSyncManager().recordSyncResult(false);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={syncing || !networkState.online}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        !networkState.online
          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
          : syncing
            ? 'bg-blue-100 text-blue-600'
            : 'bg-blue-600 text-white hover:bg-blue-700'
      }`}
    >
      {syncing ? (
        <>
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Syncing...
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {networkState.online ? 'Sync Now' : 'Offline'}
        </>
      )}
    </button>
  );
}

export default NetworkStatusIndicator;
