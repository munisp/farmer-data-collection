import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { protectedProcedure } from "./_core/trpc-base.js";
import { getDb } from "./db.js";
import {
  loans,
  loanRepayments,
  creditScores,
  creditScoreHistory,
  savingsAccounts,
  savingsTransactions,
} from "../drizzle/financial-schema.js";
import { farmers, users, expenses, marketplaceOrders, livestock } from "../drizzle/schema.js";
import { exchangeTraders, exchangeTrades, exchangeOrders } from "../drizzle/exchange-schema.js";

// All procedures are exported as a flat object that can be spread into the microfinance router

export const microfinanceFlatProcedures = {
  getFarmerFinancialProfile: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [farmer] = await db
        .select({
          id: farmers.id,
          userId: farmers.userId,
          firstName: farmers.firstName,
          lastName: farmers.lastName,
          verificationStatus: farmers.verificationStatus,
          region: farmers.region,
          district: farmers.district,
          email: farmers.email,
          phoneNumber: farmers.phoneNumber,
          role: users.role,
        })
        .from(farmers)
        .innerJoin(users, eq(farmers.userId, users.id))
        .where(eq(farmers.id, input.farmerId))
        .limit(1);

      if (!farmer) {
        throw new Error("Farmer not found");
      }

      const requesterId = Number(ctx.user.id);
      const isOwner = requesterId === Number(farmer.userId);
      const isAdmin = ctx.user.role === "admin";

      if (!isOwner && !isAdmin) {
        throw new Error("Not authorized to view this financial profile");
      }

      const [score] = await db
        .select()
        .from(creditScores)
        .where(eq(creditScores.userId, farmer.userId))
        .orderBy(desc(creditScores.updatedAt))
        .limit(1);

      const history = await db
        .select()
        .from(creditScoreHistory)
        .where(eq(creditScoreHistory.userId, farmer.userId))
        .orderBy(desc(creditScoreHistory.calculatedAt))
        .limit(12);

      const userLoans = await db
        .select({
          id: loans.id,
          loanNumber: loans.loanNumber,
          principalAmount: loans.principalAmount,
          interestRate: loans.interestRate,
          status: loans.status,
          nextPaymentDue: loans.nextPaymentDue,
          outstandingBalance: loans.outstandingBalance,
          purpose: loans.purpose,
          applicationDate: loans.applicationDate,
          createdAt: loans.createdAt,
        })
        .from(loans)
        .where(eq(loans.userId, farmer.userId))
        .orderBy(desc(loans.createdAt));

      const repayments = await db
        .select({
          id: loanRepayments.id,
          status: loanRepayments.status,
          paidAmount: loanRepayments.paidAmount,
          dueDate: loanRepayments.dueDate,
          paidDate: loanRepayments.paidDate,
          totalAmount: loanRepayments.totalAmount,
        })
        .from(loanRepayments)
        .leftJoin(loans, eq(loanRepayments.loanId, loans.id))
        .where(eq(loans.userId, farmer.userId));

      const [expenseSummary] = await db
        .select({
          totalExpenses: sql<number>`COALESCE(SUM(${expenses.amount}), 0)`,
        })
        .from(expenses)
        .where(eq(expenses.userId, farmer.userId));

      const [marketplaceSalesSummary] = await db
        .select({
          totalSales: sql<number>`COALESCE(SUM(${marketplaceOrders.totalAmount}), 0)`,
          totalSalesCount: sql<number>`COUNT(*)`,
        })
        .from(marketplaceOrders)
        .where(and(eq(marketplaceOrders.sellerId, farmer.userId), sql`${marketplaceOrders.status} != 'cancelled'`));

      const [marketplacePurchaseSummary] = await db
        .select({
          totalPurchases: sql<number>`COALESCE(SUM(${marketplaceOrders.totalAmount}), 0)`,
          totalPurchaseCount: sql<number>`COUNT(*)`,
        })
        .from(marketplaceOrders)
        .where(and(eq(marketplaceOrders.buyerId, farmer.userId), sql`${marketplaceOrders.status} != 'cancelled'`));

      const [trader] = await db
        .select()
        .from(exchangeTraders)
        .where(eq(exchangeTraders.userId, farmer.userId))
        .limit(1);

      const exchangeOrdersList = trader
        ? await db
            .select({
              id: exchangeOrders.id,
              status: exchangeOrders.status,
            })
            .from(exchangeOrders)
            .where(eq(exchangeOrders.traderId, trader.id))
        : [];

      const exchangeTradesList = trader
        ? await db
            .select({
              id: exchangeTrades.id,
              tradeValue: exchangeTrades.tradeValue,
              buyerTraderId: exchangeTrades.buyerTraderId,
              sellerTraderId: exchangeTrades.sellerTraderId,
              tradeTime: exchangeTrades.tradeTime,
            })
            .from(exchangeTrades)
            .where(sql`${exchangeTrades.buyerTraderId} = ${trader.id} OR ${exchangeTrades.sellerTraderId} = ${trader.id}`)
            .orderBy(desc(exchangeTrades.tradeTime))
        : [];

      const [livestockSummary] = await db
        .select({
          collateralValue: sql<number>`COALESCE(SUM(${livestock.currentValue}), 0)`,
        })
        .from(livestock)
        .where(eq(livestock.userId, farmer.userId));

      const totalIncome = Number(marketplaceSalesSummary?.totalSales || 0);
      const totalDebt = userLoans.reduce((sum, loan) => sum + Number(loan.outstandingBalance || 0), 0);
      const totalRepaid = repayments.reduce((sum, repayment) => sum + Number(repayment.paidAmount || 0), 0);
      const onTimePayments = repayments.filter((repayment) => repayment.status === "paid").length;
      const latePayments = repayments.filter((repayment) => repayment.status === "overdue").length;
      const totalLoans = userLoans.length;
      const activeLoans = userLoans.filter((loan) => ["active", "approved", "disbursed"].includes(String(loan.status))).length;
      const availableCredit = Math.max(0, Math.round((Number(score?.score || 300) / 850) * 1500000) - totalDebt);
      const debtToIncomeRatio = totalIncome > 0 ? Math.round((totalDebt / totalIncome) * 100) : totalDebt > 0 ? 100 : 0;
      const exchangeVolume = exchangeTradesList.reduce((sum, trade) => sum + Number(trade.tradeValue || 0), 0);
      const openPositions = exchangeOrdersList.filter((order) => ["open", "partially_filled"].includes(String(order.status))).length;
      const totalTrades = exchangeTradesList.length;
      const collateralValue = Number(livestockSummary?.collateralValue || 0) + Math.round(totalIncome * 0.35);

      return {
        farmer,
        summary: {
          creditScore: Number(score?.score || 300),
          riskCategory: score?.riskCategory || "high",
          totalIncome,
          totalDebt,
          availableCredit,
          debtToIncomeRatio,
          onTimePayments,
          latePayments,
          totalLoans,
          activeLoans,
          totalRepaid,
          marketplaceSales: Number(marketplaceSalesSummary?.totalSales || 0),
          marketplacePurchases: Number(marketplacePurchaseSummary?.totalPurchases || 0),
          exchangeVolume,
          collateralValue,
          totalExpenses: Number(expenseSummary?.totalExpenses || 0),
        },
        loans: userLoans.map((loan) => ({
          id: loan.id,
          loanNumber: loan.loanNumber,
          amount: Number(loan.principalAmount || 0),
          interestRate: Number(loan.interestRate || 0) / 100,
          status: loan.status,
          dueDate: loan.nextPaymentDue,
          remainingBalance: Number(loan.outstandingBalance || 0),
          purpose: loan.purpose,
          applicationDate: loan.applicationDate,
        })),
        marketplaceActivity: {
          totalSales: Number(marketplaceSalesSummary?.totalSales || 0),
          totalSalesCount: Number(marketplaceSalesSummary?.totalSalesCount || 0),
          totalPurchases: Number(marketplacePurchaseSummary?.totalPurchases || 0),
          totalPurchaseCount: Number(marketplacePurchaseSummary?.totalPurchaseCount || 0),
        },
        exchangeActivity: {
          openPositions,
          totalTrades,
          volume: exchangeVolume,
        },
        creditHistory: history,
        lastUpdatedAt: new Date(),
      };
    }),

  // ============================================================================
  // LOANS PROCEDURES
  // ============================================================================

  loans_applyForLoan: protectedProcedure
    .input(
      z.object({
        farmerId: z.number().optional(),
        loanType: z.enum(["agricultural", "equipment", "working_capital", "emergency"]),
        requestedAmount: z.number().positive(),
        purpose: z.string().min(10),
        repaymentPeriodMonths: z.number().min(1).max(60),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const loanNumber = `LOAN-${Date.now()}-${ctx.user.id}`;
      
      const [loan] = await db
        .insert(loans)
        .values({
          userId: ctx.user.id,
          loanNumber,
          lenderId: 1,
          loanType: input.loanType,
          principalAmount: Math.round(input.requestedAmount * 100),
          interestRate: 1500,
          term: input.repaymentPeriodMonths,
          termMonths: input.repaymentPeriodMonths,
          purpose: input.purpose,
          status: "pending",
          applicationDate: new Date(),
        })
        .returning();

      return {
        ...loan,
        requestedAmount: input.requestedAmount,
        principalAmount: loan.principalAmount / 100,
      };
    }),

  loans_list: protectedProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let conditions = [eq(loans.userId, ctx.user.id)];
      if (input?.status) {
        conditions.push(eq(loans.status, input.status));
      }

      const userLoans = await db
        .select()
        .from(loans)
        .where(and(...conditions))
        .orderBy(desc(loans.createdAt));

      return userLoans.map(loan => ({
        ...loan,
        requestedAmount: loan.principalAmount / 100,
      }));
    }),

  loans_getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [loan] = await db
        .select()
        .from(loans)
        .where(and(eq(loans.id, input.id), eq(loans.userId, ctx.user.id)));

      if (!loan) throw new Error("Loan not found");

      return {
        ...loan,
        requestedAmount: loan.principalAmount / 100,
      };
    }),

  loans_approve: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        approvedAmount: z.number().positive(),
        interestRate: z.number().positive(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [loan] = await db
        .update(loans)
        .set({
          status: "approved",
          principalAmount: Math.round(input.approvedAmount * 100),
          interestRate: Math.round(input.interestRate * 100),
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
        })
        .where(eq(loans.id, input.id))
        .returning();

      if (!loan) throw new Error("Loan not found");

      return {
        ...loan,
        approvedAmount: input.approvedAmount,
        interestRate: input.interestRate,
      };
    }),

  loans_disburse: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        disbursementMethod: z.enum(["cash", "bank_transfer", "mobile_money"]),
        disbursementReference: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [loan] = await db
        .update(loans)
        .set({
          status: "active",
          disbursementDate: new Date(),
          disbursedAt: new Date(),
        })
        .where(eq(loans.id, input.id))
        .returning();

      if (!loan) throw new Error("Loan not found");
      return loan;
    }),

  loans_getSummary: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [loan] = await db.select().from(loans).where(eq(loans.id, input.id));
      if (!loan) throw new Error("Loan not found");

      const principalAmount = loan.principalAmount / 100;
      const annualRate = (loan.interestRate || 1500) / 10000;
      const monthlyRate = annualRate / 12;
      const termMonths = loan.termMonths || loan.term || 12;

      const monthlyPayment = principalAmount * 
        (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
        (Math.pow(1 + monthlyRate, termMonths) - 1);

      const totalAmount = monthlyPayment * termMonths;
      const totalInterest = totalAmount - principalAmount;

      return {
        id: loan.id,
        loanNumber: loan.loanNumber,
        principalAmount,
        interestRate: (loan.interestRate || 1500) / 100,
        termMonths,
        monthlyPayment: Math.round(monthlyPayment * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalInterest: Math.round(totalInterest * 100) / 100,
        status: loan.status,
      };
    }),

  loans_getPortfolioSummary: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [stats] = await db
      .select({
        totalLoans: sql<number>`count(*)::int`,
        totalDisbursed: sql<number>`coalesce(sum(case when ${loans.status} in ('disbursed', 'active', 'completed') then ${loans.principalAmount} end), 0)::int`,
        totalOutstanding: sql<number>`coalesce(sum(case when ${loans.status} in ('active', 'disbursed') then ${loans.principalAmount} end), 0)::int`,
        averageLoanSize: sql<number>`coalesce(avg(${loans.principalAmount}), 0)::int`,
      })
      .from(loans)
      .where(eq(loans.userId, ctx.user.id));

    return {
      totalLoans: stats.totalLoans,
      totalDisbursed: stats.totalDisbursed / 100,
      totalOutstanding: stats.totalOutstanding / 100,
      averageLoanSize: stats.averageLoanSize / 100,
    };
  }),

  loans_getPerformanceMetrics: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [stats] = await db
      .select({
        totalLoans: sql<number>`count(*)::int`,
        activeLoans: sql<number>`count(case when ${loans.status} = 'active' then 1 end)::int`,
        completedLoans: sql<number>`count(case when ${loans.status} = 'completed' then 1 end)::int`,
        defaultedLoans: sql<number>`count(case when ${loans.status} = 'defaulted' then 1 end)::int`,
      })
      .from(loans)
      .where(eq(loans.userId, ctx.user.id));

    const repaymentRate = stats.totalLoans > 0 ? (stats.completedLoans / stats.totalLoans) * 100 : 0;
    const defaultRate = stats.totalLoans > 0 ? (stats.defaultedLoans / stats.totalLoans) * 100 : 0;

    return {
      totalLoans: stats.totalLoans,
      activeLoans: stats.activeLoans,
      completedLoans: stats.completedLoans,
      defaultedLoans: stats.defaultedLoans,
      repaymentRate: Math.round(repaymentRate * 100) / 100,
      defaultRate: Math.round(defaultRate * 100) / 100,
    };
  }),

  loans_getByStatus: protectedProcedure
    .input(z.object({ status: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      return await db
        .select()
        .from(loans)
        .where(and(eq(loans.userId, ctx.user.id), eq(loans.status, input.status)))
        .orderBy(desc(loans.createdAt));
    }),

  // ============================================================================
  // REPAYMENTS PROCEDURES
  // ============================================================================

  repayments_create: protectedProcedure
    .input(
      z.object({
        loanId: z.number(),
        amount: z.number().positive(),
        paymentMethod: z.enum(["cash", "bank_transfer", "mobile_money"]),
        paymentReference: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [loan] = await db.select().from(loans).where(eq(loans.id, input.loanId));
      if (!loan) throw new Error("Loan not found");

      const existingRepayments = await db
        .select()
        .from(loanRepayments)
        .where(eq(loanRepayments.loanId, input.loanId));

      const paymentNumber = existingRepayments.length + 1;

      const [repayment] = await db
        .insert(loanRepayments)
        .values({
          loanId: input.loanId,
          paymentNumber,
          dueDate: new Date(),
          paidDate: new Date(),
          principalAmount: Math.round(input.amount * 100),
          interestAmount: 0,
          totalAmount: Math.round(input.amount * 100),
          paidAmount: Math.round(input.amount * 100),
          status: "paid",
          paymentMethod: input.paymentMethod,
          transactionReference: input.paymentReference,
        })
        .returning();

      return {
        ...repayment,
        amount: input.amount,
        status: "completed",
      };
    }),

  repayments_listByLoan: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      return await db
        .select()
        .from(loanRepayments)
        .where(eq(loanRepayments.loanId, input.loanId))
        .orderBy(desc(loanRepayments.paidDate));
    }),

  repayments_getSchedule: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [loan] = await db.select().from(loans).where(eq(loans.id, input.loanId));
      if (!loan) throw new Error("Loan not found");

      const principalAmount = loan.principalAmount / 100;
      const annualRate = (loan.interestRate || 1500) / 10000;
      const monthlyRate = annualRate / 12;
      const termMonths = loan.termMonths || loan.term || 12;

      const monthlyPayment = principalAmount * 
        (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
        (Math.pow(1 + monthlyRate, termMonths) - 1);

      const schedule = [];
      let remainingBalance = principalAmount;

      for (let i = 1; i <= termMonths; i++) {
        const interestAmount = remainingBalance * monthlyRate;
        const principalPayment = monthlyPayment - interestAmount;
        remainingBalance -= principalPayment;

        const dueDate = new Date(loan.disbursementDate || loan.applicationDate || new Date());
        dueDate.setMonth(dueDate.getMonth() + i);

        schedule.push({
          installmentNumber: i,
          dueDate,
          principalAmount: Math.round(principalPayment * 100) / 100,
          interestAmount: Math.round(interestAmount * 100) / 100,
          totalAmount: Math.round(monthlyPayment * 100) / 100,
          remainingBalance: Math.max(0, Math.round(remainingBalance * 100) / 100),
        });
      }

      return schedule;
    }),

  // ============================================================================
  // CREDIT SCORES PROCEDURES
  // ============================================================================

  creditScores_calculate: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [farmer] = await db.select().from(farmers).where(eq(farmers.id, input.farmerId));
      if (!farmer) throw new Error("Farmer not found");

      let score = 650;

      const userLoans = await db.select().from(loans).where(eq(loans.userId, farmer.userId));
      const completedLoans = userLoans.filter(l => l.status === "completed").length;
      const defaultedLoans = userLoans.filter(l => l.status === "defaulted").length;

      score += completedLoans * 20;
      score -= defaultedLoans * 50;

      const repayments = await db
        .select()
        .from(loanRepayments)
        .leftJoin(loans, eq(loanRepayments.loanId, loans.id))
        .where(eq(loans.userId, farmer.userId));

      const onTimePayments = repayments.filter(r => r.loan_repayments.status === "paid").length;
      score += Math.min(onTimePayments * 5, 100);

      score = Math.max(300, Math.min(850, score));

      let rating: string;
      if (score >= 750) rating = "excellent";
      else if (score >= 700) rating = "very_good";
      else if (score >= 650) rating = "good";
      else if (score >= 600) rating = "fair";
      else rating = "poor";

      const [existingScore] = await db.select().from(creditScores).where(eq(creditScores.userId, farmer.userId));

      if (existingScore) {
        await db
          .update(creditScores)
          .set({
            score,
            riskCategory: rating === "poor" || rating === "fair" ? "high" : rating === "good" ? "medium" : "low",
            previousScore: existingScore.score,
            calculatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(creditScores.userId, farmer.userId));
      } else {
        await db.insert(creditScores).values({
          userId: farmer.userId,
          score,
          riskCategory: rating === "poor" || rating === "fair" ? "high" : rating === "good" ? "medium" : "low",
          calculatedAt: new Date(),
        });
      }

      return { userId: farmer.userId, score, rating, calculatedAt: new Date() };
    }),

  creditScores_getHistory: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [farmer] = await db.select().from(farmers).where(eq(farmers.id, input.farmerId));
      if (!farmer) throw new Error("Farmer not found");

      return await db
        .select()
        .from(creditScoreHistory)
        .where(eq(creditScoreHistory.userId, farmer.userId))
        .orderBy(desc(creditScoreHistory.calculatedAt));
    }),

  creditScores_getFactors: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [farmer] = await db.select().from(farmers).where(eq(farmers.id, input.farmerId));
      if (!farmer) throw new Error("Farmer not found");

      const userLoans = await db.select().from(loans).where(eq(loans.userId, farmer.userId));
      const totalLoans = userLoans.length;
      const completedLoans = userLoans.filter(l => l.status === "completed").length;
      const activeLoans = userLoans.filter(l => l.status === "active").length;

      const repayments = await db
        .select()
        .from(loanRepayments)
        .leftJoin(loans, eq(loanRepayments.loanId, loans.id))
        .where(eq(loans.userId, farmer.userId));

      const totalRepayments = repayments.length;
      const onTimeRepayments = repayments.filter(r => r.loan_repayments.status === "paid").length;

      const firstLoan = userLoans.sort((a, b) => 
        new Date(a.applicationDate || 0).getTime() - new Date(b.applicationDate || 0).getTime()
      )[0];

      const creditAgeMonths = firstLoan
        ? Math.floor((Date.now() - new Date(firstLoan.applicationDate || 0).getTime()) / (1000 * 60 * 60 * 24 * 30))
        : 0;

      return {
        paymentHistory: totalRepayments > 0 ? (onTimeRepayments / totalRepayments) * 100 : 0,
        creditUtilization: activeLoans / Math.max(totalLoans, 1) * 100,
        creditAge: creditAgeMonths,
        totalLoans,
        completedLoans,
        activeLoans,
      };
    }),

  // ============================================================================
  // SAVINGS PROCEDURES
  // ============================================================================

  savings_createAccount: protectedProcedure
    .input(
      z.object({
        farmerId: z.number().optional(),
        accountType: z.enum(["regular", "fixed", "goal"]),
        accountName: z.string(),
        interestRate: z.number().default(0),
        minimumBalance: z.number().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const accountNumber = `SAV-${Date.now()}-${ctx.user.id}`;

      const [account] = await db
        .insert(savingsAccounts)
        .values({
          userId: ctx.user.id,
          farmerId: input.farmerId,
          accountNumber,
          accountName: input.accountName,
          accountType: input.accountType,
          interestRate: Math.round(input.interestRate * 100),
          minimumBalance: Math.round(input.minimumBalance * 100),
          balance: 0,
          status: "active",
        })
        .returning();

      return {
        ...account,
        balance: 0,
        interestRate: input.interestRate,
        minimumBalance: input.minimumBalance,
      };
    }),

  savings_deposit: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        amount: z.number().positive(),
        transactionMethod: z.enum(["cash", "bank_transfer", "mobile_money"]),
        reference: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [account] = await db.select().from(savingsAccounts).where(eq(savingsAccounts.id, input.accountId));
      if (!account) throw new Error("Savings account not found");

      const balanceBefore = account.balance;
      const balanceAfter = balanceBefore + Math.round(input.amount * 100);

      const [transaction] = await db
        .insert(savingsTransactions)
        .values({
          accountId: input.accountId,
          userId: ctx.user.id,
          transactionType: "deposit",
          amount: Math.round(input.amount * 100),
          balanceBefore,
          balanceAfter,
          transactionMethod: input.transactionMethod,
          reference: input.reference,
          status: "completed",
        })
        .returning();

      await db
        .update(savingsAccounts)
        .set({ balance: balanceAfter, updatedAt: new Date() })
        .where(eq(savingsAccounts.id, input.accountId));

      return {
        ...transaction,
        amount: input.amount,
        transactionType: "deposit",
        status: "completed",
      };
    }),

  savings_getAccount: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [account] = await db
        .select()
        .from(savingsAccounts)
        .where(and(eq(savingsAccounts.id, input.id), eq(savingsAccounts.userId, ctx.user.id)));

      if (!account) throw new Error("Savings account not found");

      return {
        ...account,
        balance: account.balance / 100,
      };
    }),

  savings_withdraw: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        amount: z.number().positive(),
        transactionMethod: z.enum(["cash", "bank_transfer", "mobile_money"]),
        reference: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [account] = await db.select().from(savingsAccounts).where(eq(savingsAccounts.id, input.accountId));
      if (!account) throw new Error("Savings account not found");

      const withdrawalAmount = Math.round(input.amount * 100);
      if (account.balance < withdrawalAmount) throw new Error("Insufficient balance");

      const balanceBefore = account.balance;
      const balanceAfter = balanceBefore - withdrawalAmount;

      const [transaction] = await db
        .insert(savingsTransactions)
        .values({
          accountId: input.accountId,
          userId: ctx.user.id,
          transactionType: "withdrawal",
          amount: withdrawalAmount,
          balanceBefore,
          balanceAfter,
          transactionMethod: input.transactionMethod,
          reference: input.reference,
          status: "completed",
        })
        .returning();

      await db
        .update(savingsAccounts)
        .set({ balance: balanceAfter, updatedAt: new Date() })
        .where(eq(savingsAccounts.id, input.accountId));

      return {
        ...transaction,
        amount: input.amount,
        transactionType: "withdrawal",
        status: "completed",
      };
    }),

  savings_getTransactions: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      return await db
        .select()
        .from(savingsTransactions)
        .where(eq(savingsTransactions.accountId, input.accountId))
        .orderBy(desc(savingsTransactions.createdAt));
    }),

  savings_calculateInterest: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [account] = await db.select().from(savingsAccounts).where(eq(savingsAccounts.id, input.accountId));
      if (!account) throw new Error("Savings account not found");

      const balance = account.balance / 100;
      const annualRate = (account.interestRate || 0) / 10000;
      const monthlyRate = annualRate / 12;

      const interestEarned = balance * monthlyRate;
      const projectedAnnualInterest = balance * annualRate;

      return {
        accountId: input.accountId,
        currentBalance: balance,
        interestRate: (account.interestRate || 0) / 100,
        interestEarned: Math.round(interestEarned * 100) / 100,
        projectedAnnualInterest: Math.round(projectedAnnualInterest * 100) / 100,
      };
    }),
};
