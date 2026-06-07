import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { getDb } from "../db.js";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

const ContractStatus = z.enum(["draft", "proposed", "negotiating", "active", "fulfilled", "breached", "expired", "terminated"]);
const QualityGrade = z.enum(["A", "B", "C", "D", "reject"]);

const contractSchema = z.object({
  id: z.string(),
  farmerId: z.number(),
  offtakerId: z.number(),
  cropType: z.string(),
  variety: z.string().optional(),
  quantityKg: z.number().min(1),
  pricePerKg: z.number().min(0),
  currency: z.string().default("NGN"),
  qualityGrade: QualityGrade,
  deliveryDate: z.string(),
  deliveryLocation: z.string(),
  status: ContractStatus,
  penaltyClause: z.object({
    lateDeliveryPenaltyPercent: z.number().default(2),
    qualityDeviationPenaltyPercent: z.number().default(5),
    shortfallPenaltyPercent: z.number().default(3),
    forcesMajeure: z.boolean().default(true),
  }).optional(),
  bonusClause: z.object({
    earlyDeliveryBonusPercent: z.number().default(1),
    premiumQualityBonusPercent: z.number().default(3),
    volumeExcessBonusPercent: z.number().default(1.5),
  }).optional(),
  escrowId: z.string().optional(),
  insuranceLinked: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type Contract = z.infer<typeof contractSchema>;

const contracts: Contract[] = [
  {
    id: "CF-001", farmerId: 1001, offtakerId: 2001, cropType: "maize", variety: "WEMA-1001",
    quantityKg: 5000, pricePerKg: 280, currency: "NGN", qualityGrade: "A",
    deliveryDate: "2026-08-15", deliveryLocation: "Lagos Aggregation Center",
    status: "active",
    penaltyClause: { lateDeliveryPenaltyPercent: 2, qualityDeviationPenaltyPercent: 5, shortfallPenaltyPercent: 3, forcesMajeure: true },
    bonusClause: { earlyDeliveryBonusPercent: 1, premiumQualityBonusPercent: 3, volumeExcessBonusPercent: 1.5 },
    escrowId: "ESC-CF-001", insuranceLinked: true, createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-05-01T00:00:00Z",
  },
  {
    id: "CF-002", farmerId: 1002, offtakerId: 2002, cropType: "rice", variety: "FARO-44",
    quantityKg: 10000, pricePerKg: 450, currency: "NGN", qualityGrade: "B",
    deliveryDate: "2026-09-01", deliveryLocation: "Kano Processing Mill",
    status: "active",
    penaltyClause: { lateDeliveryPenaltyPercent: 2, qualityDeviationPenaltyPercent: 5, shortfallPenaltyPercent: 3, forcesMajeure: true },
    bonusClause: { earlyDeliveryBonusPercent: 1, premiumQualityBonusPercent: 3, volumeExcessBonusPercent: 1.5 },
    escrowId: "ESC-CF-002", insuranceLinked: false, createdAt: "2026-04-01T00:00:00Z", updatedAt: "2026-05-15T00:00:00Z",
  },
  {
    id: "CF-003", farmerId: 1003, offtakerId: 2003, cropType: "cassava", variety: "TME-419",
    quantityKg: 20000, pricePerKg: 120, currency: "NGN", qualityGrade: "A",
    deliveryDate: "2026-07-30", deliveryLocation: "Ogun Starch Factory",
    status: "proposed",
    penaltyClause: { lateDeliveryPenaltyPercent: 2, qualityDeviationPenaltyPercent: 5, shortfallPenaltyPercent: 3, forcesMajeure: true },
    escrowId: undefined, insuranceLinked: true, createdAt: "2026-05-20T00:00:00Z", updatedAt: "2026-05-20T00:00:00Z",
  },
];

const offtakers = [
  { id: 2001, name: "Lagos Foods Ltd", type: "processor", crops: ["maize", "sorghum"], regions: ["Lagos", "Ogun"], rating: 4.8, contractsCompleted: 45 },
  { id: 2002, name: "Kano Agro Industries", type: "miller", crops: ["rice", "wheat"], regions: ["Kano", "Kaduna"], rating: 4.5, contractsCompleted: 32 },
  { id: 2003, name: "Cassava Processing Co", type: "processor", crops: ["cassava"], regions: ["Ogun", "Oyo"], rating: 4.6, contractsCompleted: 28 },
  { id: 2004, name: "Fresh Exports NG", type: "exporter", crops: ["vegetables", "fruits"], regions: ["Nationwide"], rating: 4.9, contractsCompleted: 67 },
  { id: 2005, name: "Poultry Feed Corp", type: "feed_manufacturer", crops: ["maize", "soybean"], regions: ["Ibadan", "Lagos"], rating: 4.3, contractsCompleted: 19 },
];

function calculateContractValue(contract: Contract): number {
  return contract.quantityKg * contract.pricePerKg;
}

function calculatePenalty(contract: Contract, deliveredKg: number, actualGrade: string, daysLate: number): number {
  if (!contract.penaltyClause) return 0;
  let penalty = 0;
  const value = calculateContractValue(contract);

  if (daysLate > 0) penalty += value * (contract.penaltyClause.lateDeliveryPenaltyPercent / 100) * Math.min(daysLate, 30);
  if (deliveredKg < contract.quantityKg) {
    const shortfall = (contract.quantityKg - deliveredKg) / contract.quantityKg;
    penalty += value * (contract.penaltyClause.shortfallPenaltyPercent / 100) * shortfall;
  }
  const gradeOrder = ["A", "B", "C", "D", "reject"];
  const expectedIdx = gradeOrder.indexOf(contract.qualityGrade);
  const actualIdx = gradeOrder.indexOf(actualGrade);
  if (actualIdx > expectedIdx) penalty += value * (contract.penaltyClause.qualityDeviationPenaltyPercent / 100) * (actualIdx - expectedIdx);

  return Math.round(penalty);
}

function calculateBonus(contract: Contract, deliveredKg: number, actualGrade: string, daysEarly: number): number {
  if (!contract.bonusClause) return 0;
  let bonus = 0;
  const value = calculateContractValue(contract);

  if (daysEarly > 0) bonus += value * (contract.bonusClause.earlyDeliveryBonusPercent / 100) * Math.min(daysEarly, 14);
  if (deliveredKg > contract.quantityKg) {
    const excess = (deliveredKg - contract.quantityKg) / contract.quantityKg;
    bonus += value * (contract.bonusClause.volumeExcessBonusPercent / 100) * Math.min(excess, 0.2);
  }
  const gradeOrder = ["A", "B", "C", "D", "reject"];
  const expectedIdx = gradeOrder.indexOf(contract.qualityGrade);
  const actualIdx = gradeOrder.indexOf(actualGrade);
  if (actualIdx < expectedIdx) bonus += value * (contract.bonusClause.premiumQualityBonusPercent / 100);

  return Math.round(bonus);
}

export const contractFarmingRouter = router({
  listContracts: protectedProcedure
    .input(z.object({ farmerId: z.number().optional(), offtakerId: z.number().optional(), status: ContractStatus.optional() }).optional())
    .query(({ input }) => {
      let filtered = contracts;
      if (input?.farmerId) filtered = filtered.filter(c => c.farmerId === input.farmerId);
      if (input?.offtakerId) filtered = filtered.filter(c => c.offtakerId === input.offtakerId);
      if (input?.status) filtered = filtered.filter(c => c.status === input.status);
      return filtered.map(c => ({ ...c, totalValue: calculateContractValue(c) }));
    }),

  getContract: protectedProcedure
    .input(z.object({ contractId: z.string() }))
    .query(({ input }) => {
      const contract = contracts.find(c => c.id === input.contractId);
      if (!contract) return null;
      return { ...contract, totalValue: calculateContractValue(contract) };
    }),

  createContract: protectedProcedure
    .input(z.object({
      farmerId: z.number(), offtakerId: z.number(), cropType: z.string(), variety: z.string().optional(),
      quantityKg: z.number().min(1), pricePerKg: z.number().min(0), currency: z.string().default("NGN"),
      qualityGrade: QualityGrade, deliveryDate: z.string(), deliveryLocation: z.string(),
      penaltyClause: z.object({ lateDeliveryPenaltyPercent: z.number(), qualityDeviationPenaltyPercent: z.number(), shortfallPenaltyPercent: z.number(), forcesMajeure: z.boolean() }).optional(),
      bonusClause: z.object({ earlyDeliveryBonusPercent: z.number(), premiumQualityBonusPercent: z.number(), volumeExcessBonusPercent: z.number() }).optional(),
      insuranceLinked: z.boolean().default(false),
    }))
    .mutation(({ input }) => {
      const newContract: Contract = {
        id: `CF-${String(contracts.length + 1).padStart(3, "0")}`,
        ...input,
        status: "draft",
        escrowId: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      contracts.push(newContract);
      logger.info("[ContractFarming] Contract created", { contractId: newContract.id, farmerId: input.farmerId, offtakerId: input.offtakerId });
      return { success: true, contract: newContract };
    }),

  recordDelivery: protectedProcedure
    .input(z.object({
      contractId: z.string(), deliveredKg: z.number(), actualGrade: QualityGrade,
      deliveryDate: z.string(), notes: z.string().optional(),
    }))
    .mutation(({ input }) => {
      const contract = contracts.find(c => c.id === input.contractId);
      if (!contract) return { success: false, error: "Contract not found" };

      const expectedDate = new Date(contract.deliveryDate);
      const actualDate = new Date(input.deliveryDate);
      const daysDiff = Math.floor((expectedDate.getTime() - actualDate.getTime()) / (1000 * 60 * 60 * 24));

      const penalty = daysDiff < 0 ? calculatePenalty(contract, input.deliveredKg, input.actualGrade, Math.abs(daysDiff)) : 0;
      const bonus = daysDiff > 0 ? calculateBonus(contract, input.deliveredKg, input.actualGrade, daysDiff) : 0;
      const baseValue = calculateContractValue(contract);
      const finalSettlement = baseValue - penalty + bonus;

      const fulfillmentRate = Math.min(input.deliveredKg / contract.quantityKg, 1);
      contract.status = fulfillmentRate >= 0.95 ? "fulfilled" : fulfillmentRate >= 0.7 ? "active" : "breached";
      contract.updatedAt = new Date().toISOString();

      logger.info("[ContractFarming] Delivery recorded", { contractId: input.contractId, fulfillmentRate, penalty, bonus });

      return {
        success: true, contractId: input.contractId, deliveredKg: input.deliveredKg,
        fulfillmentRate: Math.round(fulfillmentRate * 100), baseValue, penalty, bonus, finalSettlement,
        status: contract.status,
      };
    }),

  calculateSettlement: protectedProcedure
    .input(z.object({ contractId: z.string(), deliveredKg: z.number(), actualGrade: QualityGrade, daysLateOrEarly: z.number() }))
    .query(({ input }) => {
      const contract = contracts.find(c => c.id === input.contractId);
      if (!contract) return null;
      const baseValue = calculateContractValue(contract);
      const penalty = input.daysLateOrEarly < 0 ? calculatePenalty(contract, input.deliveredKg, input.actualGrade, Math.abs(input.daysLateOrEarly)) : 0;
      const bonus = input.daysLateOrEarly > 0 ? calculateBonus(contract, input.deliveredKg, input.actualGrade, input.daysLateOrEarly) : 0;
      return { baseValue, penalty, bonus, finalSettlement: baseValue - penalty + bonus, currency: contract.currency };
    }),

  listOfftakers: publicProcedure
    .input(z.object({ crop: z.string().optional(), region: z.string().optional() }).optional())
    .query(({ input }) => {
      let filtered = offtakers;
      if (input?.crop) filtered = filtered.filter(o => o.crops.includes(input.crop!));
      if (input?.region) filtered = filtered.filter(o => o.regions.includes(input.region!) || o.regions.includes("Nationwide"));
      return filtered;
    }),

  getPerformanceMetrics: protectedProcedure
    .input(z.object({ farmerId: z.number().optional(), offtakerId: z.number().optional() }))
    .query(({ input }) => {
      let filtered = contracts;
      if (input.farmerId) filtered = filtered.filter(c => c.farmerId === input.farmerId);
      if (input.offtakerId) filtered = filtered.filter(c => c.offtakerId === input.offtakerId);

      const total = filtered.length;
      const fulfilled = filtered.filter(c => c.status === "fulfilled").length;
      const active = filtered.filter(c => c.status === "active").length;
      const breached = filtered.filter(c => c.status === "breached").length;
      const totalValue = filtered.reduce((sum, c) => sum + calculateContractValue(c), 0);

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
