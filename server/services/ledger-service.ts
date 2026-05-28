import { db, getDb } from "../db.js";
import { eq, and, sql, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  ledgerAccounts,
  ledgerTransactions,
  ledgerEntries,
  ledgerHolds,
  ledgerFeeSchedule,
} from "../../drizzle/ledger-schema.js";
import { randomUUID } from "crypto";

// Use Node.js built-in crypto.randomUUID() instead of uuid package
const uuidv4 = () => randomUUID();

// Type for transaction callback
type TransactionCallback = NodePgDatabase<Record<string, unknown>>;

// Unified Financial Ledger Service
// Handles all financial transactions across marketplace, microfinance, banking, and exchange

export type TransactionType =
  | "deposit"
  | "withdrawal"
  | "transfer"
  | "loan_disbursement"
  | "loan_repayment"
  | "marketplace_payment"
  | "marketplace_settlement"
  | "exchange_trade"
  | "exchange_settlement"
  | "fee"
  | "refund"
  | "adjustment";

export type SourceType = "loan" | "order" | "trade" | "payment" | "manual";

export type AccountOwnerType = "farmer" | "trader" | "lender" | "platform" | "escrow";

export interface CreateAccountParams {
  ownerType: AccountOwnerType;
  ownerId?: number;
  accountTypeId: number;
  currency?: string;
}

export interface TransferParams {
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  transactionType: TransactionType;
  sourceType: SourceType;
  sourceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdBy?: number;
}

export interface HoldParams {
  accountId: number;
  amount: number;
  holdType: string;
  referenceType: string;
  referenceId: string;
  expiresAt?: Date;
}

class LedgerService {
  // Generate unique account number
  private generateAccountNumber(ownerType: string): string {
    const prefix = {
      farmer: "FRM",
      trader: "TRD",
      lender: "LND",
      platform: "PLT",
      escrow: "ESC",
    }[ownerType] || "ACC";
    
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomUUID().slice(0, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  // Create a new ledger account
  async createAccount(params: CreateAccountParams): Promise<typeof ledgerAccounts.$inferSelect> {
    const accountNumber = this.generateAccountNumber(params.ownerType);
    
    const [account] = await db!
      .insert(ledgerAccounts)
      .values({
        accountNumber,
        accountTypeId: params.accountTypeId,
        ownerType: params.ownerType,
        ownerId: params.ownerId,
        currency: params.currency || "NGN",
        balance: 0,
        availableBalance: 0,
        pendingCredits: 0,
        pendingDebits: 0,
        status: "active",
      })
      .returning();
    
    return account;
  }

  // Get account by owner
  async getAccountByOwner(ownerType: string, ownerId: number): Promise<typeof ledgerAccounts.$inferSelect | null> {
    const [account] = await db!
      .select()
      .from(ledgerAccounts)
      .where(and(
        eq(ledgerAccounts.ownerType, ownerType),
        eq(ledgerAccounts.ownerId, ownerId)
      ))
      .limit(1);
    
    return account || null;
  }

  // Get or create account for owner
  async getOrCreateAccount(params: CreateAccountParams): Promise<typeof ledgerAccounts.$inferSelect> {
    if (params.ownerId) {
      const existing = await this.getAccountByOwner(params.ownerType, params.ownerId);
      if (existing) return existing;
    }
    return this.createAccount(params);
  }

  // Execute a transfer between accounts (double-entry)
  async transfer(params: TransferParams): Promise<typeof ledgerTransactions.$inferSelect> {
    const transactionId = uuidv4();
    
    return await db!.transaction(async (tx: TransactionCallback) => {
      // Get both accounts with lock
      const [fromAccount] = await tx
        .select()
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.id, params.fromAccountId))
        .for("update");
      
      const [toAccount] = await tx
        .select()
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.id, params.toAccountId))
        .for("update");
      
      if (!fromAccount || !toAccount) {
        throw new Error("Account not found");
      }
      
      if (fromAccount.status !== "active" || toAccount.status !== "active") {
        throw new Error("Account is not active");
      }
      
      if (fromAccount.availableBalance < params.amount) {
        throw new Error("Insufficient available balance");
      }
      
      // Create transaction record
      const [transaction] = await tx
        .insert(ledgerTransactions)
        .values({
          transactionId,
          transactionType: params.transactionType,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          amount: params.amount,
          currency: fromAccount.currency,
          status: "completed",
          createdBy: params.createdBy,
          description: params.description,
          metadata: params.metadata ? JSON.stringify(params.metadata) : null,
          completedAt: new Date(),
        })
        .returning();
      
      // Debit from source account
      const newFromBalance = fromAccount.balance - params.amount;
      const newFromAvailable = fromAccount.availableBalance - params.amount;
      
      await tx
        .update(ledgerAccounts)
        .set({
          balance: newFromBalance,
          availableBalance: newFromAvailable,
          updatedAt: new Date(),
        })
        .where(eq(ledgerAccounts.id, params.fromAccountId));
      
      await tx
        .insert(ledgerEntries)
        .values({
          transactionId: transaction.id,
          accountId: params.fromAccountId,
          entryType: "debit",
          amount: params.amount,
          balanceAfter: newFromBalance,
        });
      
      // Credit to destination account
      const newToBalance = toAccount.balance + params.amount;
      const newToAvailable = toAccount.availableBalance + params.amount;
      
      await tx
        .update(ledgerAccounts)
        .set({
          balance: newToBalance,
          availableBalance: newToAvailable,
          updatedAt: new Date(),
        })
        .where(eq(ledgerAccounts.id, params.toAccountId));
      
      await tx
        .insert(ledgerEntries)
        .values({
          transactionId: transaction.id,
          accountId: params.toAccountId,
          entryType: "credit",
          amount: params.amount,
          balanceAfter: newToBalance,
        });
      
      return transaction;
    });
  }

  // Create a hold on account balance
  async createHold(params: HoldParams): Promise<typeof ledgerHolds.$inferSelect> {
    return await db!.transaction(async (tx: TransactionCallback) => {
      const [account] = await tx
        .select()
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.id, params.accountId))
        .for("update");
      
      if (!account) {
        throw new Error("Account not found");
      }
      
      if (account.availableBalance < params.amount) {
        throw new Error("Insufficient available balance for hold");
      }
      
      // Reduce available balance
      await tx
        .update(ledgerAccounts)
        .set({
          availableBalance: account.availableBalance - params.amount,
          updatedAt: new Date(),
        })
        .where(eq(ledgerAccounts.id, params.accountId));
      
      // Create hold record
      const [hold] = await tx
        .insert(ledgerHolds)
        .values({
          accountId: params.accountId,
          holdType: params.holdType,
          referenceType: params.referenceType,
          referenceId: params.referenceId,
          amount: params.amount,
          status: "active",
          expiresAt: params.expiresAt,
        })
        .returning();
      
      return hold;
    });
  }

  // Release a hold
  async releaseHold(holdId: number, reason?: string): Promise<void> {
    await db!.transaction(async (tx: TransactionCallback) => {
      const [hold] = await tx
        .select()
        .from(ledgerHolds)
        .where(eq(ledgerHolds.id, holdId))
        .for("update");
      
      if (!hold || hold.status !== "active") {
        throw new Error("Hold not found or already released");
      }
      
      const [account] = await tx
        .select()
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.id, hold.accountId))
        .for("update");
      
      if (!account) {
        throw new Error("Account not found");
      }
      
      // Restore available balance
      await tx
        .update(ledgerAccounts)
        .set({
          availableBalance: account.availableBalance + hold.amount,
          updatedAt: new Date(),
        })
        .where(eq(ledgerAccounts.id, hold.accountId));
      
      // Update hold status
      await tx
        .update(ledgerHolds)
        .set({
          status: "released",
          releasedAt: new Date(),
          releaseReason: reason,
        })
        .where(eq(ledgerHolds.id, holdId));
    });
  }

  // Capture a hold (convert to actual debit)
  async captureHold(holdId: number, toAccountId: number, params: Omit<TransferParams, "fromAccountId" | "toAccountId" | "amount">): Promise<typeof ledgerTransactions.$inferSelect> {
    return await db!.transaction(async (tx: TransactionCallback) => {
      const [hold] = await tx
        .select()
        .from(ledgerHolds)
        .where(eq(ledgerHolds.id, holdId))
        .for("update");
      
      if (!hold || hold.status !== "active") {
        throw new Error("Hold not found or already processed");
      }
      
      // Update hold status
      await tx
        .update(ledgerHolds)
        .set({
          status: "captured",
          releasedAt: new Date(),
        })
        .where(eq(ledgerHolds.id, holdId));
      
      // The available balance was already reduced when hold was created
      // Now we need to reduce the actual balance and transfer
      const [fromAccount] = await tx
        .select()
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.id, hold.accountId))
        .for("update");
      
      const [toAccount] = await tx
        .select()
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.id, toAccountId))
        .for("update");
      
      if (!fromAccount || !toAccount) {
        throw new Error("Account not found");
      }
      
      const transactionId = uuidv4();
      
      // Create transaction
      const [transaction] = await tx
        .insert(ledgerTransactions)
        .values({
          transactionId,
          transactionType: params.transactionType,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          amount: hold.amount,
          currency: fromAccount.currency,
          status: "completed",
          createdBy: params.createdBy,
          description: params.description,
          metadata: params.metadata ? JSON.stringify(params.metadata) : null,
          completedAt: new Date(),
        })
        .returning();
      
      // Debit from source (balance only, available was already reduced)
      const newFromBalance = fromAccount.balance - hold.amount;
      
      await tx
        .update(ledgerAccounts)
        .set({
          balance: newFromBalance,
          updatedAt: new Date(),
        })
        .where(eq(ledgerAccounts.id, hold.accountId));
      
      await tx
        .insert(ledgerEntries)
        .values({
          transactionId: transaction.id,
          accountId: hold.accountId,
          entryType: "debit",
          amount: hold.amount,
          balanceAfter: newFromBalance,
        });
      
      // Credit to destination
      const newToBalance = toAccount.balance + hold.amount;
      const newToAvailable = toAccount.availableBalance + hold.amount;
      
      await tx
        .update(ledgerAccounts)
        .set({
          balance: newToBalance,
          availableBalance: newToAvailable,
          updatedAt: new Date(),
        })
        .where(eq(ledgerAccounts.id, toAccountId));
      
      await tx
        .insert(ledgerEntries)
        .values({
          transactionId: transaction.id,
          accountId: toAccountId,
          entryType: "credit",
          amount: hold.amount,
          balanceAfter: newToBalance,
        });
      
      return transaction;
    });
  }

  // Get account balance
  async getBalance(accountId: number): Promise<{
    balance: number;
    availableBalance: number;
    pendingCredits: number;
    pendingDebits: number;
  }> {
    const [account] = await db!
      .select({
        balance: ledgerAccounts.balance,
        availableBalance: ledgerAccounts.availableBalance,
        pendingCredits: ledgerAccounts.pendingCredits,
        pendingDebits: ledgerAccounts.pendingDebits,
      })
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.id, accountId));
    
    if (!account) {
      throw new Error("Account not found");
    }
    
    return account;
  }

  // Get transaction history for an account
  async getTransactionHistory(accountId: number, limit = 50, offset = 0): Promise<Array<{
    transaction: typeof ledgerTransactions.$inferSelect;
    entry: typeof ledgerEntries.$inferSelect;
  }>> {
    const results = await db!
      .select({
        transaction: ledgerTransactions,
        entry: ledgerEntries,
      })
      .from(ledgerEntries)
      .innerJoin(ledgerTransactions, eq(ledgerEntries.transactionId, ledgerTransactions.id))
      .where(eq(ledgerEntries.accountId, accountId))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(limit)
      .offset(offset);
    
    return results;
  }

  // Calculate fee for a transaction
  async calculateFee(transactionType: TransactionType, amount: number): Promise<number> {
    const [feeSchedule] = await db!
      .select()
      .from(ledgerFeeSchedule)
      .where(and(
        eq(ledgerFeeSchedule.isActive, true),
        sql`${ledgerFeeSchedule.transactionTypes}::jsonb ? ${transactionType}`
      ))
      .limit(1);
    
    if (!feeSchedule) {
      return 0;
    }
    
    let fee = 0;
    
    if (feeSchedule.feeType === "flat" && feeSchedule.flatAmount) {
      fee = feeSchedule.flatAmount;
    } else if (feeSchedule.feeType === "percentage" && feeSchedule.percentageRate) {
      fee = Math.round(amount * Number(feeSchedule.percentageRate));
    }
    
    // Apply min/max caps
    if (feeSchedule.minAmount && fee < feeSchedule.minAmount) {
      fee = feeSchedule.minAmount;
    }
    if (feeSchedule.maxAmount && fee > feeSchedule.maxAmount) {
      fee = feeSchedule.maxAmount;
    }
    
    return fee;
  }

  // Deposit funds (external source)
  async deposit(accountId: number, amount: number, sourceType: SourceType, sourceId?: string, description?: string): Promise<typeof ledgerTransactions.$inferSelect> {
    const transactionId = uuidv4();
    
    return await db!.transaction(async (tx: TransactionCallback) => {
      const [account] = await tx
        .select()
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.id, accountId))
        .for("update");
      
      if (!account) {
        throw new Error("Account not found");
      }
      
      // Create transaction
      const [transaction] = await tx
        .insert(ledgerTransactions)
        .values({
          transactionId,
          transactionType: "deposit",
          sourceType,
          sourceId,
          amount,
          currency: account.currency,
          status: "completed",
          description,
          completedAt: new Date(),
        })
        .returning();
      
      // Credit account
      const newBalance = account.balance + amount;
      const newAvailable = account.availableBalance + amount;
      
      await tx
        .update(ledgerAccounts)
        .set({
          balance: newBalance,
          availableBalance: newAvailable,
          updatedAt: new Date(),
        })
        .where(eq(ledgerAccounts.id, accountId));
      
      await tx
        .insert(ledgerEntries)
        .values({
          transactionId: transaction.id,
          accountId,
          entryType: "credit",
          amount,
          balanceAfter: newBalance,
        });
      
      return transaction;
    });
  }

  // Withdraw funds (external destination)
  async withdraw(accountId: number, amount: number, sourceType: SourceType, sourceId?: string, description?: string): Promise<typeof ledgerTransactions.$inferSelect> {
    const transactionId = uuidv4();
    
    return await db!.transaction(async (tx: TransactionCallback) => {
      const [account] = await tx
        .select()
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.id, accountId))
        .for("update");
      
      if (!account) {
        throw new Error("Account not found");
      }
      
      if (account.availableBalance < amount) {
        throw new Error("Insufficient available balance");
      }
      
      // Create transaction
      const [transaction] = await tx
        .insert(ledgerTransactions)
        .values({
          transactionId,
          transactionType: "withdrawal",
          sourceType,
          sourceId,
          amount,
          currency: account.currency,
          status: "completed",
          description,
          completedAt: new Date(),
        })
        .returning();
      
      // Debit account
      const newBalance = account.balance - amount;
      const newAvailable = account.availableBalance - amount;
      
      await tx
        .update(ledgerAccounts)
        .set({
          balance: newBalance,
          availableBalance: newAvailable,
          updatedAt: new Date(),
        })
        .where(eq(ledgerAccounts.id, accountId));
      
      await tx
        .insert(ledgerEntries)
        .values({
          transactionId: transaction.id,
          accountId,
          entryType: "debit",
          amount,
          balanceAfter: newBalance,
        });
      
      return transaction;
    });
  }
}

export const ledgerService = new LedgerService();
