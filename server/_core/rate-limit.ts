import { TRPCError } from "@trpc/server";

/**
 * Simple in-memory rate limiting middleware
 * 
 * For production, consider using Redis-based rate limiting for distributed systems.
 * This implementation uses an in-memory Map to track request counts per IP/user.
 */

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory storage for rate limit tracking
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  rateLimitStore.forEach((entry, key) => {
    if (entry.resetTime < now) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => rateLimitStore.delete(key));
}, 5 * 60 * 1000);

/**
 * Create a rate limit middleware
 * 
 * @param config Rate limit configuration
 * @returns Middleware function for tRPC
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  return async function rateLimitMiddleware({ ctx, next }: { ctx: { user?: { id?: string | number }; req?: { ip?: string }; [key: string]: unknown }; next: () => Promise<unknown> }) {
    // Get identifier (IP address or user ID)
    const identifier = (ctx.user?.id?.toString() || ctx.req?.ip || 'unknown');
    const key = `ratelimit:${identifier}`;
    
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      // Create new entry
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + config.windowMs,
      });
    } else {
      // Increment existing entry
      entry.count++;

      if (entry.count > config.maxRequests) {
        const resetInSeconds = Math.ceil((entry.resetTime - now) / 1000);
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Rate limit exceeded. Try again in ${resetInSeconds} seconds.`,
        });
      }

      rateLimitStore.set(key, entry);
    }

    return next();
  };
}

/**
 * Predefined rate limit configurations
 */
export const rateLimitConfigs = {
  // Strict limits for public endpoints (e.g., login, register)
  strict: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 requests per 15 minutes
  },

  // Moderate limits for authenticated endpoints
  moderate: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute
  },

  // Lenient limits for frequent operations
  lenient: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  },
};

/**
 * Get rate limit info for a given identifier
 * 
 * @param identifier User ID or IP address
 * @returns Current rate limit status
 */
export function getRateLimitInfo(identifier: string) {
  const key = `ratelimit:${identifier}`;
  const entry = rateLimitStore.get(key);

  if (!entry) {
    return {
      count: 0,
      remaining: Infinity,
      resetTime: null,
    };
  }

  const now = Date.now();
  if (entry.resetTime < now) {
    rateLimitStore.delete(key);
    return {
      count: 0,
      remaining: Infinity,
      resetTime: null,
    };
  }

  return {
    count: entry.count,
    remaining: Math.max(0, 100 - entry.count), // Assuming default max of 100
    resetTime: new Date(entry.resetTime),
  };
}

/**
 * Clear rate limit for a specific identifier
 * Useful for testing or manual overrides
 * 
 * @param identifier User ID or IP address
 */
export function clearRateLimit(identifier: string) {
  const key = `ratelimit:${identifier}`;
  rateLimitStore.delete(key);
}

/**
 * Clear all rate limits
 * Useful for testing
 */
export function clearAllRateLimits() {
  rateLimitStore.clear();
}
