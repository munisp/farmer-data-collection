/**
 * GPS Monitoring and Metrics Service
 * 
 * Production-ready monitoring for GPS ingestion:
 * - Track ingestion success/failure rates
 * - Monitor PostGIS availability
 * - Track duplicate detection
 * - Alert on anomalies (high rejection rates, PostGIS failures)
 * - Structured logging for observability
 */

import { getDb } from '../db.js';
import { sql } from 'drizzle-orm';
import { logger } from '../logger.js';

// Metrics storage (in production, would use Prometheus/StatsD)
interface GPSMetrics {
  tracksReceived: number;
  tracksAccepted: number;
  tracksRejected: number;
  tracksDuplicate: number;
  accuracyRejections: number;
  speedRejections: number;
  rateLimitRejections: number;
  postgisQueries: number;
  postgisFailures: number;
  geofenceHits: number;
  geofenceMisses: number;
  lastResetTime: number;
}

interface AlertConfig {
  rejectionRateThreshold: number; // Alert if rejection rate exceeds this (0-1)
  postgisFailureThreshold: number; // Alert after this many consecutive failures
  duplicateRateThreshold: number; // Alert if duplicate rate exceeds this (0-1)
}

const DEFAULT_ALERT_CONFIG: AlertConfig = {
  rejectionRateThreshold: 0.3, // 30% rejection rate
  postgisFailureThreshold: 5, // 5 consecutive failures
  duplicateRateThreshold: 0.1, // 10% duplicate rate
};

class GPSMonitoringService {
  private metrics: GPSMetrics = {
    tracksReceived: 0,
    tracksAccepted: 0,
    tracksRejected: 0,
    tracksDuplicate: 0,
    accuracyRejections: 0,
    speedRejections: 0,
    rateLimitRejections: 0,
    postgisQueries: 0,
    postgisFailures: 0,
    geofenceHits: 0,
    geofenceMisses: 0,
    lastResetTime: Date.now(),
  };

  private alertConfig: AlertConfig = DEFAULT_ALERT_CONFIG;
  private consecutivePostgisFailures: number = 0;
  private postgisAvailable: boolean | null = null;
  private alertCallbacks: ((alert: GPSAlert) => void)[] = [];

  /**
   * Record a track received
   */
  recordTrackReceived(): void {
    this.metrics.tracksReceived++;
    this.logMetric('track_received', { total: this.metrics.tracksReceived });
  }

  /**
   * Record a track accepted
   */
  recordTrackAccepted(farmId?: number): void {
    this.metrics.tracksAccepted++;
    if (farmId) {
      this.metrics.geofenceHits++;
    } else {
      this.metrics.geofenceMisses++;
    }
    this.logMetric('track_accepted', { 
      total: this.metrics.tracksAccepted,
      geofenceHit: !!farmId,
    });
  }

  /**
   * Record a track rejected
   */
  recordTrackRejected(reason: 'accuracy' | 'speed' | 'rate_limit' | 'duplicate' | 'other'): void {
    this.metrics.tracksRejected++;
    
    switch (reason) {
      case 'accuracy':
        this.metrics.accuracyRejections++;
        break;
      case 'speed':
        this.metrics.speedRejections++;
        break;
      case 'rate_limit':
        this.metrics.rateLimitRejections++;
        break;
      case 'duplicate':
        this.metrics.tracksDuplicate++;
        break;
    }

    this.logMetric('track_rejected', { 
      reason,
      total: this.metrics.tracksRejected,
    });

    // Check for high rejection rate alert
    this.checkRejectionRateAlert();
    this.checkDuplicateRateAlert();
  }

  /**
   * Record PostGIS query result
   */
  recordPostgisQuery(success: boolean): void {
    this.metrics.postgisQueries++;
    
    if (!success) {
      this.metrics.postgisFailures++;
      this.consecutivePostgisFailures++;
      this.checkPostgisAlert();
    } else {
      this.consecutivePostgisFailures = 0;
    }

    this.logMetric('postgis_query', { 
      success,
      totalQueries: this.metrics.postgisQueries,
      totalFailures: this.metrics.postgisFailures,
    });
  }

  /**
   * Check PostGIS extension availability
   */
  async checkPostgisAvailability(): Promise<{ available: boolean; version?: string; error?: string }> {
    try {
      const db = await getDb();
      if (!db) {
        return { available: false, error: 'Database not available' };
      }

      // Check if PostGIS extension is installed
      const result = await db.execute(sql`
        SELECT PostGIS_Version() as version
      `);

      if (result.rows.length > 0) {
        const version = (result.rows[0] as any).version;
        this.postgisAvailable = true;
        this.logMetric('postgis_check', { available: true, version });
        return { available: true, version };
      }

      this.postgisAvailable = false;
      return { available: false, error: 'PostGIS extension not found' };
    } catch (error) {
      this.postgisAvailable = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logMetric('postgis_check', { available: false, error: errorMessage });
      return { available: false, error: errorMessage };
    }
  }

  /**
   * Ensure PostGIS extension is enabled
   */
  async ensurePostgisEnabled(): Promise<{ success: boolean; message: string }> {
    try {
      const db = await getDb();
      if (!db) {
        return { success: false, message: 'Database not available' };
      }

      // Try to create PostGIS extension if not exists
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);
      
      // Verify it's working
      const check = await this.checkPostgisAvailability();
      
      if (check.available) {
        logger.info(`[GPS Monitoring] PostGIS enabled successfully: ${check.version}`);
        return { success: true, message: `PostGIS ${check.version} enabled` };
      }

      return { success: false, message: check.error || 'Failed to enable PostGIS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[GPS Monitoring] Failed to enable PostGIS:', errorMessage);
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): GPSMetrics & { 
    rejectionRate: number; 
    duplicateRate: number;
    postgisSuccessRate: number;
    geofenceHitRate: number;
    uptimeMs: number;
  } {
    const total = this.metrics.tracksReceived || 1;
    const postgisTotal = this.metrics.postgisQueries || 1;
    const geofenceTotal = this.metrics.geofenceHits + this.metrics.geofenceMisses || 1;

    return {
      ...this.metrics,
      rejectionRate: this.metrics.tracksRejected / total,
      duplicateRate: this.metrics.tracksDuplicate / total,
      postgisSuccessRate: (this.metrics.postgisQueries - this.metrics.postgisFailures) / postgisTotal,
      geofenceHitRate: this.metrics.geofenceHits / geofenceTotal,
      uptimeMs: Date.now() - this.metrics.lastResetTime,
    };
  }

  /**
   * Reset metrics (typically called periodically)
   */
  resetMetrics(): void {
    const oldMetrics = { ...this.metrics };
    this.metrics = {
      tracksReceived: 0,
      tracksAccepted: 0,
      tracksRejected: 0,
      tracksDuplicate: 0,
      accuracyRejections: 0,
      speedRejections: 0,
      rateLimitRejections: 0,
      postgisQueries: 0,
      postgisFailures: 0,
      geofenceHits: 0,
      geofenceMisses: 0,
      lastResetTime: Date.now(),
    };
    
    this.logMetric('metrics_reset', { previousMetrics: oldMetrics });
  }

  /**
   * Register alert callback
   */
  onAlert(callback: (alert: GPSAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Configure alert thresholds
   */
  setAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
  }

  /**
   * Check for high rejection rate and trigger alert
   */
  private checkRejectionRateAlert(): void {
    if (this.metrics.tracksReceived < 10) return; // Need minimum sample size

    const rejectionRate = this.metrics.tracksRejected / this.metrics.tracksReceived;
    
    if (rejectionRate > this.alertConfig.rejectionRateThreshold) {
      this.triggerAlert({
        type: 'high_rejection_rate',
        severity: 'warning',
        message: `GPS track rejection rate is ${(rejectionRate * 100).toFixed(1)}% (threshold: ${(this.alertConfig.rejectionRateThreshold * 100).toFixed(1)}%)`,
        data: {
          rejectionRate,
          threshold: this.alertConfig.rejectionRateThreshold,
          accuracyRejections: this.metrics.accuracyRejections,
          speedRejections: this.metrics.speedRejections,
          rateLimitRejections: this.metrics.rateLimitRejections,
        },
      });
    }
  }

  /**
   * Check for high duplicate rate and trigger alert
   */
  private checkDuplicateRateAlert(): void {
    if (this.metrics.tracksReceived < 10) return;

    const duplicateRate = this.metrics.tracksDuplicate / this.metrics.tracksReceived;
    
    if (duplicateRate > this.alertConfig.duplicateRateThreshold) {
      this.triggerAlert({
        type: 'high_duplicate_rate',
        severity: 'warning',
        message: `GPS track duplicate rate is ${(duplicateRate * 100).toFixed(1)}% (threshold: ${(this.alertConfig.duplicateRateThreshold * 100).toFixed(1)}%)`,
        data: {
          duplicateRate,
          threshold: this.alertConfig.duplicateRateThreshold,
          totalDuplicates: this.metrics.tracksDuplicate,
        },
      });
    }
  }

  /**
   * Check for PostGIS failures and trigger alert
   */
  private checkPostgisAlert(): void {
    if (this.consecutivePostgisFailures >= this.alertConfig.postgisFailureThreshold) {
      this.triggerAlert({
        type: 'postgis_failure',
        severity: 'error',
        message: `PostGIS has failed ${this.consecutivePostgisFailures} consecutive times`,
        data: {
          consecutiveFailures: this.consecutivePostgisFailures,
          threshold: this.alertConfig.postgisFailureThreshold,
          totalFailures: this.metrics.postgisFailures,
        },
      });
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(alert: GPSAlert): void {
    logger.warn(`[GPS Alert] ${alert.severity.toUpperCase()}: ${alert.message}`, alert.data);
    
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        logger.error('[GPS Monitoring] Alert callback error:', error);
      }
    }
  }

  /**
   * Structured logging for metrics
   */
  private logMetric(event: string, data: Record<string, unknown>): void {
    logger.info(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'gps-monitoring',
      event,
      ...data,
    }));
  }

  /**
   * Get health status
   */
  async getHealthStatus(): Promise<GPSHealthStatus> {
    const metrics = this.getMetrics();
    const postgis = await this.checkPostgisAvailability();

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const issues: string[] = [];

    if (!postgis.available) {
      status = 'degraded';
      issues.push('PostGIS not available - using fallback geofencing');
    }

    if (metrics.rejectionRate > this.alertConfig.rejectionRateThreshold) {
      status = 'degraded';
      issues.push(`High rejection rate: ${(metrics.rejectionRate * 100).toFixed(1)}%`);
    }

    if (metrics.duplicateRate > this.alertConfig.duplicateRateThreshold) {
      status = 'degraded';
      issues.push(`High duplicate rate: ${(metrics.duplicateRate * 100).toFixed(1)}%`);
    }

    if (this.consecutivePostgisFailures >= this.alertConfig.postgisFailureThreshold) {
      status = 'unhealthy';
      issues.push(`PostGIS failing: ${this.consecutivePostgisFailures} consecutive failures`);
    }

    return {
      status,
      issues,
      metrics,
      postgis: {
        available: postgis.available,
        version: postgis.version,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

// Types
export interface GPSAlert {
  type: 'high_rejection_rate' | 'high_duplicate_rate' | 'postgis_failure';
  severity: 'warning' | 'error';
  message: string;
  data: Record<string, unknown>;
}

export interface GPSHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  issues: string[];
  metrics: ReturnType<GPSMonitoringService['getMetrics']>;
  postgis: {
    available: boolean;
    version?: string;
  };
  timestamp: string;
}

// Singleton instance
export const gpsMetrics = new GPSMonitoringService();

// Initialize PostGIS check on startup
gpsMetrics.checkPostgisAvailability().then((result) => {
  if (!result.available) {
    logger.warn('[GPS Monitoring] PostGIS not available:', result.error);
    logger.warn('[GPS Monitoring] Geofencing will use fallback JSON boundaries');
  } else {
    logger.info(`[GPS Monitoring] PostGIS available: ${result.version}`);
  }
}).catch((error) => {
  logger.error('[GPS Monitoring] Failed to check PostGIS:', error);
});

// Periodic metrics reset (every hour)
setInterval(() => {
  const metrics = gpsMetrics.getMetrics();
  logger.info('[GPS Monitoring] Hourly metrics summary:', JSON.stringify(metrics));
  gpsMetrics.resetMetrics();
}, 60 * 60 * 1000);

export default gpsMetrics;
