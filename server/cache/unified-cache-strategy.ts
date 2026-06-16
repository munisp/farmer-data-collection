import { logger } from "../logger.js";

export interface CacheConfig {
  ttlSeconds: number;
  staleWhileRevalidate?: number;
  tags?: string[];
  tenant?: string;
}

export interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttl: number;
  staleAfter: number;
  tags: string[];
  hits: number;
}

const cache = new Map<string, CacheEntry<any>>();
const tagIndex = new Map<string, Set<string>>();

let cacheHits = 0;
let cacheMisses = 0;
let cacheEvictions = 0;

export function buildCacheKey(prefix: string, params: Record<string, any>, tenant?: string): string {
  const sorted = Object.entries(params).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b));
  const paramStr = sorted.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("&");
  return tenant ? `t:${tenant}:${prefix}:${paramStr}` : `${prefix}:${paramStr}`;
}

export async function cacheAside<T>(key: string, fetcher: () => Promise<T>, config: CacheConfig): Promise<T> {
  const existing = cache.get(key);
  const now = Date.now();

  if (existing) {
    const age = (now - existing.cachedAt) / 1000;
    if (age < existing.ttl) {
      existing.hits++;
      cacheHits++;
      return existing.data;
    }
    if (config.staleWhileRevalidate && age < existing.staleAfter) {
      existing.hits++;
      cacheHits++;
      refreshInBackground(key, fetcher, config);
      return existing.data;
    }
  }

  cacheMisses++;
  const data = await fetcher();
  setCacheEntry(key, data, config);
  return data;
}

function setCacheEntry<T>(key: string, data: T, config: CacheConfig): void {
  const entry: CacheEntry<T> = {
    data, cachedAt: Date.now(), ttl: config.ttlSeconds,
    staleAfter: config.ttlSeconds + (config.staleWhileRevalidate || 0),
    tags: config.tags || [], hits: 0,
  };
  cache.set(key, entry);
  for (const tag of entry.tags) {
    if (!tagIndex.has(tag)) tagIndex.set(tag, new Set());
    tagIndex.get(tag)!.add(key);
  }
}

async function refreshInBackground<T>(key: string, fetcher: () => Promise<T>, config: CacheConfig): Promise<void> {
  try {
    const data = await fetcher();
    setCacheEntry(key, data, config);
  } catch (err) {
    logger.warn("[Cache] Background refresh failed", { key, error: err instanceof Error ? err.message : String(err) });
  }
}

export function invalidateByTag(tag: string): number {
  const keys = tagIndex.get(tag);
  if (!keys) return 0;
  let count = 0;
  for (const key of keys) {
    cache.delete(key);
    count++;
    cacheEvictions++;
  }
  tagIndex.delete(tag);
  return count;
}

export function invalidateByPrefix(prefix: string): number {
  let count = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) { cache.delete(key); count++; cacheEvictions++; }
  }
  return count;
}

export function invalidateByTenant(tenant: string): number {
  return invalidateByPrefix(`t:${tenant}:`);
}

export function getCacheStats() {
  const entries = Array.from(cache.values());
  const totalSize = entries.length;
  const hotKeys = entries.sort((a, b) => b.hits - a.hits).slice(0, 10).map((e, i) => ({ rank: i + 1, hits: e.hits }));
  return {
    totalEntries: totalSize, cacheHits, cacheMisses, hitRate: cacheHits + cacheMisses > 0 ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100) : 0,
    evictions: cacheEvictions, tags: tagIndex.size, hotKeys,
  };
}

export function clearAll(): void {
  cache.clear();
  tagIndex.clear();
}

export const CACHE_PRESETS = {
  REALTIME: { ttlSeconds: 5, staleWhileRevalidate: 10 },
  SHORT: { ttlSeconds: 30, staleWhileRevalidate: 60 },
  MEDIUM: { ttlSeconds: 300, staleWhileRevalidate: 600 },
  LONG: { ttlSeconds: 3600, staleWhileRevalidate: 7200 },
  STATIC: { ttlSeconds: 86400 },
} as const;
