/**
 * Cooperative/Group Management Schema
 * Supports farmer cooperatives, savings groups, and collective organizations
 */

import { pgTable, serial, varchar, text, integer, decimal, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './schema';

// Cooperative type enum
export const cooperativeTypeEnum = pgEnum('cooperative_type', [
  'farmer_cooperative',
  'savings_group',
  'producer_organization',
  'marketing_cooperative',
  'credit_union',
  'women_group',
  'youth_group',
  'other',
]);

// Cooperative status enum
export const cooperativeStatusEnum = pgEnum('cooperative_status', [
  'active',
  'inactive',
  'suspended',
  'dissolved',
  'pending_registration',
]);

// Member role enum
export const memberRoleEnum = pgEnum('member_role', [
  'chairperson',
  'vice_chairperson',
  'secretary',
  'treasurer',
  'member',
  'field_officer',
  'advisor',
]);

// Member status enum
export const memberStatusEnum = pgEnum('member_status', [
  'active',
  'inactive',
  'suspended',
  'pending',
  'exited',
]);

// Cooperatives table
export const cooperatives = pgTable('cooperatives', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  registrationNumber: varchar('registration_number', { length: 100 }),
  type: cooperativeTypeEnum('type').notNull().default('farmer_cooperative'),
  status: cooperativeStatusEnum('status').notNull().default('active'),
  
  // Location
  village: varchar('village', { length: 255 }),
  district: varchar('district', { length: 255 }),
  region: varchar('region', { length: 255 }),
  country: varchar('country', { length: 100 }).default('Nigeria'),
  latitude: decimal('latitude', { precision: 10, scale: 7 }),
  longitude: decimal('longitude', { precision: 10, scale: 7 }),
  
  // Contact
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  address: text('address'),
  
  // Financial
  shareValue: integer('share_value').default(0), // Value per share in cents
  minimumShares: integer('minimum_shares').default(1),
  monthlyContribution: integer('monthly_contribution').default(0), // In cents
  
  // Governance
  foundedDate: timestamp('founded_date'),
  registrationDate: timestamp('registration_date'),
  meetingFrequency: varchar('meeting_frequency', { length: 50 }), // weekly, monthly, quarterly
  nextMeetingDate: timestamp('next_meeting_date'),
  
  // Metadata
  description: text('description'),
  objectives: text('objectives'),
  bylawsUrl: varchar('bylaws_url', { length: 500 }),
  logoUrl: varchar('logo_url', { length: 500 }),
  
  // Audit
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Cooperative members table
export const cooperativeMembers = pgTable('cooperative_members', {
  id: serial('id').primaryKey(),
  cooperativeId: integer('cooperative_id').references(() => cooperatives.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  
  // Membership details
  memberNumber: varchar('member_number', { length: 50 }),
  role: memberRoleEnum('role').notNull().default('member'),
  status: memberStatusEnum('status').notNull().default('active'),
  
  // Shares and contributions
  sharesOwned: integer('shares_owned').default(0),
  totalContributions: integer('total_contributions').default(0), // In cents
  outstandingBalance: integer('outstanding_balance').default(0), // In cents
  
  // Dates
  joinDate: timestamp('join_date').defaultNow().notNull(),
  exitDate: timestamp('exit_date'),
  lastContributionDate: timestamp('last_contribution_date'),
  
  // Metadata
  notes: text('notes'),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Cooperative accounts (group wallets)
export const cooperativeAccounts = pgTable('cooperative_accounts', {
  id: serial('id').primaryKey(),
  cooperativeId: integer('cooperative_id').references(() => cooperatives.id).notNull(),
  
  // Account details
  accountType: varchar('account_type', { length: 50 }).notNull(), // savings, loan_fund, emergency_fund, operating
  accountName: varchar('account_name', { length: 255 }).notNull(),
  
  // Balances (in cents)
  totalBalance: integer('total_balance').default(0),
  availableBalance: integer('available_balance').default(0),
  reservedBalance: integer('reserved_balance').default(0),
  
  // Metadata
  description: text('description'),
  isActive: boolean('is_active').default(true),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Cooperative transactions
export const cooperativeTransactions = pgTable('cooperative_transactions', {
  id: serial('id').primaryKey(),
  cooperativeId: integer('cooperative_id').references(() => cooperatives.id).notNull(),
  accountId: integer('account_id').references(() => cooperativeAccounts.id),
  memberId: integer('member_id').references(() => cooperativeMembers.id),
  
  // Transaction details
  transactionType: varchar('transaction_type', { length: 50 }).notNull(), // contribution, withdrawal, loan_disbursement, loan_repayment, fee, dividend
  amount: integer('amount').notNull(), // In cents
  balanceAfter: integer('balance_after'),
  
  // Reference
  referenceNumber: varchar('reference_number', { length: 100 }),
  relatedLoanId: integer('related_loan_id'),
  
  // Metadata
  description: text('description'),
  paymentMethod: varchar('payment_method', { length: 50 }), // cash, mobile_money, bank_transfer
  
  // Audit
  processedBy: integer('processed_by').references(() => users.id),
  transactionDate: timestamp('transaction_date').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Cooperative loans (group loans)
export const cooperativeLoans = pgTable('cooperative_loans', {
  id: serial('id').primaryKey(),
  cooperativeId: integer('cooperative_id').references(() => cooperatives.id).notNull(),
  
  // Loan details
  loanType: varchar('loan_type', { length: 50 }).notNull(), // group_loan, member_loan, agricultural_loan
  principalAmount: integer('principal_amount').notNull(), // In cents
  interestRate: decimal('interest_rate', { precision: 5, scale: 2 }).notNull(),
  termMonths: integer('term_months').notNull(),
  
  // Status
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, approved, disbursed, repaying, completed, defaulted
  
  // Amounts (in cents)
  disbursedAmount: integer('disbursed_amount').default(0),
  totalRepaid: integer('total_repaid').default(0),
  outstandingBalance: integer('outstanding_balance').default(0),
  
  // Dates
  applicationDate: timestamp('application_date').defaultNow().notNull(),
  approvalDate: timestamp('approval_date'),
  disbursementDate: timestamp('disbursement_date'),
  maturityDate: timestamp('maturity_date'),
  
  // Purpose
  purpose: text('purpose'),
  
  // Guarantors (member IDs as JSON array)
  guarantorMemberIds: text('guarantor_member_ids'),
  
  // Audit
  approvedBy: integer('approved_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Cooperative meetings
export const cooperativeMeetings = pgTable('cooperative_meetings', {
  id: serial('id').primaryKey(),
  cooperativeId: integer('cooperative_id').references(() => cooperatives.id).notNull(),
  
  // Meeting details
  meetingType: varchar('meeting_type', { length: 50 }).notNull(), // regular, annual_general, emergency, committee
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  
  // Schedule
  scheduledDate: timestamp('scheduled_date').notNull(),
  startTime: varchar('start_time', { length: 10 }),
  endTime: varchar('end_time', { length: 10 }),
  
  // Location
  venue: varchar('venue', { length: 255 }),
  isVirtual: boolean('is_virtual').default(false),
  virtualMeetingUrl: varchar('virtual_meeting_url', { length: 500 }),
  
  // Attendance
  expectedAttendees: integer('expected_attendees'),
  actualAttendees: integer('actual_attendees'),
  
  // Minutes
  minutesUrl: varchar('minutes_url', { length: 500 }),
  resolutions: text('resolutions'),
  
  // Status
  status: varchar('status', { length: 50 }).default('scheduled'), // scheduled, in_progress, completed, cancelled
  
  // Audit
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const cooperativesRelations = relations(cooperatives, ({ many, one }) => ({
  members: many(cooperativeMembers),
  accounts: many(cooperativeAccounts),
  transactions: many(cooperativeTransactions),
  loans: many(cooperativeLoans),
  meetings: many(cooperativeMeetings),
  createdByUser: one(users, {
    fields: [cooperatives.createdBy],
    references: [users.id],
  }),
}));

export const cooperativeMembersRelations = relations(cooperativeMembers, ({ one }) => ({
  cooperative: one(cooperatives, {
    fields: [cooperativeMembers.cooperativeId],
    references: [cooperatives.id],
  }),
  user: one(users, {
    fields: [cooperativeMembers.userId],
    references: [users.id],
  }),
}));

export const cooperativeAccountsRelations = relations(cooperativeAccounts, ({ one, many }) => ({
  cooperative: one(cooperatives, {
    fields: [cooperativeAccounts.cooperativeId],
    references: [cooperatives.id],
  }),
  transactions: many(cooperativeTransactions),
}));

export const cooperativeTransactionsRelations = relations(cooperativeTransactions, ({ one }) => ({
  cooperative: one(cooperatives, {
    fields: [cooperativeTransactions.cooperativeId],
    references: [cooperatives.id],
  }),
  account: one(cooperativeAccounts, {
    fields: [cooperativeTransactions.accountId],
    references: [cooperativeAccounts.id],
  }),
  member: one(cooperativeMembers, {
    fields: [cooperativeTransactions.memberId],
    references: [cooperativeMembers.id],
  }),
  processedByUser: one(users, {
    fields: [cooperativeTransactions.processedBy],
    references: [users.id],
  }),
}));

export const cooperativeLoansRelations = relations(cooperativeLoans, ({ one }) => ({
  cooperative: one(cooperatives, {
    fields: [cooperativeLoans.cooperativeId],
    references: [cooperatives.id],
  }),
  approvedByUser: one(users, {
    fields: [cooperativeLoans.approvedBy],
    references: [users.id],
  }),
}));

export const cooperativeMeetingsRelations = relations(cooperativeMeetings, ({ one }) => ({
  cooperative: one(cooperatives, {
    fields: [cooperativeMeetings.cooperativeId],
    references: [cooperatives.id],
  }),
  createdByUser: one(users, {
    fields: [cooperativeMeetings.createdBy],
    references: [users.id],
  }),
}));

// Type exports
export type Cooperative = typeof cooperatives.$inferSelect;
export type NewCooperative = typeof cooperatives.$inferInsert;
export type CooperativeMember = typeof cooperativeMembers.$inferSelect;
export type NewCooperativeMember = typeof cooperativeMembers.$inferInsert;
export type CooperativeAccount = typeof cooperativeAccounts.$inferSelect;
export type NewCooperativeAccount = typeof cooperativeAccounts.$inferInsert;
export type CooperativeTransaction = typeof cooperativeTransactions.$inferSelect;
export type NewCooperativeTransaction = typeof cooperativeTransactions.$inferInsert;
export type CooperativeLoan = typeof cooperativeLoans.$inferSelect;
export type NewCooperativeLoan = typeof cooperativeLoans.$inferInsert;
export type CooperativeMeeting = typeof cooperativeMeetings.$inferSelect;
export type NewCooperativeMeeting = typeof cooperativeMeetings.$inferInsert;
