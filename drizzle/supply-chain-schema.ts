import { pgTable, serial, integer, varchar, text, decimal, timestamp, boolean, index, jsonb } from "drizzle-orm/pg-core";
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
  paymentPhone: varchar("payment_phone", { length: 20 }),
  pricePerDelivery: integer("price_per_delivery"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  // Renewal tracking
  lastRenewalAt: timestamp("last_renewal_at"),
  nextRenewalAt: timestamp("next_renewal_at"),
  renewalAttempts: integer("renewal_attempts").default(0),
  cancellationReason: text("cancellation_reason"),
  cancelledAt: timestamp("cancelled_at"),
  // Trial tracking
  isTrial: boolean("is_trial").default(false),
  trialEndsAt: timestamp("trial_ends_at"),
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
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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
  // Merry-go-round fields
  merryGoRoundEnabled: boolean("merry_go_round_enabled").default(false),
  rotationOrder: jsonb("rotation_order"),
  currentRotationIndex: integer("current_rotation_index").default(0),
  cycleFrequency: varchar("cycle_frequency", { length: 20 }),
  currentCycleStart: timestamp("current_cycle_start"),
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
  type: varchar("type", { length: 30 }).default("regular"),
  period: varchar("period", { length: 20 }).default("monthly"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  transactionId: varchar("transaction_id", { length: 100 }),
  notes: text("notes"),
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

// ============================================================================
// DRONE & UAV TABLES
// ============================================================================

export const droneFlights = pgTable("drone_flights", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  droneModel: varchar("drone_model", { length: 100 }),
  droneSerial: varchar("drone_serial", { length: 100 }),
  flightType: varchar("flight_type", { length: 30 }).notNull(), // survey, spray, scout, seed, monitor
  plannedAreaHa: decimal("planned_area_ha", { precision: 8, scale: 2 }),
  actualAreaHa: decimal("actual_area_ha", { precision: 8, scale: 2 }),
  altitudeM: decimal("altitude_m", { precision: 6, scale: 1 }),
  speedMs: decimal("speed_ms", { precision: 4, scale: 1 }),
  flightPathWkt: text("flight_path_wkt"), // PostGIS LINESTRING WKT
  coveragePolygonWkt: text("coverage_polygon_wkt"), // PostGIS POLYGON WKT
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  durationMinutes: decimal("duration_minutes", { precision: 8, scale: 1 }),
  batteryStartPct: decimal("battery_start_pct", { precision: 5, scale: 1 }),
  batteryEndPct: decimal("battery_end_pct", { precision: 5, scale: 1 }),
  imagesCaptured: integer("images_captured"),
  sprayVolumeLiters: decimal("spray_volume_liters", { precision: 8, scale: 2 }),
  chemicalUsed: varchar("chemical_used", { length: 200 }),
  applicationRateLha: decimal("application_rate_l_ha", { precision: 8, scale: 2 }),
  windSpeedMs: decimal("wind_speed_ms", { precision: 5, scale: 1 }),
  windDirection: varchar("wind_direction", { length: 10 }),
  temperature: decimal("temperature", { precision: 5, scale: 1 }),
  humidity: decimal("humidity", { precision: 5, scale: 1 }),
  status: varchar("status", { length: 20 }).default("planned"), // planned, in_progress, completed, aborted
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_drone_flights_farm").on(table.farmId),
  index("idx_drone_flights_status").on(table.status),
]);

export const droneImagery = pgTable("drone_imagery", {
  id: serial("id").primaryKey(),
  flightId: integer("flight_id").references(() => droneFlights.id),
  farmId: integer("farm_id").notNull(),
  imageType: varchar("image_type", { length: 30 }), // rgb, ndvi, thermal, multispectral, orthomosaic
  filePath: varchar("file_path", { length: 500 }),
  fileSize: integer("file_size"),
  bboxWkt: text("bbox_wkt"), // PostGIS POLYGON bounding box
  resolutionCm: decimal("resolution_cm", { precision: 5, scale: 1 }),
  processed: boolean("processed").default(false),
  processingEngine: varchar("processing_engine", { length: 50 }), // opendronemap, pix4d, dronedeploy
  ndviMean: decimal("ndvi_mean", { precision: 5, scale: 3 }),
  ndviMin: decimal("ndvi_min", { precision: 5, scale: 3 }),
  ndviMax: decimal("ndvi_max", { precision: 5, scale: 3 }),
  anomaliesDetected: integer("anomalies_detected").default(0),
  plantCount: integer("plant_count"),
  weedCoverage: decimal("weed_coverage_pct", { precision: 5, scale: 2 }),
  cropHealthScore: decimal("crop_health_score", { precision: 5, scale: 1 }),
  processingTimeS: decimal("processing_time_s", { precision: 8, scale: 1 }),
  metadata: text("metadata"), // JSON: camera settings, GPS exif, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_drone_imagery_flight").on(table.flightId),
  index("idx_drone_imagery_farm").on(table.farmId),
]);

// ============================================================================
// EQUIPMENT TELEMETRY TABLES
// ============================================================================

export const equipmentTelemetry = pgTable("equipment_telemetry", {
  id: serial("id").primaryKey(),
  equipmentId: integer("equipment_id").notNull(),
  equipmentType: varchar("equipment_type", { length: 30 }).notNull(), // tractor, drone, sprayer, harvester, irrigation
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  speedKmh: decimal("speed_kmh", { precision: 5, scale: 1 }),
  headingDeg: decimal("heading_deg", { precision: 5, scale: 1 }),
  altitudeM: decimal("altitude_m", { precision: 8, scale: 2 }),
  engineRpm: integer("engine_rpm"),
  fuelRateLph: decimal("fuel_rate_lph", { precision: 6, scale: 2 }),
  fuelLevelPct: decimal("fuel_level_pct", { precision: 5, scale: 1 }),
  ptoSpeedRpm: integer("pto_speed_rpm"),
  engineHours: decimal("engine_hours", { precision: 10, scale: 1 }),
  implementStatus: text("implement_status"), // JSON: ISOBUS process data
  diagnosticCodes: text("diagnostic_codes"), // JSON: DTC codes
  operatorId: integer("operator_id"),
  fieldId: integer("field_id"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
}, (table) => [
  index("idx_telemetry_equipment").on(table.equipmentId),
  index("idx_telemetry_recorded").on(table.recordedAt),
]);

export const equipmentMaintenancePredictions = pgTable("equipment_maintenance_predictions", {
  id: serial("id").primaryKey(),
  equipmentId: integer("equipment_id").notNull(),
  componentName: varchar("component_name", { length: 100 }).notNull(),
  predictedFailureDate: timestamp("predicted_failure_date"),
  confidencePct: decimal("confidence_pct", { precision: 5, scale: 1 }),
  currentWearPct: decimal("current_wear_pct", { precision: 5, scale: 1 }),
  recommendedAction: varchar("recommended_action", { length: 200 }),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("KES"),
  priority: varchar("priority", { length: 20 }).default("medium"), // low, medium, high, critical
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  modelVersion: varchar("model_version", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_maint_pred_equipment").on(table.equipmentId),
]);

// ============================================================================
// AI CONVERSATION TABLES
// ============================================================================

export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  farmId: integer("farm_id"),
  sessionId: varchar("session_id", { length: 64 }),
  channel: varchar("channel", { length: 20 }).notNull(), // whatsapp, ussd, voice, app, sms
  language: varchar("language", { length: 10 }).default("en"),
  query: text("query").notNull(),
  queryType: varchar("query_type", { length: 30 }), // crop_diagnosis, soil_advice, market_price, weather, general
  response: text("response").notNull(),
  modelUsed: varchar("model_used", { length: 50 }),
  contextSources: text("context_sources"), // JSON: which RAG docs were used
  confidence: decimal("confidence", { precision: 5, scale: 3 }),
  feedbackRating: integer("feedback_rating"), // 1-5 from farmer
  feedbackText: text("feedback_text"),
  inferenceMs: decimal("inference_ms", { precision: 8, scale: 1 }),
  tokensUsed: integer("tokens_used"),
  photoAttached: boolean("photo_attached").default(false),
  photoAnalysis: text("photo_analysis"), // JSON: disease/soil analysis result
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ai_conv_user").on(table.userId),
  index("idx_ai_conv_session").on(table.sessionId),
  index("idx_ai_conv_channel").on(table.channel),
]);

// ============================================================================
// PRESCRIPTION MAP TABLES
// ============================================================================

export const prescriptionMaps = pgTable("prescription_maps", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull(),
  fieldId: integer("field_id"),
  mapType: varchar("map_type", { length: 30 }).notNull(), // seeding, fertilizer, spray, irrigation, lime
  source: varchar("source", { length: 30 }).notNull(), // soil_analysis, drone_ndvi, satellite, manual, ai_generated
  zones: text("zones").notNull(), // JSON: array of {polygon_wkt, rate, unit, product}
  totalAreaHa: decimal("total_area_ha", { precision: 8, scale: 2 }),
  inputProduct: varchar("input_product", { length: 200 }),
  totalQuantity: decimal("total_quantity", { precision: 10, scale: 2 }),
  unit: varchar("unit", { length: 20 }),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("KES"),
  generatedBy: varchar("generated_by", { length: 50 }),
  applied: boolean("applied").default(false),
  appliedAt: timestamp("applied_at"),
  appliedByEquipmentId: integer("applied_by_equipment_id"),
  applicationMethod: varchar("application_method", { length: 30 }), // drone, tractor, manual
  actualQuantityUsed: decimal("actual_quantity_used", { precision: 10, scale: 2 }),
  effectivenessScore: decimal("effectiveness_score", { precision: 5, scale: 1 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_prescription_farm").on(table.farmId),
  index("idx_prescription_type").on(table.mapType),
]);

// ============================================================================
// IOT SENSOR TABLES
// ============================================================================

export const iotDevices = pgTable("iot_devices", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull(),
  deviceEui: varchar("device_eui", { length: 32 }), // LoRaWAN EUI
  deviceName: varchar("device_name", { length: 100 }).notNull(),
  deviceType: varchar("device_type", { length: 30 }).notNull(), // soil_sensor, weather_station, water_level, livestock_collar, camera_trap
  protocol: varchar("protocol", { length: 20 }).notNull(), // lorawan, mqtt, ble, modbus, wifi
  manufacturer: varchar("manufacturer", { length: 100 }),
  model: varchar("model", { length: 100 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  batteryPct: decimal("battery_pct", { precision: 5, scale: 1 }),
  lastSeenAt: timestamp("last_seen_at"),
  firmwareVersion: varchar("firmware_version", { length: 30 }),
  status: varchar("status", { length: 20 }).default("active"), // active, offline, maintenance, decommissioned
  config: text("config"), // JSON: reporting interval, thresholds, calibration
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_iot_devices_farm").on(table.farmId),
  index("idx_iot_devices_eui").on(table.deviceEui),
]);

export const iotReadings = pgTable("iot_readings", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => iotDevices.id),
  readingType: varchar("reading_type", { length: 30 }).notNull(), // temperature, humidity, soil_moisture, soil_temp, rainfall, wind_speed, water_level, ndvi
  value: decimal("value", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  quality: varchar("quality", { length: 20 }).default("good"), // good, suspect, calibration_needed
  rawValue: decimal("raw_value", { precision: 12, scale: 4 }),
  rssi: integer("rssi"), // signal strength for LoRaWAN
  snr: decimal("snr", { precision: 5, scale: 1 }), // signal-to-noise
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
}, (table) => [
  index("idx_iot_readings_device").on(table.deviceId),
  index("idx_iot_readings_time").on(table.recordedAt),
  index("idx_iot_readings_type").on(table.readingType),
]);

// ============================================================================
// EQUIPMENT-AS-A-SERVICE MARKETPLACE
// ============================================================================

export const equipmentListings = pgTable("equipment_listings", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  equipmentType: varchar("equipment_type", { length: 30 }).notNull(), // tractor, drone, sprayer, harvester, irrigation, planter
  brand: varchar("brand", { length: 100 }),
  model: varchar("model", { length: 100 }),
  yearManufactured: integer("year_manufactured"),
  horsePower: integer("horse_power"),
  attachments: text("attachments"), // JSON: available implements
  pricePerHour: decimal("price_per_hour", { precision: 10, scale: 2 }),
  pricePerHa: decimal("price_per_ha", { precision: 10, scale: 2 }),
  pricePerDay: decimal("price_per_day", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("KES"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  serviceRadius: decimal("service_radius_km", { precision: 6, scale: 1 }),
  availability: text("availability"), // JSON: calendar/schedule
  operatorIncluded: boolean("operator_included").default(true),
  insuranceCovered: boolean("insurance_covered").default(false),
  avgRating: decimal("avg_rating", { precision: 3, scale: 2 }),
  totalBookings: integer("total_bookings").default(0),
  status: varchar("status", { length: 20 }).default("available"), // available, booked, maintenance, inactive
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_equip_listing_owner").on(table.ownerId),
  index("idx_equip_listing_type").on(table.equipmentType),
]);

export const equipmentRentals = pgTable("equipment_rentals", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => equipmentListings.id),
  renterId: integer("renter_id").notNull().references(() => users.id),
  farmId: integer("farm_id").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  totalHours: decimal("total_hours", { precision: 8, scale: 1 }),
  totalArea: decimal("total_area_ha", { precision: 8, scale: 2 }),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("KES"),
  paymentStatus: varchar("payment_status", { length: 20 }).default("pending"), // pending, paid, refunded
  paymentMethod: varchar("payment_method", { length: 20 }),
  operatorName: varchar("operator_name", { length: 100 }),
  workCompleted: text("work_completed"), // JSON: area covered, tasks done
  renterRating: integer("renter_rating"),
  ownerRating: integer("owner_rating"),
  status: varchar("status", { length: 20 }).default("pending"), // pending, confirmed, in_progress, completed, cancelled
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_equip_rental_listing").on(table.listingId),
  index("idx_equip_rental_renter").on(table.renterId),
]);

// ============================================================================
// DIGITAL TWIN / FARM SIMULATION
// ============================================================================

export const farmDigitalTwins = pgTable("farm_digital_twins", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull(),
  twinVersion: integer("twin_version").default(1),
  boundaryWkt: text("boundary_wkt"), // PostGIS POLYGON
  elevationModelPath: varchar("elevation_model_path", { length: 500 }),
  soilMapPath: varchar("soil_map_path", { length: 500 }),
  drainageModelPath: varchar("drainage_model_path", { length: 500 }),
  ndviTimeseriesPath: varchar("ndvi_timeseries_path", { length: 500 }),
  fieldZones: text("field_zones"), // JSON: management zones with properties
  cropHistory: text("crop_history"), // JSON: what was planted where, when
  yieldHistory: text("yield_history"), // JSON: yield data by zone
  soilSamples: text("soil_samples"), // JSON: georeferenced soil test results
  weatherStationId: integer("weather_station_id"),
  iotDeviceIds: text("iot_device_ids"), // JSON: array of device IDs
  lastSimulationAt: timestamp("last_simulation_at"),
  simulationResults: text("simulation_results"), // JSON: latest sim output
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_digital_twin_farm").on(table.farmId),
]);

// ============================================================================
// ORDER RETURNS & REFUNDS
// ============================================================================

export const orderReturns = pgTable("order_returns", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  buyerId: integer("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sellerId: integer("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  reason: varchar("reason", { length: 50 }).notNull(), // damaged, wrong_item, quality, not_as_described, spoiled, other
  description: text("description"),
  photoUrls: text("photo_urls"), // JSON array
  returnMethod: varchar("return_method", { length: 30 }).default("collection_point"), // collection_point, driver_pickup, drop_off
  collectionPointId: integer("collection_point_id"),
  refundAmount: integer("refund_amount"),
  refundMethod: varchar("refund_method", { length: 20 }), // mobile_money, stripe, wallet
  status: varchar("status", { length: 20 }).default("requested").notNull(), // requested, approved, rejected, pickup_scheduled, received, refunded
  sellerResponse: text("seller_response"),
  adminNotes: text("admin_notes"),
  approvedAt: timestamp("approved_at"),
  receivedAt: timestamp("received_at"),
  refundedAt: timestamp("refunded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_order_returns_order").on(table.orderId),
  index("idx_order_returns_buyer").on(table.buyerId),
  index("idx_order_returns_status").on(table.status),
]);

// ============================================================================
// FRESHNESS TRACKING (Cold Chain ↔ Order linkage)
// ============================================================================

export const orderFreshnessLogs = pgTable("order_freshness_logs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  assignmentId: integer("assignment_id"),
  sensorId: varchar("sensor_id", { length: 100 }),
  avgTemperature: decimal("avg_temperature", { precision: 5, scale: 2 }),
  maxTemperature: decimal("max_temperature", { precision: 5, scale: 2 }),
  minTemperature: decimal("min_temperature", { precision: 5, scale: 2 }),
  avgHumidity: decimal("avg_humidity", { precision: 5, scale: 2 }),
  totalTransitMinutes: integer("total_transit_minutes"),
  coldChainBreaches: integer("cold_chain_breaches").default(0),
  estimatedShelfLifeHours: integer("estimated_shelf_life_hours"),
  freshnessScore: decimal("freshness_score", { precision: 5, scale: 1 }), // 0-100
  freshnessGrade: varchar("freshness_grade", { length: 5 }), // A+, A, B, C, F
  harvestDate: timestamp("harvest_date"),
  packDate: timestamp("pack_date"),
  deliveryDate: timestamp("delivery_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_freshness_order").on(table.orderId),
  index("idx_freshness_assignment").on(table.assignmentId),
]);

// ============================================================================
// ORDER STATUS NOTIFICATIONS
// ============================================================================

export const orderNotifications = pgTable("order_notifications", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel: varchar("channel", { length: 20 }).notNull(), // push, sms, email, whatsapp, in_app
  eventType: varchar("event_type", { length: 50 }).notNull(), // order_confirmed, shipped, delivered, return_approved, etc.
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  metadata: text("metadata"), // JSON
  sentAt: timestamp("sent_at"),
  readAt: timestamp("read_at"),
  deliveryStatus: varchar("delivery_status", { length: 20 }).default("pending"), // pending, sent, delivered, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_order_notif_order").on(table.orderId),
  index("idx_order_notif_user").on(table.userId),
]);

// ============================================================================
// RETAIL STORES (B2B)
// ============================================================================

export const retailStores = pgTable("retail_stores", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  businessType: varchar("business_type", { length: 50 }).notNull(), // supermarket, grocery, restaurant, hotel, school, hospital, wholesaler
  registrationNumber: varchar("registration_number", { length: 100 }),
  taxId: varchar("tax_id", { length: 100 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  country: varchar("country", { length: 100 }).default("Kenya"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  contactPhone: varchar("contact_phone", { length: 20 }),
  contactEmail: varchar("contact_email", { length: 200 }),
  operatingHours: text("operating_hours"), // JSON: { mon: { open: "08:00", close: "20:00" }, ... }
  deliveryInstructions: text("delivery_instructions"),
  preferredDeliveryDays: text("preferred_delivery_days"), // JSON: ["monday", "wednesday", "friday"]
  paymentTerms: varchar("payment_terms", { length: 30 }).default("cod"), // cod, net_7, net_14, net_30, prepaid
  creditLimit: integer("credit_limit").default(0),
  creditUsed: integer("credit_used").default(0),
  currency: varchar("currency", { length: 10 }).default("KES"),
  verified: boolean("verified").default(false),
  verifiedAt: timestamp("verified_at"),
  tier: varchar("tier", { length: 20 }).default("standard"), // standard, premium, enterprise
  avgMonthlyVolume: integer("avg_monthly_volume"), // in KES
  preferredCategories: text("preferred_categories"), // JSON: ["vegetables", "fruits", "dairy"]
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_retail_store_owner").on(table.ownerId),
  index("idx_retail_store_city").on(table.city),
  index("idx_retail_store_type").on(table.businessType),
]);

export const retailStandingOrders = pgTable("retail_standing_orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => retailStores.id, { onDelete: "cascade" }),
  sellerId: integer("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 50 }).notNull(),
  productName: varchar("product_name", { length: 200 }),
  weeklyQuantity: integer("weekly_quantity").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  maxPricePerUnit: integer("max_price_per_unit"),
  qualityGrade: varchar("quality_grade", { length: 5 }).default("A"), // A+, A, B
  deliveryDay: varchar("delivery_day", { length: 15 }).notNull(), // monday, tuesday, etc.
  deliveryTimeSlot: varchar("delivery_time_slot", { length: 20 }).default("morning"), // morning, afternoon, evening
  requiresColdChain: boolean("requires_cold_chain").default(false),
  autoRenew: boolean("auto_renew").default(true),
  status: varchar("status", { length: 20 }).default("active"), // active, paused, cancelled
  lastFulfilledAt: timestamp("last_fulfilled_at"),
  fulfillmentRate: decimal("fulfillment_rate", { precision: 5, scale: 2 }), // % of orders successfully filled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_retail_standing_store").on(table.storeId),
  index("idx_retail_standing_seller").on(table.sellerId),
]);

export const retailInvoices = pgTable("retail_invoices", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => retailStores.id, { onDelete: "cascade" }),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  orderId: integer("order_id"),
  subtotal: integer("subtotal").notNull(),
  taxAmount: integer("tax_amount").default(0),
  deliveryFee: integer("delivery_fee").default(0),
  totalAmount: integer("total_amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("KES"),
  status: varchar("status", { length: 20 }).default("unpaid"), // unpaid, partial, paid, overdue, cancelled
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  paymentMethod: varchar("payment_method", { length: 20 }),
  paymentReference: varchar("payment_reference", { length: 100 }),
  notes: text("notes"),
  lineItems: text("line_items"), // JSON: [{product, qty, unit, price, total}]
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_retail_invoice_store").on(table.storeId),
  index("idx_retail_invoice_status").on(table.status),
]);

export type Vehicle = typeof vehicles.$inferSelect;
export type EquipmentBooking = typeof equipmentBookings.$inferSelect;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type NegotiationOffer = typeof negotiationOffers.$inferSelect;
export type InsuranceClaim = typeof insuranceClaims.$inferSelect;
export type BulkDiscountTier = typeof bulkDiscountTiers.$inferSelect;
export type SoilTest = typeof soilTests.$inferSelect;
export type SoilHistory = typeof soilHistory.$inferSelect;
export type DroneFlight = typeof droneFlights.$inferSelect;
export type DroneImagery = typeof droneImagery.$inferSelect;
export type EquipmentTelemetry = typeof equipmentTelemetry.$inferSelect;
export type AiConversation = typeof aiConversations.$inferSelect;
export type PrescriptionMap = typeof prescriptionMaps.$inferSelect;
export type IotDevice = typeof iotDevices.$inferSelect;
export type IotReading = typeof iotReadings.$inferSelect;
export type EquipmentListing = typeof equipmentListings.$inferSelect;
export type EquipmentRental = typeof equipmentRentals.$inferSelect;
export type FarmDigitalTwin = typeof farmDigitalTwins.$inferSelect;
export type OrderReturn = typeof orderReturns.$inferSelect;
export type OrderFreshnessLog = typeof orderFreshnessLogs.$inferSelect;
export type OrderNotification = typeof orderNotifications.$inferSelect;
export type RetailStore = typeof retailStores.$inferSelect;
export type RetailStandingOrder = typeof retailStandingOrders.$inferSelect;
export type RetailInvoice = typeof retailInvoices.$inferSelect;
