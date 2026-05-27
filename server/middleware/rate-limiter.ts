/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and sync storms
 */

import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix?: string;    // Redis key prefix
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  handler?: (req: Request, res: Response) => void;
}

interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
}

// In-memory store for development/fallback
class MemoryStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map();

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (existing && existing.resetTime > now) {
      existing.count++;
      return existing;
    }

    const newEntry = { count: 1, resetTime: now + windowMs };
    this.store.set(key, newEntry);
    return newEntry;
  }

  async decrement(key: string): Promise<void> {
    const existing = this.store.get(key);
    if (existing && existing.count > 0) {
      existing.count--;
    }
  }

  // Cleanup expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of Array.from(this.store.entries())) {
      if (value.resetTime <= now) {
        this.store.delete(key);
      }
    }
  }
}

// Redis store for production
class RedisStore {
  private client: Redis;
  private prefix: string;

  constructor(client: Redis, prefix: string = 'rl:') {
    this.client = client;
    this.prefix = prefix;
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    const redisKey = this.prefix + key;
    const windowSec = Math.ceil(windowMs / 1000);

    const multi = this.client.multi();
    multi.incr(redisKey);
    multi.ttl(redisKey);

    const results = await multi.exec();
    const count = results?.[0]?.[1] as number || 1;
    const ttl = results?.[1]?.[1] as number || -1;

    // Set expiry if this is a new key
    if (ttl === -1) {
      await this.client.expire(redisKey, windowSec);
    }

    const resetTime = Date.now() + (ttl > 0 ? ttl * 1000 : windowMs);
    return { count, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const redisKey = this.prefix + key;
    await this.client.decr(redisKey);
  }
}

// Rate limiter factory
export function createRateLimiter(config: RateLimitConfig, redisClient?: Redis) {
  const store = redisClient 
    ? new RedisStore(redisClient, config.keyPrefix || 'rl:')
    : new MemoryStore();

  // Cleanup memory store periodically
  if (store instanceof MemoryStore) {
    setInterval(() => store.cleanup(), 60000);
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    // Generate key based on IP and optionally user ID
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userId = (req as any).user?.id || 'anonymous';
    const key = `${ip}:${userId}:${req.path}`;

    try {
      const { count, resetTime } = await store.increment(key, config.windowMs);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - count));
      res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());

      if (count > config.maxRequests) {
        // Rate limit exceeded
        if (config.handler) {
          return config.handler(req, res);
        }

        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
        });
        return;
      }

      // Track response status for skipFailedRequests/skipSuccessfulRequests
      if (config.skipFailedRequests || config.skipSuccessfulRequests) {
        res.on('finish', async () => {
          const success = res.statusCode < 400;
          if ((config.skipFailedRequests && !success) ||
              (config.skipSuccessfulRequests && success)) {
            await store.decrement(key);
          }
        });
      }

      next();
    } catch (error) {
      // On error, allow request through (fail open)
      console.error('Rate limiter error:', error);
      next();
    }
  };
}

// Pre-configured rate limiters for different endpoints
export const rateLimiters = {
  // Strict limit for auth endpoints (prevent brute force)
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyPrefix: 'rl:auth:',
    skipSuccessfulRequests: true, // Only count failed attempts
  }),

  // Standard API limit
  api: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    keyPrefix: 'rl:api:',
  }),

  // Relaxed limit for sync operations (allow burst)
  sync: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 500,
    keyPrefix: 'rl:sync:',
  }),

  // Strict limit for payment endpoints
  payment: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyPrefix: 'rl:payment:',
  }),

  // Very strict limit for SMS/USSD (prevent abuse)
  messaging: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
    keyPrefix: 'rl:msg:',
  }),
};

// Sliding window rate limiter for more precise control
export class SlidingWindowRateLimiter {
  private redis: Redis;
  private prefix: string;

  constructor(redis: Redis, prefix: string = 'swrl:') {
    this.redis = redis;
    this.prefix = prefix;
  }

  async isAllowed(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; info: RateLimitInfo }> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const redisKey = this.prefix + key;

    // Remove old entries and count current
    const multi = this.redis.multi();
    multi.zremrangebyscore(redisKey, 0, windowStart);
    multi.zcard(redisKey);
    multi.zadd(redisKey, now, `${now}:${Math.random()}`);
    multi.expire(redisKey, Math.ceil(windowMs / 1000));

    const results = await multi.exec();
    const current = (results?.[1]?.[1] as number) || 0;

    const info: RateLimitInfo = {
      limit,
      current: current + 1,
      remaining: Math.max(0, limit - current - 1),
      resetTime: new Date(now + windowMs),
    };

    return {
      allowed: current < limit,
      info,
    };
  }
}

// IP-based blocking for suspicious activity
export class IPBlocker {
  private redis: Redis;
  private prefix: string;
  private blockDuration: number;

  constructor(redis: Redis, blockDuration: number = 3600000, prefix: string = 'blocked:') {
    this.redis = redis;
    this.prefix = prefix;
    this.blockDuration = blockDuration;
  }

  async isBlocked(ip: string): Promise<boolean> {
    const result = await this.redis.get(this.prefix + ip);
    return result !== null;
  }

  async block(ip: string, reason: string): Promise<void> {
    await this.redis.setex(
      this.prefix + ip,
      Math.ceil(this.blockDuration / 1000),
      JSON.stringify({ reason, blockedAt: new Date().toISOString() })
    );
  }

  async unblock(ip: string): Promise<void> {
    await this.redis.del(this.prefix + ip);
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      
      if (await this.isBlocked(ip)) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Your IP has been temporarily blocked due to suspicious activity.',
        });
        return;
      }

      next();
    };
  }
}

export default rateLimiters;
