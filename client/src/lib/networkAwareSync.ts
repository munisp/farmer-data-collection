/**
 * Network-Aware Sync Manager
 * 
 * Optimizations for developing countries with infrastructure challenges:
 * - Adaptive sync intervals based on network quality
 * - Automatic back-off on repeated failures
 * - Manual sync mode for 2G/poor networks
 * - Battery-aware sync throttling
 * - Compression and payload optimization
 */

// Network quality levels
export type NetworkQuality = 'offline' | '2g' | '3g' | '4g' | 'wifi' | 'unknown';

// Sync mode
export type SyncMode = 'auto' | 'manual' | 'wifi-only';

// Network state
export interface NetworkState {
  online: boolean;
  quality: NetworkQuality;
  effectiveType?: string;
  downlink?: number; // Mbps
  rtt?: number; // Round-trip time in ms
  saveData?: boolean;
}

// Battery state
export interface BatteryState {
  level: number; // 0-1
  charging: boolean;
  chargingTime?: number;
  dischargingTime?: number;
}

// Sync configuration based on conditions
export interface AdaptiveSyncConfig {
  syncInterval: number; // ms
  maxRetries: number;
  retryDelay: number; // ms
  batchSize: number;
  enableCompression: boolean;
  enableGpsTracking: boolean;
  gpsInterval: number; // ms
  enableMaps: boolean;
  enableImagery: boolean;
}

// Default configurations for different network qualities
const SYNC_CONFIGS: Record<NetworkQuality, AdaptiveSyncConfig> = {
  offline: {
    syncInterval: Infinity, // No auto-sync when offline
    maxRetries: 0,
    retryDelay: 0,
    batchSize: 50,
    enableCompression: true,
    enableGpsTracking: true,
    gpsInterval: 60000, // 1 minute (battery saving)
    enableMaps: false,
    enableImagery: false,
  },
  '2g': {
    syncInterval: 300000, // 5 minutes
    maxRetries: 2,
    retryDelay: 10000, // 10 seconds
    batchSize: 10, // Small batches for slow networks
    enableCompression: true,
    enableGpsTracking: true,
    gpsInterval: 30000, // 30 seconds
    enableMaps: false, // Disable heavy features
    enableImagery: false,
  },
  '3g': {
    syncInterval: 120000, // 2 minutes
    maxRetries: 3,
    retryDelay: 5000,
    batchSize: 25,
    enableCompression: true,
    enableGpsTracking: true,
    gpsInterval: 15000, // 15 seconds
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
    gpsInterval: 10000, // 10 seconds
    enableMaps: true,
    enableImagery: true,
  },
  wifi: {
    syncInterval: 30000, // 30 seconds
    maxRetries: 5,
    retryDelay: 1000,
    batchSize: 100,
    enableCompression: false, // Less critical on WiFi
    enableGpsTracking: true,
    gpsInterval: 5000, // 5 seconds
    enableMaps: true,
    enableImagery: true,
  },
  unknown: {
    syncInterval: 120000, // 2 minutes (conservative)
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
  lastSyncAttempt: 'last_sync_attempt',
  consecutiveFailures: 'consecutive_sync_failures',
  networkStats: 'network_stats',
};

// Network quality detector
class NetworkQualityDetector {
  private listeners: Set<(state: NetworkState) => void> = new Set();
  private currentState: NetworkState = {
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    quality: 'unknown',
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeListeners();
      this.detectNetworkQuality();
    }
  }

  private initializeListeners(): void {
    window.addEventListener('online', () => this.handleOnlineChange(true));
    window.addEventListener('offline', () => this.handleOnlineChange(false));

    // Use Network Information API if available
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      connection.addEventListener('change', () => this.detectNetworkQuality());
    }
  }

  private handleOnlineChange(online: boolean): void {
    this.currentState.online = online;
    if (!online) {
      this.currentState.quality = 'offline';
    } else {
      this.detectNetworkQuality();
    }
    this.notifyListeners();
  }

  private detectNetworkQuality(): void {
    if (!navigator.onLine) {
      this.currentState = { online: false, quality: 'offline' };
      return;
    }

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    
    if (connection) {
      this.currentState = {
        online: true,
        quality: this.mapEffectiveType(connection.effectiveType),
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData,
      };
    } else {
      // Fallback: estimate based on a small fetch
      this.estimateNetworkQuality();
    }

    this.notifyListeners();
  }

  private mapEffectiveType(effectiveType: string): NetworkQuality {
    switch (effectiveType) {
      case 'slow-2g':
      case '2g':
        return '2g';
      case '3g':
        return '3g';
      case '4g':
        return '4g';
      default:
        return 'unknown';
    }
  }

  private async estimateNetworkQuality(): Promise<void> {
    try {
      const startTime = performance.now();
      const response = await fetch('/api/health', { method: 'HEAD', cache: 'no-store' });
      const endTime = performance.now();
      const rtt = endTime - startTime;

      // Estimate quality based on RTT
      let quality: NetworkQuality;
      if (rtt > 2000) {
        quality = '2g';
      } else if (rtt > 500) {
        quality = '3g';
      } else if (rtt > 100) {
        quality = '4g';
      } else {
        quality = 'wifi';
      }

      this.currentState = {
        online: true,
        quality,
        rtt,
      };
    } catch (error) {
      this.currentState = {
        online: navigator.onLine,
        quality: navigator.onLine ? 'unknown' : 'offline',
      };
    }
  }

  getState(): NetworkState {
    return { ...this.currentState };
  }

  subscribe(callback: (state: NetworkState) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentState);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback(this.currentState));
  }
}

// Battery monitor
class BatteryMonitor {
  private listeners: Set<(state: BatteryState) => void> = new Set();
  private currentState: BatteryState = { level: 1, charging: true };
  private battery: any = null;

  constructor() {
    if (typeof navigator !== 'undefined') {
      this.initializeBattery();
    }
  }

  private async initializeBattery(): Promise<void> {
    try {
      if ('getBattery' in navigator) {
        this.battery = await (navigator as any).getBattery();
        this.updateState();
        
        this.battery.addEventListener('chargingchange', () => this.updateState());
        this.battery.addEventListener('levelchange', () => this.updateState());
        this.battery.addEventListener('chargingtimechange', () => this.updateState());
        this.battery.addEventListener('dischargingtimechange', () => this.updateState());
      }
    } catch (error) {
      console.warn('[BatteryMonitor] Battery API not available');
    }
  }

  private updateState(): void {
    if (this.battery) {
      this.currentState = {
        level: this.battery.level,
        charging: this.battery.charging,
        chargingTime: this.battery.chargingTime,
        dischargingTime: this.battery.dischargingTime,
      };
      this.notifyListeners();
    }
  }

  getState(): BatteryState {
    return { ...this.currentState };
  }

  isLowBattery(): boolean {
    return this.currentState.level < 0.2 && !this.currentState.charging;
  }

  isCriticalBattery(): boolean {
    return this.currentState.level < 0.1 && !this.currentState.charging;
  }

  subscribe(callback: (state: BatteryState) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentState);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback(this.currentState));
  }
}

// Adaptive sync manager
export class AdaptiveSyncManager {
  private networkDetector: NetworkQualityDetector;
  private batteryMonitor: BatteryMonitor;
  private syncMode: SyncMode = 'auto';
  private lowDataMode: boolean = false;
  private consecutiveFailures: number = 0;
  private lastSyncAttempt: number = 0;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(config: AdaptiveSyncConfig) => void> = new Set();

  constructor() {
    this.networkDetector = new NetworkQualityDetector();
    this.batteryMonitor = new BatteryMonitor();
    
    // Load saved preferences
    this.loadPreferences();
    
    // Subscribe to network and battery changes
    this.networkDetector.subscribe(() => this.updateConfig());
    this.batteryMonitor.subscribe(() => this.updateConfig());
  }

  private loadPreferences(): void {
    if (typeof localStorage === 'undefined') return;
    
    const savedMode = localStorage.getItem(STORAGE_KEYS.syncMode);
    if (savedMode === 'auto' || savedMode === 'manual' || savedMode === 'wifi-only') {
      this.syncMode = savedMode;
    }
    
    this.lowDataMode = localStorage.getItem(STORAGE_KEYS.lowDataMode) === 'true';
    this.consecutiveFailures = parseInt(localStorage.getItem(STORAGE_KEYS.consecutiveFailures) || '0', 10);
    this.lastSyncAttempt = parseInt(localStorage.getItem(STORAGE_KEYS.lastSyncAttempt) || '0', 10);
  }

  private savePreferences(): void {
    if (typeof localStorage === 'undefined') return;
    
    localStorage.setItem(STORAGE_KEYS.syncMode, this.syncMode);
    localStorage.setItem(STORAGE_KEYS.lowDataMode, String(this.lowDataMode));
    localStorage.setItem(STORAGE_KEYS.consecutiveFailures, String(this.consecutiveFailures));
    localStorage.setItem(STORAGE_KEYS.lastSyncAttempt, String(this.lastSyncAttempt));
  }

  // Get current adaptive configuration
  getConfig(): AdaptiveSyncConfig {
    const networkState = this.networkDetector.getState();
    const batteryState = this.batteryMonitor.getState();
    
    // Start with base config for network quality
    let config = { ...SYNC_CONFIGS[networkState.quality] };
    
    // Apply low battery overrides
    if (this.batteryMonitor.isLowBattery()) {
      config = { ...config, ...LOW_BATTERY_CONFIG };
    }
    
    // Apply critical battery overrides (even more aggressive)
    if (this.batteryMonitor.isCriticalBattery()) {
      config.syncInterval = Infinity; // Disable auto-sync
      config.enableGpsTracking = false;
    }
    
    // Apply low data mode overrides
    if (this.lowDataMode) {
      config.enableMaps = false;
      config.enableImagery = false;
      config.batchSize = Math.min(config.batchSize, 10);
      config.syncInterval = Math.max(config.syncInterval, 300000); // At least 5 minutes
    }
    
    // Apply sync mode overrides
    if (this.syncMode === 'manual') {
      config.syncInterval = Infinity;
    } else if (this.syncMode === 'wifi-only' && networkState.quality !== 'wifi') {
      config.syncInterval = Infinity;
    }
    
    // Apply exponential back-off for consecutive failures
    if (this.consecutiveFailures > 0) {
      const backoffMultiplier = Math.min(Math.pow(2, this.consecutiveFailures), 32);
      config.syncInterval = Math.min(config.syncInterval * backoffMultiplier, 3600000); // Max 1 hour
      config.retryDelay = Math.min(config.retryDelay * backoffMultiplier, 60000); // Max 1 minute
    }
    
    // Apply save data mode from browser
    if (networkState.saveData) {
      config.enableMaps = false;
      config.enableImagery = false;
      config.batchSize = Math.min(config.batchSize, 5);
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
    this.lastSyncAttempt = Date.now();
    
    if (success) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
    }
    
    this.savePreferences();
    this.updateConfig();
  }

  // Reset failure count (e.g., when network changes)
  resetFailures(): void {
    this.consecutiveFailures = 0;
    this.savePreferences();
    this.updateConfig();
  }

  // Get network state
  getNetworkState(): NetworkState {
    return this.networkDetector.getState();
  }

  // Get battery state
  getBatteryState(): BatteryState {
    return this.batteryMonitor.getState();
  }

  // Check if sync should be attempted
  shouldSync(): boolean {
    const config = this.getConfig();
    const networkState = this.networkDetector.getState();
    
    // Never sync if offline
    if (!networkState.online) {
      return false;
    }
    
    // Never sync if interval is infinite (manual mode or critical battery)
    if (config.syncInterval === Infinity) {
      return false;
    }
    
    // Check if enough time has passed since last attempt
    const timeSinceLastSync = Date.now() - this.lastSyncAttempt;
    return timeSinceLastSync >= config.syncInterval;
  }

  // Subscribe to config changes
  subscribe(callback: (config: AdaptiveSyncConfig) => void): () => void {
    this.listeners.add(callback);
    callback(this.getConfig());
    return () => this.listeners.delete(callback);
  }

  private updateConfig(): void {
    const config = this.getConfig();
    this.listeners.forEach(callback => callback(config));
  }

  // Get human-readable status
  getStatusMessage(): string {
    const networkState = this.networkDetector.getState();
    const batteryState = this.batteryMonitor.getState();
    const config = this.getConfig();
    
    if (!networkState.online) {
      return 'Offline - Data saved locally';
    }
    
    if (this.batteryMonitor.isCriticalBattery()) {
      return 'Critical battery - Sync paused';
    }
    
    if (this.batteryMonitor.isLowBattery()) {
      return 'Low battery - Reduced sync';
    }
    
    if (this.syncMode === 'manual') {
      return 'Manual sync mode';
    }
    
    if (this.syncMode === 'wifi-only' && networkState.quality !== 'wifi') {
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
    
    return qualityLabels[networkState.quality];
  }
}

// Singleton instance
let adaptiveSyncManager: AdaptiveSyncManager | null = null;

export function getAdaptiveSyncManager(): AdaptiveSyncManager {
  if (!adaptiveSyncManager) {
    adaptiveSyncManager = new AdaptiveSyncManager();
  }
  return adaptiveSyncManager;
}

// React hook for adaptive sync
export function useAdaptiveSync() {
  const manager = getAdaptiveSyncManager();
  
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
