/**
 * caddy-router.ts
 *
 * tRPC router for Caddy edge gateway management.
 * Provides platform admins with real-time control over:
 * - Gateway health and metrics
 * - Dynamic route management
 * - TLS certificate status
 * - Rate limit zone management
 * - IP blocking/unblocking
 * - Blue/green deployment switching
 * - Canary traffic splitting
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import {
  getCaddyHealth,
  getCaddyVersion,
  addRoute,
  removeRoute,
  blockIP,
  unblockIP,
  switchDeployment,
  setCanaryWeight,
  registerMicroservice,
  deregisterMicroservice,
  collectMetrics,
  updateRateLimitZone,
  loadCustomCertificate,
} from "../services/caddy-service.js";
import { logger } from "../logger.js";

export const caddyRouter = router({
  // ── Health & Status ────────────────────────────────────────────────────────

  /**
   * Get the health status of the Caddy edge gateway.
   * Available to all authenticated users for transparency.
   */
  getHealth: protectedProcedure.query(async () => {
    return getCaddyHealth();
  }),

  /**
   * Get Caddy version information.
   */
  getVersion: publicProcedure.query(async () => {
    return { version: await getCaddyVersion() };
  }),

  /**
   * Collect Prometheus metrics from Caddy.
   * Admin only.
   */
  getMetrics: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new Error("Admin access required");
    }
    const metrics = await collectMetrics();
    return { metrics, timestamp: new Date().toISOString() };
  }),

  // ── Route Management ───────────────────────────────────────────────────────

  /**
   * Add a dynamic route to Caddy.
   * Used for tenant-specific subdomains and feature flags.
   */
  addRoute: protectedProcedure
    .input(
      z.object({
        serverId: z.string().default("srv0"),
        routeId: z.string(),
        host: z.string(),
        upstreamHost: z.string(),
        upstreamPort: z.number().int().min(1).max(65535),
        requireAuth: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Admin access required");
      }

      await addRoute(input.serverId, {
        id: input.routeId,
        match: [{ host: [input.host] }],
        handle: [
          {
            handler: "reverse_proxy",
            upstreams: [{ dial: `${input.upstreamHost}:${input.upstreamPort}` }],
          },
        ],
      });

      logger.info("Dynamic route added by admin", { routeId: input.routeId, host: input.host });
      return { success: true, routeId: input.routeId };
    }),

  /**
   * Remove a dynamic route from Caddy.
   */
  removeRoute: protectedProcedure
    .input(
      z.object({
        serverId: z.string().default("srv0"),
        routeId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Admin access required");
      }

      await removeRoute(input.serverId, input.routeId);
      return { success: true };
    }),

  // ── Security Management ────────────────────────────────────────────────────

  /**
   * Block an IP address at the edge gateway.
   * Immediately effective without restart.
   */
  blockIP: protectedProcedure
    .input(
      z.object({
        ip: z.string().regex(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]+$/, "Invalid IP address"),
        reason: z.string().min(1).max(500),
        durationHours: z.number().int().min(1).max(8760).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!["admin", "security-officer"].includes(ctx.user?.role ?? "")) {
        throw new Error("Security officer or admin access required");
      }

      await blockIP(input.ip, input.reason);
      logger.warn("IP blocked at Caddy edge", { ip: input.ip, reason: input.reason, blockedBy: ctx.user?.id });
      return { success: true, ip: input.ip, blockedAt: new Date().toISOString() };
    }),

  /**
   * Unblock a previously blocked IP address.
   */
  unblockIP: protectedProcedure
    .input(z.object({ ip: z.string().regex(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]+$/, "Invalid IP address") }))
    .mutation(async ({ input, ctx }) => {
      if (!["admin", "security-officer"].includes(ctx.user?.role ?? "")) {
        throw new Error("Security officer or admin access required");
      }

      await unblockIP(input.ip);
      logger.info("IP unblocked at Caddy edge", { ip: input.ip, unblockedBy: ctx.user?.id });
      return { success: true };
    }),

  // ── Rate Limiting ──────────────────────────────────────────────────────────

  /**
   * Update rate limit zones dynamically.
   * Useful for temporarily increasing limits for trusted partners.
   */
  updateRateLimit: protectedProcedure
    .input(
      z.object({
        zoneName: z.string(),
        eventsPerWindow: z.number().int().min(1).max(10000),
        windowSeconds: z.number().int().min(1).max(3600),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Admin access required");
      }

      await updateRateLimitZone(
        input.zoneName,
        input.eventsPerWindow,
        input.windowSeconds,
      );

      return {
        success: true,
        zone: input.zoneName,
        limit: `${input.eventsPerWindow} requests per ${input.windowSeconds}s`,
      };
    }),

  // ── Deployment Management ──────────────────────────────────────────────────

  /**
   * Switch between blue and green deployments.
   * Zero-downtime deployment via Caddy upstream switching.
   */
  switchDeployment: protectedProcedure
    .input(
      z.object({
        target: z.enum(["blue", "green"]),
        servicePort: z.number().int().min(1).max(65535).default(3000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Admin access required");
      }

      await switchDeployment(input.target, input.servicePort);
      logger.info("Blue/green deployment switched", { target: input.target, servicePort: input.servicePort, switchedBy: ctx.user?.id });
      return {
        success: true,
        activeDeployment: input.target,
        switchedAt: new Date().toISOString(),
      };
    }),

  /**
   * Configure canary deployment traffic splitting.
   */
  setCanaryWeight: protectedProcedure
    .input(
      z.object({
        stablePort: z.number().int().default(3000),
        canaryPort: z.number().int().default(3001),
        canaryWeightPercent: z.number().int().min(0).max(100),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Admin access required");
      }

      await setCanaryWeight(input.stablePort, input.canaryPort, input.canaryWeightPercent);
      return {
        success: true,
        stableWeight: 100 - input.canaryWeightPercent,
        canaryWeight: input.canaryWeightPercent,
      };
    }),

  // ── Microservice Registry ──────────────────────────────────────────────────

  /**
   * Register a new microservice with the Caddy edge gateway.
   * Automatically creates a subdomain route with optional auth.
   */
  registerMicroservice: protectedProcedure
    .input(
      z.object({
        subdomain: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/),
        serviceHost: z.string(),
        servicePort: z.number().int().min(1).max(65535),
        requireAuth: z.boolean().default(true),
        rateLimitPerMinute: z.number().int().min(1).max(10000).default(100),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Admin access required");
      }

      await registerMicroservice(input);
      return {
        success: true,
        url: `https://${input.subdomain}.farmconnect.africa`,
        registeredAt: new Date().toISOString(),
      };
    }),

  /**
   * Deregister a microservice from the Caddy edge gateway.
   */
  deregisterMicroservice: protectedProcedure
    .input(z.object({ subdomain: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Admin access required");
      }

      await deregisterMicroservice(input.subdomain);
      return { success: true };
    }),

  // ── TLS Certificate Management ─────────────────────────────────────────────

  /**
   * Load a custom TLS certificate (e.g., from HashiCorp Vault PKI).
   */
  loadCertificate: protectedProcedure
    .input(
      z.object({
        certPem: z.string().startsWith("-----BEGIN CERTIFICATE-----"),
        keyPem: z.string().startsWith("-----BEGIN"),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Admin access required");
      }

      await loadCustomCertificate(input.certPem, input.keyPem, input.tags);
      return { success: true, loadedAt: new Date().toISOString() };
    }),

  // ── Architecture Info ──────────────────────────────────────────────────────

  /**
   * Get the full edge gateway architecture description.
   * Useful for the admin dashboard and documentation.
   */
  getArchitecture: publicProcedure.query(() => {
    return {
      layers: [
        {
          name: "Caddy Edge Gateway",
          role: "TLS termination, HTTP/3, rate limiting, forward-auth, security headers",
          port: 443,
          features: [
            "Automatic TLS via Let's Encrypt / ZeroSSL",
            "HTTP/2 and HTTP/3 (QUIC) support",
            "Forward-auth to Keycloak OAuth2 Proxy",
            "Edge-level rate limiting (token bucket)",
            "Security headers (HSTS, CSP, X-Frame-Options)",
            "WebSocket proxying",
            "Blue/green and canary deployment support",
            "Dynamic route management via Admin API",
            "Prometheus metrics",
            "Structured JSON access logs → Loki",
          ],
        },
        {
          name: "Keycloak OAuth2 Proxy",
          role: "OIDC token validation, session management, header injection",
          port: 4180,
          features: [
            "Validates Keycloak JWT tokens",
            "Injects X-Auth-Request-User/Email/Groups headers",
            "Redis-backed session store for horizontal scaling",
            "PKCE support",
            "Role-based access control",
          ],
        },
        {
          name: "OpenAppSec WAF",
          role: "Deep request inspection, ML-based threat detection",
          port: 80,
          features: [
            "OWASP Top 10 protection",
            "ML-based anomaly detection",
            "API schema validation",
            "Bot protection",
            "Data loss prevention",
          ],
        },
        {
          name: "APISIX API Gateway",
          role: "Plugin execution, routing, load balancing, observability",
          port: 9080,
          features: [
            "JWT validation (second layer)",
            "Request/response transformation",
            "Load balancing across microservices",
            "Plugin ecosystem (rate limit, auth, tracing)",
            "OpenTelemetry integration",
            "gRPC transcoding",
          ],
        },
        {
          name: "Microservices",
          role: "Business logic execution",
          features: [
            "Node.js (tRPC API server)",
            "Go (high-performance services)",
            "Python (ML, Temporal workers)",
            "Rust (ultra-low-latency services)",
          ],
        },
      ],
      dataFlow: "Client → Caddy (TLS+Auth) → OpenAppSec (WAF) → APISIX (routing) → Microservices",
      tlsStrategy: "Caddy handles ALL TLS. Internal services communicate over plain HTTP within the Docker network.",
      authFlow: "Caddy forward_auth → oauth2-proxy → Keycloak OIDC → JWT validation → X-Auth headers injected",
    };
  }),
});
