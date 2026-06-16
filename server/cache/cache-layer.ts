/**
 * Multi-Tier Cache Layer
 * 
 * L1: LRU in-memory cache (sub-millisecond, per-process)
 * L2: Redis (shared across processes, persistent)
 * 
 * Features:
 * - Automatic promotion from L2 → L1 on access
 * - TTL-based expiration at both tiers
 * - Prometheus metrics (hits, misses, latency)
 * - Pattern-based invalidation
 * - ETag generation for HTTP caching
 * - Graceful degradation (Redis down → L1 only)
 */

import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { getRedisClient } from '../redis.js';
import { cacheHits, cacheMisses, cacheOperationDuration } from '../metrics.js';
import { logger } from '../logger.js';

// TTL presets (seconds) for different data types
export const CacheTTL = {
  // Hot path — short TTL (frequently changing data)
  DASHBOARD_STATS: 60,
  RECENT_ACTIVITIES: 30,
  PRICE_DATA: 30,
  DELIVERY_STATUS: 15,
  IOT_SENSOR_DATA: 10,

  // Warm path — medium TTL
  FARMER_LIST: 180,
  FARM_LIST: 180,
  CROP_LIST: 180,
  MARKETPLACE_LISTINGS: 120,
  HARVEST_STATS: 120,
  EXPENSE_STATS: 120,
  LOAN_DATA: 120,
  CHAMA_DATA: 120,
  COOPERATIVE_DATA: 120,
  SUBSCRIPTION_DATA: 120,

  // Cold path — long TTL (rarely changing data)
  ML_PREDICTION: 600,
  WEATHER_DATA: 300,
  SATELLITE_DATA: 600,
  SPATIAL_ANALYSIS: 600,
  CREDIT_SCORE: 300,
  USER_PROFILE: 300,
  REPORTS: 300,
  KYC_STATUS: 600,
  EQUIPMENT_LIST: 300,
  SOIL_ANALYSIS: 600,

  // Static — very long TTL
  CONFIG: 3600,
  REFERENCE_DATA: 3600,
  EXCHANGE_RATES: 1800,
} as const;

// Route → TTL mapping for automatic cache middleware
export const ROUTE_TTL_MAP: Record<string, number> = {
  // Dashboard & Analytics
  'dashboard.getStats': CacheTTL.DASHBOARD_STATS,
  'dashboard.getRecentActivities': CacheTTL.RECENT_ACTIVITIES,
  'dashboard.getFarms': CacheTTL.FARM_LIST,
  'adminDashboard.getStats': CacheTTL.DASHBOARD_STATS,
  'adminDashboard.getSystemHealth': CacheTTL.DASHBOARD_STATS,
  'adminDashboard.getUserAnalytics': CacheTTL.DASHBOARD_STATS,
  'adminDashboard.getDashboardOverview': CacheTTL.DASHBOARD_STATS,
  'analytics.getDashboardStats': CacheTTL.DASHBOARD_STATS,
  'analytics.getRetentionMetrics': CacheTTL.REPORTS,

  // Core CRUD (reads)
  'coreFarms.getAll': CacheTTL.FARM_LIST,
  'coreFarms.getById': CacheTTL.FARM_LIST,
  'coreFarms.getWithAnalytics': CacheTTL.FARM_LIST,
  'coreCrops.getAll': CacheTTL.CROP_LIST,
  'coreCrops.getById': CacheTTL.CROP_LIST,
  'coreCrops.getWithAnalytics': CacheTTL.CROP_LIST,
  'coreLivestock.getAll': CacheTTL.FARMER_LIST,
  'coreLivestock.getById': CacheTTL.FARMER_LIST,
  'coreHarvests.getAll': CacheTTL.HARVEST_STATS,
  'coreHarvests.getById': CacheTTL.HARVEST_STATS,
  'coreHarvests.getAnalytics': CacheTTL.HARVEST_STATS,
  'coreExpenses.getAll': CacheTTL.EXPENSE_STATS,
  'coreExpenses.getById': CacheTTL.EXPENSE_STATS,
  'coreExpenses.getAnalytics': CacheTTL.EXPENSE_STATS,
  'coreFarmInputs.getAll': CacheTTL.FARM_LIST,
  'coreEquipment.getAll': CacheTTL.EQUIPMENT_LIST,

  // Farmer features
  'farmerFeatures.getDashboard': CacheTTL.DASHBOARD_STATS,
  'farmerFeatures.getFarmers': CacheTTL.FARMER_LIST,
  'farmerFeatures.getFarmerById': CacheTTL.FARMER_LIST,

  // Marketplace
  'marketplace.getListings': CacheTTL.MARKETPLACE_LISTINGS,
  'marketplace.getListingById': CacheTTL.MARKETPLACE_LISTINGS,
  'marketplaceEnhancements.getOffers': CacheTTL.MARKETPLACE_LISTINGS,
  'marketplaceEnhancements.getBulkDiscounts': CacheTTL.MARKETPLACE_LISTINGS,
  'marketplaceEnhancements.getSeasonalPriceRecommendation': CacheTTL.PRICE_DATA,

  // Financial
  'microfinance.getLoans': CacheTTL.LOAN_DATA,
  'microfinance.getLoanById': CacheTTL.LOAN_DATA,
  'creditScoring.getScore': CacheTTL.CREDIT_SCORE,
  'creditScoring.getCreditReport': CacheTTL.CREDIT_SCORE,
  'chama.getGroups': CacheTTL.CHAMA_DATA,
  'chama.getGroupDetails': CacheTTL.CHAMA_DATA,
  'escrow.getAccount': CacheTTL.LOAN_DATA,
  'mobileMoney.getBalance': CacheTTL.PRICE_DATA,
  'financialEnhancements.getSavingsGoals': CacheTTL.LOAN_DATA,
  'financialReports.getOverview': CacheTTL.REPORTS,

  // Supply Chain
  'delivery.getActiveDeliveries': CacheTTL.DELIVERY_STATUS,
  'delivery.getDeliveryById': CacheTTL.DELIVERY_STATUS,
  'coldChain.getSensorReadings': CacheTTL.IOT_SENSOR_DATA,
  'coldChain.getAlerts': CacheTTL.IOT_SENSOR_DATA,
  'subscription.getPlans': CacheTTL.SUBSCRIPTION_DATA,
  'subscription.getSubscription': CacheTTL.SUBSCRIPTION_DATA,
  'traceability.getTraceInfo': CacheTTL.REPORTS,
  'cooperative.getCooperatives': CacheTTL.COOPERATIVE_DATA,
  'cooperative.getDetails': CacheTTL.COOPERATIVE_DATA,

  // Weather & Spatial
  'weather.getCurrent': CacheTTL.WEATHER_DATA,
  'weather.getForecast': CacheTTL.WEATHER_DATA,
  'spatial.getAnalysis': CacheTTL.SPATIAL_ANALYSIS,
  'landSuitability.getAnalysis': CacheTTL.SPATIAL_ANALYSIS,
  'satelliteImagery.getLatest': CacheTTL.SATELLITE_DATA,
  'fieldOverview.getOverview': CacheTTL.FARM_LIST,
  'weatherAlerts.getAlerts': CacheTTL.WEATHER_DATA,
  'priceAlerts.getAlerts': CacheTTL.PRICE_DATA,

  // AI/ML
  'mlPredictions.getYieldPrediction': CacheTTL.ML_PREDICTION,
  'mlPredictions.getPriceForecast': CacheTTL.ML_PREDICTION,
  'mlModels.getModels': CacheTTL.CONFIG,
  'soilAnalysis.getLatestAnalysis': CacheTTL.SOIL_ANALYSIS,
  'soilAnalysis.getHistory': CacheTTL.SOIL_ANALYSIS,
  'agriculturalIntelligence.getRecommendations': CacheTTL.ML_PREDICTION,

  // Admin & Config
  'health.getStatus': CacheTTL.DASHBOARD_STATS,
  'notification.getNotifications': CacheTTL.RECENT_ACTIVITIES,
  'exchange.getRates': CacheTTL.EXCHANGE_RATES,
  'kyc.getStatus': CacheTTL.KYC_STATUS,
  'smsAnalytics.getOverview': CacheTTL.REPORTS,
  'equipmentFleet.getFleet': CacheTTL.EQUIPMENT_LIST,
  'drone.getFleet': CacheTTL.EQUIPMENT_LIST,
  'iotGateway.getDevices': CacheTTL.IOT_SENSOR_DATA,
};

// Entity → cache key prefix mapping for invalidation
export const ENTITY_CACHE_PREFIXES: Record<string, string[]> = {
  farmer: ['farmerFeatures', 'dashboard', 'adminDashboard', 'analytics', 'coreFarms'],
  farm: ['coreFarms', 'dashboard', 'farmerFeatures', 'fieldOverview', 'landSuitability'],
  crop: ['coreCrops', 'dashboard', 'coreHarvests', 'marketplace'],
  livestock: ['coreLivestock', 'dashboard'],
  harvest: ['coreHarvests', 'dashboard', 'analytics'],
  expense: ['coreExpenses', 'dashboard', 'financialReports'],
  loan: ['microfinance', 'creditScoring', 'financialReports', 'financialEnhancements'],
  marketplace: ['marketplace', 'marketplaceEnhancements'],
  delivery: ['delivery'],
  subscription: ['subscription'],
  cooperative: ['cooperative'],
  chama: ['chama'],
  weather: ['weather', 'weatherAlerts'],
  sensor: ['coldChain', 'iotGateway'],
};

// L1 in-memory LRU cache
const l1Cache = new LRUCache<string, { data: unknown; etag: string; expiresAt: number }>({
  max: 5000,
  maxSize: 50 * 1024 * 1024, // 50MB max memory
  sizeCalculation: (value) => {
    try {
      return JSON.stringify(value.data).length;
    } catch (err) {
      return 1024;
    }
  },
  ttl: 5 * 60 * 1000, // 5 min max TTL for L1
  updateAgeOnGet: true,
  allowStale: false,
});

function generateETag(data: unknown): string {
  const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  return `"${hash}"`;
}

function extractKeyPrefix(key: string): string {
  const parts = key.split(':');
  return parts.length > 1 ? parts[0] : 'unknown';
}

/**
 * Multi-tier cache get: L1 → L2 → miss
 */
export async function cacheGet<T>(key: string): Promise<{ data: T; etag: string } | null> {
  const prefix = extractKeyPrefix(key);
  const timer = cacheOperationDuration.startTimer({ operation: 'get' });

  // L1: check in-memory LRU
  const l1Entry = l1Cache.get(key);
  if (l1Entry && l1Entry.expiresAt > Date.now()) {
    cacheHits.inc({ key_prefix: `l1:${prefix}` });
    timer();
    return { data: l1Entry.data as T, etag: l1Entry.etag };
  }

  // L2: check Redis
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(`cache:${key}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { data: T; etag: string };
        // Promote to L1
        l1Cache.set(key, {
          data: parsed.data,
          etag: parsed.etag,
          expiresAt: Date.now() + 60_000, // L1 TTL capped at 60s
        });
        cacheHits.inc({ key_prefix: `l2:${prefix}` });
        timer();
        return parsed;
      }
    } catch (err) {
      logger.warn('[Cache] Redis get failed', { key, error: (err as Error).message });
    }
  }

  cacheMisses.inc({ key_prefix: prefix });
  timer();
  return null;
}

/**
 * Multi-tier cache set: writes to both L1 and L2
 */
export async function cacheSet<T>(key: string, data: T, ttlSeconds: number): Promise<string> {
  const timer = cacheOperationDuration.startTimer({ operation: 'set' });
  const etag = generateETag(data);

  // L1: store in memory (cap TTL at 60s for L1)
  const l1Ttl = Math.min(ttlSeconds, 60);
  l1Cache.set(key, {
    data,
    etag,
    expiresAt: Date.now() + l1Ttl * 1000,
  });

  // L2: store in Redis
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.setex(`cache:${key}`, ttlSeconds, JSON.stringify({ data, etag }));
    } catch (err) {
      logger.warn('[Cache] Redis set failed', { key, error: (err as Error).message });
    }
  }

  timer();
  return etag;
}

/**
 * Get or set pattern: check cache, if miss run fetcher, cache result
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds: number
): Promise<{ data: T; etag: string; fromCache: boolean }> {
  const cached = await cacheGet<T>(key);
  if (cached) {
    return { data: cached.data, etag: cached.etag, fromCache: true };
  }

  const data = await fetcher();
  const etag = await cacheSet(key, data, ttlSeconds);
  return { data, etag, fromCache: false };
}

/**
 * Delete a specific cache key from both tiers
 */
export async function cacheDel(key: string): Promise<void> {
  const timer = cacheOperationDuration.startTimer({ operation: 'del' });

  l1Cache.delete(key);

  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(`cache:${key}`);
    } catch (err) {
      logger.warn('[Cache] Redis del failed', { key, error: (err as Error).message });
    }
  }

  timer();
}

/**
 * Invalidate cache by prefix pattern — clears both L1 and L2
 */
export async function cacheInvalidateByPrefix(prefix: string): Promise<number> {
  const timer = cacheOperationDuration.startTimer({ operation: 'invalidate' });
  let count = 0;

  // L1: iterate and delete matching keys
  for (const key of l1Cache.keys()) {
    if (key.startsWith(prefix)) {
      l1Cache.delete(key);
      count++;
    }
  }

  // L2: scan and delete matching keys
  const redis = getRedisClient();
  if (redis) {
    try {
      const keys = await redis.keys(`cache:${prefix}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
        count += keys.length;
      }
    } catch (err) {
      logger.warn('[Cache] Redis invalidate failed', { prefix, error: (err as Error).message });
    }
  }

  logger.info('[Cache] Invalidated', { prefix, count });
  timer();
  return count;
}

/**
 * Invalidate cache for a specific entity type
 */
export async function cacheInvalidateEntity(entityType: string, entityId?: string | number): Promise<void> {
  const prefixes = ENTITY_CACHE_PREFIXES[entityType] || [];

  for (const prefix of prefixes) {
    if (entityId) {
      await cacheInvalidateByPrefix(`${prefix}:${entityId}`);
    }
    await cacheInvalidateByPrefix(`${prefix}:`);
  }
}

/**
 * Get L1 cache stats for monitoring
 */
export function getCacheStats() {
  return {
    l1: {
      size: l1Cache.size,
      maxSize: 5000,
      calculatedSize: l1Cache.calculatedSize,
    },
  };
}

/**
 * Build a cache key from tRPC path and input
 */
export function buildCacheKey(path: string, input: unknown, userId?: number): string {
  const inputHash = input
    ? crypto.createHash('md5').update(JSON.stringify(input)).digest('hex').slice(0, 12)
    : 'no-input';
  const userPart = userId ? `:u${userId}` : '';
  return `${path}${userPart}:${inputHash}`;
}
