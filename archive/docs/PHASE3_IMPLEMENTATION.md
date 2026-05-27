# Phase 3 Implementation Guide: Kafka Event Streaming

## Overview

Phase 3 adds **Apache Kafka** for real-time event streaming, enabling audit trails, automatic cache invalidation, analytics pipelines, and event-driven notifications.

## What's Included

### 1. Kafka Infrastructure ✅

**Docker Services:**
- ✅ Apache Kafka 7.6.0 (Confluent Platform)
- ✅ Zookeeper 7.6.0 (Kafka dependency)
- ✅ Kafka UI (web-based monitoring at http://localhost:8090)

**Configuration:**
- 3 partitions per topic for parallelism
- 7-day retention policy
- Snappy compression
- Auto-topic creation enabled

### 2. Event Producers ✅

**Module:** `server/kafka.ts` + `server/event-producers.ts`

**Features:**
- ✅ Kafka client with connection pooling
- ✅ Topic management and initialization
- ✅ Event creation helpers
- ✅ Graceful shutdown handling
- ✅ Error handling (non-blocking)

**Event Producers:**
- ✅ Farmer CRUD events
- ✅ Authentication events (login, register)
- ✅ Cache invalidation events
- ✅ Audit trail events
- ✅ Analytics events

### 3. Event Topics

| Topic | Purpose | Events |
|-------|---------|--------|
| `farmer.events` | Farmer data changes | CREATED, UPDATED, DELETED |
| `farm.events` | Farm data changes | CREATED, UPDATED, DELETED |
| `crop.events` | Crop data changes | CREATED, UPDATED, DELETED |
| `livestock.events` | Livestock data changes | CREATED, UPDATED, DELETED |
| `harvest.events` | Harvest data changes | CREATED, UPDATED, DELETED |
| `expense.events` | Expense data changes | CREATED, UPDATED, DELETED |
| `auth.events` | Authentication events | LOGIN, LOGOUT, REGISTER, PASSWORD_CHANGE |
| `cache.invalidation` | Cache invalidation triggers | All entity changes |
| `audit.trail` | Audit log entries | All events |
| `notifications` | User notifications | Registration, password change |
| `analytics` | Business intelligence | Login, harvest, expense events |

## Architecture

### Event Flow

```
User Action (API Call)
    ↓
tRPC Mutation Handler
    ↓
Database Write
    ↓
Event Producer (publishFarmerCreated, etc.)
    ↓
Kafka Broker
    ├─→ farmer.events topic
    ├─→ cache.invalidation topic
    ├─→ audit.trail topic
    └─→ analytics topic
    ↓
Event Consumers
    ├─→ Cache Invalidation Consumer (clears Redis)
    ├─→ Audit Trail Consumer (writes to DB)
    ├─→ Notification Consumer (sends emails)
    └─→ Analytics Consumer (aggregates metrics)
```

### Event Schema

```typescript
interface KafkaEvent<T> {
  eventId: string;           // Unique event ID
  eventType: string;         // CREATED, UPDATED, DELETED, etc.
  entityType: string;        // farmer, farm, crop, etc.
  entityId: string | number; // Entity primary key
  userId: string | number;   // User who triggered the event
  timestamp: string;         // ISO 8601 timestamp
  data: T;                   // Event payload
  metadata?: Record<string, any>; // Additional context
}
```

## Installation & Setup

### Step 1: Start Kafka Infrastructure

```bash
# Start Kafka, Zookeeper, and Kafka UI
docker-compose -f docker-compose.phase1.yml up -d zookeeper kafka kafka-ui

# Wait for services to start (30-60 seconds)
docker logs -f farmer-kafka

# Check Kafka health
docker exec farmer-kafka kafka-broker-api-versions --bootstrap-server localhost:9092
```

### Step 2: Access Kafka UI

Open the Kafka UI for monitoring:

```bash
open http://localhost:8090
```

You'll see:
- **Brokers**: Kafka broker status
- **Topics**: List of all topics with partition/replica info
- **Consumers**: Active consumer groups
- **Messages**: Browse topic messages

### Step 3: Initialize Topics

Topics are created automatically when first event is published, or manually:

```bash
# Create topics manually (optional)
docker exec farmer-kafka kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic farmer.events \
  --partitions 3 \
  --replication-factor 1
```

### Step 4: Configure Environment Variables

Add to `.env.local`:

```bash
# Kafka Configuration
KAFKA_BROKERS=localhost:9093
KAFKA_CLIENT_ID=farmer-app
```

### Step 5: Test Event Production

```bash
# Start the application
pnpm dev

# Create a farmer (triggers events)
curl -X POST http://localhost:3000/api/trpc/farmers.create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "location": "Farm Valley"}'

# Check Kafka UI to see events
open http://localhost:8090/ui/clusters/farmer-cluster/all-topics/farmer.events
```

## Integration with Application

### Publish Events from tRPC Mutations

```typescript
import { publishFarmerCreated } from './event-producers.js';

// In your tRPC mutation
const createFarmer = publicProcedure
  .input(z.object({ name: z.string(), location: z.string() }))
  .mutation(async ({ input, ctx }) => {
    // 1. Write to database
    const farmer = await db.insert(farmers).values({
      ...input,
      userId: ctx.userId,
    }).returning();

    // 2. Publish event to Kafka
    await publishFarmerCreated(farmer.id, ctx.userId, farmer);

    return farmer;
  });
```

### Consume Events

```typescript
import { createConsumer, TOPICS } from './kafka.js';

// Create consumer
const consumer = await createConsumer('cache-invalidation-group');

// Subscribe to topic
await consumer.subscribe({ topic: TOPICS.CACHE_INVALIDATION });

// Process messages
await consumer.run({
  eachMessage: async ({ topic, partition, message }) => {
    const event = JSON.parse(message.value.toString());
    
    // Invalidate cache keys
    for (const key of event.cacheKeys) {
      await redis.del(key);
    }
    
    console.log(`Cache invalidated: ${event.cacheKeys.join(', ')}`);
  },
});
```

## Event Producers Reference

### Farmer Events

```typescript
// Create farmer
await publishFarmerCreated(farmerId, userId, farmerData);

// Update farmer
await publishFarmerUpdated(farmerId, userId, farmerData);

// Delete farmer
await publishFarmerDeleted(farmerId, userId);
```

### Authentication Events

```typescript
// User login
await publishUserLogin(userId, email, { ip: '192.168.1.1', userAgent: '...' });

// User registration
await publishUserRegistered(userId, email, { firstName, lastName, role });
```

### Custom Events

```typescript
import { publishEvent, createEvent, TOPICS } from './kafka.js';

const event = createEvent(
  'CUSTOM_ACTION',
  'custom_entity',
  entityId,
  userId,
  { customData: 'value' },
  { source: 'api', version: '1.0' }
);

await publishEvent('custom.topic', event);
```

## Event Consumers (To Be Implemented)

### 1. Cache Invalidation Consumer

**Purpose**: Automatically clear Redis cache when data changes

**Implementation**:
```typescript
// server/consumers/cache-invalidation-consumer.ts
import { createConsumer, TOPICS } from '../kafka.js';
import { redis } from '../redis.js';

export async function startCacheInvalidationConsumer() {
  const consumer = await createConsumer('cache-invalidation');
  
  await consumer.subscribe({ topic: TOPICS.CACHE_INVALIDATION });
  
  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      
      // Clear cache keys
      if (event.cacheKeys) {
        await redis.del(...event.cacheKeys);
        console.log(`[Cache] Invalidated: ${event.cacheKeys.join(', ')}`);
      }
    },
  });
}
```

### 2. Audit Trail Consumer

**Purpose**: Write all events to audit_logs table for compliance

**Database Schema**:
```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  data JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
```

**Implementation**:
```typescript
// server/consumers/audit-trail-consumer.ts
import { createConsumer, TOPICS } from '../kafka.js';
import { getDb } from '../db.js';

export async function startAuditTrailConsumer() {
  const consumer = await createConsumer('audit-trail');
  const db = getDb();
  
  await consumer.subscribe({ topic: TOPICS.AUDIT_TRAIL });
  
  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      
      await db.insert(auditLogs).values({
        eventId: event.eventId,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId.toString(),
        userId: event.userId,
        timestamp: new Date(event.timestamp),
        data: event.data,
        metadata: event.metadata,
      });
    },
  });
}
```

### 3. Analytics Consumer

**Purpose**: Aggregate metrics for business intelligence

**Implementation**:
```typescript
// server/consumers/analytics-consumer.ts
import { createConsumer, TOPICS } from '../kafka.js';

export async function startAnalyticsConsumer() {
  const consumer = await createConsumer('analytics');
  
  await consumer.subscribe({ topic: TOPICS.ANALYTICS });
  
  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      
      // Send to analytics platform (e.g., Mixpanel, Amplitude)
      // Or aggregate in-house metrics
      
      console.log(`[Analytics] ${event.eventType} - ${event.entityType}`);
    },
  });
}
```

## Monitoring

### Kafka UI

Access at http://localhost:8090

**Features**:
- View all topics and partitions
- Browse messages
- Monitor consumer lag
- View broker metrics
- Manage topics (create, delete, configure)

### Prometheus Metrics

Kafka exports metrics that Prometheus can scrape:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'kafka'
    static_configs:
      - targets: ['kafka:9092']
```

**Key Metrics**:
- `kafka_server_brokertopicmetrics_messagesinpersec`: Messages per second
- `kafka_server_brokertopicmetrics_bytesinpersec`: Throughput
- `kafka_controller_kafkacontroller_activecontrollercount`: Controller status
- `kafka_server_replicamanager_underreplicatedpartitions`: Replication health

### Consumer Lag Monitoring

```bash
# Check consumer group lag
docker exec farmer-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --describe \
  --group cache-invalidation
```

## Performance Considerations

### Event Production

- **Non-blocking**: Event publication doesn't block API responses
- **Error handling**: Kafka failures don't break main flow
- **Batching**: KafkaJS automatically batches messages
- **Compression**: Snappy compression reduces network overhead

### Event Consumption

- **Parallel processing**: 3 partitions allow 3 concurrent consumers
- **At-least-once delivery**: Events may be processed multiple times (idempotency required)
- **Consumer groups**: Multiple consumers share partition load

### Scaling

**Horizontal Scaling**:
- Add more Kafka brokers for higher throughput
- Increase partition count for more parallelism
- Add more consumer instances (up to partition count)

**Vertical Scaling**:
- Increase Kafka memory (heap size)
- Use faster disks (SSD) for better I/O
- Increase network bandwidth

## Troubleshooting

### Kafka Won't Start

**Symptom**: Container exits immediately

**Solution**:
1. Check Zookeeper is running: `docker ps | grep zookeeper`
2. Check logs: `docker logs farmer-kafka`
3. Verify port 9092/9093 not in use: `lsof -i :9092`
4. Remove volumes and restart: `docker-compose down -v && docker-compose up -d`

### Events Not Being Produced

**Symptom**: No events in Kafka UI

**Solution**:
1. Check Kafka connection: `docker exec farmer-kafka kafka-broker-api-versions --bootstrap-server localhost:9092`
2. Check application logs for Kafka errors
3. Verify KAFKA_BROKERS environment variable
4. Test with manual event: `await publishFarmerCreated(1, 1, {})`

### Consumer Lag Growing

**Symptom**: Consumer lag increasing in Kafka UI

**Solution**:
1. Add more consumer instances
2. Optimize consumer processing logic
3. Increase partition count
4. Check for consumer errors in logs

### Messages Being Lost

**Symptom**: Events published but not in Kafka

**Solution**:
1. Check replication factor (should be >= 2 in production)
2. Verify acks setting (should be 'all' for durability)
3. Check disk space on Kafka broker
4. Review retention policy

## Security Considerations

### Production Deployment

**1. Enable Authentication (SASL)**:
```yaml
# docker-compose.yml
environment:
  KAFKA_SASL_ENABLED_MECHANISMS: PLAIN
  KAFKA_SASL_MECHANISM_INTER_BROKER_PROTOCOL: PLAIN
  KAFKA_SECURITY_INTER_BROKER_PROTOCOL: SASL_PLAINTEXT
```

**2. Enable Encryption (SSL)**:
```yaml
environment:
  KAFKA_SSL_KEYSTORE_LOCATION: /etc/kafka/secrets/kafka.keystore.jks
  KAFKA_SSL_KEYSTORE_PASSWORD: keystore_password
  KAFKA_SSL_KEY_PASSWORD: key_password
```

**3. Enable Authorization (ACLs)**:
```bash
# Grant producer permissions
kafka-acls --authorizer-properties zookeeper.connect=zookeeper:2181 \
  --add --allow-principal User:farmer-app \
  --producer --topic 'farmer.*'
```

**4. Network Isolation**:
- Run Kafka in private network
- Use firewall rules to restrict access
- Expose only necessary ports

## Next Steps

### Immediate (After Deployment)

1. **Implement Consumers**:
   - Cache invalidation consumer
   - Audit trail consumer
   - Analytics consumer

2. **Test Event Flow**:
   - Create test data
   - Verify events in Kafka UI
   - Check cache invalidation works
   - Verify audit logs written

3. **Monitor Performance**:
   - Check consumer lag
   - Monitor throughput
   - Review error rates

### Phase 4: Dapr Service Mesh (Recommended Next)

- Decompose into microservices
- Use Dapr pub/sub instead of direct Kafka
- Add service-to-service communication
- Implement distributed tracing

### Advanced Kafka Features

- **Kafka Streams**: Real-time stream processing
- **Kafka Connect**: Integration with external systems
- **Schema Registry**: Enforce event schema validation
- **KSQL**: SQL queries on event streams

## Conclusion

Phase 3 adds enterprise-grade event streaming with Kafka, enabling:

1. ✅ **Real-time Event Processing** for immediate reactions
2. ✅ **Audit Trail** for compliance and debugging
3. ✅ **Automatic Cache Invalidation** for data consistency
4. ✅ **Analytics Pipeline** for business intelligence
5. ✅ **Event-Driven Architecture** for scalability

The infrastructure is ready for deployment. Implement consumers and test thoroughly before production use.

**Status: INFRASTRUCTURE READY, CONSUMERS TO BE IMPLEMENTED** 🚀
