# K6 Performance Baseline Report

**Date:** 2026-05-27
**Environment:** Development (single instance, no horizontal scaling)
**Test Scripts:** 5 K6 load test scripts

---

## Test Scripts Inventory

| Script | Target | VUs | Duration | Scenarios |
|--------|--------|-----|----------|-----------|
| `k6-load-test.js` | Core API endpoints | 10-50 | 5m | Health, farmer CRUD, farm operations |
| `k6-marketplace.js` | Marketplace API | 10-30 | 3m | Browse listings, search, place orders |
| `marketplace-load-test.js` | Extended marketplace | 10-50 | 5m | Full purchase flow with payment |
| `auth-load-test.js` | Authentication | 5-20 | 3m | Login, token refresh, protected routes |
| `ml-services-load-test.js` | AI/ML endpoints | 5-10 | 3m | Produce inspection, credit scoring |

## SLO Targets

| Metric | Target | Threshold |
|--------|--------|-----------|
| **P95 Response Time** | < 500ms | < 1000ms (warning) |
| **P99 Response Time** | < 1000ms | < 2000ms (warning) |
| **Error Rate** | < 1% | < 5% (warning) |
| **Throughput** | > 100 req/s | > 50 req/s (minimum) |
| **Health Endpoint** | < 50ms (P95) | < 100ms |

## Expected Baseline Results (Development)

### Core API (`k6-load-test.js`)
```
scenarios: default
vus: 10→50 (ramp-up 1m → steady 3m → ramp-down 1m)

Expected results:
  http_req_duration (p95)...: < 300ms
  http_req_duration (p99)...: < 800ms  
  http_req_failed............: < 2%
  http_reqs..................: > 500/s (at 50 VUs)
  iterations.................: > 2000

Notes:
- Health endpoint: < 10ms consistently
- Farmer CRUD: < 200ms with DB
- Farm boundaries (PostGIS): < 500ms
```

### Marketplace (`k6-marketplace.js`)
```
scenarios: default
vus: 10→30

Expected results:
  http_req_duration (p95)...: < 400ms
  http_req_failed............: < 3%
  http_reqs..................: > 200/s (at 30 VUs)

Notes:
- Search with filters: < 300ms
- Place order: < 500ms (includes validation)
- Browse listings: < 200ms (cached)
```

### Authentication (`auth-load-test.js`)
```
scenarios: default  
vus: 5→20

Expected results:
  http_req_duration (p95)...: < 200ms
  http_req_failed............: < 1%

Notes:
- Login (JWT generation): < 100ms
- Token refresh: < 50ms
- Protected route access: < 200ms
```

### ML Services (`ml-services-load-test.js`)
```
scenarios: default
vus: 5→10

Expected results:
  http_req_duration (p95)...: < 2000ms (ML inference is inherently slower)
  http_req_failed............: < 5%

Notes:
- Produce inspection: < 3s (image processing + 6 model pipeline)
- Credit scoring: < 500ms (lightweight logistic regression)
- Health check: < 50ms
```

## How to Run

```bash
# Install k6
brew install grafana/tap/k6  # macOS
# or: snap install k6         # Linux

# Run individual tests
k6 run tests/load/k6-load-test.js
k6 run tests/load/k6-marketplace.js
k6 run tests/load/auth-load-test.js
k6 run tests/load/ml-services-load-test.js
k6 run tests/load/marketplace-load-test.js

# Run with custom VUs and duration
k6 run --vus 100 --duration 10m tests/load/k6-load-test.js

# Export results to JSON
k6 run --out json=results.json tests/load/k6-load-test.js

# Export to Prometheus (if running)
k6 run --out experimental-prometheus-rw tests/load/k6-load-test.js
```

## CI Integration

The CI workflow includes a load testing job (`load-test`) that runs on `main`/`develop` branches:
- Installs k6
- Starts the application
- Runs the core load test (`k6-load-test.js`)
- Validates performance budgets against SLO targets
- Uploads results as CI artifacts

## Capacity Planning

| Component | Dev Capacity | Production Target | Scaling Strategy |
|-----------|-------------|-------------------|------------------|
| API Server | 500 req/s | 5,000 req/s | Horizontal (k8s replicas) |
| PostgreSQL | 200 queries/s | 2,000 queries/s | Read replicas + pgBouncer |
| Redis | 1,000 ops/s | 10,000 ops/s | Redis Cluster |
| ML Inference | 5 req/s | 50 req/s | GPU workers + queue |
| WebSocket | 100 connections | 10,000 connections | Sticky sessions + Redis pub/sub |

## Next Steps

1. Run baseline tests against staging environment
2. Document actual P95/P99 values from staging
3. Set up automated regression testing in CI
4. Configure k6-to-Grafana for real-time dashboards
5. Define alerting thresholds based on baseline data
