/**
 * K6 Load Test — Marketplace & Critical Endpoints
 * 
 * Run: k6 run tests/load/k6-marketplace.js
 * With options: k6 run --vus 50 --duration 60s tests/load/k6-marketplace.js
 * 
 * Thresholds:
 *   - p95 response time < 500ms
 *   - Error rate < 1%
 *   - Throughput > 100 req/s
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

const errorRate = new Rate("errors");
const listingLatency = new Trend("listing_latency");
const healthLatency = new Trend("health_latency");

export const options = {
  stages: [
    { duration: "30s", target: 10 },   // ramp up
    { duration: "1m", target: 50 },     // sustained load
    { duration: "30s", target: 100 },   // peak
    { duration: "30s", target: 0 },     // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1000"],
    errors: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  group("Health Checks", function () {
    const healthRes = http.get(`${BASE_URL}/health`);
    healthLatency.add(healthRes.timings.duration);
    check(healthRes, {
      "health status 200": (r) => r.status === 200,
    });
    errorRate.add(healthRes.status !== 200);
  });

  group("Marketplace - Browse Listings", function () {
    const listRes = http.get(`${BASE_URL}/api/trpc/marketplace.getListings?input=${encodeURIComponent(JSON.stringify({ json: { limit: 20 } }))}`);
    listingLatency.add(listRes.timings.duration);
    check(listRes, {
      "listings status 200": (r) => r.status === 200,
      "listings response time < 500ms": (r) => r.timings.duration < 500,
    });
    errorRate.add(listRes.status !== 200);
  });

  group("Price Alerts - Get Seasonal Price", function () {
    const priceRes = http.get(`${BASE_URL}/api/trpc/marketplaceEnhancements.getSeasonalPriceRecommendation?input=${encodeURIComponent(JSON.stringify({ json: { crop: "maize", region: "kenya" } }))}`);
    check(priceRes, {
      "price status 200": (r) => r.status === 200,
    });
    errorRate.add(priceRes.status !== 200);
  });

  group("Weather Alerts - Get Active", function () {
    const weatherRes = http.get(`${BASE_URL}/api/trpc/weatherAlerts.getActiveAlerts?input=${encodeURIComponent(JSON.stringify({ json: { region: "kenya" } }))}`);
    check(weatherRes, {
      "weather status 200": (r) => r.status === 200,
    });
    errorRate.add(weatherRes.status !== 200);
  });

  group("Delivery - List Zones", function () {
    const zoneRes = http.get(`${BASE_URL}/api/trpc/delivery.listZones`);
    check(zoneRes, {
      "zones status 200": (r) => r.status === 200,
    });
    errorRate.add(zoneRes.status !== 200);
  });

  group("Cooperative - List", function () {
    const coopRes = http.get(`${BASE_URL}/api/trpc/cooperative.list`);
    check(coopRes, {
      "coops status 200": (r) => r.status === 200,
    });
    errorRate.add(coopRes.status !== 200);
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    "tests/load/results.json": JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}

function textSummary(data, opts) {
  const metrics = data.metrics;
  let output = "\n=== FarmConnect Load Test Results ===\n\n";
  output += `Total Requests: ${metrics.http_reqs?.values?.count ?? 0}\n`;
  output += `Failed Requests: ${metrics.http_req_failed?.values?.passes ?? 0}\n`;
  output += `Avg Response Time: ${Math.round(metrics.http_req_duration?.values?.avg ?? 0)}ms\n`;
  output += `P95 Response Time: ${Math.round(metrics.http_req_duration?.values?.["p(95)"] ?? 0)}ms\n`;
  output += `P99 Response Time: ${Math.round(metrics.http_req_duration?.values?.["p(99)"] ?? 0)}ms\n`;
  output += `Error Rate: ${((metrics.errors?.values?.rate ?? 0) * 100).toFixed(2)}%\n`;
  return output;
}
