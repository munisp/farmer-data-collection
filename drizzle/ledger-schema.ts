import { pgTable, serial, integer, varchar, text, timestamp, decimal, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

// Unified Financial Ledger Schema
// All financial transactions across marketplace, microfinance, banking, and exchange
// flow through this single ledger for consistency and auditability

// Account Types for the unified ledger
export const ledgerAccountTypes = pgTable("ledger_account_types", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(), // asset, liability, equity, revenue, expense
  normalBalance: varchar("normal_balance", { length: 10 }).notNull(), // debit, credit
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Unified Ledger Accounts - one per entity (farmer, trader, lender, platform)
export const ledgerAccounts = pgTable("ledger_accounts", {
  id: serial("id").primaryKey(),
  accountNumber: varchar("account_number", { length: 30 }).notNull().unique(),
  accountTypeId: integer("account_type_id").references(() => ledgerAccountTypes.id),
  
  // Owner reference - polymorphic
  ownerType: varchar("owner_type", { length: 30 }).notNull(), // farmer, trader, lender, platform, escrow
  ownerId: integer("owner_id"), // null for platform/escrow accounts
  
  // Balances (stored in kobo - smallest currency unit)
  balance: integer("balance").default(0).notNull(), // current balance
  availableBalance: integer("available_balance").default(0).notNull(), // balance minus holds
  pendingCredits: integer("pending_credits").default(0).notNull(),
  pendingDebits: integer("pending_debits").default(0).notNull(),
  
  // Currency
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  
  // Status
  status: varchar("status", { length: 20 }).default("active").notNull(), // active, frozen, closed
  frozenReason: text("frozen_reason"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  ownerIdx: index("ledger_accounts_owner_idx").on(table.ownerType, table.ownerId),
  statusIdx: index("ledger_accounts_status_idx").on(table.status),
}));

// Ledger Transactions - immutable record of all financial movements
export const ledgerTransactions = pgTable("ledger_transactions", {
  id: serial("id").primaryKey(),
  transactionId: varchar("transaction_id", { length: 50 }).notNull().unique(), // UUID for external reference
  
  // Transaction type
  transactionType: varchar("transaction_type", { length: 50 }).notNull(),
  // Types: deposit, withdrawal, transfer, loan_disbursement, loan_repayment,
  //        marketplace_payment, marketplace_settlement, exchange_trade,
  //        exchange_settlement, fee, refund, adjustment
  
  // Source reference - what triggered this transaction
  sourceType: varchar("source_type", { length: 30 }).notNull(), // loan, order, trade, payment, manual
  sourceId: varchar("source_id", { length: 50 }), // ID of the source entity
  
  // Amount (in kobo)
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  
  // Status
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, completed, failed, reversed
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  
  // Audit
  createdBy: integer("created_by"),
  description: text("description"),
  metadata: text("metadata"), // JSON for additional context
}, (table) => ({
  typeIdx: index("ledger_transactions_type_idx").on(table.transactionType),
  sourceIdx: index("ledger_transactions_source_idx").on(table.sourceType, table.sourceId),
  statusIdx: index("ledger_transactions_status_idx").on(table.status),
  createdAtIdx: index("ledger_transactions_created_at_idx").on(table.createdAt),
}));

// Ledger Entries - double-entry bookkeeping
export const ledgerEntries = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").references(() => ledgerTransactions.id).notNull(),
  accountId: integer("account_id").references(() => ledgerAccounts.id).notNull(),
  
  // Entry type
  entryType: varchar("entry_type", { length: 10 }).notNull(), // debit, credit
  
  // Amount (always positive, direction determined by entryType)
  amount: integer("amount").notNull(),
  
  // Running balance after this entry
  balanceAfter: integer("balance_after").notNull(),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  transactionIdx: index("ledger_entries_transaction_idx").on(table.transactionId),
  accountIdx: index("ledger_entries_account_idx").on(table.accountId),
}));

// Holds - temporary reservations on account balances
export const ledgerHolds = pgTable("ledger_holds", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => ledgerAccounts.id).notNull(),
  
  // Hold details
  holdType: varchar("hold_type", { length: 30 }).notNull(), // order, loan_collateral, pending_settlement
  referenceType: varchar("reference_type", { length: 30 }).notNull(),
  referenceId: varchar("reference_id", { length: 50 }).notNull(),
  
  // Amount held
  amount: integer("amount").notNull(),
  
  // Status
  status: varchar("status", { length: 20 }).default("active").notNull(), // active, released, captured
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  releasedAt: timestamp("released_at"),
  
  // Audit
  releaseReason: text("release_reason"),
}, (table) => ({
  accountIdx: index("ledger_holds_account_idx").on(table.accountId),
  referenceIdx: index("ledger_holds_reference_idx").on(table.referenceType, table.referenceId),
  statusIdx: index("ledger_holds_status_idx").on(table.status),
}));

// Daily Account Snapshots - for reconciliation and reporting
export const ledgerDailySnapshots = pgTable("ledger_daily_snapshots", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").references(() => ledgerAccounts.id).notNull(),
  snapshotDate: timestamp("snapshot_date").notNull(),
  
  // Balances at end of day
  openingBalance: integer("opening_balance").notNull(),
  closingBalance: integer("closing_balance").notNull(),
  
  // Activity summary
  totalDebits: integer("total_debits").default(0).notNull(),
  totalCredits: integer("total_credits").default(0).notNull(),
  transactionCount: integer("transaction_count").default(0).notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  accountDateIdx: uniqueIndex("ledger_snapshots_account_date_idx").on(table.accountId, table.snapshotDate),
}));

// Fee Schedule - configurable fees for different transaction types
export const ledgerFeeSchedule = pgTable("ledger_fee_schedule", {
  id: serial("id").primaryKey(),
  feeCode: varchar("fee_code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  
  // Fee calculation
  feeType: varchar("fee_type", { length: 20 }).notNull(), // flat, percentage, tiered
  flatAmount: integer("flat_amount"), // in kobo
  percentageRate: decimal("percentage_rate", { precision: 8, scale: 4 }), // e.g., 0.0150 = 1.5%
  minAmount: integer("min_amount"), // minimum fee
  maxAmount: integer("max_amount"), // maximum fee (cap)
  
  // Applicability
  transactionTypes: text("transaction_types"), // JSON array of applicable transaction types
  
  // Status
  isActive: boolean("is_active").default(true),
  effectiveFrom: timestamp("effective_from").defaultNow(),
  effectiveTo: timestamp("effective_to"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Reconciliation Records - for external system reconciliation
export const ledgerReconciliation = pgTable("ledger_reconciliation", {
  id: serial("id").primaryKey(),
  reconciliationType: varchar("reconciliation_type", { length: 30 }).notNull(), // bank, payment_gateway, exchange
  externalSystem: varchar("external_system", { length: 50 }).notNull(),
  
  // Period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // Balances
  internalBalance: integer("internal_balance").notNull(),
  externalBalance: integer("external_balance").notNull(),
  difference: integer("difference").notNull(),
  
  // Status
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, matched, discrepancy, resolved
  
  // Resolution
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: integer("resolved_by"),
  resolutionNotes: text("resolution_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  typeSystemIdx: index("ledger_reconciliation_type_system_idx").on(table.reconciliationType, table.externalSystem),
  statusIdx: index("ledger_reconciliation_status_idx").on(table.status),
}));
