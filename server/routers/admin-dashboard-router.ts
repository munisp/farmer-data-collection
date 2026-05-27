/**
 * Admin Dashboard Router
 * Enhanced admin dashboard with loan officer performance metrics and compliance reports
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';

// Types
interface LoanOfficerMetrics {
  officerId: string;
  officerName: string;
  totalApplicationsProcessed: number;
  approvalRate: number;
  averageProcessingTime: number; // hours
  totalDisbursed: number;
  portfolioAtRisk: number;
  collectionRate: number;
  activeLoans: number;
  defaultedLoans: number;
  ranking: number;
  trend: 'up' | 'down' | 'stable';
}

interface ComplianceReport {
  reportId: string;
  reportType: 'kyc' | 'aml' | 'regulatory' | 'audit';
  period: string;
  status: 'compliant' | 'non_compliant' | 'pending_review';
  findings: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    description: string;
    recommendation: string;
    dueDate: string;
    status: 'open' | 'in_progress' | 'resolved';
  }>;
  generatedAt: string;
  generatedBy: string;
}

interface PortfolioSummary {
  totalLoansOutstanding: number;
  totalPrincipalOutstanding: number;
  totalInterestAccrued: number;
  portfolioAtRisk30: number;
  portfolioAtRisk60: number;
  portfolioAtRisk90: number;
  writeOffs: number;
  recoveries: number;
  netChargeOffs: number;
  averageLoanSize: number;
  averageInterestRate: number;
  byRegion: Array<{
    region: string;
    loanCount: number;
    principalOutstanding: number;
    parRate: number;
  }>;
  bySector: Array<{
    sector: string;
    loanCount: number;
    principalOutstanding: number;
    parRate: number;
  }>;
}

interface SystemHealth {
  database: { status: 'healthy' | 'degraded' | 'down'; latency: number };
  cache: { status: 'healthy' | 'degraded' | 'down'; hitRate: number };
  queue: { status: 'healthy' | 'degraded' | 'down'; pendingJobs: number };
  storage: { status: 'healthy' | 'degraded' | 'down'; usedPercent: number };
  api: { status: 'healthy' | 'degraded' | 'down'; avgResponseTime: number };
  syncService: { status: 'healthy' | 'degraded' | 'down'; pendingSyncs: number };
}

export const adminDashboardRouter = router({
  // Get loan officer performance metrics
  getLoanOfficerMetrics: protectedProcedure
    .input(z.object({
      period: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
      sortBy: z.enum(['ranking', 'approvalRate', 'collectionRate', 'portfolioAtRisk']).default('ranking'),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }): Promise<LoanOfficerMetrics[]> => {
      // In production, this would query the database
      // For now, return mock data
      const mockOfficers: LoanOfficerMetrics[] = [
        {
          officerId: 'LO001',
          officerName: 'John Kamau',
          totalApplicationsProcessed: 145,
          approvalRate: 0.72,
          averageProcessingTime: 4.5,
          totalDisbursed: 12500000,
          portfolioAtRisk: 0.03,
          collectionRate: 0.95,
          activeLoans: 89,
          defaultedLoans: 3,
          ranking: 1,
          trend: 'up',
        },
        {
          officerId: 'LO002',
          officerName: 'Mary Wanjiku',
          totalApplicationsProcessed: 132,
          approvalRate: 0.68,
          averageProcessingTime: 5.2,
          totalDisbursed: 10800000,
          portfolioAtRisk: 0.05,
          collectionRate: 0.92,
          activeLoans: 76,
          defaultedLoans: 4,
          ranking: 2,
          trend: 'stable',
        },
        {
          officerId: 'LO003',
          officerName: 'Peter Ochieng',
          totalApplicationsProcessed: 118,
          approvalRate: 0.65,
          averageProcessingTime: 6.1,
          totalDisbursed: 9200000,
          portfolioAtRisk: 0.08,
          collectionRate: 0.88,
          activeLoans: 65,
          defaultedLoans: 6,
          ranking: 3,
          trend: 'down',
        },
      ];

      // Sort based on input
      const sorted = [...mockOfficers].sort((a, b) => {
        switch (input.sortBy) {
          case 'approvalRate':
            return b.approvalRate - a.approvalRate;
          case 'collectionRate':
            return b.collectionRate - a.collectionRate;
          case 'portfolioAtRisk':
            return a.portfolioAtRisk - b.portfolioAtRisk;
          default:
            return a.ranking - b.ranking;
        }
      });

      return sorted.slice(0, input.limit);
    }),

  // Get individual loan officer details
  getLoanOfficerDetails: protectedProcedure
    .input(z.object({
      officerId: z.string(),
      period: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
    }))
    .query(async ({ input }): Promise<{
      metrics: LoanOfficerMetrics;
      recentActivity: Array<{
        date: string;
        action: string;
        loanId: string;
        amount: number;
      }>;
      performanceHistory: Array<{
        period: string;
        approvalRate: number;
        collectionRate: number;
        portfolioAtRisk: number;
      }>;
    }> => {
      return {
        metrics: {
          officerId: input.officerId,
          officerName: 'John Kamau',
          totalApplicationsProcessed: 145,
          approvalRate: 0.72,
          averageProcessingTime: 4.5,
          totalDisbursed: 12500000,
          portfolioAtRisk: 0.03,
          collectionRate: 0.95,
          activeLoans: 89,
          defaultedLoans: 3,
          ranking: 1,
          trend: 'up',
        },
        recentActivity: [
          { date: '2024-01-15', action: 'approved', loanId: 'L001', amount: 50000 },
          { date: '2024-01-14', action: 'disbursed', loanId: 'L002', amount: 75000 },
          { date: '2024-01-14', action: 'rejected', loanId: 'L003', amount: 100000 },
        ],
        performanceHistory: [
          { period: '2024-01', approvalRate: 0.72, collectionRate: 0.95, portfolioAtRisk: 0.03 },
          { period: '2023-12', approvalRate: 0.70, collectionRate: 0.93, portfolioAtRisk: 0.04 },
          { period: '2023-11', approvalRate: 0.68, collectionRate: 0.91, portfolioAtRisk: 0.05 },
        ],
      };
    }),

  // Get compliance reports
  getComplianceReports: protectedProcedure
    .input(z.object({
      reportType: z.enum(['kyc', 'aml', 'regulatory', 'audit', 'all']).default('all'),
      status: z.enum(['compliant', 'non_compliant', 'pending_review', 'all']).default('all'),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }): Promise<ComplianceReport[]> => {
      const mockReports: ComplianceReport[] = [
        {
          reportId: 'CR001',
          reportType: 'kyc',
          period: '2024-Q1',
          status: 'compliant',
          findings: [
            {
              severity: 'low',
              category: 'Documentation',
              description: '5 farmer profiles missing secondary ID verification',
              recommendation: 'Request secondary ID documents from affected farmers',
              dueDate: '2024-02-15',
              status: 'in_progress',
            },
          ],
          generatedAt: '2024-01-15T10:00:00Z',
          generatedBy: 'System',
        },
        {
          reportId: 'CR002',
          reportType: 'aml',
          period: '2024-Q1',
          status: 'compliant',
          findings: [],
          generatedAt: '2024-01-15T10:00:00Z',
          generatedBy: 'System',
        },
        {
          reportId: 'CR003',
          reportType: 'regulatory',
          period: '2024-Q1',
          status: 'pending_review',
          findings: [
            {
              severity: 'medium',
              category: 'Interest Rate Disclosure',
              description: 'APR not clearly displayed on 12 loan agreements',
              recommendation: 'Update loan agreement template to include APR prominently',
              dueDate: '2024-02-01',
              status: 'open',
            },
          ],
          generatedAt: '2024-01-15T10:00:00Z',
          generatedBy: 'System',
        },
      ];

      let filtered = mockReports;
      
      if (input.reportType !== 'all') {
        filtered = filtered.filter(r => r.reportType === input.reportType);
      }
      
      if (input.status !== 'all') {
        filtered = filtered.filter(r => r.status === input.status);
      }

      return filtered.slice(0, input.limit);
    }),

  // Generate compliance report
  generateComplianceReport: protectedProcedure
    .input(z.object({
      reportType: z.enum(['kyc', 'aml', 'regulatory', 'audit']),
      period: z.string(),
    }))
    .mutation(async ({ input, ctx }): Promise<{ reportId: string; status: string }> => {
      // In production, this would trigger report generation
      const reportId = `CR${Date.now()}`;
      
      return {
        reportId,
        status: 'generating',
      };
    }),

  // Get portfolio summary
  getPortfolioSummary: protectedProcedure
    .input(z.object({
      asOfDate: z.string().optional(),
    }))
    .query(async ({ input }): Promise<PortfolioSummary> => {
      return {
        totalLoansOutstanding: 1250,
        totalPrincipalOutstanding: 125000000,
        totalInterestAccrued: 15000000,
        portfolioAtRisk30: 0.05,
        portfolioAtRisk60: 0.03,
        portfolioAtRisk90: 0.02,
        writeOffs: 2500000,
        recoveries: 500000,
        netChargeOffs: 2000000,
        averageLoanSize: 100000,
        averageInterestRate: 0.24,
        byRegion: [
          { region: 'Central', loanCount: 450, principalOutstanding: 45000000, parRate: 0.04 },
          { region: 'Western', loanCount: 380, principalOutstanding: 38000000, parRate: 0.06 },
          { region: 'Eastern', loanCount: 420, principalOutstanding: 42000000, parRate: 0.05 },
        ],
        bySector: [
          { sector: 'Crops', loanCount: 750, principalOutstanding: 75000000, parRate: 0.04 },
          { sector: 'Livestock', loanCount: 300, principalOutstanding: 30000000, parRate: 0.06 },
          { sector: 'Mixed', loanCount: 200, principalOutstanding: 20000000, parRate: 0.05 },
        ],
      };
    }),

  // Get system health status
  getSystemHealth: protectedProcedure
    .query(async (): Promise<SystemHealth> => {
      // In production, this would check actual system components
      return {
        database: { status: 'healthy', latency: 15 },
        cache: { status: 'healthy', hitRate: 0.92 },
        queue: { status: 'healthy', pendingJobs: 23 },
        storage: { status: 'healthy', usedPercent: 45 },
        api: { status: 'healthy', avgResponseTime: 120 },
        syncService: { status: 'healthy', pendingSyncs: 5 },
      };
    }),

  // Get audit log
  getAuditLog: protectedProcedure
    .input(z.object({
      entityType: z.enum(['loan', 'farmer', 'user', 'payment', 'all']).default('all'),
      action: z.enum(['create', 'update', 'delete', 'approve', 'reject', 'all']).default('all'),
      userId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }): Promise<{
      logs: Array<{
        id: string;
        timestamp: string;
        userId: string;
        userName: string;
        entityType: string;
        entityId: string;
        action: string;
        changes: Record<string, { old: any; new: any }>;
        ipAddress: string;
      }>;
      total: number;
    }> => {
      return {
        logs: [
          {
            id: 'AL001',
            timestamp: '2024-01-15T10:30:00Z',
            userId: 'U001',
            userName: 'John Kamau',
            entityType: 'loan',
            entityId: 'L001',
            action: 'approve',
            changes: { status: { old: 'pending', new: 'approved' } },
            ipAddress: '192.168.1.100',
          },
          {
            id: 'AL002',
            timestamp: '2024-01-15T10:25:00Z',
            userId: 'U002',
            userName: 'Mary Wanjiku',
            entityType: 'farmer',
            entityId: 'F001',
            action: 'update',
            changes: { phone: { old: '0712345678', new: '0723456789' } },
            ipAddress: '192.168.1.101',
          },
        ],
        total: 2,
      };
    }),

  // Get dashboard summary
  getDashboardSummary: protectedProcedure
    .query(async (): Promise<{
      kpis: {
        totalFarmers: number;
        activeFarmers: number;
        totalLoans: number;
        activeLoans: number;
        totalDisbursed: number;
        totalRepaid: number;
        defaultRate: number;
        averageCreditScore: number;
      };
      trends: {
        newFarmersThisMonth: number;
        newFarmersLastMonth: number;
        loansThisMonth: number;
        loansLastMonth: number;
        disbursedThisMonth: number;
        disbursedLastMonth: number;
      };
      alerts: Array<{
        type: 'warning' | 'error' | 'info';
        message: string;
        count: number;
        action: string;
      }>;
    }> => {
      return {
        kpis: {
          totalFarmers: 15000,
          activeFarmers: 12500,
          totalLoans: 8500,
          activeLoans: 3200,
          totalDisbursed: 850000000,
          totalRepaid: 720000000,
          defaultRate: 0.035,
          averageCreditScore: 625,
        },
        trends: {
          newFarmersThisMonth: 450,
          newFarmersLastMonth: 380,
          loansThisMonth: 320,
          loansLastMonth: 290,
          disbursedThisMonth: 32000000,
          disbursedLastMonth: 28000000,
        },
        alerts: [
          {
            type: 'warning',
            message: 'Loans approaching 30-day delinquency',
            count: 45,
            action: 'Review delinquent loans',
          },
          {
            type: 'info',
            message: 'Pending loan applications',
            count: 78,
            action: 'Process applications',
          },
          {
            type: 'error',
            message: 'Failed sync operations',
            count: 3,
            action: 'Investigate sync failures',
          },
        ],
      };
    }),

  // Export report
  exportReport: protectedProcedure
    .input(z.object({
      reportType: z.enum(['portfolio', 'compliance', 'performance', 'audit']),
      format: z.enum(['csv', 'xlsx', 'pdf']),
      filters: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ input }): Promise<{ downloadUrl: string; expiresAt: string }> => {
      // In production, this would generate and upload the report
      return {
        downloadUrl: `/api/reports/download/${input.reportType}_${Date.now()}.${input.format}`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
    }),
});

export default adminDashboardRouter;
