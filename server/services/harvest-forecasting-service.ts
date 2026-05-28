/**
 * Harvest Forecasting & Market Timing Service
 * Integrates with ML models, weather service, and marketplace for optimal selling
 * Provides yield predictions and price trend analysis
 */

import { db } from "../db.js";
import { BoundedMap } from "../cache/bounded-map.js";
import { weatherService } from "./weather-service.js";
import { predictYield } from "./yieldPredictionService.js";
import { publishEvent, createEvent, getProducer } from "../kafka.js";
import { logger } from '../logger.js';
const kafkaProducer = { send: async (payload: Record<string, any>) => { const p = await getProducer(); if (p) return p.send(payload as any); } };

export interface HarvestForecast {
  id: string;
  farmerId: number;
  farmId: number;
  cropId: number;
  cropName: string;
  plantingDate: Date;
  expectedHarvestDate: Date;
  harvestWindow: { start: Date; end: Date };
  predictedYield: number;
  yieldUnit: string;
  confidenceLevel: number;
  qualityPrediction: QualityPrediction;
  weatherRisks: WeatherRisk[];
  recommendations: string[];
  updatedAt: Date;
}

export interface QualityPrediction {
  gradeA: number; // percentage
  gradeB: number;
  gradeC: number;
  factors: string[];
}

export interface WeatherRisk {
  type: string;
  probability: number;
  impact: 'low' | 'medium' | 'high';
  mitigationAdvice: string;
}

export interface PriceForecast {
  cropName: string;
  currentPrice: number;
  currency: string;
  unit: string;
  forecasts: PricePrediction[];
  trend: 'rising' | 'falling' | 'stable';
  volatility: 'low' | 'medium' | 'high';
  bestSellingWindow: { start: Date; end: Date };
  priceDrivers: string[];
}

export interface PricePrediction {
  date: Date;
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export interface MarketOpportunity {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerType: 'processor' | 'exporter' | 'retailer' | 'cooperative' | 'aggregator';
  cropName: string;
  requiredQuantity: number;
  unit: string;
  offeredPrice: number;
  currency: string;
  deliveryLocation: string;
  deliveryDeadline: Date;
  qualityRequirements: string[];
  paymentTerms: string;
  contractType: 'spot' | 'forward' | 'contract_farming';
  matchScore: number;
}

export interface ContractFarmingOffer {
  id: string;
  buyerId: string;
  buyerName: string;
  cropName: string;
  targetQuantity: number;
  unit: string;
  guaranteedPrice: number;
  currency: string;
  inputSupport: boolean;
  technicalSupport: boolean;
  insuranceIncluded: boolean;
  requirements: string[];
  applicationDeadline: Date;
  plantingWindow: { start: Date; end: Date };
  status: 'open' | 'applied' | 'accepted' | 'rejected';
}

// Crop growth cycles (days from planting to harvest)
const CROP_GROWTH_CYCLES: Record<string, { minDays: number; maxDays: number; optimalDays: number }> = {
  'maize': { minDays: 90, maxDays: 120, optimalDays: 105 },
  'rice': { minDays: 100, maxDays: 150, optimalDays: 120 },
  'cassava': { minDays: 270, maxDays: 365, optimalDays: 300 },
  'yam': { minDays: 240, maxDays: 300, optimalDays: 270 },
  'tomato': { minDays: 60, maxDays: 90, optimalDays: 75 },
  'pepper': { minDays: 70, maxDays: 100, optimalDays: 85 },
  'groundnut': { minDays: 90, maxDays: 130, optimalDays: 110 },
  'cowpea': { minDays: 60, maxDays: 90, optimalDays: 75 },
  'soybean': { minDays: 100, maxDays: 130, optimalDays: 115 },
  'palm_oil': { minDays: 1095, maxDays: 1460, optimalDays: 1277 }, // 3-4 years
  'cocoa': { minDays: 1460, maxDays: 1825, optimalDays: 1642 }, // 4-5 years
  'coffee': { minDays: 1095, maxDays: 1460, optimalDays: 1277 }, // 3-4 years
  'ginger': { minDays: 240, maxDays: 300, optimalDays: 270 },
  'banana': { minDays: 270, maxDays: 365, optimalDays: 300 },
};

// Base prices per kg (NGN)
const BASE_PRICES: Record<string, number> = {
  'maize': 350,
  'rice': 800,
  'cassava': 150,
  'yam': 400,
  'tomato': 600,
  'pepper': 1200,
  'groundnut': 700,
  'cowpea': 650,
  'soybean': 550,
  'palm_oil': 900,
  'cocoa': 2500,
  'coffee': 3000,
  'ginger': 1500,
  'banana': 200,
};

// Seasonal price multipliers (month index 0-11)
const SEASONAL_MULTIPLIERS: Record<string, number[]> = {
  'maize': [1.3, 1.4, 1.3, 1.2, 1.0, 0.8, 0.7, 0.7, 0.8, 0.9, 1.0, 1.2],
  'rice': [1.2, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.8, 0.9, 1.0, 1.1, 1.2],
  'tomato': [0.7, 0.8, 1.0, 1.2, 1.4, 1.5, 1.3, 1.1, 0.9, 0.8, 0.7, 0.7],
  'pepper': [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.8],
  'default': [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
};

class HarvestForecastingService {
  private forecasts: BoundedMap<string, HarvestForecast> = new BoundedMap(2000, 86400_000);
  private marketOpportunities: BoundedMap<string, MarketOpportunity> = new BoundedMap(1000, 43200_000);
  private contractOffers: BoundedMap<string, ContractFarmingOffer> = new BoundedMap(1000, 86400_000);

  /**
   * Generate harvest forecast for a crop
   */
  async generateHarvestForecast(params: {
    farmerId: number;
    farmId: number;
    cropId: number;
    cropName: string;
    plantingDate: Date;
    fieldSize: number; // hectares
    latitude: number;
    longitude: number;
  }): Promise<HarvestForecast> {
    const { farmerId, farmId, cropId, cropName, plantingDate, fieldSize, latitude, longitude } = params;

    const cropKey = cropName.toLowerCase().replace(/\s+/g, '_');
    const growthCycle = CROP_GROWTH_CYCLES[cropKey] || { minDays: 90, maxDays: 120, optimalDays: 105 };

    // Calculate expected harvest date
    const expectedHarvestDate = new Date(plantingDate);
    expectedHarvestDate.setDate(expectedHarvestDate.getDate() + growthCycle.optimalDays);

    const harvestWindowStart = new Date(plantingDate);
    harvestWindowStart.setDate(harvestWindowStart.getDate() + growthCycle.minDays);

    const harvestWindowEnd = new Date(plantingDate);
    harvestWindowEnd.setDate(harvestWindowEnd.getDate() + growthCycle.maxDays);

    // Get weather forecast for harvest period
    const weatherRisks = await this.assessWeatherRisks(latitude, longitude, expectedHarvestDate);

    // Predict yield using ML service
    let predictedYieldValue: number;
    let confidenceLevel: number;
    try {
      const yieldPrediction = await predictYield({
        cropType: cropName,
        fieldArea: fieldSize,
        plantingDate,
        soilType: 'loam',
        irrigationType: 'rainfed',
      });
      predictedYieldValue = yieldPrediction?.predictedYield || this.estimateBaseYield(cropKey, fieldSize);
      confidenceLevel = (yieldPrediction?.confidence || 70) / 100;
    } catch (err) {
      predictedYieldValue = this.estimateBaseYield(cropKey, fieldSize);
      confidenceLevel = 0.6;
    }

    // Adjust yield based on weather risks
    const riskAdjustment = weatherRisks.reduce((adj, risk) => {
      const impactFactor = risk.impact === 'high' ? 0.15 : risk.impact === 'medium' ? 0.08 : 0.03;
      return adj - (impactFactor * risk.probability);
    }, 1);
    const finalPredictedYield = Math.round(predictedYieldValue * riskAdjustment);

    // Predict quality distribution
    const qualityPrediction = this.predictQuality(weatherRisks, confidenceLevel);

    // Generate recommendations
    const recommendations = this.generateRecommendations(cropKey, weatherRisks, expectedHarvestDate);

    const forecastId = `HF-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    const forecast: HarvestForecast = {
      id: forecastId,
      farmerId,
      farmId,
      cropId,
      cropName,
      plantingDate,
      expectedHarvestDate,
      harvestWindow: { start: harvestWindowStart, end: harvestWindowEnd },
      predictedYield: finalPredictedYield,
      yieldUnit: 'kg',
      confidenceLevel,
      qualityPrediction,
      weatherRisks,
      recommendations,
      updatedAt: new Date(),
    };

    this.forecasts.set(forecastId, forecast);

    // Emit event
    try {
      await publishEvent('harvest-events', createEvent(
        'forecast_generated',
        'harvest_forecast',
        forecastId,
        farmerId,
        forecast
      ));
    } catch (error) {
      logger.warn('[HarvestForecasting] Could not emit Kafka event:', error);
    }

    return forecast;
  }

  /**
   * Get price forecast for a crop
   */
  async getPriceForecast(cropName: string, daysAhead: number = 90): Promise<PriceForecast> {
    const cropKey = cropName.toLowerCase().replace(/\s+/g, '_');
    const basePrice = BASE_PRICES[cropKey] || 500;
    const seasonalMultipliers = SEASONAL_MULTIPLIERS[cropKey] || SEASONAL_MULTIPLIERS['default'];

    const forecasts: PricePrediction[] = [];
    const today = new Date();

    for (let i = 0; i <= daysAhead; i += 7) { // Weekly forecasts
      const forecastDate = new Date(today);
      forecastDate.setDate(forecastDate.getDate() + i);

      const monthIndex = forecastDate.getMonth();
      const seasonalMultiplier = seasonalMultipliers[monthIndex];

      // Deterministic volatility based on week index
      const weekVolatility = 1 + ((i / 7) % 5 - 2) * 0.03; // ±6% based on week offset
      const predictedPrice = Math.round(basePrice * seasonalMultiplier * weekVolatility);

      forecasts.push({
        date: forecastDate,
        predictedPrice,
        lowerBound: Math.round(predictedPrice * 0.85),
        upperBound: Math.round(predictedPrice * 1.15),
        confidence: Math.max(0.5, 0.9 - (i / daysAhead) * 0.3), // Confidence decreases over time
      });
    }

    // Determine trend
    const firstPrice = forecasts[0].predictedPrice;
    const lastPrice = forecasts[forecasts.length - 1].predictedPrice;
    const priceChange = (lastPrice - firstPrice) / firstPrice;
    const trend = priceChange > 0.05 ? 'rising' : priceChange < -0.05 ? 'falling' : 'stable';

    // Find best selling window (highest prices)
    const sortedByPrice = [...forecasts].sort((a, b) => b.predictedPrice - a.predictedPrice);
    const bestWindow = {
      start: sortedByPrice[0].date,
      end: new Date(sortedByPrice[0].date.getTime() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
    };

    return {
      cropName,
      currentPrice: basePrice,
      currency: 'NGN',
      unit: 'kg',
      forecasts,
      trend,
      volatility: 'medium',
      bestSellingWindow: bestWindow,
      priceDrivers: this.getPriceDrivers(cropKey, trend),
    };
  }

  /**
   * Find market opportunities matching farmer's harvest
   */
  async findMarketOpportunities(params: {
    farmerId: number;
    cropName: string;
    quantity: number;
    harvestDate: Date;
    latitude: number;
    longitude: number;
  }): Promise<MarketOpportunity[]> {
    const { farmerId, cropName, quantity, harvestDate, latitude, longitude } = params;

    // Generate mock market opportunities (would come from marketplace database)
    const opportunities: MarketOpportunity[] = [
      {
        id: `MO-${Date.now()}-1`,
        buyerId: 'buyer_001',
        buyerName: 'Lagos Food Processing Ltd',
        buyerType: 'processor',
        cropName,
        requiredQuantity: Math.round(quantity * 1.5),
        unit: 'kg',
        offeredPrice: Math.round(BASE_PRICES[cropName.toLowerCase()] * 1.1),
        currency: 'NGN',
        deliveryLocation: 'Lagos, Nigeria',
        deliveryDeadline: new Date(harvestDate.getTime() + 14 * 24 * 60 * 60 * 1000),
        qualityRequirements: ['Grade A or B', 'Moisture < 14%', 'No foreign matter'],
        paymentTerms: 'Payment within 7 days of delivery',
        contractType: 'spot',
        matchScore: 0.85,
      },
      {
        id: `MO-${Date.now()}-2`,
        buyerId: 'buyer_002',
        buyerName: 'West Africa Exports Co',
        buyerType: 'exporter',
        cropName,
        requiredQuantity: Math.round(quantity * 3),
        unit: 'kg',
        offeredPrice: Math.round(BASE_PRICES[cropName.toLowerCase()] * 1.25),
        currency: 'NGN',
        deliveryLocation: 'Apapa Port, Lagos',
        deliveryDeadline: new Date(harvestDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        qualityRequirements: ['Grade A only', 'Export quality certification', 'Moisture < 12%'],
        paymentTerms: 'LC at sight',
        contractType: 'forward',
        matchScore: 0.72,
      },
      {
        id: `MO-${Date.now()}-3`,
        buyerId: 'buyer_003',
        buyerName: 'Farmers Cooperative Union',
        buyerType: 'cooperative',
        cropName,
        requiredQuantity: Math.round(quantity * 0.8),
        unit: 'kg',
        offeredPrice: Math.round(BASE_PRICES[cropName.toLowerCase()] * 1.05),
        currency: 'NGN',
        deliveryLocation: 'Local aggregation center',
        deliveryDeadline: new Date(harvestDate.getTime() + 7 * 24 * 60 * 60 * 1000),
        qualityRequirements: ['Grade A, B, or C accepted', 'Standard moisture levels'],
        paymentTerms: 'Payment on delivery',
        contractType: 'spot',
        matchScore: 0.92,
      },
    ];

    // Store opportunities
    opportunities.forEach(opp => this.marketOpportunities.set(opp.id, opp));

    return opportunities.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Get contract farming offers
   */
  async getContractFarmingOffers(cropName?: string): Promise<ContractFarmingOffer[]> {
    // Generate mock contract farming offers
    const offers: ContractFarmingOffer[] = [
      {
        id: `CF-${Date.now()}-1`,
        buyerId: 'nestle_ng',
        buyerName: 'Nestle Nigeria',
        cropName: 'maize',
        targetQuantity: 50000,
        unit: 'kg',
        guaranteedPrice: 400,
        currency: 'NGN',
        inputSupport: true,
        technicalSupport: true,
        insuranceIncluded: true,
        requirements: ['Minimum 2 hectares', 'Access to irrigation', 'Previous farming experience'],
        applicationDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        plantingWindow: {
          start: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
          end: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000),
        },
        status: 'open',
      },
      {
        id: `CF-${Date.now()}-2`,
        buyerId: 'olam_ng',
        buyerName: 'Olam Nigeria',
        cropName: 'rice',
        targetQuantity: 100000,
        unit: 'kg',
        guaranteedPrice: 850,
        currency: 'NGN',
        inputSupport: true,
        technicalSupport: true,
        insuranceIncluded: false,
        requirements: ['Minimum 5 hectares', 'Lowland/irrigated farm', 'Cooperative membership preferred'],
        applicationDeadline: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        plantingWindow: {
          start: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          end: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
        status: 'open',
      },
      {
        id: `CF-${Date.now()}-3`,
        buyerId: 'dangote_tomato',
        buyerName: 'Dangote Tomato Processing',
        cropName: 'tomato',
        targetQuantity: 200000,
        unit: 'kg',
        guaranteedPrice: 650,
        currency: 'NGN',
        inputSupport: true,
        technicalSupport: true,
        insuranceIncluded: true,
        requirements: ['Minimum 1 hectare', 'Drip irrigation required', 'Within 100km of processing plant'],
        applicationDeadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        plantingWindow: {
          start: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          end: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        },
        status: 'open',
      },
    ];

    // Store offers
    offers.forEach(offer => this.contractOffers.set(offer.id, offer));

    if (cropName) {
      return offers.filter(o => o.cropName.toLowerCase() === cropName.toLowerCase());
    }
    return offers;
  }

  /**
   * Apply for contract farming
   */
  async applyForContract(params: {
    farmerId: number;
    contractId: string;
    farmId: number;
    proposedQuantity: number;
  }): Promise<{ success: boolean; message: string }> {
    const { farmerId, contractId, farmId, proposedQuantity } = params;

    const contract = this.contractOffers.get(contractId);
    if (!contract) {
      return { success: false, message: 'Contract not found' };
    }

    if (contract.status !== 'open') {
      return { success: false, message: 'Contract is no longer accepting applications' };
    }

    // Would validate farmer eligibility and submit application
    contract.status = 'applied';

    // Emit event
    try {
      await kafkaProducer.send({
        topic: 'contract-farming-events',
        messages: [{
          key: contractId,
          value: JSON.stringify({
            event: 'application_submitted',
            farmerId,
            contractId,
            proposedQuantity,
            timestamp: new Date().toISOString(),
          }),
        }],
      });
    } catch (error) {
      logger.warn('[HarvestForecasting] Could not emit Kafka event:', error);
    }

    return { success: true, message: 'Application submitted successfully' };
  }

  /**
   * Get optimal selling strategy
   */
  async getSellingStrategy(params: {
    cropName: string;
    quantity: number;
    harvestDate: Date;
    storageAvailable: boolean;
    urgentCashNeed: boolean;
  }): Promise<{
    strategy: 'sell_immediately' | 'store_and_wait' | 'partial_sale' | 'contract_farming';
    reasoning: string[];
    expectedRevenue: number;
    timeline: string;
    risks: string[];
  }> {
    const { cropName, quantity, harvestDate, storageAvailable, urgentCashNeed } = params;

    const priceForecast = await this.getPriceForecast(cropName, 90);
    const currentPrice = priceForecast.currentPrice;
    const bestWindowPrice = priceForecast.forecasts.find(f => 
      f.date >= priceForecast.bestSellingWindow.start && 
      f.date <= priceForecast.bestSellingWindow.end
    )?.predictedPrice || currentPrice;

    const priceIncrease = (bestWindowPrice - currentPrice) / currentPrice;

    let strategy: 'sell_immediately' | 'store_and_wait' | 'partial_sale' | 'contract_farming';
    let reasoning: string[] = [];
    let expectedRevenue: number;
    let timeline: string;
    let risks: string[] = [];

    if (urgentCashNeed) {
      strategy = 'sell_immediately';
      reasoning = ['Urgent cash need prioritizes immediate sale', 'Current market prices are acceptable'];
      expectedRevenue = quantity * currentPrice;
      timeline = 'Within 1-2 weeks of harvest';
      risks = ['May miss potential price increases'];
    } else if (!storageAvailable) {
      strategy = 'sell_immediately';
      reasoning = ['No storage available', 'Avoid post-harvest losses'];
      expectedRevenue = quantity * currentPrice;
      timeline = 'Within 1 week of harvest';
      risks = ['Post-harvest losses if delayed', 'May miss better prices'];
    } else if (priceIncrease > 0.15 && priceForecast.trend === 'rising') {
      strategy = 'store_and_wait';
      reasoning = [
        `Prices expected to rise ${Math.round(priceIncrease * 100)}%`,
        'Storage available to preserve quality',
        'Market trend is favorable',
      ];
      expectedRevenue = quantity * bestWindowPrice * 0.95; // Account for storage losses
      timeline = `Sell during ${priceForecast.bestSellingWindow.start.toLocaleDateString()} - ${priceForecast.bestSellingWindow.end.toLocaleDateString()}`;
      risks = ['Storage costs', 'Quality degradation', 'Price forecast uncertainty'];
    } else if (priceIncrease > 0.05) {
      strategy = 'partial_sale';
      reasoning = [
        'Moderate price increase expected',
        'Diversify risk by splitting sales',
        'Secure some immediate revenue',
      ];
      expectedRevenue = (quantity * 0.5 * currentPrice) + (quantity * 0.5 * bestWindowPrice * 0.95);
      timeline = 'Sell 50% immediately, 50% in optimal window';
      risks = ['Partial exposure to price volatility'];
    } else {
      strategy = 'sell_immediately';
      reasoning = ['Prices stable or declining', 'Minimize storage costs and risks'];
      expectedRevenue = quantity * currentPrice;
      timeline = 'Within 2 weeks of harvest';
      risks = ['Minimal - current prices are optimal'];
    }

    return { strategy, reasoning, expectedRevenue: Math.round(expectedRevenue), timeline, risks };
  }

  /**
   * Get farmer's harvest forecasts
   */
  async getFarmerForecasts(farmerId: number): Promise<HarvestForecast[]> {
    return Array.from(this.forecasts.values()).filter(f => f.farmerId === farmerId);
  }

  // Private helper methods

  private async assessWeatherRisks(latitude: number, longitude: number, harvestDate: Date): Promise<WeatherRisk[]> {
    const risks: WeatherRisk[] = [];

    try {
      // Would integrate with weather service for actual forecast
      const daysUntilHarvest = Math.ceil((harvestDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

      if (daysUntilHarvest < 30) {
        // Check for rain during harvest
        risks.push({
          type: 'Rain during harvest',
          probability: 0.3,
          impact: 'medium',
          mitigationAdvice: 'Monitor weather closely and harvest during dry spells',
        });
      }

      // Seasonal risks
      const harvestMonth = harvestDate.getMonth();
      if (harvestMonth >= 6 && harvestMonth <= 9) { // Rainy season
        risks.push({
          type: 'Heavy rainfall',
          probability: 0.5,
          impact: 'high',
          mitigationAdvice: 'Prepare drainage and consider early harvest if possible',
        });
      }
    } catch (error) {
      logger.warn('[HarvestForecasting] Could not assess weather risks:', error);
    }

    return risks;
  }

  private estimateBaseYield(cropKey: string, fieldSize: number): number {
    // Average yields per hectare (kg)
    const avgYields: Record<string, number> = {
      'maize': 2500,
      'rice': 3000,
      'cassava': 15000,
      'yam': 12000,
      'tomato': 20000,
      'pepper': 8000,
      'groundnut': 1500,
      'cowpea': 1000,
      'soybean': 1800,
      'palm_oil': 4000,
      'cocoa': 500,
      'coffee': 800,
      'ginger': 15000,
      'banana': 25000,
    };

    const yieldPerHa = avgYields[cropKey] || 2000;
    return Math.round(yieldPerHa * fieldSize);
  }

  private predictQuality(weatherRisks: WeatherRisk[], confidence: number): QualityPrediction {
    let gradeA = 60;
    let gradeB = 30;
    let gradeC = 10;
    const factors: string[] = [];

    // Adjust based on weather risks
    for (const risk of weatherRisks) {
      if (risk.impact === 'high' && risk.probability > 0.3) {
        gradeA -= 15;
        gradeB += 5;
        gradeC += 10;
        factors.push(`${risk.type} may affect quality`);
      } else if (risk.impact === 'medium' && risk.probability > 0.3) {
        gradeA -= 8;
        gradeB += 3;
        gradeC += 5;
      }
    }

    // Ensure percentages sum to 100
    const total = gradeA + gradeB + gradeC;
    gradeA = Math.round((gradeA / total) * 100);
    gradeB = Math.round((gradeB / total) * 100);
    gradeC = 100 - gradeA - gradeB;

    if (factors.length === 0) {
      factors.push('Normal growing conditions expected');
    }

    return { gradeA, gradeB, gradeC, factors };
  }

  private generateRecommendations(cropKey: string, weatherRisks: WeatherRisk[], harvestDate: Date): string[] {
    const recommendations: string[] = [];
    const daysUntilHarvest = Math.ceil((harvestDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    if (daysUntilHarvest <= 14) {
      recommendations.push('Prepare harvesting equipment and labor');
      recommendations.push('Arrange transportation and storage');
    }

    if (daysUntilHarvest <= 30) {
      recommendations.push('Stop fertilizer application');
      recommendations.push('Monitor crop maturity indicators');
    }

    for (const risk of weatherRisks) {
      if (risk.probability > 0.3) {
        recommendations.push(risk.mitigationAdvice);
      }
    }

    recommendations.push('Contact potential buyers to negotiate prices');
    recommendations.push('Check market prices in nearby markets');

    return recommendations;
  }

  private getPriceDrivers(cropKey: string, trend: string): string[] {
    const drivers: string[] = [];

    if (trend === 'rising') {
      drivers.push('Seasonal demand increase');
      drivers.push('Limited supply from previous harvest');
    } else if (trend === 'falling') {
      drivers.push('New harvest entering market');
      drivers.push('Increased imports');
    }

    drivers.push('Fuel and transportation costs');
    drivers.push('Currency exchange rates');
    drivers.push('Government policies and tariffs');

    return drivers;
  }
}

export const harvestForecastingService = new HarvestForecastingService();
