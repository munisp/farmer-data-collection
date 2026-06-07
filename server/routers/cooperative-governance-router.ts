/**
 * Cooperative Governance Router — DB-backed
 * Proposal management, voting, member governance for farmer cooperatives.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc } from "drizzle-orm";
import { governanceProposals, governanceVotes } from "../../drizzle/platform-extensions-schema.js";

export const cooperativeGovernanceRouter = router({
  listProposals: protectedProcedure
    .input(z.object({
      cooperativeId: z.number().optional(), status: z.string().optional(),
      limit: z.number().default(50), offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [];
      if (input?.cooperativeId) conds.push(eq(governanceProposals.cooperativeId, input.cooperativeId));
      if (input?.status) conds.push(eq(governanceProposals.status, input.status));
      const rows = await db.select().from(governanceProposals)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(governanceProposals.createdAt)).limit(input?.limit ?? 50).offset(input?.offset ?? 0);
      return rows;
    }),

  getProposal: protectedProcedure
    .input(z.object({ proposalId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [proposal] = await db.select().from(governanceProposals).where(eq(governanceProposals.id, input.proposalId));
      if (!proposal) return null;
      const votes = await db.select().from(governanceVotes).where(eq(governanceVotes.proposalId, input.proposalId));
      const yesVotes = votes.filter(v => v.vote === "yes").length;
      const noVotes = votes.filter(v => v.vote === "no").length;
      const abstainVotes = votes.filter(v => v.vote === "abstain").length;
      const quorum = proposal.quorumRequired ?? 50;
      const quorumMet = votes.length >= quorum;
      const passed = quorumMet && yesVotes > noVotes;
      return { ...proposal, votes: { yes: yesVotes, no: noVotes, abstain: abstainVotes, total: votes.length }, quorumMet, passed };
    }),

  createProposal: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(), title: z.string().min(5), description: z.string().min(20),
      category: z.string(), proposerId: z.number(),
      quorumRequired: z.number().min(1), deadline: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [created] = await db.insert(governanceProposals).values({
        cooperativeId: input.cooperativeId, title: input.title, description: input.description,
        category: input.category, proposerId: input.proposerId,
        quorumRequired: input.quorumRequired, deadline: new Date(input.deadline),
      }).returning();
      logger.info("[Governance] Proposal created", { id: created.id, cooperativeId: input.cooperativeId });
      return { success: true, proposal: created };
    }),

  castVote: protectedProcedure
    .input(z.object({ proposalId: z.number(), memberId: z.number(), vote: z.enum(["yes", "no", "abstain"]), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [proposal] = await db.select().from(governanceProposals).where(eq(governanceProposals.id, input.proposalId));
      if (!proposal) return { success: false, error: "Proposal not found" };
      if (proposal.status !== "open") return { success: false, error: `Voting closed (status: ${proposal.status})` };
      if (new Date() > proposal.deadline) return { success: false, error: "Voting period has ended" };

      const existing = await db.select().from(governanceVotes).where(and(eq(governanceVotes.proposalId, input.proposalId), eq(governanceVotes.memberId, input.memberId)));
      if (existing.length > 0) return { success: false, error: "Already voted on this proposal" };

      const [v] = await db.insert(governanceVotes).values({
        proposalId: input.proposalId, memberId: input.memberId, vote: input.vote, reason: input.reason,
      }).returning();
      logger.info("[Governance] Vote cast", { proposalId: input.proposalId, memberId: input.memberId, vote: input.vote });
      return { success: true, voteId: v.id };
    }),

  closeVoting: protectedProcedure
    .input(z.object({ proposalId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const votes = await db.select().from(governanceVotes).where(eq(governanceVotes.proposalId, input.proposalId));
      const [proposal] = await db.select().from(governanceProposals).where(eq(governanceProposals.id, input.proposalId));
      if (!proposal) return { success: false, error: "Proposal not found" };
      const yesVotes = votes.filter(v => v.vote === "yes").length;
      const noVotes = votes.filter(v => v.vote === "no").length;
      const quorum = proposal.quorumRequired ?? 50;
      const quorumMet = votes.length >= quorum;
      const passed = quorumMet && yesVotes > noVotes;
      const outcome = passed ? "approved" : "rejected";
      await db.update(governanceProposals).set({
        status: outcome, outcome, votesFor: yesVotes, votesAgainst: noVotes, votesAbstain: votes.filter(v => v.vote === "abstain").length,
      }).where(eq(governanceProposals.id, input.proposalId));
      logger.info("[Governance] Voting closed", { proposalId: input.proposalId, passed, quorumMet });
      return { success: true, passed, quorumMet, yesVotes, noVotes, totalVotes: votes.length };
    }),
});
