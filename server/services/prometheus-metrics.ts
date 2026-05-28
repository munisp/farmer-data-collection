/**
 * Prometheus Metrics Exporter
 * 
 * Comprehensive metrics collection for production monitoring:
 * - HTTP request metrics (duration, count, errors)
 * - Database query metrics (duration, count, errors)
 * - Business metrics (users, loans, transactions)
 * - System metrics (memory, CPU, event loop lag)
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { logger } from '../logger.js';

// Create a Registry to register the metrics
export const register = new Registry();

// Add default metrics (CPU, memory, event loop lag, etc.)
collectDefaultMetrics({ register });

// HTTP Metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestErrors = new Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP request errors',
  labelNames: ['method', 'route', 'error_type'],
  registers: [register],
});

// Database Metrics
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const dbQueryTotal = new Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table'],
  registers: [register],
});

export const dbQueryErrors = new Counter({
  name: 'db_query_errors_total',
  help: 'Total number of database query errors',
  labelNames: ['operation', 'table', 'error_type'],
  registers: [register],
});

export const dbConnectionPoolSize = new Gauge({
  name: 'db_connection_pool_size',
  help: 'Current size of database connection pool',
  registers: [register],
});

export const dbConnectionPoolUsed = new Gauge({
  name: 'db_connection_pool_used',
  help: 'Number of used connections in database pool',
  registers: [register],
});

// Business Metrics
export const totalUsers = new Gauge({
  name: 'total_users',
  help: 'Total number of registered users',
  registers: [register],
});

export const activeUsers = new Gauge({
  name: 'active_users',
  help: 'Number of active users (logged in last 24 hours)',
  registers: [register],
});

export const totalLoans = new Gauge({
  name: 'total_loans',
  help: 'Total number of loans',
  labelNames: ['status'],
  registers: [register],
});

export const totalLoanAmount = new Gauge({
  name: 'total_loan_amount',
  help: 'Total loan amount in currency',
  labelNames: ['status'],
  registers: [register],
});

export const totalTransactions = new Counter({
  name: 'total_transactions',
  help: 'Total number of transactions',
  labelNames: ['type'],
  registers: [register],
});

export const totalRevenue = new Gauge({
  name: 'total_revenue',
  help: 'Total revenue in currency',
  registers: [register],
});

// SMS Metrics
export const smsMessagesSent = new Counter({
  name: 'sms_messages_sent_total',
  help: 'Total number of SMS messages sent',
  labelNames: ['type', 'status'],
  registers: [register],
});

export const smsMessageCost = new Counter({
  name: 'sms_message_cost_total',
  help: 'Total cost of SMS messages',
  labelNames: ['type'],
  registers: [register],
});

// Sync Metrics
export const syncOperations = new Counter({
  name: 'sync_operations_total',
  help: 'Total number of sync operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

export const syncDuration = new Histogram({
  name: 'sync_duration_seconds',
  help: 'Duration of sync operations in seconds',
  labelNames: ['operation'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
  registers: [register],
});

export const syncConflicts = new Counter({
  name: 'sync_conflicts_total',
  help: 'Total number of sync conflicts',
  labelNames: ['entity_type', 'resolution'],
  registers: [register],
});

// Auth Metrics
export const authAttempts = new Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['method', 'status'],
  registers: [register],
});

export const authFailures = new Counter({
  name: 'auth_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['method', 'reason'],
  registers: [register],
});

// Health Check Metrics
export const healthCheckStatus = new Gauge({
  name: 'health_check_status',
  help: 'Health check status (1 = healthy, 0 = unhealthy)',
  labelNames: ['component'],
  registers: [register],
});

export const healthCheckDuration = new Histogram({
  name: 'health_check_duration_seconds',
  help: 'Duration of health checks in seconds',
  labelNames: ['component'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// System Metrics
export const eventLoopLag = new Gauge({
  name: 'nodejs_eventloop_lag_seconds',
  help: 'Event loop lag in seconds',
  registers: [register],
});

// Notification Queue Metrics
export const notificationQueueSize = new Gauge({
  name: 'notification_queue_size',
  help: 'Current size of notification queue by status',
  labelNames: ['status', 'channel'],
  registers: [register],
});

export const notificationQueueLag = new Gauge({
  name: 'notification_queue_lag_seconds',
  help: 'Age of oldest pending notification in queue (seconds)',
  labelNames: ['channel'],
  registers: [register],
});

export const notificationSendTotal = new Counter({
  name: 'notification_send_total',
  help: 'Total notifications sent by channel and status',
  labelNames: ['channel', 'status'],
  registers: [register],
});

export const notificationSendFailures = new Counter({
  name: 'notification_send_failures_total',
  help: 'Total notification send failures by channel and error type',
  labelNames: ['channel', 'error_type'],
  registers: [register],
});

// Webhook Metrics
export const webhookRequestsTotal = new Counter({
  name: 'webhook_requests_total',
  help: 'Total webhook requests received',
  labelNames: ['source', 'type', 'status'],
  registers: [register],
});

export const webhookErrors = new Counter({
  name: 'webhook_errors_total',
  help: 'Total webhook processing errors',
  labelNames: ['source', 'type', 'error_type'],
  registers: [register],
});

export const webhookDuplicates = new Counter({
  name: 'webhook_duplicates_total',
  help: 'Total duplicate webhook events detected (idempotency)',
  labelNames: ['source', 'type'],
  registers: [register],
});

export const webhookProcessingDuration = new Histogram({
  name: 'webhook_processing_duration_seconds',
  help: 'Duration of webhook processing in seconds',
  labelNames: ['source', 'type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

// ERPNext Sync Metrics
export const erpnextSyncTotal = new Counter({
  name: 'erpnext_sync_total',
  help: 'Total ERPNext sync operations',
  labelNames: ['direction', 'entity_type', 'status'],
  registers: [register],
});

export const erpnextSyncErrors = new Counter({
  name: 'erpnext_sync_errors_total',
  help: 'Total ERPNext sync errors',
  labelNames: ['direction', 'entity_type', 'error_type'],
  registers: [register],
});

export const erpnextSyncDuration = new Histogram({
  name: 'erpnext_sync_duration_seconds',
  help: 'Duration of ERPNext sync operations in seconds',
  labelNames: ['direction', 'entity_type'],
  buckets: [0.1, 0.5, 1, 5, 10, 30],
  registers: [register],
});

export const erpnextSyncQueueSize = new Gauge({
  name: 'erpnext_sync_queue_size',
  help: 'Number of pending ERPNext sync operations',
  labelNames: ['direction', 'entity_type'],
  registers: [register],
});

// Circuit Breaker Metrics
export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['service'],
  registers: [register],
});

export const circuitBreakerTrips = new Counter({
  name: 'circuit_breaker_trips_total',
  help: 'Total circuit breaker trips',
  labelNames: ['service'],
  registers: [register],
});

// Helper function to update business metrics
export async function updateBusinessMetrics(db: any) {
  try {
    // Update user metrics
    const userCount = await db.select({ count: db.fn.count() }).from('users');
    totalUsers.set(userCount[0]?.count || 0);

    // Update active users (last 24 hours)
    const activeUserCount = await db
      .select({ count: db.fn.count() })
      .from('users')
      .where(db.sql`last_signed_in > NOW() - INTERVAL '24 hours'`);
    activeUsers.set(activeUserCount[0]?.count || 0);

    // Update loan metrics
    const loanStats = await db
      .select({
        status: 'status',
        count: db.fn.count(),
        total: db.fn.sum('principal_amount'),
      })
      .from('loans')
      .groupBy('status');

    for (const stat of loanStats) {
      totalLoans.set({ status: stat.status }, stat.count);
      totalLoanAmount.set({ status: stat.status }, stat.total || 0);
    }
  } catch (error) {
    logger.error('[Metrics] Error updating business metrics:', error);
  }
}

// Middleware to track HTTP requests
export function metricsMiddleware(req: any, res: any, next: any) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const statusCode = res.statusCode;

    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    httpRequestTotal.inc({ method, route, status_code: statusCode });

    if (statusCode >= 400) {
      const errorType = statusCode >= 500 ? 'server_error' : 'client_error';
      httpRequestErrors.inc({ method, route, error_type: errorType });
    }
  });

  next();
}

// Function to measure event loop lag
let lastCheck = Date.now();
setInterval(() => {
  const now = Date.now();
  const lag = (now - lastCheck - 1000) / 1000; // Expected 1000ms interval
  eventLoopLag.set(Math.max(0, lag));
  lastCheck = now;
}, 1000);
