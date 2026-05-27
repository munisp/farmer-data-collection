import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { users, farmers } from "../../drizzle/schema.js";
import { eq, desc, and, sql } from "drizzle-orm";

export const governmentSubsidyRouter = router({
  // ======================== SUBSIDY PROGRAMS ========================

  listPrograms: publicProcedure
    .input(z.object({
      country: z.string().default("kenya"),
      status: z.enum(["active", "upcoming", "closed"]).default("active"),
    }))
    .query(async ({ input }) => {
      const programs: Array<{
        id: string;
        name: string;
        ministry: string;
        country: string;
        type: string;
        totalBudget: number;
        currency: string;
        perFarmerAmount: number;
        eligibilityCriteria: string[];
        applicationDeadline: string;
        status: string;
      }> = [
        {
          id: "KE-NAIP-2026",
          name: "National Agricultural Input Program",
          ministry: "Ministry of Agriculture, Kenya",
          country: "kenya",
          type: "input_subsidy",
          totalBudget: 5000000000,
          currency: "KES",
          perFarmerAmount: 6000,
          eligibilityCriteria: ["Registered farmer", "Land size < 5 acres", "KYC verified"],
          applicationDeadline: "2026-12-31",
          status: "active",
        },
        {
          id: "KE-FSSP-2026",
          name: "Fertilizer Subsidy Support Program",
          ministry: "Ministry of Agriculture, Kenya",
          country: "kenya",
          type: "fertilizer_subsidy",
          totalBudget: 3000000000,
          currency: "KES",
          perFarmerAmount: 3500,
          eligibilityCriteria: ["Registered farmer", "Verified farm location", "Active on platform > 3 months"],
          applicationDeadline: "2026-09-30",
          status: "active",
        },
        {
          id: "NG-ABP-2026",
          name: "Anchor Borrowers' Programme",
          ministry: "Central Bank of Nigeria",
          country: "nigeria",
          type: "credit_subsidy",
          totalBudget: 200000000000,
          currency: "NGN",
          perFarmerAmount: 500000,
          eligibilityCriteria: ["Registered farmer", "BVN verified", "Cooperative member"],
          applicationDeadline: "2026-06-30",
          status: "active",
        },
        {
          id: "UG-OWC-2026",
          name: "Operation Wealth Creation",
          ministry: "Ministry of Agriculture, Uganda",
          country: "uganda",
          type: "input_distribution",
          totalBudget: 500000000000,
          currency: "UGX",
          perFarmerAmount: 200000,
          eligibilityCriteria: ["Registered farmer", "National ID verified", "Parish-level registration"],
          applicationDeadline: "2026-12-31",
          status: "active",
        },
      ];

      return programs.filter(p =>
        p.country === input.country && p.status === input.status
      );
    }),

  applyForSubsidy: protectedProcedure
    .input(z.object({
      programId: z.string(),
      farmId: z.number(),
      landSizeAcres: z.number(),
      nationalId: z.string(),
      mobileMoneyNumber: z.string(),
      cropTypes: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [farmer] = await db.select().from(farmers)
        .where(eq(farmers.userId, ctx.user.id))
        .limit(1);

      if (!farmer) throw new Error("Farmer profile required. Please register first.");

      const kycVerified = farmer.verificationStatus === "verified";
      if (!kycVerified) throw new Error("KYC verification required before applying for subsidies.");

      const applicationId = `SUB-${input.programId}-${Date.now()}`;

      return {
        applicationId,
        programId: input.programId,
        farmerId: farmer.id,
        userId: ctx.user.id,
        nationalId: input.nationalId,
        farmId: input.farmId,
        landSizeAcres: input.landSizeAcres,
        cropTypes: input.cropTypes,
        kycVerified,
        disbursementMethod: "mobile_money",
        disbursementPhone: input.mobileMoneyNumber,
        status: "submitted",
        estimatedProcessingDays: 14,
        trackingUrl: `/subsidies/track/${applicationId}`,
      };
    }),

  trackApplication: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .query(async ({ input }) => {
      return {
        applicationId: input.applicationId,
        stages: [
          { stage: "Submitted", status: "completed", date: new Date().toISOString() },
          { stage: "KYC Verification", status: "completed", date: new Date().toISOString() },
          { stage: "Farm Verification", status: "in_progress", date: null },
          { stage: "Approval", status: "pending", date: null },
          { stage: "Disbursement", status: "pending", date: null },
        ],
        currentStage: "Farm Verification",
        estimatedCompletionDate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0],
      };
    }),

  getDisbursementHistory: protectedProcedure.query(async ({ ctx }) => {
    return [] as Array<{
      disbursementId: string;
      programName: string;
      amount: number;
      currency: string;
      method: string;
      date: string;
      status: string;
      transactionRef: string;
    }>;
  }),

  // ======================== EXTENSION WORKER TOOLS ========================

  logFarmerVisit: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      farmId: z.number(),
      visitType: z.enum(["routine", "training", "seed_distribution", "inspection", "follow_up"]),
      notes: z.string(),
      gpsLatitude: z.number(),
      gpsLongitude: z.number(),
      seedsDistributed: z.array(z.object({
        type: z.string(),
        quantityKg: z.number(),
      })).optional(),
      photosUrls: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return {
        visitId: `VISIT-${Date.now()}`,
        extensionWorkerId: ctx.user.id,
        farmerId: input.farmerId,
        farmId: input.farmId,
        visitType: input.visitType,
        location: { lat: input.gpsLatitude, lng: input.gpsLongitude },
        seedsDistributed: input.seedsDistributed ?? [],
        timestamp: new Date().toISOString(),
        status: "recorded",
      };
    }),

  getWorkerDashboard: protectedProcedure
    .input(z.object({ period: z.enum(["week", "month", "quarter"]).default("month") }))
    .query(async ({ ctx }) => {
      return {
        workerId: ctx.user.id,
        totalVisits: 0,
        farmersReached: 0,
        seedsDistributedKg: 0,
        trainingsCompleted: 0,
        pendingFollowUps: 0,
        recentVisits: [] as Array<{
          visitId: string;
          farmerName: string;
          visitType: string;
          date: string;
        }>,
      };
    }),

  getDistributionReport: protectedProcedure
    .input(z.object({
      programId: z.string(),
      region: z.string().optional(),
    }))
    .query(async () => {
      return {
        totalApplications: 0,
        approved: 0,
        disbursed: 0,
        totalDisbursedAmount: 0,
        pendingReview: 0,
        rejected: 0,
        byRegion: [] as Array<{
          region: string;
          applications: number;
          disbursed: number;
          amount: number;
        }>,
      };
    }),
});
