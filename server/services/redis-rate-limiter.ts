/**
 * Redis-based Rate Limiter Service
 * 
 * Production-ready rate limiting using Redis for:
 * - Multi-instance deployments (shared state across pods)
 * - Persistence across process restarts
 * - Configurable windows and limits
 * 
 * Falls back to in-memory rate limiting if Redis is unavailable
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from '../logger.js';

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const RATE_LIMIT_PREFIX = 'gps:ratelimit:';

// Default limits
const DEFAULT_LIMITS = {
  GPS_POINTS_PER_MINUTE: 60,
  GPS_POINTS_PER_HOUR: 1000,
  API_REQUESTS_PER_MINUTE: 100,
};

// Accuracy thresholds (configurable per use case)
export const GPS_ACCURACY_THRESHOLDS = {
  HIGH_PRECISION: 10,      // 10m - for boundary capture
  GOOD: 20,                // 20m - for precise tracking
  STANDARD: 30,            // 30m - default
  RELAXED: 50,             // 50m - for general movement
  LOW_PRECISION: 100,      // 100m - for rough tracking
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

class RedisRateLimiter {
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;
  private fallbackCache: Map<string, { count: number; resetTime: number }> = new Map();
  private connectionAttempted: boolean = false;

  /**
   * Initialize Redis connection
   */
  async init(): Promise<void> {
    if (this.connectionAttempted) return;
    this.connectionAttempted = true;

    try {
      this.client = createClient({ url: REDIS_URL });
      
      this.client.on('error', (err) => {
        logger.warn('[RateLimiter] Redis error, using fallback:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('[RateLimiter] Connected to Redis');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        logger.warn('[RateLimiter] Disconnected from Redis, using fallback');
        this.isConnected = false;
      });

      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      logger.warn('[RateLimiter] Failed to connect to Redis, using in-memory fallback:', error);
      this.isConnected = false;
    }
  }

  /**
   * Check rate limit using Redis sliding window
   */
  async checkRateLimit(
    key: string,
    config: RateLimitConfig = { windowMs: 60000, maxRequests: DEFAULT_LIMITS.GPS_POINTS_PER_MINUTE }
  ): Promise<RateLimitResult> {
    const fullKey = `${RATE_LIMIT_PREFIX}${key}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Try Redis first
    if (this.isConnected && this.client) {
      try {
        return await this.checkRateLimitRedis(fullKey, config, now, windowStart);
      } catch (error) {
        logger.warn('[RateLimiter] Redis operation failed, using fallback:', error);
      }
    }

    // Fallback to in-memory
    return this.checkRateLimitFallback(fullKey, config, now);
  }

  /**
   * Redis-based rate limiting using sorted sets (sliding window)
   */
  private async checkRateLimitRedis(
    key: string,
    config: RateLimitConfig,
    now: number,
    windowStart: number
  ): Promise<RateLimitResult> {
    if (!this.client) {
      throw new Error('Redis client not available');
    }

    // Use Redis transaction for atomic operations
    const multi = this.client.multi();
    
    // Remove old entries outside the window
    multi.zRemRangeByScore(key, 0, windowStart);
    
    // Count current entries in window
    multi.zCard(key);
    
    // Add current request
    multi.zAdd(key, { score: now, value: `${now}-${Math.random()}` });
    
    // Set expiry on the key
    multi.expire(key, Math.ceil(config.windowMs / 1000) + 1);

    const results = await multi.exec();
    const currentCount = Number((results?.[1] as unknown) ?? 0) || 0;

    const allowed = currentCount < config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - currentCount - 1);
    const resetTime = now + config.windowMs;

    return {
      allowed,
      remaining,
      resetTime,
      limit: config.maxRequests,
    };
  }

  /**
   * In-memory fallback rate limiting (fixed window)
   */
  private checkRateLimitFallback(
    key: string,
    config: RateLimitConfig,
    now: number
  ): RateLimitResult {
    const entry = this.fallbackCache.get(key);

    if (!entry || now > entry.resetTime) {
      this.fallbackCache.set(key, { count: 1, resetTime: now + config.windowMs });
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: now + config.windowMs,
        limit: config.maxRequests,
      };
    }

    if (entry.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime,
        limit: config.maxRequests,
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetTime: entry.resetTime,
      limit: config.maxRequests,
    };
  }

  /**
   * Check GPS rate limit for a specific device
   */
  async checkGPSRateLimit(
    userId: number,
    deviceId: number,
    pointsPerMinute: number = DEFAULT_LIMITS.GPS_POINTS_PER_MINUTE
  ): Promise<RateLimitResult> {
    const key = `gps:${userId}:${deviceId}`;
    return this.checkRateLimit(key, {
      windowMs: 60000, // 1 minute
      maxRequests: pointsPerMinute,
    });
  }

  /**
   * Check API rate limit for a user
   */
  async checkAPIRateLimit(
    userId: number,
    requestsPerMinute: number = DEFAULT_LIMITS.API_REQUESTS_PER_MINUTE
  ): Promise<RateLimitResult> {
    const key = `api:${userId}`;
    return this.checkRateLimit(key, {
      windowMs: 60000,
      maxRequests: requestsPerMinute,
    });
  }

  /**
   * Reset rate limit for a key (admin function)
   */
  async resetRateLimit(key: string): Promise<void> {
    const fullKey = `${RATE_LIMIT_PREFIX}${key}`;
    
    if (this.isConnected && this.client) {
      try {
        await this.client.del(fullKey);
      } catch (error) {
        logger.warn('[RateLimiter] Failed to reset Redis key:', error);
      }
    }
    
    this.fallbackCache.delete(fullKey);
  }

  /**
   * Get current rate limit status without incrementing
   */
  async getRateLimitStatus(
    key: string,
    config: RateLimitConfig = { windowMs: 60000, maxRequests: DEFAULT_LIMITS.GPS_POINTS_PER_MINUTE }
  ): Promise<{ count: number; remaining: number; resetTime: number }> {
    const fullKey = `${RATE_LIMIT_PREFIX}${key}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    if (this.isConnected && this.client) {
      try {
        await this.client.zRemRangeByScore(fullKey, 0, windowStart);
        const count = await this.client.zCard(fullKey);
        return {
          count,
          remaining: Math.max(0, config.maxRequests - count),
          resetTime: now + config.windowMs,
        };
      } catch (error) {
        logger.warn('[RateLimiter] Failed to get Redis status:', error);
      }
    }

    const entry = this.fallbackCache.get(fullKey);
    if (!entry || now > entry.resetTime) {
      return { count: 0, remaining: config.maxRequests, resetTime: now + config.windowMs };
    }

    return {
      count: entry.count,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetTime: entry.resetTime,
    };
  }

  /**
   * Check if Redis is connected
   */
  isRedisConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  /**
   * Clean up old fallback cache entries
   */
  cleanupFallbackCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.fallbackCache.entries()) {
      if (now > entry.resetTime) {
        this.fallbackCache.delete(key);
      }
    }
  }
}

// Singleton instance
export const rateLimiter = new RedisRateLimiter();

// Initialize on import (non-blocking)
rateLimiter.init().catch((err) => {
  logger.warn('[RateLimiter] Initialization failed:', err);
});

// Periodic cleanup of fallback cache (every 5 minutes)
setInterval(() => {
  rateLimiter.cleanupFallbackCache();
}, 5 * 60 * 1000);

export default rateLimiter;
