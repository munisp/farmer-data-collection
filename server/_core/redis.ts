import Redis from "ioredis";
import { logger } from '../logger.js';

let redis: Redis | null = null;
let redisAvailable = false;

/**
 * Initialize Redis connection
 * Falls back gracefully if Redis is unavailable
 */
export function initRedis() {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  
  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn("[Redis] Max retries reached, falling back to in-memory rate limiting");
          redisAvailable = false;
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000); // Exponential backoff
      },
      reconnectOnError: (err) => {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
          return true; // Reconnect on READONLY error
        }
        return false;
      },
    });

    redis.on("connect", () => {
      logger.info("[Redis] Connected successfully");
      redisAvailable = true;
    });

    redis.on("error", (err) => {
      logger.warn(`[Redis] Error: ${err.message}`);
      redisAvailable = false;
    });

    redis.on("close", () => {
      logger.warn("[Redis] Connection closed");
      redisAvailable = false;
    });

  } catch (error) {
    logger.warn("[Redis] Failed to initialize:", error);
    redisAvailable = false;
  }
}

/**
 * Get Redis client instance
 * Returns null if Redis is unavailable
 */
export function getRedis(): Redis | null {
  return redisAvailable ? redis : null;
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Close Redis connection
 */
export async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
    redisAvailable = false;
  }
}
