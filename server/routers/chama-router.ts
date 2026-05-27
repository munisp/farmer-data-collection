/**
 * Chama/VSLA Group Lending Router
 * 
 * Village Savings & Loan Associations: groups of 15-30 farmers pool savings,
 * take turns borrowing with social collateral.
 * 
 * Middleware: TigerBeetle (group ledger), Kafka (contribution events),
 * PostgreSQL (member/loan state), Redis (round-robin scheduling)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import {
  chamaGroups, chamaMembers, chamaContributions, chamaLoans,
} from "../../drizzle/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { getProducer } from "../kafka.js";

export const chamaRouter = router({
  // Create a new chama group
  createGroup: protectedProcedure
    .input(z.object({
      name: z.string().min(3),
      description: z.string().optional(),
      contributionAmount: z.number().positive(),
      contributionFrequency: z.enum(["weekly", "biweekly", "monthly"]),
      currency: z.string().default("KES"),
      maxMembers: z.number().min(5).max(50).default(30),
      loanInterestRate: z.number().min(0).max(50).default(10),
      maxLoanMultiplier: z.number().min(1).max(5).default(3),
      meetingDay: z.string().optional(),
      location: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [group] = await db.insert(chamaGroups).values({
        name: input.name,
        description: input.description || null,
        chairpersonId: ctx.user.id,
        contributionAmount: input.contributionAmount,
        contributionFrequency: input.contributionFrequency,
        currency: input.currency,
        maxMembers: input.maxMembers,
        loanInterestRate: String(input.loanInterestRate),
        maxLoanMultiplier: String(input.maxLoanMultiplier),
        meetingDay: input.meetingDay || null,
        location: input.location || null,
      }).returning();

      // Auto-add creator as chairperson member
      await db.insert(chamaMembers).values({
        chamaId: group.id,
        userId: ctx.user.id,
        role: "chairperson",
        shareCount: 1,
      });

      return group;
    }),

  // List groups user belongs to
  getMyGroups: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await requireDb();
      const memberships = await db.select().from(chamaMembers)
        .where(and(eq(chamaMembers.userId, ctx.user.id), eq(chamaMembers.active, true)));
      
      if (memberships.length === 0) return [];

      const groupIds = memberships.map(m => m.chamaId);
      const groups = await db.select().from(chamaGroups)
        .where(sql`id = ANY(${groupIds})`);
      
      return groups.map(g => ({
        ...g,
        myRole: memberships.find(m => m.chamaId === g.id)?.role || "member",
      }));
    }),

  // Get group details with members
  getGroup: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [group] = await db.select().from(chamaGroups)
        .where(eq(chamaGroups.id, input.groupId));
      if (!group) return null;

      const members = await db.select().from(chamaMembers)
        .where(and(eq(chamaMembers.chamaId, input.groupId), eq(chamaMembers.active, true)));

      // Calculate group savings
      const contributions = await db.select().from(chamaContributions)
        .where(and(
          eq(chamaContributions.chamaId, input.groupId),
          eq(chamaContributions.status, "completed"),
        ));
      const totalSavings = contributions.reduce((sum, c) => sum + c.amount, 0);

      // Active loans
      const loans = await db.select().from(chamaLoans)
        .where(and(
          eq(chamaLoans.chamaId, input.groupId),
          eq(chamaLoans.status, "disbursed"),
        ));
      const totalLoaned = loans.reduce((sum, l) => sum + l.amount, 0);

      return {
        ...group,
        members,
        memberCount: members.length,
        totalSavings,
        totalLoaned,
        availableForLending: totalSavings - totalLoaned,
        activeLoans: loans.length,
      };
    }),

  // Join a group
  joinGroup: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [group] = await db.select().from(chamaGroups)
        .where(eq(chamaGroups.id, input.groupId));
      if (!group) throw new Error("Group not found");

      const existingMembers = await db.select().from(chamaMembers)
        .where(and(eq(chamaMembers.chamaId, input.groupId), eq(chamaMembers.active, true)));
      if (existingMembers.length >= (group.maxMembers || 30)) {
        throw new Error("Group is full");
      }

      const existing = existingMembers.find(m => m.userId === ctx.user.id);
      if (existing) throw new Error("Already a member");

      const [member] = await db.insert(chamaMembers).values({
        chamaId: input.groupId,
        userId: ctx.user.id,
        role: "member",
        shareCount: 1,
      }).returning();

      return member;
    }),

  // Make a contribution
  contribute: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      amount: z.number().positive(),
      period: z.string(), // e.g., "2026-W22" or "2026-05"
      paymentMethod: z.enum(["mpesa", "mtn_momo", "cash", "bank_transfer"]).default("mpesa"),
      transactionId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [member] = await db.select().from(chamaMembers)
        .where(and(
          eq(chamaMembers.chamaId, input.groupId),
          eq(chamaMembers.userId, ctx.user.id),
          eq(chamaMembers.active, true),
        ));
      if (!member) throw new Error("Not a member of this group");

      const [contribution] = await db.insert(chamaContributions).values({
        chamaId: input.groupId,
        memberId: member.id,
        amount: input.amount,
        period: input.period,
        paymentMethod: input.paymentMethod,
        transactionId: input.transactionId || null,
        status: "completed",
      }).returning();

      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "chama-events",
          messages: [{ value: JSON.stringify({
            type: "contribution_made",
            chama_id: input.groupId,
            member_id: member.id,
            amount: input.amount,
            period: input.period,
          })}],
        });
      }

      return contribution;
    }),

  // Get contribution history
  getContributions: protectedProcedure
    .input(z.object({ groupId: z.number(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select().from(chamaContributions)
        .where(eq(chamaContributions.chamaId, input.groupId))
        .orderBy(desc(chamaContributions.createdAt))
        .limit(input.limit);
    }),

  // Request a loan
  requestLoan: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      amount: z.number().positive(),
      termWeeks: z.number().min(1).max(52),
      purpose: z.string(),
      guarantorUserIds: z.array(z.number()).min(1).max(3),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [member] = await db.select().from(chamaMembers)
        .where(and(
          eq(chamaMembers.chamaId, input.groupId),
          eq(chamaMembers.userId, ctx.user.id),
          eq(chamaMembers.active, true),
        ));
      if (!member) throw new Error("Not a member of this group");

      const [group] = await db.select().from(chamaGroups)
        .where(eq(chamaGroups.id, input.groupId));
      if (!group) throw new Error("Group not found");

      // Check max loan amount (multiplier × total contributions)
      const myContributions = await db.select().from(chamaContributions)
        .where(and(
          eq(chamaContributions.memberId, member.id),
          eq(chamaContributions.status, "completed"),
        ));
      const totalContributed = myContributions.reduce((sum, c) => sum + c.amount, 0);
      const maxLoan = totalContributed * Number(group.maxLoanMultiplier || 3);
      if (input.amount > maxLoan) {
        throw new Error(`Maximum loan amount is ${maxLoan} (${group.maxLoanMultiplier}× your contributions)`);
      }

      const dueDate = new Date(Date.now() + input.termWeeks * 7 * 24 * 60 * 60 * 1000);

      const [loan] = await db.insert(chamaLoans).values({
        chamaId: input.groupId,
        borrowerId: member.id,
        guarantorIds: JSON.stringify(input.guarantorUserIds),
        amount: input.amount,
        interestRate: group.loanInterestRate || "10",
        termWeeks: input.termWeeks,
        purpose: input.purpose,
        status: "pending",
        dueDate,
      }).returning();

      return loan;
    }),

  // Approve loan (chairperson/treasurer only)
  approveLoan: protectedProcedure
    .input(z.object({ loanId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [loan] = await db.select().from(chamaLoans)
        .where(eq(chamaLoans.id, input.loanId));
      if (!loan) throw new Error("Loan not found");

      const [member] = await db.select().from(chamaMembers)
        .where(and(
          eq(chamaMembers.chamaId, loan.chamaId),
          eq(chamaMembers.userId, ctx.user.id),
        ));
      if (!member || !["chairperson", "treasurer"].includes(member.role || "")) {
        throw new Error("Only chairperson or treasurer can approve loans");
      }

      await db.update(chamaLoans)
        .set({ status: "approved", approvedAt: new Date() })
        .where(eq(chamaLoans.id, input.loanId));

      return { status: "approved" };
    }),

  // Get active loans
  getLoans: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select().from(chamaLoans)
        .where(eq(chamaLoans.chamaId, input.groupId))
        .orderBy(desc(chamaLoans.createdAt));
    }),
});
