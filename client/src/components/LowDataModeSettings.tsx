/**
 * Low Data Mode Settings Component
 * 
 * Settings panel for users in developing countries with:
 * - Low data mode toggle
 * - Sync mode selection (auto/manual/wifi-only)
 * - GPS tracking settings
 * - Data usage statistics
 */

import React, { useEffect, useState } from 'react';
import { 
  getAdaptiveSyncManager, 
  SyncMode,
  NetworkState,
  BatteryState,
  AdaptiveSyncConfig 
} from '../lib/networkAwareSync';

interface LowDataModeSettingsProps {
  onClose?: () => void;
  className?: string;
}

export function LowDataModeSettings({ onClose, className = '' }: LowDataModeSettingsProps) {
  const [syncMode, setSyncMode] = useState<SyncMode>('auto');
  const [lowDataMode, setLowDataMode] = useState(false);
  const [networkState, setNetworkState] = useState<NetworkState>({ online: true, quality: 'unknown' });
  const [batteryState, setBatteryState] = useState<BatteryState>({ level: 1, charging: true });
  const [config, setConfig] = useState<AdaptiveSyncConfig | null>(null);
  const [dataUsage, setDataUsage] = useState({ sent: 0, received: 0 });

  useEffect(() => {
    const manager = getAdaptiveSyncManager();
    
    setSyncMode(manager.getSyncMode());
    setLowDataMode(manager.isLowDataMode());
    setNetworkState(manager.getNetworkState());
    setBatteryState(manager.getBatteryState());
    setConfig(manager.getConfig());

    const unsubscribe = manager.subscribe((newConfig) => {
      setNetworkState(manager.getNetworkState());
      setBatteryState(manager.getBatteryState());
      setConfig(newConfig);
    });

    // Load data usage stats
    const stored = localStorage.getItem('data_usage_stats');
    if (stored) {
      try {
        setDataUsage(JSON.parse(stored));
      } catch (e) {
        // Ignore
      }
    }

    return unsubscribe;
  }, []);

  const handleSyncModeChange = (mode: SyncMode) => {
    setSyncMode(mode);
    getAdaptiveSyncManager().setSyncMode(mode);
  };

  const handleLowDataModeChange = (enabled: boolean) => {
    setLowDataMode(enabled);
    getAdaptiveSyncManager().setLowDataMode(enabled);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatInterval = (ms: number) => {
    if (ms === Infinity) return 'Manual only';
    if (ms < 60000) return `${Math.round(ms / 1000)} seconds`;
    if (ms < 3600000) return `${Math.round(ms / 60000)} minutes`;
    return `${Math.round(ms / 3600000)} hours`;
  };

  return (
    <div className={`bg-white rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold text-gray-900">Data & Sync Settings</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="p-4 space-y-6">
        {/* Current Status */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Current Status</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Network:</span>
              <span className={`ml-2 font-medium ${
                !networkState.online ? 'text-red-600' :
                networkState.quality === '2g' ? 'text-orange-600' :
                networkState.quality === '3g' ? 'text-yellow-600' :
                'text-green-600'
              }`}>
                {!networkState.online ? 'Offline' : networkState.quality.toUpperCase()}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Battery:</span>
              <span className={`ml-2 font-medium ${
                batteryState.level < 0.2 ? 'text-red-600' :
                batteryState.level < 0.5 ? 'text-yellow-600' :
                'text-green-600'
              }`}>
                {Math.round(batteryState.level * 100)}%
                {batteryState.charging && ' (charging)'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Sync interval:</span>
              <span className="ml-2 font-medium text-gray-900">
                {config ? formatInterval(config.syncInterval) : '-'}
              </span>
            </div>
            <div>
              <span className="text-gray-500">GPS interval:</span>
              <span className="ml-2 font-medium text-gray-900">
                {config ? formatInterval(config.gpsInterval) : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* Low Data Mode Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Low Data Mode</h3>
            <p className="text-sm text-gray-500">
              Reduces data usage by disabling maps and imagery
            </p>
          </div>
          <button
            onClick={() => handleLowDataModeChange(!lowDataMode)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              lowDataMode ? 'bg-green-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                lowDataMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Sync Mode Selection */}
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-3">Sync Mode</h3>
          <div className="space-y-2">
            <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="syncMode"
                checked={syncMode === 'auto'}
                onChange={() => handleSyncModeChange('auto')}
                className="h-4 w-4 text-blue-600"
              />
              <div className="ml-3">
                <span className="text-sm font-medium text-gray-900">Automatic</span>
                <p className="text-xs text-gray-500">Syncs automatically based on network quality</p>
              </div>
            </label>

            <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="syncMode"
                checked={syncMode === 'manual'}
                onChange={() => handleSyncModeChange('manual')}
                className="h-4 w-4 text-blue-600"
              />
              <div className="ml-3">
                <span className="text-sm font-medium text-gray-900">Manual Only</span>
                <p className="text-xs text-gray-500">Only sync when you tap the sync button</p>
              </div>
            </label>

            <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="syncMode"
                checked={syncMode === 'wifi-only'}
                onChange={() => handleSyncModeChange('wifi-only')}
                className="h-4 w-4 text-blue-600"
              />
              <div className="ml-3">
                <span className="text-sm font-medium text-gray-900">WiFi Only</span>
                <p className="text-xs text-gray-500">Only sync when connected to WiFi</p>
              </div>
            </label>
          </div>
        </div>

        {/* Data Usage Stats */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Data Usage (This Session)</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Sent:</span>
              <span className="ml-2 font-medium text-gray-900">{formatBytes(dataUsage.sent)}</span>
            </div>
            <div>
              <span className="text-gray-500">Received:</span>
              <span className="ml-2 font-medium text-gray-900">{formatBytes(dataUsage.received)}</span>
            </div>
          </div>
        </div>

        {/* Feature Status */}
        {config && (
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Feature Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-gray-600">Maps</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  config.enableMaps ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {config.enableMaps ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-gray-600">Satellite Imagery</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  config.enableImagery ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {config.enableImagery ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-gray-600">GPS Tracking</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  config.enableGpsTracking ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {config.enableGpsTracking ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-600">Data Compression</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  config.enableCompression ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {config.enableCompression ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tips for Low Connectivity */}
        <div className="bg-blue-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Tips for Low Connectivity</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Your data is always saved locally first</li>
            <li>• Use Manual sync mode to control when data is sent</li>
            <li>• Enable Low Data Mode to reduce data usage</li>
            <li>• Sync when you have better network coverage</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Quick toggle button for Low Data Mode
export function LowDataModeQuickToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const manager = getAdaptiveSyncManager();
    setEnabled(manager.isLowDataMode());
    
    const unsubscribe = manager.subscribe(() => {
      setEnabled(manager.isLowDataMode());
    });
    
    return unsubscribe;
  }, []);

  const toggle = () => {
    const newValue = !enabled;
    setEnabled(newValue);
    getAdaptiveSyncManager().setLowDataMode(newValue);
  };

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        enabled
          ? 'bg-green-100 text-green-700 hover:bg-green-200'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      {enabled ? 'Low Data: ON' : 'Low Data: OFF'}
    </button>
  );
}

export default LowDataModeSettings;
