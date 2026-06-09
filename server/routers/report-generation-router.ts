/**
 * Report Generation Router (P2-6)
 * Generate farm reports, financial summaries, compliance exports.
 * Middleware: Redis (cache), OpenSearch (data aggregation), Lakehouse (analytics).
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { withRedisCache, writeToLakehouse, searchDocuments, checkRateLimit, scanForThreats } from "../integrations/middleware-router-hooks.js";

const reportTemplates = [
  { id: "farm_summary", name: "Farm Summary Report", description: "Overview of farm performance, yields, and expenses", format: ["pdf", "csv", "xlsx"] },
  { id: "financial", name: "Financial Report", description: "Income, expenses, profit/loss, loan status", format: ["pdf", "csv", "xlsx"] },
  { id: "compliance", name: "Compliance Report", description: "Regulatory compliance, certifications, audit trail", format: ["pdf"] },
  { id: "harvest", name: "Harvest Report", description: "Crop yields, quality grades, storage status", format: ["pdf", "csv"] },
  { id: "weather_impact", name: "Weather Impact Analysis", description: "Weather effects on crop performance", format: ["pdf"] },
  { id: "supply_chain", name: "Supply Chain Traceability", description: "End-to-end product journey from farm to consumer", format: ["pdf", "csv"] },
  { id: "cooperative", name: "Cooperative Report", description: "Member contributions, shared resources, group performance", format: ["pdf", "xlsx"] },
  { id: "aquaculture", name: "Aquaculture Report", description: "Pond health, feed conversion, harvest volumes", format: ["pdf", "csv"] },
];

export const reportGenerationRouter = router({
  listTemplates: protectedProcedure.query(async () => ({
    templates: reportTemplates,
    total: reportTemplates.length,
  })),

  generateReport: protectedProcedure
    .input(z.object({
      templateId: z.string(),
      dateRange: z.object({
        start: z.string(),
        end: z.string(),
      }),
      format: z.enum(["pdf", "csv", "xlsx"]).default("pdf"),
      filters: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const rateCheck = await checkRateLimit("report_generation", String(ctx.user?.id ?? "anon"), 20, 60);
      if (!rateCheck.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
      const wafScan = await scanForThreats("report_generation", input);
      if (!wafScan.safe) throw new TRPCError({ code: "FORBIDDEN", message: `Request blocked: ${wafScan.threats.join(", ")}` });

      const template = reportTemplates.find((t) => t.id === input.templateId);
      if (!template) throw new Error("Report template not found");

      const reportId = `RPT-${Date.now()}-${input.templateId}`;
      const report = {
        id: reportId,
        templateId: input.templateId,
        templateName: template.name,
        format: input.format,
        status: "generating",
        requestedBy: ctx.user.id,
        dateRange: input.dateRange,
        createdAt: new Date().toISOString(),
      };

      await writeToLakehouse("report_requests", [report]);
      return { ...report, estimatedTime: "30 seconds", downloadUrl: `/api/reports/${reportId}.${input.format}` };
    }),

  getReportHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ ctx }) => {
      return withRedisCache(`reports:${ctx.user.id}`, 120, async () => ({
        reports: [
          { id: "RPT-001", template: "Farm Summary Report", format: "pdf", status: "completed", createdAt: new Date(Date.now() - 86400000).toISOString(), size: "2.4 MB" },
          { id: "RPT-002", template: "Financial Report", format: "xlsx", status: "completed", createdAt: new Date(Date.now() - 172800000).toISOString(), size: "1.8 MB" },
          { id: "RPT-003", template: "Harvest Report", format: "csv", status: "completed", createdAt: new Date(Date.now() - 259200000).toISOString(), size: "450 KB" },
        ],
        total: 3,
      }));
    }),

  searchReports: protectedProcedure
    .input(z.object({ query: z.string(), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      const results = await searchDocuments("reports", input.query, undefined, input.limit);
      return { results, total: results.length };
    }),

  getStats: protectedProcedure.query(async () => ({
    totalGenerated: 156,
    thisMonth: 23,
    mostPopular: "Farm Summary Report",
    avgGenerationTime: "18 seconds",
    formats: { pdf: 89, csv: 42, xlsx: 25 },
  })),
});
