/**
 * Crop Insurance Service
 * Integrates with weather service, satellite imagery, and TigerBeetle for payments
 * Supports parametric/weather-indexed insurance with automatic payouts
 */

import { db } from "../db.js";
import { BoundedMap } from "../cache/bounded-map.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { weatherService } from "./weather-service.js";
import { satelliteImageryService } from "./satellite-imagery-service.js";
import { createTigerBeetleLedger, TigerBeetleLedger } from "./tigerbeetle-ledger.js";
import { createTemporalService, TemporalWorkflowService } from "./temporal-workflow-service.js";
import { publishEvent, createEvent } from "../kafka.js";
import { logger } from '../logger.js';

let tigerBeetleLedger: TigerBeetleLedger | null = null;
let temporalWorkflowService: TemporalWorkflowService | null = null;

async function getTigerBeetleLedger(): Promise<TigerBeetleLedger | null> {
  if (!tigerBeetleLedger) {
    try {
      tigerBeetleLedger = createTigerBeetleLedger();
    } catch (error) {
      logger.warn('[Insurance] TigerBeetle not available:', error);
    }
  }
  return tigerBeetleLedger;
}

async function getTemporalService(): Promise<TemporalWorkflowService | null> {
  if (!temporalWorkflowService) {
    try {
      temporalWorkflowService = createTemporalService();
    } catch (error) {
      logger.warn('[Insurance] Temporal not available:', error);
    }
  }
  return temporalWorkflowService;
}

// Insurance policy types
export type InsurancePolicyType = 
  | 'weather_indexed' 
  | 'yield_based' 
  | 'area_yield' 
  | 'revenue_protection'
  | 'livestock_mortality';

export type InsurancePeril = 
  | 'drought' 
  | 'flood' 
  | 'frost' 
  | 'hail' 
  | 'pest_outbreak' 
  | 'disease'
  | 'excess_rain'
  | 'heat_stress';

export interface InsurancePolicy {
  id: string;
  farmerId: number;
  farmId: number;
  cropId?: number;
  policyType: InsurancePolicyType;
  perils: InsurancePeril[];
  coverageAmount: number;
  premium: number;
  deductible: number;
  startDate: Date;
  endDate: Date;
  status: 'active' | 'expired' | 'claimed' | 'cancelled';
  triggers: InsuranceTrigger[];
  payoutHistory: InsurancePayout[];
  createdAt: Date;
  updatedAt: Date;
}

export interface InsuranceTrigger {
  peril: InsurancePeril;
  metric: string;
  threshold: number;
  operator: 'lt' | 'gt' | 'lte' | 'gte';
  payoutPercentage: number;
  measurementPeriodDays: number;
}

export interface InsurancePayout {
  id: string;
  policyId: string;
  triggeredBy: InsurancePeril;
  amount: number;
  status: 'pending' | 'approved' | 'disbursed' | 'rejected';
  triggerData: Record<string, unknown>;
  disbursedAt?: Date;
  transactionId?: string;
}

export interface InsuranceQuote {
  policyType: InsurancePolicyType;
  perils: InsurancePeril[];
  coverageAmount: number;
  premium: number;
  premiumBreakdown: {
    basePremium: number;
    riskAdjustment: number;
    adminFee: number;
    tax: number;
  };
  deductible: number;
  triggers: InsuranceTrigger[];
  validUntil: Date;
}

// Risk factors by region (simplified - would come from actuarial data)
const REGIONAL_RISK_FACTORS: Record<string, Record<InsurancePeril, number>> = {
  'nigeria_north': { drought: 1.5, flood: 0.8, frost: 0.1, hail: 0.3, pest_outbreak: 1.2, disease: 1.0, excess_rain: 0.6, heat_stress: 1.4 },
  'nigeria_south': { drought: 0.7, flood: 1.4, frost: 0.0, hail: 0.2, pest_outbreak: 1.1, disease: 1.2, excess_rain: 1.3, heat_stress: 0.8 },
  'kenya_highlands': { drought: 0.9, flood: 0.6, frost: 0.5, hail: 0.4, pest_outbreak: 0.8, disease: 0.9, excess_rain: 0.7, heat_stress: 0.6 },
  'ghana_coastal': { drought: 0.6, flood: 1.2, frost: 0.0, hail: 0.1, pest_outbreak: 1.0, disease: 1.1, excess_rain: 1.2, heat_stress: 0.9 },
  'default': { drought: 1.0, flood: 1.0, frost: 0.3, hail: 0.3, pest_outbreak: 1.0, disease: 1.0, excess_rain: 1.0, heat_stress: 1.0 },
};

// Crop-specific risk multipliers
const CROP_RISK_MULTIPLIERS: Record<string, number> = {
  'maize': 1.0,
  'rice': 1.1,
  'cassava': 0.8,
  'palm_oil': 0.9,
  'cocoa': 1.2,
  'coffee': 1.1,
  'tomato': 1.4,
  'pepper': 1.3,
  'yam': 0.9,
  'groundnut': 1.0,
  'default': 1.0,
};

// Default triggers for each peril
const DEFAULT_TRIGGERS: Record<InsurancePeril, InsuranceTrigger> = {
  drought: {
    peril: 'drought',
    metric: 'rainfall_mm',
    threshold: 50,
    operator: 'lt',
    payoutPercentage: 80,
    measurementPeriodDays: 30,
  },
  flood: {
    peril: 'flood',
    metric: 'rainfall_mm',
    threshold: 300,
    operator: 'gt',
    payoutPercentage: 90,
    measurementPeriodDays: 7,
  },
  frost: {
    peril: 'frost',
    metric: 'temperature_min_c',
    threshold: 2,
    operator: 'lt',
    payoutPercentage: 70,
    measurementPeriodDays: 1,
  },
  hail: {
    peril: 'hail',
    metric: 'hail_probability',
    threshold: 0.8,
    operator: 'gt',
    payoutPercentage: 85,
    measurementPeriodDays: 1,
  },
  pest_outbreak: {
    peril: 'pest_outbreak',
    metric: 'pest_risk_index',
    threshold: 0.7,
    operator: 'gt',
    payoutPercentage: 60,
    measurementPeriodDays: 14,
  },
  disease: {
    peril: 'disease',
    metric: 'disease_risk_index',
    threshold: 0.7,
    operator: 'gt',
    payoutPercentage: 65,
    measurementPeriodDays: 14,
  },
  excess_rain: {
    peril: 'excess_rain',
    metric: 'rainfall_mm',
    threshold: 200,
    operator: 'gt',
    payoutPercentage: 75,
    measurementPeriodDays: 14,
  },
  heat_stress: {
    peril: 'heat_stress',
    metric: 'temperature_max_c',
    threshold: 40,
    operator: 'gt',
    payoutPercentage: 70,
    measurementPeriodDays: 5,
  },
};

class CropInsuranceService {
  private policies: BoundedMap<string, InsurancePolicy> = new BoundedMap(5000, 86400_000);
  private monitoringInterval: NodeJS.Timeout | null = null;

  /**
   * Get insurance quote based on farm and crop details
   */
  async getQuote(params: {
    farmerId: number;
    farmId: number;
    cropId?: number;
    cropType?: string;
    policyType: InsurancePolicyType;
    perils: InsurancePeril[];
    coverageAmount: number;
    durationMonths: number;
    latitude: number;
    longitude: number;
  }): Promise<InsuranceQuote> {
    const { farmerId, farmId, cropType, policyType, perils, coverageAmount, durationMonths, latitude, longitude } = params;

    // Determine region for risk assessment
    const region = this.determineRegion(latitude, longitude);
    const regionalRisks = REGIONAL_RISK_FACTORS[region] || REGIONAL_RISK_FACTORS['default'];
    const cropMultiplier = CROP_RISK_MULTIPLIERS[cropType?.toLowerCase() || 'default'] || 1.0;

    // Calculate base premium (typically 2-8% of coverage)
    const basePremiumRate = 0.04; // 4% base rate
    let basePremium = coverageAmount * basePremiumRate * (durationMonths / 12);

    // Apply risk adjustments for each peril
    let riskAdjustment = 0;
    const triggers: InsuranceTrigger[] = [];

    for (const peril of perils) {
      const perilRisk = regionalRisks[peril] || 1.0;
      riskAdjustment += basePremium * 0.1 * perilRisk * cropMultiplier;
      triggers.push({ ...DEFAULT_TRIGGERS[peril] });
    }

    // Get historical weather data for more accurate pricing
    try {
      const historicalRisk = await this.assessHistoricalRisk(latitude, longitude, perils);
      riskAdjustment *= historicalRisk;
    } catch (error) {
      logger.warn('[Insurance] Could not fetch historical risk data:', error);
    }

    // Calculate final premium
    const adminFee = Math.max(500, coverageAmount * 0.005); // 0.5% or minimum 500
    const subtotal = basePremium + riskAdjustment + adminFee;
    const tax = subtotal * 0.05; // 5% insurance tax
    const premium = Math.round(subtotal + tax);

    // Calculate deductible (typically 10-20% of coverage)
    const deductible = Math.round(coverageAmount * 0.15);

    return {
      policyType,
      perils,
      coverageAmount,
      premium,
      premiumBreakdown: {
        basePremium: Math.round(basePremium),
        riskAdjustment: Math.round(riskAdjustment),
        adminFee: Math.round(adminFee),
        tax: Math.round(tax),
      },
      deductible,
      triggers,
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Valid for 7 days
    };
  }

  /**
   * Create a new insurance policy
   */
  async createPolicy(params: {
    farmerId: number;
    farmId: number;
    cropId?: number;
    quote: InsuranceQuote;
    startDate: Date;
  }): Promise<InsurancePolicy> {
    const { farmerId, farmId, cropId, quote, startDate } = params;

    const policyId = `INS-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 12); // 1 year policy

    const policy: InsurancePolicy = {
      id: policyId,
      farmerId,
      farmId,
      cropId,
      policyType: quote.policyType,
      perils: quote.perils,
      coverageAmount: quote.coverageAmount,
      premium: quote.premium,
      deductible: quote.deductible,
      startDate,
      endDate,
      status: 'active',
      triggers: quote.triggers,
      payoutHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.policies.set(policyId, policy);

    // Record premium payment in TigerBeetle
    try {
      const ledger = await getTigerBeetleLedger();
      if (ledger) {
        await ledger.recordTransaction({
          type: 'insurance_premium',
          amount: quote.premium,
          fromAccountId: farmerId.toString(),
          toAccountId: 'insurance_pool',
          metadata: { policyId, farmId, cropId },
        });
      }
    } catch (error) {
      logger.warn('[Insurance] Could not record premium in TigerBeetle:', error);
    }

    // Emit event for policy creation
    try {
      await publishEvent('insurance-events', createEvent(
        'policy_created',
        'insurance_policy',
        policyId,
        farmerId,
        policy
      ));
    } catch (error) {
      logger.warn('[Insurance] Could not emit Kafka event:', error);
    }

    // Start monitoring workflow via Temporal
    try {
      const temporal = await getTemporalService();
      if (temporal) {
        await temporal.startWorkflow({
          workflowId: `insurance-monitor-${policyId}`,
          workflowType: 'insuranceMonitoring',
          input: { policyId, farmId, triggers: policy.triggers },
        });
      }
    } catch (error) {
      logger.warn('[Insurance] Could not start Temporal workflow:', error);
    }

    return policy;
  }

  /**
   * Check if any triggers are met for a policy
   */
  async checkTriggers(policyId: string): Promise<{
    triggered: boolean;
    triggeredPerils: InsurancePeril[];
    triggerData: Record<string, unknown>;
  }> {
    const policy = this.policies.get(policyId);
    if (!policy || policy.status !== 'active') {
      return { triggered: false, triggeredPerils: [], triggerData: {} };
    }

    const triggeredPerils: InsurancePeril[] = [];
    const triggerData: Record<string, unknown> = {};

    // Get farm location (would come from database)
    const farmLocation = { latitude: 6.5244, longitude: 3.3792 }; // Default Lagos

    for (const trigger of policy.triggers) {
      try {
        const isTriggered = await this.evaluateTrigger(trigger, farmLocation);
        if (isTriggered.triggered) {
          triggeredPerils.push(trigger.peril);
          triggerData[trigger.peril] = isTriggered.data;
        }
      } catch (error) {
        logger.warn(`[Insurance] Error evaluating trigger ${trigger.peril}:`, error);
      }
    }

    return {
      triggered: triggeredPerils.length > 0,
      triggeredPerils,
      triggerData,
    };
  }

  /**
   * Process automatic payout when triggers are met
   */
  async processAutomaticPayout(policyId: string, triggeredPeril: InsurancePeril, triggerData: Record<string, unknown>): Promise<InsurancePayout | null> {
    const policy = this.policies.get(policyId);
    if (!policy || policy.status !== 'active') {
      return null;
    }

    const trigger = policy.triggers.find(t => t.peril === triggeredPeril);
    if (!trigger) {
      return null;
    }

    // Calculate payout amount
    const payoutAmount = Math.round(
      (policy.coverageAmount - policy.deductible) * (trigger.payoutPercentage / 100)
    );

    const payout: InsurancePayout = {
      id: `PAY-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
      policyId,
      triggeredBy: triggeredPeril,
      amount: payoutAmount,
      status: 'pending',
      triggerData,
    };

    // Auto-approve if trigger data is verified
    if (this.verifyTriggerData(triggerData)) {
      payout.status = 'approved';

      // Disburse via TigerBeetle
      try {
        const ledger = await getTigerBeetleLedger();
        if (ledger) {
          const txResult = await ledger.recordTransaction({
            type: 'insurance_payout',
            amount: payoutAmount,
            fromAccountId: 'insurance_pool',
            toAccountId: policy.farmerId.toString(),
            metadata: { policyId, payoutId: payout.id, peril: triggeredPeril },
          });
          
          payout.status = 'disbursed';
          payout.disbursedAt = new Date();
          payout.transactionId = txResult?.transactionId;
        }
      } catch (error) {
        logger.warn('[Insurance] Could not disburse payout:', error);
      }
    }

    policy.payoutHistory.push(payout);
    policy.updatedAt = new Date();

    // Emit payout event
    try {
      await publishEvent('insurance-events', createEvent(
        'payout_processed',
        'insurance_payout',
        payout.id,
        policy.farmerId,
        payout
      ));
    } catch (error) {
      logger.warn('[Insurance] Could not emit payout event:', error);
    }

    return payout;
  }

  /**
   * Get all policies for a farmer
   */
  async getFarmerPolicies(farmerId: number): Promise<InsurancePolicy[]> {
    return Array.from(this.policies.values()).filter(p => p.farmerId === farmerId);
  }

  /**
   * Get policy by ID
   */
  async getPolicy(policyId: string): Promise<InsurancePolicy | null> {
    return this.policies.get(policyId) || null;
  }

  /**
   * Get available insurance providers (integration point)
   */
  async getInsuranceProviders(region: string): Promise<Array<{
    id: string;
    name: string;
    types: InsurancePolicyType[];
    rating: number;
    minCoverage: number;
    maxCoverage: number;
  }>> {
    // Would integrate with actual insurance provider APIs
    return [
      {
        id: 'pula',
        name: 'Pula Advisors',
        types: ['weather_indexed', 'area_yield'],
        rating: 4.5,
        minCoverage: 50000,
        maxCoverage: 10000000,
      },
      {
        id: 'acre_africa',
        name: 'ACRE Africa',
        types: ['weather_indexed', 'yield_based', 'livestock_mortality'],
        rating: 4.3,
        minCoverage: 25000,
        maxCoverage: 5000000,
      },
      {
        id: 'aic',
        name: 'Agriculture Insurance Company',
        types: ['weather_indexed', 'yield_based', 'revenue_protection'],
        rating: 4.0,
        minCoverage: 100000,
        maxCoverage: 50000000,
      },
    ];
  }

  /**
   * Start background monitoring for all active policies
   */
  startMonitoring(intervalMs: number = 3600000): void { // Default: 1 hour
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      logger.info('[Insurance] Running trigger check for all active policies...');
      
      for (const [policyId, policy] of this.policies) {
        if (policy.status !== 'active') continue;

        try {
          const result = await this.checkTriggers(policyId);
          if (result.triggered) {
            for (const peril of result.triggeredPerils) {
              await this.processAutomaticPayout(policyId, peril, result.triggerData);
            }
          }
        } catch (error) {
          logger.error(`[Insurance] Error checking policy ${policyId}:`, error);
        }
      }
    }, intervalMs);

    logger.info('[Insurance] Monitoring started');
  }

  /**
   * Stop background monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('[Insurance] Monitoring stopped');
    }
  }

  // Private helper methods

  private determineRegion(latitude: number, longitude: number): string {
    // Simplified region determination
    if (latitude >= 4 && latitude <= 14 && longitude >= 2 && longitude <= 15) {
      return latitude > 10 ? 'nigeria_north' : 'nigeria_south';
    }
    if (latitude >= -5 && latitude <= 5 && longitude >= 33 && longitude <= 42) {
      return 'kenya_highlands';
    }
    if (latitude >= 4 && latitude <= 12 && longitude >= -4 && longitude <= 2) {
      return 'ghana_coastal';
    }
    return 'default';
  }

  private async assessHistoricalRisk(latitude: number, longitude: number, perils: InsurancePeril[]): Promise<number> {
    // Risk multiplier based on location zone and perils covered
    try {
      const { weatherService } = await import("./weather-service.js");
      const weather = await weatherService.getCurrentWeather(latitude, longitude);
      if (!weather) return 1.0;
      
      let riskMultiplier = 1.0;
      
      // Adjust based on weather conditions
      if (weather.humidity > 80) riskMultiplier += 0.1; // high humidity = more disease risk
      if (weather.temperature > 35) riskMultiplier += 0.1; // extreme heat
      if (weather.temperature < 5) riskMultiplier += 0.15; // frost risk
      
      // Adjust based on perils covered
      if (perils.includes('flood' as InsurancePeril)) riskMultiplier += 0.05;
      if (perils.includes('drought' as InsurancePeril)) riskMultiplier += 0.05;
      
      return Math.max(0.8, Math.min(1.3, riskMultiplier));
    } catch (err) {
      return 1.0;
    }
  }

  private async evaluateTrigger(trigger: InsuranceTrigger, location: { latitude: number; longitude: number }): Promise<{
    triggered: boolean;
    data: Record<string, unknown>;
  }> {
    // Get current weather data
    let currentValue: number;
    const data: Record<string, unknown> = {};

    try {
      // Would integrate with actual weather service
      const weather = await weatherService.getCurrentWeather(location.latitude, location.longitude);
      
      switch (trigger.metric) {
        case 'rainfall_mm':
          currentValue = weather?.precipitation || 0;
          break;
        case 'temperature_min_c':
          currentValue = weather?.tempMin || 20;
          break;
        case 'temperature_max_c':
          currentValue = weather?.tempMax || 30;
          break;
        default:
          currentValue = 0;
      }

      data.currentValue = currentValue;
      data.threshold = trigger.threshold;
      data.measurementDate = new Date().toISOString();
    } catch (err) {
      // Use mock data if weather service unavailable
      currentValue = trigger.metric === 'rainfall_mm' ? 100 : 28;
      data.currentValue = currentValue;
      data.source = 'mock';
    }

    let triggered = false;
    switch (trigger.operator) {
      case 'lt':
        triggered = currentValue < trigger.threshold;
        break;
      case 'gt':
        triggered = currentValue > trigger.threshold;
        break;
      case 'lte':
        triggered = currentValue <= trigger.threshold;
        break;
      case 'gte':
        triggered = currentValue >= trigger.threshold;
        break;
    }

    return { triggered, data };
  }

  private verifyTriggerData(triggerData: Record<string, unknown>): boolean {
    // Would implement verification logic (e.g., cross-reference with satellite data)
    return triggerData.source !== 'mock';
  }
}

export const cropInsuranceService = new CropInsuranceService();
