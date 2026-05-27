/**
 * Loan Application Schema
 * 
 * Handles loan application workflow with document uploads and status tracking
 */

import { pgTable, serial, integer, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Loan Applications Table
 * Stores loan application submissions with multi-step workflow
 */
export const loanApplications = pgTable("loan_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  
  // Application Details
  applicationNumber: varchar("application_number", { length: 50 }).notNull().unique(),
  loanAmount: integer("loan_amount").notNull(), // Amount in cents
  purpose: text("purpose").notNull(),
  termMonths: integer("term_months").notNull(),
  
  // Applicant Information
  fullName: varchar("full_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull(),
  address: text("address").notNull(),
  
  // Employment/Income Information
  employmentStatus: varchar("employment_status", { length: 100 }), // employed, self-employed, farmer, etc.
  monthlyIncome: integer("monthly_income"), // Amount in cents
  incomeSource: text("income_source"),
  
  // Farm Information (for farmers)
  farmSize: varchar("farm_size", { length: 100 }), // in hectares
  cropTypes: text("crop_types"), // JSON array of crops
  yearsOfFarming: integer("years_of_farming"),
  
  // Application Status
  status: varchar("status", { length: 50 }).notNull().default("pending"), 
  // pending, under_review, approved, rejected, withdrawn
  
  // Review Information
  reviewedBy: integer("reviewed_by"), // Admin user ID
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  rejectionReason: text("rejection_reason"),
  
  // Approval Information
  approvedAmount: integer("approved_amount"), // May differ from requested amount
  approvedTermMonths: integer("approved_term_months"),
  approvedInterestRate: integer("approved_interest_rate"), // Basis points (e.g., 1500 = 15%)
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  submittedAt: timestamp("submitted_at"),
});

/**
 * Application Documents Table
 * Stores uploaded documents for loan applications
 */
export const applicationDocuments = pgTable("application_documents", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull(),
  userId: integer("user_id").notNull(),
  
  // Document Information
  documentType: varchar("document_type", { length: 100 }).notNull(),
  // Types: id_card, proof_of_address, bank_statement, farm_ownership, income_proof, etc.
  
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: integer("file_size").notNull(), // Size in bytes
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  
  // S3 Storage
  s3Key: varchar("s3_key", { length: 500 }).notNull(), // S3 object key
  s3Url: text("s3_url").notNull(), // Public URL for viewing
  
  // Verification Status
  verified: boolean("verified").notNull().default(false),
  verifiedBy: integer("verified_by"), // Admin user ID
  verifiedAt: timestamp("verified_at"),
  verificationNotes: text("verification_notes"),
  
  // Timestamps
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

/**
 * Application Status History Table
 * Tracks all status changes for audit trail
 */
export const applicationStatusHistory = pgTable("application_status_history", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").notNull(),
  
  // Status Change
  fromStatus: varchar("from_status", { length: 50 }),
  toStatus: varchar("to_status", { length: 50 }).notNull(),
  
  // Change Details
  changedBy: integer("changed_by"), // User ID who made the change
  notes: text("notes"),
  
  // Timestamp
  changedAt: timestamp("changed_at").notNull().defaultNow(),
});
