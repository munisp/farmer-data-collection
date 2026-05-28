/**
 * Cooperative Management Router
 * CRUD operations for cooperatives, members, accounts, and transactions
 */

import { router, protectedProcedure } from '../_core/trpc-base.js';
import { z } from 'zod';
import { getDb } from '../db.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import {
  cooperatives,
  cooperativeMembers,
  cooperativeAccounts,
  cooperativeTransactions,
  cooperativeLoans,
  cooperativeMeetings,
} from '../../drizzle/cooperative-schema.js';

export const cooperativeRouter = router({
  // Get all cooperatives
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      status: z.enum(['active', 'inactive', 'suspended', 'dissolved', 'pending_registration']).optional(),
      type: z.enum(['farmer_cooperative', 'savings_group', 'producer_organization', 'marketing_cooperative', 'credit_union', 'women_group', 'youth_group', 'other']).optional(),
      region: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { limit = 20, offset = 0, status, type, region } = input || {};
      
      const conditions: ReturnType<typeof eq>[] = [];
      if (status) conditions.push(eq(cooperatives.status, status));
      if (type) conditions.push(eq(cooperatives.type, type));
      if (region) conditions.push(eq(cooperatives.region, region));
      
      const results = await db
        .select()
        .from(cooperatives)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(cooperatives.createdAt))
        .limit(limit)
        .offset(offset);
      
      return results;
    }),

  // Get cooperative by ID
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [cooperative] = await db
        .select()
        .from(cooperatives)
        .where(eq(cooperatives.id, input.id));
      
      if (!cooperative) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Cooperative not found' });
      }
      
      // Get member count
      const [memberCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(cooperativeMembers)
        .where(eq(cooperativeMembers.cooperativeId, input.id));
      
      // Get accounts
      const accounts = await db
        .select()
        .from(cooperativeAccounts)
        .where(eq(cooperativeAccounts.cooperativeId, input.id));
      
      return {
        ...cooperative,
        memberCount: memberCount?.count || 0,
        accounts,
      };
    }),

  // Create cooperative
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      registrationNumber: z.string().optional(),
      type: z.enum(['farmer_cooperative', 'savings_group', 'producer_organization', 'marketing_cooperative', 'credit_union', 'women_group', 'youth_group', 'other']).default('farmer_cooperative'),
      village: z.string().optional(),
      district: z.string().optional(),
      region: z.string().optional(),
      country: z.string().default('Nigeria'),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      shareValue: z.number().optional(),
      minimumShares: z.number().optional(),
      monthlyContribution: z.number().optional(),
      description: z.string().optional(),
      objectives: z.string().optional(),
      createdBy: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [cooperative] = await db
        .insert(cooperatives)
        .values({
          ...input,
          status: 'active',
        })
        .returning();
      
      // Create default accounts
      await db.insert(cooperativeAccounts).values([
        {
          cooperativeId: cooperative.id,
          accountType: 'savings',
          accountName: 'Main Savings Account',
          totalBalance: 0,
          availableBalance: 0,
          reservedBalance: 0,
        },
        {
          cooperativeId: cooperative.id,
          accountType: 'loan_fund',
          accountName: 'Loan Fund',
          totalBalance: 0,
          availableBalance: 0,
          reservedBalance: 0,
        },
      ]);
      
      return cooperative;
    }),

  // Update cooperative
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      registrationNumber: z.string().optional(),
      type: z.enum(['farmer_cooperative', 'savings_group', 'producer_organization', 'marketing_cooperative', 'credit_union', 'women_group', 'youth_group', 'other']).optional(),
      status: z.enum(['active', 'inactive', 'suspended', 'dissolved', 'pending_registration']).optional(),
      village: z.string().optional(),
      district: z.string().optional(),
      region: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      address: z.string().optional(),
      shareValue: z.number().optional(),
      minimumShares: z.number().optional(),
      monthlyContribution: z.number().optional(),
      description: z.string().optional(),
      objectives: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { id, ...data } = input;
      
      const [updated] = await db
        .update(cooperatives)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(cooperatives.id, id))
        .returning();
      
      return updated;
    }),

  // Get members of a cooperative
  getMembers: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(),
      status: z.enum(['active', 'inactive', 'suspended', 'pending', 'exited']).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const conditions: ReturnType<typeof eq>[] = [eq(cooperativeMembers.cooperativeId, input.cooperativeId)];
      if (input.status) {
        conditions.push(eq(cooperativeMembers.status, input.status));
      }
      
      const members = await db
        .select()
        .from(cooperativeMembers)
        .where(and(...conditions))
        .orderBy(cooperativeMembers.role);
      
      return members;
    }),

  // Add member to cooperative
  addMember: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(),
      userId: z.number(),
      memberNumber: z.string().optional(),
      role: z.enum(['chairperson', 'vice_chairperson', 'secretary', 'treasurer', 'member', 'field_officer', 'advisor']).default('member'),
      sharesOwned: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [member] = await db
        .insert(cooperativeMembers)
        .values({
          ...input,
          status: 'active',
          totalContributions: 0,
          outstandingBalance: 0,
        })
        .returning();
      
      return member;
    }),

  // Update member
  updateMember: protectedProcedure
    .input(z.object({
      id: z.number(),
      role: z.enum(['chairperson', 'vice_chairperson', 'secretary', 'treasurer', 'member', 'field_officer', 'advisor']).optional(),
      status: z.enum(['active', 'inactive', 'suspended', 'pending', 'exited']).optional(),
      sharesOwned: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { id, ...data } = input;
      
      const [updated] = await db
        .update(cooperativeMembers)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(cooperativeMembers.id, id))
        .returning();
      
      return updated;
    }),

  // Record contribution/transaction
  recordTransaction: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(),
      accountId: z.number().optional(),
      memberId: z.number().optional(),
      transactionType: z.enum(['contribution', 'withdrawal', 'loan_disbursement', 'loan_repayment', 'fee', 'dividend']),
      amount: z.number(),
      description: z.string().optional(),
      paymentMethod: z.string().optional(),
      processedBy: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Get current account balance if account specified
      let balanceAfter = 0;
      if (input.accountId) {
        const [account] = await db
          .select()
          .from(cooperativeAccounts)
          .where(eq(cooperativeAccounts.id, input.accountId));
        
        if (account) {
          const isCredit = ['contribution', 'loan_repayment', 'fee'].includes(input.transactionType);
          balanceAfter = (account.totalBalance || 0) + (isCredit ? input.amount : -input.amount);
          
          // Update account balance
          await db
            .update(cooperativeAccounts)
            .set({
              totalBalance: balanceAfter,
              availableBalance: balanceAfter,
              updatedAt: new Date(),
            })
            .where(eq(cooperativeAccounts.id, input.accountId));
        }
      }
      
      // Update member contributions if member specified
      if (input.memberId && input.transactionType === 'contribution') {
        await db
          .update(cooperativeMembers)
          .set({
            totalContributions: sql`${cooperativeMembers.totalContributions} + ${input.amount}`,
            lastContributionDate: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(cooperativeMembers.id, input.memberId));
      }
      
      // Record transaction
      const [transaction] = await db
        .insert(cooperativeTransactions)
        .values({
          ...input,
          balanceAfter,
          referenceNumber: `TXN-${Date.now()}`,
        })
        .returning();
      
      return transaction;
    }),

  // Get transactions
  getTransactions: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const transactions = await db
        .select()
        .from(cooperativeTransactions)
        .where(eq(cooperativeTransactions.cooperativeId, input.cooperativeId))
        .orderBy(desc(cooperativeTransactions.transactionDate))
        .limit(input.limit)
        .offset(input.offset);
      
      return transactions;
    }),

  // Get cooperative loans
  getLoans: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const conditions: ReturnType<typeof eq>[] = [eq(cooperativeLoans.cooperativeId, input.cooperativeId)];
      if (input.status) {
        conditions.push(eq(cooperativeLoans.status, input.status));
      }
      
      const loans = await db
        .select()
        .from(cooperativeLoans)
        .where(and(...conditions))
        .orderBy(desc(cooperativeLoans.applicationDate));
      
      return loans;
    }),

  // Create cooperative loan
  createLoan: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(),
      loanType: z.string(),
      principalAmount: z.number(),
      interestRate: z.number(),
      termMonths: z.number(),
      purpose: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
            const [loan] = await db
              .insert(cooperativeLoans)
              .values({
                cooperativeId: input.cooperativeId,
                loanType: input.loanType,
                principalAmount: input.principalAmount,
                interestRate: String(input.interestRate),
                termMonths: input.termMonths,
                purpose: input.purpose,
                status: 'pending',
                disbursedAmount: 0,
                totalRepaid: 0,
                outstandingBalance: input.principalAmount,
              })
              .returning();
      
      return loan;
    }),

  // Get meetings
  getMeetings: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(),
      upcoming: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const conditions: (ReturnType<typeof eq> | ReturnType<typeof sql>)[] = [eq(cooperativeMeetings.cooperativeId, input.cooperativeId)];
      if (input.upcoming) {
        conditions.push(sql`${cooperativeMeetings.scheduledDate} >= NOW()`);
      }
      
      const meetings = await db
        .select()
        .from(cooperativeMeetings)
        .where(and(...conditions))
        .orderBy(desc(cooperativeMeetings.scheduledDate));
      
      return meetings;
    }),

  // Schedule meeting
  scheduleMeeting: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(),
      meetingType: z.string(),
      title: z.string(),
      description: z.string().optional(),
      scheduledDate: z.string(),
      startTime: z.string().optional(),
      venue: z.string().optional(),
      isVirtual: z.boolean().default(false),
      virtualMeetingUrl: z.string().optional(),
      createdBy: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const [meeting] = await db
        .insert(cooperativeMeetings)
        .values({
          ...input,
          scheduledDate: new Date(input.scheduledDate),
          status: 'scheduled',
        })
        .returning();
      
      return meeting;
    }),

  // Get dashboard stats
  getDashboardStats: protectedProcedure
    .input(z.object({ cooperativeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Get member count
      const [memberStats] = await db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`count(*) filter (where status = 'active')`,
        })
        .from(cooperativeMembers)
        .where(eq(cooperativeMembers.cooperativeId, input.cooperativeId));
      
      // Get account balances
      const accounts = await db
        .select()
        .from(cooperativeAccounts)
        .where(eq(cooperativeAccounts.cooperativeId, input.cooperativeId));
      
      const totalBalance = accounts.reduce((sum: number, acc) => sum + (acc.totalBalance || 0), 0);
      
      // Get loan stats
      const [loanStats] = await db
        .select({
          totalLoans: sql<number>`count(*)`,
          activeLoans: sql<number>`count(*) filter (where status in ('disbursed', 'repaying'))`,
          totalDisbursed: sql<number>`coalesce(sum(disbursed_amount), 0)`,
          totalRepaid: sql<number>`coalesce(sum(total_repaid), 0)`,
        })
        .from(cooperativeLoans)
        .where(eq(cooperativeLoans.cooperativeId, input.cooperativeId));
      
      return {
        members: {
          total: memberStats?.total || 0,
          active: memberStats?.active || 0,
        },
        finances: {
          totalBalance,
          accounts: accounts.length,
        },
        loans: {
          total: loanStats?.totalLoans || 0,
          active: loanStats?.activeLoans || 0,
          totalDisbursed: loanStats?.totalDisbursed || 0,
          totalRepaid: loanStats?.totalRepaid || 0,
        },
      };
    }),

  // Get PAR (Portfolio at Risk) by Cooperative for risk dashboard
  getParByCooperative: protectedProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      // Get cooperatives with their loan PAR metrics
      const coopStats = await db
        .select({
          id: cooperatives.id,
          name: cooperatives.name,
          outstanding: sql<number>`COALESCE(SUM(${cooperativeLoans.outstandingBalance}), 0)::int`,
          members: sql<number>`(SELECT COUNT(*) FROM cooperative_members WHERE cooperative_id = ${cooperatives.id})::int`,
          par30: sql<number>`COALESCE(
            100.0 * SUM(CASE WHEN ${cooperativeLoans.maturityDate} < CURRENT_DATE - INTERVAL '30 days' THEN ${cooperativeLoans.outstandingBalance} ELSE 0 END) / 
            NULLIF(SUM(${cooperativeLoans.outstandingBalance}), 0), 0
          )::numeric(5,2)`,
          par90: sql<number>`COALESCE(
            100.0 * SUM(CASE WHEN ${cooperativeLoans.maturityDate} < CURRENT_DATE - INTERVAL '90 days' THEN ${cooperativeLoans.outstandingBalance} ELSE 0 END) / 
            NULLIF(SUM(${cooperativeLoans.outstandingBalance}), 0), 0
          )::numeric(5,2)`,
        })
        .from(cooperatives)
        .leftJoin(cooperativeLoans, eq(cooperativeLoans.cooperativeId, cooperatives.id))
        .where(eq(cooperatives.status, 'active'))
        .groupBy(cooperatives.id, cooperatives.name);
      
      return coopStats.map(coop => ({
        name: coop.name,
        outstanding: coop.outstanding || 0,
        members: coop.members || 0,
        par30: Number(coop.par30) || 0,
        par90: Number(coop.par90) || 0,
      }));
    }),

  // ======================== COLLECTIVE SELLING ========================

  createCollectiveListing: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(),
      cropType: z.string(),
      totalQuantityKg: z.number().min(1),
      pricePerKg: z.number().min(1),
      currency: z.string().default("NGN"),
      qualityGrade: z.enum(["A", "B", "C"]),
      harvestDate: z.string(),
      memberContributions: z.array(z.object({
        memberId: z.number(),
        quantityKg: z.number(),
      })),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const totalContributed = input.memberContributions.reduce((s, c) => s + c.quantityKg, 0);
      if (totalContributed !== input.totalQuantityKg) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Member contributions (${totalContributed}kg) must equal total quantity (${input.totalQuantityKg}kg)`,
        });
      }

      const listingId = `COL-${input.cooperativeId}-${Date.now()}`;
      return {
        listingId,
        cooperativeId: input.cooperativeId,
        cropType: input.cropType,
        totalQuantityKg: input.totalQuantityKg,
        pricePerKg: input.pricePerKg,
        totalValue: input.totalQuantityKg * input.pricePerKg,
        currency: input.currency,
        qualityGrade: input.qualityGrade,
        memberContributions: input.memberContributions,
        memberCount: input.memberContributions.length,
        status: "listed",
        createdAt: new Date().toISOString(),
      };
    }),

  getCollectiveListings: protectedProcedure
    .input(z.object({ cooperativeId: z.number() }))
    .query(async () => {
      return [] as Array<{
        listingId: string;
        cropType: string;
        totalQuantityKg: number;
        pricePerKg: number;
        qualityGrade: string;
        memberCount: number;
        status: string;
      }>;
    }),

  distributeRevenue: protectedProcedure
    .input(z.object({
      listingId: z.string(),
      totalRevenue: z.number(),
      currency: z.string().default("NGN"),
      memberContributions: z.array(z.object({
        memberId: z.number(),
        quantityKg: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const totalKg = input.memberContributions.reduce((s, c) => s + c.quantityKg, 0);
      const distributions = input.memberContributions.map(c => ({
        memberId: c.memberId,
        quantityKg: c.quantityKg,
        sharePercent: Math.round((c.quantityKg / totalKg) * 10000) / 100,
        amount: Math.round((c.quantityKg / totalKg) * input.totalRevenue),
        currency: input.currency,
      }));

      return {
        listingId: input.listingId,
        totalRevenue: input.totalRevenue,
        platformFee: Math.round(input.totalRevenue * 0.02),
        netRevenue: Math.round(input.totalRevenue * 0.98),
        distributions,
        disbursementMethod: "mobile_money",
        status: "distributed",
      };
    }),
});
