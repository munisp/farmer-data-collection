/**
 * Carbon Credit Tokenization Router (P3-4)
 * Tokenized carbon credits from sustainable farming practices.
 * MRV (Monitoring, Reporting, Verification), trading, and retirement.
 * Middleware: PostgreSQL, TigerBeetle (ledger), Kafka (events), OpenSearch (marketplace), Redis (cache).
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { getDb } from "../db.js";
import { eq, desc } from "drizzle-orm";
import { carbonProjects, carbonCredits } from "../../drizzle/schema-platform-extended.js";
import { withRedisCache, recordLedgerEntry, publishKafkaEvent, indexDocument, searchDocuments, writeToLakehouse, checkRateLimit, scanForThreats } from "../integrations/middleware-router-hooks.js";
import { logger } from "../logger.js";

type CarbonProject = typeof carbonProjects.$inferSelect;
type CarbonCredit = typeof carbonCredits.$inferSelect;

function calculateCarbonFootprint(farmSizeHa: number, cropType: string, practiceType: string): number {
  const baseSequestration: Record<string, number> = {
    agroforestry: 8.5, conservation_tillage: 2.1, biochar: 4.5,
    cover_crops: 1.8, composting: 1.2, rice_AWD: 3.5, mangrove: 12.0,
  };
  const base = baseSequestration[practiceType] ?? 2.0;
  return Math.round(farmSizeHa * base * 10) / 10;
}

export const carbonCreditRouter = router({
  listProjects: publicProcedure.query(async () => {
    return withRedisCache("carbon-projects", 300, async () => {
      const db = await getDb();
      if (!db) return { projects: [], total: 0, totalCredits: 0 };
      const projects = await db.select().from(carbonProjects).orderBy(desc(carbonProjects.createdAt));
      const totalCredits = projects.reduce((sum: number, p: CarbonProject) => sum + Number(p.annualCredits), 0);
      return { projects, total: projects.length, totalCredits };
    });
  }),

  calculateSequestration: publicProcedure
    .input(z.object({
      farmSizeHa: z.number().min(0.1).max(10000),
      cropType: z.string(),
      practiceType: z.string(),
    }))
    .query(async ({ input }) => {
      const tonnes = calculateCarbonFootprint(input.farmSizeHa, input.cropType, input.practiceType);
      const avgPrice = 25;
      return {
        annualSequestration: tonnes,
        unit: "tCO2e/year",
        estimatedRevenue: Math.round(tonnes * avgPrice),
        currency: "USD",
        practiceType: input.practiceType,
        farmSizeHa: input.farmSizeHa,
      };
    }),

  registerProject: protectedProcedure
    .input(z.object({
      name: z.string().min(3),
      type: z.string(),
      methodology: z.string(),
      farmSizeHa: z.number().min(0.1),
      location: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rateCheck = await checkRateLimit("carbon_credit", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("carbon_credit", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const credits = calculateCarbonFootprint(input.farmSizeHa, "mixed", input.type);
      const projectCode = `CP-${Date.now()}`;
      const [project] = await db.insert(carbonProjects).values({
        projectCode,
        name: input.name,
        type: input.type,
        methodology: input.methodology,
        annualCredits: String(credits),
        pricePerTonne: "25.00",
        currency: "USD",
        status: "pending_verification",
        verifier: "pending",
        location: input.location,
      }).returning();
      await indexDocument("carbon-projects", projectCode, project as Record<string, unknown>);
      await publishKafkaEvent("carbon.project.registered", projectCode, project as Record<string, unknown>);
      await writeToLakehouse("carbon_projects", [project as Record<string, unknown>]);
      logger.info(`Carbon project registered: ${projectCode}`);
      return project;
    }),

  tradeCredits: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      quantity: z.number().min(1),
      pricePerTonne: z.number().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const rateCheck = await checkRateLimit("carbon_credit", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("carbon_credit", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const tradeId = `TR-${Date.now()}`;
      const total = input.quantity * input.pricePerTonne;
      const tokenId = `TK-${Date.now()}`;

      const [credit] = await db.insert(carbonCredits).values({
        projectId: input.projectId,
        tokenId,
        vintage: new Date().getFullYear(),
        tonnes: String(input.quantity),
        status: "traded",
        ownerId: ctx.user.id,
      }).returning();

      await recordLedgerEntry("carbon-buyer", String(ctx.user.id), total * 100, "USD", `Carbon credit trade ${tradeId}`);
      await publishKafkaEvent("carbon.trade.executed", tradeId, { projectId: input.projectId, quantity: input.quantity, sellerId: ctx.user.id, total });
      logger.info(`Carbon credit trade executed: ${tradeId}, total: ${total}`);
      return { tradeId, credit, status: "executed", quantity: input.quantity, pricePerTonne: input.pricePerTonne, total, currency: "USD" };
    }),

  getMarketplace: publicProcedure
    .input(z.object({ query: z.string().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.query) {
        return { listings: await searchDocuments("carbon-marketplace", input.query), query: input.query };
      }
      const db = await getDb();
      if (!db) return { listings: [], totalAvailable: 0 };
      const projects = await db.select().from(carbonProjects).where(eq(carbonProjects.status, "verified"));
      return {
        listings: projects.map((p: CarbonProject) => ({
          projectId: p.id, name: p.name, type: p.type,
          available: Number(p.annualCredits), pricePerTonne: Number(p.pricePerTonne),
          currency: p.currency, verifier: p.verifier,
        })),
        totalAvailable: projects.reduce((s: number, p: CarbonProject) => s + Number(p.annualCredits), 0),
      };
    }),

  getStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalProjects: 0, verifiedProjects: 0, totalCreditsIssued: 0, totalCreditsTraded: 0, totalCreditsRetired: 0, totalRevenue: 0, currency: "USD", avgPrice: 0 };
    const projects = await db.select().from(carbonProjects);
    const credits = await db.select().from(carbonCredits);
    const verified = projects.filter((p: CarbonProject) => p.status === "verified").length;
    const totalIssued = credits.reduce((s: number, c: CarbonCredit) => s + Number(c.tonnes), 0);
    const traded = credits.filter((c: CarbonCredit) => c.status === "traded");
    const retired = credits.filter((c: CarbonCredit) => c.status === "retired");
    return {
      totalProjects: projects.length,
      verifiedProjects: verified,
      totalCreditsIssued: totalIssued,
      totalCreditsTraded: traded.reduce((s: number, c: CarbonCredit) => s + Number(c.tonnes), 0),
      totalCreditsRetired: retired.reduce((s: number, c: CarbonCredit) => s + Number(c.tonnes), 0),
      totalRevenue: traded.reduce((s: number, c: CarbonCredit) => s + Number(c.tonnes) * 25, 0),
      currency: "USD",
      avgPrice: projects.length > 0 ? projects.reduce((s: number, p: CarbonProject) => s + Number(p.pricePerTonne), 0) / projects.length : 0,
    };
  }),
});
