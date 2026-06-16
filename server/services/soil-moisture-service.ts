/**
 * Soil Moisture Monitoring Service
 * 
 * Integrates with NASA SMAP and Copernicus Sentinel for soil moisture data.
 * Provides irrigation recommendations based on crop type and soil conditions.
 */

import axios from 'axios';
import { logger } from '../logger.js';

// Soil moisture data source
export type SoilMoistureSource = 'nasa_smap' | 'copernicus' | 'local_sensor';

// Soil types with different water retention properties
export const SOIL_TYPES = {
  sandy: { name: 'Sandy', fieldCapacity: 0.15, wiltingPoint: 0.05, porosity: 0.40 },
  loamy: { name: 'Loamy', fieldCapacity: 0.30, wiltingPoint: 0.12, porosity: 0.45 },
  clay: { name: 'Clay', fieldCapacity: 0.40, wiltingPoint: 0.20, porosity: 0.50 },
  silty: { name: 'Silty', fieldCapacity: 0.35, wiltingPoint: 0.15, porosity: 0.48 },
} as const;

export type SoilType = keyof typeof SOIL_TYPES;

// Crop-specific moisture thresholds (as percentage of field capacity)
export const CROP_MOISTURE_THRESHOLDS = {
  maize: { optimal: 0.70, critical: 0.50, stress: 0.40 },
  rice: { optimal: 0.90, critical: 0.70, stress: 0.60 },
  cassava: { optimal: 0.60, critical: 0.40, stress: 0.30 },
  yam: { optimal: 0.65, critical: 0.45, stress: 0.35 },
  sorghum: { optimal: 0.65, critical: 0.45, stress: 0.35 },
  cowpea: { optimal: 0.70, critical: 0.50, stress: 0.40 },
  groundnut: { optimal: 0.65, critical: 0.45, stress: 0.35 },
  soybean: { optimal: 0.70, critical: 0.50, stress: 0.40 },
  cotton: { optimal: 0.70, critical: 0.50, stress: 0.40 },
  tomato: { optimal: 0.75, critical: 0.55, stress: 0.45 },
} as const;

export type CropType = keyof typeof CROP_MOISTURE_THRESHOLDS;

export interface SoilMoistureData {
  moisture: number; // Volumetric water content (0-1)
  timestamp: Date;
  source: SoilMoistureSource;
  latitude: number;
  longitude: number;
  depth: number; // Depth in cm
  quality: 'high' | 'medium' | 'low';
}

export interface IrrigationRecommendation {
  shouldIrrigate: boolean;
  urgency: 'immediate' | 'soon' | 'monitor' | 'none';
  waterAmount: number; // mm of water needed
  reason: string;
  nextCheckDate: Date;
  moistureStatus: 'optimal' | 'adequate' | 'critical' | 'stress';
}

/**
 * Fetch soil moisture data from NASA SMAP API
 * 
 * Note: Requires NASA Earthdata account and API key
 * Free tier: 1000 requests/day
 */
export async function fetchNASASMAPData(
  latitude: number,
  longitude: number,
  date?: Date
): Promise<SoilMoistureData | null> {
  const apiKey = process.env.NASA_EARTHDATA_API_KEY;
  
  if (!apiKey) {
    logger.warn('[Soil Moisture] NASA Earthdata API key not configured');
    return null;
  }

  try {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0];

    // NASA SMAP L3 Radiometer Global Daily 36 km EASE-Grid Soil Moisture
    const url = `https://n5eil01u.ecs.nsidc.org/SMAP/SPL3SMP.009/${dateStr}`;
    
    const response = await axios.get(url, {
      params: {
        lat: latitude,
        lon: longitude,
        format: 'json',
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 10000,
    });

    if (response.data && response.data.soil_moisture) {
      return {
        moisture: response.data.soil_moisture / 100, // Convert to 0-1 scale
        timestamp: new Date(response.data.timestamp),
        source: 'nasa_smap',
        latitude,
        longitude,
        depth: 5, // SMAP measures top 5cm
        quality: response.data.quality_flag === 0 ? 'high' : 'medium',
      };
    }

    return null;
  } catch (error) {
    logger.error('[Soil Moisture] Error fetching NASA SMAP data:', error);
    return null;
  }
}

/**
 * Fetch soil moisture data from Copernicus Sentinel
 * 
 * Note: Requires Copernicus account and API key
 * Free tier: Available for research and non-commercial use
 */
export async function fetchCopernicusData(
  latitude: number,
  longitude: number,
  date?: Date
): Promise<SoilMoistureData | null> {
  const apiKey = process.env.COPERNICUS_API_KEY;
  
  if (!apiKey) {
    logger.warn('[Soil Moisture] Copernicus API key not configured');
    return null;
  }

  try {
    const targetDate = date || new Date();
    const dateStr = targetDate.toISOString().split('T')[0];

    // Copernicus Global Land Service - Soil Water Index
    const url = `https://land.copernicus.eu/global/products/swi`;
    
    const response = await axios.get(url, {
      params: {
        lat: latitude,
        lon: longitude,
        date: dateStr,
        format: 'json',
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      timeout: 10000,
    });

    if (response.data && response.data.swi) {
      return {
        moisture: response.data.swi / 100, // Convert to 0-1 scale
        timestamp: new Date(response.data.timestamp),
        source: 'copernicus',
        latitude,
        longitude,
        depth: 10, // Copernicus SWI represents top 10cm
        quality: response.data.quality === 'good' ? 'high' : 'medium',
      };
    }

    return null;
  } catch (error) {
    logger.error('[Soil Moisture] Error fetching Copernicus data:', error);
    return null;
  }
}

/**
 * Get soil moisture data with automatic fallback between sources
 */
export async function getSoilMoisture(
  latitude: number,
  longitude: number,
  date?: Date
): Promise<SoilMoistureData | null> {
  // Try NASA SMAP first (higher resolution)
  let data = await fetchNASASMAPData(latitude, longitude, date);
  
  if (data) {
    return data;
  }

  // Fallback to Copernicus
  data = await fetchCopernicusData(latitude, longitude, date);
  
  if (data) {
    return data;
  }

  // If both APIs fail, return null — no fake data in production
  logger.warn('[Soil Moisture] Both SMAP and Copernicus APIs unavailable');
  return null;
}

/**
 * Calculate irrigation recommendation based on soil moisture and crop needs
 */
export function calculateIrrigationRecommendation(
  soilMoisture: SoilMoistureData,
  cropType: CropType,
  soilType: SoilType,
  growthStage: 'vegetative' | 'flowering' | 'fruiting' | 'maturity' = 'vegetative'
): IrrigationRecommendation {
  const soil = SOIL_TYPES[soilType];
  const crop = CROP_MOISTURE_THRESHOLDS[cropType];

  // Calculate available water content (AWC)
  const awc = soil.fieldCapacity - soil.wiltingPoint;
  
  // Calculate current moisture as percentage of field capacity
  const moisturePercent = (soilMoisture.moisture - soil.wiltingPoint) / awc;

  // Adjust thresholds based on growth stage
  let optimalThreshold = crop.optimal;
  let criticalThreshold = crop.critical;
  let stressThreshold = crop.stress;

  if (growthStage === 'flowering' || growthStage === 'fruiting') {
    // More water needed during critical growth stages
    optimalThreshold *= 1.1;
    criticalThreshold *= 1.1;
    stressThreshold *= 1.1;
  } else if (growthStage === 'maturity') {
    // Less water needed during maturity
    optimalThreshold *= 0.9;
    criticalThreshold *= 0.9;
    stressThreshold *= 0.9;
  }

  // Determine moisture status
  let moistureStatus: IrrigationRecommendation['moistureStatus'];
  let shouldIrrigate = false;
  let urgency: IrrigationRecommendation['urgency'] = 'none';
  let waterAmount = 0;
  let reason = '';
  let nextCheckDays = 3;

  if (moisturePercent >= optimalThreshold) {
    moistureStatus = 'optimal';
    reason = `Soil moisture is optimal for ${cropType}. No irrigation needed.`;
    nextCheckDays = 3;
  } else if (moisturePercent >= criticalThreshold) {
    moistureStatus = 'adequate';
    reason = `Soil moisture is adequate but below optimal. Monitor closely.`;
    urgency = 'monitor';
    nextCheckDays = 2;
  } else if (moisturePercent >= stressThreshold) {
    moistureStatus = 'critical';
    shouldIrrigate = true;
    urgency = 'soon';
    
    // Calculate water needed to reach optimal level
    const targetMoisture = soil.wiltingPoint + (awc * optimalThreshold);
    const deficit = targetMoisture - soilMoisture.moisture;
    waterAmount = Math.round(deficit * 1000); // Convert to mm
    
    reason = `Soil moisture is at critical level. Irrigate within 24-48 hours to prevent stress.`;
    nextCheckDays = 1;
  } else {
    moistureStatus = 'stress';
    shouldIrrigate = true;
    urgency = 'immediate';
    
    // Calculate water needed to reach optimal level
    const targetMoisture = soil.wiltingPoint + (awc * optimalThreshold);
    const deficit = targetMoisture - soilMoisture.moisture;
    waterAmount = Math.round(deficit * 1000); // Convert to mm
    
    reason = `URGENT: Soil moisture is below stress threshold. Immediate irrigation required to prevent crop damage.`;
    nextCheckDays = 1;
  }

  const nextCheckDate = new Date();
  nextCheckDate.setDate(nextCheckDate.getDate() + nextCheckDays);

  return {
    shouldIrrigate,
    urgency,
    waterAmount,
    reason,
    nextCheckDate,
    moistureStatus,
  };
}

/**
 * Get irrigation recommendation for a farm location
 */
export async function getIrrigationRecommendation(
  latitude: number,
  longitude: number,
  cropType: CropType,
  soilType: SoilType,
  growthStage?: 'vegetative' | 'flowering' | 'fruiting' | 'maturity'
): Promise<{
  soilMoisture: SoilMoistureData | null;
  recommendation: IrrigationRecommendation | null;
}> {
  const soilMoisture = await getSoilMoisture(latitude, longitude);

  if (!soilMoisture) {
    return {
      soilMoisture: null,
      recommendation: null,
    };
  }

  const recommendation = calculateIrrigationRecommendation(
    soilMoisture,
    cropType,
    soilType,
    growthStage
  );

  return {
    soilMoisture,
    recommendation,
  };
}

/**
 * Calculate water use efficiency (WUE) for a crop
 * WUE = Yield / Water Used
 */
export function calculateWaterUseEfficiency(
  yieldKg: number,
  waterUsedMm: number,
  fieldAreaHa: number
): number {
  // Convert to kg/m³
  const waterUsedM3 = (waterUsedMm / 1000) * (fieldAreaHa * 10000);
  return yieldKg / waterUsedM3;
}

/**
 * Estimate water savings from optimized irrigation
 */
export function estimateWaterSavings(
  currentWaterUseMm: number,
  fieldAreaHa: number,
  soilType: SoilType
): {
  potentialSavingsMm: number;
  potentialSavingsM3: number;
  costSavingsNGN: number;
  percentageReduction: number;
} {
  // Typical over-irrigation rates by soil type
  const overIrrigationRates = {
    sandy: 0.30, // 30% over-irrigation common in sandy soils
    loamy: 0.20, // 20% over-irrigation in loamy soils
    clay: 0.25, // 25% over-irrigation in clay soils (poor drainage)
    silty: 0.22, // 22% over-irrigation in silty soils
  };

  const overIrrigationRate = overIrrigationRates[soilType];
  const potentialSavingsMm = currentWaterUseMm * overIrrigationRate;
  const potentialSavingsM3 = (potentialSavingsMm / 1000) * (fieldAreaHa * 10000);
  
  // Cost of water in Nigeria (average for irrigation)
  const waterCostPerM3NGN = 50; // ₦50 per m³
  const costSavingsNGN = potentialSavingsM3 * waterCostPerM3NGN;
  
  const percentageReduction = overIrrigationRate * 100;

  return {
    potentialSavingsMm,
    potentialSavingsM3,
    costSavingsNGN,
    percentageReduction,
  };
}
