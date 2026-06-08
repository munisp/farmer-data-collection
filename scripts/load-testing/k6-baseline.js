/**
 * FarmConnect k6 Load Test — Performance Baseline
 *
 * Usage:
 *   k6 run scripts/load-testing/k6-baseline.js
 *   k6 run --env BASE_URL=https://api.farmconnect.app scripts/load-testing/k6-baseline.js
 *   k6 run --out json=results.json scripts/load-testing/k6-baseline.js
 *
 * Stages: ramp 1→50 VUs over 2m, hold 50 for 5m, ramp down over 1m
 */
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const TRPC = `${BASE_URL}/api/trpc`;

// Custom metrics
const errorRate = new Rate("farmconnect_errors");
const trpcLatency = new Trend("farmconnect_trpc_latency", true);
const healthLatency = new Trend("farmconnect_health_latency", true);

export const options = {
  stages: [
    { duration: "30s", target: 10 },   // warm up
    { duration: "1m",  target: 30 },   // ramp to 30
    { duration: "2m",  target: 50 },   // ramp to 50
    { duration: "5m",  target: 50 },   // sustained load
    { duration: "1m",  target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000", "p(99)<5000"],  // p95 < 2s, p99 < 5s
    farmconnect_errors: ["rate<0.05"],                  // < 5% error rate
    farmconnect_trpc_latency: ["p(95)<1500"],           // tRPC p95 < 1.5s
    farmconnect_health_latency: ["p(99)<500"],          // health p99 < 500ms
  },
};

// Helper for tRPC GET calls
function trpcGet(procedure, input) {
  let url = `${TRPC}/${procedure}`;
  if (input) {
    url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
  }
  const res = http.get(url, { tags: { name: procedure } });
  trpcLatency.add(res.timings.duration);
  errorRate.add(res.status >= 400);
  return res;
}

export default function () {
  // 1. Health checks (every VU, every iteration)
  group("Health Probes", () => {
    const health = http.get(`${BASE_URL}/health`);
    healthLatency.add(health.timings.duration);
    check(health, {
      "health returns 200": (r) => r.status === 200,
      "health has status ok": (r) => {
        try { return JSON.parse(r.body).status === "ok"; } catch { return false; }
      },
    });

    const ready = http.get(`${BASE_URL}/readyz`);
    check(ready, { "readyz returns 2xx": (r) => r.status >= 200 && r.status < 300 });
  });

  sleep(0.5);

  // 2. Core marketplace flow (most common user path)
  group("Marketplace Flow", () => {
    const commodities = trpcGet("marketplace.listCommodities");
    check(commodities, {
      "commodities returns 200": (r) => r.status === 200,
      "has commodity data": (r) => {
        try { return JSON.parse(r.body).result.data.json.length > 0; } catch { return false; }
      },
    });

    const analytics = trpcGet("analytics.getDashboardMetrics");
    check(analytics, {
      "analytics returns 200": (r) => r.status === 200,
    });
  });

  sleep(1);

  // 3. Financial services
  group("Financial Services", () => {
    const providers = trpcGet("mobileMoney.listProviders");
    check(providers, {
      "providers returns 200": (r) => r.status === 200,
    });
  });

  sleep(0.5);

  // 4. Innovation routers (cycle through different ones)
  group("Innovation Endpoints", () => {
    const endpoints = [
      "insuranceAI.listProducts",
      "carbonCredit.listProjects",
      "voiceFirstAI.listSupportedLanguages",
      "chamaSavings.listChamas",
      "federatedLearning.listModels",
    ];
    const idx = Math.floor(Math.random() * endpoints.length);
    const res = trpcGet(endpoints[idx]);
    check(res, {
      "innovation endpoint returns 200": (r) => r.status === 200,
    });
  });

  sleep(0.5);

  // 5. Polyglot services
  group("Polyglot Services", () => {
    const aquaSpecies = trpcGet("aquaculturePond.listSpecies");
    check(aquaSpecies, {
      "aquaculture species returns 200": (r) => r.status === 200,
    });

    const zones = trpcGet("subscriptionDelivery.listMicroZones");
    check(zones, {
      "micro zones returns 200": (r) => r.status === 200,
    });

    const crops = trpcGet("ceaAI.listIndoorCrops");
    check(crops, {
      "indoor crops returns 200": (r) => r.status === 200,
    });
  });

  sleep(0.5);

  // 6. Export & Pipeline
  group("Export & Pipeline", () => {
    const shipments = trpcGet("exportChain.listShipments");
    check(shipments, {
      "export shipments returns 200": (r) => r.status === 200,
    });

    const jobs = trpcGet("dataPipeline.listJobs");
    check(jobs, {
      "pipeline jobs returns 200": (r) => r.status === 200,
    });
  });

  sleep(0.5);

  // 7. Auth protection (should return 401)
  group("Auth Protection", () => {
    const admin = trpcGet("adminDashboard.getSystemStatus");
    check(admin, {
      "admin endpoint returns 401": (r) => r.status === 401,
    });
  });

  sleep(1);
}

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    base_url: BASE_URL,
    vus_max: data.root_group?.checks ? 50 : 0,
    metrics: {
      http_reqs: data.metrics?.http_reqs?.values?.count || 0,
      http_req_duration_p95: data.metrics?.http_req_duration?.values?.["p(95)"] || 0,
      http_req_duration_p99: data.metrics?.http_req_duration?.values?.["p(99)"] || 0,
      error_rate: data.metrics?.farmconnect_errors?.values?.rate || 0,
      trpc_latency_p95: data.metrics?.farmconnect_trpc_latency?.values?.["p(95)"] || 0,
    },
    thresholds_passed: Object.values(data.metrics || {}).every(
      (m) => !m.thresholds || Object.values(m.thresholds).every((t) => t.ok)
    ),
  };

  return {
    stdout: JSON.stringify(summary, null, 2) + "\n",
    "load-test-results.json": JSON.stringify(data, null, 2),
  };
}
