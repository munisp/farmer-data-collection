/**
 * API Developer Portal Router — DB-backed
 * API key management, webhook registration, usage tracking.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc } from "drizzle-orm";
import { apiKeys, apiWebhooks } from "../../drizzle/platform-extensions-schema.js";
import { randomBytes, createHash } from "crypto";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export const apiDeveloperPortalRouter = router({
  listApiKeys: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const rows = await db.select().from(apiKeys).where(eq(apiKeys.userId, input.userId)).orderBy(desc(apiKeys.createdAt));
      return rows.map(r => ({ ...r, keyHash: undefined }));
    }),

  createApiKey: protectedProcedure
    .input(z.object({
      userId: z.number(), name: z.string().min(3), tier: z.string().default("free"),
      scopes: z.array(z.string()).default([]),
      expiresInDays: z.number().min(1).max(365).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const rawKey = `fc_${randomBytes(24).toString("hex")}`;
      const prefix = rawKey.substring(0, 10);
      const rateLimits: Record<string, number> = { free: 1000, basic: 5000, professional: 20000, enterprise: 100000 };
      const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400000) : undefined;

      const [created] = await db.insert(apiKeys).values({
        userId: input.userId, keyHash: hashKey(rawKey), keyPrefix: prefix,
        name: input.name, tier: input.tier,
        rateLimit: rateLimits[input.tier] ?? 1000,
        scopes: input.scopes, expiresAt,
      }).returning();
      logger.info("[API Portal] Key created", { id: created.id, userId: input.userId, tier: input.tier });
      return { success: true, apiKey: rawKey, keyId: created.id, prefix, expiresAt };
    }),

  revokeApiKey: protectedProcedure
    .input(z.object({ keyId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(apiKeys).set({ status: "revoked" }).where(eq(apiKeys.id, input.keyId));
      logger.info("[API Portal] Key revoked", { keyId: input.keyId });
      return { success: true };
    }),

  listWebhooks: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return await db.select().from(apiWebhooks).where(eq(apiWebhooks.userId, input.userId)).orderBy(desc(apiWebhooks.createdAt));
    }),

  registerWebhook: protectedProcedure
    .input(z.object({
      userId: z.number(), url: z.string().url(), events: z.array(z.string()).min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const secret = randomBytes(32).toString("hex");
      const [created] = await db.insert(apiWebhooks).values({
        userId: input.userId, url: input.url, events: input.events,
        secretHash: hashKey(secret),
      }).returning();
      logger.info("[API Portal] Webhook registered", { id: created.id, url: input.url });
      return { success: true, webhookId: created.id, secret };
    }),

  deleteWebhook: protectedProcedure
    .input(z.object({ webhookId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(apiWebhooks).set({ isActive: false }).where(eq(apiWebhooks.id, input.webhookId));
      logger.info("[API Portal] Webhook deleted", { webhookId: input.webhookId });
      return { success: true };
    }),

  getApiDocs: publicProcedure.query(() => ({
    version: "1.0",
    baseUrl: "/api/v1",
    endpoints: [
      { path: "/farmers", method: "GET", description: "List farmers", scopes: ["read:farmers"] },
      { path: "/farmers/:id", method: "GET", description: "Get farmer details", scopes: ["read:farmers"] },
      { path: "/crops", method: "GET", description: "List crops", scopes: ["read:crops"] },
      { path: "/marketplace/listings", method: "GET", description: "List marketplace listings", scopes: ["read:marketplace"] },
      { path: "/marketplace/orders", method: "POST", description: "Create order", scopes: ["write:marketplace"] },
      { path: "/traceability/:batchId", method: "GET", description: "Get batch provenance", scopes: ["read:traceability"] },
      { path: "/weather/:location", method: "GET", description: "Get weather forecast", scopes: ["read:weather"] },
      { path: "/iot/sensors", method: "GET", description: "List IoT sensors", scopes: ["read:iot"] },
    ],
    tiers: [
      { name: "free", rateLimit: 1000, price: 0 },
      { name: "basic", rateLimit: 5000, price: 9900 },
      { name: "professional", rateLimit: 20000, price: 49900 },
      { name: "enterprise", rateLimit: 100000, price: 199900 },
    ],
  })),
});
