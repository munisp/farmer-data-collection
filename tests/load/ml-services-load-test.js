/**
 * k6 Load Test: ML Prediction Services
 * 
 * Tests crop yield prediction and price forecasting under load
 * 
 * Usage:
 *   k6 run tests/load/ml-services-load-test.js
 *   k6 run --vus 30 --duration 5m tests/load/ml-services-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const yieldPredictionSuccessRate = new Rate('yield_prediction_success_rate');
const priceForecastSuccessRate = new Rate('price_forecast_success_rate');
const yieldPredictionDuration = new Trend('yield_prediction_duration');
const priceForecastDuration = new Trend('price_forecast_duration');
const mlErrors = new Counter('ml_errors');
const predictionConfidence = new Trend('prediction_confidence');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 5 },    // Ramp up to 5 users
    { duration: '1m', target: 15 },    // Ramp up to 15 users
    { duration: '3m', target: 30 },    // Ramp up to 30 users
    { duration: '3m', target: 30 },    // Stay at 30 users
    { duration: '1m', target: 50 },    // Spike to 50 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<3000', 'p(99)<5000'], // ML is slower
    'http_req_failed': ['rate<0.05'],
    'yield_prediction_success_rate': ['rate>0.90'],
    'price_forecast_success_rate': ['rate>0.90'],
    'prediction_confidence': ['avg>0.7'],              // Average confidence > 70%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Sample crop types
const CROP_TYPES = [
  'corn',
  'wheat',
  'rice',
  'tomatoes',
  'potatoes',
  'soybeans',
  'cotton',
];

// Sample regions
const REGIONS = [
  'Lagos',
  'Kano',
  'Kaduna',
  'Oyo',
  'Rivers',
  'Abuja',
];

/**
 * Generate random crop data for prediction
 */
function generateCropData() {
  return {
    cropType: CROP_TYPES[Math.floor(Math.random() * CROP_TYPES.length)],
    region: REGIONS[Math.floor(Math.random() * REGIONS.length)],
    soilType: ['clay', 'loam', 'sandy', 'silt'][Math.floor(Math.random() * 4)],
    rainfall: Math.floor(Math.random() * 500) + 200,      // 200-700mm
    temperature: Math.floor(Math.random() * 15) + 20,     // 20-35°C
    humidity: Math.floor(Math.random() * 40) + 40,        // 40-80%
    fertilizer: Math.floor(Math.random() * 100) + 50,     // 50-150 kg/ha
    pesticide: Math.floor(Math.random() * 10) + 5,        // 5-15 kg/ha
    farmSize: Math.floor(Math.random() * 50) + 10,        // 10-60 hectares
    previousYield: Math.floor(Math.random() * 3000) + 1000, // 1000-4000 kg/ha
  };
}

/**
 * Test crop yield prediction
 */
function testYieldPrediction(sessionCookie) {
  const startTime = Date.now();
  
  const cropData = generateCropData();
  const payload = JSON.stringify(cropData);
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${sessionCookie}`,
    },
  };
  
  const res = http.post(
    `${BASE_URL}/api/trpc/ml.predictYield`,
    payload,
    params
  );
  
  const duration = Date.now() - startTime;
  yieldPredictionDuration.add(duration);
  
  const success = check(res, {
    'yield prediction status is 200': (r) => r.status === 200,
    'yield prediction returns data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && body.result.data && body.result.data.predictedYield;
      } catch (e) {
        return false;
      }
    },
    'yield prediction has confidence': (r) => {
      try {
        const body = JSON.parse(r.body);
        const confidence = body.result.data.confidence;
        if (confidence !== undefined) {
          predictionConfidence.add(confidence);
          return confidence >= 0 && confidence <= 1;
        }
        return false;
      } catch (e) {
        return false;
      }
    },
  });
  
  yieldPredictionSuccessRate.add(success);
  
  if (!success) {
    mlErrors.add(1);
    console.error(`Yield prediction failed: ${res.status} - ${res.body.substring(0, 200)}`);
  }
  
  return res;
}

/**
 * Test price forecasting
 */
function testPriceForecast(sessionCookie) {
  const startTime = Date.now();
  
  const cropType = CROP_TYPES[Math.floor(Math.random() * CROP_TYPES.length)];
  const region = REGIONS[Math.floor(Math.random() * REGIONS.length)];
  const days = Math.floor(Math.random() * 60) + 30; // 30-90 days
  
  const payload = JSON.stringify({
    cropType,
    region,
    forecastDays: days,
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${sessionCookie}`,
    },
  };
  
  const res = http.post(
    `${BASE_URL}/api/trpc/ml.forecastPrice`,
    payload,
    params
  );
  
  const duration = Date.now() - startTime;
  priceForecastDuration.add(duration);
  
  const success = check(res, {
    'price forecast status is 200': (r) => r.status === 200,
    'price forecast returns data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && body.result.data && Array.isArray(body.result.data.forecast);
      } catch (e) {
        return false;
      }
    },
    'price forecast has trend': (r) => {
      try {
        const body = JSON.parse(r.body);
        const trend = body.result.data.trend;
        return trend === 'up' || trend === 'down' || trend === 'stable';
      } catch (e) {
        return false;
      }
    },
  });
  
  priceForecastSuccessRate.add(success);
  
  if (!success) {
    mlErrors.add(1);
    console.error(`Price forecast failed: ${res.status} - ${res.body.substring(0, 200)}`);
  }
  
  return res;
}

/**
 * Test batch predictions
 */
function testBatchPredictions(sessionCookie) {
  const crops = [];
  for (let i = 0; i < 5; i++) {
    crops.push(generateCropData());
  }
  
  const payload = JSON.stringify({ crops });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${sessionCookie}`,
    },
  };
  
  const res = http.post(
    `${BASE_URL}/api/trpc/ml.batchPredictYield`,
    payload,
    params
  );
  
  check(res, {
    'batch prediction status is 200': (r) => r.status === 200,
    'batch prediction returns array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && Array.isArray(body.result.data) && body.result.data.length === 5;
      } catch (e) {
        return false;
      }
    },
  });
  
  return res;
}

/**
 * Login helper
 */
function login() {
  const payload = JSON.stringify({
    email: 'loadtest@example.com',
    password: 'LoadTest123!',
  });
  
  const params = {
    headers: { 'Content-Type': 'application/json' },
  };
  
  const res = http.post(`${BASE_URL}/api/trpc/auth.login`, payload, params);
  
  if (res.status === 200 && res.cookies.session) {
    return res.cookies.session[0].value;
  }
  
  return null;
}

/**
 * Main test scenario
 */
export default function () {
  const sessionCookie = login();
  
  if (!sessionCookie) {
    console.error('Failed to login');
    return;
  }
  
  // Scenario 1: Single yield prediction (40% of users)
  if (Math.random() < 0.4) {
    testYieldPrediction(sessionCookie);
    sleep(2);
    
    // Make another prediction
    testYieldPrediction(sessionCookie);
    sleep(3);
  }
  
  // Scenario 2: Price forecasting (30% of users)
  else if (Math.random() < 0.7) {
    testPriceForecast(sessionCookie);
    sleep(2);
    
    // Forecast for different crop
    testPriceForecast(sessionCookie);
    sleep(3);
  }
  
  // Scenario 3: Mixed predictions (20% of users)
  else if (Math.random() < 0.9) {
    testYieldPrediction(sessionCookie);
    sleep(1);
    
    testPriceForecast(sessionCookie);
    sleep(2);
    
    testYieldPrediction(sessionCookie);
    sleep(3);
  }
  
  // Scenario 4: Batch predictions (10% of users)
  else {
    testBatchPredictions(sessionCookie);
    sleep(5);
  }
  
  sleep(1);
}

/**
 * Setup function
 */
export function setup() {
  console.log('Starting ML services load test...');
  console.log(`Target: ${BASE_URL}`);
  console.log('Note: ML predictions are computationally expensive');
}

/**
 * Teardown function
 */
export function teardown() {
  console.log('ML services load test completed');
}
