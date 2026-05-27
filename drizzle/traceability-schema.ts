/**
 * Supply Chain Traceability Schema
 * Track agricultural products from farm to buyer with QR codes
 */

import { pgTable, serial, varchar, text, integer, decimal, boolean, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './schema';

// Batch status enum
export const batchStatusEnum = pgEnum('batch_status', [
  'created',
  'at_farm',
  'in_transit',
  'at_collection_center',
  'at_warehouse',
  'processing',
  'ready_for_sale',
  'sold',
  'delivered',
  'rejected',
]);

// Quality grade enum
export const qualityGradeEnum = pgEnum('quality_grade', [
  'premium',
  'grade_a',
  'grade_b',
  'grade_c',
  'rejected',
]);

// Event type enum
export const traceabilityEventTypeEnum = pgEnum('traceability_event_type', [
  'harvest',
  'quality_check',
  'collection',
  'transport_start',
  'transport_end',
  'warehouse_receipt',
  'processing_start',
  'processing_end',
  'packaging',
  'sale',
  'delivery',
  'return',
  'disposal',
]);

// Product batches table
export const productBatches = pgTable('product_batches', {
  id: serial('id').primaryKey(),
  
  // Batch identification
  batchCode: varchar('batch_code', { length: 50 }).notNull().unique(),
  qrCode: text('qr_code'), // QR code data/URL
  
  // Product details
  cropType: varchar('crop_type', { length: 100 }).notNull(),
  variety: varchar('variety', { length: 100 }),
  
  // Quantity
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  unit: varchar('unit', { length: 20 }).notNull(), // kg, tonnes, bags
  currentQuantity: decimal('current_quantity', { precision: 10, scale: 2 }),
  
  // Quality
  qualityGrade: qualityGradeEnum('quality_grade'),
  moistureContent: decimal('moisture_content', { precision: 5, scale: 2 }),
  foreignMatter: decimal('foreign_matter', { precision: 5, scale: 2 }),
  
  // Origin
  farmId: integer('farm_id'),
  farmerId: integer('farmer_id').references(() => users.id),
  cooperativeId: integer('cooperative_id'),
  
  // Location
  originVillage: varchar('origin_village', { length: 255 }),
  originDistrict: varchar('origin_district', { length: 255 }),
  originRegion: varchar('origin_region', { length: 255 }),
  originLatitude: decimal('origin_latitude', { precision: 10, scale: 7 }),
  originLongitude: decimal('origin_longitude', { precision: 10, scale: 7 }),
  
  // Current location
  currentLocation: varchar('current_location', { length: 255 }),
  currentLatitude: decimal('current_latitude', { precision: 10, scale: 7 }),
  currentLongitude: decimal('current_longitude', { precision: 10, scale: 7 }),
  
  // Status
  status: batchStatusEnum('status').notNull().default('created'),
  
  // Dates
  harvestDate: timestamp('harvest_date'),
  expiryDate: timestamp('expiry_date'),
  
  // Certifications
  certifications: text('certifications'), // JSON array of certification names
  isOrganic: boolean('is_organic').default(false),
  
  // Pricing (in cents)
  farmGatePrice: integer('farm_gate_price'),
  currentPrice: integer('current_price'),
  
  // Metadata
  metadata: jsonb('metadata'),
  
  // Audit
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Traceability events
export const traceabilityEvents = pgTable('traceability_events', {
  id: serial('id').primaryKey(),
  batchId: integer('batch_id').references(() => productBatches.id).notNull(),
  
  // Event details
  eventType: traceabilityEventTypeEnum('event_type').notNull(),
  eventDescription: text('event_description'),
  
  // Location
  location: varchar('location', { length: 255 }),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  
  // Quantity at event
  quantityBefore: decimal('quantity_before', { precision: 10, scale: 2 }),
  quantityAfter: decimal('quantity_after', { precision: 10, scale: 2 }),
  
  // Quality at event
  qualityGrade: qualityGradeEnum('quality_grade'),
  qualityNotes: text('quality_notes'),
  
  // Temperature/conditions
  temperature: decimal('temperature', { precision: 5, scale: 2 }),
  humidity: decimal('humidity', { precision: 5, scale: 2 }),
  
  // Photos
  photoUrls: text('photo_urls'), // JSON array
  
  // Actors
  performedBy: integer('performed_by').references(() => users.id),
  organizationName: varchar('organization_name', { length: 255 }),
  
  // Verification
  isVerified: boolean('is_verified').default(false),
  verifiedBy: integer('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at'),
  
  // Metadata
  metadata: jsonb('metadata'),
  
  // Audit
  eventTimestamp: timestamp('event_timestamp').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Collection centers
export const collectionCenters = pgTable('collection_centers', {
  id: serial('id').primaryKey(),
  
  // Center details
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }).unique(),
  
  // Location
  address: text('address'),
  village: varchar('village', { length: 255 }),
  district: varchar('district', { length: 255 }),
  region: varchar('region', { length: 255 }),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  
  // Contact
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  managerName: varchar('manager_name', { length: 255 }),
  managerId: integer('manager_id').references(() => users.id),
  
  // Capacity
  storageCapacity: decimal('storage_capacity', { precision: 10, scale: 2 }), // In tonnes
  currentStock: decimal('current_stock', { precision: 10, scale: 2 }),
  
  // Facilities
  hasWeighingScale: boolean('has_weighing_scale').default(false),
  hasMoistureReader: boolean('has_moisture_reader').default(false),
  hasColdStorage: boolean('has_cold_storage').default(false),
  
  // Status
  isActive: boolean('is_active').default(true),
  
  // Cooperative association
  cooperativeId: integer('cooperative_id'),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Warehouses
export const warehouses = pgTable('warehouses', {
  id: serial('id').primaryKey(),
  
  // Warehouse details
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }).unique(),
  warehouseType: varchar('warehouse_type', { length: 50 }), // public, private, cooperative
  
  // Location
  address: text('address'),
  city: varchar('city', { length: 255 }),
  region: varchar('region', { length: 255 }),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  
  // Contact
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  
  // Capacity
  totalCapacity: decimal('total_capacity', { precision: 12, scale: 2 }), // In tonnes
  availableCapacity: decimal('available_capacity', { precision: 12, scale: 2 }),
  
  // Certifications
  certifications: text('certifications'), // JSON array
  
  // Status
  isActive: boolean('is_active').default(true),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Warehouse receipts
export const warehouseReceipts = pgTable('warehouse_receipts', {
  id: serial('id').primaryKey(),
  
  // Receipt identification
  receiptNumber: varchar('receipt_number', { length: 100 }).notNull().unique(),
  
  // Batch and warehouse
  batchId: integer('batch_id').references(() => productBatches.id).notNull(),
  warehouseId: integer('warehouse_id').references(() => warehouses.id).notNull(),
  
  // Depositor
  depositorId: integer('depositor_id').references(() => users.id).notNull(),
  depositorType: varchar('depositor_type', { length: 50 }), // farmer, cooperative, trader
  
  // Commodity details
  commodityType: varchar('commodity_type', { length: 100 }).notNull(),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(),
  unit: varchar('unit', { length: 20 }).notNull(),
  qualityGrade: qualityGradeEnum('quality_grade'),
  
  // Value (in cents)
  estimatedValue: integer('estimated_value'),
  
  // Dates
  depositDate: timestamp('deposit_date').notNull(),
  expectedReleaseDate: timestamp('expected_release_date'),
  actualReleaseDate: timestamp('actual_release_date'),
  
  // Status
  status: varchar('status', { length: 50 }).default('active'), // active, released, expired, pledged
  
  // Collateral (if used for loan)
  isPledged: boolean('is_pledged').default(false),
  pledgedToLoanId: integer('pledged_to_loan_id'),
  
  // Storage fees (in cents)
  dailyStorageFee: integer('daily_storage_fee'),
  totalFeesAccrued: integer('total_fees_accrued'),
  
  // Audit
  issuedBy: integer('issued_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const productBatchesRelations = relations(productBatches, ({ one, many }) => ({
  farmer: one(users, {
    fields: [productBatches.farmerId],
    references: [users.id],
  }),
  createdByUser: one(users, {
    fields: [productBatches.createdBy],
    references: [users.id],
  }),
  events: many(traceabilityEvents),
  warehouseReceipts: many(warehouseReceipts),
}));

export const traceabilityEventsRelations = relations(traceabilityEvents, ({ one }) => ({
  batch: one(productBatches, {
    fields: [traceabilityEvents.batchId],
    references: [productBatches.id],
  }),
  performedByUser: one(users, {
    fields: [traceabilityEvents.performedBy],
    references: [users.id],
  }),
  verifiedByUser: one(users, {
    fields: [traceabilityEvents.verifiedBy],
    references: [users.id],
  }),
}));

export const collectionCentersRelations = relations(collectionCenters, ({ one }) => ({
  manager: one(users, {
    fields: [collectionCenters.managerId],
    references: [users.id],
  }),
}));

export const warehouseReceiptsRelations = relations(warehouseReceipts, ({ one }) => ({
  batch: one(productBatches, {
    fields: [warehouseReceipts.batchId],
    references: [productBatches.id],
  }),
  warehouse: one(warehouses, {
    fields: [warehouseReceipts.warehouseId],
    references: [warehouses.id],
  }),
  depositor: one(users, {
    fields: [warehouseReceipts.depositorId],
    references: [users.id],
  }),
  issuedByUser: one(users, {
    fields: [warehouseReceipts.issuedBy],
    references: [users.id],
  }),
}));

// Type exports
export type ProductBatch = typeof productBatches.$inferSelect;
export type NewProductBatch = typeof productBatches.$inferInsert;
export type TraceabilityEvent = typeof traceabilityEvents.$inferSelect;
export type NewTraceabilityEvent = typeof traceabilityEvents.$inferInsert;
export type CollectionCenter = typeof collectionCenters.$inferSelect;
export type NewCollectionCenter = typeof collectionCenters.$inferInsert;
export type Warehouse = typeof warehouses.$inferSelect;
export type NewWarehouse = typeof warehouses.$inferInsert;
export type WarehouseReceipt = typeof warehouseReceipts.$inferSelect;
export type NewWarehouseReceipt = typeof warehouseReceipts.$inferInsert;
