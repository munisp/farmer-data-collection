/**
 * Network-Aware Sync Manager for React Native
 * 
 * Mobile-specific optimizations for developing countries:
 * - Uses React Native NetInfo for accurate network detection
 * - Battery-aware sync throttling using expo-battery
 * - Background sync management
 * - Offline queue with MMKV persistence
 */

import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';
import * as Battery from 'expo-battery';
import { AppState, AppStateStatus } from 'react-native';
import { MMKV } from 'react-native-mmkv';

// Initialize MMKV storage
const storage = new MMKV({ id: 'sync-config' });

// Network quality levels
export type NetworkQuality = 'offline' | '2g' | '3g' | '4g' | 'wifi' | 'unknown';

// Sync mode
export type SyncMode = 'auto' | 'manual' | 'wifi-only';

// Network state
export interface NetworkState {
  online: boolean;
  quality: NetworkQuality;
  type: string;
  isInternetReachable: boolean | null;
  details: any;
}

// Battery state
export interface BatteryState {
  level: number;
  charging: boolean;
  lowPowerMode: boolean;
}

// Sync configuration based on conditions
export interface AdaptiveSyncConfig {
  syncInterval: number;
  maxRetries: number;
  retryDelay: number;
  batchSize: number;
  enableCompression: boolean;
  enableGpsTracking: boolean;
  gpsInterval: number;
  enableMaps: boolean;
  enableImagery: boolean;
}

// Default configurations for different network qualities
const SYNC_CONFIGS: Record<NetworkQuality, AdaptiveSyncConfig> = {
  offline: {
    syncInterval: Infinity,
    maxRetries: 0,
    retryDelay: 0,
    batchSize: 50,
    enableCompression: true,
    enableGpsTracking: true,
    gpsInterval: 60000,
    enableMaps: false,
    enableImagery: false,
  },
  '2g': {
    syncInterval: 300000, // 5 minutes
    maxRetries: 2,
    retryDelay: 10000,
    batchSize: 10,
    enableCompression: true,
    enableGpsTracking: true,
    gpsInterval: 30000,
    enableMaps: false,
    enableImagery: false,
  },
  '3g': {
    syncInterval: 120000, // 2 minutes
    maxRetries: 3,
    retryDelay: 5000,
    batchSize: 25,
    enableCompression: true,
    enableGpsTracking: true,
    gpsInterval: 15000,
    enableMaps: true,
    enableImagery: false,
  },
  '4g': {
    syncInterval: 60000, // 1 minute
    maxRetries: 3,
    retryDelay: 2000,
    batchSize: 50,
    enableCompression: true,
    enableGpsTracking: true,
    gpsInterval: 10000,
    enableMaps: true,
    enableImagery: true,
  },
  wifi: {
    syncInterval: 30000, // 30 seconds
    maxRetries: 5,
    retryDelay: 1000,
    batchSize: 100,
    enableCompression: false,
    enableGpsTracking: true,
    gpsInterval: 5000,
    enableMaps: true,
    enableImagery: true,
  },
  unknown: {
    syncInterval: 120000,
    maxRetries: 3,
    retryDelay: 5000,
    batchSize: 25,
    enableCompression: true,
    enableGpsTracking: true,
    gpsInterval: 15000,
    enableMaps: true,
    enableImagery: false,
  },
};

// Low battery configuration overrides
const LOW_BATTERY_CONFIG: Partial<AdaptiveSyncConfig> = {
  syncInterval: 600000, // 10 minutes
  gpsInterval: 120000, // 2 minutes
  enableMaps: false,
  enableImagery: false,
};

// Storage keys
const STORAGE_KEYS = {
  syncMode: 'sync_mode',
  lowDataMode: 'low_data_mode',
  consecutiveFailures: 'consecutive_sync_failures',
};

class MobileAdaptiveSyncManager {
  private listeners: Set<(config: AdaptiveSyncConfig) => void> = new Set();
  private networkState: NetworkState = {
    online: true,
    quality: 'unknown',
    type: 'unknown',
    isInternetReachable: null,
    details: null,
  };
  private batteryState: BatteryState = {
    level: 1,
    charging: true,
    lowPowerMode: false,
  };
  private syncMode: SyncMode = 'auto';
  private lowDataMode: boolean = false;
  private consecutiveFailures: number = 0;
  private appState: AppStateStatus = 'active';
  private unsubscribeNetInfo: (() => void) | null = null;
  private batterySubscription: any = null;
  private lowPowerSubscription: any = null;

  constructor() {
    this.loadPreferences();
    this.initializeListeners();
  }

  private loadPreferences(): void {
    try {
      const savedMode = storage.getString(STORAGE_KEYS.syncMode);
      if (savedMode === 'auto' || savedMode === 'manual' || savedMode === 'wifi-only') {
        this.syncMode = savedMode;
      }
      this.lowDataMode = storage.getBoolean(STORAGE_KEYS.lowDataMode) ?? false;
      this.consecutiveFailures = storage.getNumber(STORAGE_KEYS.consecutiveFailures) ?? 0;
    } catch (error) {
      console.log('[MobileSync] Error loading preferences:', error);
    }
  }

  private savePreferences(): void {
    try {
      storage.set(STORAGE_KEYS.syncMode, this.syncMode);
      storage.set(STORAGE_KEYS.lowDataMode, this.lowDataMode);
      storage.set(STORAGE_KEYS.consecutiveFailures, this.consecutiveFailures);
    } catch (error) {
      console.log('[MobileSync] Error saving preferences:', error);
    }
  }

  private async initializeListeners(): Promise<void> {
    // Network state listener
    this.unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      this.handleNetworkChange(state);
    });

    // Get initial network state
    const initialState = await NetInfo.fetch();
    this.handleNetworkChange(initialState);

    // Battery state listeners
    try {
      // Get initial battery state
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();
      const lowPowerMode = await Battery.isLowPowerModeEnabledAsync();

      this.batteryState = {
        level: batteryLevel,
        charging: batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL,
        lowPowerMode,
      };

      // Subscribe to battery changes
      this.batterySubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
        this.batteryState.level = batteryLevel;
        this.updateConfig();
      });

      this.lowPowerSubscription = Battery.addLowPowerModeListener(({ lowPowerMode }) => {
        this.batteryState.lowPowerMode = lowPowerMode;
        this.updateConfig();
      });
    } catch (error) {
      console.log('[MobileSync] Battery API not available:', error);
    }

    // App state listener (foreground/background)
    AppState.addEventListener('change', (nextAppState) => {
      this.appState = nextAppState;
      this.updateConfig();
    });
  }

  private handleNetworkChange(state: NetInfoState): void {
    this.networkState = {
      online: state.isConnected ?? false,
      quality: this.mapNetworkType(state),
      type: state.type,
      isInternetReachable: state.isInternetReachable,
      details: state.details,
    };
    this.updateConfig();
  }

  private mapNetworkType(state: NetInfoState): NetworkQuality {
    if (!state.isConnected) {
      return 'offline';
    }

    switch (state.type) {
      case NetInfoStateType.wifi:
      case NetInfoStateType.ethernet:
        return 'wifi';
      case NetInfoStateType.cellular:
        // Check cellular generation if available
        const details = state.details as any;
        if (details?.cellularGeneration) {
          switch (details.cellularGeneration) {
            case '2g':
              return '2g';
            case '3g':
              return '3g';
            case '4g':
            case '5g':
              return '4g';
          }
        }
        return '3g'; // Default for cellular
      default:
        return 'unknown';
    }
  }

  // Get current adaptive configuration
  getConfig(): AdaptiveSyncConfig {
    let config = { ...SYNC_CONFIGS[this.networkState.quality] };

    // Apply low battery overrides
    if (this.isLowBattery()) {
      config = { ...config, ...LOW_BATTERY_CONFIG };
    }

    // Apply critical battery overrides
    if (this.isCriticalBattery()) {
      config.syncInterval = Infinity;
      config.enableGpsTracking = false;
    }

    // Apply low power mode overrides
    if (this.batteryState.lowPowerMode) {
      config.syncInterval = Math.max(config.syncInterval, 300000);
      config.gpsInterval = Math.max(config.gpsInterval, 60000);
      config.enableMaps = false;
      config.enableImagery = false;
    }

    // Apply low data mode overrides
    if (this.lowDataMode) {
      config.enableMaps = false;
      config.enableImagery = false;
      config.batchSize = Math.min(config.batchSize, 10);
      config.syncInterval = Math.max(config.syncInterval, 300000);
    }

    // Apply sync mode overrides
    if (this.syncMode === 'manual') {
      config.syncInterval = Infinity;
    } else if (this.syncMode === 'wifi-only' && this.networkState.quality !== 'wifi') {
      config.syncInterval = Infinity;
    }

    // Apply background mode overrides
    if (this.appState !== 'active') {
      config.syncInterval = Math.max(config.syncInterval, 600000); // At least 10 minutes in background
      config.enableGpsTracking = false;
    }

    // Apply exponential back-off for consecutive failures
    if (this.consecutiveFailures > 0) {
      const backoffMultiplier = Math.min(Math.pow(2, this.consecutiveFailures), 32);
      config.syncInterval = Math.min(config.syncInterval * backoffMultiplier, 3600000);
      config.retryDelay = Math.min(config.retryDelay * backoffMultiplier, 60000);
    }

    return config;
  }

  // Set sync mode
  setSyncMode(mode: SyncMode): void {
    this.syncMode = mode;
    this.savePreferences();
    this.updateConfig();
  }

  getSyncMode(): SyncMode {
    return this.syncMode;
  }

  // Set low data mode
  setLowDataMode(enabled: boolean): void {
    this.lowDataMode = enabled;
    this.savePreferences();
    this.updateConfig();
  }

  isLowDataMode(): boolean {
    return this.lowDataMode;
  }

  // Record sync attempt result
  recordSyncResult(success: boolean): void {
    if (success) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
    }
    this.savePreferences();
    this.updateConfig();
  }

  // Reset failure count
  resetFailures(): void {
    this.consecutiveFailures = 0;
    this.savePreferences();
    this.updateConfig();
  }

  // Get network state
  getNetworkState(): NetworkState {
    return { ...this.networkState };
  }

  // Get battery state
  getBatteryState(): BatteryState {
    return { ...this.batteryState };
  }

  // Check battery levels
  isLowBattery(): boolean {
    return this.batteryState.level < 0.2 && !this.batteryState.charging;
  }

  isCriticalBattery(): boolean {
    return this.batteryState.level < 0.1 && !this.batteryState.charging;
  }

  // Check if sync should be attempted
  shouldSync(): boolean {
    const config = this.getConfig();

    if (!this.networkState.online) {
      return false;
    }

    if (config.syncInterval === Infinity) {
      return false;
    }

    return true;
  }

  // Subscribe to config changes
  subscribe(callback: (config: AdaptiveSyncConfig) => void): () => void {
    this.listeners.add(callback);
    callback(this.getConfig());
    return () => this.listeners.delete(callback);
  }

  private updateConfig(): void {
    const config = this.getConfig();
    this.listeners.forEach((callback) => callback(config));
  }

  // Get human-readable status
  getStatusMessage(): string {
    if (!this.networkState.online) {
      return 'Offline - Data saved locally';
    }

    if (this.isCriticalBattery()) {
      return 'Critical battery - Sync paused';
    }

    if (this.isLowBattery()) {
      return 'Low battery - Reduced sync';
    }

    if (this.batteryState.lowPowerMode) {
      return 'Power saving mode - Reduced sync';
    }

    if (this.syncMode === 'manual') {
      return 'Manual sync mode';
    }

    if (this.syncMode === 'wifi-only' && this.networkState.quality !== 'wifi') {
      return 'WiFi-only mode - Waiting for WiFi';
    }

    if (this.consecutiveFailures > 0) {
      return `Sync issues - Retrying (${this.consecutiveFailures} failures)`;
    }

    const qualityLabels: Record<NetworkQuality, string> = {
      offline: 'Offline',
      '2g': 'Slow network (2G)',
      '3g': 'Moderate network (3G)',
      '4g': 'Good network (4G)',
      wifi: 'WiFi connected',
      unknown: 'Connected',
    };

    return qualityLabels[this.networkState.quality];
  }

  // Cleanup
  destroy(): void {
    if (this.unsubscribeNetInfo) {
      this.unsubscribeNetInfo();
    }
    if (this.batterySubscription) {
      this.batterySubscription.remove();
    }
    if (this.lowPowerSubscription) {
      this.lowPowerSubscription.remove();
    }
  }
}

// Singleton instance
let mobileAdaptiveSyncManager: MobileAdaptiveSyncManager | null = null;

export function getMobileAdaptiveSyncManager(): MobileAdaptiveSyncManager {
  if (!mobileAdaptiveSyncManager) {
    mobileAdaptiveSyncManager = new MobileAdaptiveSyncManager();
  }
  return mobileAdaptiveSyncManager;
}

// React hook for adaptive sync
export function useAdaptiveSync() {
  const manager = getMobileAdaptiveSyncManager();

  return {
    config: manager.getConfig(),
    networkState: manager.getNetworkState(),
    batteryState: manager.getBatteryState(),
    syncMode: manager.getSyncMode(),
    lowDataMode: manager.isLowDataMode(),
    statusMessage: manager.getStatusMessage(),
    shouldSync: manager.shouldSync(),
    setSyncMode: (mode: SyncMode) => manager.setSyncMode(mode),
    setLowDataMode: (enabled: boolean) => manager.setLowDataMode(enabled),
    recordSyncResult: (success: boolean) => manager.recordSyncResult(success),
    resetFailures: () => manager.resetFailures(),
  };
}
