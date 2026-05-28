/**
 * Human Resources (HR) Service
 * 
 * Comprehensive HR management for farm workers:
 * - Employee registration and management
 * - Time clock in/out tracking
 * - Attendance monitoring
 * - Leave request workflow
 * - Payroll calculation
 * - Shift management
 */

import { getDb } from '../../db';
import {
  employees,
  timeEntries,
  attendanceRecords,
  shifts,
  leaveRequests,
  payrollRecords,
  type Employee,
  type TimeEntry,
  type AttendanceRecord,
  type LeaveRequest,
  type PayrollRecord,
} from '../../../drizzle/financial-schema';
import { eq, and, sql, desc, between } from 'drizzle-orm';
import { logger } from '../../logger.js';

export interface CreateEmployeeInput {
  userId: number;
  fullName: string;
  phoneNumber: string;
  email?: string;
  role: string;
  hourlyRate?: number; // in cents
  hireDate: Date;
  biometricId?: string;
}

export interface ClockInInput {
  employeeId: number;
  clockInLocation?: string; // GPS coordinates
  farmId?: number;
  cropId?: number;
  workOrderId?: number;
}

export interface ClockOutInput {
  timeEntryId: number;
  clockOutLocation?: string;
}

export interface LeaveRequestInput {
  employeeId: number;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  reason?: string;
}

export interface PayrollInput {
  employeeId: number;
  periodStart: Date;
  periodEnd: Date;
  paymentMethod?: string;
}

export class HRService {
  /**
   * Register a new employee
   */
  async createEmployee(input: CreateEmployeeInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Generate employee number
    const employeeNumber = await this.generateEmployeeNumber(input.userId);

    const [employee] = await database.insert(employees).values({
      userId: input.userId,
      employeeNumber,
      fullName: input.fullName,
      phoneNumber: input.phoneNumber,
      email: input.email,
      role: input.role,
      hourlyRate: input.hourlyRate,
      hireDate: input.hireDate,
      biometricId: input.biometricId,
      isActive: true,
    }).returning();

    logger.info(`[HR] Created employee ${employeeNumber}: ${input.fullName}`);
    return employee.id;
  }

  /**
   * Clock in - Start work shift
   */
  async clockIn(input: ClockInInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Check if employee has an open time entry
    const [openEntry] = await database
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, input.employeeId),
        sql`${timeEntries.clockOut} IS NULL`
      ))
      .limit(1);

    if (openEntry) {
      throw new Error('Employee already clocked in. Must clock out first.');
    }

    // Create time entry
    const [entry] = await database.insert(timeEntries).values({
      employeeId: input.employeeId,
      clockIn: new Date(),
      clockInLocation: input.clockInLocation,
      farmId: input.farmId,
      cropId: input.cropId,
      workOrderId: input.workOrderId,
      workType: 'regular',
    }).returning();

    logger.info(`[HR] Employee ${input.employeeId} clocked in at ${entry.clockIn}`);
    return entry.id;
  }

  /**
   * Clock out - End work shift
   */
  async clockOut(input: ClockOutInput): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get time entry
    const [entry] = await database
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.id, input.timeEntryId))
      .limit(1);

    if (!entry) {
      throw new Error('Time entry not found');
    }

    if (entry.clockOut) {
      throw new Error('Already clocked out');
    }

    const clockOut = new Date();
    const clockIn = new Date(entry.clockIn);
    
    // Calculate hours worked
    const milliseconds = clockOut.getTime() - clockIn.getTime();
    const hoursWorked = milliseconds / (1000 * 60 * 60);

    // Update time entry
    await database.update(timeEntries)
      .set({
        clockOut,
        clockOutLocation: input.clockOutLocation,
        hoursWorked: hoursWorked.toFixed(2),
      })
      .where(eq(timeEntries.id, input.timeEntryId));

    // Update attendance record
    await this.updateAttendanceRecord(entry.employeeId, clockIn);

    logger.info(`[HR] Employee ${entry.employeeId} clocked out. Hours worked: ${hoursWorked.toFixed(2)}`);
  }

  /**
   * Update attendance record for the day
   */
  private async updateAttendanceRecord(employeeId: number, date: Date): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get start and end of day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all time entries for the day
    const entries = await database
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, employeeId),
        between(timeEntries.clockIn, startOfDay, endOfDay)
      ));

    if (entries.length === 0) return;

    // Calculate total hours
    const totalHours = entries.reduce((sum, entry) => {
      return sum + (parseFloat(entry.hoursWorked || '0'));
    }, 0);

    const firstEntry = entries[0];
    const lastEntry = entries[entries.length - 1];

    // Upsert attendance record
    await database
      .insert(attendanceRecords)
      .values({
        employeeId,
        date: startOfDay,
        status: 'present',
        clockInTime: firstEntry.clockIn,
        clockOutTime: lastEntry.clockOut || undefined,
        hoursWorked: totalHours.toFixed(2),
      })
      .onConflictDoUpdate({
        target: [attendanceRecords.employeeId, attendanceRecords.date],
        set: {
          clockOutTime: lastEntry.clockOut || undefined,
          hoursWorked: totalHours.toFixed(2),
        },
      });
  }

  /**
   * Submit leave request
   */
  async submitLeaveRequest(input: LeaveRequestInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Check for overlapping leave requests
    const overlapping = await database
      .select()
      .from(leaveRequests)
      .where(and(
        eq(leaveRequests.employeeId, input.employeeId),
        sql`${leaveRequests.status} != 'rejected'`,
        sql`${leaveRequests.startDate} <= ${input.endDate}`,
        sql`${leaveRequests.endDate} >= ${input.startDate}`
      ))
      .limit(1);

    if (overlapping.length > 0) {
      throw new Error('Overlapping leave request exists');
    }

    const [request] = await database.insert(leaveRequests).values({
      employeeId: input.employeeId,
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason,
      status: 'pending',
    }).returning();

    logger.info(`[HR] Leave request submitted for employee ${input.employeeId}`);
    return request.id;
  }

  /**
   * Approve leave request
   */
  async approveLeaveRequest(requestId: number, approverId: number): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    await database.update(leaveRequests)
      .set({
        status: 'approved',
        approvedBy: approverId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(leaveRequests.id, requestId));

    logger.info(`[HR] Leave request ${requestId} approved`);
  }

  /**
   * Reject leave request
   */
  async rejectLeaveRequest(requestId: number, approverId: number, reason: string): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    await database.update(leaveRequests)
      .set({
        status: 'rejected',
        approvedBy: approverId,
        approvedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(leaveRequests.id, requestId));

    logger.info(`[HR] Leave request ${requestId} rejected`);
  }

  /**
   * Calculate and create payroll for employee
   */
  async calculatePayroll(input: PayrollInput): Promise<number> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get employee
    const [employee] = await database
      .select()
      .from(employees)
      .where(eq(employees.id, input.employeeId))
      .limit(1);

    if (!employee) {
      throw new Error('Employee not found');
    }

    if (!employee.hourlyRate) {
      throw new Error('Employee hourly rate not set');
    }

    // Get time entries for period
    const entries = await database
      .select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.employeeId, input.employeeId),
        between(timeEntries.clockIn, input.periodStart, input.periodEnd),
        sql`${timeEntries.clockOut} IS NOT NULL`
      ));

    // Calculate hours
    let regularHours = 0;
    let overtimeHours = 0;

    for (const entry of entries) {
      const hours = parseFloat(entry.hoursWorked || '0');
      
      // Simple overtime calculation: > 8 hours/day is overtime
      if (hours > 8) {
        regularHours += 8;
        overtimeHours += (hours - 8);
      } else {
        regularHours += hours;
      }
    }

    const totalHours = regularHours + overtimeHours;

    // Calculate pay (overtime is 1.5x)
    const regularPay = Math.round(regularHours * employee.hourlyRate);
    const overtimePay = Math.round(overtimeHours * employee.hourlyRate * 1.5);
    const grossPay = regularPay + overtimePay;

    // Simple deduction (5% for taxes/social security)
    const deductions = Math.round(grossPay * 0.05);
    const netPay = grossPay - deductions;

    // Create payroll record
    const [payroll] = await database.insert(payrollRecords).values({
      employeeId: input.employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      hoursWorked: totalHours.toFixed(2),
      regularHours: regularHours.toFixed(2),
      overtimeHours: overtimeHours.toFixed(2),
      hourlyRate: employee.hourlyRate,
      grossPay,
      deductions,
      netPay,
      paymentMethod: input.paymentMethod,
      status: 'pending',
    }).returning();

    logger.info(`[HR] Payroll calculated for employee ${input.employeeId}: ₦${(netPay / 100).toFixed(2)}`);
    return payroll.id;
  }

  /**
   * Mark payroll as paid
   */
  async markPayrollPaid(payrollId: number, paymentReference: string): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    await database.update(payrollRecords)
      .set({
        status: 'paid',
        paymentDate: new Date(),
        paymentReference,
      })
      .where(eq(payrollRecords.id, payrollId));

    logger.info(`[HR] Payroll ${payrollId} marked as paid`);
  }

  /**
   * Get employee attendance summary
   */
  async getAttendanceSummary(employeeId: number, startDate: Date, endDate: Date): Promise<unknown> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const records = await database
      .select()
      .from(attendanceRecords)
      .where(and(
        eq(attendanceRecords.employeeId, employeeId),
        between(attendanceRecords.date, startDate, endDate)
      ))
      .orderBy(desc(attendanceRecords.date));

    const totalDays = records.length;
    const presentDays = records.filter(r => r.status === 'present').length;
    const absentDays = records.filter(r => r.status === 'absent').length;
    const lateDays = records.filter(r => r.status === 'late').length;
    const totalHours = records.reduce((sum, r) => sum + parseFloat(r.hoursWorked || '0'), 0);

    return {
      employeeId,
      period: { startDate, endDate },
      totalDays,
      presentDays,
      absentDays,
      lateDays,
      totalHours: totalHours.toFixed(2),
      attendanceRate: totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(2) : 0,
      records,
    };
  }

  /**
   * Get all employees for a user
   */
  async getEmployees(userId: number, activeOnly: boolean = true): Promise<Employee[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    if (activeOnly) {
      return await database
        .select()
        .from(employees)
        .where(and(
          eq(employees.userId, userId),
          eq(employees.isActive, true)
        ))
        .orderBy(desc(employees.createdAt));
    }

    return await database
      .select()
      .from(employees)
      .where(eq(employees.userId, userId))
      .orderBy(desc(employees.createdAt));
  }

  /**
   * Get pending leave requests
   */
  async getPendingLeaveRequests(userId: number): Promise<LeaveRequest[]> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    // Get all employees for this user
    const userEmployees = await database
      .select()
      .from(employees)
      .where(eq(employees.userId, userId));

    const employeeIds = userEmployees.map(e => e.id);

    if (employeeIds.length === 0) return [];

    return await database
      .select()
      .from(leaveRequests)
      .where(and(
        sql`${leaveRequests.employeeId} = ANY(${employeeIds})`,
        eq(leaveRequests.status, 'pending')
      ))
      .orderBy(desc(leaveRequests.createdAt));
  }

  /**
   * Generate employee number (EMP-YYYY-NNNN)
   */
  private async generateEmployeeNumber(userId: number): Promise<string> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    const year = new Date().getFullYear();
    
    const result = await database
      .select({ count: sql<number>`count(*)` })
      .from(employees)
      .where(eq(employees.userId, userId));

    const count = Number(result[0]?.count) || 0;
    const nextNumber = count + 1;
    
    return `EMP-${year}-${String(nextNumber).padStart(4, '0')}`;
  }

  /**
   * Terminate employee
   */
  async terminateEmployee(employeeId: number, terminationDate: Date): Promise<void> {
    const database = await getDb();
    if (!database) {
      throw new Error('Database connection failed');
    }

    await database.update(employees)
      .set({
        isActive: false,
        terminationDate,
        updatedAt: new Date(),
      })
      .where(eq(employees.id, employeeId));

    logger.info(`[HR] Employee ${employeeId} terminated`);
  }
}

// Export singleton instance
export const hrService = new HRService();
