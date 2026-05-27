# Incident Response Playbook

Comprehensive runbooks for common failure scenarios in the Farmer Data Collection Platform.

## Table of Contents

1. [Overview](#overview)
2. [Incident Classification](#incident-classification)
3. [Escalation Procedures](#escalation-procedures)
4. [Playbooks](#playbooks)
   - [Kafka Lag Spikes](#playbook-1-kafka-lag-spikes)
   - [Redis OOM Errors](#playbook-2-redis-oom-errors)
   - [Service Crashes](#playbook-3-service-crashes)
   - [Database Connection Issues](#playbook-4-database-connection-issues)
   - [High API Latency](#playbook-5-high-api-latency)
   - [ML Service Failures](#playbook-6-ml-service-failures)
   - [WebSocket Connection Drops](#playbook-7-websocket-connection-drops)
   - [Disk Space Exhaustion](#playbook-8-disk-space-exhaustion)
5. [Automated Remediation](#automated-remediation)
6. [Post-Incident Review](#post-incident-review)

## Overview

This playbook provides step-by-step procedures for diagnosing and resolving common incidents. Each playbook includes:

- **Symptoms**: How to identify the issue
- **Impact**: What users experience
- **Diagnosis**: Steps to confirm the root cause
- **Resolution**: Actions to fix the issue
- **Prevention**: How to avoid future occurrences

## Incident Classification

### Severity Levels

| Level | Description | Response Time | Escalation |
|-------|-------------|---------------|------------|
| **P0 - Critical** | Complete service outage, data loss | Immediate | CTO, Engineering Lead |
| **P1 - High** | Major feature unavailable, severe degradation | 15 minutes | Engineering Lead |
| **P2 - Medium** | Partial degradation, workaround available | 1 hour | On-call Engineer |
| **P3 - Low** | Minor issue, no user impact | 4 hours | Team backlog |

### Impact Assessment

- **Users Affected**: % of total users experiencing the issue
- **Revenue Impact**: Estimated financial loss per hour
- **Data Integrity**: Risk of data corruption or loss
- **Security**: Potential security vulnerability

## Escalation Procedures

### On-Call Rotation

```
Primary On-Call → Engineering Lead → CTO → CEO
```

### Communication Channels

1. **Internal**: Slack #incidents channel
2. **External**: Status page (status.farmerplatform.com)
3. **Customers**: Email notifications for P0/P1 incidents

### Escalation Triggers

- Issue not resolved within SLA
- Multiple services affected
- Data loss or security breach
- Customer escalation

---

## Playbook 1: Kafka Lag Spikes

### Symptoms

- Grafana alert: "High Kafka Consumer Lag"
- Consumer lag > 1000 messages
- Delayed data processing
- Users report stale data

### Impact

- **Severity**: P1-P2
- **Users Affected**: All users relying on real-time data
- **Revenue Impact**: Medium (delayed marketplace updates)

### Diagnosis

```bash
# Check Kafka consumer lag
./scripts/remediation/check-kafka-lag.sh

# View Kafka metrics in Grafana
# Dashboard: Middleware Overview → Kafka Consumer Lag panel

# Check consumer group status
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group farmer-platform-consumers \
  --describe

# Check broker health
kafka-broker-api-versions --bootstrap-server localhost:9092
```

### Resolution

#### Step 1: Identify Slow Consumers

```bash
# List all consumer groups
kafka-consumer-groups --bootstrap-server localhost:9092 --list

# Find lagging partitions
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group farmer-platform-consumers \
  --describe | grep -v "CURRENT-OFFSET = OFFSET"
```

#### Step 2: Scale Consumers

```bash
# Increase consumer instances
./scripts/remediation/scale-kafka-consumers.sh --instances 5

# Or manually start additional consumers
cd services/kafka-consumers
npm run start:consumer -- --partition 0 &
npm run start:consumer -- --partition 1 &
```

#### Step 3: Reset Offsets (if necessary)

```bash
# Reset to latest (skip old messages)
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group farmer-platform-consumers \
  --reset-offsets --to-latest \
  --topic data-collection --execute

# Or reset to specific timestamp
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group farmer-platform-consumers \
  --reset-offsets --to-datetime 2024-01-01T00:00:00.000 \
  --topic data-collection --execute
```

#### Step 4: Verify Resolution

```bash
# Monitor lag reduction
watch -n 5 './scripts/remediation/check-kafka-lag.sh'

# Check Grafana dashboard
# Lag should decrease to < 100 messages within 10 minutes
```

### Prevention

1. **Auto-scaling**: Implement consumer auto-scaling based on lag
2. **Monitoring**: Set alerts for lag > 500 messages
3. **Capacity planning**: Review partition count and consumer capacity monthly
4. **Message retention**: Configure appropriate retention policies

### Automated Remediation

```bash
# Run automated fix
./scripts/remediation/fix-kafka-lag.sh --auto
```

---

## Playbook 2: Redis OOM Errors

### Symptoms

- Redis logs: "OOM command not allowed"
- Grafana alert: "Redis Memory Usage > 90%"
- Cache misses increase
- Application errors: "Redis connection failed"

### Impact

- **Severity**: P1
- **Users Affected**: All users (degraded performance)
- **Revenue Impact**: High (marketplace unavailable)

### Diagnosis

```bash
# Check Redis memory usage
redis-cli INFO memory

# Check memory stats in Grafana
# Dashboard: Middleware Overview → Redis Memory Usage panel

# Identify largest keys
redis-cli --bigkeys

# Check eviction policy
redis-cli CONFIG GET maxmemory-policy
```

### Resolution

#### Step 1: Immediate Mitigation

```bash
# Flush expired keys
redis-cli --scan --pattern "session:*" | xargs redis-cli DEL

# Or run automated cleanup
./scripts/remediation/cleanup-redis.sh --expired-only
```

#### Step 2: Increase Memory (if available)

```bash
# Update Redis configuration
redis-cli CONFIG SET maxmemory 4gb

# Restart Redis with new config
sudo systemctl restart redis
```

#### Step 3: Implement Eviction Policy

```bash
# Set LRU eviction for cache keys
redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Verify policy
redis-cli CONFIG GET maxmemory-policy
```

#### Step 4: Optimize Data Storage

```bash
# Identify and remove large keys
redis-cli --bigkeys | grep "Biggest"

# Compress large values
./scripts/remediation/compress-redis-keys.sh

# Move infrequently accessed data to database
./scripts/remediation/offload-redis-to-db.sh
```

### Prevention

1. **Set TTL**: Ensure all keys have appropriate expiration
2. **Monitoring**: Alert on memory usage > 80%
3. **Capacity planning**: Increase Redis memory or add nodes
4. **Data optimization**: Compress values, use efficient data structures

### Automated Remediation

```bash
# Run automated fix
./scripts/remediation/fix-redis-oom.sh --auto
```

---

## Playbook 3: Service Crashes

### Symptoms

- Service health check fails
- Grafana alert: "Service DOWN"
- Application logs show crash/exit
- Users report 502/503 errors

### Impact

- **Severity**: P0-P1 (depends on service)
- **Users Affected**: Varies by service
- **Revenue Impact**: High (if critical service)

### Diagnosis

```bash
# Check service status
./scripts/start-all-services.sh --status

# View service logs
tail -f logs/<service-name>.log

# Check for crash dumps
ls -lh /var/crash/

# Review system logs
journalctl -u farmer-platform -n 100
```

### Resolution

#### Step 1: Restart Service

```bash
# Restart specific service
./scripts/remediation/restart-service.sh <service-name>

# Or restart all services
./scripts/stop-all-services.sh
./scripts/start-all-services.sh
```

#### Step 2: Check Resource Constraints

```bash
# Check memory usage
free -h

# Check disk space
df -h

# Check CPU usage
top -bn1 | head -20

# Check open file descriptors
lsof | wc -l
ulimit -n
```

#### Step 3: Review Error Logs

```bash
# Search for errors in logs
grep -i "error\|exception\|fatal" logs/<service-name>.log | tail -50

# Check for OOM kills
dmesg | grep -i "out of memory"

# Review application errors
cat logs/<service-name>.log | jq 'select(.level=="error")'
```

#### Step 4: Rollback (if recent deployment)

```bash
# Rollback to previous checkpoint
cd /home/ubuntu/farmer-data-collection
git log --oneline -10

# Identify last stable version
./scripts/remediation/rollback-deployment.sh --version <commit-hash>
```

### Prevention

1. **Health checks**: Implement robust health checks
2. **Auto-restart**: Configure systemd auto-restart
3. **Resource limits**: Set appropriate memory/CPU limits
4. **Monitoring**: Alert on service restarts
5. **Testing**: Load test before deployment

### Automated Remediation

```bash
# Run automated fix
./scripts/remediation/fix-service-crash.sh <service-name> --auto
```

---

## Playbook 4: Database Connection Issues

### Symptoms

- Application logs: "Connection pool exhausted"
- Grafana alert: "Database Query Duration High"
- Users report slow page loads
- 500 errors on database-dependent endpoints

### Impact

- **Severity**: P0-P1
- **Users Affected**: All users
- **Revenue Impact**: Critical (entire platform affected)

### Diagnosis

```bash
# Check database connections
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Check connection pool status
psql -U postgres -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# Check slow queries
psql -U postgres -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
FROM pg_stat_activity 
WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '5 seconds';"

# Check database metrics in Grafana
# Dashboard: Middleware Overview → Database Query Duration panel
```

### Resolution

#### Step 1: Kill Long-Running Queries

```bash
# Identify long-running queries
psql -U postgres -c "SELECT pid, query_start, query FROM pg_stat_activity 
WHERE state = 'active' AND now() - query_start > interval '30 seconds';"

# Kill specific query
psql -U postgres -c "SELECT pg_terminate_backend(<pid>);"

# Or run automated cleanup
./scripts/remediation/kill-slow-queries.sh --threshold 30s
```

#### Step 2: Increase Connection Pool

```bash
# Update database configuration
psql -U postgres -c "ALTER SYSTEM SET max_connections = 200;"
psql -U postgres -c "SELECT pg_reload_conf();"

# Update application connection pool
# Edit server/db/index.ts
# pool: { min: 10, max: 50 }

# Restart application
./scripts/stop-all-services.sh
./scripts/start-all-services.sh
```

#### Step 3: Optimize Queries

```bash
# Analyze slow queries
psql -U postgres -c "SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;"

# Add missing indexes
./scripts/remediation/optimize-database.sh --add-indexes

# Vacuum and analyze
psql -U postgres -c "VACUUM ANALYZE;"
```

#### Step 4: Restart Database (last resort)

```bash
# Restart PostgreSQL
sudo systemctl restart postgresql

# Verify connections
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

### Prevention

1. **Connection pooling**: Use appropriate pool sizes
2. **Query optimization**: Add indexes, optimize queries
3. **Monitoring**: Alert on connection pool usage > 80%
4. **Regular maintenance**: Schedule VACUUM and ANALYZE
5. **Read replicas**: Offload read queries to replicas

### Automated Remediation

```bash
# Run automated fix
./scripts/remediation/fix-database-connections.sh --auto
```

---

## Playbook 5: High API Latency

### Symptoms

- Grafana alert: "API Response Time > 1s"
- Users report slow page loads
- Increased timeout errors
- APISIX metrics show high p95 latency

### Impact

- **Severity**: P2
- **Users Affected**: All users
- **Revenue Impact**: Medium (poor user experience)

### Diagnosis

```bash
# Check API latency in Grafana
# Dashboard: Middleware Overview → APISIX Response Time panel

# View distributed traces in Jaeger
# http://localhost:16686
# Identify slow spans

# Check Node.js event loop lag
curl http://localhost:9464/metrics | grep nodejs_eventloop_lag

# Profile application
node --prof server/index.js
```

### Resolution

#### Step 1: Identify Bottleneck

```bash
# View traces for slow requests
# Open Jaeger UI: http://localhost:16686
# Filter by duration > 1000ms
# Identify slowest span

# Check database queries
./scripts/remediation/profile-slow-queries.sh

# Check external API calls
grep "external_api" logs/backend.log | grep -o "duration: [0-9]*" | sort -n
```

#### Step 2: Optimize Code

```bash
# Add caching for frequently accessed data
# Implement in server/_core/cache.ts

# Optimize database queries
# Add indexes, use query batching

# Implement pagination
# Limit result sets to 20-50 items
```

#### Step 3: Scale Services

```bash
# Increase Node.js instances
pm2 scale backend 4

# Or use cluster mode
pm2 start server/index.js -i 4

# Verify load distribution
pm2 list
```

#### Step 4: Enable CDN

```bash
# Configure CDN for static assets
# Update APISIX configuration
./scripts/remediation/enable-cdn.sh
```

### Prevention

1. **Caching**: Implement Redis caching for hot paths
2. **Query optimization**: Regular query performance reviews
3. **Load testing**: Test under realistic load
4. **Monitoring**: Alert on p95 latency > 500ms
5. **Auto-scaling**: Implement horizontal auto-scaling

### Automated Remediation

```bash
# Run automated fix
./scripts/remediation/fix-high-latency.sh --auto
```

---

## Automated Remediation

All playbooks include automated remediation scripts in `scripts/remediation/`.

### Usage

```bash
# Run specific remediation
./scripts/remediation/fix-kafka-lag.sh --auto

# Run all health checks
./scripts/remediation/run-all-checks.sh

# Run automated fixes for detected issues
./scripts/remediation/auto-remediate.sh
```

### Safety Features

- **Dry-run mode**: Preview actions without executing
- **Rollback support**: Automatic rollback on failure
- **Logging**: All actions logged to `logs/remediation.log`
- **Notifications**: Slack/email notifications on execution

---

## Post-Incident Review

After resolving an incident, conduct a post-incident review (PIR) within 48 hours.

### PIR Template

```markdown
# Post-Incident Review: [Incident Title]

**Date**: YYYY-MM-DD
**Severity**: P0/P1/P2/P3
**Duration**: X hours
**Responders**: [Names]

## Timeline

- HH:MM - Incident detected
- HH:MM - Initial response
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Incident resolved

## Impact

- Users affected: X%
- Revenue impact: $X
- Data loss: Yes/No

## Root Cause

[Detailed explanation of what caused the incident]

## Resolution

[Steps taken to resolve the incident]

## Action Items

1. [ ] Improve monitoring (Owner: X, Due: YYYY-MM-DD)
2. [ ] Update documentation (Owner: Y, Due: YYYY-MM-DD)
3. [ ] Implement prevention measures (Owner: Z, Due: YYYY-MM-DD)

## Lessons Learned

- What went well
- What could be improved
- Preventive measures
```

### PIR Distribution

- Share with engineering team
- Update playbooks based on learnings
- Track action items in project management tool

---

## Additional Resources

- [Monitoring Guide](./MONITORING_GUIDE.md)
- [Architecture Documentation](./ARCHITECTURE.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [On-Call Runbook](./ON_CALL_RUNBOOK.md)
