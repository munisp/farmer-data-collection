# FarmConnect Operational Runbook

## Quick Reference

| Action | Command |
|--------|---------|
| Health Check | `curl http://localhost:5000/api/health` |
| Restart API | `docker-compose restart api` |
| DB Backup | `./scripts/backup-database.sh` |
| View Logs | `docker-compose logs -f api` |
| Check Metrics | `http://localhost:9090` (Prometheus) |
| View Dashboards | `http://localhost:3001` (Grafana) |
| Trace Requests | `http://localhost:16686` (Jaeger) |

## Incident Response

### Severity Levels
| Level | Response Time | Description |
|-------|--------------|-------------|
| SEV-1 | 5 min | Complete service outage |
| SEV-2 | 15 min | Major feature degraded |
| SEV-3 | 1 hour | Minor feature degraded |
| SEV-4 | 4 hours | Non-critical issue |

### Incident Procedure
1. **Acknowledge** — Confirm alert, assign incident commander
2. **Triage** — Determine severity, affected users, blast radius
3. **Mitigate** — Apply immediate fix (rollback, scale, failover)
4. **Communicate** — Update status page, notify stakeholders
5. **Resolve** — Permanent fix deployed and verified
6. **Post-mortem** — RCA within 48 hours, action items tracked

## Common Issues & Resolutions

### 1. High API Latency (>500ms p95)

**Symptoms:** Slow responses, timeout errors
**Diagnosis:**
```bash
# Check DB query performance
docker exec postgres psql -c "SELECT * FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 seconds';"

# Check connection pool
curl http://localhost:5000/api/health | jq '.database'

# Check Redis
docker exec redis redis-cli info clients
```
**Resolution:**
- Kill long-running queries: `SELECT pg_cancel_backend(pid);`
- Scale API replicas: `docker-compose up --scale api=3`
- Clear Redis cache: `docker exec redis redis-cli FLUSHDB`

### 2. Database Connection Pool Exhausted

**Symptoms:** `FATAL: too many connections`, 500 errors
**Diagnosis:**
```bash
docker exec postgres psql -c "SELECT count(*) FROM pg_stat_activity;"
docker exec postgres psql -c "SELECT usename, count(*) FROM pg_stat_activity GROUP BY usename;"
```
**Resolution:**
- Terminate idle connections: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '10 minutes';`
- Increase pool size in env: `DB_POOL_MAX=40`
- Enable PgBouncer for connection pooling

### 3. Kafka Consumer Lag

**Symptoms:** Events not processing, delayed notifications
**Diagnosis:**
```bash
docker exec kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group farmconnect-consumers
```
**Resolution:**
- Restart consumers: `docker-compose restart kafka-consumer`
- Add partitions: `kafka-topics.sh --alter --topic events --partitions 12`
- Scale consumer group: `docker-compose up --scale consumer=3`

### 4. Out of Memory (OOM)

**Symptoms:** Container restarts, process killed
**Diagnosis:**
```bash
docker stats --no-stream
docker inspect --format='{{.State.OOMKilled}}' farmconnect-api
```
**Resolution:**
- Increase memory limit in docker-compose
- Check for memory leaks: analyze heap dump
- Enable GC logging: `--expose-gc --max-old-space-size=2048`

### 5. Payment Processing Failures

**Symptoms:** M-Pesa/MTN callbacks not received, stuck transactions
**Diagnosis:**
```bash
# Check webhook delivery
curl http://localhost:5000/api/health | jq '.payments'

# Check stale transactions
docker exec postgres psql -c "SELECT * FROM mobile_money_transactions WHERE status = 'pending' AND created_at < now() - interval '1 hour';"
```
**Resolution:**
- Trigger reconciliation: `POST /api/trpc/paymentReconciliation.reconcileStale`
- Check provider status: M-Pesa sandbox dashboard
- Retry failed callbacks manually

### 6. Certificate Expiry

**Symptoms:** TLS handshake failures, browser warnings
**Diagnosis:**
```bash
echo | openssl s_client -connect api.farmconnect.africa:443 2>/dev/null | openssl x509 -noout -dates
```
**Resolution:**
- Run cert renewal: `./k8s/vault/deploy-tls.sh production`
- Restart nginx/ingress after renewal
- Verify: `curl -vI https://api.farmconnect.africa/api/health`

## Deployment Procedures

### Standard Deployment
```bash
# 1. Build and test locally
npm run build && npm test

# 2. Tag release
git tag -a v$(date +%Y%m%d.%H%M) -m "Release"

# 3. Build container
docker build -t farmconnect-api:latest .

# 4. Deploy with rolling update
kubectl rollout restart deployment/farmconnect-api

# 5. Verify
kubectl rollout status deployment/farmconnect-api
curl https://api.farmconnect.africa/api/health
```

### Rollback
```bash
# Immediate rollback
kubectl rollout undo deployment/farmconnect-api

# Rollback to specific revision
kubectl rollout undo deployment/farmconnect-api --to-revision=3

# Verify
kubectl rollout status deployment/farmconnect-api
```

### Database Migration
```bash
# 1. Backup first
./scripts/backup-database.sh

# 2. Run migration
npx drizzle-kit push

# 3. Verify schema
npx drizzle-kit introspect

# 4. If issues, rollback
./scripts/restore-database.sh latest
```

## Monitoring & Observability

### Key Dashboards
| Dashboard | URL | Purpose |
|-----------|-----|---------|
| Application Overview | Grafana /d/app-overview | Request rate, errors, latency |
| Database Monitoring | Grafana /d/db-monitoring | Queries, connections, replication |
| Microservices Health | Grafana /d/microservices | Service mesh, gRPC, Go/Python/Rust |
| Distributed Tracing | Grafana /d/tracing | Request traces via Jaeger |
| SLA Monitoring | Grafana /d/sla | SLI/SLO compliance |
| Middleware Overview | Grafana /d/middleware | Rate limiting, auth, caching |

### Log Queries (Loki)
```logql
# Error logs in last hour
{app="farmconnect-api"} |= "error" | json | level="error"

# Slow queries
{app="farmconnect-api"} | json | duration > 500

# Payment failures
{app="farmconnect-api"} |= "payment" |= "failed"

# Auth failures
{app="farmconnect-api"} |= "unauthorized" | rate() > 10
```

### Prometheus Alerts
| Alert | Condition | Severity |
|-------|-----------|----------|
| HighErrorRate | error_rate > 1% for 5m | critical |
| HighLatency | p95 > 1s for 5m | warning |
| DBConnectionHigh | pool_usage > 90% | critical |
| DiskSpaceLow | disk_usage > 85% | warning |
| CertExpiringSoon | cert_expiry < 7d | warning |
| KafkaLagHigh | consumer_lag > 10000 | warning |
| MemoryHigh | memory_usage > 85% | warning |
| PodRestarts | restarts > 3 in 1h | warning |

## Backup & Recovery

### Automated Backups
| Type | Schedule | Retention | Storage |
|------|----------|-----------|---------|
| Full DB | Daily 02:00 UTC | 30 days | S3 af-south-1 |
| WAL Archive | Continuous | 7 days | S3 af-south-1 |
| Config | On change | 90 days | Git |
| Secrets | On change | Encrypted | Vault |

### Recovery Procedures
See `docs/DISASTER_RECOVERY.md` for full DR procedures.

## Security Operations

### Rotate Secrets
```bash
# Rotate JWT signing key
vault write secret/farmconnect/jwt-key value=$(openssl rand -hex 32)

# Rotate DB password
vault write secret/farmconnect/db-password value=$(openssl rand -base64 24)

# Rotate API keys
vault write secret/farmconnect/mpesa-key value=<new-key>
```

### Security Checklist (Weekly)
- [ ] Review failed login attempts
- [ ] Check for dependency vulnerabilities: `npm audit`
- [ ] Review access logs for anomalies
- [ ] Verify TLS certificate status
- [ ] Check Vault seal status
- [ ] Review rate limiting effectiveness

## Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| On-call Engineer | PagerDuty rotation | Auto-escalates after 5m |
| Platform Lead | Slack #platform | Manual escalation |
| Database DBA | Slack #database | P1/P2 incidents |
| Security | Slack #security | Security incidents |
| Product | Slack #product | User-facing issues |
