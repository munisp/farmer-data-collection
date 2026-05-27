/**
 * Offline Map Tile Cache Service for React Native
 * 
 * Features:
 * - Download and cache map tiles for offline use
 * - Region-based tile downloading (download all tiles for a farm area)
 * - LRU cache eviction when storage limit reached
 * - Tile expiration and refresh
 * - Progress tracking for downloads
 * - Network-aware downloading (WiFi-only option)
 * - Storage statistics and management
 */

import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Constants
const TILE_CACHE_DIR = `${FileSystem.documentDirectory}map_tiles/`;
const TILE_METADATA_KEY = 'offline_tile_metadata';
const CACHE_SETTINGS_KEY = 'offline_map_settings';
const MAX_CACHE_SIZE_MB = 500; // 500MB default max cache
const TILE_EXPIRY_DAYS = 30; // Tiles expire after 30 days
const MAX_CONCURRENT_DOWNLOADS = 4;

// Tile server URLs (OpenStreetMap compatible)
const TILE_SERVERS = {
  osm: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  terrain: 'https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.png',
};

// Types
export interface TileCoordinate {
  z: number; // zoom level
  x: number;
  y: number;
}

export interface CachedTile {
  key: string;
  z: number;
  x: number;
  y: number;
  server: keyof typeof TILE_SERVERS;
  filePath: string;
  size: number;
  downloadedAt: number;
  lastAccessedAt: number;
  expiresAt: number;
}

export interface TileRegion {
  id: string;
  name: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  minZoom: number;
  maxZoom: number;
  server: keyof typeof TILE_SERVERS;
  tileCount: number;
  downloadedCount: number;
  totalSize: number;
  createdAt: number;
  status: 'pending' | 'downloading' | 'complete' | 'paused' | 'error';
}

export interface CacheSettings {
  maxCacheSizeMB: number;
  tileExpiryDays: number;
  wifiOnlyDownload: boolean;
  autoRefreshExpired: boolean;
  preferredServer: keyof typeof TILE_SERVERS;
}

export interface DownloadProgress {
  regionId: string;
  totalTiles: number;
  downloadedTiles: number;
  failedTiles: number;
  bytesDownloaded: number;
  estimatedBytesTotal: number;
  status: 'downloading' | 'paused' | 'complete' | 'error';
  currentTile?: TileCoordinate;
}

export interface CacheStats {
  totalTiles: number;
  totalSizeMB: number;
  oldestTileAge: number;
  newestTileAge: number;
  expiredTiles: number;
  regionCount: number;
}

// Default settings
const DEFAULT_SETTINGS: CacheSettings = {
  maxCacheSizeMB: MAX_CACHE_SIZE_MB,
  tileExpiryDays: TILE_EXPIRY_DAYS,
  wifiOnlyDownload: true,
  autoRefreshExpired: false,
  preferredServer: 'osm',
};

class OfflineTileCacheService {
  private settings: CacheSettings = DEFAULT_SETTINGS;
  private tileMetadata: Map<string, CachedTile> = new Map();
  private regions: Map<string, TileRegion> = new Map();
  private downloadQueue: TileCoordinate[] = [];
  private isDownloading: boolean = false;
  private downloadCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();
  private currentRegionId: string | null = null;

  /**
   * Initialize the cache service
   */
  async init(): Promise<void> {
    await this.ensureCacheDirectory();
    await this.loadSettings();
    await this.loadMetadata();
    console.log('[TileCache] Initialized');
  }

  /**
   * Ensure cache directory exists
   */
  private async ensureCacheDirectory(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(TILE_CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(TILE_CACHE_DIR, { intermediates: true });
    }
  }

  /**
   * Load settings from storage
   */
  private async loadSettings(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(CACHE_SETTINGS_KEY);
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('[TileCache] Failed to load settings:', error);
    }
  }

  /**
   * Save settings to storage
   */
  async saveSettings(settings: Partial<CacheSettings>): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    await AsyncStorage.setItem(CACHE_SETTINGS_KEY, JSON.stringify(this.settings));
  }

  /**
   * Get current settings
   */
  getSettings(): CacheSettings {
    return { ...this.settings };
  }

  /**
   * Load tile metadata from storage
   */
  private async loadMetadata(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(TILE_METADATA_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.tileMetadata = new Map(data.tiles || []);
        this.regions = new Map(data.regions || []);
      }
    } catch (error) {
      console.error('[TileCache] Failed to load metadata:', error);
    }
  }

  /**
   * Save tile metadata to storage
   */
  private async saveMetadata(): Promise<void> {
    try {
      const data = {
        tiles: Array.from(this.tileMetadata.entries()),
        regions: Array.from(this.regions.entries()),
      };
      await AsyncStorage.setItem(TILE_METADATA_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[TileCache] Failed to save metadata:', error);
    }
  }

  /**
   * Get tile key for storage
   */
  private getTileKey(z: number, x: number, y: number, server: keyof typeof TILE_SERVERS): string {
    return `${server}_${z}_${x}_${y}`;
  }

  /**
   * Get tile file path
   */
  private getTileFilePath(z: number, x: number, y: number, server: keyof typeof TILE_SERVERS): string {
    return `${TILE_CACHE_DIR}${server}/${z}/${x}/${y}.png`;
  }

  /**
   * Get tile URL from server
   */
  private getTileUrl(z: number, x: number, y: number, server: keyof typeof TILE_SERVERS): string {
    return TILE_SERVERS[server]
      .replace('{z}', z.toString())
      .replace('{x}', x.toString())
      .replace('{y}', y.toString());
  }

  /**
   * Check if a tile is cached and valid
   */
  async isTileCached(z: number, x: number, y: number, server: keyof typeof TILE_SERVERS = 'osm'): Promise<boolean> {
    const key = this.getTileKey(z, x, y, server);
    const metadata = this.tileMetadata.get(key);
    
    if (!metadata) return false;
    
    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(metadata.filePath);
    if (!fileInfo.exists) {
      this.tileMetadata.delete(key);
      return false;
    }
    
    // Check if expired
    if (Date.now() > metadata.expiresAt) {
      return false; // Expired but still usable as fallback
    }
    
    return true;
  }

  /**
   * Get cached tile path (returns null if not cached)
   */
  async getCachedTilePath(z: number, x: number, y: number, server: keyof typeof TILE_SERVERS = 'osm'): Promise<string | null> {
    const key = this.getTileKey(z, x, y, server);
    const metadata = this.tileMetadata.get(key);
    
    if (!metadata) return null;
    
    const fileInfo = await FileSystem.getInfoAsync(metadata.filePath);
    if (!fileInfo.exists) {
      this.tileMetadata.delete(key);
      return null;
    }
    
    // Update last accessed time
    metadata.lastAccessedAt = Date.now();
    this.tileMetadata.set(key, metadata);
    
    return metadata.filePath;
  }

  /**
   * Download a single tile
   */
  async downloadTile(z: number, x: number, y: number, server: keyof typeof TILE_SERVERS = 'osm'): Promise<boolean> {
    const key = this.getTileKey(z, x, y, server);
    const filePath = this.getTileFilePath(z, x, y, server);
    const url = this.getTileUrl(z, x, y, server);
    
    try {
      // Ensure directory exists
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
      
      // Download tile
      const downloadResult = await FileSystem.downloadAsync(url, filePath);
      
      if (downloadResult.status !== 200) {
        console.warn(`[TileCache] Failed to download tile ${key}: HTTP ${downloadResult.status}`);
        return false;
      }
      
      // Get file size
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      const size = (fileInfo as any).size || 0;
      
      // Save metadata
      const metadata: CachedTile = {
        key,
        z,
        x,
        y,
        server,
        filePath,
        size,
        downloadedAt: Date.now(),
        lastAccessedAt: Date.now(),
        expiresAt: Date.now() + this.settings.tileExpiryDays * 24 * 60 * 60 * 1000,
      };
      
      this.tileMetadata.set(key, metadata);
      return true;
    } catch (error) {
      console.error(`[TileCache] Error downloading tile ${key}:`, error);
      return false;
    }
  }

  /**
   * Calculate tiles needed for a bounding box at given zoom levels
   */
  calculateTilesForRegion(
    bounds: { north: number; south: number; east: number; west: number },
    minZoom: number,
    maxZoom: number
  ): TileCoordinate[] {
    const tiles: TileCoordinate[] = [];
    
    for (let z = minZoom; z <= maxZoom; z++) {
      const minTile = this.latLngToTile(bounds.north, bounds.west, z);
      const maxTile = this.latLngToTile(bounds.south, bounds.east, z);
      
      for (let x = minTile.x; x <= maxTile.x; x++) {
        for (let y = minTile.y; y <= maxTile.y; y++) {
          tiles.push({ z, x, y });
        }
      }
    }
    
    return tiles;
  }

  /**
   * Convert lat/lng to tile coordinates
   */
  private latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lng + 180) / 360 * n);
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
  }

  /**
   * Create a new offline region for download
   */
  async createRegion(
    name: string,
    bounds: { north: number; south: number; east: number; west: number },
    minZoom: number = 10,
    maxZoom: number = 16,
    server: keyof typeof TILE_SERVERS = 'osm'
  ): Promise<TileRegion> {
    const tiles = this.calculateTilesForRegion(bounds, minZoom, maxZoom);
    
    const region: TileRegion = {
      id: `region_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      bounds,
      minZoom,
      maxZoom,
      server,
      tileCount: tiles.length,
      downloadedCount: 0,
      totalSize: 0,
      createdAt: Date.now(),
      status: 'pending',
    };
    
    this.regions.set(region.id, region);
    await this.saveMetadata();
    
    console.log(`[TileCache] Created region "${name}" with ${tiles.length} tiles`);
    return region;
  }

  /**
   * Download all tiles for a region
   */
  async downloadRegion(
    regionId: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<boolean> {
    const region = this.regions.get(regionId);
    if (!region) {
      console.error(`[TileCache] Region ${regionId} not found`);
      return false;
    }
    
    // Check network conditions
    if (this.settings.wifiOnlyDownload) {
      const networkState = await Network.getNetworkStateAsync();
      if (networkState.type !== Network.NetworkStateType.WIFI) {
        console.warn('[TileCache] WiFi-only download enabled, but not on WiFi');
        return false;
      }
    }
    
    // Set up progress callback
    if (onProgress) {
      this.downloadCallbacks.set(regionId, onProgress);
    }
    
    this.currentRegionId = regionId;
    region.status = 'downloading';
    this.regions.set(regionId, region);
    
    const tiles = this.calculateTilesForRegion(region.bounds, region.minZoom, region.maxZoom);
    let downloadedCount = 0;
    let failedCount = 0;
    let bytesDownloaded = 0;
    
    // Download tiles with concurrency limit
    const downloadBatch = async (batch: TileCoordinate[]): Promise<void> => {
      await Promise.all(
        batch.map(async (tile) => {
          // Check if already cached
          const isCached = await this.isTileCached(tile.z, tile.x, tile.y, region.server);
          if (isCached) {
            downloadedCount++;
            return;
          }
          
          const success = await this.downloadTile(tile.z, tile.x, tile.y, region.server);
          if (success) {
            downloadedCount++;
            const key = this.getTileKey(tile.z, tile.x, tile.y, region.server);
            const metadata = this.tileMetadata.get(key);
            if (metadata) {
              bytesDownloaded += metadata.size;
            }
          } else {
            failedCount++;
          }
          
          // Report progress
          const progress: DownloadProgress = {
            regionId,
            totalTiles: tiles.length,
            downloadedTiles: downloadedCount,
            failedTiles: failedCount,
            bytesDownloaded,
            estimatedBytesTotal: (bytesDownloaded / downloadedCount) * tiles.length || 0,
            status: 'downloading',
            currentTile: tile,
          };
          
          const callback = this.downloadCallbacks.get(regionId);
          if (callback) {
            callback(progress);
          }
        })
      );
    };
    
    // Process tiles in batches
    for (let i = 0; i < tiles.length; i += MAX_CONCURRENT_DOWNLOADS) {
      // Check if download was paused
      const currentRegion = this.regions.get(regionId);
      if (currentRegion?.status === 'paused') {
        console.log(`[TileCache] Download paused for region ${regionId}`);
        return false;
      }
      
      const batch = tiles.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
      await downloadBatch(batch);
      
      // Enforce cache size limit
      await this.enforceCacheLimit();
    }
    
    // Update region status
    region.downloadedCount = downloadedCount;
    region.totalSize = bytesDownloaded;
    region.status = failedCount === 0 ? 'complete' : 'error';
    this.regions.set(regionId, region);
    await this.saveMetadata();
    
    // Final progress callback
    const callback = this.downloadCallbacks.get(regionId);
    if (callback) {
      callback({
        regionId,
        totalTiles: tiles.length,
        downloadedTiles: downloadedCount,
        failedTiles: failedCount,
        bytesDownloaded,
        estimatedBytesTotal: bytesDownloaded,
        status: region.status === 'complete' ? 'complete' : 'error',
      });
    }
    
    this.downloadCallbacks.delete(regionId);
    this.currentRegionId = null;
    
    console.log(`[TileCache] Region "${region.name}" download complete: ${downloadedCount}/${tiles.length} tiles`);
    return region.status === 'complete';
  }

  /**
   * Pause region download
   */
  pauseDownload(regionId: string): void {
    const region = this.regions.get(regionId);
    if (region && region.status === 'downloading') {
      region.status = 'paused';
      this.regions.set(regionId, region);
    }
  }

  /**
   * Resume region download
   */
  async resumeDownload(regionId: string, onProgress?: (progress: DownloadProgress) => void): Promise<boolean> {
    const region = this.regions.get(regionId);
    if (!region || region.status !== 'paused') {
      return false;
    }
    return this.downloadRegion(regionId, onProgress);
  }

  /**
   * Delete a region and its tiles
   */
  async deleteRegion(regionId: string): Promise<void> {
    const region = this.regions.get(regionId);
    if (!region) return;
    
    // Delete tiles for this region
    const tiles = this.calculateTilesForRegion(region.bounds, region.minZoom, region.maxZoom);
    for (const tile of tiles) {
      const key = this.getTileKey(tile.z, tile.x, tile.y, region.server);
      const metadata = this.tileMetadata.get(key);
      if (metadata) {
        try {
          await FileSystem.deleteAsync(metadata.filePath, { idempotent: true });
        } catch (error) {
          // Ignore deletion errors
        }
        this.tileMetadata.delete(key);
      }
    }
    
    this.regions.delete(regionId);
    await this.saveMetadata();
    
    console.log(`[TileCache] Deleted region "${region.name}"`);
  }

  /**
   * Get all regions
   */
  getRegions(): TileRegion[] {
    return Array.from(this.regions.values());
  }

  /**
   * Get region by ID
   */
  getRegion(regionId: string): TileRegion | undefined {
    return this.regions.get(regionId);
  }

  /**
   * Enforce cache size limit using LRU eviction
   */
  private async enforceCacheLimit(): Promise<void> {
    const stats = await this.getCacheStats();
    
    if (stats.totalSizeMB <= this.settings.maxCacheSizeMB) {
      return;
    }
    
    // Sort tiles by last accessed time (oldest first)
    const tiles = Array.from(this.tileMetadata.values())
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
    
    let currentSize = stats.totalSizeMB * 1024 * 1024;
    const targetSize = this.settings.maxCacheSizeMB * 0.8 * 1024 * 1024; // Target 80% of max
    
    for (const tile of tiles) {
      if (currentSize <= targetSize) break;
      
      try {
        await FileSystem.deleteAsync(tile.filePath, { idempotent: true });
        this.tileMetadata.delete(tile.key);
        currentSize -= tile.size;
      } catch (error) {
        // Ignore deletion errors
      }
    }
    
    await this.saveMetadata();
    console.log(`[TileCache] Evicted tiles to enforce cache limit`);
  }

  /**
   * Clear expired tiles
   */
  async clearExpiredTiles(): Promise<number> {
    const now = Date.now();
    let cleared = 0;
    
    for (const [key, tile] of this.tileMetadata.entries()) {
      if (now > tile.expiresAt) {
        try {
          await FileSystem.deleteAsync(tile.filePath, { idempotent: true });
          this.tileMetadata.delete(key);
          cleared++;
        } catch (error) {
          // Ignore deletion errors
        }
      }
    }
    
    if (cleared > 0) {
      await this.saveMetadata();
      console.log(`[TileCache] Cleared ${cleared} expired tiles`);
    }
    
    return cleared;
  }

  /**
   * Clear all cached tiles
   */
  async clearAllTiles(): Promise<void> {
    try {
      await FileSystem.deleteAsync(TILE_CACHE_DIR, { idempotent: true });
      await this.ensureCacheDirectory();
      this.tileMetadata.clear();
      this.regions.clear();
      await this.saveMetadata();
      console.log('[TileCache] Cleared all tiles');
    } catch (error) {
      console.error('[TileCache] Error clearing tiles:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<CacheStats> {
    const tiles = Array.from(this.tileMetadata.values());
    const now = Date.now();
    
    let totalSize = 0;
    let oldestAge = 0;
    let newestAge = Infinity;
    let expiredCount = 0;
    
    for (const tile of tiles) {
      totalSize += tile.size;
      const age = now - tile.downloadedAt;
      if (age > oldestAge) oldestAge = age;
      if (age < newestAge) newestAge = age;
      if (now > tile.expiresAt) expiredCount++;
    }
    
    return {
      totalTiles: tiles.length,
      totalSizeMB: totalSize / (1024 * 1024),
      oldestTileAge: oldestAge,
      newestTileAge: tiles.length > 0 ? newestAge : 0,
      expiredTiles: expiredCount,
      regionCount: this.regions.size,
    };
  }

  /**
   * Download tiles around a specific location (for current farm view)
   */
  async downloadAroundLocation(
    latitude: number,
    longitude: number,
    radiusKm: number = 5,
    minZoom: number = 12,
    maxZoom: number = 17,
    server: keyof typeof TILE_SERVERS = 'osm'
  ): Promise<TileRegion> {
    // Calculate bounding box from center point and radius
    const latDelta = radiusKm / 111; // ~111km per degree latitude
    const lngDelta = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));
    
    const bounds = {
      north: latitude + latDelta,
      south: latitude - latDelta,
      east: longitude + lngDelta,
      west: longitude - lngDelta,
    };
    
    const region = await this.createRegion(
      `Area around ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      bounds,
      minZoom,
      maxZoom,
      server
    );
    
    return region;
  }
}

// Singleton instance
export const offlineTileCache = new OfflineTileCacheService();

export default offlineTileCache;
