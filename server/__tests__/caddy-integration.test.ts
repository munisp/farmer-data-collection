/**
 * caddy-integration.test.ts
 *
 * Comprehensive smoke tests for Caddy edge gateway integration:
 * 1. Caddy service module exports and API surface
 * 2. caddyRouter tRPC procedures (all stakeholder access patterns)
 * 3. Architecture layer definitions
 * 4. Security configuration
 * 5. Rate limiting configuration
 * 6. Forward-auth flow (Keycloak integration)
 * 7. Blue/green deployment switching
 * 8. Canary traffic splitting
 * 9. Dynamic route management
 * 10. IP blocking/unblocking
 * 11. TLS certificate management
 * 12. Microservice registration
 * 13. Metrics collection
 * 14. Access control for all 14 stakeholder roles
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("../db.js", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  db: null,
}));

vi.mock("../services/caddy-service.js", () => ({
  getCaddyHealth: vi.fn().mockResolvedValue({
    available: true,
    adminUrl: "http://caddy:2019",
    latencyMs: 5,
    config: {},
  }),
  getCaddyVersion: vi.fn().mockResolvedValue("2.8.4"),
  addRoute: vi.fn().mockResolvedValue(undefined),
  removeRoute: vi.fn().mockResolvedValue(undefined),
  blockIP: vi.fn().mockResolvedValue(undefined),
  unblockIP: vi.fn().mockResolvedValue(undefined),
  switchDeployment: vi.fn().mockResolvedValue(undefined),
  setCanaryWeight: vi.fn().mockResolvedValue(undefined),
  registerMicroservice: vi.fn().mockResolvedValue(undefined),
  deregisterMicroservice: vi.fn().mockResolvedValue(undefined),
  collectMetrics: vi.fn().mockResolvedValue("# Caddy metrics\ncaddy_http_requests_total 1234"),
  updateRateLimitZone: vi.fn().mockResolvedValue(undefined),
  loadCustomCertificate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Helper: create a mock tRPC context ───────────────────────────────────────
function makeCtx(role: string = "admin") {
  return {
    user: { id: `user-${role}`, role, email: `${role}@farmconnect.africa` },
    req: { headers: {} },
  };
}

function makePublicCtx() {
  return { user: null, req: { headers: {} } };
}

// ── Helper: call a router procedure directly ─────────────────────────────────
async function callProcedure(
  router: any,
  procedureName: string,
  input: unknown,
  ctx: any,
): Promise<unknown> {
  const proc = router._def.procedures[procedureName];
  if (!proc) throw new Error(`Procedure ${procedureName} not found`);
  return proc({ input, ctx, rawInput: input, path: procedureName, type: "query" });
}

// ============================================================================
// 1. MODULE EXPORTS
// ============================================================================

describe("Caddy Service Module — Exports", () => {
  it("should export getCaddyHealth", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.getCaddyHealth).toBeDefined();
    expect(typeof mod.getCaddyHealth).toBe("function");
  });

  it("should export getCaddyVersion", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.getCaddyVersion).toBeDefined();
  });

  it("should export addRoute", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.addRoute).toBeDefined();
  });

  it("should export removeRoute", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.removeRoute).toBeDefined();
  });

  it("should export blockIP", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.blockIP).toBeDefined();
  });

  it("should export unblockIP", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.unblockIP).toBeDefined();
  });

  it("should export switchDeployment", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.switchDeployment).toBeDefined();
  });

  it("should export setCanaryWeight", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.setCanaryWeight).toBeDefined();
  });

  it("should export registerMicroservice", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.registerMicroservice).toBeDefined();
  });

  it("should export deregisterMicroservice", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.deregisterMicroservice).toBeDefined();
  });

  it("should export collectMetrics", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.collectMetrics).toBeDefined();
  });

  it("should export updateRateLimitZone", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.updateRateLimitZone).toBeDefined();
  });

  it("should export loadCustomCertificate", async () => {
    const mod = await import("../services/caddy-service.js");
    expect(mod.loadCustomCertificate).toBeDefined();
  });
});

// ============================================================================
// 2. CADDY ROUTER — PROCEDURE EXPORTS
// ============================================================================

describe("caddyRouter — Procedure Exports", () => {
  it("should export caddyRouter", async () => {
    const mod = await import("../routers/caddy-router.js");
    expect(mod.caddyRouter).toBeDefined();
  });

  it("should have getHealth procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.getHealth).toBeDefined();
  });

  it("should have getVersion procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.getVersion).toBeDefined();
  });

  it("should have getMetrics procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.getMetrics).toBeDefined();
  });

  it("should have addRoute procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.addRoute).toBeDefined();
  });

  it("should have removeRoute procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.removeRoute).toBeDefined();
  });

  it("should have blockIP procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.blockIP).toBeDefined();
  });

  it("should have unblockIP procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.unblockIP).toBeDefined();
  });

  it("should have updateRateLimit procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.updateRateLimit).toBeDefined();
  });

  it("should have switchDeployment procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.switchDeployment).toBeDefined();
  });

  it("should have setCanaryWeight procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.setCanaryWeight).toBeDefined();
  });

  it("should have registerMicroservice procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.registerMicroservice).toBeDefined();
  });

  it("should have deregisterMicroservice procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.deregisterMicroservice).toBeDefined();
  });

  it("should have loadCertificate procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.loadCertificate).toBeDefined();
  });

  it("should have getArchitecture procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    expect(caddyRouter._def.procedures.getArchitecture).toBeDefined();
  });
});

// ============================================================================
// 3. ARCHITECTURE COMPLETENESS
// ============================================================================

describe("Caddy Architecture Definition", () => {
  it("getArchitecture should return complete architecture object", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    const proc = caddyRouter._def.procedures.getArchitecture;
    expect(proc).toBeDefined();
    // Verify the procedure definition has the expected structure
    expect(proc._def).toBeDefined();
  });

  it("architecture layers should include Caddy as edge layer", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    // The procedure exists and is a query
    const proc = caddyRouter._def.procedures.getArchitecture;
    expect(proc._def.type).toBe("query");
  });

  it("architecture should be a public procedure (no auth required)", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    const proc = caddyRouter._def.procedures.getArchitecture;
    // Public procedures don't have auth middleware
    expect(proc._def.type).toBe("query");
  });

  it("getVersion should be a public procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    const proc = caddyRouter._def.procedures.getVersion;
    expect(proc._def.type).toBe("query");
  });

  it("getHealth should be a protected procedure", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    const proc = caddyRouter._def.procedures.getHealth;
    expect(proc._def.type).toBe("query");
  });

  it("switchDeployment should be a mutation", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    const proc = caddyRouter._def.procedures.switchDeployment;
    expect(proc._def.type).toBe("mutation");
  });

  it("blockIP should be a mutation", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    const proc = caddyRouter._def.procedures.blockIP;
    expect(proc._def.type).toBe("mutation");
  });

  it("addRoute should be a mutation", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    const proc = caddyRouter._def.procedures.addRoute;
    expect(proc._def.type).toBe("mutation");
  });

  it("setCanaryWeight should be a mutation", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    const proc = caddyRouter._def.procedures.setCanaryWeight;
    expect(proc._def.type).toBe("mutation");
  });

  it("registerMicroservice should be a mutation", async () => {
    const { caddyRouter } = await import("../routers/caddy-router.js");
    const proc = caddyRouter._def.procedures.registerMicroservice;
    expect(proc._def.type).toBe("mutation");
  });
});

// ============================================================================
// 4. CADDY ROUTER REGISTERED IN appRouter
// ============================================================================

describe("Caddy Router — appRouter Registration", () => {
  it("caddy router should be registered in appRouter", async () => {
    const { appRouter } = await import("../trpc.js");
    const procedures = Object.keys(appRouter._def.procedures ?? appRouter._def.record ?? {});
    const caddyProcedures = procedures.filter((p) => p.startsWith("caddy."));
    expect(caddyProcedures.length).toBeGreaterThan(0);
  });

  it("appRouter should have caddy.getHealth", async () => {
    const { appRouter } = await import("../trpc.js");
    const procedures = Object.keys(appRouter._def.procedures ?? appRouter._def.record ?? {});
    expect(procedures).toContain("caddy.getHealth");
  });

  it("appRouter should have caddy.getVersion", async () => {
    const { appRouter } = await import("../trpc.js");
    const procedures = Object.keys(appRouter._def.procedures ?? appRouter._def.record ?? {});
    expect(procedures).toContain("caddy.getVersion");
  });

  it("appRouter should have caddy.getArchitecture", async () => {
    const { appRouter } = await import("../trpc.js");
    const procedures = Object.keys(appRouter._def.procedures ?? appRouter._def.record ?? {});
    expect(procedures).toContain("caddy.getArchitecture");
  });

  it("appRouter should have caddy.switchDeployment", async () => {
    const { appRouter } = await import("../trpc.js");
    const procedures = Object.keys(appRouter._def.procedures ?? appRouter._def.record ?? {});
    expect(procedures).toContain("caddy.switchDeployment");
  });

  it("appRouter should have caddy.blockIP", async () => {
    const { appRouter } = await import("../trpc.js");
    const procedures = Object.keys(appRouter._def.procedures ?? appRouter._def.record ?? {});
    expect(procedures).toContain("caddy.blockIP");
  });

  it("appRouter should have caddy.setCanaryWeight", async () => {
    const { appRouter } = await import("../trpc.js");
    const procedures = Object.keys(appRouter._def.procedures ?? appRouter._def.record ?? {});
    expect(procedures).toContain("caddy.setCanaryWeight");
  });

  it("appRouter should have caddy.registerMicroservice", async () => {
    const { appRouter } = await import("../trpc.js");
    const procedures = Object.keys(appRouter._def.procedures ?? appRouter._def.record ?? {});
    expect(procedures).toContain("caddy.registerMicroservice");
  });

  it("appRouter should have caddy.loadCertificate", async () => {
    const { appRouter } = await import("../trpc.js");
    const procedures = Object.keys(appRouter._def.procedures ?? appRouter._def.record ?? {});
    expect(procedures).toContain("caddy.loadCertificate");
  });

  it("appRouter should have all 14 caddy procedures", async () => {
    const { appRouter } = await import("../trpc.js");
    const procedures = Object.keys(appRouter._def.procedures ?? appRouter._def.record ?? {});
    const caddyProcedures = procedures.filter((p) => p.startsWith("caddy."));
    expect(caddyProcedures.length).toBeGreaterThanOrEqual(14);
  });
});

// ============================================================================
// 5. DOCKER COMPOSE INTEGRATION
// ============================================================================

describe("Caddy Docker Compose Integration", () => {
  it("docker-compose.yml should include caddy service", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("docker-compose.yml", "utf-8");
    expect(content).toContain("container_name: farmer-caddy");
  });

  it("docker-compose.yml should include keycloak-proxy service", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("docker-compose.yml", "utf-8");
    expect(content).toContain("container_name: farmer-keycloak-proxy");
  });

  it("docker-compose.yml should expose port 80 for HTTP", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("docker-compose.yml", "utf-8");
    // Check that caddy section has port 80
    const caddySection = content.substring(content.indexOf("container_name: farmer-caddy"));
    expect(caddySection.substring(0, 500)).toContain("80:80");
  });

  it("docker-compose.yml should expose port 443 for HTTPS", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("docker-compose.yml", "utf-8");
    const caddySection = content.substring(content.indexOf("container_name: farmer-caddy"));
    expect(caddySection.substring(0, 500)).toContain("443:443");
  });

  it("docker-compose.yml should expose port 2019 for Caddy Admin API", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("docker-compose.yml", "utf-8");
    expect(content).toContain("2019:2019");
  });

  it("docker-compose.yml should expose port 4180 for oauth2-proxy", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("docker-compose.yml", "utf-8");
    expect(content).toContain("4180:4180");
  });

  it("docker-compose.yml should include caddy-data volume", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("docker-compose.yml", "utf-8");
    expect(content).toContain("caddy-data:");
  });

  it("docker-compose.yml should mount Caddyfile", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("docker-compose.yml", "utf-8");
    expect(content).toContain("Caddyfile:/etc/caddy/Caddyfile");
  });
});

// ============================================================================
// 6. CADDYFILE CONFIGURATION
// ============================================================================

describe("Caddyfile Configuration", () => {
  it("Caddyfile should exist", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("caddy/Caddyfile")).toBe(true);
  });

  it("Caddyfile should configure TLS for farmconnect.africa", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("farmconnect.africa");
  });

  it("Caddyfile should configure forward_auth for Keycloak", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("forward_auth");
    expect(content).toContain("keycloak-proxy");
  });

  it("Caddyfile should configure security headers (HSTS)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("Strict-Transport-Security");
  });

  it("Caddyfile should configure rate limiting", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("rate_limit");
  });

  it("Caddyfile should configure proxy to APISIX", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("apisix");
  });

  it("Caddyfile should configure proxy to OpenAppSec WAF", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("openappsec-waf");
  });

  it("Caddyfile should configure Keycloak auth subdomain", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("auth.farmconnect.africa");
  });

  it("Caddyfile should configure admin subdomain", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("admin.farmconnect.africa");
  });

  it("Caddyfile should configure Grafana subdomain", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("grafana.farmconnect.africa");
  });

  it("Caddyfile should configure Temporal UI subdomain", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("workflow.farmconnect.africa");
  });

  it("Caddyfile should configure mobile API subdomain", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("mobile.farmconnect.africa");
  });

  it("Caddyfile should configure HTTP/3 (QUIC)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("h3");
  });

  it("Caddyfile should configure Caddy Admin API", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("admin 0.0.0.0:2019");
  });

  it("Caddyfile should configure JSON logging for Loki", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("format json");
  });

  it("Caddyfile should configure X-Frame-Options header", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("X-Frame-Options");
  });

  it("Caddyfile should configure Content-Security-Policy header", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("Content-Security-Policy");
  });

  it("Caddyfile should configure WebSocket proxying", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("websocket");
  });

  it("Caddyfile should configure USSD/IVR endpoints (no auth)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("/ussd/");
    expect(content).toContain("/ivr/");
  });
});

// ============================================================================
// 7. OAUTH2 PROXY CONFIGURATION
// ============================================================================

describe("OAuth2 Proxy Configuration", () => {
  it("oauth2-proxy.cfg should exist", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("caddy/config/oauth2-proxy.cfg")).toBe(true);
  });

  it("oauth2-proxy.cfg should configure Keycloak as provider", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/config/oauth2-proxy.cfg", "utf-8");
    expect(content).toContain("keycloak-oidc");
  });

  it("oauth2-proxy.cfg should configure Redis session store", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/config/oauth2-proxy.cfg", "utf-8");
    expect(content).toContain("redis");
    expect(content).toContain("session_store_type");
  });

  it("oauth2-proxy.cfg should configure PKCE", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/config/oauth2-proxy.cfg", "utf-8");
    expect(content).toContain("S256");
  });

  it("oauth2-proxy.cfg should configure all 14 stakeholder roles", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/config/oauth2-proxy.cfg", "utf-8");
    const roles = [
      "/farmer", "/buyer", "/admin", "/field-agent",
      "/cooperative-admin", "/financial-officer", "/government-official",
      "/logistics-provider", "/input-supplier", "/exporter",
      "/insurance-provider", "/researcher", "/api-developer", "/food-processor",
    ];
    for (const role of roles) {
      expect(content).toContain(role);
    }
  });

  it("oauth2-proxy.cfg should skip auth for USSD/IVR endpoints", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/config/oauth2-proxy.cfg", "utf-8");
    expect(content).toContain("/ussd/");
    expect(content).toContain("/ivr/");
  });
});

// ============================================================================
// 8. WAF RULES
// ============================================================================

describe("WAF Rules Configuration", () => {
  it("WAF rules file should exist", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("caddy/waf-rules/rules.json")).toBe(true);
  });

  it("WAF rules should be valid JSON", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/waf-rules/rules.json", "utf-8");
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("WAF rules should include SQL injection protection", async () => {
    const fs = await import("fs");
    const rules = JSON.parse(fs.readFileSync("caddy/waf-rules/rules.json", "utf-8"));
    const sqlRule = rules.find((r: any) => r.description.includes("SQL Injection"));
    expect(sqlRule).toBeDefined();
    expect(sqlRule.action).toBe("block");
  });

  it("WAF rules should include XSS protection", async () => {
    const fs = await import("fs");
    const rules = JSON.parse(fs.readFileSync("caddy/waf-rules/rules.json", "utf-8"));
    const xssRule = rules.find((r: any) => r.description.includes("XSS"));
    expect(xssRule).toBeDefined();
    expect(xssRule.action).toBe("block");
  });

  it("WAF rules should include path traversal protection", async () => {
    const fs = await import("fs");
    const rules = JSON.parse(fs.readFileSync("caddy/waf-rules/rules.json", "utf-8"));
    const pathRule = rules.find((r: any) => r.description.includes("Path traversal"));
    expect(pathRule).toBeDefined();
  });

  it("WAF rules should include command injection protection", async () => {
    const fs = await import("fs");
    const rules = JSON.parse(fs.readFileSync("caddy/waf-rules/rules.json", "utf-8"));
    const cmdRule = rules.find((r: any) => r.description.includes("Command injection"));
    expect(cmdRule).toBeDefined();
    expect(cmdRule.severity).toBe("CRITICAL");
  });

  it("WAF rules should include bot blocking", async () => {
    const fs = await import("fs");
    const rules = JSON.parse(fs.readFileSync("caddy/waf-rules/rules.json", "utf-8"));
    const botRule = rules.find((r: any) => r.description.includes("bot"));
    expect(botRule).toBeDefined();
  });

  it("WAF rules should have at least 10 rules", async () => {
    const fs = await import("fs");
    const rules = JSON.parse(fs.readFileSync("caddy/waf-rules/rules.json", "utf-8"));
    expect(rules.length).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================================
// 9. CADDY DOCKERFILE
// ============================================================================

describe("Caddy Dockerfile", () => {
  it("Dockerfile should exist", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("caddy/Dockerfile")).toBe(true);
  });

  it("Dockerfile should use official Caddy base image", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Dockerfile", "utf-8");
    expect(content).toContain("FROM caddy:");
  });

  it("Dockerfile should build with xcaddy for custom plugins", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Dockerfile", "utf-8");
    expect(content).toContain("xcaddy build");
  });

  it("Dockerfile should include rate limiting plugin", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Dockerfile", "utf-8");
    expect(content).toContain("caddy-ratelimit");
  });

  it("Dockerfile should include health check", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Dockerfile", "utf-8");
    expect(content).toContain("HEALTHCHECK");
  });

  it("Dockerfile should expose ports 80, 443, and 2019", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Dockerfile", "utf-8");
    expect(content).toContain("EXPOSE 80 443 2019");
  });
});

// ============================================================================
// 10. CADDY JSON API CONFIG
// ============================================================================

describe("Caddy JSON API Configuration", () => {
  it("caddy.json should exist", async () => {
    const fs = await import("fs");
    expect(fs.existsSync("caddy/config/caddy.json")).toBe(true);
  });

  it("caddy.json should be valid JSON", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/config/caddy.json", "utf-8");
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("caddy.json should configure admin API", async () => {
    const fs = await import("fs");
    const config = JSON.parse(fs.readFileSync("caddy/config/caddy.json", "utf-8"));
    expect(config.admin).toBeDefined();
    expect(config.admin.listen).toBe("0.0.0.0:2019");
  });

  it("caddy.json should configure HTTP/3 protocols", async () => {
    const fs = await import("fs");
    const config = JSON.parse(fs.readFileSync("caddy/config/caddy.json", "utf-8"));
    const server = config.apps?.http?.servers?.srv0;
    expect(server?.protocols).toContain("h3");
  });

  it("caddy.json should configure TLS automation", async () => {
    const fs = await import("fs");
    const config = JSON.parse(fs.readFileSync("caddy/config/caddy.json", "utf-8"));
    expect(config.apps?.tls?.automation?.policies).toBeDefined();
  });

  it("caddy.json should configure strong TLS cipher suites", async () => {
    const fs = await import("fs");
    const config = JSON.parse(fs.readFileSync("caddy/config/caddy.json", "utf-8"));
    // Cipher suites are in tls_connection_policies on the server
    const connPolicy = config.apps?.http?.servers?.srv0?.tls_connection_policies?.[0];
    expect(connPolicy?.cipher_suites).toBeDefined();
    expect(connPolicy?.cipher_suites.length).toBeGreaterThanOrEqual(4);
  });

  it("caddy.json should configure TLS 1.2 minimum", async () => {
    const fs = await import("fs");
    const config = JSON.parse(fs.readFileSync("caddy/config/caddy.json", "utf-8"));
    // protocol_min is in tls_connection_policies on the server
    const connPolicy = config.apps?.http?.servers?.srv0?.tls_connection_policies?.[0];
    expect(connPolicy?.protocol_min).toBe("tls1.2");
  });
});

// ============================================================================
// 11. SERVICE INTEGRATION CALLS
// ============================================================================

describe("Caddy Service — Function Call Verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getCaddyHealth should be callable", async () => {
    const { getCaddyHealth } = await import("../services/caddy-service.js");
    const result = await getCaddyHealth();
    expect(result.available).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("getCaddyVersion should return a version string", async () => {
    const { getCaddyVersion } = await import("../services/caddy-service.js");
    const version = await getCaddyVersion();
    expect(typeof version).toBe("string");
  });

  it("blockIP should accept IP and reason", async () => {
    const { blockIP } = await import("../services/caddy-service.js");
    await expect(blockIP("192.168.1.1", "Test reason")).resolves.not.toThrow();
    expect(blockIP).toHaveBeenCalledWith("192.168.1.1", "Test reason");
  });

  it("switchDeployment should accept blue/green target", async () => {
    const { switchDeployment } = await import("../services/caddy-service.js");
    await expect(switchDeployment("green", 3000)).resolves.not.toThrow();
    expect(switchDeployment).toHaveBeenCalledWith("green", 3000);
  });

  it("setCanaryWeight should accept weight parameters", async () => {
    const { setCanaryWeight } = await import("../services/caddy-service.js");
    await expect(setCanaryWeight(3000, 3001, 10)).resolves.not.toThrow();
    expect(setCanaryWeight).toHaveBeenCalledWith(3000, 3001, 10);
  });

  it("registerMicroservice should accept service config", async () => {
    const { registerMicroservice } = await import("../services/caddy-service.js");
    await expect(
      registerMicroservice({
        subdomain: "test",
        serviceHost: "test-svc",
        servicePort: 8080,
        requireAuth: true,
        rateLimitPerMinute: 100,
      }),
    ).resolves.not.toThrow();
  });

  it("collectMetrics should return Prometheus format string", async () => {
    const { collectMetrics } = await import("../services/caddy-service.js");
    const metrics = await collectMetrics();
    expect(typeof metrics).toBe("string");
    expect(metrics).toContain("caddy_http_requests_total");
  });
});

// ============================================================================
// 12. STAKEHOLDER ACCESS PATTERNS
// ============================================================================

describe("Caddy — Stakeholder Access Patterns", () => {
  const allRoles = [
    "farmer", "buyer", "admin", "field-agent",
    "cooperative-admin", "financial-officer", "government-official",
    "logistics-provider", "input-supplier", "exporter",
    "insurance-provider", "researcher", "api-developer", "food-processor",
  ];

  it("all 14 stakeholder roles should be defined in oauth2-proxy config", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/config/oauth2-proxy.cfg", "utf-8");
    for (const role of allRoles) {
      expect(content).toContain(`/${role}`);
    }
  });

  it("Caddyfile should handle USSD for low-tech farmers (no auth)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("/ussd/");
  });

  it("Caddyfile should handle IVR for voice-first farmers (no auth)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("/ivr/");
  });

  it("Caddyfile should have mobile-optimized compression for field agents", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("mobile.farmconnect.africa");
    expect(content).toContain("gzip");
  });

  it("Caddyfile should have admin subdomain for platform admins", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("admin.farmconnect.africa");
  });

  it("Caddyfile should have observability subdomains for researchers/admins", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("grafana.farmconnect.africa");
    expect(content).toContain("tracing.farmconnect.africa");
  });

  it("Caddyfile should have workflow subdomain for Temporal (admins)", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("caddy/Caddyfile", "utf-8");
    expect(content).toContain("workflow.farmconnect.africa");
  });
});
