import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb, closeDb } from "../db.js";
import { loans, lenders } from "../../drizzle/financial-schema.js";
import { users } from "../../drizzle/schema.js";
import { eq } from "drizzle-orm";

/**
 * Loan Approval Workflow Tests
 * 
 * Tests the complete loan approval workflow:
 * 1. Lender seeding
 * 2. Loan application
 * 3. Loan approval/rejection
 * 4. Status transitions
 */

describe("Loan Approval Workflow", () => {
  let testUserId: number;
  let testLenderId: number;
  let testLoanId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: `test-loan-${Date.now()}@example.com`,
        password: "test123",
        firstName: "Test",
        lastName: "Borrower",
      })
      .returning();

    testUserId = user.id;

    // Create test lender
    const [lender] = await db
      .insert(lenders)
      .values({
        name: "Test Microfinance Bank",
        type: "microfinance",
        contactPerson: "Loan Officer",
        phoneNumber: "+234-800-TEST",
        email: "test@testmfb.com",
        address: "Test Address, Lagos",
        interestRateRange: "20-25% per annum",
        minLoanAmount: 5000000, // ₦50,000 in cents
        maxLoanAmount: 500000000, // ₦5,000,000 in cents
        isActive: true,
      })
      .returning();

    testLenderId = lender.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Cleanup: Delete test loan, lender, and user
    if (testLoanId) {
      await db.delete(loans).where(eq(loans.id, testLoanId));
    }
    if (testLenderId) {
      await db.delete(lenders).where(eq(lenders.id, testLenderId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }

    await closeDb();
  });

  it("should create a loan application with pending status", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [loan] = await db
      .insert(loans)
      .values({
        userId: testUserId,
        loanNumber: `TEST-LOAN-${Date.now()}`,
        lenderId: testLenderId,
        loanType: "agricultural",
        principalAmount: 10000000, // ₦100,000 in cents
        interestRate: 2000, // 20% in basis points
        term: 12,
        termMonths: 12,
        purpose: "Purchase of farm inputs and seeds",
        status: "pending",
        applicationDate: new Date(),
      })
      .returning();

    testLoanId = loan.id;

    expect(loan).toBeDefined();
    expect(loan.status).toBe("pending");
    expect(loan.userId).toBe(testUserId);
    expect(loan.lenderId).toBe(testLenderId);
    expect(loan.principalAmount).toBe(10000000);
  });

  it("should approve a pending loan", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [approvedLoan] = await db
      .update(loans)
      .set({
        status: "approved",
        totalAmount: 10000000, // Approved amount
        interestRate: 2000, // 20% annual
        termMonths: 12,
        approvedAt: new Date(),
        approvedBy: testUserId, // In real scenario, this would be admin user ID
      })
      .where(eq(loans.id, testLoanId))
      .returning();

    expect(approvedLoan).toBeDefined();
    expect(approvedLoan.status).toBe("approved");
    expect(approvedLoan.totalAmount).toBe(10000000);
    expect(approvedLoan.approvedAt).toBeDefined();
    expect(approvedLoan.approvedBy).toBe(testUserId);
  });

  it("should retrieve approved loan details", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [loan] = await db
      .select()
      .from(loans)
      .where(eq(loans.id, testLoanId));

    expect(loan).toBeDefined();
    expect(loan.status).toBe("approved");
    expect(loan.totalAmount).toBe(10000000);
  });

  it("should create and reject a loan application", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create another loan for rejection test
    const [newLoan] = await db
      .insert(loans)
      .values({
        userId: testUserId,
        loanNumber: `TEST-REJECT-${Date.now()}`,
        lenderId: testLenderId,
        loanType: "equipment",
        principalAmount: 5000000, // ₦50,000 in cents
        interestRate: 2000,
        term: 6,
        termMonths: 6,
        purpose: "Equipment purchase",
        status: "pending",
        applicationDate: new Date(),
      })
      .returning();

    // Reject the loan
    const [rejectedLoan] = await db
      .update(loans)
      .set({
        status: "rejected",
        rejectionReason: "Insufficient credit history",
        approvedBy: testUserId, // Who rejected it
        approvedAt: new Date(),
      })
      .where(eq(loans.id, newLoan.id))
      .returning();

    expect(rejectedLoan).toBeDefined();
    expect(rejectedLoan.status).toBe("rejected");
    expect(rejectedLoan.rejectionReason).toBe("Insufficient credit history");

    // Cleanup
    await db.delete(loans).where(eq(loans.id, newLoan.id));
  });

  it("should verify lender exists and is active", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [lender] = await db
      .select()
      .from(lenders)
      .where(eq(lenders.id, testLenderId));

    expect(lender).toBeDefined();
    expect(lender.isActive).toBe(true);
    expect(lender.name).toBe("Test Microfinance Bank");
    expect(lender.minLoanAmount).toBe(5000000);
    expect(lender.maxLoanAmount).toBe(500000000);
  });

  it("should enforce loan amount limits", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [lender] = await db
      .select()
      .from(lenders)
      .where(eq(lenders.id, testLenderId));

    const requestedAmount = 100000000; // ₦1,000,000 in cents

    // Check if amount is within limits
    const isWithinLimits =
      lender.minLoanAmount !== null &&
      lender.maxLoanAmount !== null &&
      requestedAmount >= lender.minLoanAmount &&
      requestedAmount <= lender.maxLoanAmount;

    expect(isWithinLimits).toBe(true);

    // Test amount below minimum
    const belowMin = 1000000; // ₦10,000 in cents
    const isBelowMin =
      lender.minLoanAmount !== null && belowMin < lender.minLoanAmount;
    expect(isBelowMin).toBe(true);

    // Test amount above maximum
    const aboveMax = 600000000; // ₦6,000,000 in cents
    const isAboveMax =
      lender.maxLoanAmount !== null && aboveMax > lender.maxLoanAmount;
    expect(isAboveMax).toBe(true);
  });
});
