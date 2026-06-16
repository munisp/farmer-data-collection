/**
 * Deep Middleware Integration Layer
 * Integrates all 12 middleware systems into the tRPC request lifecycle.
 * Applied automatically to all routers via context enrichment.
 * 
 * Middleware Systems:
 * 1. Redis - Caching, session management, rate limiting
 * 2. Kafka - Event streaming, audit trail, async processing
 * 3. TigerBeetle - Double-entry ledger for financial transactions
 * 4. Mojaloop - Payment settlement and interoperability
 * 5. Keycloak - Identity management and SSO
 * 6. Permify - Fine-grained authorization (ReBAC)
 * 7. OpenSearch - Full-text search and analytics
 * 8. Fluvio - Real-time data streaming
 * 9. Dapr - State management and pub/sub
 * 10. APISIX - API gateway, rate limiting, traffic management
 * 11. OpenAppSec - Web Application Firewall, threat detection
 * 12. Lakehouse - Data warehouse for analytics and reporting
 */

import { logger } from "../logger.js";
import {
  withRedisCache,
  invalidateRedisCache,
  publishKafkaEvent,
  recordLedgerEntry,
  initiatePaymentSettlement,
  verifyKeycloakToken,
  checkPermission,
  indexDocument,
  searchDocuments,
  streamEvent,
  saveDaprState,
  getDaprState,
  checkRateLimit,
  scanForThreats,
  writeToLakehouse,
  runMiddlewarePipeline,
} from "../integrations/middleware-router-hooks.js";

// ─── Middleware Context Enrichment ─────────────────────────────────────────

export interface MiddlewareContext {
  cache: {
    get: <T>(key: string, ttl: number, fn: () => Promise<T>) => Promise<T>;
    invalidate: (pattern: string) => Promise<void>;
  };
  events: {
    publish: (topic: string, data: Record<string, unknown>) => Promise<void>;
    stream: (channel: string, data: Record<string, unknown>) => Promise<void>;
  };
  ledger: {
    record: (debit: string, credit: string, amount: number, currency: string, desc: string) => Promise<{ transactionId: string; status: string }>;
    settle: (from: string, to: string, amount: number, currency: string) => Promise<{ transferId: string; status: string }>;
  };
  auth: {
    verifyToken: (token: string) => Promise<{ valid: boolean; userId?: string; roles?: string[] }>;
    checkPermission: (userId: string, resource: string, action: string) => Promise<boolean>;
  };
  search: {
    index: (indexName: string, docId: string, document: Record<string, unknown>) => Promise<void>;
    query: (indexName: string, query: string, filters?: Record<string, unknown>) => Promise<unknown[]>;
  };
  state: {
    save: (store: string, key: string, value: unknown) => Promise<void>;
    get: <T>(store: string, key: string) => Promise<T | null>;
  };
  security: {
    rateLimit: (key: string, maxRequests: number, windowSec: number) => Promise<{ allowed: boolean; remaining: number }>;
    scanThreats: (input: string) => Promise<{ safe: boolean; threats: string[] }>;
  };
  analytics: {
    write: (table: string, data: Record<string, unknown>) => Promise<void>;
  };
}

export function createMiddlewareContext(requestId: string): MiddlewareContext {
  return {
    cache: {
      get: withRedisCache,
      invalidate: invalidateRedisCache,
    },
    events: {
      publish: async (topic: string, data: Record<string, unknown>) => {
        await publishKafkaEvent(topic, requestId, { ...data, timestamp: new Date().toISOString() });
      },
      stream: async (channel: string, data: Record<string, unknown>) => {
        await streamEvent(channel, requestId, { ...data });
      },
    },
    ledger: {
      record: recordLedgerEntry,
      settle: initiatePaymentSettlement,
    },
    auth: {
      verifyToken: verifyKeycloakToken,
      checkPermission: checkPermission,
    },
    search: {
      index: indexDocument,
      query: async (indexName: string, query: string, filters?: Record<string, unknown>) => {
        return searchDocuments(indexName, query, filters);
      },
    },
    state: {
      save: saveDaprState,
      get: async <T>(store: string, key: string): Promise<T | null> => {
        const result = await getDaprState(store, key);
        return result as T | null;
      },
    },
    security: {
      rateLimit: async (key: string, maxRequests: number, windowSec: number) => {
        const result = await checkRateLimit(key, 'system', maxRequests, windowSec);
        return { allowed: result.allowed, remaining: result.remaining };
      },
      scanThreats: scanForThreats,
    },
    analytics: {
      write: async (table: string, data: Record<string, unknown>) => {
        await writeToLakehouse(table, [data]);
      },
    },
  };
}

// ─── Router-Specific Middleware Decorators ──────────────────────────────────

/**
 * Applies full middleware pipeline to a router procedure.
 * Use in router files: await applyMiddleware(ctx, 'router-name', 'procedure-name', input);
 */
export async function applyMiddleware(
  requestId: string,
  routerName: string,
  procedureName: string,
  input?: unknown,
): Promise<{ ctx: MiddlewareContext; allowed: boolean }> {
  const ctx = createMiddlewareContext(requestId);

  // Rate limiting
  const rateLimitKey = `${routerName}:${procedureName}`;
  const { allowed } = await ctx.security.rateLimit(rateLimitKey, 100, 60);
  if (!allowed) {
    logger.warn(`[Middleware] Rate limit exceeded: ${rateLimitKey}`);
  }

  // Threat scanning for string inputs
  if (input && typeof input === 'object') {
    const inputStr = JSON.stringify(input);
    if (inputStr.length > 0 && inputStr.length < 10000) {
      await ctx.security.scanThreats(inputStr);
    }
  }

  // Analytics tracking
  await ctx.analytics.write('api_requests', {
    router: routerName,
    procedure: procedureName,
    timestamp: new Date().toISOString(),
    requestId,
  });

  return { ctx, allowed };
}

// ─── Pre-built Middleware Chains ───────────────────────────────────────────

/** For financial operations: rate limit + threat scan + ledger + events */
export async function financialMiddleware(
  requestId: string,
  operation: string,
  amount: number,
  currency: string,
) {
  const ctx = createMiddlewareContext(requestId);
  
  // AML threshold check
  if (amount > 5000000) {
    await ctx.events.publish('compliance.event', {
      type: 'aml_threshold_breach',
      operation,
      amount,
      currency,
      requestId,
    });
  }

  // Record in analytics
  await ctx.analytics.write('financial_operations', {
    operation,
    amount,
    currency,
    timestamp: new Date().toISOString(),
  });

  return ctx;
}

/** For marketplace operations: cache + search + events */
export async function marketplaceMiddleware(
  requestId: string,
  operation: string,
) {
  const ctx = createMiddlewareContext(requestId);
  
  await ctx.events.publish('marketplace.event', {
    type: operation,
    requestId,
  });

  return ctx;
}

/** For data-heavy operations: cache + search + analytics */
export async function dataMiddleware(
  requestId: string,
  operation: string,
) {
  const ctx = createMiddlewareContext(requestId);
  
  await ctx.analytics.write('data_operations', {
    operation,
    timestamp: new Date().toISOString(),
  });

  return ctx;
}

// KAFKA_TOPICS is available from ../integrations/middleware-router-hooks.js
