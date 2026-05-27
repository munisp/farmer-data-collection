import { pgTable, serial, integer, varchar, text, decimal, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { users } from "./schema";

// ============================================================================
// SUPPLY CHAIN & DELIVERY TABLES
// ============================================================================

export const deliveryZones = pgTable("delivery_zones", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  country: varchar("country", { length: 100 }).notNull(),
  polygonWkt: text("polygon_wkt"),
  pricingMultiplier: decimal("pricing_multiplier", { precision: 5, scale: 2 }).default("1.00"),
  baseFee: integer("base_fee").default(0),
  perKmFee: integer("per_km_fee").default(0),
  currency: varchar("currency", { length: 10 }).default("KES"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const collectionPoints = pgTable("collection_points", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  address: text("address"),
  capacityTons: decimal("capacity_tons", { precision: 10, scale: 2 }).default("0"),
  operatingHours: varchar("operating_hours", { length: 100 }),
  contactPhone: varchar("contact_phone", { length: 20 }),
  cooperativeId: integer("cooperative_id"),
  zoneId: integer("zone_id").references(() => deliveryZones.id, { onDelete: "set null" }),
  amenities: text("amenities"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_collection_points_zone").on(table.zoneId),
]);

export const aggregationHubs = pgTable("aggregation_hubs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  address: text("address"),
  coldStorageCapacityTons: decimal("cold_storage_capacity_tons", { precision: 10, scale: 2 }).default("0"),
  processingCapacityTons: decimal("processing_capacity_tons", { precision: 10, scale: 2 }).default("0"),
  gradingEnabled: boolean("grading_enabled").default(false),
  certifications: text("certifications"),
  contactPhone: varchar("contact_phone", { length: 20 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const qualityGrades = pgTable("quality_grades", {
  id: serial("id").primaryKey(),
  batchId: varchar("batch_id", { length: 100 }).notNull(),
  gradedBy: integer("graded_by").references(() => users.id, { onDelete: "set null" }),
  hubId: integer("hub_id").references(() => aggregationHubs.id, { onDelete: "set null" }),
  grade: varchar("grade", { length: 10 }).notNull(),
  cropType: varchar("crop_type", { length: 100 }),
  moistureContent: decimal("moisture_content", { precision: 5, scale: 2 }),
  foreignMatter: decimal("foreign_matter", { precision: 5, scale: 2 }),
  brokenGrains: decimal("broken_grains", { precision: 5, scale: 2 }),
  photoUrl: varchar("photo_url", { length: 500 }),
  aiGradeConfidence: decimal("ai_grade_confidence", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_quality_grades_batch").on(table.batchId),
]);

// ============================================================================
// DRIVERS & FLEET
// ============================================================================

export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  licenseNumber: varchar("license_number", { length: 50 }),
  vehicleType: varchar("vehicle_type", { length: 50 }).notNull(),
  vehicleRegistration: varchar("vehicle_registration", { length: 50 }),
  hasRefrigeration: boolean("has_refrigeration").default(false),
  capacityKg: integer("capacity_kg").default(0),
  currentLatitude: decimal("current_latitude", { precision: 10, scale: 7 }),
  currentLongitude: decimal("current_longitude", { precision: 10, scale: 7 }),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("5.00"),
  totalDeliveries: integer("total_deliveries").default(0),
  active: boolean("active").default(true).notNull(),
  onlineStatus: varchar("online_status", { length: 20 }).default("offline"),
  zoneId: integer("zone_id").references(() => deliveryZones.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_drivers_zone").on(table.zoneId),
  index("idx_drivers_status").on(table.onlineStatus),
]);

export const deliveryRoutes = pgTable("delivery_routes", {
  id: serial("id").primaryKey(),
  originLatitude: decimal("origin_latitude", { precision: 10, scale: 7 }).notNull(),
  originLongitude: decimal("origin_longitude", { precision: 10, scale: 7 }).notNull(),
  destinationLatitude: decimal("destination_latitude", { precision: 10, scale: 7 }).notNull(),
  destinationLongitude: decimal("destination_longitude", { precision: 10, scale: 7 }).notNull(),
  distanceKm: decimal("distance_km", { precision: 10, scale: 2 }),
  estimatedMinutes: integer("estimated_minutes"),
  routePolyline: text("route_polyline"),
  roadQuality: varchar("road_quality", { length: 20 }).default("paved"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deliveryAssignments = pgTable("delivery_assignments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  driverId: integer("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  routeId: integer("route_id").references(() => deliveryRoutes.id, { onDelete: "set null" }),
  status: varchar("status", { length: 30 }).default("assigned").notNull(),
  pickupTime: timestamp("pickup_time"),
  deliveryTime: timestamp("delivery_time"),
  estimatedArrival: timestamp("estimated_arrival"),
  actualArrival: timestamp("actual_arrival"),
  pickupPhotoUrl: varchar("pickup_photo_url", { length: 500 }),
  deliveryPhotoUrl: varchar("delivery_photo_url", { length: 500 }),
  signatureUrl: varchar("signature_url", { length: 500 }),
  temperature: decimal("temperature", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_delivery_assignments_order").on(table.orderId),
  index("idx_delivery_assignments_driver").on(table.driverId),
  index("idx_delivery_assignments_status").on(table.status),
]);

export const deliveryTracking = pgTable("delivery_tracking", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => deliveryAssignments.id, { onDelete: "cascade" }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  temperature: decimal("temperature", { precision: 5, scale: 2 }),
  humidity: decimal("humidity", { precision: 5, scale: 2 }),
  speed: decimal("speed", { precision: 6, scale: 2 }),
  heading: integer("heading"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => [
  index("idx_delivery_tracking_assignment").on(table.assignmentId),
  index("idx_delivery_tracking_time").on(table.timestamp),
]);

export const deliveryRatings = pgTable("delivery_ratings", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => deliveryAssignments.id, { onDelete: "cascade" }),
  ratedBy: integer("rated_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  deliveryCondition: varchar("delivery_condition", { length: 20 }),
  timeliness: varchar("timeliness", { length: 20 }),
  feedback: text("feedback"),
  photoUrl: varchar("photo_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// SUPPLY CONTRACTS & STANDING ORDERS
// ============================================================================

export const supplyContracts = pgTable("supply_contracts", {
  id: serial("id").primaryKey(),
  farmerId: integer("farmer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  buyerId: integer("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cropType: varchar("crop_type", { length: 100 }).notNull(),
  totalQuantityKg: integer("total_quantity_kg").notNull(),
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("KES"),
  qualityGrade: varchar("quality_grade", { length: 10 }),
  deliverySchedule: text("delivery_schedule"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  penaltyClause: text("penalty_clause"),
  advancePaymentPct: decimal("advance_payment_pct", { precision: 5, scale: 2 }).default("0"),
  deliveryZoneId: integer("delivery_zone_id").references(() => deliveryZones.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_supply_contracts_farmer").on(table.farmerId),
  index("idx_supply_contracts_buyer").on(table.buyerId),
]);

export const standingOrders = pgTable("standing_orders", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cropType: varchar("crop_type", { length: 100 }).notNull(),
  quantityKg: integer("quantity_kg").notNull(),
  frequency: varchar("frequency", { length: 20 }).notNull(),
  deliveryDay: varchar("delivery_day", { length: 20 }),
  deliveryTime: varchar("delivery_time", { length: 20 }),
  maxPricePerKg: integer("max_price_per_kg"),
  minGrade: varchar("min_grade", { length: 10 }).default("B"),
  deliveryAddress: text("delivery_address"),
  deliveryLatitude: decimal("delivery_latitude", { precision: 10, scale: 7 }),
  deliveryLongitude: decimal("delivery_longitude", { precision: 10, scale: 7 }),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// SUBSCRIPTIONS (Produce Boxes)
// ============================================================================

export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  items: text("items"),
  pricePerDelivery: integer("price_per_delivery").notNull(),
  currency: varchar("currency", { length: 10 }).default("KES"),
  frequency: varchar("frequency", { length: 20 }).notNull(),
  maxSubscribers: integer("max_subscribers"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => subscriptionPlans.id, { onDelete: "cascade" }),
  startDate: timestamp("start_date").notNull(),
  deliveryAddress: text("delivery_address"),
  preferences: text("preferences"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_subscriptions_user").on(table.userId),
  index("idx_subscriptions_status").on(table.status),
]);

// ============================================================================
// MOBILE MONEY
// ============================================================================

export const mobileMoneyAccounts = pgTable("mobile_money_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  accountName: varchar("account_name", { length: 200 }),
  isDefault: boolean("is_default").default(false),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_mobile_money_user").on(table.userId),
]);

export const mobileMoneyTransactions = pgTable("mobile_money_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  transactionType: varchar("transaction_type", { length: 20 }).notNull(),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  providerTransactionId: varchar("provider_transaction_id", { length: 100 }),
  orderId: integer("order_id"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  metadata: text("metadata"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_mm_transactions_user").on(table.userId),
  index("idx_mm_transactions_status").on(table.status),
  index("idx_mm_transactions_provider_tx").on(table.providerTransactionId),
]);

// ============================================================================
// ESCROW
// ============================================================================

export const escrowAccounts = pgTable("escrow_accounts", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  buyerId: integer("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sellerId: integer("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).notNull(),
  status: varchar("status", { length: 20 }).default("held").notNull(),
  tigerBeetleTransferId: varchar("tigerbeetle_transfer_id", { length: 100 }),
  releaseCondition: varchar("release_condition", { length: 50 }).default("buyer_confirmation"),
  autoReleaseAt: timestamp("auto_release_at"),
  releasedAt: timestamp("released_at"),
  disputeId: varchar("dispute_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_escrow_order").on(table.orderId),
  index("idx_escrow_status").on(table.status),
]);

// ============================================================================
// GROUP LENDING (Chama/VSLA)
// ============================================================================

export const chamaGroups = pgTable("chama_groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  chairpersonId: integer("chairperson_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  treasurerId: integer("treasurer_id").references(() => users.id, { onDelete: "set null" }),
  secretaryId: integer("secretary_id").references(() => users.id, { onDelete: "set null" }),
  contributionAmount: integer("contribution_amount").notNull(),
  contributionFrequency: varchar("contribution_frequency", { length: 20 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("KES"),
  maxMembers: integer("max_members").default(30),
  loanInterestRate: decimal("loan_interest_rate", { precision: 5, scale: 2 }).default("10.00"),
  maxLoanMultiplier: decimal("max_loan_multiplier", { precision: 5, scale: 2 }).default("3.00"),
  meetingDay: varchar("meeting_day", { length: 20 }),
  location: text("location"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chamaMembers = pgTable("chama_members", {
  id: serial("id").primaryKey(),
  chamaId: integer("chama_id").notNull().references(() => chamaGroups.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).default("member"),
  shareCount: integer("share_count").default(1),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  active: boolean("active").default(true).notNull(),
}, (table) => [
  index("idx_chama_members_chama").on(table.chamaId),
  index("idx_chama_members_user").on(table.userId),
]);

export const chamaContributions = pgTable("chama_contributions", {
  id: serial("id").primaryKey(),
  chamaId: integer("chama_id").notNull().references(() => chamaGroups.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => chamaMembers.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("KES"),
  period: varchar("period", { length: 20 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }),
  transactionId: varchar("transaction_id", { length: 100 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_chama_contributions_chama").on(table.chamaId),
]);

export const chamaLoans = pgTable("chama_loans", {
  id: serial("id").primaryKey(),
  chamaId: integer("chama_id").notNull().references(() => chamaGroups.id, { onDelete: "cascade" }),
  borrowerId: integer("borrower_id").notNull().references(() => chamaMembers.id, { onDelete: "cascade" }),
  guarantorIds: text("guarantor_ids"),
  amount: integer("amount").notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  termWeeks: integer("term_weeks").notNull(),
  purpose: text("purpose"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  approvedAt: timestamp("approved_at"),
  disbursedAt: timestamp("disbursed_at"),
  dueDate: timestamp("due_date"),
  repaidAmount: integer("repaid_amount").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_chama_loans_chama").on(table.chamaId),
  index("idx_chama_loans_borrower").on(table.borrowerId),
]);

// ============================================================================
// PRICE ALERTS
// ============================================================================

export const priceAlerts = pgTable("price_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  crop: varchar("crop", { length: 100 }).notNull(),
  alertType: varchar("alert_type", { length: 20 }).notNull(),
  threshold: integer("threshold").notNull(),
  currency: varchar("currency", { length: 10 }).default("KES"),
  notificationChannel: varchar("notification_channel", { length: 20 }).default("sms"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  region: varchar("region", { length: 100 }).default("kenya"),
  active: boolean("active").default(true).notNull(),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_price_alerts_user").on(table.userId),
  index("idx_price_alerts_crop").on(table.crop),
]);

// ============================================================================
// COLD CHAIN IoT
// ============================================================================

export const coldChainSensors = pgTable("cold_chain_sensors", {
  id: serial("id").primaryKey(),
  sensorId: varchar("sensor_id", { length: 100 }).notNull().unique(),
  vehicleId: integer("vehicle_id"),
  facilityId: integer("facility_id"),
  sensorType: varchar("sensor_type", { length: 50 }).notNull(),
  minTemp: decimal("min_temp", { precision: 5, scale: 2 }),
  maxTemp: decimal("max_temp", { precision: 5, scale: 2 }),
  alertThresholdHigh: decimal("alert_threshold_high", { precision: 5, scale: 2 }),
  alertThresholdLow: decimal("alert_threshold_low", { precision: 5, scale: 2 }),
  active: boolean("active").default(true).notNull(),
  lastReading: timestamp("last_reading"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const coldChainReadings = pgTable("cold_chain_readings", {
  id: serial("id").primaryKey(),
  sensorId: varchar("sensor_id", { length: 100 }).notNull(),
  temperature: decimal("temperature", { precision: 5, scale: 2 }).notNull(),
  humidity: decimal("humidity", { precision: 5, scale: 2 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  batteryLevel: integer("battery_level"),
  alertTriggered: boolean("alert_triggered").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_cold_chain_sensor").on(table.sensorId),
  index("idx_cold_chain_time").on(table.createdAt),
]);

// ============================================================================
// CONSUMER PROFILES (Home Delivery)
// ============================================================================

export const consumerProfiles = pgTable("consumer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deliveryAddresses: text("delivery_addresses"),
  defaultAddressIndex: integer("default_address_index").default(0),
  dietaryPreferences: text("dietary_preferences"),
  notificationPreferences: text("notification_preferences"),
  subscriptionId: integer("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// WEATHER STATIONS (was missing from drizzle schema)
// ============================================================================

export const weatherStations = pgTable("weather_stations", {
  id: serial("id").primaryKey(),
  stationId: varchar("station_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  region: varchar("region", { length: 100 }),
  stationType: varchar("station_type", { length: 50 }).default("automated"),
  elevation: decimal("elevation", { precision: 8, scale: 2 }),
  ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).default("active"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type DeliveryZone = typeof deliveryZones.$inferSelect;
export type InsertDeliveryZone = typeof deliveryZones.$inferInsert;
export type CollectionPoint = typeof collectionPoints.$inferSelect;
export type InsertCollectionPoint = typeof collectionPoints.$inferInsert;
export type AggregationHub = typeof aggregationHubs.$inferSelect;
export type InsertAggregationHub = typeof aggregationHubs.$inferInsert;
export type Driver = typeof drivers.$inferSelect;
export type InsertDriver = typeof drivers.$inferInsert;
export type DeliveryAssignment = typeof deliveryAssignments.$inferSelect;
export type InsertDeliveryAssignment = typeof deliveryAssignments.$inferInsert;
export type SupplyContract = typeof supplyContracts.$inferSelect;
export type InsertSupplyContract = typeof supplyContracts.$inferInsert;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type MobileMoneyAccount = typeof mobileMoneyAccounts.$inferSelect;
export type MobileMoneyTransaction = typeof mobileMoneyTransactions.$inferSelect;
export type EscrowAccount = typeof escrowAccounts.$inferSelect;
export type ChamaGroup = typeof chamaGroups.$inferSelect;
export type ChamaMember = typeof chamaMembers.$inferSelect;
export type ChamaContribution = typeof chamaContributions.$inferSelect;
export type ChamaLoan = typeof chamaLoans.$inferSelect;
export type PriceAlert = typeof priceAlerts.$inferSelect;
export type ColdChainSensor = typeof coldChainSensors.$inferSelect;
export type ColdChainReading = typeof coldChainReadings.$inferSelect;
export type ConsumerProfile = typeof consumerProfiles.$inferSelect;
export type WeatherStation = typeof weatherStations.$inferSelect;

// ============================================================================
// ADDITIONAL TABLES — Gap Fill
// ============================================================================

export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  capacityKg: integer("capacity_kg").notNull(),
  hasRefrigeration: boolean("has_refrigeration").default(false),
  licensePlate: varchar("license_plate", { length: 20 }).notNull(),
  make: varchar("make", { length: 50 }),
  model: varchar("model", { length: 50 }),
  year: integer("year"),
  insuranceExpiry: timestamp("insurance_expiry"),
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const equipmentBookings = pgTable("equipment_bookings", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  equipmentName: varchar("equipment_name", { length: 100 }).notNull(),
  equipmentType: varchar("equipment_type", { length: 50 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  dailyRate: integer("daily_rate").notNull(),
  totalCost: integer("total_cost"),
  status: varchar("status", { length: 20 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_equipment_bookings_coop").on(table.cooperativeId),
]);

export const savingsGoals = pgTable("savings_goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  targetAmount: integer("target_amount").notNull(),
  currentAmount: integer("current_amount").default(0).notNull(),
  currency: varchar("currency", { length: 10 }).default("KES"),
  autoDeductPct: decimal("auto_deduct_pct", { precision: 5, scale: 2 }).default("0"),
  deadline: timestamp("deadline"),
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const negotiationOffers = pgTable("negotiation_offers", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  buyerId: integer("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sellerId: integer("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  offerPricePerUnit: integer("offer_price_per_unit").notNull(),
  quantity: integer("quantity").notNull(),
  message: text("message"),
  status: varchar("status", { length: 20 }).default("pending"),
  counterPrice: integer("counter_price"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_negotiation_listing").on(table.listingId),
  index("idx_negotiation_buyer").on(table.buyerId),
]);

export const insuranceClaims = pgTable("insurance_claims", {
  id: serial("id").primaryKey(),
  policyId: integer("policy_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  claimType: varchar("claim_type", { length: 50 }).notNull(),
  triggerType: varchar("trigger_type", { length: 30 }).default("manual"),
  triggerData: text("trigger_data"),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("KES"),
  status: varchar("status", { length: 20 }).default("pending"),
  satelliteDataRef: varchar("satellite_data_ref", { length: 200 }),
  weatherDataRef: varchar("weather_data_ref", { length: 200 }),
  autoApproved: boolean("auto_approved").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bulkDiscountTiers = pgTable("bulk_discount_tiers", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  minQuantity: integer("min_quantity").notNull(),
  discountPct: decimal("discount_pct", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// SOIL ANALYSIS TABLES
// ============================================================================

export const soilTests = pgTable("soil_tests", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  photoHash: varchar("photo_hash", { length: 64 }),
  ph: decimal("ph", { precision: 5, scale: 2 }).notNull(),
  nitrogenPpm: decimal("nitrogen_ppm", { precision: 8, scale: 2 }).notNull(),
  phosphorusPpm: decimal("phosphorus_ppm", { precision: 8, scale: 2 }).notNull(),
  potassiumPpm: decimal("potassium_ppm", { precision: 8, scale: 2 }).notNull(),
  organicMatterPct: decimal("organic_matter_pct", { precision: 5, scale: 2 }).notNull(),
  cecMeq100g: decimal("cec_meq_100g", { precision: 8, scale: 2 }).notNull(),
  moisturePct: decimal("moisture_pct", { precision: 5, scale: 2 }).default("30"),
  healthScore: decimal("health_score", { precision: 5, scale: 1 }).notNull(),
  healthCategory: varchar("health_category", { length: 20 }).notNull(),
  fertilityClass: varchar("fertility_class", { length: 20 }).notNull(),
  recommendations: text("recommendations").notNull(), // JSON string
  cropSuitability: text("crop_suitability"), // JSON string
  labInterpretation: text("lab_interpretation"), // JSON string
  inputMethod: varchar("input_method", { length: 20 }).default("manual"), // manual, bluetooth, nfc
  deviceName: varchar("device_name", { length: 100 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  elevation: decimal("elevation", { precision: 8, scale: 2 }),
  ndvi: decimal("ndvi", { precision: 5, scale: 3 }),
  inferenceMs: decimal("inference_ms", { precision: 8, scale: 1 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_soil_tests_farm").on(table.farmId),
  index("idx_soil_tests_user").on(table.userId),
  index("idx_soil_tests_created").on(table.createdAt),
]);

export const soilHistory = pgTable("soil_history", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  avgHealthScore: decimal("avg_health_score", { precision: 5, scale: 1 }).notNull(),
  trend: varchar("trend", { length: 20 }).notNull(), // improving, stable, degrading
  testCount: integer("test_count").notNull().default(0),
  avgPh: decimal("avg_ph", { precision: 5, scale: 2 }),
  avgNitrogen: decimal("avg_nitrogen", { precision: 8, scale: 2 }),
  avgPhosphorus: decimal("avg_phosphorus", { precision: 8, scale: 2 }),
  avgPotassium: decimal("avg_potassium", { precision: 8, scale: 2 }),
  avgOrganicMatter: decimal("avg_organic_matter", { precision: 5, scale: 2 }),
  avgCec: decimal("avg_cec", { precision: 8, scale: 2 }),
  improvementPlan: text("improvement_plan"), // JSON string
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_soil_history_farm").on(table.farmId),
]);

export type Vehicle = typeof vehicles.$inferSelect;
export type EquipmentBooking = typeof equipmentBookings.$inferSelect;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type NegotiationOffer = typeof negotiationOffers.$inferSelect;
export type InsuranceClaim = typeof insuranceClaims.$inferSelect;
export type BulkDiscountTier = typeof bulkDiscountTiers.$inferSelect;
export type SoilTest = typeof soilTests.$inferSelect;
export type SoilHistory = typeof soilHistory.$inferSelect;
