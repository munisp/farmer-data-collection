/**
 * Offline Tile Cache Manager
 *
 * Pre-cache basemap tiles for offline use in rural areas with poor connectivity.
 * Inspired by GeoLibre's "Download Offline Area" tool.
 * Uses Cache API for persistent tile storage.
 */

const TILE_CACHE_NAME = "farmconnect-tile-cache-v1";
const METADATA_CACHE_NAME = "farmconnect-tile-meta-v1";
const OSM_SUBDOMAINS = ["a", "b", "c"];
let tileUrlTemplate = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Configure the tile server URL template. Use `{s}` for subdomain rotation,
 * `{z}`, `{x}`, `{y}` for tile coordinates.
 */
export function setTileUrlTemplate(template: string): void {
  tileUrlTemplate = template;
}

function getTileUrl(z: number, x: number, y: number): string {
  const subdomain = OSM_SUBDOMAINS[(x + y) % OSM_SUBDOMAINS.length];
  return tileUrlTemplate
    .replace("{s}", subdomain)
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

export interface CachedArea {
  id: string;
  name: string;
  bounds: { north: number; south: number; east: number; west: number };
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  downloadedCount: number;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
  status: "downloading" | "complete" | "partial" | "expired";
}

export interface DownloadProgress {
  areaId: string;
  totalTiles: number;
  downloadedTiles: number;
  failedTiles: number;
  bytesDownloaded: number;
  percent: number;
  estimatedTimeRemainingMs: number;
}

type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Calculate tile coordinates for a bounding box at a given zoom level.
 */
function getTilesInBounds(
  bounds: { north: number; south: number; east: number; west: number },
  zoom: number
): Array<{ x: number; y: number; z: number }> {
  const tiles: Array<{ x: number; y: number; z: number }> = [];
  const n = 2 ** zoom;

  const xMin = Math.floor(((bounds.west + 180) / 360) * n);
  const xMax = Math.floor(((bounds.east + 180) / 360) * n);
  const yMin = Math.floor(
    ((1 - Math.log(Math.tan((bounds.north * Math.PI) / 180) + 1 / Math.cos((bounds.north * Math.PI) / 180)) / Math.PI) / 2) * n
  );
  const yMax = Math.floor(
    ((1 - Math.log(Math.tan((bounds.south * Math.PI) / 180) + 1 / Math.cos((bounds.south * Math.PI) / 180)) / Math.PI) / 2) * n
  );

  for (let x = Math.max(0, xMin); x <= Math.min(n - 1, xMax); x++) {
    for (let y = Math.max(0, yMin); y <= Math.min(n - 1, yMax); y++) {
      tiles.push({ x, y, z: zoom });
    }
  }

  return tiles;
}

/**
 * Estimate total tile count for a download area.
 */
export function estimateTileCount(
  bounds: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number
): { totalTiles: number; estimatedSizeMB: number } {
  let totalTiles = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    totalTiles += getTilesInBounds(bounds, z).length;
  }
  // Average OSM tile is ~15KB
  const estimatedSizeMB = Math.round((totalTiles * 15) / 1024 * 10) / 10;
  return { totalTiles, estimatedSizeMB };
}

/**
 * Download and cache tiles for an offline area.
 */
export async function downloadOfflineArea(
  name: string,
  bounds: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number,
  onProgress?: ProgressCallback
): Promise<CachedArea> {
  const cache = await caches.open(TILE_CACHE_NAME);
  const areaId = `area-${Date.now()}`;

  // Calculate all tiles needed
  const allTiles: Array<{ x: number; y: number; z: number }> = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    allTiles.push(...getTilesInBounds(bounds, z));
  }

  const area: CachedArea = {
    id: areaId,
    name,
    bounds,
    minZoom,
    maxZoom,
    tileCount: allTiles.length,
    downloadedCount: 0,
    sizeBytes: 0,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    status: "downloading",
  };

  let downloadedTiles = 0;
  let failedTiles = 0;
  let bytesDownloaded = 0;
  const startTime = Date.now();
  const BATCH_SIZE = 6; // parallel downloads

  for (let i = 0; i < allTiles.length; i += BATCH_SIZE) {
    const batch = allTiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (tile) => {
        const url = getTileUrl(tile.z, tile.x, tile.y);
        try {
          const response = await fetch(url);
          if (response.ok) {
            const blob = await response.blob();
            bytesDownloaded += blob.size;
            await cache.put(url, new Response(blob, {
              headers: {
                "Content-Type": "image/png",
                "X-Area-Id": areaId,
                "X-Cached-At": new Date().toISOString(),
              },
            }));
            downloadedTiles++;
          } else {
            failedTiles++;
          }
        } catch {
          failedTiles++;
        }
      })
    );

    if (onProgress) {
      const elapsed = Date.now() - startTime;
      const rate = downloadedTiles / (elapsed / 1000);
      const remaining = allTiles.length - downloadedTiles - failedTiles;
      onProgress({
        areaId,
        totalTiles: allTiles.length,
        downloadedTiles,
        failedTiles,
        bytesDownloaded,
        percent: Math.round(((downloadedTiles + failedTiles) / allTiles.length) * 100),
        estimatedTimeRemainingMs: rate > 0 ? (remaining / rate) * 1000 : 0,
      });
    }
  }

  area.downloadedCount = downloadedTiles;
  area.sizeBytes = bytesDownloaded;
  area.status = failedTiles === 0 ? "complete" : "partial";

  // Save metadata
  await saveAreaMetadata(area);

  return area;
}

/**
 * Save area metadata to the metadata cache.
 */
async function saveAreaMetadata(area: CachedArea): Promise<void> {
  const metaCache = await caches.open(METADATA_CACHE_NAME);
  const existing = await loadAllAreas();
  const updated = existing.filter(a => a.id !== area.id);
  updated.push(area);
  await metaCache.put(
    "areas-metadata",
    new Response(JSON.stringify(updated), { headers: { "Content-Type": "application/json" } })
  );
}

/**
 * Load all cached area metadata.
 */
export async function loadAllAreas(): Promise<CachedArea[]> {
  try {
    const metaCache = await caches.open(METADATA_CACHE_NAME);
    const response = await metaCache.match("areas-metadata");
    if (!response) return [];
    return await response.json();
  } catch {
    return [];
  }
}

/**
 * Delete a cached offline area and its tiles.
 */
export async function deleteOfflineArea(areaId: string): Promise<void> {
  const areas = await loadAllAreas();
  const area = areas.find(a => a.id === areaId);
  if (!area) return;

  const cache = await caches.open(TILE_CACHE_NAME);
  const keys = await cache.keys();

  // Delete tiles belonging to this area
  await Promise.all(
    keys.map(async (request) => {
      const response = await cache.match(request);
      if (response?.headers.get("X-Area-Id") === areaId) {
        await cache.delete(request);
      }
    })
  );

  // Update metadata
  const metaCache = await caches.open(METADATA_CACHE_NAME);
  const remaining = areas.filter(a => a.id !== areaId);
  await metaCache.put(
    "areas-metadata",
    new Response(JSON.stringify(remaining), { headers: { "Content-Type": "application/json" } })
  );
}

/**
 * Get total cache size across all offline areas.
 */
export async function getCacheStats(): Promise<{
  totalAreas: number;
  totalTiles: number;
  totalSizeMB: number;
  oldestArea: string | null;
  newestArea: string | null;
}> {
  const areas = await loadAllAreas();
  const totalSizeBytes = areas.reduce((sum, a) => sum + a.sizeBytes, 0);
  const sorted = [...areas].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return {
    totalAreas: areas.length,
    totalTiles: areas.reduce((sum, a) => sum + a.downloadedCount, 0),
    totalSizeMB: Math.round((totalSizeBytes / (1024 * 1024)) * 10) / 10,
    oldestArea: sorted[0]?.name ?? null,
    newestArea: sorted[sorted.length - 1]?.name ?? null,
  };
}

/**
 * Pre-defined offline areas for common Nigerian agricultural regions.
 */
export const NIGERIAN_FARM_REGIONS = [
  { name: "Kano (Groundnuts Belt)", bounds: { north: 12.2, south: 11.8, east: 8.7, west: 8.3 }, defaultZoom: { min: 8, max: 14 } },
  { name: "Benue (Food Basket)", bounds: { north: 7.9, south: 7.3, east: 9.0, west: 8.2 }, defaultZoom: { min: 8, max: 14 } },
  { name: "Ogun (Cocoa Belt)", bounds: { north: 7.3, south: 6.8, east: 3.6, west: 3.0 }, defaultZoom: { min: 8, max: 14 } },
  { name: "Niger (Rice Belt)", bounds: { north: 10.0, south: 9.0, east: 6.5, west: 5.5 }, defaultZoom: { min: 8, max: 14 } },
  { name: "Kaduna (Maize Corridor)", bounds: { north: 10.8, south: 10.2, east: 7.6, west: 7.0 }, defaultZoom: { min: 8, max: 14 } },
  { name: "Lagos (Urban Markets)", bounds: { north: 6.7, south: 6.3, east: 3.6, west: 3.1 }, defaultZoom: { min: 10, max: 16 } },
];
