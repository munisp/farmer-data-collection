import { pgTable, serial, integer, varchar, text, timestamp, doublePrecision, bigint, index, jsonb } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const fieldCollections = pgTable("field_collections", {
  id: varchar("id", { length: 100 }).primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  featureCount: integer("feature_count").default(0),
  geojson: jsonb("geojson"),
  syncedAt: timestamp("synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_field_collections_user_id").on(table.userId),
  index("idx_field_collections_synced_at").on(table.syncedAt),
]);

export const spectralAnalyses = pgTable("spectral_analyses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  farmId: integer("farm_id"),
  indexType: varchar("index_type", { length: 10 }).notNull(),
  meanValue: doublePrecision("mean_value"),
  minValue: doublePrecision("min_value"),
  maxValue: doublePrecision("max_value"),
  stdDev: doublePrecision("std_dev"),
  healthDistribution: jsonb("health_distribution"),
  sourceUrl: text("source_url"),
  analysisDate: timestamp("analysis_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_spectral_analyses_user_id").on(table.userId),
  index("idx_spectral_analyses_farm_id").on(table.farmId),
  index("idx_spectral_analyses_index_type").on(table.indexType),
  index("idx_spectral_analyses_date").on(table.analysisDate),
]);

export const cachedTileAreas = pgTable("cached_tile_areas", {
  id: varchar("id", { length: 100 }).primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  boundsNorth: doublePrecision("bounds_north"),
  boundsSouth: doublePrecision("bounds_south"),
  boundsEast: doublePrecision("bounds_east"),
  boundsWest: doublePrecision("bounds_west"),
  minZoom: integer("min_zoom"),
  maxZoom: integer("max_zoom"),
  tileCount: integer("tile_count"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("idx_cached_tile_areas_user_id").on(table.userId),
]);
