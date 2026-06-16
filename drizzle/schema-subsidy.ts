/**
 * Government Subsidy & Extension Worker Schema
 * 
 * DB-driven subsidy programs, applications, disbursements, and extension visits.
 * Replaces hardcoded program data with full lifecycle tracking.
 */

import {
  pgTable, serial, text, varchar, integer, timestamp, boolean, numeric, jsonb,
} from "drizzle-orm/pg-core";

// ==================== Subsidy Programs ====================

export const subsidyPrograms = pgTable("subsidy_programs", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  ministry: varchar("ministry", { length: 255 }).notNull(),
  country: varchar("country", { length: 50 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  totalBudget: numeric("total_budget", { precision: 18, scale: 2 }).notNull().$type<number>(),
  allocatedBudget: numeric("allocated_budget", { precision: 18, scale: 2 }).default("0").$type<number>(),
  currency: varchar("currency", { length: 10 }).notNull().default("NGN"),
  perFarmerAmount: numeric("per_farmer_amount", { precision: 12, scale: 2 }).notNull().$type<number>(),
  maxBeneficiaries: integer("max_beneficiaries"),
  beneficiaryCount: integer("beneficiary_count").default(0),
  eligibilityCriteria: jsonb("eligibility_criteria").notNull(),
  applicationDeadline: timestamp("application_deadline"),
  disbursementMethod: varchar("disbursement_method", { length: 50 }).default("mobile_money"),
  description: text("description"),
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SubsidyProgram = typeof subsidyPrograms.$inferSelect;
export type InsertSubsidyProgram = typeof subsidyPrograms.$inferInsert;

// ==================== Subsidy Applications ====================

export const subsidyApplications = pgTable("subsidy_applications", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull(),
  userId: integer("user_id").notNull(),
  farmerId: integer("farmer_id").notNull(),
  farmId: integer("farm_id").notNull(),
  nationalId: varchar("national_id", { length: 50 }),
  landSizeAcres: varchar("land_size_acres", { length: 20 }),
  cropTypes: jsonb("crop_types"),
  mobileMoneyNumber: varchar("mobile_money_number", { length: 20 }),
  cooperativeId: integer("cooperative_id"),
  eligibilityScore: integer("eligibility_score"),
  status: varchar("status", { length: 30 }).default("submitted"),
  reviewedBy: integer("reviewed_by"),
  reviewNotes: text("review_notes"),
  approvedAt: timestamp("approved_at"),
  disbursedAt: timestamp("disbursed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SubsidyApplication = typeof subsidyApplications.$inferSelect;
export type InsertSubsidyApplication = typeof subsidyApplications.$inferInsert;

// ==================== Subsidy Disbursements ====================

export const subsidyDisbursements = pgTable("subsidy_disbursements", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull(),
  userId: integer("user_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull().$type<number>(),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  method: varchar("method", { length: 30 }).notNull(),
  transactionRef: varchar("transaction_ref", { length: 100 }),
  status: varchar("status", { length: 20 }).default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SubsidyDisbursement = typeof subsidyDisbursements.$inferSelect;
export type InsertSubsidyDisbursement = typeof subsidyDisbursements.$inferInsert;

// ==================== Extension Worker Visits ====================

export const extensionWorkerVisits = pgTable("extension_worker_visits", {
  id: serial("id").primaryKey(),
  extensionWorkerId: integer("extension_worker_id").notNull(),
  farmerId: integer("farmer_id").notNull(),
  farmId: integer("farm_id").notNull(),
  visitType: varchar("visit_type", { length: 30 }).notNull(),
  notes: text("notes"),
  gpsLatitude: varchar("gps_latitude", { length: 20 }),
  gpsLongitude: varchar("gps_longitude", { length: 20 }),
  seedsDistributed: jsonb("seeds_distributed"),
  photosUrls: jsonb("photos_urls"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ExtensionWorkerVisit = typeof extensionWorkerVisits.$inferSelect;
export type InsertExtensionWorkerVisit = typeof extensionWorkerVisits.$inferInsert;
