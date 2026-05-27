/**
 * Tiered KYC (Know Your Customer) Schema
 * Supports progressive verification levels for financial services
 */

import { pgTable, serial, varchar, text, integer, boolean, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './schema';

// KYC tier enum - progressive verification levels
export const kycTierEnum = pgEnum('kyc_tier', [
  'unverified',      // No verification - limited features
  'basic',           // Phone verified - basic features
  'standard',        // ID verified - standard features
  'enhanced',        // Full KYC - all features
  'premium',         // Premium verification - highest limits
]);

// KYC status enum
export const kycStatusEnum = pgEnum('kyc_status', [
  'pending',
  'in_review',
  'approved',
  'rejected',
  'expired',
  'suspended',
]);

// Document type enum
export const documentTypeEnum = pgEnum('document_type', [
  'national_id',
  'passport',
  'drivers_license',
  'voters_card',
  'bvn',              // Bank Verification Number (Nigeria)
  'nin',              // National Identification Number
  'utility_bill',
  'bank_statement',
  'tax_certificate',
  'business_registration',
  'selfie',
  'proof_of_address',
  'other',
]);

// User KYC profile
export const userKycProfiles = pgTable('user_kyc_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull().unique(),
  
  // Current tier and status
  currentTier: kycTierEnum('current_tier').notNull().default('unverified'),
  status: kycStatusEnum('status').notNull().default('pending'),
  
  // Verification flags
  phoneVerified: boolean('phone_verified').default(false),
  emailVerified: boolean('email_verified').default(false),
  idVerified: boolean('id_verified').default(false),
  addressVerified: boolean('address_verified').default(false),
  biometricVerified: boolean('biometric_verified').default(false),
  
  // Personal information
  legalFirstName: varchar('legal_first_name', { length: 255 }),
  legalLastName: varchar('legal_last_name', { length: 255 }),
  dateOfBirth: timestamp('date_of_birth'),
  gender: varchar('gender', { length: 20 }),
  nationality: varchar('nationality', { length: 100 }),
  
  // ID information
  primaryIdType: documentTypeEnum('primary_id_type'),
  primaryIdNumber: varchar('primary_id_number', { length: 100 }),
  primaryIdExpiry: timestamp('primary_id_expiry'),
  bvn: varchar('bvn', { length: 20 }), // Bank Verification Number
  nin: varchar('nin', { length: 20 }), // National ID Number
  
  // Address
  residentialAddress: text('residential_address'),
  city: varchar('city', { length: 255 }),
  state: varchar('state', { length: 255 }),
  country: varchar('country', { length: 100 }),
  postalCode: varchar('postal_code', { length: 20 }),
  
  // Risk assessment
  riskScore: integer('risk_score'), // 0-100
  riskLevel: varchar('risk_level', { length: 20 }), // low, medium, high
  pepStatus: boolean('pep_status').default(false), // Politically Exposed Person
  sanctionsMatch: boolean('sanctions_match').default(false),
  
  // Limits based on tier (in cents)
  dailyTransactionLimit: integer('daily_transaction_limit'),
  monthlyTransactionLimit: integer('monthly_transaction_limit'),
  singleTransactionLimit: integer('single_transaction_limit'),
  maxLoanAmount: integer('max_loan_amount'),
  
  // Dates
  lastVerificationDate: timestamp('last_verification_date'),
  nextReviewDate: timestamp('next_review_date'),
  tierUpgradeDate: timestamp('tier_upgrade_date'),
  
  // Metadata
  verificationNotes: text('verification_notes'),
  rejectionReason: text('rejection_reason'),
  
  // Audit
  verifiedBy: integer('verified_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// KYC documents
export const kycDocuments = pgTable('kyc_documents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  kycProfileId: integer('kyc_profile_id').references(() => userKycProfiles.id).notNull(),
  
  // Document details
  documentType: documentTypeEnum('document_type').notNull(),
  documentNumber: varchar('document_number', { length: 100 }),
  issuingCountry: varchar('issuing_country', { length: 100 }),
  issueDate: timestamp('issue_date'),
  expiryDate: timestamp('expiry_date'),
  
  // File storage
  fileUrl: varchar('file_url', { length: 500 }).notNull(),
  fileName: varchar('file_name', { length: 255 }),
  fileSize: integer('file_size'),
  mimeType: varchar('mime_type', { length: 100 }),
  
  // Verification
  status: kycStatusEnum('status').notNull().default('pending'),
  verificationResult: jsonb('verification_result'), // OCR/AI verification results
  manualReviewRequired: boolean('manual_review_required').default(false),
  
  // Metadata
  notes: text('notes'),
  rejectionReason: text('rejection_reason'),
  
  // Audit
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  reviewedAt: timestamp('reviewed_at'),
  reviewedBy: integer('reviewed_by').references(() => users.id),
});

// KYC verification history
export const kycVerificationHistory = pgTable('kyc_verification_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  kycProfileId: integer('kyc_profile_id').references(() => userKycProfiles.id).notNull(),
  
  // Change details
  previousTier: kycTierEnum('previous_tier'),
  newTier: kycTierEnum('new_tier'),
  previousStatus: kycStatusEnum('previous_status'),
  newStatus: kycStatusEnum('new_status'),
  
  // Action
  action: varchar('action', { length: 100 }).notNull(), // tier_upgrade, tier_downgrade, status_change, document_verified, etc.
  reason: text('reason'),
  
  // Metadata
  metadata: jsonb('metadata'),
  
  // Audit
  performedBy: integer('performed_by').references(() => users.id),
  performedAt: timestamp('performed_at').defaultNow().notNull(),
  ipAddress: varchar('ip_address', { length: 50 }),
});

// KYC tier limits configuration
export const kycTierLimits = pgTable('kyc_tier_limits', {
  id: serial('id').primaryKey(),
  tier: kycTierEnum('tier').notNull().unique(),
  
  // Transaction limits (in cents)
  dailyTransactionLimit: integer('daily_transaction_limit').notNull(),
  monthlyTransactionLimit: integer('monthly_transaction_limit').notNull(),
  singleTransactionLimit: integer('single_transaction_limit').notNull(),
  
  // Loan limits (in cents)
  maxLoanAmount: integer('max_loan_amount').notNull(),
  maxLoanTerm: integer('max_loan_term').notNull(), // In months
  
  // Feature access
  canTrade: boolean('can_trade').default(false),
  canLend: boolean('can_lend').default(false),
  canBorrow: boolean('can_borrow').default(false),
  canWithdraw: boolean('can_withdraw').default(false),
  canTransferInternational: boolean('can_transfer_international').default(false),
  
  // Requirements
  requiredDocuments: text('required_documents'), // JSON array of document types
  requiresManualReview: boolean('requires_manual_review').default(false),
  
  // Metadata
  description: text('description'),
  isActive: boolean('is_active').default(true),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const userKycProfilesRelations = relations(userKycProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [userKycProfiles.userId],
    references: [users.id],
  }),
  documents: many(kycDocuments),
  history: many(kycVerificationHistory),
  verifiedByUser: one(users, {
    fields: [userKycProfiles.verifiedBy],
    references: [users.id],
  }),
}));

export const kycDocumentsRelations = relations(kycDocuments, ({ one }) => ({
  user: one(users, {
    fields: [kycDocuments.userId],
    references: [users.id],
  }),
  kycProfile: one(userKycProfiles, {
    fields: [kycDocuments.kycProfileId],
    references: [userKycProfiles.id],
  }),
  reviewedByUser: one(users, {
    fields: [kycDocuments.reviewedBy],
    references: [users.id],
  }),
}));

export const kycVerificationHistoryRelations = relations(kycVerificationHistory, ({ one }) => ({
  user: one(users, {
    fields: [kycVerificationHistory.userId],
    references: [users.id],
  }),
  kycProfile: one(userKycProfiles, {
    fields: [kycVerificationHistory.kycProfileId],
    references: [userKycProfiles.id],
  }),
  performedByUser: one(users, {
    fields: [kycVerificationHistory.performedBy],
    references: [users.id],
  }),
}));

// Type exports
export type UserKycProfile = typeof userKycProfiles.$inferSelect;
export type NewUserKycProfile = typeof userKycProfiles.$inferInsert;
export type KycDocument = typeof kycDocuments.$inferSelect;
export type NewKycDocument = typeof kycDocuments.$inferInsert;
export type KycVerificationHistory = typeof kycVerificationHistory.$inferSelect;
export type NewKycVerificationHistory = typeof kycVerificationHistory.$inferInsert;
export type KycTierLimit = typeof kycTierLimits.$inferSelect;
export type NewKycTierLimit = typeof kycTierLimits.$inferInsert;
