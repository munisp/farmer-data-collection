/**
 * Full Persistence Schema
 * 
 * Adds PostgreSQL-backed tables for ALL remaining in-memory patterns.
 * Covers: input financing credit lines/bulk groups, sedona jobs,
 * voice advisory calls/SMS, post-harvest logistics, knowledge sharing
 * expanded (success stories, experts, sessions, farmer profiles),
 * labor management payroll/schedules/training, water management systems,
 * and service orchestration.
 */
import { pgTable, serial, integer, varchar, text, decimal, timestamp, boolean, json, index, real } from "drizzle-orm/pg-core";
import { users, farms, crops } from "./schema.js";
import { laborWorkers } from "./schema-honest-implementation.js";

// ============================================================================
// INPUT FINANCING — Credit Lines & Bulk Purchase Groups (was: Map<string, CreditLine>)
// ============================================================================

export const inputFinancingCreditLines = pgTable("input_financing_credit_lines", {
  id: serial("id").primaryKey(),
  creditLineId: varchar("credit_line_id", { length: 50 }).notNull().unique(),
  farmerId: integer("farmer_id").notNull().references(() => users.id),
  maxAmount: decimal("max_amount", { precision: 12, scale: 2 }).notNull(),
  availableAmount: decimal("available_amount", { precision: 12, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  term: varchar("term", { length: 30 }).notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  approvedAt: timestamp("approved_at"),
  expiresAt: timestamp("expires_at"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  farmerIdx: index("credit_lines_farmer_idx").on(table.farmerId),
  statusIdx: index("credit_lines_status_idx").on(table.status),
}));

export const inputFinancingBulkGroups = pgTable("input_financing_bulk_groups", {
  id: serial("id").primaryKey(),
  groupId: varchar("group_id", { length: 50 }).notNull().unique(),
  inputCategory: varchar("input_category", { length: 50 }).notNull(),
  productName: varchar("product_name", { length: 200 }).notNull(),
  targetQuantity: decimal("target_quantity", { precision: 10, scale: 2 }).notNull(),
  currentQuantity: decimal("current_quantity", { precision: 10, scale: 2 }).default("0"),
  pricePerUnit: decimal("price_per_unit", { precision: 10, scale: 2 }).notNull(),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
  supplierId: varchar("supplier_id", { length: 50 }),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  deadline: timestamp("deadline"),
  participants: json("participants"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  categoryIdx: index("bulk_groups_category_idx").on(table.inputCategory),
  statusIdx: index("bulk_groups_status_idx").on(table.status),
}));

export const inputFinancingDisbursements = pgTable("input_financing_disbursements", {
  id: serial("id").primaryKey(),
  disbursementId: varchar("disbursement_id", { length: 50 }).notNull().unique(),
  creditLineId: varchar("credit_line_id", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  purpose: varchar("purpose", { length: 200 }),
  supplierId: varchar("supplier_id", { length: 50 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  disbursedAt: timestamp("disbursed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const inputFinancingRepayments = pgTable("input_financing_repayments", {
  id: serial("id").primaryKey(),
  repaymentId: varchar("repayment_id", { length: 50 }).notNull().unique(),
  creditLineId: varchar("credit_line_id", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }),
  status: varchar("status", { length: 20 }).default("completed").notNull(),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// SEDONA JOB ORCHESTRATOR (was: Map<string, JobConfig>)
// ============================================================================

export const sedonaJobs = pgTable("sedona_jobs", {
  id: serial("id").primaryKey(),
  jobId: varchar("job_id", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  jobType: varchar("job_type", { length: 50 }).notNull(),
  query: text("query"),
  schedule: varchar("schedule", { length: 100 }),
  enabled: boolean("enabled").default(true),
  config: json("config"),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  typeIdx: index("sedona_jobs_type_idx").on(table.jobType),
}));

export const sedonaJobRuns = pgTable("sedona_job_runs", {
  id: serial("id").primaryKey(),
  runId: varchar("run_id", { length: 100 }).notNull().unique(),
  jobId: varchar("job_id", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  rowsProcessed: integer("rows_processed"),
  errorMessage: text("error_message"),
  resultSummary: json("result_summary"),
}, (table) => ({
  jobIdx: index("sedona_runs_job_idx").on(table.jobId),
  statusIdx: index("sedona_runs_status_idx").on(table.status),
}));

// ============================================================================
// VOICE ADVISORY — Extended (was: Map<string, VoiceCall/SMSAlert/CallbackRequest>)
// ============================================================================

export const voiceAdvisoryCalls = pgTable("voice_advisory_calls", {
  id: serial("id").primaryKey(),
  callId: varchar("call_id", { length: 50 }).notNull().unique(),
  farmerId: integer("farmer_id").references(() => users.id),
  advisoryId: varchar("advisory_id", { length: 50 }),
  language: varchar("language", { length: 20 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).default("queued").notNull(),
  durationSeconds: integer("duration_seconds"),
  listenedPercent: decimal("listened_percent", { precision: 5, scale: 2 }),
  response: varchar("response", { length: 20 }),
  callSid: varchar("call_sid", { length: 100 }),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  farmerIdx: index("voice_calls_farmer_idx").on(table.farmerId),
  statusIdx: index("voice_calls_status_idx").on(table.status),
}));

export const voiceAdvisoryAlerts = pgTable("voice_advisory_alerts", {
  id: serial("id").primaryKey(),
  alertId: varchar("alert_id", { length: 50 }).notNull().unique(),
  advisoryId: varchar("advisory_id", { length: 50 }),
  category: varchar("category", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  priority: varchar("priority", { length: 20 }).notNull(),
  targetCrops: json("target_crops"),
  targetRegions: json("target_regions"),
  audioUrls: json("audio_urls"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  validFrom: timestamp("valid_from").defaultNow().notNull(),
  validUntil: timestamp("valid_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  categoryIdx: index("voice_alerts_category_idx").on(table.category),
}));

export const voiceAdvisorySmsAlerts = pgTable("voice_advisory_sms_alerts", {
  id: serial("id").primaryKey(),
  alertId: varchar("alert_id", { length: 50 }).notNull().unique(),
  farmerId: integer("farmer_id").references(() => users.id),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  message: text("message").notNull(),
  language: varchar("language", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).default("queued").notNull(),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  farmerIdx: index("voice_sms_farmer_idx").on(table.farmerId),
}));

export const voiceCallbackRequests = pgTable("voice_callback_requests", {
  id: serial("id").primaryKey(),
  requestId: varchar("request_id", { length: 50 }).notNull().unique(),
  farmerId: integer("farmer_id").references(() => users.id),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  reason: varchar("reason", { length: 200 }),
  preferredTime: varchar("preferred_time", { length: 50 }),
  language: varchar("language", { length: 20 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const farmerLanguagePreferences = pgTable("farmer_language_preferences", {
  id: serial("id").primaryKey(),
  farmerId: integer("farmer_id").notNull().references(() => users.id).unique(),
  preferredLanguage: varchar("preferred_language", { length: 20 }).notNull().default("english"),
  preferredChannel: varchar("preferred_channel", { length: 20 }).default("voice"),
  preferredTime: varchar("preferred_time", { length: 50 }),
  smsOptIn: boolean("sms_opt_in").default(true),
  callOptIn: boolean("call_opt_in").default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// POST-HARVEST — Storage Bookings & Logistics (was: Map<string, StorageBooking>)
// ============================================================================

export const postHarvestStorageBookings = pgTable("post_harvest_storage_bookings", {
  id: serial("id").primaryKey(),
  bookingId: varchar("booking_id", { length: 50 }).notNull().unique(),
  farmerId: integer("farmer_id").notNull().references(() => users.id),
  warehouseId: varchar("warehouse_id", { length: 50 }),
  cropType: varchar("crop_type", { length: 100 }).notNull(),
  quantityKg: decimal("quantity_kg", { precision: 12, scale: 2 }).notNull(),
  storageMethod: varchar("storage_method", { length: 50 }).notNull(),
  expectedDuration: integer("expected_duration_days"),
  costPerDay: decimal("cost_per_day", { precision: 10, scale: 2 }),
  qualityGrade: varchar("quality_grade", { length: 10 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  farmerIdx: index("storage_bookings_farmer_idx").on(table.farmerId),
  statusIdx: index("storage_bookings_status_idx").on(table.status),
}));

export const postHarvestLogisticsBookings = pgTable("post_harvest_logistics_bookings", {
  id: serial("id").primaryKey(),
  bookingId: varchar("booking_id", { length: 50 }).notNull().unique(),
  farmerId: integer("farmer_id").notNull().references(() => users.id),
  origin: varchar("origin", { length: 255 }).notNull(),
  destination: varchar("destination", { length: 255 }).notNull(),
  cropType: varchar("crop_type", { length: 100 }).notNull(),
  quantityKg: decimal("quantity_kg", { precision: 12, scale: 2 }).notNull(),
  vehicleType: varchar("vehicle_type", { length: 50 }),
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }),
  actualCost: decimal("actual_cost", { precision: 10, scale: 2 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  pickupDate: timestamp("pickup_date"),
  deliveryDate: timestamp("delivery_date"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  farmerIdx: index("logistics_bookings_farmer_idx").on(table.farmerId),
}));

export const postHarvestQualityAssessments = pgTable("post_harvest_quality_assessments", {
  id: serial("id").primaryKey(),
  assessmentId: varchar("assessment_id", { length: 50 }).notNull().unique(),
  farmerId: integer("farmer_id").notNull().references(() => users.id),
  cropType: varchar("crop_type", { length: 100 }).notNull(),
  quantityKg: decimal("quantity_kg", { precision: 12, scale: 2 }),
  moistureContent: decimal("moisture_content", { precision: 5, scale: 2 }),
  foreignMatter: decimal("foreign_matter", { precision: 5, scale: 2 }),
  brokenGrains: decimal("broken_grains", { precision: 5, scale: 2 }),
  grade: varchar("grade", { length: 10 }),
  passedQuality: boolean("passed_quality"),
  assessorName: varchar("assessor_name", { length: 200 }),
  notes: text("notes"),
  assessedAt: timestamp("assessed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// PEST & DISEASE — Outbreak Reports & Farm Assessments (was: Map<string, OutbreakReport>)
// ============================================================================

export const pestOutbreakReports = pgTable("pest_outbreak_reports", {
  id: serial("id").primaryKey(),
  reportId: varchar("report_id", { length: 50 }).notNull().unique(),
  reportedBy: integer("reported_by").references(() => users.id),
  pestOrDisease: varchar("pest_or_disease", { length: 100 }).notNull(),
  cropAffected: varchar("crop_affected", { length: 100 }),
  severity: varchar("severity", { length: 20 }).notNull(),
  affectedAreaHa: decimal("affected_area_ha", { precision: 10, scale: 2 }),
  latitude: real("latitude"),
  longitude: real("longitude"),
  region: varchar("region", { length: 100 }),
  description: text("description"),
  images: json("images"),
  status: varchar("status", { length: 20 }).default("reported").notNull(),
  verifiedBy: integer("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  regionIdx: index("outbreak_reports_region_idx").on(table.region),
  statusIdx: index("outbreak_reports_status_idx").on(table.status),
}));

export const pestFarmAssessments = pgTable("pest_farm_assessments", {
  id: serial("id").primaryKey(),
  farmId: integer("farm_id").notNull().references(() => farms.id),
  assessedBy: integer("assessed_by").references(() => users.id),
  riskLevel: varchar("risk_level", { length: 20 }).notNull(),
  overallScore: decimal("overall_score", { precision: 5, scale: 2 }),
  factors: json("factors"),
  recommendations: json("recommendations"),
  nextAssessmentDate: timestamp("next_assessment_date"),
  assessedAt: timestamp("assessed_at").defaultNow().notNull(),
}, (table) => ({
  farmIdx: index("pest_farm_assessments_farm_idx").on(table.farmId),
}));

// ============================================================================
// KNOWLEDGE SHARING — Extended (was: Map<string, SuccessStory/Expert/Session>)
// ============================================================================

export const knowledgeSuccessStories = pgTable("knowledge_success_stories", {
  id: serial("id").primaryKey(),
  storyId: varchar("story_id", { length: 50 }).notNull().unique(),
  authorId: integer("author_id").references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  cropType: varchar("crop_type", { length: 100 }),
  region: varchar("region", { length: 100 }),
  yieldImprovement: decimal("yield_improvement", { precision: 5, scale: 2 }),
  revenueImprovement: decimal("revenue_improvement", { precision: 5, scale: 2 }),
  imageUrls: json("image_urls"),
  tags: json("tags"),
  viewCount: integer("view_count").default(0),
  likeCount: integer("like_count").default(0),
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  authorIdx: index("success_stories_author_idx").on(table.authorId),
}));

export const knowledgeExperts = pgTable("knowledge_experts", {
  id: serial("id").primaryKey(),
  expertId: varchar("expert_id", { length: 50 }).notNull().unique(),
  userId: integer("user_id").references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  specialization: varchar("specialization", { length: 100 }).notNull(),
  qualifications: json("qualifications"),
  yearsExperience: integer("years_experience"),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  totalSessions: integer("total_sessions").default(0),
  bio: text("bio"),
  isAvailable: boolean("is_available").default(true),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }),
  languages: json("languages"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  specIdx: index("experts_specialization_idx").on(table.specialization),
}));

export const knowledgeExpertSessions = pgTable("knowledge_expert_sessions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 50 }).notNull().unique(),
  expertId: varchar("expert_id", { length: 50 }).notNull(),
  farmerId: integer("farmer_id").references(() => users.id),
  topic: varchar("topic", { length: 200 }).notNull(),
  sessionType: varchar("session_type", { length: 30 }).notNull(),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  rating: integer("rating"),
  status: varchar("status", { length: 20 }).default("scheduled").notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  expertIdx: index("expert_sessions_expert_idx").on(table.expertId),
  farmerIdx: index("expert_sessions_farmer_idx").on(table.farmerId),
}));

export const knowledgeFarmerProfiles = pgTable("knowledge_farmer_profiles", {
  id: serial("id").primaryKey(),
  farmerId: integer("farmer_id").notNull().references(() => users.id).unique(),
  displayName: varchar("display_name", { length: 200 }),
  bio: text("bio"),
  expertise: json("expertise"),
  reputation: integer("reputation").default(0),
  postsCount: integer("posts_count").default(0),
  helpfulAnswers: integer("helpful_answers").default(0),
  badges: json("badges"),
  level: varchar("level", { length: 20 }).default("beginner"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const knowledgeFarmerProgress = pgTable("knowledge_farmer_progress", {
  id: serial("id").primaryKey(),
  progressId: varchar("progress_id", { length: 50 }).notNull().unique(),
  farmerId: integer("farmer_id").notNull().references(() => users.id),
  courseId: varchar("course_id", { length: 50 }),
  moduleId: varchar("module_id", { length: 50 }),
  progress: decimal("progress", { precision: 5, scale: 2 }).default("0"),
  completed: boolean("completed").default(false),
  score: decimal("score", { precision: 5, scale: 2 }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ============================================================================
// LABOR MANAGEMENT — Payroll, Schedules, Training (was: Map<string, PayrollRecord>)
// ============================================================================

export const laborPayrollRecords = pgTable("labor_payroll_records", {
  id: serial("id").primaryKey(),
  payrollId: varchar("payroll_id", { length: 50 }).notNull().unique(),
  workerId: integer("worker_id").references(() => laborWorkers.id),
  farmId: integer("farm_id").references(() => farms.id),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  daysWorked: integer("days_worked").notNull(),
  dailyRate: decimal("daily_rate", { precision: 10, scale: 2 }).notNull(),
  grossAmount: decimal("gross_amount", { precision: 12, scale: 2 }).notNull(),
  deductions: decimal("deductions", { precision: 10, scale: 2 }).default("0"),
  netAmount: decimal("net_amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 30 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  workerIdx: index("payroll_worker_idx").on(table.workerId),
  statusIdx: index("payroll_status_idx").on(table.status),
}));

export const laborSchedules = pgTable("labor_schedules", {
  id: serial("id").primaryKey(),
  scheduleId: varchar("schedule_id", { length: 50 }).notNull().unique(),
  farmId: integer("farm_id").notNull().references(() => farms.id),
  workerId: integer("worker_id").references(() => laborWorkers.id),
  taskType: varchar("task_type", { length: 50 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  shiftStart: varchar("shift_start", { length: 10 }),
  shiftEnd: varchar("shift_end", { length: 10 }),
  isRecurring: boolean("is_recurring").default(false),
  recurringPattern: varchar("recurring_pattern", { length: 50 }),
  notes: text("notes"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  farmIdx: index("labor_schedules_farm_idx").on(table.farmId),
}));

export const laborTrainingProgress = pgTable("labor_training_progress", {
  id: serial("id").primaryKey(),
  workerId: integer("worker_id").notNull().references(() => laborWorkers.id),
  moduleName: varchar("module_name", { length: 200 }).notNull(),
  moduleType: varchar("module_type", { length: 50 }),
  progress: decimal("progress", { precision: 5, scale: 2 }).default("0"),
  score: decimal("score", { precision: 5, scale: 2 }),
  completed: boolean("completed").default(false),
  certificateUrl: varchar("certificate_url", { length: 500 }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// ============================================================================
// WATER MANAGEMENT — Irrigation Systems & Schedules (was: Map<string, IrrigationSystem>)
// ============================================================================

export const irrigationSystems = pgTable("irrigation_systems", {
  id: serial("id").primaryKey(),
  systemId: varchar("system_id", { length: 50 }).notNull().unique(),
  farmId: integer("farm_id").notNull().references(() => farms.id),
  systemType: varchar("system_type", { length: 50 }).notNull(),
  coverageAreaHa: decimal("coverage_area_ha", { precision: 10, scale: 2 }),
  waterSource: varchar("water_source", { length: 100 }),
  pumpCapacity: decimal("pump_capacity", { precision: 10, scale: 2 }),
  installationDate: timestamp("installation_date"),
  lastMaintenanceDate: timestamp("last_maintenance_date"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  sensors: json("sensors"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  farmIdx: index("irrigation_systems_farm_idx").on(table.farmId),
}));

export const irrigationSchedules = pgTable("irrigation_schedules", {
  id: serial("id").primaryKey(),
  scheduleId: varchar("schedule_id", { length: 50 }).notNull().unique(),
  systemId: varchar("system_id", { length: 50 }).notNull(),
  farmId: integer("farm_id").notNull().references(() => farms.id),
  cropType: varchar("crop_type", { length: 100 }),
  frequencyDays: integer("frequency_days"),
  durationMinutes: integer("duration_minutes"),
  waterVolumeLiters: decimal("water_volume_liters", { precision: 12, scale: 2 }),
  startTime: varchar("start_time", { length: 10 }),
  isActive: boolean("is_active").default(true),
  smartScheduling: boolean("smart_scheduling").default(false),
  soilMoistureThreshold: decimal("soil_moisture_threshold", { precision: 5, scale: 2 }),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  systemIdx: index("irrigation_schedules_system_idx").on(table.systemId),
  farmIdx: index("irrigation_schedules_farm_idx").on(table.farmId),
}));

// ============================================================================
// HARVEST FORECASTING — Market Opportunities (was: Map<string, MarketOpportunity>)
// ============================================================================

export const harvestMarketOpportunities = pgTable("harvest_market_opportunities", {
  id: serial("id").primaryKey(),
  opportunityId: varchar("opportunity_id", { length: 50 }).notNull().unique(),
  cropType: varchar("crop_type", { length: 100 }).notNull(),
  buyerName: varchar("buyer_name", { length: 200 }),
  pricePerKg: decimal("price_per_kg", { precision: 10, scale: 2 }),
  quantityNeeded: decimal("quantity_needed", { precision: 12, scale: 2 }),
  location: varchar("location", { length: 255 }),
  deadline: timestamp("deadline"),
  qualityRequirements: json("quality_requirements"),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  cropIdx: index("market_opps_crop_idx").on(table.cropType),
  statusIdx: index("market_opps_status_idx").on(table.status),
}));

// ============================================================================
// CARBON CREDITS — Footprints & Sustainability Scores (was: Map<string, CarbonFootprint>)
// ============================================================================

export const carbonFootprints = pgTable("carbon_footprints", {
  id: serial("id").primaryKey(),
  footprintId: varchar("footprint_id", { length: 50 }).notNull().unique(),
  farmerId: integer("farmer_id").notNull().references(() => users.id),
  farmId: integer("farm_id").references(() => farms.id),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  totalEmissions: decimal("total_emissions", { precision: 12, scale: 4 }),
  totalSequestration: decimal("total_sequestration", { precision: 12, scale: 4 }),
  netEmissions: decimal("net_emissions", { precision: 12, scale: 4 }),
  breakdown: json("breakdown"),
  methodology: varchar("methodology", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  farmerIdx: index("carbon_footprints_farmer_idx").on(table.farmerId),
}));

export const sustainabilityScores = pgTable("sustainability_scores", {
  id: serial("id").primaryKey(),
  farmerId: integer("farmer_id").notNull().references(() => users.id),
  farmId: integer("farm_id").references(() => farms.id),
  overallScore: decimal("overall_score", { precision: 5, scale: 2 }).notNull(),
  waterScore: decimal("water_score", { precision: 5, scale: 2 }),
  soilScore: decimal("soil_score", { precision: 5, scale: 2 }),
  biodiversityScore: decimal("biodiversity_score", { precision: 5, scale: 2 }),
  carbonScore: decimal("carbon_score", { precision: 5, scale: 2 }),
  practices: json("practices"),
  certifications: json("certifications"),
  assessedAt: timestamp("assessed_at").defaultNow().notNull(),
  validUntil: timestamp("valid_until"),
}, (table) => ({
  farmerIdx: index("sustainability_scores_farmer_idx").on(table.farmerId),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type InputFinancingCreditLine = typeof inputFinancingCreditLines.$inferSelect;
export type InputFinancingBulkGroup = typeof inputFinancingBulkGroups.$inferSelect;
export type SedonaJob = typeof sedonaJobs.$inferSelect;
export type SedonaJobRun = typeof sedonaJobRuns.$inferSelect;
export type VoiceAdvisoryCall = typeof voiceAdvisoryCalls.$inferSelect;
export type VoiceAdvisoryAlert = typeof voiceAdvisoryAlerts.$inferSelect;
export type PostHarvestStorageBooking = typeof postHarvestStorageBookings.$inferSelect;
export type PostHarvestLogisticsBooking = typeof postHarvestLogisticsBookings.$inferSelect;
export type PestOutbreakReport = typeof pestOutbreakReports.$inferSelect;
export type PestFarmAssessment = typeof pestFarmAssessments.$inferSelect;
export type KnowledgeSuccessStory = typeof knowledgeSuccessStories.$inferSelect;
export type KnowledgeExpert = typeof knowledgeExperts.$inferSelect;
export type KnowledgeExpertSession = typeof knowledgeExpertSessions.$inferSelect;
export type KnowledgeFarmerProfile = typeof knowledgeFarmerProfiles.$inferSelect;
export type LaborPayrollRecord = typeof laborPayrollRecords.$inferSelect;
export type LaborSchedule = typeof laborSchedules.$inferSelect;
export type IrrigationSystem = typeof irrigationSystems.$inferSelect;
export type IrrigationSchedule = typeof irrigationSchedules.$inferSelect;
export type HarvestMarketOpportunity = typeof harvestMarketOpportunities.$inferSelect;
export type CarbonFootprint = typeof carbonFootprints.$inferSelect;
export type SustainabilityScore = typeof sustainabilityScores.$inferSelect;
