/**
 * Lakehouse Module
 * 
 * Unified data platform for advanced analytics and AI/ML
 * 
 * Components:
 * - Lakehouse Client: Object storage (S3/MinIO) + Table format (Delta/Iceberg)
 * - Kafka Sink Connectors: Stream events to bronze layer
 * - Data Models: Bronze/Silver/Gold medallion architecture
 * - Feature Store: ML feature management (offline + online)
 * - ETL Pipelines: Data transformations between layers
 */

// Configuration
export {
  getLakehouseConfig,
  LAKEHOUSE_TABLES,
  PARTITION_STRATEGIES,
  RETENTION_POLICIES,
  type LakehouseConfig,
} from './lakehouse-config.js';

// Client
export {
  LakehouseClient,
  getLakehouseClient,
  type WriteOptions,
  type ReadOptions,
  type TableMetadata,
  type ColumnSchema,
  type QueryResult,
} from './lakehouse-client.js';

// Kafka Sink Connectors
export {
  KafkaSinkConnector,
  SinkConnectorManager,
  createBronzeSinkConnectors,
  sinkConnectorManager,
  type SinkConnectorConfig,
  type SinkMetrics,
} from './kafka-sink-connector.js';

// Data Models
export {
  // Bronze layer types
  type BronzeFarmerEvent,
  type BronzeHarvestEvent,
  type BronzeLoanEvent,
  type BronzeRepaymentEvent,
  
  // Silver layer types - Facts
  type FactFarmer,
  type FactFarm,
  type FactHarvest,
  type FactExpense,
  type FactLoan,
  type FactRepayment,
  type FactMarketplaceOrder,
  type FactKycVerification,
  
  // Silver layer types - Dimensions
  type DimFarmer,
  type DimFarm,
  type DimCooperative,
  type DimProduct,
  type DimLocation,
  type DimTime,
  
  // Gold layer types
  type GoldFarmerPerformance,
  type GoldPortfolioRisk,
  type GoldChannelEngagement,
  type GoldCropYieldAnalysis,
  type GoldLoanPortfolio,
  type GoldMarketplaceAnalytics,
  type GoldCooperativePerformance,
  
  // Schema definitions
  BRONZE_SCHEMAS,
  SILVER_SCHEMAS,
  GOLD_SCHEMAS,
} from './data-models.js';

// Feature Store
export {
  FeatureStoreService,
  getFeatureStore,
  CREDIT_SCORING_FEATURES,
  YIELD_PREDICTION_FEATURES,
  DEFAULT_PREDICTION_FEATURES,
  type FeatureDefinition,
  type FeatureGroup,
} from './feature-store.js';

// ETL Pipelines
export {
  ETLPipelineService,
  getETLPipeline,
  PIPELINE_CONFIGS,
  type PipelineConfig,
  type PipelineRun,
  type TransformationResult,
} from './etl-pipeline.js';

// ML Feature Integration
export {
  MLFeatureIntegrationService,
  getMLFeatureIntegration,
  type MLPredictionLog,
  type FeatureVector,
} from './ml-feature-integration.js';

// DL/LLM Integration - PRODUCTION READY
export {
  DLLLMIntegrationService,
  getDLLLMService,
  type EmbeddingConfig,
  type LLMConfig,
  type VectorSearchResult,
  type RAGContext,
  type TrainingDataset,
  type ModelPrediction,
} from './dl-llm-integration.js';

// GPS Analytics - Sedona/Lakehouse Integration
export {
  GPSAnalyticsService,
  getGPSAnalyticsService,
  type GPSFarmActivity,
  type GPSDeviceCoverage,
  type GPSHeatmapCell,
  type GPSAnalyticsSummary,
} from './gps-analytics.js';

// ============================================================================
// Lakehouse Initialization
// ============================================================================

import { getLakehouseClient } from './lakehouse-client.js';
import { sinkConnectorManager } from './kafka-sink-connector.js';
import { getFeatureStore } from './feature-store.js';
import { getETLPipeline } from './etl-pipeline.js';
import { getDLLLMService } from './dl-llm-integration.js';
import { logger } from '../../logger.js';

export interface LakehouseStatus {
  connected: boolean;
  sinkConnectors: {
    running: number;
    total: number;
  };
  featureGroups: number;
  pipelines: {
    enabled: number;
    total: number;
  };
}

/**
 * Initialize the lakehouse system - PRODUCTION READY
 */
export async function initializeLakehouse(): Promise<void> {
  logger.info('[Lakehouse] Initializing lakehouse system...');

  try {
    // 1. Connect to lakehouse (S3/MinIO + local fallback)
    const client = getLakehouseClient();
    await client.connect();
    logger.info(`[Lakehouse] Storage mode: ${client.getStorageMode()}`);

    // 2. Start Kafka sink connectors (graceful failure if Kafka unavailable)
    try {
      await sinkConnectorManager.startAll();
    } catch (kafkaError) {
      logger.warn('[Lakehouse] Kafka sink connectors not started (Kafka may be unavailable):', kafkaError);
    }

    // 3. Initialize feature store
    const featureStore = getFeatureStore();
    logger.info(`[Lakehouse] Feature store initialized with ${featureStore.getAllFeatureGroups().length} feature groups`);

    // 4. Initialize ETL pipelines
    const etlPipeline = getETLPipeline();
    const enabledPipelines = etlPipeline.getAllPipelines().filter(p => p.enabled).length;
    logger.info(`[Lakehouse] ETL pipelines initialized: ${enabledPipelines} enabled`);

    // 5. Initialize DL/LLM integration service
    const dlLLMService = getDLLLMService();
    await dlLLMService.initialize();
    logger.info('[Lakehouse] DL/LLM integration service initialized');

    logger.info('[Lakehouse] Lakehouse system initialized successfully');
  } catch (error) {
    logger.error('[Lakehouse] Failed to initialize lakehouse:', error);
    throw error;
  }
}

/**
 * Shutdown the lakehouse system
 */
export async function shutdownLakehouse(): Promise<void> {
  logger.info('[Lakehouse] Shutting down lakehouse system...');

  try {
    // Stop sink connectors
    await sinkConnectorManager.stopAll();

    // Disconnect from lakehouse
    const client = getLakehouseClient();
    await client.disconnect();

    logger.info('[Lakehouse] Lakehouse system shut down successfully');
  } catch (error) {
    logger.error('[Lakehouse] Error during shutdown:', error);
  }
}

/**
 * Get lakehouse system status
 */
export function getLakehouseStatus(): LakehouseStatus {
  const client = getLakehouseClient();
  const featureStore = getFeatureStore();
  const etlPipeline = getETLPipeline();
  const sinkMetrics = sinkConnectorManager.getAllMetrics();
  const pipelines = etlPipeline.getAllPipelines();

  return {
    connected: client.isConnected(),
    sinkConnectors: {
      running: sinkMetrics.length,
      total: 9, // Number of configured connectors
    },
    featureGroups: featureStore.getAllFeatureGroups().length,
    pipelines: {
      enabled: pipelines.filter(p => p.enabled).length,
      total: pipelines.length,
    },
  };
}

/**
 * Run all ETL pipelines manually
 */
export async function runAllETLPipelines(): Promise<Map<string, unknown>> {
  const etlPipeline = getETLPipeline();
  return await etlPipeline.runAllPipelines();
}

/**
 * Compute features for a farmer (for credit scoring)
 */
export async function computeFarmerFeatures(farmerId: number): Promise<Record<string, unknown>> {
  const featureStore = getFeatureStore();
  return await featureStore.computeCreditScoringFeatures(farmerId);
}

/**
 * Get features for a farmer from online store
 */
export async function getFarmerFeatures(farmerId: number): Promise<Record<string, unknown> | null> {
  const featureStore = getFeatureStore();
  return await featureStore.getOnlineFeatures('credit_scoring_features', farmerId);
}

export default {
  initializeLakehouse,
  shutdownLakehouse,
  getLakehouseStatus,
  runAllETLPipelines,
  computeFarmerFeatures,
  getFarmerFeatures,
};
