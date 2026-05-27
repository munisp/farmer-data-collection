# Farmer Data Collection Platform - Monitoring & Operations Runbook

This runbook provides operational procedures for monitoring, troubleshooting, and maintaining the Farmer Data Collection Platform in production.

## Table of Contents

1. [Monitoring Overview](#monitoring-overview)
2. [Key Metrics](#key-metrics)
3. [Alert Response Procedures](#alert-response-procedures)
4. [Common Issues](#common-issues)
5. [Performance Tuning](#performance-tuning)
6. [Incident Response](#incident-response)
7. [Maintenance Procedures](#maintenance-procedures)

---

## Monitoring Overview

### Monitoring Stack Components

1. **Prometheus**: Metrics collection and storage
2. **Grafana**: Visualization and dashboards
3. **Jaeger**: Distributed tracing
4. **Application Logs**: Docker container logs

### Access Points

- **Prometheus**: `http://yourdomain.com:9090`
- **Grafana**: `http://yourdomain.com:3333` (admin/password)
- **Jaeger**: `http://yourdomain.com:16686`
- **Logs**: `docker-compose logs -f <service>`

---

## Key Metrics

### Service Health Metrics

| Metric | Description | Threshold | Action |
|--------|-------------|-----------|--------|
| `up` | Service availability (0=down, 1=up) | < 1 | Investigate service crash |
| `http_requests_total` | Total HTTP requests | N/A | Monitor trends |
| `http_request_duration_seconds` | Request latency (p95) | > 1s | Investigate slow queries |
| `process_cpu_seconds_total` | CPU usage | > 80% | Scale up or optimize |
| `process_resident_memory_bytes` | Memory usage | > 2GB | Check for memory leaks |

### Database Metrics

| Metric | Description | Threshold | Action |
|--------|-------------|-----------|--------|
| `pg_up` | PostgreSQL availability | < 1 | Restart database |
| `pg_stat_database_numbackends` | Active connections | > 80 | Investigate connection leaks |
| `pg_stat_statements_mean_exec_time` | Avg query time | > 1000ms | Optimize slow queries |
| `pg_database_size_bytes` | Database size | > 80% capacity | Archive old data |

### Cache Metrics

| Metric | Description | Threshold | Action |
|--------|-------------|-----------|--------|
| `redis_up` | Redis availability | < 1 | Restart Redis |
| `redis_keyspace_hits_total / (hits + misses)` | Cache hit rate | < 80% | Review cache strategy |
| `redis_memory_used_bytes / max_bytes` | Memory usage | > 90% | Increase memory or evict keys |

### User Journey Metrics

| Metric | Description | Threshold | Action |
|--------|-------------|-----------|--------|
| `user_journey_started_total` | Journeys started | N/A | Monitor trends |
| `user_journey_completed_total` | Journeys completed | N/A | Monitor trends |
| `user_journey_failed_total` | Journey failures | > 20% | Investigate errors |
| `user_journey_duration_seconds` | Journey duration (p95) | > 300s | Optimize flow |

### Messaging Channel Metrics

| Metric | Description | Threshold | Action |
|--------|-------------|-----------|--------|
| `ussd_sessions_total` | USSD sessions | N/A | Monitor trends |
| `ussd_errors_total` | USSD errors | > 10% | Check Africa's Talking |
| `sms_sent_total` | SMS sent | N/A | Monitor trends |
| `sms_errors_total` | SMS errors | > 10% | Check Africa's Talking |
| `whatsapp_messages_total` | WhatsApp messages | N/A | Monitor trends |
| `whatsapp_errors_total` | WhatsApp errors | > 10% | Check Africa's Talking |

---

## Alert Response Procedures

### Critical Alerts

#### ServiceDown

**Alert**: Service has been down for more than 2 minutes

**Response**:
1. Check service status:
   ```bash
   docker-compose ps
   ```

2. Check service logs:
   ```bash
   docker-compose logs --tail=100 <service_name>
   ```

3. Restart service:
   ```bash
   docker-compose restart <service_name>
   ```

4. If restart fails, check resource usage:
   ```bash
   docker stats
   free -h
   df -h
   ```

5. Escalate if issue persists after 2 restart attempts

#### PostgreSQLDown

**Alert**: PostgreSQL database is down

**Response**:
1. Check PostgreSQL status:
   ```bash
   docker-compose ps postgres
   docker logs farmer-postgres --tail=100
   ```

2. Check disk space:
   ```bash
   df -h
   ```

3. Restart PostgreSQL:
   ```bash
   docker-compose restart postgres
   ```

4. Verify connection:
   ```bash
   docker exec farmer-postgres psql -U postgres -d farmer_data -c "SELECT 1;"
   ```

5. If data corruption suspected, restore from backup

#### RedisDown

**Alert**: Redis cache is down

**Response**:
1. Check Redis status:
   ```bash
   docker-compose ps redis
   docker logs farmer-redis --tail=100
   ```

2. Restart Redis:
   ```bash
   docker-compose restart redis
   ```

3. Verify connection:
   ```bash
   docker exec farmer-redis redis-cli ping
   ```

4. Application should continue working (degraded performance)

### Warning Alerts

#### HighErrorRate

**Alert**: Error rate > 5% for 5 minutes

**Response**:
1. Check Grafana dashboard for error patterns

2. Check application logs:
   ```bash
   docker-compose logs --tail=200 backend | grep -i error
   ```

3. Check Jaeger for failed traces

4. Identify error source (database, external API, application logic)

5. If database-related, check slow queries:
   ```bash
   docker exec farmer-postgres psql -U postgres -d farmer_data -c \
     "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
   ```

6. If external API-related, check Africa's Talking status

#### HighResponseTime

**Alert**: p95 response time > 1 second for 10 minutes

**Response**:
1. Check Jaeger for slow traces

2. Identify bottleneck (database, cache, external API)

3. Check database connections:
   ```bash
   docker exec farmer-postgres psql -U postgres -d farmer_data -c \
     "SELECT count(*) FROM pg_stat_activity;"
   ```

4. Check cache hit rate in Grafana

5. Consider scaling if load is high

#### HighCPUUsage

**Alert**: CPU usage > 80% for 10 minutes

**Response**:
1. Check which service is consuming CPU:
   ```bash
   docker stats --no-stream
   ```

2. Check for infinite loops or runaway processes:
   ```bash
   docker top <service_name>
   ```

3. Review recent deployments or code changes

4. Scale horizontally if load is legitimate:
   ```bash
   docker-compose up -d --scale backend=3
   ```

#### HighMemoryUsage

**Alert**: Memory usage > 2GB for 10 minutes

**Response**:
1. Check memory usage:
   ```bash
   docker stats --no-stream
   ```

2. Check for memory leaks:
   ```bash
   docker exec <service_name> node --expose-gc -e "global.gc(); console.log(process.memoryUsage());"
   ```

3. Restart service if memory leak suspected:
   ```bash
   docker-compose restart <service_name>
   ```

4. Increase memory limit if needed:
   ```yaml
   services:
     backend:
       deploy:
         resources:
           limits:
             memory: 4G
   ```

#### HighDatabaseConnections

**Alert**: Active database connections > 80

**Response**:
1. Check active connections:
   ```bash
   docker exec farmer-postgres psql -U postgres -d farmer_data -c \
     "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
   ```

2. Check for connection leaks in application

3. Kill idle connections:
   ```bash
   docker exec farmer-postgres psql -U postgres -d farmer_data -c \
     "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < now() - interval '10 minutes';"
   ```

4. Increase connection pool size if needed

#### LowCacheHitRate

**Alert**: Redis cache hit rate < 80%

**Response**:
1. Check cache hit rate:
   ```bash
   docker exec farmer-redis redis-cli info stats | grep keyspace
   ```

2. Review cache strategy and TTL settings

3. Check if cache is being properly warmed up

4. Consider increasing cache size

#### HighJourneyFailureRate

**Alert**: User journey failure rate > 20%

**Response**:
1. Check Grafana for journey failure patterns

2. Check logs for journey errors:
   ```bash
   docker-compose logs --tail=200 backend | grep -i "journey.*fail"
   ```

3. Check Jaeger for failed journey traces

4. Identify failing step (registration, data entry, sync)

5. Check Africa's Talking status if messaging-related

#### HighUSSDErrorRate / HighSMSErrorRate / HighWhatsAppErrorRate

**Alert**: Messaging channel error rate > 10%

**Response**:
1. Check Africa's Talking dashboard for service status

2. Check API credentials:
   ```bash
   docker exec farmer-backend env | grep AFRICAS_TALKING
   ```

3. Check webhook logs:
   ```bash
   docker-compose logs --tail=200 backend | grep -i "ussd\|sms\|whatsapp"
   ```

4. Verify webhook URLs are accessible:
   ```bash
   curl https://yourdomain.com/api/trpc/africasTalking.ussdWebhook
   ```

5. Contact Africa's Talking support if issue persists

---

## Common Issues

### Issue: Database Connection Pool Exhausted

**Symptoms**:
- Error: "sorry, too many clients already"
- Slow response times
- Connection timeouts

**Solution**:
```bash
# Check current connections
docker exec farmer-postgres psql -U postgres -d farmer_data -c \
  "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Kill idle connections
docker exec farmer-postgres psql -U postgres -d farmer_data -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < now() - interval '5 minutes';"

# Increase max_connections in PostgreSQL
docker exec farmer-postgres psql -U postgres -c "ALTER SYSTEM SET max_connections = 200;"
docker-compose restart postgres
```

### Issue: Redis Memory Full

**Symptoms**:
- Error: "OOM command not allowed when used memory > 'maxmemory'"
- Cache misses increase
- Slow response times

**Solution**:
```bash
# Check memory usage
docker exec farmer-redis redis-cli info memory

# Flush old keys
docker exec farmer-redis redis-cli --scan --pattern "cache:*" | head -1000 | xargs docker exec -i farmer-redis redis-cli del

# Increase memory limit
# Edit docker-compose.production.yml:
redis:
  command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
```

### Issue: Slow Database Queries

**Symptoms**:
- High p95 response time
- Database CPU usage high
- Slow dashboard loading

**Solution**:
```bash
# Identify slow queries
docker exec farmer-postgres psql -U postgres -d farmer_data -c \
  "SELECT query, mean_exec_time, calls FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# Add missing indexes
docker exec farmer-postgres psql -U postgres -d farmer_data -c \
  "CREATE INDEX idx_farmers_user_id ON farmers(user_id);"

# Analyze tables
docker exec farmer-postgres psql -U postgres -d farmer_data -c "VACUUM ANALYZE;"
```

### Issue: Africa's Talking Webhook Not Receiving Requests

**Symptoms**:
- USSD menu not responding
- SMS commands not working
- WhatsApp messages not processed

**Solution**:
```bash
# Verify webhook URL is publicly accessible
curl https://yourdomain.com/api/trpc/africasTalking.ussdWebhook

# Check Nginx logs
docker logs farmer-nginx --tail=100

# Check backend logs
docker-compose logs --tail=100 backend | grep africasTalking

# Verify SSL certificate is valid
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com

# Test webhook locally with ngrok
ngrok http 3000
# Update Africa's Talking webhook URL temporarily for testing
```

---

## Performance Tuning

### Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_farmers_phone ON farmers(phone_number);
CREATE INDEX idx_harvests_date ON harvests(harvest_date);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_farms_farmer ON farms(farmer_id);

-- Analyze query performance
EXPLAIN ANALYZE SELECT * FROM farmers WHERE user_id = 1;

-- Update statistics
VACUUM ANALYZE;
```

### Redis Optimization

```bash
# Configure eviction policy
docker exec farmer-redis redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Set appropriate TTL for cached data
# In application code:
# - Dashboard stats: 5 minutes
# - User sessions: 1 hour
# - Weather data: 30 minutes
```

### Application Optimization

```javascript
// Use database connection pooling
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Implement request debouncing
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Use pagination for large datasets
const limit = 50;
const offset = (page - 1) * limit;
const results = await db.query('SELECT * FROM farmers LIMIT $1 OFFSET $2', [limit, offset]);
```

---

## Incident Response

### Severity Levels

- **P0 (Critical)**: Complete service outage, data loss
- **P1 (High)**: Major functionality broken, significant user impact
- **P2 (Medium)**: Partial functionality broken, some user impact
- **P3 (Low)**: Minor issue, minimal user impact

### Response Timeline

| Severity | Initial Response | Resolution Target |
|----------|------------------|-------------------|
| P0 | 15 minutes | 2 hours |
| P1 | 30 minutes | 4 hours |
| P2 | 2 hours | 24 hours |
| P3 | 24 hours | 1 week |

### Incident Response Steps

1. **Acknowledge**: Acknowledge the incident in monitoring system
2. **Assess**: Determine severity and impact
3. **Communicate**: Notify stakeholders
4. **Investigate**: Use logs, metrics, and traces to identify root cause
5. **Mitigate**: Implement temporary fix to restore service
6. **Resolve**: Implement permanent fix
7. **Document**: Write post-mortem report
8. **Follow-up**: Implement preventive measures

---

## Maintenance Procedures

### Weekly Maintenance

```bash
# Check disk usage
df -h

# Check database size
docker exec farmer-postgres psql -U postgres -d farmer_data -c \
  "SELECT pg_size_pretty(pg_database_size('farmer_data'));"

# Vacuum database
docker exec farmer-postgres psql -U postgres -d farmer_data -c "VACUUM ANALYZE;"

# Check for failed jobs
docker-compose logs --since 7d | grep -i error | wc -l

# Review Grafana dashboards for anomalies
```

### Monthly Maintenance

```bash
# Update Docker images
docker-compose pull
docker-compose up -d

# Rotate logs
docker-compose logs --no-color > logs/$(date +%Y%m).log
docker-compose logs --no-color --tail=0 -f &

# Review and archive old data
docker exec farmer-postgres psql -U postgres -d farmer_data -c \
  "DELETE FROM harvests WHERE harvest_date < NOW() - INTERVAL '2 years';"

# Test backup restore procedure
```

### Quarterly Maintenance

```bash
# Security audit
docker scan farmer-backend:latest

# Performance review
# - Review slow queries
# - Review cache hit rates
# - Review error rates
# - Review user journey completion rates

# Capacity planning
# - Review resource usage trends
# - Plan for scaling
# - Review cost optimization opportunities
```

---

**Last Updated**: November 2024
