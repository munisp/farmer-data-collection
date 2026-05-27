import { logger } from '../logger.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
  timeoutMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxAttempts: number;
  private readonly timeoutMs: number;

  constructor(opts: CircuitBreakerOptions) {
    this.name = opts.name;
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.halfOpenMaxAttempts = opts.halfOpenMaxAttempts ?? 2;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.halfOpenAttempts = 0;
        logger.info(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
      } else {
        throw new CircuitBreakerOpenError(this.name);
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenAttempts >= this.halfOpenMaxAttempts) {
      this.trip();
      throw new CircuitBreakerOpenError(this.name);
    }

    try {
      const result = await this.withTimeout(fn);
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`[CircuitBreaker:${this.name}] Timeout after ${this.timeoutMs}ms`)), this.timeoutMs)
      ),
    ]);
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info(`[CircuitBreaker:${this.name}] Recovered → CLOSED`);
    }
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
    }
    if (this.failureCount >= this.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = 'OPEN';
    this.lastFailureTime = Date.now();
    logger.warn(`[CircuitBreaker:${this.name}] Tripped → OPEN (failures: ${this.failureCount})`);
  }

  getState(): { state: CircuitState; failureCount: number } {
    return { state: this.state, failureCount: this.failureCount };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker '${name}' is OPEN — requests are being rejected`);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * HTTP fetch with retry + circuit breaker.
 * Used for inter-service communication.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit & { retries?: number; retryDelayMs?: number } = {},
  breaker?: CircuitBreaker
): Promise<Response> {
  const retries = options.retries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 500;
  const { retries: _, retryDelayMs: __, ...fetchOptions } = options;

  const doFetch = async () => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          ...fetchOptions,
          signal: fetchOptions.signal ?? AbortSignal.timeout(10_000),
        });
        if (res.ok || res.status < 500) return res;
        lastError = new Error(`HTTP ${res.status} from ${url}`);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * Math.pow(2, attempt)));
      }
    }
    throw lastError ?? new Error(`fetchWithRetry failed for ${url}`);
  };

  if (breaker) {
    return breaker.execute(doFetch);
  }
  return doFetch();
}
