/**
 * Tokenized Assets Router — DB-backed
 * Fractional farm investment, carbon credits, harvest futures.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc } from "drizzle-orm";
import { tokenizedAssets, tokenHoldings } from "../../drizzle/platform-extensions-schema.js";

export const tokenizedAssetsRouter = router({
  listAssets: publicProcedure
    .input(z.object({
      assetType: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conds = [];
      if (input?.assetType) conds.push(eq(tokenizedAssets.assetType, input.assetType));
      const rows = await db.select().from(tokenizedAssets)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(desc(tokenizedAssets.createdAt)).limit(input?.limit ?? 50).offset(input?.offset ?? 0);
      return rows.map(r => ({ ...r, pricePerToken: Number(r.pricePerToken), yieldRate: Number(r.yieldRate) }));
    }),

  getAsset: publicProcedure
    .input(z.object({ assetId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(tokenizedAssets).where(eq(tokenizedAssets.id, input.assetId));
      if (!row) return null;
      const marketCap = row.totalSupply * Number(row.pricePerToken);
      return { ...row, pricePerToken: Number(row.pricePerToken), yieldRate: Number(row.yieldRate), marketCap, percentSold: Math.round(((row.totalSupply - row.availableSupply) / row.totalSupply) * 100) };
    }),

  purchaseTokens: protectedProcedure
    .input(z.object({ assetId: z.number(), userId: z.number(), quantity: z.number().min(1) }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [asset] = await db.select().from(tokenizedAssets).where(eq(tokenizedAssets.id, input.assetId));
      if (!asset) return { success: false, error: "Asset not found" };
      if (asset.availableSupply < input.quantity) return { success: false, error: `Only ${asset.availableSupply} tokens available` };

      const price = Number(asset.pricePerToken);
      const totalCost = price * input.quantity;

      const existing = await db.select().from(tokenHoldings).where(and(eq(tokenHoldings.tokenId, input.assetId), eq(tokenHoldings.userId, input.userId)));
      if (existing.length > 0) {
        await db.update(tokenHoldings).set({ quantity: existing[0].quantity + input.quantity }).where(eq(tokenHoldings.id, existing[0].id));
      } else {
        await db.insert(tokenHoldings).values({ tokenId: input.assetId, userId: input.userId, quantity: input.quantity, purchasePrice: String(price) });
      }

      await db.update(tokenizedAssets).set({ availableSupply: asset.availableSupply - input.quantity, updatedAt: new Date() }).where(eq(tokenizedAssets.id, input.assetId));
      logger.info("[TokenizedAssets] Purchase", { assetId: input.assetId, userId: input.userId, quantity: input.quantity, totalCost });
      return { success: true, tokensPurchased: input.quantity, totalCost, newBalance: (existing[0]?.quantity ?? 0) + input.quantity };
    }),

  getHoldings: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const holdings = await db.select().from(tokenHoldings).where(eq(tokenHoldings.userId, input.userId));
      let totalValue = 0;
      const enriched = [];
      for (const h of holdings) {
        const [asset] = await db.select().from(tokenizedAssets).where(eq(tokenizedAssets.id, h.tokenId));
        const currentValue = asset ? h.quantity * Number(asset.pricePerToken) : 0;
        const invested = h.quantity * Number(h.purchasePrice);
        totalValue += currentValue;
        enriched.push({ ...h, assetName: asset?.assetName, assetType: asset?.assetType, currentValue, invested, unrealizedGain: currentValue - invested });
      }
      return { holdings: enriched, totalValue, totalInvested: enriched.reduce((s, h) => s + h.invested, 0) };
    }),

  getAssetTypes: publicProcedure.query(() => [
    { type: "farmland", name: "Farmland Investment", description: "Fractional ownership of productive farmland" },
    { type: "harvest_future", name: "Harvest Futures", description: "Pre-purchase future harvest at fixed price" },
    { type: "carbon_credit", name: "Carbon Credits", description: "Verified carbon offset from agroforestry" },
    { type: "equipment", name: "Equipment Shares", description: "Shared ownership of farm equipment" },
    { type: "water_rights", name: "Water Rights", description: "Tradeable irrigation water allocation" },
  ]),
});
