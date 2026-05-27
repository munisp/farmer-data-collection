import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "../../trpc";
import { createContext } from "../../_core/trpc-base";
import type { Context } from "../../_core/trpc-base";

describe("Health Router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let ctx: Context;

  beforeAll(async () => {
    // Create a test context with proper request mock
    ctx = await createContext({
      req: {
        headers: {},
      } as any,
      res: {} as any,
    });
    caller = appRouter.createCaller(ctx);
  });

  describe("health.check", () => {
    it("should return health status with all checks", async () => {
      const result = await caller.health.check();

      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("version");
      expect(result).toHaveProperty("uptime");
      expect(result).toHaveProperty("checks");

      expect(result.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(result.checks).toHaveProperty("database");
      expect(result.checks).toHaveProperty("redis");
      expect(result.checks).toHaveProperty("kafka");
    });

    it("should have database status as up", async () => {
      const result = await caller.health.check();

      expect(result.checks.database.status).toBe("up");
      expect(result.checks.database.responseTime).toBeGreaterThan(0);
    });

    it("should mark Redis and Kafka as not_configured", async () => {
      const result = await caller.health.check();

      expect(result.checks.redis.status).toBe("not_configured");
      expect(result.checks.kafka.status).toBe("not_configured");
    });

    it("should have valid timestamp format", async () => {
      const result = await caller.health.check();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.toString()).not.toBe("Invalid Date");
    });

    it("should have positive uptime", async () => {
      const result = await caller.health.check();

      expect(result.uptime).toBeGreaterThan(0);
    });
  });

  describe("health.database", () => {
    it("should return database health status", async () => {
      const result = await caller.health.database();

      expect(result).toHaveProperty("status");
      expect(result).toHaveProperty("responseTime");
      expect(result.status).toBe("up");
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it("should return table count", async () => {
      const result = await caller.health.database();

      expect(result).toHaveProperty("tableCount");
      expect(result.tableCount).toBeGreaterThan(0);
      // We know we have 28 tables
      expect(result.tableCount).toBeGreaterThanOrEqual(28);
    });
  });

  describe("health.ready", () => {
    it("should return readiness status", async () => {
      const result = await caller.health.ready();

      expect(result).toHaveProperty("ready");
      expect(result).toHaveProperty("message");
      expect(result.ready).toBe(true);
      expect(result.message).toContain("ready");
    });
  });

  describe("health.alive", () => {
    it("should return liveness status", async () => {
      const result = await caller.health.alive();

      expect(result).toHaveProperty("alive");
      expect(result).toHaveProperty("uptime");
      expect(result).toHaveProperty("timestamp");
      expect(result.alive).toBe(true);
      expect(result.uptime).toBeGreaterThan(0);
    });

    it("should have valid timestamp", async () => {
      const result = await caller.health.alive();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.toString()).not.toBe("Invalid Date");
    });
  });

  describe("health status determination", () => {
    it("should be healthy when database is up and optional services are not configured", async () => {
      const result = await caller.health.check();

      // With database up and Redis/Kafka not configured, status should be healthy
      expect(result.status).toBe("healthy");
    });
  });

  describe("performance", () => {
    it("should respond to health check within 1 second", async () => {
      const start = Date.now();
      await caller.health.check();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });

    it("should respond to database check within 500ms", async () => {
      const start = Date.now();
      await caller.health.database();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it("should respond to alive check within 100ms", async () => {
      const start = Date.now();
      await caller.health.alive();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
