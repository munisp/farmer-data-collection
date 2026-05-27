/**
 * k6 Load Test: Marketplace API
 * 
 * Tests product browsing, search, cart operations, and checkout under load
 * 
 * Usage:
 *   k6 run tests/load/marketplace-load-test.js
 *   k6 run --vus 100 --duration 10m tests/load/marketplace-load-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const browseSuccessRate = new Rate('browse_success_rate');
const searchSuccessRate = new Rate('search_success_rate');
const cartSuccessRate = new Rate('cart_success_rate');
const checkoutSuccessRate = new Rate('checkout_success_rate');
const browseDuration = new Trend('browse_duration');
const searchDuration = new Trend('search_duration');
const cartDuration = new Trend('cart_duration');
const checkoutDuration = new Trend('checkout_duration');
const marketplaceErrors = new Counter('marketplace_errors');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 20 },    // Ramp up to 20 users
    { duration: '2m', target: 50 },    // Ramp up to 50 users
    { duration: '5m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 100 },   // Stay at 100 users
    { duration: '2m', target: 200 },   // Spike to 200 users
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1000', 'p(99)<2000'],
    'http_req_failed': ['rate<0.02'],
    'browse_success_rate': ['rate>0.98'],
    'search_success_rate': ['rate>0.95'],
    'cart_success_rate': ['rate>0.90'],
    'checkout_success_rate': ['rate>0.85'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Sample search queries
const SEARCH_QUERIES = [
  'tomatoes',
  'rice',
  'corn',
  'wheat',
  'vegetables',
  'fruits',
  'organic',
  'fresh',
];

// Sample categories
const CATEGORIES = [
  'vegetables',
  'fruits',
  'grains',
  'livestock',
  'seeds',
  'equipment',
];

/**
 * Test browsing marketplace listings
 */
function testBrowse(sessionCookie) {
  const startTime = Date.now();
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${sessionCookie}`,
    },
  };
  
  const res = http.get(
    `${BASE_URL}/api/trpc/marketplace.browse?limit=20&offset=0`,
    params
  );
  
  const duration = Date.now() - startTime;
  browseDuration.add(duration);
  
  const success = check(res, {
    'browse status is 200': (r) => r.status === 200,
    'browse returns listings': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && Array.isArray(body.result.data);
      } catch (e) {
        return false;
      }
    },
  });
  
  browseSuccessRate.add(success);
  
  if (!success) {
    marketplaceErrors.add(1);
  }
  
  return res;
}

/**
 * Test searching marketplace
 */
function testSearch(sessionCookie, query) {
  const startTime = Date.now();
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${sessionCookie}`,
    },
  };
  
  const res = http.get(
    `${BASE_URL}/api/trpc/marketplace.search?query=${encodeURIComponent(query)}`,
    params
  );
  
  const duration = Date.now() - startTime;
  searchDuration.add(duration);
  
  const success = check(res, {
    'search status is 200': (r) => r.status === 200,
    'search returns results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && Array.isArray(body.result.data);
      } catch (e) {
        return false;
      }
    },
  });
  
  searchSuccessRate.add(success);
  
  if (!success) {
    marketplaceErrors.add(1);
  }
  
  return res;
}

/**
 * Test adding item to cart
 */
function testAddToCart(sessionCookie, productId, quantity) {
  const startTime = Date.now();
  
  const payload = JSON.stringify({
    productId,
    quantity,
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${sessionCookie}`,
    },
  };
  
  const res = http.post(
    `${BASE_URL}/api/trpc/marketplace.addToCart`,
    payload,
    params
  );
  
  const duration = Date.now() - startTime;
  cartDuration.add(duration);
  
  const success = check(res, {
    'addToCart status is 200': (r) => r.status === 200,
    'addToCart returns cart': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && body.result.data;
      } catch (e) {
        return false;
      }
    },
  });
  
  cartSuccessRate.add(success);
  
  if (!success) {
    marketplaceErrors.add(1);
  }
  
  return res;
}

/**
 * Test viewing cart
 */
function testViewCart(sessionCookie) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${sessionCookie}`,
    },
  };
  
  const res = http.get(
    `${BASE_URL}/api/trpc/marketplace.getCart`,
    params
  );
  
  check(res, {
    'getCart status is 200': (r) => r.status === 200,
    'getCart returns items': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && Array.isArray(body.result.data);
      } catch (e) {
        return false;
      }
    },
  });
  
  return res;
}

/**
 * Test checkout process
 */
function testCheckout(sessionCookie) {
  const startTime = Date.now();
  
  const payload = JSON.stringify({
    paymentMethod: 'stripe',
    shippingAddress: {
      street: '123 Test St',
      city: 'Lagos',
      state: 'Lagos',
      country: 'Nigeria',
      postalCode: '100001',
    },
  });
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `session=${sessionCookie}`,
    },
  };
  
  const res = http.post(
    `${BASE_URL}/api/trpc/marketplace.checkout`,
    payload,
    params
  );
  
  const duration = Date.now() - startTime;
  checkoutDuration.add(duration);
  
  const success = check(res, {
    'checkout status is 200': (r) => r.status === 200,
    'checkout returns order': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.result && body.result.data && body.result.data.orderId;
      } catch (e) {
        return false;
      }
    },
  });
  
  checkoutSuccessRate.add(success);
  
  if (!success) {
    marketplaceErrors.add(1);
  }
  
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
  
  // Scenario 1: Browse and search (50% of users)
  if (Math.random() < 0.5) {
    // Browse listings
    testBrowse(sessionCookie);
    sleep(1);
    
    // Search for products
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
    testSearch(sessionCookie, query);
    sleep(2);
    
    // Browse again with different filters
    testBrowse(sessionCookie);
    sleep(1);
  }
  
  // Scenario 2: Add to cart (30% of users)
  else if (Math.random() < 0.8) {
    // Browse to find products
    const browseRes = testBrowse(sessionCookie);
    sleep(1);
    
    // Add random product to cart
    try {
      const body = JSON.parse(browseRes.body);
      const listings = body.result.data;
      
      if (listings && listings.length > 0) {
        const randomProduct = listings[Math.floor(Math.random() * listings.length)];
        const quantity = Math.floor(Math.random() * 5) + 1;
        
        testAddToCart(sessionCookie, randomProduct.id, quantity);
        sleep(1);
        
        // View cart
        testViewCart(sessionCookie);
        sleep(1);
      }
    } catch (e) {
      console.error('Failed to add to cart:', e);
    }
  }
  
  // Scenario 3: Complete checkout (20% of users)
  else {
    // Browse products
    const browseRes = testBrowse(sessionCookie);
    sleep(1);
    
    // Add product to cart
    try {
      const body = JSON.parse(browseRes.body);
      const listings = body.result.data;
      
      if (listings && listings.length > 0) {
        const randomProduct = listings[Math.floor(Math.random() * listings.length)];
        testAddToCart(sessionCookie, randomProduct.id, 2);
        sleep(1);
        
        // View cart
        testViewCart(sessionCookie);
        sleep(1);
        
        // Checkout
        testCheckout(sessionCookie);
        sleep(2);
      }
    } catch (e) {
      console.error('Failed to checkout:', e);
    }
  }
  
  sleep(1);
}

/**
 * Setup function
 */
export function setup() {
  console.log('Starting marketplace load test...');
  console.log(`Target: ${BASE_URL}`);
}

/**
 * Teardown function
 */
export function teardown() {
  console.log('Marketplace load test completed');
}
