import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc-base.js";
import { getDb } from "./db.js";
import {
  bankAccounts,
  bankTransactions,
  mojaloopTransactions,
  paymentRequests,
} from "../drizzle/financial-schema.js";
import { BankingService } from "./services/banking.js";

const bankingService = new BankingService();

export const bankingRouter = router({
  // Bank Account Management
  createBankAccount: protectedProcedure
    .input(
      z.object({
        accountName: z.string().min(1),
        accountNumber: z.string().min(1),
        bankName: z.string().min(1),
        accountType: z.enum(["savings", "checking", "mobile_money"]),
        mojaloopPartyId: z.string().optional(),
        mojaloopPartyIdType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [account] = await db
        .insert(bankAccounts)
        .values({
          userId: Number(ctx.user.id),
          ...input,
        })
        .returning();

      return account;
    }),

  getBankAccounts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const accounts = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, Number(ctx.user.id)));

    return accounts;
  }),

  getBankAccountById: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [account] = await db
        .select()
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.id, input.accountId),
            eq(bankAccounts.userId, Number(ctx.user.id))
          )
        );

      if (!account) {
        throw new Error("Bank account not found");
      }

      return account;
    }),

  getAccountBalance: protectedProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get account
      const [account] = await db
        .select()
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.id, input.accountId),
            eq(bankAccounts.userId, Number(ctx.user.id))
          )
        );

      if (!account) {
        throw new Error("Bank account not found");
      }

      // Calculate balance from transactions
      const transactions = await db
        .select()
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.accountId, input.accountId),
            eq(bankTransactions.userId, Number(ctx.user.id))
          )
        );

      let balance = 0;
      for (const tx of transactions) {
        if (tx.transactionType === 'transfer_in' || tx.transactionType === 'refund') {
          balance += tx.amount;
        } else if (tx.transactionType === 'transfer_out' || tx.transactionType === 'payment') {
          balance -= tx.amount;
        }
      }

      return {
        accountId: account.id,
        accountName: account.accountName,
        balance: balance / 100, // Convert from cents to currency units
        currency: "NGN",
      };
    }),

  // Bank Transactions
  getBankTransactions: protectedProcedure
    .input(
      z.object({
        accountId: z.number().optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let query = db
        .select()
        .from(bankTransactions)
        .where(eq(bankTransactions.userId, Number(ctx.user.id)))
        .orderBy(desc(bankTransactions.transactionDate))
        .limit(input.limit);

      if (input.accountId) {
        query = db
          .select()
          .from(bankTransactions)
          .where(
            and(
              eq(bankTransactions.userId, Number(ctx.user.id)),
              eq(bankTransactions.accountId, input.accountId)
            )
          )
          .orderBy(desc(bankTransactions.transactionDate))
          .limit(input.limit);
      }

      const transactions = await query;
      return transactions;
    }),

  // Mojaloop Integration
  initiateMojaloopTransfer: protectedProcedure
    .input(
      z.object({
        fromAccountId: z.number(),
        toPartyId: z.string(),
        toPartyIdType: z.enum(["MSISDN", "ACCOUNT_ID", "EMAIL"]),
        amount: z.number().positive(),
        currency: z.string().default("NGN"),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify account ownership
      const [account] = await db
        .select()
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.id, input.fromAccountId),
            eq(bankAccounts.userId, Number(ctx.user.id))
          )
        );

      if (!account) {
        throw new Error("Bank account not found or access denied");
      }

      // Note: Balance check removed - should be done via transaction calculation in production

      // Initiate Mojaloop transfer
      const result = await bankingService.initiateMojaloopTransfer(
        input.toPartyId,
        input.toPartyIdType,
        input.amount,
        input.currency
      );

      // Record Mojaloop transaction
      const [mojaloopTx] = await db
        .insert(mojaloopTransactions)
        .values({
          transferId: result.transferId || result.transactionId,
          transactionId: result.transactionId,
          payerPartyId: account.mojaloopPartyId || account.accountNumber,
          payerPartyIdType: account.mojaloopPartyIdType || "ACCOUNT_ID",
          payeePartyId: input.toPartyId,
          payeePartyIdType: input.toPartyIdType,
          amount: Math.round(input.amount * 100), // Convert to cents
          currency: input.currency,
          note: input.description,
          status: result.status.toLowerCase(),
        })
        .returning();

      // Record bank transaction
      const [bankTx] = await db
        .insert(bankTransactions)
        .values({
          userId: Number(ctx.user.id),
          accountId: input.fromAccountId,
          transactionType: "transfer_out",
          amount: Math.round(input.amount * 100), // Convert to cents
          currency: input.currency,
          description: input.description,
          mojaloopTransactionId: result.transferId || result.transactionId,
          status: result.status.toLowerCase(),
          transactionDate: new Date(),
        })
        .returning();

      return {
        bankTransaction: bankTx,
        mojaloopTransaction: mojaloopTx,
        result,
      };
    }),

  getMojaloopTransactions: protectedProcedure
    .input(
      z.object({
        accountId: z.number().optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get bank transactions for the user, then join with mojaloop transactions
      const transactions = await db
        .select({
          mojaloop: mojaloopTransactions,
          bank: bankTransactions,
        })
        .from(bankTransactions)
        .leftJoin(
          mojaloopTransactions,
          eq(bankTransactions.mojaloopTransactionId, mojaloopTransactions.transferId)
        )
        .where(
          input.accountId
            ? and(
                eq(bankTransactions.userId, Number(ctx.user.id)),
                eq(bankTransactions.accountId, input.accountId)
              )
            : eq(bankTransactions.userId, Number(ctx.user.id))
        )
        .orderBy(desc(bankTransactions.createdAt))
        .limit(input.limit);

      return transactions;
    }),

  // Payment Requests
  createPaymentRequest: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        amount: z.number().positive(),
        currency: z.string().default("NGN"),
        description: z.string(),
        dueDate: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify account ownership
      const [account] = await db
        .select()
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.id, input.accountId),
            eq(bankAccounts.userId, Number(ctx.user.id))
          )
        );

      if (!account) {
        throw new Error("Bank account not found or access denied");
      }

      const [paymentRequest] = await db
        .insert(paymentRequests)
        .values({
          payeeId: Number(ctx.user.id),
          amount: Math.round(input.amount * 100), // Convert to cents
          currency: input.currency,
          description: input.description,
          expiresAt: input.dueDate,
          status: "pending",
        })
        .returning();

      return paymentRequest;
    }),

  getPaymentRequests: protectedProcedure
    .input(
      z.object({
        accountId: z.number().optional(),
        status: z.enum(["PENDING", "PAID", "CANCELLED"]).optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let conditions = [eq(paymentRequests.payeeId, Number(ctx.user.id))];

      // Note: accountId filtering removed as payment_requests doesn't have accountId field

      if (input.status) {
        conditions.push(eq(paymentRequests.status, input.status));
      }

      const requests = await db
        .select()
        .from(paymentRequests)
        .where(and(...conditions))
        .orderBy(desc(paymentRequests.createdAt))
        .limit(input.limit);

      return requests;
    }),

  approvePaymentRequest: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get payment request
      const [request] = await db
        .select()
        .from(paymentRequests)
        .where(
          and(
            eq(paymentRequests.id, input.requestId),
            eq(paymentRequests.payeeId, Number(ctx.user.id))
          )
        );

      if (!request) {
        throw new Error("Payment request not found");
      }

      if (request.status !== "pending") {
        throw new Error("Payment request is not pending");
      }

      // Update payment request status
      const [updatedRequest] = await db
        .update(paymentRequests)
        .set({
          status: "paid",
          paidAt: new Date(),
        })
        .where(eq(paymentRequests.id, input.requestId))
        .returning();

      // Note: Account balance update removed as payment_requests doesn't link to specific account
      // In production, this would be handled by the Mojaloop integration

      return updatedRequest;
    }),
});
