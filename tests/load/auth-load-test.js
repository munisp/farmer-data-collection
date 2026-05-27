/**
 * k6 Load Test: Authentication Endpoints
 * 
 * Tests user registration, login, and session management under load
 * 
 * Usage:
 *   k6 run tests/load/auth-load-test.js
 *   k6 run --vus 50 --duration 5m tests/load/auth-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const loginSuccessRate = new Rate('login_success_rate');
const registerSuccessRate = new Rate('register_success_rate');
const loginDuration = new Trend('login_duration');
const registerDuration = new Trend('register_duration');
const authErrors = new Counter('auth_errors');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '3m', target: 50 },    // Stay at 50 users
    { duration: '1m', target: 100 },   // Spike to 100 users
    { duration: '30s', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
    'http_req_failed': ['rate<0.01'],                  // Error rate under 1%
    'login_success_rate': ['rate>0.95'],               // 95% login success
    'register_success_rate': ['rate>0.90'],            // 90% register success
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

/**
 * Generate random user data
 */
function generateUser() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return {
    email: `loadtest${timestamp}${random}@example.com`,
    password: 'LoadTest123!',
    firstName: `Load${random}`,
    lastName: `Test${timestamp}`,
  };
}

/**
 * Test user registration
 */
function testRegister(user) {
  const startTime = Date.now();
  
  const payload = JSON.stringify(user);
  const params = {
    headers: { 'Content-Type': 'application/json' },
  };
  
  const res = http.post(`${BASE_URL}/api/trpc/auth.register`, payload, params);
  
  const duration = Date.now() - startTime;
  registerDuration.add(duration);
  
  const success = check(res, {
    'register status is 200': (r) => r.status === 200,
    'register has session cookie': (r) => r.cookies.session !== undefined,
    'register response has user data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && body.result.data;
      } catch (e) {
        return false;
      }
    },
  });
  
  registerSuccessRate.add(success);
  
  if (!success) {
    authErrors.add(1);
    console.error(`Register failed: ${res.status} - ${res.body}`);
  }
  
  return res;
}

/**
 * Test user login
 */
function testLogin(email, password) {
  const startTime = Date.now();
  
  const payload = JSON.stringify({ email, password });
  const params = {
    headers: { 'Content-Type': 'application/json' },
  };
  
  const res = http.post(`${BASE_URL}/api/trpc/auth.login`, payload, params);
  
  const duration = Date.now() - startTime;
  loginDuration.add(duration);
  
  const success = check(res, {
    'login status is 200': (r) => r.status === 200,
    'login has session cookie': (r) => r.cookies.session !== undefined,
    'login response has user data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && body.result.data;
      } catch (e) {
        return false;
      }
    },
  });
  
  loginSuccessRate.add(success);
  
  if (!success) {
    authErrors.add(1);
    console.error(`Login failed: ${res.status} - ${res.body}`);
  }
  
  return res;
}

/**
 * Test authenticated endpoint
 */
function testAuthenticatedRequest(sessionCookie) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${sessionCookie}`,
    },
  };
  
  const res = http.get(`${BASE_URL}/api/trpc/auth.me`, params);
  
  const success = check(res, {
    'me status is 200': (r) => r.status === 200,
    'me returns user data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && body.result.data && body.result.data.email;
      } catch (e) {
        return false;
      }
    },
  });
  
  if (!success) {
    authErrors.add(1);
  }
  
  return res;
}

/**
 * Test logout
 */
function testLogout(sessionCookie) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${sessionCookie}`,
    },
  };
  
  const res = http.post(`${BASE_URL}/api/trpc/auth.logout`, '{}', params);
  
  check(res, {
    'logout status is 200': (r) => r.status === 200,
    'logout clears session': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && body.result.data && body.result.data.success;
      } catch (e) {
        return false;
      }
    },
  });
  
  return res;
}

/**
 * Main test scenario
 */
export default function () {
  // Scenario 1: New user registration (30% of users)
  if (Math.random() < 0.3) {
    const user = generateUser();
    const registerRes = testRegister(user);
    
    if (registerRes.status === 200) {
      const sessionCookie = registerRes.cookies.session[0].value;
      sleep(1);
      
      // Make authenticated request
      testAuthenticatedRequest(sessionCookie);
      sleep(1);
      
      // Logout
      testLogout(sessionCookie);
    }
    
    sleep(2);
  }
  
  // Scenario 2: Existing user login (70% of users)
  else {
    // Use a pre-created test account
    const testEmail = 'loadtest@example.com';
    const testPassword = 'LoadTest123!';
    
    const loginRes = testLogin(testEmail, testPassword);
    
    if (loginRes.status === 200) {
      const sessionCookie = loginRes.cookies.session[0].value;
      sleep(1);
      
      // Make multiple authenticated requests
      for (let i = 0; i < 3; i++) {
        testAuthenticatedRequest(sessionCookie);
        sleep(0.5);
      }
      
      // Logout
      testLogout(sessionCookie);
    }
    
    sleep(2);
  }
}

/**
 * Setup function - runs once before test
 */
export function setup() {
  console.log('Starting authentication load test...');
  console.log(`Target: ${BASE_URL}`);
  
  // Create a test account for login scenarios
  const testUser = {
    email: 'loadtest@example.com',
    password: 'LoadTest123!',
    firstName: 'Load',
    lastName: 'Test',
  };
  
  const payload = JSON.stringify(testUser);
  const params = {
    headers: { 'Content-Type': 'application/json' },
  };
  
  http.post(`${BASE_URL}/api/trpc/auth.register`, payload, params);
  
  return { testUser };
}

/**
 * Teardown function - runs once after test
 */
export function teardown(data) {
  console.log('Authentication load test completed');
  console.log(`Test account: ${data.testUser.email}`);
}
