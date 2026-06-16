/**
 * OpenTelemetry Distributed Tracing Configuration
 * 
 * Provides automatic and manual instrumentation for:
 * - HTTP requests (Express/tRPC)
 * - Database queries (pg/drizzle)
 * - External API calls
 * - Kafka producer/consumer operations
 * - Custom business logic spans
 * 
 * Export: OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
 */
import { trace, SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api';
import { logger } from './logger.js';

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'farmconnect-api';
const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
const OTEL_ENABLED = process.env.OTEL_ENABLED !== 'false';

/**
 * Initialize OpenTelemetry tracing with auto-instrumentation.
 * Call once at application startup before any requests are processed.
 * 
 * Uses dynamic imports to avoid type conflicts at compile time while
 * supporting the full Node.js auto-instrumentation suite at runtime.
 */
export async function initTracing(): Promise<void> {
  if (!OTEL_ENABLED) {
    logger.info('[Tracing] OpenTelemetry disabled (OTEL_ENABLED=false)');
    return;
  }

  try {
    const { NodeTracerProvider } = await import('@opentelemetry/sdk-trace-node');
    const { BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-base');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { Resource } = await import('@opentelemetry/resources');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
    const { registerInstrumentations } = await import('@opentelemetry/instrumentation');

    const resource = new Resource({
      'service.name': SERVICE_NAME,
      'service.version': process.env.APP_VERSION || '1.0.0',
      'deployment.environment': process.env.NODE_ENV || 'development',
      'service.namespace': 'farmconnect',
    });

    const provider = new NodeTracerProvider({ resource } as Record<string, unknown>);

    const exporter = new OTLPTraceExporter({
      url: `${OTEL_ENDPOINT}/v1/traces`,
    });

    (provider as unknown as { addSpanProcessor: (p: unknown) => void }).addSpanProcessor(
      new BatchSpanProcessor(exporter, {
        maxQueueSize: 2048,
        maxExportBatchSize: 512,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 30000,
      })
    );

    provider.register();

    registerInstrumentations({
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-dns': { enabled: false },
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    logger.info('[Tracing] OpenTelemetry initialized', {
      service: SERVICE_NAME,
      endpoint: OTEL_ENDPOINT,
    });
  } catch (error) {
    logger.warn('[Tracing] Failed to initialize OpenTelemetry', { error: String(error) });
  }
}

/**
 * Gracefully shutdown tracing, flushing all pending spans.
 */
export async function shutdownTracing(): Promise<void> {
  try {
    const provider = trace.getTracerProvider();
    if ('shutdown' in provider) {
      await (provider as unknown as { shutdown: () => Promise<void> }).shutdown();
      logger.info('[Tracing] OpenTelemetry shut down');
    }
  } catch {
    // Ignore shutdown errors
  }
}

// ============================================================================
// Manual Span Helpers — for business logic instrumentation
// ============================================================================

const tracer = trace.getTracer(SERVICE_NAME);

/**
 * Create a span for a database operation.
 */
export function traceDbOperation<T>(
  operation: string,
  table: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(`db.${operation}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'db.system': 'postgresql',
      'db.operation': operation,
      'db.sql.table': table,
    },
  }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Create a span for an external API call.
 */
export function traceExternalCall<T>(
  service: string,
  endpoint: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(`external.${service}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'http.url': endpoint,
      'peer.service': service,
    },
  }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Create a span for a Kafka event operation.
 */
export function traceKafkaOperation<T>(
  operation: 'produce' | 'consume',
  topic: string,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(`kafka.${operation}`, {
    kind: operation === 'produce' ? SpanKind.PRODUCER : SpanKind.CONSUMER,
    attributes: {
      'messaging.system': 'kafka',
      'messaging.operation': operation,
      'messaging.destination.name': topic,
    },
  }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Create a span for business logic operations (loan processing, risk assessment, etc.)
 */
export function traceBusinessLogic<T>(
  operation: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(`business.${operation}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'farmconnect.operation': operation,
      ...attributes,
    },
  }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Get the current active span (for adding attributes/events during processing).
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Add an event to the current span (e.g., "loan_approved", "payment_initiated").
 */
export function addSpanEvent(name: string, attributes?: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}

export { tracer, SpanKind, SpanStatusCode };
