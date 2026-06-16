/**
 * Custom Business Metrics for OpenTelemetry
 * 
 * Tracks key business operations and user journeys:
 * - Crop yield predictions
 * - Marketplace transactions
 * - Farmer registrations
 * - User conversion funnels
 * 
 * Metrics are exported to Prometheus for visualization in Grafana
 */

import { metrics } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { logger } from '../logger.js';

// Initialize Prometheus exporter
const prometheusExporter = new PrometheusExporter(
  {
    port: 9464, // Prometheus metrics endpoint
    endpoint: '/metrics',
  },
  () => {
    logger.info('[Business Metrics] Prometheus exporter started on port 9464');
  }
);

// Create meter provider
const meterProvider = new MeterProvider({
  readers: [prometheusExporter],
});

// Set global meter provider
metrics.setGlobalMeterProvider(meterProvider);

// Get meter for business metrics
const meter = metrics.getMeter('farmer-platform-business');

// ============================================================================
// CROP YIELD PREDICTION METRICS
// ============================================================================

export const yieldPredictionCounter = meter.createCounter('business.yield_predictions_total', {
  description: 'Total number of crop yield predictions made',
});

export const yieldPredictionDuration = meter.createHistogram('business.yield_prediction_duration_ms', {
  description: 'Duration of yield prediction requests in milliseconds',
  unit: 'ms',
});

export const yieldPredictionConfidence = meter.createHistogram('business.yield_prediction_confidence', {
  description: 'Confidence scores of yield predictions (0-1)',
  unit: '1',
});

export const yieldPredictionByCrop = meter.createCounter('business.yield_predictions_by_crop', {
  description: 'Yield predictions grouped by crop type',
});

/**
 * Track a yield prediction
 */
export function trackYieldPrediction(params: {
  cropType: string;
  region: string;
  confidence: number;
  durationMs: number;
  predictedYield: number;
}) {
  yieldPredictionCounter.add(1, {
    crop_type: params.cropType,
    region: params.region,
  });
  
  yieldPredictionDuration.record(params.durationMs, {
    crop_type: params.cropType,
  });
  
  yieldPredictionConfidence.record(params.confidence, {
    crop_type: params.cropType,
  });
  
  yieldPredictionByCrop.add(1, {
    crop_type: params.cropType,
  });
}

// ============================================================================
// MARKETPLACE TRANSACTION METRICS
// ============================================================================

export const transactionCounter = meter.createCounter('business.transactions_total', {
  description: 'Total number of marketplace transactions',
});

export const transactionValue = meter.createHistogram('business.transaction_value_usd', {
  description: 'Value of marketplace transactions in USD',
  unit: 'USD',
});

export const transactionDuration = meter.createHistogram('business.transaction_duration_ms', {
  description: 'Duration of transaction processing in milliseconds',
  unit: 'ms',
});

export const transactionsByStatus = meter.createCounter('business.transactions_by_status', {
  description: 'Transactions grouped by status (completed, failed, pending)',
});

export const averageOrderValue = meter.createHistogram('business.average_order_value_usd', {
  description: 'Average order value in USD',
  unit: 'USD',
});

/**
 * Track a marketplace transaction
 */
export function trackTransaction(params: {
  orderId: string;
  userId: string;
  valueUsd: number;
  status: 'completed' | 'failed' | 'pending';
  durationMs: number;
  itemCount: number;
}) {
  transactionCounter.add(1, {
    status: params.status,
  });
  
  transactionValue.record(params.valueUsd, {
    status: params.status,
  });
  
  transactionDuration.record(params.durationMs, {
    status: params.status,
  });
  
  transactionsByStatus.add(1, {
    status: params.status,
  });
  
  averageOrderValue.record(params.valueUsd, {
    item_count: params.itemCount.toString(),
  });
}

// ============================================================================
// FARMER REGISTRATION METRICS
// ============================================================================

export const farmerRegistrationCounter = meter.createCounter('business.farmer_registrations_total', {
  description: 'Total number of farmer registrations',
});

export const farmerRegistrationDuration = meter.createHistogram('business.farmer_registration_duration_ms', {
  description: 'Duration of farmer registration process in milliseconds',
  unit: 'ms',
});

export const farmersByRegion = meter.createCounter('business.farmers_by_region', {
  description: 'Farmers grouped by region',
});

export const farmerActivationRate = meter.createCounter('business.farmer_activation_total', {
  description: 'Farmers who completed profile setup',
});

/**
 * Track a farmer registration
 */
export function trackFarmerRegistration(params: {
  userId: string;
  region: string;
  durationMs: number;
  isComplete: boolean;
}) {
  farmerRegistrationCounter.add(1, {
    region: params.region,
    complete: params.isComplete.toString(),
  });
  
  farmerRegistrationDuration.record(params.durationMs, {
    region: params.region,
  });
  
  farmersByRegion.add(1, {
    region: params.region,
  });
  
  if (params.isComplete) {
    farmerActivationRate.add(1, {
      region: params.region,
    });
  }
}

// ============================================================================
// USER JOURNEY METRICS
// ============================================================================

export const userJourneyStepCounter = meter.createCounter('business.user_journey_steps_total', {
  description: 'User journey steps completed',
});

export const conversionFunnelCounter = meter.createCounter('business.conversion_funnel_total', {
  description: 'Users at each stage of conversion funnel',
});

export const userRetentionCounter = meter.createCounter('business.user_retention_total', {
  description: 'User retention by cohort',
});

export const featureUsageCounter = meter.createCounter('business.feature_usage_total', {
  description: 'Feature usage by users',
});

/**
 * Track user journey step
 */
export function trackUserJourneyStep(params: {
  userId: string;
  step: string;
  funnel: string;
  durationMs: number;
}) {
  userJourneyStepCounter.add(1, {
    step: params.step,
    funnel: params.funnel,
  });
}

/**
 * Track conversion funnel
 */
export function trackConversionFunnel(params: {
  userId: string;
  stage: 'visit' | 'signup' | 'profile' | 'first_action' | 'active_user';
  source: string;
}) {
  conversionFunnelCounter.add(1, {
    stage: params.stage,
    source: params.source,
  });
}

/**
 * Track feature usage
 */
export function trackFeatureUsage(params: {
  userId: string;
  feature: string;
  action: string;
}) {
  featureUsageCounter.add(1, {
    feature: params.feature,
    action: params.action,
  });
}

// ============================================================================
// PRICE FORECAST METRICS
// ============================================================================

export const priceForecastCounter = meter.createCounter('business.price_forecasts_total', {
  description: 'Total number of price forecasts generated',
});

export const priceForecastDuration = meter.createHistogram('business.price_forecast_duration_ms', {
  description: 'Duration of price forecast requests in milliseconds',
  unit: 'ms',
});

export const priceForecastAccuracy = meter.createHistogram('business.price_forecast_accuracy', {
  description: 'Accuracy of price forecasts (0-1)',
  unit: '1',
});

/**
 * Track a price forecast
 */
export function trackPriceForecast(params: {
  cropType: string;
  region: string;
  forecastDays: number;
  durationMs: number;
  trend: 'up' | 'down' | 'stable';
}) {
  priceForecastCounter.add(1, {
    crop_type: params.cropType,
    region: params.region,
    trend: params.trend,
  });
  
  priceForecastDuration.record(params.durationMs, {
    crop_type: params.cropType,
  });
}

// ============================================================================
// MARKETPLACE LISTING METRICS
// ============================================================================

export const listingCreatedCounter = meter.createCounter('business.listings_created_total', {
  description: 'Total number of marketplace listings created',
});

export const listingViewsCounter = meter.createCounter('business.listing_views_total', {
  description: 'Total number of listing views',
});

export const listingConversionRate = meter.createHistogram('business.listing_conversion_rate', {
  description: 'Conversion rate of listings (views to purchases)',
  unit: '1',
});

/**
 * Track listing creation
 */
export function trackListingCreated(params: {
  listingId: string;
  sellerId: string;
  category: string;
  priceUsd: number;
}) {
  listingCreatedCounter.add(1, {
    category: params.category,
  });
}

/**
 * Track listing view
 */
export function trackListingView(params: {
  listingId: string;
  userId?: string;
  source: string;
}) {
  listingViewsCounter.add(1, {
    source: params.source,
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current metrics for health checks
 */
export async function getBusinessMetrics() {
  // Metrics are automatically collected by Prometheus exporter
  return {
    endpoint: 'http://localhost:9464/metrics',
    status: 'active',
  };
}

/**
 * Shutdown metrics collection
 */
export async function shutdownBusinessMetrics() {
  try {
    await meterProvider.shutdown();
    logger.info('[Business Metrics] Meter provider shut down successfully');
  } catch (error) {
    logger.error('[Business Metrics] Error shutting down meter provider:', error);
  }
}
