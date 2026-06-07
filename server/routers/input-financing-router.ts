/**
 * Input Financing Router — DB-backed
 * Agricultural input financing (seeds, fertilizer, equipment) linked to contracts.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc } from "drizzle-orm";
import { inputFinancingApplications } from "../../drizzle/platform-extensions-schema.js";

export const inputFinancingRouter = router({
  listApplications: protectedProcedure
    .input(z.object({
      farmerId: z.number().optional(), status: z.string().optional(),
      limit: z.number().default(50), offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [];
      if (input?.farmerId) conds.push(eq(inputFinancingApplications.farmerId, input.farmerId));
      if (input?.status) conds.push(eq(inputFinancingApplications.status, input.status));
      const rows = await db.select().from(inputFinancingApplications)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(inputFinancingApplications.createdAt)).limit(input?.limit ?? 50).offset(input?.offset ?? 0);
      return rows.map(r => ({ ...r, requestedAmount: Number(r.requestedAmount), approvedAmount: Number(r.approvedAmount ?? 0) }));
    }),

  getApplication: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(inputFinancingApplications).where(eq(inputFinancingApplications.id, input.applicationId));
      if (!row) return null;
      return { ...row, requestedAmount: Number(row.requestedAmount), approvedAmount: Number(row.approvedAmount ?? 0) };
    }),

  applyForFinancing: protectedProcedure
    .input(z.object({
      farmerId: z.number(), inputType: z.string(), inputDescription: z.string(),
      requestedAmount: z.number().min(1000), supplierId: z.number().optional(),
      harvestLinked: z.boolean().optional(), seasonId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const code = `IF-${Date.now().toString(36).toUpperCase()}`;
      const [created] = await db.insert(inputFinancingApplications).values({
        applicationCode: code, farmerId: input.farmerId, inputType: input.inputType,
        inputDescription: input.inputDescription, requestedAmount: String(input.requestedAmount),
        supplierId: input.supplierId, harvestLinked: input.harvestLinked, seasonId: input.seasonId,
      }).returning();
      logger.info("[InputFinancing] Application created", { id: created.id, code, farmerId: input.farmerId });
      return { success: true, application: created };
    }),

  approveApplication: protectedProcedure
    .input(z.object({ applicationId: z.number(), approvedAmount: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(inputFinancingApplications).set({
        status: "approved", approvedAmount: String(input.approvedAmount), updatedAt: new Date(),
      }).where(eq(inputFinancingApplications.id, input.applicationId));
      logger.info("[InputFinancing] Application approved", { applicationId: input.applicationId });
      return { success: true };
    }),

  disburseFinancing: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [app] = await db.select().from(inputFinancingApplications).where(eq(inputFinancingApplications.id, input.applicationId));
      if (!app) return { success: false, error: "Application not found" };
      if (app.status !== "approved") return { success: false, error: "Application not approved" };
      await db.update(inputFinancingApplications).set({ status: "disbursed", updatedAt: new Date() }).where(eq(inputFinancingApplications.id, input.applicationId));
      logger.info("[InputFinancing] Disbursed", { applicationId: input.applicationId, amount: app.approvedAmount });
      return { success: true, amount: Number(app.approvedAmount ?? 0) };
    }),

  getInputTypes: publicProcedure.query(() => [
    { type: "seeds", name: "Seeds & Seedlings", maxAmount: 500000 },
    { type: "fertilizer", name: "Fertilizer & Nutrients", maxAmount: 1000000 },
    { type: "pesticides", name: "Crop Protection", maxAmount: 300000 },
    { type: "equipment", name: "Farm Equipment", maxAmount: 5000000 },
    { type: "irrigation", name: "Irrigation Systems", maxAmount: 3000000 },
    { type: "storage", name: "Storage Facilities", maxAmount: 2000000 },
  ]),
});
