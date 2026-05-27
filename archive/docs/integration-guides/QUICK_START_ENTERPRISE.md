# Quick Start Guide: Enterprise Infrastructure

## 🚀 Get Started in 5 Minutes

This guide will get you up and running with the full enterprise infrastructure stack.

## Prerequisites

- Docker Engine 24.0+
- Docker Compose 2.20+
- 8GB RAM minimum
- 50GB disk space

## Step 1: Clone and Configure

```bash
# Clone the repository
git clone <repository-url>
cd farmer-data-collection

# Copy environment template
cp .env.example .env.production

# Edit environment variables
nano .env.production
```

**Required Environment Variables:**

```bash
# Database
DATABASE_URL=postgresql://farmer_user:farmer_pass@postgres:5432/farmer_data

# Redis
REDIS_URL=redis://:redis_pass@redis:6379

# JWT Secret (change this!)
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Application
NODE_ENV=production
PORT=3100
```

## Step 2: Start Core Services

```bash
# Start Phase 1 infrastructure
docker compose -f docker-compose.phase1.yml up -d postgres redis etcd apisix prometheus grafana

# Wait for services to be healthy (30-60 seconds)
docker compose -f docker-compose.phase1.yml ps

# Check logs
docker compose -f docker-compose.phase1.yml logs -f
```

## Step 3: Build and Start Application

```bash
# Build application image
docker build -f Dockerfile.server -t farmer-app-server:latest .

# Start application
docker compose -f docker-compose.phase1.yml up -d app-server

# Verify application is running
curl http://localhost:3100/health
```

## Step 4: Verify Services

### Check Redis

```bash
docker exec farmer-redis redis-cli -a redis_pass ping
# Expected: PONG
```

### Check APISIX Gateway

```bash
curl http://localhost:9080/api/health
# Expected: {"status":"healthy"}
```

### Check Prometheus

```bash
curl http://localhost:9090/-/healthy
# Expected: Prometheus is Healthy.
```

### Check Application Metrics

```bash
curl http://localhost:3100/metrics
# Expected: Prometheus metrics output
```

## Step 5: Access Dashboards

### Grafana (Monitoring Dashboards)

1. Open: http://localhost:3333
2. Login: `admin` / `admin`
3. Add Prometheus data source:
   - URL: `http://prometheus:9090`
   - Click "Save & Test"

### Prometheus (Metrics Explorer)

1. Open: http://localhost:9090
2. Try queries:
   - `http_requests_total`
   - `rate(http_requests_total[5m])`
   - `cache_hits_total / (cache_hits_total + cache_misses_total)`

### Application

1. Open: http://localhost:3000 (if frontend is running)
2. Or access via APISIX: http://localhost:9080

## Step 6: Run Tests

```bash
# Install dependencies
cd scripts
pnpm install

# Run enterprise infrastructure tests
node test-enterprise-infrastructure.mjs
```

## Common Commands

### View All Services

```bash
docker compose -f docker-compose.phase1.yml ps
```

### View Logs

```bash
# All services
docker compose -f docker-compose.phase1.yml logs -f

# Specific service
docker compose -f docker-compose.phase1.yml logs -f app-server
docker compose -f docker-compose.phase1.yml logs -f redis
docker compose -f docker-compose.phase1.yml logs -f apisix
```

### Restart Services

```bash
# Restart all
docker compose -f docker-compose.phase1.yml restart

# Restart specific service
docker compose -f docker-compose.phase1.yml restart app-server
```

### Stop Services

```bash
# Stop all services
docker compose -f docker-compose.phase1.yml down

# Stop and remove volumes (WARNING: deletes data)
docker compose -f docker-compose.phase1.yml down -v
```

## Troubleshooting

### Redis Connection Failed

```bash
# Check Redis is running
docker compose -f docker-compose.phase1.yml ps redis

# Check Redis logs
docker compose -f docker-compose.phase1.yml logs redis

# Test connection
docker exec farmer-redis redis-cli -a redis_pass ping
```

**Fix:** Verify `REDIS_URL` in `.env.production` matches the Redis password.

### APISIX Not Routing

```bash
# Check APISIX logs
docker compose -f docker-compose.phase1.yml logs apisix

# Check etcd is healthy
docker compose -f docker-compose.phase1.yml ps etcd

# Verify APISIX config
cat config/apisix/config.yaml
```

**Fix:** Ensure `config/apisix/config.yaml` exists and is mounted correctly.

### Application Won't Start

```bash
# Check application logs
docker compose -f docker-compose.phase1.yml logs app-server

# Check database connection
docker compose -f docker-compose.phase1.yml ps postgres

# Test database connection
docker exec farmer-postgres psql -U farmer_user -d farmer_data -c "SELECT 1"
```

**Fix:** Verify `DATABASE_URL` is correct and PostgreSQL is healthy.

### Prometheus Not Scraping

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Verify metrics endpoint
curl http://localhost:3100/metrics

# Check Prometheus config
cat config/prometheus/prometheus.yml
```

**Fix:** Ensure application exposes `/metrics` endpoint and Prometheus can reach it.

## Optional: Enable Keycloak

```bash
# Start Keycloak services
docker compose -f docker-compose.phase1.yml up -d postgres-keycloak keycloak

# Wait for Keycloak to start (1-2 minutes)
docker compose -f docker-compose.phase1.yml logs -f keycloak

# Run setup script
cd scripts
node setup-keycloak.mjs

# Access Keycloak admin console
# URL: http://localhost:8080
# Login: admin / admin_pass
```

## Optional: Enable Kafka

```bash
# Start Kafka services
docker compose -f docker-compose.phase1.yml up -d zookeeper kafka kafka-ui

# Wait for Kafka to start
docker compose -f docker-compose.phase1.yml logs -f kafka

# Access Kafka UI
# URL: http://localhost:8090
```

## Optional: Enable Permify

```bash
# Start Permify services
docker compose -f docker-compose.phase1.yml up -d postgres-permify permify

# Verify Permify is running
curl http://localhost:3477/healthz
```

## Service URLs Reference

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | - |
| Backend API | http://localhost:3100 | - |
| APISIX Gateway | http://localhost:9080 | - |
| APISIX Admin | http://localhost:9180 | API Key required |
| Prometheus | http://localhost:9090 | - |
| Grafana | http://localhost:3333 | admin/admin |
| Keycloak | http://localhost:8080 | admin/admin_pass |
| Kafka UI | http://localhost:8090 | - |

## Next Steps

### 1. Configure Monitoring

- Import Grafana dashboards
- Set up alerts in Prometheus
- Configure notification channels

See: [MONITORING_OBSERVABILITY_GUIDE.md](./MONITORING_OBSERVABILITY_GUIDE.md)

### 2. Load Test

```bash
# Install k6
brew install k6  # macOS
# or
sudo apt install k6  # Ubuntu

# Run load test
k6 run scripts/load-test.js
```

### 3. Production Deployment

- Change all default passwords
- Enable SSL/TLS
- Configure firewall rules
- Set up log aggregation
- Enable backup strategy

See: [PHASE26_DEPLOYMENT_GUIDE.md](./PHASE26_DEPLOYMENT_GUIDE.md)

### 4. Enable Advanced Features

- **Kafka Event Streaming**: Real-time event processing
- **Keycloak SSO**: Enterprise authentication
- **Permify Authorization**: Fine-grained access control
- **Dapr Service Mesh**: Microservices communication

See: [ENTERPRISE_ARCHITECTURE.md](./ENTERPRISE_ARCHITECTURE.md)

## Performance Benchmarks

Expected performance with enterprise infrastructure:

| Metric | Without Cache | With Redis Cache | Improvement |
|--------|---------------|------------------|-------------|
| Dashboard Load | 800ms | 150ms | 81% faster |
| Recent Activities | 600ms | 100ms | 83% faster |
| Statistics Query | 1200ms | 200ms | 83% faster |
| Cache Hit Rate | N/A | 75-85% | - |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   APISIX Gateway     │
              │   (Rate Limiting)    │
              └──────────┬───────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
  ┌──────────┐    ┌──────────┐   ┌──────────┐
  │  App     │    │  Redis   │   │ Postgres │
  │  Server  │◄───┤  Cache   │   │ Database │
  │          │    │          │   │          │
  └────┬─────┘    └──────────┘   └──────────┘
       │
       │ /metrics
       │
       ▼
  ┌──────────┐         ┌──────────┐
  │Prometheus│────────▶│ Grafana  │
  │ Metrics  │         │Dashboards│
  └──────────┘         └──────────┘
```

## Support

For detailed documentation:
- [Phase 26 Deployment Guide](./PHASE26_DEPLOYMENT_GUIDE.md)
- [Monitoring & Observability Guide](./MONITORING_OBSERVABILITY_GUIDE.md)
- [Enterprise Architecture](./ENTERPRISE_ARCHITECTURE.md)

For issues:
1. Check logs: `docker compose logs <service>`
2. Review troubleshooting section above
3. Consult service-specific documentation

## Success Checklist

- [ ] All services are running (`docker compose ps`)
- [ ] Redis responds to PING
- [ ] APISIX routes requests correctly
- [ ] Prometheus is scraping metrics
- [ ] Grafana can query Prometheus
- [ ] Application health check returns 200
- [ ] Cache hit rate > 70% after warmup
- [ ] Response time < 500ms (p95)
- [ ] No errors in application logs

🎉 **Congratulations!** Your enterprise infrastructure is ready!
