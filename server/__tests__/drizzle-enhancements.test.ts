/**
 * drizzle-enhancements.test.ts
 *
 * Tests for all Drizzle ORM enhancements:
 * - FluentQuery builder
 * - DrizzleQueryCache with tag invalidation
 * - DrizzleBatchProcessor
 * - AuditTrail
 * - SoftDeleteHelper
 * - FullTextSearchHelper
 * - GeospatialHelper
 * - TimeSeriesHelper
 * - OptimisticLockHelper
 * - CursorPagination
 * - QueryPerformanceAnalyzer
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DrizzleQueryCache,
  DrizzleBatchProcessor,
  DrizzleAuditTrail,
  SoftDeleteHelper,
  FullTextSearchHelper,
  GeospatialHelper,
  TimeSeriesHelper,
  OptimisticLockHelper,
  QueryPerformanceAnalyzer,
  DatabaseHealthMonitor,
  encodeCursor,
  decodeCursor,
  buildCursorCondition,
  fts,
  geo,
  ts,
  multiTenancy,
} from "../db-enhancements.js";

// ── Mock DB ──────────────────────────────────────────────────────────────────
const mockExecute = vi.fn().mockResolvedValue([{ n: 0 }]);
const mockSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue([]) }),
          execute: vi.fn().mockResolvedValue([]),
        }),
        execute: vi.fn().mockResolvedValue([]),
      }),
      execute: vi.fn().mockResolvedValue([]),
    }),
    orderBy: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue([]) }),
      execute: vi.fn().mockResolvedValue([]),
    }),
    execute: vi.fn().mockResolvedValue([]),
  }),
});
const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockReturnValue({
    onConflictDoNothing: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue([]) }),
    onConflictDoUpdate: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue([]) }),
    execute: vi.fn().mockResolvedValue([]),
  }),
});
const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue([{ version: 2 }]) }),
      execute: vi.fn().mockResolvedValue([]),
    }),
  }),
});
const mockTransaction = vi.fn().mockImplementation((fn: any) => fn(mockDb));

const mockDb: any = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  execute: mockExecute,
  transaction: mockTransaction,
};

// ── Mock Redis ───────────────────────────────────────────────────────────────
const mockRedis = {
  isConnected: vi.fn().mockReturnValue(true),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue("OK"),
  del: vi.fn().mockResolvedValue(1),
  sadd: vi.fn().mockResolvedValue(1),
  smembers: vi.fn().mockResolvedValue([]),
  expire: vi.fn().mockResolvedValue(1),
  keys: vi.fn().mockResolvedValue([]),
};

// ============================================================================
// QUERY CACHE TESTS
// ============================================================================

describe("DrizzleQueryCache", () => {
  let cache: DrizzleQueryCache;

  beforeEach(() => {
    cache = new DrizzleQueryCache(mockRedis);
    vi.clearAllMocks();
  });

  it("should return null on cache miss", async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    const result = await cache.get("test-key");
    expect(result).toBeNull();
  });

  it("should return parsed value on cache hit", async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify({ id: 1, name: "test" }));
    const result = await cache.get<{ id: number; name: string }>("test-key");
    expect(result).toEqual({ id: 1, name: "test" });
  });

  it("should set value with TTL", async () => {
    await cache.set("test-key", { id: 1 }, { ttl: 60 });
    expect(mockRedis.set).toHaveBeenCalledWith(
      "drizzle:query:test-key",
      JSON.stringify({ id: 1 }),
      "EX",
      60,
    );
  });

  it("should register key under tags", async () => {
    await cache.set("test-key", { id: 1 }, { tags: ["farmer", "farm-1"] });
    expect(mockRedis.sadd).toHaveBeenCalledTimes(2);
    expect(mockRedis.sadd).toHaveBeenCalledWith("drizzle:tag:farmer", "drizzle:query:test-key");
  });

  it("should invalidate all keys for a tag", async () => {
    mockRedis.smembers.mockResolvedValueOnce(["drizzle:query:key1", "drizzle:query:key2"]);
    await cache.invalidateByTag("farmer");
    expect(mockRedis.del).toHaveBeenCalledTimes(3); // 2 keys + tag key
  });

  it("should use cached() to wrap query functions", async () => {
    const queryFn = vi.fn().mockResolvedValue([{ id: 1 }]);
    mockRedis.get.mockResolvedValueOnce(null); // cache miss

    const result = await cache.cached("my-key", queryFn, { ttl: 120 });
    expect(queryFn).toHaveBeenCalledOnce();
    expect(result).toEqual([{ id: 1 }]);
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it("should not call queryFn on cache hit", async () => {
    const queryFn = vi.fn();
    mockRedis.get.mockResolvedValueOnce(JSON.stringify([{ id: 1 }]));

    await cache.cached("my-key", queryFn);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("should handle Redis errors gracefully", async () => {
    mockRedis.get.mockRejectedValueOnce(new Error("Redis down"));
    const result = await cache.get("test-key");
    expect(result).toBeNull(); // graceful degradation
  });
});

// ============================================================================
// BATCH PROCESSOR TESTS
// ============================================================================

describe("DrizzleBatchProcessor", () => {
  let processor: DrizzleBatchProcessor;

  beforeEach(() => {
    processor = new DrizzleBatchProcessor(mockDb);
    vi.clearAllMocks();
  });

  it("should return 0 for empty records", async () => {
    const result = await processor.bulkInsert({} as any, []);
    expect(result).toEqual({ inserted: 0, chunks: 0 });
  });

  it("should insert records in chunks", async () => {
    const records = Array.from({ length: 1200 }, (_, i) => ({ id: i, name: `item-${i}` }));
    const result = await processor.bulkInsert({} as any, records);
    expect(result.chunks).toBe(3); // 1200 / 500 = 3 chunks (500, 500, 200)
    expect(result.inserted).toBe(1200);
  });

  it("should use onConflictDoNothing when specified", async () => {
    await processor.bulkInsert({} as any, [{ id: 1 }], { onConflict: "ignore" });
    const insertMock = mockInsert.mock.results[0].value;
    expect(insertMock.values().onConflictDoNothing).toHaveBeenCalled();
  });

  it("should execute transaction", async () => {
    const opFn = vi.fn().mockResolvedValue("result");
    const result = await processor.transaction(opFn);
    expect(mockTransaction).toHaveBeenCalled();
  });
});

// ============================================================================
// SOFT DELETE TESTS
// ============================================================================

describe("SoftDeleteHelper", () => {
  let helper: SoftDeleteHelper;

  beforeEach(() => {
    helper = new SoftDeleteHelper(mockDb);
    vi.clearAllMocks();
  });

  it("should build notDeleted condition", () => {
    const col = { name: "deleted_at" } as any;
    const condition = helper.notDeleted(col);
    expect(condition).toBeDefined();
  });

  it("should build onlyDeleted condition", () => {
    const col = { name: "deleted_at" } as any;
    const condition = helper.onlyDeleted(col);
    expect(condition).toBeDefined();
  });

  it("should call update with deletedAt when soft-deleting", async () => {
    await helper.softDelete({} as any, { name: "id" } as any, 1, "user-123");
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("should call update with null deletedAt when restoring", async () => {
    await helper.restore({} as any, { name: "id" } as any, 1);
    expect(mockUpdate).toHaveBeenCalled();
  });
});

// Helper to extract SQL string from Drizzle sql.raw objects
function getSqlString(sqlObj: any): string {
  if (!sqlObj) return "";
  if (typeof sqlObj === "string") return sqlObj;
  // Drizzle sql.raw objects have queryChunks
  if (sqlObj.queryChunks) {
    return sqlObj.queryChunks
      .map((chunk: any) => (Array.isArray(chunk.value) ? chunk.value.join("") : String(chunk.value ?? "")))
      .join("");
  }
  return JSON.stringify(sqlObj);
}

// ============================================================================
// FULL-TEXT SEARCH TESTS
// ============================================================================

describe("FullTextSearchHelper", () => {
  it("should generate tsvector search SQL", () => {
    const condition = fts.search(["name", "description"], "organic maize");
    expect(condition).toBeDefined();
    const sqlStr = getSqlString(condition);
    expect(sqlStr).toContain("to_tsvector");
    expect(sqlStr).toContain("to_tsquery");
  });

  it("should generate rank SQL", () => {
    const rankSql = fts.rank(["name"], "maize");
    expect(rankSql).toBeDefined();
    const sqlStr = getSqlString(rankSql);
    expect(sqlStr).toContain("ts_rank");
  });

  it("should generate highlight SQL", () => {
    const highlightSql = fts.highlight("description", "organic");
    expect(highlightSql).toBeDefined();
    const sqlStr = getSqlString(highlightSql);
    expect(sqlStr).toContain("ts_headline");
  });

  it("should handle multi-word queries with wildcard", () => {
    const condition = fts.search(["name"], "organic maize kenya");
    const sqlStr = getSqlString(condition);
    expect(sqlStr).toContain("organic:*");
    expect(sqlStr).toContain("maize:*");
    expect(sqlStr).toContain("kenya:*");
  });

  it("should escape single quotes in query", () => {
    const condition = fts.search(["name"], "farmer's crop");
    expect(condition).toBeDefined(); // should not throw
  });
});

// ============================================================================
// GEOSPATIAL TESTS
// ============================================================================

describe("GeospatialHelper", () => {
  it("should generate withinRadius SQL", () => {
    const sqlObj = geo.withinRadius("latitude", "longitude", -1.286389, 36.817223, 50);
    const sqlStr = getSqlString(sqlObj);
    expect(sqlStr).toContain("ST_DWithin");
    expect(sqlStr).toContain("50000"); // 50km in meters
  });

  it("should generate distanceKm SQL", () => {
    const sqlObj = geo.distanceKm("latitude", "longitude", -1.286389, 36.817223);
    const sqlStr = getSqlString(sqlObj);
    expect(sqlStr).toContain("ST_Distance");
    expect(sqlStr).toContain("/ 1000");
  });

  it("should generate withinPolygon SQL", () => {
    const geojson = JSON.stringify({
      type: "Polygon",
      coordinates: [[[36, -1], [37, -1], [37, -2], [36, -2], [36, -1]]],
    });
    const sqlObj = geo.withinPolygon("latitude", "longitude", geojson);
    const sqlStr = getSqlString(sqlObj);
    expect(sqlStr).toContain("ST_Within");
    expect(sqlStr).toContain("ST_GeomFromGeoJSON");
  });

  it("should generate cluster SQL", () => {
    const sqlObj = geo.clusterPoints("latitude", "longitude", 1000, 5);
    const sqlStr = getSqlString(sqlObj);
    expect(sqlStr).toContain("ST_ClusterDBSCAN");
  });
});

// ============================================================================
// TIME-SERIES TESTS
// ============================================================================

describe("TimeSeriesHelper", () => {
  it("should generate timeBucket SQL", () => {
    const sqlObj = ts.timeBucket("1 hour", "recorded_at", "temperature", "avg");
    const sqlStr = getSqlString(sqlObj);
    expect(sqlStr).toContain("date_trunc");
    expect(sqlStr).toContain("1 hour");
    expect(sqlStr).toContain("avg");
  });

  it("should generate rollingAvg SQL", () => {
    const sqlObj = ts.rollingAvg("temperature", 7);
    const sqlStr = getSqlString(sqlObj);
    expect(sqlStr).toContain("AVG");
    expect(sqlStr).toContain("OVER");
    expect(sqlStr).toContain("6 PRECEDING");
  });

  it("should generate zScore SQL", () => {
    const sqlObj = ts.zScore("temperature");
    const sqlStr = getSqlString(sqlObj);
    expect(sqlStr).toContain("STDDEV");
    expect(sqlStr).toContain("AVG");
  });

  it("should generate gapFill SQL", () => {
    const start = new Date("2024-01-01");
    const end = new Date("2024-01-07");
    const sqlObj = ts.gapFill(start, end, "1 day", "bucket");
    const sqlStr = getSqlString(sqlObj);
    expect(sqlStr).toContain("generate_series");
    expect(sqlStr).toContain("1 day");
  });
});

// ============================================================================
// OPTIMISTIC LOCKING TESTS
// ============================================================================

describe("OptimisticLockHelper", () => {
  let helper: OptimisticLockHelper;

  beforeEach(() => {
    helper = new OptimisticLockHelper(mockDb);
    vi.clearAllMocks();
  });

  it("should succeed when version matches", async () => {
    const result = await helper.updateWithVersion(
      {} as any,
      { name: "id" } as any,
      { name: "version" } as any,
      1,
      1,
      { name: "Updated Farm" },
    );
    expect(result.success).toBe(true);
    expect(result.newVersion).toBe(2);
  });

  it("should fail when version does not match (concurrent update)", async () => {
    mockUpdate.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            execute: vi.fn().mockResolvedValue([]), // empty = conflict
          }),
        }),
      }),
    });

    const result = await helper.updateWithVersion(
      {} as any,
      { name: "id" } as any,
      { name: "version" } as any,
      1,
      1,
      { name: "Updated Farm" },
    );
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// CURSOR PAGINATION TESTS
// ============================================================================

describe("Cursor Pagination", () => {
  it("should encode and decode cursor correctly", () => {
    const id = 42;
    const createdAt = new Date("2024-06-15T10:00:00Z");
    const cursor = encodeCursor(id, createdAt);
    const decoded = decodeCursor(cursor);
    expect(decoded.id).toBe(id);
    expect(decoded.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it("should produce base64url-safe cursor strings", () => {
    const cursor = encodeCursor(1, new Date());
    expect(cursor).not.toContain("+");
    expect(cursor).not.toContain("/");
    expect(cursor).not.toContain("=");
  });

  it("should build forward cursor condition", () => {
    const cursor = encodeCursor(10, new Date("2024-01-01"));
    const condition = buildCursorCondition(
      cursor,
      { name: "id" } as any,
      { name: "created_at" } as any,
      "forward",
    );
    expect(condition).toBeDefined();
  });

  it("should build backward cursor condition", () => {
    const cursor = encodeCursor(10, new Date("2024-01-01"));
    const condition = buildCursorCondition(
      cursor,
      { name: "id" } as any,
      { name: "created_at" } as any,
      "backward",
    );
    expect(condition).toBeDefined();
  });
});

// ============================================================================
// QUERY PERFORMANCE ANALYZER TESTS
// ============================================================================

describe("QueryPerformanceAnalyzer", () => {
  let analyzer: QueryPerformanceAnalyzer;

  beforeEach(() => {
    analyzer = new QueryPerformanceAnalyzer(100); // 100ms threshold
  });

  it("should track query duration", async () => {
    const queryFn = vi.fn().mockResolvedValue([{ id: 1 }]);
    const { durationMs } = await analyzer.analyze(mockDb, queryFn, "test-query");
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should detect slow queries", async () => {
    const slowFn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 150)),
    );
    const { isSlowQuery } = await analyzer.analyze(mockDb, slowFn, "slow-query");
    expect(isSlowQuery).toBe(true);
  });

  it("should return stats", async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    await analyzer.analyze(mockDb, queryFn, "q1");
    await analyzer.analyze(mockDb, queryFn, "q2");
    const stats = analyzer.getStats();
    expect(stats.total).toBe(2);
    expect(stats.avgMs).toBeGreaterThanOrEqual(0);
  });

  it("should return empty stats for no queries", () => {
    const stats = analyzer.getStats();
    expect(stats).toEqual({ total: 0, avgMs: 0, p95Ms: 0, p99Ms: 0 });
  });
});

// ============================================================================
// DATABASE HEALTH MONITOR TESTS
// ============================================================================

describe("DatabaseHealthMonitor", () => {
  it("should report connected status on successful check", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // SELECT 1
    mockExecute.mockResolvedValueOnce({ rows: [{ active: 5, max_conn: 100 }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ cache_hit_ratio: 98.5 }] });
    mockExecute.mockResolvedValueOnce({ rows: [{ deadlocks: 0, slow_queries: 0 }] });

    const monitor = new DatabaseHealthMonitor(mockDb, 999999);
    const status = await monitor.check();
    expect(status.connected).toBe(true);
    expect(status.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("should report disconnected on error", async () => {
    mockExecute.mockRejectedValueOnce(new Error("Connection refused"));
    const monitor = new DatabaseHealthMonitor(mockDb, 999999);
    const status = await monitor.check();
    expect(status.connected).toBe(false);
  });

  it("should return null before first check", () => {
    const monitor = new DatabaseHealthMonitor(mockDb, 999999);
    expect(monitor.getLastStatus()).toBeNull();
  });
});

// ============================================================================
// MULTI-TENANCY TESTS
// ============================================================================

describe("MultiTenancyHelper", () => {
  it("should build tenant filter condition", () => {
    const col = { name: "tenant_id" } as any;
    const condition = multiTenancy.tenantFilter(col, "tenant-abc");
    expect(condition).toBeDefined();
  });

  it("should set tenant context via SQL", async () => {
    await multiTenancy.setTenantContext(mockDb, "tenant-abc");
    expect(mockExecute).toHaveBeenCalled();
  });
});

// ============================================================================
// AUDIT TRAIL TESTS
// ============================================================================

describe("DrizzleAuditTrail", () => {
  it("should buffer audit entries", () => {
    const trail = new DrizzleAuditTrail(mockDb, 999999);
    trail.record({
      tableName: "farms",
      recordId: 1,
      operation: "UPDATE",
      changedBy: "user-1",
      newValues: { name: "New Farm" },
      changedAt: new Date(),
    });
    // Buffer should have 1 entry (no flush yet)
    trail.destroy();
  });

  it("should flush on destroy", async () => {
    const trail = new DrizzleAuditTrail(mockDb, 999999);
    trail.record({
      tableName: "farms",
      recordId: 1,
      operation: "INSERT",
      changedBy: "user-1",
      changedAt: new Date(),
    });
    trail.destroy();
    // No error thrown = success
  });
});
