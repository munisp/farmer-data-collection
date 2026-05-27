/**
 * Yield Prediction and Analytics Service
 * 
 * ML-based yield forecasting using weather, NDVI, soil data, and historical records
 * Provides crop performance analytics and comparative analysis
 */

export interface YieldPredictionInput {
  cropType: string;
  fieldArea: number; // hectares
  plantingDate: Date;
  soilType: string;
  irrigationType: string;
  currentNDVI?: number;
  historicalYields?: number[];
  weatherData?: {
    avgTemperature: number;
    totalRainfall: number;
    avgHumidity: number;
  };
}

export interface YieldPrediction {
  predictedYield: number; // kg/ha or tons/ha
  confidence: number; // 0-100
  minYield: number;
  maxYield: number;
  estimatedHarvestDate: Date;
  factors: {
    weather: number; // contribution percentage
    soil: number;
    management: number;
    historical: number;
  };
  recommendations: string[];
}

export interface CropPerformanceMetrics {
  cropType: string;
  season: string;
  avgYield: number;
  maxYield: number;
  minYield: number;
  yieldVariability: number; // coefficient of variation
  profitability: number; // per hectare
  efficiency: {
    waterUseEfficiency: number;
    nutrientUseEfficiency: number;
    laborEfficiency: number;
  };
}

export interface YieldGap {
  actualYield: number;
  potentialYield: number;
  yieldGap: number; // percentage
  limitingFactors: Array<{
    factor: string;
    impact: number; // percentage
    solution: string;
  }>;
}

/**
 * Predict crop yield using multiple factors
 */
export async function predictYield(
  input: YieldPredictionInput
): Promise<YieldPrediction> {
  // Mock implementation - in production, use ML model (TensorFlow, scikit-learn)
  
  // Base yield by crop type (kg/ha)
  const baseYields: Record<string, number> = {
    'maize': 5000,
    'wheat': 3500,
    'rice': 4500,
    'soybean': 2500,
    'potato': 25000,
    'tomato': 60000,
    'beans': 1500,
    'coffee': 1200,
  };

  const baseYield = baseYields[input.cropType.toLowerCase()] || 3000;

  // Soil type factor
  const soilFactors: Record<string, number> = {
    'clay': 0.9,
    'loam': 1.1,
    'sand': 0.8,
    'silt': 1.0,
  };
  const soilFactor = soilFactors[input.soilType.toLowerCase()] || 1.0;

  // Irrigation factor
  const irrigationFactors: Record<string, number> = {
    'drip': 1.2,
    'sprinkler': 1.15,
    'flood': 1.0,
    'rainfed': 0.85,
  };
  const irrigationFactor = irrigationFactors[input.irrigationType.toLowerCase()] || 1.0;

  // NDVI factor (healthy vegetation: 0.6-0.9)
  let ndviFactor = 1.0;
  if (input.currentNDVI) {
    if (input.currentNDVI > 0.7) ndviFactor = 1.15;
    else if (input.currentNDVI > 0.5) ndviFactor = 1.05;
    else if (input.currentNDVI > 0.3) ndviFactor = 0.9;
    else ndviFactor = 0.7;
  }

  // Weather factor
  let weatherFactor = 1.0;
  if (input.weatherData) {
    const { avgTemperature, totalRainfall } = input.weatherData;
    
    // Optimal temperature range: 20-30°C
    if (avgTemperature < 15 || avgTemperature > 35) weatherFactor *= 0.8;
    else if (avgTemperature >= 20 && avgTemperature <= 30) weatherFactor *= 1.1;
    
    // Optimal rainfall: 400-800mm per season
    if (totalRainfall < 300 || totalRainfall > 1000) weatherFactor *= 0.85;
    else if (totalRainfall >= 400 && totalRainfall <= 800) weatherFactor *= 1.1;
  }

  // Historical trend factor
  let historicalFactor = 1.0;
  if (input.historicalYields && input.historicalYields.length > 0) {
    const avgHistorical = input.historicalYields.reduce((a, b) => a + b, 0) / input.historicalYields.length;
    historicalFactor = avgHistorical / baseYield;
  }

  // Calculate predicted yield
  const predictedYield = baseYield * soilFactor * irrigationFactor * ndviFactor * weatherFactor * historicalFactor;
  
  // Calculate confidence based on data availability
  let confidence = 60;
  if (input.currentNDVI) confidence += 10;
  if (input.weatherData) confidence += 10;
  if (input.historicalYields && input.historicalYields.length >= 3) confidence += 15;
  if (input.soilType && input.irrigationType) confidence += 5;

  // Calculate range (±20%)
  const minYield = predictedYield * 0.8;
  const maxYield = predictedYield * 1.2;

  // Estimate harvest date (simplified)
  const growingPeriodDays: Record<string, number> = {
    'maize': 120,
    'wheat': 150,
    'rice': 140,
    'soybean': 110,
    'potato': 90,
    'tomato': 80,
  };
  const growingDays = growingPeriodDays[input.cropType.toLowerCase()] || 120;
  const estimatedHarvestDate = new Date(input.plantingDate);
  estimatedHarvestDate.setDate(estimatedHarvestDate.getDate() + growingDays);

  // Generate recommendations
  const recommendations: string[] = [];
  
  if (ndviFactor < 1.0) {
    recommendations.push('🌱 Low vegetation health detected. Consider nitrogen application.');
  }
  
  if (weatherFactor < 1.0) {
    recommendations.push('🌦️ Suboptimal weather conditions. Adjust irrigation and fertilization.');
  }
  
  if (soilFactor < 1.0) {
    recommendations.push('🌾 Soil type may limit yield. Consider soil amendments.');
  }
  
  if (irrigationFactor < 1.0) {
    recommendations.push('💧 Upgrade irrigation system for better water efficiency.');
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Conditions are favorable for good yield!');
  }

  return {
    predictedYield: Math.round(predictedYield),
    confidence: Math.round(confidence),
    minYield: Math.round(minYield),
    maxYield: Math.round(maxYield),
    estimatedHarvestDate,
    factors: {
      weather: 30,
      soil: 20,
      management: 35,
      historical: 15,
    },
    recommendations,
  };
}

/**
 * Analyze crop performance over multiple seasons
 */
export function analyzeCropPerformance(
  yields: Array<{ season: string; yield: number; cost: number; revenue: number }>,
  cropType: string
): CropPerformanceMetrics {
  if (yields.length === 0) {
    throw new Error('No yield data available');
  }

  const yieldValues = yields.map(y => y.yield);
  const avgYield = yieldValues.reduce((a, b) => a + b, 0) / yieldValues.length;
  const maxYield = Math.max(...yieldValues);
  const minYield = Math.min(...yieldValues);

  // Calculate coefficient of variation (CV)
  const variance = yieldValues.reduce((sum, y) => sum + Math.pow(y - avgYield, 2), 0) / yieldValues.length;
  const stdDev = Math.sqrt(variance);
  const yieldVariability = (stdDev / avgYield) * 100;

  // Calculate profitability
  const avgProfit = yields.reduce((sum, y) => sum + (y.revenue - y.cost), 0) / yields.length;

  return {
    cropType,
    season: yields[yields.length - 1].season,
    avgYield: Math.round(avgYield),
    maxYield: Math.round(maxYield),
    minYield: Math.round(minYield),
    yieldVariability: Math.round(yieldVariability * 10) / 10,
    profitability: Math.round(avgProfit),
    efficiency: {
      waterUseEfficiency: 1.2, // kg yield per m³ water
      nutrientUseEfficiency: 45, // percentage
      laborEfficiency: 500, // kg per labor-day
    },
  };
}

/**
 * Calculate yield gap and identify limiting factors
 */
export function calculateYieldGap(
  actualYield: number,
  cropType: string,
  soilType: string,
  managementPractices: {
    irrigation: boolean;
    fertilization: boolean;
    pestControl: boolean;
    weedControl: boolean;
  }
): YieldGap {
  // Potential yields under optimal conditions (kg/ha)
  const potentialYields: Record<string, number> = {
    'maize': 10000,
    'wheat': 7000,
    'rice': 9000,
    'soybean': 4500,
    'potato': 45000,
  };

  const potentialYield = potentialYields[cropType.toLowerCase()] || 6000;
  const yieldGap = ((potentialYield - actualYield) / potentialYield) * 100;

  const limitingFactors: Array<{ factor: string; impact: number; solution: string }> = [];

  if (!managementPractices.irrigation) {
    limitingFactors.push({
      factor: 'Water Stress',
      impact: 25,
      solution: 'Install irrigation system (drip or sprinkler)',
    });
  }

  if (!managementPractices.fertilization) {
    limitingFactors.push({
      factor: 'Nutrient Deficiency',
      impact: 30,
      solution: 'Implement soil-test based fertilization program',
    });
  }

  if (!managementPractices.pestControl) {
    limitingFactors.push({
      factor: 'Pest and Disease Pressure',
      impact: 20,
      solution: 'Implement integrated pest management (IPM)',
    });
  }

  if (!managementPractices.weedControl) {
    limitingFactors.push({
      factor: 'Weed Competition',
      impact: 15,
      solution: 'Improve weed control through mulching or herbicides',
    });
  }

  if (soilType === 'sand') {
    limitingFactors.push({
      factor: 'Poor Soil Quality',
      impact: 20,
      solution: 'Add organic matter and improve soil structure',
    });
  }

  return {
    actualYield,
    potentialYield,
    yieldGap: Math.round(yieldGap * 10) / 10,
    limitingFactors,
  };
}

/**
 * Compare yields across different fields or farms
 */
export function compareYields(
  fields: Array<{
    id: string;
    name: string;
    yield: number;
    area: number;
    soilType: string;
    managementScore: number; // 0-100
  }>
): {
  rankings: Array<{ fieldId: string; rank: number; yieldPerHa: number }>;
  insights: string[];
} {
  const rankings = fields
    .map(f => ({
      fieldId: f.id,
      fieldName: f.name,
      yieldPerHa: f.yield / f.area,
      soilType: f.soilType,
      managementScore: f.managementScore,
    }))
    .sort((a, b) => b.yieldPerHa - a.yieldPerHa)
    .map((f, index) => ({
      fieldId: f.fieldId,
      rank: index + 1,
      yieldPerHa: Math.round(f.yieldPerHa),
    }));

  const insights: string[] = [];
  
  const topField = fields.find(f => f.id === rankings[0].fieldId);
  const bottomField = fields.find(f => f.id === rankings[rankings.length - 1].fieldId);

  if (topField && bottomField) {
    const yieldDifference = ((rankings[0].yieldPerHa - rankings[rankings.length - 1].yieldPerHa) / rankings[rankings.length - 1].yieldPerHa) * 100;
    insights.push(`Top performing field yields ${yieldDifference.toFixed(0)}% more than lowest performing field`);

    if (topField.managementScore > bottomField.managementScore + 20) {
      insights.push('Better management practices correlate with higher yields');
    }

    if (topField.soilType === 'loam' && bottomField.soilType === 'sand') {
      insights.push('Soil type appears to be a significant factor in yield differences');
    }
  }

  return {
    rankings,
    insights,
  };
}

/**
 * Forecast seasonal yield trends
 */
export function forecastSeasonalTrends(
  historicalData: Array<{ year: number; season: string; yield: number }>,
  forecastYears: number = 3
): Array<{ year: number; season: string; predictedYield: number; confidence: number }> {
  if (historicalData.length < 3) {
    throw new Error('Insufficient historical data for forecasting');
  }

  // Simple linear regression for trend
  const n = historicalData.length;
  const sumX = historicalData.reduce((sum, d, i) => sum + i, 0);
  const sumY = historicalData.reduce((sum, d) => sum + d.yield, 0);
  const sumXY = historicalData.reduce((sum, d, i) => sum + i * d.yield, 0);
  const sumX2 = historicalData.reduce((sum, d, i) => sum + i * i, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const forecast: Array<{ year: number; season: string; predictedYield: number; confidence: number }> = [];
  const lastYear = historicalData[historicalData.length - 1].year;
  const lastSeason = historicalData[historicalData.length - 1].season;

  for (let i = 1; i <= forecastYears; i++) {
    const predictedYield = intercept + slope * (n + i - 1);
    const confidence = Math.max(50, 90 - i * 10); // Confidence decreases with forecast distance

    forecast.push({
      year: lastYear + i,
      season: lastSeason,
      predictedYield: Math.round(predictedYield),
      confidence,
    });
  }

  return forecast;
}

/**
 * Calculate return on investment (ROI) for different scenarios
 */
export function calculateROI(
  scenarios: Array<{
    name: string;
    investment: number;
    expectedYieldIncrease: number; // percentage
    marketPrice: number; // per kg
    area: number; // hectares
    baseYield: number; // kg/ha
  }>
): Array<{
  scenario: string;
  investment: number;
  additionalRevenue: number;
  roi: number; // percentage
  paybackPeriod: number; // years
}> {
  return scenarios.map(s => {
    const baseRevenue = s.baseYield * s.area * s.marketPrice;
    const newYield = s.baseYield * (1 + s.expectedYieldIncrease / 100);
    const newRevenue = newYield * s.area * s.marketPrice;
    const additionalRevenue = newRevenue - baseRevenue;
    const roi = ((additionalRevenue - s.investment) / s.investment) * 100;
    const paybackPeriod = s.investment / additionalRevenue;

    return {
      scenario: s.name,
      investment: s.investment,
      additionalRevenue: Math.round(additionalRevenue),
      roi: Math.round(roi * 10) / 10,
      paybackPeriod: Math.round(paybackPeriod * 10) / 10,
    };
  });
}

/**
 * Generate yield optimization recommendations
 */
export function generateOptimizationRecommendations(
  currentYield: number,
  potentialYield: number,
  cropType: string,
  constraints: {
    budget: number;
    waterAvailability: 'low' | 'medium' | 'high';
    laborAvailability: 'low' | 'medium' | 'high';
  }
): Array<{
  recommendation: string;
  expectedImpact: number; // percentage yield increase
  cost: number;
  priority: 'high' | 'medium' | 'low';
}> {
  const recommendations: Array<any> = [];

  const yieldGapPercent = ((potentialYield - currentYield) / potentialYield) * 100;

  if (yieldGapPercent > 40) {
    if (constraints.budget > 5000 && constraints.waterAvailability !== 'low') {
      recommendations.push({
        recommendation: 'Install drip irrigation system',
        expectedImpact: 25,
        cost: 8000,
        priority: 'high',
      });
    }

    recommendations.push({
      recommendation: 'Implement soil testing and targeted fertilization',
      expectedImpact: 20,
      cost: 1500,
      priority: 'high',
    });
  }

  if (yieldGapPercent > 20) {
    recommendations.push({
      recommendation: 'Adopt improved seed varieties',
      expectedImpact: 15,
      cost: 2000,
      priority: 'high',
    });

    if (constraints.laborAvailability !== 'low') {
      recommendations.push({
        recommendation: 'Implement integrated pest management',
        expectedImpact: 12,
        cost: 800,
        priority: 'medium',
      });
    }
  }

  recommendations.push({
    recommendation: 'Improve weed control practices',
    expectedImpact: 10,
    cost: 500,
    priority: 'medium',
  });

  recommendations.push({
    recommendation: 'Optimize planting density and timing',
    expectedImpact: 8,
    cost: 200,
    priority: 'medium',
  });

  // Filter by budget
  return recommendations.filter(r => r.cost <= constraints.budget);
}
