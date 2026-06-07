/**
 * Inter-Service HTTP Client with retries, circuit breaker, and timeout.
 * Used for communication between TypeScript orchestrator and polyglot services.
 */
import { logger } from "../logger.js";

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: "closed" | "open" | "half-open";
}

const circuitBreakers = new Map<string, CircuitBreakerState>();
const CB_THRESHOLD = 5;
const CB_TIMEOUT_MS = 30000;

function getCircuitBreaker(service: string): CircuitBreakerState {
  if (!circuitBreakers.has(service)) {
    circuitBreakers.set(service, { failures: 0, lastFailure: 0, state: "closed" });
  }
  return circuitBreakers.get(service)!;
}

function recordFailure(service: string): void {
  const cb = getCircuitBreaker(service);
  cb.failures++;
  cb.lastFailure = Date.now();
  if (cb.failures >= CB_THRESHOLD) cb.state = "open";
}

function recordSuccess(service: string): void {
  const cb = getCircuitBreaker(service);
  cb.failures = 0;
  cb.state = "closed";
}

function isCircuitOpen(service: string): boolean {
  const cb = getCircuitBreaker(service);
  if (cb.state === "open") {
    if (Date.now() - cb.lastFailure > CB_TIMEOUT_MS) {
      cb.state = "half-open";
      return false;
    }
    return true;
  }
  return false;
}

export interface ServiceCallOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export async function callService<T = unknown>(
  serviceName: string,
  url: string,
  options: ServiceCallOptions = {},
): Promise<T | null> {
  const { method = "GET", body, headers = {}, timeoutMs = 5000, retries = 2, retryDelayMs = 1000 } = options;

  if (isCircuitOpen(serviceName)) {
    logger.warn(`[InterService] Circuit open for ${serviceName}, skipping call`);
    return null;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }

      const data = await resp.json();
      recordSuccess(serviceName);
      return data as T;
    } catch (err) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        recordFailure(serviceName);
        logger.error(`[InterService] ${serviceName} failed after ${retries + 1} attempts`, { url, error: String(err) });
        return null;
      }
      logger.warn(`[InterService] ${serviceName} attempt ${attempt + 1} failed, retrying in ${retryDelayMs}ms`);
      await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)));
    }
  }
  return null;
}

export function getCircuitBreakerStatus(): Record<string, CircuitBreakerState> {
  const status: Record<string, CircuitBreakerState> = {};
  for (const [name, state] of circuitBreakers) {
    status[name] = { ...state };
  }
  return status;
}
