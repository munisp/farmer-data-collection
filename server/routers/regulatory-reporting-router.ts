/**
 * Regulatory Reporting Automation Router
 *
 * Generates CBN (Central Bank of Nigeria) and CBK (Central Bank of Kenya)
 * periodic regulatory returns:
 *
 *   - Capital Adequacy Ratio (CAR) — minimum 10% (CBN) / 14.5% (CBK)
 *   - Liquidity Ratio — minimum 30% (CBN) / 20% (CBK)
 *   - Portfolio at Risk (PAR) — PAR>1, PAR>30, PAR>90
 *   - Loan Classification & Provisioning — IFRS 9 staging
 *   - Currency Transaction Report (CTR) — large/suspicious transactions
 *   - Prudential Returns — monthly/quarterly filing
 *   - Key Financial Ratios — ROA, ROE, NIM, cost-to-income
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, sql, gte, lte, lt } from "drizzle-orm";
import { loans, loanRepayments, creditScores } from "../../drizzle/financial-schema.js";
import { users } from "../../drizzle/schema.js";
import { mobileMoneyTransactions } from "../../drizzle/supply-chain-schema.js";
import { auditLogs } from "../../drizzle/schema.js";
import { TRPCError } from "@trpc/server";
import { getProducer } from "../kafka.js";
import { logger } from "../logger.js";

// ============================================================================
// REGULATORY THRESHOLDS
// ============================================================================

const REGULATORY_THRESHOLDS = {
  CBN: {
    name: "Central Bank of Nigeria",
    country: "NG",
    currency: "NGN",
    capitalAdequacyMin: 10.0,    // 10% minimum CAR
    liquidityRatioMin: 30.0,     // 30% minimum
    singleObligorLimit: 20.0,    // 20% of shareholders' funds
    ctrThreshold: 5000000,       // ₦5M single transaction
    ctrDailyThreshold: 10000000, // ₦10M cumulative daily
    reportingFrequency: { prudential: "monthly", car: "quarterly", aml: "quarterly" },
  },
  CBK: {
    name: "Central Bank of Kenya",
    country: "KE",
    currency: "KES",
    capitalAdequacyMin: 14.5,    // 14.5% minimum CAR
    liquidityRatioMin: 20.0,     // 20% minimum
    singleObligorLimit: 25.0,    // 25% of core capital
    ctrThreshold: 1000000,       // KES 1M
    ctrDailyThreshold: 2000000,  // KES 2M cumulative daily
    reportingFrequency: { prudential: "monthly", car: "quarterly", aml: "quarterly" },
  },
} as const;

type Regulator = keyof typeof REGULATORY_THRESHOLDS;

// IFRS 9 staging for loan classification
const IFRS9_STAGES = {
  stage1: {
    name: "Performing",
    daysOverdue: { min: 0, max: 30 },
    provisionRate: 0.01,   // 12-month ECL: 1%
    description: "No significant increase in credit risk since origination",
  },
  stage2: {
    name: "Underperforming",
    daysOverdue: { min: 31, max: 90 },
    provisionRate: 0.10,   // Lifetime ECL: 10%
    description: "Significant increase in credit risk",
  },
  stage3: {
    name: "Non-Performing",
    daysOverdue: { min: 91, max: Infinity },
    provisionRate: 0.50,   // Lifetime ECL (credit-impaired): 50%
    description: "Credit-impaired, objective evidence of default",
  },
} as const;

type IFRS9Stage = keyof typeof IFRS9_STAGES;

function classifyLoan(daysOverdue: number): IFRS9Stage {
  if (daysOverdue <= 30) return "stage1";
  if (daysOverdue <= 90) return "stage2";
  return "stage3";
}

// ============================================================================
// ROUTER
// ============================================================================

export const regulatoryReportingRouter = router({
  /**
   * Generate Capital Adequacy Ratio (CAR) report.
   */
  generateCARReport: protectedProcedure
    .input(z.object({
      regulator: z.enum(["CBN", "CBK"]).default("CBN"),
      asOfDate: z.string().optional(),
      shareholdersFunds: z.number().positive().default(100000000), // in smallest currency unit
      tier2Capital: z.number().min(0).default(20000000),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const config = REGULATORY_THRESHOLDS[input.regulator];
      const now = input.asOfDate ? new Date(input.asOfDate) : new Date();

      // Total loan portfolio (risk-weighted assets)
      const portfolio = await db.select({
        count: sql<number>`count(*)`,
        totalOutstanding: sql<number>`coalesce(sum(outstanding_balance), 0)`,
        totalPrincipal: sql<number>`coalesce(sum(principal_amount), 0)`,
      }).from(loans)
        .where(sql`${loans.status} IN ('active', 'disbursed', 'defaulted')`);

      const totalLoans = Number(portfolio[0]?.totalOutstanding ?? 0);
      const totalCapital = input.shareholdersFunds + input.tier2Capital;

      // Risk-weighted assets: loans at 100%, cash at 0%, other assets at 50%
      const riskWeightedAssets = totalLoans * 1.0; // simplified: all loans at 100% weight

      const car = riskWeightedAssets > 0 ? (totalCapital / riskWeightedAssets) * 100 : 100;
      const tier1Ratio = riskWeightedAssets > 0 ? (input.shareholdersFunds / riskWeightedAssets) * 100 : 100;

      const compliant = car >= config.capitalAdequacyMin;

      return {
        reportType: "Capital Adequacy Ratio",
        regulator: config.name,
        asOfDate: now.toISOString().split("T")[0],
        capital: {
          tier1: input.shareholdersFunds,
          tier2: input.tier2Capital,
          totalCapital,
        },
        riskWeightedAssets,
        ratios: {
          car: Math.round(car * 100) / 100,
          tier1Ratio: Math.round(tier1Ratio * 100) / 100,
          minimumRequired: config.capitalAdequacyMin,
          buffer: Math.round((car - config.capitalAdequacyMin) * 100) / 100,
        },
        compliant,
        status: compliant ? "PASS" : "BREACH",
        loanPortfolio: {
          totalLoans: Number(portfolio[0]?.count ?? 0),
          totalOutstanding: totalLoans,
        },
      };
    }),

  /**
   * Generate Liquidity Ratio report.
   */
  generateLiquidityReport: protectedProcedure
    .input(z.object({
      regulator: z.enum(["CBN", "CBK"]).default("CBN"),
      liquidAssets: z.number().positive().default(50000000),
      totalDeposits: z.number().positive().default(80000000),
      shortTermLiabilities: z.number().positive().default(60000000),
    }))
    .query(async ({ input }) => {
      const config = REGULATORY_THRESHOLDS[input.regulator];

      const liquidityRatio = input.shortTermLiabilities > 0
        ? (input.liquidAssets / input.shortTermLiabilities) * 100 : 100;
      const depositCoverageRatio = input.totalDeposits > 0
        ? (input.liquidAssets / input.totalDeposits) * 100 : 100;
      const compliant = liquidityRatio >= config.liquidityRatioMin;

      return {
        reportType: "Liquidity Ratio",
        regulator: config.name,
        asOfDate: new Date().toISOString().split("T")[0],
        assets: {
          liquidAssets: input.liquidAssets,
          totalDeposits: input.totalDeposits,
          shortTermLiabilities: input.shortTermLiabilities,
        },
        ratios: {
          liquidityRatio: Math.round(liquidityRatio * 100) / 100,
          depositCoverageRatio: Math.round(depositCoverageRatio * 100) / 100,
          minimumRequired: config.liquidityRatioMin,
          buffer: Math.round((liquidityRatio - config.liquidityRatioMin) * 100) / 100,
        },
        compliant,
        status: compliant ? "PASS" : "BREACH",
      };
    }),

  /**
   * Generate loan classification and provisioning report (IFRS 9).
   */
  generateLoanClassification: protectedProcedure
    .input(z.object({
      asOfDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const now = input.asOfDate ? new Date(input.asOfDate) : new Date();

      // Get all active/defaulted loans with their oldest overdue payment
      const loanData = await db.select({
        loanId: loans.id,
        loanNumber: loans.loanNumber,
        principalAmount: loans.principalAmount,
        outstandingBalance: loans.outstandingBalance,
        loanType: loans.loanType,
        status: loans.status,
        oldestOverdue: sql<Date>`min(case when ${loanRepayments.status} = 'overdue' then ${loanRepayments.dueDate} else null end)`,
      }).from(loans)
        .leftJoin(loanRepayments, eq(loanRepayments.loanId, loans.id))
        .where(sql`${loans.status} IN ('active', 'disbursed', 'defaulted')`)
        .groupBy(loans.id, loans.loanNumber, loans.principalAmount,
          loans.outstandingBalance, loans.loanType, loans.status);

      const staging: Record<IFRS9Stage, {
        count: number;
        exposure: number;
        provisionRate: number;
        provisionAmount: number;
        loans: Array<{ loanId: number; loanNumber: string; exposure: number; daysOverdue: number }>;
      }> = {
        stage1: { count: 0, exposure: 0, provisionRate: IFRS9_STAGES.stage1.provisionRate, provisionAmount: 0, loans: [] },
        stage2: { count: 0, exposure: 0, provisionRate: IFRS9_STAGES.stage2.provisionRate, provisionAmount: 0, loans: [] },
        stage3: { count: 0, exposure: 0, provisionRate: IFRS9_STAGES.stage3.provisionRate, provisionAmount: 0, loans: [] },
      };

      for (const loan of loanData) {
        const daysOverdue = loan.oldestOverdue
          ? Math.max(0, Math.floor((now.getTime() - new Date(loan.oldestOverdue).getTime()) / 86400000))
          : 0;
        const stage = classifyLoan(daysOverdue);
        const exposure = loan.outstandingBalance || loan.principalAmount;

        staging[stage].count++;
        staging[stage].exposure += exposure;
        staging[stage].provisionAmount += Math.round(exposure * staging[stage].provisionRate);
        staging[stage].loans.push({
          loanId: loan.loanId,
          loanNumber: loan.loanNumber,
          exposure,
          daysOverdue,
        });
      }

      const totalExposure = Object.values(staging).reduce((s, st) => s + st.exposure, 0);
      const totalProvision = Object.values(staging).reduce((s, st) => s + st.provisionAmount, 0);

      return {
        reportType: "Loan Classification & Provisioning (IFRS 9)",
        asOfDate: now.toISOString().split("T")[0],
        summary: {
          totalLoans: loanData.length,
          totalExposure,
          totalProvision,
          provisionCoverageRatio: totalExposure > 0 ? Math.round(totalProvision / totalExposure * 10000) / 100 : 0,
          nplRatio: totalExposure > 0
            ? Math.round(staging.stage3.exposure / totalExposure * 10000) / 100
            : 0,
        },
        staging: Object.entries(staging).map(([stage, data]) => ({
          stage,
          ...IFRS9_STAGES[stage as IFRS9Stage],
          count: data.count,
          exposure: data.exposure,
          exposurePercent: totalExposure > 0 ? Math.round(data.exposure / totalExposure * 10000) / 100 : 0,
          provisionAmount: data.provisionAmount,
          loanCount: data.loans.length,
        })),
      };
    }),

  /**
   * Generate Portfolio at Risk (PAR) report.
   */
  generatePARReport: protectedProcedure
    .input(z.object({
      asOfDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const now = input.asOfDate ? new Date(input.asOfDate) : new Date();

      const totalPortfolio = await db.select({
        count: sql<number>`count(*)`,
        totalOutstanding: sql<number>`coalesce(sum(outstanding_balance), 0)`,
      }).from(loans)
        .where(sql`${loans.status} IN ('active', 'disbursed')`);

      const portfolioTotal = Number(totalPortfolio[0]?.totalOutstanding ?? 0);

      // Get overdue loans with days calculation
      const overdueLoans = await db.select({
        loanId: loans.id,
        outstandingBalance: loans.outstandingBalance,
        principalAmount: loans.principalAmount,
        oldestOverdue: sql<Date>`min(${loanRepayments.dueDate})`,
      }).from(loans)
        .innerJoin(loanRepayments, eq(loanRepayments.loanId, loans.id))
        .where(and(
          sql`${loans.status} IN ('active', 'disbursed', 'defaulted')`,
          eq(loanRepayments.status, "overdue"),
        ))
        .groupBy(loans.id, loans.outstandingBalance, loans.principalAmount);

      const parBuckets = [
        { label: "PAR > 1 day", minDays: 1, amount: 0, count: 0 },
        { label: "PAR > 30 days", minDays: 30, amount: 0, count: 0 },
        { label: "PAR > 60 days", minDays: 60, amount: 0, count: 0 },
        { label: "PAR > 90 days", minDays: 90, amount: 0, count: 0 },
        { label: "PAR > 180 days", minDays: 180, amount: 0, count: 0 },
        { label: "PAR > 365 days", minDays: 365, amount: 0, count: 0 },
      ];

      for (const loan of overdueLoans) {
        const daysOverdue = loan.oldestOverdue
          ? Math.max(0, Math.floor((now.getTime() - new Date(loan.oldestOverdue).getTime()) / 86400000))
          : 0;
        const exposure = loan.outstandingBalance || loan.principalAmount;

        for (const bucket of parBuckets) {
          if (daysOverdue >= bucket.minDays) {
            bucket.amount += exposure;
            bucket.count++;
          }
        }
      }

      return {
        reportType: "Portfolio at Risk (PAR)",
        asOfDate: now.toISOString().split("T")[0],
        portfolio: {
          totalLoans: Number(totalPortfolio[0]?.count ?? 0),
          totalOutstanding: portfolioTotal,
        },
        par: parBuckets.map(b => ({
          ...b,
          ratio: portfolioTotal > 0 ? Math.round(b.amount / portfolioTotal * 10000) / 100 : 0,
        })),
        riskRating: (() => {
          const par30 = portfolioTotal > 0
            ? parBuckets.find(b => b.minDays === 30)!.amount / portfolioTotal
            : 0;
          if (par30 < 0.05) return "Low Risk";
          if (par30 < 0.10) return "Moderate Risk";
          if (par30 < 0.20) return "High Risk";
          return "Critical Risk";
        })(),
      };
    }),

  /**
   * Generate key financial ratios report.
   */
  generateFinancialRatios: protectedProcedure
    .input(z.object({
      periodMonths: z.number().min(1).max(12).default(12),
      totalAssets: z.number().positive().default(200000000),
      totalEquity: z.number().positive().default(50000000),
      operatingExpenses: z.number().positive().default(15000000),
      interestIncome: z.number().positive().default(30000000),
      interestExpense: z.number().min(0).default(8000000),
      nonInterestIncome: z.number().min(0).default(5000000),
      netIncome: z.number().default(12000000),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();

      // Get loan portfolio metrics
      const portfolio = await db.select({
        totalOutstanding: sql<number>`coalesce(sum(outstanding_balance), 0)`,
        activeCount: sql<number>`count(*)`,
      }).from(loans)
        .where(sql`${loans.status} IN ('active', 'disbursed')`);

      const avgAssets = input.totalAssets;
      const avgEquity = input.totalEquity;
      const totalRevenue = input.interestIncome + input.nonInterestIncome;
      const nim = avgAssets > 0 ? (input.interestIncome - input.interestExpense) / avgAssets * 100 : 0;

      return {
        reportType: "Key Financial Ratios",
        period: `${input.periodMonths} months`,
        profitability: {
          roa: Math.round(input.netIncome / avgAssets * 10000) / 100,
          roe: Math.round(input.netIncome / avgEquity * 10000) / 100,
          nim: Math.round(nim * 100) / 100,
          costToIncomeRatio: totalRevenue > 0 ? Math.round(input.operatingExpenses / totalRevenue * 10000) / 100 : 0,
          operationalSelfSufficiency: input.operatingExpenses > 0
            ? Math.round(totalRevenue / input.operatingExpenses * 10000) / 100
            : 0,
        },
        efficiency: {
          yieldOnPortfolio: Number(portfolio[0]?.totalOutstanding ?? 0) > 0
            ? Math.round(input.interestIncome / Number(portfolio[0]?.totalOutstanding ?? 1) * 10000) / 100
            : 0,
          costPerBorrower: Number(portfolio[0]?.activeCount ?? 0) > 0
            ? Math.round(input.operatingExpenses / Number(portfolio[0]?.activeCount ?? 1))
            : 0,
        },
        portfolio: {
          totalOutstanding: Number(portfolio[0]?.totalOutstanding ?? 0),
          activeBorrowers: Number(portfolio[0]?.activeCount ?? 0),
          avgLoanSize: Number(portfolio[0]?.activeCount ?? 0) > 0
            ? Math.round(Number(portfolio[0]?.totalOutstanding ?? 0) / Number(portfolio[0]?.activeCount ?? 1))
            : 0,
        },
        benchmarks: {
          roa: { minimum: 1.0, target: 3.0, description: "Return on Assets" },
          roe: { minimum: 10.0, target: 20.0, description: "Return on Equity" },
          nim: { minimum: 5.0, target: 10.0, description: "Net Interest Margin" },
          costToIncome: { maximum: 70.0, target: 50.0, description: "Cost-to-Income Ratio" },
          oss: { minimum: 100.0, target: 120.0, description: "Operational Self-Sufficiency" },
        },
      };
    }),

  /**
   * Get regulatory filing calendar and compliance status.
   */
  getFilingCalendar: protectedProcedure
    .input(z.object({
      regulator: z.enum(["CBN", "CBK"]).default("CBN"),
      year: z.number().default(new Date().getFullYear()),
    }))
    .query(async ({ input }) => {
      const config = REGULATORY_THRESHOLDS[input.regulator];

      const filings = [
        { type: "Prudential Return", frequency: "Monthly", deadline: "15th of following month", regulatory: config.name },
        { type: "Capital Adequacy Ratio", frequency: "Quarterly", deadline: "30 days after quarter end", regulatory: config.name },
        { type: "Liquidity Ratio", frequency: "Monthly", deadline: "15th of following month", regulatory: config.name },
        { type: "Loan Classification (IFRS 9)", frequency: "Quarterly", deadline: "30 days after quarter end", regulatory: config.name },
        { type: "Portfolio at Risk", frequency: "Monthly", deadline: "15th of following month", regulatory: config.name },
        { type: "Currency Transaction Report", frequency: "Quarterly", deadline: "30 days after quarter end", regulatory: config.name },
        { type: "Anti-Money Laundering Return", frequency: "Quarterly", deadline: "30 days after quarter end", regulatory: config.name },
        { type: "Annual Audited Accounts", frequency: "Annually", deadline: "June 30th", regulatory: config.name },
        { type: "Key Financial Ratios", frequency: "Monthly", deadline: "15th of following month", regulatory: config.name },
      ];

      // Generate schedule for the year
      const schedule = [];
      for (const filing of filings) {
        if (filing.frequency === "Monthly") {
          for (let month = 0; month < 12; month++) {
            const deadline = new Date(input.year, month + 1, 15);
            schedule.push({
              ...filing,
              dueDate: deadline.toISOString().split("T")[0],
              period: `${input.year}-${String(month + 1).padStart(2, "0")}`,
              status: deadline < new Date() ? "overdue" : "upcoming",
            });
          }
        } else if (filing.frequency === "Quarterly") {
          for (let q = 0; q < 4; q++) {
            const deadline = new Date(input.year, (q + 1) * 3, 30);
            schedule.push({
              ...filing,
              dueDate: deadline.toISOString().split("T")[0],
              period: `Q${q + 1} ${input.year}`,
              status: deadline < new Date() ? "overdue" : "upcoming",
            });
          }
        } else {
          schedule.push({
            ...filing,
            dueDate: `${input.year}-06-30`,
            period: String(input.year),
            status: new Date(`${input.year}-06-30`) < new Date() ? "overdue" : "upcoming",
          });
        }
      }

      schedule.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

      return {
        regulator: config.name,
        year: input.year,
        totalFilings: schedule.length,
        upcomingCount: schedule.filter(s => s.status === "upcoming").length,
        overdueCount: schedule.filter(s => s.status === "overdue").length,
        schedule,
        thresholds: config,
      };
    }),
});
