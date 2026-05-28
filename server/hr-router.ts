import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc-base.js";
import { getDb } from "./db.js";
import { employees, timeEntries, payrollRecords, leaveRequests, attendanceRecords, employeeAllowances, employeeLoans } from "../drizzle/financial-schema.js";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const hrRouter = router({
  // Employee Management
  getEmployees: protectedProcedure
    .input(z.object({
      department: z.string().optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const conditions = [eq(employees.userId, userId)];
      
      // Apply filters if provided (enterprise schema)
      if (input?.department) {
        conditions.push(eq(employees.role, input.department));
      }
      if (input?.status === "active") {
        conditions.push(eq(employees.isActive, true));
      } else if (input?.status === "inactive") {
        conditions.push(eq(employees.isActive, false));
      }
      
      const emps = await db.select().from(employees)
        .where(and(...conditions))
        .orderBy(desc(employees.createdAt));
      
      // Always return consistent format with all properties
      return emps;
    }),

  getEmployee: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const result = await db.select().from(employees).where(and(eq(employees.id, input.id), eq(employees.userId, userId))).limit(1);
      
      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      
      return result[0];
    }),

  createEmployee: protectedProcedure
    .input(z.object({
      // Current schema
      employeeNumber: z.string().min(1).optional(),
      fullName: z.string().min(1).optional(),
      phoneNumber: z.string().min(1).optional(),
      role: z.string().min(1).optional(),
      hourlyRate: z.number().positive().optional(),
      biometricId: z.string().optional(),
      // Enterprise schema
      employeeCode: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      department: z.string().optional(),
      position: z.string().optional(),
      salary: z.number().optional(),
      paymentMethod: z.string().optional(),
      bankAccount: z.string().optional(),
      bankName: z.string().optional(),
      // Common fields
      email: z.string().email().optional(),
      hireDate: z.union([z.string(), z.date()]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Determine which schema is being used
      const isEnterpriseSchema = !!input.employeeCode;
      
      const employeeNumber = isEnterpriseSchema ? input.employeeCode! : input.employeeNumber!;
      const fullName = isEnterpriseSchema ? `${input.firstName} ${input.lastName}` : input.fullName!;
      const phoneNumber = isEnterpriseSchema ? (input.phone || "N/A") : input.phoneNumber!;
      const role = isEnterpriseSchema ? (input.department || input.position!) : input.role!;
      const hourlyRate = isEnterpriseSchema ? input.salary! : (input.hourlyRate || 0);
      
      // Check for duplicate
      const existing = await db.select().from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.employeeNumber, employeeNumber)
        ))
        .limit(1);
      
      if (existing.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Employee with this code already exists" });
      }
      
      const hireDate = input.hireDate instanceof Date ? input.hireDate : new Date(input.hireDate);
      
      const [employee] = await db.insert(employees).values({
        userId,
        employeeNumber,
        fullName,
        phoneNumber,
        email: input.email || (isEnterpriseSchema ? `${input.position}@internal` : undefined),
        role,
        hourlyRate: Math.round(hourlyRate * 100), // Convert to cents
        hireDate,
        biometricId: isEnterpriseSchema && input.bankAccount 
          ? `${input.paymentMethod}:${input.bankAccount}:${input.bankName || ""}` 
          : input.biometricId,
        isActive: true,
      }).returning();
      
      // Return format based on schema
      if (isEnterpriseSchema) {
        return { success: true, employeeId: employee.id };
      }
      return employee;
    }),

  updateEmployee: protectedProcedure
    .input(z.object({
      id: z.number(),
      fullName: z.string().min(1).optional(),
      phoneNumber: z.string().optional(),
      email: z.string().email().optional(),
      role: z.string().optional(),
      hourlyRate: z.number().positive().optional(),
      isActive: z.boolean().optional(),
      terminationDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const { id, hourlyRate, terminationDate, ...updateData } = input;
      
      const finalUpdateData: Record<string, unknown> = { ...updateData };
      if (hourlyRate !== undefined) {
        finalUpdateData.hourlyRate = Math.round(hourlyRate * 100); // Convert to cents
      }
      if (terminationDate) {
        finalUpdateData.terminationDate = new Date(terminationDate);
      }
      
      const result = await db.update(employees)
        .set(finalUpdateData)
        .where(and(eq(employees.id, id), eq(employees.userId, userId)))
        .returning();
      
      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      
      return result[0];
    }),

  deleteEmployee: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      await db.delete(employees).where(and(eq(employees.id, input.id), eq(employees.userId, userId)));
      
      return { success: true };
    }),

  // Time Tracking
  getTimeEntries: protectedProcedure
    .input(z.object({
      employeeId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Build where conditions
      const conditions = [eq(employees.userId, userId)];
      
      if (input.employeeId) {
        conditions.push(eq(timeEntries.employeeId, input.employeeId));
      }
      
      if (input.startDate) {
        conditions.push(gte(timeEntries.clockIn, new Date(input.startDate)));
      }
      
      if (input.endDate) {
        conditions.push(lte(timeEntries.clockIn, new Date(input.endDate)));
      }
      
      // Get time entries with employee info
      const results = await db.select({
        timeEntry: timeEntries,
        employee: employees,
      })
      .from(timeEntries)
      .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
      .where(and(...conditions))
      .orderBy(desc(timeEntries.clockIn));
      
      return results;
    }),

  createTimeEntry: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      clockIn: z.string(),
      clockOut: z.string().optional(),
      workType: z.string().optional(),
      farmId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Verify employee belongs to user
      const emp = await db.select().from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.userId, userId))).limit(1);
      if (emp.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      
      // Calculate hours worked if clockOut provided
      let hoursWorked: string | null = null;
      if (input.clockOut) {
        const clockInDate = new Date(input.clockIn);
        const clockOutDate = new Date(input.clockOut);
        const diffMs = clockOutDate.getTime() - clockInDate.getTime();
        hoursWorked = (diffMs / (1000 * 60 * 60)).toFixed(2);
      }
      
      const result = await db.insert(timeEntries).values({
        employeeId: input.employeeId,
        clockIn: new Date(input.clockIn),
        clockOut: input.clockOut ? new Date(input.clockOut) : null,
        hoursWorked,
        workType: input.workType || null,
        farmId: input.farmId || null,
        notes: input.notes || null,
      }).returning();
      
      return result[0];
    }),

  updateTimeEntry: protectedProcedure
    .input(z.object({
      id: z.number(),
      clockOut: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      const { id, ...updateData } = input;
      
      // Get existing entry and verify ownership
      const existing = await db.select({
        timeEntry: timeEntries,
        employee: employees,
      })
      .from(timeEntries)
      .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
      .where(and(eq(timeEntries.id, id), eq(employees.userId, userId)))
      .limit(1);
      
      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Time entry not found" });
      }
      
      const entry = existing[0].timeEntry;
      const finalUpdateData: Record<string, unknown> = { ...updateData };
      
      // Recalculate hours if clockOut provided
      if (input.clockOut) {
        const clockInDate = entry.clockIn;
        const clockOutDate = new Date(input.clockOut);
        const diffMs = clockOutDate.getTime() - clockInDate.getTime();
        finalUpdateData.clockOut = clockOutDate;
        finalUpdateData.hoursWorked = (diffMs / (1000 * 60 * 60)).toFixed(2);
      }
      
      const result = await db.update(timeEntries)
        .set(finalUpdateData)
        .where(eq(timeEntries.id, id))
        .returning();
      
      return result[0];
    }),

  // Payroll
  getPayrollRecords: protectedProcedure
    .input(z.object({
      employeeId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Build where conditions
      const conditions = [eq(employees.userId, userId)];
      
      if (input.employeeId) {
        conditions.push(eq(payrollRecords.employeeId, input.employeeId));
      }
      
      if (input.startDate) {
        conditions.push(gte(payrollRecords.periodStart, new Date(input.startDate)));
      }
      
      if (input.endDate) {
        conditions.push(lte(payrollRecords.periodEnd, new Date(input.endDate)));
      }
      
      // Get payroll records with employee info
      const results = await db.select({
        payroll: payrollRecords,
        employee: employees,
      })
      .from(payrollRecords)
      .innerJoin(employees, eq(payrollRecords.employeeId, employees.id))
      .where(and(...conditions))
      .orderBy(desc(payrollRecords.periodEnd));
      
      return results;
    }),

  calculatePayroll: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      month: z.number(),
      year: z.number(),
      allowances: z.number().optional(),
      loanDeduction: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Get employee
      const [employee] = await db.select().from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.userId, userId)))
        .limit(1);
      
      if (!employee) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      
      // Basic salary (stored in hourlyRate field in cents, convert to whole units)
      const basicSalary = Math.round((employee.hourlyRate || 0) / 100);
      
      // Get allowances for this month/year
      const allowanceRecords = await db.select()
        .from(employeeAllowances)
        .where(and(
          eq(employeeAllowances.employeeId, input.employeeId),
          eq(employeeAllowances.month, input.month),
          eq(employeeAllowances.year, input.year)
        ));
      
      // Build allowances object and calculate total
      const allowancesObj: Record<string, number> = {};
      let totalAllowances = 0;
      allowanceRecords.forEach(rec => {
        const amount = Math.round(rec.amount / 100); // Convert from cents
        allowancesObj[rec.type] = amount;
        totalAllowances += amount;
      });
      
      const grossPay = basicSalary + totalAllowances;
      
      // Calculate pension contribution (6% of pensionable pay, capped)
      const nssf = Math.min(Math.round(grossPay * 0.06), 1080);
      
      // Calculate taxable income
      const taxableIncome = grossPay - nssf;
      
      // Calculate PAYE (Kenya tax bands 2024)
      let paye = 0;
      if (taxableIncome <= 24000) {
        paye = Math.round(taxableIncome * 0.10);
      } else if (taxableIncome <= 32333) {
        paye = Math.round(24000 * 0.10 + (taxableIncome - 24000) * 0.25);
      } else if (taxableIncome <= 500000) {
        paye = Math.round(24000 * 0.10 + 8333 * 0.25 + (taxableIncome - 32333) * 0.30);
      } else if (taxableIncome <= 800000) {
        paye = Math.round(24000 * 0.10 + 8333 * 0.25 + 467667 * 0.30 + (taxableIncome - 500000) * 0.325);
      } else {
        paye = Math.round(24000 * 0.10 + 8333 * 0.25 + 467667 * 0.30 + 300000 * 0.325 + (taxableIncome - 800000) * 0.35);
      }
      
      // Calculate NHIF (Kenya rates based on gross pay)
      let nhif = 0;
      if (grossPay <= 5999) nhif = 150;
      else if (grossPay <= 7999) nhif = 300;
      else if (grossPay <= 11999) nhif = 400;
      else if (grossPay <= 14999) nhif = 500;
      else if (grossPay <= 19999) nhif = 600;
      else if (grossPay <= 24999) nhif = 750;
      else if (grossPay <= 29999) nhif = 850;
      else if (grossPay <= 34999) nhif = 900;
      else if (grossPay <= 39999) nhif = 950;
      else if (grossPay <= 44999) nhif = 1000;
      else if (grossPay <= 49999) nhif = 1100;
      else if (grossPay <= 59999) nhif = 1200;
      else if (grossPay <= 69999) nhif = 1300;
      else if (grossPay <= 79999) nhif = 1400;
      else if (grossPay <= 89999) nhif = 1500;
      else if (grossPay <= 99999) nhif = 1600;
      else nhif = 1700;
      
      // Get active loans for this employee
      const activeLoans = await db.select()
        .from(employeeLoans)
        .where(and(
          eq(employeeLoans.employeeId, input.employeeId),
          eq(employeeLoans.status, "active"),
          lte(employeeLoans.startYear, input.year),
          sql`(${employeeLoans.startYear} < ${input.year} OR ${employeeLoans.startMonth} <= ${input.month})`
        ));
      
      // Calculate total loan deductions
      let totalLoanDeductions = 0;
      activeLoans.forEach(loan => {
        totalLoanDeductions += Math.round(loan.monthlyDeduction / 100); // Convert from cents
      });
      
      const totalDeductions = paye + nssf + nhif + totalLoanDeductions;
      
      // Net pay
      const netPay = grossPay - totalDeductions;
      
      return {
        basicSalary,
        allowances: allowancesObj,
        grossPay,
        deductions: {
          paye,
          nssf,
          nhif,
          loans: totalLoanDeductions,
          total: totalDeductions,
        },
        totalDeductions,
        netPay,
      };
    }),

  processPayroll: protectedProcedure
    .input(z.object({
      id: z.number(),
      paymentDate: z.string(),
      paymentMethod: z.string(),
      paymentReference: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Verify payroll record belongs to user's employee
      const existing = await db.select({
        payroll: payrollRecords,
        employee: employees,
      })
      .from(payrollRecords)
      .innerJoin(employees, eq(payrollRecords.employeeId, employees.id))
      .where(and(eq(payrollRecords.id, input.id), eq(employees.userId, userId)))
      .limit(1);
      
      if (existing.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payroll record not found" });
      }
      
      const result = await db.update(payrollRecords)
        .set({
          status: "paid",
          paymentDate: new Date(input.paymentDate),
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference || null,
        })
        .where(eq(payrollRecords.id, input.id))
        .returning();
      
      return result[0];
    }),

  // Dashboard Statistics
  getHRStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    
    const userId = Number(ctx.user.id);
    
    // Get total employees
    const empCount = await db.select({ count: sql<number>`count(*)` }).from(employees).where(eq(employees.userId, userId));
    
    // Get active employees
    const activeCount = await db.select({ count: sql<number>`count(*)` }).from(employees)
      .where(and(eq(employees.userId, userId), eq(employees.isActive, true)));
    
    // Get this month's payroll total
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const payrollTotal = await db.select({ total: sql<number>`coalesce(sum(${payrollRecords.netPay}), 0)` })
      .from(payrollRecords)
      .innerJoin(employees, eq(payrollRecords.employeeId, employees.id))
      .where(and(
        eq(employees.userId, userId),
        gte(payrollRecords.periodStart, monthStart),
        lte(payrollRecords.periodEnd, monthEnd)
      ));
    
    return {
      totalEmployees: Number(empCount[0]?.count || 0),
      activeEmployees: Number(activeCount[0]?.count || 0),
      monthlyPayroll: Number(payrollTotal[0]?.total || 0) / 100, // Convert from cents to dollars
    };
  }),

  // Add allowance
  addAllowance: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      type: z.string(),
      amount: z.number(),
      month: z.number(),
      year: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Verify employee belongs to user
      const emp = await db.select().from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.userId, userId)))
        .limit(1);
      
      if (emp.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      
      // Insert or update allowance (convert to cents)
      const [allowance] = await db.insert(employeeAllowances).values({
        employeeId: input.employeeId,
        type: input.type,
        amount: Math.round(input.amount * 100),
        month: input.month,
        year: input.year,
      }).onConflictDoUpdate({
        target: [employeeAllowances.employeeId, employeeAllowances.type, employeeAllowances.month, employeeAllowances.year],
        set: { amount: Math.round(input.amount * 100) },
      }).returning();
      
      return { success: true, allowanceId: allowance.id };
    }),

  // Create loan
  createLoan: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      amount: z.number(),
      monthlyDeduction: z.number(),
      startMonth: z.number(),
      startYear: z.number(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const userId = Number(ctx.user.id);
      
      // Verify employee belongs to user
      const emp = await db.select().from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.userId, userId)))
        .limit(1);
      
      if (emp.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      
      // Insert loan (convert to cents)
      const [loan] = await db.insert(employeeLoans).values({
        employeeId: input.employeeId,
        amount: Math.round(input.amount * 100),
        monthlyDeduction: Math.round(input.monthlyDeduction * 100),
        startMonth: input.startMonth,
        startYear: input.startYear,
        reason: input.reason || null,
        remainingBalance: Math.round(input.amount * 100),
        status: "active",
      }).returning();
      
      return { success: true, loanId: loan.id };
    }),

  // Create leave request
  createLeaveRequest: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      leaveType: z.string(),
      startDate: z.union([z.string(), z.date()]),
      endDate: z.union([z.string(), z.date()]),
      reason: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const startDate = input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
      const endDate = input.endDate instanceof Date ? input.endDate : new Date(input.endDate);
      
      // Calculate days
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const daysRequested = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      const [leave] = await db.insert(leaveRequests).values({
        employeeId: input.employeeId,
        leaveType: input.leaveType,
        startDate,
        endDate,
        daysRequested,
        reason: input.reason,
        status: "pending",
      }).returning();
      
      return {
        success: true,
        leaveRequestId: leave.id,
        daysRequested,
      };
    }),

  // Calculate leave days
  calculateLeaveDays: protectedProcedure
    .input(z.object({
      startDate: z.union([z.string(), z.date()]),
      endDate: z.union([z.string(), z.date()]),
    }))
    .query(async ({ input }) => {
      const startDate = input.startDate instanceof Date ? input.startDate : new Date(input.startDate);
      const endDate = input.endDate instanceof Date ? input.endDate : new Date(input.endDate);
      
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      return days;
    }),

  // Get leave balance
  getLeaveBalance: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      leaveType: z.string().optional(),
      year: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // Get approved leave days for this year
      const year = input.year || new Date().getFullYear();
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year, 11, 31);
      
      // If no leave type specified, return all leave types
      if (!input.leaveType) {
        // Get annual leave
        const [annualResult] = await db.select({
          total: sql<number>`coalesce(sum(${leaveRequests.daysRequested}), 0)`
        })
        .from(leaveRequests)
        .where(and(
          eq(leaveRequests.employeeId, input.employeeId),
          eq(leaveRequests.leaveType, "annual"),
          eq(leaveRequests.status, "approved"),
          gte(leaveRequests.startDate, yearStart),
          lte(leaveRequests.endDate, yearEnd)
        ));
        
        // Get sick leave
        const [sickResult] = await db.select({
          total: sql<number>`coalesce(sum(${leaveRequests.daysRequested}), 0)`
        })
        .from(leaveRequests)
        .where(and(
          eq(leaveRequests.employeeId, input.employeeId),
          eq(leaveRequests.leaveType, "sick"),
          eq(leaveRequests.status, "approved"),
          gte(leaveRequests.startDate, yearStart),
          lte(leaveRequests.endDate, yearEnd)
        ));
        
        const annualUsed = Number(annualResult?.total || 0);
        const sickUsed = Number(sickResult?.total || 0);
        
        return {
          annual: 21 - annualUsed, // Kenya standard: 21 days annual leave
          sick: 14 - sickUsed, // Kenya standard: 14 days sick leave
        };
      }
      
      // Single leave type query
      const [result] = await db.select({
        total: sql<number>`coalesce(sum(${leaveRequests.daysRequested}), 0)`
      })
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, input.employeeId),
        eq(leaveRequests.leaveType, input.leaveType),
        eq(leaveRequests.status, "approved"),
        gte(leaveRequests.startDate, yearStart),
        lte(leaveRequests.endDate, yearEnd)
      ));
      
      const used = Number(result?.total || 0);
      const annual = input.leaveType === "annual" ? 21 : 14; // Kenya standard
      const remaining = annual - used;
      
      return {
        annual,
        used,
        remaining,
      };
    }),

  // Record attendance
  recordAttendance: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      date: z.union([z.string(), z.date()]),
      checkIn: z.string(), // Time string like "08:00"
      checkOut: z.string().optional(), // Time string like "17:00"
      status: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const date = input.date instanceof Date ? input.date : new Date(input.date);
      
      // Calculate hours if checkOut is provided
      let hoursWorked = 0;
      if (input.checkOut) {
        const [checkInHour, checkInMin] = input.checkIn.split(':').map(Number);
        const [checkOutHour, checkOutMin] = input.checkOut.split(':').map(Number);
        const checkInMinutes = checkInHour * 60 + checkInMin;
        const checkOutMinutes = checkOutHour * 60 + checkOutMin;
        hoursWorked = (checkOutMinutes - checkInMinutes) / 60;
      }
      
      // Parse time strings to create timestamps for the given date
      const [checkInHour, checkInMin] = input.checkIn.split(':').map(Number);
      const clockInTime = new Date(date);
      clockInTime.setHours(checkInHour, checkInMin, 0, 0);
      
      let clockOutTime: Date | null = null;
      if (input.checkOut) {
        const [checkOutHour, checkOutMin] = input.checkOut.split(':').map(Number);
        clockOutTime = new Date(date);
        clockOutTime.setHours(checkOutHour, checkOutMin, 0, 0);
      }
      
      const [attendance] = await db.insert(attendanceRecords).values({
        employeeId: input.employeeId,
        date,
        clockInTime,
        clockOutTime,
        hoursWorked: hoursWorked.toFixed(2),
        status: input.status || "present",
      }).returning();
      
      return {
        success: true,
        attendanceId: attendance.id,
        hoursWorked,
      };
    }),

  // Calculate overtime (simple time-based calculation)
  calculateOvertime: protectedProcedure
    .input(z.object({
      checkIn: z.string(), // Time string like "08:00"
      checkOut: z.string(), // Time string like "22:00"
      standardHours: z.number().default(8),
    }))
    .query(async ({ input }) => {
      // Parse time strings
      const [checkInHour, checkInMin] = input.checkIn.split(':').map(Number);
      const [checkOutHour, checkOutMin] = input.checkOut.split(':').map(Number);
      
      // Calculate total minutes worked
      const checkInMinutes = checkInHour * 60 + checkInMin;
      const checkOutMinutes = checkOutHour * 60 + checkOutMin;
      const totalMinutes = checkOutMinutes - checkInMinutes;
      const totalHours = totalMinutes / 60;
      
      // Calculate overtime (hours beyond standard)
      const overtimeHours = Math.max(0, totalHours - input.standardHours);
      
      return overtimeHours;
    }),
});
