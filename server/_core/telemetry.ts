/**
 * OpenTelemetry Distributed Tracing Configuration
 * 
 * Provides distributed tracing across all services:
 * - Node.js backend (tRPC, Express, database queries)
 * - Go microservices (image, websocket, dapr, apisix, fluvio)
 * - Python services (ML, Temporal workflows)
 * 
 * Traces are exported to Jaeger for visualization
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { logger } from '../logger.js';

// Service name for identification in traces
const SERVICE_NAME = 'farmer-platform-backend';

// Jaeger endpoint (default: http://localhost:14268/api/traces)
const JAEGER_ENDPOINT = process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces';

// Enable/disable tracing
const TRACING_ENABLED = process.env.ENABLE_TRACING !== 'false';

/**
 * Initialize OpenTelemetry SDK
 */
export function initTelemetry(): NodeSDK | null {
  if (!TRACING_ENABLED) {
    logger.info('[Telemetry] Tracing disabled');
    return null;
  }

  try {
    // Create OTLP exporter for Jaeger
    const traceExporter = new OTLPTraceExporter({
      url: JAEGER_ENDPOINT,
      headers: {},
    });

    // Create resource with service information
    const { Resource: ResourceClass } = require('@opentelemetry/resources');
    const resource = ResourceClass.default().merge(
      new ResourceClass({
        [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
      })
    );

    // Initialize SDK with auto-instrumentations
    const sdk = new NodeSDK({
      resource,
      spanProcessor: new BatchSpanProcessor(traceExporter),
      instrumentations: [
        // Auto-instrument common libraries
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': {
            enabled: false, // Disable filesystem instrumentation (too noisy)
          },
        }),
        // Explicit instrumentations for better control
        new HttpInstrumentation(),
        new ExpressInstrumentation(),
      ],
    });

    // Start the SDK
    sdk.start();
    logger.info('[Telemetry] OpenTelemetry initialized');
    logger.info(`[Telemetry] Exporting traces to: ${JAEGER_ENDPOINT}`);

    // Graceful shutdown
    process.on('SIGTERM', () => {
      sdk.shutdown()
        .then(() => logger.info('[Telemetry] SDK shut down successfully'))
        .catch((error) => logger.error('[Telemetry] Error shutting down SDK', error))
        .finally(() => process.exit(0));
    });

    return sdk;
  } catch (error) {
    logger.error('[Telemetry] Failed to initialize OpenTelemetry:', error);
    return null;
  }
}

/**
 * Get current trace context for manual span creation
 */
export function getTraceContext() {
  const { trace, context } = require('@opentelemetry/api');
  const span = trace.getSpan(context.active());
  
  if (!span) {
    return null;
  }

  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  };
}

/**
 * Create a custom span for manual instrumentation
 * 
 * @example
 * const span = createSpan('database.query', { query: 'SELECT * FROM users' });
 * try {
 *   const result = await db.query('SELECT * FROM users');
 *   span.setStatus({ code: SpanStatusCode.OK });
 *   return result;
 * } catch (error) {
 *   span.setStatus({ code: SpanStatusCode.ERROR, message: (error instanceof Error ? error.message : String(error)) });
 *   throw error;
 * } finally {
 *   span.end();
 * }
 */
export function createSpan(name: string, attributes: Record<string, unknown> = {}) {
  const { trace } = require('@opentelemetry/api');
  const tracer = trace.getTracer(SERVICE_NAME);
  
  return tracer.startSpan(name, {
    attributes,
  });
}

/**
 * Wrap an async function with automatic tracing
 * 
 * @example
 * const tracedFunction = traceAsync('myFunction', async (param) => {
 *   return await doSomething(param);
 * });
 */
export function traceAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  name: string,
  fn: T
): T {
  return (async (...args: unknown[]) => {
    const span = createSpan(name, {
      'function.args': JSON.stringify(args),
    });

    try {
      const result = await fn(...args);
      const { SpanStatusCode } = require('@opentelemetry/api');
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: unknown) {
      const { SpanStatusCode } = require('@opentelemetry/api');
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error instanceof Error ? error.message : String(error)),
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }) as T;
}

/**
 * Add custom attributes to the current span
 */
export function addSpanAttributes(attributes: Record<string, unknown>) {
  const { trace, context } = require('@opentelemetry/api');
  const span = trace.getSpan(context.active());
  
  if (span) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }
}

/**
 * Add an event to the current span
 */
export function addSpanEvent(name: string, attributes?: Record<string, unknown>) {
  const { trace, context } = require('@opentelemetry/api');
  const span = trace.getSpan(context.active());
  
  if (span) {
    span.addEvent(name, attributes);
  }
}
