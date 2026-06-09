/**
 * Insurance AI Router (P3-1)
 * Parametric crop insurance with satellite-verified auto-payouts.
 * Risk scoring, premium calculation, claim automation, weather indexing.
 * Middleware: PostgreSQL, Kafka (events), TigerBeetle (ledger), Redis (cache), OpenSearch (policy search).
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { eq, desc, sql, and } from "drizzle-orm";
import { insuranceProducts, insurancePolicies, insuranceClaims } from "../../drizzle/schema-platform-extended.js";
import { withRedisCache, publishKafkaEvent, recordLedgerEntry, indexDocument, KAFKA_TOPICS } from "../integrations/middleware-router-hooks.js";
import { logger } from "../logger.js";

type InsuranceProduct = typeof insuranceProducts.$inferSelect;
type InsurancePolicy = typeof insurancePolicies.$inferSelect;
type InsuranceClaim = typeof insuranceClaims.$inferSelect;

function calculateRiskScore(location: string, cropType: string, farmSizeHa: number): number {
  const locationRisk: Record<string, number> = { "arid": 0.85, "semi-arid": 0.65, "tropical": 0.35, "highland": 0.25, "coastal": 0.45 };
  const cropRisk: Record<string, number> = { "maize": 0.4, "coffee": 0.3, "rice": 0.5, "wheat": 0.35, "vegetables": 0.6, "fish": 0.45 };
  const locScore = locationRisk[location.toLowerCase()] ?? 0.5;
  const cropScore = cropRisk[cropType.toLowerCase()] ?? 0.5;
  const sizeMultiplier = farmSizeHa > 10 ? 0.9 : farmSizeHa > 5 ? 1.0 : 1.1;
  return Math.round((locScore * 0.4 + cropScore * 0.4 + 0.2) * sizeMultiplier * 100);
}

function calculatePremium(sumInsured: number, riskScore: number, premiumRatePercent: number): number {
  const baseRate = premiumRatePercent / 100;
  const riskMultiplier = riskScore > 70 ? 1.3 : riskScore > 50 ? 1.1 : 0.9;
  return Math.round(sumInsured * baseRate * riskMultiplier);
}

export const insuranceAIRouter = router({
  listProducts: publicProcedure.query(async () => {
    return withRedisCache("insurance-products", 300, async () => {
      const db = await getDb();
      if (!db) return { products: [], total: 0 };
      const products = await db.select().from(insuranceProducts).where(eq(insuranceProducts.isActive, true));
      return { products, total: products.length };
    });
  }),

  calculateQuote: publicProcedure
    .input(z.object({
      productId: z.number(),
      cropType: z.string(),
      farmSizeHa: z.number().min(0.1).max(1000),
      sumInsured: z.number().min(1000),
      location: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [product] = await db.select().from(insuranceProducts).where(eq(insuranceProducts.id, input.productId));
      if (!product) throw new Error("Insurance product not found");
      const riskScore = calculateRiskScore(input.location, input.cropType, input.farmSizeHa);
      const premium = calculatePremium(input.sumInsured, riskScore, Number(product.minPremium) / input.sumInsured * 100 || 5.5);
      return {
        productId: product.id, productName: product.name,
        premium, currency: product.currency,
        sumInsured: input.sumInsured, riskScore,
        coverageType: product.coverageType,
        breakdown: {
          baseRate: 5.5,
          riskMultiplier: riskScore > 70 ? 1.3 : riskScore > 50 ? 1.1 : 0.9,
          farmSize: input.farmSizeHa,
        },
      };
    }),

  purchasePolicy: protectedProcedure
    .input(z.object({
      productId: z.number(),
      cropType: z.string(),
      farmSizeHa: z.number().min(0.1),
      sumInsured: z.number().min(1000),
      location: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [product] = await db.select().from(insuranceProducts).where(eq(insuranceProducts.id, input.productId));
      if (!product) throw new Error("Insurance product not found");
      const riskScore = calculateRiskScore(input.location, input.cropType, input.farmSizeHa);
      const premium = calculatePremium(input.sumInsured, riskScore, 5.5);
      const policyNumber = `POL-${Date.now()}`;
      const startDate = new Date();
      const endDate = new Date(Date.now() + 180 * 86400000);

      const [policy] = await db.insert(insurancePolicies).values({
        policyNumber,
        productId: input.productId,
        farmerId: ctx.user.id,
        premium: String(premium),
        coverageAmount: String(input.sumInsured),
        startDate,
        endDate,
        status: "active",
        riskScore,
      }).returning();

      await recordLedgerEntry(String(ctx.user.id), "insurance-pool", premium, product.currency, `Insurance premium for ${product.name}`);
      await publishKafkaEvent("insurance.policy.purchased", policyNumber, { userId: ctx.user.id, productId: input.productId, premium });
      await indexDocument("insurance-policies", policyNumber, { policyNumber, userId: ctx.user.id, premium, riskScore } as Record<string, unknown>);
      logger.info(`Insurance policy purchased: ${policyNumber}`);
      return { policyId: policyNumber, status: "active", premium, riskScore, coverageStart: startDate.toISOString(), coverageEnd: endDate.toISOString() };
    }),

  getActivePolicies: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { policies: [], total: 0 };
    const policies = await db.select().from(insurancePolicies).where(and(eq(insurancePolicies.farmerId, ctx.user.id), eq(insurancePolicies.status, "active"))).orderBy(desc(insurancePolicies.createdAt));
    return { policies, total: policies.length };
  }),

  getClaimHistory: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { claims: [], total: 0, totalPaid: 0 };
    const policies = await db.select().from(insurancePolicies).where(eq(insurancePolicies.farmerId, ctx.user.id));
    const policyIds = policies.map((p: InsurancePolicy) => p.id);
    if (policyIds.length === 0) return { claims: [], total: 0, totalPaid: 0 };
    const claims = await db.select().from(insuranceClaims).orderBy(desc(insuranceClaims.createdAt));
    const userClaims = claims.filter((c: InsuranceClaim) => policyIds.includes(c.policyId));
    const totalPaid = userClaims.filter((c: InsuranceClaim) => c.status === "paid").reduce((s: number, c: InsuranceClaim) => s + Number(c.claimAmount), 0);
    return { claims: userClaims, total: userClaims.length, totalPaid };
  }),

  getStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalPolicies: 0, activePolicies: 0, totalPremiumsCollected: 0, totalClaimsPaid: 0, claimRatio: 0, avgRiskScore: 0, topProducts: [] };
    const policies = await db.select().from(insurancePolicies);
    const active = policies.filter((p: InsurancePolicy) => p.status === "active");
    const totalPremiums = policies.reduce((s: number, p: InsurancePolicy) => s + Number(p.premium), 0);
    const claims = await db.select().from(insuranceClaims);
    const paidClaims = claims.filter((c: InsuranceClaim) => c.status === "paid");
    const totalPaid = paidClaims.reduce((s: number, c: InsuranceClaim) => s + Number(c.claimAmount), 0);
    const avgRisk = policies.length > 0 ? policies.reduce((s: number, p: InsurancePolicy) => s + (p.riskScore ?? 0), 0) / policies.length : 0;
    return {
      totalPolicies: policies.length, activePolicies: active.length,
      totalPremiumsCollected: totalPremiums, totalClaimsPaid: totalPaid,
      claimRatio: totalPremiums > 0 ? Math.round(totalPaid / totalPremiums * 1000) / 10 : 0,
      avgRiskScore: Math.round(avgRisk),
      topProducts: [],
    };
  }),
});
