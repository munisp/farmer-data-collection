/**
 * ML Feature Integration Service
 * 
 * Bridges the feature store with ML services:
 * - Fetches features from online/offline store
 * - Transforms features for ML model input
 * - Logs predictions back to lakehouse for model monitoring
 */

import { getFeatureStore, CREDIT_SCORING_FEATURES, YIELD_PREDICTION_FEATURES, DEFAULT_PREDICTION_FEATURES } from './feature-store.js';
import { getLakehouseClient } from './lakehouse-client.js';
import { MLCreditScoringService } from '../ml-credit-scoring.js';
import { logger } from '../../logger.js';

// ============================================================================
// Types
// ============================================================================

export interface MLPredictionLog {
  predictionId: string;
  modelName: string;
  modelVersion: string;
  entityType: string;
  entityId: string | number;
  features: Record<string, any>;
  prediction: Record<string, any>;
  confidence: number;
  latencyMs: number;
  timestamp: string;
}

export interface FeatureVector {
  entityId: string | number;
  features: Record<string, any>;
  featureDate: string;
  source: 'online' | 'offline' | 'computed';
}

// ============================================================================
// ML Feature Integration Service
// ============================================================================

export class MLFeatureIntegrationService {
  private featureStore = getFeatureStore();
  private creditScoringService = new MLCreditScoringService();
  private predictionLogs: MLPredictionLog[] = [];

  /**
   * Get credit scoring features for a farmer
   * Tries online store first, falls back to computing features
   */
  async getCreditScoringFeatures(farmerId: number): Promise<FeatureVector> {
    const startTime = Date.now();

    // Try online store first (Redis)
    let features = await this.featureStore.getOnlineFeatures('credit_scoring_features', farmerId);
    let source: 'online' | 'offline' | 'computed' = 'online';

    if (!features) {
      // Compute features on-demand
      features = await this.featureStore.computeCreditScoringFeatures(farmerId);
      source = 'computed';
    }

    logger.info(`[MLFeatureIntegration] Got credit scoring features for farmer ${farmerId} from ${source} in ${Date.now() - startTime}ms`);

    return {
      entityId: farmerId,
      features,
      featureDate: features.feature_date || new Date().toISOString().split('T')[0],
      source,
    };
  }

  /**
   * Get yield prediction features for a crop
   */
  async getYieldPredictionFeatures(cropId: number): Promise<FeatureVector> {
    const startTime = Date.now();

    let features = await this.featureStore.getOnlineFeatures('yield_prediction_features', cropId);
    let source: 'online' | 'offline' | 'computed' = 'online';

    if (!features) {
      features = await this.featureStore.computeYieldPredictionFeatures(cropId);
      source = 'computed';
    }

    logger.info(`[MLFeatureIntegration] Got yield prediction features for crop ${cropId} from ${source} in ${Date.now() - startTime}ms`);

    return {
      entityId: cropId,
      features,
      featureDate: features.feature_date || new Date().toISOString().split('T')[0],
      source,
    };
  }

  /**
   * Get default prediction features for a loan
   */
  async getDefaultPredictionFeatures(loanId: number): Promise<FeatureVector> {
    const startTime = Date.now();

    let features = await this.featureStore.getOnlineFeatures('default_prediction_features', loanId);
    let source: 'online' | 'offline' | 'computed' = 'online';

    if (!features) {
      features = await this.featureStore.computeDefaultPredictionFeatures(loanId);
      source = 'computed';
    }

    logger.info(`[MLFeatureIntegration] Got default prediction features for loan ${loanId} from ${source} in ${Date.now() - startTime}ms`);

    return {
      entityId: loanId,
      features,
      featureDate: features.feature_date || new Date().toISOString().split('T')[0],
      source,
    };
  }

  /**
   * Score a farmer's creditworthiness using features from the feature store
   */
  async scoreFarmerCredit(farmerId: number): Promise<{
    score: number;
    riskCategory: string;
    maxLoanAmount: number;
    recommendedInterestRate: number;
    confidence: number;
    factors: Array<{ factor: string; impact: string; weight: number; description: string }>;
    featureSource: string;
  }> {
    const startTime = Date.now();

    // Get features from feature store
    const featureVector = await this.getCreditScoringFeatures(farmerId);
    const features = featureVector.features;

    // Transform feature store format to ML model format
    const modelInput = this.transformToMLFormat(features);

    // Run credit scoring model
    const result = this.creditScoringService.calculateCreditScore(modelInput);

    const latencyMs = Date.now() - startTime;

    // Log prediction for monitoring
    await this.logPrediction({
      predictionId: `credit-${farmerId}-${Date.now()}`,
      modelName: 'credit_scoring',
      modelVersion: '1.0.0',
      entityType: 'farmer',
      entityId: farmerId,
      features: features,
      prediction: {
        score: result.score,
        riskCategory: result.riskCategory,
        maxLoanAmount: result.maxLoanAmount,
        recommendedInterestRate: result.recommendedInterestRate,
      },
      confidence: result.confidence,
      latencyMs,
      timestamp: new Date().toISOString(),
    });

    return {
      ...result,
      featureSource: featureVector.source,
    };
  }

  /**
   * Transform feature store format to ML model input format
   */
  private transformToMLFormat(features: Record<string, any>): any {
    return {
      // Demographic features
      age: features.age || 0,
      gender: features.gender || 'other',
      yearsOfExperience: features.years_of_experience || 0,
      educationLevel: features.education_level || 'none',

      // Farm features
      farmSizeHectares: features.farm_size_hectares || 0,
      numberOfFarms: features.number_of_farms || 0,
      cropDiversity: features.crop_diversity || 0,
      hasIrrigation: features.has_irrigation || false,
      hasMechanization: features.has_mechanization || false,

      // Financial history
      totalPreviousLoans: features.total_previous_loans || 0,
      completedLoans: features.completed_loans || 0,
      defaultedLoans: features.defaulted_loans || 0,
      averageRepaymentDays: features.average_repayment_days || 0,
      totalAmountBorrowed: features.total_amount_borrowed || 0,
      totalAmountRepaid: features.total_amount_repaid || 0,

      // Income features
      averageMonthlyIncome: features.average_monthly_income || 0,
      incomeStability: features.income_stability || 1,
      hasAlternativeIncome: features.has_alternative_income || false,

      // Cooperative membership
      isCooperativeMember: features.is_cooperative_member || false,
      cooperativeTenureMonths: features.cooperative_tenure_months || 0,
      cooperativeParticipationScore: features.cooperative_participation_score || 0,

      // Digital engagement
      appUsageFrequency: features.app_usage_frequency || 0,
      dataCompletenessScore: features.data_completeness_score || 0,
      hasVerifiedPhone: features.has_verified_phone || false,
      hasVerifiedId: features.has_verified_id || false,

      // Market access
      distanceToMarketKm: features.distance_to_market_km || 0,
      hasMarketContracts: features.has_market_contracts || false,

      // Weather/Climate risk
      droughtRiskScore: features.drought_risk_score || 50,
      floodRiskScore: features.flood_risk_score || 50,
    };
  }

  /**
   * Log prediction for model monitoring
   */
  private async logPrediction(log: MLPredictionLog): Promise<void> {
    this.predictionLogs.push(log);

    // In production, write to lakehouse for model monitoring
    try {
      const lakehouse = getLakehouseClient();
      if (lakehouse.isConnected()) {
        const logRecord: Record<string, any> = {
          prediction_id: log.predictionId,
          model_name: log.modelName,
          model_version: log.modelVersion,
          entity_type: log.entityType,
          entity_id: log.entityId,
          features: JSON.stringify(log.features),
          prediction: JSON.stringify(log.prediction),
          confidence: log.confidence,
          latency_ms: log.latencyMs,
          timestamp: log.timestamp,
          prediction_date: log.timestamp.split('T')[0],
        };
        await lakehouse.writeTable('gold.ml_prediction_logs', [logRecord], {
          mode: 'append',
          partitionBy: ['model_name', 'prediction_date'],
        });
      }
    } catch (error) {
      logger.error('[MLFeatureIntegration] Failed to log prediction to lakehouse:', error);
    }
  }

  /**
   * Get prediction logs for monitoring
   */
  getPredictionLogs(modelName?: string): MLPredictionLog[] {
    if (modelName) {
      return this.predictionLogs.filter(log => log.modelName === modelName);
    }
    return [...this.predictionLogs];
  }

  /**
   * Get model performance metrics
   */
  getModelMetrics(modelName: string): {
    totalPredictions: number;
    avgLatencyMs: number;
    avgConfidence: number;
    predictionsByDay: Record<string, number>;
  } {
    const logs = this.predictionLogs.filter(log => log.modelName === modelName);

    if (logs.length === 0) {
      return {
        totalPredictions: 0,
        avgLatencyMs: 0,
        avgConfidence: 0,
        predictionsByDay: {},
      };
    }

    const totalLatency = logs.reduce((sum, log) => sum + log.latencyMs, 0);
    const totalConfidence = logs.reduce((sum, log) => sum + log.confidence, 0);

    const predictionsByDay: Record<string, number> = {};
    for (const log of logs) {
      const day = log.timestamp.split('T')[0];
      predictionsByDay[day] = (predictionsByDay[day] || 0) + 1;
    }

    return {
      totalPredictions: logs.length,
      avgLatencyMs: totalLatency / logs.length,
      avgConfidence: totalConfidence / logs.length,
      predictionsByDay,
    };
  }

  /**
   * Batch score multiple farmers
   */
  async batchScoreFarmers(farmerIds: number[]): Promise<Map<number, any>> {
    const results = new Map<number, any>();

    for (const farmerId of farmerIds) {
      try {
        const result = await this.scoreFarmerCredit(farmerId);
        results.set(farmerId, result);
      } catch (error) {
        logger.error(`[MLFeatureIntegration] Failed to score farmer ${farmerId}:`, error);
        results.set(farmerId, { error: String(error) });
      }
    }

    return results;
  }

  /**
   * Refresh features for an entity
   */
  async refreshFeatures(featureGroupName: string, entityId: number): Promise<Record<string, any>> {
    switch (featureGroupName) {
      case 'credit_scoring_features':
        return await this.featureStore.computeCreditScoringFeatures(entityId);
      case 'yield_prediction_features':
        return await this.featureStore.computeYieldPredictionFeatures(entityId);
      case 'default_prediction_features':
        return await this.featureStore.computeDefaultPredictionFeatures(entityId);
      default:
        throw new Error(`Unknown feature group: ${featureGroupName}`);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let mlFeatureIntegrationInstance: MLFeatureIntegrationService | null = null;

export function getMLFeatureIntegration(): MLFeatureIntegrationService {
  if (!mlFeatureIntegrationInstance) {
    mlFeatureIntegrationInstance = new MLFeatureIntegrationService();
  }
  return mlFeatureIntegrationInstance;
}

export default {
  MLFeatureIntegrationService,
  getMLFeatureIntegration,
};
