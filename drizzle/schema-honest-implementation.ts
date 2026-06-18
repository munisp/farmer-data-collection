/**
 * Honest Implementation Schema
 * 
 * Adds ALL missing PostgreSQL-backed tables for features that were
 * previously using in-memory storage (BoundedMap/Map/arrays).
 * 
 * Every table here replaces a previous stub/mock/in-memory pattern.
 */
import { pgTable, serial, integer, varchar, text, decimal, timestamp, boolean, json, index, uniqueIndex, real } from "drizzle-orm/pg-core";
import { users, farmers, farms, crops } from "./schema.js";

// ============================================================================
// ANALYTICS (was: analytics-router returning computed data)
// ============================================================================

export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  channel: varchar("channel", { length: 20 }).notNull(), // ussd, sms, whatsapp, voice, pwa, mobile
  eventType: varchar("event_type", { length: 100 }).notNull(),
  feature: varchar("feature", { length: 100 }),
  sessionId: varchar("session_id", { length: 100 }),
  durationMs: integer("duration_ms"),
  success: boolean("success").default(true),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("analytics_events_user_idx").on(table.userId),
  channelIdx: index("analytics_events_channel_idx").on(table.channel),
  createdAtIdx: index("analytics_events_created_idx").on(table.createdAt),
}));

export const analyticsAggregates = pgTable("analytics_aggregates", {
  id: serial("id").primaryKey(),
  metricName: varchar("metric_name", { length: 100 }).notNull(),
  dimension: varchar("dimension", { length: 100 }),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  valueNumeric: decimal("value_numeric", { precision: 15, scale: 4 }),
  valueJson: json("value_json"),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
}, (table) => ({
  metricIdx: index("analytics_agg_metric_idx").on(table.metricName),
  periodIdx: index("analytics_agg_period_idx").on(table.periodStart),
}));

// ============================================================================
// AQUACULTURE (was: in-memory arrays in aquaculture-ai-router, aquaculture-feed-router)
// ============================================================================

export const aquaculturePonds = pgTable("aquaculture_ponds", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 200 }).notNull(),
  pondType: varchar("pond_type", { length: 50 }).notNull(), // earthen, concrete, cage, raceway
  species: varchar("species", { length: 100 }).notNull(),
  areaSqMeters: decimal("area_sq_meters", { precision: 10, scale: 2 }),
  depthMeters: decimal("depth_meters", { precision: 5, scale: 2 }),
  stockingDensity: integer("stocking_density"),
  currentStock: integer("current_stock").default(0),
  location: varchar("location", { length: 255 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aquacultureWaterQuality = pgTable("aquaculture_water_quality", {
  id: serial("id").primaryKey(),
  pondId: integer("pond_id").notNull().references(() => aquaculturePonds.id),
  temperature: decimal("temperature", { precision: 5, scale: 2 }),
  ph: decimal("ph", { precision: 4, scale: 2 }),
  dissolvedOxygen: decimal("dissolved_oxygen", { precision: 5, scale: 2 }),
  ammonia: decimal("ammonia", { precision: 6, scale: 4 }),
  nitrite: decimal("nitrite", { precision: 6, scale: 4 }),
  turbidity: decimal("turbidity", { precision: 6, scale: 2 }),
  salinity: decimal("salinity", { precision: 6, scale: 2 }),
  readingSource: varchar("reading_source", { length: 30 }), // manual, iot_sensor
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const aquacultureFeedRecords = pgTable("aquaculture_feed_records", {
  id: serial("id").primaryKey(),
  pondId: integer("pond_id").notNull().references(() => aquaculturePonds.id),
  feedType: varchar("feed_type", { length: 100 }).notNull(),
  quantityKg: decimal("quantity_kg", { precision: 8, scale: 2 }).notNull(),
  costPerKg: decimal("cost_per_kg", { precision: 10, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),
  fcr: decimal("fcr", { precision: 5, scale: 3 }), // feed conversion ratio
  feedSchedule: varchar("feed_schedule", { length: 50 }),
  notes: text("notes"),
  fedAt: timestamp("fed_at").defaultNow().notNull(),
});

export const aquacultureHarvests = pgTable("aquaculture_harvests", {
  id: serial("id").primaryKey(),
  pondId: integer("pond_id").notNull().references(() => aquaculturePonds.id),
  harvestDate: timestamp("harvest_date").notNull(),
  quantityKg: decimal("quantity_kg", { precision: 10, scale: 2 }).notNull(),
  avgWeightGrams: decimal("avg_weight_grams", { precision: 8, scale: 2 }),
  survivalRate: decimal("survival_rate", { precision: 5, scale: 2 }),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }),
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }),
  buyer: varchar("buyer", { length: 200 }),
  notes: text("notes"),
});

export const aquacultureAiPredictions = pgTable("aquaculture_ai_predictions", {
  id: serial("id").primaryKey(),
  pondId: integer("pond_id").notNull().references(() => aquaculturePonds.id),
  predictionType: varchar("prediction_type", { length: 50 }).notNull(), // growth, disease, water_quality, harvest_time
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 4 }),
  predictedValue: json("predicted_value").notNull(),
  actualValue: json("actual_value"),
  modelVersion: varchar("model_version", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// LAND SUITABILITY (was: pure stub with zero DB)
// ============================================================================

export const landAssessments = pgTable("land_assessments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  farmId: integer("farm_id").references(() => farms.id),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  soilType: varchar("soil_type", { length: 100 }),
  soilPh: decimal("soil_ph", { precision: 4, scale: 2 }),
  organicMatter: decimal("organic_matter", { precision: 5, scale: 2 }),
  drainage: varchar("drainage", { length: 50 }),
  slope: decimal("slope", { precision: 5, scale: 2 }),
  elevation: decimal("elevation", { precision: 8, scale: 2 }),
  annualRainfall: decimal("annual_rainfall", { precision: 8, scale: 2 }),
  avgTemperature: decimal("avg_temperature", { precision: 5, scale: 2 }),
  suitabilityScore: decimal("suitability_score", { precision: 5, scale: 2 }),
  recommendedCrops: json("recommended_crops"),
  constraints: json("constraints"),
  assessedAt: timestamp("assessed_at").defaultNow().notNull(),
});

// ============================================================================
// RISK ASSESSMENT (was: 33-line stub)
// ============================================================================

export const riskProfiles = pgTable("risk_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  profileType: varchar("profile_type", { length: 50 }).notNull(), // borrower, farm, market
  overallScore: decimal("overall_score", { precision: 5, scale: 2 }).notNull(),
  riskLevel: varchar("risk_level", { length: 20 }).notNull(), // low, medium, high, critical
  factors: json("factors").notNull(), // { factor: string, score: number, weight: number }[]
  mitigationActions: json("mitigation_actions"),
  validUntil: timestamp("valid_until"),
  computedAt: timestamp("computed_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("risk_profiles_user_idx").on(table.userId),
}));

// ============================================================================
// SUBSCRIPTION DELIVERY (was: pure stub with resilientPost only)
// ============================================================================

export const subscriptionDeliveries = pgTable("subscription_deliveries", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  deliveryDate: timestamp("delivery_date").notNull(),
  status: varchar("status", { length: 30 }).default("scheduled").notNull(), // scheduled, in_transit, delivered, failed
  trackingNumber: varchar("tracking_number", { length: 100 }),
  driverName: varchar("driver_name", { length: 200 }),
  driverPhone: varchar("driver_phone", { length: 20 }),
  deliveryAddress: text("delivery_address").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  deliveredAt: timestamp("delivered_at"),
  deliveryProofUrl: varchar("delivery_proof_url", { length: 500 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const subscriptionDeliveryItems = pgTable("subscription_delivery_items", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").notNull().references(() => subscriptionDeliveries.id),
  productName: varchar("product_name", { length: 200 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  qualityGrade: varchar("quality_grade", { length: 20 }),
  batchNumber: varchar("batch_number", { length: 100 }),
});

// ============================================================================
// CROP INSURANCE (was: BoundedMap in-memory)
// ============================================================================

export const insurancePolicies = pgTable("insurance_policies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  farmId: integer("farm_id").references(() => farms.id),
  cropId: integer("crop_id").references(() => crops.id),
  policyNumber: varchar("policy_number", { length: 50 }).notNull().unique(),
  policyType: varchar("policy_type", { length: 50 }).notNull(), // weather_indexed, yield_based, parametric, multi_peril
  coverageAmount: decimal("coverage_amount", { precision: 15, scale: 2 }).notNull(),
  premiumAmount: decimal("premium_amount", { precision: 12, scale: 2 }).notNull(),
  deductible: decimal("deductible", { precision: 12, scale: 2 }).default("0"),
  coverageStartDate: timestamp("coverage_start_date").notNull(),
  coverageEndDate: timestamp("coverage_end_date").notNull(),
  status: varchar("status", { length: 30 }).default("active").notNull(), // draft, active, expired, cancelled, claimed
  triggerConditions: json("trigger_conditions"), // { type: 'rainfall_deficit', threshold: 50, unit: 'mm' }
  premiumPaidAt: timestamp("premium_paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("insurance_policies_user_idx").on(table.userId),
  statusIdx: index("insurance_policies_status_idx").on(table.status),
}));

export const insuranceClaims = pgTable("insurance_claims", {
  id: serial("id").primaryKey(),
  policyId: integer("policy_id").notNull().references(() => insurancePolicies.id),
  claimNumber: varchar("claim_number", { length: 50 }).notNull().unique(),
  claimType: varchar("claim_type", { length: 50 }).notNull(),
  claimAmount: decimal("claim_amount", { precision: 15, scale: 2 }).notNull(),
  approvedAmount: decimal("approved_amount", { precision: 15, scale: 2 }),
  status: varchar("status", { length: 30 }).default("submitted").notNull(), // submitted, under_review, approved, rejected, paid
  evidence: json("evidence"),
  reviewNotes: text("review_notes"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

// ============================================================================
// INPUT FINANCING (was: BoundedMap in-memory)
// ============================================================================

export const inputFinancingApplications = pgTable("input_financing_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  farmId: integer("farm_id").references(() => farms.id),
  applicationNumber: varchar("application_number", { length: 50 }).notNull().unique(),
  inputCategory: varchar("input_category", { length: 50 }).notNull(), // seeds, fertilizers, pesticides, equipment
  requestedAmount: decimal("requested_amount", { precision: 12, scale: 2 }).notNull(),
  approvedAmount: decimal("approved_amount", { precision: 12, scale: 2 }),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }),
  repaymentTermMonths: integer("repayment_term_months"),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending, approved, disbursed, repaying, completed, defaulted
  supplierName: varchar("supplier_name", { length: 200 }),
  inputDetails: json("input_details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// WEATHER DATA (was: computed random data)
// ============================================================================

export const weatherReadings = pgTable("weather_readings", {
  id: serial("id").primaryKey(),
  stationId: varchar("station_id", { length: 100 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  temperature: decimal("temperature", { precision: 5, scale: 2 }),
  humidity: decimal("humidity", { precision: 5, scale: 2 }),
  rainfall: decimal("rainfall", { precision: 8, scale: 2 }),
  windSpeed: decimal("wind_speed", { precision: 6, scale: 2 }),
  windDirection: decimal("wind_direction", { precision: 5, scale: 1 }),
  pressure: decimal("pressure", { precision: 7, scale: 2 }),
  uvIndex: decimal("uv_index", { precision: 4, scale: 1 }),
  cloudCover: decimal("cloud_cover", { precision: 5, scale: 2 }),
  readingSource: varchar("reading_source", { length: 50 }), // station, api, iot_sensor
  recordedAt: timestamp("recorded_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  stationIdx: index("weather_readings_station_idx").on(table.stationId),
  timeIdx: index("weather_readings_time_idx").on(table.recordedAt),
}));

export const weatherForecasts = pgTable("weather_forecasts", {
  id: serial("id").primaryKey(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  forecastDate: timestamp("forecast_date").notNull(),
  tempMin: decimal("temp_min", { precision: 5, scale: 2 }),
  tempMax: decimal("temp_max", { precision: 5, scale: 2 }),
  rainfallProbability: decimal("rainfall_probability", { precision: 5, scale: 2 }),
  expectedRainfall: decimal("expected_rainfall", { precision: 8, scale: 2 }),
  condition: varchar("condition", { length: 50 }),
  advisory: text("advisory"),
  source: varchar("source", { length: 50 }),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

// ============================================================================
// SOIL ANALYSIS (was: returning computed data)
// ============================================================================

export const soilAnalysisResults = pgTable("soil_analysis_results", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  farmId: integer("farm_id").references(() => farms.id),
  sampleId: varchar("sample_id", { length: 50 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  ph: decimal("ph", { precision: 4, scale: 2 }),
  nitrogen: decimal("nitrogen", { precision: 8, scale: 4 }),
  phosphorus: decimal("phosphorus", { precision: 8, scale: 4 }),
  potassium: decimal("potassium", { precision: 8, scale: 4 }),
  organicCarbon: decimal("organic_carbon", { precision: 6, scale: 3 }),
  cec: decimal("cec", { precision: 8, scale: 2 }), // cation exchange capacity
  moisture: decimal("moisture", { precision: 5, scale: 2 }),
  texture: varchar("texture", { length: 50 }),
  recommendations: json("recommendations"),
  sampleDate: timestamp("sample_date").notNull(),
  labName: varchar("lab_name", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// MARKET DATA (was: Math.random seasonal factors)
// ============================================================================

export const marketPriceHistory = pgTable("market_price_history", {
  id: serial("id").primaryKey(),
  commodity: varchar("commodity", { length: 100 }).notNull(),
  market: varchar("market", { length: 200 }).notNull(),
  region: varchar("region", { length: 100 }),
  pricePerKg: decimal("price_per_kg", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 5 }).default("NGN").notNull(),
  unit: varchar("unit", { length: 20 }).default("kg"),
  volume: decimal("volume", { precision: 12, scale: 2 }),
  source: varchar("source", { length: 100 }),
  recordedAt: timestamp("recorded_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  commodityIdx: index("market_price_commodity_idx").on(table.commodity),
  marketIdx: index("market_price_market_idx").on(table.market),
  timeIdx: index("market_price_time_idx").on(table.recordedAt),
}));

// ============================================================================
// PREDICTIVE ANALYTICS (was: returning computed random data)
// ============================================================================

export const yieldPredictions = pgTable("yield_predictions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  farmId: integer("farm_id").references(() => farms.id),
  cropId: integer("crop_id").references(() => crops.id),
  cropName: varchar("crop_name", { length: 100 }).notNull(),
  season: varchar("season", { length: 50 }),
  predictedYieldKg: decimal("predicted_yield_kg", { precision: 12, scale: 2 }),
  actualYieldKg: decimal("actual_yield_kg", { precision: 12, scale: 2 }),
  confidenceLevel: decimal("confidence_level", { precision: 5, scale: 4 }),
  modelVersion: varchar("model_version", { length: 50 }),
  factors: json("factors"), // { factor: string, impact: number }[]
  predictedAt: timestamp("predicted_at").defaultNow().notNull(),
});

export const pricePredictions = pgTable("price_predictions", {
  id: serial("id").primaryKey(),
  commodity: varchar("commodity", { length: 100 }).notNull(),
  market: varchar("market", { length: 200 }),
  predictedPrice: decimal("predicted_price", { precision: 12, scale: 2 }).notNull(),
  actualPrice: decimal("actual_price", { precision: 12, scale: 2 }),
  predictionDate: timestamp("prediction_date").notNull(),
  confidenceLevel: decimal("confidence_level", { precision: 5, scale: 4 }),
  modelVersion: varchar("model_version", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// STRESS TESTING (was: computed random results)
// ============================================================================

export const stressTestScenarios = pgTable("stress_test_scenarios", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  scenarioType: varchar("scenario_type", { length: 50 }).notNull(), // drought, price_crash, pandemic, flood
  parameters: json("parameters").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stressTestResults = pgTable("stress_test_results", {
  id: serial("id").primaryKey(),
  scenarioId: integer("scenario_id").notNull().references(() => stressTestScenarios.id),
  portfolioImpact: decimal("portfolio_impact", { precision: 15, scale: 2 }),
  defaultRate: decimal("default_rate", { precision: 5, scale: 4 }),
  lossGivenDefault: decimal("loss_given_default", { precision: 5, scale: 4 }),
  capitalAdequacy: decimal("capital_adequacy", { precision: 5, scale: 4 }),
  affectedLoans: integer("affected_loans"),
  affectedFarmers: integer("affected_farmers"),
  resultDetails: json("result_details"),
  runAt: timestamp("run_at").defaultNow().notNull(),
});

// ============================================================================
// ML MODELS (was: returning random accuracy scores)
// ============================================================================

export const mlModelRegistry = pgTable("ml_model_registry", {
  id: serial("id").primaryKey(),
  modelName: varchar("model_name", { length: 200 }).notNull(),
  modelType: varchar("model_type", { length: 50 }).notNull(), // classification, regression, clustering, forecasting
  version: varchar("version", { length: 50 }).notNull(),
  framework: varchar("framework", { length: 50 }), // pytorch, tensorflow, sklearn, xgboost
  accuracy: decimal("accuracy", { precision: 7, scale: 6 }),
  f1Score: decimal("f1_score", { precision: 7, scale: 6 }),
  precision: decimal("precision_score", { precision: 7, scale: 6 }),
  recall: decimal("recall", { precision: 7, scale: 6 }),
  trainingDataSize: integer("training_data_size"),
  hyperparameters: json("hyperparameters"),
  artifactPath: varchar("artifact_path", { length: 500 }),
  status: varchar("status", { length: 30 }).default("training").notNull(), // training, validating, deployed, archived
  deployedAt: timestamp("deployed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mlModelInferences = pgTable("ml_model_inferences", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").notNull().references(() => mlModelRegistry.id),
  inputData: json("input_data").notNull(),
  outputData: json("output_data").notNull(),
  latencyMs: integer("latency_ms"),
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// FINANCIAL ENHANCEMENTS (was: returning random financial data)
// ============================================================================

export const financialTransactions = pgTable("financial_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  transactionType: varchar("transaction_type", { length: 50 }).notNull(), // deposit, withdrawal, transfer, payment, loan_disbursement, loan_repayment
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 5 }).default("NGN").notNull(),
  fromAccount: varchar("from_account", { length: 100 }),
  toAccount: varchar("to_account", { length: 100 }),
  reference: varchar("reference", { length: 100 }).notNull().unique(),
  status: varchar("status", { length: 30 }).default("pending").notNull(), // pending, completed, failed, reversed
  channel: varchar("channel", { length: 30 }), // mobile_money, bank_transfer, ussd, card
  fees: decimal("fees", { precision: 10, scale: 2 }).default("0"),
  metadata: json("metadata"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("financial_txn_user_idx").on(table.userId),
  statusIdx: index("financial_txn_status_idx").on(table.status),
  refIdx: uniqueIndex("financial_txn_ref_idx").on(table.reference),
}));

// ============================================================================
// REGULATORY REPORTING (was: computed random compliance data)
// ============================================================================

export const regulatoryReports = pgTable("regulatory_reports", {
  id: serial("id").primaryKey(),
  reportType: varchar("report_type", { length: 100 }).notNull(), // cbn_returns, prudential, aml_ctr, ifrs9
  reportingPeriod: varchar("reporting_period", { length: 20 }).notNull(), // 2024-Q1, 2024-M06
  status: varchar("status", { length: 30 }).default("draft").notNull(), // draft, review, submitted, accepted, rejected
  data: json("data").notNull(),
  submittedBy: integer("submitted_by").references(() => users.id),
  submittedAt: timestamp("submitted_at"),
  regulatorResponse: text("regulator_response"),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// KEYCLOAK AUTH (real user sessions + roles)
// ============================================================================

export const userSessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  sessionToken: varchar("session_token", { length: 512 }).notNull().unique(),
  refreshToken: varchar("refresh_token", { length: 512 }).unique(),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tokenIdx: uniqueIndex("user_sessions_token_idx").on(table.sessionToken),
  userIdx: index("user_sessions_user_idx").on(table.userId),
}));

export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  role: varchar("role", { length: 50 }).notNull(),
  grantedBy: integer("granted_by").references(() => users.id),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => ({
  userRoleIdx: uniqueIndex("user_roles_unique_idx").on(table.userId, table.role),
}));

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  resource: varchar("resource", { length: 100 }).notNull(),
  resourceId: varchar("resource_id", { length: 100 }),
  oldValue: json("old_value"),
  newValue: json("new_value"),
  ipAddress: varchar("ip_address", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("audit_log_user_idx").on(table.userId),
  actionIdx: index("audit_log_action_idx").on(table.action),
  timeIdx: index("audit_log_time_idx").on(table.createdAt),
}));

// ============================================================================
// Type exports
// ============================================================================

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
export type AquaculturePond = typeof aquaculturePonds.$inferSelect;
export type NewAquaculturePond = typeof aquaculturePonds.$inferInsert;
export type LandAssessment = typeof landAssessments.$inferSelect;
export type RiskProfile = typeof riskProfiles.$inferSelect;
export type InsurancePolicy = typeof insurancePolicies.$inferSelect;
export type WeatherReading = typeof weatherReadings.$inferSelect;
export type SoilAnalysisResult = typeof soilAnalysisResults.$inferSelect;
export type MarketPriceRecord = typeof marketPriceHistory.$inferSelect;
export type YieldPrediction = typeof yieldPredictions.$inferSelect;
export type MlModel = typeof mlModelRegistry.$inferSelect;
export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type RegulatoryReport = typeof regulatoryReports.$inferSelect;
export type UserSession = typeof userSessions.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
