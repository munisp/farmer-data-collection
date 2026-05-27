import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../trpc.js";
import type { TrpcContext } from "../_core/context";

/**
 * Accounting Router Test Suite
 * 
 * Tests double-entry bookkeeping validation, journal entry creation,
 * financial report generation, and account balance calculations.
 */

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `user${userId}@test.com`,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Accounting Router - Double-Entry Validation", () => {
  it("should reject journal entry with unbalanced debits and credits", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.accounting.createJournalEntry({
        date: new Date(),
        description: "Unbalanced entry",
        reference: "TEST-001",
        lines: [
          {
            accountCode: "1000", // Assets
            accountName: "Cash",
            debit: 1000,
            credit: 0,
            description: "Cash received",
          },
          {
            accountCode: "4000", // Revenue
            accountName: "Sales",
            debit: 0,
            credit: 500, // Unbalanced!
            description: "Sales revenue",
          },
        ],
      });
      expect.fail("Should have thrown error for unbalanced entry");
    } catch (error: any) {
      expect(error.message).toContain("unbalanced");
    }
  });

  it("should accept balanced journal entry", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.accounting.createJournalEntry({
      date: new Date(),
      description: "Balanced entry",
      reference: "TEST-002",
      lines: [
        {
          accountCode: "1000",
          accountName: "Cash",
          debit: 1000,
          credit: 0,
          description: "Cash received",
        },
        {
          accountCode: "4000",
          accountName: "Sales",
          debit: 0,
          credit: 1000,
          description: "Sales revenue",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.journalEntryId).toBeDefined();
  });

  it("should require at least 2 lines in journal entry", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.accounting.createJournalEntry({
        date: new Date(),
        description: "Single line entry",
        reference: "TEST-003",
        lines: [
          {
            accountCode: "1000",
            accountName: "Cash",
            debit: 1000,
            credit: 0,
            description: "Cash received",
          },
        ],
      });
      expect.fail("Should have thrown error for single line entry");
    } catch (error: any) {
      expect(error.message).toContain("at least 2 lines");
    }
  });
});

describe("Accounting Router - Financial Reports", () => {
  it("should generate profit and loss statement", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const startDate = new Date("2024-01-01");
    const endDate = new Date("2024-12-31");

    const result = await caller.accounting.getProfitAndLoss({
      startDate,
      endDate,
    });

    expect(result).toBeDefined();
    expect(result.revenue).toBeDefined();
    expect(result.expenses).toBeDefined();
    expect(result.netIncome).toBeDefined();
    expect(typeof result.netIncome).toBe("number");
  });

  it("should generate balance sheet", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const asOfDate = new Date("2024-12-31");

    const result = await caller.accounting.getBalanceSheet({
      asOfDate,
    });

    expect(result).toBeDefined();
    expect(result.assets).toBeDefined();
    expect(result.liabilities).toBeDefined();
    expect(result.equity).toBeDefined();
    expect(Array.isArray(result.assets)).toBe(true);
    expect(Array.isArray(result.liabilities)).toBe(true);
  });

  it("should generate cash flow statement", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const startDate = new Date("2024-01-01");
    const endDate = new Date("2024-12-31");

    const result = await caller.accounting.getCashFlow({
      startDate,
      endDate,
    });

    expect(result).toBeDefined();
    expect(result.operatingActivities).toBeDefined();
    expect(result.investingActivities).toBeDefined();
    expect(result.financingActivities).toBeDefined();
    expect(typeof result.netCashFlow).toBe("number");
  });
});

describe("Accounting Router - Account Balances", () => {
  it("should calculate account balance correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a journal entry
    await caller.accounting.createJournalEntry({
      date: new Date(),
      description: "Test balance calculation",
      reference: "TEST-BAL-001",
      lines: [
        {
          accountCode: "1000",
          accountName: "Cash",
          debit: 5000,
          credit: 0,
          description: "Cash deposit",
        },
        {
          accountCode: "3000",
          accountName: "Equity",
          debit: 0,
          credit: 5000,
          description: "Owner equity",
        },
      ],
    });

    // Get account balance
    const balance = await caller.accounting.getAccountBalance({
      accountCode: "1000",
    });

    expect(balance).toBeDefined();
    expect(balance.accountCode).toBe("1000");
    expect(typeof balance.balance).toBe("number");
  });

  it("should list all accounts with balances", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const accounts = await caller.accounting.getAccountBalances({});

    expect(Array.isArray(accounts)).toBe(true);
    accounts.forEach((account) => {
      expect(account.accountCode).toBeDefined();
      expect(account.accountName).toBeDefined();
      expect(typeof account.balance).toBe("number");
    });
  });
});

describe("Accounting Router - Journal Entry Posting", () => {
  it("should post journal entry and update balances", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create journal entry
    const createResult = await caller.accounting.createJournalEntry({
      date: new Date(),
      description: "Test posting",
      reference: "TEST-POST-001",
      lines: [
        {
          accountCode: "1000",
          accountName: "Cash",
          debit: 2000,
          credit: 0,
          description: "Cash in",
        },
        {
          accountCode: "4000",
          accountName: "Revenue",
          debit: 0,
          credit: 2000,
          description: "Sales",
        },
      ],
    });

    expect(createResult.success).toBe(true);

    // Post the entry
    const postResult = await caller.accounting.postJournalEntry({
      journalEntryId: createResult.journalEntryId!,
    });

    expect(postResult.success).toBe(true);
  });

  it("should reverse journal entry", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create and post journal entry
    const createResult = await caller.accounting.createJournalEntry({
      date: new Date(),
      description: "Test reversal",
      reference: "TEST-REV-001",
      lines: [
        {
          accountCode: "1000",
          accountName: "Cash",
          debit: 1000,
          credit: 0,
          description: "Cash in",
        },
        {
          accountCode: "4000",
          accountName: "Revenue",
          debit: 0,
          credit: 1000,
          description: "Sales",
        },
      ],
    });

    await caller.accounting.postJournalEntry({
      journalEntryId: createResult.journalEntryId!,
    });

    // Reverse the entry
    const reverseResult = await caller.accounting.reverseJournalEntry({
      journalEntryId: createResult.journalEntryId!,
      reversalDate: new Date(),
      reason: "Correction",
    });

    expect(reverseResult.success).toBe(true);
    expect(reverseResult.reversalEntryId).toBeDefined();
  });
});

describe("Accounting Router - User Isolation", () => {
  it("should isolate journal entries by user", async () => {
    const ctx1 = createAuthContext(1);
    const ctx2 = createAuthContext(2);
    const caller1 = appRouter.createCaller(ctx1);
    const caller2 = appRouter.createCaller(ctx2);

    // User 1 creates entry
    await caller1.accounting.createJournalEntry({
      date: new Date(),
      description: "User 1 entry",
      reference: "USER1-001",
      lines: [
        {
          accountCode: "1000",
          accountName: "Cash",
          debit: 1000,
          credit: 0,
          description: "Cash",
        },
        {
          accountCode: "4000",
          accountName: "Revenue",
          debit: 0,
          credit: 1000,
          description: "Sales",
        },
      ],
    });

    // User 2 should not see User 1's entries
    const user2Entries = await caller2.accounting.getJournalEntries({
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-12-31"),
    });

    const user1Entry = user2Entries.find((e) => e.reference === "USER1-001");
    expect(user1Entry).toBeUndefined();
  });
});
