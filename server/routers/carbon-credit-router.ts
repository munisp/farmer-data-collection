/**
 * Carbon Credit Tokenization Router (P3-4)
 * Tokenized carbon credits from sustainable farming practices.
 * MRV (Monitoring, Reporting, Verification), trading, and retirement.
 * Middleware: TigerBeetle (ledger), Kafka (events), OpenSearch (marketplace), Lakehouse (analytics).
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { withRedisCache, recordLedgerEntry, publishKafkaEvent, indexDocument, searchDocuments, writeToLakehouse } from "../integrations/middleware-router-hooks.js";

interface CarbonProject {
  id: string;
  name: string;
  type: string;
  methodology: string;
  annualCredits: number;
  pricePerTonne: number;
  currency: string;
  status: string;
  verifier: string;
  location: string;
  farmerId: string;
}

const carbonProjects: CarbonProject[] = [
  { id: "CP-001", name: "Agroforestry Carbon Sink", type: "afforestation", methodology: "AR-ACM0003", annualCredits: 450, pricePerTonne: 25, currency: "USD", status: "verified", verifier: "Verra VCS", location: "Nakuru, Kenya", farmerId: "F-101" },
  { id: "CP-002", name: "Conservation Tillage", type: "soil_carbon", methodology: "VM0042", annualCredits: 180, pricePerTonne: 18, currency: "USD", status: "verified", verifier: "Gold Standard", location: "Kiambu, Kenya", farmerId: "F-102" },
  { id: "CP-003", name: "Biochar Application", type: "biochar", methodology: "CDM-AMS-III.BK", annualCredits: 320, pricePerTonne: 35, currency: "USD", status: "pending_verification", verifier: "Verra VCS", location: "Oyo, Nigeria", farmerId: "F-103" },
  { id: "CP-004", name: "Rice Paddy Methane Reduction", type: "methane_reduction", methodology: "VM0006", annualCredits: 600, pricePerTonne: 22, currency: "USD", status: "verified", verifier: "Gold Standard", location: "Mwea, Kenya", farmerId: "F-104" },
  { id: "CP-005", name: "Mangrove Restoration", type: "blue_carbon", methodology: "VM0033", annualCredits: 280, pricePerTonne: 45, currency: "USD", status: "verified", verifier: "Verra VCS", location: "Lamu, Kenya", farmerId: "F-105" },
];

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
    return withRedisCache("carbon-projects", 300, async () => ({
      projects: carbonProjects,
      total: carbonProjects.length,
      totalCredits: carbonProjects.reduce((sum, p) => sum + p.annualCredits, 0),
    }));
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
      const projectId = `CP-${Date.now()}`;
      const credits = calculateCarbonFootprint(input.farmSizeHa, "mixed", input.type);
      const project = {
        id: projectId, ...input,
        annualCredits: credits, pricePerTonne: 25, currency: "USD",
        status: "pending_verification", verifier: "pending", farmerId: ctx.user.id,
      };
      await indexDocument("carbon-projects", projectId, project);
      await publishKafkaEvent("carbon.project.registered", projectId, project);
      await writeToLakehouse("carbon_projects", [project]);
      return project;
    }),

  tradeCredits: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      quantity: z.number().min(1),
      pricePerTonne: z.number().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const tradeId = `TR-${Date.now()}`;
      const total = input.quantity * input.pricePerTonne;
      await recordLedgerEntry("carbon-buyer", String(ctx.user.id), total * 100, "USD", `Carbon credit trade ${tradeId}`);
      await publishKafkaEvent("carbon.trade.executed", tradeId, { ...input, sellerId: ctx.user.id, total });
      return {
        tradeId, status: "executed", quantity: input.quantity,
        pricePerTonne: input.pricePerTonne, total, currency: "USD",
      };
    }),

  getMarketplace: publicProcedure
    .input(z.object({ query: z.string().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.query) {
        return { listings: await searchDocuments("carbon-marketplace", input.query), query: input.query };
      }
      return {
        listings: carbonProjects.filter((p) => p.status === "verified").map((p) => ({
          projectId: p.id, name: p.name, type: p.type,
          available: p.annualCredits, pricePerTonne: p.pricePerTonne,
          currency: p.currency, verifier: p.verifier,
        })),
        totalAvailable: carbonProjects.filter((p) => p.status === "verified").reduce((s, p) => s + p.annualCredits, 0),
      };
    }),

  getStats: publicProcedure.query(async () => ({
    totalProjects: carbonProjects.length,
    verifiedProjects: carbonProjects.filter((p) => p.status === "verified").length,
    totalCreditsIssued: 1830,
    totalCreditsTraded: 920,
    totalCreditsRetired: 410,
    totalRevenue: 48750,
    currency: "USD",
    avgPrice: 25.3,
    topMethodologies: [
      { methodology: "VM0042", projects: 12 },
      { methodology: "AR-ACM0003", projects: 8 },
      { methodology: "VM0033", projects: 5 },
    ],
  })),
});
