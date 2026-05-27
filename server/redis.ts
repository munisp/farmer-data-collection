import Redis from 'ioredis';

// Redis client singleton
let redisClient: Redis | null = null;

/**
 * Get or create Redis client
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    console.log('[Redis] Connecting to Redis:', redisUrl.replace(/:[^:@]+@/, ':****@'));
    
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Reconnect when Redis is in readonly mode
          return true;
        }
        return false;
      },
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Error:', err.message);
    });

    redisClient.on('close', () => {
      console.log('[Redis] Connection closed');
    });
  }

  return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Connection closed gracefully');
  }
}

/**
 * Cache wrapper utilities
 */
export class CacheService {
  private redis: Redis;
  private defaultTTL: number = 300; // 5 minutes

  constructor(ttl?: number) {
    this.redis = getRedisClient();
    if (ttl) this.defaultTTL = ttl;
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[Cache] Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cached value with TTL
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.defaultTTL;
      await this.redis.setex(key, expiry, serialized);
    } catch (error) {
      console.error(`[Cache] Error setting key ${key}:`, error);
    }
  }

  /**
   * Delete cached value
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(`[Cache] Error deleting key ${key}:`, error);
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`[Cache] Deleted ${keys.length} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      console.error(`[Cache] Error deleting pattern ${pattern}:`, error);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`[Cache] Error checking key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get or set pattern: fetch from cache or compute and cache
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      console.log(`[Cache] HIT: ${key}`);
      return cached;
    }

    // Cache miss - fetch data
    console.log(`[Cache] MISS: ${key}`);
    const data = await fetcher();
    
    // Store in cache
    await this.set(key, data, ttl);
    
    return data;
  }

  /**
   * Increment counter
   */
  async incr(key: string): Promise<number> {
    try {
      return await this.redis.incr(key);
    } catch (error) {
      console.error(`[Cache] Error incrementing key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Decrement counter
   */
  async decr(key: string): Promise<number> {
    try {
      return await this.redis.decr(key);
    } catch (error) {
      console.error(`[Cache] Error decrementing key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Set expiration on existing key
   */
  async expire(key: string, ttl: number): Promise<void> {
    try {
      await this.redis.expire(key, ttl);
    } catch (error) {
      console.error(`[Cache] Error setting expiration on key ${key}:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    keys: number;
    memory: string;
    hits: string;
    misses: string;
  }> {
    try {
      const info = await this.redis.info('stats');
      const dbsize = await this.redis.dbsize();
      const memory = await this.redis.info('memory');

      // Parse info strings
      const stats = {
        keys: dbsize,
        memory: this.parseInfoValue(memory, 'used_memory_human'),
        hits: this.parseInfoValue(info, 'keyspace_hits'),
        misses: this.parseInfoValue(info, 'keyspace_misses'),
      };

      return stats;
    } catch (error) {
      console.error('[Cache] Error getting stats:', error);
      return { keys: 0, memory: '0B', hits: '0', misses: '0' };
    }
  }

  private parseInfoValue(info: string, key: string): string {
    const match = info.match(new RegExp(`${key}:(.+)`));
    return match ? match[1].trim() : '0';
  }
}

// Export singleton instance
export const cache = new CacheService();
