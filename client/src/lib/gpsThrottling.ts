/**
 * GPS Throttling Service
 * 
 * Battery-aware GPS tracking with adaptive sampling rates:
 * - Reduces GPS frequency on low battery
 * - Adjusts based on network quality
 * - Batches GPS points for efficient sync
 * - Supports manual vs automatic tracking modes
 */

import { getAdaptiveSyncManager, AdaptiveSyncConfig } from './networkAwareSync';

// GPS point with metadata
export interface GpsPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
  batteryLevel?: number;
  networkQuality?: string;
}

// GPS track (collection of points)
export interface GpsTrack {
  id: string;
  entityType: 'farm' | 'field' | 'boundary' | 'route';
  entityId: string;
  points: GpsPoint[];
  startTime: number;
  endTime?: number;
  totalDistance?: number;
  status: 'recording' | 'paused' | 'completed';
}

// GPS tracking options
export interface GpsTrackingOptions {
  entityType: 'farm' | 'field' | 'boundary' | 'route';
  entityId: string;
  minAccuracy?: number; // meters
  minDistance?: number; // meters between points
  maxPoints?: number; // maximum points before auto-stop
  autoStop?: boolean; // stop when returning to start
}

// Tracking state
interface TrackingState {
  active: boolean;
  track: GpsTrack | null;
  watchId: number | null;
  lastPoint: GpsPoint | null;
  config: AdaptiveSyncConfig | null;
}

class GpsThrottlingService {
  private state: TrackingState = {
    active: false,
    track: null,
    watchId: null,
    lastPoint: null,
    config: null,
  };

  private listeners: Set<(track: GpsTrack | null) => void> = new Set();
  private pendingPoints: GpsPoint[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Subscribe to adaptive sync config changes
    const manager = getAdaptiveSyncManager();
    manager.subscribe((config) => {
      this.state.config = config;
      this.updateWatchOptions();
    });
  }

  // Start tracking
  async startTracking(options: GpsTrackingOptions): Promise<GpsTrack> {
    if (this.state.active) {
      throw new Error('Tracking already active');
    }

    // Check if geolocation is available
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported');
    }

    // Request permission
    try {
      await this.requestPermission();
    } catch (error) {
      throw new Error('Geolocation permission denied');
    }

    // Create new track
    const track: GpsTrack = {
      id: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      entityType: options.entityType,
      entityId: options.entityId,
      points: [],
      startTime: Date.now(),
      status: 'recording',
    };

    this.state.track = track;
    this.state.active = true;

    // Start watching position
    this.startWatch(options);

    this.notifyListeners();
    return track;
  }

  // Stop tracking
  stopTracking(): GpsTrack | null {
    if (!this.state.active || !this.state.track) {
      return null;
    }

    // Stop watching
    if (this.state.watchId !== null) {
      navigator.geolocation.clearWatch(this.state.watchId);
      this.state.watchId = null;
    }

    // Finalize track
    const track = this.state.track;
    track.endTime = Date.now();
    track.status = 'completed';
    track.totalDistance = this.calculateTotalDistance(track.points);

    // Flush pending points
    this.flushPendingPoints();

    // Reset state
    this.state.active = false;
    this.state.track = null;
    this.state.lastPoint = null;

    this.notifyListeners();
    return track;
  }

  // Pause tracking
  pauseTracking(): void {
    if (!this.state.active || !this.state.track) return;

    if (this.state.watchId !== null) {
      navigator.geolocation.clearWatch(this.state.watchId);
      this.state.watchId = null;
    }

    this.state.track.status = 'paused';
    this.notifyListeners();
  }

  // Resume tracking
  resumeTracking(options?: Partial<GpsTrackingOptions>): void {
    if (!this.state.track || this.state.track.status !== 'paused') return;

    this.state.track.status = 'recording';
    this.startWatch({
      entityType: this.state.track.entityType,
      entityId: this.state.track.entityId,
      ...options,
    });

    this.notifyListeners();
  }

  // Get current track
  getCurrentTrack(): GpsTrack | null {
    return this.state.track;
  }

  // Check if tracking is active
  isTracking(): boolean {
    return this.state.active;
  }

  // Subscribe to track updates
  subscribe(callback: (track: GpsTrack | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.state.track);
    return () => this.listeners.delete(callback);
  }

  // Get single position (one-shot)
  async getCurrentPosition(): Promise<GpsPoint> {
    return new Promise((resolve, reject) => {
      const options = this.getPositionOptions();
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(this.positionToGpsPoint(position));
        },
        (error) => {
          reject(new Error(this.getErrorMessage(error)));
        },
        options
      );
    });
  }

  // Private methods

  private async requestPermission(): Promise<void> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(),
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            reject(error);
          } else {
            resolve(); // Other errors don't mean permission denied
          }
        },
        { timeout: 10000 }
      );
    });
  }

  private startWatch(options: GpsTrackingOptions): void {
    const positionOptions = this.getPositionOptions();

    this.state.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePosition(position, options),
      (error) => this.handleError(error),
      positionOptions
    );
  }

  private getPositionOptions(): PositionOptions {
    const config = this.state.config || getAdaptiveSyncManager().getConfig();
    
    // Adjust accuracy based on battery/network
    const highAccuracy = config.enableGpsTracking && config.gpsInterval < 30000;
    
    return {
      enableHighAccuracy: highAccuracy,
      timeout: Math.max(config.gpsInterval, 10000),
      maximumAge: config.gpsInterval / 2,
    };
  }

  private updateWatchOptions(): void {
    if (!this.state.active || this.state.watchId === null) return;

    // Restart watch with new options
    navigator.geolocation.clearWatch(this.state.watchId);
    
    if (this.state.track) {
      this.startWatch({
        entityType: this.state.track.entityType,
        entityId: this.state.track.entityId,
      });
    }
  }

  private handlePosition(position: GeolocationPosition, options: GpsTrackingOptions): void {
    const point = this.positionToGpsPoint(position);
    const config = this.state.config || getAdaptiveSyncManager().getConfig();

    // Check accuracy threshold
    if (options.minAccuracy && point.accuracy > options.minAccuracy) {
      console.warn(`[GPS] Skipping point with low accuracy: ${point.accuracy}m`);
      return;
    }

    // Check minimum distance from last point
    if (this.state.lastPoint && options.minDistance) {
      const distance = this.calculateDistance(this.state.lastPoint, point);
      if (distance < options.minDistance) {
        console.warn(`[GPS] Skipping point too close: ${distance.toFixed(1)}m`);
        return;
      }
    }

    // Check GPS interval throttling
    if (this.state.lastPoint) {
      const timeSinceLastPoint = point.timestamp - this.state.lastPoint.timestamp;
      if (timeSinceLastPoint < config.gpsInterval) {
        // Buffer point for later
        this.pendingPoints.push(point);
        this.scheduleBatchFlush();
        return;
      }
    }

    // Add point to track
    this.addPointToTrack(point);

    // Check max points
    if (options.maxPoints && this.state.track && this.state.track.points.length >= options.maxPoints) {
      console.warn('[GPS] Max points reached, stopping tracking');
      this.stopTracking();
    }
  }

  private addPointToTrack(point: GpsPoint): void {
    if (!this.state.track) return;

    this.state.track.points.push(point);
    this.state.lastPoint = point;
    this.notifyListeners();

    // Store locally for offline persistence
    this.persistTrack();
  }

  private handleError(error: GeolocationPositionError): void {
    console.error('[GPS] Error:', this.getErrorMessage(error));
    
    // Don't stop tracking on temporary errors
    if (error.code === error.TIMEOUT) {
      console.warn('[GPS] Timeout, will retry...');
    }
  }

  private getErrorMessage(error: GeolocationPositionError): string {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Location permission denied';
      case error.POSITION_UNAVAILABLE:
        return 'Location unavailable';
      case error.TIMEOUT:
        return 'Location request timed out';
      default:
        return 'Unknown location error';
    }
  }

  private positionToGpsPoint(position: GeolocationPosition): GpsPoint {
    const manager = getAdaptiveSyncManager();
    const batteryState = manager.getBatteryState();
    const networkState = manager.getNetworkState();

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude ?? undefined,
      altitudeAccuracy: position.coords.altitudeAccuracy ?? undefined,
      heading: position.coords.heading ?? undefined,
      speed: position.coords.speed ?? undefined,
      timestamp: position.timestamp,
      batteryLevel: batteryState.level,
      networkQuality: networkState.quality,
    };
  }

  private calculateDistance(p1: GpsPoint, p2: GpsPoint): number {
    // Haversine formula
    const R = 6371000; // Earth's radius in meters
    const lat1 = p1.latitude * Math.PI / 180;
    const lat2 = p2.latitude * Math.PI / 180;
    const deltaLat = (p2.latitude - p1.latitude) * Math.PI / 180;
    const deltaLon = (p2.longitude - p1.longitude) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private calculateTotalDistance(points: GpsPoint[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += this.calculateDistance(points[i - 1], points[i]);
    }
    return total;
  }

  private scheduleBatchFlush(): void {
    if (this.batchTimer) return;

    const config = this.state.config || getAdaptiveSyncManager().getConfig();
    
    this.batchTimer = setTimeout(() => {
      this.flushPendingPoints();
      this.batchTimer = null;
    }, config.gpsInterval);
  }

  private flushPendingPoints(): void {
    if (this.pendingPoints.length === 0) return;

    // Downsample if too many points
    const config = this.state.config || getAdaptiveSyncManager().getConfig();
    let points = this.pendingPoints;

    // On 2G or low battery, keep only every Nth point
    if (config.gpsInterval >= 30000 && points.length > 10) {
      const step = Math.ceil(points.length / 10);
      points = points.filter((_, i) => i % step === 0);
    }

    // Add to track
    points.forEach(point => this.addPointToTrack(point));
    this.pendingPoints = [];
  }

  private persistTrack(): void {
    if (!this.state.track) return;

    try {
      const key = `gps_track_${this.state.track.id}`;
      localStorage.setItem(key, JSON.stringify(this.state.track));
      
      // Also update list of active tracks
      const trackIds = JSON.parse(localStorage.getItem('gps_track_ids') || '[]');
      if (!trackIds.includes(this.state.track.id)) {
        trackIds.push(this.state.track.id);
        localStorage.setItem('gps_track_ids', JSON.stringify(trackIds));
      }
    } catch (error) {
      console.error('[GPS] Failed to persist track:', error);
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback(this.state.track));
  }

  // Simplify track for sync (reduce points while preserving shape)
  simplifyTrack(track: GpsTrack, tolerance: number = 5): GpsTrack {
    if (track.points.length < 3) return track;

    // Douglas-Peucker algorithm
    const simplified = this.douglasPeucker(track.points, tolerance);

    return {
      ...track,
      points: simplified,
    };
  }

  private douglasPeucker(points: GpsPoint[], tolerance: number): GpsPoint[] {
    if (points.length < 3) return points;

    // Find point with maximum distance from line between first and last
    let maxDistance = 0;
    let maxIndex = 0;

    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const distance = this.perpendicularDistance(points[i], first, last);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDistance > tolerance) {
      const left = this.douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
      const right = this.douglasPeucker(points.slice(maxIndex), tolerance);
      return [...left.slice(0, -1), ...right];
    }

    // Otherwise, return just the endpoints
    return [first, last];
  }

  private perpendicularDistance(point: GpsPoint, lineStart: GpsPoint, lineEnd: GpsPoint): number {
    // Convert to meters for distance calculation
    const x = point.longitude;
    const y = point.latitude;
    const x1 = lineStart.longitude;
    const y1 = lineStart.latitude;
    const x2 = lineEnd.longitude;
    const y2 = lineEnd.latitude;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;

    // Convert to approximate meters (rough estimate)
    const metersPerDegree = 111000;
    return Math.sqrt(dx * dx + dy * dy) * metersPerDegree;
  }
}

// Singleton instance
let gpsService: GpsThrottlingService | null = null;

export function getGpsThrottlingService(): GpsThrottlingService {
  if (!gpsService) {
    gpsService = new GpsThrottlingService();
  }
  return gpsService;
}

// React hook for GPS tracking
export function useGpsTracking() {
  const service = getGpsThrottlingService();

  return {
    startTracking: (options: GpsTrackingOptions) => service.startTracking(options),
    stopTracking: () => service.stopTracking(),
    pauseTracking: () => service.pauseTracking(),
    resumeTracking: (options?: Partial<GpsTrackingOptions>) => service.resumeTracking(options),
    getCurrentTrack: () => service.getCurrentTrack(),
    getCurrentPosition: () => service.getCurrentPosition(),
    isTracking: () => service.isTracking(),
    subscribe: (callback: (track: GpsTrack | null) => void) => service.subscribe(callback),
    simplifyTrack: (track: GpsTrack, tolerance?: number) => service.simplifyTrack(track, tolerance),
  };
}
