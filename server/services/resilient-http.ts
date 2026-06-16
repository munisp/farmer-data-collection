/**
 * Resilient HTTP Client
 * Wraps fetch() with retry, exponential backoff, circuit breaker, and timeout.
 * All inter-service HTTP calls should use this instead of raw fetch().
 */

import { CircuitBreaker } from './circuit-breaker.js';
import { logger } from '../logger.js';

interface ResilientFetchOptions {
  /** Maximum number of retries (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 500) */
  initialDelayMs?: number;
  /** Max delay cap in ms (default: 5000) */
  maxDelayMs?: number;
  /** Request timeout in ms (default: 10000) */
  timeoutMs?: number;
  /** HTTP methods that are safe to retry (default: GET, HEAD, OPTIONS, PUT, DELETE) */
  retryableMethods?: string[];
  /** HTTP status codes that should trigger a retry (default: 429, 500, 502, 503, 504) */
  retryableStatuses?: number[];
}

const DEFAULT_RETRYABLE_METHODS = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'];
const DEFAULT_RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

/** Per-service circuit breakers, keyed by service name */
const circuitBreakers = new Map<string, CircuitBreaker>();

function getCircuitBreaker(serviceName: string): CircuitBreaker {
  let cb = circuitBreakers.get(serviceName);
  if (!cb) {
    cb = new CircuitBreaker({
      name: serviceName,
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      halfOpenMaxAttempts: 2,
      timeoutMs: 15_000,
    });
    circuitBreakers.set(serviceName, cb);
  }
  return cb;
}

function computeDelay(attempt: number, initialDelayMs: number, maxDelayMs: number): number {
  const exponential = initialDelayMs * Math.pow(2, attempt);
  const jitter = exponential * 0.1 * (Math.random() * 2 - 1);
  return Math.min(exponential + jitter, maxDelayMs);
}

/**
 * Resilient fetch with retry + circuit breaker.
 *
 * @param serviceName  Logical service name (used for circuit breaker grouping)
 * @param url          Full URL to fetch
 * @param init         Standard RequestInit (method, headers, body, etc.)
 * @param opts         Retry / timeout configuration
 */
export async function resilientFetch(
  serviceName: string,
  url: string,
  init?: RequestInit,
  opts?: ResilientFetchOptions,
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? 3;
  const initialDelayMs = opts?.initialDelayMs ?? 500;
  const maxDelayMs = opts?.maxDelayMs ?? 5_000;
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const retryableMethods = opts?.retryableMethods ?? DEFAULT_RETRYABLE_METHODS;
  const retryableStatuses = opts?.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

  const method = (init?.method ?? 'GET').toUpperCase();
  const canRetry = retryableMethods.includes(method);
  const cb = getCircuitBreaker(serviceName);

  return cb.execute(async () => {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.ok) {
          return response;
        }

        if (canRetry && retryableStatuses.includes(response.status) && attempt < maxRetries) {
          const delay = computeDelay(attempt, initialDelayMs, maxDelayMs);
          logger.warn(
            `[resilientFetch:${serviceName}] ${method} ${url} returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        return response;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (!canRetry || attempt >= maxRetries) {
          break;
        }

        const delay = computeDelay(attempt, initialDelayMs, maxDelayMs);
        logger.warn(
          `[resilientFetch:${serviceName}] ${method} ${url} error: ${lastError.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error(`[resilientFetch:${serviceName}] Failed after ${maxRetries} retries`);
  });
}

/**
 * Convenience wrapper for JSON POST with resilience.
 */
export async function resilientPost<T = unknown>(
  serviceName: string,
  url: string,
  body: unknown,
  opts?: ResilientFetchOptions,
): Promise<T> {
  const response = await resilientFetch(
    serviceName,
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { ...opts, retryableMethods: ['POST', ...(opts?.retryableMethods ?? DEFAULT_RETRYABLE_METHODS)] },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`[${serviceName}] POST ${url} failed: ${response.status} ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Convenience wrapper for JSON GET with resilience.
 */
export async function resilientGet<T = unknown>(
  serviceName: string,
  url: string,
  opts?: ResilientFetchOptions,
): Promise<T> {
  const response = await resilientFetch(
    serviceName,
    url,
    { method: 'GET', headers: { Accept: 'application/json' } },
    opts,
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`[${serviceName}] GET ${url} failed: ${response.status} ${text.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}
