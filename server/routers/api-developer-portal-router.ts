import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

interface APIKey {
  id: string; name: string; key: string; userId: number; tier: string;
  rateLimit: number; createdAt: string; lastUsed: string; requestCount: number;
  scopes: string[]; active: boolean;
}

interface APIVersion {
  version: string; status: string; releaseDate: string; deprecationDate: string | null;
  endpoints: number; breakingChanges: string[];
}

const apiKeys: APIKey[] = [
  { id: "KEY-001", name: "Production App", key: "fc_live_a1b2c3d4e5f6", userId: 3001, tier: "enterprise", rateLimit: 10000, createdAt: "2026-01-01T00:00:00Z", lastUsed: "2026-05-27T09:00:00Z", requestCount: 245000, scopes: ["read", "write", "admin"], active: true },
  { id: "KEY-002", name: "Analytics Dashboard", key: "fc_live_x7y8z9a0b1c2", userId: 3001, tier: "pro", rateLimit: 5000, createdAt: "2026-02-15T00:00:00Z", lastUsed: "2026-05-27T08:30:00Z", requestCount: 89000, scopes: ["read", "analytics"], active: true },
  { id: "KEY-003", name: "Mobile App", key: "fc_live_m3n4o5p6q7r8", userId: 3002, tier: "standard", rateLimit: 1000, createdAt: "2026-03-01T00:00:00Z", lastUsed: "2026-05-26T22:00:00Z", requestCount: 52000, scopes: ["read", "write"], active: true },
];

const versions: APIVersion[] = [
  { version: "v3", status: "current", releaseDate: "2026-03-01", deprecationDate: null, endpoints: 245, breakingChanges: [] },
  { version: "v2", status: "deprecated", releaseDate: "2025-06-01", deprecationDate: "2026-09-01", endpoints: 198, breakingChanges: ["Removed /api/v2/legacy-farmers endpoint", "Changed pagination format"] },
  { version: "v1", status: "sunset", releaseDate: "2024-01-01", deprecationDate: "2025-12-01", endpoints: 85, breakingChanges: ["All endpoints restructured"] },
];

const sdkLanguages = [
  { language: "TypeScript/JavaScript", packageName: "@farmconnect/sdk", version: "3.2.1", downloads: 12500, installCmd: "npm install @farmconnect/sdk" },
  { language: "Python", packageName: "farmconnect-sdk", version: "3.1.0", downloads: 8200, installCmd: "pip install farmconnect-sdk" },
  { language: "Go", packageName: "github.com/farmconnect/go-sdk", version: "3.0.2", downloads: 3100, installCmd: "go get github.com/farmconnect/go-sdk" },
  { language: "Dart/Flutter", packageName: "farmconnect_flutter", version: "2.5.0", downloads: 4500, installCmd: "flutter pub add farmconnect_flutter" },
  { language: "Java/Kotlin", packageName: "io.farmconnect:sdk", version: "3.0.1", downloads: 2800, installCmd: "implementation 'io.farmconnect:sdk:3.0.1'" },
];

export const apiDeveloperPortalRouter = router({
  getVersions: publicProcedure.query(() => versions),

  getMyKeys: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => apiKeys.filter(k => k.userId === input.userId).map(k => ({ ...k, key: k.key.slice(0, 10) + "..." }))),

  createKey: protectedProcedure
    .input(z.object({ userId: z.number(), name: z.string(), tier: z.enum(["free", "standard", "pro", "enterprise"]), scopes: z.array(z.string()) }))
    .mutation(({ input }) => {
      const rateLimits: Record<string, number> = { free: 100, standard: 1000, pro: 5000, enterprise: 10000 };
      const key: APIKey = {
        id: `KEY-${String(apiKeys.length + 1).padStart(3, "0")}`, name: input.name,
        key: `fc_live_${Math.random().toString(36).slice(2, 14)}`, userId: input.userId,
        tier: input.tier, rateLimit: rateLimits[input.tier], createdAt: new Date().toISOString(),
        lastUsed: "", requestCount: 0, scopes: input.scopes, active: true,
      };
      apiKeys.push(key);
      logger.info("[APIPortal] Key created", { keyId: key.id, tier: input.tier });
      return { success: true, key: key.key, id: key.id, rateLimit: key.rateLimit };
    }),

  revokeKey: protectedProcedure
    .input(z.object({ keyId: z.string() }))
    .mutation(({ input }) => {
      const key = apiKeys.find(k => k.id === input.keyId);
      if (!key) return { success: false, error: "Key not found" };
      key.active = false;
      logger.info("[APIPortal] Key revoked", { keyId: input.keyId });
      return { success: true };
    }),

  getUsageStats: protectedProcedure
    .input(z.object({ keyId: z.string().optional(), userId: z.number() }))
    .query(({ input }) => {
      const userKeys = apiKeys.filter(k => k.userId === input.userId);
      const targetKeys = input.keyId ? userKeys.filter(k => k.id === input.keyId) : userKeys;
      const totalRequests = targetKeys.reduce((s, k) => s + k.requestCount, 0);
      return {
        totalRequests, keysActive: targetKeys.filter(k => k.active).length,
        rateLimitRemaining: targetKeys.reduce((s, k) => s + k.rateLimit, 0) - Math.round(totalRequests / 30 / 24),
        topEndpoints: [
          { endpoint: "/api/v3/farmers", calls: 45000, avgLatency: 120 },
          { endpoint: "/api/v3/marketplace/listings", calls: 38000, avgLatency: 95 },
          { endpoint: "/api/v3/payments/mobile-money", calls: 28000, avgLatency: 250 },
          { endpoint: "/api/v3/delivery/track", calls: 22000, avgLatency: 85 },
          { endpoint: "/api/v3/weather/forecast", calls: 18000, avgLatency: 180 },
        ],
        errorRate: 0.8, p50Latency: 95, p95Latency: 340, p99Latency: 890,
      };
    }),

  getSDKs: publicProcedure.query(() => sdkLanguages),

  getWebhooks: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(() => [
      { id: "WH-001", url: "https://myapp.com/webhooks/farmconnect", events: ["order.created", "payment.completed", "delivery.status_change"], active: true, successRate: 99.2, lastTriggered: "2026-05-27T09:15:00Z" },
      { id: "WH-002", url: "https://analytics.myapp.com/ingest", events: ["farmer.registered", "listing.created", "loan.approved"], active: true, successRate: 98.8, lastTriggered: "2026-05-27T08:45:00Z" },
    ]),

  getDocumentation: publicProcedure
    .input(z.object({ section: z.string().optional() }))
    .query(({ input }) => {
      const sections = {
        overview: { title: "API Overview", content: "FarmConnect API v3 provides RESTful and tRPC endpoints for agricultural commerce, fintech, supply chain, and IoT." },
        authentication: { title: "Authentication", content: "Use Bearer token in Authorization header. API keys can be created in the developer portal." },
        rate_limits: { title: "Rate Limits", content: "Free: 100/hr, Standard: 1000/hr, Pro: 5000/hr, Enterprise: 10000/hr. Headers: X-RateLimit-Remaining, X-RateLimit-Reset" },
        errors: { title: "Error Handling", content: "Standard HTTP status codes. Error body: { code, message, details, requestId }" },
        pagination: { title: "Pagination", content: "Cursor-based: ?cursor=abc&limit=50. Response: { data, nextCursor, hasMore, total }" },
      };
      if (input?.section) return sections[input.section as keyof typeof sections] || null;
      return Object.values(sections);
    }),
});
