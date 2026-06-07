import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

const AssetType = z.enum(["farm_share", "harvest_forward", "carbon_credit", "equipment_share", "warehouse_receipt_token"]);
const TokenStatus = z.enum(["minting", "active", "redeemed", "expired", "suspended"]);

interface TokenizedAsset {
  id: string; type: string; name: string; description: string; farmId: string;
  totalTokens: number; availableTokens: number; pricePerToken: number; currency: string;
  expectedReturn: number; maturityDate: string; status: string;
  underlying: { cropType?: string; farmSizeAcres?: number; expectedYieldKg?: number; carbonTonsCO2?: number };
  investors: { userId: number; tokens: number; investedAt: string }[];
}

interface DividendDistribution {
  assetId: string; date: string; totalAmount: number; perTokenAmount: number; source: string;
}

const assets: TokenizedAsset[] = [
  {
    id: "TKN-001", type: "farm_share", name: "Ogun Maize Farm - Season A 2026", description: "Fractional ownership of 5-acre maize farm in Abeokuta",
    farmId: "FARM-001", totalTokens: 1000, availableTokens: 350, pricePerToken: 5000, currency: "NGN",
    expectedReturn: 18, maturityDate: "2026-09-30", status: "active",
    underlying: { cropType: "maize", farmSizeAcres: 5, expectedYieldKg: 5000 },
    investors: [{ userId: 3001, tokens: 200, investedAt: "2026-03-01T00:00:00Z" }, { userId: 3002, tokens: 150, investedAt: "2026-03-05T00:00:00Z" }, { userId: 3003, tokens: 300, investedAt: "2026-03-10T00:00:00Z" }],
  },
  {
    id: "TKN-002", type: "harvest_forward", name: "Premium Rice Forward - Q3 2026", description: "Forward contract tokens for 10,000kg rice harvest",
    farmId: "FARM-002", totalTokens: 500, availableTokens: 120, pricePerToken: 9000, currency: "NGN",
    expectedReturn: 22, maturityDate: "2026-08-31", status: "active",
    underlying: { cropType: "rice", farmSizeAcres: 10, expectedYieldKg: 10000 },
    investors: [{ userId: 3001, tokens: 100, investedAt: "2026-04-01T00:00:00Z" }, { userId: 3004, tokens: 280, investedAt: "2026-04-05T00:00:00Z" }],
  },
  {
    id: "TKN-003", type: "carbon_credit", name: "Agroforestry Carbon Offset - 2026", description: "Verified carbon credits from 50-hectare agroforestry project",
    farmId: "FARM-005", totalTokens: 2000, availableTokens: 800, pricePerToken: 15000, currency: "NGN",
    expectedReturn: 12, maturityDate: "2027-12-31", status: "active",
    underlying: { carbonTonsCO2: 500, farmSizeAcres: 125 },
    investors: [{ userId: 3005, tokens: 500, investedAt: "2026-02-01T00:00:00Z" }, { userId: 3006, tokens: 700, investedAt: "2026-02-15T00:00:00Z" }],
  },
  {
    id: "TKN-004", type: "equipment_share", name: "Shared Tractor Pool - Oyo Cluster", description: "Fractional ownership of 3 tractors serving 15 farms",
    farmId: "CLUSTER-001", totalTokens: 300, availableTokens: 50, pricePerToken: 25000, currency: "NGN",
    expectedReturn: 15, maturityDate: "2028-03-31", status: "active",
    underlying: { farmSizeAcres: 75 },
    investors: [{ userId: 3001, tokens: 50, investedAt: "2026-01-01T00:00:00Z" }, { userId: 3007, tokens: 100, investedAt: "2026-01-15T00:00:00Z" }, { userId: 3008, tokens: 100, investedAt: "2026-02-01T00:00:00Z" }],
  },
];

const dividends: DividendDistribution[] = [
  { assetId: "TKN-001", date: "2026-05-01", totalAmount: 250000, perTokenAmount: 385, source: "Partial harvest sale (early crop)" },
  { assetId: "TKN-004", date: "2026-04-01", totalAmount: 180000, perTokenAmount: 720, source: "Monthly tractor rental income" },
  { assetId: "TKN-004", date: "2026-05-01", totalAmount: 195000, perTokenAmount: 780, source: "Monthly tractor rental income" },
];

export const tokenizedAssetsRouter = router({
  listAssets: publicProcedure
    .input(z.object({ type: AssetType.optional(), status: TokenStatus.optional(), minReturn: z.number().optional() }).optional())
    .query(({ input }) => {
      let filtered = assets;
      if (input?.type) filtered = filtered.filter(a => a.type === input.type);
      if (input?.status) filtered = filtered.filter(a => a.status === input.status);
      if (input?.minReturn) filtered = filtered.filter(a => a.expectedReturn >= input.minReturn!);
      return filtered.map(a => ({
        id: a.id, type: a.type, name: a.name, description: a.description,
        totalTokens: a.totalTokens, availableTokens: a.availableTokens, pricePerToken: a.pricePerToken,
        currency: a.currency, expectedReturn: a.expectedReturn, maturityDate: a.maturityDate,
        status: a.status, percentFunded: Math.round(((a.totalTokens - a.availableTokens) / a.totalTokens) * 100),
        investorCount: a.investors.length, totalRaised: (a.totalTokens - a.availableTokens) * a.pricePerToken,
      }));
    }),

  getAssetDetail: publicProcedure
    .input(z.object({ assetId: z.string() }))
    .query(({ input }) => {
      const asset = assets.find(a => a.id === input.assetId);
      if (!asset) return null;
      const assetDividends = dividends.filter(d => d.assetId === input.assetId);
      const totalDividendsPaid = assetDividends.reduce((s, d) => s + d.totalAmount, 0);
      return { ...asset, dividendHistory: assetDividends, totalDividendsPaid, yieldToDate: asset.totalTokens > 0 ? Math.round((totalDividendsPaid / (asset.totalTokens * asset.pricePerToken)) * 100 * 10) / 10 : 0 };
    }),

  investInAsset: protectedProcedure
    .input(z.object({ assetId: z.string(), userId: z.number(), tokenCount: z.number().min(1) }))
    .mutation(({ input }) => {
      const asset = assets.find(a => a.id === input.assetId);
      if (!asset) return { success: false, error: "Asset not found" };
      if (asset.status !== "active") return { success: false, error: "Asset not available for investment" };
      if (input.tokenCount > asset.availableTokens) return { success: false, error: `Only ${asset.availableTokens} tokens available` };

      const totalCost = input.tokenCount * asset.pricePerToken;
      asset.availableTokens -= input.tokenCount;
      const existing = asset.investors.find(i => i.userId === input.userId);
      if (existing) existing.tokens += input.tokenCount;
      else asset.investors.push({ userId: input.userId, tokens: input.tokenCount, investedAt: new Date().toISOString() });

      logger.info("[TokenizedAssets] Investment made", { assetId: input.assetId, userId: input.userId, tokens: input.tokenCount, amount: totalCost });
      return { success: true, investment: { assetId: input.assetId, tokens: input.tokenCount, totalCost, expectedReturn: Math.round(totalCost * (asset.expectedReturn / 100)), maturityDate: asset.maturityDate } };
    }),

  getPortfolio: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ input }) => {
      const holdings = assets.filter(a => a.investors.some(i => i.userId === input.userId)).map(a => {
        const investor = a.investors.find(i => i.userId === input.userId)!;
        const currentValue = investor.tokens * a.pricePerToken;
        const assetDivs = dividends.filter(d => d.assetId === a.id);
        const myDividends = assetDivs.reduce((s, d) => s + d.perTokenAmount * investor.tokens, 0);
        return { assetId: a.id, name: a.name, type: a.type, tokens: investor.tokens, currentValue, dividendsEarned: myDividends, expectedReturn: a.expectedReturn, maturityDate: a.maturityDate };
      });

      const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
      const totalDividends = holdings.reduce((s, h) => s + h.dividendsEarned, 0);
      const weightedReturn = totalValue > 0 ? holdings.reduce((s, h) => s + h.expectedReturn * (h.currentValue / totalValue), 0) : 0;

      return { holdings, totalValue, totalDividends, portfolioReturn: Math.round(weightedReturn * 10) / 10, assetCount: holdings.length, diversification: new Set(holdings.map(h => h.type)).size };
    }),

  getMarketStats: publicProcedure.query(() => {
    const totalMarketCap = assets.reduce((s, a) => s + a.totalTokens * a.pricePerToken, 0);
    const totalInvested = assets.reduce((s, a) => s + (a.totalTokens - a.availableTokens) * a.pricePerToken, 0);
    const totalInvestors = new Set(assets.flatMap(a => a.investors.map(i => i.userId))).size;
    const avgReturn = assets.reduce((s, a) => s + a.expectedReturn, 0) / assets.length;
    return { totalMarketCap, totalInvested, totalInvestors, averageReturn: Math.round(avgReturn * 10) / 10, totalAssets: assets.length, totalTokensIssued: assets.reduce((s, a) => s + a.totalTokens, 0), totalDividendsPaid: dividends.reduce((s, d) => s + d.totalAmount, 0) };
  }),

  redeemTokens: protectedProcedure
    .input(z.object({ assetId: z.string(), userId: z.number(), tokenCount: z.number().min(1) }))
    .mutation(({ input }) => {
      const asset = assets.find(a => a.id === input.assetId);
      if (!asset) return { success: false, error: "Asset not found" };
      const investor = asset.investors.find(i => i.userId === input.userId);
      if (!investor || investor.tokens < input.tokenCount) return { success: false, error: "Insufficient tokens" };

      const maturity = new Date(asset.maturityDate);
      const now = new Date();
      const earlyRedemption = now < maturity;
      const penalty = earlyRedemption ? 0.05 : 0;
      const redemptionValue = Math.round(input.tokenCount * asset.pricePerToken * (1 - penalty));

      investor.tokens -= input.tokenCount;
      asset.availableTokens += input.tokenCount;
      if (investor.tokens === 0) asset.investors = asset.investors.filter(i => i.userId !== input.userId);

      logger.info("[TokenizedAssets] Tokens redeemed", { assetId: input.assetId, userId: input.userId, tokens: input.tokenCount, value: redemptionValue });
      return { success: true, redemptionValue, penalty: penalty * 100, earlyRedemption, tokensRedeemed: input.tokenCount };
    }),
});
