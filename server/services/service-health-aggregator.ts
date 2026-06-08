/**
 * Service Health Aggregator
 * 
 * Provides a unified dashboard view of all FarmConnect services,
 * middleware components, and polyglot microservices.
 * 
 * Endpoint: GET /api/service-health
 */

import { logger } from "../logger.js";
import { GRPC_SERVICE_REGISTRY } from "./grpc-mtls-config.js";
import { getGrpcServiceStatus } from "./grpc-client.js";

interface ServiceStatus {
  name: string;
  type: "core" | "middleware" | "polyglot" | "infrastructure";
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  latencyMs?: number;
  details?: Record<string, unknown>;
}

interface AggregatedHealth {
  overall: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime_seconds: number;
  services: ServiceStatus[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  };
}

const startTime = Date.now();

async function checkHttpService(
  name: string,
  url: string,
  type: ServiceStatus["type"],
  timeoutMs = 3000,
): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (response.ok) {
      return { name, type, status: "healthy", latencyMs };
    }
    return { name, type, status: "degraded", latencyMs, details: { httpStatus: response.status } };
  } catch {
    return { name, type, status: "unhealthy", latencyMs: Date.now() - start };
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const { getRedisClient } = await import("../redis.js");
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      return { name: "Redis", type: "middleware", status: "healthy", latencyMs: Date.now() - start };
    }
    return { name: "Redis", type: "middleware", status: "unhealthy" };
  } catch {
    return { name: "Redis", type: "middleware", status: "unhealthy", latencyMs: Date.now() - start };
  }
}

async function checkDatabase(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const { getDb } = await import("../db.js");
    const db = await getDb();
    if (db) {
      return { name: "PostgreSQL", type: "middleware", status: "healthy", latencyMs: Date.now() - start };
    }
    return { name: "PostgreSQL", type: "middleware", status: "unhealthy" };
  } catch {
    return { name: "PostgreSQL", type: "middleware", status: "unhealthy", latencyMs: Date.now() - start };
  }
}

async function checkKafka(): Promise<ServiceStatus> {
  try {
    const { getConsumerHealth } = await import("../consumers/consumer-manager.js");
    const health = getConsumerHealth();
    if (health.running > 0) {
      return {
        name: "Kafka",
        type: "middleware",
        status: health.running === health.total ? "healthy" : "degraded",
        details: { running: health.running, total: health.total },
      };
    }
    return { name: "Kafka", type: "middleware", status: "unhealthy" };
  } catch {
    return { name: "Kafka", type: "middleware", status: "unknown" };
  }
}

async function checkLakehouse(): Promise<ServiceStatus> {
  try {
    const { getLakehouseStatus } = await import("./lakehouse/index.js");
    const status = getLakehouseStatus();
    return {
      name: "Lakehouse",
      type: "middleware",
      status: status?.connected ? "healthy" : "unhealthy",
      details: status ? { layers: status } : undefined,
    };
  } catch {
    return { name: "Lakehouse", type: "middleware", status: "unknown" };
  }
}

function checkGrpcServices(): ServiceStatus[] {
  const grpcStatuses = getGrpcServiceStatus();
  return grpcStatuses.map((svc) => ({
    name: svc.service,
    type: "polyglot" as const,
    status: svc.circuitBreakerState === "CLOSED" ? ("healthy" as const) : ("degraded" as const),
    details: {
      address: svc.address,
      circuitBreaker: svc.circuitBreakerState,
      proto: GRPC_SERVICE_REGISTRY[svc.service as keyof typeof GRPC_SERVICE_REGISTRY]?.proto,
    },
  }));
}

export async function getAggregatedHealth(): Promise<AggregatedHealth> {
  const services: ServiceStatus[] = [];

  // Check core infrastructure in parallel
  const [db, redis, kafka, lakehouse] = await Promise.allSettled([
    checkDatabase(),
    checkRedis(),
    checkKafka(),
    checkLakehouse(),
  ]);

  if (db.status === "fulfilled") services.push(db.value);
  if (redis.status === "fulfilled") services.push(redis.value);
  if (kafka.status === "fulfilled") services.push(kafka.value);
  if (lakehouse.status === "fulfilled") services.push(lakehouse.value);

  // Check middleware HTTP services
  const middlewareChecks = [
    { name: "Keycloak", url: process.env.KEYCLOAK_URL ?? "http://localhost:8080", path: "/health/ready" },
    { name: "OpenSearch", url: process.env.OPENSEARCH_URL ?? "http://localhost:9200", path: "/" },
    { name: "APISIX", url: process.env.APISIX_ADMIN_URL ?? "http://localhost:9180", path: "/apisix/admin/routes" },
    { name: "Dapr", url: process.env.DAPR_HTTP_URL ?? "http://localhost:3500", path: "/v1.0/healthz" },
    { name: "TigerBeetle", url: process.env.TIGERBEETLE_URL ?? "http://localhost:3000", path: "/" },
    { name: "Mojaloop", url: process.env.MOJALOOP_URL ?? "http://localhost:4000", path: "/health" },
  ];

  const middlewareResults = await Promise.allSettled(
    middlewareChecks.map((m) => checkHttpService(m.name, `${m.url}${m.path}`, "middleware")),
  );

  for (const result of middlewareResults) {
    if (result.status === "fulfilled") {
      services.push(result.value);
    }
  }

  // Add OpenAppSec, Permify, Fluvio as middleware
  const additionalMiddleware = [
    { name: "OpenAppSec", url: process.env.OPENAPPSEC_URL ?? "http://localhost:4000", path: "/health" },
    { name: "Permify", url: process.env.PERMIFY_URL ?? "http://localhost:3476", path: "/healthz" },
    { name: "Fluvio", url: process.env.FLUVIO_URL ?? "http://localhost:9003", path: "/" },
  ];

  const additionalResults = await Promise.allSettled(
    additionalMiddleware.map((m) => checkHttpService(m.name, `${m.url}${m.path}`, "middleware")),
  );

  for (const result of additionalResults) {
    if (result.status === "fulfilled") {
      services.push(result.value);
    }
  }

  // gRPC polyglot services
  const grpcServices = checkGrpcServices();
  services.push(...grpcServices);

  // HTTP polyglot services
  const polyglotHttpChecks = [
    { name: "blockchain-provenance-go", url: process.env.BLOCKCHAIN_PROVENANCE_SERVICE_URL ?? "http://localhost:8110", path: "/health" },
    { name: "urban-delivery-rust", url: process.env.URBAN_DELIVERY_SERVICE_URL ?? "http://localhost:8111", path: "/health" },
    { name: "cea-ai-python", url: process.env.CEA_AI_SERVICE_URL ?? "http://localhost:8112", path: "/health" },
    { name: "aquaculture-pond-go", url: process.env.AQUACULTURE_POND_SERVICE_URL ?? "http://localhost:8113", path: "/health" },
    { name: "aquaculture-feed-rust", url: process.env.AQUACULTURE_FEED_SERVICE_URL ?? "http://localhost:8114", path: "/health" },
    { name: "aquaculture-ai-python", url: process.env.AQUACULTURE_AI_SERVICE_URL ?? "http://localhost:8115", path: "/health" },
    { name: "contract-farming-go", url: process.env.CONTRACT_FARMING_SERVICE_URL ?? "http://localhost:8116", path: "/health" },
    { name: "warehouse-receipt-rust", url: process.env.WAREHOUSE_RECEIPT_SERVICE_URL ?? "http://localhost:8117", path: "/health" },
    { name: "conversational-commerce-python", url: process.env.CONVERSATIONAL_COMMERCE_SERVICE_URL ?? "http://localhost:8118", path: "/health" },
  ];

  const polyglotResults = await Promise.allSettled(
    polyglotHttpChecks.map((s) => checkHttpService(s.name, `${s.url}${s.path}`, "polyglot", 2000)),
  );

  for (const result of polyglotResults) {
    if (result.status === "fulfilled") {
      services.push(result.value);
    }
  }

  // Compute summary
  const summary = {
    total: services.length,
    healthy: services.filter((s) => s.status === "healthy").length,
    degraded: services.filter((s) => s.status === "degraded").length,
    unhealthy: services.filter((s) => s.status === "unhealthy").length,
    unknown: services.filter((s) => s.status === "unknown").length,
  };

  let overall: AggregatedHealth["overall"] = "healthy";
  if (summary.unhealthy > 0 || summary.degraded > summary.total / 2) {
    overall = "unhealthy";
  } else if (summary.degraded > 0 || summary.unknown > 0) {
    overall = "degraded";
  }

  return {
    overall,
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    services,
    summary,
  };
}

/**
 * Express middleware to register the /api/service-health endpoint.
 */
export function registerHealthAggregator(app: import("express").Express): void {
  app.get("/api/service-health", async (_req, res) => {
    try {
      const health = await getAggregatedHealth();
      const statusCode = health.overall === "healthy" ? 200 : health.overall === "degraded" ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      logger.error("[HealthAggregator] Failed to collect health data:", error);
      res.status(500).json({ error: "Failed to aggregate health status" });
    }
  });

  logger.info("[HealthAggregator] Registered /api/service-health endpoint");
}
