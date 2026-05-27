/**
 * Lakehouse Configuration Service
 * 
 * Manages connections to object storage (S3/MinIO) and table formats (Delta/Iceberg)
 * Provides unified interface for lakehouse operations
 */

export interface LakehouseConfig {
  // Object Storage Configuration
  storage: {
    type: 's3' | 'minio' | 'gcs' | 'azure';
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    useSSL: boolean;
  };
  
  // Table Format Configuration
  tableFormat: {
    type: 'delta' | 'iceberg' | 'hudi';
    catalogType: 'hive' | 'glue' | 'rest' | 'jdbc';
    catalogUri?: string;
    warehouse: string;
  };
  
  // Query Engine Configuration
  queryEngine: {
    type: 'spark' | 'trino' | 'presto' | 'duckdb';
    connectionString: string;
    maxConnections: number;
  };
  
  // Data Organization
  paths: {
    bronze: string;
    silver: string;
    gold: string;
    features: string;
    checkpoints: string;
  };
}

// Default configuration from environment variables
export function getLakehouseConfig(): LakehouseConfig {
  return {
    storage: {
      type: (process.env.LAKEHOUSE_STORAGE_TYPE as any) || 'minio',
      endpoint: process.env.LAKEHOUSE_STORAGE_ENDPOINT || 'http://localhost:9000',
      bucket: process.env.LAKEHOUSE_BUCKET || 'farmer-lakehouse',
      region: process.env.LAKEHOUSE_REGION || 'us-east-1',
      accessKeyId: process.env.LAKEHOUSE_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.LAKEHOUSE_SECRET_KEY || 'minioadmin',
      useSSL: process.env.LAKEHOUSE_USE_SSL === 'true',
    },
    tableFormat: {
      type: (process.env.LAKEHOUSE_TABLE_FORMAT as any) || 'delta',
      catalogType: (process.env.LAKEHOUSE_CATALOG_TYPE as any) || 'hive',
      catalogUri: process.env.LAKEHOUSE_CATALOG_URI,
      warehouse: process.env.LAKEHOUSE_WAREHOUSE || 's3://farmer-lakehouse/warehouse',
    },
    queryEngine: {
      type: (process.env.LAKEHOUSE_QUERY_ENGINE as any) || 'trino',
      connectionString: process.env.LAKEHOUSE_QUERY_CONNECTION || 'http://localhost:8080',
      maxConnections: parseInt(process.env.LAKEHOUSE_MAX_CONNECTIONS || '10'),
    },
    paths: {
      bronze: 'bronze',
      silver: 'silver',
      gold: 'gold',
      features: 'features',
      checkpoints: 'checkpoints',
    },
  };
}

// Table definitions for the lakehouse
export const LAKEHOUSE_TABLES = {
  // Bronze Layer - Raw event data
  bronze: {
    farmer_events: 'bronze.farmer_events',
    farm_events: 'bronze.farm_events',
    crop_events: 'bronze.crop_events',
    harvest_events: 'bronze.harvest_events',
    expense_events: 'bronze.expense_events',
    livestock_events: 'bronze.livestock_events',
    loan_events: 'bronze.loan_events',
    repayment_events: 'bronze.repayment_events',
    marketplace_events: 'bronze.marketplace_events',
    kyc_events: 'bronze.kyc_events',
    auth_events: 'bronze.auth_events',
    analytics_events: 'bronze.analytics_events',
  },
  
  // Silver Layer - Cleaned and normalized data
  silver: {
    // Fact tables
    fact_farmer: 'silver.fact_farmer',
    fact_farm: 'silver.fact_farm',
    fact_crop: 'silver.fact_crop',
    fact_harvest: 'silver.fact_harvest',
    fact_expense: 'silver.fact_expense',
    fact_loan: 'silver.fact_loan',
    fact_repayment: 'silver.fact_repayment',
    fact_marketplace_order: 'silver.fact_marketplace_order',
    fact_kyc_verification: 'silver.fact_kyc_verification',
    
    // Dimension tables
    dim_farmer: 'silver.dim_farmer',
    dim_farm: 'silver.dim_farm',
    dim_cooperative: 'silver.dim_cooperative',
    dim_product: 'silver.dim_product',
    dim_location: 'silver.dim_location',
    dim_time: 'silver.dim_time',
  },
  
  // Gold Layer - Aggregated analytics
  gold: {
    fact_farmer_performance: 'gold.fact_farmer_performance',
    fact_portfolio_risk: 'gold.fact_portfolio_risk',
    fact_channel_engagement: 'gold.fact_channel_engagement',
    fact_crop_yield_analysis: 'gold.fact_crop_yield_analysis',
    fact_loan_portfolio: 'gold.fact_loan_portfolio',
    fact_marketplace_analytics: 'gold.fact_marketplace_analytics',
    fact_cooperative_performance: 'gold.fact_cooperative_performance',
  },
  
  // Feature Store tables
  features: {
    credit_scoring_features: 'features.credit_scoring_features',
    yield_prediction_features: 'features.yield_prediction_features',
    default_prediction_features: 'features.default_prediction_features',
    farmer_segmentation_features: 'features.farmer_segmentation_features',
    price_prediction_features: 'features.price_prediction_features',
  },
} as const;

// Partition strategies for each table
export const PARTITION_STRATEGIES = {
  bronze: {
    default: ['ingest_date', 'event_type'],
  },
  silver: {
    fact_harvest: ['harvest_year', 'harvest_month'],
    fact_expense: ['expense_year', 'expense_month'],
    fact_loan: ['loan_year', 'loan_month'],
    fact_repayment: ['repayment_year', 'repayment_month'],
    default: ['partition_date'],
  },
  gold: {
    default: ['report_date'],
  },
  features: {
    default: ['feature_date'],
  },
};

// Data retention policies (in days)
export const RETENTION_POLICIES = {
  bronze: 90,      // 3 months raw data
  silver: 730,     // 2 years cleaned data
  gold: 1825,      // 5 years aggregated data
  features: 365,   // 1 year feature data
};

export default {
  getLakehouseConfig,
  LAKEHOUSE_TABLES,
  PARTITION_STRATEGIES,
  RETENTION_POLICIES,
};
