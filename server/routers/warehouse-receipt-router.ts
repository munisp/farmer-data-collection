import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

const ReceiptStatus = z.enum(["issued", "pledged", "released", "expired", "cancelled"]);
const StorageType = z.enum(["dry_bulk", "cold_storage", "controlled_atmosphere", "fumigated", "organic_certified"]);

interface WarehouseReceipt {
  id: string;
  farmerId: number;
  warehouseId: string;
  commodity: string;
  variety: string;
  quantityKg: number;
  qualityGrade: string;
  moistureContent: number;
  storageType: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  storageFeeDailyNGN: number;
  currentValue: number;
  collateralValue: number;
  loanId: string | null;
  insurancePolicyId: string | null;
  transferHistory: { date: string; from: string; to: string; type: string }[];
}

const warehouses = [
  { id: "WH-001", name: "Lagos Central Silo", location: "Apapa, Lagos", capacity: 50000, currentStock: 32000, storageTypes: ["dry_bulk", "fumigated"], certifications: ["CMA", "ISO22000"], feeDailyPerTon: 150 },
  { id: "WH-002", name: "Kano Grain Reserve", location: "Bompai, Kano", capacity: 80000, currentStock: 55000, storageTypes: ["dry_bulk", "controlled_atmosphere"], certifications: ["CMA"], feeDailyPerTon: 120 },
  { id: "WH-003", name: "Ibadan Cold Store", location: "Ring Road, Ibadan", capacity: 20000, currentStock: 12000, storageTypes: ["cold_storage", "organic_certified"], certifications: ["CMA", "GlobalGAP"], feeDailyPerTon: 250 },
  { id: "WH-004", name: "Nairobi Commodities Depot", location: "Industrial Area, Nairobi", capacity: 40000, currentStock: 28000, storageTypes: ["dry_bulk", "fumigated", "controlled_atmosphere"], certifications: ["CMA_Kenya", "ISO22000"], feeDailyPerTon: 180 },
];

const receipts: WarehouseReceipt[] = [
  {
    id: "WR-2026-001", farmerId: 1001, warehouseId: "WH-001", commodity: "maize", variety: "WEMA-1001",
    quantityKg: 5000, qualityGrade: "A", moistureContent: 12.5, storageType: "dry_bulk",
    status: "issued", issuedAt: "2026-04-01T00:00:00Z", expiresAt: "2026-10-01T00:00:00Z",
    storageFeeDailyNGN: 750, currentValue: 1400000, collateralValue: 1120000, loanId: null,
    insurancePolicyId: "INS-WR-001",
    transferHistory: [{ date: "2026-04-01T00:00:00Z", from: "farmer_1001", to: "WH-001", type: "deposit" }],
  },
  {
    id: "WR-2026-002", farmerId: 1002, warehouseId: "WH-002", commodity: "rice", variety: "FARO-44",
    quantityKg: 10000, qualityGrade: "B", moistureContent: 13.0, storageType: "controlled_atmosphere",
    status: "pledged", issuedAt: "2026-03-15T00:00:00Z", expiresAt: "2026-09-15T00:00:00Z",
    storageFeeDailyNGN: 1200, currentValue: 4500000, collateralValue: 3150000, loanId: "LOAN-WR-002",
    insurancePolicyId: "INS-WR-002",
    transferHistory: [
      { date: "2026-03-15T00:00:00Z", from: "farmer_1002", to: "WH-002", type: "deposit" },
      { date: "2026-03-20T00:00:00Z", from: "farmer_1002", to: "MFI-001", type: "pledge" },
    ],
  },
  {
    id: "WR-2026-003", farmerId: 1003, warehouseId: "WH-003", commodity: "tomatoes", variety: "Roma VF",
    quantityKg: 2000, qualityGrade: "A", moistureContent: 94.0, storageType: "cold_storage",
    status: "issued", issuedAt: "2026-05-10T00:00:00Z", expiresAt: "2026-06-10T00:00:00Z",
    storageFeeDailyNGN: 500, currentValue: 800000, collateralValue: 560000, loanId: null,
    insurancePolicyId: null,
    transferHistory: [{ date: "2026-05-10T00:00:00Z", from: "farmer_1003", to: "WH-003", type: "deposit" }],
  },
];

function calculateCollateralValue(marketValue: number, grade: string, daysRemaining: number): number {
  const gradeDiscount: Record<string, number> = { A: 0.80, B: 0.70, C: 0.60, D: 0.45, reject: 0 };
  const discount = gradeDiscount[grade] || 0.5;
  const timeDecay = Math.max(0.7, 1 - (180 - daysRemaining) * 0.001);
  return Math.round(marketValue * discount * timeDecay);
}

function calculateStorageFees(receipt: WarehouseReceipt): { totalFees: number; daysSinceDeposit: number; dailyRate: number } {
  const deposited = new Date(receipt.issuedAt);
  const now = new Date();
  const daysSinceDeposit = Math.max(1, Math.floor((now.getTime() - deposited.getTime()) / (1000 * 60 * 60 * 24)));
  return { totalFees: daysSinceDeposit * receipt.storageFeeDailyNGN, daysSinceDeposit, dailyRate: receipt.storageFeeDailyNGN };
}

export const warehouseReceiptRouter = router({
  listReceipts: protectedProcedure
    .input(z.object({ farmerId: z.number().optional(), status: ReceiptStatus.optional(), warehouseId: z.string().optional() }).optional())
    .query(({ input }) => {
      let filtered = receipts;
      if (input?.farmerId) filtered = filtered.filter(r => r.farmerId === input.farmerId);
      if (input?.status) filtered = filtered.filter(r => r.status === input.status);
      if (input?.warehouseId) filtered = filtered.filter(r => r.warehouseId === input.warehouseId);
      return filtered.map(r => ({ ...r, storageFees: calculateStorageFees(r) }));
    }),

  getReceipt: protectedProcedure
    .input(z.object({ receiptId: z.string() }))
    .query(({ input }) => {
      const receipt = receipts.find(r => r.id === input.receiptId);
      if (!receipt) return null;
      return { ...receipt, storageFees: calculateStorageFees(receipt) };
    }),

  issueReceipt: protectedProcedure
    .input(z.object({
      farmerId: z.number(), warehouseId: z.string(), commodity: z.string(), variety: z.string(),
      quantityKg: z.number().min(100), qualityGrade: z.string(), moistureContent: z.number(),
      storageType: StorageType, durationDays: z.number().min(30).max(365),
    }))
    .mutation(({ input }) => {
      const warehouse = warehouses.find(w => w.id === input.warehouseId);
      if (!warehouse) return { success: false, error: "Warehouse not found" };
      if (warehouse.currentStock + input.quantityKg > warehouse.capacity) return { success: false, error: "Insufficient warehouse capacity" };

      const marketPrices: Record<string, number> = { maize: 280, rice: 450, cassava: 120, tomatoes: 400, sorghum: 250, wheat: 500, soybean: 380 };
      const pricePerKg = marketPrices[input.commodity] || 200;
      const currentValue = input.quantityKg * pricePerKg;
      const daysRemaining = input.durationDays;
      const collateralValue = calculateCollateralValue(currentValue, input.qualityGrade, daysRemaining);
      const dailyFee = Math.round((warehouse.feeDailyPerTon / 1000) * input.quantityKg);

      const receipt: WarehouseReceipt = {
        id: `WR-2026-${String(receipts.length + 1).padStart(3, "0")}`,
        farmerId: input.farmerId, warehouseId: input.warehouseId, commodity: input.commodity,
        variety: input.variety, quantityKg: input.quantityKg, qualityGrade: input.qualityGrade,
        moistureContent: input.moistureContent, storageType: input.storageType, status: "issued",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + input.durationDays * 24 * 60 * 60 * 1000).toISOString(),
        storageFeeDailyNGN: dailyFee, currentValue, collateralValue, loanId: null, insurancePolicyId: null,
        transferHistory: [{ date: new Date().toISOString(), from: `farmer_${input.farmerId}`, to: input.warehouseId, type: "deposit" }],
      };
      receipts.push(receipt);
      warehouse.currentStock += input.quantityKg;

      logger.info("[WarehouseReceipt] Receipt issued", { receiptId: receipt.id, farmerId: input.farmerId, commodity: input.commodity, quantityKg: input.quantityKg });
      return { success: true, receipt };
    }),

  pledgeForLoan: protectedProcedure
    .input(z.object({ receiptId: z.string(), lenderId: z.string(), loanAmount: z.number() }))
    .mutation(({ input }) => {
      const receipt = receipts.find(r => r.id === input.receiptId);
      if (!receipt) return { success: false, error: "Receipt not found" };
      if (receipt.status !== "issued") return { success: false, error: "Receipt not available for pledging" };
      if (input.loanAmount > receipt.collateralValue) return { success: false, error: `Loan exceeds collateral value (max: ${receipt.collateralValue})` };

      receipt.status = "pledged";
      receipt.loanId = `LOAN-WR-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
      receipt.transferHistory.push({ date: new Date().toISOString(), from: `farmer_${receipt.farmerId}`, to: input.lenderId, type: "pledge" });

      logger.info("[WarehouseReceipt] Receipt pledged", { receiptId: input.receiptId, loanId: receipt.loanId, amount: input.loanAmount });
      return { success: true, loanId: receipt.loanId, collateralValue: receipt.collateralValue, loanToValue: Math.round((input.loanAmount / receipt.collateralValue) * 100) };
    }),

  releaseReceipt: protectedProcedure
    .input(z.object({ receiptId: z.string(), reason: z.enum(["withdrawal", "loan_repaid", "expired", "sold"]) }))
    .mutation(({ input }) => {
      const receipt = receipts.find(r => r.id === input.receiptId);
      if (!receipt) return { success: false, error: "Receipt not found" };
      if (receipt.status === "released" || receipt.status === "cancelled") return { success: false, error: "Receipt already released" };
      if (receipt.status === "pledged" && input.reason !== "loan_repaid") return { success: false, error: "Pledged receipt can only be released after loan repayment" };

      receipt.status = "released";
      const fees = calculateStorageFees(receipt);
      receipt.transferHistory.push({ date: new Date().toISOString(), from: receipt.warehouseId, to: `farmer_${receipt.farmerId}`, type: "release" });

      const warehouse = warehouses.find(w => w.id === receipt.warehouseId);
      if (warehouse) warehouse.currentStock -= receipt.quantityKg;

      logger.info("[WarehouseReceipt] Receipt released", { receiptId: input.receiptId, reason: input.reason, fees: fees.totalFees });
      return { success: true, receiptId: receipt.id, totalStorageFees: fees.totalFees, daysStored: fees.daysSinceDeposit };
    }),

  listWarehouses: publicProcedure
    .input(z.object({ storageType: StorageType.optional(), minCapacity: z.number().optional() }).optional())
    .query(({ input }) => {
      let filtered = warehouses;
      if (input?.storageType) filtered = filtered.filter(w => w.storageTypes.includes(input.storageType!));
      if (input?.minCapacity) filtered = filtered.filter(w => (w.capacity - w.currentStock) >= input.minCapacity!);
      return filtered.map(w => ({ ...w, availableCapacity: w.capacity - w.currentStock, utilizationPercent: Math.round((w.currentStock / w.capacity) * 100) }));
    }),

  getMarketPrices: publicProcedure.query(() => ({
    prices: [
      { commodity: "maize", pricePerKg: 280, currency: "NGN", change24h: +2.1 },
      { commodity: "rice", pricePerKg: 450, currency: "NGN", change24h: -0.5 },
      { commodity: "cassava", pricePerKg: 120, currency: "NGN", change24h: +1.3 },
      { commodity: "sorghum", pricePerKg: 250, currency: "NGN", change24h: +0.8 },
      { commodity: "wheat", pricePerKg: 500, currency: "NGN", change24h: -1.2 },
      { commodity: "soybean", pricePerKg: 380, currency: "NGN", change24h: +3.5 },
      { commodity: "tomatoes", pricePerKg: 400, currency: "NGN", change24h: +5.2 },
    ],
    lastUpdated: new Date().toISOString(),
  })),

  getPortfolioSummary: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(({ input }) => {
      const farmerReceipts = receipts.filter(r => r.farmerId === input.farmerId);
      const totalValue = farmerReceipts.reduce((sum, r) => sum + r.currentValue, 0);
      const totalCollateral = farmerReceipts.reduce((sum, r) => sum + r.collateralValue, 0);
      const totalFees = farmerReceipts.reduce((sum, r) => sum + calculateStorageFees(r).totalFees, 0);
      const pledged = farmerReceipts.filter(r => r.status === "pledged");
      return {
        totalReceipts: farmerReceipts.length, activeReceipts: farmerReceipts.filter(r => r.status === "issued" || r.status === "pledged").length,
        totalValue, totalCollateral, availableCollateral: totalCollateral - pledged.reduce((s, r) => s + r.collateralValue, 0),
        totalStorageFees: totalFees, pledgedCount: pledged.length,
      };
    }),
});
