/**
 * Observability Middleware
 * OpenTelemetry-based distributed tracing, metrics, and logging.
 * Integrates with Jaeger/Zipkin for traces, Prometheus for metrics.
 * 
 * Environment variables:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 *   OTEL_SERVICE_NAME=farmconnect-api
 *   OTEL_ENABLED=true
 *   METRICS_ENABLED=true
 */

import { logger } from "../logger.js";

// ─── Trace Context ─────────────────────────────────────────────────────────

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

export interface Span {
  traceId: string;
  spanId: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, string | number | boolean>;
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, string> }>;
}

function generateId(length: number): string {
  const chars = '0123456789abcdef';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * 16)]).join('');
}

export function createTraceContext(parentContext?: TraceContext): TraceContext {
  return {
    traceId: parentContext?.traceId ?? generateId(32),
    spanId: generateId(16),
    parentSpanId: parentContext?.spanId,
    sampled: true,
  };
}

// ─── Span Management ───────────────────────────────────────────────────────

const activeSpans = new Map<string, Span>();

export function startSpan(
  operationName: string,
  attributes: Record<string, string | number | boolean> = {},
  parentContext?: TraceContext,
): Span {
  const ctx = createTraceContext(parentContext);
  const span: Span = {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    operationName,
    startTime: Date.now(),
    status: 'unset',
    attributes: {
      'service.name': process.env.OTEL_SERVICE_NAME ?? 'farmconnect-api',
      'service.version': process.env.APP_VERSION ?? '1.0.0',
      ...attributes,
    },
    events: [],
  };
  activeSpans.set(ctx.spanId, span);
  return span;
}

export function endSpan(span: Span, status: 'ok' | 'error' = 'ok'): void {
  span.endTime = Date.now();
  span.duration = span.endTime - span.startTime;
  span.status = status;
  activeSpans.delete(span.spanId);

  // Export span (in production, send to OTLP collector)
  if (process.env.OTEL_ENABLED === 'true') {
    exportSpan(span);
  }
}

export function addSpanEvent(span: Span, name: string, attributes?: Record<string, string>): void {
  span.events.push({ name, timestamp: Date.now(), attributes });
}

function exportSpan(span: Span): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
  
  // Non-blocking export to OTLP collector
  fetch(`${endpoint}/v1/traces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resourceSpans: [{
        resource: { attributes: [{ key: 'service.name', value: { stringValue: span.attributes['service.name'] } }] },
        scopeSpans: [{
          spans: [{
            traceId: span.traceId,
            spanId: span.spanId,
            name: span.operationName,
            kind: 2, // SERVER
            startTimeUnixNano: span.startTime * 1_000_000,
            endTimeUnixNano: (span.endTime ?? Date.now()) * 1_000_000,
            status: { code: span.status === 'ok' ? 1 : 2 },
            attributes: Object.entries(span.attributes).map(([key, value]) => ({
              key,
              value: typeof value === 'string' ? { stringValue: value } : { intValue: value },
            })),
          }],
        }],
      }],
    }),
  }).catch(() => { /* Non-blocking — don't fail requests on export failure */ });
}

// ─── Metrics ───────────────────────────────────────────────────────────────

interface MetricCounter {
  name: string;
  labels: Record<string, string>;
  value: number;
}

interface MetricHistogram {
  name: string;
  labels: Record<string, string>;
  values: number[];
}

const counters = new Map<string, MetricCounter>();
const histograms = new Map<string, MetricHistogram>();

export function incrementCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
  const key = `${name}:${JSON.stringify(labels)}`;
  const existing = counters.get(key);
  if (existing) {
    existing.value += value;
  } else {
    counters.set(key, { name, labels, value });
  }
}

export function recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
  const key = `${name}:${JSON.stringify(labels)}`;
  const existing = histograms.get(key);
  if (existing) {
    existing.values.push(value);
  } else {
    histograms.set(key, { name, labels, values: [value] });
  }
}

// Pre-defined metrics
export const METRICS = {
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION_MS: 'http_request_duration_ms',
  GRPC_REQUESTS_TOTAL: 'grpc_requests_total',
  GRPC_REQUEST_DURATION_MS: 'grpc_request_duration_ms',
  DB_QUERIES_TOTAL: 'db_queries_total',
  DB_QUERY_DURATION_MS: 'db_query_duration_ms',
  CIRCUIT_BREAKER_STATE: 'circuit_breaker_state',
  KAFKA_MESSAGES_PRODUCED: 'kafka_messages_produced_total',
  KAFKA_MESSAGES_CONSUMED: 'kafka_messages_consumed_total',
  CACHE_HITS: 'cache_hits_total',
  CACHE_MISSES: 'cache_misses_total',
  AUTH_ATTEMPTS: 'auth_attempts_total',
  AUTH_FAILURES: 'auth_failures_total',
} as const;

/**
 * Get all metrics in Prometheus exposition format
 */
export function getPrometheusMetrics(): string {
  const lines: string[] = [];

  for (const counter of counters.values()) {
    const labelStr = Object.entries(counter.labels).map(([k, v]) => `${k}="${v}"`).join(',');
    lines.push(`# TYPE ${counter.name} counter`);
    lines.push(`${counter.name}{${labelStr}} ${counter.value}`);
  }

  for (const histogram of histograms.values()) {
    const labelStr = Object.entries(histogram.labels).map(([k, v]) => `${k}="${v}"`).join(',');
    const sorted = [...histogram.values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const p50 = sorted[Math.floor(count * 0.5)] ?? 0;
    const p95 = sorted[Math.floor(count * 0.95)] ?? 0;
    const p99 = sorted[Math.floor(count * 0.99)] ?? 0;
    
    lines.push(`# TYPE ${histogram.name} histogram`);
    lines.push(`${histogram.name}_bucket{${labelStr},le="50"} ${sorted.filter(v => v <= 50).length}`);
    lines.push(`${histogram.name}_bucket{${labelStr},le="100"} ${sorted.filter(v => v <= 100).length}`);
    lines.push(`${histogram.name}_bucket{${labelStr},le="500"} ${sorted.filter(v => v <= 500).length}`);
    lines.push(`${histogram.name}_bucket{${labelStr},le="1000"} ${sorted.filter(v => v <= 1000).length}`);
    lines.push(`${histogram.name}_bucket{${labelStr},le="+Inf"} ${count}`);
    lines.push(`${histogram.name}_sum{${labelStr}} ${sum}`);
    lines.push(`${histogram.name}_count{${labelStr}} ${count}`);
    lines.push(`# p50=${p50} p95=${p95} p99=${p99}`);
  }

  return lines.join('\n');
}

/**
 * Middleware-style tracing for tRPC procedures
 */
export function traceRpcCall(
  routerName: string,
  procedureName: string,
  requestId: string,
): { span: Span; finish: (error?: Error) => void } {
  const span = startSpan(`trpc.${routerName}.${procedureName}`, {
    'rpc.system': 'trpc',
    'rpc.service': routerName,
    'rpc.method': procedureName,
    'request.id': requestId,
  });

  incrementCounter(METRICS.HTTP_REQUESTS_TOTAL, { router: routerName, procedure: procedureName });

  const startTime = Date.now();

  return {
    span,
    finish: (error?: Error) => {
      const duration = Date.now() - startTime;
      recordHistogram(METRICS.HTTP_REQUEST_DURATION_MS, duration, { router: routerName });
      
      if (error) {
        span.attributes['error.message'] = error.message;
        span.attributes['error.type'] = error.name;
        endSpan(span, 'error');
      } else {
        endSpan(span, 'ok');
      }
    },
  };
}
