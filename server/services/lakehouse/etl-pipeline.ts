/**
 * ETL Pipeline Service
 * 
 * Manages data transformations between lakehouse layers:
 * - Bronze -> Silver (cleaning, normalization, deduplication)
 * - Silver -> Gold (aggregation, analytics)
 * - Silver -> Features (feature engineering for ML)
 */

import { getLakehouseClient, type QueryResult } from './lakehouse-client.js';
import { LAKEHOUSE_TABLES, PARTITION_STRATEGIES, RETENTION_POLICIES } from './lakehouse-config.js';
import { getFeatureStore } from './feature-store.js';
import { logger } from '../../logger.js';

// ============================================================================
// Types
// ============================================================================

export interface PipelineConfig {
  name: string;
  description: string;
  sourceTable: string;
  targetTable: string;
  transformationType: 'bronze_to_silver' | 'silver_to_gold' | 'silver_to_features';
  schedule: string; // Cron expression
  enabled: boolean;
  partitionBy?: string[];
  incrementalColumn?: string;
  watermarkColumn?: string;
}

export interface PipelineRun {
  pipelineId: string;
  runId: string;
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  rowsProcessed: number;
  rowsWritten: number;
  errorMessage?: string;
}

export interface TransformationResult {
  success: boolean;
  rowsRead: number;
  rowsWritten: number;
  executionTimeMs: number;
  errors: string[];
}

// ============================================================================
// ETL Pipeline Definitions
// ============================================================================

export const PIPELINE_CONFIGS: PipelineConfig[] = [
  // Bronze to Silver Pipelines
  {
    name: 'farmer_events_to_fact_farmer',
    description: 'Transform raw farmer events to fact_farmer table',
    sourceTable: LAKEHOUSE_TABLES.bronze.farmer_events,
    targetTable: LAKEHOUSE_TABLES.silver.fact_farmer,
    transformationType: 'bronze_to_silver',
    schedule: '0 */1 * * *', // Every hour
    enabled: true,
    partitionBy: ['partition_date'],
    incrementalColumn: '_ingest_time',
  },
  {
    name: 'harvest_events_to_fact_harvest',
    description: 'Transform raw harvest events to fact_harvest table',
    sourceTable: LAKEHOUSE_TABLES.bronze.harvest_events,
    targetTable: LAKEHOUSE_TABLES.silver.fact_harvest,
    transformationType: 'bronze_to_silver',
    schedule: '0 */1 * * *',
    enabled: true,
    partitionBy: ['harvest_year', 'harvest_month'],
    incrementalColumn: '_ingest_time',
  },
  {
    name: 'expense_events_to_fact_expense',
    description: 'Transform raw expense events to fact_expense table',
    sourceTable: LAKEHOUSE_TABLES.bronze.expense_events,
    targetTable: LAKEHOUSE_TABLES.silver.fact_expense,
    transformationType: 'bronze_to_silver',
    schedule: '0 */1 * * *',
    enabled: true,
    partitionBy: ['expense_year', 'expense_month'],
    incrementalColumn: '_ingest_time',
  },
  {
    name: 'loan_events_to_fact_loan',
    description: 'Transform raw loan events to fact_loan table',
    sourceTable: LAKEHOUSE_TABLES.bronze.loan_events,
    targetTable: LAKEHOUSE_TABLES.silver.fact_loan,
    transformationType: 'bronze_to_silver',
    schedule: '0 */1 * * *',
    enabled: true,
    partitionBy: ['loan_year', 'loan_month'],
    incrementalColumn: '_ingest_time',
  },
  
  // Silver to Gold Pipelines
  {
    name: 'silver_to_farmer_performance',
    description: 'Aggregate farmer performance metrics',
    sourceTable: 'silver.*',
    targetTable: LAKEHOUSE_TABLES.gold.fact_farmer_performance,
    transformationType: 'silver_to_gold',
    schedule: '0 0 * * *', // Daily at midnight
    enabled: true,
    partitionBy: ['report_date'],
  },
  {
    name: 'silver_to_portfolio_risk',
    description: 'Calculate portfolio risk metrics',
    sourceTable: LAKEHOUSE_TABLES.silver.fact_loan,
    targetTable: LAKEHOUSE_TABLES.gold.fact_portfolio_risk,
    transformationType: 'silver_to_gold',
    schedule: '0 0 * * *',
    enabled: true,
    partitionBy: ['report_date'],
  },
  {
    name: 'silver_to_channel_engagement',
    description: 'Aggregate channel engagement metrics',
    sourceTable: LAKEHOUSE_TABLES.bronze.analytics_events,
    targetTable: LAKEHOUSE_TABLES.gold.fact_channel_engagement,
    transformationType: 'silver_to_gold',
    schedule: '0 */6 * * *', // Every 6 hours
    enabled: true,
    partitionBy: ['report_date'],
  },
  {
    name: 'silver_to_crop_yield_analysis',
    description: 'Aggregate crop yield analytics',
    sourceTable: LAKEHOUSE_TABLES.silver.fact_harvest,
    targetTable: LAKEHOUSE_TABLES.gold.fact_crop_yield_analysis,
    transformationType: 'silver_to_gold',
    schedule: '0 0 * * *',
    enabled: true,
    partitionBy: ['report_date'],
  },
  
  // Silver to Features Pipelines
  {
    name: 'silver_to_credit_scoring_features',
    description: 'Engineer credit scoring features',
    sourceTable: 'silver.*',
    targetTable: LAKEHOUSE_TABLES.features.credit_scoring_features,
    transformationType: 'silver_to_features',
    schedule: '0 */4 * * *', // Every 4 hours
    enabled: true,
    partitionBy: ['feature_date'],
  },
  {
    name: 'silver_to_yield_prediction_features',
    description: 'Engineer yield prediction features',
    sourceTable: 'silver.*',
    targetTable: LAKEHOUSE_TABLES.features.yield_prediction_features,
    transformationType: 'silver_to_features',
    schedule: '0 */4 * * *',
    enabled: true,
    partitionBy: ['feature_date'],
  },
  {
    name: 'silver_to_default_prediction_features',
    description: 'Engineer default prediction features',
    sourceTable: LAKEHOUSE_TABLES.silver.fact_loan,
    targetTable: LAKEHOUSE_TABLES.features.default_prediction_features,
    transformationType: 'silver_to_features',
    schedule: '0 */4 * * *',
    enabled: true,
    partitionBy: ['feature_date'],
  },
];

// ============================================================================
// ETL Pipeline Service Class
// ============================================================================

export class ETLPipelineService {
  private pipelines: Map<string, PipelineConfig> = new Map();
  private runHistory: PipelineRun[] = [];

  constructor() {
    // Register default pipelines
    for (const config of PIPELINE_CONFIGS) {
      this.registerPipeline(config);
    }
  }

  /**
   * Register a pipeline
   */
  registerPipeline(config: PipelineConfig): void {
    this.pipelines.set(config.name, config);
    logger.info(`[ETL] Registered pipeline: ${config.name}`);
  }

  /**
   * Get a pipeline by name
   */
  getPipeline(name: string): PipelineConfig | undefined {
    return this.pipelines.get(name);
  }

  /**
   * Get all registered pipelines
   */
  getAllPipelines(): PipelineConfig[] {
    return Array.from(this.pipelines.values());
  }

  /**
   * Run a specific pipeline
   */
  async runPipeline(pipelineName: string): Promise<TransformationResult> {
    const config = this.pipelines.get(pipelineName);
    if (!config) {
      throw new Error(`Pipeline not found: ${pipelineName}`);
    }

    if (!config.enabled) {
      return {
        success: false,
        rowsRead: 0,
        rowsWritten: 0,
        executionTimeMs: 0,
        errors: ['Pipeline is disabled'],
      };
    }

    const runId = `${pipelineName}-${Date.now()}`;
    const run: PipelineRun = {
      pipelineId: pipelineName,
      runId,
      status: 'running',
      startTime: new Date(),
      rowsProcessed: 0,
      rowsWritten: 0,
    };
    this.runHistory.push(run);

    logger.info(`[ETL] Starting pipeline: ${pipelineName}`);
    const startTime = Date.now();

    try {
      let result: TransformationResult;

      switch (config.transformationType) {
        case 'bronze_to_silver':
          result = await this.runBronzeToSilver(config);
          break;
        case 'silver_to_gold':
          result = await this.runSilverToGold(config);
          break;
        case 'silver_to_features':
          result = await this.runSilverToFeatures(config);
          break;
        default:
          throw new Error(`Unknown transformation type: ${config.transformationType}`);
      }

      run.status = result.success ? 'completed' : 'failed';
      run.endTime = new Date();
      run.rowsProcessed = result.rowsRead;
      run.rowsWritten = result.rowsWritten;

      logger.info(`[ETL] Pipeline ${pipelineName} completed: ${result.rowsWritten} rows written`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      run.status = 'failed';
      run.endTime = new Date();
      run.errorMessage = errorMessage;

      logger.error(`[ETL] Pipeline ${pipelineName} failed:`, error);
      return {
        success: false,
        rowsRead: 0,
        rowsWritten: 0,
        executionTimeMs: Date.now() - startTime,
        errors: [errorMessage],
      };
    }
  }

  /**
   * Run Bronze to Silver transformation
   */
  private async runBronzeToSilver(config: PipelineConfig): Promise<TransformationResult> {
    const lakehouse = getLakehouseClient();
    const startTime = Date.now();
    const errors: string[] = [];

    // Build transformation query based on source table
    let transformQuery: string;

    if (config.sourceTable.includes('farmer_events')) {
      transformQuery = this.buildFarmerTransformQuery(config);
    } else if (config.sourceTable.includes('harvest_events')) {
      transformQuery = this.buildHarvestTransformQuery(config);
    } else if (config.sourceTable.includes('expense_events')) {
      transformQuery = this.buildExpenseTransformQuery(config);
    } else if (config.sourceTable.includes('loan_events')) {
      transformQuery = this.buildLoanTransformQuery(config);
    } else {
      transformQuery = this.buildGenericTransformQuery(config);
    }

    logger.info(`[ETL] Executing transform query for ${config.name}`);

    // Execute transformation
    const result = await lakehouse.executeQuery(transformQuery);

    // Write to target table
    const writeResult = await lakehouse.writeTable(
      config.targetTable,
      result.rows,
      {
        mode: 'merge',
        partitionBy: config.partitionBy,
        mergeKeys: ['id'],
      }
    );

    return {
      success: true,
      rowsRead: result.rowCount,
      rowsWritten: writeResult.rowsWritten,
      executionTimeMs: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Run Silver to Gold transformation
   */
  private async runSilverToGold(config: PipelineConfig): Promise<TransformationResult> {
    const lakehouse = getLakehouseClient();
    const startTime = Date.now();
    const errors: string[] = [];
    const reportDate = new Date().toISOString().split('T')[0];

    let aggregationQuery: string;

    if (config.targetTable.includes('farmer_performance')) {
      aggregationQuery = this.buildFarmerPerformanceQuery(reportDate);
    } else if (config.targetTable.includes('portfolio_risk')) {
      aggregationQuery = this.buildPortfolioRiskQuery(reportDate);
    } else if (config.targetTable.includes('channel_engagement')) {
      aggregationQuery = this.buildChannelEngagementQuery(reportDate);
    } else if (config.targetTable.includes('crop_yield_analysis')) {
      aggregationQuery = this.buildCropYieldAnalysisQuery(reportDate);
    } else {
      aggregationQuery = `SELECT '${reportDate}' as report_date`;
    }

    logger.info(`[ETL] Executing aggregation query for ${config.name}`);

    const result = await lakehouse.executeQuery(aggregationQuery);

    const writeResult = await lakehouse.writeTable(
      config.targetTable,
      result.rows,
      {
        mode: 'overwrite',
        partitionBy: config.partitionBy,
      }
    );

    return {
      success: true,
      rowsRead: result.rowCount,
      rowsWritten: writeResult.rowsWritten,
      executionTimeMs: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Run Silver to Features transformation
   */
  private async runSilverToFeatures(config: PipelineConfig): Promise<TransformationResult> {
    const lakehouse = getLakehouseClient();
    const featureStore = getFeatureStore();
    const startTime = Date.now();
    const errors: string[] = [];
    const featureDate = new Date().toISOString().split('T')[0];

    let featureQuery: string;

    if (config.targetTable.includes('credit_scoring')) {
      featureQuery = this.buildCreditScoringFeaturesQuery(featureDate);
    } else if (config.targetTable.includes('yield_prediction')) {
      featureQuery = this.buildYieldPredictionFeaturesQuery(featureDate);
    } else if (config.targetTable.includes('default_prediction')) {
      featureQuery = this.buildDefaultPredictionFeaturesQuery(featureDate);
    } else {
      featureQuery = `SELECT '${featureDate}' as feature_date`;
    }

    logger.info(`[ETL] Executing feature engineering query for ${config.name}`);

    const result = await lakehouse.executeQuery(featureQuery);

    // Write to lakehouse (offline store)
    const writeResult = await lakehouse.writeTable(
      config.targetTable,
      result.rows,
      {
        mode: 'overwrite',
        partitionBy: config.partitionBy,
      }
    );

    // Also update online store (Redis) for recent features
    for (const row of result.rows.slice(0, 1000)) { // Limit to 1000 for online store
      const entityIdColumn = config.targetTable.includes('credit_scoring') ? 'farmer_id'
        : config.targetTable.includes('yield_prediction') ? 'crop_id'
        : 'loan_id';
      
      const featureGroupName = config.targetTable.split('.')[1];
      const entityId = row[entityIdColumn];
      
      if (entityId !== undefined && entityId !== null) {
        const entityIdValue = typeof entityId === 'number' ? entityId : Number(entityId);
        if (!isNaN(entityIdValue)) {
          await featureStore.setOnlineFeatures(featureGroupName, entityIdValue, row);
        }
      }
    }

    return {
      success: true,
      rowsRead: result.rowCount,
      rowsWritten: writeResult.rowsWritten,
      executionTimeMs: Date.now() - startTime,
      errors,
    };
  }

  // ============================================================================
  // Query Builders
  // ============================================================================

  private buildFarmerTransformQuery(config: PipelineConfig): string {
    return `
      WITH latest_events AS (
        SELECT 
          farmer_id,
          MAX(_ingest_time) as latest_time
        FROM ${config.sourceTable}
        WHERE event_type IN ('CREATED', 'UPDATED')
        GROUP BY farmer_id
      ),
      deduplicated AS (
        SELECT e.*
        FROM ${config.sourceTable} e
        INNER JOIN latest_events le 
          ON e.farmer_id = le.farmer_id 
          AND e._ingest_time = le.latest_time
      )
      SELECT
        farmer_id,
        user_id,
        COALESCE(farmer_name, '') as farmer_name,
        COALESCE(phone_number, '') as phone_number,
        NULL as email,
        NULL as gender,
        NULL as date_of_birth,
        NULL as national_id,
        cooperative_id,
        NULL as location_id,
        DATE(event_timestamp) as registration_date,
        'unverified' as kyc_tier,
        'pending' as kyc_status,
        true as is_active,
        event_timestamp as created_at,
        _ingest_time as updated_at,
        DATE(_ingest_time) as partition_date
      FROM deduplicated
    `;
  }

  private buildHarvestTransformQuery(config: PipelineConfig): string {
    return `
      SELECT
        harvest_id,
        crop_id,
        farm_id,
        user_id as farmer_id,
        COALESCE(JSON_EXTRACT_SCALAR(raw_data, '$.cropType'), 'unknown') as crop_type,
        JSON_EXTRACT_SCALAR(raw_data, '$.variety') as variety,
        COALESCE(quantity, 0) as quantity,
        COALESCE(unit, 'kg') as unit,
        quality_grade,
        COALESCE(harvest_date, DATE(event_timestamp)) as harvest_date,
        price_per_unit,
        total_value,
        'NGN' as currency,
        NULL as storage_location,
        0 as sold_quantity,
        event_timestamp as created_at,
        YEAR(COALESCE(harvest_date, DATE(event_timestamp))) as harvest_year,
        MONTH(COALESCE(harvest_date, DATE(event_timestamp))) as harvest_month
      FROM ${config.sourceTable}
      WHERE event_type = 'CREATED'
    `;
  }

  private buildExpenseTransformQuery(config: PipelineConfig): string {
    return `
      SELECT
        entity_id as expense_id,
        farm_id,
        user_id as farmer_id,
        COALESCE(category, 'other') as category,
        NULL as subcategory,
        COALESCE(amount, 0) as amount,
        COALESCE(JSON_EXTRACT_SCALAR(raw_data, '$.currency'), 'NGN') as currency,
        description,
        COALESCE(expense_date, DATE(event_timestamp)) as expense_date,
        NULL as payment_method,
        NULL as vendor,
        NULL as receipt_url,
        event_timestamp as created_at,
        YEAR(COALESCE(expense_date, DATE(event_timestamp))) as expense_year,
        MONTH(COALESCE(expense_date, DATE(event_timestamp))) as expense_month
      FROM ${config.sourceTable}
      WHERE event_type = 'CREATED'
    `;
  }

  private buildLoanTransformQuery(config: PipelineConfig): string {
    return `
      SELECT
        loan_id,
        farmer_id,
        JSON_EXTRACT_SCALAR(raw_data, '$.cooperativeId')::BIGINT as cooperative_id,
        JSON_EXTRACT_SCALAR(raw_data, '$.loanProductId')::BIGINT as loan_product_id,
        COALESCE(loan_amount, 0) as loan_amount,
        COALESCE(JSON_EXTRACT_SCALAR(raw_data, '$.disbursedAmount')::DECIMAL, 0) as disbursed_amount,
        COALESCE(interest_rate, 0) as interest_rate,
        COALESCE(term_months, 12) as term_months,
        COALESCE(JSON_EXTRACT_SCALAR(raw_data, '$.repaymentFrequency'), 'monthly') as repayment_frequency,
        COALESCE(status, 'pending') as status,
        DATE(event_timestamp) as application_date,
        CASE WHEN status IN ('approved', 'disbursed', 'active', 'completed') 
          THEN DATE(JSON_EXTRACT_SCALAR(raw_data, '$.approvalDate')) END as approval_date,
        CASE WHEN status IN ('disbursed', 'active', 'completed') 
          THEN DATE(disbursement_date) END as disbursement_date,
        DATE(due_date) as due_date,
        CASE WHEN status = 'completed' 
          THEN DATE(JSON_EXTRACT_SCALAR(raw_data, '$.completionDate')) END as completion_date,
        COALESCE(JSON_EXTRACT_SCALAR(raw_data, '$.totalRepaid')::DECIMAL, 0) as total_repaid,
        COALESCE(JSON_EXTRACT_SCALAR(raw_data, '$.outstandingBalance')::DECIMAL, loan_amount) as outstanding_balance,
        COALESCE(JSON_EXTRACT_SCALAR(raw_data, '$.daysPastDue')::INT, 0) as days_past_due,
        JSON_EXTRACT_SCALAR(raw_data, '$.creditScore')::INT as credit_score_at_application,
        JSON_EXTRACT_SCALAR(raw_data, '$.riskCategory') as risk_category,
        'NGN' as currency,
        event_timestamp as created_at,
        YEAR(DATE(event_timestamp)) as loan_year,
        MONTH(DATE(event_timestamp)) as loan_month
      FROM ${config.sourceTable}
      WHERE event_type IN ('CREATED', 'UPDATED')
    `;
  }

  private buildGenericTransformQuery(config: PipelineConfig): string {
    return `
      SELECT *,
        DATE(_ingest_time) as partition_date
      FROM ${config.sourceTable}
    `;
  }

  private buildFarmerPerformanceQuery(reportDate: string): string {
    return `
      WITH farmer_farms AS (
        SELECT 
          farmer_id,
          COUNT(*) as total_farms,
          SUM(size_hectares) as total_farm_area_hectares
        FROM ${LAKEHOUSE_TABLES.silver.fact_farm}
        WHERE is_active = true
        GROUP BY farmer_id
      ),
      farmer_harvests AS (
        SELECT
          farmer_id,
          COUNT(*) as total_harvests_ytd,
          SUM(total_value) as total_harvest_value_ytd,
          AVG(quantity / NULLIF(1, 0)) as avg_yield_per_hectare,
          MAX(crop_type) as top_crop_by_value
        FROM ${LAKEHOUSE_TABLES.silver.fact_harvest}
        WHERE harvest_year = YEAR(DATE('${reportDate}'))
        GROUP BY farmer_id
      ),
      farmer_expenses AS (
        SELECT
          farmer_id,
          SUM(amount) as total_expenses_ytd
        FROM ${LAKEHOUSE_TABLES.silver.fact_expense}
        WHERE expense_year = YEAR(DATE('${reportDate}'))
        GROUP BY farmer_id
      ),
      farmer_loans AS (
        SELECT
          farmer_id,
          COUNT(*) as total_loans,
          SUM(CASE WHEN status IN ('active', 'disbursed') THEN 1 ELSE 0 END) as active_loans,
          SUM(loan_amount) as total_borrowed,
          SUM(total_repaid) as total_repaid,
          SUM(outstanding_balance) as outstanding_balance,
          AVG(CASE WHEN days_past_due = 0 THEN 1.0 ELSE 0.0 END) as on_time_payment_rate
        FROM ${LAKEHOUSE_TABLES.silver.fact_loan}
        GROUP BY farmer_id
      )
      SELECT
        f.farmer_id,
        f.farmer_name,
        f.cooperative_id,
        '${reportDate}' as report_date,
        COALESCE(ff.total_farms, 0) as total_farms,
        COALESCE(ff.total_farm_area_hectares, 0) as total_farm_area_hectares,
        0 as active_crops,
        COALESCE(fh.total_harvests_ytd, 0) as total_harvests_ytd,
        COALESCE(fh.total_harvest_value_ytd, 0) as total_harvest_value_ytd,
        COALESCE(fh.avg_yield_per_hectare, 0) as avg_yield_per_hectare,
        fh.top_crop_by_value,
        COALESCE(fh.total_harvest_value_ytd, 0) as total_revenue_ytd,
        COALESCE(fe.total_expenses_ytd, 0) as total_expenses_ytd,
        COALESCE(fh.total_harvest_value_ytd, 0) - COALESCE(fe.total_expenses_ytd, 0) as net_profit_ytd,
        CASE WHEN COALESCE(fh.total_harvest_value_ytd, 0) > 0 
          THEN (COALESCE(fh.total_harvest_value_ytd, 0) - COALESCE(fe.total_expenses_ytd, 0)) / fh.total_harvest_value_ytd * 100
          ELSE 0 END as profit_margin_pct,
        COALESCE(fl.total_loans, 0) as total_loans,
        COALESCE(fl.active_loans, 0) as active_loans,
        COALESCE(fl.total_borrowed, 0) as total_borrowed,
        COALESCE(fl.total_repaid, 0) as total_repaid,
        COALESCE(fl.outstanding_balance, 0) as outstanding_balance,
        COALESCE(fl.on_time_payment_rate, 0) as on_time_payment_rate,
        0 as app_sessions_30d,
        NULL as last_activity_date,
        NULL as credit_score,
        NULL as risk_category,
        f.kyc_tier
      FROM ${LAKEHOUSE_TABLES.silver.fact_farmer} f
      LEFT JOIN farmer_farms ff ON f.farmer_id = ff.farmer_id
      LEFT JOIN farmer_harvests fh ON f.farmer_id = fh.farmer_id
      LEFT JOIN farmer_expenses fe ON f.farmer_id = fe.farmer_id
      LEFT JOIN farmer_loans fl ON f.farmer_id = fl.farmer_id
    `;
  }

  private buildPortfolioRiskQuery(reportDate: string): string {
    return `
      SELECT
        '${reportDate}' as report_date,
        cooperative_id,
        COUNT(*) as total_loans,
        SUM(disbursed_amount) as total_disbursed,
        SUM(outstanding_balance) as total_outstanding,
        SUM(total_repaid) as total_repaid,
        SUM(CASE WHEN days_past_due BETWEEN 1 AND 30 THEN outstanding_balance ELSE 0 END) as par_1_amount,
        SUM(CASE WHEN days_past_due BETWEEN 1 AND 30 THEN outstanding_balance ELSE 0 END) / NULLIF(SUM(outstanding_balance), 0) * 100 as par_1_rate,
        SUM(CASE WHEN days_past_due BETWEEN 31 AND 60 THEN outstanding_balance ELSE 0 END) as par_30_amount,
        SUM(CASE WHEN days_past_due BETWEEN 31 AND 60 THEN outstanding_balance ELSE 0 END) / NULLIF(SUM(outstanding_balance), 0) * 100 as par_30_rate,
        SUM(CASE WHEN days_past_due BETWEEN 61 AND 90 THEN outstanding_balance ELSE 0 END) as par_60_amount,
        SUM(CASE WHEN days_past_due BETWEEN 61 AND 90 THEN outstanding_balance ELSE 0 END) / NULLIF(SUM(outstanding_balance), 0) * 100 as par_60_rate,
        SUM(CASE WHEN days_past_due > 90 THEN outstanding_balance ELSE 0 END) as par_90_amount,
        SUM(CASE WHEN days_past_due > 90 THEN outstanding_balance ELSE 0 END) / NULLIF(SUM(outstanding_balance), 0) * 100 as par_90_rate,
        SUM(CASE WHEN status = 'defaulted' THEN 1 ELSE 0 END) as default_count,
        SUM(CASE WHEN status = 'defaulted' THEN outstanding_balance ELSE 0 END) as default_amount,
        SUM(CASE WHEN status = 'defaulted' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100 as default_rate,
        0 as recovered_amount,
        0 as recovery_rate,
        SUM(CASE WHEN risk_category = 'low' THEN 1 ELSE 0 END) as low_risk_count,
        SUM(CASE WHEN risk_category = 'medium' THEN 1 ELSE 0 END) as medium_risk_count,
        SUM(CASE WHEN risk_category = 'high' THEN 1 ELSE 0 END) as high_risk_count,
        0 as top_10_borrowers_exposure,
        0 as single_borrower_limit_breaches
      FROM ${LAKEHOUSE_TABLES.silver.fact_loan}
      WHERE status IN ('active', 'disbursed', 'defaulted')
      GROUP BY cooperative_id
    `;
  }

  private buildChannelEngagementQuery(reportDate: string): string {
    return `
      SELECT
        '${reportDate}' as report_date,
        channel,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_messages,
        0 as avg_session_duration_seconds,
        1 as avg_messages_per_session,
        0 as bounce_rate,
        SUM(CASE WHEN JSON_EXTRACT_SCALAR(raw_data, '$.status') = 'success' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100 as success_rate,
        SUM(CASE WHEN JSON_EXTRACT_SCALAR(raw_data, '$.status') = 'error' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100 as error_rate,
        0 as completion_rate,
        0 as total_cost,
        0 as cost_per_session,
        0 as cost_per_user,
        '' as top_feature,
        '{}' as feature_usage_breakdown
      FROM ${LAKEHOUSE_TABLES.bronze.analytics_events}
      WHERE DATE(_ingest_time) = DATE('${reportDate}')
      GROUP BY channel
    `;
  }

  private buildCropYieldAnalysisQuery(reportDate: string): string {
    return `
      SELECT
        '${reportDate}' as report_date,
        crop_type,
        NULL as region,
        CASE 
          WHEN harvest_month BETWEEN 3 AND 5 THEN 'long_rains'
          WHEN harvest_month BETWEEN 10 AND 12 THEN 'short_rains'
          ELSE 'dry_season'
        END as season,
        SUM(1) as total_area_planted_hectares,
        SUM(quantity) as total_harvested_quantity,
        AVG(quantity) as avg_yield_per_hectare,
        MIN(quantity) as min_yield_per_hectare,
        MAX(quantity) as max_yield_per_hectare,
        STDDEV(quantity) as yield_std_dev,
        0 as grade_a_percentage,
        0 as grade_b_percentage,
        0 as grade_c_percentage,
        AVG(price_per_unit) as avg_price_per_unit,
        MIN(price_per_unit) as min_price_per_unit,
        MAX(price_per_unit) as max_price_per_unit,
        SUM(total_value) as total_value,
        0 as yield_vs_national_avg,
        0 as yield_vs_previous_season,
        COUNT(DISTINCT farmer_id) as farmer_count,
        COUNT(DISTINCT farm_id) as farm_count
      FROM ${LAKEHOUSE_TABLES.silver.fact_harvest}
      WHERE harvest_year = YEAR(DATE('${reportDate}'))
      GROUP BY crop_type, harvest_month
    `;
  }

  private buildCreditScoringFeaturesQuery(featureDate: string): string {
    return `
      SELECT
        f.farmer_id,
        '${featureDate}' as feature_date,
        0 as age,
        'unknown' as gender,
        0 as years_of_experience,
        'none' as education_level,
        COALESCE(ff.total_farm_area, 0) as farm_size_hectares,
        COALESCE(ff.farm_count, 0) as number_of_farms,
        0 as crop_diversity,
        false as has_irrigation,
        false as has_mechanization,
        COALESCE(fl.total_loans, 0) as total_previous_loans,
        COALESCE(fl.completed_loans, 0) as completed_loans,
        COALESCE(fl.defaulted_loans, 0) as defaulted_loans,
        COALESCE(fl.avg_days_late, 0) as average_repayment_days,
        COALESCE(fl.total_borrowed, 0) as total_amount_borrowed,
        COALESCE(fl.total_repaid, 0) as total_amount_repaid,
        CASE WHEN COALESCE(fl.total_loans, 0) > 0 
          THEN COALESCE(fl.completed_loans, 0) / fl.total_loans * 100 
          ELSE 0 END as loan_completion_rate,
        COALESCE(fh.avg_monthly_income, 0) as average_monthly_income,
        1 as income_stability,
        false as has_alternative_income,
        COALESCE(fh.total_harvest_value, 0) as total_harvest_value_12m,
        COALESCE(fe.total_expenses, 0) as total_expenses_12m,
        f.cooperative_id IS NOT NULL as is_cooperative_member,
        0 as cooperative_tenure_months,
        0 as cooperative_participation_score,
        0 as app_usage_frequency,
        0 as data_completeness_score,
        false as has_verified_phone,
        false as has_verified_id,
        f.kyc_tier,
        0 as distance_to_market_km,
        false as has_market_contracts,
        0 as marketplace_sales_12m,
        50 as drought_risk_score,
        50 as flood_risk_score,
        'medium' as climate_risk_zone
      FROM ${LAKEHOUSE_TABLES.silver.fact_farmer} f
      LEFT JOIN (
        SELECT farmer_id, SUM(size_hectares) as total_farm_area, COUNT(*) as farm_count
        FROM ${LAKEHOUSE_TABLES.silver.fact_farm}
        GROUP BY farmer_id
      ) ff ON f.farmer_id = ff.farmer_id
      LEFT JOIN (
        SELECT 
          farmer_id,
          COUNT(*) as total_loans,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_loans,
          SUM(CASE WHEN status = 'defaulted' THEN 1 ELSE 0 END) as defaulted_loans,
          AVG(days_past_due) as avg_days_late,
          SUM(loan_amount) as total_borrowed,
          SUM(total_repaid) as total_repaid
        FROM ${LAKEHOUSE_TABLES.silver.fact_loan}
        GROUP BY farmer_id
      ) fl ON f.farmer_id = fl.farmer_id
      LEFT JOIN (
        SELECT farmer_id, SUM(total_value) as total_harvest_value, AVG(total_value) as avg_monthly_income
        FROM ${LAKEHOUSE_TABLES.silver.fact_harvest}
        WHERE harvest_date >= DATE_ADD(DATE('${featureDate}'), -365)
        GROUP BY farmer_id
      ) fh ON f.farmer_id = fh.farmer_id
      LEFT JOIN (
        SELECT farmer_id, SUM(amount) as total_expenses
        FROM ${LAKEHOUSE_TABLES.silver.fact_expense}
        WHERE expense_date >= DATE_ADD(DATE('${featureDate}'), -365)
        GROUP BY farmer_id
      ) fe ON f.farmer_id = fe.farmer_id
    `;
  }

  private buildYieldPredictionFeaturesQuery(featureDate: string): string {
    return `
      SELECT
        c.crop_id,
        '${featureDate}' as feature_date,
        c.crop_type,
        c.variety,
        c.planting_date,
        DATEDIFF(DATE('${featureDate}'), c.planting_date) as days_since_planting,
        120 as expected_harvest_days,
        'unknown' as growth_stage,
        COALESCE(f.size_hectares, 0) as field_area_hectares,
        COALESCE(f.soil_type, 'unknown') as soil_type,
        7 as soil_ph,
        0 as soil_nitrogen,
        0 as soil_phosphorus,
        0 as soil_potassium,
        COALESCE(f.irrigation_type, 'rainfed') as irrigation_type,
        0 as irrigation_frequency,
        50 as water_availability_score,
        25 as avg_temperature_30d,
        0 as total_rainfall_30d,
        60 as avg_humidity_30d,
        0 as sunshine_hours_30d,
        0 as growing_degree_days,
        0.5 as current_ndvi,
        0 as ndvi_trend_30d,
        50 as vegetation_health_score,
        COALESCE(hist.avg_yield, 0) as historical_avg_yield,
        COALESCE(hist.max_yield, 0) as historical_max_yield,
        0 as yield_trend,
        COALESCE(hist.seasons, 0) as seasons_of_data,
        false as fertilizer_applied,
        'none' as fertilizer_type,
        false as pesticide_applied,
        0 as pest_pressure_score,
        0 as disease_pressure_score,
        50 as management_score
      FROM ${LAKEHOUSE_TABLES.silver.fact_crop} c
      LEFT JOIN ${LAKEHOUSE_TABLES.silver.fact_farm} f ON c.farm_id = f.farm_id
      LEFT JOIN (
        SELECT 
          crop_type,
          AVG(quantity) as avg_yield,
          MAX(quantity) as max_yield,
          COUNT(DISTINCT harvest_year) as seasons
        FROM ${LAKEHOUSE_TABLES.silver.fact_harvest}
        GROUP BY crop_type
      ) hist ON c.crop_type = hist.crop_type
    `;
  }

  private buildDefaultPredictionFeaturesQuery(featureDate: string): string {
    return `
      SELECT
        l.loan_id,
        '${featureDate}' as feature_date,
        l.loan_amount,
        l.interest_rate,
        l.term_months,
        l.loan_amount / NULLIF(l.term_months, 0) as monthly_payment,
        DATEDIFF(DATE('${featureDate}'), l.disbursement_date) as days_since_disbursement,
        0 as payments_made,
        0 as payments_missed,
        l.outstanding_balance as current_balance,
        l.days_past_due,
        l.credit_score_at_application as credit_score_at_origination,
        l.credit_score_at_application as current_credit_score,
        0 as credit_score_change,
        0 as debt_to_income_ratio,
        COALESCE(prev.defaulted_loans, 0) as previous_defaults,
        COALESCE(prev.avg_days_late, 0) as avg_days_late,
        COALESCE(prev.max_days_late, 0) as max_days_late,
        100 as payment_consistency_score,
        0 as early_payment_count,
        0 as recent_income_change,
        0 as harvest_value_since_loan,
        0 as expense_ratio_change,
        100 as market_price_index,
        50 as weather_risk_score
      FROM ${LAKEHOUSE_TABLES.silver.fact_loan} l
      LEFT JOIN (
        SELECT 
          farmer_id,
          SUM(CASE WHEN status = 'defaulted' THEN 1 ELSE 0 END) as defaulted_loans,
          AVG(days_past_due) as avg_days_late,
          MAX(days_past_due) as max_days_late
        FROM ${LAKEHOUSE_TABLES.silver.fact_loan}
        GROUP BY farmer_id
      ) prev ON l.farmer_id = prev.farmer_id
      WHERE l.status IN ('active', 'disbursed')
    `;
  }

  // ============================================================================
  // Pipeline Management
  // ============================================================================

  /**
   * Run all enabled pipelines
   */
  async runAllPipelines(): Promise<Map<string, TransformationResult>> {
    const results = new Map<string, TransformationResult>();

    for (const [name, config] of Array.from(this.pipelines.entries())) {
      if (config.enabled) {
        const result = await this.runPipeline(name);
        results.set(name, result);
      }
    }

    return results;
  }

  /**
   * Get pipeline run history
   */
  getRunHistory(pipelineName?: string): PipelineRun[] {
    if (pipelineName) {
      return this.runHistory.filter(r => r.pipelineId === pipelineName);
    }
    return [...this.runHistory];
  }

  /**
   * Apply data retention policies
   */
  async applyRetentionPolicies(): Promise<void> {
    const lakehouse = getLakehouseClient();

    for (const [layer, retentionDays] of Object.entries(RETENTION_POLICIES)) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      logger.info(`[ETL] Applying retention policy for ${layer}: deleting data older than ${cutoffDateStr}`);

      // In production, this would execute DELETE statements
      // await lakehouse.executeQuery(`DELETE FROM ${layer}.* WHERE partition_date < '${cutoffDateStr}'`);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let etlPipelineInstance: ETLPipelineService | null = null;

export function getETLPipeline(): ETLPipelineService {
  if (!etlPipelineInstance) {
    etlPipelineInstance = new ETLPipelineService();
  }
  return etlPipelineInstance;
}

export default {
  ETLPipelineService,
  getETLPipeline,
  PIPELINE_CONFIGS,
};
