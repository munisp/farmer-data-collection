# Event Consumers Implementation Guide

## Overview

This document describes the Kafka event consumers that process real-time events for cache invalidation, audit trails, and analytics in the Farmer Data Collection enterprise platform.

## Architecture

The event-driven architecture consists of:

1. **Event Producers** - Publish events to Kafka topics when data changes
2. **Kafka Broker** - Stores and distributes events
3. **Event Consumers** - Process events asynchronously
4. **Consumer Manager** - Manages consumer lifecycle

```
Data Change → Event Producer → Kafka Topic → Event Consumer → Action
                                    ↓
                            [cache.invalidation]
                            [audit.trail]
                            [analytics]
```

## Consumers

### 1. Cache Invalidation Consumer

**Purpose**: Automatically clear Redis cache when data changes

**Topic**: `cache.invalidation`

**Consumer Group**: `cache-invalidation-group`

**Implementation**: `server/consumers/cache-invalidation-consumer.ts`

**How It Works**:
1. Listens to `cache.invalidation` topic
2. Extracts cache keys from event payload
3. Deletes specified keys from Redis
4. Logs invalidation count

**Event Format**:
```json
{
  "eventId": "uuid",
  "eventType": "CACHE_INVALIDATION",
  "cacheKeys": [
    "dashboard:stats:user:1",
    "farmers:list:user:1"
  ],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Benefits**:
- Automatic cache consistency
- No stale data served to users
- Improved data freshness
- Reduced manual cache management

**Error Handling**:
- Gracefully handles Redis connection errors
- Continues processing even if individual messages fail
- Logs all errors for debugging

---

### 2. Audit Trail Consumer

**Purpose**: Write all events to `audit_logs` table for compliance and debugging

**Topic**: `audit.trail`

**Consumer Group**: `audit-trail-group`

**Implementation**: `server/consumers/audit-trail-consumer.ts`

**How It Works**:
1. Listens to `audit.trail` topic
2. Batches events for performance (100 events or 5 seconds)
3. Writes batch to `audit_logs` table
4. Flushes remaining batch on shutdown

**Event Format**:
```json
{
  "eventId": "uuid",
  "eventType": "CREATED",
  "entityType": "farmer",
  "entityId": "123",
  "userId": 1,
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "firstName": "John",
    "lastName": "Doe"
  },
  "metadata": {
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0..."
  }
}
```

**Database Schema**:
```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  timestamp TIMESTAMP NOT NULL,
  data JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX audit_logs_timestamp_idx ON audit_logs(timestamp);
CREATE INDEX audit_logs_event_type_idx ON audit_logs(event_type);
```

**Benefits**:
- Complete audit trail for compliance
- Debugging and troubleshooting
- User activity tracking
- Security incident investigation
- Data lineage tracking

**Performance Optimization**:
- Batch processing (100 events per batch)
- Timeout-based flushing (5 seconds)
- Graceful shutdown with batch flush
- Indexed for fast queries

---

### 3. Analytics Consumer

**Purpose**: Aggregate business metrics for real-time dashboards

**Topic**: `analytics`

**Consumer Group**: `analytics-group`

**Implementation**: `server/consumers/analytics-consumer.ts`

**How It Works**:
1. Listens to `analytics` topic
2. Updates aggregated metrics in Redis
3. Tracks active users in Redis Set
4. Calculates revenue and expenses
5. Expires metrics after 1 hour

**Event Format**:
```json
{
  "eventId": "uuid",
  "eventType": "CREATED",
  "entityType": "harvest",
  "entityId": "456",
  "userId": 1,
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "quantity": 100,
    "pricePerUnit": 5.50
  }
}
```

**Metrics Tracked**:
| Metric | Description |
|--------|-------------|
| `totalUsers` | Total registered users |
| `totalFarmers` | Total farmers registered |
| `totalFarms` | Total farms created |
| `totalCrops` | Total crops planted |
| `totalLivestock` | Total livestock tracked |
| `totalHarvests` | Total harvests recorded |
| `totalExpenses` | Total expenses recorded |
| `totalRevenue` | Total revenue from harvests |
| `activeUsersToday` | Unique users active today |
| `newRegistrationsToday` | New users registered today |

**Redis Storage**:
```
analytics:metrics → JSON with all metrics (1 hour TTL)
analytics:active_users:today → Set of user IDs (expires at midnight)
```

**Benefits**:
- Real-time business intelligence
- Dashboard performance (cached metrics)
- Historical trend analysis
- User engagement tracking
- Revenue/expense tracking

**API Endpoint**:
```typescript
import { getAnalyticsMetrics } from './consumers/analytics-consumer.js';

// Get current metrics
const metrics = await getAnalyticsMetrics();
```

---

## Consumer Manager

**Purpose**: Manage lifecycle of all consumers

**Implementation**: `server/consumers/consumer-manager.ts`

**Functions**:

### `startAllConsumers()`
Starts all consumers on application startup:
1. Cache Invalidation Consumer
2. Audit Trail Consumer
3. Analytics Consumer

Returns array of running consumers.

### `stopAllConsumers()`
Gracefully stops all consumers:
1. Disconnects from Kafka
2. Flushes pending batches
3. Closes connections

### `getConsumerHealth()`
Returns consumer health status:
```json
{
  "total": 3,
  "running": 3,
  "isShuttingDown": false
}
```

**Graceful Shutdown**:
- Handles `SIGTERM` and `SIGINT` signals
- Handles `uncaughtException` and `unhandledRejection`
- Ensures all consumers disconnect cleanly
- Flushes pending audit log batches

---

## Integration with Server

The consumer manager is integrated into `server/index.ts`:

```typescript
import { startAllConsumers, stopAllConsumers, getConsumerHealth } from './consumers/consumer-manager.js';

// Start consumers after server starts
server.listen(port, async () => {
  await startAllConsumers();
});

// Stop consumers on shutdown
process.on('SIGTERM', async () => {
  await stopAllConsumers();
});

// Health check includes consumer status
app.get('/health', async (_req, res) => {
  const consumerHealth = getConsumerHealth();
  res.json({ 
    status: 'ok',
    consumers: consumerHealth
  });
});
```

---

## Event Flow Example

### Scenario: User creates a new farmer

1. **User Action**: POST `/api/trpc/farmers.create`

2. **Event Producer**: Publishes 3 events
   ```typescript
   // Event 1: Cache invalidation
   await publishEvent(TOPICS.CACHE_INVALIDATION, {
     eventId: uuid(),
     eventType: 'CACHE_INVALIDATION',
     cacheKeys: [
       'dashboard:stats:user:1',
       'farmers:list:user:1'
     ]
   });

   // Event 2: Audit trail
   await publishEvent(TOPICS.AUDIT_TRAIL, {
     eventId: uuid(),
     eventType: 'CREATED',
     entityType: 'farmer',
     entityId: newFarmer.id,
     userId: ctx.userId,
     data: newFarmer
   });

   // Event 3: Analytics
   await publishEvent(TOPICS.ANALYTICS, {
     eventId: uuid(),
     eventType: 'CREATED',
     entityType: 'farmer',
     entityId: newFarmer.id,
     userId: ctx.userId
   });
   ```

3. **Kafka**: Stores events in topics

4. **Consumers Process Events**:
   - **Cache Invalidation Consumer**: Deletes `dashboard:stats:user:1` and `farmers:list:user:1` from Redis
   - **Audit Trail Consumer**: Writes audit log to `audit_logs` table
   - **Analytics Consumer**: Increments `totalFarmers` metric in Redis

5. **Result**: 
   - Next dashboard request gets fresh data (cache miss → database query → cache set)
   - Audit log available for compliance queries
   - Analytics dashboard shows updated farmer count

---

## Testing

### Local Testing (Without Docker)

Consumers will fail to start if Kafka is not available, but the application will continue running:

```
[ConsumerManager] Starting all consumers...
[CacheInvalidationConsumer] Failed to start: KafkaJSConnectionError
[Server] Failed to start Kafka consumers: Error
[Server] Continuing without event consumers
```

### Testing with Docker

1. **Start Infrastructure**:
   ```bash
   docker-compose -f docker-compose.phase1.yml up -d
   ```

2. **Start Application**:
   ```bash
   pnpm dev
   ```

3. **Verify Consumers Started**:
   ```bash
   curl http://localhost:3000/health
   ```
   
   Expected response:
   ```json
   {
     "status": "ok",
     "redis": "connected",
     "consumers": {
       "total": 3,
       "running": 3,
       "isShuttingDown": false
     }
   }
   ```

4. **Test Cache Invalidation**:
   ```bash
   # Create a farmer (triggers cache invalidation)
   curl -X POST http://localhost:3000/api/trpc/farmers.create \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"firstName": "John", "lastName": "Doe"}'
   
   # Check Redis cache was invalidated
   docker exec farmer-redis redis-cli KEYS "dashboard:stats:*"
   # Should return empty or show cache was cleared
   ```

5. **Test Audit Trail**:
   ```bash
   # Query audit logs
   docker exec farmer-postgres psql -U postgres -d farmer_data \
     -c "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;"
   ```

6. **Test Analytics**:
   ```bash
   # Get analytics metrics from Redis
   docker exec farmer-redis redis-cli GET "analytics:metrics"
   ```

7. **Monitor Kafka**:
   - Open Kafka UI: http://localhost:8090
   - View topics: cache.invalidation, audit.trail, analytics
   - Check consumer groups and lag

---

## Monitoring

### Kafka UI

Access at http://localhost:8090 to monitor:
- Topic message counts
- Consumer lag
- Partition distribution
- Message throughput

### Prometheus Metrics

The following metrics are available at `/metrics`:

```
# Consumer-specific metrics (future enhancement)
kafka_consumer_messages_total{consumer="cache-invalidation"}
kafka_consumer_errors_total{consumer="cache-invalidation"}
kafka_consumer_lag{consumer="cache-invalidation"}
```

### Health Checks

```bash
# Check overall health
curl http://localhost:3000/health

# Check consumer health specifically
curl http://localhost:3000/health | jq '.consumers'
```

---

## Troubleshooting

### Consumer Not Starting

**Symptom**: `[ConsumerManager] Failed to start consumers`

**Causes**:
1. Kafka not running
2. Kafka connection refused
3. Topic doesn't exist

**Solution**:
```bash
# Check Kafka is running
docker ps | grep kafka

# Check Kafka logs
docker logs farmer-kafka

# Verify topics exist
docker exec farmer-kafka kafka-topics.sh --list \
  --bootstrap-server localhost:9092
```

### Consumer Lag Increasing

**Symptom**: Consumer lag > 1000 messages in Kafka UI

**Causes**:
1. Slow database writes (audit trail)
2. Slow Redis operations (cache invalidation)
3. Too many events

**Solution**:
```bash
# Increase batch size for audit trail consumer
# Edit server/consumers/audit-trail-consumer.ts
const batchSize = 500; // Increase from 100

# Add more consumer instances (scale horizontally)
# Run multiple application instances
```

### Audit Logs Not Being Written

**Symptom**: `audit_logs` table empty

**Causes**:
1. Database connection failed
2. Schema not migrated
3. Consumer not subscribed to topic

**Solution**:
```bash
# Check database connection
docker exec farmer-postgres psql -U postgres -d farmer_data \
  -c "SELECT COUNT(*) FROM audit_logs;"

# Check consumer logs
docker logs farmer-app | grep AuditTrailConsumer

# Verify topic has messages
docker exec farmer-kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic audit.trail \
  --from-beginning \
  --max-messages 10
```

---

## Performance Tuning

### Batch Processing

Adjust batch size and timeout for audit trail consumer:

```typescript
// server/consumers/audit-trail-consumer.ts
const batchSize = 100;      // Increase for higher throughput
const batchTimeout = 5000;  // Decrease for lower latency
```

### Consumer Parallelism

Increase Kafka topic partitions for parallel processing:

```bash
docker exec farmer-kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --alter \
  --topic audit.trail \
  --partitions 6
```

Then run multiple consumer instances (same consumer group).

### Redis Connection Pooling

The Redis client automatically handles connection pooling. No configuration needed.

---

## Security Considerations

### Event Data

- **Sensitive Data**: Avoid storing passwords or tokens in event payloads
- **PII**: Consider encrypting personally identifiable information
- **Audit Logs**: Ensure `audit_logs` table has proper access controls

### Consumer Authentication

- **Kafka**: Configure SASL/SSL for production
- **Redis**: Use Redis AUTH in production
- **Database**: Use strong PostgreSQL passwords

---

## Future Enhancements

1. **Dead Letter Queue**: Handle failed messages
2. **Event Replay**: Replay events for debugging
3. **Consumer Metrics**: Add Prometheus metrics for consumers
4. **Event Versioning**: Support schema evolution
5. **Event Filtering**: Filter events by user/tenant
6. **Real-time Notifications**: WebSocket notifications from events
7. **Event Sourcing**: Full event sourcing implementation

---

## Conclusion

The event consumer system provides:

✅ **Automatic cache invalidation** - No stale data  
✅ **Complete audit trails** - Compliance and debugging  
✅ **Real-time analytics** - Business intelligence  
✅ **Scalable architecture** - Horizontal scaling  
✅ **Graceful degradation** - Works without Kafka  

**Status**: Production-ready with Docker deployment

**Next Steps**: Deploy infrastructure and test end-to-end event flow
