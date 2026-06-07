import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

interface HarvestPrediction {
  farmerId: number; cropType: string; variety: string; expectedYieldKg: number;
  expectedHarvestDate: string; confidence: number; region: string; qualityGrade: string;
}

interface BuyerDemand {
  buyerId: number; buyerName: string; cropType: string; quantityNeeded: number;
  maxPricePerKg: number; neededByDate: string; qualityMin: string; region: string; recurring: boolean;
}

interface MatchResult {
  id: string; farmerId: number; buyerId: number; cropType: string; quantityKg: number;
  pricePerKg: number; matchScore: number; harvestDate: string; matchType: string;
  status: string;
}

const predictions: HarvestPrediction[] = [
  { farmerId: 1001, cropType: "maize", variety: "WEMA-1001", expectedYieldKg: 5000, expectedHarvestDate: "2026-07-15", confidence: 0.85, region: "Ogun State", qualityGrade: "A" },
  { farmerId: 1002, cropType: "rice", variety: "FARO-44", expectedYieldKg: 8000, expectedHarvestDate: "2026-08-01", confidence: 0.78, region: "Niger State", qualityGrade: "B" },
  { farmerId: 1003, cropType: "tomatoes", variety: "Roma VF", expectedYieldKg: 3000, expectedHarvestDate: "2026-06-20", confidence: 0.90, region: "Kaduna State", qualityGrade: "A" },
  { farmerId: 1004, cropType: "cassava", variety: "TME-419", expectedYieldKg: 15000, expectedHarvestDate: "2026-09-01", confidence: 0.82, region: "Oyo State", qualityGrade: "B" },
  { farmerId: 1005, cropType: "maize", variety: "SAMMAZ-15", expectedYieldKg: 4000, expectedHarvestDate: "2026-07-20", confidence: 0.80, region: "Kano State", qualityGrade: "B" },
  { farmerId: 1006, cropType: "soybean", variety: "TGX-1448", expectedYieldKg: 2500, expectedHarvestDate: "2026-08-15", confidence: 0.75, region: "Benue State", qualityGrade: "A" },
];

const demands: BuyerDemand[] = [
  { buyerId: 2001, buyerName: "Lagos Foods Ltd", cropType: "maize", quantityNeeded: 10000, maxPricePerKg: 300, neededByDate: "2026-08-01", qualityMin: "B", region: "Lagos", recurring: true },
  { buyerId: 2002, buyerName: "Kano Flour Mills", cropType: "rice", quantityNeeded: 20000, maxPricePerKg: 480, neededByDate: "2026-09-01", qualityMin: "B", region: "Kano", recurring: true },
  { buyerId: 2003, buyerName: "FreshMart Supermarkets", cropType: "tomatoes", quantityNeeded: 5000, maxPricePerKg: 450, neededByDate: "2026-07-01", qualityMin: "A", region: "Lagos", recurring: true },
  { buyerId: 2004, buyerName: "Cassava Processing Corp", cropType: "cassava", quantityNeeded: 30000, maxPricePerKg: 140, neededByDate: "2026-10-01", qualityMin: "C", region: "Oyo", recurring: true },
  { buyerId: 2005, buyerName: "Poultry Feed Corp", cropType: "soybean", quantityNeeded: 5000, maxPricePerKg: 400, neededByDate: "2026-09-15", qualityMin: "B", region: "Nationwide", recurring: true },
];

const matches: MatchResult[] = [];

function calculateMatchScore(prediction: HarvestPrediction, demand: BuyerDemand): number {
  let score = 0;
  if (prediction.cropType === demand.cropType) score += 30;
  else return 0;

  const gradeOrder = ["A", "B", "C", "D"];
  const predGrade = gradeOrder.indexOf(prediction.qualityGrade);
  const minGrade = gradeOrder.indexOf(demand.qualityMin);
  if (predGrade <= minGrade) score += 20;
  else score -= 10;

  const harvestDate = new Date(prediction.expectedHarvestDate);
  const neededBy = new Date(demand.neededByDate);
  const daysDiff = (neededBy.getTime() - harvestDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff >= 0 && daysDiff <= 30) score += 25;
  else if (daysDiff >= 0 && daysDiff <= 60) score += 15;
  else if (daysDiff < 0) score -= 20;

  if (prediction.expectedYieldKg >= demand.quantityNeeded * 0.3) score += 15;
  else score += Math.round(15 * (prediction.expectedYieldKg / demand.quantityNeeded));

  score += Math.round(prediction.confidence * 10);

  return Math.max(0, Math.min(100, score));
}

function generateForwardPrice(cropType: string, harvestDate: string): number {
  const basePrices: Record<string, number> = { maize: 280, rice: 450, cassava: 120, tomatoes: 400, soybean: 380, sorghum: 250 };
  const base = basePrices[cropType] || 200;
  const daysToHarvest = (new Date(harvestDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  const forwardPremium = Math.max(0, daysToHarvest * 0.15);
  return Math.round(base + forwardPremium);
}

export const supplyDemandMatchingRouter = router({
  runMatching: protectedProcedure
    .input(z.object({ cropType: z.string().optional(), minScore: z.number().default(50) }))
    .mutation(({ input }) => {
      const newMatches: MatchResult[] = [];
      const filteredPred = input.cropType ? predictions.filter(p => p.cropType === input.cropType) : predictions;
      const filteredDemand = input.cropType ? demands.filter(d => d.cropType === input.cropType) : demands;

      for (const pred of filteredPred) {
        for (const demand of filteredDemand) {
          const score = calculateMatchScore(pred, demand);
          if (score >= input.minScore) {
            const matchedQty = Math.min(pred.expectedYieldKg, demand.quantityNeeded);
            const price = generateForwardPrice(pred.cropType, pred.expectedHarvestDate);
            const match: MatchResult = {
              id: `MATCH-${String(matches.length + newMatches.length + 1).padStart(3, "0")}`,
              farmerId: pred.farmerId, buyerId: demand.buyerId, cropType: pred.cropType,
              quantityKg: matchedQty, pricePerKg: Math.min(price, demand.maxPricePerKg),
              matchScore: score, harvestDate: pred.expectedHarvestDate,
              matchType: score >= 80 ? "auto_match" : "suggested", status: "pending",
            };
            newMatches.push(match);
          }
        }
      }

      matches.push(...newMatches);
      logger.info("[SupplyDemand] Matching run completed", { newMatches: newMatches.length, cropType: input.cropType || "all" });
      return { matchesFound: newMatches.length, matches: newMatches.sort((a, b) => b.matchScore - a.matchScore) };
    }),

  getMatches: protectedProcedure
    .input(z.object({ farmerId: z.number().optional(), buyerId: z.number().optional(), status: z.string().optional() }).optional())
    .query(({ input }) => {
      let filtered = matches;
      if (input?.farmerId) filtered = filtered.filter(m => m.farmerId === input.farmerId);
      if (input?.buyerId) filtered = filtered.filter(m => m.buyerId === input.buyerId);
      if (input?.status) filtered = filtered.filter(m => m.status === input.status);
      return filtered.sort((a, b) => b.matchScore - a.matchScore);
    }),

  confirmMatch: protectedProcedure
    .input(z.object({ matchId: z.string(), confirmedBy: z.enum(["farmer", "buyer"]) }))
    .mutation(({ input }) => {
      const match = matches.find(m => m.id === input.matchId);
      if (!match) return { success: false, error: "Match not found" };
      match.status = input.confirmedBy === "farmer" ? "farmer_confirmed" : "buyer_confirmed";
      if (match.status === "buyer_confirmed" || match.status === "farmer_confirmed") match.status = "confirmed";
      logger.info("[SupplyDemand] Match confirmed", { matchId: input.matchId, confirmedBy: input.confirmedBy });
      return { success: true, match, nextStep: "Forward contract will be generated within 24 hours" };
    }),

  getHarvestPredictions: protectedProcedure
    .input(z.object({ region: z.string().optional(), cropType: z.string().optional(), minConfidence: z.number().optional() }).optional())
    .query(({ input }) => {
      let filtered = predictions;
      if (input?.region) filtered = filtered.filter(p => p.region === input.region);
      if (input?.cropType) filtered = filtered.filter(p => p.cropType === input.cropType);
      if (input?.minConfidence) filtered = filtered.filter(p => p.confidence >= input.minConfidence!);
      return filtered.map(p => ({ ...p, forwardPrice: generateForwardPrice(p.cropType, p.expectedHarvestDate), estimatedValue: p.expectedYieldKg * generateForwardPrice(p.cropType, p.expectedHarvestDate) }));
    }),

  getBuyerDemand: publicProcedure
    .input(z.object({ cropType: z.string().optional(), region: z.string().optional() }).optional())
    .query(({ input }) => {
      let filtered = demands;
      if (input?.cropType) filtered = filtered.filter(d => d.cropType === input.cropType);
      if (input?.region) filtered = filtered.filter(d => d.region === input.region || d.region === "Nationwide");
      return filtered;
    }),

  getMarketInsights: publicProcedure.query(() => {
    const supplyByCrop: Record<string, number> = {};
    const demandByCrop: Record<string, number> = {};
    predictions.forEach(p => { supplyByCrop[p.cropType] = (supplyByCrop[p.cropType] || 0) + p.expectedYieldKg; });
    demands.forEach(d => { demandByCrop[d.cropType] = (demandByCrop[d.cropType] || 0) + d.quantityNeeded; });

    const insights = Object.keys({ ...supplyByCrop, ...demandByCrop }).map(crop => {
      const supply = supplyByCrop[crop] || 0;
      const demand = demandByCrop[crop] || 0;
      const ratio = demand > 0 ? supply / demand : 0;
      return { crop, totalSupply: supply, totalDemand: demand, supplyDemandRatio: Math.round(ratio * 100) / 100, signal: ratio > 1.2 ? "oversupply" : ratio < 0.8 ? "undersupply" : "balanced", priceDirection: ratio > 1.2 ? "falling" : ratio < 0.8 ? "rising" : "stable" };
    });

    return { insights: insights.sort((a, b) => a.supplyDemandRatio - b.supplyDemandRatio), totalPredictedSupply: Object.values(supplyByCrop).reduce((s, v) => s + v, 0), totalDemand: Object.values(demandByCrop).reduce((s, v) => s + v, 0), matchingEfficiency: matches.length > 0 ? Math.round((matches.filter(m => m.status === "confirmed").length / matches.length) * 100) : 0 };
  }),
});
