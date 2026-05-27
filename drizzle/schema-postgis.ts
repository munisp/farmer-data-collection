/**
 * PostGIS-enhanced schema for geospatial features
 * This file extends the base schema with PostGIS geometry types
 */

import { pgTable, serial, integer, varchar, text, timestamp, doublePrecision, sql } from "drizzle-orm/pg-core";
import { users, farmers } from "./schema";

/**
 * Farms table with PostGIS Point geometry for location
 */
export const farmsGeo = pgTable("farms", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  farmerId: integer("farmer_id").references(() => farmers.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  
  // PostGIS geometry column (Point with SRID 4326 = WGS 84)
  location: sql`geometry(Point, 4326)`,
  
  // Keep latitude/longitude for backward compatibility
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  
  size: doublePrecision("size"),
  unit: varchar("unit", { length: 20 }),
  soilType: varchar("soil_type", { length: 100 }),
  irrigationType: varchar("irrigation_type", { length: 100 }),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Farm boundaries table with PostGIS Polygon geometry
 * Extended to support RTK GPS and Leaf.io integration
 */
export const farmBoundaries = pgTable("farm_boundaries", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farmsGeo.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // PostGIS polygon geometry (SRID 4326 = WGS 84)
  boundary: sql`geometry(Polygon, 4326)`.notNull(),
  
  // Calculated fields (computed by PostgreSQL)
  areaSqm: doublePrecision("area_sqm"),
  areaHectares: doublePrecision("area_hectares"),
  perimeterM: doublePrecision("perimeter_m"),
  
  name: varchar("name", { length: 255 }),
  description: text("description"),
  boundaryType: varchar("boundary_type", { length: 50 }).default("manual"),
  
  // RTK GPS support - track accuracy of boundary capture
  captureMethod: varchar("capture_method", { length: 50 }).default("smartphone"), // smartphone, rtk_rover, survey, imported
  averageAccuracyM: doublePrecision("average_accuracy_m"), // Average GPS accuracy during capture (meters)
  isRtkCalibrated: sql`boolean`.default(false), // True if captured with RTK GPS (cm-level accuracy)
  
  // Leaf.io integration - external boundary sync
  sourceSystem: varchar("source_system", { length: 50 }).default("local"), // local, leaf, john_deere, climate_fieldview
  externalId: varchar("external_id", { length: 255 }), // External system's boundary ID (e.g., Leaf field ID)
  externalUpdatedAt: timestamp("external_updated_at"), // Last update time from external system
  syncStatus: varchar("sync_status", { length: 50 }).default("local_only"), // local_only, synced, pending_push, pending_pull, conflict
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Type exports for TypeScript
 */
export type FarmGeo = typeof farmsGeo.$inferSelect;
export type InsertFarmGeo = typeof farmsGeo.$inferInsert;
export type FarmBoundary = typeof farmBoundaries.$inferSelect;
export type InsertFarmBoundary = typeof farmBoundaries.$inferInsert;

/**
 * Helper types for GeoJSON
 */
export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
}

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: [number, number][][]; // Array of rings, each ring is array of [lon, lat]
}

export interface GeoJSONFeature<G = GeoJSONPoint | GeoJSONPolygon> {
  type: "Feature";
  geometry: G;
  properties: Record<string, any>;
}

export interface GeoJSONFeatureCollection<G = GeoJSONPoint | GeoJSONPolygon> {
  type: "FeatureCollection";
  features: GeoJSONFeature<G>[];
}
