/**
 * schema-platform-extended.ts
 *
 * Extended platform schema covering:
 * - Carbon credit tokenization (carbonProjects, carbonCredits)
 * - Chama savings intelligence (chamaGroups, chamaMembers, chamaTransactions)
 * - Conversational commerce (chatSessions, chatMessages)
 * - Digital twin & IoT (digitalTwins, iotDevices, iotReadings, iotRules)
 * - Export chain (exportShipments, exportCertifications)
 * - Federated learning (federatedModels, federatedParticipants)
 * - Insurance AI (insuranceProducts, insurancePolicies, insuranceClaims)
 * - Market prices (marketPrices, marketAlerts)
 * - Data pipeline (pipelineJobs, pipelineMetrics)
 * - Compliance (complianceRules, paymentTransactions)
 * - Soil & predictions (soilSamples, predictions)
 * - Retail (retailStores, retailInventory)
 *
 * This file is the canonical source for all tables imported as
 * "../../drizzle/schema-platform-extended.js" across the server routers.
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  decimal,
  boolean,
  index,
  uniqueIndex,
  jsonb,
  date,
  pgEnum,
} from "drizzle-orm/pg-core";

// ============================================================================
// CARBON CREDIT TOKENIZATION
// ============================================================================

export const carbonProjectStatusEnum = pgEnum("carbon_project_status", [
  "pending", "active", "verified", "completed", "suspended",
]);

export const carbonProjects = pgTable("carbon_projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  methodology: varchar("methodology", { length: 100 }).notNull(), // agroforestry, biochar, conservation_tillage, mangrove_restoration, cover_cropping
  region: varchar("region", { length: 200 }).notNull(),
  farmerId: integer("farmer_id"),
  areaHectares: decimal("area_hectares", { precision: 12, scale: 2 }).notNull(),
  annualSequestration: decimal("annual_sequestration", { precision: 12, scale: 2 }).notNull(), // tCO2e/year
  totalCreditsIssued: decimal("total_credits_issued", { precision: 14, scale: 2 }).default("0"),
  totalCreditsRetired: decimal("total_credits_retired", { precision: 14, scale: 2 }).default("0"),
  status: carbonProjectStatusEnum("status").notNull().default("pending"),
  verifier: varchar("verifier", { length: 100 }), // Verra VCS, Gold Standard, Plan Vivo
  verificationDate: timestamp("verification_date"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  description: text("description"),
  coordinates: jsonb("coordinates"), // GeoJSON polygon
  monitoringReportUrl: varchar("monitoring_report_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_carbon_projects_farmer").on(table.farmerId),
  index("idx_carbon_projects_status").on(table.status),
  index("idx_carbon_projects_region").on(table.region),
]);

export const carbonCreditStatusEnum = pgEnum("carbon_credit_status", [
  "available", "reserved", "sold", "retired", "cancelled",
]);

export const carbonCredits = pgTable("carbon_credits", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => carbonProjects.id, { onDelete: "cascade" }),
  serialNumber: varchar("serial_number", { length: 100 }).notNull().unique(),
  vintage: integer("vintage").notNull(), // year of sequestration
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(), // tCO2e
  pricePerTon: decimal("price_per_ton", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  status: carbonCreditStatusEnum("status").notNull().default("available"),
  buyerId: integer("buyer_id"),
  tokenId: varchar("token_id", { length: 100 }), // blockchain token ID
  blockchainTxHash: varchar("blockchain_tx_hash", { length: 100 }),
  retiredAt: timestamp("retired_at"),
  retirementReason: text("retirement_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_carbon_credits_project").on(table.projectId),
  index("idx_carbon_credits_status").on(table.status),
  index("idx_carbon_credits_vintage").on(table.vintage),
]);

// ============================================================================
// CHAMA SAVINGS INTELLIGENCE
// ============================================================================

export const chamaGroups = pgTable("chama_groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  chairpersonId: integer("chairperson_id").notNull(),
  treasurerId: integer("treasurer_id"),
  secretaryId: integer("secretary_id"),
  contributionAmount: integer("contribution_amount").notNull().default(0),
  contributionFrequency: varchar("contribution_frequency", { length: 20 }).notNull().default("monthly"), // weekly, monthly, quarterly
  currency: varchar("currency", { length: 10 }).default("KES"),
  maxMembers: integer("max_members").default(30),
  memberCount: integer("member_count").default(0).notNull(),
  totalSavings: decimal("total_savings", { precision: 15, scale: 2 }).default("0").notNull(),
  totalLoansOutstanding: decimal("total_loans_outstanding", { precision: 15, scale: 2 }).default("0"),
  loanInterestRate: decimal("loan_interest_rate", { precision: 5, scale: 2 }).default("10.00"),
  maxLoanMultiplier: decimal("max_loan_multiplier", { precision: 5, scale: 2 }).default("3.00"),
  meetingDay: varchar("meeting_day", { length: 20 }),
  location: text("location"),
  isActive: boolean("is_active").default(true).notNull(),
  // Merry-go-round fields
  merryGoRoundEnabled: boolean("merry_go_round_enabled").default(false),
  rotationOrder: jsonb("rotation_order"),
  currentRotationIndex: integer("current_rotation_index").default(0),
  cycleFrequency: varchar("cycle_frequency", { length: 20 }),
  currentCycleStart: timestamp("current_cycle_start"),
  // AI fields
  creditScore: integer("credit_score").default(500),
  creditGrade: varchar("credit_grade", { length: 5 }).default("C"),
  investmentRecommendations: jsonb("investment_recommendations"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_chama_groups_chairperson").on(table.chairpersonId),
  index("idx_chama_groups_active").on(table.isActive),
]);

export const chamaMembers = pgTable("chama_members", {
  id: serial("id").primaryKey(),
  chamaId: integer("chama_id").notNull().references(() => chamaGroups.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull(),
  role: varchar("role", { length: 20 }).default("member"), // member, chairperson, treasurer, secretary
  shareCount: integer("share_count").default(1),
  totalContributed: decimal("total_contributed", { precision: 12, scale: 2 }).default("0"),
  totalWithdrawn: decimal("total_withdrawn", { precision: 12, scale: 2 }).default("0"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
  index("idx_chama_members_chama").on(table.chamaId),
  index("idx_chama_members_user").on(table.userId),
  uniqueIndex("idx_chama_members_unique").on(table.chamaId, table.userId),
]);

export const chamaTransactions = pgTable("chama_transactions", {
  id: serial("id").primaryKey(),
  chamaId: integer("chama_id").notNull().references(() => chamaGroups.id, { onDelete: "cascade" }),
  memberId: integer("member_id"),
  type: varchar("type", { length: 30 }).notNull(), // contribution, withdrawal, loan_disbursement, loan_repayment, dividend, penalty
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("KES"),
  description: text("description"),
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }),
  referenceId: varchar("reference_id", { length: 100 }), // external payment reference
  tigerBeetleId: varchar("tigerbeetle_id", { length: 100 }), // TigerBeetle ledger entry
  status: varchar("status", { length: 20 }).default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_chama_txns_chama").on(table.chamaId),
  index("idx_chama_txns_type").on(table.type),
  index("idx_chama_txns_created").on(table.createdAt),
]);

// ============================================================================
// CONVERSATIONAL COMMERCE (AI Chat)
// ============================================================================

export const chatSessionStatusEnum = pgEnum("chat_session_status", [
  "active", "ended", "expired", "transferred",
]);

export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  channel: varchar("channel", { length: 30 }).notNull().default("whatsapp"), // whatsapp, sms, web, mobile
  phoneNumber: varchar("phone_number", { length: 30 }),
  language: varchar("language", { length: 10 }).default("en"),
  intent: varchar("intent", { length: 100 }), // buy_produce, sell_produce, check_price, apply_loan, etc.
  context: jsonb("context"), // session context for AI
  status: chatSessionStatusEnum("status").notNull().default("active"),
  messageCount: integer("message_count").default(0),
  ordersCreated: integer("orders_created").default(0),
  totalOrderValue: decimal("total_order_value", { precision: 12, scale: 2 }).default("0"),
  aiModel: varchar("ai_model", { length: 50 }).default("gpt-4"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
}, (table) => [
  index("idx_chat_sessions_user").on(table.userId),
  index("idx_chat_sessions_phone").on(table.phoneNumber),
  index("idx_chat_sessions_status").on(table.status),
]);

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(), // user, assistant, system
  content: text("content").notNull(),
  contentType: varchar("content_type", { length: 30 }).default("text"), // text, image, audio, location, order
  metadata: jsonb("metadata"), // structured data extracted from message
  tokensUsed: integer("tokens_used"),
  processingMs: integer("processing_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_chat_messages_session").on(table.sessionId),
  index("idx_chat_messages_role").on(table.role),
  index("idx_chat_messages_created").on(table.createdAt),
]);

// ============================================================================
// DIGITAL TWIN & IoT
// ============================================================================

export const digitalTwins = pgTable("digital_twins", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull(),
  twinVersion: integer("twin_version").default(1),
  name: varchar("name", { length: 200 }),
  state: jsonb("state"), // full farm state: zones, crops, soil, weather, sensors
  boundaryWkt: text("boundary_wkt"), // PostGIS POLYGON
  elevationModelPath: varchar("elevation_model_path", { length: 500 }),
  soilMapPath: varchar("soil_map_path", { length: 500 }),
  drainageModelPath: varchar("drainage_model_path", { length: 500 }),
  ndviTimeseriesPath: varchar("ndvi_timeseries_path", { length: 500 }),
  fieldZones: jsonb("field_zones"), // management zones with properties
  cropHistory: jsonb("crop_history"), // what was planted where, when
  yieldHistory: jsonb("yield_history"), // yield data by zone
  soilSamplesData: jsonb("soil_samples_data"), // georeferenced soil test results
  weatherStationId: integer("weather_station_id"),
  iotDeviceIds: jsonb("iot_device_ids"), // array of device IDs
  lastSimulationAt: timestamp("last_simulation_at"),
  simulationResults: jsonb("simulation_results"), // latest sim output
  healthScore: integer("health_score").default(100), // 0-100
  alerts: jsonb("alerts"), // active alerts
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_digital_twins_farm").on(table.farmId),
]);

export const iotDevices = pgTable("iot_devices", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull(),
  deviceEui: varchar("device_eui", { length: 32 }), // LoRaWAN EUI
  deviceName: varchar("device_name", { length: 100 }).notNull(),
  deviceType: varchar("device_type", { length: 30 }).notNull(), // soil_sensor, weather_station, water_level, livestock_collar, camera_trap
  protocol: varchar("protocol", { length: 20 }).notNull().default("mqtt"), // lorawan, mqtt, ble, modbus, wifi
  manufacturer: varchar("manufacturer", { length: 100 }),
  model: varchar("model", { length: 100 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  batteryPct: decimal("battery_pct", { precision: 5, scale: 1 }),
  lastSeenAt: timestamp("last_seen_at"),
  firmwareVersion: varchar("firmware_version", { length: 30 }),
  status: varchar("status", { length: 20 }).default("active"), // active, offline, maintenance, decommissioned
  config: jsonb("config"), // reporting interval, thresholds, calibration
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_iot_devices_farm").on(table.farmId),
  index("idx_iot_devices_eui").on(table.deviceEui),
  index("idx_iot_devices_status").on(table.status),
]);

export const iotReadings = pgTable("iot_readings", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => iotDevices.id, { onDelete: "cascade" }),
  farmId: integer("farm_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  // Soil sensors
  soilMoisture: decimal("soil_moisture", { precision: 6, scale: 2 }),
  soilTemperature: decimal("soil_temperature", { precision: 6, scale: 2 }),
  soilPh: decimal("soil_ph", { precision: 5, scale: 2 }),
  soilNitrogen: decimal("soil_nitrogen", { precision: 8, scale: 2 }),
  soilPhosphorus: decimal("soil_phosphorus", { precision: 8, scale: 2 }),
  soilPotassium: decimal("soil_potassium", { precision: 8, scale: 2 }),
  // Weather
  airTemperature: decimal("air_temperature", { precision: 6, scale: 2 }),
  humidity: decimal("humidity", { precision: 6, scale: 2 }),
  rainfall: decimal("rainfall", { precision: 8, scale: 2 }),
  windSpeed: decimal("wind_speed", { precision: 6, scale: 2 }),
  solarRadiation: decimal("solar_radiation", { precision: 8, scale: 2 }),
  // Water
  waterLevel: decimal("water_level", { precision: 8, scale: 2 }),
  waterFlowRate: decimal("water_flow_rate", { precision: 8, scale: 2 }),
  // Raw payload
  rawPayload: jsonb("raw_payload"),
  fluvioOffset: varchar("fluvio_offset", { length: 50 }), // Fluvio stream offset
}, (table) => [
  index("idx_iot_readings_device").on(table.deviceId),
  index("idx_iot_readings_farm").on(table.farmId),
  index("idx_iot_readings_timestamp").on(table.timestamp),
]);

export const iotRules = pgTable("iot_rules", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull(),
  deviceId: integer("device_id"),
  name: varchar("name", { length: 200 }).notNull(),
  metric: varchar("metric", { length: 50 }).notNull(), // soil_moisture, air_temperature, etc.
  operator: varchar("operator", { length: 10 }).notNull(), // gt, lt, gte, lte, eq
  threshold: decimal("threshold", { precision: 10, scale: 2 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(), // alert, irrigate, notify, log
  alertSeverity: varchar("alert_severity", { length: 20 }).default("warning"), // info, warning, critical
  isActive: boolean("is_active").default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  triggerCount: integer("trigger_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_iot_rules_farm").on(table.farmId),
  index("idx_iot_rules_active").on(table.isActive),
]);

// ============================================================================
// EXPORT CHAIN
// ============================================================================

export const exportShipmentStatusEnum = pgEnum("export_shipment_status", [
  "draft", "booked", "in_transit", "customs_clearance", "delivered", "returned", "cancelled",
]);

export const exportShipments = pgTable("export_shipments", {
  id: serial("id").primaryKey(),
  shipmentCode: varchar("shipment_code", { length: 50 }).notNull().unique(),
  farmerId: integer("farmer_id"),
  commodity: varchar("commodity", { length: 100 }).notNull(),
  variety: varchar("variety", { length: 100 }),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull().default("kg"),
  qualityGrade: varchar("quality_grade", { length: 20 }),
  originCountry: varchar("origin_country", { length: 100 }).notNull().default("Nigeria"),
  destination: varchar("destination", { length: 200 }).notNull(),
  destinationCountry: varchar("destination_country", { length: 100 }),
  buyer: varchar("buyer", { length: 200 }),
  freightForwarder: varchar("freight_forwarder", { length: 200 }),
  status: exportShipmentStatusEnum("status").notNull().default("draft"),
  estimatedDeparture: timestamp("estimated_departure"),
  actualDeparture: timestamp("actual_departure"),
  estimatedArrival: timestamp("estimated_arrival"),
  actualArrival: timestamp("actual_arrival"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  containerNumber: varchar("container_number", { length: 50 }),
  billOfLadingNumber: varchar("bill_of_lading_number", { length: 100 }),
  totalValueUsd: decimal("total_value_usd", { precision: 14, scale: 2 }),
  freightCostUsd: decimal("freight_cost_usd", { precision: 12, scale: 2 }),
  insuranceValueUsd: decimal("insurance_value_usd", { precision: 12, scale: 2 }),
  blockchainTxHash: varchar("blockchain_tx_hash", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_export_shipments_farmer").on(table.farmerId),
  index("idx_export_shipments_status").on(table.status),
  index("idx_export_shipments_commodity").on(table.commodity),
  index("idx_export_shipments_blockchain").on(table.blockchainTxHash),
]);

export const exportCertifications = pgTable("export_certifications", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull().references(() => exportShipments.id, { onDelete: "cascade" }),
  certType: varchar("cert_type", { length: 50 }).notNull(), // phytosanitary, organic, fair_trade, gmp, haccp, halal, kosher
  certNumber: varchar("cert_number", { length: 100 }).notNull(),
  issuer: varchar("issuer", { length: 200 }).notNull(),
  issuedDate: date("issued_date").notNull(),
  expiryDate: date("expiry_date"),
  status: varchar("status", { length: 20 }).default("valid"), // valid, expired, revoked
  documentUrl: varchar("document_url", { length: 500 }),
  blockchainHash: varchar("blockchain_hash", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_export_certs_shipment").on(table.shipmentId),
  index("idx_export_certs_type").on(table.certType),
]);

// ============================================================================
// FEDERATED LEARNING
// ============================================================================

export const federatedModelStatusEnum = pgEnum("federated_model_status", [
  "initializing", "training", "aggregating", "evaluating", "deployed", "archived",
]);

export const federatedModels = pgTable("federated_models", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  modelType: varchar("model_type", { length: 50 }).notNull(), // yield_prediction, disease_detection, price_forecasting, credit_scoring
  description: text("description"),
  version: integer("version").default(1).notNull(),
  status: federatedModelStatusEnum("status").notNull().default("initializing"),
  participantCount: integer("participant_count").default(0).notNull(),
  minParticipants: integer("min_participants").default(5),
  globalAccuracy: decimal("global_accuracy", { precision: 6, scale: 3 }),
  baselineAccuracy: decimal("baseline_accuracy", { precision: 6, scale: 3 }),
  improvementPct: decimal("improvement_pct", { precision: 6, scale: 3 }),
  currentRound: integer("current_round").default(0),
  totalRounds: integer("total_rounds").default(10),
  aggregationStrategy: varchar("aggregation_strategy", { length: 30 }).default("fedavg"), // fedavg, fedprox, scaffold
  privacyBudget: decimal("privacy_budget", { precision: 6, scale: 3 }).default("1.0"), // epsilon for differential privacy
  modelArtifactPath: varchar("model_artifact_path", { length: 500 }),
  hyperparameters: jsonb("hyperparameters"),
  metrics: jsonb("metrics"),
  lastAggregatedAt: timestamp("last_aggregated_at"),
  deployedAt: timestamp("deployed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_federated_models_status").on(table.status),
  index("idx_federated_models_type").on(table.modelType),
]);

export const federatedParticipants = pgTable("federated_participants", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => federatedModels.id, { onDelete: "cascade" }),
  farmerId: integer("farmer_id").notNull(),
  deviceId: varchar("device_id", { length: 100 }),
  status: varchar("status", { length: 20 }).default("active"), // active, paused, dropped
  roundsParticipated: integer("rounds_participated").default(0),
  lastRoundAt: timestamp("last_round_at"),
  localDataSize: integer("local_data_size").default(0), // number of training samples
  localAccuracy: decimal("local_accuracy", { precision: 6, scale: 3 }),
  contributionScore: decimal("contribution_score", { precision: 6, scale: 3 }).default("0"),
  privacyNoiseAdded: boolean("privacy_noise_added").default(true),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => [
  index("idx_fed_participants_model").on(table.modelId),
  index("idx_fed_participants_farmer").on(table.farmerId),
]);

// ============================================================================
// INSURANCE AI
// ============================================================================

export const insuranceProducts = pgTable("insurance_products", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // drought, flood, pest_outbreak, price_drop, disease, frost, hail
  description: text("description"),
  basePremiumRate: decimal("base_premium_rate", { precision: 6, scale: 3 }).notNull(), // percentage
  maxCoverage: decimal("max_coverage", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  triggerType: varchar("trigger_type", { length: 50 }).notNull(), // rainfall_deficit, excess_rainfall, ndvi_anomaly, price_drop, disease_outbreak
  triggerThreshold: decimal("trigger_threshold", { precision: 10, scale: 3 }).notNull(),
  monitoringSource: varchar("monitoring_source", { length: 200 }), // CHIRPS satellite, GPM satellite, etc.
  regions: jsonb("regions"), // array of supported regions
  eligibilityCriteria: jsonb("eligibility_criteria"),
  payoutStructure: jsonb("payout_structure"), // tiered payout based on severity
  isActive: boolean("is_active").default(true).notNull(),
  providerName: varchar("provider_name", { length: 200 }),
  providerLicense: varchar("provider_license", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_insurance_products_type").on(table.type),
  index("idx_insurance_products_active").on(table.isActive),
]);

export const insurancePolicies = pgTable("insurance_policies_ext", {
  id: serial("id").primaryKey(),
  policyNumber: varchar("policy_number", { length: 100 }).notNull().unique(),
  farmerId: integer("farmer_id").notNull(),
  productId: integer("product_id").notNull().references(() => insuranceProducts.id),
  farmId: integer("farm_id"),
  cropType: varchar("crop_type", { length: 100 }),
  coverageAmount: decimal("coverage_amount", { precision: 14, scale: 2 }).notNull(),
  premium: decimal("premium", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  status: varchar("status", { length: 30 }).default("active").notNull(), // active, expired, claimed, cancelled
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  triggerConditions: jsonb("trigger_conditions"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  tigerBeetleAccountId: varchar("tigerbeetle_account_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_insurance_policies_ext_farmer").on(table.farmerId),
  index("idx_insurance_policies_ext_product").on(table.productId),
  index("idx_insurance_policies_ext_status").on(table.status),
]);

export const insuranceClaims = pgTable("insurance_claims_ext", {
  id: serial("id").primaryKey(),
  claimNumber: varchar("claim_number", { length: 100 }).notNull().unique(),
  policyId: integer("policy_id").notNull().references(() => insurancePolicies.id),
  farmerId: integer("farmer_id").notNull(),
  claimType: varchar("claim_type", { length: 50 }).notNull(),
  claimAmount: decimal("claim_amount", { precision: 14, scale: 2 }).notNull(),
  approvedAmount: decimal("approved_amount", { precision: 14, scale: 2 }),
  damageType: varchar("damage_type", { length: 100 }),
  damagePercentage: integer("damage_percentage"),
  description: text("description"),
  evidenceUrls: jsonb("evidence_urls"), // array of photo/document URLs
  satelliteData: jsonb("satellite_data"), // NDVI, rainfall data at trigger
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending, under_review, approved, rejected, paid
  assessorId: integer("assessor_id"),
  assessorNotes: text("assessor_notes"),
  paymentReference: varchar("payment_reference", { length: 100 }),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_insurance_claims_ext_policy").on(table.policyId),
  index("idx_insurance_claims_ext_farmer").on(table.farmerId),
  index("idx_insurance_claims_ext_status").on(table.status),
]);

// ============================================================================
// MARKET PRICES
// ============================================================================

export const marketPrices = pgTable("market_prices", {
  id: serial("id").primaryKey(),
  commodity: varchar("commodity", { length: 100 }).notNull(),
  variety: varchar("variety", { length: 100 }),
  market: varchar("market", { length: 200 }).notNull(),
  region: varchar("region", { length: 200 }),
  country: varchar("country", { length: 100 }).default("Nigeria"),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 30 }).notNull().default("kg"),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  priceType: varchar("price_type", { length: 30 }).default("wholesale"), // wholesale, retail, farmgate
  priceDate: date("price_date").notNull(),
  source: varchar("source", { length: 100 }), // manual, api, scraper, iot
  isVerified: boolean("is_verified").default(false),
  previousPrice: decimal("previous_price", { precision: 12, scale: 2 }),
  priceChange: decimal("price_change", { precision: 8, scale: 2 }),
  priceChangePct: decimal("price_change_pct", { precision: 6, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_market_prices_commodity").on(table.commodity),
  index("idx_market_prices_market").on(table.market),
  index("idx_market_prices_date").on(table.priceDate),
  index("idx_market_prices_region").on(table.region),
]);

export const marketAlerts = pgTable("market_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  commodity: varchar("commodity", { length: 100 }).notNull(),
  market: varchar("market", { length: 200 }),
  alertType: varchar("alert_type", { length: 30 }).notNull(), // price_above, price_below, price_change_pct
  threshold: decimal("threshold", { precision: 12, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  notificationChannel: varchar("notification_channel", { length: 30 }).default("sms"), // sms, whatsapp, push
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_market_alerts_user").on(table.userId),
  index("idx_market_alerts_commodity").on(table.commodity),
]);

// ============================================================================
// DATA PIPELINE (ETL)
// ============================================================================

export const pipelineJobStatusEnum = pgEnum("pipeline_job_status", [
  "idle", "running", "completed", "failed", "paused", "scheduled",
]);

export const pipelineJobs = pgTable("pipeline_jobs", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  jobType: varchar("job_type", { length: 50 }).notNull(), // etl, sync, export, import, transform, aggregate
  description: text("description"),
  sourceType: varchar("source_type", { length: 50 }), // postgresql, kafka, s3, api, fluvio
  sourceConfig: jsonb("source_config"),
  destinationType: varchar("destination_type", { length: 50 }), // postgresql, lakehouse, opensearch, s3
  destinationConfig: jsonb("destination_config"),
  transformConfig: jsonb("transform_config"),
  schedule: varchar("schedule", { length: 100 }), // cron expression
  status: pipelineJobStatusEnum("status").notNull().default("idle"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastRunDurationMs: integer("last_run_duration_ms"),
  lastRunRecordsProcessed: integer("last_run_records_processed"),
  lastRunError: text("last_run_error"),
  successCount: integer("success_count").default(0),
  failureCount: integer("failure_count").default(0),
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_pipeline_jobs_status").on(table.status),
  index("idx_pipeline_jobs_type").on(table.jobType),
  index("idx_pipeline_jobs_active").on(table.isActive),
]);

export const pipelineMetrics = pgTable("pipeline_metrics", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => pipelineJobs.id, { onDelete: "cascade" }),
  runId: varchar("run_id", { length: 100 }).notNull(),
  recordsRead: integer("records_read").default(0),
  recordsWritten: integer("records_written").default(0),
  recordsFailed: integer("records_failed").default(0),
  bytesProcessed: integer("bytes_processed").default(0),
  durationMs: integer("duration_ms"),
  throughputRps: decimal("throughput_rps", { precision: 10, scale: 2 }),
  errorDetails: jsonb("error_details"),
  lakehouseLayer: varchar("lakehouse_layer", { length: 20 }), // bronze, silver, gold
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
}, (table) => [
  index("idx_pipeline_metrics_job").on(table.jobId),
  index("idx_pipeline_metrics_recorded").on(table.recordedAt),
]);

// ============================================================================
// COMPLIANCE
// ============================================================================

export const complianceRules = pgTable("compliance_rules", {
  id: serial("id").primaryKey(),
  ruleCode: varchar("rule_code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // aml, kyc, sanctions, tax, regulatory
  description: text("description"),
  threshold: decimal("threshold", { precision: 15, scale: 2 }),
  action: varchar("action", { length: 50 }).notNull(), // flag_review, block, notify, log
  severity: varchar("severity", { length: 20 }).notNull(), // low, medium, high, critical
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_compliance_rules_category").on(table.category),
  index("idx_compliance_rules_enabled").on(table.enabled),
]);

export const paymentTransactions = pgTable("payment_transactions_ext", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 100 }).notNull().unique(),
  userId: integer("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // deposit, withdrawal, transfer, payment, refund
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  provider: varchar("provider", { length: 50 }), // paystack, stripe, mobile_money, bank
  providerReference: varchar("provider_reference", { length: 200 }),
  status: varchar("status", { length: 30 }).default("pending"), // pending, completed, failed, reversed
  tigerBeetleId: varchar("tigerbeetle_id", { length: 100 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_payment_txns_ext_user").on(table.userId),
  index("idx_payment_txns_ext_status").on(table.status),
  index("idx_payment_txns_ext_created").on(table.createdAt),
]);

// ============================================================================
// SOIL SAMPLES & PREDICTIONS
// ============================================================================

export const soilSamples = pgTable("soil_samples_ext", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull(),
  fieldZone: varchar("field_zone", { length: 100 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  sampleDate: date("sample_date").notNull(),
  ph: decimal("ph", { precision: 4, scale: 2 }),
  nitrogen: decimal("nitrogen", { precision: 8, scale: 3 }),
  phosphorus: decimal("phosphorus", { precision: 8, scale: 3 }),
  potassium: decimal("potassium", { precision: 8, scale: 3 }),
  organicMatter: decimal("organic_matter", { precision: 6, scale: 3 }),
  moisture: decimal("moisture", { precision: 6, scale: 2 }),
  texture: varchar("texture", { length: 50 }), // clay, sandy, loam, silt
  labReference: varchar("lab_reference", { length: 100 }),
  recommendations: jsonb("recommendations"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_soil_samples_ext_farm").on(table.farmId),
  index("idx_soil_samples_ext_date").on(table.sampleDate),
]);

export const predictions = pgTable("predictions_ext", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull(),
  modelId: integer("model_id"),
  predictionType: varchar("prediction_type", { length: 50 }).notNull(), // yield, disease, price, weather, pest
  targetDate: date("target_date"),
  cropType: varchar("crop_type", { length: 100 }),
  predictedValue: decimal("predicted_value", { precision: 14, scale: 4 }),
  unit: varchar("unit", { length: 30 }),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 3 }),
  inputFeatures: jsonb("input_features"),
  outputDetails: jsonb("output_details"),
  actualValue: decimal("actual_value", { precision: 14, scale: 4 }),
  accuracy: decimal("accuracy", { precision: 5, scale: 3 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_predictions_ext_farm").on(table.farmId),
  index("idx_predictions_ext_type").on(table.predictionType),
]);

// ============================================================================
// RETAIL STORES
// ============================================================================

export const retailStores = pgTable("retail_stores_ext", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  ownerId: integer("owner_id").notNull(),
  storeType: varchar("store_type", { length: 50 }).default("retail"), // retail, wholesale, cooperative, online
  address: text("address"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  phone: varchar("phone", { length: 30 }),
  email: varchar("email", { length: 200 }),
  operatingHours: jsonb("operating_hours"),
  isActive: boolean("is_active").default(true),
  rating: decimal("rating", { precision: 3, scale: 1 }).default("0"),
  totalOrders: integer("total_orders").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_retail_stores_ext_owner").on(table.ownerId),
  index("idx_retail_stores_ext_active").on(table.isActive),
]);

export const retailInventory = pgTable("retail_inventory_ext", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => retailStores.id, { onDelete: "cascade" }),
  productName: varchar("product_name", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull().default("0"),
  unit: varchar("unit", { length: 30 }).default("kg"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  minStockLevel: decimal("min_stock_level", { precision: 12, scale: 2 }).default("0"),
  isAvailable: boolean("is_available").default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_retail_inventory_ext_store").on(table.storeId),
  index("idx_retail_inventory_ext_product").on(table.productName),
]);
