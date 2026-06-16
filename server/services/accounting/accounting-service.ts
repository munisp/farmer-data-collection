/**
 * Accounting Service - Double-Entry Bookkeeping Engine
 * 
 * Implements GAAP-compliant accounting for Nigerian smallholder farmers
 * Features:
 * - Double-entry bookkeeping validation
 * - Journal entry creation and posting
 * - Account balance management
 * - Financial period closing
 * - P&L, Balance Sheet, Cash Flow generation
 */

import { getDb } from '../../db';
import { 
  journalEntries, 
  journalEntryLines, 
  accountBalancesNew,
  financialPeriods,
  type JournalEntry,
  type JournalEntryLine,
} from '../../../drizzle/financial-schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { logger } from '../../logger.js';
import { 
  AccountType, 
  FARMER_COA, 
  getAccountByCode,
} from './chart-of-accounts';

export interface JournalEntryInput {
  userId: number;
  entryDate: Date;
  description: string;
  reference?: string;
  lines: {
    accountCode: string;
    debit: number; // in cents
    credit: number; // in cents
    description?: string;
    farmId?: number;
    cropId?: number;
    costCenter?: string;
  }[];
}

export interface FinancialStatement {
  period: {
    startDate: Date;
    endDate: Date;
  };
  [key: string]: any;
}

export class AccountingService {
  /**
   * Create a journal entry with double-entry validation
   */
  async createJournalEntry(input: JournalEntryInput): Promise<number> {
    // Validate double-entry: sum of debits = sum of credits
    const totalDebits = input.lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = input.lines.reduce((sum, line) => sum + line.credit, 0);

    if (totalDebits !== totalCredits) {
      throw new Error(
        `Journal entry is unbalanced. Debits: ₦${(totalDebits / 100).toFixed(2)}, Credits: ₦${(totalCredits / 100).toFixed(2)}`
      );
    }

    if (totalDebits === 0 && totalCredits === 0) {
      throw new Error('Journal entry cannot have zero debits and credits');
    }

    // Validate all account codes exist
    for (const line of input.lines) {
      const account = getAccountByCode(line.accountCode);
      if (!account) {
        throw new Error(`Invalid account code: ${line.accountCode}`);
      }
      if (!account.isActive) {
        throw new Error(`Account ${line.accountCode} is inactive`);
      }
    }

    // Generate entry number
    const entryNumber = await this.generateEntryNumber(input.userId);

    // Get database instance
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Create journal entry
    const [entry] = await database.insert(journalEntries).values({
      userId: input.userId,
      entryNumber,
      entryDate: input.entryDate,
      description: input.description,
      reference: input.reference,
      status: 'draft',
      createdBy: input.userId,
    }).returning();

    // Create journal entry lines
    await database.insert(journalEntryLines).values(
      input.lines.map(line => ({
        journalEntryId: entry.id,
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
        farmId: line.farmId,
        cropId: line.cropId,
        costCenter: line.costCenter,
      }))
    );

    logger.info(`[Accounting] Created journal entry ${entryNumber} for user ${input.userId}`);
    return entry.id;
  }

  /**
   * Post a journal entry (make it permanent and update balances)
   */
  async postJournalEntry(entryId: number, userId: number): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get entry
    const [entry] = await database
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, entryId))
      .limit(1);

    if (!entry) {
      throw new Error('Journal entry not found');
    }

    if (entry.userId !== userId) {
      throw new Error('Unauthorized: You do not own this journal entry');
    }

    if (entry.status !== 'draft') {
      throw new Error(`Journal entry is already ${entry.status}`);
    }

    // Get lines
    const lines = await database
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, entryId));

    // Update account balances
    const fiscalYear = entry.entryDate.getFullYear();

    for (const line of lines) {
      const netChange = line.debit - line.credit;

      // Upsert account balance
      await database
        .insert(accountBalancesNew)
        .values({
          userId: entry.userId,
          accountCode: line.accountCode,
          balance: netChange,
          fiscalYear,
          currency: 'NGN',
        })
        .onConflictDoUpdate({
          target: [accountBalancesNew.userId, accountBalancesNew.accountCode, accountBalancesNew.fiscalYear],
          set: {
            balance: sql`${accountBalancesNew.balance} + ${netChange}`,
            lastUpdated: new Date(),
          },
        });
    }

    // Mark as posted
    await database.update(journalEntries)
      .set({ 
        status: 'posted', 
        postedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(journalEntries.id, entryId));

    logger.info(`[Accounting] Posted journal entry ${entry.entryNumber}`);
  }

  /**
   * Reverse a journal entry
   */
  async reverseJournalEntry(entryId: number, userId: number, reason: string): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get original entry
    const [originalEntry] = await database
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, entryId))
      .limit(1);

    if (!originalEntry) {
      throw new Error('Journal entry not found');
    }

    if (originalEntry.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (originalEntry.status !== 'posted') {
      throw new Error('Can only reverse posted entries');
    }

    // Get original lines
    const originalLines = await database
      .select()
      .from(journalEntryLines)
      .where(eq(journalEntryLines.journalEntryId, entryId));

    // Create reversing entry (swap debits and credits)
    const reversingEntry = await this.createJournalEntry({
      userId,
      entryDate: new Date(),
      description: `REVERSAL: ${originalEntry.description}`,
      reference: `REV-${originalEntry.entryNumber}`,
      lines: originalLines.map((line: Record<string, any>) => ({
        accountCode: line.accountCode,
        debit: line.credit, // Swap
        credit: line.debit, // Swap
        description: line.description || undefined,
        farmId: line.farmId || undefined,
        cropId: line.cropId || undefined,
        costCenter: line.costCenter || undefined,
      })),
    });

    // Post the reversing entry
    await this.postJournalEntry(reversingEntry, userId);

    // Mark original as reversed
    await database.update(journalEntries)
      .set({ 
        status: 'reversed', 
        reversedAt: new Date(),
        reversalReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(journalEntries.id, entryId));

    logger.info(`[Accounting] Reversed journal entry ${originalEntry.entryNumber}`);
    return reversingEntry;
  }

  /**
   * Get Profit & Loss Statement
   */
  async getProfitAndLoss(userId: number, startDate: Date, endDate: Date): Promise<FinancialStatement> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get all posted entries in period
    const entries = await database
      .select()
      .from(journalEntries)
      .where(and(
        eq(journalEntries.userId, userId),
        eq(journalEntries.status, 'posted'),
        sql`${journalEntries.entryDate} >= ${startDate}`,
        sql`${journalEntries.entryDate} <= ${endDate}`
      ));

    if (entries.length === 0) {
      return {
        period: { startDate, endDate },
        revenue: {},
        totalRevenue: 0,
        expenses: {},
        totalExpenses: 0,
        netIncome: 0,
        profitMargin: 0,
      };
    }

    const entryIds = entries.map((e: Record<string, any>) => e.id);

    // Get all lines for these entries
    const lines = await database
      .select()
      .from(journalEntryLines)
      .where(sql`${journalEntryLines.journalEntryId} = ANY(${entryIds})`);

    const revenue: Record<string, number> = {};
    const expenses: Record<string, number> = {};

    for (const line of lines) {
      const account = getAccountByCode(line.accountCode);
      if (!account) continue;

      if (account.type === AccountType.REVENUE) {
        // Revenue increases with credits, decreases with debits
        const amount = line.credit - line.debit;
        revenue[account.name] = (revenue[account.name] || 0) + amount;
      } else if (account.type === AccountType.EXPENSE) {
        // Expenses increase with debits, decrease with credits
        const amount = line.debit - line.credit;
        expenses[account.name] = (expenses[account.name] || 0) + amount;
      }
    }

    const totalRevenue = Object.values(revenue).reduce((sum, val) => sum + val, 0);
    const totalExpenses = Object.values(expenses).reduce((sum, val) => sum + val, 0);
    const netIncome = totalRevenue - totalExpenses;

    return {
      period: { startDate, endDate },
      revenue,
      totalRevenue,
      expenses,
      totalExpenses,
      netIncome,
      profitMargin: totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0,
    };
  }

  /**
   * Get Balance Sheet
   */
  async getBalanceSheet(userId: number, asOfDate: Date): Promise<FinancialStatement> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const fiscalYear = asOfDate.getFullYear();

    // Get account balances
    const balances = await database
      .select()
      .from(accountBalancesNew)
      .where(and(
        eq(accountBalancesNew.userId, userId),
        eq(accountBalancesNew.fiscalYear, fiscalYear)
      ));

    const assetsList: Array<{ accountCode: string; accountName: string; balance: number }> = [];
    const liabilitiesList: Array<{ accountCode: string; accountName: string; balance: number }> = [];
    const equityList: Array<{ accountCode: string; accountName: string; balance: number }> = [];

    for (const balance of balances) {
      const account = getAccountByCode(balance.accountCode);
      if (!account) continue;

      const item = {
        accountCode: balance.accountCode,
        accountName: account.name,
        balance: balance.balance,
      };

      if (account.type === AccountType.ASSET) {
        assetsList.push(item);
      } else if (account.type === AccountType.LIABILITY) {
        liabilitiesList.push(item);
      } else if (account.type === AccountType.EQUITY) {
        equityList.push(item);
      }
    }

    const totalAssets = assetsList.reduce((sum, item) => sum + item.balance, 0);
    const totalLiabilities = liabilitiesList.reduce((sum, item) => sum + item.balance, 0);
    const totalEquity = equityList.reduce((sum, item) => sum + item.balance, 0);

    // Accounting equation: Assets = Liabilities + Equity
    const balanceCheck = totalAssets - (totalLiabilities + totalEquity);

    return {
      period: { startDate: new Date(fiscalYear, 0, 1), endDate: asOfDate },
      asOfDate,
      assets: assetsList,
      totalAssets,
      liabilities: liabilitiesList,
      totalLiabilities,
      equity: equityList,
      totalEquity,
      balanceCheck, // Should be 0 or close to 0
    };
  }

  /**
   * Get Cash Flow Statement
   */
  async getCashFlowStatement(userId: number, startDate: Date, endDate: Date): Promise<FinancialStatement> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get all posted entries in period
    const entries = await database
      .select()
      .from(journalEntries)
      .where(and(
        eq(journalEntries.userId, userId),
        eq(journalEntries.status, 'posted'),
        sql`${journalEntries.entryDate} >= ${startDate}`,
        sql`${journalEntries.entryDate} <= ${endDate}`
      ));

    if (entries.length === 0) {
      return {
        period: { startDate, endDate },
        operatingActivities: {},
        totalOperating: 0,
        investingActivities: {},
        totalInvesting: 0,
        financingActivities: {},
        totalFinancing: 0,
        netCashFlow: 0,
      };
    }

    const entryIds = entries.map((e: Record<string, any>) => e.id);

    // Get all lines for these entries
    const lines = await database
      .select()
      .from(journalEntryLines)
      .where(sql`${journalEntryLines.journalEntryId} = ANY(${entryIds})`);

    const operatingActivities: Record<string, number> = {};
    const investingActivities: Record<string, number> = {};
    const financingActivities: Record<string, number> = {};

    // Classify cash flows
    for (const line of lines) {
      const account = getAccountByCode(line.accountCode);
      if (!account) continue;

      // Only track cash accounts (1000-1022)
      const isCashAccount = ['1000', '1010', '1011', '1012', '1020', '1021', '1022'].includes(line.accountCode);
      if (!isCashAccount) continue;

      const cashFlow = line.debit - line.credit;

      // Operating activities (revenue and expenses)
      operatingActivities['Net cash from operations'] = (operatingActivities['Net cash from operations'] || 0) + cashFlow;
    }

    const totalOperating = Object.values(operatingActivities).reduce((sum, val) => sum + val, 0);
    const totalInvesting = Object.values(investingActivities).reduce((sum, val) => sum + val, 0);
    const totalFinancing = Object.values(financingActivities).reduce((sum, val) => sum + val, 0);
    const netCashFlow = totalOperating + totalInvesting + totalFinancing;

    return {
      period: { startDate, endDate },
      operatingActivities,
      totalOperating,
      investingActivities,
      totalInvesting,
      financingActivities,
      totalFinancing,
      netCashFlow,
    };
  }

  /**
   * Close financial period
   */
  async closeFinancialPeriod(userId: number, periodId: number): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const [period] = await database
      .select()
      .from(financialPeriods)
      .where(eq(financialPeriods.id, periodId))
      .limit(1);

    if (!period) {
      throw new Error('Financial period not found');
    }

    if (period.userId !== userId) {
      throw new Error('Unauthorized');
    }

    if (period.status !== 'open') {
      throw new Error(`Period is already ${period.status}`);
    }

    // Close the period
    await database.update(financialPeriods)
      .set({ 
        status: 'closed', 
        closedAt: new Date(),
        closedBy: userId,
      })
      .where(eq(financialPeriods.id, periodId));

    // Transfer net income to retained earnings
    const pl = await this.getProfitAndLoss(userId, period.startDate, period.endDate);
    
    if (pl.netIncome !== 0) {
      await this.createJournalEntry({
        userId,
        entryDate: period.endDate,
        description: `Period closing: Transfer net income to retained earnings`,
        reference: `CLOSE-${period.periodName}`,
        lines: [
          {
            accountCode: pl.netIncome > 0 ? '4000' : '5000', // Revenue or Expense summary
            debit: pl.netIncome > 0 ? pl.netIncome : 0,
            credit: pl.netIncome < 0 ? Math.abs(pl.netIncome) : 0,
          },
          {
            accountCode: '3100', // Retained Earnings
            debit: pl.netIncome < 0 ? Math.abs(pl.netIncome) : 0,
            credit: pl.netIncome > 0 ? pl.netIncome : 0,
          },
        ],
      });
    }

    logger.info(`[Accounting] Closed financial period ${period.periodName}`);
  }

  /**
   * Get account balance
   */
  async getAccountBalance(userId: number, accountCode: string, fiscalYear?: number): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const year = fiscalYear || new Date().getFullYear();

    const [balance] = await database
      .select()
      .from(accountBalancesNew)
      .where(and(
        eq(accountBalancesNew.userId, userId),
        eq(accountBalancesNew.accountCode, accountCode),
        eq(accountBalancesNew.fiscalYear, year)
      ))
      .limit(1);

    return balance?.balance || 0;
  }

  /**
   * Get journal entries for user
   */
  async getJournalEntries(userId: number, limit: number = 50): Promise<JournalEntry[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    return await database
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.userId, userId))
      .orderBy(desc(journalEntries.entryDate))
      .limit(limit);
  }

  /**
   * Generate entry number (JE-YYYY-NNNNN)
   */
  private async generateEntryNumber(userId: number): Promise<string> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const year = new Date().getFullYear();
    
    const result = await database
      .select({ count: sql<number>`count(*)` })
      .from(journalEntries)
      .where(and(
        eq(journalEntries.userId, userId),
        sql`EXTRACT(YEAR FROM ${journalEntries.entryDate}) = ${year}`
      ));

    const count = Number(result[0]?.count) || 0;
    const nextNumber = count + 1;
    
    return `JE-${year}-${String(nextNumber).padStart(5, '0')}`;
  }
}

// Export singleton instance
export const accountingService = new AccountingService();
