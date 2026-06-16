# FarmConnect Incident Response Runbook

## Severity Levels

| Level | Criteria | Response Time | Example |
|-------|----------|---------------|---------|
| **SEV1** | Full outage, data loss risk, financial impact | 15 min | API server down, TigerBeetle unreachable, DB corruption |
| **SEV2** | Degraded service, partial outage | 30 min | High error rate, Redis down, single polyglot service failing |
| **SEV3** | Minor impact, workaround exists | 2 hours | Slow queries, elevated latency, non-critical service down |
| **SEV4** | No user impact, monitoring alert | Next business day | Disk usage warning, stale backups, certificate expiry |

---

## Runbook: API Server Down

**Alert:** `APIServerDown` — API server unreachable for > 1 minute.

### Diagnosis

```bash
# Check pod status
kubectl -n farmconnect get pods -l app=farmconnect-api

# Check recent events
kubectl -n farmconnect describe pod <pod-name>

# Check logs
kubectl -n farmconnect logs -l app=farmconnect-api --tail=100

# Check node resources
kubectl top nodes
kubectl top pods -n farmconnect
```

### Resolution

1. **OOM Kill**: Increase memory limits in deployment manifest, restart.
2. **Crash loop**: Check logs for startup errors. Common causes:
   - Database connection failure → verify PostgreSQL is running
   - Port conflict → check if another service is on :3001
   - Missing env vars → verify ConfigMap/Secret
3. **Node failure**: Check `kubectl get nodes`. If NotReady, drain and replace.
4. **Scale up**: `kubectl -n farmconnect scale deployment farmconnect-api --replicas=3`

---

## Runbook: PostgreSQL Down

**Alert:** `PostgresDown` — Database unreachable.

### Diagnosis

```bash
# Check pod
kubectl -n farmconnect get pods -l app=postgres

# Check PVC
kubectl -n farmconnect get pvc | grep postgres

# Check connections
kubectl -n farmconnect exec -it <postgres-pod> -- psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Check replication lag (if replica exists)
kubectl -n farmconnect exec -it <postgres-pod> -- psql -U postgres -c "SELECT * FROM pg_stat_replication;"
```

### Resolution

1. **Connection exhaustion**: Kill idle connections:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE state = 'idle' AND query_start < now() - interval '10 minutes';
   ```
2. **Disk full**: Extend PVC or clean WAL:
   ```bash
   kubectl -n farmconnect exec -it <pod> -- pg_archivecleanup /var/lib/postgresql/data/pg_wal <oldest-needed-wal>
   ```
3. **Corruption**: Restore from backup:
   ```bash
   ./scripts/backup/pg_backup.sh restore local
   ```

---

## Runbook: TigerBeetle Down

**Alert:** `TigerBeetleDown` — Financial ledger unreachable. **SEV1**.

### Impact
All financial operations (payments, transfers, settlements) are blocked.

### Diagnosis

```bash
kubectl -n farmconnect get pods -l app=tigerbeetle
kubectl -n farmconnect logs -l app=tigerbeetle --tail=50
```

### Resolution

1. **Restart**: `kubectl -n farmconnect rollout restart statefulset tigerbeetle`
2. **Data file corruption**: Restore from backup:
   ```bash
   ./scripts/backup/tigerbeetle_backup.sh restore local
   ```
3. **Fallback**: The API server has graceful degradation — financial endpoints will return `503` but non-financial operations continue.

---

## Runbook: High Error Rate

**Alert:** `HighErrorRate` — 5xx error rate > 5%.

### Diagnosis

```bash
# Check which endpoints are failing
kubectl -n farmconnect logs -l app=farmconnect-api --tail=500 | grep "ERROR"

# Check circuit breaker states
curl http://localhost:3001/api/service-health | jq '.services[] | select(.status != "healthy")'

# Check downstream services
curl http://localhost:3001/readyz | jq
```

### Resolution

1. **Downstream service failure**: Check circuit breaker states. If OPEN, the service auto-recovers in 30s.
2. **Database overload**: Check slow query log, kill long-running queries.
3. **Memory leak**: Check `kubectl top pods`. Restart if memory is climbing.
4. **Deploy rollback**:
   ```bash
   kubectl -n farmconnect rollout undo deployment farmconnect-api
   ```

---

## Runbook: Redis Down

**Alert:** `RedisDown` — Cache/session store unreachable.

### Impact
- Rate limiting falls back to in-memory (less precise)
- Session cache misses → slightly higher DB load
- Real-time features degraded

### Resolution

1. **Restart**: `kubectl -n farmconnect rollout restart statefulset redis`
2. **OOM**: Increase `maxmemory` or review eviction policy
3. **Persistence issue**: Restore from backup:
   ```bash
   ./scripts/backup/redis_backup.sh restore local
   ```

> **Note:** The API server has graceful Redis fallback — it continues operating with in-memory state.

---

## Runbook: Kafka Consumer Lag

**Alert:** `KafkaConsumerLag` — Consumer lag > 10,000 messages.

### Diagnosis

```bash
# Check consumer groups
kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --all-groups

# Check topic partition distribution
kafka-topics.sh --bootstrap-server kafka:9092 --describe --topic <topic>
```

### Resolution

1. **Slow consumer**: Scale consumer pods.
2. **Consumer crash**: Check consumer logs, restart.
3. **Partition skew**: Rebalance partitions:
   ```bash
   kafka-reassign-partitions.sh --bootstrap-server kafka:9092 --execute --reassignment-json-file rebalance.json
   ```

---

## Runbook: Backup Failure

**Alert:** `BackupJobFailed` or `BackupStale`.

### Diagnosis

```bash
# Check backup job history
kubectl -n farmconnect get jobs | grep backup

# Check job logs
kubectl -n farmconnect logs job/<job-name>

# Verify backup storage
kubectl -n farmconnect exec -it <backup-pod> -- ls -la /backups/
```

### Resolution

1. **Disk full**: Extend backup PVC or clean old backups
2. **S3 permission**: Verify IAM role on backup ServiceAccount
3. **Manual backup**: Run backup script directly:
   ```bash
   ./scripts/backup/pg_backup.sh full s3
   ./scripts/backup/redis_backup.sh backup s3
   ./scripts/backup/tigerbeetle_backup.sh backup s3
   ```

---

## Runbook: Certificate Expiry

### Prevention

```bash
# Check TLS cert expiry
openssl s_client -connect api.farmconnect.app:443 2>/dev/null | openssl x509 -noout -dates
```

### Resolution

1. **cert-manager**: Check cert-manager logs, verify ClusterIssuer
2. **Manual renewal**: `kubectl -n farmconnect delete secret farmconnect-tls` → cert-manager will re-issue
3. **gRPC mTLS**: Rotate via the cert paths configured in `GRPC_*_CERT_PATH` env vars

---

## Contact & Escalation

| Role | Responsibility |
|------|---------------|
| On-call engineer | First response, diagnosis, initial mitigation |
| Platform lead | SEV1/SEV2 escalation, architecture decisions |
| DBA | Database issues, backup/restore |
| Security | AML alerts, auth failures, WAF incidents |

---

## Post-Incident

1. Create incident timeline (when detected, when mitigated, when resolved)
2. Root cause analysis within 48 hours for SEV1/SEV2
3. Update this runbook with new learnings
4. Create/update alerts to catch the issue earlier
