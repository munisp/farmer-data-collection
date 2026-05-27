import { TRPCError } from "@trpc/server";
import { RateLimiterRedis, RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { getRedis, isRedisAvailable } from "./redis";

// In-memory fallback rate limiters
const memoryLimiters = new Map<string, RateLimiterMemory>();

// Redis rate limiters (created on-demand)
const redisLimiters = new Map<string, RateLimiterRedis>();

interface RateLimitConfig {
  points: number; // Number of requests
  duration: number; // Time window in seconds
  keyPrefix: string; // Unique prefix for this limiter
}

/**
 * Get or create a rate limiter (Redis or in-memory fallback)
 */
function getRateLimiter(config: RateLimitConfig): RateLimiterRedis | RateLimiterMemory {
  const { keyPrefix, points, duration } = config;

  // Try to use Redis if available
  if (isRedisAvailable()) {
    const redis = getRedis();
    if (redis) {
      if (!redisLimiters.has(keyPrefix)) {
        redisLimiters.set(
          keyPrefix,
          new RateLimiterRedis({
            storeClient: redis,
            keyPrefix,
            points,
            duration,
          })
        );
      }
      return redisLimiters.get(keyPrefix)!;
    }
  }

  // Fallback to in-memory
  if (!memoryLimiters.has(keyPrefix)) {
    memoryLimiters.set(
      keyPrefix,
      new RateLimiterMemory({
        keyPrefix,
        points,
        duration,
      })
    );
  }
  return memoryLimiters.get(keyPrefix)!;
}

/**
 * Rate limit middleware for tRPC procedures
 */
export async function rateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<void> {
  // Bypass rate limiting in test environment
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return;
  }
  
  const limiter = getRateLimiter(config);
  
  try {
    await limiter.consume(identifier, 1);
  } catch (error) {
    if (error instanceof Error) {
      // Generic error
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Rate limit exceeded. Please try again later.",
      });
    } else if ((error as RateLimiterRes).msBeforeNext) {
      // Rate limit exceeded
      const res = error as RateLimiterRes;
      const retryAfter = Math.ceil(res.msBeforeNext / 1000);
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      });
    } else {
      // Unknown error
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Rate limiting error",
      });
    }
  }
}

/**
 * Predefined rate limit configurations
 */
export const RateLimitPresets = {
  // Strict limits for public/unauthenticated endpoints
  strict: {
    points: 10,
    duration: 60, // 10 requests per minute
    keyPrefix: "rl:strict",
  },
  // Moderate limits for authenticated users
  moderate: {
    points: 100,
    duration: 60, // 100 requests per minute
    keyPrefix: "rl:moderate",
  },
  // Relaxed limits for internal/admin operations
  relaxed: {
    points: 1000,
    duration: 60, // 1000 requests per minute
    keyPrefix: "rl:relaxed",
  },
};
