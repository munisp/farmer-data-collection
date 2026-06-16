/**
 * Cache Middleware for tRPC
 * 
 * Integrates with Go cache service for high-performance caching
 */

import axios from 'axios';
import { logger } from '../logger.js';

// ============================================================================
// Configuration
// ============================================================================

const CACHE_SERVICE_URL = process.env.CACHE_SERVICE_URL || 'http://localhost:8080';

// TTL configurations (in seconds)
export const CacheTTL = {
  DASHBOARD_STATS: 60,        // 1 minute
  USER_DATA: 300,             // 5 minutes
  FARMER_LIST: 180,           // 3 minutes
  FARM_LIST: 180,             // 3 minutes
  CROP_LIST: 180,             // 3 minutes
  HARVEST_STATS: 120,         // 2 minutes
  EXPENSE_STATS: 120,         // 2 minutes
  ML_PREDICTION: 600,         // 10 minutes
  REPORTS: 300,               // 5 minutes
};

// ============================================================================
// Cache Client
// ============================================================================

export class CacheClient {
  private baseURL: string;
  private enabled: boolean;

  constructor(baseURL: string = CACHE_SERVICE_URL) {
    this.baseURL = baseURL;
    this.enabled = true;
    
    // Test connection
    this.healthCheck().catch(() => {
      logger.warn('[Cache] Cache service not available, caching disabled');
      this.enabled = false;
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseURL}/health`, { timeout: 2000 });
      return response.data.success === true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get cached value
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.enabled) return null;

    try {
      const response = await axios.get(`${this.baseURL}/cache/${key}`, { timeout: 3000 });
      
      if (response.data.success) {
        logger.info(`[Cache] HIT: ${key}`);
        return response.data.data as T;
      }
      
      logger.info(`[Cache] MISS: ${key}`);
      return null;
    } catch (error) {
      logger.warn(`[Cache] Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cache value
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const response = await axios.post(
        `${this.baseURL}/cache`,
        { key, value, ttl },
        { timeout: 3000 }
      );
      
      if (response.data.success) {
        logger.info(`[Cache] SET: ${key} (TTL: ${ttl || 'default'}s)`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.warn(`[Cache] Error setting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete cache key
   */
  async delete(key: string): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const response = await axios.delete(`${this.baseURL}/cache/${key}`, { timeout: 3000 });
      
      if (response.data.success) {
        logger.info(`[Cache] DELETE: ${key}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.warn(`[Cache] Error deleting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidate(pattern: string): Promise<number> {
    if (!this.enabled) return 0;

    try {
      const response = await axios.post(
        `${this.baseURL}/cache/invalidate`,
        { pattern },
        { timeout: 5000 }
      );
      
      if (response.data.success) {
        const count = response.data.data?.count || 0;
        logger.info(`[Cache] INVALIDATE: ${pattern} (${count} keys)`);
        return count;
      }
      
      return 0;
    } catch (error) {
      logger.warn(`[Cache] Error invalidating pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async stats(): Promise<unknown> {
    if (!this.enabled) return null;

    try {
      const response = await axios.get(`${this.baseURL}/cache/stats`, { timeout: 3000 });
      return response.data.data;
    } catch (error) {
      logger.warn('[Cache] Error getting stats:', error);
      return null;
    }
  }

  /**
   * Flush all cache
   */
  async flush(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const response = await axios.post(`${this.baseURL}/cache/flush`, {}, { timeout: 5000 });
      
      if (response.data.success) {
        logger.info('[Cache] FLUSH: All cache cleared');
        return true;
      }
      
      return false;
    } catch (error) {
      logger.warn('[Cache] Error flushing cache:', error);
      return false;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let cacheClient: CacheClient | null = null;

export function getCacheClient(): CacheClient {
  if (!cacheClient) {
    cacheClient = new CacheClient();
  }
  return cacheClient;
}

// ============================================================================
// Cache Helper Functions
// ============================================================================

/**
 * Cache wrapper for database queries
 */
export async function cacheQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  const cache = getCacheClient();
  
  // Try to get from cache
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }
  
  // Execute query
  const result = await queryFn();
  
  // Cache the result
  await cache.set(key, result, ttl);
  
  return result;
}

/**
 * Generate cache key for user-specific data
 */
export function userCacheKey(userId: number, entity: string, id?: number): string {
  if (id) {
    return `user:${userId}:${entity}:${id}`;
  }
  return `user:${userId}:${entity}`;
}

/**
 * Invalidate user-specific cache
 */
export async function invalidateUserCache(userId: number, entity?: string): Promise<number> {
  const cache = getCacheClient();
  const pattern = entity ? `user:${userId}:${entity}:*` : `user:${userId}:*`;
  return await cache.invalidate(pattern);
}

/**
 * Invalidate dashboard cache
 */
export async function invalidateDashboardCache(userId: number): Promise<void> {
  const cache = getCacheClient();
  await cache.invalidate(`user:${userId}:dashboard:*`);
  await cache.invalidate(`user:${userId}:stats:*`);
}

// ============================================================================
// Cache Invalidation Hooks
// ============================================================================

/**
 * Invalidate cache after farmer operations
 */
export async function invalidateFarmerCache(userId: number): Promise<void> {
  await invalidateUserCache(userId, 'farmers');
  await invalidateDashboardCache(userId);
}

/**
 * Invalidate cache after farm operations
 */
export async function invalidateFarmCache(userId: number): Promise<void> {
  await invalidateUserCache(userId, 'farms');
  await invalidateDashboardCache(userId);
}

/**
 * Invalidate cache after crop operations
 */
export async function invalidateCropCache(userId: number): Promise<void> {
  await invalidateUserCache(userId, 'crops');
  await invalidateDashboardCache(userId);
}

/**
 * Invalidate cache after harvest operations
 */
export async function invalidateHarvestCache(userId: number): Promise<void> {
  await invalidateUserCache(userId, 'harvests');
  await invalidateUserCache(userId, 'harvest-stats');
  await invalidateDashboardCache(userId);
}

/**
 * Invalidate cache after expense operations
 */
export async function invalidateExpenseCache(userId: number): Promise<void> {
  await invalidateUserCache(userId, 'expenses');
  await invalidateUserCache(userId, 'expense-stats');
  await invalidateDashboardCache(userId);
}
