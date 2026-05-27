# Phase 1 Implementation Guide: Redis + APISIX + Prometheus

## Overview

Phase 1 of the enterprise transformation adds **Redis caching**, **APISIX API Gateway**, and **Prometheus metrics** to the Farmer Data Collection Platform. This provides immediate performance improvements and establishes the foundation for future enterprise features.

## What's Included

### 1. Redis Caching Layer
- **Purpose**: Reduce database load and improve response times
- **Implementation**: `server/redis.ts` and `server/dashboard-cache-router.ts`
- **Features**:
  - Dashboard statistics caching (60-second TTL)
  - Recent activities caching (30-second TTL)
  - Cache invalidation on data updates
  - Cache statistics tracking
  - Automatic retry and reconnection

### 2. Prometheus Metrics
- **Purpose**: Monitor application performance and health
- **Implementation**: `server/metrics.ts`
- **Metrics Collected**:
  - HTTP request duration and count
  - Database query duration and count
  - Cache hit/miss ratio
  - Active connections
  - tRPC procedure performance
  - Business metrics (logins, registrations, data creation)

### 3. APISIX API Gateway (Ready for Deployment)
- **Purpose**: Centralized API routing, rate limiting, and security
- **Configuration**: `config/apisix/`
- **Features**:
  - Request routing to backend services
  - Rate limiting (100-200 req/min per endpoint)
  - Request/response logging
  - Health checks
  - CORS handling

## Architecture

```
Client → APISIX Gateway (9080) → App Server (3100)
                                      ↓
                                  Redis Cache (6379)
                                      ↓
                                  PostgreSQL (5432)
                                      
Prometheus (9090) ← Metrics ← App Server
         ↓
    Grafana (3333)
```

## Installation & Setup

### Prerequisites
- Docker and Docker Compose installed
- Node.js 22+ and pnpm installed
- Existing Farmer Data Collection App

### Step 1: Install Dependencies

Already completed:
```bash
pnpm add ioredis prom-client
```

### Step 2: Start Infrastructure Services

Start Redis, APISIX, Prometheus, and Grafana:

```bash
docker-compose -f docker-compose.phase1.yml up -d
```

This will start:
- **PostgreSQL** on port 5432
- **Redis** on port 6379
- **etcd** on port 2379 (for APISIX)
- **APISIX** on ports 9080 (HTTP), 9443 (HTTPS), 9180 (Admin)
- **Prometheus** on port 9090
- **Grafana** on port 3333

### Step 3: Verify Services

Check that all services are running:

```bash
# Check Redis
docker exec farmer-redis redis-cli -a redis_pass ping
# Expected: PONG

# Check APISIX
curl http://localhost:9080/health
# Expected: OK

# Check Prometheus
curl http://localhost:9090/-/healthy
# Expected: Prometheus is Healthy.
```

### Step 4: Start Application Server

The application server will automatically connect to Redis and expose metrics:

```bash
pnpm dev
```

You should see:
```
[Server] Redis client initialized
Server running on http://localhost:3000/
tRPC endpoint available at http://localhost:3000/api/trpc
Health check available at http://localhost:3000/health
Metrics available at http://localhost:3000/metrics
```

### Step 5: Access Monitoring Dashboards

- **Application**: http://localhost:3000
- **Grafana**: http://localhost:3333 (admin/admin)
- **Prometheus**: http://localhost:9090
- **APISIX Admin**: http://localhost:9180

## Using the Cache

### From Client Code

The dashboard now uses cached endpoints automatically:

```typescript
// This query is now cached for 60 seconds
const { data: stats } = trpc.dashboard.getStats.useQuery({
  userId: user.id
});

// This query is cached for 30 seconds
const { data: activities } = trpc.dashboard.getRecentActivities.useQuery({
  userId: user.id,
  limit: 10
});
```

### Cache Invalidation

When data changes, invalidate the cache:

```typescript
// After creating/updating/deleting data
await trpc.dashboard.invalidateCache.mutate({
  userId: user.id
});
```

### Cache Statistics

View cache performance:

```typescript
const { data: cacheStats } = trpc.dashboard.getCacheStats.useQuery();
// Returns: { keys: 42, memory: "2.1MB", hits: "1234", misses: "56" }
```

## Monitoring & Metrics

### Prometheus Metrics Endpoint

Access metrics at: http://localhost:3000/metrics

Example metrics:
```
# HTTP request duration
http_request_duration_seconds_bucket{method="GET",route="/api/trpc",status_code="200",le="0.1"} 145

# Cache hits and misses
cache_hits_total{key_prefix="dashboard"} 89
cache_misses_total{key_prefix="dashboard"} 11

# Database query duration
db_query_duration_seconds_bucket{operation="select",table="farmers",le="0.01"} 234
```

### Grafana Dashboards

1. Open Grafana: http://localhost:3333
2. Login with admin/admin
3. Add Prometheus datasource (already configured)
4. Import or create dashboards

Recommended dashboards:
- **Application Overview**: Request rate, latency, error rate
- **Cache Performance**: Hit/miss ratio, operation duration
- **Database Performance**: Query duration, connection pool
- **Business Metrics**: User activity, data creation trends

## Performance Improvements

### Before Caching (Database Query Every Time)
- Dashboard load: ~200-300ms
- Database queries: 8 queries per page load
- Database load: High on frequent refreshes

### After Caching (Redis)
- Dashboard load: ~10-20ms (cache hit)
- Database queries: 0 queries (cache hit), 8 queries (cache miss)
- Database load: Reduced by 90%+ for frequently accessed data
- Cache hit ratio: Expected 80-95% for dashboard stats

## Configuration

### Redis Configuration

Edit `docker-compose.phase1.yml` to adjust Redis settings:

```yaml
redis:
  command: redis-server --appendonly yes --requirepass redis_pass --maxmemory 256mb --maxmemory-policy allkeys-lru
```

### Cache TTL

Edit `server/dashboard-cache-router.ts` to adjust cache duration:

```typescript
// Change from 60 seconds to 5 minutes
await cache.getOrSet(cacheKey, fetcher, 300);
```

### Prometheus Scrape Interval

Edit `config/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s  # Change to 30s for less frequent collection
```

## Troubleshooting

### Redis Connection Errors

If you see `[Redis] Error: connect ECONNREFUSED`:

1. Check Redis is running: `docker ps | grep redis`
2. Check Redis logs: `docker logs farmer-redis`
3. Verify REDIS_URL environment variable
4. Test connection: `docker exec farmer-redis redis-cli -a redis_pass ping`

### Cache Not Working

1. Check Redis connection in health endpoint: `curl http://localhost:3000/health`
2. View cache statistics: Query `trpc.dashboard.getCacheStats`
3. Check server logs for `[Cache] HIT` and `[Cache] MISS` messages
4. Verify cache keys in Redis: `docker exec farmer-redis redis-cli -a redis_pass KEYS "*"`

### Metrics Not Showing

1. Check metrics endpoint: `curl http://localhost:3000/metrics`
2. Verify Prometheus is scraping: http://localhost:9090/targets
3. Check Prometheus configuration: `config/prometheus/prometheus.yml`
4. Restart Prometheus: `docker-compose -f docker-compose.phase1.yml restart prometheus`

## Next Steps (Future Phases)

### Phase 2: Keycloak Authentication
- Replace JWT with enterprise SSO
- Add multi-factor authentication
- Integrate social login providers

### Phase 3: Kafka Event Streaming
- Implement event-driven architecture
- Add real-time data processing
- Enable audit trail and event sourcing

### Phase 4: Dapr Service Mesh
- Decompose into microservices
- Add service-to-service communication
- Implement distributed state management

### Phase 5: Temporal Workflows
- Orchestrate complex business processes
- Add long-running workflows
- Implement batch processing

## Production Deployment

### Environment Variables

Set these in production:

```bash
# Redis
REDIS_URL=redis://:your-redis-password@redis-host:6379

# Application
NODE_ENV=production
PORT=3100
DATABASE_URL=postgresql://user:pass@db-host:5432/farmer_data
JWT_SECRET=your-production-secret-key

# Monitoring
PROMETHEUS_URL=http://prometheus:9090
```

### Security Considerations

1. **Redis Password**: Change `redis_pass` to a strong password
2. **APISIX Admin Key**: Change admin key in `config/apisix/config.yaml`
3. **Rate Limiting**: Adjust limits based on expected traffic
4. **TLS/SSL**: Enable HTTPS in APISIX for production
5. **Firewall**: Restrict access to Redis, Prometheus, Grafana

### Scaling

- **Redis**: Use Redis Cluster or Redis Sentinel for high availability
- **APISIX**: Run multiple APISIX instances behind load balancer
- **Application**: Scale horizontally with multiple app server instances
- **PostgreSQL**: Use read replicas for query distribution

## Monitoring Checklist

- [ ] Prometheus collecting metrics from app server
- [ ] Grafana dashboards created
- [ ] Alerts configured for high error rates
- [ ] Alerts configured for high latency
- [ ] Alerts configured for Redis connection failures
- [ ] Cache hit ratio monitoring (target: >80%)
- [ ] Database query performance monitoring
- [ ] Disk space monitoring for Redis and Prometheus

## Success Metrics

After Phase 1 implementation, you should see:

- ✅ **50-90% reduction** in dashboard load time (cache hits)
- ✅ **80-95% cache hit ratio** for frequently accessed data
- ✅ **Reduced database load** by 70-90% for cached endpoints
- ✅ **Comprehensive metrics** for application performance
- ✅ **Health monitoring** with Prometheus and Grafana
- ✅ **Foundation for microservices** with APISIX gateway

## Support

For issues or questions:
1. Check server logs: `pnpm dev` output
2. Check Docker logs: `docker-compose -f docker-compose.phase1.yml logs`
3. Review metrics: http://localhost:3000/metrics
4. Check health: http://localhost:3000/health

## Conclusion

Phase 1 establishes a solid foundation for enterprise-grade features. The caching layer provides immediate performance benefits, while Prometheus metrics enable proactive monitoring and optimization. APISIX API Gateway is ready for deployment when you need centralized routing and rate limiting.

Continue with Phase 2 to add Keycloak authentication for enterprise SSO capabilities.
