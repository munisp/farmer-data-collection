/**
 * Redis-backed State Store
 * Replaces ephemeral in-memory Maps with Redis persistence.
 * Falls back to in-memory BoundedMap when Redis is unavailable.
 */

import { logger } from '../logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<void>;
  del(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
}

let redisClient: RedisClient | null = null;
let redisHealthy = false;

async function getRedisClient(): Promise<RedisClient | null> {
  if (redisClient && redisHealthy) return redisClient;

  try {
    const redis = await import('redis');
    const client = redis.createClient({ url: REDIS_URL });
    client.on('error', (err: Error) => {
      logger.warn('[RedisStateStore] Redis error, falling back to memory', { error: err.message });
      redisHealthy = false;
    });
    client.on('connect', () => { redisHealthy = true; });
    await client.connect();
    redisClient = client as unknown as RedisClient;
    redisHealthy = true;
    return redisClient;
  } catch {
    logger.debug('[RedisStateStore] Redis unavailable, using in-memory fallback');
    redisHealthy = false;
    return null;
  }
}

/**
 * Persistent state store with Redis backend and in-memory fallback.
 * TTL-based expiration in both modes.
 */
export class PersistentStateStore<T> {
  private prefix: string;
  private ttlSeconds: number;
  private fallback = new Map<string, { value: T; expiresAt: number }>();

  constructor(prefix: string, ttlSeconds: number = 3600) {
    this.prefix = prefix;
    this.ttlSeconds = ttlSeconds;
  }

  private redisKey(key: string): string {
    return `state:${this.prefix}:${key}`;
  }

  async get(key: string): Promise<T | undefined> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        const val = await redis.get(this.redisKey(key));
        if (val) return JSON.parse(val) as T;
        return undefined;
      } catch (err) {
        logger.warn(`[RedisStateStore] get error for ${this.prefix}`, { error: String(err) });
      }
    }

    const entry = this.fallback.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.value;
    if (entry) this.fallback.delete(key);
    return undefined;
  }

  async set(key: string, value: T, ttlOverride?: number): Promise<void> {
    const ttl = ttlOverride ?? this.ttlSeconds;
    const redis = await getRedisClient();
    if (redis) {
      try {
        await redis.set(this.redisKey(key), JSON.stringify(value), { EX: ttl });
        return;
      } catch (err) {
        logger.warn(`[RedisStateStore] set error for ${this.prefix}`, { error: String(err) });
      }
    }

    this.fallback.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    this.evictExpired();
  }

  async delete(key: string): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        await redis.del(this.redisKey(key));
        return;
      } catch (err) {
        logger.warn(`[RedisStateStore] del error for ${this.prefix}`, { error: String(err) });
      }
    }
    this.fallback.delete(key);
  }

  async values(): Promise<T[]> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        const keys = await redis.keys(`state:${this.prefix}:*`);
        const results: T[] = [];
        for (const k of keys) {
          const val = await redis.get(k);
          if (val) results.push(JSON.parse(val) as T);
        }
        return results;
      } catch (err) {
        logger.warn(`[RedisStateStore] values error for ${this.prefix}`, { error: String(err) });
      }
    }

    const now = Date.now();
    return Array.from(this.fallback.entries())
      .filter(([, e]) => e.expiresAt > now)
      .map(([, e]) => e.value);
  }

  async size(): Promise<number> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        const keys = await redis.keys(`state:${this.prefix}:*`);
        return keys.length;
      } catch {
        // fall through
      }
    }
    return this.fallback.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.fallback) {
      if (v.expiresAt <= now) this.fallback.delete(k);
    }
    if (this.fallback.size > 10000) {
      const entries = Array.from(this.fallback.entries())
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      const toRemove = entries.slice(0, entries.length - 5000);
      for (const [k] of toRemove) this.fallback.delete(k);
    }
  }

  getBackendType(): string {
    return redisHealthy ? 'redis' : 'in-memory';
  }
}
