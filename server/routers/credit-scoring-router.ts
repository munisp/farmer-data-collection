/**
 * Credit Scoring Router
 * Transparent, explainable credit scoring for smallholder farmers
 */

import { router, protectedProcedure } from '../_core/trpc-base.js';
import { z } from 'zod';
import { getDb } from '../db.js';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  creditScores,
  creditScoreFactors,
  creditScoreHistory,
  repaymentRecords,
  incomeRecords,
  creditScoreModels,
} from '../../drizzle/credit-scoring-schema.js';

// Credit band thresholds
const BAND_THRESHOLDS = {
  A: 800,  // 800-1000
  B: 650,  // 650-799
  C: 500,  // 500-649
  D: 350,  // 350-499
  E: 0,    // 0-349
};

// Factor weights (default model)
const DEFAULT_FACTOR_WEIGHTS = {
  repayment_history: 0.30,
  income_stability: 0.20,
  yield_consistency: 0.15,
  cooperative_membership: 0.10,
  asset_ownership: 0.10,
  farming_experience: 0.05,
  crop_diversification: 0.05,
  savings_behavior: 0.05,
};

function getBandFromScore(score: number): 'A' | 'B' | 'C' | 'D' | 'E' | 'NR' {
  if (score >= BAND_THRESHOLDS.A) return 'A';
  if (score >= BAND_THRESHOLDS.B) return 'B';
  if (score >= BAND_THRESHOLDS.C) return 'C';
  if (score >= BAND_THRESHOLDS.D) return 'D';
  return 'E';
}

function calculateRepaymentScore(repayments: { status: string }[]): number {
  if (repayments.length === 0) return 50;
  const onTimeCount = repayments.filter(r => r.status === 'on_time').length;
  const lateCount = repayments.filter(r => r.status === 'late').length;
  const score = Math.round((onTimeCount * 100 + lateCount * 50) / repayments.length);
  return Math.min(100, Math.max(0, score));
}

function calculateIncomeScore(incomes: { isVerified: boolean | null }[]): number {
  if (incomes.length === 0) return 40;
  const baseScore = Math.min(60, incomes.length * 10);
  const verifiedCount = incomes.filter(i => i.isVerified).length;
  const verifiedBonus = Math.min(40, verifiedCount * 10);
  return Math.min(100, baseScore + verifiedBonus);
}

function calculateLoanLimit(score: number): number {
  if (score >= 800) return 5000000;
  if (score >= 650) return 2000000;
  if (score >= 500) return 1000000;
  if (score >= 350) return 500000;
  return 100000;
}

function calculateTermMonths(band: string): number {
  switch (band) {
    case 'A': return 24;
    case 'B': return 18;
    case 'C': return 12;
    case 'D': return 6;
    default: return 3;
  }
}

function calculateInterestRate(band: string): number {
  switch (band) {
    case 'A': return 12;
    case 'B': return 15;
    case 'C': return 18;
    case 'D': return 22;
    default: return 25;
  }
}

export const creditScoringRouter = router({
  // Get user's current credit score
  getScore: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [score] = await db
        .select()
        .from(creditScores)
        .where(and(
          eq(creditScores.userId, input.userId),
          eq(creditScores.isActive, true)
        ))
        .orderBy(desc(creditScores.calculatedAt))
        .limit(1);
      
      if (!score) {
        return null;
      }
      
      // Get factors
      const factors = await db
        .select()
        .from(creditScoreFactors)
        .where(eq(creditScoreFactors.creditScoreId, score.id))
        .orderBy(desc(creditScoreFactors.contribution));
      
      return {
        ...score,
        factors,
      };
    }),

  // Calculate credit score for user
  calculateScore: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Get repayment history
      const repayments = await db
        .select()
        .from(repaymentRecords)
        .where(eq(repaymentRecords.userId, input.userId));
      
      // Get income records
      const incomes = await db
        .select()
        .from(incomeRecords)
        .where(eq(incomeRecords.userId, input.userId));
      
      // Calculate component scores
      const repaymentScore = calculateRepaymentScore(repayments);
      const incomeScore = calculateIncomeScore(incomes);
      
      // Default baseline scores — these improve as more farmer data is collected
      const yieldScore = 65;
      const cooperativeScore = 60;
      const assetScore = 55;
      const behaviorScore = 65;
      
      // Calculate weighted total score
      const totalScore = Math.round(
        repaymentScore * DEFAULT_FACTOR_WEIGHTS.repayment_history * 10 +
        incomeScore * DEFAULT_FACTOR_WEIGHTS.income_stability * 10 +
        yieldScore * DEFAULT_FACTOR_WEIGHTS.yield_consistency * 10 +
        cooperativeScore * DEFAULT_FACTOR_WEIGHTS.cooperative_membership * 10 +
        assetScore * DEFAULT_FACTOR_WEIGHTS.asset_ownership * 10 +
        behaviorScore * DEFAULT_FACTOR_WEIGHTS.savings_behavior * 10 +
        60 * DEFAULT_FACTOR_WEIGHTS.farming_experience * 10 +
        55 * DEFAULT_FACTOR_WEIGHTS.crop_diversification * 10
      );
      
      const band = getBandFromScore(totalScore);
      
      // Deactivate previous scores
      await db
        .update(creditScores)
        .set({ isActive: false })
        .where(eq(creditScores.userId, input.userId));
      
      // Create new score
      const [newScore] = await db
        .insert(creditScores)
        .values({
          userId: input.userId,
          score: totalScore,
          band,
          repaymentScore,
          incomeScore,
          yieldScore,
          cooperativeScore,
          assetScore,
          behaviorScore,
          probabilityOfDefault: String((100 - totalScore / 10) / 100),
          recommendedLoanLimit: calculateLoanLimit(totalScore),
          recommendedTermMonths: calculateTermMonths(band),
          recommendedInterestRate: String(calculateInterestRate(band)),
          dataCompleteness: Math.min(100, repayments.length * 10 + incomes.length * 10),
          confidenceLevel: repayments.length >= 6 ? 'high' : repayments.length >= 3 ? 'medium' : 'low',
          modelVersion: '1.0.0',
          isActive: true,
        })
        .returning();
      
      // Create factor explanations
      const factorData = [
        {
          creditScoreId: newScore.id,
          factorType: 'repayment_history' as const,
          factorName: 'Repayment History',
          rawValue: `${repayments.length} payments`,
          normalizedScore: repaymentScore,
          weight: String(DEFAULT_FACTOR_WEIGHTS.repayment_history),
          contribution: Math.round(repaymentScore * DEFAULT_FACTOR_WEIGHTS.repayment_history * 10),
          impact: repaymentScore >= 70 ? 'positive' : repaymentScore >= 50 ? 'neutral' : 'negative',
          explanation: `Based on ${repayments.length} recorded payments.`,
          recommendation: repaymentScore < 70 ? 'Make payments on time to improve this score.' : 'Keep up the good payment habits.',
        },
        {
          creditScoreId: newScore.id,
          factorType: 'income_stability' as const,
          factorName: 'Income Stability',
          rawValue: `${incomes.length} income records`,
          normalizedScore: incomeScore,
          weight: String(DEFAULT_FACTOR_WEIGHTS.income_stability),
          contribution: Math.round(incomeScore * DEFAULT_FACTOR_WEIGHTS.income_stability * 10),
          impact: incomeScore >= 70 ? 'positive' : incomeScore >= 50 ? 'neutral' : 'negative',
          explanation: `Based on ${incomes.length} recorded income sources.`,
          recommendation: incomeScore < 70 ? 'Record more harvest sales and income sources.' : 'Keep recording income consistently.',
        },
      ];
      
      await db.insert(creditScoreFactors).values(factorData);
      
      // Record in history
      await db.insert(creditScoreHistory).values({
        userId: input.userId,
        score: totalScore,
        band,
        triggerEvent: 'manual_calculation',
        changeReason: 'Credit score calculated',
      });
      
      return {
        ...newScore,
        factors: factorData,
      };
    }),

  // Get score history
  getHistory: protectedProcedure
    .input(z.object({
      userId: z.number(),
      limit: z.number().default(12),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const history = await db
        .select()
        .from(creditScoreHistory)
        .where(eq(creditScoreHistory.userId, input.userId))
        .orderBy(desc(creditScoreHistory.snapshotDate))
        .limit(input.limit);
      
      return history;
    }),

  // Record repayment
  recordRepayment: protectedProcedure
    .input(z.object({
      userId: z.number(),
      loanId: z.number().optional(),
      dueDate: z.string(),
      paidDate: z.string().optional(),
      amountDue: z.number(),
      amountPaid: z.number().optional(),
      status: z.enum(['on_time', 'late', 'missed', 'partial']),
      daysLate: z.number().default(0),
      source: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [record] = await db
        .insert(repaymentRecords)
        .values({
          ...input,
          dueDate: new Date(input.dueDate),
          paidDate: input.paidDate ? new Date(input.paidDate) : undefined,
        })
        .returning();
      
      return record;
    }),

  // Record income
  recordIncome: protectedProcedure
    .input(z.object({
      userId: z.number(),
      incomeType: z.string(),
      amount: z.number(),
      currency: z.string().default('NGN'),
      incomeDate: z.string(),
      isVerified: z.boolean().default(false),
      verificationSource: z.string().optional(),
      referenceType: z.string().optional(),
      referenceId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [record] = await db
        .insert(incomeRecords)
        .values({
          ...input,
          incomeDate: new Date(input.incomeDate),
        })
        .returning();
      
      return record;
    }),

  // Get repayment records
  getRepaymentRecords: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const records = await db
        .select()
        .from(repaymentRecords)
        .where(eq(repaymentRecords.userId, input.userId))
        .orderBy(desc(repaymentRecords.dueDate));
      
      return records;
    }),

  // Get income records
  getIncomeRecords: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const records = await db
        .select()
        .from(incomeRecords)
        .where(eq(incomeRecords.userId, input.userId))
        .orderBy(desc(incomeRecords.incomeDate));
      
      return records;
    }),

  // Get credit score models
  getModels: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const models = await db
        .select()
        .from(creditScoreModels)
        .orderBy(desc(creditScoreModels.createdAt));
      
      return models;
    }),

  // Get band thresholds and limits
  getBandInfo: protectedProcedure
    .query(async () => {
      return {
        bands: [
          { band: 'A', minScore: 800, maxScore: 1000, label: 'Excellent', color: 'green', loanLimit: 5000000, maxTerm: 24, interestRate: 12 },
          { band: 'B', minScore: 650, maxScore: 799, label: 'Good', color: 'blue', loanLimit: 2000000, maxTerm: 18, interestRate: 15 },
          { band: 'C', minScore: 500, maxScore: 649, label: 'Fair', color: 'yellow', loanLimit: 1000000, maxTerm: 12, interestRate: 18 },
          { band: 'D', minScore: 350, maxScore: 499, label: 'Poor', color: 'orange', loanLimit: 500000, maxTerm: 6, interestRate: 22 },
          { band: 'E', minScore: 0, maxScore: 349, label: 'Very Poor', color: 'red', loanLimit: 100000, maxTerm: 3, interestRate: 25 },
          { band: 'NR', minScore: null, maxScore: null, label: 'Not Rated', color: 'gray', loanLimit: 0, maxTerm: 0, interestRate: null },
        ],
        factors: Object.entries(DEFAULT_FACTOR_WEIGHTS).map(([key, weight]) => ({
          key,
          name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          weight: weight * 100,
        })),
      };
    }),
});
