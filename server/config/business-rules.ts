/**
 * Centralized Business Rules Configuration
 * All financial thresholds, rates, and regulatory parameters are defined here
 * instead of being hardcoded in individual routers.
 * 
 * Values can be overridden via environment variables using the pattern:
 *   CONFIG_<SECTION>_<KEY>=<value>
 * 
 * In production, these should be loaded from a database configuration table
 * for hot-reloading without redeployment.
 */

import { logger } from '../logger.js';

// ============================================================================
// PENALTY TIERS (Microfinance)
// ============================================================================

export interface PenaltyTier {
  maxDaysOverdue: number;
  rate: number;
  tier: 'current' | 'grace' | 'late' | 'delinquent' | 'collections' | 'default';
  creditScoreImpact: number;
}

export const PENALTY_TIERS: PenaltyTier[] = [
  { maxDaysOverdue: 0,  rate: 0,    tier: 'current',     creditScoreImpact: 0 },
  { maxDaysOverdue: 7,  rate: parseFloat(process.env.CONFIG_PENALTY_GRACE_RATE || '0.01'),       tier: 'grace',       creditScoreImpact: 0 },
  { maxDaysOverdue: 30, rate: parseFloat(process.env.CONFIG_PENALTY_LATE_RATE || '0.02'),        tier: 'late',        creditScoreImpact: -25 },
  { maxDaysOverdue: 60, rate: parseFloat(process.env.CONFIG_PENALTY_DELINQUENT_RATE || '0.05'),  tier: 'delinquent',  creditScoreImpact: -75 },
  { maxDaysOverdue: 90, rate: parseFloat(process.env.CONFIG_PENALTY_COLLECTIONS_RATE || '0.08'), tier: 'collections', creditScoreImpact: -150 },
  { maxDaysOverdue: Infinity, rate: parseFloat(process.env.CONFIG_PENALTY_DEFAULT_RATE || '0.10'), tier: 'default', creditScoreImpact: -300 },
];

export function getPenaltyTier(daysOverdue: number): PenaltyTier {
  for (const t of PENALTY_TIERS) {
    if (daysOverdue <= t.maxDaysOverdue) return t;
  }
  return PENALTY_TIERS[PENALTY_TIERS.length - 1];
}

// ============================================================================
// CREDIT SCORE DECAY (Microfinance)
// ============================================================================

export const CREDIT_DECAY = {
  thresholdDays: parseInt(process.env.CONFIG_CREDIT_DECAY_THRESHOLD_DAYS || '90', 10),
  ratePerDay: parseFloat(process.env.CONFIG_CREDIT_DECAY_RATE_PER_DAY || '0.5'),
  maxDecay: parseInt(process.env.CONFIG_CREDIT_DECAY_MAX || '50', 10),
  minimumScore: parseInt(process.env.CONFIG_CREDIT_SCORE_FLOOR || '300', 10),
};

// ============================================================================
// AML THRESHOLDS (Compliance)
// ============================================================================

export const AML_THRESHOLDS = {
  singleTransactionThreshold: {
    NGN: parseInt(process.env.CONFIG_AML_SINGLE_NGN || '5000000', 10),
    KES: parseInt(process.env.CONFIG_AML_SINGLE_KES || '1000000', 10),
    UGX: parseInt(process.env.CONFIG_AML_SINGLE_UGX || '20000000', 10),
  },
  dailyCumulativeThreshold: {
    NGN: parseInt(process.env.CONFIG_AML_DAILY_NGN || '10000000', 10),
    KES: parseInt(process.env.CONFIG_AML_DAILY_KES || '2000000', 10),
    UGX: parseInt(process.env.CONFIG_AML_DAILY_UGX || '40000000', 10),
  },
  structuringWindow: parseInt(process.env.CONFIG_AML_STRUCTURING_WINDOW_MS || String(24 * 60 * 60 * 1000), 10),
  structuringMinTransactions: parseInt(process.env.CONFIG_AML_STRUCTURING_MIN_TXN || '3', 10),
  structuringThresholdPercent: parseFloat(process.env.CONFIG_AML_STRUCTURING_PERCENT || '0.8'),
  maxDailyTransactions: parseInt(process.env.CONFIG_AML_MAX_DAILY_TXN || '20', 10),
  maxWeeklyTransactions: parseInt(process.env.CONFIG_AML_MAX_WEEKLY_TXN || '50', 10),
  rapidMovementWindowMs: parseInt(process.env.CONFIG_AML_RAPID_WINDOW_MS || String(60 * 60 * 1000), 10),
  rapidMovementMinTransactions: parseInt(process.env.CONFIG_AML_RAPID_MIN_TXN || '5', 10),
  pepThresholdMultiplier: parseFloat(process.env.CONFIG_AML_PEP_MULTIPLIER || '0.5'),
};

// ============================================================================
// IFRS PROVISION RATES (Collections)
// ============================================================================

export const PROVISION_RATES = {
  early_warning: parseFloat(process.env.CONFIG_PROVISION_EARLY_WARNING || '0.01'),
  demand_letter: parseFloat(process.env.CONFIG_PROVISION_DEMAND_LETTER || '0.05'),
  field_visit: parseFloat(process.env.CONFIG_PROVISION_FIELD_VISIT || '0.25'),
  collections_escalation: parseFloat(process.env.CONFIG_PROVISION_ESCALATION || '0.50'),
  write_off: parseFloat(process.env.CONFIG_PROVISION_WRITE_OFF || '1.00'),
};

// ============================================================================
// REGULATORY THRESHOLDS
// ============================================================================

export const REGULATORY_THRESHOLDS = {
  CBN: {
    minCAR: parseFloat(process.env.CONFIG_REG_CBN_MIN_CAR || '0.10'),
    minLiquidity: parseFloat(process.env.CONFIG_REG_CBN_MIN_LIQUIDITY || '0.30'),
    currency: 'NGN',
    reportingFrequency: 'quarterly',
  },
  CBK: {
    minCAR: parseFloat(process.env.CONFIG_REG_CBK_MIN_CAR || '0.145'),
    minLiquidity: parseFloat(process.env.CONFIG_REG_CBK_MIN_LIQUIDITY || '0.20'),
    currency: 'KES',
    reportingFrequency: 'monthly',
  },
};

// ============================================================================
// HIGH-RISK JURISDICTIONS (FATF)
// ============================================================================

const highRiskEnv = process.env.CONFIG_HIGH_RISK_JURISDICTIONS || 'MM,HT,SY,KP,IR,YE';
const mediumRiskEnv = process.env.CONFIG_MEDIUM_RISK_JURISDICTIONS || 'PK,TR,JM,PH,SS,ML';

export const HIGH_RISK_JURISDICTIONS = new Set(highRiskEnv.split(',').map(s => s.trim()));
export const MEDIUM_RISK_JURISDICTIONS = new Set(mediumRiskEnv.split(',').map(s => s.trim()));

// ============================================================================
// APP VERSION
// ============================================================================

export const APP_VERSION = process.env.APP_VERSION || process.env.npm_package_version || '1.0.0';

logger.info('[Config] Business rules loaded', {
  penaltyTiers: PENALTY_TIERS.length,
  amlCurrencies: Object.keys(AML_THRESHOLDS.singleTransactionThreshold).length,
  highRiskCountries: HIGH_RISK_JURISDICTIONS.size,
  appVersion: APP_VERSION,
});
