/**
 * Comprehensive Farmer Features Router
 * Exposes all 10 strategic farmer features via tRPC endpoints
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base.js";
import { cropInsuranceService } from "../services/crop-insurance-service.js";
import { inputFinancingService } from "../services/input-financing-service.js";
import { harvestForecastingService } from "../services/harvest-forecasting-service.js";
import { pestDiseaseWarningService } from "../services/pest-disease-warning-service.js";
import { waterManagementService } from "../services/water-management-service.js";
import { carbonCreditService } from "../services/carbon-credit-service.js";
import { laborManagementService } from "../services/labor-management-service.js";
import { postHarvestService } from "../services/post-harvest-service.js";
import { voiceAdvisoryService } from "../services/voice-advisory-service.js";
import { knowledgeSharingService } from "../services/knowledge-sharing-service.js";

// ============= CROP INSURANCE ROUTER =============
export const cropInsuranceRouter = router({
  getQuote: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      farmId: z.number(),
      cropName: z.string(),
      fieldSize: z.number(),
      plantingDate: z.string(),
      expectedHarvestDate: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      coverageLevel: z.enum(['basic', 'standard', 'comprehensive']),
    }))
    .mutation(async ({ input }) => {
      return await cropInsuranceService.getQuote({
        farmerId: input.farmerId,
        farmId: input.farmId,
        cropType: input.cropName,
        policyType: input.coverageLevel === 'basic' ? 'weather_indexed' : input.coverageLevel === 'standard' ? 'yield_based' : 'revenue_protection',
        perils: ['drought', 'excess_rain', 'disease'],
        coverageAmount: Math.max(input.fieldSize * 250000, 100000),
        durationMonths: Math.max(1, Math.ceil((new Date(input.expectedHarvestDate).getTime() - new Date(input.plantingDate).getTime()) / (1000 * 60 * 60 * 24 * 30))),
        latitude: input.latitude,
        longitude: input.longitude,
      });
    }),

  createPolicy: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      farmId: z.number(),
      cropName: z.string(),
      fieldSize: z.number(),
      plantingDate: z.string(),
      expectedHarvestDate: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      coverageLevel: z.enum(['basic', 'standard', 'comprehensive']),
    }))
    .mutation(async ({ input }) => {
      const quote = await cropInsuranceService.getQuote({
        farmerId: input.farmerId,
        farmId: input.farmId,
        cropType: input.cropName,
        policyType: input.coverageLevel === 'basic' ? 'weather_indexed' : input.coverageLevel === 'standard' ? 'yield_based' : 'revenue_protection',
        perils: ['drought', 'excess_rain', 'disease'],
        coverageAmount: Math.max(input.fieldSize * 250000, 100000),
        durationMonths: Math.max(1, Math.ceil((new Date(input.expectedHarvestDate).getTime() - new Date(input.plantingDate).getTime()) / (1000 * 60 * 60 * 24 * 30))),
        latitude: input.latitude,
        longitude: input.longitude,
      });

      return await cropInsuranceService.createPolicy({
        farmerId: input.farmerId,
        farmId: input.farmId,
        quote,
        startDate: new Date(input.plantingDate),
      });
    }),

  getActivePolicies: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(async () => {
      return [];
    }),

  checkTriggers: protectedProcedure
    .input(z.object({ policyId: z.string() }))
    .mutation(async ({ input }) => {
      return await cropInsuranceService.checkTriggers(input.policyId);
    }),

  getPayoutHistory: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(async () => {
      return [];
    }),
});

// ============= INPUT FINANCING ROUTER =============
export const inputFinancingRouter = router({
  checkPreApproval: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      farmId: z.number(),
      requestedAmount: z.number(),
    }))
    .query(async ({ input }) => {
      return await inputFinancingService.checkPreApproval(input.farmerId);
    }),

  createCreditLine: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      farmId: z.number(),
      approvedAmount: z.number(),
      interestRate: z.number(),
      termMonths: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await inputFinancingService.createCreditLine({
        farmerId: input.farmerId,
        requestedAmount: input.approvedAmount,
        categories: ['seeds', 'fertilizers'],
      });
    }),

  requestDisbursement: protectedProcedure
    .input(z.object({
      creditLineId: z.string(),
      inputId: z.string(),
      quantity: z.number(),
      supplierId: z.string(),
      bulkGroupId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await inputFinancingService.requestDisbursement({
        creditLineId: input.creditLineId,
        supplierId: input.supplierId,
        items: [{ inputId: input.inputId, quantity: input.quantity }],
      });
    }),

  recordRepayment: protectedProcedure
    .input(z.object({
      creditLineId: z.string(),
      amount: z.number(),
      paymentMethod: z.string(),
    }))
    .mutation(async ({ input }) => {
      return await inputFinancingService.recordRepayment({
        creditLineId: input.creditLineId,
        amount: input.amount,
        source: 'manual',
      });
    }),

  getInputCatalog: protectedProcedure
    .input(z.object({ category: z.string().optional() }))
    .query(async ({ input }) => {
      return inputFinancingService.getInputCatalog(input.category as any);
    }),

  getSuppliers: protectedProcedure
    .input(z.object({ category: z.string().optional() }))
    .query(async ({ input }) => {
      return inputFinancingService.getSuppliers(input.category as any);
    }),

  joinBulkPurchase: protectedProcedure
    .input(z.object({
      groupId: z.string(),
      farmerId: z.number(),
      quantity: z.number(),
      inputId: z.string().default('seeds_maize_hybrid'),
    }))
    .mutation(async ({ input }) => {
      return await inputFinancingService.joinBulkPurchase({
        farmerId: input.farmerId,
        inputId: input.inputId,
        quantity: input.quantity,
      });
    }),
});

// ============= HARVEST FORECASTING ROUTER =============
export const harvestForecastingRouter = router({
  generateForecast: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      farmerId: z.number(),
      cropId: z.number().default(1),
      cropName: z.string(),
      fieldSize: z.number(),
      plantingDate: z.string(),
      latitude: z.number(),
      longitude: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await harvestForecastingService.generateHarvestForecast({
        farmerId: input.farmerId,
        farmId: input.farmId,
        cropId: input.cropId,
        cropName: input.cropName,
        fieldSize: input.fieldSize,
        plantingDate: new Date(input.plantingDate),
        latitude: input.latitude,
        longitude: input.longitude,
      });
    }),

  getPriceForecast: protectedProcedure
    .input(z.object({
      cropName: z.string(),
      region: z.string(),
      daysAhead: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await harvestForecastingService.getPriceForecast(input.cropName, input.daysAhead);
    }),

  findMarketOpportunities: protectedProcedure
    .input(z.object({
      farmerId: z.number().default(1),
      cropName: z.string(),
      quantity: z.number(),
      quality: z.string(),
      location: z.object({ latitude: z.number(), longitude: z.number() }),
      harvestDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await harvestForecastingService.findMarketOpportunities({
        farmerId: input.farmerId,
        cropName: input.cropName,
        quantity: input.quantity,
        harvestDate: input.harvestDate ? new Date(input.harvestDate) : new Date(),
        latitude: input.location.latitude,
        longitude: input.location.longitude,
      });
    }),

  getContractFarmingOffers: protectedProcedure
    .input(z.object({
      cropName: z.string().optional(),
      region: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await harvestForecastingService.getContractFarmingOffers(input.cropName);
    }),

  applyForContract: protectedProcedure
    .input(z.object({
      offerId: z.string(),
      farmerId: z.number(),
      farmId: z.number(),
      proposedQuantity: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await harvestForecastingService.applyForContract({
        farmerId: input.farmerId,
        contractId: input.offerId,
        farmId: input.farmId,
        proposedQuantity: input.proposedQuantity,
      });
    }),

  getSellingStrategy: protectedProcedure
    .input(z.object({
      cropName: z.string(),
      quantity: z.number(),
      currentPrice: z.number(),
      storageCapacity: z.number(),
      cashNeedUrgency: z.enum(['low', 'medium', 'high']),
      harvestDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await harvestForecastingService.getSellingStrategy({
        cropName: input.cropName,
        quantity: input.quantity,
        harvestDate: input.harvestDate ? new Date(input.harvestDate) : new Date(),
        storageAvailable: input.storageCapacity > 0,
        urgentCashNeed: input.cashNeedUrgency === 'high',
      });
    }),
});

// ============= PEST & DISEASE WARNING ROUTER =============
export const pestDiseaseRouter = router({
  getRegionalAlerts: protectedProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
      radiusKm: z.number(),
      crops: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      return await pestDiseaseWarningService.getRegionalAlerts(input);
    }),

  assessFarmRisk: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      farmerId: z.number(),
      crops: z.array(z.string()),
      latitude: z.number(),
      longitude: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await pestDiseaseWarningService.assessFarmRisk(input);
    }),

  reportOutbreak: protectedProcedure
    .input(z.object({
      reporterId: z.number(),
      farmId: z.number(),
      type: z.enum(['pest', 'disease']),
      suspectedName: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      affectedArea: z.number(),
      symptoms: z.array(z.string()),
      photos: z.array(z.string()),
      latitude: z.number(),
      longitude: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await pestDiseaseWarningService.reportOutbreak(input);
    }),

  getTreatmentRecommendations: protectedProcedure
    .input(z.object({
      type: z.enum(['pest', 'disease']),
      name: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      organicPreferred: z.boolean(),
    }))
    .query(async ({ input }) => {
      return pestDiseaseWarningService.getTreatmentRecommendations(input);
    }),

  getSpraySchedule: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      return await pestDiseaseWarningService.getSpraySchedule(input.farmId);
    }),
});

// ============= WATER MANAGEMENT ROUTER =============
export const waterManagementRouter = router({
  calculateWaterRequirements: protectedProcedure
    .input(z.object({
      cropName: z.string(),
      fieldSize: z.number(),
      growthStage: z.string(),
      latitude: z.number(),
      longitude: z.number(),
    }))
    .query(async ({ input }) => {
      return await waterManagementService.calculateWaterRequirements(input);
    }),

  generateIrrigationSchedule: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      cropId: z.number(),
      cropName: z.string(),
      fieldSize: z.number(),
      irrigationType: z.enum(['drip', 'sprinkler', 'flood', 'furrow', 'center_pivot', 'manual', 'rainfed']),
      latitude: z.number(),
      longitude: z.number(),
      daysAhead: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await waterManagementService.generateIrrigationSchedule(input);
    }),

  getRainwaterHarvestingPlan: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      roofArea: z.number(),
      latitude: z.number(),
      longitude: z.number(),
      irrigationNeeds: z.number(),
    }))
    .query(async ({ input }) => {
      return await waterManagementService.getRainwaterHarvestingPlan(input);
    }),

  getConservationTips: protectedProcedure
    .input(z.object({
      cropName: z.string().optional(),
      category: z.enum(['irrigation', 'harvesting', 'storage', 'efficiency']).optional(),
    }))
    .query(async ({ input }) => {
      return waterManagementService.getConservationTips(input);
    }),

  getSoilMoistureStatus: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      cropName: z.string(),
    }))
    .query(async ({ input }) => {
      return await waterManagementService.getSoilMoistureStatus(input);
    }),

  getCropWaterInfo: protectedProcedure
    .input(z.object({ cropName: z.string() }))
    .query(async ({ input }) => {
      return waterManagementService.getCropWaterInfo(input.cropName);
    }),

  getAllCropWaterRequirements: protectedProcedure
    .query(async () => {
      return waterManagementService.getAllCropWaterRequirements();
    }),
});

// ============= CARBON CREDIT ROUTER =============
export const carbonCreditRouter = router({
  calculateCarbonFootprint: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      farmerId: z.number(),
      farmSize: z.number(),
      crops: z.array(z.string()),
      practices: z.array(z.string()),
      inputs: z.object({
        dieselLiters: z.number(),
        electricityKwh: z.number(),
        ureaKg: z.number(),
        npkKg: z.number(),
        manureKg: z.number(),
        cattleHeads: z.number(),
        transportTonKm: z.number(),
      }),
      treeCount: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await carbonCreditService.calculateCarbonFootprint(input as any);
    }),

  getSustainabilityScore: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      practices: z.array(z.string()),
      certifications: z.array(z.string()),
    }))
    .query(async ({ input }) => {
      return await carbonCreditService.getSustainabilityScore(input as any);
    }),

  generateCarbonCredits: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      farmerId: z.number(),
      sequestrationAmount: z.number(),
      verificationStandard: z.string(),
      projectType: z.string(),
    }))
    .mutation(async ({ input }) => {
      return await carbonCreditService.generateCarbonCredits(input);
    }),

  getEnvironmentalImpactReport: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      farmerId: z.number(),
      farmSize: z.number(),
      practices: z.array(z.string()),
      waterUsage: z.number(),
      pesticideUsage: z.number(),
      fertilizerUsage: z.number(),
      treeCount: z.number(),
    }))
    .query(async ({ input }) => {
      return await carbonCreditService.getEnvironmentalImpactReport(input as any);
    }),

  getCertificationRoadmap: protectedProcedure
    .input(z.object({
      certType: z.enum(['organic', 'fair_trade', 'rainforest_alliance', 'utz', 'global_gap', 'carbon_neutral']),
      currentPractices: z.array(z.string()),
    }))
    .query(async ({ input }) => {
      return carbonCreditService.getCertificationRoadmap(input.certType, input.currentPractices as any);
    }),

  getFarmCarbonCredits: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      return await carbonCreditService.getFarmCarbonCredits(input.farmId);
    }),

  getAvailablePractices: protectedProcedure
    .query(async () => {
      return carbonCreditService.getAvailablePractices();
    }),
});

// ============= LABOR MANAGEMENT ROUTER =============
export const laborManagementRouter = router({
  registerWorker: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      firstName: z.string(),
      lastName: z.string(),
      phone: z.string(),
      workerType: z.enum(['permanent', 'seasonal', 'casual', 'contract']),
      skills: z.array(z.string()),
      dailyRate: z.number(),
      startDate: z.string(),
      endDate: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await laborManagementService.registerWorker({
        ...input,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });
    }),

  createTask: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      name: z.string(),
      description: z.string(),
      category: z.enum(['land_preparation', 'planting', 'weeding', 'fertilizing', 'spraying', 'irrigation', 'harvesting', 'post_harvest', 'maintenance', 'livestock', 'general']),
      priority: z.enum(['low', 'medium', 'high', 'urgent']),
      scheduledDate: z.string(),
      dueDate: z.string(),
      estimatedHours: z.number(),
      location: z.string().optional(),
      equipment: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      return await laborManagementService.createTask({
        ...input,
        scheduledDate: new Date(input.scheduledDate),
        dueDate: new Date(input.dueDate),
      });
    }),

  assignWorkersToTask: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      workerIds: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      return await laborManagementService.assignWorkersToTask(input.taskId, input.workerIds);
    }),

  completeTask: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      completedBy: z.string(),
      actualHours: z.number(),
      qualityScore: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await laborManagementService.completeTask(input);
    }),

  generateWeekSchedule: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      weekStartDate: z.string(),
      tasks: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      return await laborManagementService.generateWeekSchedule({
        ...input,
        weekStartDate: new Date(input.weekStartDate),
      });
    }),

  checkInWorker: protectedProcedure
    .input(z.object({ shiftId: z.string() }))
    .mutation(async ({ input }) => {
      return await laborManagementService.checkInWorker(input.shiftId);
    }),

  checkOutWorker: protectedProcedure
    .input(z.object({ shiftId: z.string() }))
    .mutation(async ({ input }) => {
      return await laborManagementService.checkOutWorker(input.shiftId);
    }),

  generatePayroll: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      periodStart: z.string(),
      periodEnd: z.string(),
    }))
    .mutation(async ({ input }) => {
      return await laborManagementService.generatePayroll({
        farmId: input.farmId,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
      });
    }),

  processPayrollPayment: protectedProcedure
    .input(z.object({ payrollId: z.string() }))
    .mutation(async ({ input }) => {
      return await laborManagementService.processPayrollPayment(input.payrollId);
    }),

  getTrainingModules: protectedProcedure
    .input(z.object({ category: z.string().optional() }))
    .query(async ({ input }) => {
      return laborManagementService.getTrainingModules(input.category);
    }),

  startTraining: protectedProcedure
    .input(z.object({
      workerId: z.string(),
      moduleId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return await laborManagementService.startTraining(input.workerId, input.moduleId);
    }),

  completeTraining: protectedProcedure
    .input(z.object({
      workerId: z.string(),
      moduleId: z.string(),
      score: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await laborManagementService.completeTraining(input.workerId, input.moduleId, input.score);
    }),

  generateProductivityReport: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      periodStart: z.string(),
      periodEnd: z.string(),
      farmSize: z.number(),
    }))
    .query(async ({ input }) => {
      return await laborManagementService.generateProductivityReport({
        farmId: input.farmId,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        farmSize: input.farmSize,
      });
    }),

  getFarmWorkers: protectedProcedure
    .input(z.object({ farmId: z.number() }))
    .query(async ({ input }) => {
      return laborManagementService.getFarmWorkers(input.farmId);
    }),

  getFarmTasks: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      status: z.enum(['pending', 'assigned', 'in_progress', 'completed', 'cancelled']).optional(),
    }))
    .query(async ({ input }) => {
      return laborManagementService.getFarmTasks(input.farmId, input.status);
    }),
});

// ============= POST-HARVEST ROUTER =============
export const postHarvestRouter = router({
  findStorageFacilities: protectedProcedure
    .input(z.object({
      cropCategory: z.enum(['grains', 'tubers', 'fruits', 'vegetables', 'legumes', 'oilseeds']),
      quantity: z.number(),
      latitude: z.number(),
      longitude: z.number(),
      radiusKm: z.number(),
      requiresColdStorage: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      return await postHarvestService.findStorageFacilities(input);
    }),

  bookStorage: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      facilityId: z.string(),
      cropName: z.string(),
      quantity: z.number(),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .mutation(async ({ input }) => {
      return await postHarvestService.bookStorage({
        ...input,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      });
    }),

  performQualityAssessment: protectedProcedure
    .input(z.object({
      cropName: z.string(),
      moistureContent: z.number(),
      foreignMatter: z.number(),
      damagedGrains: z.number(),
      discoloration: z.number(),
      pestInfestation: z.boolean(),
      moldPresence: z.boolean(),
      photos: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      return await postHarvestService.performQualityAssessment(input);
    }),

  findColdChainProviders: protectedProcedure
    .input(z.object({
      pickupLocation: z.string(),
      deliveryLocation: z.string(),
      quantity: z.number(),
      temperatureRequired: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await postHarvestService.findColdChainProviders(input);
    }),

  bookLogistics: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      providerId: z.string(),
      cropName: z.string(),
      quantity: z.number(),
      pickupLocation: z.object({
        latitude: z.number(),
        longitude: z.number(),
        address: z.string(),
      }),
      deliveryLocation: z.object({
        latitude: z.number(),
        longitude: z.number(),
        address: z.string(),
      }),
      pickupDate: z.string(),
      temperatureRequired: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await postHarvestService.bookLogistics({
        ...input,
        pickupDate: new Date(input.pickupDate),
      });
    }),

  getPackagingRecommendations: protectedProcedure
    .input(z.object({ cropName: z.string() }))
    .query(async ({ input }) => {
      return postHarvestService.getPackagingRecommendations(input.cropName);
    }),

  assessLosses: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      cropName: z.string(),
      harvestQuantity: z.number(),
      currentQuantity: z.number(),
      stages: z.array(z.object({
        stage: z.enum(['harvesting', 'handling', 'transport', 'storage', 'processing']),
        lossPercentage: z.number(),
        cause: z.string(),
      })),
      pricePerUnit: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await postHarvestService.assessLosses(input);
    }),

  getLossReductionTips: protectedProcedure
    .input(z.object({
      cropCategory: z.enum(['grains', 'tubers', 'fruits', 'vegetables', 'legumes', 'oilseeds']),
    }))
    .query(async ({ input }) => {
      return postHarvestService.getLossReductionTips(input.cropCategory);
    }),

  getFarmerBookings: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(async ({ input }) => {
      return postHarvestService.getFarmerBookings(input.farmerId);
    }),

  getAllStorageFacilities: protectedProcedure
    .query(async () => {
      return postHarvestService.getAllStorageFacilities();
    }),

  getAllColdChainProviders: protectedProcedure
    .query(async () => {
      return postHarvestService.getAllColdChainProviders();
    }),
});

// ============= VOICE ADVISORY ROUTER =============
export const voiceAdvisoryRouter = router({
  getIVRMenu: protectedProcedure
    .input(z.object({
      language: z.enum(['english', 'yoruba', 'hausa', 'igbo', 'pidgin', 'fulfulde', 'kanuri', 'tiv']),
    }))
    .query(async ({ input }) => {
      return voiceAdvisoryService.getIVRMenu(input.language);
    }),

  getSupportedLanguages: protectedProcedure
    .query(async () => {
      return voiceAdvisoryService.getSupportedLanguages();
    }),

  createAdvisory: protectedProcedure
    .input(z.object({
      category: z.enum(['weather', 'pest_alert', 'market_prices', 'planting_tips', 'harvesting_tips', 'storage_tips', 'livestock', 'finance', 'general']),
      title: z.string(),
      content: z.string(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']),
      validDays: z.number(),
      targetCrops: z.array(z.string()).optional(),
      targetRegions: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      return await voiceAdvisoryService.createAdvisory(input);
    }),

  getAdvisoriesForFarmer: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      crops: z.array(z.string()),
      region: z.string(),
      language: z.enum(['english', 'yoruba', 'hausa', 'igbo', 'pidgin', 'fulfulde', 'kanuri', 'tiv']),
      category: z.enum(['weather', 'pest_alert', 'market_prices', 'planting_tips', 'harvesting_tips', 'storage_tips', 'livestock', 'finance', 'general']).optional(),
    }))
    .query(async ({ input }) => {
      return await voiceAdvisoryService.getAdvisoriesForFarmer(input);
    }),

  startCall: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      farmerPhone: z.string(),
      language: z.enum(['english', 'yoruba', 'hausa', 'igbo', 'pidgin', 'fulfulde', 'kanuri', 'tiv']),
    }))
    .mutation(async ({ input }) => {
      return await voiceAdvisoryService.startCall(input);
    }),

  endCall: protectedProcedure
    .input(z.object({ callId: z.string() }))
    .mutation(async ({ input }) => {
      return await voiceAdvisoryService.endCall(input.callId);
    }),

  requestCallback: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      farmerPhone: z.string(),
      farmerName: z.string(),
      language: z.enum(['english', 'yoruba', 'hausa', 'igbo', 'pidgin', 'fulfulde', 'kanuri', 'tiv']),
      topic: z.string(),
      urgency: z.enum(['low', 'medium', 'high']),
      voiceMessageUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await voiceAdvisoryService.requestCallback(input);
    }),

  sendSMSAlert: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      phone: z.string(),
      message: z.string(),
      language: z.enum(['english', 'yoruba', 'hausa', 'igbo', 'pidgin', 'fulfulde', 'kanuri', 'tiv']),
      category: z.enum(['weather', 'pest_alert', 'market_prices', 'planting_tips', 'harvesting_tips', 'storage_tips', 'livestock', 'finance', 'general']),
    }))
    .mutation(async ({ input }) => {
      return await voiceAdvisoryService.sendSMSAlert(input);
    }),

  setFarmerPreferences: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      preferredLanguage: z.enum(['english', 'yoruba', 'hausa', 'igbo', 'pidgin', 'fulfulde', 'kanuri', 'tiv']),
      preferredCallTime: z.string(),
      subscribedCategories: z.array(z.enum(['weather', 'pest_alert', 'market_prices', 'planting_tips', 'harvesting_tips', 'storage_tips', 'livestock', 'finance', 'general'])),
      crops: z.array(z.string()),
      region: z.string(),
      smsEnabled: z.boolean(),
      voiceEnabled: z.boolean(),
      weeklyDigestEnabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      return await voiceAdvisoryService.setFarmerPreferences(input);
    }),

  generateWeatherAdvisory: protectedProcedure
    .input(z.object({
      latitude: z.number(),
      longitude: z.number(),
      language: z.enum(['english', 'yoruba', 'hausa', 'igbo', 'pidgin', 'fulfulde', 'kanuri', 'tiv']),
    }))
    .query(async ({ input }) => {
      return await voiceAdvisoryService.generateWeatherAdvisory(input);
    }),

  generateMarketPriceAdvisory: protectedProcedure
    .input(z.object({
      crops: z.array(z.string()),
      region: z.string(),
      language: z.enum(['english', 'yoruba', 'hausa', 'igbo', 'pidgin', 'fulfulde', 'kanuri', 'tiv']),
    }))
    .query(async ({ input }) => {
      return await voiceAdvisoryService.generateMarketPriceAdvisory(input);
    }),

  getPendingCallbacks: protectedProcedure
    .query(async () => {
      return voiceAdvisoryService.getPendingCallbacks();
    }),

  getCallStatistics: protectedProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      return voiceAdvisoryService.getCallStatistics({
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      });
    }),

  getActiveAdvisories: protectedProcedure
    .query(async () => {
      return voiceAdvisoryService.getActiveAdvisories();
    }),
});

// ============= KNOWLEDGE SHARING ROUTER =============
export const knowledgeSharingRouter = router({
  createPost: protectedProcedure
    .input(z.object({
      authorId: z.number(),
      authorName: z.string(),
      type: z.enum(['question', 'answer', 'tip', 'success_story', 'tutorial', 'discussion']),
      title: z.string(),
      content: z.string(),
      category: z.enum(['crop_farming', 'livestock', 'pest_disease', 'market_prices', 'equipment', 'finance', 'weather', 'storage', 'organic_farming', 'irrigation', 'general']),
      tags: z.array(z.string()),
      images: z.array(z.string()).optional(),
      videos: z.array(z.string()).optional(),
      location: z.object({ state: z.string(), lga: z.string() }).optional(),
      crops: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      return await knowledgeSharingService.createPost(input);
    }),

  getPosts: protectedProcedure
    .input(z.object({
      category: z.enum(['crop_farming', 'livestock', 'pest_disease', 'market_prices', 'equipment', 'finance', 'weather', 'storage', 'organic_farming', 'irrigation', 'general']).optional(),
      type: z.enum(['question', 'answer', 'tip', 'success_story', 'tutorial', 'discussion']).optional(),
      tags: z.array(z.string()).optional(),
      crops: z.array(z.string()).optional(),
      state: z.string().optional(),
      sortBy: z.enum(['recent', 'popular', 'unanswered']).optional(),
      page: z.number().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await knowledgeSharingService.getPosts(input);
    }),

  addComment: protectedProcedure
    .input(z.object({
      postId: z.string(),
      parentId: z.string().optional(),
      authorId: z.number(),
      authorName: z.string(),
      content: z.string(),
      images: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      return await knowledgeSharingService.addComment(input);
    }),

  vote: protectedProcedure
    .input(z.object({
      targetId: z.string(),
      targetType: z.enum(['post', 'comment']),
      voterId: z.number(),
      voteType: z.enum(['up', 'down']),
    }))
    .mutation(async ({ input }) => {
      return await knowledgeSharingService.vote(input);
    }),

  acceptAnswer: protectedProcedure
    .input(z.object({
      postId: z.string(),
      commentId: z.string(),
      acceptorId: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await knowledgeSharingService.acceptAnswer(input.postId, input.commentId, input.acceptorId);
    }),

  createSuccessStory: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      farmerName: z.string(),
      farmerPhoto: z.string().optional(),
      title: z.string(),
      summary: z.string(),
      fullStory: z.string(),
      challenge: z.string(),
      solution: z.string(),
      results: z.array(z.object({
        metric: z.string(),
        before: z.string(),
        after: z.string(),
        improvement: z.string(),
      })),
      crops: z.array(z.string()),
      location: z.object({ state: z.string(), lga: z.string() }),
      farmSize: z.number(),
      images: z.array(z.string()),
      videoUrl: z.string().optional(),
      practicesUsed: z.array(z.string()),
      lessonsLearned: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      return await knowledgeSharingService.createSuccessStory(input);
    }),

  getSuccessStories: protectedProcedure
    .input(z.object({
      crops: z.array(z.string()).optional(),
      state: z.string().optional(),
      featured: z.boolean().optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return await knowledgeSharingService.getSuccessStories(input);
    }),

  getExperts: protectedProcedure
    .input(z.object({
      specialization: z.string().optional(),
      language: z.string().optional(),
      available: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      return await knowledgeSharingService.getExperts(input);
    }),

  bookExpertSession: protectedProcedure
    .input(z.object({
      expertId: z.string(),
      farmerId: z.number(),
      topic: z.string(),
      description: z.string(),
      sessionType: z.enum(['text', 'voice', 'video']),
      scheduledAt: z.string(),
      duration: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await knowledgeSharingService.bookExpertSession({
        ...input,
        scheduledAt: new Date(input.scheduledAt),
      });
    }),

  upsertFarmerProfile: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      displayName: z.string(),
      avatar: z.string().optional(),
      bio: z.string().optional(),
      location: z.object({ state: z.string(), lga: z.string() }),
      farmSize: z.number(),
      crops: z.array(z.string()),
      yearsExperience: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await knowledgeSharingService.upsertFarmerProfile(input);
    }),

  getFarmerProfile: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(async ({ input }) => {
      return knowledgeSharingService.getFarmerProfile(input.farmerId);
    }),

  getLeaderboard: protectedProcedure
    .input(z.object({
      period: z.enum(['week', 'month', 'all']).optional(),
      category: z.enum(['points', 'answers', 'helpful']).optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return knowledgeSharingService.getLeaderboard(input);
    }),

  getLearningPaths: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    }))
    .query(async ({ input }) => {
      return knowledgeSharingService.getLearningPaths(input);
    }),

  enrollInPath: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      pathId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return await knowledgeSharingService.enrollInPath(input.farmerId, input.pathId);
    }),

  completeModule: protectedProcedure
    .input(z.object({
      farmerId: z.number(),
      pathId: z.string(),
      moduleId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return await knowledgeSharingService.completeModule(input.farmerId, input.pathId, input.moduleId);
    }),

  getFarmerProgress: protectedProcedure
    .input(z.object({ farmerId: z.number() }))
    .query(async ({ input }) => {
      return knowledgeSharingService.getFarmerProgress(input.farmerId);
    }),

  searchPosts: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      return await knowledgeSharingService.searchPosts(input.query);
    }),

  getTrendingTopics: protectedProcedure
    .input(z.object({ limit: z.number().optional() }))
    .query(async ({ input }) => {
      return knowledgeSharingService.getTrendingTopics(input.limit);
    }),

  getCategories: protectedProcedure
    .query(async () => {
      return knowledgeSharingService.getCategories();
    }),

  getAvailableBadges: protectedProcedure
    .query(async () => {
      return knowledgeSharingService.getAvailableBadges();
    }),
});

// ============= COMBINED FARMER FEATURES ROUTER =============
export const farmerFeaturesRouter = router({
  cropInsurance: cropInsuranceRouter,
  inputFinancing: inputFinancingRouter,
  harvestForecasting: harvestForecastingRouter,
  pestDisease: pestDiseaseRouter,
  waterManagement: waterManagementRouter,
  carbonCredit: carbonCreditRouter,
  laborManagement: laborManagementRouter,
  postHarvest: postHarvestRouter,
  voiceAdvisory: voiceAdvisoryRouter,
  knowledgeSharing: knowledgeSharingRouter,
});
