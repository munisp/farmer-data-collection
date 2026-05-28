/**
 * OpenTelemetry Instrumentation for Distributed Tracing
 * 
 * This module sets up OpenTelemetry for tracing requests across the platform.
 * Traces are exported to Jaeger for visualization and analysis.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { logger } from './logger.js';

const JAEGER_ENDPOINT = process.env.JAEGER_ENDPOINT || 'http://jaeger:4318/v1/traces';
const SERVICE_NAME = process.env.SERVICE_NAME || 'farmer-backend';
const SERVICE_VERSION = process.env.SERVICE_VERSION || '1.0.0';
const ENVIRONMENT = process.env.NODE_ENV || 'development';
// Configure OTLP exporter for Jaeger
const jaegerExporter = new OTLPTraceExporter({
  url: JAEGER_ENDPOINT,
});

// Configure resource attributes
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: ENVIRONMENT,
});

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
  resource: resource as any,
  spanProcessor: new BatchSpanProcessor(jaegerExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Automatically instrument common libraries
      '@opentelemetry/instrumentation-http': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-redis': {
        enabled: true,
      },
    }),
  ],
});

// Start the SDK
sdk.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => logger.info('OpenTelemetry SDK shut down successfully'))
    .catch((error) => logger.error('Error shutting down OpenTelemetry SDK', error))
    .finally(() => process.exit(0));
});

export default sdk;
