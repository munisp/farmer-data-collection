/**
 * Contract Farming Router — DB-backed
 * Manages offtaker agreements, delivery tracking, penalty/bonus settlement.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { farmingContracts, offtakers } from "../../drizzle/platform-extensions-schema.js";
import { PENALTY_TIERS } from "../config/business-rules.js";

const ContractStatus = z.enum(["draft", "proposed", "negotiating", "active", "fulfilled", "breached", "expired", "terminated"]);
const QualityGrade = z.enum(["A", "B", "C", "D", "reject"]);

function calculatePenalty(
  value: number, penaltyClause: Record<string, number>, deliveredKg: number,
  contractedKg: number, actualGrade: string, expectedGrade: string, daysLate: number,
): number {
  let penalty = 0;
  const latePct = penaltyClause.lateDeliveryPenaltyPercent ?? 2;
  const shortfallPct = penaltyClause.shortfallPenaltyPercent ?? 3;
  const qualityPct = penaltyClause.qualityDeviationPenaltyPercent ?? 5;

  if (daysLate > 0) penalty += value * (latePct / 100) * Math.min(daysLate, 30);
  if (deliveredKg < contractedKg) {
    const shortfall = (contractedKg - deliveredKg) / contractedKg;
    penalty += value * (shortfallPct / 100) * shortfall;
  }
  const grades = ["A", "B", "C", "D", "reject"];
  const diff = grades.indexOf(actualGrade) - grades.indexOf(expectedGrade);
  if (diff > 0) penalty += value * (qualityPct / 100) * diff;
  return Math.round(penalty);
}

function calculateBonus(
  value: number, bonusClause: Record<string, number>, deliveredKg: number,
  contractedKg: number, actualGrade: string, expectedGrade: string, daysEarly: number,
): number {
  let bonus = 0;
  const earlyPct = bonusClause.earlyDeliveryBonusPercent ?? 1;
  const volumePct = bonusClause.volumeExcessBonusPercent ?? 1.5;
  const qualityPct = bonusClause.premiumQualityBonusPercent ?? 3;

  if (daysEarly > 0) bonus += value * (earlyPct / 100) * Math.min(daysEarly, 14);
  if (deliveredKg > contractedKg) {
    const excess = (deliveredKg - contractedKg) / contractedKg;
    bonus += value * (volumePct / 100) * Math.min(excess, 0.2);
  }
  const grades = ["A", "B", "C", "D", "reject"];
  if (grades.indexOf(actualGrade) < grades.indexOf(expectedGrade)) bonus += value * (qualityPct / 100);
  return Math.round(bonus);
}

export const contractFarmingRouter = router({
  listContracts: protectedProcedure
    .input(z.object({
      farmerId: z.number().optional(),
      offtakerId: z.number().optional(),
      status: ContractStatus.optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input?.farmerId) conditions.push(eq(farmingContracts.farmerId, input.farmerId));
      if (input?.offtakerId) conditions.push(eq(farmingContracts.offtakerId, input.offtakerId));
      if (input?.status) conditions.push(eq(farmingContracts.status, input.status));

      const rows = await db.select().from(farmingContracts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(farmingContracts.createdAt))
        .limit(input?.limit ?? 50).offset(input?.offset ?? 0);

      return rows.map(r => ({
        ...r,
        quantityKg: Number(r.quantityKg),
        pricePerKg: Number(r.pricePerKg),
        totalValue: Number(r.totalValue) || Number(r.quantityKg) * Number(r.pricePerKg),
        deliveredKg: Number(r.deliveredKg),
      }));
    }),

  getContract: protectedProcedure
    .input(z.object({ contractId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(farmingContracts).where(eq(farmingContracts.id, input.contractId));
      if (!row) return null;
      return { ...row, quantityKg: Number(row.quantityKg), pricePerKg: Number(row.pricePerKg), totalValue: Number(row.totalValue), deliveredKg: Number(row.deliveredKg) };
    }),

  createContract: protectedProcedure
    .input(z.object({
      farmerId: z.number(), offtakerId: z.number(), cropType: z.string(), variety: z.string().optional(),
      quantityKg: z.number().min(1), pricePerKg: z.number().min(0), currency: z.string().default("NGN"),
      qualityGrade: QualityGrade, deliveryDate: z.string(), deliveryLocation: z.string(),
      penaltyClause: z.record(z.string(), z.number()).optional(),
      bonusClause: z.record(z.string(), z.number()).optional(),
      insuranceLinked: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const code = `CF-${Date.now().toString(36).toUpperCase()}`;
      const totalValue = input.quantityKg * input.pricePerKg;
      const [created] = await db.insert(farmingContracts).values({
        contractCode: code,
        farmerId: input.farmerId,
        offtakerId: input.offtakerId,
        cropType: input.cropType,
        variety: input.variety,
        quantityKg: String(input.quantityKg),
        pricePerKg: String(input.pricePerKg),
        currency: input.currency,
        qualityGrade: input.qualityGrade,
        deliveryDate: new Date(input.deliveryDate),
        deliveryLocation: input.deliveryLocation,
        status: "draft",
        penaltyClause: input.penaltyClause,
        bonusClause: input.bonusClause,
        insuranceLinked: input.insuranceLinked,
        totalValue: String(totalValue),
      }).returning();
      logger.info("[ContractFarming] Contract created", { id: created.id, code, farmerId: input.farmerId });
      return { success: true, contract: created };
    }),

  recordDelivery: protectedProcedure
    .input(z.object({
      contractId: z.number(), deliveredKg: z.number(), actualGrade: QualityGrade,
      deliveryDate: z.string(), notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [contract] = await db.select().from(farmingContracts).where(eq(farmingContracts.id, input.contractId));
      if (!contract) return { success: false, error: "Contract not found" };

      const expectedDate = new Date(contract.deliveryDate);
      const actualDate = new Date(input.deliveryDate);
      const daysDiff = Math.floor((expectedDate.getTime() - actualDate.getTime()) / 86400000);

      const qtyKg = Number(contract.quantityKg);
      const ppk = Number(contract.pricePerKg);
      const baseValue = qtyKg * ppk;
      const penaltyClause = (contract.penaltyClause as Record<string, number>) ?? {};
      const bonusClause = (contract.bonusClause as Record<string, number>) ?? {};

      const penalty = daysDiff < 0 ? calculatePenalty(baseValue, penaltyClause, input.deliveredKg, qtyKg, input.actualGrade, contract.qualityGrade, Math.abs(daysDiff)) : 0;
      const bonus = daysDiff > 0 ? calculateBonus(baseValue, bonusClause, input.deliveredKg, qtyKg, input.actualGrade, contract.qualityGrade, daysDiff) : 0;
      const finalSettlement = baseValue - penalty + bonus;

      const fulfillmentRate = Math.min(input.deliveredKg / qtyKg, 1);
      const newStatus = fulfillmentRate >= 0.95 ? "fulfilled" : fulfillmentRate >= 0.7 ? "active" : "breached";

      await db.update(farmingContracts)
        .set({ status: newStatus as any, deliveredKg: String(input.deliveredKg), updatedAt: new Date() })
        .where(eq(farmingContracts.id, input.contractId));

      logger.info("[ContractFarming] Delivery recorded", { contractId: input.contractId, fulfillmentRate, penalty, bonus });
      return { success: true, contractId: input.contractId, deliveredKg: input.deliveredKg, fulfillmentRate: Math.round(fulfillmentRate * 100), baseValue, penalty, bonus, finalSettlement, status: newStatus };
    }),

  calculateSettlement: protectedProcedure
    .input(z.object({ contractId: z.number(), deliveredKg: z.number(), actualGrade: QualityGrade, daysLateOrEarly: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [contract] = await db.select().from(farmingContracts).where(eq(farmingContracts.id, input.contractId));
      if (!contract) return null;
      const baseValue = Number(contract.quantityKg) * Number(contract.pricePerKg);
      const penaltyClause = (contract.penaltyClause as Record<string, number>) ?? {};
      const bonusClause = (contract.bonusClause as Record<string, number>) ?? {};
      const penalty = input.daysLateOrEarly < 0 ? calculatePenalty(baseValue, penaltyClause, input.deliveredKg, Number(contract.quantityKg), input.actualGrade, contract.qualityGrade, Math.abs(input.daysLateOrEarly)) : 0;
      const bonus = input.daysLateOrEarly > 0 ? calculateBonus(baseValue, bonusClause, input.deliveredKg, Number(contract.quantityKg), input.actualGrade, contract.qualityGrade, input.daysLateOrEarly) : 0;
      return { baseValue, penalty, bonus, finalSettlement: baseValue - penalty + bonus, currency: contract.currency };
    }),

  listOfftakers: publicProcedure
    .input(z.object({ crop: z.string().optional(), region: z.string().optional(), limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const rows = await db.select().from(offtakers)
        .where(eq(offtakers.isActive, true))
        .orderBy(desc(offtakers.rating))
        .limit(input?.limit ?? 50);
      let filtered = rows;
      if (input?.crop) filtered = filtered.filter(o => (o.crops as string[]).includes(input.crop!));
      if (input?.region) filtered = filtered.filter(o => {
        const regions = o.regions as string[];
        return regions.includes(input.region!) || regions.includes("Nationwide");
      });
      return filtered.map(o => ({ ...o, rating: Number(o.rating) }));
    }),

  getPerformanceMetrics: protectedProcedure
    .input(z.object({ farmerId: z.number().optional(), offtakerId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input.farmerId) conditions.push(eq(farmingContracts.farmerId, input.farmerId));
      if (input.offtakerId) conditions.push(eq(farmingContracts.offtakerId, input.offtakerId));

      const rows = await db.select().from(farmingContracts)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = rows.length;
      const fulfilled = rows.filter(c => c.status === "fulfilled").length;
      const active = rows.filter(c => c.status === "active").length;
      const breached = rows.filter(c => c.status === "breached").length;
      const totalValue = rows.reduce((sum, c) => sum + (Number(c.totalValue) || 0), 0);
      return {
        totalContracts: total, fulfilled, active, breached,
        fulfillmentRate: total > 0 ? Math.round((fulfilled / total) * 100) : 0,
        totalValue, averageValue: total > 0 ? Math.round(totalValue / total) : 0,
      };
    }),

  getContractTemplates: publicProcedure.query(() => [
    { id: "TPL-001", name: "Standard Grain Purchase", crop: "maize", minQuantityKg: 1000, defaultGrade: "B", defaultPenalty: { lateDeliveryPenaltyPercent: 2, qualityDeviationPenaltyPercent: 5, shortfallPenaltyPercent: 3, forcesMajeure: true } },
    { id: "TPL-002", name: "Premium Export Quality", crop: "vegetables", minQuantityKg: 500, defaultGrade: "A", defaultPenalty: { lateDeliveryPenaltyPercent: 3, qualityDeviationPenaltyPercent: 8, shortfallPenaltyPercent: 5, forcesMajeure: true } },
    { id: "TPL-003", name: "Bulk Root Crop Supply", crop: "cassava", minQuantityKg: 5000, defaultGrade: "B", defaultPenalty: { lateDeliveryPenaltyPercent: 1.5, qualityDeviationPenaltyPercent: 4, shortfallPenaltyPercent: 2, forcesMajeure: true } },
    { id: "TPL-004", name: "Organic Certified Supply", crop: "rice", minQuantityKg: 2000, defaultGrade: "A", defaultPenalty: { lateDeliveryPenaltyPercent: 2, qualityDeviationPenaltyPercent: 10, shortfallPenaltyPercent: 4, forcesMajeure: true } },
  ]),
});
