/**
 * Portfolio Stress Testing & Interest Rate Curve Router
 *
 * Provides:
 *   - Yield curve construction (term structure of interest rates)
 *   - Portfolio stress testing (base/adverse/severe scenarios)
 *   - Sensitivity analysis (rate shocks, default shocks, FX shocks)
 *   - Expected loss modeling (PD × LGD × EAD)
 *   - Capital adequacy impact assessment
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { loans, loanRepayments, creditScores } from "../../drizzle/financial-schema.js";
import { auditLogs } from "../../drizzle/schema.js";
import { TRPCError } from "@trpc/server";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";

// ============================================================================
// YIELD CURVE & RATE MODELS
// ============================================================================

// Base rates by tenor (CBN-aligned, in basis points)
const BASE_RATE_CURVE_BPS: Record<number, number> = {
  1: 1400,   // 1 month: 14.00%
  3: 1500,   // 3 months: 15.00%
  6: 1650,   // 6 months: 16.50%
  12: 1800,  // 12 months: 18.00%
  18: 1900,  // 18 months: 19.00%
  24: 2000,  // 24 months: 20.00%
  36: 2150,  // 36 months: 21.50%
  48: 2250,  // 48 months: 22.50%
  60: 2350,  // 60 months: 23.50%
};

// Credit spread by risk band (additional bps over base rate)
const CREDIT_SPREAD_BPS: Record<string, number> = {
  A: 0,     // Prime borrowers: no spread
  B: 150,   // Good: +1.50%
  C: 350,   // Fair: +3.50%
  D: 600,   // Subprime: +6.00%
  E: 1000,  // High-risk: +10.00%
};

// Stress scenario definitions
const STRESS_SCENARIOS = {
  base: {
    name: "Base Case",
    description: "Current economic conditions continue",
    defaultRateMultiplier: 1.0,
    lgdMultiplier: 1.0,
    rateShockBps: 0,
    gdpGrowth: 3.0,
    inflationRate: 18.0,
    fxDepreciation: 0,
    agriculturalShock: 0,
  },
  mild_adverse: {
    name: "Mild Adverse",
    description: "Moderate economic slowdown, slight rate increase",
    defaultRateMultiplier: 1.5,
    lgdMultiplier: 1.1,
    rateShockBps: 200,
    gdpGrowth: 1.5,
    inflationRate: 22.0,
    fxDepreciation: 10,
    agriculturalShock: 0.05,
  },
  adverse: {
    name: "Adverse",
    description: "Recession with elevated defaults and rate hikes",
    defaultRateMultiplier: 2.5,
    lgdMultiplier: 1.25,
    rateShockBps: 500,
    gdpGrowth: -1.0,
    inflationRate: 28.0,
    fxDepreciation: 25,
    agriculturalShock: 0.15,
  },
  severe: {
    name: "Severe",
    description: "Deep recession, crop failure, currency crisis",
    defaultRateMultiplier: 4.0,
    lgdMultiplier: 1.5,
    rateShockBps: 1000,
    gdpGrowth: -4.0,
    inflationRate: 35.0,
    fxDepreciation: 50,
    agriculturalShock: 0.30,
  },
  agricultural_crisis: {
    name: "Agricultural Crisis",
    description: "Severe drought/flood, 30%+ crop failure, commodity price collapse",
    defaultRateMultiplier: 3.0,
    lgdMultiplier: 1.4,
    rateShockBps: 300,
    gdpGrowth: 0.0,
    inflationRate: 25.0,
    fxDepreciation: 15,
    agriculturalShock: 0.35,
  },
} as const;

type StressScenario = keyof typeof STRESS_SCENARIOS;

// PD (Probability of Default) by credit band — historical estimates
const BASE_PD: Record<string, number> = {
  A: 0.01,  // 1%
  B: 0.03,  // 3%
  C: 0.08,  // 8%
  D: 0.15,  // 15%
  E: 0.30,  // 30%
};

// LGD (Loss Given Default) by loan type
const BASE_LGD: Record<string, number> = {
  input_loan: 0.45,       // 45% — partially secured by inputs
  equipment_loan: 0.35,   // 35% — secured by equipment
  working_capital: 0.55,  // 55% — unsecured
  agricultural: 0.50,     // 50% — crop-dependent
};

function interpolateRate(termMonths: number): number {
  const tenors = Object.keys(BASE_RATE_CURVE_BPS).map(Number).sort((a, b) => a - b);
  if (termMonths <= tenors[0]) return BASE_RATE_CURVE_BPS[tenors[0]];
  if (termMonths >= tenors[tenors.length - 1]) return BASE_RATE_CURVE_BPS[tenors[tenors.length - 1]];

  for (let i = 0; i < tenors.length - 1; i++) {
    if (termMonths >= tenors[i] && termMonths <= tenors[i + 1]) {
      const t0 = tenors[i], t1 = tenors[i + 1];
      const r0 = BASE_RATE_CURVE_BPS[t0], r1 = BASE_RATE_CURVE_BPS[t1];
      return Math.round(r0 + (r1 - r0) * (termMonths - t0) / (t1 - t0));
    }
  }
  return 1800; // fallback
}

function getBandFromScore(score: number): string {
  if (score >= 800) return "A";
  if (score >= 650) return "B";
  if (score >= 500) return "C";
  if (score >= 350) return "D";
  return "E";
}

// ============================================================================
// ROUTER
// ============================================================================

export const stressTestingRouter = router({
  /**
   * Get the current yield curve (term structure of interest rates).
   */
  getYieldCurve: protectedProcedure
    .input(z.object({
      creditBand: z.enum(["A", "B", "C", "D", "E"]).optional(),
      includeSpread: z.boolean().default(true),
    }))
    .query(async ({ input }) => {
      const tenors = Object.keys(BASE_RATE_CURVE_BPS).map(Number).sort((a, b) => a - b);
      const spread = input.creditBand && input.includeSpread
        ? CREDIT_SPREAD_BPS[input.creditBand] || 0
        : 0;

      const curve = tenors.map(tenor => ({
        tenorMonths: tenor,
        baseRateBps: BASE_RATE_CURVE_BPS[tenor],
        spreadBps: spread,
        allInRateBps: BASE_RATE_CURVE_BPS[tenor] + spread,
        baseRatePercent: BASE_RATE_CURVE_BPS[tenor] / 100,
        allInRatePercent: (BASE_RATE_CURVE_BPS[tenor] + spread) / 100,
      }));

      return {
        asOfDate: new Date().toISOString().split("T")[0],
        creditBand: input.creditBand || "all",
        spreadBps: spread,
        curve,
        creditSpreads: CREDIT_SPREAD_BPS,
      };
    }),

  /**
   * Price a loan using the yield curve + credit spread.
   */
  priceLoan: protectedProcedure
    .input(z.object({
      principalAmount: z.number().positive(),
      termMonths: z.number().min(1).max(60),
      creditScore: z.number().min(0).max(1000),
      loanType: z.enum(["input_loan", "equipment_loan", "working_capital", "agricultural"]).default("working_capital"),
      collateralValue: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const band = getBandFromScore(input.creditScore);
      const baseRate = interpolateRate(input.termMonths);
      const creditSpread = CREDIT_SPREAD_BPS[band] || 0;
      const allInRate = baseRate + creditSpread;

      // Collateral adjustment: reduce spread by up to 50% if collateral > 100% of principal
      const ltv = input.collateralValue > 0 ? input.principalAmount / input.collateralValue : Infinity;
      const collateralDiscount = ltv <= 0.5 ? 0.50 : ltv <= 0.75 ? 0.30 : ltv <= 1.0 ? 0.15 : 0;
      const adjustedSpread = Math.round(creditSpread * (1 - collateralDiscount));
      const finalRate = baseRate + adjustedSpread;

      // Monthly payment calculation (amortizing)
      const monthlyRate = finalRate / 10000 / 12;
      const monthlyPayment = monthlyRate > 0
        ? Math.round(input.principalAmount * monthlyRate * Math.pow(1 + monthlyRate, input.termMonths) / (Math.pow(1 + monthlyRate, input.termMonths) - 1))
        : Math.round(input.principalAmount / input.termMonths);

      const totalRepayment = monthlyPayment * input.termMonths;
      const totalInterest = totalRepayment - input.principalAmount;

      // Expected loss
      const pd = BASE_PD[band] || 0.10;
      const lgd = BASE_LGD[input.loanType] || 0.50;
      const ead = input.principalAmount;
      const expectedLoss = Math.round(pd * lgd * ead);

      return {
        pricing: {
          baseRateBps: baseRate,
          creditSpreadBps: creditSpread,
          collateralDiscountBps: creditSpread - adjustedSpread,
          finalRateBps: finalRate,
          finalRatePercent: finalRate / 100,
          monthlyPayment,
          totalRepayment,
          totalInterest,
        },
        risk: {
          creditBand: band,
          creditScore: input.creditScore,
          pd: Math.round(pd * 10000) / 100,
          lgd: Math.round(lgd * 10000) / 100,
          expectedLoss,
          expectedLossPercent: Math.round(expectedLoss / input.principalAmount * 10000) / 100,
          ltv: ltv === Infinity ? null : Math.round(ltv * 10000) / 100,
        },
        loan: {
          principal: input.principalAmount,
          termMonths: input.termMonths,
          loanType: input.loanType,
          collateralValue: input.collateralValue,
        },
      };
    }),

  /**
   * Run portfolio stress test across multiple scenarios.
   */
  runStressTest: protectedProcedure
    .input(z.object({
      scenarios: z.array(z.enum(["base", "mild_adverse", "adverse", "severe", "agricultural_crisis"])).default(["base", "adverse", "severe"]),
      includeIndividualLoans: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();

      // Get all active loans with credit scores
      const activeLoans = await db.select({
        loanId: loans.id,
        loanNumber: loans.loanNumber,
        principalAmount: loans.principalAmount,
        outstandingBalance: loans.outstandingBalance,
        interestRate: loans.interestRate,
        term: loans.term,
        loanType: loans.loanType,
        status: loans.status,
        userId: loans.userId,
      }).from(loans)
        .where(sql`${loans.status} IN ('active', 'disbursed')`);

      // Get credit scores for borrowers
      const borrowerIds = [...new Set(activeLoans.map(l => l.userId))];
      const scores = borrowerIds.length > 0
        ? await db.select({
            userId: creditScores.userId,
            score: creditScores.score,
          }).from(creditScores)
            .where(sql`${creditScores.userId} IN (${sql.join(borrowerIds.map(id => sql`${id}`), sql`, `)})`)
        : [];
      const scoreMap = new Map(scores.map(s => [s.userId, Number(s.score)]));

      const portfolioTotal = activeLoans.reduce((s, l) => s + (l.outstandingBalance || l.principalAmount), 0);
      const results: Record<string, {
        scenario: typeof STRESS_SCENARIOS[StressScenario];
        portfolioSize: number;
        loanCount: number;
        expectedLoss: number;
        expectedLossPercent: number;
        stressedDefaults: number;
        stressedDefaultRate: number;
        capitalImpact: number;
        capitalAdequacyRatio: number;
        byBand: Record<string, { count: number; exposure: number; expectedLoss: number; pd: number }>;
        worstLoans?: Array<{ loanId: number; loanNumber: string; exposure: number; expectedLoss: number; pd: number }>;
      }> = {};

      for (const scenarioKey of input.scenarios) {
        const scenario = STRESS_SCENARIOS[scenarioKey];
        let totalEL = 0;
        let stressedDefaults = 0;
        const bandBreakdown: Record<string, { count: number; exposure: number; expectedLoss: number; pd: number }> = {};
        const loanResults: Array<{ loanId: number; loanNumber: string; exposure: number; expectedLoss: number; pd: number }> = [];

        for (const loan of activeLoans) {
          const creditScore = scoreMap.get(loan.userId) || 400;
          const band = getBandFromScore(creditScore);
          const ead = loan.outstandingBalance || loan.principalAmount;
          const basePd = BASE_PD[band] || 0.10;
          const lgdBase = BASE_LGD[loan.loanType] || 0.50;

          // Apply stress multipliers
          const stressedPd = Math.min(1.0, basePd * scenario.defaultRateMultiplier);
          // Agricultural loans get extra stress from agricultural shock
          const agriAdjustment = loan.loanType === "input_loan" || loan.loanType === "agricultural"
            ? scenario.agriculturalShock
            : 0;
          const adjustedPd = Math.min(1.0, stressedPd + agriAdjustment);
          const stressedLgd = Math.min(1.0, lgdBase * scenario.lgdMultiplier);

          const el = Math.round(adjustedPd * stressedLgd * ead);
          totalEL += el;

          if (adjustedPd > 0.5) stressedDefaults++;

          if (!bandBreakdown[band]) {
            bandBreakdown[band] = { count: 0, exposure: 0, expectedLoss: 0, pd: 0 };
          }
          bandBreakdown[band].count++;
          bandBreakdown[band].exposure += ead;
          bandBreakdown[band].expectedLoss += el;
          bandBreakdown[band].pd = adjustedPd; // latest for band

          loanResults.push({ loanId: loan.loanId, loanNumber: loan.loanNumber, exposure: ead, expectedLoss: el, pd: adjustedPd });
        }

        // Capital adequacy: assume 12.5% minimum CAR, stress reduces capital
        const riskWeightedAssets = portfolioTotal * 1.0; // 100% risk weight for loans
        const capitalBase = riskWeightedAssets * 0.15; // assume 15% current CAR
        const stressedCapital = capitalBase - totalEL;
        const stressedCAR = riskWeightedAssets > 0 ? stressedCapital / riskWeightedAssets : 0;

        results[scenarioKey] = {
          scenario,
          portfolioSize: portfolioTotal,
          loanCount: activeLoans.length,
          expectedLoss: totalEL,
          expectedLossPercent: portfolioTotal > 0 ? Math.round(totalEL / portfolioTotal * 10000) / 100 : 0,
          stressedDefaults,
          stressedDefaultRate: activeLoans.length > 0 ? Math.round(stressedDefaults / activeLoans.length * 10000) / 100 : 0,
          capitalImpact: totalEL,
          capitalAdequacyRatio: Math.round(stressedCAR * 10000) / 100,
          byBand: bandBreakdown,
          worstLoans: input.includeIndividualLoans
            ? loanResults.sort((a, b) => b.expectedLoss - a.expectedLoss).slice(0, 20)
            : undefined,
        };
      }

      // Log and publish
      logger.info(`[StressTest] Completed ${input.scenarios.length} scenarios across ${activeLoans.length} loans`);

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "stress-testing-events",
          messages: [{ value: JSON.stringify({
            type: "stress_test_completed",
            scenarios: input.scenarios,
            loanCount: activeLoans.length,
            portfolioSize: portfolioTotal,
            timestamp: new Date().toISOString(),
          })}],
        });
      }

      // Audit log
      await db.insert(auditLogs).values({
        userId: ctx.user?.id || 0,
        eventId: `stress_test_${Date.now()}`,
        eventType: "stress_test",
        entityType: "portfolio",
        entityId: "all",
        timestamp: new Date(),
        data: { scenarios: input.scenarios, loanCount: activeLoans.length, portfolioSize: portfolioTotal },
      });

      return {
        runDate: new Date().toISOString(),
        portfolioSize: portfolioTotal,
        loanCount: activeLoans.length,
        results,
      };
    }),

  /**
   * Sensitivity analysis — how portfolio losses change with rate/default shocks.
   */
  sensitivityAnalysis: protectedProcedure
    .input(z.object({
      shockType: z.enum(["interest_rate", "default_rate", "lgd", "combined"]),
      shockRange: z.array(z.number()).default([-200, -100, 0, 100, 200, 500]),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();

      const activeLoans = await db.select({
        principalAmount: loans.principalAmount,
        outstandingBalance: loans.outstandingBalance,
        interestRate: loans.interestRate,
        term: loans.term,
        loanType: loans.loanType,
        userId: loans.userId,
      }).from(loans)
        .where(sql`${loans.status} IN ('active', 'disbursed')`);

      const borrowerIds = [...new Set(activeLoans.map(l => l.userId))];
      const scores = borrowerIds.length > 0
        ? await db.select({ userId: creditScores.userId, score: creditScores.score }).from(creditScores)
            .where(sql`${creditScores.userId} IN (${sql.join(borrowerIds.map(id => sql`${id}`), sql`, `)})`)
        : [];
      const scoreMap = new Map(scores.map(s => [s.userId, Number(s.score)]));

      const portfolioTotal = activeLoans.reduce((s, l) => s + (l.outstandingBalance || l.principalAmount), 0);

      const results = input.shockRange.map(shockBps => {
        let totalEL = 0;
        let totalNII = 0; // net interest income impact

        for (const loan of activeLoans) {
          const ead = loan.outstandingBalance || loan.principalAmount;
          const band = getBandFromScore(scoreMap.get(loan.userId) || 400);
          const basePd = BASE_PD[band] || 0.10;
          const baseLgd = BASE_LGD[loan.loanType] || 0.50;

          let adjustedPd = basePd;
          let adjustedLgd = baseLgd;
          let rateImpact = 0;

          switch (input.shockType) {
            case "interest_rate":
              rateImpact = Math.round(ead * shockBps / 10000 * (loan.term || 12) / 12);
              adjustedPd = basePd * (1 + shockBps / 5000); // higher rates increase defaults slightly
              break;
            case "default_rate":
              adjustedPd = Math.min(1.0, basePd * (1 + shockBps / 1000));
              break;
            case "lgd":
              adjustedLgd = Math.min(1.0, baseLgd * (1 + shockBps / 1000));
              break;
            case "combined":
              rateImpact = Math.round(ead * shockBps / 10000 * (loan.term || 12) / 12);
              adjustedPd = Math.min(1.0, basePd * (1 + shockBps / 2000));
              adjustedLgd = Math.min(1.0, baseLgd * (1 + shockBps / 3000));
              break;
          }

          totalEL += Math.round(adjustedPd * adjustedLgd * ead);
          totalNII += rateImpact;
        }

        return {
          shockBps,
          shockPercent: shockBps / 100,
          expectedLoss: totalEL,
          expectedLossPercent: portfolioTotal > 0 ? Math.round(totalEL / portfolioTotal * 10000) / 100 : 0,
          netInterestImpact: totalNII,
          netImpact: totalEL - totalNII,
        };
      });

      return {
        shockType: input.shockType,
        portfolioSize: portfolioTotal,
        loanCount: activeLoans.length,
        results,
      };
    }),

  /**
   * Get available stress scenarios and their parameters.
   */
  getScenarios: protectedProcedure
    .query(async () => {
      return {
        scenarios: Object.entries(STRESS_SCENARIOS).map(([key, scenario]) => ({
          key,
          ...scenario,
        })),
        basePD: BASE_PD,
        baseLGD: BASE_LGD,
        creditSpreads: CREDIT_SPREAD_BPS,
      };
    }),
});
