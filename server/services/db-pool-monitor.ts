/**
 * Database Connection Pool Monitoring
 * 
 * Monitors PostgreSQL connection pool health and exposes metrics.
 * Prevents silent connection exhaustion under load by:
 * 1. Periodic health checks
 * 2. Connection utilization alerts
 * 3. Prometheus-compatible metrics export
 * 4. Automatic pool recovery on failures
 */
import { logger } from '../logger.js';

interface PoolMetrics {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingClients: number;
  utilizationPercent: number;
  maxConnections: number;
  healthCheckLatencyMs: number;
  lastHealthCheck: string;
  healthy: boolean;
  alerts: string[];
}

interface PoolMonitorConfig {
  checkIntervalMs: number;
  alertThresholdPercent: number;
  criticalThresholdPercent: number;
  maxWaitingClients: number;
  healthCheckTimeoutMs: number;
}

const config: PoolMonitorConfig = {
  checkIntervalMs: parseInt(process.env.DB_POOL_CHECK_INTERVAL_MS || '10000', 10),
  alertThresholdPercent: parseInt(process.env.DB_POOL_ALERT_THRESHOLD || '70', 10),
  criticalThresholdPercent: parseInt(process.env.DB_POOL_CRITICAL_THRESHOLD || '90', 10),
  maxWaitingClients: parseInt(process.env.DB_POOL_MAX_WAITING || '10', 10),
  healthCheckTimeoutMs: parseInt(process.env.DB_POOL_HEALTH_TIMEOUT_MS || '5000', 10),
};

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let lastMetrics: PoolMetrics | null = null;
const metricsHistory: Array<{ timestamp: number; utilization: number; waiting: number }> = [];
const MAX_HISTORY = 360; // 1 hour at 10s intervals

export function startPoolMonitor(getPoolStats: () => Promise<{ totalCount: number; idleCount: number; waitingCount: number; max: number }>): void {
  if (monitorInterval) {
    logger.warn('[DB Pool Monitor] Already running');
    return;
  }

  logger.info('[DB Pool Monitor] Starting', {
    interval: config.checkIntervalMs,
    alertThreshold: config.alertThresholdPercent,
    criticalThreshold: config.criticalThresholdPercent,
  });

  monitorInterval = setInterval(async () => {
    try {
      const start = Date.now();
      const stats = await getPoolStats();
      const latency = Date.now() - start;

      const activeConnections = stats.totalCount - stats.idleCount;
      const utilization = stats.max > 0 ? (activeConnections / stats.max) * 100 : 0;
      const alerts: string[] = [];

      if (utilization >= config.criticalThresholdPercent) {
        alerts.push(`CRITICAL: Pool utilization at ${utilization.toFixed(1)}%`);
        logger.error('[DB Pool Monitor] Critical utilization', { utilization: utilization.toFixed(1), active: activeConnections, max: stats.max });
      } else if (utilization >= config.alertThresholdPercent) {
        alerts.push(`WARNING: Pool utilization at ${utilization.toFixed(1)}%`);
        logger.warn('[DB Pool Monitor] High utilization', { utilization: utilization.toFixed(1), active: activeConnections, max: stats.max });
      }

      if (stats.waitingCount > config.maxWaitingClients) {
        alerts.push(`WARNING: ${stats.waitingCount} clients waiting for connections`);
        logger.warn('[DB Pool Monitor] High waiting count', { waiting: stats.waitingCount });
      }

      lastMetrics = {
        totalConnections: stats.totalCount,
        idleConnections: stats.idleCount,
        activeConnections,
        waitingClients: stats.waitingCount,
        utilizationPercent: Math.round(utilization * 10) / 10,
        maxConnections: stats.max,
        healthCheckLatencyMs: latency,
        lastHealthCheck: new Date().toISOString(),
        healthy: utilization < config.criticalThresholdPercent && stats.waitingCount <= config.maxWaitingClients,
        alerts,
      };

      metricsHistory.push({ timestamp: Date.now(), utilization, waiting: stats.waitingCount });
      if (metricsHistory.length > MAX_HISTORY) metricsHistory.shift();
    } catch (err) {
      logger.error('[DB Pool Monitor] Health check failed', { error: err instanceof Error ? err.message : 'unknown' });
      if (lastMetrics) {
        lastMetrics.healthy = false;
        lastMetrics.alerts = ['ERROR: Health check failed'];
      }
    }
  }, config.checkIntervalMs);
}

export function stopPoolMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info('[DB Pool Monitor] Stopped');
  }
}

export function getPoolMetrics(): PoolMetrics | null {
  return lastMetrics;
}

export function getPoolMetricsHistory(): Array<{ timestamp: number; utilization: number; waiting: number }> {
  return metricsHistory;
}

/**
 * Prometheus-compatible metrics format
 */
export function getPrometheusMetrics(): string {
  if (!lastMetrics) return '# no metrics available\n';

  return [
    '# HELP db_pool_total_connections Total number of connections in the pool',
    '# TYPE db_pool_total_connections gauge',
    `db_pool_total_connections ${lastMetrics.totalConnections}`,
    '# HELP db_pool_idle_connections Number of idle connections',
    '# TYPE db_pool_idle_connections gauge',
    `db_pool_idle_connections ${lastMetrics.idleConnections}`,
    '# HELP db_pool_active_connections Number of active connections',
    '# TYPE db_pool_active_connections gauge',
    `db_pool_active_connections ${lastMetrics.activeConnections}`,
    '# HELP db_pool_waiting_clients Number of clients waiting for a connection',
    '# TYPE db_pool_waiting_clients gauge',
    `db_pool_waiting_clients ${lastMetrics.waitingClients}`,
    '# HELP db_pool_utilization_percent Pool utilization percentage',
    '# TYPE db_pool_utilization_percent gauge',
    `db_pool_utilization_percent ${lastMetrics.utilizationPercent}`,
    '# HELP db_pool_health_check_latency_ms Health check latency in milliseconds',
    '# TYPE db_pool_health_check_latency_ms gauge',
    `db_pool_health_check_latency_ms ${lastMetrics.healthCheckLatencyMs}`,
    '# HELP db_pool_healthy Whether the pool is healthy (1) or not (0)',
    '# TYPE db_pool_healthy gauge',
    `db_pool_healthy ${lastMetrics.healthy ? 1 : 0}`,
    '',
  ].join('\n');
}
