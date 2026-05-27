/**
 * Messaging Metrics Service
 * 
 * Provides Prometheus metrics for USSD/SMS/WhatsApp channels:
 * - Message send/receive counters
 * - Provider health and failover metrics
 * - Session lifecycle metrics
 * - Latency histograms
 * - Error rate tracking
 * - Alert thresholds
 */

import { Registry, Counter, Gauge, Histogram, Summary } from "prom-client";

// Create a dedicated registry for messaging metrics
export const messagingRegistry = new Registry();

// ============================================================================
// SMS METRICS
// ============================================================================

export const smsMessagesSent = new Counter({
  name: "sms_messages_sent_total",
  help: "Total number of SMS messages sent",
  labelNames: ["provider", "status", "template"],
  registers: [messagingRegistry],
});

export const smsMessagesFailed = new Counter({
  name: "sms_messages_failed_total",
  help: "Total number of SMS messages that failed to send",
  labelNames: ["provider", "error_type"],
  registers: [messagingRegistry],
});

export const smsDeliveryLatency = new Histogram({
  name: "sms_delivery_latency_seconds",
  help: "SMS delivery latency in seconds",
  labelNames: ["provider"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [messagingRegistry],
});

export const smsProviderHealth = new Gauge({
  name: "sms_provider_health",
  help: "SMS provider health status (1 = healthy, 0 = unhealthy)",
  labelNames: ["provider"],
  registers: [messagingRegistry],
});

export const smsProviderFailures = new Counter({
  name: "sms_provider_failures_total",
  help: "Total number of SMS provider failures",
  labelNames: ["provider"],
  registers: [messagingRegistry],
});

export const smsFailoverEvents = new Counter({
  name: "sms_failover_events_total",
  help: "Total number of SMS provider failover events",
  labelNames: ["from_provider", "to_provider"],
  registers: [messagingRegistry],
});

export const smsQueueSize = new Gauge({
  name: "sms_queue_size",
  help: "Current SMS queue size",
  labelNames: ["status"],
  registers: [messagingRegistry],
});

// ============================================================================
// WHATSAPP METRICS
// ============================================================================

export const whatsappMessagesSent = new Counter({
  name: "whatsapp_messages_sent_total",
  help: "Total number of WhatsApp messages sent",
  labelNames: ["provider", "status", "message_type"],
  registers: [messagingRegistry],
});

export const whatsappMessagesFailed = new Counter({
  name: "whatsapp_messages_failed_total",
  help: "Total number of WhatsApp messages that failed to send",
  labelNames: ["provider", "error_type"],
  registers: [messagingRegistry],
});

export const whatsappDeliveryLatency = new Histogram({
  name: "whatsapp_delivery_latency_seconds",
  help: "WhatsApp delivery latency in seconds",
  labelNames: ["provider"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [messagingRegistry],
});

export const whatsappProviderHealth = new Gauge({
  name: "whatsapp_provider_health",
  help: "WhatsApp provider health status (1 = healthy, 0 = unhealthy)",
  labelNames: ["provider"],
  registers: [messagingRegistry],
});

export const whatsappProviderFailures = new Counter({
  name: "whatsapp_provider_failures_total",
  help: "Total number of WhatsApp provider failures",
  labelNames: ["provider"],
  registers: [messagingRegistry],
});

export const whatsappFailoverEvents = new Counter({
  name: "whatsapp_failover_events_total",
  help: "Total number of WhatsApp provider failover events",
  labelNames: ["from_provider", "to_provider"],
  registers: [messagingRegistry],
});

export const whatsappQueueSize = new Gauge({
  name: "whatsapp_queue_size",
  help: "Current WhatsApp queue size",
  labelNames: ["status"],
  registers: [messagingRegistry],
});

// ============================================================================
// USSD METRICS
// ============================================================================

export const ussdSessionsCreated = new Counter({
  name: "ussd_sessions_created_total",
  help: "Total number of USSD sessions created",
  registers: [messagingRegistry],
});

export const ussdSessionsCompleted = new Counter({
  name: "ussd_sessions_completed_total",
  help: "Total number of USSD sessions completed successfully",
  labelNames: ["action"],
  registers: [messagingRegistry],
});

export const ussdSessionsExpired = new Counter({
  name: "ussd_sessions_expired_total",
  help: "Total number of USSD sessions that expired",
  labelNames: ["last_step"],
  registers: [messagingRegistry],
});

export const ussdActiveSessions = new Gauge({
  name: "ussd_active_sessions",
  help: "Current number of active USSD sessions",
  registers: [messagingRegistry],
});

export const ussdSessionDuration = new Histogram({
  name: "ussd_session_duration_seconds",
  help: "USSD session duration in seconds",
  labelNames: ["completed"],
  buckets: [10, 30, 60, 120, 180, 300],
  registers: [messagingRegistry],
});

export const ussdStepDropoff = new Counter({
  name: "ussd_step_dropoff_total",
  help: "Number of users who dropped off at each step",
  labelNames: ["step"],
  registers: [messagingRegistry],
});

export const ussdStepCompletion = new Counter({
  name: "ussd_step_completion_total",
  help: "Number of users who completed each step",
  labelNames: ["step"],
  registers: [messagingRegistry],
});

export const ussdRequestLatency = new Histogram({
  name: "ussd_request_latency_seconds",
  help: "USSD request processing latency in seconds",
  labelNames: ["step"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [messagingRegistry],
});

export const ussdIdempotencyHits = new Counter({
  name: "ussd_idempotency_hits_total",
  help: "Number of duplicate USSD requests caught by idempotency",
  labelNames: ["action"],
  registers: [messagingRegistry],
});

export const ussdErrors = new Counter({
  name: "ussd_errors_total",
  help: "Total number of USSD errors",
  labelNames: ["error_type"],
  registers: [messagingRegistry],
});

// ============================================================================
// MESSAGE QUEUE METRICS
// ============================================================================

export const messageQueueSize = new Gauge({
  name: "message_queue_size",
  help: "Current message queue size",
  labelNames: ["channel", "status"],
  registers: [messagingRegistry],
});

export const messageQueueProcessingTime = new Histogram({
  name: "message_queue_processing_time_seconds",
  help: "Message queue processing time in seconds",
  labelNames: ["channel"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [messagingRegistry],
});

export const messageQueueRetries = new Counter({
  name: "message_queue_retries_total",
  help: "Total number of message retries",
  labelNames: ["channel", "attempt"],
  registers: [messagingRegistry],
});

export const messageQueueDeadLetter = new Counter({
  name: "message_queue_dead_letter_total",
  help: "Total number of messages moved to dead letter queue",
  labelNames: ["channel"],
  registers: [messagingRegistry],
});

// ============================================================================
// CIRCUIT BREAKER METRICS
// ============================================================================

export const circuitBreakerState = new Gauge({
  name: "circuit_breaker_state",
  help: "Circuit breaker state (0 = closed, 1 = half-open, 2 = open)",
  labelNames: ["provider", "channel"],
  registers: [messagingRegistry],
});

export const circuitBreakerTrips = new Counter({
  name: "circuit_breaker_trips_total",
  help: "Total number of circuit breaker trips",
  labelNames: ["provider", "channel"],
  registers: [messagingRegistry],
});

export const circuitBreakerRecoveries = new Counter({
  name: "circuit_breaker_recoveries_total",
  help: "Total number of circuit breaker recoveries",
  labelNames: ["provider", "channel"],
  registers: [messagingRegistry],
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Record SMS send attempt
 */
export function recordSmsSend(
  provider: string,
  success: boolean,
  template?: string,
  latencyMs?: number
): void {
  smsMessagesSent.inc({
    provider,
    status: success ? "success" : "failed",
    template: template || "none",
  });

  if (latencyMs !== undefined) {
    smsDeliveryLatency.observe({ provider }, latencyMs / 1000);
  }
}

/**
 * Record SMS failure
 */
export function recordSmsFailure(provider: string, errorType: string): void {
  smsMessagesFailed.inc({ provider, error_type: errorType });
  smsProviderFailures.inc({ provider });
}

/**
 * Record SMS failover
 */
export function recordSmsFailover(fromProvider: string, toProvider: string): void {
  smsFailoverEvents.inc({ from_provider: fromProvider, to_provider: toProvider });
}

/**
 * Update SMS provider health
 */
export function updateSmsProviderHealth(provider: string, isHealthy: boolean): void {
  smsProviderHealth.set({ provider }, isHealthy ? 1 : 0);
}

/**
 * Record WhatsApp send attempt
 */
export function recordWhatsappSend(
  provider: string,
  success: boolean,
  messageType: string,
  latencyMs?: number
): void {
  whatsappMessagesSent.inc({
    provider,
    status: success ? "success" : "failed",
    message_type: messageType,
  });

  if (latencyMs !== undefined) {
    whatsappDeliveryLatency.observe({ provider }, latencyMs / 1000);
  }
}

/**
 * Record WhatsApp failure
 */
export function recordWhatsappFailure(provider: string, errorType: string): void {
  whatsappMessagesFailed.inc({ provider, error_type: errorType });
  whatsappProviderFailures.inc({ provider });
}

/**
 * Record WhatsApp failover
 */
export function recordWhatsappFailover(fromProvider: string, toProvider: string): void {
  whatsappFailoverEvents.inc({ from_provider: fromProvider, to_provider: toProvider });
}

/**
 * Update WhatsApp provider health
 */
export function updateWhatsappProviderHealth(provider: string, isHealthy: boolean): void {
  whatsappProviderHealth.set({ provider }, isHealthy ? 1 : 0);
}

/**
 * Record USSD session creation
 */
export function recordUssdSessionCreated(): void {
  ussdSessionsCreated.inc();
  ussdActiveSessions.inc();
}

/**
 * Record USSD session completion
 */
export function recordUssdSessionCompleted(action: string, durationMs: number): void {
  ussdSessionsCompleted.inc({ action });
  ussdActiveSessions.dec();
  ussdSessionDuration.observe({ completed: "true" }, durationMs / 1000);
}

/**
 * Record USSD session expiry
 */
export function recordUssdSessionExpired(lastStep: string, durationMs: number): void {
  ussdSessionsExpired.inc({ last_step: lastStep });
  ussdActiveSessions.dec();
  ussdSessionDuration.observe({ completed: "false" }, durationMs / 1000);
  ussdStepDropoff.inc({ step: lastStep });
}

/**
 * Record USSD step completion
 */
export function recordUssdStepCompletion(step: string, latencyMs: number): void {
  ussdStepCompletion.inc({ step });
  ussdRequestLatency.observe({ step }, latencyMs / 1000);
}

/**
 * Record USSD idempotency hit
 */
export function recordUssdIdempotencyHit(action: string): void {
  ussdIdempotencyHits.inc({ action });
}

/**
 * Record USSD error
 */
export function recordUssdError(errorType: string): void {
  ussdErrors.inc({ error_type: errorType });
}

/**
 * Update circuit breaker state
 */
export function updateCircuitBreakerState(
  provider: string,
  channel: string,
  state: "closed" | "half_open" | "open"
): void {
  const stateValue = state === "closed" ? 0 : state === "half_open" ? 1 : 2;
  circuitBreakerState.set({ provider, channel }, stateValue);

  if (state === "open") {
    circuitBreakerTrips.inc({ provider, channel });
  } else if (state === "closed") {
    circuitBreakerRecoveries.inc({ provider, channel });
  }
}

/**
 * Update message queue metrics
 */
export function updateMessageQueueMetrics(
  channel: string,
  pending: number,
  processing: number,
  deadLetter: number
): void {
  messageQueueSize.set({ channel, status: "pending" }, pending);
  messageQueueSize.set({ channel, status: "processing" }, processing);
  messageQueueSize.set({ channel, status: "dead_letter" }, deadLetter);
}

/**
 * Record message queue retry
 */
export function recordMessageQueueRetry(channel: string, attempt: number): void {
  messageQueueRetries.inc({ channel, attempt: attempt.toString() });
}

/**
 * Record message moved to dead letter
 */
export function recordMessageDeadLetter(channel: string): void {
  messageQueueDeadLetter.inc({ channel });
}

/**
 * Get all metrics as Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return await messagingRegistry.metrics();
}

/**
 * Get metrics as JSON
 */
export async function getMetricsJson(): Promise<object> {
  return await messagingRegistry.getMetricsAsJSON();
}

// ============================================================================
// ALERT THRESHOLDS
// ============================================================================

export const ALERT_THRESHOLDS = {
  // SMS alerts
  sms: {
    errorRatePercent: 5, // Alert if error rate > 5%
    queueSizeWarning: 100,
    queueSizeCritical: 500,
    latencyWarningMs: 5000,
    latencyCriticalMs: 10000,
  },
  // WhatsApp alerts
  whatsapp: {
    errorRatePercent: 5,
    queueSizeWarning: 100,
    queueSizeCritical: 500,
    latencyWarningMs: 5000,
    latencyCriticalMs: 10000,
  },
  // USSD alerts
  ussd: {
    dropoffRatePercent: 30, // Alert if dropoff > 30%
    sessionExpiredRatePercent: 20,
    latencyWarningMs: 1000,
    latencyCriticalMs: 2000,
  },
  // Circuit breaker alerts
  circuitBreaker: {
    openDurationWarningMs: 60000, // Alert if open > 1 minute
    openDurationCriticalMs: 300000, // Critical if open > 5 minutes
  },
};

/**
 * Prometheus alerting rules (for reference)
 */
export const PROMETHEUS_ALERT_RULES = `
groups:
  - name: messaging_alerts
    rules:
      # SMS Alerts
      - alert: SMSHighErrorRate
        expr: rate(sms_messages_failed_total[5m]) / rate(sms_messages_sent_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "SMS error rate is high"
          description: "SMS error rate is above 5% for the last 5 minutes"

      - alert: SMSProviderDown
        expr: sms_provider_health == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "SMS provider is down"
          description: "SMS provider {{ $labels.provider }} is unhealthy"

      - alert: SMSQueueBacklog
        expr: sms_queue_size{status="pending"} > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "SMS queue backlog is high"
          description: "SMS queue has {{ $value }} pending messages"

      # WhatsApp Alerts
      - alert: WhatsAppHighErrorRate
        expr: rate(whatsapp_messages_failed_total[5m]) / rate(whatsapp_messages_sent_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "WhatsApp error rate is high"
          description: "WhatsApp error rate is above 5% for the last 5 minutes"

      - alert: WhatsAppProviderDown
        expr: whatsapp_provider_health == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "WhatsApp provider is down"
          description: "WhatsApp provider {{ $labels.provider }} is unhealthy"

      # USSD Alerts
      - alert: USSDHighDropoffRate
        expr: rate(ussd_sessions_expired_total[5m]) / rate(ussd_sessions_created_total[5m]) > 0.3
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "USSD session dropoff rate is high"
          description: "USSD session dropoff rate is above 30%"

      - alert: USSDHighLatency
        expr: histogram_quantile(0.95, rate(ussd_request_latency_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "USSD request latency is high"
          description: "95th percentile USSD latency is above 2 seconds"

      # Circuit Breaker Alerts
      - alert: CircuitBreakerOpen
        expr: circuit_breaker_state == 2
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Circuit breaker is open"
          description: "Circuit breaker for {{ $labels.provider }} ({{ $labels.channel }}) is open"

      # Dead Letter Queue Alerts
      - alert: DeadLetterQueueGrowing
        expr: rate(message_queue_dead_letter_total[5m]) > 0.1
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Dead letter queue is growing"
          description: "Messages are being moved to dead letter queue for {{ $labels.channel }}"
`;

export default {
  messagingRegistry,
  getMetrics,
  getMetricsJson,
  ALERT_THRESHOLDS,
  PROMETHEUS_ALERT_RULES,
};
