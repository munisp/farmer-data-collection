import Redis from 'ioredis';
import { logger } from './logger.js';
import { cacheHits, cacheMisses, cacheOperationDuration } from './metrics.js';

let redisClient: Redis | null = null;
let _connectionFailed = false;
let _lastReconnectAttempt = 0;
const RECONNECT_INTERVAL_MS = 30_000;

/**
 * Get or create Redis client with graceful degradation.
 * Returns null when Redis is unavailable instead of throwing.
 */
export function getRedisClient(): Redis | null {
  if (_connectionFailed) {
    if (Date.now() - _lastReconnectAttempt < RECONNECT_INTERVAL_MS) return null;
    // Attempt reconnect after interval
    _connectionFailed = false;
    redisClient = null;
  }

  if (redisClient && redisClient.status === 'ready') return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info('[Redis] REDIS_URL not set — running without cache');
    _connectionFailed = true;
    return null;
  }

  try {
    logger.info('[Redis] Connecting', { url: redisUrl.replace(/:[^:@]+@/, ':****@') });

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 3000,
      retryStrategy(times) {
        if (times > 3) {
          _connectionFailed = true;
          _lastReconnectAttempt = Date.now();
          return null;
        }
        return Math.min(times * 100, 2000);
      },
      reconnectOnError(err) {
        return err.message.includes('READONLY');
      },
    });

    redisClient.on('connect', () => {
      _connectionFailed = false;
      logger.info('[Redis] Connected successfully');
    });

    redisClient.on('error', (err) => {
      if (!_connectionFailed) {
        _connectionFailed = true;
        _lastReconnectAttempt = Date.now();
        logger.warn('[Redis] Connection failed — degraded mode', { error: err.message });
      }
    });

    redisClient.on('close', () => {
      logger.info('[Redis] Connection closed');
    });

    redisClient.connect().catch(() => {
      _connectionFailed = true;
      _lastReconnectAttempt = Date.now();
    });

    return redisClient;
  } catch (err) {
    _connectionFailed = true;
    _lastReconnectAttempt = Date.now();
    logger.warn('[Redis] Init failed', { error: (err as Error).message });
    return null;
  }
}

export function isRedisHealthy(): boolean {
  return !_connectionFailed && redisClient !== null && redisClient.status === 'ready';
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (err) {
      redisClient.disconnect();
    }
    redisClient = null;
    _connectionFailed = false;
    logger.info('[Redis] Connection closed gracefully');
  }
}

/**
 * Cache wrapper with graceful degradation — all operations return
 * safe fallback values when Redis is unavailable.
 */
export class CacheService {
  private defaultTTL: number = 300;

  constructor(ttl?: number) {
    if (ttl) this.defaultTTL = ttl;
  }

  private getClient(): Redis | null {
    return getRedisClient();
  }

  async get<T>(key: string): Promise<T | null> {
    const redis = this.getClient();
    if (!redis) return null;
    const timer = cacheOperationDuration.startTimer({ operation: 'redis_get' });
    try {
      const value = await redis.get(key);
      timer();
      if (!value) {
        cacheMisses.inc({ key_prefix: this.extractPrefix(key) });
        return null;
      }
      cacheHits.inc({ key_prefix: this.extractPrefix(key) });
      return JSON.parse(value) as T;
    } catch (error) {
      timer();
      logger.error(`[Cache] Error getting key ${key}`, { error: (error as Error).message });
      return null;
    }
  }

  private extractPrefix(key: string): string {
    const parts = key.split(':');
    return parts.length > 1 ? parts[0] : 'default';
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const redis = this.getClient();
    if (!redis) return;
    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.defaultTTL;
      await redis.setex(key, expiry, serialized);
    } catch (error) {
      logger.error(`[Cache] Error setting key ${key}`, { error: (error as Error).message });
    }
  }

  async del(key: string): Promise<void> {
    const redis = this.getClient();
    if (!redis) return;
    try {
      await redis.del(key);
    } catch (error) {
      logger.error(`[Cache] Error deleting key ${key}`, { error: (error as Error).message });
    }
  }

  async delPattern(pattern: string): Promise<void> {
    const redis = this.getClient();
    if (!redis) return;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info(`[Cache] Deleted ${keys.length} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      logger.error(`[Cache] Error deleting pattern ${pattern}`, { error: (error as Error).message });
    }
  }

  async exists(key: string): Promise<boolean> {
    const redis = this.getClient();
    if (!redis) return false;
    try {
      return (await redis.exists(key)) === 1;
    } catch (error) {
      logger.error(`[Cache] Error checking key ${key}`, { error: (error as Error).message });
      return false;
    }
  }

  async getOrSet<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const data = await fetcher();
    await this.set(key, data, ttl);
    return data;
  }

  async incr(key: string): Promise<number> {
    const redis = this.getClient();
    if (!redis) return 0;
    try {
      return await redis.incr(key);
    } catch (error) {
      logger.error(`[Cache] Error incrementing key ${key}`, { error: (error as Error).message });
      return 0;
    }
  }

  async decr(key: string): Promise<number> {
    const redis = this.getClient();
    if (!redis) return 0;
    try {
      return await redis.decr(key);
    } catch (error) {
      logger.error(`[Cache] Error decrementing key ${key}`, { error: (error as Error).message });
      return 0;
    }
  }

  async expire(key: string, ttl: number): Promise<void> {
    const redis = this.getClient();
    if (!redis) return;
    try {
      await redis.expire(key, ttl);
    } catch (error) {
      logger.error(`[Cache] Error setting expiration on key ${key}`, { error: (error as Error).message });
    }
  }

  async getStats(): Promise<{ keys: number; memory: string; hits: string; misses: string }> {
    const redis = this.getClient();
    if (!redis) return { keys: 0, memory: '0B', hits: '0', misses: '0' };
    try {
      const info = await redis.info('stats');
      const dbsize = await redis.dbsize();
      const memory = await redis.info('memory');
      return {
        keys: dbsize,
        memory: this.parseInfoValue(memory, 'used_memory_human'),
        hits: this.parseInfoValue(info, 'keyspace_hits'),
        misses: this.parseInfoValue(info, 'keyspace_misses'),
      };
    } catch (error) {
      logger.error('[Cache] Error getting stats', { error: (error as Error).message });
      return { keys: 0, memory: '0B', hits: '0', misses: '0' };
    }
  }

  private parseInfoValue(info: string, key: string): string {
    const match = info.match(new RegExp(`${key}:(.+)`));
    return match ? match[1].trim() : '0';
  }
}

export const cache = new CacheService();
