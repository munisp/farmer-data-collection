import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc-base.js";
import { logger } from "../logger.js";

const ProgramStatus = z.enum(["active", "completed", "suspended", "pending"]);
const RegistryType = z.enum(["BVN", "NIN", "NIIMS", "farmer_registry"]);

interface GovernmentProgram {
  id: string; name: string; ministry: string; country: string; type: string;
  budget: number; disbursed: number; beneficiaries: number; targetBeneficiaries: number;
  status: string; startDate: string; endDate: string; eligibilityCriteria: string[];
  regions: string[];
}

interface FarmerRegistration {
  id: string; farmerId: number; registryType: string; registryId: string;
  verified: boolean; verifiedAt: string | null; data: Record<string, any>;
}

const programs: GovernmentProgram[] = [
  { id: "GOV-001", name: "Anchor Borrowers Programme", ministry: "CBN", country: "Nigeria", type: "credit", budget: 500000000000, disbursed: 380000000000, beneficiaries: 4200000, targetBeneficiaries: 5000000, status: "active", startDate: "2015-11-01", endDate: "2026-12-31", eligibilityCriteria: ["Nigerian citizen", "Active farmer", "Minimum 1 hectare", "Valid BVN"], regions: ["Nationwide"] },
  { id: "GOV-002", name: "Presidential Fertilizer Initiative", ministry: "FMARD", country: "Nigeria", type: "input_subsidy", budget: 120000000000, disbursed: 95000000000, beneficiaries: 12000000, targetBeneficiaries: 15000000, status: "active", startDate: "2017-01-01", endDate: "2026-12-31", eligibilityCriteria: ["Nigerian farmer", "Registered with ADP", "Valid ID"], regions: ["Nationwide"] },
  { id: "GOV-003", name: "Kenya Fertilizer Subsidy Programme", ministry: "MoALF", country: "Kenya", type: "input_subsidy", budget: 8000000000, disbursed: 6200000000, beneficiaries: 2800000, targetBeneficiaries: 3500000, status: "active", startDate: "2020-01-01", endDate: "2026-06-30", eligibilityCriteria: ["Kenyan citizen", "NIIMS registered", "Farm size ≤ 5 acres"], regions: ["Rift Valley", "Western", "Central", "Eastern"] },
  { id: "GOV-004", name: "Youth in Agribusiness", ministry: "NDE", country: "Nigeria", type: "grant", budget: 50000000000, disbursed: 28000000000, beneficiaries: 150000, targetBeneficiaries: 500000, status: "active", startDate: "2023-01-01", endDate: "2027-12-31", eligibilityCriteria: ["Age 18-35", "Business plan required", "Agricultural focus", "NIN verified"], regions: ["Nationwide"] },
];

const registrations: FarmerRegistration[] = [
  { id: "REG-001", farmerId: 1001, registryType: "BVN", registryId: "22012345678", verified: true, verifiedAt: "2026-01-15T00:00:00Z", data: { firstName: "Adamu", lastName: "Ibrahim", state: "Ogun" } },
  { id: "REG-002", farmerId: 1001, registryType: "farmer_registry", registryId: "FR-OG-2024-001", verified: true, verifiedAt: "2026-02-01T00:00:00Z", data: { farmSize: 5, crops: ["maize", "cassava"], lga: "Abeokuta South" } },
  { id: "REG-003", farmerId: 1002, registryType: "NIN", registryId: "10023456789", verified: true, verifiedAt: "2026-01-20T00:00:00Z", data: { firstName: "Grace", lastName: "Okonkwo", state: "Kano" } },
];

const impactReports = [
  { programId: "GOV-001", period: "2025-Q4", metrics: { loansDisbursed: 45000, totalAmount: 12500000000, repaymentRate: 78, yieldIncrease: 35, jobsCreated: 12000, womenBeneficiaries: 40 }, sdgAlignment: ["SDG1", "SDG2", "SDG8"] },
  { programId: "GOV-002", period: "2026-Q1", metrics: { bagsDistributed: 2500000, farmersReached: 1200000, costSaving: 40, yieldIncrease: 25, coveragePercent: 80 }, sdgAlignment: ["SDG2", "SDG12"] },
];

export const governmentIntegrationRouter = router({
  listPrograms: publicProcedure
    .input(z.object({ country: z.string().optional(), type: z.string().optional(), status: ProgramStatus.optional() }).optional())
    .query(({ input }) => {
      let filtered = programs;
      if (input?.country) filtered = filtered.filter(p => p.country === input.country);
      if (input?.type) filtered = filtered.filter(p => p.type === input.type);
      if (input?.status) filtered = filtered.filter(p => p.status === input.status);
      return filtered.map(p => ({ ...p, disbursementRate: Math.round((p.disbursed / p.budget) * 100), enrollmentRate: Math.round((p.beneficiaries / p.targetBeneficiaries) * 100) }));
    }),

  checkEligibility: protectedProcedure
    .input(z.object({ farmerId: z.number(), programId: z.string() }))
    .query(({ input }) => {
      const program = programs.find(p => p.id === input.programId);
      if (!program) return { eligible: false, reason: "Program not found" };
      const farmerRegs = registrations.filter(r => r.farmerId === input.farmerId);
      const hasBVN = farmerRegs.some(r => r.registryType === "BVN" && r.verified);
      const hasNIN = farmerRegs.some(r => r.registryType === "NIN" && r.verified);
      const hasFarmerReg = farmerRegs.some(r => r.registryType === "farmer_registry" && r.verified);

      const checks = [
        { criterion: "Valid BVN", met: hasBVN, required: program.eligibilityCriteria.some(c => c.includes("BVN")) },
        { criterion: "Valid NIN", met: hasNIN, required: program.eligibilityCriteria.some(c => c.includes("NIN")) },
        { criterion: "Farmer registry", met: hasFarmerReg, required: program.eligibilityCriteria.some(c => c.includes("Registered")) },
        { criterion: "Active program", met: program.status === "active", required: true },
      ];

      const failedRequired = checks.filter(c => c.required && !c.met);
      return { eligible: failedRequired.length === 0, checks, failedCriteria: failedRequired.map(c => c.criterion), program: { name: program.name, type: program.type } };
    }),

  enrollInProgram: protectedProcedure
    .input(z.object({ farmerId: z.number(), programId: z.string(), additionalData: z.record(z.string(), z.any()).optional() }))
    .mutation(({ input }) => {
      const program = programs.find(p => p.id === input.programId);
      if (!program) return { success: false, error: "Program not found" };
      if (program.beneficiaries >= program.targetBeneficiaries) return { success: false, error: "Program fully subscribed" };
      program.beneficiaries++;
      logger.info("[GovIntegration] Farmer enrolled", { farmerId: input.farmerId, programId: input.programId });
      return { success: true, enrollmentId: `ENR-${Date.now()}`, program: program.name, expectedBenefit: program.type === "credit" ? "Loan at 9% interest" : program.type === "input_subsidy" ? "50% off fertilizer" : "Grant disbursement" };
    }),

  syncWithRegistry: protectedProcedure
    .input(z.object({ farmerId: z.number(), registryType: RegistryType, registryId: z.string() }))
    .mutation(({ input }) => {
      const existing = registrations.find(r => r.farmerId === input.farmerId && r.registryType === input.registryType);
      if (existing) return { success: true, status: "already_registered", registration: existing };

      const reg: FarmerRegistration = {
        id: `REG-${String(registrations.length + 1).padStart(3, "0")}`, farmerId: input.farmerId,
        registryType: input.registryType, registryId: input.registryId, verified: false, verifiedAt: null, data: {},
      };
      registrations.push(reg);
      logger.info("[GovIntegration] Registry sync initiated", { farmerId: input.farmerId, registryType: input.registryType });
      return { success: true, status: "verification_pending", registration: reg, estimatedVerification: "24-48 hours" };
    }),

  getImpactReport: protectedProcedure
    .input(z.object({ programId: z.string().optional(), period: z.string().optional() }))
    .query(({ input }) => {
      let filtered = impactReports;
      if (input?.programId) filtered = filtered.filter(r => r.programId === input.programId);
      if (input?.period) filtered = filtered.filter(r => r.period === input.period);
      return filtered;
    }),

  exportFarmerData: protectedProcedure
    .input(z.object({ farmerId: z.number(), format: z.enum(["csv", "json", "xml"]), includeFields: z.array(z.string()).optional() }))
    .query(({ input }) => {
      const farmerRegs = registrations.filter(r => r.farmerId === input.farmerId);
      return { farmerId: input.farmerId, format: input.format, registrations: farmerRegs, exportedAt: new Date().toISOString(), recordCount: farmerRegs.length, complianceNote: "Data exported per NDPR/Data Protection Act requirements" };
    }),
});
