/**
 * Labor Management Service
 * Manages seasonal workers, task assignments, productivity tracking, and training
 * Integrates with payroll, HR, and TigerBeetle for payments
 */

import { db } from "../db.js";
import { BoundedMap } from "../cache/bounded-map.js";
import { createTigerBeetleLedger, TigerBeetleLedger } from "./tigerbeetle-ledger.js";
import { publishEvent, createEvent } from "../kafka.js";
import { ERPNextSyncService } from "./erpnext-sync-service.js";
import { logger } from '../logger.js';

let tigerBeetleLedger: TigerBeetleLedger | null = null;
let erpnextService: ERPNextSyncService | null = null;

function getERPNextService(): ERPNextSyncService | null {
  if (!erpnextService) {
    const url = process.env.ERPNEXT_URL;
    const apiKey = process.env.ERPNEXT_API_KEY;
    const apiSecret = process.env.ERPNEXT_API_SECRET;
    if (url && apiKey && apiSecret) {
      erpnextService = new ERPNextSyncService({ url, apiKey, apiSecret });
    }
  }
  return erpnextService;
}

async function getTigerBeetleLedger(): Promise<TigerBeetleLedger | null> {
  if (!tigerBeetleLedger) {
    try {
      tigerBeetleLedger = createTigerBeetleLedger();
    } catch (error) {
      logger.warn('[LaborManagement] TigerBeetle not available:', error);
    }
  }
  return tigerBeetleLedger;
}

export type WorkerType = 'permanent' | 'seasonal' | 'casual' | 'contract';
export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type PaymentFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface FarmWorker {
  id: string;
  farmId: number;
  firstName: string;
  lastName: string;
  phone: string;
  workerType: WorkerType;
  skills: string[];
  dailyRate: number;
  currency: string;
  startDate: Date;
  endDate?: Date;
  status: 'active' | 'inactive' | 'on_leave';
  bankAccount?: BankAccount;
  emergencyContact?: EmergencyContact;
  documents: WorkerDocument[];
  performanceScore: number;
  totalEarnings: number;
  totalDaysWorked: number;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface WorkerDocument {
  type: 'id_card' | 'contract' | 'training_cert' | 'medical';
  name: string;
  url: string;
  uploadedAt: Date;
  expiresAt?: Date;
}

export interface FarmTask {
  id: string;
  farmId: number;
  name: string;
  description: string;
  category: TaskCategory;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: TaskStatus;
  assignedWorkers: string[];
  scheduledDate: Date;
  dueDate: Date;
  estimatedHours: number;
  actualHours?: number;
  location?: string;
  equipment?: string[];
  notes?: string;
  completedAt?: Date;
  completedBy?: string;
  qualityScore?: number;
}

export type TaskCategory = 
  | 'land_preparation'
  | 'planting'
  | 'weeding'
  | 'fertilizing'
  | 'spraying'
  | 'irrigation'
  | 'harvesting'
  | 'post_harvest'
  | 'maintenance'
  | 'livestock'
  | 'general';

export interface WorkSchedule {
  id: string;
  farmId: number;
  weekStartDate: Date;
  weekEndDate: Date;
  shifts: WorkShift[];
  totalHours: number;
  totalCost: number;
}

export interface WorkShift {
  id: string;
  workerId: string;
  workerName: string;
  date: Date;
  startTime: string;
  endTime: string;
  hours: number;
  tasks: string[];
  status: 'scheduled' | 'checked_in' | 'checked_out' | 'absent' | 'cancelled';
  checkInTime?: Date;
  checkOutTime?: Date;
  overtimeHours?: number;
}

export interface PayrollRecord {
  id: string;
  farmId: number;
  workerId: string;
  workerName: string;
  period: { start: Date; end: Date };
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  bonuses: number;
  deductions: number;
  netPay: number;
  status: 'pending' | 'approved' | 'paid';
  paidAt?: Date;
  transactionId?: string;
}

export interface TrainingModule {
  id: string;
  title: string;
  description: string;
  category: string;
  duration: number; // minutes
  format: 'video' | 'document' | 'interactive' | 'in_person';
  language: string[];
  requiredFor: TaskCategory[];
  certificateAwarded: boolean;
  content: TrainingContent[];
}

export interface TrainingContent {
  type: 'video' | 'text' | 'quiz' | 'practical';
  title: string;
  url?: string;
  content?: string;
  duration?: number;
}

export interface WorkerTrainingProgress {
  workerId: string;
  moduleId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  score?: number;
  certificateUrl?: string;
}

export interface ProductivityReport {
  farmId: number;
  period: { start: Date; end: Date };
  totalWorkers: number;
  totalHoursWorked: number;
  totalTasksCompleted: number;
  averageProductivity: number;
  laborCost: number;
  costPerHectare: number;
  topPerformers: WorkerPerformance[];
  taskBreakdown: TaskBreakdown[];
  recommendations: string[];
}

export interface WorkerPerformance {
  workerId: string;
  workerName: string;
  hoursWorked: number;
  tasksCompleted: number;
  productivityScore: number;
  qualityScore: number;
}

export interface TaskBreakdown {
  category: TaskCategory;
  tasksCompleted: number;
  hoursSpent: number;
  averageQuality: number;
}

// Training modules database
const TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'TM001',
    title: 'Safe Pesticide Application',
    description: 'Learn proper techniques for safe and effective pesticide application',
    category: 'Safety',
    duration: 45,
    format: 'video',
    language: ['English', 'Yoruba', 'Hausa', 'Igbo'],
    requiredFor: ['spraying'],
    certificateAwarded: true,
    content: [
      { type: 'video', title: 'Introduction to Pesticide Safety', url: '/training/pesticide-safety-intro.mp4', duration: 10 },
      { type: 'text', title: 'Personal Protective Equipment', content: 'Always wear gloves, goggles, and masks...' },
      { type: 'video', title: 'Application Techniques', url: '/training/application-techniques.mp4', duration: 15 },
      { type: 'quiz', title: 'Safety Assessment', duration: 10 },
      { type: 'practical', title: 'Supervised Application', duration: 10 },
    ],
  },
  {
    id: 'TM002',
    title: 'Harvesting Best Practices',
    description: 'Techniques for efficient and quality-preserving harvesting',
    category: 'Operations',
    duration: 30,
    format: 'video',
    language: ['English', 'Yoruba', 'Hausa'],
    requiredFor: ['harvesting'],
    certificateAwarded: true,
    content: [
      { type: 'video', title: 'Harvest Timing', url: '/training/harvest-timing.mp4', duration: 8 },
      { type: 'video', title: 'Handling Techniques', url: '/training/handling.mp4', duration: 12 },
      { type: 'quiz', title: 'Knowledge Check', duration: 10 },
    ],
  },
  {
    id: 'TM003',
    title: 'Equipment Operation & Maintenance',
    description: 'Safe operation and basic maintenance of farm equipment',
    category: 'Equipment',
    duration: 60,
    format: 'interactive',
    language: ['English', 'Yoruba'],
    requiredFor: ['land_preparation', 'maintenance'],
    certificateAwarded: true,
    content: [
      { type: 'video', title: 'Equipment Safety', url: '/training/equipment-safety.mp4', duration: 15 },
      { type: 'text', title: 'Pre-Operation Checklist', content: 'Before starting any equipment...' },
      { type: 'video', title: 'Basic Maintenance', url: '/training/maintenance.mp4', duration: 20 },
      { type: 'practical', title: 'Hands-on Training', duration: 25 },
    ],
  },
  {
    id: 'TM004',
    title: 'Irrigation System Management',
    description: 'Operating and maintaining irrigation systems efficiently',
    category: 'Operations',
    duration: 40,
    format: 'video',
    language: ['English', 'Hausa'],
    requiredFor: ['irrigation'],
    certificateAwarded: false,
    content: [
      { type: 'video', title: 'Irrigation Basics', url: '/training/irrigation-basics.mp4', duration: 15 },
      { type: 'video', title: 'System Maintenance', url: '/training/irrigation-maintenance.mp4', duration: 15 },
      { type: 'quiz', title: 'Assessment', duration: 10 },
    ],
  },
  {
    id: 'TM005',
    title: 'Post-Harvest Handling',
    description: 'Proper handling, sorting, and storage of harvested produce',
    category: 'Quality',
    duration: 35,
    format: 'video',
    language: ['English', 'Yoruba', 'Hausa', 'Igbo'],
    requiredFor: ['post_harvest'],
    certificateAwarded: true,
    content: [
      { type: 'video', title: 'Sorting and Grading', url: '/training/sorting.mp4', duration: 12 },
      { type: 'video', title: 'Storage Techniques', url: '/training/storage.mp4', duration: 13 },
      { type: 'quiz', title: 'Quality Assessment', duration: 10 },
    ],
  },
];

class LaborManagementService {
  private workers: BoundedMap<string, FarmWorker> = new BoundedMap(2000, 86400_000);
  private tasks: BoundedMap<string, FarmTask> = new BoundedMap(5000, 43200_000);
  private schedules: BoundedMap<string, WorkSchedule> = new BoundedMap(2000, 86400_000);
  private payrollRecords: BoundedMap<string, PayrollRecord> = new BoundedMap(5000, 86400_000);
  private trainingProgress: BoundedMap<string, WorkerTrainingProgress[]> = new BoundedMap(2000, 86400_000);

  /**
   * Register a new farm worker
   */
  async registerWorker(params: {
    farmId: number;
    firstName: string;
    lastName: string;
    phone: string;
    workerType: WorkerType;
    skills: string[];
    dailyRate: number;
    startDate: Date;
    endDate?: Date;
    bankAccount?: BankAccount;
    emergencyContact?: EmergencyContact;
  }): Promise<FarmWorker> {
    const workerId = `WKR-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;

    const worker: FarmWorker = {
      id: workerId,
      farmId: params.farmId,
      firstName: params.firstName,
      lastName: params.lastName,
      phone: params.phone,
      workerType: params.workerType,
      skills: params.skills,
      dailyRate: params.dailyRate,
      currency: 'NGN',
      startDate: params.startDate,
      endDate: params.endDate,
      status: 'active',
      bankAccount: params.bankAccount,
      emergencyContact: params.emergencyContact,
      documents: [],
      performanceScore: 0,
      totalEarnings: 0,
      totalDaysWorked: 0,
    };

    this.workers.set(workerId, worker);

    // Emit event
    try {
      await publishEvent('labor-events', createEvent(
        'worker_registered',
        'worker',
        workerId,
        params.farmId,
        worker
      ));
    } catch (error) {
      logger.warn('[LaborManagement] Could not emit Kafka event:', error);
    }

    // Sync to ERPNext HR Module
    try {
      const erpnext = getERPNextService();
      if (erpnext) {
        await (erpnext as any).pushCustomer(params.farmId, worker);
        logger.info('[LaborManagement] Worker synced to ERPNext Employee:', workerId);
      }
    } catch (error) {
      logger.warn('[LaborManagement] Could not sync to ERPNext:', error);
    }

    return worker;
  }

  /**
   * Create a farm task
   */
  async createTask(params: {
    farmId: number;
    name: string;
    description: string;
    category: TaskCategory;
    priority: FarmTask['priority'];
    scheduledDate: Date;
    dueDate: Date;
    estimatedHours: number;
    location?: string;
    equipment?: string[];
  }): Promise<FarmTask> {
    const taskId = `TSK-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;

    const task: FarmTask = {
      id: taskId,
      farmId: params.farmId,
      name: params.name,
      description: params.description,
      category: params.category,
      priority: params.priority,
      status: 'pending',
      assignedWorkers: [],
      scheduledDate: params.scheduledDate,
      dueDate: params.dueDate,
      estimatedHours: params.estimatedHours,
      location: params.location,
      equipment: params.equipment,
    };

    this.tasks.set(taskId, task);

    return task;
  }

  /**
   * Assign workers to a task
   */
  async assignWorkersToTask(taskId: string, workerIds: string[]): Promise<FarmTask> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    // Validate workers exist and are available
    for (const workerId of workerIds) {
      const worker = this.workers.get(workerId);
      if (!worker) {
        throw new Error(`Worker ${workerId} not found`);
      }
      if (worker.status !== 'active') {
        throw new Error(`Worker ${workerId} is not active`);
      }
    }

    task.assignedWorkers = workerIds;
    task.status = 'assigned';

    // Emit event
    try {
      await publishEvent('labor-events', createEvent(
        'task_assigned',
        'task',
        taskId,
        task.farmId,
        { taskId, workerIds }
      ));
    } catch (error) {
      logger.warn('[LaborManagement] Could not emit Kafka event:', error);
    }

    return task;
  }

  /**
   * Complete a task
   */
  async completeTask(params: {
    taskId: string;
    completedBy: string;
    actualHours: number;
    qualityScore: number;
    notes?: string;
  }): Promise<FarmTask> {
    const { taskId, completedBy, actualHours, qualityScore, notes } = params;

    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    task.status = 'completed';
    task.completedAt = new Date();
    task.completedBy = completedBy;
    task.actualHours = actualHours;
    task.qualityScore = qualityScore;
    if (notes) task.notes = notes;

    // Update worker performance
    for (const workerId of task.assignedWorkers) {
      const worker = this.workers.get(workerId);
      if (worker) {
        worker.totalDaysWorked += Math.ceil(actualHours / 8);
        worker.performanceScore = (worker.performanceScore + qualityScore) / 2;
      }
    }

    return task;
  }

  /**
   * Generate work schedule for a week
   */
  async generateWeekSchedule(params: {
    farmId: number;
    weekStartDate: Date;
    tasks: string[];
  }): Promise<WorkSchedule> {
    const { farmId, weekStartDate, tasks: taskIds } = params;

    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);

    const shifts: WorkShift[] = [];
    let totalHours = 0;
    let totalCost = 0;

    // Get available workers for this farm
    const farmWorkers = Array.from(this.workers.values()).filter(w => 
      w.farmId === farmId && w.status === 'active'
    );

    // Get tasks to schedule
    const tasksToSchedule = taskIds
      .map(id => this.tasks.get(id))
      .filter((t): t is FarmTask => t !== undefined);

    // Simple scheduling algorithm - distribute tasks across workers and days
    let dayOffset = 0;
    for (const task of tasksToSchedule) {
      const workersNeeded = Math.ceil(task.estimatedHours / 8);
      const assignedWorkers = farmWorkers.slice(0, workersNeeded);

      for (const worker of assignedWorkers) {
        const shiftDate = new Date(weekStartDate);
        shiftDate.setDate(shiftDate.getDate() + (dayOffset % 6));

        const shift: WorkShift = {
          id: `SHF-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
          workerId: worker.id,
          workerName: `${worker.firstName} ${worker.lastName}`,
          date: shiftDate,
          startTime: '07:00',
          endTime: '15:00',
          hours: 8,
          tasks: [task.id],
          status: 'scheduled',
        };

        shifts.push(shift);
        totalHours += 8;
        totalCost += worker.dailyRate;
      }

      dayOffset++;
    }

    const scheduleId = `SCH-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const schedule: WorkSchedule = {
      id: scheduleId,
      farmId,
      weekStartDate,
      weekEndDate,
      shifts,
      totalHours,
      totalCost,
    };

    this.schedules.set(scheduleId, schedule);

    return schedule;
  }

  /**
   * Check in worker for shift
   */
  async checkInWorker(shiftId: string): Promise<WorkShift> {
    for (const schedule of this.schedules.values()) {
      const shift = schedule.shifts.find(s => s.id === shiftId);
      if (shift) {
        shift.status = 'checked_in';
        shift.checkInTime = new Date();
        return shift;
      }
    }
    throw new Error('Shift not found');
  }

  /**
   * Check out worker from shift
   */
  async checkOutWorker(shiftId: string): Promise<WorkShift> {
    for (const schedule of this.schedules.values()) {
      const shift = schedule.shifts.find(s => s.id === shiftId);
      if (shift) {
        shift.status = 'checked_out';
        shift.checkOutTime = new Date();

        // Calculate overtime if applicable
        if (shift.checkInTime && shift.checkOutTime) {
          const actualHours = (shift.checkOutTime.getTime() - shift.checkInTime.getTime()) / (1000 * 60 * 60);
          if (actualHours > 8) {
            shift.overtimeHours = actualHours - 8;
          }
        }

        return shift;
      }
    }
    throw new Error('Shift not found');
  }

  /**
   * Generate payroll for a period
   */
  async generatePayroll(params: {
    farmId: number;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<PayrollRecord[]> {
    const { farmId, periodStart, periodEnd } = params;

    const payrollRecords: PayrollRecord[] = [];

    // Get all workers for this farm
    const farmWorkers = Array.from(this.workers.values()).filter(w => w.farmId === farmId);

    // Get all shifts in the period
    const periodShifts: WorkShift[] = [];
    for (const schedule of this.schedules.values()) {
      if (schedule.farmId === farmId) {
        for (const shift of schedule.shifts) {
          if (shift.date >= periodStart && shift.date <= periodEnd && shift.status === 'checked_out') {
            periodShifts.push(shift);
          }
        }
      }
    }

    // Calculate payroll for each worker
    for (const worker of farmWorkers) {
      const workerShifts = periodShifts.filter(s => s.workerId === worker.id);
      
      if (workerShifts.length === 0) continue;

      const regularHours = workerShifts.reduce((sum, s) => sum + Math.min(s.hours, 8), 0);
      const overtimeHours = workerShifts.reduce((sum, s) => sum + (s.overtimeHours || 0), 0);

      const hourlyRate = worker.dailyRate / 8;
      const regularPay = regularHours * hourlyRate;
      const overtimePay = overtimeHours * hourlyRate * 1.5; // 1.5x for overtime

      const payrollId = `PAY-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
      const payroll: PayrollRecord = {
        id: payrollId,
        farmId,
        workerId: worker.id,
        workerName: `${worker.firstName} ${worker.lastName}`,
        period: { start: periodStart, end: periodEnd },
        regularHours,
        overtimeHours,
        regularPay: Math.round(regularPay),
        overtimePay: Math.round(overtimePay),
        bonuses: 0,
        deductions: 0,
        netPay: Math.round(regularPay + overtimePay),
        status: 'pending',
      };

      this.payrollRecords.set(payrollId, payroll);
      payrollRecords.push(payroll);
    }

    return payrollRecords;
  }

  /**
   * Process payroll payment
   */
  async processPayrollPayment(payrollId: string): Promise<PayrollRecord> {
    const payroll = this.payrollRecords.get(payrollId);
    if (!payroll) {
      throw new Error('Payroll record not found');
    }

    if (payroll.status === 'paid') {
      throw new Error('Payroll already paid');
    }

    const worker = this.workers.get(payroll.workerId);
    if (!worker) {
      throw new Error('Worker not found');
    }

    // Process payment via TigerBeetle
    try {
      const ledger = await getTigerBeetleLedger();
      if (ledger) {
        const txResult = await ledger.recordTransaction({
          type: 'payroll_payment',
          amount: payroll.netPay,
          fromAccountId: `farm_${payroll.farmId}`,
          toAccountId: payroll.workerId,
          metadata: { payrollId, workerId: payroll.workerId },
        });

        payroll.status = 'paid';
        payroll.paidAt = new Date();
        payroll.transactionId = txResult?.transactionId;

        // Update worker total earnings
        worker.totalEarnings += payroll.netPay;
      }
    } catch (error) {
      logger.warn('[LaborManagement] Could not process payment:', error);
      payroll.status = 'approved'; // Mark as approved but not paid
    }

    return payroll;
  }

  /**
   * Get training modules
   */
  getTrainingModules(category?: string): TrainingModule[] {
    if (category) {
      return TRAINING_MODULES.filter(m => m.category === category);
    }
    return TRAINING_MODULES;
  }

  /**
   * Get required training for a task category
   */
  getRequiredTraining(taskCategory: TaskCategory): TrainingModule[] {
    return TRAINING_MODULES.filter(m => m.requiredFor.includes(taskCategory));
  }

  /**
   * Start training for a worker
   */
  async startTraining(workerId: string, moduleId: string): Promise<WorkerTrainingProgress> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error('Worker not found');
    }

    const module = TRAINING_MODULES.find(m => m.id === moduleId);
    if (!module) {
      throw new Error('Training module not found');
    }

    const progress: WorkerTrainingProgress = {
      workerId,
      moduleId,
      status: 'in_progress',
      progress: 0,
      startedAt: new Date(),
    };

    const workerProgress = this.trainingProgress.get(workerId) || [];
    workerProgress.push(progress);
    this.trainingProgress.set(workerId, workerProgress);

    return progress;
  }

  /**
   * Complete training for a worker
   */
  async completeTraining(workerId: string, moduleId: string, score: number): Promise<WorkerTrainingProgress> {
    const workerProgress = this.trainingProgress.get(workerId);
    if (!workerProgress) {
      throw new Error('No training progress found for worker');
    }

    const progress = workerProgress.find(p => p.moduleId === moduleId);
    if (!progress) {
      throw new Error('Training progress not found');
    }

    progress.status = 'completed';
    progress.progress = 100;
    progress.completedAt = new Date();
    progress.score = score;

    const module = TRAINING_MODULES.find(m => m.id === moduleId);
    if (module?.certificateAwarded && score >= 70) {
      progress.certificateUrl = `/certificates/${workerId}-${moduleId}.pdf`;
    }

    // Add skill to worker if passed
    if (score >= 70) {
      const worker = this.workers.get(workerId);
      if (worker && module) {
        worker.skills.push(module.title);
      }
    }

    return progress;
  }

  /**
   * Get worker training progress
   */
  getWorkerTrainingProgress(workerId: string): WorkerTrainingProgress[] {
    return this.trainingProgress.get(workerId) || [];
  }

  /**
   * Generate productivity report
   */
  async generateProductivityReport(params: {
    farmId: number;
    periodStart: Date;
    periodEnd: Date;
    farmSize: number;
  }): Promise<ProductivityReport> {
    const { farmId, periodStart, periodEnd, farmSize } = params;

    // Get workers and tasks for this farm
    const farmWorkers = Array.from(this.workers.values()).filter(w => w.farmId === farmId);
    const farmTasks = Array.from(this.tasks.values()).filter(t => 
      t.farmId === farmId && 
      t.status === 'completed' &&
      t.completedAt && t.completedAt >= periodStart && t.completedAt <= periodEnd
    );

    // Calculate totals
    const totalHoursWorked = farmTasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);
    const totalTasksCompleted = farmTasks.length;

    // Calculate labor cost
    const laborCost = farmWorkers.reduce((sum, w) => sum + w.totalEarnings, 0);

    // Calculate worker performance
    const topPerformers: WorkerPerformance[] = farmWorkers
      .map(w => ({
        workerId: w.id,
        workerName: `${w.firstName} ${w.lastName}`,
        hoursWorked: w.totalDaysWorked * 8,
        tasksCompleted: farmTasks.filter(t => t.assignedWorkers.includes(w.id)).length,
        productivityScore: w.performanceScore,
        qualityScore: w.performanceScore,
      }))
      .sort((a, b) => b.productivityScore - a.productivityScore)
      .slice(0, 5);

    // Task breakdown by category
    const taskBreakdown: TaskBreakdown[] = [];
    const categories = [...new Set(farmTasks.map(t => t.category))];
    for (const category of categories) {
      const categoryTasks = farmTasks.filter(t => t.category === category);
      taskBreakdown.push({
        category,
        tasksCompleted: categoryTasks.length,
        hoursSpent: categoryTasks.reduce((sum, t) => sum + (t.actualHours || 0), 0),
        averageQuality: categoryTasks.reduce((sum, t) => sum + (t.qualityScore || 0), 0) / categoryTasks.length || 0,
      });
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (totalHoursWorked / farmSize > 100) {
      recommendations.push('Consider mechanization to reduce labor hours per hectare');
    }
    if (topPerformers.some(p => p.productivityScore < 60)) {
      recommendations.push('Provide additional training for underperforming workers');
    }
    if (taskBreakdown.some(t => t.averageQuality < 70)) {
      recommendations.push('Focus on quality improvement in low-scoring task categories');
    }

    return {
      farmId,
      period: { start: periodStart, end: periodEnd },
      totalWorkers: farmWorkers.length,
      totalHoursWorked,
      totalTasksCompleted,
      averageProductivity: totalTasksCompleted / (totalHoursWorked || 1) * 100,
      laborCost,
      costPerHectare: Math.round(laborCost / farmSize),
      topPerformers,
      taskBreakdown,
      recommendations,
    };
  }

  /**
   * Get farm workers
   */
  getFarmWorkers(farmId: number): FarmWorker[] {
    return Array.from(this.workers.values()).filter(w => w.farmId === farmId);
  }

  /**
   * Get farm tasks
   */
  getFarmTasks(farmId: number, status?: TaskStatus): FarmTask[] {
    let tasks = Array.from(this.tasks.values()).filter(t => t.farmId === farmId);
    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }
    return tasks;
  }

  /**
   * Get worker by ID
   */
  getWorker(workerId: string): FarmWorker | null {
    return this.workers.get(workerId) || null;
  }
}

export const laborManagementService = new LaborManagementService();
