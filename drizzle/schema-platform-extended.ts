/**
 * Extended Platform Schema — covers all remaining domain tables
 * that were previously served by in-memory arrays.
 */
import { pgTable, serial, integer, varchar, text, decimal, timestamp, boolean, json, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users, farmers } from "./schema.js";

// ============================================================================
// Carbon Credits & ESG
// ============================================================================
export const carbonProjects = pgTable("carbon_projects", {
  id: serial("id").primaryKey(),
  projectCode: varchar("project_code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  methodology: varchar("methodology", { length: 50 }).notNull(),
  annualCredits: decimal("annual_credits", { precision: 12, scale: 2 }).notNull(),
  pricePerTonne: decimal("price_per_tonne", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  status: varchar("status", { length: 30 }).default("pending_verification").notNull(),
  verifier: varchar("verifier", { length: 100 }),
  location: varchar("location", { length: 255 }),
  farmerId: integer("farmer_id").references(() => farmers.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const carbonCredits = pgTable("carbon_credits", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => carbonProjects.id).notNull(),
  tokenId: varchar("token_id", { length: 50 }).notNull().unique(),
  vintage: integer("vintage").notNull(),
  tonnes: decimal("tonnes", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  ownerId: integer("owner_id").references(() => users.id),
  retiredAt: timestamp("retired_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Insurance & Risk
// ============================================================================
export const insuranceProducts = pgTable("insurance_products", {
  id: serial("id").primaryKey(),
  productCode: varchar("product_code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  coverageType: varchar("coverage_type", { length: 50 }).notNull(),
  minPremium: decimal("min_premium", { precision: 12, scale: 2 }).notNull(),
  maxCoverage: decimal("max_coverage", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  triggerConditions: json("trigger_conditions"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insurancePolicies = pgTable("insurance_policies", {
  id: serial("id").primaryKey(),
  policyNumber: varchar("policy_number", { length: 30 }).notNull().unique(),
  productId: integer("product_id").references(() => insuranceProducts.id).notNull(),
  farmerId: integer("farmer_id").references(() => farmers.id).notNull(),
  premium: decimal("premium", { precision: 12, scale: 2 }).notNull(),
  coverageAmount: decimal("coverage_amount", { precision: 14, scale: 2 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  riskScore: integer("risk_score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insuranceClaims = pgTable("insurance_claims", {
  id: serial("id").primaryKey(),
  claimNumber: varchar("claim_number", { length: 30 }).notNull().unique(),
  policyId: integer("policy_id").references(() => insurancePolicies.id).notNull(),
  claimAmount: decimal("claim_amount", { precision: 14, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  evidence: json("evidence"),
  status: varchar("status", { length: 20 }).default("submitted").notNull(),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

// ============================================================================
// Compliance & Regulatory
// ============================================================================
export const complianceRules = pgTable("compliance_rules", {
  id: serial("id").primaryKey(),
  ruleCode: varchar("rule_code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  regulation: varchar("regulation", { length: 100 }),
  severity: varchar("severity", { length: 20 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  conditions: json("conditions").notNull(),
  actions: json("actions").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const complianceViolations = pgTable("compliance_violations", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").references(() => complianceRules.id).notNull(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id").notNull(),
  description: text("description").notNull(),
  severity: varchar("severity", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: integer("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const complianceReports = pgTable("compliance_reports", {
  id: serial("id").primaryKey(),
  reportType: varchar("report_type", { length: 50 }).notNull(),
  period: varchar("period", { length: 20 }).notNull(),
  regulation: varchar("regulation", { length: 100 }),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  data: json("data").notNull(),
  generatedBy: integer("generated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  submittedAt: timestamp("submitted_at"),
});

// ============================================================================
// Payment Orchestration
// ============================================================================
export const paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  transactionRef: varchar("transaction_ref", { length: 50 }).notNull().unique(),
  type: varchar("type", { length: 30 }).notNull(),
  channel: varchar("channel", { length: 30 }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN").notNull(),
  senderId: integer("sender_id").references(() => users.id),
  receiverId: integer("receiver_id").references(() => users.id),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  providerRef: varchar("provider_ref", { length: 100 }),
  metadata: json("metadata"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  senderIdx: index("idx_payment_sender").on(table.senderId),
  receiverIdx: index("idx_payment_receiver").on(table.receiverId),
  statusIdx: index("idx_payment_status").on(table.status),
}));

export const paymentReconciliation = pgTable("payment_reconciliation", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").references(() => paymentTransactions.id).notNull(),
  providerAmount: decimal("provider_amount", { precision: 14, scale: 2 }),
  systemAmount: decimal("system_amount", { precision: 14, scale: 2 }),
  discrepancy: decimal("discrepancy", { precision: 14, scale: 2 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  reconciledAt: timestamp("reconciled_at"),
});

// ============================================================================
// Financial Enhancements
// ============================================================================
export const savingsAccounts = pgTable("savings_accounts", {
  id: serial("id").primaryKey(),
  accountNumber: varchar("account_number", { length: 30 }).notNull().unique(),
  userId: integer("user_id").references(() => users.id).notNull(),
  balance: decimal("balance", { precision: 14, scale: 2 }).default("0").notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN").notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 4 }).default("0"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const savingsTransactions = pgTable("savings_transactions", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => savingsAccounts.id).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 14, scale: 2 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// IoT & Digital Twin
// ============================================================================
export const iotDevices = pgTable("iot_devices", {
  id: serial("id").primaryKey(),
  deviceId: varchar("device_id", { length: 50 }).notNull().unique(),
  farmId: integer("farm_id").references(() => farmers.id),
  type: varchar("type", { length: 50 }).notNull(),
  model: varchar("model", { length: 100 }),
  firmware: varchar("firmware", { length: 50 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  lastSeen: timestamp("last_seen"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const iotReadings = pgTable("iot_readings", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").references(() => iotDevices.id).notNull(),
  metric: varchar("metric", { length: 50 }).notNull(),
  value: decimal("value", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 20 }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  deviceTimestampIdx: index("idx_iot_device_time").on(table.deviceId, table.timestamp),
}));

export const iotRules = pgTable("iot_rules", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  deviceType: varchar("device_type", { length: 50 }),
  metric: varchar("metric", { length: 50 }).notNull(),
  operator: varchar("operator", { length: 10 }).notNull(),
  threshold: decimal("threshold", { precision: 12, scale: 4 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  notificationChannel: varchar("notification_channel", { length: 30 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const digitalTwins = pgTable("digital_twins", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").references(() => farmers.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  modelType: varchar("model_type", { length: 50 }).notNull(),
  state: json("state").notNull(),
  lastSync: timestamp("last_sync"),
  accuracy: decimal("accuracy", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// Soil Analysis
// ============================================================================
export const soilSamples = pgTable("soil_samples", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").references(() => farmers.id).notNull(),
  sampleCode: varchar("sample_code", { length: 30 }).notNull().unique(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  depth: decimal("depth", { precision: 6, scale: 2 }),
  ph: decimal("ph", { precision: 4, scale: 2 }),
  nitrogen: decimal("nitrogen", { precision: 8, scale: 2 }),
  phosphorus: decimal("phosphorus", { precision: 8, scale: 2 }),
  potassium: decimal("potassium", { precision: 8, scale: 2 }),
  organicMatter: decimal("organic_matter", { precision: 5, scale: 2 }),
  moisture: decimal("moisture", { precision: 5, scale: 2 }),
  texture: varchar("texture", { length: 30 }),
  analysisDate: timestamp("analysis_date").defaultNow().notNull(),
  recommendations: json("recommendations"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Predictive Analytics
// ============================================================================
export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  modelName: varchar("model_name", { length: 100 }).notNull(),
  modelVersion: varchar("model_version", { length: 20 }),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: integer("entity_id"),
  prediction: json("prediction").notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  horizon: varchar("horizon", { length: 30 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  actualOutcome: json("actual_outcome"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Market Data
// ============================================================================
export const marketPrices = pgTable("market_prices", {
  id: serial("id").primaryKey(),
  commodity: varchar("commodity", { length: 100 }).notNull(),
  market: varchar("market", { length: 100 }).notNull(),
  region: varchar("region", { length: 100 }),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN").notNull(),
  unit: varchar("unit", { length: 20 }).default("kg").notNull(),
  priceDate: timestamp("price_date").defaultNow().notNull(),
  source: varchar("source", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  commodityDateIdx: index("idx_market_price_date").on(table.commodity, table.priceDate),
}));

export const marketAlerts = pgTable("market_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  commodity: varchar("commodity", { length: 100 }).notNull(),
  condition: varchar("condition", { length: 20 }).notNull(),
  threshold: decimal("threshold", { precision: 12, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastTriggered: timestamp("last_triggered"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Retail Store / POS
// ============================================================================
export const retailStores = pgTable("retail_stores", {
  id: serial("id").primaryKey(),
  storeCode: varchar("store_code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerId: integer("owner_id").references(() => users.id),
  type: varchar("type", { length: 30 }).notNull(),
  location: varchar("location", { length: 255 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const retailInventory = pgTable("retail_inventory", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => retailStores.id).notNull(),
  productName: varchar("product_name", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 50 }).notNull(),
  quantity: integer("quantity").default(0).notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  reorderLevel: integer("reorder_level").default(10),
  category: varchar("category", { length: 50 }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const retailSales = pgTable("retail_sales", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => retailStores.id).notNull(),
  receiptNumber: varchar("receipt_number", { length: 30 }).notNull().unique(),
  customerId: integer("customer_id").references(() => users.id),
  totalAmount: decimal("total_amount", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 30 }).notNull(),
  items: json("items").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Export Chain
// ============================================================================
export const exportShipments = pgTable("export_shipments", {
  id: serial("id").primaryKey(),
  shipmentCode: varchar("shipment_code", { length: 30 }).notNull().unique(),
  commodity: varchar("commodity", { length: 100 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  originCountry: varchar("origin_country", { length: 50 }).notNull(),
  destination: varchar("destination", { length: 100 }).notNull(),
  status: varchar("status", { length: 30 }).default("preparing").notNull(),
  exporterId: integer("exporter_id").references(() => users.id),
  certifications: json("certifications"),
  blockchainTxHash: varchar("blockchain_tx_hash", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),
});

export const exportCertifications = pgTable("export_certifications", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").references(() => exportShipments.id).notNull(),
  certType: varchar("cert_type", { length: 50 }).notNull(),
  issuer: varchar("issuer", { length: 100 }).notNull(),
  certNumber: varchar("cert_number", { length: 50 }),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
});

// ============================================================================
// Data Pipeline / ETL
// ============================================================================
export const pipelineJobs = pgTable("pipeline_jobs", {
  id: serial("id").primaryKey(),
  jobCode: varchar("job_code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  source: varchar("source", { length: 100 }).notNull(),
  destination: varchar("destination", { length: 100 }).notNull(),
  schedule: varchar("schedule", { length: 50 }),
  status: varchar("status", { length: 20 }).default("idle").notNull(),
  lastRunAt: timestamp("last_run_at"),
  lastDuration: integer("last_duration"),
  recordsProcessed: integer("records_processed"),
  config: json("config"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pipelineMetrics = pgTable("pipeline_metrics", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => pipelineJobs.id).notNull(),
  metricName: varchar("metric_name", { length: 50 }).notNull(),
  metricValue: decimal("metric_value", { precision: 14, scale: 4 }).notNull(),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

// ============================================================================
// Chama (Community Savings)
// ============================================================================
export const chamaGroups = pgTable("chama_groups", {
  id: serial("id").primaryKey(),
  chamaCode: varchar("chama_code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 30 }).notNull(),
  memberCount: integer("member_count").default(0).notNull(),
  totalSavings: decimal("total_savings", { precision: 14, scale: 2 }).default("0").notNull(),
  currency: varchar("currency", { length: 10 }).default("KES").notNull(),
  meetingSchedule: varchar("meeting_schedule", { length: 50 }),
  constitution: json("constitution"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chamaMembers = pgTable("chama_members", {
  id: serial("id").primaryKey(),
  chamaId: integer("chama_id").references(() => chamaGroups.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  role: varchar("role", { length: 30 }).default("member").notNull(),
  contributionBalance: decimal("contribution_balance", { precision: 14, scale: 2 }).default("0").notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const chamaTransactions = pgTable("chama_transactions", {
  id: serial("id").primaryKey(),
  chamaId: integer("chama_id").references(() => chamaGroups.id).notNull(),
  memberId: integer("member_id").references(() => chamaMembers.id),
  type: varchar("type", { length: 30 }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  description: text("description"),
  balanceAfter: decimal("balance_after", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Conversational Commerce
// ============================================================================
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  sessionCode: varchar("session_code", { length: 50 }).notNull().unique(),
  userId: integer("user_id").references(() => users.id),
  channel: varchar("channel", { length: 20 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  context: json("context"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => chatSessions.id).notNull(),
  role: varchar("role", { length: 10 }).notNull(),
  content: text("content").notNull(),
  intent: varchar("intent", { length: 50 }),
  entities: json("entities"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Federated Learning
// ============================================================================
export const federatedModels = pgTable("federated_models", {
  id: serial("id").primaryKey(),
  modelCode: varchar("model_code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  version: integer("version").default(1).notNull(),
  globalAccuracy: decimal("global_accuracy", { precision: 5, scale: 4 }),
  participantCount: integer("participant_count").default(0).notNull(),
  status: varchar("status", { length: 20 }).default("training").notNull(),
  hyperparameters: json("hyperparameters"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const federatedParticipants = pgTable("federated_participants", {
  id: serial("id").primaryKey(),
  modelId: integer("model_id").references(() => federatedModels.id).notNull(),
  farmerId: integer("farmer_id").references(() => farmers.id).notNull(),
  localAccuracy: decimal("local_accuracy", { precision: 5, scale: 4 }),
  dataPoints: integer("data_points").default(0),
  lastContribution: timestamp("last_contribution"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Stress Testing (Internal)
// ============================================================================
export const loadTestRuns = pgTable("load_test_runs", {
  id: serial("id").primaryKey(),
  testName: varchar("test_name", { length: 100 }).notNull(),
  scenario: varchar("scenario", { length: 50 }).notNull(),
  vus: integer("vus").notNull(),
  duration: integer("duration").notNull(),
  avgLatency: decimal("avg_latency", { precision: 10, scale: 2 }),
  p95Latency: decimal("p95_latency", { precision: 10, scale: 2 }),
  p99Latency: decimal("p99_latency", { precision: 10, scale: 2 }),
  errorRate: decimal("error_rate", { precision: 5, scale: 4 }),
  throughput: decimal("throughput", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 20 }).default("running").notNull(),
  results: json("results"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});
