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
      currency: z.string().default("NGN"),
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

  // ============================================================================
  // Gap #9: Merry-Go-Round / Rotating Payout Logic
  // ============================================================================

  /**
   * Enable merry-go-round mode for a group.
   * Each cycle, one member receives the entire pool.
   * Order can be: sequential (join order), random, or by contribution history.
   */
  enableMerryGoRound: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      rotationOrder: z.enum(["sequential", "random", "contribution_based"]).default("sequential"),
      cycleFrequency: z.enum(["weekly", "biweekly", "monthly"]).default("monthly"),
      startDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [member] = await db.select().from(chamaMembers)
        .where(and(
          eq(chamaMembers.chamaId, input.groupId),
          eq(chamaMembers.userId, ctx.user.id),
        ));
      if (!member || !["chairperson", "treasurer"].includes(member.role || "")) {
        throw new Error("Only chairperson or treasurer can enable merry-go-round");
      }

      const members = await db.select().from(chamaMembers)
        .where(and(eq(chamaMembers.chamaId, input.groupId), eq(chamaMembers.active, true)))
        .orderBy(chamaMembers.joinedAt);

      if (members.length < 3) throw new Error("Need at least 3 active members for merry-go-round");

      // Determine rotation order
      let rotationOrder: number[];
      if (input.rotationOrder === "random") {
        const shuffled = [...members];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        rotationOrder = shuffled.map(m => m.id);
      } else if (input.rotationOrder === "contribution_based") {
        // Sort by total contributions (most first)
        const memberContributions: Array<{ memberId: number; total: number }> = [];
        for (const m of members) {
          const contributions = await db.select().from(chamaContributions)
            .where(and(
              eq(chamaContributions.memberId, m.id),
              eq(chamaContributions.status, "completed"),
            ));
          memberContributions.push({
            memberId: m.id,
            total: contributions.reduce((sum, c) => sum + c.amount, 0),
          });
        }
        memberContributions.sort((a, b) => b.total - a.total);
        rotationOrder = memberContributions.map(mc => mc.memberId);
      } else {
        rotationOrder = members.map(m => m.id);
      }

      const cycleStart = input.startDate ? new Date(input.startDate) : new Date();

      await db.update(chamaGroups)
        .set({
          merryGoRoundEnabled: true,
          rotationOrder: JSON.stringify(rotationOrder),
          currentRotationIndex: 0,
          cycleFrequency: input.cycleFrequency,
          currentCycleStart: cycleStart,
          updatedAt: new Date(),
        })
        .where(eq(chamaGroups.id, input.groupId));

      return {
        enabled: true,
        totalCycles: rotationOrder.length,
        rotationOrder: rotationOrder.map((memberId, idx) => ({
          cycle: idx + 1,
          memberId,
          memberName: members.find(m => m.id === memberId)?.userId || memberId,
        })),
        cycleFrequency: input.cycleFrequency,
        firstPayoutDate: cycleStart.toISOString(),
      };
    }),

  /**
   * Process merry-go-round payout for the current cycle.
   * Collects contributions from all members, pays out to the designated recipient.
   */
  processRotatingPayout: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [member] = await db.select().from(chamaMembers)
        .where(and(
          eq(chamaMembers.chamaId, input.groupId),
          eq(chamaMembers.userId, ctx.user.id),
        ));
      if (!member || !["chairperson", "treasurer"].includes(member.role || "")) {
        throw new Error("Only chairperson or treasurer can process payouts");
      }

      const [group] = await db.select().from(chamaGroups)
        .where(eq(chamaGroups.id, input.groupId));
      if (!group) throw new Error("Group not found");
      if (!group.merryGoRoundEnabled) throw new Error("Merry-go-round is not enabled for this group");

      const rotationOrder: number[] = typeof group.rotationOrder === "string"
        ? JSON.parse(group.rotationOrder) : (group.rotationOrder || []);
      const currentIndex = group.currentRotationIndex || 0;

      if (currentIndex >= rotationOrder.length) {
        throw new Error("All members have received their payout. Start a new cycle.");
      }

      const recipientMemberId = rotationOrder[currentIndex];
      const recipientMember = await db.select().from(chamaMembers)
        .where(eq(chamaMembers.id, recipientMemberId));
      if (!recipientMember[0]) throw new Error("Recipient member not found");

      // Get all active members
      const activeMembers = await db.select().from(chamaMembers)
        .where(and(eq(chamaMembers.chamaId, input.groupId), eq(chamaMembers.active, true)));

      const contributionAmount = group.contributionAmount || 0;
      const totalPayout = contributionAmount * activeMembers.length;

      // Check all members have contributed this cycle
      const cycleStart = group.currentCycleStart || new Date();
      const missingContributions: number[] = [];
      for (const am of activeMembers) {
        const contributions = await db.select().from(chamaContributions)
          .where(and(
            eq(chamaContributions.memberId, am.id),
            eq(chamaContributions.chamaId, input.groupId),
            eq(chamaContributions.status, "completed"),
            sql`${chamaContributions.createdAt} >= ${cycleStart}`,
          ));
        if (contributions.length === 0) missingContributions.push(am.id);
      }

      if (missingContributions.length > 0) {
        return {
          status: "pending",
          missingContributions: missingContributions.length,
          missingMemberIds: missingContributions,
          message: `${missingContributions.length} member(s) have not contributed this cycle. All must contribute before payout.`,
        };
      }

      // Record payout as a special contribution (negative = withdrawal)
      await db.insert(chamaContributions).values({
        chamaId: input.groupId,
        memberId: recipientMemberId,
        amount: totalPayout,
        type: "merry_go_round_payout",
        status: "completed",
        paymentMethod: "internal_transfer",
      });

      // Advance rotation
      const nextCycleStart = new Date();
      const freq = group.cycleFrequency || "monthly";
      if (freq === "weekly") nextCycleStart.setDate(nextCycleStart.getDate() + 7);
      else if (freq === "biweekly") nextCycleStart.setDate(nextCycleStart.getDate() + 14);
      else nextCycleStart.setMonth(nextCycleStart.getMonth() + 1);

      await db.update(chamaGroups)
        .set({
          currentRotationIndex: currentIndex + 1,
          currentCycleStart: nextCycleStart,
          updatedAt: new Date(),
        })
        .where(eq(chamaGroups.id, input.groupId));

      // Publish event
      const producer = await getProducer();
      if (producer) {
        await producer.send({
          topic: "chama-events",
          messages: [{ value: JSON.stringify({
            type: "merry_go_round_payout",
            group_id: input.groupId,
            recipient_member_id: recipientMemberId,
            recipient_user_id: recipientMember[0].userId,
            amount: totalPayout,
            cycle: currentIndex + 1,
            total_cycles: rotationOrder.length,
          })}],
        });
      }

      return {
        status: "completed",
        recipientMemberId,
        recipientUserId: recipientMember[0].userId,
        payoutAmount: totalPayout,
        contributorsCount: activeMembers.length,
        contributionPerMember: contributionAmount,
        cycle: currentIndex + 1,
        totalCycles: rotationOrder.length,
        nextPayoutDate: nextCycleStart.toISOString(),
        isLastCycle: currentIndex + 1 >= rotationOrder.length,
      };
    }),

  /**
   * Get merry-go-round schedule and status.
   */
  getMerryGoRoundStatus: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [group] = await db.select().from(chamaGroups)
        .where(eq(chamaGroups.id, input.groupId));
      if (!group) throw new Error("Group not found");

      if (!group.merryGoRoundEnabled) {
        return { enabled: false, message: "Merry-go-round is not enabled for this group" };
      }

      const rotationOrder: number[] = typeof group.rotationOrder === "string"
        ? JSON.parse(group.rotationOrder) : (group.rotationOrder || []);
      const currentIndex = group.currentRotationIndex || 0;

      const members = await db.select().from(chamaMembers)
        .where(and(eq(chamaMembers.chamaId, input.groupId), eq(chamaMembers.active, true)));

      const schedule = rotationOrder.map((memberId, idx) => {
        const m = members.find(mem => mem.id === memberId);
        return {
          cycle: idx + 1,
          memberId,
          userId: m?.userId || 0,
          status: idx < currentIndex ? "completed" : idx === currentIndex ? "current" : "upcoming",
        };
      });

      return {
        enabled: true,
        currentCycle: currentIndex + 1,
        totalCycles: rotationOrder.length,
        contributionPerMember: group.contributionAmount,
        payoutPerCycle: (group.contributionAmount || 0) * members.length,
        cycleFrequency: group.cycleFrequency,
        schedule,
        currentRecipient: schedule.find(s => s.status === "current") || null,
        completionPercentage: Math.round((currentIndex / rotationOrder.length) * 100),
      };
    }),

  /**
   * Apply penalty for missed contributions.
   */
  applyMissedContributionPenalty: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      memberId: z.number(),
      penaltyAmount: z.number().positive(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [actor] = await db.select().from(chamaMembers)
        .where(and(
          eq(chamaMembers.chamaId, input.groupId),
          eq(chamaMembers.userId, ctx.user.id),
        ));
      if (!actor || !["chairperson", "treasurer"].includes(actor.role || "")) {
        throw new Error("Only chairperson or treasurer can apply penalties");
      }

      await db.insert(chamaContributions).values({
        chamaId: input.groupId,
        memberId: input.memberId,
        amount: -input.penaltyAmount,
        type: "penalty",
        status: "completed",
        paymentMethod: "internal_deduction",
        notes: input.reason,
      });

      return {
        memberId: input.memberId,
        penaltyAmount: input.penaltyAmount,
        reason: input.reason,
        appliedBy: ctx.user.id,
      };
    }),

  /**
   * Calculate share-out for group dissolution.
   */
  calculateShareOut: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [group] = await db.select().from(chamaGroups)
        .where(eq(chamaGroups.id, input.groupId));
      if (!group) throw new Error("Group not found");

      const members = await db.select().from(chamaMembers)
        .where(and(eq(chamaMembers.chamaId, input.groupId), eq(chamaMembers.active, true)));

      // Calculate each member's net position
      const memberShares = [];
      let totalPool = 0;
      for (const m of members) {
        const contributions = await db.select().from(chamaContributions)
          .where(and(
            eq(chamaContributions.memberId, m.id),
            eq(chamaContributions.chamaId, input.groupId),
            eq(chamaContributions.status, "completed"),
          ));
        const totalContributed = contributions
          .filter(c => c.type !== "merry_go_round_payout" && c.type !== "penalty")
          .reduce((sum, c) => sum + c.amount, 0);
        const penalties = contributions
          .filter(c => c.type === "penalty")
          .reduce((sum, c) => sum + Math.abs(c.amount), 0);
        const payoutsReceived = contributions
          .filter(c => c.type === "merry_go_round_payout")
          .reduce((sum, c) => sum + c.amount, 0);

        totalPool += totalContributed - penalties;
        memberShares.push({
          memberId: m.id,
          userId: m.userId,
          role: m.role,
          totalContributed,
          penalties,
          payoutsReceived,
          netContribution: totalContributed - penalties,
          shareCount: m.shareCount || 1,
        });
      }

      // Subtract outstanding loans from pool
      const activeLoans = await db.select().from(chamaLoans)
        .where(and(
          eq(chamaLoans.chamaId, input.groupId),
          sql`${chamaLoans.status} IN ('approved', 'disbursed')`,
        ));
      const outstandingLoans = activeLoans.reduce((sum, l) => sum + l.amount, 0);
      const distributablePool = Math.max(0, totalPool - outstandingLoans);

      // Calculate proportional share-out
      const totalShares = memberShares.reduce((sum, m) => sum + m.shareCount, 0);
      const shareOuts = memberShares.map(m => ({
        ...m,
        shareOutAmount: totalShares > 0
          ? Math.round(distributablePool * m.shareCount / totalShares)
          : 0,
      }));

      return {
        groupId: input.groupId,
        totalPool,
        outstandingLoans,
        distributablePool,
        totalMembers: members.length,
        totalShares,
        memberShareOuts: shareOuts,
      };
    }),
});
