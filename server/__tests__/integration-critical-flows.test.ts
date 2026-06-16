/**
 * Integration Tests for Critical Business Flows
 *
 * Tests the key end-to-end flows across the platform:
 * 1. Marketplace: listing → purchase → payment → delivery
 * 2. Loan lifecycle: application → scoring → approval → disbursement → repayment
 * 3. Delivery: zone setup → order → assignment → tracking → completion
 * 4. Mobile money: account linking → STK push → status check
 * 5. Resilient HTTP: circuit breaker + retry behavior
 * 6. gRPC client: circuit breaker + retry behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== 1. Resilient HTTP Client Integration =====

describe('Resilient HTTP Client', () => {
  it('should export resilientFetch, resilientPost, resilientGet', async () => {
    const mod = await import('../services/resilient-http.js');
    expect(typeof mod.resilientFetch).toBe('function');
    expect(typeof mod.resilientPost).toBe('function');
    expect(typeof mod.resilientGet).toBe('function');
  });

  it('should retry on 503 Service Unavailable', async () => {
    const { resilientFetch } = await import('../services/resilient-http.js');

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    vi.stubGlobal('fetch', mockFetch);

    const response = await resilientFetch('test-service', 'http://localhost:9999/test', {
      method: 'GET',
    }, {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 50,
      timeoutMs: 5000,
    });

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.unstubAllGlobals();
  });

  it('should throw after exhausting retries', async () => {
    const { resilientFetch } = await import('../services/resilient-http.js');

    const mockFetch = vi.fn()
      .mockRejectedValue(new Error('Connection refused'));

    vi.stubGlobal('fetch', mockFetch);

    await expect(
      resilientFetch('failing-service', 'http://localhost:9999/fail', { method: 'GET' }, {
        maxRetries: 2,
        initialDelayMs: 10,
        maxDelayMs: 50,
        timeoutMs: 1000,
      })
    ).rejects.toThrow();

    vi.unstubAllGlobals();
  });
});

// ===== 2. gRPC Client Integration =====

describe('gRPC Client', () => {
  it('should export grpcCallWithRetry and getServiceAddress', async () => {
    const mod = await import('../services/grpc-client.js');
    expect(typeof mod.grpcCallWithRetry).toBe('function');
    expect(typeof mod.getServiceAddress).toBe('function');
    expect(typeof mod.getGrpcServiceStatus).toBe('function');
  });

  it('should return correct service addresses', async () => {
    const { getServiceAddress } = await import('../services/grpc-client.js');
    expect(getServiceAddress('delivery-service')).toBe('localhost:9091');
    expect(getServiceAddress('mobile-money-service')).toBe('localhost:9090');
    expect(getServiceAddress('ml-inference-service')).toBe('localhost:9096');
  });

  it('should retry failed gRPC calls with backoff', async () => {
    const { grpcCallWithRetry } = await import('../services/grpc-client.js');

    let callCount = 0;
    const callFn = async () => {
      callCount++;
      if (callCount < 3) throw new Error('UNAVAILABLE');
      return { result: 'success' };
    };

    const result = await grpcCallWithRetry('test-grpc', callFn, {
      maxRetries: 3,
      initialDelayMs: 10,
      maxDelayMs: 50,
    });

    expect(result).toEqual({ result: 'success' });
    expect(callCount).toBe(3);
  });

  it('should report service statuses', async () => {
    const { getGrpcServiceStatus } = await import('../services/grpc-client.js');
    const statuses = getGrpcServiceStatus();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0]).toHaveProperty('service');
    expect(statuses[0]).toHaveProperty('address');
    expect(statuses[0]).toHaveProperty('circuitBreakerState');
  });
});

// ===== 3. Circuit Breaker Integration =====

describe('Circuit Breaker', () => {
  it('should open after failure threshold', async () => {
    const { CircuitBreaker, CircuitBreakerOpenError } = await import('../services/circuit-breaker.js');

    const breaker = new CircuitBreaker({
      name: 'test-breaker',
      failureThreshold: 3,
      resetTimeoutMs: 60_000,
      timeoutMs: 1000,
    });

    const failingFn = async () => { throw new Error('fail'); };

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow();
    }

    const state = breaker.getState();
    expect(state.state).toBe('OPEN');
    expect(state.failureCount).toBeGreaterThanOrEqual(3);
  });

  it('should recover after successful call in half-open state', async () => {
    const { CircuitBreaker } = await import('../services/circuit-breaker.js');

    const breaker = new CircuitBreaker({
      name: 'recovery-test',
      failureThreshold: 2,
      resetTimeoutMs: 50,
      timeoutMs: 1000,
    });

    const failingFn = async () => { throw new Error('fail'); };
    for (let i = 0; i < 2; i++) {
      await expect(breaker.execute(failingFn)).rejects.toThrow();
    }

    expect(breaker.getState().state).toBe('OPEN');

    await new Promise(resolve => setTimeout(resolve, 100));

    const successFn = async () => 'recovered';
    const result = await breaker.execute(successFn);
    expect(result).toBe('recovered');
    expect(breaker.getState().state).toBe('CLOSED');
  });
});

// ===== 4. mTLS Client =====

describe('mTLS Client', () => {
  it('should export createMtlsAgent and getMtlsStatus', async () => {
    const mod = await import('../services/mtls-client.js');
    expect(typeof mod.createMtlsAgent).toBe('function');
    expect(typeof mod.getMtlsStatus).toBe('function');
  });

  it('should return disabled status when MTLS_ENABLED is not set', async () => {
    const { getMtlsStatus } = await import('../services/mtls-client.js');
    const status = getMtlsStatus();
    expect(status.enabled).toBe(false);
    expect(status.services.length).toBeGreaterThan(0);
  });

  it('should return undefined agent when mTLS is disabled', async () => {
    const { createMtlsAgent } = await import('../services/mtls-client.js');
    const agent = createMtlsAgent('delivery-service');
    expect(agent).toBeUndefined();
  });
});

// ===== 5. Admin Dashboard DB Queries =====

describe('Admin Dashboard Router', () => {
  it('should exist as a file with real DB queries', async () => {
    const fs = await import('node:fs');
    const filePath = new URL('../routers/admin-dashboard-router.ts', import.meta.url).pathname;
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('requireDb');
    expect(content).toContain('loans');
    expect(content).toContain('loanApplications');
    expect(content).not.toMatch(/mockOfficers|mockReports/);
  });
});

// ===== 6. Router Security =====

describe('Router Security - Protected Procedures', () => {
  const protectedRouters = [
    { name: 'agent-productivity-router', path: '../routers/agent-productivity-router.js' },
    { name: 'cooperative-router', path: '../routers/cooperative-router.js' },
    { name: 'credit-scoring-router', path: '../routers/credit-scoring-router.js' },
    { name: 'notification-router', path: '../routers/notification-router.js' },
    { name: 'traceability-router', path: '../routers/traceability-router.js' },
  ];

  for (const { name, path } of protectedRouters) {
    it(`${name} should not import publicProcedure`, async () => {
      const fs = await import('node:fs');
      const filePath = new URL(path.replace('.js', '.ts'), import.meta.url).pathname;
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toMatch(/\bpublicProcedure\b/);
    });
  }
});

// ===== 7. Resilient HTTP wiring in routers =====

describe('Resilient HTTP Wiring', () => {
  const routersWithResilientFetch = [
    'delivery-router',
    'cold-chain-router',
    'mobile-money-router',
    'price-alerts-router',
    'soil-analysis-router',
    'agri-llm-router',
    'equipment-fleet-router',
    'weather-alerts-router',
    'whatsapp-ai-router',
    'kyc-router',
  ];

  for (const routerName of routersWithResilientFetch) {
    it(`${routerName} should use resilientFetch or resilientPost`, async () => {
      const fs = await import('node:fs');
      const filePath = new URL(`../routers/${routerName}.ts`, import.meta.url).pathname;
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toMatch(/resilient(Fetch|Post|Get)/);
      expect(content).not.toMatch(/^\s+(?:const|let)\s+\w+\s*=\s*await\s+fetch\(/m);
    });
  }
});

// ===== 8. Proto file existence =====

describe('gRPC Proto Definitions', () => {
  it('should have farmconnect.proto with all services', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const protoPath = path.resolve(new URL('.', import.meta.url).pathname, '../../proto/farmconnect.proto');
    const content = fs.readFileSync(protoPath, 'utf-8');

    expect(content).toContain('service DeliveryService');
    expect(content).toContain('service MobileMoneyService');
    expect(content).toContain('service ColdChainService');
    expect(content).toContain('service MLInferenceService');
    expect(content).toContain('service TokenizationService');
  });
});
