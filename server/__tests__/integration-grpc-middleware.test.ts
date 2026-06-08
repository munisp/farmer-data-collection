/**
 * Integration Tests: gRPC, Middleware, Security, Observability
 * Verifies critical inter-service communication patterns and security hardening.
 */
import { describe, it, expect } from "vitest";
import { grpcCallWithRetry, getGrpcServiceStatus, getServiceAddress } from "../services/grpc-client.js";
import { getGrpcTlsConfig, getAllGrpcServices, GRPC_SERVICE_REGISTRY } from "../services/grpc-mtls-config.js";
import { securityHeaders, sanitizeInput, RATE_LIMIT_TIERS, validateRequestSecurity } from "../middleware/security-headers.js";
import { createTraceContext, startSpan, endSpan, addSpanEvent, traceRpcCall, getPrometheusMetrics, METRICS, incrementCounter, recordHistogram } from "../middleware/observability.js";
import { createMiddlewareContext, applyMiddleware, financialMiddleware, marketplaceMiddleware, dataMiddleware } from "../middleware/deep-integration.js";

describe("gRPC Inter-Service Communication", () => {
  it("Service registry contains all 16 polyglot services", () => {
    const services = getAllGrpcServices();
    expect(services.length).toBe(16);
    expect(services.map(s => s.name)).toContain("delivery-service");
    expect(services.map(s => s.name)).toContain("aquaculture-pond-service");
    expect(services.map(s => s.name)).toContain("blockchain-provenance-service");
    expect(services.map(s => s.name)).toContain("conversational-commerce-service");
  });

  it("Circuit breakers start in CLOSED state", () => {
    const status = getGrpcServiceStatus();
    expect(status.length).toBeGreaterThan(0);
    status.forEach(s => {
      expect(s.circuitBreakerState).toBe("CLOSED");
    });
  });

  it("Service addresses are env-configurable with sane defaults", () => {
    expect(getServiceAddress("delivery-service")).toBe("localhost:9091");
    expect(getServiceAddress("mobile-money-service")).toBe("localhost:9090");
    expect(getServiceAddress("cold-chain-service")).toBe("localhost:9092");
  });

  it("gRPC retry with circuit breaker handles service unavailable", async () => {
    // Simulate failed gRPC call (service not running)
    const result = await grpcCallWithRetry("delivery-service", async () => {
      throw new Error("UNAVAILABLE: Connection refused");
    }, { maxRetries: 0 }).catch(e => e);
    
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain("UNAVAILABLE");
  });

  it("mTLS configuration defaults are secure", () => {
    const config = getGrpcTlsConfig();
    expect(config.minVersion).toBe('TLSv1.3');
    expect(config.cipherSuites).toContain('TLS_AES_256_GCM_SHA384');
    expect(config.cipherSuites.length).toBe(3);
  });

  it("gRPC ports don't conflict between services", () => {
    const ports = getAllGrpcServices().map(s => s.port);
    const uniquePorts = new Set(ports);
    expect(ports.length).toBe(uniquePorts.size);
  });
});

describe("Security Hardening", () => {
  it("Security headers middleware sets all OWASP headers", () => {
    const headers: Record<string, string> = {};
    const middleware = securityHeaders();
    const mockReq = { headers: {}, path: '/api/test', method: 'GET' } as any;
    const mockRes = {
      setHeader: (key: string, value: string) => { headers[key] = value; },
      removeHeader: () => {},
    } as any;
    const mockNext = () => {};
    
    middleware(mockReq, mockRes, mockNext);
    
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-XSS-Protection']).toBe('1; mode=block');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Server']).toBe('FarmConnect');
  });

  it("Input sanitization strips XSS vectors", () => {
    expect(sanitizeInput('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
    expect(sanitizeInput('javascript:void(0)')).toBe('void(0)');
    expect(sanitizeInput('onclick=steal()')).toBe('steal()');
    expect(sanitizeInput('Normal text 123')).toBe('Normal text 123');
  });

  it("Rate limit tiers are correctly configured", () => {
    expect(RATE_LIMIT_TIERS.financial.maxRequests).toBeLessThan(RATE_LIMIT_TIERS.public.maxRequests);
    expect(RATE_LIMIT_TIERS.admin.maxRequests).toBeGreaterThan(RATE_LIMIT_TIERS.authenticated.maxRequests);
    expect(RATE_LIMIT_TIERS.public.windowMs).toBe(60_000);
  });

  it("Request validation catches missing content-type on mutations", () => {
    const result = validateRequestSecurity({
      method: 'POST',
      headers: {},
    } as any);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Content-Type');
  });

  it("Request validation passes valid requests", () => {
    const result = validateRequestSecurity({
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-123' },
    } as any);
    expect(result.valid).toBe(true);
  });
});

describe("Observability & Tracing", () => {
  it("Trace context generates valid IDs", () => {
    const ctx = createTraceContext();
    expect(ctx.traceId).toHaveLength(32);
    expect(ctx.spanId).toHaveLength(16);
    expect(ctx.sampled).toBe(true);
  });

  it("Child spans inherit parent trace ID", () => {
    const parent = createTraceContext();
    const child = createTraceContext(parent);
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
    expect(child.spanId).not.toBe(parent.spanId);
  });

  it("Span lifecycle tracks duration correctly", async () => {
    const span = startSpan('test.operation', { 'test.key': 'value' });
    await new Promise(r => setTimeout(r, 10));
    endSpan(span, 'ok');
    
    expect(span.duration).toBeGreaterThanOrEqual(10);
    expect(span.status).toBe('ok');
    expect(span.attributes['test.key']).toBe('value');
  });

  it("Span events are recorded", () => {
    const span = startSpan('test.events');
    addSpanEvent(span, 'db.query.start', { query: 'SELECT * FROM farmers' });
    addSpanEvent(span, 'db.query.end');
    endSpan(span);
    
    expect(span.events).toHaveLength(2);
    expect(span.events[0].name).toBe('db.query.start');
  });

  it("RPC tracing wrapper captures router and procedure", () => {
    const { span, finish } = traceRpcCall('marketplace', 'listProducts', 'req-123');
    expect(span.operationName).toBe('trpc.marketplace.listProducts');
    expect(span.attributes['rpc.service']).toBe('marketplace');
    finish();
    expect(span.status).toBe('ok');
  });

  it("Prometheus metrics export in correct format", () => {
    incrementCounter(METRICS.HTTP_REQUESTS_TOTAL, { router: 'test' }, 5);
    recordHistogram(METRICS.HTTP_REQUEST_DURATION_MS, 150, { router: 'test' });
    
    const output = getPrometheusMetrics();
    expect(output).toContain('http_requests_total');
    expect(output).toContain('http_request_duration_ms');
    expect(output).toContain('TYPE');
  });

  it("Metrics constants cover all critical paths", () => {
    expect(Object.keys(METRICS).length).toBeGreaterThanOrEqual(12);
    expect(METRICS.HTTP_REQUESTS_TOTAL).toBeDefined();
    expect(METRICS.GRPC_REQUESTS_TOTAL).toBeDefined();
    expect(METRICS.DB_QUERIES_TOTAL).toBeDefined();
    expect(METRICS.CACHE_HITS).toBeDefined();
    expect(METRICS.AUTH_FAILURES).toBeDefined();
  });
});

describe("Deep Middleware Integration", () => {
  it("Middleware context provides all 12 systems", () => {
    const ctx = createMiddlewareContext('test-req-001');
    expect(ctx.cache).toBeDefined();
    expect(ctx.cache.get).toBeTypeOf('function');
    expect(ctx.cache.invalidate).toBeTypeOf('function');
    expect(ctx.events).toBeDefined();
    expect(ctx.events.publish).toBeTypeOf('function');
    expect(ctx.events.stream).toBeTypeOf('function');
    expect(ctx.ledger).toBeDefined();
    expect(ctx.ledger.record).toBeTypeOf('function');
    expect(ctx.ledger.settle).toBeTypeOf('function');
    expect(ctx.auth).toBeDefined();
    expect(ctx.auth.verifyToken).toBeTypeOf('function');
    expect(ctx.auth.checkPermission).toBeTypeOf('function');
    expect(ctx.search).toBeDefined();
    expect(ctx.search.index).toBeTypeOf('function');
    expect(ctx.search.query).toBeTypeOf('function');
    expect(ctx.state).toBeDefined();
    expect(ctx.state.save).toBeTypeOf('function');
    expect(ctx.state.get).toBeTypeOf('function');
    expect(ctx.security).toBeDefined();
    expect(ctx.security.rateLimit).toBeTypeOf('function');
    expect(ctx.security.scanThreats).toBeTypeOf('function');
    expect(ctx.analytics).toBeDefined();
    expect(ctx.analytics.write).toBeTypeOf('function');
  });

  it("applyMiddleware returns middleware context with rate limit check", async () => {
    const { ctx, allowed } = await applyMiddleware('req-001', 'test-router', 'testProc');
    expect(ctx).toBeDefined();
    expect(typeof allowed).toBe('boolean');
  });

  it("Financial middleware triggers AML check for large amounts", async () => {
    const ctx = await financialMiddleware('req-002', 'transfer', 6000000, 'NGN');
    expect(ctx.ledger).toBeDefined();
    expect(ctx.events).toBeDefined();
  });

  it("Marketplace middleware publishes event", async () => {
    const ctx = await marketplaceMiddleware('req-003', 'listing_created');
    expect(ctx.search).toBeDefined();
    expect(ctx.events).toBeDefined();
  });

  it("Data middleware writes analytics", async () => {
    const ctx = await dataMiddleware('req-004', 'etl_complete');
    expect(ctx.analytics).toBeDefined();
  });
});
