import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base.js";
import { AccountingService } from "./services/accounting/accounting-service.js";
import { TRPCError } from "@trpc/server";

const accountingService = new AccountingService();

export const accountingRouter = router({
  // Journal Entry Management
  createJournalEntry: protectedProcedure
    .input(
      z.object({
        date: z.union([z.string(), z.date()]).optional(),
        entryDate: z.union([z.string(), z.date()]).optional(),
        description: z.string(),
        reference: z.string().optional(),
        lines: z.array(
          z.object({
            accountCode: z.string(),
            accountName: z.string().optional(), // For test compatibility
            debit: z.number().min(0),
            credit: z.number().min(0),
            description: z.string().optional(),
            farmId: z.number().optional(),
            cropId: z.number().optional(),
            costCenter: z.string().optional(),
          })
        ).min(2, "Journal entry must have at least 2 lines"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Accept either 'date' or 'entryDate' for compatibility
        const dateValue = input.entryDate || input.date;
        if (!dateValue) {
          throw new Error("Entry date is required");
        }
        const entryDate = dateValue instanceof Date ? dateValue : new Date(dateValue);
        
        const entryId = await accountingService.createJournalEntry({
          userId: ctx.user.id,
          entryDate,
          description: input.description,
          reference: input.reference,
          lines: input.lines.map(line => ({
            ...line,
            debit: Math.round(line.debit * 100), // Convert to cents
            credit: Math.round(line.credit * 100), // Convert to cents
          })),
        });
        return { success: true, journalEntryId: entryId };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to create journal entry",
        });
      }
    }),

  postJournalEntry: protectedProcedure
    .input(z.object({ 
      journalEntryId: z.number().optional(),
      entryId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const entryId = input.journalEntryId || input.entryId;
        if (!entryId) {
          throw new Error("Journal entry ID is required");
        }
        await accountingService.postJournalEntry(entryId, ctx.user.id);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to post journal entry",
        });
      }
    }),

  reverseJournalEntry: protectedProcedure
    .input(
      z.object({
        journalEntryId: z.number().optional(),
        entryId: z.number().optional(),
        reversalDate: z.union([z.string(), z.date()]).optional(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const entryId = input.journalEntryId || input.entryId;
        if (!entryId) {
          throw new Error("Journal entry ID is required");
        }
        const reversalEntryId = await accountingService.reverseJournalEntry(
          entryId,
          ctx.user.id,
          input.reason
        );
        return { success: true, reversalEntryId };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to reverse journal entry",
        });
      }
    }),

  getJournalEntries: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const entries = await accountingService.getJournalEntries(ctx.user.id, input.limit);
        return entries;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch journal entries",
        });
      }
    }),

  // Financial Reports
  getProfitAndLoss: protectedProcedure
    .input(
      z.object({
        startDate: z.union([z.string(), z.date()]),
        endDate: z.union([z.string(), z.date()]),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const startDate = input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
        const endDate = input.endDate instanceof Date ? input.endDate : new Date(input.endDate);
        const report = await accountingService.getProfitAndLoss(
          ctx.user.id,
          startDate,
          endDate
        );
        return report;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate P&L report",
        });
      }
    }),

  getBalanceSheet: protectedProcedure
    .input(z.object({ asOfDate: z.union([z.string(), z.date()]) }))
    .query(async ({ ctx, input }) => {
      try {
        const asOfDate = input.asOfDate instanceof Date ? input.asOfDate : new Date(input.asOfDate);
        const report = await accountingService.getBalanceSheet(
          ctx.user.id,
          asOfDate
        );
        return report;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate balance sheet",
        });
      }
    }),

  getCashFlow: protectedProcedure
    .input(
      z.object({
        startDate: z.union([z.string(), z.date()]),
        endDate: z.union([z.string(), z.date()]),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const startDate = input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
        const endDate = input.endDate instanceof Date ? input.endDate : new Date(input.endDate);
        const report = await accountingService.getCashFlowStatement(
          ctx.user.id,
          startDate,
          endDate
        );
        return report;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate cash flow report",
        });
      }
    }),

  // Account Balance
  getAccountBalances: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      try {
        // Get all accounts from chart of accounts
        const { FARMER_COA } = await import('./services/accounting/chart-of-accounts.js');
        const accounts = Object.values(FARMER_COA).filter(acc => acc.isActive);
        
        // Get balance for each account
        const balances = await Promise.all(
          accounts.map(async (account) => {
            try {
              const balance = await accountingService.getAccountBalance(
                ctx.user.id,
                account.code
              );
              return {
                accountCode: account.code,
                accountName: account.name,
                accountType: account.type,
                balance: balance / 100, // Convert from cents
              };
            } catch (error) {
              // If account has no balance, return 0
              return {
                accountCode: account.code,
                accountName: account.name,
                accountType: account.type,
                balance: 0,
              };
            }
          })
        );
        
        return balances;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch account balances",
        });
      }
    }),

  getAccountBalance: protectedProcedure
    .input(
      z.object({
        accountCode: z.string(),
        fiscalYear: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const balance = await accountingService.getAccountBalance(
          ctx.user.id,
          input.accountCode,
          input.fiscalYear
        );
        return { accountCode: input.accountCode, balance: balance / 100 }; // Convert from cents
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch account balance",
        });
      }
    }),

  // Financial Period Management
  closeFinancialPeriod: protectedProcedure
    .input(z.object({ periodId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await accountingService.closeFinancialPeriod(ctx.user.id, input.periodId);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to close financial period",
        });
      }
    }),
});
