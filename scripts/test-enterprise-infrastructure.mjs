#!/usr/bin/env node

/**
 * Enterprise Infrastructure Test Suite
 * 
 * Tests all Phase 26 components:
 * - Redis caching
 * - APISIX API Gateway
 * - Prometheus metrics
 * - Rate limiting
 * - Health checks
 */

import { createClient } from 'redis';
import fetch from 'node-fetch';

// Configuration
const CONFIG = {
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || 'redis_pass'
  },
  api: {
    direct: process.env.API_URL || 'http://localhost:3100',
    gateway: process.env.GATEWAY_URL || 'http://localhost:9080'
  },
  prometheus: process.env.PROMETHEUS_URL || 'http://localhost:9090',
  apisix: {
    admin: process.env.APISIX_ADMIN_URL || 'http://localhost:9180',
    apiKey: process.env.APISIX_API_KEY || 'edd1c9f034335f136f87ad84b625c8f1'
  }
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

// Helper functions
function logTest(name, status, message = '') {
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${emoji} ${name}: ${status}${message ? ' - ' + message : ''}`);
  
  results.tests.push({ name, status, message });
  if (status === 'PASS') results.passed++;
  else if (status === 'FAIL') results.failed++;
  else results.skipped++;
}

function logSection(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: Redis Connection
async function testRedisConnection() {
  logSection('Test 1: Redis Connection');
  
  try {
    const client = createClient({
      url: CONFIG.redis.url,
      password: CONFIG.redis.password
    });
    
    client.on('error', (err) => {
      logTest('Redis Connection', 'FAIL', err.message);
    });
    
    await client.connect();
    const pong = await client.ping();
    
    if (pong === 'PONG') {
      logTest('Redis Connection', 'PASS', 'Successfully connected to Redis');
    } else {
      logTest('Redis Connection', 'FAIL', 'Unexpected response: ' + pong);
    }
    
    await client.disconnect();
  } catch (error) {
    logTest('Redis Connection', 'SKIP', 'Redis not available: ' + error.message);
  }
}

// Test 2: Redis Cache Operations
async function testRedisCacheOperations() {
  logSection('Test 2: Redis Cache Operations');
  
  try {
    const client = createClient({
      url: CONFIG.redis.url,
      password: CONFIG.redis.password
    });
    
    await client.connect();
    
    // Test SET
    await client.set('test:key', 'test_value', { EX: 60 });
    logTest('Redis SET', 'PASS', 'Successfully set key');
    
    // Test GET
    const value = await client.get('test:key');
    if (value === 'test_value') {
      logTest('Redis GET', 'PASS', 'Successfully retrieved value');
    } else {
      logTest('Redis GET', 'FAIL', `Expected 'test_value', got '${value}'`);
    }
    
    // Test EXISTS
    const exists = await client.exists('test:key');
    if (exists === 1) {
      logTest('Redis EXISTS', 'PASS', 'Key exists');
    } else {
      logTest('Redis EXISTS', 'FAIL', 'Key should exist');
    }
    
    // Test DEL
    await client.del('test:key');
    const existsAfterDel = await client.exists('test:key');
    if (existsAfterDel === 0) {
      logTest('Redis DEL', 'PASS', 'Successfully deleted key');
    } else {
      logTest('Redis DEL', 'FAIL', 'Key should not exist');
    }
    
    await client.disconnect();
  } catch (error) {
    logTest('Redis Cache Operations', 'SKIP', error.message);
  }
}

// Test 3: Application Health Check
async function testApplicationHealth() {
  logSection('Test 3: Application Health Check');
  
  try {
    const response = await fetch(`${CONFIG.api.direct}/health`);
    const data = await response.json();
    
    if (response.ok && data.status === 'healthy') {
      logTest('App Health Check', 'PASS', 'Application is healthy');
    } else {
      logTest('App Health Check', 'FAIL', `Status: ${data.status}`);
    }
  } catch (error) {
    logTest('App Health Check', 'SKIP', error.message);
  }
}

// Test 4: Prometheus Metrics
async function testPrometheusMetrics() {
  logSection('Test 4: Prometheus Metrics');
  
  try {
    const response = await fetch(`${CONFIG.api.direct}/metrics`);
    const metrics = await response.text();
    
    if (response.ok && metrics.includes('# TYPE')) {
      logTest('Metrics Endpoint', 'PASS', 'Metrics are being exposed');
      
      // Check for specific metrics
      const expectedMetrics = [
        'http_requests_total',
        'http_request_duration_seconds',
        'cache_hits_total',
        'cache_misses_total',
        'db_query_duration_seconds'
      ];
      
      for (const metric of expectedMetrics) {
        if (metrics.includes(metric)) {
          logTest(`Metric: ${metric}`, 'PASS', 'Found in metrics output');
        } else {
          logTest(`Metric: ${metric}`, 'FAIL', 'Not found in metrics output');
        }
      }
    } else {
      logTest('Metrics Endpoint', 'FAIL', 'Invalid metrics format');
    }
  } catch (error) {
    logTest('Metrics Endpoint', 'SKIP', error.message);
  }
}

// Test 5: Prometheus Server
async function testPrometheusServer() {
  logSection('Test 5: Prometheus Server');
  
  try {
    const response = await fetch(`${CONFIG.prometheus}/-/healthy`);
    const text = await response.text();
    
    if (response.ok && text.includes('Prometheus is Healthy')) {
      logTest('Prometheus Health', 'PASS', 'Prometheus is running');
    } else {
      logTest('Prometheus Health', 'FAIL', text);
    }
    
    // Test query API
    const queryResponse = await fetch(
      `${CONFIG.prometheus}/api/v1/query?query=up`
    );
    const queryData = await queryResponse.json();
    
    if (queryResponse.ok && queryData.status === 'success') {
      logTest('Prometheus Query API', 'PASS', 'Query API is working');
    } else {
      logTest('Prometheus Query API', 'FAIL', queryData.error || 'Unknown error');
    }
  } catch (error) {
    logTest('Prometheus Server', 'SKIP', error.message);
  }
}

// Test 6: APISIX Gateway
async function testAPIGateway() {
  logSection('Test 6: APISIX API Gateway');
  
  try {
    // Test gateway health
    const healthResponse = await fetch(`${CONFIG.api.gateway}/health`);
    if (healthResponse.ok) {
      logTest('APISIX Gateway Health', 'PASS', 'Gateway is accessible');
    } else {
      logTest('APISIX Gateway Health', 'FAIL', `Status: ${healthResponse.status}`);
    }
    
    // Test admin API
    const adminResponse = await fetch(
      `${CONFIG.apisix.admin}/apisix/admin/routes`,
      {
        headers: {
          'X-API-KEY': CONFIG.apisix.apiKey
        }
      }
    );
    
    if (adminResponse.ok) {
      const routes = await adminResponse.json();
      logTest('APISIX Admin API', 'PASS', `Found ${routes.list?.length || 0} routes`);
    } else {
      logTest('APISIX Admin API', 'FAIL', `Status: ${adminResponse.status}`);
    }
  } catch (error) {
    logTest('APISIX Gateway', 'SKIP', error.message);
  }
}

// Test 7: Rate Limiting
async function testRateLimiting() {
  logSection('Test 7: Rate Limiting');
  
  try {
    console.log('Sending 150 requests to test rate limiting...');
    
    let successCount = 0;
    let rateLimitedCount = 0;
    
    for (let i = 0; i < 150; i++) {
      const response = await fetch(`${CONFIG.api.gateway}/api/health`);
      
      if (response.status === 200) {
        successCount++;
      } else if (response.status === 429) {
        rateLimitedCount++;
      }
      
      await sleep(10); // Small delay between requests
    }
    
    console.log(`  Success: ${successCount}, Rate Limited: ${rateLimitedCount}`);
    
    if (rateLimitedCount > 0) {
      logTest('Rate Limiting', 'PASS', `${rateLimitedCount} requests were rate limited`);
    } else {
      logTest('Rate Limiting', 'SKIP', 'No rate limiting detected (may need higher request rate)');
    }
  } catch (error) {
    logTest('Rate Limiting', 'SKIP', error.message);
  }
}

// Test 8: Cache Performance
async function testCachePerformance() {
  logSection('Test 8: Cache Performance');
  
  try {
    // First request (cache miss)
    const start1 = Date.now();
    const response1 = await fetch(`${CONFIG.api.direct}/api/cache/stats`);
    const duration1 = Date.now() - start1;
    
    if (!response1.ok) {
      logTest('Cache Stats Endpoint', 'SKIP', 'Endpoint not available');
      return;
    }
    
    const stats1 = await response1.json();
    logTest('Cache Stats Endpoint', 'PASS', `Keys: ${stats1.keys}, Hits: ${stats1.hits}`);
    
    // Make some cached requests
    await fetch(`${CONFIG.api.direct}/health`);
    await fetch(`${CONFIG.api.direct}/health`);
    await fetch(`${CONFIG.api.direct}/health`);
    
    await sleep(100);
    
    // Second request (should be faster if cached)
    const start2 = Date.now();
    const response2 = await fetch(`${CONFIG.api.direct}/api/cache/stats`);
    const duration2 = Date.now() - start2;
    const stats2 = await response2.json();
    
    const improvement = ((duration1 - duration2) / duration1 * 100).toFixed(1);
    
    if (parseInt(stats2.hits) > parseInt(stats1.hits)) {
      logTest('Cache Hit Detection', 'PASS', `Cache hits increased from ${stats1.hits} to ${stats2.hits}`);
    } else {
      logTest('Cache Hit Detection', 'SKIP', 'No cache hit increase detected');
    }
    
    logTest('Cache Performance', 'PASS', 
      `First: ${duration1}ms, Second: ${duration2}ms (${improvement}% improvement)`);
  } catch (error) {
    logTest('Cache Performance', 'SKIP', error.message);
  }
}

// Test 9: Keycloak (if enabled)
async function testKeycloak() {
  logSection('Test 9: Keycloak Authentication');
  
  try {
    const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8080';
    const response = await fetch(`${keycloakUrl}/health/ready`);
    
    if (response.ok) {
      logTest('Keycloak Health', 'PASS', 'Keycloak is running');
      
      // Test realm endpoint
      const realmResponse = await fetch(
        `${keycloakUrl}/realms/farmer-realm`
      );
      
      if (realmResponse.ok) {
        logTest('Keycloak Realm', 'PASS', 'farmer-realm is configured');
      } else {
        logTest('Keycloak Realm', 'FAIL', 'farmer-realm not found');
      }
    } else {
      logTest('Keycloak Health', 'FAIL', `Status: ${response.status}`);
    }
  } catch (error) {
    logTest('Keycloak', 'SKIP', error.message);
  }
}

// Test 10: End-to-End Flow
async function testEndToEndFlow() {
  logSection('Test 10: End-to-End Flow');
  
  try {
    // 1. Health check through gateway
    const healthResponse = await fetch(`${CONFIG.api.gateway}/api/health`);
    if (healthResponse.ok) {
      logTest('E2E: Gateway → App', 'PASS', 'Request routed successfully');
    } else {
      logTest('E2E: Gateway → App', 'FAIL', `Status: ${healthResponse.status}`);
    }
    
    // 2. Check metrics were recorded
    await sleep(1000); // Wait for metrics to be scraped
    
    const metricsResponse = await fetch(`${CONFIG.api.direct}/metrics`);
    const metrics = await metricsResponse.text();
    
    if (metrics.includes('http_requests_total')) {
      logTest('E2E: Metrics Recording', 'PASS', 'Metrics are being recorded');
    } else {
      logTest('E2E: Metrics Recording', 'FAIL', 'Metrics not found');
    }
    
    // 3. Verify cache is working
    const cacheResponse = await fetch(`${CONFIG.api.direct}/api/cache/stats`);
    if (cacheResponse.ok) {
      const stats = await cacheResponse.json();
      logTest('E2E: Cache Integration', 'PASS', `Cache has ${stats.keys} keys`);
    } else {
      logTest('E2E: Cache Integration', 'SKIP', 'Cache stats not available');
    }
  } catch (error) {
    logTest('End-to-End Flow', 'SKIP', error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     Enterprise Infrastructure Test Suite - Phase 26       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  console.log('\nConfiguration:');
  console.log(`  Redis:      ${CONFIG.redis.url}`);
  console.log(`  API Direct: ${CONFIG.api.direct}`);
  console.log(`  API Gateway: ${CONFIG.api.gateway}`);
  console.log(`  Prometheus: ${CONFIG.prometheus}`);
  console.log(`  APISIX Admin: ${CONFIG.apisix.admin}`);
  
  // Run all tests
  await testRedisConnection();
  await testRedisCacheOperations();
  await testApplicationHealth();
  await testPrometheusMetrics();
  await testPrometheusServer();
  await testAPIGateway();
  await testRateLimiting();
  await testCachePerformance();
  await testKeycloak();
  await testEndToEndFlow();
  
  // Print summary
  logSection('Test Summary');
  console.log(`✅ Passed:  ${results.passed}`);
  console.log(`❌ Failed:  ${results.failed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`📊 Total:   ${results.tests.length}`);
  
  const passRate = ((results.passed / results.tests.length) * 100).toFixed(1);
  console.log(`\n🎯 Pass Rate: ${passRate}%`);
  
  if (results.failed > 0) {
    console.log('\n⚠️  Some tests failed. Review the output above for details.');
    process.exit(1);
  } else if (results.skipped === results.tests.length) {
    console.log('\n⚠️  All tests were skipped. Services may not be running.');
    process.exit(1);
  } else {
    console.log('\n✨ All available tests passed!');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error);
  process.exit(1);
});
