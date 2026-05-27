/**
 * Credit Scoring Engine Schema
 * Transparent, explainable credit scoring for smallholder farmers
 */

import { pgTable, serial, varchar, text, integer, decimal, boolean, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './schema';

// Credit band enum
export const creditBandEnum = pgEnum('credit_band', [
  'A',    // Excellent - lowest risk
  'B',    // Good - low risk
  'C',    // Fair - moderate risk
  'D',    // Poor - high risk
  'E',    // Very Poor - very high risk
  'NR',   // Not Rated - insufficient data
]);

// Score factor type enum
export const scoreFactorTypeEnum = pgEnum('score_factor_type', [
  'repayment_history',
  'income_stability',
  'yield_consistency',
  'cooperative_membership',
  'asset_ownership',
  'farming_experience',
  'crop_diversification',
  'market_access',
  'insurance_coverage',
  'savings_behavior',
  'debt_burden',
  'age_factor',
  'education',
  'technology_adoption',
]);

// Credit scores table
export const creditScores = pgTable('credit_scores', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  
  // Overall score
  score: integer('score').notNull(), // 0-1000
  band: creditBandEnum('band').notNull(),
  
  // Component scores (0-100 each)
  repaymentScore: integer('repayment_score'),
  incomeScore: integer('income_score'),
  yieldScore: integer('yield_score'),
  cooperativeScore: integer('cooperative_score'),
  assetScore: integer('asset_score'),
  behaviorScore: integer('behavior_score'),
  
  // Risk metrics
  probabilityOfDefault: decimal('probability_of_default', { precision: 5, scale: 4 }), // 0.0000 to 1.0000
  expectedLoss: integer('expected_loss'), // In cents
  
  // Recommended limits (in cents)
  recommendedLoanLimit: integer('recommended_loan_limit'),
  recommendedTermMonths: integer('recommended_term_months'),
  recommendedInterestRate: decimal('recommended_interest_rate', { precision: 5, scale: 2 }),
  
  // Data quality
  dataCompleteness: integer('data_completeness'), // 0-100 percentage
  confidenceLevel: varchar('confidence_level', { length: 20 }), // low, medium, high
  
  // Validity
  validFrom: timestamp('valid_from').defaultNow().notNull(),
  validUntil: timestamp('valid_until'),
  isActive: boolean('is_active').default(true),
  
  // Metadata
  modelVersion: varchar('model_version', { length: 50 }),
  calculatedAt: timestamp('calculated_at').defaultNow().notNull(),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Credit score factors (explainability)
export const creditScoreFactors = pgTable('credit_score_factors', {
  id: serial('id').primaryKey(),
  creditScoreId: integer('credit_score_id').references(() => creditScores.id).notNull(),
  
  // Factor details
  factorType: scoreFactorTypeEnum('factor_type').notNull(),
  factorName: varchar('factor_name', { length: 255 }).notNull(),
  
  // Impact
  rawValue: varchar('raw_value', { length: 255 }), // The actual data value
  normalizedScore: integer('normalized_score'), // 0-100
  weight: decimal('weight', { precision: 5, scale: 4 }), // Factor weight in model
  contribution: integer('contribution'), // Points contributed to total score
  
  // Direction
  impact: varchar('impact', { length: 20 }).notNull(), // positive, negative, neutral
  
  // Explanation
  explanation: text('explanation'), // Human-readable explanation
  recommendation: text('recommendation'), // How to improve this factor
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Credit score history
export const creditScoreHistory = pgTable('credit_score_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  
  // Score snapshot
  score: integer('score').notNull(),
  band: creditBandEnum('band').notNull(),
  
  // Change from previous
  previousScore: integer('previous_score'),
  scoreChange: integer('score_change'),
  bandChange: varchar('band_change', { length: 10 }), // upgrade, downgrade, same
  
  // Reason for change
  changeReason: text('change_reason'),
  triggerEvent: varchar('trigger_event', { length: 100 }), // loan_repayment, harvest_recorded, etc.
  
  // Snapshot date
  snapshotDate: timestamp('snapshot_date').defaultNow().notNull(),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Repayment history (for scoring)
export const repaymentRecords = pgTable('repayment_records', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  loanId: integer('loan_id'),
  
  // Payment details
  dueDate: timestamp('due_date').notNull(),
  paidDate: timestamp('paid_date'),
  amountDue: integer('amount_due').notNull(), // In cents
  amountPaid: integer('amount_paid'), // In cents
  
  // Status
  status: varchar('status', { length: 20 }).notNull(), // on_time, late, missed, partial
  daysLate: integer('days_late').default(0),
  
  // Source
  source: varchar('source', { length: 50 }), // internal, external_bureau, cooperative
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Income records (for scoring)
export const incomeRecords = pgTable('income_records', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  
  // Income details
  incomeType: varchar('income_type', { length: 50 }).notNull(), // harvest_sale, livestock_sale, off_farm, remittance
  amount: integer('amount').notNull(), // In cents
  currency: varchar('currency', { length: 10 }).default('NGN'),
  
  // Period
  incomeDate: timestamp('income_date').notNull(),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  
  // Verification
  isVerified: boolean('is_verified').default(false),
  verificationSource: varchar('verification_source', { length: 100 }),
  
  // Reference
  referenceType: varchar('reference_type', { length: 50 }), // harvest, order, etc.
  referenceId: integer('reference_id'),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Credit score model configuration
export const creditScoreModels = pgTable('credit_score_models', {
  id: serial('id').primaryKey(),
  
  // Model identification
  modelName: varchar('model_name', { length: 100 }).notNull(),
  modelVersion: varchar('model_version', { length: 50 }).notNull(),
  
  // Configuration
  factorWeights: jsonb('factor_weights').notNull(), // JSON object with factor -> weight mapping
  bandThresholds: jsonb('band_thresholds').notNull(), // JSON object with band -> min_score mapping
  
  // Validation
  validationMetrics: jsonb('validation_metrics'), // AUC, Gini, KS, etc.
  
  // Status
  isActive: boolean('is_active').default(false),
  activatedAt: timestamp('activated_at'),
  deactivatedAt: timestamp('deactivated_at'),
  
  // Metadata
  description: text('description'),
  changelog: text('changelog'),
  
  // Audit
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const creditScoresRelations = relations(creditScores, ({ one, many }) => ({
  user: one(users, {
    fields: [creditScores.userId],
    references: [users.id],
  }),
  factors: many(creditScoreFactors),
}));

export const creditScoreFactorsRelations = relations(creditScoreFactors, ({ one }) => ({
  creditScore: one(creditScores, {
    fields: [creditScoreFactors.creditScoreId],
    references: [creditScores.id],
  }),
}));

export const creditScoreHistoryRelations = relations(creditScoreHistory, ({ one }) => ({
  user: one(users, {
    fields: [creditScoreHistory.userId],
    references: [users.id],
  }),
}));

export const repaymentRecordsRelations = relations(repaymentRecords, ({ one }) => ({
  user: one(users, {
    fields: [repaymentRecords.userId],
    references: [users.id],
  }),
}));

export const incomeRecordsRelations = relations(incomeRecords, ({ one }) => ({
  user: one(users, {
    fields: [incomeRecords.userId],
    references: [users.id],
  }),
}));

export const creditScoreModelsRelations = relations(creditScoreModels, ({ one }) => ({
  createdByUser: one(users, {
    fields: [creditScoreModels.createdBy],
    references: [users.id],
  }),
}));

// Type exports
export type CreditScore = typeof creditScores.$inferSelect;
export type NewCreditScore = typeof creditScores.$inferInsert;
export type CreditScoreFactor = typeof creditScoreFactors.$inferSelect;
export type NewCreditScoreFactor = typeof creditScoreFactors.$inferInsert;
export type CreditScoreHistory = typeof creditScoreHistory.$inferSelect;
export type NewCreditScoreHistory = typeof creditScoreHistory.$inferInsert;
export type RepaymentRecord = typeof repaymentRecords.$inferSelect;
export type NewRepaymentRecord = typeof repaymentRecords.$inferInsert;
export type IncomeRecord = typeof incomeRecords.$inferSelect;
export type NewIncomeRecord = typeof incomeRecords.$inferInsert;
export type CreditScoreModel = typeof creditScoreModels.$inferSelect;
export type NewCreditScoreModel = typeof creditScoreModels.$inferInsert;
