# Operations Guide

This document covers operational procedures for the farmer-data-collection platform.

## Database Operations

### Backup and Restore

**Creating a Backup**

```bash
# Full database backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -F c -f backup_$(date +%Y%m%d_%H%M%S).dump

# Schema-only backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME --schema-only -f schema_backup.sql

# Data-only backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME --data-only -f data_backup.sql
```

**Restoring from Backup**

```bash
# Restore full backup
pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME -c backup.dump

# Restore to a new database
createdb -h $DB_HOST -U $DB_USER new_db_name
pg_restore -h $DB_HOST -U $DB_USER -d new_db_name backup.dump
```

### Running Migrations

Migrations are managed via Drizzle ORM. Migration files are located in `drizzle/migrations/`.

```bash
# Generate new migration from schema changes
pnpm drizzle-kit generate:pg

# Apply pending migrations
pnpm drizzle-kit push:pg

# View migration status
pnpm drizzle-kit check:pg
```

**Zero-Downtime Migration Strategy**

For production deployments, follow these steps to ensure zero-downtime migrations:

1. **Additive changes first**: Add new columns/tables before removing old ones
2. **Deploy application code** that works with both old and new schema
3. **Run migration** to add new columns/tables
4. **Backfill data** if needed (use batched updates to avoid locks)
5. **Deploy final application code** that uses new schema only
6. **Run cleanup migration** to remove deprecated columns/tables

**Example: Adding a new column**

```sql
-- Step 1: Add column as nullable
ALTER TABLE farmers ADD COLUMN new_field VARCHAR(100);

-- Step 2: Backfill data (in batches)
UPDATE farmers SET new_field = 'default_value' 
WHERE id BETWEEN 1 AND 10000;

-- Step 3: Add NOT NULL constraint after backfill
ALTER TABLE farmers ALTER COLUMN new_field SET NOT NULL;
```

### Database Indexes

Key indexes for performance (defined in `drizzle/migrations/009_add_processed_events_and_indexes.sql`):

- `message_logs_external_message_id_idx` - For delivery report lookups
- `notification_queue_status_scheduled_idx` - For queue processing
- `processed_events_unique_idx` - For idempotency checks
- `processed_events_processed_at_idx` - For cleanup queries

### Processed Events Cleanup

The `processed_events` table stores webhook/event IDs for idempotency. Clean up old records periodically:

```sql
-- Delete processed events older than 30 days
DELETE FROM processed_events 
WHERE processed_at < NOW() - INTERVAL '30 days';
```

## Rollout Strategy

### Kubernetes Deployment Configuration

All services use a standardized rollout strategy:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 25%
    maxSurge: 25%
```

### Health and Readiness Probes

Every service must define:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

### Deployment Checklist

Before deploying to production:

1. Run all tests locally: `pnpm test`
2. Run TypeScript check: `pnpm exec tsc --noEmit`
3. Run linting: `pnpm lint`
4. Verify migrations are backward-compatible
5. Check that all environment variables are configured
6. Verify monitoring dashboards are accessible
7. Ensure rollback plan is documented

### Rollback Procedure

If issues are detected after deployment:

```bash
# Kubernetes rollback
kubectl rollout undo deployment/api-server -n production

# Check rollout status
kubectl rollout status deployment/api-server -n production

# View rollout history
kubectl rollout history deployment/api-server -n production
```

## Circuit Breakers

External dependencies (Africa's Talking, ERPNext) are protected by circuit breakers:

| Service | Failure Threshold | Reset Timeout | Half-Open Requests |
|---------|------------------|---------------|-------------------|
| Africa's Talking SMS | 5 failures | 30 seconds | 3 |
| Africa's Talking WhatsApp | 5 failures | 30 seconds | 3 |
| ERPNext API | 3 failures | 60 seconds | 2 |

Circuit breaker states are exposed via Prometheus metrics:
- `circuit_breaker_state` (0=closed, 1=open, 2=half-open)
- `circuit_breaker_trips_total`

## Monitoring

### Key Metrics to Watch

**Notification Queue**
- `notification_queue_size{status="pending"}` - Should stay low
- `notification_queue_lag_seconds` - Alert if > 300 seconds

**Webhooks**
- `webhook_errors_total` - Alert on sudden increase
- `webhook_duplicates_total` - Normal to see some duplicates

**ERPNext Sync**
- `erpnext_sync_errors_total` - Alert on any errors
- `erpnext_sync_duration_seconds` - Alert if p99 > 30s

### Alert Rules

Configure these alerts in Prometheus/Alertmanager:

```yaml
groups:
  - name: platform-alerts
    rules:
      - alert: NotificationQueueBacklog
        expr: notification_queue_size{status="pending"} > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Notification queue backlog detected"
          
      - alert: WebhookErrorRate
        expr: rate(webhook_errors_total[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High webhook error rate"
          
      - alert: ERPNextSyncFailure
        expr: increase(erpnext_sync_errors_total[5m]) > 0
        for: 1m
        labels:
          severity: warning
        annotations:
          summary: "ERPNext sync errors detected"
```

## API Reference

### Africa's Talking Webhooks

All webhooks require authentication via `X-AT-Webhook-Secret` header or `secret` query parameter.

**USSD Webhook**
- Endpoint: `POST /api/trpc/africasTalking.ussdWebhook`
- Input: `{ sessionId, serviceCode, phoneNumber, text }`
- Response: `{ response: string, endSession: boolean }`

**SMS Webhook**
- Endpoint: `POST /api/trpc/africasTalking.smsWebhook`
- Input: `{ from, text, date, id?, linkId? }`
- Response: `{ success: boolean, message: string, correlationId: string }`

**WhatsApp Webhook**
- Endpoint: `POST /api/trpc/africasTalking.whatsappWebhook`
- Input: `{ from, text, timestamp, id? }`
- Response: `{ success: boolean, message: string, correlationId: string }`

**Delivery Report Webhook**
- Endpoint: `POST /api/trpc/africasTalking.deliveryReportWebhook`
- Input: `{ id, status, phoneNumber, networkCode?, retryCount?, failureReason? }`
- Response: `{ success: boolean, message: string, correlationId: string, duplicate?: boolean }`

### ERPNext Sync Endpoints

**Push to ERPNext**
- Endpoint: `POST /api/trpc/erpnext.pushToErpnext`
- Input: `{ entityType: 'customer'|'supplier'|'item'|'invoice', entityId: number }`
- Response: `{ success: boolean, erpnextId?: string, error?: string }`

**Pull from ERPNext**
- Endpoint: `POST /api/trpc/erpnext.pullFromErpnext`
- Input: `{ doctype: string, name: string }`
- Response: `{ success: boolean, localId?: number, error?: string }`

### Payment Endpoints

**Generate QR Code**
- Endpoint: `POST /api/trpc/banking.generateQRCode`
- Input: `{ amount: number, reference: string, description?: string }`
- Response: `{ qrCode: string, reference: string }`

**Process Payment**
- Endpoint: `POST /api/trpc/banking.processPayment`
- Input: `{ amount: number, fromAccount: string, toAccount: string, reference: string }`
- Response: `{ success: boolean, transactionId: string }`

## Incident Runbooks

### Kafka Degraded/Down

**Symptoms:**
- Events not being published
- Consumer lag increasing
- `kafka_consumer_lag` metric spiking

**Immediate Actions:**
1. Check Kafka broker status:
   ```bash
   kubectl get pods -l app=kafka -n infrastructure
   kafka-topics.sh --bootstrap-server localhost:9093 --list
   ```

2. Check consumer group lag:
   ```bash
   kafka-consumer-groups.sh --bootstrap-server localhost:9093 --describe --group farmer-platform
   ```

3. If broker is down, check logs:
   ```bash
   kubectl logs -l app=kafka -n infrastructure --tail=100
   ```

**Recovery:**
- If single broker failure in cluster: Wait for automatic recovery (KRaft mode)
- If all brokers down: Restart Kafka pods
  ```bash
  kubectl rollout restart statefulset/kafka -n infrastructure
  ```
- Events stored in outbox table will be replayed automatically once Kafka recovers

**Fallback:**
- Platform continues to function with local event handlers
- Events accumulate in `event_outbox` table for later replay

---

### Redis Down

**Symptoms:**
- Session errors
- Cache misses increasing
- Rate limiting not working

**Immediate Actions:**
1. Check Redis status:
   ```bash
   kubectl get pods -l app=redis -n infrastructure
   redis-cli -h localhost -p 6379 ping
   ```

2. Check memory usage:
   ```bash
   redis-cli info memory
   ```

3. Check for connection issues:
   ```bash
   redis-cli client list
   ```

**Recovery:**
- If Redis is OOM: Increase memory limit or enable eviction
  ```bash
  redis-cli config set maxmemory-policy allkeys-lru
  ```
- If Redis pod crashed: Restart
  ```bash
  kubectl rollout restart deployment/redis -n infrastructure
  ```

**Fallback:**
- Sessions will fail (users need to re-login)
- Rate limiting disabled (monitor for abuse)
- Cache misses hit database directly (monitor DB load)

---

### Keycloak Outage

**Symptoms:**
- Login failures
- 401 errors on protected endpoints
- Token validation failures

**Immediate Actions:**
1. Check Keycloak status:
   ```bash
   kubectl get pods -l app=keycloak -n infrastructure
   curl -f http://keycloak:8080/health/ready
   ```

2. Check database connectivity:
   ```bash
   kubectl exec -it keycloak-0 -- psql -h postgres -U postgres -d keycloak -c "SELECT 1"
   ```

3. Check logs:
   ```bash
   kubectl logs -l app=keycloak -n infrastructure --tail=100
   ```

**Recovery:**
- If Keycloak pod crashed: Restart
  ```bash
  kubectl rollout restart deployment/keycloak -n infrastructure
  ```
- If database issue: Check Postgres status first

**Fallback:**
- Existing JWT tokens remain valid until expiry
- New logins will fail
- Consider extending token TTL during incident

---

### Postgres Failover

**Symptoms:**
- Database connection errors
- Write failures
- Replication lag alerts

**Immediate Actions:**
1. Check Postgres status:
   ```bash
   kubectl get pods -l app=postgres -n infrastructure
   psql -h localhost -U postgres -c "SELECT pg_is_in_recovery();"
   ```

2. Check replication status (if using replicas):
   ```bash
   psql -h localhost -U postgres -c "SELECT * FROM pg_stat_replication;"
   ```

3. Check for locks:
   ```bash
   psql -h localhost -U postgres -c "SELECT * FROM pg_locks WHERE NOT granted;"
   ```

**Recovery:**
- If primary down with replicas: Promote replica
  ```bash
  kubectl exec -it postgres-replica-0 -- pg_ctl promote
  ```
- Update connection strings to point to new primary
- If no replicas: Restore from backup (see Backup and Restore section)

**Failover Checklist:**
1. Identify new primary
2. Update DATABASE_URL in all services
3. Restart application pods
4. Verify data integrity
5. Set up new replica from new primary

---

### Permify Authorization Failure

**Symptoms:**
- 403 errors on authorized requests
- Permission checks timing out
- Authorization cache misses

**Immediate Actions:**
1. Check Permify status:
   ```bash
   kubectl get pods -l app=permify -n infrastructure
   curl -f http://permify:3476/healthz
   ```

2. Check schema is loaded:
   ```bash
   curl http://permify:3476/v1/tenants/t1/schemas
   ```

**Recovery:**
- If Permify pod crashed: Restart
  ```bash
  kubectl rollout restart deployment/permify -n infrastructure
  ```
- If schema missing: Re-apply schema
  ```bash
  curl -X POST http://permify:3476/v1/tenants/t1/schemas/write -d @permify-schema.json
  ```

**Fallback:**
- Authorization middleware falls back to role-based checks
- Monitor for unauthorized access attempts

---

### Africa's Talking Integration Failure

**Symptoms:**
- SMS not being delivered
- USSD sessions failing
- Webhook errors increasing

**Immediate Actions:**
1. Check circuit breaker status:
   ```bash
   curl http://localhost:3001/metrics | grep circuit_breaker
   ```

2. Check Africa's Talking status page: https://status.africastalking.com/

3. Verify credentials:
   ```bash
   curl -H "apiKey: $AFRICAS_TALKING_API_KEY" \
     https://api.africastalking.com/version1/user?username=$AFRICAS_TALKING_USERNAME
   ```

**Recovery:**
- If circuit breaker open: Wait for reset (30 seconds) or manually reset
- If credentials expired: Update API key in secrets
- If AT is down: Wait for their recovery, messages queue in notification_queue

**Fallback:**
- Messages queue in `notification_queue` table
- Consider alternative SMS provider if prolonged outage

---

### High Database Load

**Symptoms:**
- Slow query responses
- Connection pool exhaustion
- CPU/memory alerts on database

**Immediate Actions:**
1. Identify slow queries:
   ```sql
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query
   FROM pg_stat_activity
   WHERE state != 'idle' AND now() - pg_stat_activity.query_start > interval '5 seconds';
   ```

2. Check connection count:
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   ```

3. Kill long-running queries if needed:
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
   WHERE duration > interval '5 minutes' AND state != 'idle';
   ```

**Recovery:**
- Add missing indexes (see migrations/010_performance_indexes.sql)
- Scale read replicas if read-heavy
- Increase connection pool size if connection exhaustion

---

## Environment Variables

### Required for Production

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Africa's Talking
AFRICAS_TALKING_API_KEY=your_api_key
AFRICAS_TALKING_USERNAME=your_username
AFRICAS_TALKING_WEBHOOK_SECRET=your_webhook_secret

# ERPNext
ERPNEXT_URL=https://your-erpnext.com
ERPNEXT_API_KEY=your_api_key
ERPNEXT_API_SECRET=your_api_secret

# Security
API_KEY_ENCRYPTION_KEY=32_byte_hex_key
JWT_SECRET=your_jwt_secret

# Optional
AFRICAS_TALKING_WEBHOOK_VERIFY=true  # Set to 'false' to disable webhook verification
```
