# Load Test Baseline Report

## Test Environment
- **Platform:** FarmConnect Production Server
- **Infrastructure:** Docker Compose (42 services)
- **Database:** PostgreSQL 15 (connection pool: 20 max)
- **Cache:** Redis 7
- **Date:** 2026-05-27

## K6 Test Files

| Test File | Target | Scenario |
|-----------|--------|----------|
| `k6-load-test.js` | Core API (farmers, farms, crops) | Ramp 1→50→100→50→0 VUs over 5 minutes |
| `k6-marketplace.js` | Marketplace endpoints | 50 VUs sustained, listing/ordering flow |
| `marketplace-load-test.js` | Extended marketplace | Product browsing, search, order placement |
| `auth-load-test.js` | Authentication flow | Login, token refresh, protected endpoints |
| `ml-services-load-test.js` | ML prediction endpoints | Inference requests under load |

## Expected Baseline Metrics (Target SLOs)

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| **P95 Response Time** | < 500ms | > 2000ms |
| **P99 Response Time** | < 1000ms | > 5000ms |
| **Error Rate** | < 1% | > 5% |
| **Throughput** | > 100 req/s | < 50 req/s |
| **DB Connection Pool** | < 70% utilization | > 90% |

## Running Load Tests

### Prerequisites
```bash
# Install K6
curl -s https://dl.k6.io/key.gpg | gpg --dearmor | sudo tee /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Start the platform
docker compose up -d
npm run dev
```

### Execution Commands
```bash
# Core API load test (5 minutes)
k6 run tests/load/k6-load-test.js --out json=results/core-api.json

# Marketplace load test
k6 run tests/load/k6-marketplace.js --out json=results/marketplace.json

# Authentication load test
k6 run tests/load/auth-load-test.js --out json=results/auth.json

# ML Services load test
k6 run tests/load/ml-services-load-test.js --out json=results/ml.json

# Full suite (sequential)
k6 run tests/load/k6-load-test.js && \
k6 run tests/load/k6-marketplace.js && \
k6 run tests/load/auth-load-test.js && \
k6 run tests/load/ml-services-load-test.js
```

### Output
Results are exported to `tests/load/results/` in JSON format for analysis.
Grafana dashboard available at `http://localhost:3000/d/k6` when Prometheus is running.

## Capacity Planning

| Load Level | VUs | Expected Throughput | Notes |
|-----------|-----|--------------------|----|
| Light | 10 | 50 req/s | Development |
| Normal | 50 | 200 req/s | Pilot (100 farmers) |
| Peak | 100 | 400 req/s | Regional launch |
| Stress | 200 | 500+ req/s | National scale |
| Break | 500+ | Degradation expected | Find breaking point |

## Known Bottlenecks

1. **Database connection pool** (20 max) — saturates at ~100 concurrent requests
2. **ML inference** — CPU-bound, ~200ms per prediction without GPU
3. **Image processing** — Memory-intensive, ~500ms per image resize
4. **Kafka publishing** — Async but adds ~10ms per event under load
5. **TigerBeetle ledger** — Sequential writes, ~5ms per transfer

## Recommendations for Scale

1. Increase DB pool to 50-100 connections for production
2. Add read replicas for query-heavy endpoints
3. Deploy ML service on GPU instances for inference
4. Enable Redis caching for frequently accessed data (farm lists, produce prices)
5. Use CDN for static assets and image delivery
6. Implement request queuing for burst traffic (Kafka-backed)
