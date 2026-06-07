import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

const InputCategory = z.enum(["seeds", "fertilizer", "pesticides", "herbicides", "tools", "equipment", "irrigation"]);
const RepaymentSource = z.enum(["harvest_proceeds", "mobile_money", "bank_transfer", "cooperative_deduction"]);

interface InputSupplier {
  id: string; name: string; categories: string[]; regions: string[];
  rating: number; deliveryDays: number; creditTermsAvailable: boolean;
  products: { id: string; name: string; category: string; pricePerUnit: number; unit: string; inStock: boolean }[];
}

interface InputLoan {
  id: string; farmerId: number; supplierId: string; items: { productId: string; productName: string; quantity: number; unitPrice: number }[];
  totalAmount: number; interestRate: number; repaymentSource: string; expectedHarvestDate: string;
  status: string; disbursedAt: string; dueAt: string; repaidAmount: number;
}

const suppliers: InputSupplier[] = [
  { id: "SUP-001", name: "AgroSeed Nigeria", categories: ["seeds"], regions: ["Lagos", "Ogun", "Oyo", "Nationwide"], rating: 4.7, deliveryDays: 3, creditTermsAvailable: true, products: [
    { id: "P-001", name: "Maize WEMA-1001 (25kg)", category: "seeds", pricePerUnit: 15000, unit: "bag", inStock: true },
    { id: "P-002", name: "Rice FARO-44 (50kg)", category: "seeds", pricePerUnit: 28000, unit: "bag", inStock: true },
    { id: "P-003", name: "Cassava TME-419 stems (bundle)", category: "seeds", pricePerUnit: 5000, unit: "bundle", inStock: true },
  ]},
  { id: "SUP-002", name: "FertilizePro Ltd", categories: ["fertilizer"], regions: ["Nationwide"], rating: 4.5, deliveryDays: 5, creditTermsAvailable: true, products: [
    { id: "P-004", name: "NPK 15-15-15 (50kg)", category: "fertilizer", pricePerUnit: 22000, unit: "bag", inStock: true },
    { id: "P-005", name: "Urea 46-0-0 (50kg)", category: "fertilizer", pricePerUnit: 18000, unit: "bag", inStock: true },
    { id: "P-006", name: "Organic Compost (25kg)", category: "fertilizer", pricePerUnit: 8000, unit: "bag", inStock: true },
  ]},
  { id: "SUP-003", name: "CropGuard Africa", categories: ["pesticides", "herbicides"], regions: ["West Africa"], rating: 4.3, deliveryDays: 4, creditTermsAvailable: false, products: [
    { id: "P-007", name: "Glyphosate 360g/L (5L)", category: "herbicides", pricePerUnit: 12000, unit: "bottle", inStock: true },
    { id: "P-008", name: "Cypermethrin 10EC (1L)", category: "pesticides", pricePerUnit: 6500, unit: "bottle", inStock: true },
  ]},
  { id: "SUP-004", name: "IrriTech Solutions", categories: ["irrigation", "equipment"], regions: ["Nationwide"], rating: 4.8, deliveryDays: 7, creditTermsAvailable: true, products: [
    { id: "P-009", name: "Drip Irrigation Kit (1 acre)", category: "irrigation", pricePerUnit: 150000, unit: "kit", inStock: true },
    { id: "P-010", name: "Solar Water Pump (1HP)", category: "irrigation", pricePerUnit: 250000, unit: "unit", inStock: false },
  ]},
];

const inputLoans: InputLoan[] = [
  { id: "IL-001", farmerId: 1001, supplierId: "SUP-001", items: [{ productId: "P-001", productName: "Maize WEMA-1001 (25kg)", quantity: 4, unitPrice: 15000 }, { productId: "P-004", productName: "NPK 15-15-15 (50kg)", quantity: 3, unitPrice: 22000 }], totalAmount: 126000, interestRate: 5, repaymentSource: "harvest_proceeds", expectedHarvestDate: "2026-08-15", status: "active", disbursedAt: "2026-03-01T00:00:00Z", dueAt: "2026-09-01T00:00:00Z", repaidAmount: 0 },
  { id: "IL-002", farmerId: 1002, supplierId: "SUP-004", items: [{ productId: "P-009", productName: "Drip Irrigation Kit (1 acre)", quantity: 2, unitPrice: 150000 }], totalAmount: 300000, interestRate: 8, repaymentSource: "harvest_proceeds", expectedHarvestDate: "2026-10-01", status: "active", disbursedAt: "2026-02-15T00:00:00Z", dueAt: "2026-11-01T00:00:00Z", repaidAmount: 75000 },
];

function calculateRepayment(loan: InputLoan): { totalDue: number; monthlyPayment: number; remaining: number; monthsLeft: number } {
  const totalDue = Math.round(loan.totalAmount * (1 + loan.interestRate / 100));
  const disbursed = new Date(loan.disbursedAt);
  const due = new Date(loan.dueAt);
  const totalMonths = Math.max(1, Math.round((due.getTime() - disbursed.getTime()) / (30 * 24 * 60 * 60 * 1000)));
  const monthlyPayment = Math.round(totalDue / totalMonths);
  const remaining = totalDue - loan.repaidAmount;
  const monthsLeft = Math.max(0, Math.ceil(remaining / monthlyPayment));
  return { totalDue, monthlyPayment, remaining, monthsLeft };
}

export const inputFinancingRouter = router({
  listSuppliers: publicProcedure
    .input(z.object({ category: InputCategory.optional(), region: z.string().optional() }).optional())
    .query(({ input }) => {
      let filtered = suppliers;
      if (input?.category) filtered = filtered.filter(s => s.categories.includes(input.category!));
      if (input?.region) filtered = filtered.filter(s => s.regions.includes(input.region!) || s.regions.includes("Nationwide") || s.regions.includes("West Africa"));
      return filtered.map(s => ({ ...s, productCount: s.products.filter(p => p.inStock).length }));
    }),

  getSupplierProducts: publicProcedure
    .input(z.object({ supplierId: z.string(), category: InputCategory.optional() }))
    .query(({ input }) => {
      const supplier = suppliers.find(s => s.id === input.supplierId);
      if (!supplier) return [];
      let products = supplier.products;
      if (input.category) products = products.filter(p => p.category === input.category);
      return products;
    }),

  applyForInputLoan: protectedProcedure
    .input(z.object({
      farmerId: z.number(), supplierId: z.string(),
      items: z.array(z.object({ productId: z.string(), quantity: z.number().min(1) })),
      repaymentSource: RepaymentSource, expectedHarvestDate: z.string(),
      farmSizeAcres: z.number().min(0.5), cropType: z.string(),
    }))
    .mutation(({ input }) => {
      const supplier = suppliers.find(s => s.id === input.supplierId);
      if (!supplier) return { success: false, error: "Supplier not found" };

      const resolvedItems = input.items.map(item => {
        const product = supplier.products.find(p => p.id === item.productId);
        return { productId: item.productId, productName: product?.name || "Unknown", quantity: item.quantity, unitPrice: product?.pricePerUnit || 0 };
      });

      const totalAmount = resolvedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const maxLoanPerAcre = 200000;
      const maxAllowed = input.farmSizeAcres * maxLoanPerAcre;

      if (totalAmount > maxAllowed) return { success: false, error: `Loan amount ₦${totalAmount.toLocaleString()} exceeds maximum ₦${maxAllowed.toLocaleString()} for ${input.farmSizeAcres} acres` };

      const interestRate = totalAmount > 200000 ? 8 : 5;
      const harvestDate = new Date(input.expectedHarvestDate);
      const dueDate = new Date(harvestDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      const loan: InputLoan = {
        id: `IL-${String(inputLoans.length + 1).padStart(3, "0")}`, farmerId: input.farmerId, supplierId: input.supplierId,
        items: resolvedItems, totalAmount, interestRate, repaymentSource: input.repaymentSource,
        expectedHarvestDate: input.expectedHarvestDate, status: "active",
        disbursedAt: new Date().toISOString(), dueAt: dueDate.toISOString(), repaidAmount: 0,
      };
      inputLoans.push(loan);

      logger.info("[InputFinancing] Loan approved", { loanId: loan.id, farmerId: input.farmerId, amount: totalAmount });
      return { success: true, loan, repaymentSchedule: calculateRepayment(loan) };
    }),

  getMyLoans: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(({ input }) => {
      const farmerLoans = inputLoans.filter(l => l.farmerId === input.farmerId);
      return farmerLoans.map(l => ({ ...l, repaymentSchedule: calculateRepayment(l) }));
    }),

  makeRepayment: protectedProcedure
    .input(z.object({ loanId: z.string(), amount: z.number().min(1), source: RepaymentSource }))
    .mutation(({ input }) => {
      const loan = inputLoans.find(l => l.id === input.loanId);
      if (!loan) return { success: false, error: "Loan not found" };
      const { totalDue, remaining } = calculateRepayment(loan);
      const payment = Math.min(input.amount, remaining);
      loan.repaidAmount += payment;
      if (loan.repaidAmount >= totalDue) loan.status = "repaid";
      logger.info("[InputFinancing] Repayment received", { loanId: input.loanId, amount: payment, remaining: remaining - payment });
      return { success: true, paid: payment, remainingBalance: remaining - payment, loanStatus: loan.status };
    }),

  getRecommendedInputs: protectedProcedure
    .input(z.object({ cropType: z.string(), farmSizeAcres: z.number(), soilType: z.string().optional(), season: z.string().optional() }))
    .query(({ input }) => {
      const recommendations: Record<string, { seeds: string; seedQty: string; fertilizer: string; fertilizerQty: string; pesticide: string; totalCostEstimate: number }> = {
        maize: { seeds: "WEMA-1001", seedQty: `${Math.ceil(input.farmSizeAcres * 25)}kg`, fertilizer: "NPK 15-15-15", fertilizerQty: `${Math.ceil(input.farmSizeAcres * 4)} bags`, pesticide: "Cypermethrin 10EC", totalCostEstimate: Math.round(input.farmSizeAcres * 95000) },
        rice: { seeds: "FARO-44", seedQty: `${Math.ceil(input.farmSizeAcres * 50)}kg`, fertilizer: "Urea 46-0-0", fertilizerQty: `${Math.ceil(input.farmSizeAcres * 6)} bags`, pesticide: "Propanil", totalCostEstimate: Math.round(input.farmSizeAcres * 120000) },
        cassava: { seeds: "TME-419 stems", seedQty: `${Math.ceil(input.farmSizeAcres * 60)} bundles`, fertilizer: "NPK 15-15-15", fertilizerQty: `${Math.ceil(input.farmSizeAcres * 3)} bags`, pesticide: "Minimal needed", totalCostEstimate: Math.round(input.farmSizeAcres * 65000) },
        tomatoes: { seeds: "Roma VF", seedQty: `${Math.ceil(input.farmSizeAcres * 0.5)}kg`, fertilizer: "Organic Compost + NPK", fertilizerQty: `${Math.ceil(input.farmSizeAcres * 8)} bags`, pesticide: "Mancozeb + Cypermethrin", totalCostEstimate: Math.round(input.farmSizeAcres * 180000) },
      };
      return recommendations[input.cropType] || { seeds: "Contact agronomist", seedQty: "TBD", fertilizer: "Soil test recommended", fertilizerQty: "TBD", pesticide: "IPM approach", totalCostEstimate: Math.round(input.farmSizeAcres * 100000) };
    }),
});
