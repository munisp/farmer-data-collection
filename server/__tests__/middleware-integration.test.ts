import { describe, it, expect } from "vitest";

describe("Middleware Integration Clients", () => {
  it("should export all 12 middleware clients", async () => {
    const mod = await import("../integrations/middleware-clients.js");
    expect(mod.redis).toBeDefined();
    expect(mod.kafka).toBeDefined();
    expect(mod.tigerBeetle).toBeDefined();
    expect(mod.mojaloop).toBeDefined();
    expect(mod.keycloak).toBeDefined();
    expect(mod.permify).toBeDefined();
    expect(mod.openSearch).toBeDefined();
    expect(mod.fluvio).toBeDefined();
    expect(mod.dapr).toBeDefined();
    expect(mod.apisix).toBeDefined();
    expect(mod.openAppSec).toBeDefined();
    expect(mod.globalEventBus).toBeDefined();
  });

  it("should export getMiddlewareStatus function", async () => {
    const mod = await import("../integrations/middleware-clients.js");
    expect(typeof mod.getMiddlewareStatus).toBe("function");
  });

  it("kafka producer should accept events", async () => {
    const { kafka, globalEventBus } = await import("../integrations/middleware-clients.js");
    const events: unknown[] = [];
    globalEventBus.on("test-topic", (e) => events.push(e));
    await kafka.produce("test-topic", "key-1", { type: "test", value: 42 });
    expect(events.length).toBe(1);
  });

  it("redis client should handle unavailable gracefully", async () => {
    const { redis } = await import("../integrations/middleware-clients.js");
    const result = await redis.get("nonexistent-key");
    expect(result).toBeNull();
  });

  it("tigerbeetle should return fallback on unavailable", async () => {
    const { tigerBeetle } = await import("../integrations/middleware-clients.js");
    const result = await tigerBeetle.createTransfer({
      debitAccountId: "1", creditAccountId: "2", amount: 1000n, ledger: 1, code: 1
    });
    expect(result.id).toMatch(/^tb-/);
    expect(result.status).toBe("pending_sync");
  });

  it("mojaloop should return fallback transfer", async () => {
    const { mojaloop } = await import("../integrations/middleware-clients.js");
    const result = await mojaloop.initiateTransfer({
      payerFsp: "bank-a", payeeFsp: "bank-b", amount: 5000, currency: "NGN",
      payerIdType: "MSISDN", payerIdValue: "2348012345678",
      payeeIdType: "MSISDN", payeeIdValue: "2348098765432",
    });
    expect(result.transferId).toMatch(/^moja-/);
  });

  it("opensearch should return empty array on unavailable", async () => {
    const { openSearch } = await import("../integrations/middleware-clients.js");
    const results = await openSearch.search("farmers", { match_all: {} });
    expect(results).toEqual([]);
  });

  it("permify should allow by default when unavailable", async () => {
    const { permify } = await import("../integrations/middleware-clients.js");
    const allowed = await permify.check({ entity: "document:1", relation: "viewer", subject: "user:1" });
    expect(allowed).toBe(true);
  });
});

describe("Inter-Service Client", () => {
  it("should export callService and circuit breaker status", async () => {
    const mod = await import("../integrations/inter-service-client.js");
    expect(typeof mod.callService).toBe("function");
    expect(typeof mod.getCircuitBreakerStatus).toBe("function");
  });

  it("should handle unavailable service with retries", async () => {
    const { callService } = await import("../integrations/inter-service-client.js");
    const result = await callService("test-service", "http://localhost:99999/test", {
      retries: 0, timeoutMs: 1000
    });
    expect(result).toBeNull();
  });
});

describe("Security Module", () => {
  it("should sign and verify JWT", async () => {
    const { signJWT, verifyJWT } = await import("../integrations/security.js");
    const token = signJWT({ sub: "user-1", roles: ["farmer"] });
    expect(token.split(".")).toHaveLength(3);
    const payload = verifyJWT(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-1");
    expect(payload!.roles).toContain("farmer");
  });

  it("should reject invalid JWT", async () => {
    const { verifyJWT } = await import("../integrations/security.js");
    expect(verifyJWT("invalid.token.here")).toBeNull();
    expect(verifyJWT("")).toBeNull();
  });

  it("should check role authorization", async () => {
    const { signJWT, verifyJWT, hasRole } = await import("../integrations/security.js");
    const token = signJWT({ sub: "user-1", roles: ["farmer", "cooperative_member"] });
    const payload = verifyJWT(token)!;
    expect(hasRole(payload, "farmer")).toBe(true);
    expect(hasRole(payload, "cooperative_member")).toBe(true);
    expect(hasRole(payload, "admin")).toBe(false);
  });

  it("admin role should have access to everything", async () => {
    const { signJWT, verifyJWT, hasRole } = await import("../integrations/security.js");
    const token = signJWT({ sub: "admin-1", roles: ["admin"] });
    const payload = verifyJWT(token)!;
    expect(hasRole(payload, "farmer")).toBe(true);
    expect(hasRole(payload, "anything")).toBe(true);
  });

  it("should sanitize XSS input", async () => {
    const { sanitizeInput } = await import("../integrations/security.js");
    expect(sanitizeInput("<script>alert('xss')</script>")).toBe("scriptalert('xss')/script");
    expect(sanitizeInput("javascript:void(0)")).toBe("void(0)");
    expect(sanitizeInput("normal text")).toBe("normal text");
  });

  it("should validate allowed origins", async () => {
    const { validateOrigin } = await import("../integrations/security.js");
    expect(validateOrigin("http://localhost:5000")).toBe(true);
    expect(validateOrigin(undefined)).toBe(true);
  });

  it("mTLS config should have required fields", async () => {
    const { mTLSConfig } = await import("../integrations/security.js");
    expect(mTLSConfig.certPath).toBeDefined();
    expect(mTLSConfig.keyPath).toBeDefined();
    expect(mTLSConfig.caPath).toBeDefined();
    expect(mTLSConfig.minTlsVersion).toBe("TLSv1.3");
  });
});

describe("Service URLs Config", () => {
  it("should export all service URLs", async () => {
    const { SERVICE_URLS } = await import("../config/service-urls.js");
    expect(SERVICE_URLS.POSTGRES_URL).toBeDefined();
    expect(SERVICE_URLS.REDIS_URL).toBeDefined();
    expect(SERVICE_URLS.KAFKA_BROKERS).toBeInstanceOf(Array);
    expect(SERVICE_URLS.TIGERBEETLE_URL).toBeDefined();
    expect(SERVICE_URLS.MOJALOOP_HUB_URL).toBeDefined();
    expect(SERVICE_URLS.KEYCLOAK_URL).toBeDefined();
    expect(SERVICE_URLS.PERMIFY_URL).toBeDefined();
    expect(SERVICE_URLS.OPENSEARCH_URL).toBeDefined();
    expect(SERVICE_URLS.FLUVIO_URL).toBeDefined();
    expect(SERVICE_URLS.DAPR_HTTP_ENDPOINT).toBeDefined();
    expect(SERVICE_URLS.APISIX_ADMIN_URL).toBeDefined();
    expect(SERVICE_URLS.OPENAPPSEC_URL).toBeDefined();
  });
});
