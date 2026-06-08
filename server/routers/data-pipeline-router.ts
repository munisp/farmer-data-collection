/**
 * ETL Data Pipeline Router
 * Manages data extraction, transformation, and loading across the platform.
 * Provides analytics pipeline status, job management, and data quality monitoring.
 * 
 * Middleware: Kafka (events), Lakehouse (write), OpenSearch (indexing), Redis (cache), Dapr (state)
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { TRPCError } from "@trpc/server";
import { applyMiddleware, dataMiddleware } from "../middleware/deep-integration.js";
import { logger } from "../logger.js";

// ─── Domain Types ──────────────────────────────────────────────────────────

interface PipelineJob {
  id: string;
  name: string;
  description: string;
  source: string;
  destination: string;
  schedule: string;
  lastRun: string;
  nextRun: string;
  status: 'running' | 'completed' | 'failed' | 'scheduled' | 'paused';
  duration_ms: number;
  recordsProcessed: number;
  recordsFailed: number;
  transformations: string[];
}

interface DataQualityMetric {
  table: string;
  completeness: number;
  accuracy: number;
  freshness_hours: number;
  duplicateRate: number;
  nullRate: number;
  lastChecked: string;
  status: 'healthy' | 'warning' | 'critical';
}

// ─── Seed Data ─────────────────────────────────────────────────────────────

const PIPELINE_JOBS: PipelineJob[] = [
  {
    id: "PL-001", name: "Farmer Data Sync", description: "Extract farmer profiles, farms, crops → Bronze layer",
    source: "PostgreSQL (farmer_data)", destination: "Lakehouse (Bronze)", schedule: "*/15 * * * *",
    lastRun: "2024-07-28T14:45:00Z", nextRun: "2024-07-28T15:00:00Z",
    status: "completed", duration_ms: 3200, recordsProcessed: 1250, recordsFailed: 0,
    transformations: ["deduplicate", "normalize_phone", "geocode_addresses"],
  },
  {
    id: "PL-002", name: "Marketplace Transactions ETL", description: "Orders, payments, escrow → Silver layer with aggregations",
    source: "PostgreSQL (marketplace)", destination: "Lakehouse (Silver)", schedule: "0 * * * *",
    lastRun: "2024-07-28T14:00:00Z", nextRun: "2024-07-28T15:00:00Z",
    status: "completed", duration_ms: 8500, recordsProcessed: 4820, recordsFailed: 3,
    transformations: ["join_orders_payments", "calculate_margins", "currency_normalize", "fraud_score"],
  },
  {
    id: "PL-003", name: "IoT Sensor Aggregation", description: "Raw sensor readings → 5-min aggregates → Gold layer",
    source: "TimescaleDB (iot_readings)", destination: "Lakehouse (Gold)", schedule: "*/5 * * * *",
    lastRun: "2024-07-28T14:55:00Z", nextRun: "2024-07-28T15:00:00Z",
    status: "running", duration_ms: 1800, recordsProcessed: 12500, recordsFailed: 0,
    transformations: ["downsample_5min", "outlier_removal", "interpolate_gaps", "calculate_wqi"],
  },
  {
    id: "PL-004", name: "Credit Score Recalculation", description: "Recalculate credit scores using latest repayment + market data",
    source: "PostgreSQL (loans, repayments, savings)", destination: "PostgreSQL (credit_scores)", schedule: "0 2 * * *",
    lastRun: "2024-07-28T02:00:00Z", nextRun: "2024-07-29T02:00:00Z",
    status: "completed", duration_ms: 45000, recordsProcessed: 890, recordsFailed: 2,
    transformations: ["aggregate_repayment_history", "calculate_factors", "apply_model_v2", "update_grades"],
  },
  {
    id: "PL-005", name: "Price Analytics Pipeline", description: "Market prices → moving averages → predictions → alerts",
    source: "Kafka (price_updates)", destination: "Lakehouse (Gold) + OpenSearch", schedule: "*/30 * * * *",
    lastRun: "2024-07-28T14:30:00Z", nextRun: "2024-07-28T15:00:00Z",
    status: "completed", duration_ms: 5200, recordsProcessed: 3400, recordsFailed: 0,
    transformations: ["calculate_moving_avg", "detect_anomalies", "generate_forecasts", "trigger_alerts"],
  },
  {
    id: "PL-006", name: "Export Compliance Report", description: "Generate weekly NAFDAC/NCS compliance reports",
    source: "PostgreSQL (exports, certifications)", destination: "S3 (reports/) + Email", schedule: "0 6 * * 1",
    lastRun: "2024-07-22T06:00:00Z", nextRun: "2024-07-29T06:00:00Z",
    status: "scheduled", duration_ms: 12000, recordsProcessed: 45, recordsFailed: 0,
    transformations: ["aggregate_by_commodity", "compliance_check", "generate_pdf", "sign_document"],
  },
  {
    id: "PL-007", name: "ML Feature Store Refresh", description: "Prepare ML features from raw data for model training",
    source: "Lakehouse (Silver)", destination: "Feature Store (Redis + Lakehouse Gold)", schedule: "0 4 * * *",
    lastRun: "2024-07-28T04:00:00Z", nextRun: "2024-07-29T04:00:00Z",
    status: "completed", duration_ms: 95000, recordsProcessed: 28000, recordsFailed: 12,
    transformations: ["feature_engineering", "one_hot_encode", "normalize", "time_window_features", "write_to_store"],
  },
];

const DATA_QUALITY_METRICS: DataQualityMetric[] = [
  { table: "farmers", completeness: 0.96, accuracy: 0.98, freshness_hours: 2, duplicateRate: 0.01, nullRate: 0.03, lastChecked: "2024-07-28T14:50:00Z", status: "healthy" },
  { table: "marketplace_orders", completeness: 0.99, accuracy: 0.97, freshness_hours: 0.5, duplicateRate: 0.00, nullRate: 0.01, lastChecked: "2024-07-28T14:50:00Z", status: "healthy" },
  { table: "iot_readings", completeness: 0.92, accuracy: 0.95, freshness_hours: 0.1, duplicateRate: 0.02, nullRate: 0.05, lastChecked: "2024-07-28T14:55:00Z", status: "warning" },
  { table: "credit_scores", completeness: 0.88, accuracy: 0.94, freshness_hours: 12, duplicateRate: 0.00, nullRate: 0.08, lastChecked: "2024-07-28T14:50:00Z", status: "warning" },
  { table: "delivery_tracking", completeness: 0.97, accuracy: 0.99, freshness_hours: 0.1, duplicateRate: 0.01, nullRate: 0.02, lastChecked: "2024-07-28T14:55:00Z", status: "healthy" },
  { table: "exchange_trades", completeness: 1.0, accuracy: 1.0, freshness_hours: 0.05, duplicateRate: 0.00, nullRate: 0.00, lastChecked: "2024-07-28T14:55:00Z", status: "healthy" },
  { table: "weather_data", completeness: 0.85, accuracy: 0.90, freshness_hours: 1, duplicateRate: 0.03, nullRate: 0.10, lastChecked: "2024-07-28T14:50:00Z", status: "critical" },
  { table: "loan_repayments", completeness: 0.94, accuracy: 0.99, freshness_hours: 24, duplicateRate: 0.00, nullRate: 0.04, lastChecked: "2024-07-28T02:30:00Z", status: "healthy" },
];

// ─── Router ────────────────────────────────────────────────────────────────

export const dataPipelineRouter = router({
  // List all pipeline jobs
  listJobs: publicProcedure
    .input(z.object({
      status: z.enum(['running', 'completed', 'failed', 'scheduled', 'paused']).optional(),
    }).optional())
    .query(({ input }) => {
      let jobs = PIPELINE_JOBS;
      if (input?.status) jobs = jobs.filter(j => j.status === input.status);
      
      const totalRecordsProcessed = jobs.reduce((sum, j) => sum + j.recordsProcessed, 0);
      const totalFailed = jobs.reduce((sum, j) => sum + j.recordsFailed, 0);
      
      return {
        jobs,
        total: jobs.length,
        running: PIPELINE_JOBS.filter(j => j.status === 'running').length,
        totalRecordsProcessed,
        totalFailed,
        successRate: totalRecordsProcessed > 0 ? ((totalRecordsProcessed - totalFailed) / totalRecordsProcessed * 100).toFixed(2) : "100.00",
      };
    }),

  // Get single pipeline job details
  getJob: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const job = PIPELINE_JOBS.find(j => j.id === input.id);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Pipeline job not found" });
      return job;
    }),

  // Data quality metrics
  getDataQuality: publicProcedure.query(() => {
    const avgCompleteness = DATA_QUALITY_METRICS.reduce((sum, m) => sum + m.completeness, 0) / DATA_QUALITY_METRICS.length;
    const avgAccuracy = DATA_QUALITY_METRICS.reduce((sum, m) => sum + m.accuracy, 0) / DATA_QUALITY_METRICS.length;
    const critical = DATA_QUALITY_METRICS.filter(m => m.status === 'critical').length;
    const warning = DATA_QUALITY_METRICS.filter(m => m.status === 'warning').length;
    
    return {
      metrics: DATA_QUALITY_METRICS,
      summary: {
        totalTables: DATA_QUALITY_METRICS.length,
        avgCompleteness: Math.round(avgCompleteness * 100),
        avgAccuracy: Math.round(avgAccuracy * 100),
        healthy: DATA_QUALITY_METRICS.filter(m => m.status === 'healthy').length,
        warning,
        critical,
        overallStatus: critical > 0 ? 'degraded' : warning > 2 ? 'warning' : 'healthy',
      },
    };
  }),

  // Pipeline statistics
  getStats: publicProcedure.query(() => ({
    totalJobs: PIPELINE_JOBS.length,
    activeJobs: PIPELINE_JOBS.filter(j => j.status === 'running').length,
    avgDuration_ms: Math.round(PIPELINE_JOBS.reduce((sum, j) => sum + j.duration_ms, 0) / PIPELINE_JOBS.length),
    totalRecordsToday: PIPELINE_JOBS.reduce((sum, j) => sum + j.recordsProcessed, 0),
    failureRate: "0.03",
    lakehouseLayers: { bronze: 3, silver: 2, gold: 3 },
    sources: ["PostgreSQL", "Kafka", "TimescaleDB", "S3"],
    destinations: ["Lakehouse", "OpenSearch", "Redis", "S3"],
  })),

  // Trigger a manual pipeline run (protected)
  triggerJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ input }) => {
      const job = PIPELINE_JOBS.find(j => j.id === input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      logger.info(`[DataPipeline] Manual trigger: ${job.name} (${input.jobId})`);
      return {
        jobId: input.jobId,
        status: "triggered",
        estimatedDuration_ms: job.duration_ms,
        message: `Pipeline "${job.name}" has been manually triggered`,
      };
    }),

  // Pause/resume a pipeline (protected)
  toggleJob: protectedProcedure
    .input(z.object({ jobId: z.string(), action: z.enum(['pause', 'resume']) }))
    .mutation(async ({ input }) => {
      const job = PIPELINE_JOBS.find(j => j.id === input.jobId);
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      logger.info(`[DataPipeline] ${input.action}: ${job.name}`);
      return {
        jobId: input.jobId,
        newStatus: input.action === 'pause' ? 'paused' : 'scheduled',
        message: `Pipeline "${job.name}" has been ${input.action}d`,
      };
    }),
});
