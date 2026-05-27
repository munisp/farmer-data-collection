/**
 * GPS Tracking Service for Mobile
 * 
 * Features:
 * - Real-time GPS tracking with backend sync
 * - Offline GPS buffer with batch sync
 * - Background location tracking (Expo TaskManager)
 * - Battery-aware sampling (adjusts frequency based on battery level)
 * - Track quality filtering (outlier rejection)
 * - OS-specific background tracking optimizations (Android/iOS)
 * - Idempotent track recording with clientId for duplicate detection
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import * as Device from 'expo-device';
import { Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@/utils/constants';

// Constants
const BACKGROUND_LOCATION_TASK = 'background-location-task';
const GPS_BUFFER_KEY = 'gps_track_buffer';
const GPS_DEVICE_ID_KEY = 'gps_device_id';
const GPS_SETTINGS_KEY = 'gps_settings';
const MAX_BUFFER_SIZE = 1000;
const SYNC_BATCH_SIZE = 50;
const MAX_SPEED_MS = 55.56; // 200 km/h in m/s - reject points faster than this
const MIN_ACCURACY_METERS = 100; // Reject points with accuracy worse than this

// Types
export interface GPSTrackPoint {
  id: string;
  deviceId: number;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp: number;
  synced: boolean;
  rejected?: boolean;
  rejectionReason?: string;
}

export interface GPSSettings {
  enabled: boolean;
  backgroundEnabled: boolean;
  batteryAwareEnabled: boolean;
  highPrecisionInterval: number; // ms
  highPrecisionDistance: number; // meters
  economyInterval: number; // ms
  economyDistance: number; // meters
  batteryThreshold: number; // percentage below which to use economy mode
}

export interface GPSSyncResult {
  synced: number;
  failed: number;
  remaining: number;
}

// Default settings
const DEFAULT_SETTINGS: GPSSettings = {
  enabled: true,
  backgroundEnabled: false,
  batteryAwareEnabled: true,
  highPrecisionInterval: 5000, // 5 seconds
  highPrecisionDistance: 10, // 10 meters
  economyInterval: 30000, // 30 seconds
  economyDistance: 50, // 50 meters
  batteryThreshold: 40, // 40%
};

class GPSTrackingService {
  private settings: GPSSettings = DEFAULT_SETTINGS;
  private deviceId: number | null = null;
  private authToken: string | null = null;
  private lastTrackPoint: GPSTrackPoint | null = null;
  private isTracking: boolean = false;
  private locationSubscription: Location.LocationSubscription | null = null;
  private syncInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the GPS tracking service
   */
  async init(authToken: string): Promise<void> {
    this.authToken = authToken;
    await this.loadSettings();
    await this.loadDeviceId();
    
    // Start periodic sync
    this.startPeriodicSync();
    
    console.log('[GPSService] Initialized');
  }

  /**
   * Load settings from storage
   */
  private async loadSettings(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(GPS_SETTINGS_KEY);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('[GPSService] Failed to load settings:', error);
    }
  }

  /**
   * Save settings to storage
   */
  async saveSettings(settings: Partial<GPSSettings>): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    await AsyncStorage.setItem(GPS_SETTINGS_KEY, JSON.stringify(this.settings));
  }

  /**
   * Get current settings
   */
  getSettings(): GPSSettings {
    return { ...this.settings };
  }

  /**
   * Load device ID from storage
   */
  private async loadDeviceId(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(GPS_DEVICE_ID_KEY);
      if (stored) {
        this.deviceId = parseInt(stored, 10);
      }
    } catch (error) {
      console.error('[GPSService] Failed to load device ID:', error);
    }
  }

  /**
   * Set device ID (after registration)
   */
  async setDeviceId(deviceId: number): Promise<void> {
    this.deviceId = deviceId;
    await AsyncStorage.setItem(GPS_DEVICE_ID_KEY, deviceId.toString());
  }

  /**
   * Get current device ID
   */
  getDeviceId(): number | null {
    return this.deviceId;
  }

  /**
   * Request location permissions
   */
  async requestPermissions(): Promise<{ foreground: boolean; background: boolean }> {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    const foreground = foregroundStatus === 'granted';

    let background = false;
    if (foreground) {
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      background = backgroundStatus === 'granted';
    }

    return { foreground, background };
  }

  /**
   * Get current location accuracy settings based on battery level
   */
  private async getLocationOptions(): Promise<Location.LocationOptions> {
    if (!this.settings.batteryAwareEnabled) {
      return {
        accuracy: Location.Accuracy.High,
        timeInterval: this.settings.highPrecisionInterval,
        distanceInterval: this.settings.highPrecisionDistance,
      };
    }

    try {
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const isCharging = (await Battery.getBatteryStateAsync()) === Battery.BatteryState.CHARGING;

      // Use high precision if charging or battery above threshold
      if (isCharging || batteryLevel * 100 > this.settings.batteryThreshold) {
        return {
          accuracy: Location.Accuracy.High,
          timeInterval: this.settings.highPrecisionInterval,
          distanceInterval: this.settings.highPrecisionDistance,
        };
      }

      // Use economy mode for low battery
      return {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: this.settings.economyInterval,
        distanceInterval: this.settings.economyDistance,
      };
    } catch (error) {
      // Default to high precision if battery API fails
      return {
        accuracy: Location.Accuracy.High,
        timeInterval: this.settings.highPrecisionInterval,
        distanceInterval: this.settings.highPrecisionDistance,
      };
    }
  }

  /**
   * Start foreground location tracking
   */
  async startTracking(): Promise<boolean> {
    if (!this.deviceId) {
      console.error('[GPSService] No device ID set');
      return false;
    }

    if (this.isTracking) {
      return true;
    }

    const { foreground } = await this.requestPermissions();
    if (!foreground) {
      console.error('[GPSService] Location permission denied');
      return false;
    }

    const options = await this.getLocationOptions();
    
    this.locationSubscription = await Location.watchPositionAsync(
      options,
      (location) => this.handleLocationUpdate(location)
    );

    this.isTracking = true;
    console.log('[GPSService] Started foreground tracking');
    return true;
  }

  /**
   * Stop foreground location tracking
   */
  async stopTracking(): Promise<void> {
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }
    this.isTracking = false;
    console.log('[GPSService] Stopped foreground tracking');
  }

  /**
   * Start background location tracking with OS-specific optimizations
   */
  async startBackgroundTracking(): Promise<boolean> {
    if (!this.deviceId) {
      console.error('[GPSService] No device ID set');
      return false;
    }

    const { background } = await this.requestPermissions();
    if (!background) {
      console.error('[GPSService] Background location permission denied');
      return false;
    }

    const options = await this.getLocationOptions();
    const osConfig = this.getOSSpecificConfig();

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: options.accuracy,
      timeInterval: options.timeInterval,
      distanceInterval: options.distanceInterval,
      foregroundService: {
        notificationTitle: 'GPS Tracking Active',
        notificationBody: 'Tracking your location for farm activities',
        notificationColor: '#22c55e',
      },
      // OS-specific optimizations
      pausesUpdatesAutomatically: osConfig.pausesUpdatesAutomatically,
      showsBackgroundLocationIndicator: osConfig.showsBackgroundLocationIndicator,
      activityType: osConfig.activityType,
      deferredUpdatesInterval: osConfig.deferredUpdatesInterval,
      deferredUpdatesDistance: osConfig.deferredUpdatesDistance,
    });

    // Set up app state listener for iOS background handling
    this.setupAppStateListener();

    await this.saveSettings({ backgroundEnabled: true });
    console.log(`[GPSService] Started background tracking (${Platform.OS})`);
    return true;
  }

  /**
   * Get OS-specific configuration for background tracking
   * Handles differences between Android and iOS power management
   */
  private getOSSpecificConfig(): {
    pausesUpdatesAutomatically: boolean;
    showsBackgroundLocationIndicator: boolean;
    activityType: Location.ActivityType;
    deferredUpdatesInterval: number;
    deferredUpdatesDistance: number;
  } {
    if (Platform.OS === 'ios') {
      // iOS-specific optimizations
      // - Use fitness activity type for better background behavior
      // - Enable deferred updates to batch location updates and save battery
      // - Show background indicator for user transparency
      return {
        pausesUpdatesAutomatically: false, // Don't let iOS pause updates
        showsBackgroundLocationIndicator: true, // Show blue bar on iOS
        activityType: Location.ActivityType.Fitness, // Better for walking/driving on farms
        deferredUpdatesInterval: 60000, // Batch updates every 60 seconds when possible
        deferredUpdatesDistance: 100, // Or every 100 meters
      };
    } else {
      // Android-specific optimizations
      // - Disable automatic pausing (Android OEMs have aggressive battery optimization)
      // - Use other activity type for general farm work
      // - Shorter deferred intervals for more responsive tracking
      return {
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.Other, // General activity
        deferredUpdatesInterval: 30000, // More frequent on Android
        deferredUpdatesDistance: 50,
      };
    }
  }

  /**
   * Set up app state listener for handling iOS background/foreground transitions
   */
  private appStateSubscription: any = null;
  
  private setupAppStateListener(): void {
    if (this.appStateSubscription) {
      return; // Already set up
    }

    this.appStateSubscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (Platform.OS === 'ios') {
        if (nextAppState === 'active') {
          // App came to foreground - sync any buffered points
          console.log('[GPSService] iOS app became active, syncing buffered points');
          await this.syncAll();
        } else if (nextAppState === 'background') {
          // App went to background - ensure background tracking is properly configured
          console.log('[GPSService] iOS app went to background');
          // iOS may throttle location updates in background, so we rely on deferred updates
        }
      } else if (Platform.OS === 'android') {
        if (nextAppState === 'active') {
          // Android app came to foreground - check if background tracking is still active
          console.log('[GPSService] Android app became active');
          const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
          if (this.settings.backgroundEnabled && !isRegistered) {
            // Background tracking was killed by Android, restart it
            console.log('[GPSService] Android killed background tracking, restarting');
            await this.startBackgroundTracking();
          }
          await this.syncAll();
        }
      }
    });
  }

  /**
   * Clean up app state listener
   */
  private cleanupAppStateListener(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  /**
   * Stop background location tracking
   */
  async stopBackgroundTracking(): Promise<void> {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
    await this.saveSettings({ backgroundEnabled: false });
    console.log('[GPSService] Stopped background tracking');
  }

  /**
   * Handle location update from foreground or background tracking
   */
  async handleLocationUpdate(location: Location.LocationObject): Promise<void> {
    if (!this.deviceId) return;

    const trackPoint: GPSTrackPoint = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      deviceId: this.deviceId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude ?? undefined,
      accuracy: location.coords.accuracy ?? undefined,
      speed: location.coords.speed ?? undefined,
      heading: location.coords.heading ?? undefined,
      timestamp: location.timestamp,
      synced: false,
    };

    // Apply quality filtering
    const filteredPoint = this.filterTrackPoint(trackPoint);
    
    if (filteredPoint.rejected) {
      console.log(`[GPSService] Rejected point: ${filteredPoint.rejectionReason}`);
      return;
    }

    // Save to buffer
    await this.addToBuffer(filteredPoint);
    this.lastTrackPoint = filteredPoint;

    // Try to sync immediately if online
    this.trySyncSingle(filteredPoint);
  }

  /**
   * Filter track point for quality (outlier rejection)
   */
  private filterTrackPoint(point: GPSTrackPoint): GPSTrackPoint {
    // Check accuracy threshold
    if (point.accuracy && point.accuracy > MIN_ACCURACY_METERS) {
      return {
        ...point,
        rejected: true,
        rejectionReason: `Accuracy too low: ${point.accuracy}m > ${MIN_ACCURACY_METERS}m`,
      };
    }

    // Check for impossible speed jumps
    if (this.lastTrackPoint && point.speed !== undefined) {
      const timeDelta = (point.timestamp - this.lastTrackPoint.timestamp) / 1000; // seconds
      
      if (timeDelta > 0) {
        const distance = this.calculateDistance(
          this.lastTrackPoint.latitude,
          this.lastTrackPoint.longitude,
          point.latitude,
          point.longitude
        );
        
        const impliedSpeed = distance / timeDelta; // m/s
        
        if (impliedSpeed > MAX_SPEED_MS) {
          return {
            ...point,
            rejected: true,
            rejectionReason: `Impossible speed: ${(impliedSpeed * 3.6).toFixed(1)} km/h`,
          };
        }
      }
    }

    return point;
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Add track point to offline buffer
   */
  private async addToBuffer(point: GPSTrackPoint): Promise<void> {
    try {
      const buffer = await this.getBuffer();
      
      // Remove oldest points if buffer is full
      while (buffer.length >= MAX_BUFFER_SIZE) {
        buffer.shift();
      }
      
      buffer.push(point);
      await AsyncStorage.setItem(GPS_BUFFER_KEY, JSON.stringify(buffer));
    } catch (error) {
      console.error('[GPSService] Failed to add to buffer:', error);
    }
  }

  /**
   * Get offline buffer
   */
  async getBuffer(): Promise<GPSTrackPoint[]> {
    try {
      const stored = await AsyncStorage.getItem(GPS_BUFFER_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[GPSService] Failed to get buffer:', error);
      return [];
    }
  }

  /**
   * Get unsynced points from buffer
   */
  async getUnsyncedPoints(): Promise<GPSTrackPoint[]> {
    const buffer = await this.getBuffer();
    return buffer.filter(p => !p.synced && !p.rejected);
  }

  /**
   * Mark points as synced in buffer
   */
  private async markAsSynced(ids: string[]): Promise<void> {
    try {
      const buffer = await this.getBuffer();
      const idSet = new Set(ids);
      
      const updated = buffer.map(p => 
        idSet.has(p.id) ? { ...p, synced: true } : p
      );
      
      // Remove synced points older than 24 hours
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const filtered = updated.filter(p => !p.synced || p.timestamp > oneDayAgo);
      
      await AsyncStorage.setItem(GPS_BUFFER_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('[GPSService] Failed to mark as synced:', error);
    }
  }

  /**
   * Try to sync a single point immediately
   */
  private async trySyncSingle(point: GPSTrackPoint): Promise<boolean> {
    try {
      const networkState = await Network.getNetworkStateAsync();
      if (!networkState.isConnected || !networkState.isInternetReachable) {
        return false;
      }

      const success = await this.sendTrackPoint(point);
      if (success) {
        await this.markAsSynced([point.id]);
      }
      return success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Send track point to backend with clientId for idempotency
   */
  private async sendTrackPoint(point: GPSTrackPoint): Promise<boolean> {
    if (!this.authToken) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/api/trpc/gpsTracking.recordTrack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({
          json: {
            deviceId: point.deviceId,
            latitude: point.latitude,
            longitude: point.longitude,
            altitude: point.altitude,
            accuracy: point.accuracy,
            speed: point.speed,
            heading: point.heading,
            clientId: point.id, // Used for duplicate detection on backend
            metadata: {
              originalTimestamp: point.timestamp,
              platform: Platform.OS,
              deviceModel: Device.modelName,
            },
          },
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('[GPSService] Failed to send track point:', error);
      return false;
    }
  }

  /**
   * Sync all unsynced points in batches
   */
  async syncAll(): Promise<GPSSyncResult> {
    const unsynced = await this.getUnsyncedPoints();
    
    if (unsynced.length === 0) {
      return { synced: 0, failed: 0, remaining: 0 };
    }

    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      return { synced: 0, failed: 0, remaining: unsynced.length };
    }

    let synced = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < unsynced.length; i += SYNC_BATCH_SIZE) {
      const batch = unsynced.slice(i, i + SYNC_BATCH_SIZE);
      const syncedIds: string[] = [];

      for (const point of batch) {
        const success = await this.sendTrackPoint(point);
        if (success) {
          syncedIds.push(point.id);
          synced++;
        } else {
          failed++;
        }
      }

      if (syncedIds.length > 0) {
        await this.markAsSynced(syncedIds);
      }
    }

    const remaining = await this.getUnsyncedPoints();
    return { synced, failed, remaining: remaining.length };
  }

  /**
   * Start periodic sync (every 10 minutes)
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      const result = await this.syncAll();
      if (result.synced > 0 || result.failed > 0) {
        console.log(`[GPSService] Periodic sync: ${result.synced} synced, ${result.failed} failed, ${result.remaining} remaining`);
      }
    }, 10 * 60 * 1000); // 10 minutes
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Get tracking status
   */
  getStatus(): { isTracking: boolean; deviceId: number | null; settings: GPSSettings } {
    return {
      isTracking: this.isTracking,
      deviceId: this.deviceId,
      settings: this.settings,
    };
  }

  /**
   * Get buffer statistics
   */
  async getBufferStats(): Promise<{ total: number; synced: number; unsynced: number; rejected: number }> {
    const buffer = await this.getBuffer();
    return {
      total: buffer.length,
      synced: buffer.filter(p => p.synced).length,
      unsynced: buffer.filter(p => !p.synced && !p.rejected).length,
      rejected: buffer.filter(p => p.rejected).length,
    };
  }

  /**
   * Clear buffer
   */
  async clearBuffer(): Promise<void> {
    await AsyncStorage.removeItem(GPS_BUFFER_KEY);
  }
}

// Singleton instance
export const gpsService = new GPSTrackingService();

// Define background task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[GPSService] Background task error:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    for (const location of locations) {
      await gpsService.handleLocationUpdate(location);
    }
  }
});

export default gpsService;
