/**
 * Pest & Disease Early Warning System
 * Integrates with weather service, satellite imagery, and regional outbreak data
 * Provides real-time alerts and treatment recommendations
 */

import { db } from "../db.js";
import { BoundedMap } from "../cache/bounded-map.js";
import { weatherService } from "./weather-service.js";
import { satelliteImageryService } from "./satellite-imagery-service.js";
import { publishEvent, createEvent, getProducer } from "../kafka.js";
import { logger } from '../logger.js';
const kafkaProducer = { send: async (payload: Record<string, any>) => { const p = await getProducer(); if (p) return p.send(payload as any); } };

export type PestType = 
  | 'fall_armyworm' 
  | 'stem_borer' 
  | 'aphids' 
  | 'whitefly' 
  | 'locusts'
  | 'weevils'
  | 'mites'
  | 'nematodes'
  | 'fruit_fly'
  | 'bollworm';

export type DiseaseType = 
  | 'leaf_blight' 
  | 'rust' 
  | 'powdery_mildew' 
  | 'downy_mildew'
  | 'bacterial_wilt'
  | 'fusarium_wilt'
  | 'anthracnose'
  | 'black_pod'
  | 'cassava_mosaic'
  | 'rice_blast';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PestDiseaseAlert {
  id: string;
  type: 'pest' | 'disease';
  name: PestType | DiseaseType;
  severity: AlertSeverity;
  affectedCrops: string[];
  affectedRegions: string[];
  riskLevel: number; // 0-100
  description: string;
  symptoms: string[];
  spreadFactors: string[];
  preventiveMeasures: string[];
  treatmentOptions: TreatmentOption[];
  reportedCases: number;
  confirmedCases: number;
  firstReportedDate: Date;
  lastUpdated: Date;
  expectedDuration: string;
  weatherConditions: WeatherCondition[];
}

export interface TreatmentOption {
  name: string;
  type: 'chemical' | 'biological' | 'cultural' | 'mechanical';
  effectiveness: number; // 0-100
  applicationMethod: string;
  dosage: string;
  frequency: string;
  waitingPeriod: number; // days before harvest
  estimatedCost: number;
  currency: string;
  availability: 'high' | 'medium' | 'low';
  environmentalImpact: 'low' | 'medium' | 'high';
}

export interface WeatherCondition {
  factor: string;
  currentValue: number;
  riskThreshold: number;
  unit: string;
  riskLevel: 'favorable' | 'moderate' | 'unfavorable';
}

export interface FarmRiskAssessment {
  farmId: number;
  farmerId: number;
  overallRiskScore: number;
  riskLevel: AlertSeverity;
  activeThreats: PestDiseaseAlert[];
  vulnerabilities: string[];
  recommendations: string[];
  spraySchedule: SprayScheduleItem[];
  monitoringPoints: MonitoringPoint[];
  lastAssessment: Date;
}

export interface SprayScheduleItem {
  id: string;
  targetPest: PestType | DiseaseType | 'preventive';
  product: string;
  applicationDate: Date;
  applicationWindow: { start: Date; end: Date };
  weatherRequirements: string[];
  dosage: string;
  method: string;
  estimatedCost: number;
  status: 'scheduled' | 'completed' | 'skipped' | 'rescheduled';
  notes: string;
}

export interface MonitoringPoint {
  id: string;
  location: { latitude: number; longitude: number };
  description: string;
  checkFrequency: 'daily' | 'weekly' | 'biweekly';
  lastChecked?: Date;
  findings?: string;
  photoRequired: boolean;
}

export interface OutbreakReport {
  id: string;
  reporterId: number;
  farmId: number;
  type: 'pest' | 'disease';
  suspectedName: string;
  severity: AlertSeverity;
  affectedArea: number; // hectares
  symptoms: string[];
  photos: string[];
  location: { latitude: number; longitude: number };
  reportedAt: Date;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verifiedBy?: string;
  aiDiagnosis?: {
    prediction: string;
    confidence: number;
    alternatives: Array<{ name: string; confidence: number }>;
  };
}

// Pest and disease database
const PEST_DATABASE: Record<PestType, {
  name: string;
  affectedCrops: string[];
  favorableConditions: { tempMin: number; tempMax: number; humidityMin: number; humidityMax: number };
  symptoms: string[];
  treatments: TreatmentOption[];
}> = {
  fall_armyworm: {
    name: 'Fall Armyworm',
    affectedCrops: ['maize', 'sorghum', 'rice', 'millet', 'sugarcane'],
    favorableConditions: { tempMin: 20, tempMax: 35, humidityMin: 60, humidityMax: 90 },
    symptoms: ['Ragged holes in leaves', 'Sawdust-like frass', 'Damaged growing points', 'Windowpane effect on leaves'],
    treatments: [
      {
        name: 'Emamectin Benzoate',
        type: 'chemical',
        effectiveness: 85,
        applicationMethod: 'Foliar spray',
        dosage: '200ml per hectare',
        frequency: 'Every 7-10 days',
        waitingPeriod: 14,
        estimatedCost: 8000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'medium',
      },
      {
        name: 'Bacillus thuringiensis (Bt)',
        type: 'biological',
        effectiveness: 70,
        applicationMethod: 'Foliar spray',
        dosage: '1kg per hectare',
        frequency: 'Every 5-7 days',
        waitingPeriod: 0,
        estimatedCost: 12000,
        currency: 'NGN',
        availability: 'medium',
        environmentalImpact: 'low',
      },
      {
        name: 'Neem oil extract',
        type: 'biological',
        effectiveness: 60,
        applicationMethod: 'Foliar spray',
        dosage: '3L per hectare',
        frequency: 'Every 5 days',
        waitingPeriod: 0,
        estimatedCost: 5000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'low',
      },
    ],
  },
  stem_borer: {
    name: 'Stem Borer',
    affectedCrops: ['maize', 'sorghum', 'rice', 'sugarcane'],
    favorableConditions: { tempMin: 25, tempMax: 35, humidityMin: 70, humidityMax: 95 },
    symptoms: ['Dead heart in young plants', 'Stem tunneling', 'Broken stems', 'White head in rice'],
    treatments: [
      {
        name: 'Carbofuran granules',
        type: 'chemical',
        effectiveness: 80,
        applicationMethod: 'Soil application in whorl',
        dosage: '8kg per hectare',
        frequency: 'At planting and 30 days after',
        waitingPeriod: 21,
        estimatedCost: 15000,
        currency: 'NGN',
        availability: 'medium',
        environmentalImpact: 'high',
      },
      {
        name: 'Trichogramma wasps',
        type: 'biological',
        effectiveness: 65,
        applicationMethod: 'Release in field',
        dosage: '50,000 wasps per hectare',
        frequency: 'Weekly during egg-laying period',
        waitingPeriod: 0,
        estimatedCost: 10000,
        currency: 'NGN',
        availability: 'low',
        environmentalImpact: 'low',
      },
    ],
  },
  aphids: {
    name: 'Aphids',
    affectedCrops: ['cowpea', 'groundnut', 'vegetables', 'cotton'],
    favorableConditions: { tempMin: 15, tempMax: 30, humidityMin: 50, humidityMax: 80 },
    symptoms: ['Curled leaves', 'Sticky honeydew', 'Sooty mold', 'Stunted growth'],
    treatments: [
      {
        name: 'Imidacloprid',
        type: 'chemical',
        effectiveness: 90,
        applicationMethod: 'Foliar spray or seed treatment',
        dosage: '100ml per hectare',
        frequency: 'Every 14 days',
        waitingPeriod: 21,
        estimatedCost: 6000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'high',
      },
      {
        name: 'Soap spray',
        type: 'cultural',
        effectiveness: 50,
        applicationMethod: 'Foliar spray',
        dosage: '20ml soap per liter water',
        frequency: 'Every 3-5 days',
        waitingPeriod: 0,
        estimatedCost: 1000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'low',
      },
    ],
  },
  whitefly: {
    name: 'Whitefly',
    affectedCrops: ['cassava', 'tomato', 'cotton', 'vegetables'],
    favorableConditions: { tempMin: 25, tempMax: 35, humidityMin: 60, humidityMax: 85 },
    symptoms: ['White insects under leaves', 'Yellowing leaves', 'Virus transmission', 'Honeydew and sooty mold'],
    treatments: [
      {
        name: 'Acetamiprid',
        type: 'chemical',
        effectiveness: 85,
        applicationMethod: 'Foliar spray',
        dosage: '150g per hectare',
        frequency: 'Every 10-14 days',
        waitingPeriod: 14,
        estimatedCost: 7000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'medium',
      },
    ],
  },
  locusts: {
    name: 'Locusts',
    affectedCrops: ['all crops'],
    favorableConditions: { tempMin: 20, tempMax: 40, humidityMin: 30, humidityMax: 70 },
    symptoms: ['Complete defoliation', 'Swarm sightings', 'Rapid crop destruction'],
    treatments: [
      {
        name: 'Fenitrothion',
        type: 'chemical',
        effectiveness: 95,
        applicationMethod: 'Aerial or ground spray',
        dosage: '500ml per hectare',
        frequency: 'As needed during swarm',
        waitingPeriod: 14,
        estimatedCost: 20000,
        currency: 'NGN',
        availability: 'medium',
        environmentalImpact: 'high',
      },
      {
        name: 'Metarhizium acridum (Green Muscle)',
        type: 'biological',
        effectiveness: 70,
        applicationMethod: 'Spray',
        dosage: '50g per hectare',
        frequency: 'Single application',
        waitingPeriod: 0,
        estimatedCost: 25000,
        currency: 'NGN',
        availability: 'low',
        environmentalImpact: 'low',
      },
    ],
  },
  weevils: {
    name: 'Weevils',
    affectedCrops: ['maize', 'rice', 'cowpea', 'stored grains'],
    favorableConditions: { tempMin: 25, tempMax: 35, humidityMin: 60, humidityMax: 80 },
    symptoms: ['Holes in grains', 'Powdery residue', 'Weight loss in stored produce'],
    treatments: [
      {
        name: 'Phosphine fumigation',
        type: 'chemical',
        effectiveness: 95,
        applicationMethod: 'Fumigation of storage',
        dosage: '3 tablets per ton',
        frequency: 'As needed',
        waitingPeriod: 7,
        estimatedCost: 5000,
        currency: 'NGN',
        availability: 'medium',
        environmentalImpact: 'medium',
      },
    ],
  },
  mites: {
    name: 'Spider Mites',
    affectedCrops: ['cassava', 'vegetables', 'fruits'],
    favorableConditions: { tempMin: 25, tempMax: 40, humidityMin: 30, humidityMax: 60 },
    symptoms: ['Stippling on leaves', 'Webbing', 'Bronzing of leaves'],
    treatments: [
      {
        name: 'Abamectin',
        type: 'chemical',
        effectiveness: 85,
        applicationMethod: 'Foliar spray',
        dosage: '300ml per hectare',
        frequency: 'Every 7-10 days',
        waitingPeriod: 14,
        estimatedCost: 9000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'medium',
      },
    ],
  },
  nematodes: {
    name: 'Root-knot Nematodes',
    affectedCrops: ['tomato', 'vegetables', 'yam', 'cassava'],
    favorableConditions: { tempMin: 20, tempMax: 30, humidityMin: 50, humidityMax: 80 },
    symptoms: ['Root galls', 'Stunted growth', 'Wilting', 'Yellowing'],
    treatments: [
      {
        name: 'Carbofuran',
        type: 'chemical',
        effectiveness: 75,
        applicationMethod: 'Soil application',
        dosage: '10kg per hectare',
        frequency: 'At planting',
        waitingPeriod: 30,
        estimatedCost: 18000,
        currency: 'NGN',
        availability: 'medium',
        environmentalImpact: 'high',
      },
    ],
  },
  fruit_fly: {
    name: 'Fruit Fly',
    affectedCrops: ['mango', 'citrus', 'guava', 'vegetables'],
    favorableConditions: { tempMin: 20, tempMax: 35, humidityMin: 60, humidityMax: 90 },
    symptoms: ['Puncture marks on fruit', 'Maggots in fruit', 'Premature fruit drop'],
    treatments: [
      {
        name: 'Protein bait spray',
        type: 'biological',
        effectiveness: 70,
        applicationMethod: 'Spot spray on foliage',
        dosage: '1L per hectare',
        frequency: 'Weekly',
        waitingPeriod: 0,
        estimatedCost: 8000,
        currency: 'NGN',
        availability: 'medium',
        environmentalImpact: 'low',
      },
    ],
  },
  bollworm: {
    name: 'Bollworm',
    affectedCrops: ['cotton', 'tomato', 'maize', 'sorghum'],
    favorableConditions: { tempMin: 20, tempMax: 35, humidityMin: 50, humidityMax: 80 },
    symptoms: ['Holes in bolls/fruits', 'Frass at entry points', 'Damaged flowers'],
    treatments: [
      {
        name: 'Cypermethrin',
        type: 'chemical',
        effectiveness: 80,
        applicationMethod: 'Foliar spray',
        dosage: '400ml per hectare',
        frequency: 'Every 10-14 days',
        waitingPeriod: 14,
        estimatedCost: 6000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'medium',
      },
    ],
  },
};

const DISEASE_DATABASE: Record<DiseaseType, {
  name: string;
  affectedCrops: string[];
  favorableConditions: { tempMin: number; tempMax: number; humidityMin: number; humidityMax: number };
  symptoms: string[];
  treatments: TreatmentOption[];
}> = {
  leaf_blight: {
    name: 'Leaf Blight',
    affectedCrops: ['maize', 'rice', 'sorghum'],
    favorableConditions: { tempMin: 20, tempMax: 30, humidityMin: 80, humidityMax: 100 },
    symptoms: ['Elongated lesions', 'Gray-green water-soaked spots', 'Leaf death'],
    treatments: [
      {
        name: 'Mancozeb',
        type: 'chemical',
        effectiveness: 75,
        applicationMethod: 'Foliar spray',
        dosage: '2kg per hectare',
        frequency: 'Every 7-10 days',
        waitingPeriod: 14,
        estimatedCost: 5000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'medium',
      },
    ],
  },
  rust: {
    name: 'Rust',
    affectedCrops: ['maize', 'wheat', 'groundnut', 'cowpea'],
    favorableConditions: { tempMin: 15, tempMax: 25, humidityMin: 80, humidityMax: 100 },
    symptoms: ['Orange-brown pustules', 'Yellowing leaves', 'Premature leaf drop'],
    treatments: [
      {
        name: 'Propiconazole',
        type: 'chemical',
        effectiveness: 85,
        applicationMethod: 'Foliar spray',
        dosage: '500ml per hectare',
        frequency: 'Every 14 days',
        waitingPeriod: 21,
        estimatedCost: 8000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'medium',
      },
    ],
  },
  powdery_mildew: {
    name: 'Powdery Mildew',
    affectedCrops: ['vegetables', 'mango', 'grapes'],
    favorableConditions: { tempMin: 20, tempMax: 30, humidityMin: 50, humidityMax: 80 },
    symptoms: ['White powdery coating', 'Distorted leaves', 'Stunted growth'],
    treatments: [
      {
        name: 'Sulphur dust',
        type: 'chemical',
        effectiveness: 70,
        applicationMethod: 'Dusting',
        dosage: '25kg per hectare',
        frequency: 'Every 7-10 days',
        waitingPeriod: 7,
        estimatedCost: 4000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'low',
      },
    ],
  },
  downy_mildew: {
    name: 'Downy Mildew',
    affectedCrops: ['maize', 'sorghum', 'pearl millet', 'grapes'],
    favorableConditions: { tempMin: 15, tempMax: 25, humidityMin: 85, humidityMax: 100 },
    symptoms: ['Yellow stripes on leaves', 'White downy growth', 'Stunted plants'],
    treatments: [
      {
        name: 'Metalaxyl',
        type: 'chemical',
        effectiveness: 85,
        applicationMethod: 'Seed treatment or foliar spray',
        dosage: '2g per kg seed or 1kg per hectare',
        frequency: 'Seed treatment or every 14 days',
        waitingPeriod: 21,
        estimatedCost: 10000,
        currency: 'NGN',
        availability: 'medium',
        environmentalImpact: 'medium',
      },
    ],
  },
  bacterial_wilt: {
    name: 'Bacterial Wilt',
    affectedCrops: ['tomato', 'potato', 'banana', 'ginger'],
    favorableConditions: { tempMin: 25, tempMax: 35, humidityMin: 70, humidityMax: 100 },
    symptoms: ['Sudden wilting', 'Brown vascular tissue', 'Bacterial ooze'],
    treatments: [
      {
        name: 'Copper hydroxide',
        type: 'chemical',
        effectiveness: 50,
        applicationMethod: 'Soil drench',
        dosage: '2kg per hectare',
        frequency: 'Preventive only',
        waitingPeriod: 14,
        estimatedCost: 7000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'medium',
      },
      {
        name: 'Crop rotation',
        type: 'cultural',
        effectiveness: 80,
        applicationMethod: 'Rotate with non-host crops',
        dosage: 'N/A',
        frequency: '3-4 year rotation',
        waitingPeriod: 0,
        estimatedCost: 0,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'low',
      },
    ],
  },
  fusarium_wilt: {
    name: 'Fusarium Wilt',
    affectedCrops: ['banana', 'tomato', 'cotton', 'watermelon'],
    favorableConditions: { tempMin: 25, tempMax: 30, humidityMin: 60, humidityMax: 80 },
    symptoms: ['Yellowing of older leaves', 'Vascular discoloration', 'Wilting'],
    treatments: [
      {
        name: 'Trichoderma viride',
        type: 'biological',
        effectiveness: 60,
        applicationMethod: 'Soil application',
        dosage: '2kg per hectare',
        frequency: 'At planting',
        waitingPeriod: 0,
        estimatedCost: 8000,
        currency: 'NGN',
        availability: 'medium',
        environmentalImpact: 'low',
      },
    ],
  },
  anthracnose: {
    name: 'Anthracnose',
    affectedCrops: ['mango', 'papaya', 'yam', 'cassava'],
    favorableConditions: { tempMin: 20, tempMax: 30, humidityMin: 80, humidityMax: 100 },
    symptoms: ['Dark sunken lesions', 'Fruit rot', 'Die-back of twigs'],
    treatments: [
      {
        name: 'Carbendazim',
        type: 'chemical',
        effectiveness: 80,
        applicationMethod: 'Foliar spray',
        dosage: '500g per hectare',
        frequency: 'Every 10-14 days',
        waitingPeriod: 14,
        estimatedCost: 6000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'medium',
      },
    ],
  },
  black_pod: {
    name: 'Black Pod Disease',
    affectedCrops: ['cocoa'],
    favorableConditions: { tempMin: 20, tempMax: 28, humidityMin: 85, humidityMax: 100 },
    symptoms: ['Black lesions on pods', 'Pod rot', 'Mummified pods'],
    treatments: [
      {
        name: 'Copper fungicide',
        type: 'chemical',
        effectiveness: 75,
        applicationMethod: 'Foliar spray',
        dosage: '3kg per hectare',
        frequency: 'Every 21 days during wet season',
        waitingPeriod: 14,
        estimatedCost: 8000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'medium',
      },
    ],
  },
  cassava_mosaic: {
    name: 'Cassava Mosaic Disease',
    affectedCrops: ['cassava'],
    favorableConditions: { tempMin: 25, tempMax: 35, humidityMin: 60, humidityMax: 90 },
    symptoms: ['Mosaic patterns on leaves', 'Leaf distortion', 'Stunted growth'],
    treatments: [
      {
        name: 'Resistant varieties',
        type: 'cultural',
        effectiveness: 90,
        applicationMethod: 'Use TME 419 or IITA varieties',
        dosage: 'N/A',
        frequency: 'At planting',
        waitingPeriod: 0,
        estimatedCost: 0,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'low',
      },
      {
        name: 'Whitefly control',
        type: 'chemical',
        effectiveness: 60,
        applicationMethod: 'Control vector',
        dosage: 'As per whitefly treatment',
        frequency: 'Regular monitoring',
        waitingPeriod: 14,
        estimatedCost: 7000,
        currency: 'NGN',
        availability: 'high',
        environmentalImpact: 'medium',
      },
    ],
  },
  rice_blast: {
    name: 'Rice Blast',
    affectedCrops: ['rice'],
    favorableConditions: { tempMin: 20, tempMax: 28, humidityMin: 85, humidityMax: 100 },
    symptoms: ['Diamond-shaped lesions', 'Neck rot', 'White heads'],
    treatments: [
      {
        name: 'Tricyclazole',
        type: 'chemical',
        effectiveness: 85,
        applicationMethod: 'Foliar spray',
        dosage: '300g per hectare',
        frequency: 'Every 14 days',
        waitingPeriod: 21,
        estimatedCost: 9000,
        currency: 'NGN',
        availability: 'medium',
        environmentalImpact: 'medium',
      },
    ],
  },
};

class PestDiseaseWarningService {
  private alerts: BoundedMap<string, PestDiseaseAlert> = new BoundedMap(5000, 86400_000);
  private outbreakReports: BoundedMap<string, OutbreakReport> = new BoundedMap(2000, 86400_000);
  private farmAssessments: BoundedMap<number, FarmRiskAssessment> = new BoundedMap(5000, 43200_000);
  private monitoringInterval: NodeJS.Timeout | null = null;

  /**
   * Get current alerts for a region
   */
  async getRegionalAlerts(params: {
    latitude: number;
    longitude: number;
    radiusKm: number;
    crops?: string[];
  }): Promise<PestDiseaseAlert[]> {
    const { latitude, longitude, radiusKm, crops } = params;

    // Get weather conditions to assess risk
    const weatherConditions = await this.getWeatherConditions(latitude, longitude);

    // Generate alerts based on weather conditions and regional data
    const alerts: PestDiseaseAlert[] = [];

    // Check pest risks
    for (const [pestType, pestData] of Object.entries(PEST_DATABASE)) {
      const riskLevel = this.calculateRisk(pestData.favorableConditions, weatherConditions);
      
      if (riskLevel > 30) {
        const affectedCrops = crops 
          ? pestData.affectedCrops.filter(c => crops.some(crop => c.toLowerCase().includes(crop.toLowerCase())))
          : pestData.affectedCrops;

        if (affectedCrops.length > 0 || !crops) {
          alerts.push(this.createAlert('pest', pestType as PestType, pestData, riskLevel, weatherConditions));
        }
      }
    }

    // Check disease risks
    for (const [diseaseType, diseaseData] of Object.entries(DISEASE_DATABASE)) {
      const riskLevel = this.calculateRisk(diseaseData.favorableConditions, weatherConditions);
      
      if (riskLevel > 30) {
        const affectedCrops = crops 
          ? diseaseData.affectedCrops.filter(c => crops.some(crop => c.toLowerCase().includes(crop.toLowerCase())))
          : diseaseData.affectedCrops;

        if (affectedCrops.length > 0 || !crops) {
          alerts.push(this.createAlert('disease', diseaseType as DiseaseType, diseaseData, riskLevel, weatherConditions));
        }
      }
    }

    // Sort by risk level
    return alerts.sort((a, b) => b.riskLevel - a.riskLevel);
  }

  /**
   * Get farm-specific risk assessment
   */
  async assessFarmRisk(params: {
    farmId: number;
    farmerId: number;
    crops: string[];
    latitude: number;
    longitude: number;
  }): Promise<FarmRiskAssessment> {
    const { farmId, farmerId, crops, latitude, longitude } = params;

    // Get regional alerts
    const alerts = await this.getRegionalAlerts({ latitude, longitude, radiusKm: 50, crops });

    // Calculate overall risk
    const overallRiskScore = alerts.length > 0
      ? Math.round(alerts.reduce((sum, a) => sum + a.riskLevel, 0) / alerts.length)
      : 0;

    const riskLevel: AlertSeverity = 
      overallRiskScore >= 70 ? 'critical' :
      overallRiskScore >= 50 ? 'high' :
      overallRiskScore >= 30 ? 'medium' : 'low';

    // Generate recommendations
    const recommendations = this.generateRecommendations(alerts, crops);

    // Generate spray schedule
    const spraySchedule = this.generateSpraySchedule(alerts, crops);

    // Generate monitoring points
    const monitoringPoints = this.generateMonitoringPoints(farmId, latitude, longitude);

    // Identify vulnerabilities
    const vulnerabilities = this.identifyVulnerabilities(crops, alerts);

    const assessment: FarmRiskAssessment = {
      farmId,
      farmerId,
      overallRiskScore,
      riskLevel,
      activeThreats: alerts.filter(a => a.riskLevel >= 50),
      vulnerabilities,
      recommendations,
      spraySchedule,
      monitoringPoints,
      lastAssessment: new Date(),
    };

    this.farmAssessments.set(farmId, assessment);

    // Emit event
    try {
      await kafkaProducer.send({
        topic: 'pest-disease-events',
        messages: [{
          key: `farm-${farmId}`,
          value: JSON.stringify({
            event: 'risk_assessment_completed',
            assessment,
            timestamp: new Date().toISOString(),
          }),
        }],
      });
    } catch (error) {
      logger.warn('[PestDiseaseWarning] Could not emit Kafka event:', error);
    }

    return assessment;
  }

  /**
   * Report an outbreak
   */
  async reportOutbreak(params: {
    reporterId: number;
    farmId: number;
    type: 'pest' | 'disease';
    suspectedName: string;
    severity: AlertSeverity;
    affectedArea: number;
    symptoms: string[];
    photos: string[];
    latitude: number;
    longitude: number;
  }): Promise<OutbreakReport> {
    const reportId = `OR-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;

    const report: OutbreakReport = {
      id: reportId,
      reporterId: params.reporterId,
      farmId: params.farmId,
      type: params.type,
      suspectedName: params.suspectedName,
      severity: params.severity,
      affectedArea: params.affectedArea,
      symptoms: params.symptoms,
      photos: params.photos,
      location: { latitude: params.latitude, longitude: params.longitude },
      reportedAt: new Date(),
      verificationStatus: 'pending',
    };

    // AI diagnosis from photos (would integrate with crop disease AI service)
    if (params.photos.length > 0) {
      report.aiDiagnosis = await this.performAIDiagnosis(params.photos, params.symptoms);
    }

    this.outbreakReports.set(reportId, report);

    // Emit alert event
    try {
      await kafkaProducer.send({
        topic: 'pest-disease-events',
        messages: [{
          key: reportId,
          value: JSON.stringify({
            event: 'outbreak_reported',
            report,
            timestamp: new Date().toISOString(),
          }),
        }],
      });
    } catch (error) {
      logger.warn('[PestDiseaseWarning] Could not emit Kafka event:', error);
    }

    return report;
  }

  /**
   * Get treatment recommendations
   */
  getTreatmentRecommendations(params: {
    type: 'pest' | 'disease';
    name: string;
    severity: AlertSeverity;
    organicPreferred: boolean;
  }): TreatmentOption[] {
    const { type, name, severity, organicPreferred } = params;

    let treatments: TreatmentOption[] = [];

    if (type === 'pest') {
      const pestData = PEST_DATABASE[name as PestType];
      if (pestData) {
        treatments = [...pestData.treatments];
      }
    } else {
      const diseaseData = DISEASE_DATABASE[name as DiseaseType];
      if (diseaseData) {
        treatments = [...diseaseData.treatments];
      }
    }

    // Filter by organic preference
    if (organicPreferred) {
      const organicTreatments = treatments.filter(t => 
        t.type === 'biological' || t.type === 'cultural' || t.environmentalImpact === 'low'
      );
      if (organicTreatments.length > 0) {
        treatments = organicTreatments;
      }
    }

    // Sort by effectiveness
    return treatments.sort((a, b) => b.effectiveness - a.effectiveness);
  }

  /**
   * Get spray schedule for a farm
   */
  async getSpraySchedule(farmId: number): Promise<SprayScheduleItem[]> {
    const assessment = this.farmAssessments.get(farmId);
    return assessment?.spraySchedule || [];
  }

  /**
   * Start regional monitoring
   */
  startMonitoring(intervalMs: number = 3600000): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      logger.info('[PestDiseaseWarning] Running regional monitoring...');
      
      // Would scan satellite imagery and weather data for outbreak indicators
      // and update alerts accordingly
    }, intervalMs);

    logger.info('[PestDiseaseWarning] Monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  // Private helper methods

  private async getWeatherConditions(latitude: number, longitude: number): Promise<{
    temperature: number;
    humidity: number;
    rainfall: number;
  }> {
    try {
      const weather = await weatherService.getCurrentWeather(latitude, longitude);
      return {
        temperature: weather?.temp || 28,
        humidity: weather?.humidity || 70,
        rainfall: weather?.precipitation || 0,
      };
    } catch (err) {
      return { temperature: 28, humidity: 70, rainfall: 0 };
    }
  }

  private calculateRisk(
    favorableConditions: { tempMin: number; tempMax: number; humidityMin: number; humidityMax: number },
    currentConditions: { temperature: number; humidity: number; rainfall: number }
  ): number {
    let risk = 0;

    // Temperature risk
    if (currentConditions.temperature >= favorableConditions.tempMin && 
        currentConditions.temperature <= favorableConditions.tempMax) {
      risk += 40;
    } else {
      const tempDiff = Math.min(
        Math.abs(currentConditions.temperature - favorableConditions.tempMin),
        Math.abs(currentConditions.temperature - favorableConditions.tempMax)
      );
      risk += Math.max(0, 40 - tempDiff * 4);
    }

    // Humidity risk
    if (currentConditions.humidity >= favorableConditions.humidityMin && 
        currentConditions.humidity <= favorableConditions.humidityMax) {
      risk += 40;
    } else {
      const humidityDiff = Math.min(
        Math.abs(currentConditions.humidity - favorableConditions.humidityMin),
        Math.abs(currentConditions.humidity - favorableConditions.humidityMax)
      );
      risk += Math.max(0, 40 - humidityDiff * 2);
    }

    // Rainfall bonus for fungal diseases
    if (currentConditions.rainfall > 10) {
      risk += 20;
    }

    return Math.min(100, risk);
  }

  private createAlert(
    type: 'pest' | 'disease',
    name: PestType | DiseaseType,
    data: any,
    riskLevel: number,
    weatherConditions: any
  ): PestDiseaseAlert {
    const severity: AlertSeverity = 
      riskLevel >= 70 ? 'critical' :
      riskLevel >= 50 ? 'high' :
      riskLevel >= 30 ? 'medium' : 'low';

    return {
      id: `ALERT-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
      type,
      name,
      severity,
      affectedCrops: data.affectedCrops,
      affectedRegions: ['Current location'],
      riskLevel,
      description: `${data.name} risk is ${severity} based on current weather conditions`,
      symptoms: data.symptoms,
      spreadFactors: ['Favorable weather conditions', 'Susceptible crop stage'],
      preventiveMeasures: [
        'Regular field scouting',
        'Remove infected plant material',
        'Maintain field hygiene',
      ],
      treatmentOptions: data.treatments,
      reportedCases: 0,
      confirmedCases: 0,
      firstReportedDate: new Date(),
      lastUpdated: new Date(),
      expectedDuration: '2-4 weeks',
      weatherConditions: [
        {
          factor: 'Temperature',
          currentValue: weatherConditions.temperature,
          riskThreshold: data.favorableConditions.tempMax,
          unit: '°C',
          riskLevel: weatherConditions.temperature >= data.favorableConditions.tempMin ? 'favorable' : 'unfavorable',
        },
        {
          factor: 'Humidity',
          currentValue: weatherConditions.humidity,
          riskThreshold: data.favorableConditions.humidityMin,
          unit: '%',
          riskLevel: weatherConditions.humidity >= data.favorableConditions.humidityMin ? 'favorable' : 'unfavorable',
        },
      ],
    };
  }

  private generateRecommendations(alerts: PestDiseaseAlert[], crops: string[]): string[] {
    const recommendations: string[] = [];

    if (alerts.some(a => a.severity === 'critical' || a.severity === 'high')) {
      recommendations.push('Conduct immediate field inspection');
      recommendations.push('Prepare treatment materials');
    }

    recommendations.push('Increase scouting frequency to every 3 days');
    recommendations.push('Monitor weather forecasts for spray timing');
    recommendations.push('Ensure spraying equipment is in good condition');

    if (alerts.some(a => a.type === 'disease')) {
      recommendations.push('Avoid overhead irrigation to reduce leaf wetness');
      recommendations.push('Improve air circulation by proper spacing');
    }

    return recommendations;
  }

  private generateSpraySchedule(alerts: PestDiseaseAlert[], crops: string[]): SprayScheduleItem[] {
    const schedule: SprayScheduleItem[] = [];
    const today = new Date();

    // Preventive spray
    schedule.push({
      id: `SS-${Date.now()}-prev`,
      targetPest: 'preventive',
      product: 'Neem oil + Mancozeb',
      applicationDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000),
      applicationWindow: {
        start: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000),
        end: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000),
      },
      weatherRequirements: ['No rain for 4 hours after application', 'Wind speed < 10 km/h'],
      dosage: '3L neem oil + 2kg Mancozeb per hectare',
      method: 'Foliar spray',
      estimatedCost: 8000,
      status: 'scheduled',
      notes: 'Preventive application for general protection',
    });

    // Add specific treatments for high-risk alerts
    for (const alert of alerts.filter(a => a.riskLevel >= 50)) {
      const treatment = alert.treatmentOptions[0];
      if (treatment) {
        schedule.push({
          id: `SS-${Date.now()}-${alert.name}`,
          targetPest: alert.name,
          product: treatment.name,
          applicationDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
          applicationWindow: {
            start: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000),
            end: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000),
          },
          weatherRequirements: ['No rain for 4 hours', 'Temperature < 35°C'],
          dosage: treatment.dosage,
          method: treatment.applicationMethod,
          estimatedCost: treatment.estimatedCost,
          status: 'scheduled',
          notes: `Treatment for ${alert.name} - ${alert.severity} risk`,
        });
      }
    }

    return schedule;
  }

  private generateMonitoringPoints(farmId: number, latitude: number, longitude: number): MonitoringPoint[] {
    return [
      {
        id: `MP-${farmId}-1`,
        location: { latitude: latitude + 0.001, longitude: longitude + 0.001 },
        description: 'Field entrance - check for pest entry',
        checkFrequency: 'daily',
        photoRequired: false,
      },
      {
        id: `MP-${farmId}-2`,
        location: { latitude, longitude },
        description: 'Field center - main monitoring point',
        checkFrequency: 'daily',
        photoRequired: true,
      },
      {
        id: `MP-${farmId}-3`,
        location: { latitude: latitude - 0.001, longitude: longitude - 0.001 },
        description: 'Field border - check for spread from neighbors',
        checkFrequency: 'weekly',
        photoRequired: false,
      },
    ];
  }

  private identifyVulnerabilities(crops: string[], alerts: PestDiseaseAlert[]): string[] {
    const vulnerabilities: string[] = [];

    for (const crop of crops) {
      const cropAlerts = alerts.filter(a => 
        a.affectedCrops.some(c => c.toLowerCase().includes(crop.toLowerCase()))
      );
      if (cropAlerts.length > 2) {
        vulnerabilities.push(`${crop} is susceptible to multiple threats`);
      }
    }

    if (alerts.some(a => a.type === 'disease' && a.riskLevel >= 50)) {
      vulnerabilities.push('High humidity conditions favor disease development');
    }

    return vulnerabilities;
  }

  private async performAIDiagnosis(photos: string[], symptoms: string[]): Promise<{
    prediction: string;
    confidence: number;
    alternatives: Array<{ name: string; confidence: number }>;
  }> {
    // Would integrate with crop disease AI service
    return {
      prediction: 'Fall Armyworm',
      confidence: 0.85,
      alternatives: [
        { name: 'Stem Borer', confidence: 0.10 },
        { name: 'Aphids', confidence: 0.05 },
      ],
    };
  }
}

export const pestDiseaseWarningService = new PestDiseaseWarningService();
