/**
 * SLA Metrics Tracking Module
 * 
 * Tracks Service Level Indicators (SLIs) and Service Level Objectives (SLOs):
 * - 99.9% uptime SLA
 * - MTTR (Mean Time To Recovery)
 * - Error budgets
 * - Customer-facing SLIs (latency, availability, throughput)
 * 
 * Metrics are exported to Prometheus for Grafana visualization
 */

import { metrics } from '@opentelemetry/api';

// Get meter for SLA metrics
const meter = metrics.getMeter('farmer-platform-sla');

// ============================================================================
// UPTIME & AVAILABILITY METRICS
// ============================================================================

export const uptimeCounter = meter.createCounter('sla.uptime_seconds_total', {
  description: 'Total uptime in seconds',
});

export const downtimeCounter = meter.createCounter('sla.downtime_seconds_total', {
  description: 'Total downtime in seconds',
});

export const availabilityGauge = meter.createObservableGauge('sla.availability_percent', {
  description: 'Current availability percentage',
});

/**
 * Track uptime/downtime
 */
export function trackUptime(uptimeSeconds: number) {
  uptimeCounter.add(uptimeSeconds);
}

export function trackDowntime(downtimeSeconds: number, reason: string) {
  downtimeCounter.add(downtimeSeconds, {
    reason,
  });
}

// ============================================================================
// INCIDENT METRICS
// ============================================================================

export const incidentCounter = meter.createCounter('incident_total', {
  description: 'Total number of incidents',
});

export const incidentRecoveryTime = meter.createHistogram('incident_recovery_time_seconds', {
  description: 'Time to recover from incidents in seconds',
  unit: 's',
});

export const mttrGauge = meter.createObservableGauge('sla.mttr_minutes', {
  description: 'Mean Time To Recovery in minutes',
});

/**
 * Track an incident
 */
export function trackIncident(params: {
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  recoveryTimeSeconds: number;
  affectedUsers: number;
  rootCause: string;
}) {
  incidentCounter.add(1, {
    severity: params.severity,
    root_cause: params.rootCause,
  });
  
  incidentRecoveryTime.record(params.recoveryTimeSeconds, {
    severity: params.severity,
  });
}

// ============================================================================
// ERROR BUDGET METRICS
// ============================================================================

export const errorBudgetGauge = meter.createObservableGauge('sla.error_budget_percent', {
  description: 'Remaining error budget percentage',
});

export const errorBudgetBurnRate = meter.createObservableGauge('sla.error_budget_burn_rate', {
  description: 'Rate at which error budget is being consumed',
});

/**
 * Calculate error budget
 * 
 * For 99.9% SLA:
 * - Allowed downtime per month: 43.2 minutes
 * - Allowed error rate: 0.1%
 */
export function calculateErrorBudget(params: {
  totalRequests: number;
  failedRequests: number;
  periodDays: number;
}): {
  budgetRemaining: number;
  budgetUsed: number;
  burnRate: number;
} {
  const sloTarget = 0.999; // 99.9%
  const actualAvailability = (params.totalRequests - params.failedRequests) / params.totalRequests;
  
  // Calculate budget
  const allowedFailureRate = 1 - sloTarget;
  const actualFailureRate = params.failedRequests / params.totalRequests;
  const budgetUsed = actualFailureRate / allowedFailureRate;
  const budgetRemaining = Math.max(0, 1 - budgetUsed);
  
  // Calculate burn rate (how fast we're consuming budget)
  const daysInMonth = 30;
  const burnRate = (budgetUsed / params.periodDays) * daysInMonth;
  
  return {
    budgetRemaining: budgetRemaining * 100,
    budgetUsed: budgetUsed * 100,
    burnRate,
  };
}

// ============================================================================
// SLI METRICS (Service Level Indicators)
// ============================================================================

export const latencySLI = meter.createHistogram('sla.latency_sli_ms', {
  description: 'API latency SLI in milliseconds',
  unit: 'ms',
});

export const availabilitySLI = meter.createCounter('sla.availability_sli_total', {
  description: 'Availability SLI counter',
});

export const throughputSLI = meter.createCounter('sla.throughput_sli_total', {
  description: 'Request throughput SLI',
});

export const errorRateSLI = meter.createCounter('sla.error_rate_sli_total', {
  description: 'Error rate SLI counter',
});

/**
 * Track SLI metrics
 */
export function trackLatencySLI(latencyMs: number, endpoint: string) {
  latencySLI.record(latencyMs, {
    endpoint,
    slo_met: latencyMs < 500 ? 'true' : 'false',
  });
}

export function trackAvailabilitySLI(available: boolean, service: string) {
  availabilitySLI.add(1, {
    service,
    available: available.toString(),
  });
}

export function trackThroughputSLI(requestCount: number, endpoint: string) {
  throughputSLI.add(requestCount, {
    endpoint,
  });
}

export function trackErrorRateSLI(errorCount: number, totalCount: number, endpoint: string) {
  const errorRate = errorCount / totalCount;
  errorRateSLI.add(errorCount, {
    endpoint,
    slo_met: errorRate < 0.001 ? 'true' : 'false', // 0.1% error rate
  });
}

// ============================================================================
// SLA BREACH TRACKING
// ============================================================================

export const slaBreachCounter = meter.createCounter('sla_breach_total', {
  description: 'Total number of SLA breaches',
});

export const slaBreachDuration = meter.createHistogram('sla_breach_duration_seconds', {
  description: 'Duration of SLA breaches in seconds',
  unit: 's',
});

/**
 * Track SLA breach
 */
export function trackSLABreach(params: {
  sli: 'latency' | 'availability' | 'throughput' | 'error_rate';
  severity: 'warning' | 'critical';
  durationSeconds: number;
  affectedUsers: number;
}) {
  slaBreachCounter.add(1, {
    sli: params.sli,
    severity: params.severity,
  });
  
  slaBreachDuration.record(params.durationSeconds, {
    sli: params.sli,
    severity: params.severity,
  });
}

// ============================================================================
// DORA METRICS (DevOps Research and Assessment)
// ============================================================================

export const deploymentCounter = meter.createCounter('deployment_total', {
  description: 'Total number of deployments',
});

export const deploymentFailedCounter = meter.createCounter('deployment_failed_total', {
  description: 'Total number of failed deployments',
});

export const deploymentLeadTime = meter.createHistogram('deployment_lead_time_hours', {
  description: 'Lead time for changes in hours',
  unit: 'h',
});

export const changeFailureRate = meter.createObservableGauge('sla.change_failure_rate_percent', {
  description: 'Percentage of deployments causing failures',
});

/**
 * Track deployment
 */
export function trackDeployment(params: {
  success: boolean;
  leadTimeHours: number;
  environment: 'staging' | 'production';
  version: string;
}) {
  deploymentCounter.add(1, {
    environment: params.environment,
    version: params.version,
  });
  
  if (!params.success) {
    deploymentFailedCounter.add(1, {
      environment: params.environment,
    });
  }
  
  deploymentLeadTime.record(params.leadTimeHours, {
    environment: params.environment,
  });
}

// ============================================================================
// ALERTING HELPERS
// ============================================================================

/**
 * Check if SLA is being breached
 */
export function checkSLABreach(params: {
  currentAvailability: number;
  targetAvailability: number;
  errorBudgetRemaining: number;
}): {
  breached: boolean;
  severity: 'warning' | 'critical';
  message: string;
} {
  const availabilityGap = params.targetAvailability - params.currentAvailability;
  
  // Critical breach: availability below target or error budget exhausted
  if (params.currentAvailability < params.targetAvailability || params.errorBudgetRemaining <= 0) {
    return {
      breached: true,
      severity: 'critical',
      message: `SLA breach: Availability ${params.currentAvailability.toFixed(3)}% (target: ${params.targetAvailability}%)`,
    };
  }
  
  // Warning: error budget below 25%
  if (params.errorBudgetRemaining < 25) {
    return {
      breached: true,
      severity: 'warning',
      message: `SLA warning: Error budget at ${params.errorBudgetRemaining.toFixed(1)}%`,
    };
  }
  
  return {
    breached: false,
    severity: 'warning',
    message: 'SLA within acceptable range',
  };
}

/**
 * Get SLA summary
 */
export async function getSLASummary() {
  // This would typically query Prometheus for actual metrics
  // For now, return structure
  return {
    uptime: {
      current: 99.95,
      target: 99.9,
      status: 'healthy',
    },
    mttr: {
      current: 12.5, // minutes
      target: 15,
      status: 'healthy',
    },
    errorBudget: {
      remaining: 67.3, // percent
      burnRate: 1.2,
      status: 'healthy',
    },
    incidents: {
      p0: 0,
      p1: 2,
      p2: 5,
      p3: 12,
    },
  };
}
