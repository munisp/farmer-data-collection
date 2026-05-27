/**
 * User Journey Database Schema
 * Additional tables required for 10 end-to-end user journeys
 */

import { pgTable, serial, integer, varchar, decimal, timestamp, date, text, boolean } from "drizzle-orm/pg-core";
import { users, crops } from "./schema.js";

// ============================================================================
// FARM PROFILES (Journey 1: Registration & First Harvest)
// ============================================================================

export const farmProfiles = pgTable("farm_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  farmName: varchar("farm_name", { length: 255 }).notNull(),
  farmSize: decimal("farm_size", { precision: 10, scale: 2 }).notNull(), // in hectares
  locationLat: decimal("location_lat", { precision: 10, scale: 8 }),
  locationLng: decimal("location_lng", { precision: 11, scale: 8 }),
  soilType: varchar("soil_type", { length: 100 }),
  waterSource: varchar("water_source", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// PLANTING RECORDS (Journey 4: Weather-Based Planting Advisory)
// ============================================================================

export const plantingRecords = pgTable("planting_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  cropId: integer("crop_id").references(() => crops.id),
  cropType: varchar("crop_type", { length: 100 }).notNull(),
  plantingDate: date("planting_date").notNull(),
  expectedHarvestDate: date("expected_harvest_date"),
  area: decimal("area", { precision: 10, scale: 2 }).notNull(), // in hectares
  seedVariety: varchar("seed_variety", { length: 100 }),
  plantingMethod: varchar("planting_method", { length: 100 }),
  status: varchar("status", { length: 50 }).default("planted").notNull(), // planted, growing, harvested
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// LOAN ACCOUNTS (Journey 5: Loan Application & Repayment)
// ============================================================================

export const loanAccounts = pgTable("loan_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(), // percentage
  purpose: text("purpose"),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, active, repaid, defaulted
  creditScore: integer("credit_score"),
  disbursedAt: timestamp("disbursed_at"),
  dueDate: date("due_date"),
  totalRepaid: decimal("total_repaid", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const loanRepayments = pgTable("loan_repayments", {
  id: serial("id").primaryKey(),
  loanId: integer("loan_id").references(() => loanAccounts.id).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").defaultNow().notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }), // auto_deduct, manual
  transactionId: varchar("transaction_id", { length: 100 }),
});

// ============================================================================
// GROUP SAVINGS (Journey 7: Group Savings & Investment)
// ============================================================================

export const groupSavings = pgTable("group_savings", {
  id: serial("id").primaryKey(),
  groupName: varchar("group_name", { length: 255 }).notNull(),
  leaderUserId: integer("leader_user_id").references(() => users.id).notNull(),
  totalBalance: decimal("total_balance", { precision: 12, scale: 2 }).default("0").notNull(),
  contributionAmount: decimal("contribution_amount", { precision: 10, scale: 2 }),
  contributionFrequency: varchar("contribution_frequency", { length: 50 }), // weekly, monthly
  status: varchar("status", { length: 50 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupSavings.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  role: varchar("role", { length: 50 }).default("member").notNull(), // leader, member
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const groupContributions = pgTable("group_contributions", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupSavings.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  contributionDate: timestamp("contribution_date").defaultNow().notNull(),
  transactionId: varchar("transaction_id", { length: 100 }),
});

export const groupInvestments = pgTable("group_investments", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupSavings.id).notNull(),
  investmentType: varchar("investment_type", { length: 100 }).notNull(), // tractor, equipment, land
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  purchaseDate: timestamp("purchase_date").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
});

// ============================================================================
// INSURANCE (Journey 8: Insurance Claim Processing)
// ============================================================================

export const insurancePolicies = pgTable("insurance_policies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  policyNumber: varchar("policy_number", { length: 100 }).notNull().unique(),
  policyType: varchar("policy_type", { length: 100 }).notNull(), // crop, livestock, equipment
  coverageAmount: decimal("coverage_amount", { precision: 12, scale: 2 }).notNull(),
  premium: decimal("premium", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insuranceClaims = pgTable("insurance_claims", {
  id: serial("id").primaryKey(),
  policyId: integer("policy_id").references(() => insurancePolicies.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  claimNumber: varchar("claim_number", { length: 100 }).notNull().unique(),
  claimAmount: decimal("claim_amount", { precision: 12, scale: 2 }).notNull(),
  damageType: varchar("damage_type", { length: 100 }).notNull(), // flood, drought, pest, disease
  damagePercentage: integer("damage_percentage"),
  description: text("description"),
  photoUrls: text("photo_urls"), // JSON array of photo URLs
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, approved, rejected, paid
  assessorNotes: text("assessor_notes"),
  approvedAmount: decimal("approved_amount", { precision: 12, scale: 2 }),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// NEGOTIATIONS (Journey 9: Market Price Discovery & Negotiation)
// ============================================================================

export const negotiations = pgTable("negotiations", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull(),
  buyerId: integer("buyer_id").references(() => users.id).notNull(),
  sellerId: integer("seller_id").references(() => users.id).notNull(),
  initialPrice: decimal("initial_price", { precision: 10, scale: 2 }).notNull(),
  counterPrice: decimal("counter_price", { precision: 10, scale: 2 }),
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(), // active, accepted, rejected, expired
  lastOfferBy: varchar("last_offer_by", { length: 50 }), // buyer, seller
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const negotiationMessages = pgTable("negotiation_messages", {
  id: serial("id").primaryKey(),
  negotiationId: integer("negotiation_id").references(() => negotiations.id).notNull(),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  message: text("message").notNull(),
  offerPrice: decimal("offer_price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// PLANTING CALENDARS (Journey 10: Annual Farm Performance Report)
// ============================================================================

export const plantingCalendars = pgTable("planting_calendars", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  year: integer("year").notNull(),
  cropType: varchar("crop_type", { length: 100 }).notNull(),
  plantingMonth: integer("planting_month").notNull(), // 1-12
  harvestMonth: integer("harvest_month").notNull(), // 1-12
  recommendedArea: decimal("recommended_area", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const annualReports = pgTable("annual_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  year: integer("year").notNull(),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).notNull(),
  totalExpenses: decimal("total_expenses", { precision: 12, scale: 2 }).notNull(),
  netProfit: decimal("net_profit", { precision: 12, scale: 2 }).notNull(),
  roi: decimal("roi", { precision: 5, scale: 2 }), // percentage
  topCrop: varchar("top_crop", { length: 100 }),
  recommendations: text("recommendations"), // JSON array of recommendations
  pdfUrl: varchar("pdf_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// CROP DISEASE TRACKING (Journey 6: Crop Disease Detection & Treatment)
// ============================================================================

export const cropDiseases = pgTable("crop_diseases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  cropId: integer("crop_id").references(() => crops.id),
  diseaseName: varchar("disease_name", { length: 255 }).notNull(),
  severity: varchar("severity", { length: 50 }), // low, medium, high
  photoUrl: varchar("photo_url", { length: 500 }),
  aiDiagnosis: text("ai_diagnosis"), // JSON with GPT-4 Vision results
  treatmentPlan: text("treatment_plan"),
  status: varchar("status", { length: 50 }).default("active").notNull(), // active, treated, recovered
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  treatedAt: timestamp("treated_at"),
  recoveredAt: timestamp("recovered_at"),
});

export const diseaseFollowUps = pgTable("disease_follow_ups", {
  id: serial("id").primaryKey(),
  diseaseId: integer("disease_id").references(() => cropDiseases.id).notNull(),
  photoUrl: varchar("photo_url", { length: 500 }),
  notes: text("notes"),
  improvementStatus: varchar("improvement_status", { length: 50 }), // improving, stable, worsening
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// SCHEDULED REMINDERS (Journey 2: Daily Expense Tracking, Journey 4: Planting Advisory)
// ============================================================================

export const scheduledReminders = pgTable("scheduled_reminders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  reminderType: varchar("reminder_type", { length: 100 }).notNull(), // watering, fertilizing, weekly_report
  message: text("message").notNull(),
  channel: varchar("channel", { length: 50 }).notNull(), // sms, whatsapp, ussd
  frequency: varchar("frequency", { length: 50 }), // daily, weekly, monthly
  nextSendAt: timestamp("next_send_at").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Type exports
export type FarmProfile = typeof farmProfiles.$inferSelect;
export type InsertFarmProfile = typeof farmProfiles.$inferInsert;

export type PlantingRecord = typeof plantingRecords.$inferSelect;
export type InsertPlantingRecord = typeof plantingRecords.$inferInsert;

export type LoanAccount = typeof loanAccounts.$inferSelect;
export type InsertLoanAccount = typeof loanAccounts.$inferInsert;

export type GroupSavings = typeof groupSavings.$inferSelect;
export type InsertGroupSavings = typeof groupSavings.$inferInsert;

export type InsurancePolicy = typeof insurancePolicies.$inferSelect;
export type InsertInsurancePolicy = typeof insurancePolicies.$inferInsert;

export type InsuranceClaim = typeof insuranceClaims.$inferSelect;
export type InsertInsuranceClaim = typeof insuranceClaims.$inferInsert;

export type Negotiation = typeof negotiations.$inferSelect;
export type InsertNegotiation = typeof negotiations.$inferInsert;

export type PlantingCalendar = typeof plantingCalendars.$inferSelect;
export type InsertPlantingCalendar = typeof plantingCalendars.$inferInsert;

export type AnnualReport = typeof annualReports.$inferSelect;
export type InsertAnnualReport = typeof annualReports.$inferInsert;

export type CropDisease = typeof cropDiseases.$inferSelect;
export type InsertCropDisease = typeof cropDiseases.$inferInsert;

export type ScheduledReminder = typeof scheduledReminders.$inferSelect;
export type InsertScheduledReminder = typeof scheduledReminders.$inferInsert;
