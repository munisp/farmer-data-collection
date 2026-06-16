/**
 * Carbon Credit & Sustainability Tracking Service
 * Tracks sustainable farming practices for carbon credits and certifications
 * Integrates with environmental impact reporting and premium market access
 */

import { db } from "../db.js";
import { BoundedMap } from "../cache/bounded-map.js";
import { publishEvent, createEvent, getProducer } from "../kafka.js";
import { logger } from '../logger.js';
const kafkaProducer = { send: async (payload: Record<string, any>) => { const p = await getProducer(); if (p) return p.send(payload as any); } };

export type SustainablePractice = 
  | 'no_till_farming'
  | 'cover_cropping'
  | 'crop_rotation'
  | 'agroforestry'
  | 'organic_farming'
  | 'composting'
  | 'integrated_pest_management'
  | 'water_conservation'
  | 'renewable_energy'
  | 'reduced_fertilizer'
  | 'biochar_application'
  | 'manure_management';

export type CertificationType = 
  | 'organic'
  | 'fair_trade'
  | 'rainforest_alliance'
  | 'utz'
  | 'global_gap'
  | 'carbon_neutral';

export interface CarbonFootprint {
  id: string;
  farmId: number;
  farmerId: number;
  assessmentDate: Date;
  totalEmissions: number; // kg CO2e
  totalSequestration: number; // kg CO2e
  netEmissions: number; // kg CO2e
  emissionsBySource: EmissionSource[];
  sequestrationBySink: SequestrationSink[];
  intensityPerHectare: number;
  intensityPerTon: number;
  comparisonToBaseline: number; // percentage
  recommendations: string[];
}

export interface EmissionSource {
  source: string;
  category: 'energy' | 'fertilizer' | 'livestock' | 'machinery' | 'transport' | 'waste';
  amount: number; // kg CO2e
  percentage: number;
  reductionPotential: number;
}

export interface SequestrationSink {
  sink: string;
  category: 'soil' | 'trees' | 'crops' | 'biochar';
  amount: number; // kg CO2e
  percentage: number;
  enhancementPotential: number;
}

export interface CarbonCredit {
  id: string;
  farmId: number;
  farmerId: number;
  vintage: number; // year
  quantity: number; // tons CO2e
  status: 'pending' | 'verified' | 'issued' | 'sold' | 'retired';
  verificationStandard: string;
  projectType: string;
  pricePerTon: number;
  currency: string;
  issuanceDate?: Date;
  expiryDate?: Date;
  buyerId?: string;
  transactionId?: string;
}

export interface SustainabilityScore {
  farmId: number;
  overallScore: number; // 0-100
  categoryScores: CategoryScore[];
  practicesImplemented: SustainablePractice[];
  certifications: CertificationStatus[];
  improvementAreas: string[];
  marketAccessLevel: 'basic' | 'standard' | 'premium' | 'elite';
  premiumPotential: number; // percentage price premium
}

export interface CategoryScore {
  category: string;
  score: number;
  maxScore: number;
  practices: string[];
}

export interface CertificationStatus {
  type: CertificationType;
  status: 'not_started' | 'in_progress' | 'pending_audit' | 'certified' | 'expired';
  progress: number; // percentage
  requirements: CertificationRequirement[];
  estimatedCost: number;
  estimatedTime: number; // months
  benefits: string[];
}

export interface CertificationRequirement {
  id: string;
  description: string;
  category: string;
  status: 'not_met' | 'partially_met' | 'met';
  evidence?: string;
  dueDate?: Date;
}

export interface EnvironmentalImpactReport {
  id: string;
  farmId: number;
  reportPeriod: { start: Date; end: Date };
  carbonFootprint: CarbonFootprint;
  waterUsage: WaterImpact;
  biodiversity: BiodiversityImpact;
  soilHealth: SoilHealthImpact;
  chemicalUsage: ChemicalImpact;
  overallRating: 'A' | 'B' | 'C' | 'D' | 'F';
  generatedAt: Date;
}

export interface WaterImpact {
  totalUsage: number; // liters
  usagePerHectare: number;
  efficiency: number; // percentage
  waterQualityScore: number;
  conservationPractices: string[];
}

export interface BiodiversityImpact {
  score: number;
  speciesCount: number;
  habitatArea: number; // hectares
  pollinatorFriendly: boolean;
  nativeSpeciesPercentage: number;
}

export interface SoilHealthImpact {
  organicMatter: number; // percentage
  soilCarbonStock: number; // tons/hectare
  erosionRisk: 'low' | 'medium' | 'high';
  soilBiodiversity: number;
  nutrientBalance: 'deficient' | 'balanced' | 'excess';
}

export interface ChemicalImpact {
  pesticideUsage: number; // kg/hectare
  fertilizerUsage: number; // kg/hectare
  organicPercentage: number;
  integratedPestManagement: boolean;
  chemicalReductionTrend: number; // percentage change
}

// Carbon emission factors (kg CO2e per unit)
const EMISSION_FACTORS = {
  diesel: 2.68, // per liter
  electricity: 0.5, // per kWh
  urea: 5.8, // per kg N
  npk: 3.5, // per kg
  manure: 0.5, // per kg
  methane_livestock: 100, // per head cattle per year
  transport: 0.1, // per ton-km
};

// Carbon sequestration rates (kg CO2e per hectare per year)
const SEQUESTRATION_RATES = {
  no_till: 500,
  cover_crops: 300,
  agroforestry: 2000,
  composting: 200,
  biochar: 1500,
  improved_pasture: 400,
  tree_planting: 3000,
};

// Certification requirements
const CERTIFICATION_REQUIREMENTS: Record<CertificationType, CertificationRequirement[]> = {
  organic: [
    { id: 'org_1', description: 'No synthetic pesticides for 3 years', category: 'inputs', status: 'not_met' },
    { id: 'org_2', description: 'No synthetic fertilizers for 3 years', category: 'inputs', status: 'not_met' },
    { id: 'org_3', description: 'Maintain buffer zones from conventional farms', category: 'land', status: 'not_met' },
    { id: 'org_4', description: 'Use organic seeds or seedlings', category: 'inputs', status: 'not_met' },
    { id: 'org_5', description: 'Implement crop rotation plan', category: 'practices', status: 'not_met' },
    { id: 'org_6', description: 'Maintain detailed farm records', category: 'documentation', status: 'not_met' },
  ],
  fair_trade: [
    { id: 'ft_1', description: 'Pay workers fair wages', category: 'labor', status: 'not_met' },
    { id: 'ft_2', description: 'Safe working conditions', category: 'labor', status: 'not_met' },
    { id: 'ft_3', description: 'No child labor', category: 'labor', status: 'not_met' },
    { id: 'ft_4', description: 'Environmental protection practices', category: 'environment', status: 'not_met' },
    { id: 'ft_5', description: 'Democratic organization structure', category: 'governance', status: 'not_met' },
    { id: 'ft_6', description: 'Traceability system in place', category: 'documentation', status: 'not_met' },
  ],
  rainforest_alliance: [
    { id: 'ra_1', description: 'Forest and biodiversity conservation', category: 'environment', status: 'not_met' },
    { id: 'ra_2', description: 'Wildlife protection measures', category: 'environment', status: 'not_met' },
    { id: 'ra_3', description: 'Water conservation practices', category: 'environment', status: 'not_met' },
    { id: 'ra_4', description: 'Integrated pest management', category: 'practices', status: 'not_met' },
    { id: 'ra_5', description: 'Worker welfare standards', category: 'labor', status: 'not_met' },
    { id: 'ra_6', description: 'Climate-smart agriculture practices', category: 'practices', status: 'not_met' },
  ],
  utz: [
    { id: 'utz_1', description: 'Good agricultural practices', category: 'practices', status: 'not_met' },
    { id: 'utz_2', description: 'Farm management system', category: 'management', status: 'not_met' },
    { id: 'utz_3', description: 'Safe use of agrochemicals', category: 'inputs', status: 'not_met' },
    { id: 'utz_4', description: 'Waste management plan', category: 'environment', status: 'not_met' },
    { id: 'utz_5', description: 'Traceability documentation', category: 'documentation', status: 'not_met' },
  ],
  global_gap: [
    { id: 'gg_1', description: 'Food safety management system', category: 'safety', status: 'not_met' },
    { id: 'gg_2', description: 'Traceability system', category: 'documentation', status: 'not_met' },
    { id: 'gg_3', description: 'Hygiene and sanitation practices', category: 'safety', status: 'not_met' },
    { id: 'gg_4', description: 'Integrated pest management', category: 'practices', status: 'not_met' },
    { id: 'gg_5', description: 'Worker health and safety', category: 'labor', status: 'not_met' },
    { id: 'gg_6', description: 'Environmental management', category: 'environment', status: 'not_met' },
  ],
  carbon_neutral: [
    { id: 'cn_1', description: 'Complete carbon footprint assessment', category: 'assessment', status: 'not_met' },
    { id: 'cn_2', description: 'Emission reduction plan', category: 'planning', status: 'not_met' },
    { id: 'cn_3', description: 'Implement reduction measures', category: 'practices', status: 'not_met' },
    { id: 'cn_4', description: 'Offset remaining emissions', category: 'offsets', status: 'not_met' },
    { id: 'cn_5', description: 'Third-party verification', category: 'verification', status: 'not_met' },
  ],
};

class CarbonCreditService {
  private carbonFootprints: BoundedMap<string, CarbonFootprint> = new BoundedMap(2000, 86400_000);
  private carbonCredits: BoundedMap<string, CarbonCredit> = new BoundedMap(5000, 86400_000);
  private sustainabilityScores: BoundedMap<number, SustainabilityScore> = new BoundedMap(5000, 86400_000);

  /**
   * Calculate carbon footprint for a farm
   */
  async calculateCarbonFootprint(params: {
    farmId: number;
    farmerId: number;
    farmSize: number; // hectares
    crops: string[];
    practices: SustainablePractice[];
    inputs: {
      dieselLiters: number;
      electricityKwh: number;
      ureaKg: number;
      npkKg: number;
      manureKg: number;
      cattleHeads: number;
      transportTonKm: number;
    };
    treeCount: number;
  }): Promise<CarbonFootprint> {
    const { farmId, farmerId, farmSize, crops, practices, inputs, treeCount } = params;

    // Calculate emissions
    const emissionsBySource: EmissionSource[] = [];
    let totalEmissions = 0;

    // Energy emissions
    const dieselEmissions = inputs.dieselLiters * EMISSION_FACTORS.diesel;
    if (dieselEmissions > 0) {
      emissionsBySource.push({
        source: 'Diesel fuel',
        category: 'energy',
        amount: dieselEmissions,
        percentage: 0,
        reductionPotential: 30,
      });
      totalEmissions += dieselEmissions;
    }

    const electricityEmissions = inputs.electricityKwh * EMISSION_FACTORS.electricity;
    if (electricityEmissions > 0) {
      emissionsBySource.push({
        source: 'Electricity',
        category: 'energy',
        amount: electricityEmissions,
        percentage: 0,
        reductionPotential: 50,
      });
      totalEmissions += electricityEmissions;
    }

    // Fertilizer emissions
    const ureaEmissions = inputs.ureaKg * EMISSION_FACTORS.urea;
    if (ureaEmissions > 0) {
      emissionsBySource.push({
        source: 'Urea fertilizer',
        category: 'fertilizer',
        amount: ureaEmissions,
        percentage: 0,
        reductionPotential: 40,
      });
      totalEmissions += ureaEmissions;
    }

    const npkEmissions = inputs.npkKg * EMISSION_FACTORS.npk;
    if (npkEmissions > 0) {
      emissionsBySource.push({
        source: 'NPK fertilizer',
        category: 'fertilizer',
        amount: npkEmissions,
        percentage: 0,
        reductionPotential: 35,
      });
      totalEmissions += npkEmissions;
    }

    // Livestock emissions
    const livestockEmissions = inputs.cattleHeads * EMISSION_FACTORS.methane_livestock;
    if (livestockEmissions > 0) {
      emissionsBySource.push({
        source: 'Livestock (methane)',
        category: 'livestock',
        amount: livestockEmissions,
        percentage: 0,
        reductionPotential: 20,
      });
      totalEmissions += livestockEmissions;
    }

    // Transport emissions
    const transportEmissions = inputs.transportTonKm * EMISSION_FACTORS.transport;
    if (transportEmissions > 0) {
      emissionsBySource.push({
        source: 'Transport',
        category: 'transport',
        amount: transportEmissions,
        percentage: 0,
        reductionPotential: 25,
      });
      totalEmissions += transportEmissions;
    }

    // Calculate percentages
    emissionsBySource.forEach(e => {
      e.percentage = Math.round((e.amount / totalEmissions) * 100);
    });

    // Calculate sequestration
    const sequestrationBySink: SequestrationSink[] = [];
    let totalSequestration = 0;

    // Sequestration from practices
    for (const practice of practices) {
      const rate = SEQUESTRATION_RATES[practice as keyof typeof SEQUESTRATION_RATES];
      if (rate) {
        const amount = rate * farmSize;
        sequestrationBySink.push({
          sink: practice.replace(/_/g, ' '),
          category: 'soil',
          amount,
          percentage: 0,
          enhancementPotential: 20,
        });
        totalSequestration += amount;
      }
    }

    // Sequestration from trees
    if (treeCount > 0) {
      const treeSequestration = treeCount * 20; // ~20 kg CO2 per tree per year
      sequestrationBySink.push({
        sink: 'Trees',
        category: 'trees',
        amount: treeSequestration,
        percentage: 0,
        enhancementPotential: 50,
      });
      totalSequestration += treeSequestration;
    }

    // Calculate percentages
    sequestrationBySink.forEach(s => {
      s.percentage = totalSequestration > 0 ? Math.round((s.amount / totalSequestration) * 100) : 0;
    });

    const netEmissions = totalEmissions - totalSequestration;

    // Generate recommendations
    const recommendations = this.generateCarbonRecommendations(emissionsBySource, practices, netEmissions);

    const footprintId = `CF-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const footprint: CarbonFootprint = {
      id: footprintId,
      farmId,
      farmerId,
      assessmentDate: new Date(),
      totalEmissions: Math.round(totalEmissions),
      totalSequestration: Math.round(totalSequestration),
      netEmissions: Math.round(netEmissions),
      emissionsBySource,
      sequestrationBySink,
      intensityPerHectare: Math.round(netEmissions / farmSize),
      intensityPerTon: 0, // Would need yield data
      comparisonToBaseline: -15, // Simulated - 15% below baseline
      recommendations,
    };

    this.carbonFootprints.set(footprintId, footprint);

    // Emit event
    try {
      await kafkaProducer.send({
        topic: 'sustainability-events',
        messages: [{
          key: footprintId,
          value: JSON.stringify({
            event: 'carbon_footprint_calculated',
            footprint,
            timestamp: new Date().toISOString(),
          }),
        }],
      });
    } catch (error) {
      logger.warn('[CarbonCredit] Could not emit Kafka event:', error);
    }

    return footprint;
  }

  /**
   * Get sustainability score for a farm
   */
  async getSustainabilityScore(params: {
    farmId: number;
    practices: SustainablePractice[];
    certifications: CertificationType[];
  }): Promise<SustainabilityScore> {
    const { farmId, practices, certifications } = params;

    // Calculate category scores
    const categoryScores: CategoryScore[] = [
      {
        category: 'Soil Health',
        score: this.calculateCategoryScore(practices, ['no_till_farming', 'cover_cropping', 'composting', 'biochar_application']),
        maxScore: 25,
        practices: practices.filter(p => ['no_till_farming', 'cover_cropping', 'composting', 'biochar_application'].includes(p)),
      },
      {
        category: 'Biodiversity',
        score: this.calculateCategoryScore(practices, ['crop_rotation', 'agroforestry', 'integrated_pest_management']),
        maxScore: 25,
        practices: practices.filter(p => ['crop_rotation', 'agroforestry', 'integrated_pest_management'].includes(p)),
      },
      {
        category: 'Resource Efficiency',
        score: this.calculateCategoryScore(practices, ['water_conservation', 'renewable_energy', 'reduced_fertilizer']),
        maxScore: 25,
        practices: practices.filter(p => ['water_conservation', 'renewable_energy', 'reduced_fertilizer'].includes(p)),
      },
      {
        category: 'Climate Action',
        score: this.calculateCategoryScore(practices, ['agroforestry', 'biochar_application', 'manure_management']),
        maxScore: 25,
        practices: practices.filter(p => ['agroforestry', 'biochar_application', 'manure_management'].includes(p)),
      },
    ];

    const overallScore = categoryScores.reduce((sum, c) => sum + c.score, 0);

    // Get certification statuses
    const certificationStatuses: CertificationStatus[] = [];
    for (const certType of ['organic', 'fair_trade', 'rainforest_alliance', 'global_gap', 'carbon_neutral'] as CertificationType[]) {
      const isCertified = certifications.includes(certType);
      certificationStatuses.push(this.getCertificationStatus(certType, practices, isCertified));
    }

    // Determine market access level
    let marketAccessLevel: 'basic' | 'standard' | 'premium' | 'elite';
    let premiumPotential: number;

    if (overallScore >= 80 && certifications.length >= 2) {
      marketAccessLevel = 'elite';
      premiumPotential = 40;
    } else if (overallScore >= 60 && certifications.length >= 1) {
      marketAccessLevel = 'premium';
      premiumPotential = 25;
    } else if (overallScore >= 40) {
      marketAccessLevel = 'standard';
      premiumPotential = 10;
    } else {
      marketAccessLevel = 'basic';
      premiumPotential = 0;
    }

    // Identify improvement areas
    const improvementAreas = categoryScores
      .filter(c => c.score < c.maxScore * 0.6)
      .map(c => `Improve ${c.category} practices`);

    const score: SustainabilityScore = {
      farmId,
      overallScore,
      categoryScores,
      practicesImplemented: practices,
      certifications: certificationStatuses,
      improvementAreas,
      marketAccessLevel,
      premiumPotential,
    };

    this.sustainabilityScores.set(farmId, score);

    return score;
  }

  /**
   * Generate carbon credits for verified sequestration
   */
  async generateCarbonCredits(params: {
    farmId: number;
    farmerId: number;
    sequestrationAmount: number; // kg CO2e
    verificationStandard: string;
    projectType: string;
  }): Promise<CarbonCredit> {
    const { farmId, farmerId, sequestrationAmount, verificationStandard, projectType } = params;

    // Convert to tons
    const quantityTons = sequestrationAmount / 1000;

    // Only generate credits if above minimum threshold (1 ton)
    if (quantityTons < 1) {
      throw new Error('Minimum 1 ton CO2e required for credit generation');
    }

    const creditId = `CC-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const credit: CarbonCredit = {
      id: creditId,
      farmId,
      farmerId,
      vintage: new Date().getFullYear(),
      quantity: Math.floor(quantityTons),
      status: 'pending',
      verificationStandard,
      projectType,
      pricePerTon: 15, // USD - typical voluntary market price
      currency: 'USD',
    };

    this.carbonCredits.set(creditId, credit);

    // Emit event
    try {
      await kafkaProducer.send({
        topic: 'sustainability-events',
        messages: [{
          key: creditId,
          value: JSON.stringify({
            event: 'carbon_credit_generated',
            credit,
            timestamp: new Date().toISOString(),
          }),
        }],
      });
    } catch (error) {
      logger.warn('[CarbonCredit] Could not emit Kafka event:', error);
    }

    return credit;
  }

  /**
   * Get environmental impact report
   */
  async getEnvironmentalImpactReport(params: {
    farmId: number;
    farmerId: number;
    farmSize: number;
    practices: SustainablePractice[];
    waterUsage: number;
    pesticideUsage: number;
    fertilizerUsage: number;
    treeCount: number;
  }): Promise<EnvironmentalImpactReport> {
    const { farmId, farmerId, farmSize, practices, waterUsage, pesticideUsage, fertilizerUsage, treeCount } = params;

    // Calculate carbon footprint
    const carbonFootprint = await this.calculateCarbonFootprint({
      farmId,
      farmerId,
      farmSize,
      crops: [],
      practices,
      inputs: {
        dieselLiters: farmSize * 50,
        electricityKwh: farmSize * 100,
        ureaKg: fertilizerUsage * 0.3,
        npkKg: fertilizerUsage * 0.7,
        manureKg: 0,
        cattleHeads: 0,
        transportTonKm: farmSize * 100,
      },
      treeCount,
    });

    // Water impact
    const waterImpact: WaterImpact = {
      totalUsage: waterUsage,
      usagePerHectare: Math.round(waterUsage / farmSize),
      efficiency: practices.includes('water_conservation') ? 85 : 65,
      waterQualityScore: practices.includes('organic_farming') ? 90 : 70,
      conservationPractices: practices.filter(p => 
        ['water_conservation', 'cover_cropping', 'no_till_farming'].includes(p)
      ),
    };

    // Biodiversity impact
    const biodiversityImpact: BiodiversityImpact = {
      score: this.calculateBiodiversityScore(practices, treeCount, farmSize),
      speciesCount: 20 + (practices.includes('agroforestry') ? 30 : 0),
      habitatArea: practices.includes('agroforestry') ? farmSize * 0.2 : farmSize * 0.05,
      pollinatorFriendly: practices.includes('integrated_pest_management'),
      nativeSpeciesPercentage: practices.includes('agroforestry') ? 60 : 30,
    };

    // Soil health impact
    const soilHealthImpact: SoilHealthImpact = {
      organicMatter: 2.5 + (practices.includes('composting') ? 1.5 : 0) + (practices.includes('cover_cropping') ? 0.5 : 0),
      soilCarbonStock: 40 + (practices.includes('no_till_farming') ? 10 : 0),
      erosionRisk: practices.includes('cover_cropping') ? 'low' : practices.includes('no_till_farming') ? 'medium' : 'high',
      soilBiodiversity: practices.includes('organic_farming') ? 80 : 50,
      nutrientBalance: practices.includes('crop_rotation') ? 'balanced' : 'deficient',
    };

    // Chemical impact
    const chemicalImpact: ChemicalImpact = {
      pesticideUsage: pesticideUsage / farmSize,
      fertilizerUsage: fertilizerUsage / farmSize,
      organicPercentage: practices.includes('organic_farming') ? 100 : practices.includes('integrated_pest_management') ? 50 : 0,
      integratedPestManagement: practices.includes('integrated_pest_management'),
      chemicalReductionTrend: practices.includes('reduced_fertilizer') ? -20 : 0,
    };

    // Calculate overall rating
    const scores = [
      carbonFootprint.netEmissions < 0 ? 100 : Math.max(0, 100 - carbonFootprint.intensityPerHectare / 50),
      waterImpact.efficiency,
      biodiversityImpact.score,
      soilHealthImpact.organicMatter * 20,
      100 - chemicalImpact.pesticideUsage * 10,
    ];
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const overallRating: 'A' | 'B' | 'C' | 'D' | 'F' = 
      avgScore >= 80 ? 'A' : avgScore >= 60 ? 'B' : avgScore >= 40 ? 'C' : avgScore >= 20 ? 'D' : 'F';

    const reportId = `EIR-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    return {
      id: reportId,
      farmId,
      reportPeriod: {
        start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
      carbonFootprint,
      waterUsage: waterImpact,
      biodiversity: biodiversityImpact,
      soilHealth: soilHealthImpact,
      chemicalUsage: chemicalImpact,
      overallRating,
      generatedAt: new Date(),
    };
  }

  /**
   * Get certification roadmap
   */
  getCertificationRoadmap(certType: CertificationType, currentPractices: SustainablePractice[]): {
    certification: CertificationType;
    currentProgress: number;
    requirements: CertificationRequirement[];
    estimatedCost: number;
    estimatedTime: number;
    nextSteps: string[];
    benefits: string[];
  } {
    const requirements = [...CERTIFICATION_REQUIREMENTS[certType]];
    
    // Update requirement statuses based on current practices
    for (const req of requirements) {
      if (this.checkRequirementMet(req, currentPractices)) {
        req.status = 'met';
      } else if (this.checkRequirementPartiallyMet(req, currentPractices)) {
        req.status = 'partially_met';
      }
    }

    const metCount = requirements.filter(r => r.status === 'met').length;
    const currentProgress = Math.round((metCount / requirements.length) * 100);

    const costs: Record<CertificationType, number> = {
      organic: 150000,
      fair_trade: 100000,
      rainforest_alliance: 200000,
      utz: 120000,
      global_gap: 180000,
      carbon_neutral: 250000,
    };

    const times: Record<CertificationType, number> = {
      organic: 36,
      fair_trade: 12,
      rainforest_alliance: 18,
      utz: 12,
      global_gap: 6,
      carbon_neutral: 12,
    };

    const benefits: Record<CertificationType, string[]> = {
      organic: ['20-40% price premium', 'Access to organic markets', 'Improved soil health', 'Consumer trust'],
      fair_trade: ['Guaranteed minimum price', 'Fair trade premium', 'Community development funds', 'Market access'],
      rainforest_alliance: ['15-25% price premium', 'Sustainability certification', 'Environmental credibility', 'Export market access'],
      utz: ['10-15% price premium', 'Traceability', 'Better farming practices', 'Market differentiation'],
      global_gap: ['Access to supermarket chains', 'Food safety assurance', 'Export compliance', 'Quality recognition'],
      carbon_neutral: ['Carbon credit revenue', 'Climate leadership', 'Premium market access', 'Brand differentiation'],
    };

    const nextSteps = requirements
      .filter(r => r.status !== 'met')
      .slice(0, 3)
      .map(r => r.description);

    return {
      certification: certType,
      currentProgress,
      requirements,
      estimatedCost: costs[certType],
      estimatedTime: times[certType],
      nextSteps,
      benefits: benefits[certType],
    };
  }

  /**
   * Get carbon credits for a farm
   */
  async getFarmCarbonCredits(farmId: number): Promise<CarbonCredit[]> {
    return Array.from(this.carbonCredits.values()).filter(c => c.farmId === farmId);
  }

  /**
   * Get available sustainable practices
   */
  getAvailablePractices(): Array<{
    practice: SustainablePractice;
    name: string;
    description: string;
    carbonBenefit: number;
    implementationCost: 'low' | 'medium' | 'high';
    difficulty: 'easy' | 'moderate' | 'complex';
  }> {
    return [
      {
        practice: 'no_till_farming',
        name: 'No-Till Farming',
        description: 'Minimize soil disturbance to preserve soil structure and carbon',
        carbonBenefit: 500,
        implementationCost: 'low',
        difficulty: 'moderate',
      },
      {
        practice: 'cover_cropping',
        name: 'Cover Cropping',
        description: 'Plant cover crops between main crops to protect and enrich soil',
        carbonBenefit: 300,
        implementationCost: 'low',
        difficulty: 'easy',
      },
      {
        practice: 'crop_rotation',
        name: 'Crop Rotation',
        description: 'Rotate different crops to improve soil health and break pest cycles',
        carbonBenefit: 200,
        implementationCost: 'low',
        difficulty: 'easy',
      },
      {
        practice: 'agroforestry',
        name: 'Agroforestry',
        description: 'Integrate trees with crops for carbon sequestration and biodiversity',
        carbonBenefit: 2000,
        implementationCost: 'high',
        difficulty: 'complex',
      },
      {
        practice: 'organic_farming',
        name: 'Organic Farming',
        description: 'Farm without synthetic chemicals for environmental and health benefits',
        carbonBenefit: 400,
        implementationCost: 'medium',
        difficulty: 'moderate',
      },
      {
        practice: 'composting',
        name: 'Composting',
        description: 'Convert organic waste into nutrient-rich soil amendment',
        carbonBenefit: 200,
        implementationCost: 'low',
        difficulty: 'easy',
      },
      {
        practice: 'integrated_pest_management',
        name: 'Integrated Pest Management',
        description: 'Use biological and cultural methods to control pests',
        carbonBenefit: 100,
        implementationCost: 'medium',
        difficulty: 'moderate',
      },
      {
        practice: 'water_conservation',
        name: 'Water Conservation',
        description: 'Implement efficient irrigation and water harvesting',
        carbonBenefit: 150,
        implementationCost: 'medium',
        difficulty: 'moderate',
      },
      {
        practice: 'renewable_energy',
        name: 'Renewable Energy',
        description: 'Use solar or wind power for farm operations',
        carbonBenefit: 800,
        implementationCost: 'high',
        difficulty: 'complex',
      },
      {
        practice: 'biochar_application',
        name: 'Biochar Application',
        description: 'Apply biochar to soil for long-term carbon storage',
        carbonBenefit: 1500,
        implementationCost: 'medium',
        difficulty: 'moderate',
      },
    ];
  }

  // Private helper methods

  private generateCarbonRecommendations(
    emissions: EmissionSource[],
    practices: SustainablePractice[],
    netEmissions: number
  ): string[] {
    const recommendations: string[] = [];

    // Find highest emission sources
    const sortedEmissions = [...emissions].sort((a, b) => b.amount - a.amount);
    if (sortedEmissions[0]) {
      recommendations.push(`Focus on reducing ${sortedEmissions[0].source} emissions (${sortedEmissions[0].percentage}% of total)`);
    }

    // Suggest missing practices
    if (!practices.includes('no_till_farming')) {
      recommendations.push('Implement no-till farming to sequester 500 kg CO2e/ha/year');
    }
    if (!practices.includes('cover_cropping')) {
      recommendations.push('Plant cover crops to add 300 kg CO2e/ha/year sequestration');
    }
    if (!practices.includes('agroforestry') && netEmissions > 0) {
      recommendations.push('Consider agroforestry to achieve carbon neutrality');
    }

    // General recommendations
    if (netEmissions > 0) {
      recommendations.push('Plant trees to offset remaining emissions');
    } else {
      recommendations.push('Congratulations! Your farm is carbon negative. Consider selling carbon credits.');
    }

    return recommendations;
  }

  private calculateCategoryScore(practices: SustainablePractice[], relevantPractices: string[]): number {
    const implemented = practices.filter(p => relevantPractices.includes(p)).length;
    return Math.round((implemented / relevantPractices.length) * 25);
  }

  private getCertificationStatus(
    certType: CertificationType,
    practices: SustainablePractice[],
    isCertified: boolean
  ): CertificationStatus {
    const requirements = [...CERTIFICATION_REQUIREMENTS[certType]];
    
    for (const req of requirements) {
      if (this.checkRequirementMet(req, practices)) {
        req.status = 'met';
      } else if (this.checkRequirementPartiallyMet(req, practices)) {
        req.status = 'partially_met';
      }
    }

    const metCount = requirements.filter(r => r.status === 'met').length;
    const progress = Math.round((metCount / requirements.length) * 100);

    const costs: Record<CertificationType, number> = {
      organic: 150000,
      fair_trade: 100000,
      rainforest_alliance: 200000,
      utz: 120000,
      global_gap: 180000,
      carbon_neutral: 250000,
    };

    const times: Record<CertificationType, number> = {
      organic: 36,
      fair_trade: 12,
      rainforest_alliance: 18,
      utz: 12,
      global_gap: 6,
      carbon_neutral: 12,
    };

    return {
      type: certType,
      status: isCertified ? 'certified' : progress >= 80 ? 'pending_audit' : progress >= 30 ? 'in_progress' : 'not_started',
      progress,
      requirements,
      estimatedCost: costs[certType],
      estimatedTime: times[certType],
      benefits: [],
    };
  }

  private checkRequirementMet(req: CertificationRequirement, practices: SustainablePractice[]): boolean {
    const practiceMap: Record<string, SustainablePractice[]> = {
      'inputs': ['organic_farming', 'reduced_fertilizer'],
      'practices': ['crop_rotation', 'integrated_pest_management', 'no_till_farming'],
      'environment': ['water_conservation', 'agroforestry', 'cover_cropping'],
    };

    const relevantPractices = practiceMap[req.category] || [];
    return relevantPractices.some(p => practices.includes(p));
  }

  private checkRequirementPartiallyMet(req: CertificationRequirement, practices: SustainablePractice[]): boolean {
    return practices.length >= 2;
  }

  private calculateBiodiversityScore(practices: SustainablePractice[], treeCount: number, farmSize: number): number {
    let score = 30; // Base score

    if (practices.includes('agroforestry')) score += 25;
    if (practices.includes('crop_rotation')) score += 15;
    if (practices.includes('integrated_pest_management')) score += 15;
    if (practices.includes('cover_cropping')) score += 10;
    if (treeCount / farmSize > 50) score += 5;

    return Math.min(100, score);
  }
}

export const carbonCreditService = new CarbonCreditService();
