/**
 * Loan Processing Tests
 * Comprehensive tests for loan application, approval, disbursement, and repayment flows
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock database
const mockDb = {
  query: {
    loanApplications: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    farmers: {
      findFirst: vi.fn(),
    },
    loanRepayments: {
      findMany: vi.fn(),
    },
  },
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    }),
  }),
};

// Mock loan service
class LoanProcessingService {
  private db: typeof mockDb;

  constructor(db: typeof mockDb) {
    this.db = db;
  }

  async createLoanApplication(data: {
    farmerId: number;
    amount: number;
    purpose: string;
    termMonths: number;
    interestRate: number;
  }) {
    // Validate farmer exists
    const farmer = await this.db.query.farmers.findFirst({
      where: { id: data.farmerId },
    });

    if (!farmer) {
      throw new Error('Farmer not found');
    }

    // Validate loan amount
    if (data.amount <= 0) {
      throw new Error('Loan amount must be positive');
    }

    if (data.amount > 1000000) {
      throw new Error('Loan amount exceeds maximum limit');
    }

    // Validate term
    if (data.termMonths < 1 || data.termMonths > 60) {
      throw new Error('Loan term must be between 1 and 60 months');
    }

    // Calculate monthly payment
    const monthlyRate = data.interestRate / 100 / 12;
    const monthlyPayment = (data.amount * monthlyRate * Math.pow(1 + monthlyRate, data.termMonths)) /
      (Math.pow(1 + monthlyRate, data.termMonths) - 1);

    // Create application
    const [application] = await this.db.insert('loan_applications').values({
      farmerId: data.farmerId,
      amount: data.amount,
      purpose: data.purpose,
      termMonths: data.termMonths,
      interestRate: data.interestRate,
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      status: 'pending',
      createdAt: new Date(),
    }).returning();

    return application;
  }

  async approveLoan(applicationId: number, approvedBy: number) {
    const application = await this.db.query.loanApplications.findFirst({
      where: { id: applicationId },
    });

    if (!application) {
      throw new Error('Loan application not found');
    }

    if (application.status !== 'pending') {
      throw new Error('Only pending applications can be approved');
    }

    await this.db.update('loan_applications').set({
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
    }).where({ id: applicationId });

    return { success: true, applicationId };
  }

  async rejectLoan(applicationId: number, rejectedBy: number, reason: string) {
    const application = await this.db.query.loanApplications.findFirst({
      where: { id: applicationId },
    });

    if (!application) {
      throw new Error('Loan application not found');
    }

    if (application.status !== 'pending') {
      throw new Error('Only pending applications can be rejected');
    }

    await this.db.update('loan_applications').set({
      status: 'rejected',
      rejectedBy,
      rejectedAt: new Date(),
      rejectionReason: reason,
    }).where({ id: applicationId });

    return { success: true, applicationId };
  }

  async disburseLoan(applicationId: number, disbursedBy: number) {
    const application = await this.db.query.loanApplications.findFirst({
      where: { id: applicationId },
    });

    if (!application) {
      throw new Error('Loan application not found');
    }

    if (application.status !== 'approved') {
      throw new Error('Only approved applications can be disbursed');
    }

    await this.db.update('loan_applications').set({
      status: 'disbursed',
      disbursedBy,
      disbursedAt: new Date(),
    }).where({ id: applicationId });

    return { success: true, applicationId };
  }

  async recordRepayment(applicationId: number, amount: number, paymentMethod: string) {
    const application = await this.db.query.loanApplications.findFirst({
      where: { id: applicationId },
    });

    if (!application) {
      throw new Error('Loan application not found');
    }

    if (application.status !== 'disbursed' && application.status !== 'active') {
      throw new Error('Can only record repayments for active loans');
    }

    if (amount <= 0) {
      throw new Error('Repayment amount must be positive');
    }

    // Get total repayments
    const repayments = await this.db.query.loanRepayments.findMany({
      where: { applicationId },
    });

    const totalRepaid = repayments.reduce((sum: number, r: any) => sum + r.amount, 0);
    const remainingBalance = application.amount - totalRepaid;

    if (amount > remainingBalance) {
      throw new Error('Repayment amount exceeds remaining balance');
    }

    // Record repayment
    await this.db.insert('loan_repayments').values({
      applicationId,
      amount,
      paymentMethod,
      paidAt: new Date(),
    }).returning();

    // Check if loan is fully repaid
    if (totalRepaid + amount >= application.amount) {
      await this.db.update('loan_applications').set({
        status: 'completed',
        completedAt: new Date(),
      }).where({ id: applicationId });
    }

    return { success: true, remainingBalance: remainingBalance - amount };
  }

  calculateCreditScore(farmer: {
    totalLoans: number;
    completedLoans: number;
    defaultedLoans: number;
    averageRepaymentDays: number;
    farmSize: number;
    yearsOfExperience: number;
  }): number {
    let score = 500; // Base score

    // Loan history (40% weight)
    if (farmer.totalLoans > 0) {
      const completionRate = farmer.completedLoans / farmer.totalLoans;
      score += completionRate * 200;
      score -= farmer.defaultedLoans * 50;
    }

    // Repayment timeliness (30% weight)
    if (farmer.averageRepaymentDays <= 0) {
      score += 150; // Early or on-time
    } else if (farmer.averageRepaymentDays <= 7) {
      score += 100; // Within grace period
    } else if (farmer.averageRepaymentDays <= 30) {
      score += 50; // Slightly late
    } else {
      score -= 50; // Significantly late
    }

    // Farm assets (20% weight)
    if (farmer.farmSize >= 10) {
      score += 100;
    } else if (farmer.farmSize >= 5) {
      score += 70;
    } else if (farmer.farmSize >= 2) {
      score += 40;
    } else {
      score += 20;
    }

    // Experience (10% weight)
    score += Math.min(farmer.yearsOfExperience * 5, 50);

    // Clamp score between 300 and 850
    return Math.max(300, Math.min(850, Math.round(score)));
  }
}

describe('LoanProcessingService', () => {
  let service: LoanProcessingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LoanProcessingService(mockDb);
  });

  describe('createLoanApplication', () => {
    it('should create a loan application for valid farmer', async () => {
      mockDb.query.farmers.findFirst.mockResolvedValue({ id: 1, name: 'John Doe' });

      const result = await service.createLoanApplication({
        farmerId: 1,
        amount: 50000,
        purpose: 'Seeds & Inputs',
        termMonths: 12,
        interestRate: 24,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });

    it('should reject application for non-existent farmer', async () => {
      mockDb.query.farmers.findFirst.mockResolvedValue(null);

      await expect(service.createLoanApplication({
        farmerId: 999,
        amount: 50000,
        purpose: 'Seeds & Inputs',
        termMonths: 12,
        interestRate: 24,
      })).rejects.toThrow('Farmer not found');
    });

    it('should reject negative loan amount', async () => {
      mockDb.query.farmers.findFirst.mockResolvedValue({ id: 1 });

      await expect(service.createLoanApplication({
        farmerId: 1,
        amount: -1000,
        purpose: 'Seeds & Inputs',
        termMonths: 12,
        interestRate: 24,
      })).rejects.toThrow('Loan amount must be positive');
    });

    it('should reject loan amount exceeding maximum', async () => {
      mockDb.query.farmers.findFirst.mockResolvedValue({ id: 1 });

      await expect(service.createLoanApplication({
        farmerId: 1,
        amount: 2000000,
        purpose: 'Seeds & Inputs',
        termMonths: 12,
        interestRate: 24,
      })).rejects.toThrow('Loan amount exceeds maximum limit');
    });

    it('should reject invalid loan term', async () => {
      mockDb.query.farmers.findFirst.mockResolvedValue({ id: 1 });

      await expect(service.createLoanApplication({
        farmerId: 1,
        amount: 50000,
        purpose: 'Seeds & Inputs',
        termMonths: 100,
        interestRate: 24,
      })).rejects.toThrow('Loan term must be between 1 and 60 months');
    });
  });

  describe('approveLoan', () => {
    it('should approve pending loan application', async () => {
      mockDb.query.loanApplications.findFirst.mockResolvedValue({
        id: 1,
        status: 'pending',
      });

      const result = await service.approveLoan(1, 100);

      expect(result.success).toBe(true);
      expect(result.applicationId).toBe(1);
    });

    it('should reject approval for non-pending application', async () => {
      mockDb.query.loanApplications.findFirst.mockResolvedValue({
        id: 1,
        status: 'approved',
      });

      await expect(service.approveLoan(1, 100))
        .rejects.toThrow('Only pending applications can be approved');
    });

    it('should reject approval for non-existent application', async () => {
      mockDb.query.loanApplications.findFirst.mockResolvedValue(null);

      await expect(service.approveLoan(999, 100))
        .rejects.toThrow('Loan application not found');
    });
  });

  describe('rejectLoan', () => {
    it('should reject pending loan application with reason', async () => {
      mockDb.query.loanApplications.findFirst.mockResolvedValue({
        id: 1,
        status: 'pending',
      });

      const result = await service.rejectLoan(1, 100, 'Insufficient collateral');

      expect(result.success).toBe(true);
    });

    it('should not reject already approved application', async () => {
      mockDb.query.loanApplications.findFirst.mockResolvedValue({
        id: 1,
        status: 'approved',
      });

      await expect(service.rejectLoan(1, 100, 'Changed mind'))
        .rejects.toThrow('Only pending applications can be rejected');
    });
  });

  describe('disburseLoan', () => {
    it('should disburse approved loan', async () => {
      mockDb.query.loanApplications.findFirst.mockResolvedValue({
        id: 1,
        status: 'approved',
      });

      const result = await service.disburseLoan(1, 100);

      expect(result.success).toBe(true);
    });

    it('should not disburse pending loan', async () => {
      mockDb.query.loanApplications.findFirst.mockResolvedValue({
        id: 1,
        status: 'pending',
      });

      await expect(service.disburseLoan(1, 100))
        .rejects.toThrow('Only approved applications can be disbursed');
    });
  });

  describe('recordRepayment', () => {
    it('should record valid repayment', async () => {
      mockDb.query.loanApplications.findFirst.mockResolvedValue({
        id: 1,
        status: 'disbursed',
        amount: 50000,
      });
      mockDb.query.loanRepayments.findMany.mockResolvedValue([
        { amount: 10000 },
        { amount: 10000 },
      ]);

      const result = await service.recordRepayment(1, 5000, 'mobile_money');

      expect(result.success).toBe(true);
      expect(result.remainingBalance).toBe(25000);
    });

    it('should reject repayment exceeding balance', async () => {
      mockDb.query.loanApplications.findFirst.mockResolvedValue({
        id: 1,
        status: 'disbursed',
        amount: 50000,
      });
      mockDb.query.loanRepayments.findMany.mockResolvedValue([
        { amount: 45000 },
      ]);

      await expect(service.recordRepayment(1, 10000, 'mobile_money'))
        .rejects.toThrow('Repayment amount exceeds remaining balance');
    });

    it('should reject negative repayment', async () => {
      mockDb.query.loanApplications.findFirst.mockResolvedValue({
        id: 1,
        status: 'disbursed',
        amount: 50000,
      });

      await expect(service.recordRepayment(1, -1000, 'mobile_money'))
        .rejects.toThrow('Repayment amount must be positive');
    });
  });

  describe('calculateCreditScore', () => {
    it('should calculate high score for excellent history', () => {
      const score = service.calculateCreditScore({
        totalLoans: 5,
        completedLoans: 5,
        defaultedLoans: 0,
        averageRepaymentDays: -5, // Early
        farmSize: 15,
        yearsOfExperience: 10,
      });

      expect(score).toBeGreaterThanOrEqual(750);
    });

    it('should calculate low score for poor history', () => {
      const score = service.calculateCreditScore({
        totalLoans: 3,
        completedLoans: 1,
        defaultedLoans: 2,
        averageRepaymentDays: 45,
        farmSize: 1,
        yearsOfExperience: 1,
      });

      expect(score).toBeLessThanOrEqual(450);
    });

    it('should return base score for new farmer', () => {
      const score = service.calculateCreditScore({
        totalLoans: 0,
        completedLoans: 0,
        defaultedLoans: 0,
        averageRepaymentDays: 0,
        farmSize: 2,
        yearsOfExperience: 2,
      });

      expect(score).toBeGreaterThanOrEqual(500);
      expect(score).toBeLessThanOrEqual(700);
    });

    it('should clamp score between 300 and 850', () => {
      const lowScore = service.calculateCreditScore({
        totalLoans: 10,
        completedLoans: 0,
        defaultedLoans: 10,
        averageRepaymentDays: 90,
        farmSize: 0.5,
        yearsOfExperience: 0,
      });

      const highScore = service.calculateCreditScore({
        totalLoans: 20,
        completedLoans: 20,
        defaultedLoans: 0,
        averageRepaymentDays: -30,
        farmSize: 100,
        yearsOfExperience: 30,
      });

      expect(lowScore).toBeGreaterThanOrEqual(300);
      expect(highScore).toBeLessThanOrEqual(850);
    });
  });
});
