/**
 * Distributed Tracing with OpenTelemetry
 * 
 * Provides request tracing across the TypeScript server and polyglot microservices.
 * Exports traces to Jaeger (or OTLP-compatible collector) when configured.
 * Falls back to structured log output when Jaeger is unavailable.
 */
import { logger } from '../logger.js';

interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  service: string;
  operation: string;
  startTime: number;
  attributes: Record<string, string | number | boolean>;
}

interface TraceConfig {
  serviceName: string;
  jaegerEndpoint: string;
  samplingRate: number;
  enabled: boolean;
}

const config: TraceConfig = {
  serviceName: process.env.OTEL_SERVICE_NAME || 'farmconnect-server',
  jaegerEndpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
  samplingRate: parseFloat(process.env.OTEL_SAMPLING_RATE || '1.0'),
  enabled: process.env.OTEL_ENABLED !== 'false',
};

function generateId(length: number = 16): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function createTraceId(): string {
  return generateId(32);
}

export function createSpanId(): string {
  return generateId(16);
}

const activeSpans = new Map<string, SpanContext>();

export function startSpan(operation: string, parentTraceId?: string, parentSpanId?: string): SpanContext {
  const span: SpanContext = {
    traceId: parentTraceId || createTraceId(),
    spanId: createSpanId(),
    parentSpanId,
    service: config.serviceName,
    operation,
    startTime: Date.now(),
    attributes: {},
  };

  activeSpans.set(span.spanId, span);
  return span;
}

export function endSpan(span: SpanContext, status: 'ok' | 'error' = 'ok', error?: string): void {
  const duration = Date.now() - span.startTime;
  activeSpans.delete(span.spanId);

  const traceData = {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    service: span.service,
    operation: span.operation,
    duration_ms: duration,
    status,
    error,
    attributes: span.attributes,
  };

  if (config.enabled) {
    exportToJaeger(traceData).catch(() => {
      // Fallback: log trace data as structured JSON
      logger.debug('[Tracing] Span completed (Jaeger unavailable)', traceData);
    });
  }
}

export function setSpanAttribute(span: SpanContext, key: string, value: string | number | boolean): void {
  span.attributes[key] = value;
}

async function exportToJaeger(traceData: Record<string, unknown>): Promise<void> {
  if (!config.jaegerEndpoint) return;

  const jaegerSpan = {
    traceIdHigh: traceData.traceId?.toString().substring(0, 16) || '',
    traceIdLow: traceData.traceId?.toString().substring(16) || '',
    spanId: traceData.spanId,
    parentSpanId: traceData.parentSpanId || '0000000000000000',
    operationName: traceData.operation,
    startTime: (traceData as { startTime?: number }).startTime || Date.now() * 1000,
    duration: ((traceData.duration_ms as number) || 0) * 1000,
    tags: Object.entries((traceData.attributes || {}) as Record<string, unknown>).map(([key, value]) => ({
      key,
      vType: typeof value === 'number' ? 'LONG' : 'STRING',
      vStr: String(value),
    })),
    process: {
      serviceName: config.serviceName,
      tags: [{ key: 'environment', vType: 'STRING', vStr: process.env.NODE_ENV || 'development' }],
    },
  };

  try {
    const response = await fetch(config.jaegerEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: { spans: [jaegerSpan], process: jaegerSpan.process } }),
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      throw new Error(`Jaeger responded ${response.status}`);
    }
  } catch (err) {
    logger.debug('Jaeger export failed, trace in structured logs only', { traceId: String(traceData.traceId), error: String(err) });
  }
}

/**
 * Express middleware for automatic request tracing.
 * Adds trace context to request headers for propagation to downstream services.
 */
export function tracingMiddleware() {
  return (req: { method: string; url: string; headers: Record<string, string | string[] | undefined> }, res: { setHeader: (k: string, v: string) => void; on: (event: string, cb: () => void) => void; statusCode: number }, next: () => void) => {
    if (!config.enabled) {
      next();
      return;
    }

    // Check for incoming trace context (W3C Trace Context format)
    const traceparent = req.headers['traceparent'] as string | undefined;
    let parentTraceId: string | undefined;
    let parentSpanId: string | undefined;

    if (traceparent) {
      const parts = traceparent.split('-');
      if (parts.length >= 4) {
        parentTraceId = parts[1];
        parentSpanId = parts[2];
      }
    }

    const span = startSpan(`${req.method} ${req.url}`, parentTraceId, parentSpanId);
    setSpanAttribute(span, 'http.method', req.method);
    setSpanAttribute(span, 'http.url', req.url);

    // Propagate trace context to downstream services
    res.setHeader('x-trace-id', span.traceId);
    res.setHeader('x-span-id', span.spanId);

    res.on('finish', () => {
      setSpanAttribute(span, 'http.status_code', res.statusCode);
      endSpan(span, res.statusCode >= 400 ? 'error' : 'ok');
    });

    next();
  };
}

/**
 * Create trace headers for outbound HTTP requests to microservices.
 */
export function createTraceHeaders(span?: SpanContext): Record<string, string> {
  if (!span) {
    const traceId = createTraceId();
    return {
      traceparent: `00-${traceId}-${createSpanId()}-01`,
      'x-trace-id': traceId,
    };
  }

  return {
    traceparent: `00-${span.traceId}-${span.spanId}-01`,
    'x-trace-id': span.traceId,
    'x-parent-span-id': span.spanId,
  };
}

export function getActiveSpanCount(): number {
  return activeSpans.size;
}

export { config as tracingConfig };
