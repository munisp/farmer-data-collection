/**
 * Spatial Engines Schema — MobyDB + latlng integration tables
 *
 * PostgreSQL fallback/metadata tables for when MobyDB/latlng are unavailable,
 * plus tracking metadata that enriches the spatial engine records.
 */

import { pgTable, serial, integer, varchar, text, timestamp, doublePrecision, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./schema";

// ── MobyDB Provenance Records (PostgreSQL mirror) ─────────────────

export const provenanceRecords = pgTable("provenance_records", {
  id: serial("id").primaryKey(),
  h3Cell: varchar("h3_cell", { length: 20 }).notNull(),
  epoch: integer("epoch").notNull(),
  pubkeyHex: varchar("pubkey_hex", { length: 64 }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  recordType: varchar("record_type", { length: 50 }).notNull(), // field_observation, consignment, milk_collection, carbon_measurement
  payload: jsonb("payload").notNull(),
  signatureHex: varchar("signature_hex", { length: 128 }),
  merkleRoot: varchar("merkle_root", { length: 64 }),
  merkleProof: jsonb("merkle_proof"),
  verified: boolean("verified").default(false),
  mobydbSynced: boolean("mobydb_synced").default(false),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_provenance_h3_cell").on(table.h3Cell),
  index("idx_provenance_epoch").on(table.epoch),
  index("idx_provenance_pubkey").on(table.pubkeyHex),
  index("idx_provenance_user_id").on(table.userId),
  index("idx_provenance_record_type").on(table.recordType),
  index("idx_provenance_created_at").on(table.createdAt),
  uniqueIndex("idx_provenance_spacetime_address").on(table.h3Cell, table.epoch, table.pubkeyHex),
]);

export const provenanceEpochs = pgTable("provenance_epochs", {
  epoch: integer("epoch").primaryKey(),
  sealed: boolean("sealed").default(false),
  recordCount: integer("record_count").default(0),
  merkleRoot: varchar("merkle_root", { length: 64 }),
  sealedAt: timestamp("sealed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const provenanceKeys = pgTable("provenance_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pubkeyHex: varchar("pubkey_hex", { length: 64 }).notNull(),
  keyType: varchar("key_type", { length: 20 }).notNull().default("ed25519"),
  label: varchar("label", { length: 200 }),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
}, (table) => [
  uniqueIndex("idx_provenance_keys_pubkey").on(table.pubkeyHex),
  index("idx_provenance_keys_user_id").on(table.userId),
]);

// ── latlng Tracked Objects (PostgreSQL mirror) ─────────────────────

export const trackedObjects = pgTable("tracked_objects", {
  id: serial("id").primaryKey(),
  objectId: varchar("object_id", { length: 100 }).notNull(),
  collection: varchar("collection", { length: 100 }).notNull(),
  objectType: varchar("object_type", { length: 50 }).notNull(), // vehicle, cold_chain, distributor, farmer, sensor
  label: varchar("label", { length: 200 }),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  altitude: doublePrecision("altitude"),
  speed: doublePrecision("speed"),
  heading: doublePrecision("heading"),
  accuracy: doublePrecision("accuracy"),
  fields: jsonb("fields"),         // Temperature, battery, status, etc.
  metadata: jsonb("metadata"),     // Vehicle plate, driver name, load details
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  latlngSynced: boolean("latlng_synced").default(false),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_tracked_objects_collection_id").on(table.collection, table.objectId),
  index("idx_tracked_objects_type").on(table.objectType),
  index("idx_tracked_objects_user_id").on(table.userId),
  index("idx_tracked_objects_last_updated").on(table.lastUpdated),
]);

export const trackingHistory = pgTable("tracking_history", {
  id: serial("id").primaryKey(),
  objectId: varchar("object_id", { length: 100 }).notNull(),
  collection: varchar("collection", { length: 100 }).notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  speed: doublePrecision("speed"),
  heading: doublePrecision("heading"),
  fields: jsonb("fields"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
}, (table) => [
  index("idx_tracking_history_object").on(table.objectId, table.collection),
  index("idx_tracking_history_recorded_at").on(table.recordedAt),
]);

export const geofenceZones = pgTable("geofence_zones", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  zoneType: varchar("zone_type", { length: 50 }).notNull(), // farm_boundary, delivery_zone, cold_chain_route, coverage_area, warehouse
  collection: varchar("collection", { length: 100 }).notNull(),
  detectEvents: jsonb("detect_events").default(["enter", "exit"]),
  geojson: jsonb("geojson").notNull(),
  webhookUrl: text("webhook_url"),
  active: boolean("active").default(true),
  latlngSynced: boolean("latlng_synced").default(false),
  metadata: jsonb("metadata"),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_geofence_zones_name").on(table.name),
  index("idx_geofence_zones_type").on(table.zoneType),
  index("idx_geofence_zones_collection").on(table.collection),
]);

export const geofenceEvents = pgTable("geofence_events", {
  id: serial("id").primaryKey(),
  zoneName: varchar("zone_name", { length: 200 }).notNull(),
  eventType: varchar("event_type", { length: 20 }).notNull(), // enter, exit, inside, outside, cross
  objectId: varchar("object_id", { length: 100 }).notNull(),
  collection: varchar("collection", { length: 100 }).notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  fields: jsonb("fields"),
  webhookDelivered: boolean("webhook_delivered").default(false),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  index("idx_geofence_events_zone").on(table.zoneName),
  index("idx_geofence_events_object").on(table.objectId),
  index("idx_geofence_events_occurred_at").on(table.occurredAt),
  index("idx_geofence_events_type").on(table.eventType),
]);

// ── Supply Chain Provenance Tracking ───────────────────────────────

export const supplyChainSteps = pgTable("supply_chain_steps", {
  id: serial("id").primaryKey(),
  chainId: varchar("chain_id", { length: 100 }).notNull(),
  stepNumber: integer("step_number").notNull(),
  stepType: varchar("step_type", { length: 50 }).notNull(), // harvest, storage, transport, processing, delivery
  actorPubkey: varchar("actor_pubkey", { length: 64 }).notNull(),
  actorName: varchar("actor_name", { length: 200 }),
  h3Cell: varchar("h3_cell", { length: 20 }),
  epoch: integer("epoch"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  payload: jsonb("payload"),      // Weight, quality grade, temperature, photos
  signatureHex: varchar("signature_hex", { length: 128 }),
  provenanceRecordId: integer("provenance_record_id").references(() => provenanceRecords.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_supply_chain_steps_chain_id").on(table.chainId),
  index("idx_supply_chain_steps_type").on(table.stepType),
  index("idx_supply_chain_steps_actor").on(table.actorPubkey),
  index("idx_supply_chain_steps_h3").on(table.h3Cell),
]);
