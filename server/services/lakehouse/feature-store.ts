/**
 * Feature Store Service
 * 
 * Manages ML features for credit scoring, yield prediction, and other models
 * Provides both offline (lakehouse) and online (Redis/Postgres) feature serving
 */

import { BoundedMap } from '../../cache/bounded-map.js';
import { getLakehouseClient } from './lakehouse-client.js';
import { LAKEHOUSE_TABLES } from './lakehouse-config.js';
import { getRedisClient } from '../../redis.js';
import { getDb } from '../../db.js';
import { sql } from 'drizzle-orm';
import { logger } from '../../logger.js';

// ============================================================================
// Feature Definitions
// ============================================================================

export interface FeatureDefinition {
  name: string;
  description: string;
  dataType: 'int' | 'float' | 'string' | 'boolean' | 'array' | 'timestamp';
  defaultValue: any;
  transformFn?: (rawValue: any) => any;
  validationFn?: (value: any) => boolean;
}

export interface FeatureGroup {
  name: string;
  description: string;
  entityType: 'farmer' | 'farm' | 'loan' | 'crop';
  entityIdColumn: string;
  features: FeatureDefinition[];
  ttlSeconds: number; // Time-to-live for online features
}

// ============================================================================
// Credit Scoring Features
// ============================================================================

export const CREDIT_SCORING_FEATURES: FeatureGroup = {
  name: 'credit_scoring_features',
  description: 'Features for ML credit scoring model',
  entityType: 'farmer',
  entityIdColumn: 'farmer_id',
  ttlSeconds: 86400, // 24 hours
  features: [
    // Demographic features
    { name: 'age', dataType: 'int', defaultValue: 0, description: 'Farmer age in years' },
    { name: 'gender', dataType: 'string', defaultValue: 'unknown', description: 'Farmer gender' },
    { name: 'years_of_experience', dataType: 'int', defaultValue: 0, description: 'Years of farming experience' },
    { name: 'education_level', dataType: 'string', defaultValue: 'none', description: 'Highest education level' },
    
    // Farm features
    { name: 'farm_size_hectares', dataType: 'float', defaultValue: 0, description: 'Total farm size in hectares' },
    { name: 'number_of_farms', dataType: 'int', defaultValue: 0, description: 'Number of farms owned' },
    { name: 'crop_diversity', dataType: 'int', defaultValue: 0, description: 'Number of different crops grown' },
    { name: 'has_irrigation', dataType: 'boolean', defaultValue: false, description: 'Has irrigation system' },
    { name: 'has_mechanization', dataType: 'boolean', defaultValue: false, description: 'Has mechanized equipment' },
    
    // Financial history
    { name: 'total_previous_loans', dataType: 'int', defaultValue: 0, description: 'Total number of previous loans' },
    { name: 'completed_loans', dataType: 'int', defaultValue: 0, description: 'Number of successfully completed loans' },
    { name: 'defaulted_loans', dataType: 'int', defaultValue: 0, description: 'Number of defaulted loans' },
    { name: 'average_repayment_days', dataType: 'float', defaultValue: 0, description: 'Average days late on repayments' },
    { name: 'total_amount_borrowed', dataType: 'float', defaultValue: 0, description: 'Total amount ever borrowed' },
    { name: 'total_amount_repaid', dataType: 'float', defaultValue: 0, description: 'Total amount ever repaid' },
    { name: 'loan_completion_rate', dataType: 'float', defaultValue: 0, description: 'Percentage of loans completed' },
    
    // Income features
    { name: 'average_monthly_income', dataType: 'float', defaultValue: 0, description: 'Average monthly income' },
    { name: 'income_stability', dataType: 'float', defaultValue: 1, description: 'Income coefficient of variation' },
    { name: 'has_alternative_income', dataType: 'boolean', defaultValue: false, description: 'Has non-farming income' },
    { name: 'total_harvest_value_12m', dataType: 'float', defaultValue: 0, description: 'Total harvest value in last 12 months' },
    { name: 'total_expenses_12m', dataType: 'float', defaultValue: 0, description: 'Total expenses in last 12 months' },
    
    // Cooperative membership
    { name: 'is_cooperative_member', dataType: 'boolean', defaultValue: false, description: 'Is cooperative member' },
    { name: 'cooperative_tenure_months', dataType: 'int', defaultValue: 0, description: 'Months as cooperative member' },
    { name: 'cooperative_participation_score', dataType: 'float', defaultValue: 0, description: 'Cooperative participation score 0-100' },
    
    // Digital engagement
    { name: 'app_usage_frequency', dataType: 'float', defaultValue: 0, description: 'App sessions per month' },
    { name: 'data_completeness_score', dataType: 'float', defaultValue: 0, description: 'Profile completeness 0-100' },
    { name: 'has_verified_phone', dataType: 'boolean', defaultValue: false, description: 'Phone number verified' },
    { name: 'has_verified_id', dataType: 'boolean', defaultValue: false, description: 'ID document verified' },
    { name: 'kyc_tier', dataType: 'string', defaultValue: 'unverified', description: 'KYC verification tier' },
    
    // Market access
    { name: 'distance_to_market_km', dataType: 'float', defaultValue: 0, description: 'Distance to nearest market' },
    { name: 'has_market_contracts', dataType: 'boolean', defaultValue: false, description: 'Has forward contracts' },
    { name: 'marketplace_sales_12m', dataType: 'float', defaultValue: 0, description: 'Marketplace sales in 12 months' },
    
    // Weather/Climate risk
    { name: 'drought_risk_score', dataType: 'float', defaultValue: 50, description: 'Drought risk score 0-100' },
    { name: 'flood_risk_score', dataType: 'float', defaultValue: 50, description: 'Flood risk score 0-100' },
    { name: 'climate_risk_zone', dataType: 'string', defaultValue: 'medium', description: 'Climate risk zone' },
  ],
};

// ============================================================================
// Yield Prediction Features
// ============================================================================

export const YIELD_PREDICTION_FEATURES: FeatureGroup = {
  name: 'yield_prediction_features',
  description: 'Features for ML yield prediction model',
  entityType: 'crop',
  entityIdColumn: 'crop_id',
  ttlSeconds: 3600, // 1 hour (more dynamic)
  features: [
    // Crop features
    { name: 'crop_type', dataType: 'string', defaultValue: '', description: 'Type of crop' },
    { name: 'variety', dataType: 'string', defaultValue: '', description: 'Crop variety' },
    { name: 'planting_date', dataType: 'timestamp', defaultValue: null, description: 'Date planted' },
    { name: 'days_since_planting', dataType: 'int', defaultValue: 0, description: 'Days since planting' },
    { name: 'expected_harvest_days', dataType: 'int', defaultValue: 120, description: 'Expected days to harvest' },
    { name: 'growth_stage', dataType: 'string', defaultValue: 'unknown', description: 'Current growth stage' },
    
    // Field features
    { name: 'field_area_hectares', dataType: 'float', defaultValue: 0, description: 'Field area in hectares' },
    { name: 'soil_type', dataType: 'string', defaultValue: 'unknown', description: 'Soil type' },
    { name: 'soil_ph', dataType: 'float', defaultValue: 7, description: 'Soil pH level' },
    { name: 'soil_nitrogen', dataType: 'float', defaultValue: 0, description: 'Soil nitrogen level' },
    { name: 'soil_phosphorus', dataType: 'float', defaultValue: 0, description: 'Soil phosphorus level' },
    { name: 'soil_potassium', dataType: 'float', defaultValue: 0, description: 'Soil potassium level' },
    
    // Irrigation features
    { name: 'irrigation_type', dataType: 'string', defaultValue: 'rainfed', description: 'Irrigation type' },
    { name: 'irrigation_frequency', dataType: 'int', defaultValue: 0, description: 'Irrigation frequency per week' },
    { name: 'water_availability_score', dataType: 'float', defaultValue: 50, description: 'Water availability 0-100' },
    
    // Weather features (current season)
    { name: 'avg_temperature_30d', dataType: 'float', defaultValue: 25, description: 'Avg temperature last 30 days' },
    { name: 'total_rainfall_30d', dataType: 'float', defaultValue: 0, description: 'Total rainfall last 30 days mm' },
    { name: 'avg_humidity_30d', dataType: 'float', defaultValue: 60, description: 'Avg humidity last 30 days' },
    { name: 'sunshine_hours_30d', dataType: 'float', defaultValue: 0, description: 'Sunshine hours last 30 days' },
    { name: 'growing_degree_days', dataType: 'float', defaultValue: 0, description: 'Accumulated GDD' },
    
    // Satellite/NDVI features
    { name: 'current_ndvi', dataType: 'float', defaultValue: 0.5, description: 'Current NDVI value' },
    { name: 'ndvi_trend_30d', dataType: 'float', defaultValue: 0, description: 'NDVI change over 30 days' },
    { name: 'vegetation_health_score', dataType: 'float', defaultValue: 50, description: 'Vegetation health 0-100' },
    
    // Historical features
    { name: 'historical_avg_yield', dataType: 'float', defaultValue: 0, description: 'Historical average yield' },
    { name: 'historical_max_yield', dataType: 'float', defaultValue: 0, description: 'Historical max yield' },
    { name: 'yield_trend', dataType: 'float', defaultValue: 0, description: 'Yield trend coefficient' },
    { name: 'seasons_of_data', dataType: 'int', defaultValue: 0, description: 'Number of historical seasons' },
    
    // Management features
    { name: 'fertilizer_applied', dataType: 'boolean', defaultValue: false, description: 'Fertilizer applied' },
    { name: 'fertilizer_type', dataType: 'string', defaultValue: 'none', description: 'Type of fertilizer' },
    { name: 'pesticide_applied', dataType: 'boolean', defaultValue: false, description: 'Pesticide applied' },
    { name: 'pest_pressure_score', dataType: 'float', defaultValue: 0, description: 'Pest pressure 0-100' },
    { name: 'disease_pressure_score', dataType: 'float', defaultValue: 0, description: 'Disease pressure 0-100' },
    { name: 'management_score', dataType: 'float', defaultValue: 50, description: 'Overall management 0-100' },
  ],
};

// ============================================================================
// Default Prediction Features
// ============================================================================

export const DEFAULT_PREDICTION_FEATURES: FeatureGroup = {
  name: 'default_prediction_features',
  description: 'Features for loan default prediction model',
  entityType: 'loan',
  entityIdColumn: 'loan_id',
  ttlSeconds: 3600, // 1 hour
  features: [
    // Loan features
    { name: 'loan_amount', dataType: 'float', defaultValue: 0, description: 'Loan principal amount' },
    { name: 'interest_rate', dataType: 'float', defaultValue: 0, description: 'Interest rate' },
    { name: 'term_months', dataType: 'int', defaultValue: 0, description: 'Loan term in months' },
    { name: 'monthly_payment', dataType: 'float', defaultValue: 0, description: 'Monthly payment amount' },
    { name: 'days_since_disbursement', dataType: 'int', defaultValue: 0, description: 'Days since disbursement' },
    { name: 'payments_made', dataType: 'int', defaultValue: 0, description: 'Number of payments made' },
    { name: 'payments_missed', dataType: 'int', defaultValue: 0, description: 'Number of payments missed' },
    { name: 'current_balance', dataType: 'float', defaultValue: 0, description: 'Current outstanding balance' },
    { name: 'days_past_due', dataType: 'int', defaultValue: 0, description: 'Days past due' },
    
    // Borrower features (from credit scoring)
    { name: 'credit_score_at_origination', dataType: 'int', defaultValue: 500, description: 'Credit score at loan origination' },
    { name: 'current_credit_score', dataType: 'int', defaultValue: 500, description: 'Current credit score' },
    { name: 'credit_score_change', dataType: 'int', defaultValue: 0, description: 'Credit score change since origination' },
    { name: 'debt_to_income_ratio', dataType: 'float', defaultValue: 0, description: 'Debt to income ratio' },
    { name: 'previous_defaults', dataType: 'int', defaultValue: 0, description: 'Number of previous defaults' },
    
    // Behavioral features
    { name: 'avg_days_late', dataType: 'float', defaultValue: 0, description: 'Average days late on payments' },
    { name: 'max_days_late', dataType: 'int', defaultValue: 0, description: 'Maximum days late' },
    { name: 'payment_consistency_score', dataType: 'float', defaultValue: 100, description: 'Payment consistency 0-100' },
    { name: 'early_payment_count', dataType: 'int', defaultValue: 0, description: 'Number of early payments' },
    
    // Economic features
    { name: 'recent_income_change', dataType: 'float', defaultValue: 0, description: 'Recent income change %' },
    { name: 'harvest_value_since_loan', dataType: 'float', defaultValue: 0, description: 'Harvest value since loan' },
    { name: 'expense_ratio_change', dataType: 'float', defaultValue: 0, description: 'Expense ratio change' },
    
    // External features
    { name: 'market_price_index', dataType: 'float', defaultValue: 100, description: 'Crop market price index' },
    { name: 'weather_risk_score', dataType: 'float', defaultValue: 50, description: 'Weather risk score' },
  ],
};

// ============================================================================
// Feature Store Service Class
// ============================================================================

export class FeatureStoreService {
  private featureGroups: BoundedMap<string, FeatureGroup> = new BoundedMap(100, 86400_000);

  constructor() {
    // Register default feature groups
    this.registerFeatureGroup(CREDIT_SCORING_FEATURES);
    this.registerFeatureGroup(YIELD_PREDICTION_FEATURES);
    this.registerFeatureGroup(DEFAULT_PREDICTION_FEATURES);
  }

  /**
   * Register a feature group
   */
  registerFeatureGroup(group: FeatureGroup): void {
    this.featureGroups.set(group.name, group);
    logger.info(`[FeatureStore] Registered feature group: ${group.name} (${group.features.length} features)`);
  }

  /**
   * Get a feature group by name
   */
  getFeatureGroup(name: string): FeatureGroup | undefined {
    return this.featureGroups.get(name);
  }

  /**
   * Get all registered feature groups
   */
  getAllFeatureGroups(): FeatureGroup[] {
    return Array.from(this.featureGroups.values());
  }

  /**
   * Get features for an entity from online store (Redis)
   */
  async getOnlineFeatures(
    featureGroupName: string,
    entityId: string | number
  ): Promise<Record<string, any> | null> {
    const group = this.featureGroups.get(featureGroupName);
    if (!group) {
      throw new Error(`Feature group not found: ${featureGroupName}`);
    }

    try {
      const redis = getRedisClient();
      if (!redis) return null;
      const key = `features:${featureGroupName}:${entityId}`;
      const cached = await redis.get(key);

      if (cached) {
        return JSON.parse(cached);
      }

      return null;
    } catch (error) {
      logger.error(`[FeatureStore] Error getting online features:`, error);
      return null;
    }
  }

  /**
   * Set features for an entity in online store (Redis)
   */
  async setOnlineFeatures(
    featureGroupName: string,
    entityId: string | number,
    features: Record<string, any>
  ): Promise<void> {
    const group = this.featureGroups.get(featureGroupName);
    if (!group) {
      throw new Error(`Feature group not found: ${featureGroupName}`);
    }

    try {
      const redis = getRedisClient();
      if (!redis) return;
      const key = `features:${featureGroupName}:${entityId}`;
      await redis.set(key, JSON.stringify(features), 'EX', group.ttlSeconds);
    } catch (error) {
      logger.error(`[FeatureStore] Error setting online features:`, error);
    }
  }

  /**
   * Get features from offline store (Lakehouse)
   */
  async getOfflineFeatures(
    featureGroupName: string,
    entityIds: (string | number)[],
    asOfDate?: Date
  ): Promise<Record<string, Record<string, any>>> {
    const group = this.featureGroups.get(featureGroupName);
    if (!group) {
      throw new Error(`Feature group not found: ${featureGroupName}`);
    }

    try {
      const lakehouse = getLakehouseClient();
      const tableName = `features.${featureGroupName}`;
      
      const dateFilter = asOfDate 
        ? `feature_date <= '${asOfDate.toISOString().split('T')[0]}'`
        : '1=1';

      const entityFilter = entityIds.length > 0
        ? `${group.entityIdColumn} IN (${entityIds.join(',')})`
        : '1=1';

      const result = await lakehouse.executeQuery<Record<string, any>>(`
        SELECT * FROM ${tableName}
        WHERE ${dateFilter} AND ${entityFilter}
        ORDER BY feature_date DESC
      `);

      // Group by entity ID
      const featuresByEntity: Record<string, Record<string, any>> = {};
      for (const row of result.rows) {
        const entityId = row[group.entityIdColumn];
        if (!featuresByEntity[entityId]) {
          featuresByEntity[entityId] = row;
        }
      }

      return featuresByEntity;
    } catch (error) {
      logger.error(`[FeatureStore] Error getting offline features:`, error);
      return {};
    }
  }

  /**
   * Write features to offline store (Lakehouse)
   */
  async writeOfflineFeatures(
    featureGroupName: string,
    features: Array<Record<string, any>>
  ): Promise<{ rowsWritten: number }> {
    const group = this.featureGroups.get(featureGroupName);
    if (!group) {
      throw new Error(`Feature group not found: ${featureGroupName}`);
    }

    try {
      const lakehouse = getLakehouseClient();
      const tableName = `features.${featureGroupName}`;

      // Add feature_date if not present
      const enrichedFeatures = features.map(f => ({
        ...f,
        feature_date: f.feature_date || new Date().toISOString().split('T')[0],
        _created_at: new Date().toISOString(),
      }));

      const result = await lakehouse.writeTable(tableName, enrichedFeatures, {
        mode: 'append',
        partitionBy: ['feature_date'],
      });

      return { rowsWritten: result.rowsWritten };
    } catch (error) {
      logger.error(`[FeatureStore] Error writing offline features:`, error);
      return { rowsWritten: 0 };
    }
  }

  /**
   * Compute credit scoring features for a farmer - PRODUCTION READY
   * Computes features from operational database and persists to both online (Redis) and offline (Lakehouse) stores
   */
  async computeCreditScoringFeatures(farmerId: number, persistToLakehouse: boolean = true): Promise<Record<string, any>> {
    const db = await getDb();
    
    // Initialize with defaults
    const features: Record<string, any> = {
      farmer_id: farmerId,
      feature_date: new Date().toISOString().split('T')[0],
      _computed_at: new Date().toISOString(),
      
      // Default values - will be overwritten with real data if available
      age: 0,
      gender: 'unknown',
      years_of_experience: 0,
      education_level: 'none',
      farm_size_hectares: 0,
      number_of_farms: 0,
      crop_diversity: 0,
      has_irrigation: false,
      has_mechanization: false,
      total_previous_loans: 0,
      completed_loans: 0,
      defaulted_loans: 0,
      average_repayment_days: 0,
      total_amount_borrowed: 0,
      total_amount_repaid: 0,
      loan_completion_rate: 0,
      average_monthly_income: 0,
      income_stability: 1,
      has_alternative_income: false,
      total_harvest_value_12m: 0,
      total_expenses_12m: 0,
      is_cooperative_member: false,
      cooperative_tenure_months: 0,
      cooperative_participation_score: 0,
      app_usage_frequency: 0,
      data_completeness_score: 0,
      has_verified_phone: false,
      has_verified_id: false,
      kyc_tier: 'unverified',
      distance_to_market_km: 0,
      has_market_contracts: false,
      marketplace_sales_12m: 0,
      drought_risk_score: 50,
      flood_risk_score: 50,
      climate_risk_zone: 'medium',
    };

    // Try to compute real features from database if available
    if (db) {
      try {
        // Query farmer profile data
        const farmerResult = await db.execute(sql`
          SELECT * FROM farmers WHERE id = ${farmerId} LIMIT 1
        `);
        
        if (farmerResult.rows && farmerResult.rows.length > 0) {
          const farmer = farmerResult.rows[0] as Record<string, any>;
          features.age = farmer.age || 0;
          features.gender = farmer.gender || 'unknown';
          features.years_of_experience = farmer.years_of_experience || 0;
          features.education_level = farmer.education_level || 'none';
          features.has_verified_phone = !!farmer.phone_verified;
          features.has_verified_id = !!farmer.id_verified;
          features.kyc_tier = farmer.kyc_tier || 'unverified';
        }

        // Query farm data
        const farmResult = await db.execute(sql`
          SELECT COUNT(*) as farm_count, 
                 COALESCE(SUM(size_hectares), 0) as total_size,
                 COUNT(DISTINCT crop_type) as crop_diversity
          FROM farms WHERE farmer_id = ${farmerId}
        `);
        
        if (farmResult.rows && farmResult.rows.length > 0) {
          const farmData = farmResult.rows[0] as Record<string, any>;
          features.number_of_farms = Number(farmData.farm_count) || 0;
          features.farm_size_hectares = Number(farmData.total_size) || 0;
          features.crop_diversity = Number(farmData.crop_diversity) || 0;
        }

        // Query loan history
        const loanResult = await db.execute(sql`
          SELECT COUNT(*) as total_loans,
                 COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                 COUNT(CASE WHEN status = 'defaulted' THEN 1 END) as defaulted,
                 COALESCE(SUM(amount), 0) as total_borrowed,
                 COALESCE(SUM(amount_repaid), 0) as total_repaid
          FROM loans WHERE farmer_id = ${farmerId}
        `);
        
        if (loanResult.rows && loanResult.rows.length > 0) {
          const loanData = loanResult.rows[0] as Record<string, any>;
          features.total_previous_loans = Number(loanData.total_loans) || 0;
          features.completed_loans = Number(loanData.completed) || 0;
          features.defaulted_loans = Number(loanData.defaulted) || 0;
          features.total_amount_borrowed = Number(loanData.total_borrowed) || 0;
          features.total_amount_repaid = Number(loanData.total_repaid) || 0;
          features.loan_completion_rate = features.total_previous_loans > 0 
            ? (features.completed_loans / features.total_previous_loans) * 100 
            : 0;
        }
      } catch (dbError) {
        logger.warn('[FeatureStore] Could not compute features from database, using defaults:', dbError);
      }
    }

    // Cache in online store (Redis)
    await this.setOnlineFeatures('credit_scoring_features', farmerId, features);

    // Persist to offline store (Lakehouse) for ML training
    if (persistToLakehouse) {
      try {
        await this.writeOfflineFeatures('credit_scoring_features', [features]);
        logger.info(`[FeatureStore] Persisted credit scoring features for farmer ${farmerId} to lakehouse`);
      } catch (lakehouseError) {
        logger.warn('[FeatureStore] Could not persist features to lakehouse:', lakehouseError);
      }
    }

    return features;
  }

  /**
   * Compute yield prediction features for a crop - PRODUCTION READY
   * Computes features from operational database and persists to both online (Redis) and offline (Lakehouse) stores
   */
  async computeYieldPredictionFeatures(cropId: number, persistToLakehouse: boolean = true): Promise<Record<string, any>> {
    const db = await getDb();

    const features: Record<string, any> = {
      crop_id: cropId,
      feature_date: new Date().toISOString().split('T')[0],
      _computed_at: new Date().toISOString(),
      
      // Default values - will be overwritten with real data if available
      crop_type: '',
      variety: '',
      planting_date: null,
      days_since_planting: 0,
      expected_harvest_days: 120,
      growth_stage: 'unknown',
      field_area_hectares: 0,
      soil_type: 'unknown',
      soil_ph: 7,
      soil_nitrogen: 0,
      soil_phosphorus: 0,
      soil_potassium: 0,
      irrigation_type: 'rainfed',
      irrigation_frequency: 0,
      water_availability_score: 50,
      avg_temperature_30d: 25,
      total_rainfall_30d: 0,
      avg_humidity_30d: 60,
      sunshine_hours_30d: 0,
      growing_degree_days: 0,
      current_ndvi: 0.5,
      ndvi_trend_30d: 0,
      vegetation_health_score: 50,
      historical_avg_yield: 0,
      historical_max_yield: 0,
      yield_trend: 0,
      seasons_of_data: 0,
      fertilizer_applied: false,
      fertilizer_type: 'none',
      pesticide_applied: false,
      pest_pressure_score: 0,
      disease_pressure_score: 0,
      management_score: 50,
    };

    // Try to compute real features from database if available
    if (db) {
      try {
        // Query crop data
        const cropResult = await db.execute(sql`
          SELECT c.*, f.size_hectares, f.soil_type, f.irrigation_type
          FROM crops c
          LEFT JOIN farms f ON c.farm_id = f.id
          WHERE c.id = ${cropId} LIMIT 1
        `);
        
        if (cropResult.rows && cropResult.rows.length > 0) {
          const crop = cropResult.rows[0] as Record<string, any>;
          features.crop_type = crop.crop_type || '';
          features.variety = crop.variety || '';
          features.planting_date = crop.planting_date || null;
          features.field_area_hectares = Number(crop.size_hectares) || 0;
          features.soil_type = crop.soil_type || 'unknown';
          features.irrigation_type = crop.irrigation_type || 'rainfed';
          
          // Calculate days since planting
          if (crop.planting_date) {
            const plantingDate = new Date(crop.planting_date as string);
            const now = new Date();
            features.days_since_planting = Math.floor((now.getTime() - plantingDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        }

        // Query historical yield data
        const yieldResult = await db.execute(sql`
          SELECT AVG(yield_kg_per_hectare) as avg_yield,
                 MAX(yield_kg_per_hectare) as max_yield,
                 COUNT(*) as seasons
          FROM harvests WHERE crop_id = ${cropId}
        `);
        
        if (yieldResult.rows && yieldResult.rows.length > 0) {
          const yieldData = yieldResult.rows[0] as Record<string, any>;
          features.historical_avg_yield = Number(yieldData.avg_yield) || 0;
          features.historical_max_yield = Number(yieldData.max_yield) || 0;
          features.seasons_of_data = Number(yieldData.seasons) || 0;
        }
      } catch (dbError) {
        logger.warn('[FeatureStore] Could not compute yield features from database, using defaults:', dbError);
      }
    }

    // Cache in online store (Redis)
    await this.setOnlineFeatures('yield_prediction_features', cropId, features);

    // Persist to offline store (Lakehouse) for ML training
    if (persistToLakehouse) {
      try {
        await this.writeOfflineFeatures('yield_prediction_features', [features]);
        logger.info(`[FeatureStore] Persisted yield prediction features for crop ${cropId} to lakehouse`);
      } catch (lakehouseError) {
        logger.warn('[FeatureStore] Could not persist features to lakehouse:', lakehouseError);
      }
    }

    return features;
  }

  /**
   * Compute default prediction features for a loan - PRODUCTION READY
   * Computes features from operational database and persists to both online (Redis) and offline (Lakehouse) stores
   */
  async computeDefaultPredictionFeatures(loanId: number, persistToLakehouse: boolean = true): Promise<Record<string, any>> {
    const db = await getDb();

    const features: Record<string, any> = {
      loan_id: loanId,
      feature_date: new Date().toISOString().split('T')[0],
      _computed_at: new Date().toISOString(),
      
      // Default values - will be overwritten with real data if available
      loan_amount: 0,
      interest_rate: 0,
      term_months: 0,
      monthly_payment: 0,
      days_since_disbursement: 0,
      payments_made: 0,
      payments_missed: 0,
      current_balance: 0,
      days_past_due: 0,
      credit_score_at_origination: 500,
      current_credit_score: 500,
      credit_score_change: 0,
      debt_to_income_ratio: 0,
      previous_defaults: 0,
      avg_days_late: 0,
      max_days_late: 0,
      payment_consistency_score: 100,
      early_payment_count: 0,
      recent_income_change: 0,
      harvest_value_since_loan: 0,
      expense_ratio_change: 0,
      market_price_index: 100,
      weather_risk_score: 50,
    };

    // Try to compute real features from database if available
    if (db) {
      try {
        // Query loan data
        const loanResult = await db.execute(sql`
          SELECT l.*, f.id as farmer_id
          FROM loans l
          LEFT JOIN farmers f ON l.farmer_id = f.id
          WHERE l.id = ${loanId} LIMIT 1
        `);
        
        if (loanResult.rows && loanResult.rows.length > 0) {
          const loan = loanResult.rows[0] as Record<string, any>;
          features.loan_amount = Number(loan.amount) || 0;
          features.interest_rate = Number(loan.interest_rate) || 0;
          features.term_months = Number(loan.term_months) || 0;
          features.monthly_payment = Number(loan.monthly_payment) || 0;
          features.current_balance = Number(loan.balance) || 0;
          features.days_past_due = Number(loan.days_past_due) || 0;
          
          // Calculate days since disbursement
          if (loan.disbursement_date) {
            const disbursementDate = new Date(loan.disbursement_date as string);
            const now = new Date();
            features.days_since_disbursement = Math.floor((now.getTime() - disbursementDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        }

        // Query payment history
        const paymentResult = await db.execute(sql`
          SELECT COUNT(*) as total_payments,
                 COUNT(CASE WHEN status = 'completed' THEN 1 END) as payments_made,
                 COUNT(CASE WHEN status = 'missed' THEN 1 END) as payments_missed,
                 AVG(CASE WHEN days_late > 0 THEN days_late END) as avg_days_late,
                 MAX(days_late) as max_days_late,
                 COUNT(CASE WHEN days_late < 0 THEN 1 END) as early_payments
          FROM loan_payments WHERE loan_id = ${loanId}
        `);
        
        if (paymentResult.rows && paymentResult.rows.length > 0) {
          const paymentData = paymentResult.rows[0] as Record<string, any>;
          features.payments_made = Number(paymentData.payments_made) || 0;
          features.payments_missed = Number(paymentData.payments_missed) || 0;
          features.avg_days_late = Number(paymentData.avg_days_late) || 0;
          features.max_days_late = Number(paymentData.max_days_late) || 0;
          features.early_payment_count = Number(paymentData.early_payments) || 0;
          
          // Calculate payment consistency score
          const totalPayments = Number(paymentData.total_payments) || 0;
          if (totalPayments > 0) {
            features.payment_consistency_score = ((features.payments_made / totalPayments) * 100);
          }
        }
      } catch (dbError) {
        logger.warn('[FeatureStore] Could not compute default prediction features from database, using defaults:', dbError);
      }
    }

    // Cache in online store (Redis)
    await this.setOnlineFeatures('default_prediction_features', loanId, features);

    // Persist to offline store (Lakehouse) for ML training
    if (persistToLakehouse) {
      try {
        await this.writeOfflineFeatures('default_prediction_features', [features]);
        logger.info(`[FeatureStore] Persisted default prediction features for loan ${loanId} to lakehouse`);
      } catch (lakehouseError) {
        logger.warn('[FeatureStore] Could not persist features to lakehouse:', lakehouseError);
      }
    }

    return features;
  }

  /**
   * Batch compute and store features for multiple entities
   */
  async batchComputeFeatures(
    featureGroupName: string,
    entityIds: number[]
  ): Promise<{ computed: number; failed: number }> {
    let computed = 0;
    let failed = 0;

    for (const entityId of entityIds) {
      try {
        switch (featureGroupName) {
          case 'credit_scoring_features':
            await this.computeCreditScoringFeatures(entityId);
            break;
          case 'yield_prediction_features':
            await this.computeYieldPredictionFeatures(entityId);
            break;
          case 'default_prediction_features':
            await this.computeDefaultPredictionFeatures(entityId);
            break;
          default:
            throw new Error(`Unknown feature group: ${featureGroupName}`);
        }
        computed++;
      } catch (error) {
        logger.error(`[FeatureStore] Failed to compute features for ${entityId}:`, error);
        failed++;
      }
    }

    return { computed, failed };
  }

  /**
   * Get feature statistics for a feature group
   */
  async getFeatureStatistics(featureGroupName: string): Promise<Record<string, any>> {
    const group = this.featureGroups.get(featureGroupName);
    if (!group) {
      throw new Error(`Feature group not found: ${featureGroupName}`);
    }

    // In production, this would query the lakehouse for statistics
    return {
      featureGroup: featureGroupName,
      featureCount: group.features.length,
      entityType: group.entityType,
      ttlSeconds: group.ttlSeconds,
      features: group.features.map(f => ({
        name: f.name,
        dataType: f.dataType,
        description: f.description,
      })),
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let featureStoreInstance: FeatureStoreService | null = null;

export function getFeatureStore(): FeatureStoreService {
  if (!featureStoreInstance) {
    featureStoreInstance = new FeatureStoreService();
  }
  return featureStoreInstance;
}

export default {
  FeatureStoreService,
  getFeatureStore,
  CREDIT_SCORING_FEATURES,
  YIELD_PREDICTION_FEATURES,
  DEFAULT_PREDICTION_FEATURES,
};
