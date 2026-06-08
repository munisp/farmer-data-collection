/**
 * OpenTelemetry Configuration
 * Distributed tracing, metrics, and logging for the FarmConnect platform.
 * Exports to OTLP endpoint (Jaeger/Tempo/Grafana).
 */

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "farmconnect-api";
const SERVICE_VERSION = process.env.SERVICE_VERSION || "1.0.0";

interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  serviceName: string;
  operationName: string;
  startTime: number;
  attributes: Record<string, string | number | boolean>;
}

let spanCounter = 0;

function generateId(length: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export function startSpan(operationName: string, parentSpanId?: string): SpanContext {
  return {
    traceId: parentSpanId ? "" : generateId(32),
    spanId: generateId(16),
    parentSpanId,
    serviceName: SERVICE_NAME,
    operationName,
    startTime: Date.now(),
    attributes: {},
  };
}

export function endSpan(span: SpanContext, status: "ok" | "error" = "ok"): void {
  const duration = Date.now() - span.startTime;
  spanCounter++;

  if (process.env.OTEL_ENABLED === "true") {
    fetch(`${OTEL_ENDPOINT}/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceSpans: [{
          resource: { attributes: [
            { key: "service.name", value: { stringValue: SERVICE_NAME } },
            { key: "service.version", value: { stringValue: SERVICE_VERSION } },
          ]},
          scopeSpans: [{
            spans: [{
              traceId: span.traceId,
              spanId: span.spanId,
              parentSpanId: span.parentSpanId,
              name: span.operationName,
              kind: 1,
              startTimeUnixNano: span.startTime * 1_000_000,
              endTimeUnixNano: Date.now() * 1_000_000,
              status: { code: status === "ok" ? 1 : 2 },
              attributes: Object.entries(span.attributes).map(([key, value]) => ({
                key,
                value: typeof value === "string" ? { stringValue: value } : { intValue: value },
              })),
            }],
          }],
        }],
      }),
    }).catch(() => {});
  }
}

export function recordMetric(name: string, value: number, labels: Record<string, string> = {}): void {
  if (process.env.OTEL_ENABLED === "true") {
    fetch(`${OTEL_ENDPOINT}/v1/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceMetrics: [{
          resource: { attributes: [{ key: "service.name", value: { stringValue: SERVICE_NAME } }] },
          scopeMetrics: [{
            metrics: [{
              name,
              gauge: { dataPoints: [{ asDouble: value, timeUnixNano: Date.now() * 1_000_000, attributes: Object.entries(labels).map(([k, v]) => ({ key: k, value: { stringValue: v } })) }] },
            }],
          }],
        }],
      }),
    }).catch(() => {});
  }
}

export function getOtelStats() {
  return {
    serviceName: SERVICE_NAME,
    serviceVersion: SERVICE_VERSION,
    endpoint: OTEL_ENDPOINT,
    enabled: process.env.OTEL_ENABLED === "true",
    totalSpans: spanCounter,
  };
}
