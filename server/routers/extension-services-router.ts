/**
 * Extension Services Router — DB-backed
 * Agricultural training programs, farmer visits, curriculum delivery.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc } from "drizzle-orm";
import { extensionPrograms, extensionVisits } from "../../drizzle/platform-extensions-schema.js";

export const extensionServicesRouter = router({
  listPrograms: publicProcedure
    .input(z.object({
      category: z.string().optional(), status: z.string().optional(),
      limit: z.number().default(50), offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [];
      if (input?.category) conds.push(eq(extensionPrograms.category, input.category));
      if (input?.status) conds.push(eq(extensionPrograms.status, input.status));
      return await db.select().from(extensionPrograms)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(extensionPrograms.createdAt)).limit(input?.limit ?? 50).offset(input?.offset ?? 0);
    }),

  getProgram: publicProcedure
    .input(z.object({ programId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [program] = await db.select().from(extensionPrograms).where(eq(extensionPrograms.id, input.programId));
      if (!program) return null;
      const visits = await db.select().from(extensionVisits).where(eq(extensionVisits.programId, input.programId));
      const enrolled = program.enrollmentCount ?? 0;
      const capacity = program.maxCapacity ?? 0;
      return { ...program, totalVisits: visits.length, spotsRemaining: capacity > 0 ? capacity - enrolled : null };
    }),

  enrollFarmer: protectedProcedure
    .input(z.object({ programId: z.number(), farmerId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [program] = await db.select().from(extensionPrograms).where(eq(extensionPrograms.id, input.programId));
      if (!program) return { success: false, error: "Program not found" };
      const enrolled = program.enrollmentCount ?? 0;
      const capacity = program.maxCapacity ?? 0;
      if (capacity > 0 && enrolled >= capacity) return { success: false, error: "Program at capacity" };
      await db.update(extensionPrograms).set({ enrollmentCount: enrolled + 1 }).where(eq(extensionPrograms.id, input.programId));
      logger.info("[Extension] Farmer enrolled", { programId: input.programId, farmerId: input.farmerId });
      return { success: true, enrollmentCount: enrolled + 1, spotsRemaining: capacity > 0 ? capacity - enrolled - 1 : null };
    }),

  recordVisit: protectedProcedure
    .input(z.object({
      programId: z.number(), farmerId: z.number(), agentId: z.number(),
      visitType: z.string(), topics: z.array(z.string()).optional(),
      recommendations: z.array(z.string()).optional(),
      feedback: z.string().optional(), followUpDate: z.string().optional(),
      gpsLocation: z.object({ lat: z.number(), lng: z.number() }).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [created] = await db.insert(extensionVisits).values({
        programId: input.programId, farmerId: input.farmerId, agentId: input.agentId,
        visitType: input.visitType, topics: input.topics ?? [],
        recommendations: input.recommendations ?? [], feedback: input.feedback,
        followUpDate: input.followUpDate ? new Date(input.followUpDate) : undefined,
        gpsLocation: input.gpsLocation, visitDate: new Date(),
      }).returning();
      logger.info("[Extension] Visit recorded", { id: created.id, farmerId: input.farmerId });
      return { success: true, visit: created };
    }),

  listVisits: protectedProcedure
    .input(z.object({
      farmerId: z.number().optional(), programId: z.number().optional(),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [];
      if (input?.farmerId) conds.push(eq(extensionVisits.farmerId, input.farmerId));
      if (input?.programId) conds.push(eq(extensionVisits.programId, input.programId));
      return await db.select().from(extensionVisits)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(extensionVisits.visitDate)).limit(input?.limit ?? 50);
    }),

  getCategories: publicProcedure.query(() => [
    { id: "climate_adaptation", name: "Climate-Smart Agriculture", description: "Techniques for adapting to changing weather patterns" },
    { id: "technology", name: "Digital Farming Tools", description: "Mobile apps, GPS mapping, precision agriculture" },
    { id: "crop_protection", name: "Integrated Pest Management", description: "Biological control, safe pesticide use, monitoring" },
    { id: "soil_health", name: "Soil Health Management", description: "Composting, cover crops, soil testing" },
    { id: "market_access", name: "Market Access", description: "Price discovery, contract farming, value chains" },
    { id: "financial_literacy", name: "Financial Literacy", description: "Savings, credit, insurance, bookkeeping" },
  ]),
});
