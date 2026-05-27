# Phase 26: Enterprise Infrastructure Deployment Guide

## Overview

This guide covers the deployment and testing of the enterprise infrastructure components implemented in Phase 26:
- **Redis** for distributed caching
- **APISIX** API Gateway for routing and rate limiting
- **Prometheus** for metrics collection
- **Grafana** for visualization
- **Keycloak** for enterprise authentication
- **Kafka** for event streaming
- **Permify** for fine-grained authorization

## Prerequisites

### System Requirements
- Docker Engine 24.0+ and Docker Compose 2.20+
- Minimum 8GB RAM (16GB recommended)
- 50GB available disk space
- Ubuntu 22.04 LTS or similar Linux distribution

### Network Requirements
- Ports to be available:
  - `3000`: Frontend application
  - `3100`: Backend API server
  - `5432`: PostgreSQL (main database)
  - `5433`: PostgreSQL (Keycloak)
  - `5434`: PostgreSQL (Permify)
  - `6379`: Redis cache
  - `8080`: Keycloak admin console
  - `9080`: APISIX HTTP gateway
  - `9090`: Prometheus metrics
  - `9092-9093`: Kafka brokers
  - `3333`: Grafana dashboards

## Phase 1: Core Infrastructure Setup

### Step 1: Environment Configuration

Create `.env.production` file in the project root:

```bash
# Database
DATABASE_URL=postgresql://farmer_user:farmer_pass@postgres:5432/farmer_data

# Redis
REDIS_URL=redis://:redis_pass@redis:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
KEYCLOAK_REALM=farmer-realm
KEYCLOAK_CLIENT_ID=farmer-api
KEYCLOAK_CLIENT_SECRET=your-keycloak-client-secret
KEYCLOAK_AUTH_SERVER_URL=http://keycloak:8080

# Application
NODE_ENV=production
PORT=3100
VITE_API_URL=http://localhost:9080/api

# Monitoring
PROMETHEUS_ENABLED=true
METRICS_PORT=9090

# Kafka (for Phase 3)
KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=farmer-app

# Permify (for Phase 4)
PERMIFY_GRPC_URL=permify:3476
PERMIFY_HTTP_URL=http://permify:3477
```

### Step 2: Start Core Services

Start Redis, APISIX, and Prometheus:

```bash
cd /path/to/farmer-data-collection

# Start Phase 1 services
docker compose -f docker-compose.phase1.yml up -d postgres redis etcd apisix prometheus grafana

# Wait for services to be healthy
docker compose -f docker-compose.phase1.yml ps

# Check logs
docker compose -f docker-compose.phase1.yml logs -f redis apisix prometheus
```

### Step 3: Verify Service Health

```bash
# Check Redis
docker exec farmer-redis redis-cli -a redis_pass ping
# Expected: PONG

# Check APISIX
curl http://localhost:9080/health
# Expected: {"status":"healthy"}

# Check Prometheus
curl http://localhost:9090/-/healthy
# Expected: Prometheus is Healthy.

# Check Grafana
curl http://localhost:3333/api/health
# Expected: {"database":"ok","version":"..."}
```

## Phase 2: Application Deployment

### Step 1: Build Application Images

```bash
# Build backend server
docker build -f Dockerfile.server -t farmer-app-server:latest .

# Build frontend (optional - can run in dev mode)
docker build -f Dockerfile.frontend -t farmer-frontend:latest .
```

### Step 2: Start Application Server

```bash
# Start app server
docker compose -f docker-compose.phase1.yml up -d app-server

# Check logs
docker compose -f docker-compose.phase1.yml logs -f app-server

# Verify health
curl http://localhost:3100/health
# Expected: {"status":"healthy","timestamp":"..."}
```

### Step 3: Verify Redis Caching

```bash
# Test cache endpoint
curl http://localhost:3100/api/cache/stats
# Expected: {"keys":0,"memory":"...","hits":"0","misses":"0"}

# Make a dashboard request (should cache)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3100/api/trpc/dashboard.getStatistics

# Check cache again
curl http://localhost:3100/api/cache/stats
# Expected: keys > 0, hits or misses incremented
```

## Phase 3: API Gateway Configuration

### Step 1: Configure APISIX Routes

APISIX configuration is already in `config/apisix/apisix.yaml`. Verify routes:

```bash
# List all routes
curl http://localhost:9180/apisix/admin/routes \
  -H "X-API-KEY: edd1c9f034335f136f87ad84b625c8f1"

# Test route through gateway
curl http://localhost:9080/api/health
# Should route to app-server:3100/health
```

### Step 2: Test Rate Limiting

```bash
# Create a test script to hit rate limits
cat > test-rate-limit.sh << 'EOF'
#!/bin/bash
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9080/api/health
  sleep 0.1
done
EOF

chmod +x test-rate-limit.sh
./test-rate-limit.sh

# Should see 200 responses followed by 429 (Too Many Requests)
```

### Step 3: Verify Request Logging

```bash
# Check APISIX logs for request tracking
docker compose -f docker-compose.phase1.yml logs apisix | grep "access log"

# Should see structured logs with:
# - Request ID
# - Method and path
# - Response status
# - Duration
# - Client IP
```

## Phase 4: Monitoring Setup

### Step 1: Access Grafana

1. Open browser to `http://localhost:3333`
2. Login with `admin` / `admin`
3. Add Prometheus data source:
   - URL: `http://prometheus:9090`
   - Access: Server (default)
   - Click "Save & Test"

### Step 2: Import Dashboards

Create custom dashboard with these metrics:

**Application Metrics:**
- HTTP request rate: `rate(http_requests_total[5m])`
- HTTP request duration: `histogram_quantile(0.95, http_request_duration_seconds_bucket)`
- Error rate: `rate(http_requests_total{status=~"5.."}[5m])`

**Cache Metrics:**
- Cache hit rate: `cache_hits_total / (cache_hits_total + cache_misses_total)`
- Cache operations: `rate(cache_operations_total[5m])`

**Database Metrics:**
- Query duration: `histogram_quantile(0.95, db_query_duration_seconds_bucket)`
- Active connections: `db_connections_active`

**Business Metrics:**
- User registrations: `rate(user_registrations_total[1h])`
- User logins: `rate(user_logins_total[1h])`
- Data creation rate: `rate(data_created_total[5m])`

### Step 3: Set Up Alerts

Create alert rules in Prometheus (`config/prometheus/alerts.yml`):

```yaml
groups:
  - name: application
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, http_request_duration_seconds_bucket) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Response time above 2 seconds"
          
      - alert: LowCacheHitRate
        expr: cache_hits_total / (cache_hits_total + cache_misses_total) < 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Cache hit rate below 50%"
```

## Phase 5: Keycloak Authentication (Optional)

### Step 1: Start Keycloak

```bash
docker compose -f docker-compose.phase1.yml up -d postgres-keycloak keycloak

# Wait for Keycloak to start (takes 1-2 minutes)
docker compose -f docker-compose.phase1.yml logs -f keycloak
```

### Step 2: Run Keycloak Setup Script

```bash
# Install dependencies
cd scripts
pnpm install

# Run setup script
node setup-keycloak.mjs

# This creates:
# - farmer-realm
# - farmer-web client (frontend)
# - farmer-api client (backend)
# - Admin user
```

### Step 3: Verify Keycloak Configuration

1. Access Keycloak admin console: `http://localhost:8080`
2. Login with `admin` / `admin_pass`
3. Select `farmer-realm` from dropdown
4. Verify clients exist: `farmer-web`, `farmer-api`
5. Check realm settings are configured

### Step 4: Update Application Configuration

Add Keycloak environment variables:

```bash
KEYCLOAK_REALM=farmer-realm
KEYCLOAK_CLIENT_ID=farmer-api
KEYCLOAK_CLIENT_SECRET=<from-keycloak-console>
KEYCLOAK_AUTH_SERVER_URL=http://keycloak:8080
```

Restart application:

```bash
docker compose -f docker-compose.phase1.yml restart app-server
```

## Testing & Validation

### Test 1: Cache Performance

```bash
# Run cache performance test
node scripts/test-cache-performance.mjs

# Expected results:
# - First request: Cache MISS (slower)
# - Subsequent requests: Cache HIT (faster)
# - Performance improvement: 50-90% faster
```

### Test 2: Rate Limiting

```bash
# Run rate limit test
node scripts/test-rate-limiting.mjs

# Expected results:
# - First 100 requests: 200 OK
# - Requests 101-200: 429 Too Many Requests
# - After 1 minute: Rate limit resets
```

### Test 3: Metrics Collection

```bash
# Generate load
node scripts/generate-load.mjs

# Query Prometheus metrics
curl http://localhost:9090/api/v1/query?query=http_requests_total

# Verify metrics are being collected
```

### Test 4: End-to-End Flow

```bash
# Run comprehensive E2E test
node scripts/test-enterprise-e2e.mjs

# Tests:
# 1. User registration through APISIX
# 2. User login with JWT
# 3. Dashboard data fetch (cached)
# 4. Cache invalidation
# 5. Metrics verification
```

## Troubleshooting

### Redis Connection Issues

```bash
# Check Redis is running
docker compose -f docker-compose.phase1.yml ps redis

# Test connection
docker exec farmer-redis redis-cli -a redis_pass ping

# Check logs
docker compose -f docker-compose.phase1.yml logs redis

# Common fixes:
# - Verify REDIS_URL in .env
# - Check firewall rules
# - Ensure password is correct
```

### APISIX Routing Issues

```bash
# Check APISIX logs
docker compose -f docker-compose.phase1.yml logs apisix

# Verify etcd is healthy
docker compose -f docker-compose.phase1.yml ps etcd

# Test direct app server connection
curl http://localhost:3100/health

# Test through APISIX
curl http://localhost:9080/api/health

# If routing fails:
# - Check config/apisix/apisix.yaml
# - Verify upstream service is running
# - Check network connectivity
```

### Prometheus Scraping Issues

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Verify metrics endpoint
curl http://localhost:3100/metrics

# Check Prometheus logs
docker compose -f docker-compose.phase1.yml logs prometheus

# Common fixes:
# - Verify scrape configuration
# - Check network connectivity
# - Ensure metrics endpoint is exposed
```

### Keycloak Issues

```bash
# Check Keycloak logs
docker compose -f docker-compose.phase1.yml logs keycloak

# Verify database connection
docker compose -f docker-compose.phase1.yml ps postgres-keycloak

# Test Keycloak health
curl http://localhost:8080/health/ready

# Common fixes:
# - Wait for full startup (1-2 minutes)
# - Check database credentials
# - Verify realm configuration
```

## Performance Optimization

### Redis Optimization

```bash
# Monitor Redis memory usage
docker exec farmer-redis redis-cli -a redis_pass INFO memory

# Set memory limit (in redis.conf or via command)
docker exec farmer-redis redis-cli -a redis_pass CONFIG SET maxmemory 2gb
docker exec farmer-redis redis-cli -a redis_pass CONFIG SET maxmemory-policy allkeys-lru

# Monitor cache hit rate
docker exec farmer-redis redis-cli -a redis_pass INFO stats | grep keyspace
```

### APISIX Optimization

```yaml
# In config/apisix/config.yaml
nginx_config:
  worker_processes: auto
  worker_connections: 10620
  
# Enable response caching
plugins:
  - proxy-cache
  - response-rewrite
  
# Optimize upstream connections
upstream:
  keepalive: 320
  keepalive_timeout: 60s
```

### Application Optimization

```typescript
// Increase cache TTL for stable data
const cache = new CacheService(600); // 10 minutes

// Use cache warming
async function warmCache() {
  await cache.set('dashboard:stats', await fetchStats(), 300);
  await cache.set('recent:activities', await fetchActivities(), 180);
}

// Implement cache invalidation on data changes
async function createFarmer(data: FarmerInput) {
  const farmer = await db.insert(farmers).values(data);
  await cache.delPattern('dashboard:*');
  return farmer;
}
```

## Monitoring Checklist

- [ ] All services are healthy
- [ ] Redis cache hit rate > 70%
- [ ] API response time p95 < 500ms
- [ ] Error rate < 1%
- [ ] Rate limiting is working
- [ ] Prometheus is scraping metrics
- [ ] Grafana dashboards are displaying data
- [ ] Keycloak authentication is working (if enabled)
- [ ] Logs are being collected
- [ ] Alerts are configured

## Next Steps

### Phase 3: Event Streaming (Kafka)
- Enable Kafka services in docker-compose
- Implement event producers
- Set up event consumers
- Configure event-driven workflows

### Phase 4: Authorization (Permify)
- Enable Permify service
- Define authorization schema
- Implement permission checks
- Set up role-based access control

### Phase 5: Service Mesh (Dapr)
- Enable Dapr services
- Configure service-to-service communication
- Implement state management
- Set up pub/sub messaging

## Security Considerations

### Production Deployment

1. **Change all default passwords:**
   ```bash
   # Redis
   REDIS_PASSWORD=<strong-random-password>
   
   # PostgreSQL
   POSTGRES_PASSWORD=<strong-random-password>
   
   # Keycloak
   KEYCLOAK_ADMIN_PASSWORD=<strong-random-password>
   ```

2. **Enable SSL/TLS:**
   - Configure APISIX with SSL certificates
   - Use HTTPS for all external communication
   - Enable Redis SSL/TLS

3. **Secure API Gateway:**
   - Change APISIX admin API key
   - Restrict admin API access
   - Enable authentication plugins

4. **Network Security:**
   - Use internal Docker networks
   - Expose only necessary ports
   - Configure firewall rules

5. **Monitoring & Logging:**
   - Enable audit logging
   - Set up log aggregation
   - Configure security alerts

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review service logs
3. Consult individual service documentation
4. Contact development team

## Appendix

### Service URLs (Development)

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
| Redis | localhost:6379 | Password: redis_pass |

### Useful Commands

```bash
# View all services
docker compose -f docker-compose.phase1.yml ps

# View logs for specific service
docker compose -f docker-compose.phase1.yml logs -f <service-name>

# Restart service
docker compose -f docker-compose.phase1.yml restart <service-name>

# Stop all services
docker compose -f docker-compose.phase1.yml down

# Stop and remove volumes
docker compose -f docker-compose.phase1.yml down -v

# Scale service
docker compose -f docker-compose.phase1.yml up -d --scale app-server=3
```
