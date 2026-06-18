import {
  pgTable, serial, integer, varchar, text, timestamp, doublePrecision,
  boolean, date, index, jsonb, decimal
} from "drizzle-orm/pg-core";
import { users, farms } from "./schema";

// ============================================================================
// DAIRY HERD MANAGEMENT
// ============================================================================

export const dairyCows = pgTable("dairy_cows", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  farmId: integer("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),
  tagNumber: varchar("tag_number", { length: 50 }).notNull(),
  name: varchar("name", { length: 100 }),
  breed: varchar("breed", { length: 100 }).notNull(),
  dateOfBirth: date("date_of_birth"),
  gender: varchar("gender", { length: 10 }).notNull().default("female"),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  acquisitionDate: date("acquisition_date"),
  acquisitionMethod: varchar("acquisition_method", { length: 30 }),
  acquisitionCost: integer("acquisition_cost"),
  sireTag: varchar("sire_tag", { length: 50 }),
  damTag: varchar("dam_tag", { length: 50 }),
  lactationNumber: integer("lactation_number").default(0),
  currentWeight: doublePrecision("current_weight"),
  bodyConditionScore: doublePrecision("body_condition_score"),
  photoUrl: text("photo_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dairy_cows_user_id").on(table.userId),
  index("idx_dairy_cows_farm_id").on(table.farmId),
  index("idx_dairy_cows_tag").on(table.tagNumber),
  index("idx_dairy_cows_breed").on(table.breed),
  index("idx_dairy_cows_status").on(table.status),
]);

// ============================================================================
// DAILY MILK PRODUCTION RECORDS
// ============================================================================

export const milkRecords = pgTable("milk_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cowId: integer("cow_id").notNull().references(() => dairyCows.id, { onDelete: "cascade" }),
  recordDate: date("record_date").notNull(),
  session: varchar("session", { length: 10 }).notNull(),
  quantityLiters: doublePrecision("quantity_liters").notNull(),
  fatPercentage: doublePrecision("fat_percentage"),
  proteinPercentage: doublePrecision("protein_percentage"),
  somaticCellCount: integer("somatic_cell_count"),
  temperature: doublePrecision("temperature"),
  quality: varchar("quality", { length: 20 }).default("grade_a"),
  rejected: boolean("rejected").default(false),
  rejectionReason: text("rejection_reason"),
  collectorId: integer("collector_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_milk_records_user_id").on(table.userId),
  index("idx_milk_records_cow_id").on(table.cowId),
  index("idx_milk_records_date").on(table.recordDate),
  index("idx_milk_records_session").on(table.session),
  index("idx_milk_records_quality").on(table.quality),
]);

// ============================================================================
// BREEDING RECORDS
// ============================================================================

export const breedingRecords = pgTable("breeding_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cowId: integer("cow_id").notNull().references(() => dairyCows.id, { onDelete: "cascade" }),
  breedingDate: date("breeding_date").notNull(),
  method: varchar("method", { length: 30 }).notNull(),
  sireBreed: varchar("sire_breed", { length: 100 }),
  sireTag: varchar("sire_tag", { length: 50 }),
  aiTechnicianName: varchar("ai_technician_name", { length: 200 }),
  strawNumber: varchar("straw_number", { length: 100 }),
  heatDetectedAt: timestamp("heat_detected_at"),
  pregnancyConfirmed: boolean("pregnancy_confirmed").default(false),
  pregnancyCheckDate: date("pregnancy_check_date"),
  expectedCalvingDate: date("expected_calving_date"),
  actualCalvingDate: date("actual_calving_date"),
  calvingDifficulty: varchar("calving_difficulty", { length: 20 }),
  calfTag: varchar("calf_tag", { length: 50 }),
  calfGender: varchar("calf_gender", { length: 10 }),
  calfWeight: doublePrecision("calf_weight"),
  outcome: varchar("outcome", { length: 30 }).default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_breeding_records_user_id").on(table.userId),
  index("idx_breeding_records_cow_id").on(table.cowId),
  index("idx_breeding_records_date").on(table.breedingDate),
  index("idx_breeding_records_outcome").on(table.outcome),
]);

// ============================================================================
// HEALTH LOGS
// ============================================================================

export const dairyHealthLogs = pgTable("dairy_health_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cowId: integer("cow_id").notNull().references(() => dairyCows.id, { onDelete: "cascade" }),
  logDate: date("log_date").notNull(),
  category: varchar("category", { length: 30 }).notNull(),
  condition: varchar("condition", { length: 200 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull().default("mild"),
  treatment: text("treatment"),
  medication: varchar("medication", { length: 200 }),
  dosage: varchar("dosage", { length: 100 }),
  administeredBy: varchar("administered_by", { length: 200 }),
  vetName: varchar("vet_name", { length: 200 }),
  withdrawalPeriodDays: integer("withdrawal_period_days"),
  withdrawalEndDate: date("withdrawal_end_date"),
  followUpDate: date("follow_up_date"),
  resolved: boolean("resolved").default(false),
  cost: integer("cost"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dairy_health_user_id").on(table.userId),
  index("idx_dairy_health_cow_id").on(table.cowId),
  index("idx_dairy_health_date").on(table.logDate),
  index("idx_dairy_health_category").on(table.category),
  index("idx_dairy_health_severity").on(table.severity),
]);

// ============================================================================
// DAIRY SUPPLIERS (Feed, Vet Drugs, Breeding Services)
// ============================================================================

export const dairySuppliers = pgTable("dairy_suppliers", {
  id: serial("id").primaryKey(),
  businessName: varchar("business_name", { length: 200 }).notNull(),
  supplierType: varchar("supplier_type", { length: 30 }).notNull(),
  contactPerson: varchar("contact_person", { length: 200 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 30 }).notNull(),
  email: varchar("email", { length: 200 }),
  address: text("address"),
  state: varchar("state", { length: 50 }),
  lga: varchar("lga", { length: 100 }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  verified: boolean("verified").default(false),
  verifiedAt: timestamp("verified_at"),
  rating: doublePrecision("rating").default(0),
  reviewCount: integer("review_count").default(0),
  products: jsonb("products"),
  deliveryAvailable: boolean("delivery_available").default(false),
  deliveryRadius: integer("delivery_radius_km"),
  operatingHours: varchar("operating_hours", { length: 200 }),
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dairy_suppliers_type").on(table.supplierType),
  index("idx_dairy_suppliers_state").on(table.state),
  index("idx_dairy_suppliers_verified").on(table.verified),
  index("idx_dairy_suppliers_rating").on(table.rating),
]);

// ============================================================================
// DAIRY SUPPLIER PRODUCTS
// ============================================================================

export const dairySupplierProducts = pgTable("dairy_supplier_products", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => dairySuppliers.id, { onDelete: "cascade" }),
  productName: varchar("product_name", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  description: text("description"),
  unit: varchar("unit", { length: 30 }).notNull(),
  pricePerUnit: integer("price_per_unit").notNull(),
  currency: varchar("currency", { length: 5 }).default("NGN"),
  inStock: boolean("in_stock").default(true),
  minOrderQuantity: integer("min_order_quantity").default(1),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dairy_products_supplier").on(table.supplierId),
  index("idx_dairy_products_category").on(table.category),
]);

// ============================================================================
// DAIRY MARKET — Milk Processors & Buyers
// ============================================================================

export const dairyProcessors = pgTable("dairy_processors", {
  id: serial("id").primaryKey(),
  businessName: varchar("business_name", { length: 200 }).notNull(),
  processorType: varchar("processor_type", { length: 50 }).notNull(),
  contactPerson: varchar("contact_person", { length: 200 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 30 }).notNull(),
  email: varchar("email", { length: 200 }),
  address: text("address"),
  state: varchar("state", { length: 50 }),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  pricePerLiter: integer("price_per_liter"),
  currency: varchar("currency", { length: 5 }).default("NGN"),
  minDailyVolume: doublePrecision("min_daily_volume"),
  maxDailyVolume: doublePrecision("max_daily_volume"),
  acceptedGrades: jsonb("accepted_grades"),
  paymentTerms: varchar("payment_terms", { length: 100 }),
  collectionSchedule: jsonb("collection_schedule"),
  verified: boolean("verified").default(false),
  rating: doublePrecision("rating").default(0),
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dairy_processors_type").on(table.processorType),
  index("idx_dairy_processors_state").on(table.state),
  index("idx_dairy_processors_verified").on(table.verified),
]);

// ============================================================================
// MILK COLLECTION SCHEDULE & PICKUPS
// ============================================================================

export const milkCollections = pgTable("milk_collections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  farmId: integer("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),
  processorId: integer("processor_id").notNull().references(() => dairyProcessors.id, { onDelete: "cascade" }),
  collectionDate: date("collection_date").notNull(),
  scheduledTime: varchar("scheduled_time", { length: 10 }),
  actualTime: varchar("actual_time", { length: 10 }),
  totalLiters: doublePrecision("total_liters").notNull(),
  pricePerLiter: integer("price_per_liter").notNull(),
  totalAmount: integer("total_amount").notNull(),
  qualityGrade: varchar("quality_grade", { length: 20 }),
  fatContent: doublePrecision("fat_content"),
  temperature: doublePrecision("temperature"),
  status: varchar("status", { length: 20 }).notNull().default("scheduled"),
  paymentStatus: varchar("payment_status", { length: 20 }).default("pending"),
  driverName: varchar("driver_name", { length: 200 }),
  vehiclePlate: varchar("vehicle_plate", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_milk_collections_user_id").on(table.userId),
  index("idx_milk_collections_farm_id").on(table.farmId),
  index("idx_milk_collections_processor_id").on(table.processorId),
  index("idx_milk_collections_date").on(table.collectionDate),
  index("idx_milk_collections_status").on(table.status),
]);

// ============================================================================
// SUPPLIER ORDERS
// ============================================================================

export const dairySupplierOrders = pgTable("dairy_supplier_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  supplierId: integer("supplier_id").notNull().references(() => dairySuppliers.id, { onDelete: "cascade" }),
  items: jsonb("items").notNull(),
  totalAmount: integer("total_amount").notNull(),
  currency: varchar("currency", { length: 5 }).default("NGN"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  deliveryAddress: text("delivery_address"),
  deliveryDate: date("delivery_date"),
  paymentMethod: varchar("payment_method", { length: 30 }),
  paymentStatus: varchar("payment_status", { length: 20 }).default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dairy_orders_user_id").on(table.userId),
  index("idx_dairy_orders_supplier_id").on(table.supplierId),
  index("idx_dairy_orders_status").on(table.status),
]);
