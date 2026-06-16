/**
 * Water Management & Irrigation Optimization Service
 * Integrates with weather service, soil moisture sensors, and satellite imagery
 * Provides irrigation scheduling and water conservation recommendations
 */

import { db } from "../db.js";
import { BoundedMap } from "../cache/bounded-map.js";
import { weatherService } from "./weather-service.js";
import { satelliteImageryService } from "./satellite-imagery-service.js";
import { publishEvent, createEvent, getProducer } from "../kafka.js";
import { logger } from '../logger.js';
const kafkaProducer = { send: async (payload: Record<string, any>) => { const p = await getProducer(); if (p) return p.send(payload as any); } };

export type IrrigationType = 
  | 'drip' 
  | 'sprinkler' 
  | 'flood' 
  | 'furrow' 
  | 'center_pivot'
  | 'manual'
  | 'rainfed';

export type WaterSource = 
  | 'borehole' 
  | 'river' 
  | 'dam' 
  | 'rainwater_harvesting' 
  | 'municipal'
  | 'pond';

export interface IrrigationSystem {
  id: string;
  farmId: number;
  type: IrrigationType;
  waterSource: WaterSource;
  coverageArea: number; // hectares
  flowRate: number; // liters per hour
  efficiency: number; // percentage
  installationDate: Date;
  lastMaintenance?: Date;
  status: 'active' | 'maintenance' | 'inactive';
  sensors: SoilMoistureSensor[];
}

export interface SoilMoistureSensor {
  id: string;
  location: { latitude: number; longitude: number };
  depth: number; // cm
  currentReading: number; // percentage
  lastReading: Date;
  batteryLevel: number;
  status: 'online' | 'offline' | 'low_battery';
}

export interface IrrigationSchedule {
  id: string;
  farmId: number;
  cropId: number;
  cropName: string;
  scheduleItems: IrrigationEvent[];
  waterBudget: WaterBudget;
  optimizationScore: number;
  createdAt: Date;
  validUntil: Date;
}

export interface IrrigationEvent {
  id: string;
  scheduledDate: Date;
  duration: number; // minutes
  waterVolume: number; // liters
  zone: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  status: 'scheduled' | 'in_progress' | 'completed' | 'skipped';
  weatherAdjusted: boolean;
  adjustmentReason?: string;
}

export interface WaterBudget {
  totalAllocation: number; // liters
  used: number;
  remaining: number;
  projectedUsage: number;
  savingsFromOptimization: number;
  period: { start: Date; end: Date };
}

export interface CropWaterRequirement {
  cropName: string;
  growthStage: string;
  dailyWaterNeed: number; // mm
  criticalPeriods: string[];
  droughtTolerance: 'low' | 'medium' | 'high';
  waterloggingTolerance: 'low' | 'medium' | 'high';
  optimalSoilMoisture: { min: number; max: number };
}

export interface WaterConservationTip {
  id: string;
  category: 'irrigation' | 'harvesting' | 'storage' | 'efficiency';
  title: string;
  description: string;
  potentialSavings: number; // percentage
  implementationCost: 'low' | 'medium' | 'high';
  difficulty: 'easy' | 'moderate' | 'complex';
  applicableCrops: string[];
}

export interface RainwaterHarvestingPlan {
  id: string;
  farmId: number;
  catchmentArea: number; // sq meters
  annualRainfall: number; // mm
  potentialHarvest: number; // liters per year
  storageCapacity: number; // liters
  recommendedTanks: TankRecommendation[];
  estimatedCost: number;
  paybackPeriod: number; // months
  waterSavings: number; // percentage of irrigation needs
}

export interface TankRecommendation {
  type: string;
  capacity: number; // liters
  quantity: number;
  unitCost: number;
  totalCost: number;
  material: string;
  lifespan: number; // years
}

// Crop water requirements database
const CROP_WATER_REQUIREMENTS: Record<string, CropWaterRequirement> = {
  maize: {
    cropName: 'Maize',
    growthStage: 'vegetative',
    dailyWaterNeed: 5.5,
    criticalPeriods: ['Tasseling', 'Silking', 'Grain filling'],
    droughtTolerance: 'medium',
    waterloggingTolerance: 'low',
    optimalSoilMoisture: { min: 50, max: 70 },
  },
  rice: {
    cropName: 'Rice',
    growthStage: 'vegetative',
    dailyWaterNeed: 8.0,
    criticalPeriods: ['Transplanting', 'Flowering', 'Grain filling'],
    droughtTolerance: 'low',
    waterloggingTolerance: 'high',
    optimalSoilMoisture: { min: 80, max: 100 },
  },
  tomato: {
    cropName: 'Tomato',
    growthStage: 'fruiting',
    dailyWaterNeed: 6.0,
    criticalPeriods: ['Flowering', 'Fruit set', 'Fruit development'],
    droughtTolerance: 'low',
    waterloggingTolerance: 'low',
    optimalSoilMoisture: { min: 60, max: 80 },
  },
  cassava: {
    cropName: 'Cassava',
    growthStage: 'establishment',
    dailyWaterNeed: 4.0,
    criticalPeriods: ['First 3 months after planting'],
    droughtTolerance: 'high',
    waterloggingTolerance: 'low',
    optimalSoilMoisture: { min: 40, max: 60 },
  },
  yam: {
    cropName: 'Yam',
    growthStage: 'tuber development',
    dailyWaterNeed: 5.0,
    criticalPeriods: ['Vine development', 'Tuber initiation'],
    droughtTolerance: 'medium',
    waterloggingTolerance: 'low',
    optimalSoilMoisture: { min: 50, max: 70 },
  },
  palm_oil: {
    cropName: 'Oil Palm',
    growthStage: 'mature',
    dailyWaterNeed: 5.5,
    criticalPeriods: ['Flowering', 'Fruit development'],
    droughtTolerance: 'medium',
    waterloggingTolerance: 'medium',
    optimalSoilMoisture: { min: 60, max: 80 },
  },
  cocoa: {
    cropName: 'Cocoa',
    growthStage: 'mature',
    dailyWaterNeed: 4.5,
    criticalPeriods: ['Flowering', 'Pod development'],
    droughtTolerance: 'low',
    waterloggingTolerance: 'low',
    optimalSoilMoisture: { min: 60, max: 75 },
  },
  pepper: {
    cropName: 'Pepper',
    growthStage: 'fruiting',
    dailyWaterNeed: 5.0,
    criticalPeriods: ['Flowering', 'Fruit set'],
    droughtTolerance: 'low',
    waterloggingTolerance: 'low',
    optimalSoilMoisture: { min: 55, max: 75 },
  },
  groundnut: {
    cropName: 'Groundnut',
    growthStage: 'pegging',
    dailyWaterNeed: 4.5,
    criticalPeriods: ['Flowering', 'Pegging', 'Pod development'],
    droughtTolerance: 'medium',
    waterloggingTolerance: 'low',
    optimalSoilMoisture: { min: 45, max: 65 },
  },
  ginger: {
    cropName: 'Ginger',
    growthStage: 'rhizome development',
    dailyWaterNeed: 5.5,
    criticalPeriods: ['Sprouting', 'Rhizome bulking'],
    droughtTolerance: 'low',
    waterloggingTolerance: 'low',
    optimalSoilMoisture: { min: 60, max: 80 },
  },
};

// Water conservation tips
const CONSERVATION_TIPS: WaterConservationTip[] = [
  {
    id: 'tip_001',
    category: 'irrigation',
    title: 'Switch to Drip Irrigation',
    description: 'Drip irrigation delivers water directly to plant roots, reducing evaporation and runoff by up to 50%.',
    potentialSavings: 50,
    implementationCost: 'high',
    difficulty: 'moderate',
    applicableCrops: ['tomato', 'pepper', 'vegetables'],
  },
  {
    id: 'tip_002',
    category: 'irrigation',
    title: 'Irrigate Early Morning or Evening',
    description: 'Watering during cooler parts of the day reduces evaporation losses by 25-30%.',
    potentialSavings: 25,
    implementationCost: 'low',
    difficulty: 'easy',
    applicableCrops: ['all'],
  },
  {
    id: 'tip_003',
    category: 'efficiency',
    title: 'Apply Mulching',
    description: 'Organic mulch reduces soil evaporation by 25-50% and keeps soil temperature stable.',
    potentialSavings: 35,
    implementationCost: 'low',
    difficulty: 'easy',
    applicableCrops: ['all'],
  },
  {
    id: 'tip_004',
    category: 'harvesting',
    title: 'Install Rainwater Harvesting',
    description: 'Capture roof runoff to supplement irrigation needs during dry periods.',
    potentialSavings: 40,
    implementationCost: 'medium',
    difficulty: 'moderate',
    applicableCrops: ['all'],
  },
  {
    id: 'tip_005',
    category: 'efficiency',
    title: 'Use Soil Moisture Sensors',
    description: 'Sensors help irrigate only when needed, preventing over-watering and saving 20-30% water.',
    potentialSavings: 25,
    implementationCost: 'medium',
    difficulty: 'moderate',
    applicableCrops: ['all'],
  },
  {
    id: 'tip_006',
    category: 'storage',
    title: 'Build Farm Ponds',
    description: 'Small farm ponds can store rainwater for dry season irrigation.',
    potentialSavings: 30,
    implementationCost: 'high',
    difficulty: 'complex',
    applicableCrops: ['all'],
  },
  {
    id: 'tip_007',
    category: 'irrigation',
    title: 'Deficit Irrigation Strategy',
    description: 'Apply less water during drought-tolerant growth stages to save water without yield loss.',
    potentialSavings: 20,
    implementationCost: 'low',
    difficulty: 'moderate',
    applicableCrops: ['maize', 'sorghum', 'cassava'],
  },
  {
    id: 'tip_008',
    category: 'efficiency',
    title: 'Maintain Irrigation Equipment',
    description: 'Fix leaks and clean filters regularly to maintain system efficiency.',
    potentialSavings: 15,
    implementationCost: 'low',
    difficulty: 'easy',
    applicableCrops: ['all'],
  },
];

class WaterManagementService {
  private irrigationSystems: BoundedMap<string, IrrigationSystem> = new BoundedMap(2000, 86400_000);
  private schedules: BoundedMap<string, IrrigationSchedule> = new BoundedMap(5000, 86400_000);

  /**
   * Calculate crop water requirements
   */
  async calculateWaterRequirements(params: {
    cropName: string;
    fieldSize: number; // hectares
    growthStage: string;
    latitude: number;
    longitude: number;
  }): Promise<{
    dailyRequirement: number; // liters
    weeklyRequirement: number;
    monthlyRequirement: number;
    adjustedForWeather: boolean;
    weatherAdjustment: number;
    recommendations: string[];
  }> {
    const { cropName, fieldSize, growthStage, latitude, longitude } = params;

    const cropKey = cropName.toLowerCase().replace(/\s+/g, '_');
    const cropReq = CROP_WATER_REQUIREMENTS[cropKey] || {
      dailyWaterNeed: 5.0,
      optimalSoilMoisture: { min: 50, max: 70 },
    };

    // Base calculation: mm/day * hectares * 10,000 m²/ha * 1 L/m²/mm
    const baseDailyLiters = cropReq.dailyWaterNeed * fieldSize * 10000;

    // Get weather data for adjustment
    let weatherAdjustment = 1.0;
    let adjustedForWeather = false;
    const recommendations: string[] = [];

    try {
      const weather = await weatherService.getCurrentWeather(latitude, longitude);
      
      if (weather) {
        const currentTemperature = weather.temperature;
        const recentRainfall = 0;

        // Adjust for temperature
        if (currentTemperature > 35) {
          weatherAdjustment *= 1.2;
          recommendations.push('High temperature - increase irrigation by 20%');
        } else if (currentTemperature < 20) {
          weatherAdjustment *= 0.8;
          recommendations.push('Cool weather - reduce irrigation by 20%');
        }

        // Adjust for humidity
        if (weather.humidity < 40) {
          weatherAdjustment *= 1.15;
          recommendations.push('Low humidity - increase irrigation by 15%');
        } else if (weather.humidity > 80) {
          weatherAdjustment *= 0.85;
          recommendations.push('High humidity - reduce irrigation by 15%');
        }

        // Adjust for recent rainfall when precipitation data is available from downstream providers
        if (recentRainfall > 10) {
          weatherAdjustment *= 0.5;
          recommendations.push('Recent rainfall - reduce irrigation by 50%');
        } else if (recentRainfall > 5) {
          weatherAdjustment *= 0.7;
          recommendations.push('Light rainfall - reduce irrigation by 30%');
        }

        adjustedForWeather = true;
      }
    } catch (error) {
      logger.warn('[WaterManagement] Could not get weather data:', error);
      recommendations.push('Weather data unavailable - using standard calculations');
    }

    const adjustedDailyLiters = Math.round(baseDailyLiters * weatherAdjustment);

    // Add growth stage recommendations
    if (cropReq.criticalPeriods?.some(p => growthStage.toLowerCase().includes(p.toLowerCase()))) {
      recommendations.push(`Critical growth period - ensure consistent moisture`);
    }

    return {
      dailyRequirement: adjustedDailyLiters,
      weeklyRequirement: adjustedDailyLiters * 7,
      monthlyRequirement: adjustedDailyLiters * 30,
      adjustedForWeather,
      weatherAdjustment: Math.round((weatherAdjustment - 1) * 100),
      recommendations,
    };
  }

  /**
   * Generate irrigation schedule
   */
  async generateIrrigationSchedule(params: {
    farmId: number;
    cropId: number;
    cropName: string;
    fieldSize: number;
    irrigationType: IrrigationType;
    latitude: number;
    longitude: number;
    daysAhead: number;
  }): Promise<IrrigationSchedule> {
    const { farmId, cropId, cropName, fieldSize, irrigationType, latitude, longitude, daysAhead } = params;

    const waterReq = await this.calculateWaterRequirements({
      cropName,
      fieldSize,
      growthStage: 'vegetative',
      latitude,
      longitude,
    });

    const scheduleItems: IrrigationEvent[] = [];
    const today = new Date();

    // Determine irrigation frequency based on type
    const frequencyDays = irrigationType === 'drip' ? 1 : 
                          irrigationType === 'sprinkler' ? 2 : 3;

    for (let i = 0; i < daysAhead; i += frequencyDays) {
      const eventDate = new Date(today);
      eventDate.setDate(eventDate.getDate() + i);
      eventDate.setHours(6, 0, 0, 0); // Early morning irrigation

      const dailyVolume = waterReq.dailyRequirement * frequencyDays;
      const duration = this.calculateIrrigationDuration(dailyVolume, irrigationType, fieldSize);

      scheduleItems.push({
        id: `IE-${Date.now()}-${i}`,
        scheduledDate: eventDate,
        duration,
        waterVolume: dailyVolume,
        zone: 'Zone A',
        priority: i < 7 ? 'high' : 'normal',
        status: 'scheduled',
        weatherAdjusted: false,
      });
    }

    // Calculate water budget
    const totalWater = scheduleItems.reduce((sum, item) => sum + item.waterVolume, 0);
    const waterBudget: WaterBudget = {
      totalAllocation: totalWater,
      used: 0,
      remaining: totalWater,
      projectedUsage: totalWater,
      savingsFromOptimization: Math.round(totalWater * 0.15), // Estimated 15% savings
      period: {
        start: today,
        end: new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000),
      },
    };

    const scheduleId = `IS-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const schedule: IrrigationSchedule = {
      id: scheduleId,
      farmId,
      cropId,
      cropName,
      scheduleItems,
      waterBudget,
      optimizationScore: 75, // Would be calculated based on efficiency
      createdAt: new Date(),
      validUntil: new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000),
    };

    this.schedules.set(scheduleId, schedule);

    // Emit event
    try {
      await kafkaProducer.send({
        topic: 'irrigation-events',
        messages: [{
          key: scheduleId,
          value: JSON.stringify({
            event: 'schedule_created',
            schedule,
            timestamp: new Date().toISOString(),
          }),
        }],
      });
    } catch (error) {
      logger.warn('[WaterManagement] Could not emit Kafka event:', error);
    }

    return schedule;
  }

  /**
   * Get rainwater harvesting plan
   */
  async getRainwaterHarvestingPlan(params: {
    farmId: number;
    roofArea: number; // sq meters
    latitude: number;
    longitude: number;
    irrigationNeeds: number; // liters per month
  }): Promise<RainwaterHarvestingPlan> {
    const { farmId, roofArea, latitude, longitude, irrigationNeeds } = params;

    // Estimate annual rainfall (would come from weather service)
    const annualRainfall = 1200; // mm - typical for southern Nigeria

    // Calculate potential harvest (80% collection efficiency)
    const collectionEfficiency = 0.8;
    const potentialHarvest = Math.round(roofArea * annualRainfall * collectionEfficiency);

    // Recommend storage capacity (2-3 months of irrigation needs)
    const recommendedStorage = irrigationNeeds * 2.5;

    // Tank recommendations
    const tankRecommendations: TankRecommendation[] = [];

    if (recommendedStorage <= 5000) {
      tankRecommendations.push({
        type: 'Plastic Tank',
        capacity: 5000,
        quantity: 1,
        unitCost: 150000,
        totalCost: 150000,
        material: 'HDPE Plastic',
        lifespan: 15,
      });
    } else if (recommendedStorage <= 10000) {
      tankRecommendations.push({
        type: 'Plastic Tank',
        capacity: 5000,
        quantity: 2,
        unitCost: 150000,
        totalCost: 300000,
        material: 'HDPE Plastic',
        lifespan: 15,
      });
    } else {
      tankRecommendations.push({
        type: 'Concrete Underground Tank',
        capacity: Math.ceil(recommendedStorage / 1000) * 1000,
        quantity: 1,
        unitCost: 50000, // per 1000L
        totalCost: Math.ceil(recommendedStorage / 1000) * 50000,
        material: 'Reinforced Concrete',
        lifespan: 30,
      });
    }

    // Add gutters and pipes cost
    const gutterCost = roofArea * 500; // NGN per sq meter
    const totalCost = tankRecommendations.reduce((sum, t) => sum + t.totalCost, 0) + gutterCost;

    // Calculate payback period
    const waterCostPerLiter = 0.5; // NGN
    const annualSavings = Math.min(potentialHarvest, irrigationNeeds * 12) * waterCostPerLiter;
    const paybackPeriod = Math.round((totalCost / annualSavings) * 12);

    // Water savings percentage
    const waterSavings = Math.round((Math.min(potentialHarvest, irrigationNeeds * 12) / (irrigationNeeds * 12)) * 100);

    return {
      id: `RWH-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
      farmId,
      catchmentArea: roofArea,
      annualRainfall,
      potentialHarvest,
      storageCapacity: recommendedStorage,
      recommendedTanks: tankRecommendations,
      estimatedCost: totalCost,
      paybackPeriod,
      waterSavings,
    };
  }

  /**
   * Get water conservation tips
   */
  getConservationTips(params?: {
    cropName?: string;
    category?: WaterConservationTip['category'];
  }): WaterConservationTip[] {
    let tips = [...CONSERVATION_TIPS];

    if (params?.cropName) {
      tips = tips.filter(t => 
        t.applicableCrops.includes('all') || 
        t.applicableCrops.some(c => c.toLowerCase() === params.cropName?.toLowerCase())
      );
    }

    if (params?.category) {
      tips = tips.filter(t => t.category === params.category);
    }

    return tips.sort((a, b) => b.potentialSavings - a.potentialSavings);
  }

  /**
   * Get soil moisture status
   */
  async getSoilMoistureStatus(params: {
    farmId: number;
    cropName: string;
    sensorMoisture?: number;
  }): Promise<{
    currentMoisture: number;
    optimalRange: { min: number; max: number };
    status: 'too_dry' | 'optimal' | 'too_wet';
    recommendation: string;
    irrigationNeeded: boolean;
    urgency: 'immediate' | 'soon' | 'not_needed';
  }> {
    const { farmId, cropName, sensorMoisture } = params;

    const cropKey = cropName.toLowerCase().replace(/\s+/g, '_');
    const cropReq = CROP_WATER_REQUIREMENTS[cropKey] || {
      optimalSoilMoisture: { min: 50, max: 70 },
    };

    // Use real sensor data if provided, otherwise use crop midpoint as baseline
    const currentMoisture = sensorMoisture ?? (cropReq.optimalSoilMoisture.min + cropReq.optimalSoilMoisture.max) / 2;

    let status: 'too_dry' | 'optimal' | 'too_wet';
    let recommendation: string;
    let irrigationNeeded: boolean;
    let urgency: 'immediate' | 'soon' | 'not_needed';

    if (currentMoisture < cropReq.optimalSoilMoisture.min) {
      status = 'too_dry';
      irrigationNeeded = true;
      if (currentMoisture < cropReq.optimalSoilMoisture.min - 15) {
        urgency = 'immediate';
        recommendation = 'Soil is critically dry. Irrigate immediately to prevent crop stress.';
      } else {
        urgency = 'soon';
        recommendation = 'Soil moisture is below optimal. Schedule irrigation within 24 hours.';
      }
    } else if (currentMoisture > cropReq.optimalSoilMoisture.max) {
      status = 'too_wet';
      irrigationNeeded = false;
      urgency = 'not_needed';
      recommendation = 'Soil is adequately moist. Skip next irrigation to prevent waterlogging.';
    } else {
      status = 'optimal';
      irrigationNeeded = false;
      urgency = 'not_needed';
      recommendation = 'Soil moisture is optimal. Continue with regular irrigation schedule.';
    }

    return {
      currentMoisture: Math.round(currentMoisture),
      optimalRange: cropReq.optimalSoilMoisture,
      status,
      recommendation,
      irrigationNeeded,
      urgency,
    };
  }

  /**
   * Register irrigation system
   */
  async registerIrrigationSystem(params: {
    farmId: number;
    type: IrrigationType;
    waterSource: WaterSource;
    coverageArea: number;
    flowRate: number;
  }): Promise<IrrigationSystem> {
    const systemId = `IRRIG-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;

    // Calculate efficiency based on type
    const efficiencyByType: Record<IrrigationType, number> = {
      drip: 90,
      sprinkler: 75,
      center_pivot: 80,
      furrow: 60,
      flood: 50,
      manual: 55,
      rainfed: 100, // No water loss from irrigation
    };

    const system: IrrigationSystem = {
      id: systemId,
      farmId: params.farmId,
      type: params.type,
      waterSource: params.waterSource,
      coverageArea: params.coverageArea,
      flowRate: params.flowRate,
      efficiency: efficiencyByType[params.type],
      installationDate: new Date(),
      status: 'active',
      sensors: [],
    };

    this.irrigationSystems.set(systemId, system);

    return system;
  }

  /**
   * Get crop water requirements info
   */
  getCropWaterInfo(cropName: string): CropWaterRequirement | null {
    const cropKey = cropName.toLowerCase().replace(/\s+/g, '_');
    return CROP_WATER_REQUIREMENTS[cropKey] || null;
  }

  /**
   * Get all crop water requirements
   */
  getAllCropWaterRequirements(): CropWaterRequirement[] {
    return Object.values(CROP_WATER_REQUIREMENTS);
  }

  /**
   * Get irrigation schedule for a farm
   */
  async getFarmSchedule(farmId: number): Promise<IrrigationSchedule | null> {
    for (const schedule of this.schedules.values()) {
      if (schedule.farmId === farmId) {
        return schedule;
      }
    }
    return null;
  }

  // Private helper methods

  private calculateIrrigationDuration(
    waterVolume: number, 
    irrigationType: IrrigationType, 
    fieldSize: number
  ): number {
    // Flow rates in liters per minute per hectare
    const flowRates: Record<IrrigationType, number> = {
      drip: 100,
      sprinkler: 200,
      center_pivot: 300,
      furrow: 500,
      flood: 1000,
      manual: 50,
      rainfed: 0,
    };

    const flowRate = flowRates[irrigationType] * fieldSize;
    if (flowRate === 0) return 0;

    return Math.round(waterVolume / flowRate);
  }
}

export const waterManagementService = new WaterManagementService();
