/**
 * Comprehensive Tests for Microfinance Features
 * 
 * Tests all microfinance-related tRPC routers:
 * - Loans
 * - Loan Applications
 * - Repayments
 * - Credit Scores
 * - Savings
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from '../server/trpc';
import { getDb, closeDb } from '../server/db';
import { users, farmers } from '../drizzle/schema';
import { loans, loanRepayments, creditScores, creditScoreHistory, savingsAccounts, savingsTransactions } from '../drizzle/financial-schema';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

// Test user credentials
const testUser = {
  email: 'microfinance-test@example.com',
  password: 'TestPassword123!',
  name: 'Microfinance Test User',
};

let userId: number;
let farmerId: number;
let loanId: number;
let savingsAccountId: number;
let testContext: any;

// Create test context once for all tests
async function createTestContext() {
  const db = await getDb();
  if (!db) console.warn('⏭️  Database not available — skipping DB-dependent tests'); return;

  // Create test user
  const hashedPassword = await bcrypt.hash(testUser.password, 10);
  const [user] = await db
    .insert(users)
    .values({
      email: testUser.email,
      password: hashedPassword,
      firstName: 'Microfinance',
      lastName: 'Test',
      role: 'farmer',
      isActive: true,
    })
    .returning();
  userId = user.id;

  // Create test farmer
  const [farmer] = await db
    .insert(farmers)
    .values({
      userId,
      firstName: 'Test',
      lastName: 'Farmer',
      phoneNumber: '+1234567890',
      address: 'Test Location',
    })
    .returning();
  farmerId = farmer.id;

  return {
    user: { id: userId, email: testUser.email },
    req: { ip: '127.0.0.1' },
  };
}

// Clean up test data
async function cleanupTestData() {
  const db = await getDb();
  if (!db) return;

  try {
    await db.delete(loanRepayments).where(eq(loanRepayments.loanId, sql`(SELECT id FROM ${loans} WHERE user_id = ${userId})`));
    await db.delete(loans).where(eq(loans.userId, userId));
    await db.delete(savingsTransactions).where(eq(savingsTransactions.userId, userId));
    await db.delete(savingsAccounts).where(eq(savingsAccounts.userId, userId));
    await db.delete(creditScores).where(eq(creditScores.userId, userId));
    await db.delete(creditScoreHistory).where(eq(creditScoreHistory.userId, userId));
    await db.delete(farmers).where(eq(farmers.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Setup once before all tests
beforeAll(async () => {
  // Cleanup any existing test data first
  const db = await getDb();
  if (db) {
    try {
      await db.delete(users).where(eq(users.email, testUser.email));
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  testContext = await createTestContext();
});

// Cleanup once after all tests
afterAll(async () => {
  await cleanupTestData();
  await closeDb();
});

describe('Microfinance - Loans', () => {
  let caller: any;

  beforeAll(async () => {
    caller = appRouter.createCaller(testContext);
  });

  it('should create a loan application', async () => {
    const result = await caller.microfinance.loans_applyForLoan({
      farmerId,
      loanType: 'agricultural',
      requestedAmount: 5000,
      purpose: 'Purchase seeds and fertilizer',
      repaymentPeriodMonths: 12,
    });

    expect(result).toBeDefined();
    expect(result.loanType).toBe('agricultural');
    expect(result.requestedAmount).toBe(5000);
    expect(result.status).toBe('pending');
    loanId = result.id;
  });

  it('should list all loans', async () => {
    const result = await caller.microfinance.loans_list();

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe(loanId);
  });

  it('should get loan by id', async () => {
    const result = await caller.microfinance.loans_getById({ id: loanId });

    expect(result).toBeDefined();
    expect(result.id).toBe(loanId);
    expect(result.requestedAmount).toBe(5000);
  });

  it('should approve a loan', async () => {
    const result = await caller.microfinance.loans_approve({
      id: loanId,
      approvedAmount: 4500,
      interestRate: 12.5,
      notes: 'Approved with reduced amount',
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('approved');
    expect(result.approvedAmount).toBe(4500);
    expect(result.interestRate).toBe(12.5);
  });

  it('should disburse a loan', async () => {
    const result = await caller.microfinance.loans_disburse({
      id: loanId,
      disbursementMethod: 'bank_transfer',
      disbursementReference: 'TXN123456',
    });

    expect(result).toBeDefined();
    expect(result.status).toBe('active');
    expect(result.disbursementDate).toBeDefined();
  });

  it('should calculate loan summary', async () => {
    const result = await caller.microfinance.loans_getSummary({ id: loanId });

    expect(result).toBeDefined();
    expect(result.principalAmount).toBe(4500);
    expect(result.totalInterest).toBeGreaterThan(0);
    expect(result.totalAmount).toBeGreaterThan(4500);
    expect(result.monthlyPayment).toBeGreaterThan(0);
  });
});

describe('Microfinance - Repayments', () => {
  let caller: any;

  beforeAll(async () => {
    caller = appRouter.createCaller(testContext);
  });

  it('should record a repayment', async () => {
    const result = await caller.microfinance.repayments_create({
      loanId,
      amount: 500,
      paymentMethod: 'mobile_money',
      paymentReference: 'MM789012',
      notes: 'First installment',
    });

    expect(result).toBeDefined();
    expect(result.amount).toBe(500);
    expect(result.paymentMethod).toBe('mobile_money');
    expect(result.status).toBe('completed');
  });

  it('should list repayments for a loan', async () => {
    const result = await caller.microfinance.repayments_listByLoan({ loanId });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].loanId).toBe(loanId);
  });

  it('should calculate repayment schedule', async () => {
    const result = await caller.microfinance.repayments_getSchedule({ loanId });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(12); // 12 months
    expect(result[0].installmentNumber).toBe(1);
    expect(result[0].principalAmount).toBeGreaterThan(0);
    expect(result[0].interestAmount).toBeGreaterThan(0);
  });
});

describe('Microfinance - Credit Scores', () => {
  let caller: any;

  beforeAll(async () => {
    caller = appRouter.createCaller(testContext);
  });

  it('should calculate credit score for farmer', async () => {
    const result = await caller.microfinance.creditScores_calculate({ farmerId });

    expect(result).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(300);
    expect(result.score).toBeLessThanOrEqual(850);
    expect(result.rating).toBeDefined();
    expect(['poor', 'fair', 'good', 'very_good', 'excellent']).toContain(result.rating);
  });

  it('should get credit score history', async () => {
    const result = await caller.microfinance.creditScores_getHistory({ farmerId });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should get credit score factors', async () => {
    const result = await caller.microfinance.creditScores_getFactors({ farmerId });

    expect(result).toBeDefined();
    expect(result.paymentHistory).toBeDefined();
    expect(result.creditUtilization).toBeDefined();
    expect(result.creditAge).toBeDefined();
    expect(result.totalLoans).toBeDefined();
  });
});

describe('Microfinance - Savings', () => {
  let caller: any;

  beforeAll(async () => {
    caller = appRouter.createCaller(testContext);
  });

  it('should create a savings account', async () => {
    const result = await caller.microfinance.savings_createAccount({
      farmerId,
      accountType: 'regular',
      accountName: 'Farm Savings',
      interestRate: 5.0,
      minimumBalance: 100,
    });

    expect(result).toBeDefined();
    expect(result.accountType).toBe('regular');
    expect(result.accountName).toBe('Farm Savings');
    expect(result.balance).toBe(0);
    savingsAccountId = result.id;
  });

  it('should deposit to savings account', async () => {
    const result = await caller.microfinance.savings_deposit({
      accountId: savingsAccountId,
      amount: 1000,
      transactionMethod: 'mobile_money',
      reference: 'DEP123',
    });

    expect(result).toBeDefined();
    expect(result.amount).toBe(1000);
    expect(result.transactionType).toBe('deposit');
    expect(result.status).toBe('completed');
  });

  it('should get savings account balance', async () => {
    const result = await caller.microfinance.savings_getAccount({ id: savingsAccountId });

    expect(result).toBeDefined();
    expect(result.balance).toBe(1000);
  });

  it('should withdraw from savings account', async () => {
    const result = await caller.microfinance.savings_withdraw({
      accountId: savingsAccountId,
      amount: 300,
      transactionMethod: 'bank_transfer',
      reference: 'WD456',
    });

    expect(result).toBeDefined();
    expect(result.amount).toBe(300);
    expect(result.transactionType).toBe('withdrawal');
  });

  it('should list savings transactions', async () => {
    const result = await caller.microfinance.savings_getTransactions({ accountId: savingsAccountId });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2); // 1 deposit + 1 withdrawal
  });

  it('should calculate interest earned', async () => {
    const result = await caller.microfinance.savings_calculateInterest({ accountId: savingsAccountId });

    expect(result).toBeDefined();
    expect(result.interestEarned).toBeGreaterThanOrEqual(0);
    expect(result.projectedAnnualInterest).toBeGreaterThanOrEqual(0);
  });
});

describe('Microfinance - Loan Analytics', () => {
  let caller: any;

  beforeAll(async () => {
    caller = appRouter.createCaller(testContext);
  });

  it('should get loan portfolio summary', async () => {
    const result = await caller.microfinance.loans_getPortfolioSummary();

    expect(result).toBeDefined();
    expect(result.totalLoans).toBeGreaterThan(0);
    expect(result.totalDisbursed).toBeGreaterThan(0);
    expect(result.totalOutstanding).toBeGreaterThan(0);
    expect(result.averageLoanSize).toBeGreaterThan(0);
  });

  it('should get loan performance metrics', async () => {
    const result = await caller.microfinance.loans_getPerformanceMetrics();

    expect(result).toBeDefined();
    expect(result.repaymentRate).toBeGreaterThanOrEqual(0);
    expect(result.repaymentRate).toBeLessThanOrEqual(100);
    expect(result.defaultRate).toBeGreaterThanOrEqual(0);
  });

  it('should get loans by status', async () => {
    const result = await caller.microfinance.loans_getByStatus({ status: 'active' });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});
