import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

const ProposalStatus = z.enum(["draft", "open", "voting", "passed", "rejected", "implemented"]);
const VoteChoice = z.enum(["yes", "no", "abstain"]);
const ElectionStatus = z.enum(["nominations", "campaigning", "voting", "completed"]);

interface Proposal {
  id: string; cooperativeId: string; title: string; description: string; category: string;
  proposedBy: number; status: string; votesFor: number; votesAgainst: number; abstentions: number;
  quorumRequired: number; majorityRequired: number; createdAt: string; votingEndsAt: string;
  budget?: number; implementation?: string;
}

interface Election {
  id: string; cooperativeId: string; position: string; status: string;
  candidates: { memberId: number; name: string; statement: string; votes: number }[];
  votingStartsAt: string; votingEndsAt: string; winnerId?: number;
}

const proposals: Proposal[] = [
  { id: "PROP-001", cooperativeId: "COOP-001", title: "Purchase New Tractor", description: "Acquire a John Deere 5075E for shared use", category: "equipment", proposedBy: 1001, status: "voting", votesFor: 45, votesAgainst: 12, abstentions: 3, quorumRequired: 50, majorityRequired: 66, createdAt: "2026-05-01T00:00:00Z", votingEndsAt: "2026-06-01T00:00:00Z", budget: 8500000 },
  { id: "PROP-002", cooperativeId: "COOP-001", title: "Expand Storage Facility", description: "Build additional 200-ton capacity warehouse", category: "infrastructure", proposedBy: 1002, status: "passed", votesFor: 58, votesAgainst: 5, abstentions: 2, quorumRequired: 50, majorityRequired: 66, createdAt: "2026-04-01T00:00:00Z", votingEndsAt: "2026-05-01T00:00:00Z", budget: 15000000, implementation: "Construction begins June 2026" },
  { id: "PROP-003", cooperativeId: "COOP-001", title: "Increase Monthly Dues", description: "Raise from ₦5,000 to ₦7,500 to fund insurance pool", category: "financial", proposedBy: 1003, status: "open", votesFor: 0, votesAgainst: 0, abstentions: 0, quorumRequired: 60, majorityRequired: 75, createdAt: "2026-05-20T00:00:00Z", votingEndsAt: "2026-06-20T00:00:00Z" },
];

const elections: Election[] = [
  { id: "ELEC-001", cooperativeId: "COOP-001", position: "Chairperson", status: "completed", candidates: [{ memberId: 1001, name: "Adamu Ibrahim", statement: "10 years farming, 5 years leadership", votes: 42 }, { memberId: 1004, name: "Grace Okonkwo", statement: "Financial management expertise", votes: 38 }], votingStartsAt: "2026-03-01T00:00:00Z", votingEndsAt: "2026-03-15T00:00:00Z", winnerId: 1001 },
  { id: "ELEC-002", cooperativeId: "COOP-001", position: "Treasurer", status: "voting", candidates: [{ memberId: 1005, name: "Fatima Bello", statement: "Certified accountant, cooperative member 3 years", votes: 25 }, { memberId: 1006, name: "Emeka Nwosu", statement: "Bank experience, community development focus", votes: 22 }, { memberId: 1007, name: "Amina Yusuf", statement: "Microfinance expert, digital literacy trainer", votes: 18 }], votingStartsAt: "2026-05-15T00:00:00Z", votingEndsAt: "2026-05-30T00:00:00Z" },
];

const dividendHistory = [
  { year: 2025, quarter: "Q4", totalPool: 2500000, membersEligible: 65, perMemberBase: 38461, bonusForContribution: 12000, distributedAt: "2026-01-15T00:00:00Z" },
  { year: 2026, quarter: "Q1", totalPool: 3200000, membersEligible: 72, perMemberBase: 44444, bonusForContribution: 15000, distributedAt: "2026-04-15T00:00:00Z" },
];

export const cooperativeGovernanceRouter = router({
  listProposals: protectedProcedure
    .input(z.object({ cooperativeId: z.string(), status: ProposalStatus.optional() }).optional())
    .query(({ input }) => {
      let filtered = proposals;
      if (input?.cooperativeId) filtered = filtered.filter(p => p.cooperativeId === input.cooperativeId);
      if (input?.status) filtered = filtered.filter(p => p.status === input.status);
      return filtered.map(p => ({
        ...p, totalVotes: p.votesFor + p.votesAgainst + p.abstentions,
        quorumMet: (p.votesFor + p.votesAgainst + p.abstentions) >= p.quorumRequired,
        majorityMet: p.votesFor + p.votesAgainst > 0 ? (p.votesFor / (p.votesFor + p.votesAgainst)) * 100 >= p.majorityRequired : false,
      }));
    }),

  submitProposal: protectedProcedure
    .input(z.object({ cooperativeId: z.string(), title: z.string(), description: z.string(), category: z.string(), budget: z.number().optional(), quorumRequired: z.number().default(50), majorityRequired: z.number().default(66), votingDays: z.number().default(30) }))
    .mutation(({ input, ctx }) => {
      const proposal: Proposal = {
        id: `PROP-${String(proposals.length + 1).padStart(3, "0")}`, cooperativeId: input.cooperativeId,
        title: input.title, description: input.description, category: input.category,
        proposedBy: (ctx as any).user?.id || 0, status: "draft", votesFor: 0, votesAgainst: 0, abstentions: 0,
        quorumRequired: input.quorumRequired, majorityRequired: input.majorityRequired,
        createdAt: new Date().toISOString(), votingEndsAt: new Date(Date.now() + input.votingDays * 86400000).toISOString(),
        budget: input.budget,
      };
      proposals.push(proposal);
      logger.info("[CoopGovernance] Proposal submitted", { proposalId: proposal.id, cooperativeId: input.cooperativeId });
      return { success: true, proposal };
    }),

  castVote: protectedProcedure
    .input(z.object({ proposalId: z.string(), vote: VoteChoice, memberId: z.number() }))
    .mutation(({ input }) => {
      const proposal = proposals.find(p => p.id === input.proposalId);
      if (!proposal) return { success: false, error: "Proposal not found" };
      if (proposal.status !== "voting" && proposal.status !== "open") return { success: false, error: "Voting not open" };

      if (input.vote === "yes") proposal.votesFor++;
      else if (input.vote === "no") proposal.votesAgainst++;
      else proposal.abstentions++;

      const totalVotes = proposal.votesFor + proposal.votesAgainst + proposal.abstentions;
      const quorumMet = totalVotes >= proposal.quorumRequired;
      const majorityMet = proposal.votesFor + proposal.votesAgainst > 0 ? (proposal.votesFor / (proposal.votesFor + proposal.votesAgainst)) * 100 >= proposal.majorityRequired : false;

      if (quorumMet && new Date(proposal.votingEndsAt) <= new Date()) {
        proposal.status = majorityMet ? "passed" : "rejected";
      }

      logger.info("[CoopGovernance] Vote cast", { proposalId: input.proposalId, vote: input.vote, totalVotes });
      return { success: true, currentVotes: { for: proposal.votesFor, against: proposal.votesAgainst, abstentions: proposal.abstentions }, quorumMet, majorityMet };
    }),

  listElections: protectedProcedure
    .input(z.object({ cooperativeId: z.string(), status: ElectionStatus.optional() }).optional())
    .query(({ input }) => {
      let filtered = elections;
      if (input?.cooperativeId) filtered = filtered.filter(e => e.cooperativeId === input.cooperativeId);
      if (input?.status) filtered = filtered.filter(e => e.status === input.status);
      return filtered;
    }),

  castElectionVote: protectedProcedure
    .input(z.object({ electionId: z.string(), candidateId: z.number() }))
    .mutation(({ input }) => {
      const election = elections.find(e => e.id === input.electionId);
      if (!election) return { success: false, error: "Election not found" };
      if (election.status !== "voting") return { success: false, error: "Voting not open" };
      const candidate = election.candidates.find(c => c.memberId === input.candidateId);
      if (!candidate) return { success: false, error: "Candidate not found" };
      candidate.votes++;
      logger.info("[CoopGovernance] Election vote cast", { electionId: input.electionId, candidateId: input.candidateId });
      return { success: true, candidates: election.candidates.map(c => ({ name: c.name, votes: c.votes })) };
    }),

  getDividendHistory: protectedProcedure
    .input(z.object({ cooperativeId: z.string() }))
    .query(() => dividendHistory),

  calculateDividend: protectedProcedure
    .input(z.object({ cooperativeId: z.string(), memberId: z.number(), contributionMonths: z.number(), totalContributed: z.number() }))
    .query(({ input }) => {
      const latestPool = dividendHistory[dividendHistory.length - 1];
      const baseShare = latestPool.perMemberBase;
      const contributionBonus = input.contributionMonths >= 12 ? latestPool.bonusForContribution : Math.round(latestPool.bonusForContribution * (input.contributionMonths / 12));
      const loyaltyMultiplier = input.contributionMonths >= 24 ? 1.15 : input.contributionMonths >= 12 ? 1.05 : 1.0;
      const totalDividend = Math.round((baseShare + contributionBonus) * loyaltyMultiplier);
      return { baseShare, contributionBonus, loyaltyMultiplier, totalDividend, nextDistribution: "2026-07-15T00:00:00Z" };
    }),

  getTransparencyReport: protectedProcedure
    .input(z.object({ cooperativeId: z.string() }))
    .query(() => ({
      financials: { totalAssets: 45000000, totalLiabilities: 12000000, netWorth: 33000000, monthlyIncome: 2800000, monthlyExpenses: 1900000, reserveFund: 8000000 },
      membership: { total: 72, active: 68, suspended: 2, newThisMonth: 3, churnRate: 1.4 },
      activities: { proposalsThisYear: 8, proposalsPassed: 5, electionsHeld: 2, dividendsPaid: 2, totalDisbursed: 5700000 },
      compliance: { registrationValid: true, annualReturnFiled: true, auditCompleted: true, lastAuditDate: "2026-02-15T00:00:00Z", nextAGM: "2026-09-01T00:00:00Z" },
    })),
});
