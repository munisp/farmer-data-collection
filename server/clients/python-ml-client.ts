/**
 * Python ML Service Client
 * 
 * TypeScript client for communicating with the Python FastAPI ML service.
 * Provides methods for crop yield prediction and price forecasting.
 * 
 * Service runs on port 3000 (configured via PYTHON_ML_SERVICE_URL)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../logger.js';

// ============================================================================
// Types
// ============================================================================

export interface CropYieldPredictionRequest {
  crop: string;
  farmSize: number;
  soilType: string;
  rainfall: number;
  temperature: number;
  fertilizer: string;
  season: string;
}

export interface CropYieldPredictionResponse {
  success: boolean;
  predictedYield: number;
  unit: string;
  confidence: number;
  factors: Record<string, string>;
  recommendation?: string;
}

export interface PriceForecastRequest {
  crop: string;
  location: string;
  forecastDays?: number;
  historicalPrices: Array<{ date: string; price: number }>;
}

export interface PriceForecastResponse {
  success: boolean;
  forecast: Array<{ date: string; price: number; confidence?: number }>;
  trend: string;
  recommendation: string;
}

export interface MLServiceHealth {
  status: string;
  service: string;
  version: string;
  models: {
    crop_yield: string;
    price_forecast: string;
  };
}

export interface ModelStatus {
  model: string;
  status: string;
  lastTrained?: string;
  accuracy?: number;
  sampleCount?: number;
}

// ============================================================================
// Python ML Service Client Class
// ============================================================================

export class PythonMLClient {
  private client: AxiosInstance;
  private baseURL: string;
  private timeout: number;

  constructor(baseURL?: string, timeout: number = 30000) {
    this.baseURL = baseURL || process.env.PYTHON_ML_SERVICE_URL || 'http://localhost:3000';
    this.timeout = timeout;

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      error => this.handleError(error)
    );
  }

  /**
   * Handle axios errors and provide meaningful error messages
   */
  private handleError(error: AxiosError): never {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const data = error.response.data as any;
      throw new Error(
        `ML Service Error (${status}): ${data?.detail || data?.message || error.message}`
      );
    } else if (error.request) {
      // Request made but no response received
      throw new Error(
        `ML Service Unavailable: Could not connect to ${this.baseURL}. ` +
        `Please ensure the Python ML service is running.`
      );
    } else {
      // Error in request setup
      throw new Error(`ML Service Request Error: ${error.message}`);
    }
  }

  /**
   * Health check - verify ML service is running and models are loaded
   */
  async healthCheck(): Promise<MLServiceHealth> {
    try {
      const response = await this.client.get<MLServiceHealth>('/health');
      return response.data;
    } catch (error) {
      throw new Error(`Health check failed: ${error}`);
    }
  }

  /**
   * Predict crop yield based on farm conditions
   * 
   * @param request - Crop yield prediction parameters
   * @returns Predicted yield with confidence score and recommendations
   * 
   * @example
   * ```typescript
   * const prediction = await mlClient.predictYield({
   *   crop: 'Maize',
   *   farmSize: 5.0,
   *   soilType: 'Loamy',
   *   rainfall: 800,
   *   temperature: 28,
   *   fertilizer: 'NPK',
   *   season: 'Wet'
   * });
   * logger.info(`Predicted yield: ${prediction.predictedYield} ${prediction.unit}`);
   * logger.info(`Confidence: ${prediction.confidence}%`);
   * ```
   */
  async predictYield(
    request: CropYieldPredictionRequest
  ): Promise<CropYieldPredictionResponse> {
    try {
      const response = await this.client.post<CropYieldPredictionResponse>(
        '/api/ml/predict-yield',
        request
      );
      return response.data;
    } catch (error) {
      throw new Error(`Yield prediction failed: ${error}`);
    }
  }

  /**
   * Forecast crop prices for the next N days
   * 
   * @param request - Price forecast parameters with historical data
   * @returns Price forecast with trend analysis and trading recommendations
   * 
   * @example
   * ```typescript
   * const forecast = await mlClient.forecastPrice({
   *   crop: 'Maize',
   *   location: 'Lagos',
   *   forecastDays: 30,
   *   historicalPrices: [
   *     { date: '2024-01-01', price: 250 },
   *     { date: '2024-01-02', price: 255 },
   *     // ... more historical data
   *   ]
   * });
   * logger.info(`Trend: ${forecast.trend}`);
   * logger.info(`Recommendation: ${forecast.recommendation}`);
   * ```
   */
  async forecastPrice(
    request: PriceForecastRequest
  ): Promise<PriceForecastResponse> {
    try {
      const response = await this.client.post<PriceForecastResponse>(
        '/api/ml/forecast-price',
        request
      );
      return response.data;
    } catch (error) {
      throw new Error(`Price forecast failed: ${error}`);
    }
  }

  /**
   * Get status of all ML models
   */
  async getModelStatus(): Promise<ModelStatus[]> {
    try {
      const response = await this.client.get<{ models: ModelStatus[] }>(
        '/api/ml/models/status'
      );
      return response.data.models;
    } catch (error) {
      throw new Error(`Failed to get model status: ${error}`);
    }
  }

  /**
   * Retrain ML models with new data
   * 
   * Note: This is an admin operation and should be protected
   */
  async retrainModels(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.client.post<{ success: boolean; message: string }>(
        '/api/ml/models/retrain'
      );
      return response.data;
    } catch (error) {
      throw new Error(`Model retraining failed: ${error}`);
    }
  }

  /**
   * Check if ML service is available and healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return (
        health.status === 'healthy' &&
        health.models.crop_yield === 'loaded' &&
        health.models.price_forecast === 'loaded'
      );
    } catch (err) {
      return false;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton instance of Python ML client
 * 
 * Usage:
 * ```typescript
 * import { pythonMLClient } from './clients/python-ml-client';
 * 
 * const prediction = await pythonMLClient.predictYield({...});
 * ```
 */
export const pythonMLClient = new PythonMLClient();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format yield prediction for display
 */
export function formatYieldPrediction(prediction: CropYieldPredictionResponse): string {
  return `${prediction.predictedYield.toFixed(2)} ${prediction.unit} (${prediction.confidence.toFixed(1)}% confidence)`;
}

/**
 * Format price forecast for display
 */
export function formatPriceForecast(forecast: PriceForecastResponse): string {
  const avgPrice = forecast.forecast.reduce((sum, f) => sum + f.price, 0) / forecast.forecast.length;
  return `Average: ₦${avgPrice.toFixed(2)} | Trend: ${forecast.trend}`;
}

/**
 * Get yield prediction confidence level
 */
export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 80) return 'high';
  if (confidence >= 60) return 'medium';
  return 'low';
}

/**
 * Validate crop yield prediction request
 */
export function validateYieldRequest(request: CropYieldPredictionRequest): string[] {
  const errors: string[] = [];

  if (!request.crop || request.crop.trim().length === 0) {
    errors.push('Crop type is required');
  }

  if (request.farmSize <= 0) {
    errors.push('Farm size must be greater than 0');
  }

  if (!request.soilType || request.soilType.trim().length === 0) {
    errors.push('Soil type is required');
  }

  if (request.rainfall < 0) {
    errors.push('Rainfall cannot be negative');
  }

  if (!request.fertilizer || request.fertilizer.trim().length === 0) {
    errors.push('Fertilizer type is required');
  }

  if (!request.season || request.season.trim().length === 0) {
    errors.push('Season is required');
  }

  return errors;
}

/**
 * Validate price forecast request
 */
export function validatePriceForecastRequest(request: PriceForecastRequest): string[] {
  const errors: string[] = [];

  if (!request.crop || request.crop.trim().length === 0) {
    errors.push('Crop type is required');
  }

  if (!request.location || request.location.trim().length === 0) {
    errors.push('Location is required');
  }

  if (request.forecastDays && (request.forecastDays < 1 || request.forecastDays > 90)) {
    errors.push('Forecast days must be between 1 and 90');
  }

  if (!request.historicalPrices || request.historicalPrices.length < 7) {
    errors.push('At least 7 days of historical price data is required');
  }

  return errors;
}
