/**
 * Redis-Backed Store
 * 
 * Drop-in replacement for Map() in services. Stores data in Redis with:
 * - Automatic TTL-based expiration (no unbounded memory growth)
 * - Persistence across restarts
 * - Shared across processes
 * - Graceful fallback to in-memory Map when Redis is unavailable
 * 
 * Usage:
 *   const store = new RedisStore<MyType>('my-service:items', 3600);
 *   await store.set('key1', data);
 *   const val = await store.get('key1');
 */

import { LRUCache } from 'lru-cache';
import { getRedisClient } from '../redis.js';
import { logger } from '../logger.js';

export class RedisStore<T extends {}> {
  private prefix: string;
  private ttlSeconds: number;
  private fallback: LRUCache<string, T>;

  constructor(prefix: string, ttlSeconds: number = 3600, maxFallbackSize: number = 1000) {
    this.prefix = prefix;
    this.ttlSeconds = ttlSeconds;
    this.fallback = new LRUCache<string, T>({
      max: maxFallbackSize,
      ttl: ttlSeconds * 1000,
    });
  }

  private redisKey(key: string): string {
    return `store:${this.prefix}:${key}`;
  }

  async get(key: string): Promise<T | undefined> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const raw = await redis.get(this.redisKey(key));
        if (raw) return JSON.parse(raw) as T;
        return undefined;
      } catch (err) {
        // Fall through to fallback
      }
    }
    return this.fallback.get(key);
  }

  async set(key: string, value: T): Promise<void> {
    // Always write to fallback for immediate availability
    this.fallback.set(key, value);

    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.setex(this.redisKey(key), this.ttlSeconds, JSON.stringify(value));
      } catch (err) {
        logger.warn(`[RedisStore:${this.prefix}] Set failed`, { key, error: (err as Error).message });
      }
    }
  }

  async delete(key: string): Promise<boolean> {
    this.fallback.delete(key);

    const redis = getRedisClient();
    if (redis) {
      try {
        const count = await redis.del(this.redisKey(key));
        return count > 0;
      } catch (err) {
        return false;
      }
    }
    return true;
  }

  async has(key: string): Promise<boolean> {
    const redis = getRedisClient();
    if (redis) {
      try {
        return (await redis.exists(this.redisKey(key))) === 1;
      } catch (err) {
        // Fall through
      }
    }
    return this.fallback.has(key);
  }

  async size(): Promise<number> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const keys = await redis.keys(`store:${this.prefix}:*`);
        return keys.length;
      } catch (err) {
        // Fall through
      }
    }
    return this.fallback.size;
  }

  async values(): Promise<T[]> {
    const redis = getRedisClient();
    if (redis) {
      try {
        const keys = await redis.keys(`store:${this.prefix}:*`);
        if (keys.length === 0) return [];
        const pipeline = redis.pipeline();
        for (const key of keys) {
          pipeline.get(key);
        }
        const results = await pipeline.exec();
        return (results || [])
          .filter(([err, val]) => !err && val)
          .map(([, val]) => JSON.parse(val as string) as T);
      } catch (err) {
        // Fall through
      }
    }
    return [...this.fallback.values()];
  }

  async clear(): Promise<void> {
    this.fallback.clear();

    const redis = getRedisClient();
    if (redis) {
      try {
        const keys = await redis.keys(`store:${this.prefix}:*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch (err) {
        logger.warn(`[RedisStore:${this.prefix}] Clear failed`, { error: (err as Error).message });
      }
    }
  }
}
