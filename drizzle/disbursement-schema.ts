import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { loans } from "./financial-schema.js";
import { users } from "./schema.js";

/**
 * Loan Disbursements Table
 * 
 * Tracks the actual transfer of loan funds to borrowers
 * Supports multiple disbursement methods (bank transfer, mobile money, cash)
 */
export const loanDisbursements = pgTable("loan_disbursements", {
  id: serial("id").primaryKey(),
  
  // Foreign keys
  loanId: integer("loan_id")
    .references(() => loans.id, { onDelete: "cascade" })
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  
  // Disbursement details
  disbursementNumber: varchar("disbursement_number", { length: 50 }).unique().notNull(),
  amount: integer("amount").notNull(), // Amount in kobo (₦1 = 100 kobo)
  
  // Disbursement method
  method: varchar("method", { length: 50 }).notNull(), // 'bank_transfer', 'mobile_money', 'cash', 'check'
  
  // Bank transfer details
  bankName: varchar("bank_name", { length: 255 }),
  accountNumber: varchar("account_number", { length: 50 }),
  accountName: varchar("account_name", { length: 255 }),
  
  // Mobile money details
  mobileMoneyProvider: varchar("mobile_money_provider", { length: 100 }), // 'MTN', 'Airtel', 'Glo', '9mobile'
  mobileMoneyNumber: varchar("mobile_money_number", { length: 20 }),
  
  // Transaction reference
  transactionReference: varchar("transaction_reference", { length: 255 }),
  
  // Status tracking
  status: varchar("status", { length: 50 }).notNull().default("pending"), 
  // 'pending', 'processing', 'completed', 'failed', 'cancelled'
  
  // Timestamps
  scheduledAt: timestamp("scheduled_at"),
  processedAt: timestamp("processed_at"),
  completedAt: timestamp("completed_at"),
  failedAt: timestamp("failed_at"),
  
  // Additional information
  notes: text("notes"),
  failureReason: text("failure_reason"),
  
  // Processing details
  processedBy: integer("processed_by").references(() => users.id), // Admin who processed
  
  // Fees and charges
  processingFee: integer("processing_fee").default(0), // Fee in kobo
  
  // Audit fields
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Disbursement Status History Table
 * 
 * Tracks all status changes for audit trail
 */
export const disbursementStatusHistory = pgTable("disbursement_status_history", {
  id: serial("id").primaryKey(),
  
  disbursementId: integer("disbursement_id")
    .references(() => loanDisbursements.id, { onDelete: "cascade" })
    .notNull(),
  
  fromStatus: varchar("from_status", { length: 50 }),
  toStatus: varchar("to_status", { length: 50 }).notNull(),
  
  changedBy: integer("changed_by").references(() => users.id),
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LoanDisbursement = typeof loanDisbursements.$inferSelect;
export type NewLoanDisbursement = typeof loanDisbursements.$inferInsert;
export type DisbursementStatusHistory = typeof disbursementStatusHistory.$inferSelect;
export type NewDisbursementStatusHistory = typeof disbursementStatusHistory.$inferInsert;
