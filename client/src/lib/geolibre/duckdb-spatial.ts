/**
 * DuckDB-WASM Spatial Engine
 *
 * In-browser spatial SQL engine for offline-capable geospatial queries.
 * Inspired by GeoLibre's DuckDB-WASM integration.
 * Supports GeoJSON ingestion, spatial queries (ST_Distance, ST_Contains,
 * ST_Buffer, ST_Area), and result export — all without server round-trips.
 */

let dbInstance: unknown | null = null;
let connInstance: unknown | null = null;

const VALID_TABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;

function sanitizeTableName(name: string): string {
  if (!VALID_TABLE_NAME.test(name)) {
    throw new Error(`Invalid table name: ${name}`);
  }
  return name;
}

function escapeString(value: string): string {
  return value.replace(/'/g, "''").replace(/\\/g, "\\\\");
}

interface DuckDBModule {
  selectBundle: (config: Record<string, string>) => Promise<{ mainModule: string; mainWorker: string }>;
  ConsoleLogger: new () => unknown;
  AsyncDuckDB: new (logger: unknown, worker: Worker) => DuckDB;
  createWorker: (url: string) => Worker;
}

interface DuckDB {
  instantiate: (mainModule: string, pthreadWorker?: null) => Promise<void>;
  open: (config: Record<string, unknown>) => Promise<void>;
  connect: () => Promise<DuckDBConnection>;
}

interface DuckDBConnection {
  query: (sql: string) => Promise<DuckDBResult>;
  close: () => Promise<void>;
}

interface DuckDBResult {
  toArray: () => Array<Record<string, unknown>>;
  numRows: number;
  numCols: number;
}

export interface SpatialQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  columnCount: number;
  executionTimeMs: number;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: string; coordinates: unknown };
    properties: Record<string, unknown>;
  }>;
}

/**
 * Initialize the DuckDB-WASM engine with spatial extensions.
 * Lazy-loads on first use; subsequent calls return cached instance.
 */
export async function initDuckDBSpatial(): Promise<{ db: DuckDB; conn: DuckDBConnection }> {
  if (dbInstance && connInstance) {
    return { db: dbInstance as DuckDB, conn: connInstance as DuckDBConnection };
  }

  // Attempt dynamic DuckDB-WASM load (optional dependency)
  try {
    // Dynamic import — @duckdb/duckdb-wasm is an optional peer dependency.
    // Using variable to bypass static module resolution (package may not be installed).
    const DUCKDB_PKG = "@duckdb/duckdb-wasm";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const duckdbModule: any = await import(/* @vite-ignore */ DUCKDB_PKG);
    const allBundles = await duckdbModule.selectBundle(duckdbModule.getJsDelivrBundles());
    const loggerInstance = new duckdbModule.ConsoleLogger();
    const worker = await duckdbModule.createWorker(allBundles.mainWorker);
    const db = new duckdbModule.AsyncDuckDB(loggerInstance, worker);
    await db.instantiate(allBundles.mainModule, allBundles.pthreadWorker);
    await db.open({});
    const conn = await db.connect();
    await conn.query("INSTALL spatial; LOAD spatial;");
    dbInstance = db;
    connInstance = conn as DuckDBConnection;
    console.info("[DuckDB-WASM] Spatial engine initialized");
    return { db: db as DuckDB, conn: conn as DuckDBConnection };
  } catch {
    console.warn("[DuckDB-WASM] Not available, using in-memory fallback. Install @duckdb/duckdb-wasm for full spatial SQL.");
    const fallbackConn = createFallbackConnection();
    connInstance = fallbackConn;
    return { db: {} as DuckDB, conn: fallbackConn };
  }
}

/**
 * Execute a spatial SQL query against loaded data.
 */
export async function executeSpatialQuery(sql: string): Promise<SpatialQueryResult> {
  const { conn } = await initDuckDBSpatial();
  const start = performance.now();
  const result = await conn.query(sql);
  const executionTimeMs = performance.now() - start;

  return {
    rows: result.toArray(),
    rowCount: result.numRows,
    columnCount: result.numCols,
    executionTimeMs,
  };
}

/**
 * Load GeoJSON data into a DuckDB table for querying.
 */
export async function loadGeoJSONTable(
  tableName: string,
  geojson: GeoJSONFeatureCollection
): Promise<void> {
  const { conn } = await initDuckDBSpatial();

  // Create table from GeoJSON features
  const columns = new Set<string>();
  geojson.features.forEach(f => {
    Object.keys(f.properties).forEach(k => columns.add(k));
  });

  // Build CREATE TABLE and INSERT statements
  const safeTable = sanitizeTableName(tableName);
  await conn.query(`DROP TABLE IF EXISTS ${safeTable}`);

  const rows = geojson.features.map(f => {
    const geom = JSON.stringify(f.geometry);
    const props = Object.fromEntries(
      Array.from(columns).map(col => [col, f.properties[col] ?? null])
    );
    return { geom, ...props };
  });

  if (rows.length === 0) return;

  // Create table with geometry column — column names sanitized
  const safeCols = Array.from(columns).map(c => sanitizeTableName(c));
  const colDefs = safeCols.map(c => `"${c}" VARCHAR`).join(", ");
  await conn.query(`CREATE TABLE ${safeTable} (geom GEOMETRY, ${colDefs})`);

  // Insert rows with escaped values
  for (const row of rows) {
    const vals = safeCols.map(c => {
      const v = (row as Record<string, unknown>)[c];
      return v === null || v === undefined ? "NULL" : `'${escapeString(String(v))}'`;
    });
    await conn.query(
      `INSERT INTO ${safeTable} VALUES (ST_GeomFromGeoJSON('${escapeString(row.geom)}'), ${vals.join(", ")})`
    );
  }
}

/**
 * Find features within a given distance (meters) of a point.
 */
export async function findNearby(
  tableName: string,
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<SpatialQueryResult> {
  const safeTable = sanitizeTableName(tableName);
  return executeSpatialQuery(`
    SELECT *, ST_Distance(
      geom,
      ST_Point(${Number(lng)}, ${Number(lat)})
    ) * 111319.9 AS distance_m
    FROM ${safeTable}
    WHERE ST_Distance(geom, ST_Point(${Number(lng)}, ${Number(lat)})) * 111319.9 < ${Number(radiusMeters)}
    ORDER BY distance_m
  `);
}

/**
 * Calculate area of polygon features in square meters.
 */
export async function calculateAreas(tableName: string): Promise<SpatialQueryResult> {
  const safeTable = sanitizeTableName(tableName);
  return executeSpatialQuery(`
    SELECT *, ST_Area(geom) * 12321000000 AS area_sq_m
    FROM ${safeTable}
    WHERE ST_GeometryType(geom) IN ('POLYGON', 'MULTIPOLYGON')
  `);
}

/**
 * Preset spatial queries for agricultural use cases.
 */
export const FARM_SPATIAL_QUERIES = {
  farmsByRegion: (region: string) => `
    SELECT * FROM farms WHERE state = '${escapeString(region)}' ORDER BY area_sq_m DESC
  `,
  distributorCoverage: (radiusKm: number) => `
    SELECT d.*, ST_Buffer(d.geom, ${Number(radiusKm) / 111.32}) AS coverage_area
    FROM distributors d WHERE d.status = 'approved'
  `,
  nearestDistributor: (lat: number, lng: number) => `
    SELECT *, ST_Distance(geom, ST_Point(${Number(lng)}, ${Number(lat)})) * 111.32 AS distance_km
    FROM distributors ORDER BY distance_km LIMIT 5
  `,
  cropDensityGrid: () => `
    SELECT ST_SnapToGrid(geom, 0.1) AS cell,
           COUNT(*) AS farm_count,
           SUM(CAST(area_hectares AS DOUBLE)) AS total_hectares
    FROM farms
    GROUP BY cell
  `,
};

function createFallbackConnection(): DuckDBConnection {
  const tables: Record<string, Array<Record<string, unknown>>> = {};
  return {
    query: async (sql: string): Promise<DuckDBResult> => {
      // Simple SELECT * fallback
      const match = sql.match(/FROM\s+(\w+)/i);
      const tableName = match ? match[1] : "";
      const rows = tables[tableName] || [];
      return {
        toArray: () => rows,
        numRows: rows.length,
        numCols: rows.length > 0 ? Object.keys(rows[0]).length : 0,
      };
    },
    close: async () => {},
  };
}
