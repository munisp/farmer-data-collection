/**
 * tRPC Cache Middleware
 * 
 * Automatically caches query procedure results using the multi-tier cache layer.
 * Only caches queries (not mutations). Cache key is derived from procedure path + input + userId.
 * TTL is determined from ROUTE_TTL_MAP or falls back to a default.
 */

import { middleware } from '../_core/trpc-init.js';
import { ROUTE_TTL_MAP, buildCacheKey, cacheGetOrSet } from './cache-layer.js';
import { logger } from '../logger.js';

const DEFAULT_QUERY_TTL = 120; // 2 minutes for unmapped routes

/**
 * Cache middleware for tRPC queries.
 * Wraps the next() call with cache-get-or-set logic.
 * Mutations bypass the cache entirely.
 */
export const cacheMiddleware = middleware(async ({ path, type, ctx, next, getRawInput }) => {
  // Only cache queries — mutations always bypass
  if (type !== 'query') {
    return next();
  }

  // Look up TTL for this route
  const ttl = ROUTE_TTL_MAP[path];
  if (ttl === undefined) {
    // Route not in the TTL map — skip caching (opt-in, not opt-out)
    return next();
  }

  // Build cache key from path + input + user
  const userId = (ctx as any)?.user?.id;
  let input: unknown;
  try {
    input = await getRawInput();
  } catch (err) {
    input = undefined;
  }
  const cacheKey = buildCacheKey(path, input, userId);

  try {
    const { data, fromCache } = await cacheGetOrSet(
      cacheKey,
      async () => {
        // Execute the actual procedure
        const result = await next();
        // Extract the raw result from tRPC's response envelope
        if (result.ok) {
          return (result as any).data;
        }
        throw new Error('Procedure failed');
      },
      ttl
    );

    if (fromCache) {
      logger.debug('[CacheMiddleware] HIT', { path, ttl });
    }

    // Return the cached or fresh result in tRPC's expected format
    return {
      ok: true as const,
      data,
      marker: (undefined as any),
    };
  } catch (err) {
    // Cache error — fall through to uncached execution
    return next();
  }
});
