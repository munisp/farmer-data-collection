/**
 * Warehouse Receipt Router — DB-backed
 * Tradeable digital receipts for stored commodities, collateral management, storage fees.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";
import { requireDb } from "../utils/require-db.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { warehouseReceipts, warehouses } from "../../drizzle/traceability-schema.js";

export const warehouseReceiptRouter = router({
  listReceipts: protectedProcedure
    .input(z.object({
      depositorId: z.number().optional(),
      warehouseId: z.number().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input?.depositorId) conditions.push(eq(warehouseReceipts.depositorId, input.depositorId));
      if (input?.warehouseId) conditions.push(eq(warehouseReceipts.warehouseId, input.warehouseId));
      if (input?.status) conditions.push(eq(warehouseReceipts.status, input.status));

      const rows = await db.select().from(warehouseReceipts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(warehouseReceipts.createdAt))
        .limit(input?.limit ?? 50).offset(input?.offset ?? 0);

      return rows.map(r => ({
        ...r,
        quantity: Number(r.quantity),
        estimatedValue: r.estimatedValue,
        dailyStorageFee: r.dailyStorageFee,
        totalFeesAccrued: r.totalFeesAccrued,
      }));
    }),

  getReceipt: protectedProcedure
    .input(z.object({ receiptId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(warehouseReceipts).where(eq(warehouseReceipts.id, input.receiptId));
      if (!row) return null;
      const daysSinceDeposit = row.depositDate ? Math.floor((Date.now() - new Date(row.depositDate).getTime()) / 86400000) : 0;
      const storageFeeAccrued = daysSinceDeposit * (row.dailyStorageFee ?? 0);
      return {
        ...row,
        quantity: Number(row.quantity),
        daysSinceDeposit,
        storageFeeAccrued,
        netValue: (row.estimatedValue ?? 0) - storageFeeAccrued,
      };
    }),

  issueReceipt: protectedProcedure
    .input(z.object({
      depositorId: z.number(), warehouseId: z.number(), batchId: z.number(),
      commodityType: z.string(), quantity: z.number().min(1), unit: z.string().default("kg"),
      qualityGrade: z.string().optional(), estimatedValue: z.number(),
      depositorType: z.string().default("farmer"),
      dailyStorageFee: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const receiptNumber = `WR-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
      const [created] = await db.insert(warehouseReceipts).values({
        receiptNumber,
        batchId: input.batchId,
        warehouseId: input.warehouseId,
        depositorId: input.depositorId,
        depositorType: input.depositorType,
        commodityType: input.commodityType,
        quantity: String(input.quantity),
        unit: input.unit,
        qualityGrade: input.qualityGrade as any,
        estimatedValue: input.estimatedValue,
        depositDate: new Date(),
        expectedReleaseDate: new Date(Date.now() + 180 * 86400000),
        status: "active",
        dailyStorageFee: input.dailyStorageFee ?? Math.round(input.quantity * 0.15),
      }).returning();
      logger.info("[WarehouseReceipt] Receipt issued", { id: created.id, number: receiptNumber });
      return { success: true, receipt: created };
    }),

  pledgeAsCollateral: protectedProcedure
    .input(z.object({ receiptId: z.number(), loanId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [receipt] = await db.select().from(warehouseReceipts).where(eq(warehouseReceipts.id, input.receiptId));
      if (!receipt) return { success: false, error: "Receipt not found" };
      if (receipt.isPledged) return { success: false, error: "Receipt already pledged" };
      if (receipt.status !== "active") return { success: false, error: `Cannot pledge receipt in ${receipt.status} status` };

      await db.update(warehouseReceipts)
        .set({ isPledged: true, pledgedToLoanId: input.loanId, status: "pledged", updatedAt: new Date() })
        .where(eq(warehouseReceipts.id, input.receiptId));
      logger.info("[WarehouseReceipt] Pledged", { receiptId: input.receiptId, loanId: input.loanId });
      return { success: true, receiptId: input.receiptId, collateralValue: receipt.estimatedValue };
    }),

  releaseReceipt: protectedProcedure
    .input(z.object({ receiptId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(warehouseReceipts)
        .set({ status: "released", isPledged: false, pledgedToLoanId: null, actualReleaseDate: new Date(), updatedAt: new Date() })
        .where(eq(warehouseReceipts.id, input.receiptId));
      logger.info("[WarehouseReceipt] Released", { receiptId: input.receiptId });
      return { success: true };
    }),

  listWarehouses: publicProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const db = await requireDb();
      return await db.select().from(warehouses).orderBy(warehouses.name).limit(input?.limit ?? 50);
    }),

  getStorageFees: protectedProcedure
    .input(z.object({ receiptId: z.number() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [receipt] = await db.select().from(warehouseReceipts).where(eq(warehouseReceipts.id, input.receiptId));
      if (!receipt) return null;
      const daysSinceDeposit = receipt.depositDate ? Math.floor((Date.now() - new Date(receipt.depositDate).getTime()) / 86400000) : 0;
      const dailyRate = receipt.dailyStorageFee ?? 0;
      return {
        receiptId: input.receiptId,
        dailyRate,
        daysSinceDeposit,
        totalAccrued: daysSinceDeposit * dailyRate,
        projectedMonthly: dailyRate * 30,
        projectedQuarterly: dailyRate * 90,
      };
    }),
});
