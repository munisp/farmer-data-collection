# K6 Load Testing Baselines & SLO Definitions

## FarmConnect Platform — Performance Targets

**Last Updated:** 2026-05-27  
**Test Environment:** Production-equivalent (3 replicas, 4 vCPU, 8GB RAM each)

---

## 1. Service Level Objectives (SLOs)

### API Response Time

| Percentile | Target | Maximum | Scope |
|-----------|--------|---------|-------|
| p50 | < 100ms | 200ms | All endpoints |
| p95 | < 500ms | 1000ms | All endpoints |
| p99 | < 1000ms | 3000ms | All endpoints |
| p99.9 | < 3000ms | 5000ms | Critical paths |

### Throughput

| Metric | Target | Minimum |
|--------|--------|---------|
| Requests/sec (sustained) | 500 req/s | 200 req/s |
| Requests/sec (peak) | 2000 req/s | 800 req/s |
| Concurrent users | 1000 | 500 |

### Reliability

| Metric | Target |
|--------|--------|
| Error rate (5xx) | < 0.1% |
| Error rate (4xx, non-auth) | < 1% |
| Availability | 99.9% |
| Circuit breaker trips | < 5/hour |

### Database

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Query p95 latency | < 50ms | > 200ms |
| Connection pool utilization | < 70% | > 85% |
| Active connections | < 80 | > 90 (of 100 max) |
| Deadlock rate | 0/hour | > 1/hour |

---

## 2. Load Test Scenarios

### 2.1 Baseline — Normal Traffic

```javascript
// k6/baseline.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency', true);

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up
    { duration: '5m', target: 50 },   // Sustain
    { duration: '2m', target: 100 },  // Increase
    { duration: '5m', target: 100 },  // Sustain peak
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

export default function () {
  // Mix of read-heavy operations (80% reads, 20% writes)
  const scenario = Math.random();

  if (scenario < 0.3) {
    // Dashboard load (most common)
    const res = http.get(`${BASE_URL}/api/trpc/dashboard.getSummary`);
    apiLatency.add(res.timings.duration);
    check(res, { 'dashboard 200': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
  } else if (scenario < 0.5) {
    // Marketplace browsing
    const res = http.get(`${BASE_URL}/api/trpc/marketplace.listProducts?input={"limit":20}`);
    apiLatency.add(res.timings.duration);
    check(res, { 'marketplace 200': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
  } else if (scenario < 0.7) {
    // Farmer profile
    const res = http.get(`${BASE_URL}/api/trpc/coreFarms.list`);
    apiLatency.add(res.timings.duration);
    check(res, { 'farms 200': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
  } else if (scenario < 0.85) {
    // Analytics query
    const res = http.get(`${BASE_URL}/api/trpc/analytics.getSummary`);
    apiLatency.add(res.timings.duration);
    check(res, { 'analytics 200': (r) => r.status === 200 });
    errorRate.add(res.status >= 500);
  } else {
    // Write operation (loan application, marketplace listing)
    const payload = JSON.stringify({
      amount: 50000,
      purpose: 'seeds',
      duration_months: 12,
    });
    const res = http.post(`${BASE_URL}/api/trpc/loanApplication.submit`, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    apiLatency.add(res.timings.duration);
    errorRate.add(res.status >= 500);
  }

  sleep(Math.random() * 2 + 0.5); // 0.5-2.5s think time
}
```

### 2.2 Stress Test — Peak Load

```javascript
// k6/stress.js
export const options = {
  stages: [
    { duration: '2m', target: 200 },
    { duration: '5m', target: 500 },
    { duration: '2m', target: 1000 },
    { duration: '5m', target: 1000 },  // Peak sustained
    { duration: '5m', target: 500 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<3000'],
    http_req_failed: ['rate<0.05'],
  },
};
```

### 2.3 Spike Test — Sudden Load

```javascript
// k6/spike.js
export const options = {
  stages: [
    { duration: '1m', target: 50 },    // Normal
    { duration: '10s', target: 2000 },  // Spike!
    { duration: '3m', target: 2000 },   // Sustain spike
    { duration: '10s', target: 50 },    // Recovery
    { duration: '3m', target: 50 },     // Verify recovery
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.1'],     // Allow higher error during spike
  },
};
```

### 2.4 Soak Test — Endurance

```javascript
// k6/soak.js
export const options = {
  stages: [
    { duration: '5m', target: 100 },
    { duration: '4h', target: 100 },   // 4-hour sustained load
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};
// Monitor for: memory leaks, connection pool exhaustion, disk space
```

### 2.5 Payment Endpoint Load Test

```javascript
// k6/payment-load.js
export const options = {
  scenarios: {
    mpesa: {
      executor: 'constant-arrival-rate',
      rate: 50,              // 50 payment requests/sec
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],  // Payments have higher latency budget
    http_req_failed: ['rate<0.001'],   // 99.9% success for payments
  },
};
```

---

## 3. Baseline Results (Expected)

### Normal Traffic (100 VUs)

| Metric | Expected | Alert If |
|--------|----------|----------|
| p50 latency | 45ms | > 100ms |
| p95 latency | 180ms | > 500ms |
| p99 latency | 450ms | > 1000ms |
| Throughput | 350 req/s | < 200 req/s |
| Error rate | 0.02% | > 0.1% |
| CPU utilization | 35% | > 70% |
| Memory usage | 1.2 GB | > 3 GB |

### Peak Traffic (500 VUs)

| Metric | Expected | Alert If |
|--------|----------|----------|
| p50 latency | 85ms | > 200ms |
| p95 latency | 380ms | > 1000ms |
| p99 latency | 850ms | > 3000ms |
| Throughput | 800 req/s | < 400 req/s |
| Error rate | 0.05% | > 1% |
| CPU utilization | 65% | > 85% |
| Memory usage | 2.5 GB | > 6 GB |

---

## 4. Capacity Planning

### Current Capacity

| Resource | Current | Headroom | Scale Trigger |
|----------|---------|----------|---------------|
| API pods | 3 | 10x (autoscale to 30) | CPU > 70% |
| Database connections | 100 pool | 3x (300 max) | Pool > 80% |
| Kafka partitions | 12 per topic | 4x | Consumer lag > 1000 |
| Redis memory | 2 GB | 8x (16 GB) | Memory > 75% |

### Growth Projections

| Timeframe | Users | Peak RPM | Required Infrastructure |
|-----------|-------|----------|------------------------|
| Current | 5,000 | 6,000 | 3 pods, 1 DB |
| 6 months | 25,000 | 30,000 | 5 pods, 1 DB (read replicas) |
| 12 months | 100,000 | 120,000 | 10 pods, DB cluster (3 nodes) |
| 24 months | 500,000 | 600,000 | 20+ pods, DB sharding, CDN |

---

## 5. Running Load Tests

```bash
# Install k6
brew install k6  # macOS
# or: apt-get install k6  # Ubuntu

# Run baseline test
k6 run --env API_URL=https://staging.farmconnect.io k6/baseline.js

# Run with Grafana Cloud export
k6 run --out cloud k6/stress.js

# Run specific scenario
k6 run --vus 100 --duration 5m k6/payment-load.js

# Generate HTML report
k6 run --out json=results.json k6/baseline.js
# Process with k6-reporter
```

---

## 6. Alerting Integration

```yaml
# Prometheus alerting rules for SLO violations
groups:
  - name: slo_violations
    rules:
      - alert: HighLatencyP95
        expr: histogram_quantile(0.95, http_request_duration_seconds_bucket) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency exceeds 500ms SLO"
          
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.001
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error rate exceeds 0.1% SLO"
          
      - alert: LowThroughput
        expr: rate(http_requests_total[5m]) < 3.33  # < 200 req/min
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Throughput below minimum baseline"
```
