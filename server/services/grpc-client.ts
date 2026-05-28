/**
 * gRPC Client with Retry + Circuit Breaker
 *
 * Provides a resilient gRPC client for inter-service communication.
 * Uses the same circuit breaker pattern as circuit-breaker.ts.
 *
 * Proto definitions: /proto/farmconnect.proto
 *
 * Environment variables:
 *   GRPC_DELIVERY_SERVICE_ADDR=localhost:9091
 *   GRPC_MOBILE_MONEY_SERVICE_ADDR=localhost:9090
 *   GRPC_COLD_CHAIN_SERVICE_ADDR=localhost:9092
 *   GRPC_ML_INFERENCE_SERVICE_ADDR=localhost:9096
 *   GRPC_TOKENIZATION_SERVICE_ADDR=localhost:9094
 */

import { CircuitBreaker } from "./circuit-breaker.js";

interface GrpcRetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<GrpcRetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 200,
  maxDelayMs: 5000,
  timeoutMs: 10_000,
};

const serviceBreakers = new Map<string, CircuitBreaker>();

function getBreaker(serviceName: string): CircuitBreaker {
  let breaker = serviceBreakers.get(serviceName);
  if (!breaker) {
    breaker = new CircuitBreaker({
      name: `grpc-${serviceName}`,
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      timeoutMs: 10_000,
    });
    serviceBreakers.set(serviceName, breaker);
  }
  return breaker;
}

const SERVICE_ADDRESSES: Record<string, string> = {
  "delivery-service": process.env.GRPC_DELIVERY_SERVICE_ADDR ?? "localhost:9091",
  "mobile-money-service": process.env.GRPC_MOBILE_MONEY_SERVICE_ADDR ?? "localhost:9090",
  "cold-chain-service": process.env.GRPC_COLD_CHAIN_SERVICE_ADDR ?? "localhost:9092",
  "ml-inference-service": process.env.GRPC_ML_INFERENCE_SERVICE_ADDR ?? "localhost:9096",
  "tokenization-service": process.env.GRPC_TOKENIZATION_SERVICE_ADDR ?? "localhost:9094",
  "price-prediction-service": process.env.GRPC_PRICE_PREDICTION_SERVICE_ADDR ?? "localhost:9093",
  "equipment-fleet-service": process.env.GRPC_EQUIPMENT_FLEET_SERVICE_ADDR ?? "localhost:9098",
};

export function getServiceAddress(serviceName: string): string {
  return SERVICE_ADDRESSES[serviceName] ?? `localhost:9000`;
}

/**
 * Execute a gRPC call with circuit breaker and retry logic.
 *
 * Usage:
 *   const result = await grpcCallWithRetry("delivery-service", async () => {
 *     return client.calculateRoute(request);
 *   });
 */
export async function grpcCallWithRetry<T>(
  serviceName: string,
  callFn: () => Promise<T>,
  opts?: GrpcRetryOptions,
): Promise<T> {
  const options = { ...DEFAULT_RETRY_OPTIONS, ...opts };
  const breaker = getBreaker(serviceName);

  return breaker.execute(async () => {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        return await callFn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < options.maxRetries) {
          const delay = Math.min(
            options.initialDelayMs * Math.pow(2, attempt) + Math.random() * 100,
            options.maxDelayMs,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error(`gRPC call failed for ${serviceName}`);
  });
}

export function getGrpcServiceStatus(): Array<{
  service: string;
  address: string;
  circuitBreakerState: string;
}> {
  return Object.entries(SERVICE_ADDRESSES).map(([service, address]) => {
    const breaker = serviceBreakers.get(service);
    return {
      service,
      address,
      circuitBreakerState: breaker?.getState().state ?? "CLOSED",
    };
  });
}
