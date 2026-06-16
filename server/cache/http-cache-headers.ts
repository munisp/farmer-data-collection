/**
 * HTTP Cache Headers Middleware
 * 
 * Adds Cache-Control, ETag, and 304 Not Modified support to Express responses.
 * Works for both tRPC responses and regular REST endpoints.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../logger.js';

interface CacheHeaderConfig {
  defaultMaxAge: number;
  staticMaxAge: number;
  apiMaxAge: number;
  staleWhileRevalidate: number;
  staleIfError: number;
}

const config: CacheHeaderConfig = {
  defaultMaxAge: 0,
  staticMaxAge: 86400,      // 1 day for static assets
  apiMaxAge: 60,             // 1 minute for API responses
  staleWhileRevalidate: 120, // serve stale while revalidating for 2 min
  staleIfError: 300,         // serve stale on error for 5 min
};

/**
 * Generate ETag from response body
 */
function generateETag(body: string | Buffer): string {
  const hash = crypto.createHash('md5').update(body).digest('hex');
  return `W/"${hash}"`;
}

/**
 * Express middleware for HTTP cache headers on API responses
 */
export function httpCacheHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only apply to GET requests
    if (req.method !== 'GET') {
      // Mutations should not be cached
      res.setHeader('Cache-Control', 'no-store');
      return next();
    }

    // Store original json method to intercept response
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      // Skip if headers already sent
      if (res.headersSent) {
        return originalJson(body);
      }

      const path = req.path;

      // Determine cache policy based on path
      if (path.startsWith('/health') || path === '/healthz' || path === '/readyz') {
        // Health checks: short cache, no ETag
        res.setHeader('Cache-Control', 'public, max-age=5, no-transform');
      } else if (path.startsWith('/api/') || path.startsWith('/trpc/')) {
        // API/tRPC responses: moderate cache with stale-while-revalidate
        const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
        const etag = generateETag(bodyStr);

        // Check If-None-Match for 304
        const clientETag = req.headers['if-none-match'];
        if (clientETag === etag) {
          res.status(304);
          return res.end();
        }

        res.setHeader('ETag', etag);
        res.setHeader(
          'Cache-Control',
          `private, max-age=${config.apiMaxAge}, stale-while-revalidate=${config.staleWhileRevalidate}, stale-if-error=${config.staleIfError}`
        );
        res.setHeader('Vary', 'Authorization, Accept-Encoding');
      } else if (
        path.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/)
      ) {
        // Static assets: long cache with immutable
        res.setHeader(
          'Cache-Control',
          `public, max-age=${config.staticMaxAge}, immutable`
        );
      } else if (path.startsWith('/docs')) {
        // Documentation: moderate cache
        res.setHeader('Cache-Control', 'public, max-age=300');
      } else {
        // Default: no cache
        res.setHeader('Cache-Control', 'no-cache');
      }

      return originalJson(body);
    };

    next();
  };
}

/**
 * Express middleware specifically for static file serving with immutable headers
 */
export function staticCacheHeaders() {
  return (_req: Request, res: Response, next: NextFunction) => {
    // Vite adds content hashes to filenames, so files are immutable
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    next();
  };
}
