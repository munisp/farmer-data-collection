import { router, protectedProcedure } from './_core/trpc-base.js';
import { z } from 'zod';
import { getDb } from './db';
import { expenses, harvests, crops } from '../drizzle/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

export const financialReportsRouter = router({
  // Get expense summary by category
  getExpenseByCategory: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      const conditions = [eq(expenses.userId, ctx.user!.id)];
      
      if (input.startDate) {
        conditions.push(gte(expenses.expenseDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(expenses.expenseDate, new Date(input.endDate)));
      }

      const result = await db
        .select({
          category: expenses.category,
          totalAmount: sql<number>`sum(${expenses.amount})`.as('total_amount'),
          count: sql<number>`count(*)`.as('count'),
        })
        .from(expenses)
        .where(and(...conditions))
        .groupBy(expenses.category)
        .orderBy(desc(sql`sum(${expenses.amount})`));

      return result.map(row => ({
        category: row.category || 'Uncategorized',
        totalAmount: Number(row.totalAmount) || 0,
        count: Number(row.count) || 0,
      }));
    }),

  // Get monthly expense trends
  getMonthlyTrends: protectedProcedure
    .input(z.object({
      months: z.number().default(12),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - input.months);

      const result = await db
        .select({
          month: sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM')`.as('month'),
          totalExpenses: sql<number>`sum(${expenses.amount})`.as('total_expenses'),
          count: sql<number>`count(*)`.as('count'),
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, ctx.user!.id),
            gte(expenses.expenseDate, startDate)
          )
        )
        .groupBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`)
        .orderBy(sql`to_char(${expenses.expenseDate}, 'YYYY-MM')`);

      return result.map(row => ({
        month: row.month,
        totalExpenses: Number(row.totalExpenses) || 0,
        count: Number(row.count) || 0,
      }));
    }),

  // Get revenue vs expense comparison
  getRevenueVsExpense: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      const conditions = [eq(expenses.userId, ctx.user!.id)];
      const harvestConditions = [eq(harvests.userId, ctx.user!.id)];
      
      if (input.startDate) {
        conditions.push(gte(expenses.expenseDate, new Date(input.startDate)));
        harvestConditions.push(gte(harvests.harvestDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(expenses.expenseDate, new Date(input.endDate)));
        harvestConditions.push(lte(harvests.harvestDate, new Date(input.endDate)));
      }

      // Get total expenses
      const [expenseResult] = await db
        .select({
          totalExpenses: sql<number>`coalesce(sum(${expenses.amount}), 0)`.as('total_expenses'),
          count: sql<number>`count(*)`.as('count'),
        })
        .from(expenses)
        .where(and(...conditions));

      // Get total revenue (from harvests with crop prices)
      const [revenueResult] = await db
        .select({
          totalRevenue: sql<number>`coalesce(sum(${harvests.quantity} * ${crops.pricePerUnit} / 100.0), 0)`.as('total_revenue'), // Price in cents, convert to dollars
          count: sql<number>`count(*)`.as('count'),
        })
        .from(harvests)
        .innerJoin(crops, eq(harvests.cropId, crops.id))
        .where(and(...harvestConditions));

      const totalExpenses = Number(expenseResult?.totalExpenses) || 0;
      const totalRevenue = Number(revenueResult?.totalRevenue) || 0;
      const profit = totalRevenue - totalExpenses;
      const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

      return {
        totalExpenses,
        totalRevenue,
        profit,
        profitMargin,
        expenseCount: Number(expenseResult?.count) || 0,
        revenueCount: Number(revenueResult?.count) || 0,
      };
    }),

  // Get financial summary
  getFinancialSummary: protectedProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('Database not available');
      }

      const conditions = [eq(expenses.userId, ctx.user!.id)];
      
      if (input.startDate) {
        conditions.push(gte(expenses.expenseDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(expenses.expenseDate, new Date(input.endDate)));
      }

      // Get expense statistics
      const [stats] = await db
        .select({
          totalExpenses: sql<number>`coalesce(sum(${expenses.amount}), 0)`.as('total_expenses'),
          avgExpense: sql<number>`coalesce(avg(${expenses.amount}), 0)`.as('avg_expense'),
          maxExpense: sql<number>`coalesce(max(${expenses.amount}), 0)`.as('max_expense'),
          minExpense: sql<number>`coalesce(min(${expenses.amount}), 0)`.as('min_expense'),
          count: sql<number>`count(*)`.as('count'),
        })
        .from(expenses)
        .where(and(...conditions));

      return {
        totalExpenses: Number(stats?.totalExpenses) || 0,
        avgExpense: Number(stats?.avgExpense) || 0,
        maxExpense: Number(stats?.maxExpense) || 0,
        minExpense: Number(stats?.minExpense) || 0,
        count: Number(stats?.count) || 0,
      };
    }),
});
