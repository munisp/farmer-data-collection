/**
 * Supply-Demand Matching Router — DB-backed
 * Marketplace matching between farmer supply and buyer demand listings.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc } from "drizzle-orm";
import { supplyListings, demandListings, supplyDemandMatches } from "../../drizzle/platform-extensions-schema.js";

export const supplyDemandMatchingRouter = router({
  listSupplyListings: publicProcedure
    .input(z.object({
      cropType: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [eq(supplyListings.isActive, true)];
      if (input?.cropType) conds.push(eq(supplyListings.cropType, input.cropType));
      const rows = await db.select().from(supplyListings)
        .where(and(...conds))
        .orderBy(desc(supplyListings.createdAt)).limit(input?.limit ?? 50).offset(input?.offset ?? 0);
      return rows.map(r => ({ ...r, quantityKg: Number(r.quantityKg), pricePerKg: Number(r.pricePerKg) }));
    }),

  createSupplyListing: protectedProcedure
    .input(z.object({
      farmerId: z.number(), cropType: z.string(), variety: z.string().optional(),
      quantityKg: z.number().min(1), pricePerKg: z.number().min(0),
      qualityGrade: z.string().optional(), location: z.string(),
      availableFrom: z.string(), availableUntil: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [created] = await db.insert(supplyListings).values({
        farmerId: input.farmerId, cropType: input.cropType, variety: input.variety,
        quantityKg: String(input.quantityKg), pricePerKg: String(input.pricePerKg),
        qualityGrade: input.qualityGrade, location: input.location,
        availableFrom: new Date(input.availableFrom),
        availableUntil: input.availableUntil ? new Date(input.availableUntil) : undefined,
      }).returning();
      logger.info("[SupplyDemand] Supply listing created", { id: created.id, cropType: input.cropType });
      return { success: true, listing: created };
    }),

  listDemandListings: publicProcedure
    .input(z.object({
      cropType: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [eq(demandListings.isActive, true)];
      if (input?.cropType) conds.push(eq(demandListings.cropType, input.cropType));
      const rows = await db.select().from(demandListings)
        .where(and(...conds))
        .orderBy(desc(demandListings.createdAt)).limit(input?.limit ?? 50).offset(input?.offset ?? 0);
      return rows.map(r => ({ ...r, quantityKg: Number(r.quantityKg), maxPricePerKg: Number(r.maxPricePerKg) }));
    }),

  createDemandListing: protectedProcedure
    .input(z.object({
      buyerId: z.number(), cropType: z.string(), quantityKg: z.number().min(1),
      maxPricePerKg: z.number().min(0), qualityRequirements: z.record(z.string(), z.unknown()).optional(),
      deliveryLocation: z.string(), requiredBy: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [created] = await db.insert(demandListings).values({
        buyerId: input.buyerId, cropType: input.cropType, quantityKg: String(input.quantityKg),
        maxPricePerKg: String(input.maxPricePerKg), qualityRequirements: input.qualityRequirements,
        deliveryLocation: input.deliveryLocation, requiredBy: new Date(input.requiredBy),
      }).returning();
      logger.info("[SupplyDemand] Demand listing created", { id: created.id, cropType: input.cropType });
      return { success: true, listing: created };
    }),

  findMatches: protectedProcedure
    .input(z.object({ supplyListingId: z.number().optional(), demandListingId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      if (input.supplyListingId) {
        const [supply] = await db.select().from(supplyListings).where(eq(supplyListings.id, input.supplyListingId));
        if (!supply) return [];
        const demands = await db.select().from(demandListings).where(and(eq(demandListings.cropType, supply.cropType), eq(demandListings.isActive, true)));
        return demands.filter(d => Number(d.maxPricePerKg) >= Number(supply.pricePerKg))
          .map(d => ({
            demandId: d.id, buyerId: d.buyerId, quantityKg: Number(d.quantityKg),
            maxPrice: Number(d.maxPricePerKg), supplyPrice: Number(supply.pricePerKg),
            matchScore: Math.round(Math.min(Number(d.quantityKg), Number(supply.quantityKg)) / Math.max(Number(d.quantityKg), Number(supply.quantityKg)) * 100),
          }));
      }
      if (input.demandListingId) {
        const [demand] = await db.select().from(demandListings).where(eq(demandListings.id, input.demandListingId));
        if (!demand) return [];
        const supplies = await db.select().from(supplyListings).where(and(eq(supplyListings.cropType, demand.cropType), eq(supplyListings.isActive, true)));
        return supplies.filter(s => Number(s.pricePerKg) <= Number(demand.maxPricePerKg))
          .map(s => ({
            supplyId: s.id, farmerId: s.farmerId, quantityKg: Number(s.quantityKg),
            price: Number(s.pricePerKg), maxAccepted: Number(demand.maxPricePerKg),
            matchScore: Math.round(Math.min(Number(s.quantityKg), Number(demand.quantityKg)) / Math.max(Number(s.quantityKg), Number(demand.quantityKg)) * 100),
          }));
      }
      return [];
    }),

  acceptMatch: protectedProcedure
    .input(z.object({ supplyId: z.number(), demandId: z.number(), agreedPrice: z.number(), agreedQuantity: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const matchScore = 100;
      const [match] = await db.insert(supplyDemandMatches).values({
        supplyId: input.supplyId, demandId: input.demandId,
        agreedPrice: String(input.agreedPrice), agreedQuantity: String(input.agreedQuantity),
        matchScore: String(matchScore), status: "agreed",
      }).returning();
      logger.info("[SupplyDemand] Match accepted", { id: match.id, supply: input.supplyId, demand: input.demandId });
      return { success: true, match };
    }),
});
