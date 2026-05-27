import { describe, it, expect, beforeEach } from "vitest";
import { appRouter } from "../trpc.js";
import type { TrpcContext } from "../_core/context";
import { getDb } from "../db.js";
import { employees, payrollRecords, leaveRequests, attendanceRecords } from "../../drizzle/financial-schema.js";
import { eq } from "drizzle-orm";

/**
 * HR Router Test Suite
 * 
 * Tests payroll calculation, employee management, leave tracking,
 * attendance, and salary processing.
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

describe("HR Router - Employee Management", () => {
  beforeEach(async () => {
    // Clean up test data
    const db = await getDb();
    if (db) {
      await db.delete(payrollRecords).where(eq(payrollRecords.employeeId, 1));
      await db.delete(attendanceRecords).where(eq(attendanceRecords.employeeId, 1));
      await db.delete(leaveRequests).where(eq(leaveRequests.employeeId, 1));
      await db.delete(employees).where(eq(employees.userId, 1));
    }
  });
  it("should create employee with valid data", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.hr.createEmployee({
      employeeCode: "EMP001",
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@test.com",
      phone: "+254700000001",
      department: "Operations",
      position: "Field Officer",
      hireDate: new Date("2024-01-15"),
      salary: 50000,
      paymentMethod: "bank_transfer",
      bankAccount: "1234567890",
      bankName: "Test Bank",
    });

    expect(result.success).toBe(true);
    expect(result.employeeId).toBeDefined();
  });

  it("should reject duplicate employee code", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create first employee
    await caller.hr.createEmployee({
      employeeCode: "EMP002",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane.smith@test.com",
      phone: "+254700000002",
      department: "Finance",
      position: "Accountant",
      hireDate: new Date("2024-01-20"),
      salary: 60000,
      paymentMethod: "bank_transfer",
    });

    // Try to create duplicate
    try {
      await caller.hr.createEmployee({
        employeeCode: "EMP002", // Duplicate
        firstName: "Another",
        lastName: "Person",
        email: "another@test.com",
        phone: "+254700000003",
        department: "HR",
        position: "Manager",
        hireDate: new Date("2024-02-01"),
        salary: 70000,
        paymentMethod: "bank_transfer",
      });
      expect.fail("Should have thrown error for duplicate employee code");
    } catch (error: any) {
      expect(error.message).toContain("already exists");
    }
  });

  it("should list employees with filters", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const employees = await caller.hr.getEmployees({
      department: "Operations",
      status: "active",
    });

    expect(Array.isArray(employees)).toBe(true);
    employees.forEach((emp) => {
      expect(emp.department).toBe("Operations");
      expect(emp.status).toBe("active");
    });
  });
});

describe("HR Router - Payroll Calculation", () => {
  beforeEach(async () => {
    const db = await getDb();
    if (db) {
      await db.delete(payrollRecords).where(eq(payrollRecords.employeeId, 1));
      await db.delete(employees).where(eq(employees.userId, 1));
    }
  });
  it("should calculate basic salary correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create employee
    const empResult = await caller.hr.createEmployee({
      employeeCode: "EMP-PAY-001",
      firstName: "Test",
      lastName: "Employee",
      email: "test.emp@test.com",
      phone: "+254700000010",
      department: "Operations",
      position: "Field Officer",
      hireDate: new Date("2024-01-01"),
      salary: 50000,
      paymentMethod: "bank_transfer",
    });

    // Calculate payroll
    const payroll = await caller.hr.calculatePayroll({
      employeeId: empResult.employeeId!,
      month: 1,
      year: 2024,
    });

    expect(payroll).toBeDefined();
    expect(payroll.basicSalary).toBe(50000);
    expect(payroll.grossPay).toBeGreaterThanOrEqual(50000);
    expect(payroll.netPay).toBeLessThan(payroll.grossPay);
  });

  it("should apply PAYE tax correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create high-earning employee
    const empResult = await caller.hr.createEmployee({
      employeeCode: "EMP-TAX-001",
      firstName: "High",
      lastName: "Earner",
      email: "high.earner@test.com",
      phone: "+254700000020",
      department: "Management",
      position: "Director",
      hireDate: new Date("2024-01-01"),
      salary: 200000, // High salary to trigger PAYE
      paymentMethod: "bank_transfer",
    });

    // Calculate payroll
    const payroll = await caller.hr.calculatePayroll({
      employeeId: empResult.employeeId!,
      month: 1,
      year: 2024,
    });

    expect(payroll.deductions.paye).toBeGreaterThan(0);
    expect(payroll.netPay).toBeLessThan(payroll.grossPay);
  });

  it("should apply NSSF and NHIF deductions", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create employee
    const empResult = await caller.hr.createEmployee({
      employeeCode: "EMP-STAT-001",
      firstName: "Statutory",
      lastName: "Test",
      email: "statutory@test.com",
      phone: "+254700000030",
      department: "Operations",
      position: "Officer",
      hireDate: new Date("2024-01-01"),
      salary: 80000,
      paymentMethod: "bank_transfer",
    });

    // Calculate payroll
    const payroll = await caller.hr.calculatePayroll({
      employeeId: empResult.employeeId!,
      month: 1,
      year: 2024,
    });

    expect(payroll.deductions.nssf).toBeGreaterThan(0);
    expect(payroll.deductions.nhif).toBeGreaterThan(0);
  });

  it("should include allowances in gross pay", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create employee
    const empResult = await caller.hr.createEmployee({
      employeeCode: "EMP-ALLOW-001",
      firstName: "Allowance",
      lastName: "Test",
      email: "allowance@test.com",
      phone: "+254700000040",
      department: "Operations",
      position: "Officer",
      hireDate: new Date("2024-01-01"),
      salary: 60000,
      paymentMethod: "bank_transfer",
    });

    // Add allowances
    await caller.hr.addAllowance({
      employeeId: empResult.employeeId!,
      type: "housing",
      amount: 15000,
      month: 1,
      year: 2024,
    });

    await caller.hr.addAllowance({
      employeeId: empResult.employeeId!,
      type: "transport",
      amount: 10000,
      month: 1,
      year: 2024,
    });

    // Calculate payroll
    const payroll = await caller.hr.calculatePayroll({
      employeeId: empResult.employeeId!,
      month: 1,
      year: 2024,
    });

    expect(payroll.allowances.housing).toBe(15000);
    expect(payroll.allowances.transport).toBe(10000);
    expect(payroll.grossPay).toBe(60000 + 15000 + 10000);
  });

  it("should apply loan deductions", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create employee
    const empResult = await caller.hr.createEmployee({
      employeeCode: "EMP-LOAN-001",
      firstName: "Loan",
      lastName: "Test",
      email: "loan@test.com",
      phone: "+254700000050",
      department: "Operations",
      position: "Officer",
      hireDate: new Date("2024-01-01"),
      salary: 70000,
      paymentMethod: "bank_transfer",
    });

    // Add loan
    await caller.hr.createLoan({
      employeeId: empResult.employeeId!,
      amount: 100000,
      monthlyDeduction: 10000,
      startMonth: 1,
      startYear: 2024,
      reason: "Emergency",
    });

    // Calculate payroll
    const payroll = await caller.hr.calculatePayroll({
      employeeId: empResult.employeeId!,
      month: 1,
      year: 2024,
    });

    expect(payroll.deductions.loans).toBe(10000);
    expect(payroll.netPay).toBeLessThan(payroll.grossPay - 10000);
  });
});

describe("HR Router - Leave Management", () => {
  beforeEach(async () => {
    const db = await getDb();
    if (db) {
      await db.delete(leaveRequests).where(eq(leaveRequests.employeeId, 1));
      await db.delete(employees).where(eq(employees.userId, 1));
    }
  });
  it("should create leave request", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create employee
    const empResult = await caller.hr.createEmployee({
      employeeCode: "EMP-LEAVE-001",
      firstName: "Leave",
      lastName: "Test",
      email: "leave@test.com",
      phone: "+254700000060",
      department: "Operations",
      position: "Officer",
      hireDate: new Date("2024-01-01"),
      salary: 50000,
      paymentMethod: "bank_transfer",
    });

    // Create leave request
    const result = await caller.hr.createLeaveRequest({
      employeeId: empResult.employeeId!,
      leaveType: "annual",
      startDate: new Date("2024-06-01"),
      endDate: new Date("2024-06-07"),
      reason: "Vacation",
    });

    expect(result.success).toBe(true);
    expect(result.leaveRequestId).toBeDefined();
    expect(result.daysRequested).toBe(7);
  });

  it("should calculate leave days correctly", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const startDate = new Date("2024-07-01");
    const endDate = new Date("2024-07-14");

    const days = await caller.hr.calculateLeaveDays({
      startDate,
      endDate,
    });

    expect(days).toBe(14);
  });

  it("should track leave balance", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create employee
    const empResult = await caller.hr.createEmployee({
      employeeCode: "EMP-BAL-001",
      firstName: "Balance",
      lastName: "Test",
      email: "balance@test.com",
      phone: "+254700000070",
      department: "Operations",
      position: "Officer",
      hireDate: new Date("2024-01-01"),
      salary: 50000,
      paymentMethod: "bank_transfer",
    });

    // Get leave balance
    const balance = await caller.hr.getLeaveBalance({
      employeeId: empResult.employeeId!,
      year: 2024,
    });

    expect(balance).toBeDefined();
    expect(balance.annual).toBeGreaterThan(0);
    expect(balance.sick).toBeGreaterThan(0);
  });
});

describe("HR Router - Attendance Tracking", () => {
  beforeEach(async () => {
    const db = await getDb();
    if (db) {
      await db.delete(attendanceRecords).where(eq(attendanceRecords.employeeId, 1));
      await db.delete(employees).where(eq(employees.userId, 1));
    }
  });
  it("should record attendance", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create employee
    const empResult = await caller.hr.createEmployee({
      employeeCode: "EMP-ATT-001",
      firstName: "Attendance",
      lastName: "Test",
      email: "attendance@test.com",
      phone: "+254700000080",
      department: "Operations",
      position: "Officer",
      hireDate: new Date("2024-01-01"),
      salary: 50000,
      paymentMethod: "bank_transfer",
    });

    // Record attendance
    const result = await caller.hr.recordAttendance({
      employeeId: empResult.employeeId!,
      date: new Date(),
      status: "present",
      checkIn: "08:00",
      checkOut: "17:00",
    });

    expect(result.success).toBe(true);
  });

  it("should calculate overtime hours", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const checkIn = "08:00";
    const checkOut = "22:00"; // 14 hours total, 6 hours overtime

    const overtime = await caller.hr.calculateOvertime({
      checkIn,
      checkOut,
      standardHours: 8,
    });

    expect(overtime).toBe(6);
  });
});

describe("HR Router - User Isolation", () => {
  beforeEach(async () => {
    const db = await getDb();
    if (db) {
      await db.delete(employees).where(eq(employees.userId, 1));
      await db.delete(employees).where(eq(employees.userId, 2));
    }
  });
  it("should isolate employees by organization", async () => {
    const ctx1 = createAuthContext(1);
    const ctx2 = createAuthContext(2);
    const caller1 = appRouter.createCaller(ctx1);
    const caller2 = appRouter.createCaller(ctx2);

    // User 1 creates employee
    await caller1.hr.createEmployee({
      employeeCode: "ORG1-EMP-001",
      firstName: "Org1",
      lastName: "Employee",
      email: "org1@test.com",
      phone: "+254700000090",
      department: "Operations",
      position: "Officer",
      hireDate: new Date("2024-01-01"),
      salary: 50000,
      paymentMethod: "bank_transfer",
    });

    // User 2 should not see User 1's employees
    const user2Employees = await caller2.hr.getEmployees({});

    const org1Employee = user2Employees.find(
      (e) => e.employeeCode === "ORG1-EMP-001"
    );
    expect(org1Employee).toBeUndefined();
  });
});
