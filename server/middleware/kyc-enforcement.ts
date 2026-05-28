/**
 * KYC Enforcement Middleware
 * Enforces KYC tier requirements on financial operations
 */

import { TRPCError } from '@trpc/server';
import { createKycService, type KycTier } from '../services/kyc-service.js';
import { getDb } from '../db.js';
import { userKycProfiles } from '../../drizzle/kyc-schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

const kycService = createKycService();

// KYC tier requirements for different operations
export const KYC_REQUIREMENTS = {
  // Loan operations
  loan: {
    apply: 'standard' as KycTier,
    approve: 'standard' as KycTier,
    disburse: 'standard' as KycTier,
  },
  // Trading operations
  trade: {
    buy: 'basic' as KycTier,
    sell: 'basic' as KycTier,
    exchange: 'standard' as KycTier,
  },
  // Wallet operations
  wallet: {
    deposit: 'basic' as KycTier,
    withdraw: 'basic' as KycTier,
    transfer: 'basic' as KycTier,
    internationalTransfer: 'enhanced' as KycTier,
  },
  // Marketplace operations
  marketplace: {
    browse: 'unverified' as KycTier,
    buy: 'basic' as KycTier,
    sell: 'standard' as KycTier,
  },
};

// Amount limits by tier (in cents/smallest currency unit)
export const TIER_LIMITS = {
  unverified: {
    singleTransaction: 0,
    dailyLimit: 0,
    monthlyLimit: 0,
    maxLoanAmount: 0,
  },
  basic: {
    singleTransaction: 5000000, 
    dailyLimit: 10000000, 
    monthlyLimit: 50000000, 
    maxLoanAmount: 1000000, 
  },
  standard: {
    singleTransaction: 20000000, 
    dailyLimit: 50000000, 
    monthlyLimit: 200000000, 
    maxLoanAmount: 10000000, 
  },
  enhanced: {
    singleTransaction: 50000000, 
    dailyLimit: 100000000, 
    monthlyLimit: 500000000, 
    maxLoanAmount: 50000000, 
  },
  premium: {
    singleTransaction: 200000000, 
    dailyLimit: 500000000, 
    monthlyLimit: 2000000000, 
    maxLoanAmount: 200000000, 
  },
};

// Tier hierarchy for comparison
const TIER_HIERARCHY: Record<KycTier, number> = {
  unverified: 0,
  basic: 1,
  standard: 2,
  enhanced: 3,
  premium: 4,
};

/**
 * Check if user's tier meets the required tier
 */
export function meetsTierRequirement(userTier: KycTier, requiredTier: KycTier): boolean {
  return TIER_HIERARCHY[userTier] >= TIER_HIERARCHY[requiredTier];
}

/**
 * Get user's KYC profile from database
 * Returns real KYC data for the user
 */
export async function getUserKycProfile(userId: number): Promise<{
  tier: KycTier;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  phoneVerified: boolean;
  emailVerified: boolean;
  idVerified: boolean;
  sanctionsCleared: boolean;
  pepStatus: boolean;
}> {
  const db = await getDb();
  
  if (!db) {
    // Fallback to unverified if database unavailable
    logger.warn('[KYC] Database unavailable, returning unverified profile');
    return {
      tier: 'unverified',
      status: 'pending',
      phoneVerified: false,
      emailVerified: false,
      idVerified: false,
      sanctionsCleared: true,
      pepStatus: false,
    };
  }

  // Query the real KYC profile from database
  const [profile] = await db
    .select()
    .from(userKycProfiles)
    .where(eq(userKycProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    // No KYC profile exists - return unverified defaults
    return {
      tier: 'unverified',
      status: 'pending',
      phoneVerified: false,
      emailVerified: false,
      idVerified: false,
      sanctionsCleared: true,
      pepStatus: false,
    };
  }

  // Map database status to expected type
  const statusMap: Record<string, 'pending' | 'approved' | 'rejected' | 'suspended'> = {
    'pending': 'pending',
    'in_review': 'pending',
    'approved': 'approved',
    'rejected': 'rejected',
    'expired': 'rejected',
    'suspended': 'suspended',
  };

  return {
    tier: (profile.currentTier as KycTier) || 'unverified',
    status: statusMap[profile.status] || 'pending',
    phoneVerified: profile.phoneVerified || false,
    emailVerified: profile.emailVerified || false,
    idVerified: profile.idVerified || false,
    sanctionsCleared: !profile.sanctionsMatch, // sanctionsMatch=true means NOT cleared
    pepStatus: profile.pepStatus || false,
  };
}

/**
 * Enforce KYC requirements for an operation
 */
export async function enforceKycRequirement(
  userId: number,
  operation: keyof typeof KYC_REQUIREMENTS,
  action: string,
  amount?: number
): Promise<void> {
  const profile = await getUserKycProfile(userId);

  // Check if KYC is approved
  if (profile.status !== 'approved') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Your KYC verification is ${profile.status}. Please complete KYC verification to continue.`,
    });
  }

  // Check sanctions
  if (!profile.sanctionsCleared) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Your account is under review. Please contact support.',
    });
  }

  // Get required tier for operation
  const operationRequirements = KYC_REQUIREMENTS[operation];
  const requiredTier = (operationRequirements as Record<string, KycTier>)[action];

  if (!requiredTier) {
    // No specific requirement, allow
    return;
  }

  // Check tier requirement
  if (!meetsTierRequirement(profile.tier, requiredTier)) {
    const tierNames: Record<KycTier, string> = {
      unverified: 'Unverified',
      basic: 'Basic',
      standard: 'Standard',
      enhanced: 'Enhanced',
      premium: 'Premium',
    };

    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `This operation requires ${tierNames[requiredTier]} KYC verification. Your current tier is ${tierNames[profile.tier]}. Please upgrade your KYC to continue.`,
    });
  }

  // Check amount limits if applicable
  if (amount !== undefined && amount > 0) {
    const limits = TIER_LIMITS[profile.tier];

    if (amount > limits.singleTransaction) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Transaction amount exceeds your tier limit. Maximum single transaction: ${(limits.singleTransaction / 100).toLocaleString()} platform currency. Please upgrade your KYC for higher limits.`,
      });
    }

    // For loans, check max loan amount
    if (operation === 'loan' && amount > limits.maxLoanAmount) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Loan amount exceeds your tier limit. Maximum loan amount: ${(limits.maxLoanAmount / 100).toLocaleString()} platform currency. Please upgrade your KYC for higher limits.`,
      });
    }
  }
}

/**
 * Create a KYC enforcement wrapper for tRPC procedures
 */
export function withKycEnforcement<T>(
  operation: keyof typeof KYC_REQUIREMENTS,
  action: string,
  getAmount?: (input: T) => number | undefined
) {
  return async (userId: number, input: T): Promise<void> => {
    const amount = getAmount ? getAmount(input) : undefined;
    await enforceKycRequirement(userId, operation, action, amount);
  };
}

/**
 * Middleware to check KYC before loan application
 */
export async function checkLoanApplicationKyc(
  userId: number,
  loanAmount: number
): Promise<{ allowed: boolean; reason?: string; requiredTier?: KycTier }> {
  try {
    await enforceKycRequirement(userId, 'loan', 'apply', loanAmount);
    return { allowed: true };
  } catch (error) {
    if (error instanceof TRPCError) {
      return {
        allowed: false,
        reason: error.message,
        requiredTier: 'standard',
      };
    }
    throw error;
  }
}

/**
 * Middleware to check KYC before loan disbursement
 */
export async function checkLoanDisbursementKyc(
  userId: number,
  disbursementAmount: number
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    await enforceKycRequirement(userId, 'loan', 'disburse', disbursementAmount);
    return { allowed: true };
  } catch (error) {
    if (error instanceof TRPCError) {
      return { allowed: false, reason: error.message };
    }
    throw error;
  }
}

/**
 * Middleware to check KYC before loan repayment
 */
export async function checkLoanRepaymentKyc(
  userId: number,
  repaymentAmount: number
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Repayments use basic tier - we want to allow users to pay back loans
    // even if their KYC has lapsed, but still enforce basic verification
    const profile = await getUserKycProfile(userId);
    
    if (profile.status === 'suspended') {
      return { 
        allowed: false, 
        reason: 'Your account is suspended. Please contact support to make repayments.' 
      };
    }
    
    // Allow repayments for basic tier and above
    if (!meetsTierRequirement(profile.tier, 'basic')) {
      return {
        allowed: false,
        reason: 'Basic KYC verification required for loan repayments. Please complete KYC verification.',
      };
    }
    
    // Check amount limits
    const limits = TIER_LIMITS[profile.tier];
    if (repaymentAmount > limits.singleTransaction) {
      return {
        allowed: false,
        reason: `Repayment amount exceeds your tier limit. Maximum: ${(limits.singleTransaction / 100).toLocaleString()} platform currency.`,
      };
    }
    
    return { allowed: true };
  } catch (error) {
    if (error instanceof TRPCError) {
      return { allowed: false, reason: error.message };
    }
    throw error;
  }
}

/**
 * Middleware to check KYC before trading
 */
export async function checkTradingKyc(
  userId: number,
  tradeType: 'buy' | 'sell' | 'exchange',
  amount: number
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    await enforceKycRequirement(userId, 'trade', tradeType, amount);
    return { allowed: true };
  } catch (error) {
    if (error instanceof TRPCError) {
      return { allowed: false, reason: error.message };
    }
    throw error;
  }
}

/**
 * Middleware to check KYC before wallet operations
 */
export async function checkWalletKyc(
  userId: number,
  operation: 'deposit' | 'withdraw' | 'transfer' | 'internationalTransfer',
  amount: number
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    await enforceKycRequirement(userId, 'wallet', operation, amount);
    return { allowed: true };
  } catch (error) {
    if (error instanceof TRPCError) {
      return { allowed: false, reason: error.message };
    }
    throw error;
  }
}

/**
 * Get user's current limits based on KYC tier
 */
export async function getUserLimits(userId: number): Promise<{
  tier: KycTier;
  limits: typeof TIER_LIMITS[KycTier];
  usedToday: number;
  usedThisMonth: number;
  remainingDaily: number;
  remainingMonthly: number;
}> {
  const profile = await getUserKycProfile(userId);
  const limits = TIER_LIMITS[profile.tier];

  // In production, calculate used amounts from transaction history
  const usedToday = 0;
  const usedThisMonth = 0;

  return {
    tier: profile.tier,
    limits,
    usedToday,
    usedThisMonth,
    remainingDaily: limits.dailyLimit - usedToday,
    remainingMonthly: limits.monthlyLimit - usedThisMonth,
  };
}

/**
 * Check if user needs to upgrade KYC for a specific amount
 */
export function getRequiredTierForAmount(
  amount: number,
  operationType: 'transaction' | 'loan'
): KycTier {
  const tiers: KycTier[] = ['basic', 'standard', 'enhanced', 'premium'];

  for (const tier of tiers) {
    const limits = TIER_LIMITS[tier];
    const limit = operationType === 'loan' ? limits.maxLoanAmount : limits.singleTransaction;
    
    if (amount <= limit) {
      return tier;
    }
  }

  return 'premium';
}

export default {
  enforceKycRequirement,
  checkLoanApplicationKyc,
  checkLoanDisbursementKyc,
  checkLoanRepaymentKyc,
  checkTradingKyc,
  checkWalletKyc,
  getUserLimits,
  getRequiredTierForAmount,
  meetsTierRequirement,
  KYC_REQUIREMENTS,
  TIER_LIMITS,
};
