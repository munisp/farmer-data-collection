import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

/**
 * Microfinance Procedures Tests
 * 
 * These tests validate the microfinance features including credit scoring,
 * lender management, and loan procedures using direct database operations.
 */

describe('Microfinance Procedures', () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testUserId: number;
  let testFarmerId: number;
  let testLenderId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) {
      console.warn('⏭️  Database not available — skipping DB-dependent tests'); return;
    }

    // Create a test user
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    const [testUser] = await db
      .insert(schema.users)
      .values({
        email: `microfinance_test_${Date.now()}@example.com`,
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'User',
        role: 'farmer',
        isActive: true,
      })
      .returning();
    
    testUserId = testUser.id;

    // Create a test farmer
    const [testFarmer] = await db
      .insert(schema.farmers)
      .values({
        userId: testUserId,
        firstName: 'Test',
        lastName: 'Farmer',
        phoneNumber: '+1234567890',
        version: 1,
      })
      .returning();
    
    testFarmerId = testFarmer.id;

    // Create a test lender
    const [testLender] = await db
      .insert(schema.lenders)
      .values({
        name: 'Test Lender',
        type: 'microfinance',
        email: 'lender@example.com',
        phoneNumber: '+9876543210',
        minLoanAmount: 100000, // 1000 in cents
        maxLoanAmount: 10000000, // 100000 in cents
        interestRateRange: '5-15%',
        maxTermMonths: 60,
        isActive: true,
      })
      .returning();
    
    testLenderId = testLender.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (db) {
      if (testLenderId) {
        await db.delete(schema.lenders).where(eq(schema.lenders.id, testLenderId));
      }
      if (testFarmerId) {
        await db.delete(schema.farmers).where(eq(schema.farmers.id, testFarmerId));
      }
      if (testUserId) {
        await db.delete(schema.users).where(eq(schema.users.id, testUserId));
      }
    }
  });

  describe('Credit Score Features', () => {
    it('should have credit score schema defined', () => {
      expect(schema.creditScores).toBeDefined();
    });

    it('should create a credit score record', async () => {
      const [creditScore] = await db!
        .insert(schema.creditScores)
        .values({
          userId: testUserId,
          score: 650,
          riskCategory: 'medium',
          calculatedAt: new Date(),
        })
        .returning();

      expect(creditScore).toBeDefined();
      expect(creditScore.score).toBe(650);
      expect(creditScore.riskCategory).toBe('medium');
      expect(creditScore.userId).toBe(testUserId);

      // Clean up
      await db!.delete(schema.creditScores).where(eq(schema.creditScores.id, creditScore.id));
    });

    it('should validate credit score range', async () => {
      const [creditScore] = await db!
        .insert(schema.creditScores)
        .values({
          userId: testUserId,
          score: 750,
          riskCategory: 'low',
          calculatedAt: new Date(),
        })
        .returning();

      expect(creditScore.score).toBeGreaterThanOrEqual(300);
      expect(creditScore.score).toBeLessThanOrEqual(850);
      expect(['low', 'medium', 'high', 'critical']).toContain(creditScore.riskCategory);

      // Clean up
      await db!.delete(schema.creditScores).where(eq(schema.creditScores.id, creditScore.id));
    });
  });

  describe('Lender Management', () => {
    it('should get all lenders', async () => {
      const lenders = await db!.select().from(schema.lenders);
      expect(lenders).toBeInstanceOf(Array);
      expect(lenders.length).toBeGreaterThan(0);
      
      const lender = lenders.find(l => l.id === testLenderId);
      expect(lender).toBeDefined();
      expect(lender?.name).toBe('Test Lender');
      expect(lender?.type).toBe('microfinance');
    });

    it('should get lender by id', async () => {
      const [lender] = await db!
        .select()
        .from(schema.lenders)
        .where(eq(schema.lenders.id, testLenderId));
      
      expect(lender).toBeDefined();
      expect(lender.id).toBe(testLenderId);
      expect(lender.name).toBe('Test Lender');
      expect(lender.minLoanAmount).toBe(100000);
      expect(lender.maxLoanAmount).toBe(10000000);
      expect(lender.maxTermMonths).toBe(60);
    });

    it('should validate lender constraints', async () => {
      const [lender] = await db!
        .select()
        .from(schema.lenders)
        .where(eq(schema.lenders.id, testLenderId));
      
      expect(lender.minLoanAmount).toBeLessThan(lender.maxLoanAmount);
      expect(lender.interestRateRange).toBe('5-15%');
      expect(lender.isActive).toBe(true);
    });
  });

  describe('Loan Management', () => {
    it('should have loans schema defined', () => {
      expect(schema.loans).toBeDefined();
    });

    it('should create a loan record', async () => {
      const [loan] = await db!
        .insert(schema.loans)
        .values({
          userId: testUserId,
          lenderId: testLenderId,
          loanNumber: `LOAN-${Date.now()}`,
          loanType: 'working_capital',
          principalAmount: 5000000, // 50000 in cents
          interestRate: 1000, // 10% in basis points
          term: 12,
          termMonths: 12,
          status: 'pending',
          purpose: 'Farm expansion',
        })
        .returning();

      expect(loan).toBeDefined();
      expect(loan.userId).toBe(testUserId);
      expect(loan.lenderId).toBe(testLenderId);
      expect(loan.principalAmount).toBe(5000000);
      expect(loan.status).toBe('pending');

      // Clean up
      await db!.delete(schema.loans).where(eq(schema.loans.id, loan.id));
    });

    it('should get loans for a user', async () => {
      // Create a test loan
      const [loan] = await db!
        .insert(schema.loans)
        .values({
          userId: testUserId,
          lenderId: testLenderId,
          loanNumber: `LOAN-${Date.now()}`,
          loanType: 'equipment_loan',
          principalAmount: 2500000, // 25000 in cents
          interestRate: 850, // 8.5% in basis points
          term: 24,
          termMonths: 24,
          status: 'active',
          purpose: 'Equipment purchase',
        })
        .returning();

      const loans = await db!
        .select()
        .from(schema.loans)
        .where(eq(schema.loans.userId, testUserId));
      
      expect(loans).toBeInstanceOf(Array);
      expect(loans.length).toBeGreaterThan(0);
      
      const userLoan = loans.find(l => l.id === loan.id);
      expect(userLoan).toBeDefined();
      expect(userLoan?.principalAmount).toBe(2500000);
      expect(userLoan?.status).toBe('active');

      // Clean up
      await db!.delete(schema.loans).where(eq(schema.loans.id, loan.id));
    });

    it('should validate loan status values', async () => {
      const validStatuses = ['pending', 'approved', 'active', 'completed', 'defaulted', 'rejected'];
      
      const [loan] = await db!
        .insert(schema.loans)
        .values({
          userId: testUserId,
          lenderId: testLenderId,
          loanNumber: `LOAN-${Date.now()}`,
          loanType: 'working_capital',
          principalAmount: 3000000, // 30000 in cents
          interestRate: 900, // 9% in basis points
          term: 18,
          termMonths: 18,
          status: 'approved',
          purpose: 'Working capital',
        })
        .returning();

      expect(validStatuses).toContain(loan.status);

      // Clean up
      await db!.delete(schema.loans).where(eq(schema.loans.id, loan.id));
    });
  });

  describe('Loan Repayment', () => {
    it('should have loan repayments schema defined', () => {
      expect(schema.loanRepayments).toBeDefined();
    });

    it('should create a repayment record', async () => {
      // Create a test loan first
      const [loan] = await db!
        .insert(schema.loans)
        .values({
          userId: testUserId,
          lenderId: testLenderId,
          loanNumber: `LOAN-${Date.now()}`,
          loanType: 'input_loan',
          principalAmount: 4000000, // 40000 in cents
          interestRate: 1100, // 11% in basis points
          term: 36,
          termMonths: 36,
          status: 'active',
          purpose: 'Farm improvement',
        })
        .returning();

      // Create a repayment
      const [repayment] = await db!
        .insert(schema.loanRepayments)
        .values({
          loanId: loan.id,
          paymentNumber: 1,
          dueDate: new Date(),
          paidDate: new Date(),
          principalAmount: 400000, // 4000 in cents
          interestAmount: 100000, // 1000 in cents
          totalAmount: 500000, // 5000 in cents
          paidAmount: 500000,
          paymentMethod: 'mobile_money',
          transactionReference: 'TXN-TEST-123',
          status: 'paid',
        })
        .returning();

      expect(repayment).toBeDefined();
      expect(repayment.loanId).toBe(loan.id);
      expect(repayment.totalAmount).toBe(500000);
      expect(repayment.paidAmount).toBe(500000);
      expect(repayment.paymentMethod).toBe('mobile_money');
      expect(repayment.status).toBe('paid');

      // Clean up
      await db!.delete(schema.loanRepayments).where(eq(schema.loanRepayments.id, repayment.id));
      await db!.delete(schema.loans).where(eq(schema.loans.id, loan.id));
    });

    it('should validate payment methods', async () => {
      const validMethods = ['mobile_money', 'bank_transfer', 'cash', 'check'];
      
      const [loan] = await db!
        .insert(schema.loans)
        .values({
          userId: testUserId,
          lenderId: testLenderId,
          loanNumber: `LOAN-${Date.now()}`,
          loanType: 'input_loan',
          principalAmount: 3500000, // 35000 in cents
          interestRate: 1050, // 10.5% in basis points
          term: 24,
          termMonths: 24,
          status: 'active',
          purpose: 'Seed purchase',
        })
        .returning();

      const [repayment] = await db!
        .insert(schema.loanRepayments)
        .values({
          loanId: loan.id,
          paymentNumber: 1,
          dueDate: new Date(),
          paidDate: new Date(),
          principalAmount: 250000, // 2500 in cents
          interestAmount: 50000, // 500 in cents
          totalAmount: 300000, // 3000 in cents
          paidAmount: 300000,
          paymentMethod: 'bank_transfer',
          transactionReference: 'TXN-TEST-456',
          status: 'paid',
        })
        .returning();

      expect(validMethods).toContain(repayment.paymentMethod);

      // Clean up
      await db!.delete(schema.loanRepayments).where(eq(schema.loanRepayments.id, repayment.id));
      await db!.delete(schema.loans).where(eq(schema.loans.id, loan.id));
    });
  });
});
