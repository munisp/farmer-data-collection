# Operations Runbook

## Service Management

### Starting Services

```bash
# Start all services
docker-compose -f docker-compose.ha.yml up -d

# Start specific service
docker-compose -f docker-compose.ha.yml up -d farmer-service

# View logs
docker-compose -f docker-compose.ha.yml logs -f service-name
```

### Stopping Services

```bash
# Stop all services
docker-compose -f docker-compose.ha.yml down

# Stop specific service
docker-compose -f docker-compose.ha.yml stop service-name
```

### Health Checks

```bash
# Check all services
docker-compose -f docker-compose.ha.yml ps

# Check specific service health
curl http://localhost:8081/health  # farmer-service
curl http://localhost:8082/health  # analytics-service
curl http://localhost:8083/health  # notification-service
```

## Database Operations

### Backup

```bash
# Manual backup
docker exec postgres-primary pg_dump -U postgres farmer_db > backup_$(date +%Y%m%d).sql

# Automated backup (add to crontab)
0 2 * * * docker exec postgres-primary pg_dump -U postgres farmer_db | gzip > /backups/farmer_db_$(date +\%Y\%m\%d).sql.gz
```

### Restore

```bash
# Restore from backup
docker exec -i postgres-primary psql -U postgres farmer_db < backup.sql
```

### Migrations

```bash
# Run migrations
cd client && pnpm db:push
```

## Redis Operations

### Check Cluster Status

```bash
# Check cluster info
docker exec redis-node-1 redis-cli cluster info

# Check cluster nodes
docker exec redis-node-1 redis-cli cluster nodes
```

### Clear Cache

```bash
# Flush all caches
docker exec redis-node-1 redis-cli FLUSHALL
```

## Kafka Operations

### List Topics

```bash
docker exec kafka-1 kafka-topics --bootstrap-server kafka-1:9092 --list
```

### Create Topic

```bash
docker exec kafka-1 kafka-topics --bootstrap-server kafka-1:9092 \
  --create --topic new-topic --partitions 3 --replication-factor 3
```

### View Messages

```bash
docker exec kafka-1 kafka-console-consumer --bootstrap-server kafka-1:9092 \
  --topic farmer.events --from-beginning --max-messages 10
```

## Monitoring

### Prometheus Queries

Access Prometheus at http://localhost:9090

**Key Queries:**

```promql
# Service uptime
up{job="farmer-service"}

# Request rate
rate(http_requests_total[5m])

# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# Response time (95th percentile)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

### Grafana Dashboards

Access Grafana at http://localhost:3001

**Pre-configured Dashboards:**
1. Infrastructure Health
2. Service Performance
3. Business Metrics

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker logs service-name

# Check resource usage
docker stats

# Restart service
docker-compose -f docker-compose.ha.yml restart service-name
```

### High CPU Usage

```bash
# Identify process
docker stats --no-stream

# Scale down if needed
docker-compose -f docker-compose.ha.yml up -d --scale service-name=2
```

### Database Connection Pool Exhausted

```bash
# Check PgBouncer stats
docker exec pgbouncer psql -h localhost -p 5432 -U postgres -c "SHOW POOLS;"

# Increase pool size
# Edit docker-compose.ha.yml:
#   DEFAULT_POOL_SIZE: 50
```

### Kafka Consumer Lag

```bash
# Check consumer group lag
docker exec kafka-1 kafka-consumer-groups --bootstrap-server kafka-1:9092 \
  --group analytics-consumer --describe
```

## Security

### Rotate Secrets

```bash
# Update .env file
nano .env

# Restart affected services
docker-compose -f docker-compose.ha.yml restart service-name
```

### View Audit Logs

```bash
# Check authentication logs
docker logs keycloak-1 | grep "LOGIN"

# Check API gateway logs
docker logs apisix | grep "401\|403"
```

## Scaling

### Horizontal Scaling

```bash
# Scale microservice
docker-compose -f docker-compose.ha.yml up -d --scale farmer-service=5

# Kubernetes scaling
kubectl scale deployment farmer-service --replicas=5 -n farmer-platform
```

### Vertical Scaling

```bash
# Update resource limits in docker-compose.ha.yml
services:
  farmer-service:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

## Incident Response

### Service Down

1. Check service logs: `docker logs service-name`
2. Check dependencies (DB, Redis, Kafka)
3. Restart service: `docker-compose restart service-name`
4. If persists, rollback to previous version

### Database Issues

1. Check PostgreSQL logs: `docker logs postgres-primary`
2. Check connections: `docker exec postgres-primary psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"`
3. Check disk space: `df -h`
4. If needed, restart: `docker-compose restart postgres-primary`

### High Load

1. Check metrics in Grafana
2. Identify bottleneck (CPU, memory, I/O)
3. Scale horizontally if possible
4. Optimize queries if database-related
5. Add caching if appropriate

## Maintenance Windows

### Planned Downtime

```bash
# 1. Notify users
# 2. Stop accepting new requests (update APISIX config)
# 3. Wait for in-flight requests to complete
# 4. Stop services
docker-compose -f docker-compose.ha.yml down

# 5. Perform maintenance
# 6. Start services
docker-compose -f docker-compose.ha.yml up -d

# 7. Verify health
# 8. Resume traffic
```

### Zero-Downtime Deployment

```bash
# 1. Deploy new version alongside old
docker-compose -f docker-compose.ha.yml up -d --scale farmer-service=6

# 2. Verify new instances healthy
curl http://localhost:8081/health

# 3. Update load balancer to route to new instances
# 4. Stop old instances
docker stop old-instance-ids

# 5. Clean up
docker-compose -f docker-compose.ha.yml up -d --scale farmer-service=3
```

## Contacts

- **On-Call Engineer**: oncall@farmer-platform.com
- **Database Admin**: dba@farmer-platform.com
- **Security Team**: security@farmer-platform.com
