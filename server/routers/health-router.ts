import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc-base";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { sql } from "drizzle-orm";

// Health check response schema
const healthCheckResponse = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  timestamp: z.string(),
  version: z.string(),
  uptime: z.number(),
  checks: z.object({
    database: z.object({
      status: z.enum(["up", "down"]),
      responseTime: z.number().optional(),
      error: z.string().optional(),
    }),
    redis: z.object({
      status: z.enum(["up", "down", "not_configured"]),
      responseTime: z.number().optional(),
      error: z.string().optional(),
    }),
    kafka: z.object({
      status: z.enum(["up", "down", "not_configured"]),
      error: z.string().optional(),
    }),
  }),
});

export const healthRouter = router({
  /**
   * Basic health check endpoint
   * Returns overall system health status
   */
  check: publicProcedure
    .output(healthCheckResponse)
    .query(async () => {
      const startTime = Date.now();
      const checks: {
        database: { status: "up" | "down"; responseTime?: number; error?: string };
        redis: { status: "up" | "down" | "not_configured"; responseTime?: number; error?: string };
        kafka: { status: "up" | "down" | "not_configured"; error?: string };
      } = {
        database: { status: "down", responseTime: 0 },
        redis: { status: "not_configured" },
        kafka: { status: "not_configured" },
      };

      // Check database connection
      try {
        const dbStart = Date.now();
        const db = await getDb();
        if (!db) throw new Error("Database not initialized");
        await db.select({ count: sql<number>`count(*)` }).from(users).limit(1);
        checks.database = {
          status: "up",
          responseTime: Date.now() - dbStart,
        };
      } catch (error) {
        checks.database = {
          status: "down",
          responseTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : "Unknown database error",
        };
      }

      // Check Redis connection (graceful degradation)
      // Redis is optional - service works without it
      checks.redis = { status: "not_configured" };

      // Check Kafka connection (graceful degradation)
      // Kafka is optional - service works without it
      checks.kafka = { status: "not_configured" };

      // Determine overall status
      let status: "healthy" | "degraded" | "unhealthy" = "healthy";
      
      if (checks.database.status === "down") {
        status = "unhealthy";
      } else if (checks.redis.status === "down" || checks.kafka.status === "down") {
        status = "degraded";
      }

      return {
        status,
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        uptime: process.uptime(),
        checks,
      };
    }),

  /**
   * Database-specific health check
   * Tests database connectivity and basic operations
   */
  database: publicProcedure
    .output(z.object({
      status: z.enum(["up", "down"]),
      responseTime: z.number(),
      tableCount: z.number().optional(),
      error: z.string().optional(),
    }))
    .query(async () => {
      const startTime = Date.now();
      
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not initialized");
        
        // Test basic query
        await db.select({ count: sql<number>`count(*)` }).from(users).limit(1);
        
        // Get table count
        const tableCountResult = await db.execute(sql`
          SELECT COUNT(*) as count 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        `);
        
        const tableCount = Number((tableCountResult.rows[0] as any).count);
        
        return {
          status: "up" as const,
          responseTime: Date.now() - startTime,
          tableCount,
        };
      } catch (error) {
        return {
          status: "down" as const,
          responseTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : "Unknown database error",
        };
      }
    }),

  /**
   * Readiness check for load balancers
   * Returns 200 if service is ready to accept traffic
   */
  ready: publicProcedure
    .output(z.object({
      ready: z.boolean(),
      message: z.string(),
    }))
    .query(async () => {
      try {
        const db = await getDb();
        if (!db) throw new Error("Database not initialized");
        
        // Check if database is accessible
        await db.select({ count: sql<number>`count(*)` }).from(users).limit(1);
        
        return {
          ready: true,
          message: "Service is ready to accept traffic",
        };
      } catch (error) {
        return {
          ready: false,
          message: error instanceof Error ? error.message : "Service not ready",
        };
      }
    }),

  /**
   * Liveness check for orchestrators
   * Returns 200 if service is alive (even if degraded)
   */
  alive: publicProcedure
    .output(z.object({
      alive: z.boolean(),
      uptime: z.number(),
      timestamp: z.string(),
    }))
    .query(async () => {
      return {
        alive: true,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
    }),
});
