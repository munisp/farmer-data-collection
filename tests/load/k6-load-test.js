/**
 * K6 Load Testing Script for Farmer Data Collection Platform
 * 
 * This script simulates realistic user behavior with multiple scenarios:
 * - User authentication
 * - Data entry (farmers, farms, crops)
 * - Data retrieval and search
 * - Marketplace browsing
 * - Loan applications
 * 
 * Usage:
 *   k6 run --vus 100 --duration 5m k6-load-test.js
 *   k6 run --vus 1000 --duration 10m k6-load-test.js  # Stress test
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');
const authLatency = new Trend('auth_latency');
const dbLatency = new Trend('db_latency');
const successfulLogins = new Counter('successful_logins');
const failedLogins = new Counter('failed_logins');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 100 },   // Stay at 100 users
    { duration: '2m', target: 500 },   // Ramp up to 500 users
    { duration: '5m', target: 500 },   // Stay at 500 users
    { duration: '2m', target: 1000 },  // Ramp up to 1000 users
    { duration: '5m', target: 1000 },  // Stay at 1000 users
    { duration: '2m', target: 0 },     // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95% of requests < 500ms, 99% < 1s
    http_req_failed: ['rate<0.01'],                   // Error rate < 1%
    errors: ['rate<0.05'],                            // Custom error rate < 5%
    api_latency: ['p(95)<500'],                       // API latency p95 < 500ms
    auth_latency: ['p(95)<1000'],                     // Auth latency p95 < 1s
  },
};

// Base URL (can be overridden with -e BASE_URL=...)
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Test data
const testUsers = [
  { email: 'test1@farmer.com', password: 'TestPass123!' },
  { email: 'test2@farmer.com', password: 'TestPass123!' },
  { email: 'test3@farmer.com', password: 'TestPass123!' },
];

// Helper function to make tRPC requests
function trpcRequest(endpoint, input, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const payload = JSON.stringify({
    json: input,
  });
  
  return http.post(`${BASE_URL}/api/trpc/${endpoint}`, payload, { headers });
}

// Scenario 1: User Authentication
export function authScenario() {
  group('Authentication', () => {
    const user = testUsers[Math.floor(Math.random() * testUsers.length)];
    
    const startTime = Date.now();
    const loginRes = trpcRequest('auth.login', {
      email: user.email,
      password: user.password,
    });
    const duration = Date.now() - startTime;
    
    authLatency.add(duration);
    
    const success = check(loginRes, {
      'login status is 200': (r) => r.status === 200,
      'login returns token': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.result?.data?.json?.token !== undefined;
        } catch {
          return false;
        }
      },
    });
    
    if (success) {
      successfulLogins.add(1);
    } else {
      failedLogins.add(1);
      errorRate.add(1);
    }
  });
  
  sleep(1);
}

// Scenario 2: Data Entry
export function dataEntryScenario() {
  group('Data Entry', () => {
    // First, authenticate
    const user = testUsers[0];
    const loginRes = trpcRequest('auth.login', {
      email: user.email,
      password: user.password,
    });
    
    let token;
    try {
      const body = JSON.parse(loginRes.body);
      token = body.result?.data?.json?.token;
    } catch {
      errorRate.add(1);
      return;
    }
    
    if (!token) {
      errorRate.add(1);
      return;
    }
    
    // Create farmer
    const startTime1 = Date.now();
    const farmerRes = trpcRequest('farmers.create', {
      name: `Test Farmer ${Date.now()}`,
      phone: `+1${Math.floor(Math.random() * 10000000000)}`,
      location: 'Test Location',
    }, token);
    apiLatency.add(Date.now() - startTime1);
    
    check(farmerRes, {
      'create farmer status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    // Create farm
    const startTime2 = Date.now();
    const farmRes = trpcRequest('farms.create', {
      name: `Test Farm ${Date.now()}`,
      location: 'Test Location',
      size: 10.5,
      unit: 'acres',
    }, token);
    apiLatency.add(Date.now() - startTime2);
    
    check(farmRes, {
      'create farm status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  });
  
  sleep(2);
}

// Scenario 3: Data Retrieval
export function dataRetrievalScenario() {
  group('Data Retrieval', () => {
    // Authenticate
    const user = testUsers[1];
    const loginRes = trpcRequest('auth.login', {
      email: user.email,
      password: user.password,
    });
    
    let token;
    try {
      const body = JSON.parse(loginRes.body);
      token = body.result?.data?.json?.token;
    } catch {
      errorRate.add(1);
      return;
    }
    
    if (!token) {
      errorRate.add(1);
      return;
    }
    
    // List farmers
    const startTime1 = Date.now();
    const farmersRes = trpcRequest('farmers.list', {}, token);
    dbLatency.add(Date.now() - startTime1);
    
    check(farmersRes, {
      'list farmers status is 200': (r) => r.status === 200,
      'list farmers returns array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.result?.data?.json);
        } catch {
          return false;
        }
      },
    }) || errorRate.add(1);
    
    // List farms
    const startTime2 = Date.now();
    const farmsRes = trpcRequest('farms.list', {}, token);
    dbLatency.add(Date.now() - startTime2);
    
    check(farmsRes, {
      'list farms status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    // List crops
    const startTime3 = Date.now();
    const cropsRes = trpcRequest('crops.list', {}, token);
    dbLatency.add(Date.now() - startTime3);
    
    check(cropsRes, {
      'list crops status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  });
  
  sleep(1);
}

// Scenario 4: Marketplace Browsing
export function marketplaceScenario() {
  group('Marketplace', () => {
    // Authenticate
    const user = testUsers[2];
    const loginRes = trpcRequest('auth.login', {
      email: user.email,
      password: user.password,
    });
    
    let token;
    try {
      const body = JSON.parse(loginRes.body);
      token = body.result?.data?.json?.token;
    } catch {
      errorRate.add(1);
      return;
    }
    
    if (!token) {
      errorRate.add(1);
      return;
    }
    
    // Browse products
    const startTime1 = Date.now();
    const productsRes = trpcRequest('marketplace.listProducts', {}, token);
    apiLatency.add(Date.now() - startTime1);
    
    check(productsRes, {
      'list products status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
    
    // Search products
    const startTime2 = Date.now();
    const searchRes = trpcRequest('marketplace.searchProducts', {
      keyword: 'tomato',
    }, token);
    apiLatency.add(Date.now() - startTime2);
    
    check(searchRes, {
      'search products status is 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  });
  
  sleep(2);
}

// Scenario 5: Health Check
export function healthCheckScenario() {
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/health`);
    
    check(res, {
      'health check status is 200': (r) => r.status === 200,
      'health check returns ok': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.status === 'ok';
        } catch {
          return false;
        }
      },
    }) || errorRate.add(1);
  });
  
  sleep(5);
}

// Main scenario - randomly execute different scenarios
export default function () {
  const scenarios = [
    authScenario,
    dataEntryScenario,
    dataRetrievalScenario,
    marketplaceScenario,
    healthCheckScenario,
  ];
  
  // Weighted random selection (health check less frequent)
  const weights = [0.3, 0.2, 0.3, 0.15, 0.05];
  const random = Math.random();
  let cumulative = 0;
  
  for (let i = 0; i < scenarios.length; i++) {
    cumulative += weights[i];
    if (random < cumulative) {
      scenarios[i]();
      break;
    }
  }
}

// Teardown function
export function teardown(data) {
  console.log('Load test completed');
}
