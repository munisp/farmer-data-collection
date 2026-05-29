import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// Create a Registry
export const register = new Registry();

// Add default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// HTTP Request metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Database query metrics
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

export const dbQueryTotal = new Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'status'],
  registers: [register],
});

// Cache metrics
export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['key_prefix'],
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['key_prefix'],
  registers: [register],
});

export const cacheOperationDuration = new Histogram({
  name: 'cache_operation_duration_seconds',
  help: 'Duration of cache operations in seconds',
  labelNames: ['operation'],
  buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05],
  registers: [register],
});

export const cacheInvalidations = new Counter({
  name: 'cache_invalidations_total',
  help: 'Total number of cache invalidations',
  labelNames: ['entity_type', 'trigger'],
  registers: [register],
});

export const cacheL1Size = new Gauge({
  name: 'cache_l1_size',
  help: 'Current number of entries in L1 in-memory cache',
  registers: [register],
});

export const cacheL1MemoryBytes = new Gauge({
  name: 'cache_l1_memory_bytes',
  help: 'Approximate memory used by L1 cache in bytes',
  registers: [register],
});

// Active connections
export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  labelNames: ['type'],
  registers: [register],
});

// tRPC procedure metrics
export const trpcProcedureDuration = new Histogram({
  name: 'trpc_procedure_duration_seconds',
  help: 'Duration of tRPC procedures in seconds',
  labelNames: ['procedure', 'type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const trpcProcedureTotal = new Counter({
  name: 'trpc_procedures_total',
  help: 'Total number of tRPC procedure calls',
  labelNames: ['procedure', 'type', 'status'],
  registers: [register],
});

// User activity metrics
export const userLogins = new Counter({
  name: 'user_logins_total',
  help: 'Total number of user logins',
  labelNames: ['status'],
  registers: [register],
});

export const userRegistrations = new Counter({
  name: 'user_registrations_total',
  help: 'Total number of user registrations',
  labelNames: ['status'],
  registers: [register],
});

// Business metrics
export const farmersCreated = new Counter({
  name: 'farmers_created_total',
  help: 'Total number of farmers created',
  registers: [register],
});

export const harvestsRecorded = new Counter({
  name: 'harvests_recorded_total',
  help: 'Total number of harvests recorded',
  registers: [register],
});

export const expensesRecorded = new Counter({
  name: 'expenses_recorded_total',
  help: 'Total number of expenses recorded',
  registers: [register],
});

/**
 * Middleware to track HTTP request metrics
 */
export function metricsMiddleware() {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    const start = Date.now();
    
    // Track active connections
    activeConnections.inc({ type: 'http' });
    
    // When response finishes
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path || 'unknown';
      const method = req.method;
      const statusCode = res.statusCode;
      
      // Record metrics
      httpRequestDuration.observe(
        { method, route, status_code: statusCode },
        duration
      );
      
      httpRequestTotal.inc({
        method,
        route,
        status_code: statusCode,
      });
      
      // Decrement active connections
      activeConnections.dec({ type: 'http' });
    });
    
    next();
  };
}

/**
 * Helper to measure async function duration
 */
export async function measureDuration<T>(
  histogram: Histogram,
  labels: Record<string, string | number>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = (Date.now() - start) / 1000;
    histogram.observe(labels, duration);
    return result;
  } catch (error) {
    const duration = (Date.now() - start) / 1000;
    histogram.observe(labels, duration);
    throw error;
  }
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return await register.metrics();
}
