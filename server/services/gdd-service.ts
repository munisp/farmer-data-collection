/**
 * Growing Degree Days (GDD) Tracking Service
 * 
 * Calculates GDD accumulation for crop development tracking and harvest prediction.
 * Supports 8 major Nigerian crops with accurate phenological models.
 */

// Crop-specific GDD requirements and base temperatures
export const CROP_GDD_REQUIREMENTS = {
  maize: {
    name: 'Maize',
    baseTemp: 10, // °C
    maxTemp: 30, // °C
    gddToMaturity: 1400,
    stages: {
      emergence: 120,
      vegetative: 680,
      flowering: 200,
      grain_fill: 400,
    },
  },
  rice: {
    name: 'Rice',
    baseTemp: 10,
    maxTemp: 35,
    gddToMaturity: 1800,
    stages: {
      emergence: 150,
      vegetative: 900,
      flowering: 300,
      grain_fill: 450,
    },
  },
  sorghum: {
    name: 'Sorghum',
    baseTemp: 10,
    maxTemp: 35,
    gddToMaturity: 1500,
    stages: {
      emergence: 100,
      vegetative: 700,
      flowering: 250,
      grain_fill: 450,
    },
  },
  cassava: {
    name: 'Cassava',
    baseTemp: 15,
    maxTemp: 35,
    gddToMaturity: 5500,
    stages: {
      emergence: 200,
      vegetative: 2800,
      root_bulking: 2000,
      maturity: 500,
    },
  },
  yam: {
    name: 'Yam',
    baseTemp: 15,
    maxTemp: 35,
    gddToMaturity: 4000,
    stages: {
      emergence: 250,
      vegetative: 1800,
      tuber_bulking: 1500,
      maturity: 450,
    },
  },
  cowpea: {
    name: 'Cowpea',
    baseTemp: 10,
    maxTemp: 35,
    gddToMaturity: 1100,
    stages: {
      emergence: 80,
      vegetative: 450,
      flowering: 250,
      pod_fill: 320,
    },
  },
  groundnut: {
    name: 'Groundnut',
    baseTemp: 10,
    maxTemp: 35,
    gddToMaturity: 1300,
    stages: {
      emergence: 100,
      vegetative: 550,
      flowering: 250,
      pod_fill: 400,
    },
  },
  soybean: {
    name: 'Soybean',
    baseTemp: 10,
    maxTemp: 30,
    gddToMaturity: 1200,
    stages: {
      emergence: 100,
      vegetative: 500,
      flowering: 250,
      pod_fill: 350,
    },
  },
} as const;

export type CropTypeGDD = keyof typeof CROP_GDD_REQUIREMENTS;
export type GrowthStage = 'emergence' | 'vegetative' | 'flowering' | 'grain_fill' | 'root_bulking' | 'tuber_bulking' | 'maturity' | 'pod_fill';

export interface DailyWeatherData {
  date: Date;
  tempMax: number; // °C
  tempMin: number; // °C
  tempAvg?: number; // °C (optional, will be calculated if not provided)
}

export interface GDDCalculation {
  date: Date;
  gdd: number;
  cumulativeGDD: number;
  tempMax: number;
  tempMin: number;
  tempAvg: number;
}

export interface CropGrowthStatus {
  cropType: CropTypeGDD;
  plantingDate: Date;
  currentDate: Date;
  daysAfterPlanting: number;
  cumulativeGDD: number;
  gddToMaturity: number;
  percentComplete: number;
  currentStage: string;
  nextStage: string | null;
  gddToNextStage: number;
  estimatedHarvestDate: Date;
  daysToHarvest: number;
  isOnTrack: boolean;
  recommendations: string[];
}

/**
 * Calculate GDD for a single day using the standard method
 * 
 * GDD = ((Tmax + Tmin) / 2) - Tbase
 * 
 * With adjustments:
 * - If Tmax > Tmax_threshold, use Tmax_threshold
 * - If Tmin < Tbase, use Tbase
 * - If GDD < 0, use 0
 */
export function calculateDailyGDD(
  tempMax: number,
  tempMin: number,
  baseTemp: number,
  maxTemp: number
): number {
  // Apply thresholds
  const adjustedMax = Math.min(tempMax, maxTemp);
  const adjustedMin = Math.max(tempMin, baseTemp);
  
  // Calculate average temperature
  const tempAvg = (adjustedMax + adjustedMin) / 2;
  
  // Calculate GDD
  const gdd = Math.max(0, tempAvg - baseTemp);
  
  return gdd;
}

/**
 * Calculate GDD accumulation over a period
 */
export function calculateGDDAccumulation(
  weatherData: DailyWeatherData[],
  cropType: CropTypeGDD
): GDDCalculation[] {
  const crop = CROP_GDD_REQUIREMENTS[cropType];
  let cumulativeGDD = 0;
  
  return weatherData.map((day) => {
    const tempAvg = day.tempAvg || (day.tempMax + day.tempMin) / 2;
    const gdd = calculateDailyGDD(day.tempMax, day.tempMin, crop.baseTemp, crop.maxTemp);
    cumulativeGDD += gdd;
    
    return {
      date: day.date,
      gdd,
      cumulativeGDD,
      tempMax: day.tempMax,
      tempMin: day.tempMin,
      tempAvg,
    };
  });
}

/**
 * Determine current growth stage based on cumulative GDD
 */
export function determineGrowthStage(
  cumulativeGDD: number,
  cropType: CropTypeGDD
): { currentStage: string; nextStage: string | null; gddToNextStage: number } {
  const crop = CROP_GDD_REQUIREMENTS[cropType];
  const stages = Object.entries(crop.stages);
  
  let accumulatedGDD = 0;
  
  for (let i = 0; i < stages.length; i++) {
    const [stageName, stageGDD] = stages[i];
    accumulatedGDD += stageGDD;
    
    if (cumulativeGDD < accumulatedGDD) {
      const nextStage = i < stages.length - 1 ? stages[i + 1][0] : null;
      const gddToNextStage = accumulatedGDD - cumulativeGDD;
      
      return {
        currentStage: stageName.replace(/_/g, ' '),
        nextStage: nextStage ? nextStage.replace(/_/g, ' ') : null,
        gddToNextStage,
      };
    }
  }
  
  // Crop has reached maturity
  return {
    currentStage: 'maturity',
    nextStage: null,
    gddToNextStage: 0,
  };
}

/**
 * Estimate harvest date based on GDD accumulation and weather forecast
 */
export function estimateHarvestDate(
  plantingDate: Date,
  currentDate: Date,
  cumulativeGDD: number,
  cropType: CropTypeGDD,
  avgDailyGDD: number = 15 // Default average GDD per day
): Date {
  const crop = CROP_GDD_REQUIREMENTS[cropType];
  const remainingGDD = crop.gddToMaturity - cumulativeGDD;
  
  if (remainingGDD <= 0) {
    // Crop is already mature
    return currentDate;
  }
  
  // Estimate days to maturity based on average daily GDD
  const daysToMaturity = Math.ceil(remainingGDD / avgDailyGDD);
  
  const harvestDate = new Date(currentDate);
  harvestDate.setDate(harvestDate.getDate() + daysToMaturity);
  
  return harvestDate;
}

/**
 * Get comprehensive crop growth status
 */
export function getCropGrowthStatus(
  plantingDate: Date,
  currentDate: Date,
  weatherData: DailyWeatherData[],
  cropType: CropTypeGDD
): CropGrowthStatus {
  const crop = CROP_GDD_REQUIREMENTS[cropType];
  
  // Calculate GDD accumulation
  const gddCalculations = calculateGDDAccumulation(weatherData, cropType);
  const cumulativeGDD = gddCalculations[gddCalculations.length - 1]?.cumulativeGDD || 0;
  
  // Calculate average daily GDD for harvest prediction
  const avgDailyGDD = cumulativeGDD / weatherData.length;
  
  // Determine growth stage
  const { currentStage, nextStage, gddToNextStage } = determineGrowthStage(cumulativeGDD, cropType);
  
  // Estimate harvest date
  const estimatedHarvestDate = estimateHarvestDate(
    plantingDate,
    currentDate,
    cumulativeGDD,
    cropType,
    avgDailyGDD
  );
  
  // Calculate metrics
  const daysAfterPlanting = Math.floor((currentDate.getTime() - plantingDate.getTime()) / (1000 * 60 * 60 * 24));
  const percentComplete = Math.min(100, (cumulativeGDD / crop.gddToMaturity) * 100);
  const daysToHarvest = Math.floor((estimatedHarvestDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Determine if crop is on track (within 10% of expected progress)
  const expectedGDD = (crop.gddToMaturity / 120) * daysAfterPlanting; // Assume 120-day growing season
  const gddDifference = Math.abs(cumulativeGDD - expectedGDD) / expectedGDD;
  const isOnTrack = gddDifference <= 0.10;
  
  // Generate recommendations
  const recommendations: string[] = [];
  
  if (!isOnTrack && cumulativeGDD < expectedGDD) {
    recommendations.push('⚠️ Crop development is slower than expected. Check for stress factors (water, nutrients, pests).');
  } else if (!isOnTrack && cumulativeGDD > expectedGDD) {
    recommendations.push('⚡ Crop development is faster than expected. Monitor closely for early maturity.');
  }
  
  if (currentStage === 'flowering' || currentStage === 'grain fill' || currentStage === 'pod fill') {
    recommendations.push('💧 Critical growth stage. Ensure adequate water and nutrient supply.');
  }
  
  if (percentComplete > 90) {
    recommendations.push('🌾 Crop approaching maturity. Begin harvest preparations.');
  }
  
  if (daysToHarvest <= 14) {
    recommendations.push('📅 Harvest expected within 2 weeks. Check market prices and arrange logistics.');
  }
  
  return {
    cropType,
    plantingDate,
    currentDate,
    daysAfterPlanting,
    cumulativeGDD,
    gddToMaturity: crop.gddToMaturity,
    percentComplete: Math.round(percentComplete * 10) / 10,
    currentStage,
    nextStage,
    gddToNextStage: Math.round(gddToNextStage),
    estimatedHarvestDate,
    daysToHarvest,
    isOnTrack,
    recommendations,
  };
}

/**
 * Calculate optimal planting date based on historical weather data
 */
export function calculateOptimalPlantingDate(
  historicalWeather: DailyWeatherData[],
  cropType: CropTypeGDD,
  targetHarvestMonth: number // 1-12
): Date | null {
  const crop = CROP_GDD_REQUIREMENTS[cropType];
  
  // Group weather data by year
  const yearlyData = new Map<number, DailyWeatherData[]>();
  historicalWeather.forEach((day) => {
    const year = day.date.getFullYear();
    if (!yearlyData.has(year)) {
      yearlyData.set(year, []);
    }
    yearlyData.get(year)!.push(day);
  });
  
  // For each year, simulate planting at different dates
  const optimalDates: Date[] = [];
  
  yearlyData.forEach((yearData, year) => {
    let bestPlantingDate: Date | null = null;
    let smallestDateDifference = Infinity;
    
    // Try planting dates from January to June
    for (let month = 0; month < 6; month++) {
      const plantingDate = new Date(year, month, 1);
      const plantingDayOfYear = Math.floor((plantingDate.getTime() - new Date(year, 0, 1).getTime()) / (1000 * 60 * 60 * 24));
      
      // Get weather data from planting date onwards
      const relevantWeather = yearData.filter((day) => {
        const dayOfYear = Math.floor((day.date.getTime() - new Date(year, 0, 1).getTime()) / (1000 * 60 * 60 * 24));
        return dayOfYear >= plantingDayOfYear;
      });
      
      if (relevantWeather.length < 90) continue; // Need at least 90 days of data
      
      // Calculate GDD accumulation
      const gddCalcs = calculateGDDAccumulation(relevantWeather, cropType);
      
      // Find when crop reaches maturity
      const maturityIndex = gddCalcs.findIndex((calc) => calc.cumulativeGDD >= crop.gddToMaturity);
      
      if (maturityIndex !== -1) {
        const harvestDate = gddCalcs[maturityIndex].date;
        const harvestMonth = harvestDate.getMonth() + 1;
        
        // Check how close harvest month is to target
        const monthDifference = Math.abs(harvestMonth - targetHarvestMonth);
        
        if (monthDifference < smallestDateDifference) {
          smallestDateDifference = monthDifference;
          bestPlantingDate = plantingDate;
        }
      }
    }
    
    if (bestPlantingDate) {
      optimalDates.push(bestPlantingDate);
    }
  });
  
  if (optimalDates.length === 0) {
    return null;
  }
  
  // Calculate average optimal planting date
  const avgMonth = Math.round(
    optimalDates.reduce((sum, date) => sum + date.getMonth(), 0) / optimalDates.length
  );
  const avgDay = Math.round(
    optimalDates.reduce((sum, date) => sum + date.getDate(), 0) / optimalDates.length
  );
  
  const currentYear = new Date().getFullYear();
  return new Date(currentYear, avgMonth, avgDay);
}

/**
 * Compare actual vs expected GDD accumulation
 */
export function compareGDDProgress(
  actualGDD: number,
  daysAfterPlanting: number,
  cropType: CropTypeGDD,
  expectedGrowingDays: number = 120
): {
  expectedGDD: number;
  difference: number;
  percentDifference: number;
  status: 'ahead' | 'on_track' | 'behind';
} {
  const crop = CROP_GDD_REQUIREMENTS[cropType];
  const expectedGDD = (crop.gddToMaturity / expectedGrowingDays) * daysAfterPlanting;
  const difference = actualGDD - expectedGDD;
  const percentDifference = (difference / expectedGDD) * 100;
  
  let status: 'ahead' | 'on_track' | 'behind';
  if (percentDifference > 10) {
    status = 'ahead';
  } else if (percentDifference < -10) {
    status = 'behind';
  } else {
    status = 'on_track';
  }
  
  return {
    expectedGDD: Math.round(expectedGDD),
    difference: Math.round(difference),
    percentDifference: Math.round(percentDifference * 10) / 10,
    status,
  };
}
