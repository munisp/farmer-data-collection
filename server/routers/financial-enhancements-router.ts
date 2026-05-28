import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc-base.js";
import { requireDb } from "../utils/require-db.js";
import { users } from "../../drizzle/schema.js";
import { eq, desc, and, sql } from "drizzle-orm";

export const financialEnhancementsRouter = router({
  // ======================== CROP RECEIPT FINANCING ========================

  applyForReceiptLoan: protectedProcedure
    .input(z.object({
      warehouseReceiptId: z.string(),
      commodityType: z.string(),
      quantityKg: z.number().min(1),
      estimatedValue: z.number().min(1),
      requestedAmount: z.number().min(1),
      warehouseName: z.string(),
      storageLocation: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const maxLoanPct = 0.7;
      const maxLoanAmount = Math.round(input.estimatedValue * maxLoanPct);
      if (input.requestedAmount > maxLoanAmount) {
        throw new Error(`Maximum loan against this receipt is KES ${maxLoanAmount} (70% of commodity value)`);
      }
      const interestRate = 12;
      const monthlyPayment = Math.round((input.requestedAmount * (1 + interestRate / 100)) / 6);
      return {
        applicationId: `RCF-${Date.now()}`,
        userId: ctx.user.id,
        warehouseReceiptId: input.warehouseReceiptId,
        commodity: input.commodityType,
        collateralValue: input.estimatedValue,
        requestedAmount: input.requestedAmount,
        maxApprovedAmount: maxLoanAmount,
        interestRateAnnual: interestRate,
        termMonths: 6,
        monthlyPayment,
        status: "under_review",
        estimatedApprovalTime: "24-48 hours",
      };
    }),

  getReceiptLoanEligibility: protectedProcedure
    .input(z.object({
      commodityType: z.string(),
      quantityKg: z.number(),
    }))
    .query(async ({ input }) => {
      const pricePerKg: Record<string, number> = {
        maize: 45, beans: 120, wheat: 55, rice: 90, sorghum: 40,
        coffee: 350, tea: 200, cotton: 80, cashews: 180, cocoa: 300,
      };
      const price = pricePerKg[input.commodityType.toLowerCase()] ?? 50;
      const estimatedValue = price * input.quantityKg;
      const maxLoanAmount = Math.round(estimatedValue * 0.7);

      return {
        commodity: input.commodityType,
        quantity: input.quantityKg,
        estimatedPricePerKg: price,
        estimatedTotalValue: estimatedValue,
        loanToValueRatio: 0.7,
        maxLoanAmount,
        interestRate: 12,
        maxTermMonths: 6,
        eligible: input.quantityKg >= 100,
        minimumQuantityKg: 100,
      };
    }),

  // ======================== PAY-AS-YOU-HARVEST ========================

  enrollPayAsYouHarvest: protectedProcedure
    .input(z.object({
      loanId: z.number(),
      deductionPercentage: z.number().min(5).max(50).default(20),
    }))
    .mutation(async ({ ctx, input }) => {
      return {
        enrollmentId: `PAYH-${Date.now()}`,
        userId: ctx.user.id,
        loanId: input.loanId,
        deductionPercentage: input.deductionPercentage,
        status: "active",
        description: `${input.deductionPercentage}% of every marketplace sale will be auto-deducted toward loan #${input.loanId}`,
        nextDeductionTrigger: "On next marketplace sale",
      };
    }),

  simulatePayAsYouHarvest: protectedProcedure
    .input(z.object({
      loanBalance: z.number(),
      deductionPercentage: z.number().default(20),
      expectedMonthlySales: z.number(),
    }))
    .query(async ({ input }) => {
      const monthlyDeduction = Math.round(input.expectedMonthlySales * (input.deductionPercentage / 100));
      const monthsToRepay = Math.ceil(input.loanBalance / monthlyDeduction);
      const schedule = [];
      let balance = input.loanBalance;
      for (let m = 1; m <= Math.min(monthsToRepay, 24); m++) {
        const deduction = Math.min(monthlyDeduction, balance);
        balance -= deduction;
        schedule.push({ month: m, deduction, remainingBalance: Math.max(0, balance) });
        if (balance <= 0) break;
      }
      return {
        monthlyDeduction,
        estimatedMonthsToRepay: monthsToRepay,
        schedule,
      };
    }),

  // ======================== VOICE LOAN STATUS ========================

  getVoiceLoanStatus: protectedProcedure
    .input(z.object({ phoneNumber: z.string() }))
    .query(async ({ ctx }) => {
      return {
        userId: ctx.user.id,
        activeLoans: [
          {
            loanId: "LN-SAMPLE",
            balance: 25000,
            currency: "NGN",
            nextPaymentDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
            nextPaymentAmount: 5000,
            status: "active",
            totalPaid: 15000,
            totalDue: 40000,
          },
        ],
        voiceScript: "You have 1 active loan. Loan balance: 25,000 KES. Next payment: 5,000 KES due in 7 days. Press 1 to hear repayment history. Press 2 to make a payment now.",
        ivrMenuOptions: {
          "1": "repayment_history",
          "2": "make_payment",
          "3": "loan_details",
          "0": "main_menu",
        },
      };
    }),

  // ======================== GROUP INPUT PURCHASING ========================

  createGroupPurchaseOrder: protectedProcedure
    .input(z.object({
      cooperativeId: z.number(),
      inputName: z.string(),
      inputType: z.enum(["seeds", "fertilizer", "pesticide", "tools", "irrigation"]),
      quantityNeeded: z.number().min(1),
      unit: z.string().default("kg"),
      preferredSupplier: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const wholesaleDiscounts: Record<string, number> = {
        seeds: 0.15, fertilizer: 0.20, pesticide: 0.12, tools: 0.10, irrigation: 0.18,
      };
      const discount = wholesaleDiscounts[input.inputType] ?? 0.10;
      return {
        orderId: `GPO-${Date.now()}`,
        cooperativeId: input.cooperativeId,
        createdBy: ctx.user.id,
        inputName: input.inputName,
        inputType: input.inputType,
        quantity: input.quantityNeeded,
        unit: input.unit,
        estimatedDiscount: `${Math.round(discount * 100)}%`,
        status: "collecting_commitments",
        minOrderForDiscount: Math.ceil(input.quantityNeeded * 5),
        description: `Group order for ${input.inputName}. Members can commit quantities. Order placed when minimum reached.`,
      };
    }),

  getGroupPurchaseOrders: protectedProcedure
    .input(z.object({ cooperativeId: z.number() }))
    .query(async () => {
      return [] as Array<{
        orderId: string;
        inputName: string;
        inputType: string;
        totalCommitted: number;
        minRequired: number;
        status: string;
        members: number;
      }>;
    }),

  // ======================== TRANSPORT PROVIDER MARKETPLACE ========================

  listTransportJobs: publicProcedure
    .input(z.object({
      region: z.string().optional(),
      vehicleType: z.enum(["boda_boda", "pickup", "truck", "refrigerated_van"]).optional(),
    }))
    .query(async () => {
      return [] as Array<{
        jobId: string;
        pickupLocation: string;
        deliveryLocation: string;
        distanceKm: number;
        weightKg: number;
        requiredVehicle: string;
        offeredPrice: number;
        status: string;
      }>;
    }),

  bidOnTransportJob: protectedProcedure
    .input(z.object({
      jobId: z.string(),
      bidAmount: z.number().min(1),
      estimatedDeliveryHours: z.number().min(1),
      vehicleType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return {
        bidId: `BID-${Date.now()}`,
        jobId: input.jobId,
        driverId: ctx.user.id,
        bidAmount: input.bidAmount,
        estimatedDeliveryHours: input.estimatedDeliveryHours,
        vehicleType: input.vehicleType,
        status: "submitted",
      };
    }),

  // ======================== INVOICE / PAYMENT TERMS ========================

  createInvoice: protectedProcedure
    .input(z.object({
      buyerId: z.number(),
      items: z.array(z.object({
        description: z.string(),
        quantity: z.number(),
        unitPrice: z.number(),
      })),
      paymentTerms: z.enum(["immediate", "net_7", "net_30", "net_60"]).default("net_30"),
      currency: z.string().default("NGN"),
    }))
    .mutation(async ({ ctx, input }) => {
      const subtotal = input.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
      const tax = Math.round(subtotal * 0.16);
      const total = subtotal + tax;
      const daysMap: Record<string, number> = { immediate: 0, net_7: 7, net_30: 30, net_60: 60 };
      const dueDays = daysMap[input.paymentTerms] ?? 30;
      const dueDate = new Date(Date.now() + dueDays * 86400000);

      return {
        invoiceId: `INV-${Date.now()}`,
        sellerId: ctx.user.id,
        buyerId: input.buyerId,
        items: input.items,
        subtotal,
        taxRate: 0.16,
        taxAmount: tax,
        total,
        currency: input.currency,
        paymentTerms: input.paymentTerms,
        dueDate: dueDate.toISOString().split("T")[0],
        status: "issued",
      };
    }),

  getMyInvoices: protectedProcedure
    .input(z.object({ role: z.enum(["seller", "buyer"]).default("seller") }))
    .query(async () => {
      return [] as Array<{
        invoiceId: string;
        counterparty: string;
        total: number;
        dueDate: string;
        status: string;
      }>;
    }),

  // ======================== QUALITY SLA ENFORCEMENT ========================

  defineQualitySLA: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      minGrade: z.enum(["A", "B", "C"]),
      maxMoisturePercent: z.number().optional(),
      minSizeGrams: z.number().optional(),
      penaltyPercentage: z.number().default(10),
      autoRejectBelowGrade: z.enum(["C", "D"]).default("D"),
    }))
    .mutation(async ({ ctx, input }) => {
      return {
        slaId: `SLA-${Date.now()}`,
        contractId: input.contractId,
        definedBy: ctx.user.id,
        minGrade: input.minGrade,
        maxMoisturePercent: input.maxMoisturePercent,
        minSizeGrams: input.minSizeGrams,
        penaltyPercentage: input.penaltyPercentage,
        autoRejectBelowGrade: input.autoRejectBelowGrade,
        status: "active",
      };
    }),

  evaluateDeliveryQuality: protectedProcedure
    .input(z.object({
      contractId: z.number(),
      deliveredGrade: z.enum(["A", "B", "C", "D"]),
      moisturePercent: z.number().optional(),
      sizeGrams: z.number().optional(),
      quantityKg: z.number(),
      pricePerKg: z.number(),
    }))
    .query(async ({ input }) => {
      const gradeValues: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
      const grade = gradeValues[input.deliveredGrade] ?? 2;
      const passes = grade >= 2;
      const penaltyApplied = grade <= 2 ? 10 : 0;
      const adjustedPrice = Math.round(input.pricePerKg * (1 - penaltyApplied / 100));
      const totalAmount = adjustedPrice * input.quantityKg;

      return {
        deliveredGrade: input.deliveredGrade,
        passesQualitySLA: passes,
        penaltyPercentage: penaltyApplied,
        originalPricePerKg: input.pricePerKg,
        adjustedPricePerKg: adjustedPrice,
        totalAmount,
        recommendation: passes
          ? "Accepted. Proceed with payment."
          : "Below minimum grade. Auto-rejected per SLA terms.",
      };
    }),

  // ======================== SOIL HEALTH PASSPORT ========================

  addSoilTestResult: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      testDate: z.string(),
      ph: z.number().min(0).max(14),
      nitrogenPpm: z.number().optional(),
      phosphorusPpm: z.number().optional(),
      potassiumPpm: z.number().optional(),
      organicMatterPercent: z.number().optional(),
      soilType: z.string().optional(),
      labName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const healthScore = calculateSoilHealthScore(input);
      return {
        passportId: `SOIL-${Date.now()}`,
        farmId: input.farmId,
        userId: ctx.user.id,
        testDate: input.testDate,
        results: {
          ph: input.ph,
          nitrogenPpm: input.nitrogenPpm,
          phosphorusPpm: input.phosphorusPpm,
          potassiumPpm: input.potassiumPpm,
          organicMatterPercent: input.organicMatterPercent,
        },
        healthScore,
        rating: healthScore >= 80 ? "excellent" : healthScore >= 60 ? "good" : healthScore >= 40 ? "fair" : "poor",
        recommendations: getSoilRecommendations(input),
      };
    }),

  getFarmSoilHistory: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async () => {
      return [] as Array<{
        testDate: string;
        healthScore: number;
        ph: number;
        organicMatter: number;
      }>;
    }),

  // ======================== CLIMATE-ADAPTIVE CROP RECOMMENDATIONS ========================

  getCropRecommendations: publicProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
      soilType: z.string().optional(),
      elevation: z.number().optional(),
      annualRainfallMm: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const crops = [];
      const rainfall = input.annualRainfallMm ?? 800;
      const elevation = input.elevation ?? 1500;

      if (rainfall >= 600 && elevation < 2000) crops.push({ crop: "Maize", suitability: 0.9, season: "March-August", notes: "Staple crop, well-suited to region" });
      if (rainfall >= 800) crops.push({ crop: "Rice", suitability: 0.75, season: "April-September", notes: "Paddy rice if water available" });
      if (rainfall >= 400) crops.push({ crop: "Beans", suitability: 0.85, season: "Year-round", notes: "High protein, good market demand" });
      if (rainfall >= 500 && elevation > 1000) crops.push({ crop: "Potatoes", suitability: 0.8, season: "Year-round at altitude", notes: "Fast cycle, high demand" });
      if (rainfall >= 300) crops.push({ crop: "Sorghum", suitability: 0.7, season: "March-July", notes: "Drought tolerant alternative" });
      if (rainfall < 500) crops.push({ crop: "Millet", suitability: 0.85, season: "April-August", notes: "Highly drought resistant" });
      if (elevation > 1500 && rainfall >= 1200) crops.push({ crop: "Tea", suitability: 0.8, season: "Year-round", notes: "Premium export crop" });
      if (elevation < 1500 && rainfall >= 600) crops.push({ crop: "Tomatoes", suitability: 0.75, season: "Year-round with irrigation", notes: "High value market crop" });
      if (rainfall >= 1000) crops.push({ crop: "Bananas", suitability: 0.7, season: "Year-round", notes: "Consistent income source" });

      crops.sort((a, b) => b.suitability - a.suitability);

      return {
        location: { latitude: input.latitude, longitude: input.longitude },
        elevation: input.elevation,
        estimatedRainfall: rainfall,
        soilType: input.soilType ?? "unknown",
        recommendations: crops.slice(0, 5),
        adaptationNotes: rainfall < 500
          ? "Low rainfall area. Consider drought-resistant varieties and water harvesting."
          : rainfall > 1200
          ? "High rainfall area. Ensure good drainage. Watch for fungal diseases."
          : "Moderate rainfall. Wide range of crops suitable.",
      };
    }),

  // ======================== MARKETPLACE INSURANCE ========================

  getTransitInsuranceQuote: publicProcedure
    .input(z.object({
      commodityType: z.string(),
      quantityKg: z.number(),
      distanceKm: z.number(),
      requiresColdChain: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const baseRatePerKg = input.requiresColdChain ? 2.5 : 1.0;
      const distanceFactor = 1 + (input.distanceKm / 500) * 0.3;
      const premium = Math.round(input.quantityKg * baseRatePerKg * distanceFactor);
      const coverageAmount = Math.round(input.quantityKg * 50 * 1.2);

      return {
        commodity: input.commodityType,
        quantity: input.quantityKg,
        distance: input.distanceKm,
        coldChain: input.requiresColdChain,
        premium,
        currency: "NGN",
        coverageAmount,
        coverageType: "transit_spoilage",
        coveredRisks: [
          "Spoilage during transport",
          "Temperature excursion (cold chain)",
          "Vehicle breakdown delay",
          "Accident/theft in transit",
        ],
        deductible: Math.round(premium * 0.1),
        claimProcess: "Photo documentation + driver statement within 24 hours of delivery",
      };
    }),

  purchaseTransitInsurance: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      commodityType: z.string(),
      quantityKg: z.number(),
      distanceKm: z.number(),
      premium: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      return {
        policyId: `TI-${Date.now()}`,
        userId: ctx.user.id,
        orderId: input.orderId,
        commodity: input.commodityType,
        premium: input.premium,
        status: "active",
        validUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
      };
    }),
});

function calculateSoilHealthScore(input: {
  ph: number;
  nitrogenPpm?: number;
  phosphorusPpm?: number;
  potassiumPpm?: number;
  organicMatterPercent?: number;
}): number {
  let score = 0;
  let factors = 0;

  // pH score (ideal: 6.0-7.0)
  const phDev = Math.abs(input.ph - 6.5);
  score += Math.max(0, 100 - phDev * 25);
  factors++;

  if (input.nitrogenPpm != null) {
    score += Math.min(100, (input.nitrogenPpm / 50) * 100);
    factors++;
  }
  if (input.phosphorusPpm != null) {
    score += Math.min(100, (input.phosphorusPpm / 30) * 100);
    factors++;
  }
  if (input.potassiumPpm != null) {
    score += Math.min(100, (input.potassiumPpm / 200) * 100);
    factors++;
  }
  if (input.organicMatterPercent != null) {
    score += Math.min(100, (input.organicMatterPercent / 5) * 100);
    factors++;
  }

  return Math.round(score / factors);
}

function getSoilRecommendations(input: {
  ph: number;
  nitrogenPpm?: number;
  phosphorusPpm?: number;
  potassiumPpm?: number;
  organicMatterPercent?: number;
}): string[] {
  const recs: string[] = [];
  if (input.ph < 5.5) recs.push("Apply agricultural lime to raise pH");
  if (input.ph > 7.5) recs.push("Apply sulfur or organic matter to lower pH");
  if (input.nitrogenPpm != null && input.nitrogenPpm < 20) recs.push("Apply nitrogen fertilizer (urea or CAN)");
  if (input.phosphorusPpm != null && input.phosphorusPpm < 10) recs.push("Apply phosphorus fertilizer (DAP or TSP)");
  if (input.potassiumPpm != null && input.potassiumPpm < 100) recs.push("Apply potash (MOP)");
  if (input.organicMatterPercent != null && input.organicMatterPercent < 2) recs.push("Add compost or manure to improve organic matter");
  if (recs.length === 0) recs.push("Soil health is good. Maintain current practices.");
  return recs;
}
