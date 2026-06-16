import { resilientFetch, resilientPost, resilientGet } from './resilient-http.js';

const TILE_CACHE_URL = process.env.TILE_CACHE_URL || 'http://localhost:8097';
const SERVICE_NAME = 'tile-cache';

export interface PrefetchRequest {
  provider: 'osm' | 'satellite' | 'terrain';
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
  min_zoom: number;
  max_zoom: number;
}

export interface PrefetchResponse {
  tiles_queued: number;
  tiles_cached: number;
  tiles_fetched: number;
  tiles_errored: number;
  estimated_size_mb: number;
  duration: string;
}

export interface TileCacheStats {
  hits: number;
  misses: number;
  fetches: number;
  errors: number;
  disk_use_mb: number;
  tile_count: number;
  started_at: string;
}

export function getTileUrl(provider: string, z: number, x: number, y: number): string {
  return `${TILE_CACHE_URL}/tiles/${provider}/${z}/${x}/${y}.png`;
}

export async function prefetchTiles(req: PrefetchRequest): Promise<PrefetchResponse> {
  return await resilientPost<PrefetchResponse>(SERVICE_NAME, `${TILE_CACHE_URL}/tiles/prefetch`, req);
}

export async function getTileCacheStats(): Promise<TileCacheStats> {
  return await resilientGet<TileCacheStats>(SERVICE_NAME, `${TILE_CACHE_URL}/tiles/stats`);
}

export async function evictOldTiles(maxAgeHours: number = 720): Promise<{ evicted: number }> {
  const resp = await resilientFetch(
    SERVICE_NAME,
    `${TILE_CACHE_URL}/tiles/evict?max_age_hours=${maxAgeHours}`,
    { method: 'DELETE' },
  );
  return await resp.json() as { evicted: number };
}
