/**
 * Rate Limiter with Test Environment Bypass
 * 
 * Provides rate limiting with Redis backend and in-memory fallback.
 * Automatically bypasses rate limiting in test environment.
 */

import { TRPCError } from '@trpc/server';
import { getRedis } from './redis.js';
import { logger } from '../logger.js';

interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  skipTest?: boolean; // Skip rate limiting in test environment
}

// In-memory store for rate limiting (fallback when Redis is unavailable)
const memoryStore = new Map<string, { count: number; resetTime: number }>();

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now();
  Array.from(memoryStore.entries()).forEach(([key, value]) => {
    if (now > value.resetTime) {
      memoryStore.delete(key);
    }
  });
}, 60000);

export function createRateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    max,
    keyPrefix = 'ratelimit',
    skipTest = true, // Default: skip in test environment
  } = config;

  return async (identifier: string): Promise<void> => {
    // Bypass rate limiting in test environment
    if (skipTest && (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true')) {
      return;
    }

    const key = `${keyPrefix}:${identifier}`;
    const now = Date.now();
    const resetTime = now + windowMs;

    try {
      // Try Redis first
      const redis = getRedis();
      if (!redis) {
        throw new Error('Redis unavailable');
      }
      const current = await redis.incr(key);
      
      if (current === 1) {
        // First request, set expiry
        await redis.pexpire(key, windowMs);
      }

      if (current > max) {
        const ttl = await redis.pttl(key);
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many requests. Please try again in ${Math.ceil(ttl / 1000)} seconds.`,
        });
      }
    } catch (error) {
      // Fallback to in-memory store if Redis is unavailable
      if (error instanceof TRPCError) {
        throw error; // Re-throw rate limit errors
      }

      logger.warn('[RateLimiter] Redis unavailable, using in-memory fallback');
      
      let entry = memoryStore.get(key);
      
      if (!entry || now > entry.resetTime) {
        // Create new entry
        entry = { count: 1, resetTime };
        memoryStore.set(key, entry);
      } else {
        // Increment existing entry
        entry.count++;
        
        if (entry.count > max) {
          const remainingMs = entry.resetTime - now;
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: `Too many requests. Please try again in ${Math.ceil(remainingMs / 1000)} seconds.`,
          });
        }
      }
    }
  };
}

// Pre-configured rate limiters for common use cases
export const rateLimiters = {
  // Authentication: 5 attempts per 15 minutes
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyPrefix: 'auth',
  }),

  // API calls: 100 requests per minute
  api: createRateLimiter({
    windowMs: 60 * 1000,
    max: 100,
    keyPrefix: 'api',
  }),

  // SMS sending: 10 SMS per hour
  sms: createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyPrefix: 'sms',
  }),

  // File uploads: 20 uploads per hour
  upload: createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyPrefix: 'upload',
  }),

  // Sync operations: 60 syncs per minute
  sync: createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    keyPrefix: 'sync',
  }),
};

// Helper to get identifier from context
export function getIdentifier(ctx: { user?: { id?: string | number }; req?: { ip?: string }; [key: string]: unknown }): string {
  return String(ctx.user?.id || ctx.req?.ip || 'anonymous');
}
