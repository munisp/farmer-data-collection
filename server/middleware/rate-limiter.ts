import { middleware } from "../_core/trpc-base.js";
import { TRPCError } from "@trpc/server";
import { logger } from "../logger.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();
const DEFAULT_WINDOW_MS = 60000;
const DEFAULT_MAX_REQUESTS = 100;

interface RateLimitConfig {
  windowMs?: number;
  maxRequests?: number;
  keyPrefix?: string;
}

export function createRateLimiter(config: RateLimitConfig = {}) {
  const { windowMs = DEFAULT_WINDOW_MS, maxRequests = DEFAULT_MAX_REQUESTS, keyPrefix = "global" } = config;

  return middleware(async ({ ctx, next }) => {
    const headers = (ctx as any).req?.headers || {};
    const clientId = (headers["x-forwarded-for"] as string) || (headers["x-tenant-id"] as string) || "anonymous";
    const key = `${keyPrefix}:${clientId}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      logger.warn("[RateLimit] Exceeded", { key, count: entry.count, limit: maxRequests });
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${Math.ceil((entry.resetAt - now) / 1000)} seconds.`,
      });
    }

    return next();
  });
}

export const globalRateLimiter = createRateLimiter({ maxRequests: 100, windowMs: 60000, keyPrefix: "global" });
export const strictRateLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60000, keyPrefix: "strict" });
export const authRateLimiter = createRateLimiter({ maxRequests: 5, windowMs: 300000, keyPrefix: "auth" });

function createExpressRateLimiter(windowMs: number, max: number) {
  const expressStore = new Map<string, RateLimitEntry>();
  return (req: any, res: any, next: any) => {
    const ip = req.headers["x-forwarded-for"] || req.ip || "unknown";
    const now = Date.now();
    let entry = expressStore.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      expressStore.set(ip, entry);
    }
    entry.count++;
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));
    if (entry.count > max) {
      res.status(429).json({ error: "Too many requests", retryAfter: Math.ceil((entry.resetAt - now) / 1000) });
      return;
    }
    next();
  };
}

export const rateLimiters = {
  api: createExpressRateLimiter(60000, 200),
  messaging: createExpressRateLimiter(60000, 50),
  auth: createExpressRateLimiter(300000, 10),
  strict: createExpressRateLimiter(60000, 20),
};

export function getRateLimitStats() {
  const entries = Array.from(store.entries());
  const now = Date.now();
  const active = entries.filter(([, v]) => v.resetAt > now);
  return {
    totalTracked: entries.length,
    activeWindows: active.length,
    topConsumers: active.sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([k, v]) => ({ key: k, requests: v.count })),
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt + 60000) store.delete(key);
  }
}, 60000);
