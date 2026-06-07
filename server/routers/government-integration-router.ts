/**
 * Government Integration Router — DB-backed
 * Government agricultural programs, beneficiary tracking, subsidy disbursement.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc } from "drizzle-orm";
import { governmentPrograms, governmentBeneficiaries } from "../../drizzle/platform-extensions-schema.js";

export const governmentIntegrationRouter = router({
  listPrograms: publicProcedure
    .input(z.object({
      ministry: z.string().optional(), status: z.string().optional(),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [];
      if (input?.ministry) conds.push(eq(governmentPrograms.ministry, input.ministry));
      if (input?.status) conds.push(eq(governmentPrograms.status, input.status));
      const rows = await db.select().from(governmentPrograms)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(governmentPrograms.createdAt)).limit(input?.limit ?? 50);
      return rows.map(r => ({
        ...r,
        budgetAllocated: Number(r.budgetAllocated),
        budgetDisbursed: Number(r.budgetDisbursed),
        disbursementRate: Number(r.budgetAllocated) > 0 ? Math.round((Number(r.budgetDisbursed) / Number(r.budgetAllocated)) * 100) : 0,
      }));
    }),

  getProgram: publicProcedure
    .input(z.object({ programId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [program] = await db.select().from(governmentPrograms).where(eq(governmentPrograms.id, input.programId));
      if (!program) return null;
      const beneficiaries = await db.select().from(governmentBeneficiaries).where(eq(governmentBeneficiaries.programId, input.programId));
      const totalDisbursed = beneficiaries.reduce((s, b) => s + Number(b.disbursementAmount ?? 0), 0);
      return {
        ...program,
        budgetAllocated: Number(program.budgetAllocated),
        budgetDisbursed: Number(program.budgetDisbursed),
        enrolledBeneficiaries: beneficiaries.length,
        totalDisbursedToFarmers: totalDisbursed,
        pendingApplications: beneficiaries.filter(b => b.status === "applied").length,
        approvedApplications: beneficiaries.filter(b => b.status === "approved").length,
      };
    }),

  applyForProgram: protectedProcedure
    .input(z.object({
      programId: z.number(), farmerId: z.number(),
      verificationData: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [program] = await db.select().from(governmentPrograms).where(eq(governmentPrograms.id, input.programId));
      if (!program) return { success: false, error: "Program not found" };
      if (program.status !== "active") return { success: false, error: "Program not accepting applications" };

      const existing = await db.select().from(governmentBeneficiaries).where(and(eq(governmentBeneficiaries.programId, input.programId), eq(governmentBeneficiaries.farmerId, input.farmerId)));
      if (existing.length > 0) return { success: false, error: "Already applied to this program" };

      const [created] = await db.insert(governmentBeneficiaries).values({
        programId: input.programId, farmerId: input.farmerId,
        verificationData: input.verificationData,
      }).returning();
      logger.info("[Government] Application submitted", { id: created.id, programId: input.programId, farmerId: input.farmerId });
      return { success: true, application: created };
    }),

  approveApplication: protectedProcedure
    .input(z.object({ applicationId: z.number(), approvedAmount: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(governmentBeneficiaries).set({
        status: "approved", disbursementAmount: String(input.approvedAmount),
        approvedDate: new Date(),
      }).where(eq(governmentBeneficiaries.id, input.applicationId));
      logger.info("[Government] Application approved", { applicationId: input.applicationId, amount: input.approvedAmount });
      return { success: true };
    }),

  recordDisbursement: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [app] = await db.select().from(governmentBeneficiaries).where(eq(governmentBeneficiaries.id, input.applicationId));
      if (!app) return { success: false, error: "Application not found" };
      if (app.status !== "approved") return { success: false, error: "Application not approved" };
      await db.update(governmentBeneficiaries).set({
        status: "disbursed", disbursementDate: new Date(),
      }).where(eq(governmentBeneficiaries.id, input.applicationId));
      logger.info("[Government] Disbursement recorded", { applicationId: input.applicationId, amount: app.disbursementAmount });
      return { success: true, amount: Number(app.disbursementAmount ?? 0) };
    }),

  getBeneficiaryStatus: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const rows = await db.select().from(governmentBeneficiaries).where(eq(governmentBeneficiaries.farmerId, input.farmerId));
      const totalReceived = rows.reduce((s, r) => s + Number(r.disbursementAmount ?? 0), 0);
      return {
        farmerId: input.farmerId,
        programs: rows.length,
        totalReceived,
        applications: rows.map(r => ({ ...r, disbursementAmount: Number(r.disbursementAmount ?? 0) })),
      };
    }),
});
