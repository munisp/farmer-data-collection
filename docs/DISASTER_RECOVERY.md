# Disaster Recovery Runbook

## FarmConnect Platform — DR Procedures

**Document Owner:** Platform Engineering  
**Last Updated:** 2026-05-27  
**Review Cadence:** Quarterly  
**Classification:** Internal — Operations

---

## 1. Recovery Objectives

| Metric | Target | Maximum Tolerable |
|--------|--------|-------------------|
| **RTO** (Recovery Time Objective) | 15 minutes | 1 hour |
| **RPO** (Recovery Point Objective) | 5 minutes | 15 minutes |
| **MTTR** (Mean Time to Recover) | < 30 minutes | 2 hours |
| **Availability Target** | 99.9% | 99.5% |

### Tier Classification

| Tier | Services | RTO | RPO |
|------|----------|-----|-----|
| **P0 — Critical** | Auth, Payments, Core API, Database | 5 min | 1 min |
| **P1 — High** | Messaging, Loans, KYC, Exchange | 15 min | 5 min |
| **P2 — Medium** | Analytics, Reports, ML Predictions | 30 min | 15 min |
| **P3 — Low** | Dashboards, Admin Tools, Grafana | 1 hour | 1 hour |

---

## 2. Backup Strategy

### 2.1 PostgreSQL Database

```yaml
backup_schedule:
  full_backup: "0 2 * * *"      # Daily at 2 AM UTC
  incremental: "*/15 * * * *"    # Every 15 minutes (WAL archiving)
  retention: 30 days
  
storage:
  primary: s3://farmconnect-backups/postgres/
  secondary: gs://farmconnect-dr/postgres/   # Cross-cloud DR
  
encryption: AES-256-GCM
compression: zstd (level 3)
```

### 2.2 Backup Verification

```bash
# Daily automated restore test (runs in CI)
#!/bin/bash
LATEST_BACKUP=$(aws s3 ls s3://farmconnect-backups/postgres/ --recursive | sort | tail -1 | awk '{print $4}')
pg_restore --dbname=verify_db --clean --if-exists "$LATEST_BACKUP"
psql verify_db -c "SELECT count(*) FROM users;" | grep -q "[0-9]"
echo "Backup verification: PASSED"
```

### 2.3 Application State

| Component | Backup Method | Frequency | Retention |
|-----------|--------------|-----------|-----------|
| PostgreSQL | pg_basebackup + WAL | Continuous | 30 days |
| Redis | RDB snapshots + AOF | Every 5 min | 7 days |
| Kafka | Topic replication (RF=3) | Real-time | 14 days |
| Object Storage (S3) | Cross-region replication | Real-time | Indefinite |
| Vault Secrets | Encrypted snapshot | Daily | 90 days |
| Docker Images | GHCR multi-region | On push | 50 versions |

---

## 3. Failure Scenarios & Response

### 3.1 Database Failure (P0)

**Detection:** Prometheus alert `PostgresDown` fires within 30 seconds.

**Response Steps:**
1. **Verify** — Check primary DB status: `pg_isready -h primary-db`
2. **Failover** — Promote standby: `pg_ctl promote -D /var/lib/postgresql/data`
3. **DNS Update** — Switch DNS to standby: `aws route53 change-resource-record-sets --hosted-zone-id Z... --change-batch file://failover.json`
4. **Verify** — Run health check: `curl -f http://api/health`
5. **Notify** — Post incident: `#ops-incidents` Slack channel
6. **Restore** — Rebuild failed primary from latest backup

**Rollback:** If standby is corrupted, restore from latest S3 backup (RPO: 15 min).

### 3.2 Application Server Failure (P0)

**Detection:** Kubernetes liveness probe fails 3 consecutive times.

**Response Steps:**
1. K8s automatically restarts pod (built-in)
2. If node failure: K8s reschedules to healthy node
3. If AZ failure: Traffic routes to other AZ via load balancer
4. Monitor: `kubectl get pods -n farmconnect --field-selector=status.phase!=Running`

### 3.3 Complete Region Failure (P0)

**Detection:** All health checks from external monitor fail for > 2 minutes.

**Response Steps:**
1. **DNS Failover** — Route53 health check triggers automatic failover to DR region
2. **Verify DR** — Check DR region health: `curl -f https://dr.farmconnect.io/health`
3. **Data Sync** — Verify WAL shipping caught up: `SELECT pg_last_wal_replay_lsn();`
4. **Communications** — Notify users via status page and SMS
5. **Post-incident** — Full RCA within 48 hours

### 3.4 Kafka Cluster Failure (P1)

**Detection:** Consumer lag exceeds 10,000 messages OR broker unreachable.

**Response Steps:**
1. Check broker health: `kafka-broker-api-versions --bootstrap-server localhost:9092`
2. If single broker: rebalance partitions to surviving brokers
3. If cluster: restart from latest offsets, replay from topic retention
4. Verify: Check consumer group lag is decreasing

### 3.5 Security Breach (P0)

**Detection:** WAF alerts, unusual API patterns, or audit log anomalies.

**Response Steps:**
1. **Isolate** — Revoke all active sessions: `redis-cli FLUSHDB` (session store)
2. **Block** — Enable IP blocklist via APISIX
3. **Rotate** — Rotate all secrets in Vault: `vault operator rotate`
4. **Audit** — Export last 24h of audit logs for forensics
5. **Notify** — GDPR/CBN notification within 72 hours if data affected
6. **Restore** — If data tampered, restore from pre-breach backup

---

## 4. Failover Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Route53 (DNS)                            │
│                  Health-check based routing                      │
└──────────────┬──────────────────────────────────┬───────────────┘
               │                                  │
    ┌──────────▼──────────┐            ┌──────────▼──────────┐
    │   Primary Region    │            │     DR Region       │
    │   (af-south-1)      │            │   (eu-west-1)       │
    │                     │            │                     │
    │  ┌──────────────┐   │  WAL       │  ┌──────────────┐   │
    │  │ PostgreSQL   │───┼──stream────┼─▶│ PostgreSQL   │   │
    │  │ (Primary)    │   │            │  │ (Standby)    │   │
    │  └──────────────┘   │            │  └──────────────┘   │
    │                     │            │                     │
    │  ┌──────────────┐   │  Mirror    │  ┌──────────────┐   │
    │  │ Kafka (3)    │───┼───────────┼─▶│ Kafka (3)    │   │
    │  └──────────────┘   │            │  └──────────────┘   │
    │                     │            │                     │
    │  ┌──────────────┐   │            │  ┌──────────────┐   │
    │  │ K8s Cluster  │   │            │  │ K8s Cluster  │   │
    │  │ (3 nodes)    │   │            │  │ (2 nodes)    │   │
    │  └──────────────┘   │            │  └──────────────┘   │
    └─────────────────────┘            └─────────────────────┘
```

---

## 5. Recovery Procedures

### 5.1 Database Point-in-Time Recovery (PITR)

```bash
#!/bin/bash
# Restore database to specific point in time
TARGET_TIME="2026-05-27 10:00:00 UTC"

# Stop application traffic
kubectl scale deployment farmconnect-api --replicas=0

# Restore from base backup + WAL replay
pg_basebackup -h backup-server -D /var/lib/postgresql/restore
echo "restore_command = 'aws s3 cp s3://farmconnect-backups/wal/%f %p'"  >> recovery.conf
echo "recovery_target_time = '$TARGET_TIME'" >> recovery.conf
echo "recovery_target_action = 'promote'" >> recovery.conf

# Start restored instance
pg_ctl start -D /var/lib/postgresql/restore

# Verify data integrity
psql -c "SELECT count(*) FROM users; SELECT max(created_at) FROM transactions;"

# Resume traffic
kubectl scale deployment farmconnect-api --replicas=3
```

### 5.2 Full Platform Recovery from Scratch

```bash
#!/bin/bash
# Complete platform recovery (estimated time: 45 minutes)

# 1. Infrastructure (Terraform)
cd infrastructure && terraform apply -auto-approve  # 10 min

# 2. Database restore
aws s3 cp s3://farmconnect-backups/postgres/latest.dump ./
pg_restore --dbname=farmconnect --clean --if-exists latest.dump  # 5 min

# 3. Deploy services
kubectl apply -f k8s/  # 5 min
kubectl rollout status deployment --timeout=300s

# 4. Verify
./scripts/health-check-all.sh  # 2 min

# 5. DNS switch
aws route53 change-resource-record-sets ...  # 1 min

# 6. Smoke tests
./scripts/smoke-test.sh  # 3 min
```

---

## 6. Communication Plan

### Escalation Matrix

| Severity | First Response | Escalation (15 min) | Escalation (30 min) |
|----------|---------------|---------------------|---------------------|
| P0 | On-call engineer | Engineering Lead | CTO |
| P1 | On-call engineer | Engineering Lead | — |
| P2 | Next business day | — | — |

### Notification Channels

| Audience | Channel | Trigger |
|----------|---------|---------|
| Engineering | Slack #ops-incidents + PagerDuty | P0/P1 alerts |
| Management | Email + Slack #leadership | P0 lasting > 15 min |
| Users | Status page + SMS | P0 lasting > 5 min |
| Regulators | Email (CBN/CBK) | Data breach |

---

## 7. Testing Schedule

| Test Type | Frequency | Duration | Scope |
|-----------|-----------|----------|-------|
| Backup restore verification | Daily (automated) | 5 min | Database |
| Failover drill | Monthly | 30 min | Database + DNS |
| Full DR exercise | Quarterly | 4 hours | All services |
| Chaos engineering | Weekly | 1 hour | Random service kills |
| Tabletop exercise | Bi-annually | 2 hours | Team coordination |

---

## 8. Post-Incident Review Template

```markdown
## Incident Report — [DATE]

### Summary
- **Duration:** X minutes
- **Impact:** Y users affected
- **Root Cause:** [description]
- **Detection Time:** Z seconds

### Timeline
- HH:MM — Alert triggered
- HH:MM — On-call acknowledged
- HH:MM — Root cause identified
- HH:MM — Fix deployed
- HH:MM — Service restored

### Action Items
- [ ] Preventive measure 1
- [ ] Monitoring improvement
- [ ] Documentation update
```

---

## 9. Dependencies & Contacts

| Service | Provider | Support Contact | SLA |
|---------|----------|-----------------|-----|
| PostgreSQL | AWS RDS | AWS Support (Enterprise) | 99.99% |
| Kafka | Confluent Cloud | Confluent Support | 99.95% |
| DNS | Route53 | AWS Support | 100% |
| CDN | CloudFront | AWS Support | 99.9% |
| SMS | Africa's Talking | support@africastalking.com | 99.5% |
| Payments | M-Pesa/MTN | Technical partners | 99.9% |
