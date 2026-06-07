import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

const InsuranceType = z.enum(["drought", "flood", "pest_outbreak", "frost", "hail", "excess_rain"]);
const PolicyStatus = z.enum(["active", "expired", "claimed", "cancelled"]);
const PayoutTrigger = z.enum(["satellite_confirmed", "weather_station", "iot_sensor", "manual_assessment"]);

interface InsurancePolicy {
  id: string; farmerId: number; type: string; cropType: string; farmSizeAcres: number;
  coverageAmount: number; premiumPaid: number; premiumRate: number;
  triggerCondition: { metric: string; threshold: number; operator: string; measurementPeriod: string };
  status: string; startDate: string; endDate: string; region: string;
  payoutHistory: { date: string; amount: number; trigger: string; evidence: string }[];
}

const policies: InsurancePolicy[] = [
  {
    id: "PAR-INS-001", farmerId: 1001, type: "drought", cropType: "maize", farmSizeAcres: 5,
    coverageAmount: 500000, premiumPaid: 25000, premiumRate: 5,
    triggerCondition: { metric: "rainfall_mm", threshold: 50, operator: "less_than", measurementPeriod: "30_days" },
    status: "active", startDate: "2026-03-01", endDate: "2026-09-30", region: "Ogun State",
    payoutHistory: [],
  },
  {
    id: "PAR-INS-002", farmerId: 1002, type: "flood", cropType: "rice", farmSizeAcres: 10,
    coverageAmount: 1200000, premiumPaid: 72000, premiumRate: 6,
    triggerCondition: { metric: "rainfall_mm", threshold: 300, operator: "greater_than", measurementPeriod: "7_days" },
    status: "active", startDate: "2026-04-01", endDate: "2026-10-31", region: "Niger State",
    payoutHistory: [{ date: "2026-05-15", amount: 600000, trigger: "satellite_confirmed", evidence: "Sentinel-2 flood extent > 40% of insured area" }],
  },
  {
    id: "PAR-INS-003", farmerId: 1003, type: "pest_outbreak", cropType: "tomatoes", farmSizeAcres: 2,
    coverageAmount: 300000, premiumPaid: 21000, premiumRate: 7,
    triggerCondition: { metric: "pest_severity_index", threshold: 7, operator: "greater_than", measurementPeriod: "14_days" },
    status: "active", startDate: "2026-02-01", endDate: "2026-08-31", region: "Kaduna State",
    payoutHistory: [],
  },
];

const riskModels: Record<string, { baseRate: number; regionMultiplier: Record<string, number>; cropMultiplier: Record<string, number> }> = {
  drought: { baseRate: 4.5, regionMultiplier: { "Northern Nigeria": 1.3, "Southern Nigeria": 0.8, "Kenya Highlands": 0.7, "Kenya Coast": 1.1 }, cropMultiplier: { maize: 1.2, rice: 0.8, cassava: 0.6, tomatoes: 1.4 } },
  flood: { baseRate: 5.0, regionMultiplier: { "Northern Nigeria": 0.7, "Southern Nigeria": 1.4, "Kenya Highlands": 0.9, "Kenya Coast": 1.5 }, cropMultiplier: { maize: 1.0, rice: 1.3, cassava: 0.9, tomatoes: 1.1 } },
  pest_outbreak: { baseRate: 6.0, regionMultiplier: { "Northern Nigeria": 1.1, "Southern Nigeria": 1.2, "Kenya Highlands": 0.9, "Kenya Coast": 1.0 }, cropMultiplier: { maize: 1.1, rice: 0.9, cassava: 0.7, tomatoes: 1.5 } },
  frost: { baseRate: 3.0, regionMultiplier: { "Northern Nigeria": 0.3, "Southern Nigeria": 0.1, "Kenya Highlands": 1.8, "Kenya Coast": 0.1 }, cropMultiplier: { maize: 1.0, rice: 1.2, cassava: 0.5, tomatoes: 1.8 } },
  hail: { baseRate: 2.5, regionMultiplier: { "Northern Nigeria": 0.8, "Southern Nigeria": 0.5, "Kenya Highlands": 1.5, "Kenya Coast": 0.3 }, cropMultiplier: { maize: 1.0, rice: 0.8, cassava: 0.6, tomatoes: 1.6 } },
  excess_rain: { baseRate: 4.0, regionMultiplier: { "Northern Nigeria": 0.6, "Southern Nigeria": 1.5, "Kenya Highlands": 1.0, "Kenya Coast": 1.4 }, cropMultiplier: { maize: 1.1, rice: 0.7, cassava: 0.8, tomatoes: 1.3 } },
};

function calculatePremium(type: string, cropType: string, region: string, farmSizeAcres: number, coveragePerAcre: number): { rate: number; premium: number; coverage: number } {
  const model = riskModels[type];
  if (!model) return { rate: 5, premium: farmSizeAcres * coveragePerAcre * 0.05, coverage: farmSizeAcres * coveragePerAcre };
  const regionMult = model.regionMultiplier[region] || 1.0;
  const cropMult = model.cropMultiplier[cropType] || 1.0;
  const rate = Math.round(model.baseRate * regionMult * cropMult * 10) / 10;
  const coverage = farmSizeAcres * coveragePerAcre;
  const premium = Math.round(coverage * (rate / 100));
  return { rate, premium, coverage };
}

function evaluateTrigger(policy: InsurancePolicy, currentValue: number): { triggered: boolean; payoutPercent: number; evidence: string } {
  const { threshold, operator } = policy.triggerCondition;
  let triggered = false;
  let severity = 0;

  if (operator === "less_than") {
    triggered = currentValue < threshold;
    severity = triggered ? Math.min(1, (threshold - currentValue) / threshold) : 0;
  } else if (operator === "greater_than") {
    triggered = currentValue > threshold;
    severity = triggered ? Math.min(1, (currentValue - threshold) / threshold) : 0;
  }

  const payoutPercent = triggered ? Math.min(100, Math.round(severity * 100 + 20)) : 0;
  const evidence = triggered ? `${policy.triggerCondition.metric} = ${currentValue} (threshold: ${operator} ${threshold})` : "Conditions not met";
  return { triggered, payoutPercent, evidence };
}

export const parametricInsuranceRouter = router({
  listPolicies: protectedProcedure
    .input(z.object({ farmerId: z.number().optional(), status: PolicyStatus.optional(), type: InsuranceType.optional() }).optional())
    .query(({ input }) => {
      let filtered = policies;
      if (input?.farmerId) filtered = filtered.filter(p => p.farmerId === input.farmerId);
      if (input?.status) filtered = filtered.filter(p => p.status === input.status);
      if (input?.type) filtered = filtered.filter(p => p.type === input.type);
      return filtered;
    }),

  getQuote: publicProcedure
    .input(z.object({ type: InsuranceType, cropType: z.string(), region: z.string(), farmSizeAcres: z.number().min(0.5), coveragePerAcre: z.number().default(100000) }))
    .query(({ input }) => {
      const quote = calculatePremium(input.type, input.cropType, input.region, input.farmSizeAcres, input.coveragePerAcre);
      return {
        ...quote, type: input.type, cropType: input.cropType, region: input.region,
        farmSizeAcres: input.farmSizeAcres, paymentOptions: [
          { frequency: "annual", amount: quote.premium, discount: 0 },
          { frequency: "seasonal", amount: Math.round(quote.premium / 2 * 1.03), discount: -3 },
          { frequency: "monthly", amount: Math.round(quote.premium / 6 * 1.05), discount: -5 },
        ],
      };
    }),

  purchasePolicy: protectedProcedure
    .input(z.object({ farmerId: z.number(), type: InsuranceType, cropType: z.string(), region: z.string(), farmSizeAcres: z.number(), coveragePerAcre: z.number().default(100000), paymentFrequency: z.enum(["annual", "seasonal", "monthly"]).default("annual") }))
    .mutation(({ input }) => {
      const quote = calculatePremium(input.type, input.cropType, input.region, input.farmSizeAcres, input.coveragePerAcre);
      const triggers: Record<string, { metric: string; threshold: number; operator: string; measurementPeriod: string }> = {
        drought: { metric: "rainfall_mm", threshold: 50, operator: "less_than", measurementPeriod: "30_days" },
        flood: { metric: "rainfall_mm", threshold: 300, operator: "greater_than", measurementPeriod: "7_days" },
        pest_outbreak: { metric: "pest_severity_index", threshold: 7, operator: "greater_than", measurementPeriod: "14_days" },
        frost: { metric: "temperature_celsius", threshold: 2, operator: "less_than", measurementPeriod: "3_days" },
        hail: { metric: "hail_damage_index", threshold: 5, operator: "greater_than", measurementPeriod: "1_day" },
        excess_rain: { metric: "rainfall_mm", threshold: 200, operator: "greater_than", measurementPeriod: "3_days" },
      };

      const policy: InsurancePolicy = {
        id: `PAR-INS-${String(policies.length + 1).padStart(3, "0")}`, farmerId: input.farmerId, type: input.type,
        cropType: input.cropType, farmSizeAcres: input.farmSizeAcres, coverageAmount: quote.coverage,
        premiumPaid: quote.premium, premiumRate: quote.rate,
        triggerCondition: triggers[input.type] || triggers.drought,
        status: "active", startDate: new Date().toISOString().split("T")[0],
        endDate: new Date(Date.now() + 180 * 86400000).toISOString().split("T")[0],
        region: input.region, payoutHistory: [],
      };
      policies.push(policy);
      logger.info("[ParametricInsurance] Policy purchased", { policyId: policy.id, type: input.type, coverage: quote.coverage });
      return { success: true, policy, quote };
    }),

  evaluateClaim: protectedProcedure
    .input(z.object({ policyId: z.string(), currentMetricValue: z.number(), triggerSource: PayoutTrigger, evidenceUrl: z.string().optional() }))
    .mutation(({ input }) => {
      const policy = policies.find(p => p.id === input.policyId);
      if (!policy) return { success: false, error: "Policy not found" };
      if (policy.status !== "active") return { success: false, error: "Policy not active" };

      const { triggered, payoutPercent, evidence } = evaluateTrigger(policy, input.currentMetricValue);
      if (!triggered) return { success: false, error: "Trigger conditions not met", currentValue: input.currentMetricValue, threshold: policy.triggerCondition.threshold };

      const payoutAmount = Math.round(policy.coverageAmount * (payoutPercent / 100));
      policy.payoutHistory.push({ date: new Date().toISOString(), amount: payoutAmount, trigger: input.triggerSource, evidence });
      if (payoutPercent >= 80) policy.status = "claimed";

      logger.info("[ParametricInsurance] Claim evaluated", { policyId: input.policyId, triggered, payoutAmount, payoutPercent });
      return { success: true, triggered, payoutAmount, payoutPercent, evidence, policyStatus: policy.status, disbursementETA: "24 hours (automatic)" };
    }),

  getRiskAssessment: publicProcedure
    .input(z.object({ region: z.string(), cropType: z.string() }))
    .query(({ input }) => {
      const risks = Object.entries(riskModels).map(([type, model]) => {
        const regionMult = model.regionMultiplier[input.region] || 1.0;
        const cropMult = model.cropMultiplier[input.cropType] || 1.0;
        const riskScore = Math.round(model.baseRate * regionMult * cropMult * 10) / 10;
        return { type, riskScore, riskLevel: riskScore > 8 ? "high" : riskScore > 5 ? "medium" : "low" };
      });
      return { region: input.region, cropType: input.cropType, risks: risks.sort((a, b) => b.riskScore - a.riskScore), overallRisk: risks.reduce((s, r) => s + r.riskScore, 0) / risks.length };
    }),

  getClaimHistory: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(({ input }) => {
      const farmerPolicies = policies.filter(p => p.farmerId === input.farmerId);
      const allClaims = farmerPolicies.flatMap(p => p.payoutHistory.map(h => ({ policyId: p.id, type: p.type, ...h })));
      const totalPaid = allClaims.reduce((s, c) => s + c.amount, 0);
      const totalPremiums = farmerPolicies.reduce((s, p) => s + p.premiumPaid, 0);
      return { claims: allClaims, totalPayouts: totalPaid, totalPremiumsPaid: totalPremiums, claimRatio: totalPremiums > 0 ? Math.round((totalPaid / totalPremiums) * 100) : 0 };
    }),
});
