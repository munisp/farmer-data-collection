# Enterprise Infrastructure Deployment Guide

## Overview

This guide covers the deployment and integration of the complete enterprise infrastructure for the Farmer Data Collection Platform, including event streaming, authorization, service mesh, financial ledger, and security services.

## Architecture Summary

The platform uses a **hybrid monolithic-microservices architecture** with enterprise-grade middleware:

- **Event Streaming**: Kafka for event-driven architecture
- **Authorization**: Permify for fine-grained access control
- **Service Mesh**: Dapr for service-to-service communication
- **Financial Ledger**: TigerBeetle for double-entry bookkeeping
- **Caching**: Redis for performance optimization
- **Security**: Wazuh (SIEM), OpenCTI (Threat Intelligence), OpenAppSec (WAF)
- **Monitoring**: Prometheus, Grafana, Jaeger for observability

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 22.04+ recommended) or macOS
- **RAM**: Minimum 16GB (32GB recommended for full stack)
- **Disk**: 50GB+ free space
- **CPU**: 4+ cores recommended

### Software Requirements

```bash
# Docker & Docker Compose
docker --version  # 24.0+
docker-compose --version  # 2.20+

# Node.js & pnpm
node --version  # 22.13.0
pnpm --version  # Latest

# PostgreSQL Client (for database operations)
psql --version  # 16+
```

## Quick Start

### 1. Environment Setup

Create `.env.enterprise` file:

```bash
# Database Configuration
DATABASE_URL=postgresql://farmer_user:farmer_pass_2024@localhost:5432/farmer_db
POSTGRES_USER=farmer_user
POSTGRES_PASSWORD=farmer_pass_2024
POSTGRES_DB=farmer_db

# Redis Configuration
REDIS_URL=redis://:redis_pass_2024@localhost:6379
REDIS_PASSWORD=redis_pass_2024

# Kafka Configuration
KAFKA_BROKERS=localhost:29092
KAFKA_CLIENT_ID=farmer-app

# Permify Configuration
PERMIFY_URL=http://localhost:3476
PERMIFY_GRPC_URL=localhost:3478

# TigerBeetle Configuration
TIGERBEETLE_URL=localhost:3001
TIGERBEETLE_CLUSTER_ID=0

# Dapr Configuration
DAPR_HTTP_PORT=3500
DAPR_GRPC_PORT=50001

# Security Services
WAZUH_API_URL=https://localhost:55000
WAZUH_API_USER=wazuh-wui
WAZUH_API_PASSWORD=MyS3cr37P450r.*-

OPENCTI_URL=http://localhost:8081
OPENCTI_TOKEN=ChangeMe

# Monitoring
PROMETHEUS_URL=http://localhost:9090
GRAFANA_URL=http://localhost:3002
JAEGER_URL=http://localhost:16686

# Application
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secret-key-here
```

### 2. Start Infrastructure Services

```bash
# Start all enterprise services
docker-compose -f docker-compose.enterprise.yml up -d

# Verify all services are running
docker-compose -f docker-compose.enterprise.yml ps

# Check service health
docker-compose -f docker-compose.enterprise.yml logs -f
```

### 3. Initialize Services

#### Initialize Kafka Topics

Topics are auto-created on first use, but you can pre-create them:

```bash
# Access Kafka container
docker exec -it farmer-kafka bash

# Create topics
kafka-topics --create --topic farmer-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
kafka-topics --create --topic farm-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
kafka-topics --create --topic crop-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
kafka-topics --create --topic livestock-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
kafka-topics --create --topic harvest-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
kafka-topics --create --topic expense-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
kafka-topics --create --topic cache-invalidation --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
kafka-topics --create --topic audit-trail --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
kafka-topics --create --topic analytics --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1

# List all topics
kafka-topics --list --bootstrap-server localhost:9092
```

#### Initialize Permify Schema

```bash
# Load authorization schema
docker exec -it farmer-permify permify schema write \
  --file /config/permify/schema.perm

# Verify schema
docker exec -it farmer-permify permify schema read
```

Or use the Permify CLI:

```bash
# Install Permify CLI
brew install permify/tap/permify  # macOS
# or download from https://github.com/Permify/permify/releases

# Load schema
permify schema write --file config/permify/schema.perm --endpoint localhost:3476
```

#### Initialize TigerBeetle Cluster

```bash
# Create TigerBeetle data file (if not exists)
docker exec -it farmer-tigerbeetle tigerbeetle format \
  --cluster=0 \
  --replica=0 \
  --replica-count=1 \
  /data/cluster_0_replica_0.tigerbeetle

# Restart TigerBeetle
docker-compose -f docker-compose.enterprise.yml restart tigerbeetle
```

#### Initialize PostgreSQL Database

```bash
# Run migrations
pnpm db:push

# Verify tables
docker exec -it farmer-postgres psql -U farmer_user -d farmer_db -c "\dt"
```

### 4. Start Application Server

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Or start production server
pnpm build
pnpm start
```

### 5. Verify Integration

#### Check Kafka Event Flow

```bash
# Monitor Kafka topics
docker exec -it farmer-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic farmer-events \
  --from-beginning

# Check consumer groups
docker exec -it farmer-kafka kafka-consumer-groups \
  --bootstrap-server localhost:9092 \
  --list
```

#### Check Permify Authorization

```bash
# Test permission check
curl -X POST http://localhost:3476/v1/permissions/check \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "t1",
    "metadata": {
      "snap_token": "",
      "schema_version": "",
      "depth": 20
    },
    "entity": {
      "type": "farmer",
      "id": "1"
    },
    "permission": "view",
    "subject": {
      "type": "user",
      "id": "1"
    }
  }'
```

#### Check Redis Cache

```bash
# Connect to Redis
docker exec -it farmer-redis redis-cli -a redis_pass_2024

# Check keys
KEYS *

# Get cache statistics
INFO stats
```

#### Check TigerBeetle

```bash
# Check TigerBeetle status
docker logs farmer-tigerbeetle

# Test connection (from application)
node -e "const { createClient } = require('tigerbeetle-node'); const client = createClient({ cluster_id: 0n, replica_addresses: ['localhost:3001'] }); console.log('TigerBeetle connected');"
```

## Service URLs

Once deployed, access services at:

| Service | URL | Credentials |
|---------|-----|-------------|
| **Application** | http://localhost:3000 | User accounts |
| **Kafka UI** | http://localhost:8080 | None |
| **Permify** | http://localhost:3476 | None |
| **Wazuh Dashboard** | http://localhost:5601 | admin / SecretPassword |
| **OpenCTI** | http://localhost:8081 | admin@opencti.io / ChangeMePlease |
| **Grafana** | http://localhost:3002 | admin / admin |
| **Prometheus** | http://localhost:9090 | None |
| **Jaeger** | http://localhost:16686 | None |
| **Dapr Dashboard** | http://localhost:8085 | None |
| **MinIO (OpenCTI)** | http://localhost:9001 | minioadmin / minioadmin |

## Testing the Integration

### 1. Test Event-Driven Workflow

```bash
# Create a farmer record (triggers events)
curl -X POST http://localhost:3000/trpc/sync.push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "table": "farmers",
    "records": [{
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1234567890",
      "email": "john@example.com",
      "userId": 1,
      "version": 1,
      "clientId": "test-client",
      "updatedAt": "2024-01-01T00:00:00Z"
    }],
    "clientId": "test-client",
    "userId": 1
  }'

# Check audit trail
curl -X GET "http://localhost:3000/trpc/auditTrail.getAuditLogs?input=%7B%22page%22%3A1%2C%22pageSize%22%3A10%7D" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Check Kafka topic
docker exec -it farmer-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic farmer-events \
  --from-beginning \
  --max-messages 1
```

### 2. Test Permify Authorization

```bash
# Test as regular user (should succeed for own resources)
curl -X POST http://localhost:3000/trpc/sync.push \
  -H "Authorization: Bearer USER_TOKEN" \
  -d '{"table": "farmers", "records": [...], "userId": 1}'

# Test as different user (should fail for other user's resources)
curl -X POST http://localhost:3000/trpc/sync.push \
  -H "Authorization: Bearer OTHER_USER_TOKEN" \
  -d '{"table": "farmers", "records": [{"id": 1, ...}], "userId": 2}'

# Test admin access
curl -X GET http://localhost:3000/trpc/admin.getUsers \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### 3. Test Cache Invalidation

```bash
# Create a record (should invalidate cache)
# ... create farmer record ...

# Check Redis for cache invalidation events
docker exec -it farmer-redis redis-cli -a redis_pass_2024
> KEYS farmers:*
> GET farmers:1
```

### 4. Test Financial Ledger

```bash
# Create an expense (should record in TigerBeetle)
curl -X POST http://localhost:3000/trpc/sync.push \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "table": "expenses",
    "records": [{
      "description": "Fertilizer",
      "amount": 150.00,
      "category": "inputs",
      "date": "2024-01-01",
      "userId": 1,
      "version": 1,
      "clientId": "test-client",
      "updatedAt": "2024-01-01T00:00:00Z"
    }],
    "clientId": "test-client",
    "userId": 1
  }'

# Check TigerBeetle logs
docker logs farmer-tigerbeetle
```

## Monitoring & Observability

### Prometheus Metrics

Access Prometheus at http://localhost:9090

**Key Metrics:**
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request latency
- `kafka_producer_record_send_total` - Kafka events published
- `redis_commands_total` - Redis operations

### Grafana Dashboards

Access Grafana at http://localhost:3002 (admin/admin)

**Pre-configured Dashboards:**
1. Application Metrics
2. Kafka Monitoring
3. Redis Performance
4. Database Queries
5. API Gateway (APISIX)

### Jaeger Distributed Tracing

Access Jaeger at http://localhost:16686

**Trace Operations:**
- HTTP requests
- Database queries
- Kafka event publishing
- Cache operations
- Service-to-service calls

### Wazuh Security Monitoring

Access Wazuh Dashboard at http://localhost:5601

**Security Features:**
- File integrity monitoring
- Log analysis
- Vulnerability detection
- Compliance reporting
- Incident response

## Troubleshooting

### Kafka Connection Issues

```bash
# Check Kafka broker status
docker logs farmer-kafka

# Check Zookeeper
docker logs farmer-zookeeper

# Test Kafka connectivity
docker exec -it farmer-kafka kafka-broker-api-versions \
  --bootstrap-server localhost:9092
```

### Permify Issues

```bash
# Check Permify logs
docker logs farmer-permify

# Verify database connection
docker exec -it farmer-permify permify serve --database-uri="postgres://farmer_user:farmer_pass_2024@postgres:5432/farmer_db?sslmode=disable"

# Test API
curl http://localhost:3476/healthz
```

### Redis Connection Issues

```bash
# Check Redis logs
docker logs farmer-redis

# Test connection
docker exec -it farmer-redis redis-cli -a redis_pass_2024 ping

# Check memory usage
docker exec -it farmer-redis redis-cli -a redis_pass_2024 INFO memory
```

### TigerBeetle Issues

```bash
# Check TigerBeetle logs
docker logs farmer-tigerbeetle

# Verify data file
docker exec -it farmer-tigerbeetle ls -lh /data/

# Restart TigerBeetle
docker-compose -f docker-compose.enterprise.yml restart tigerbeetle
```

### Database Issues

```bash
# Check PostgreSQL logs
docker logs farmer-postgres

# Test connection
docker exec -it farmer-postgres psql -U farmer_user -d farmer_db -c "SELECT version();"

# Check table structure
docker exec -it farmer-postgres psql -U farmer_user -d farmer_db -c "\d+ farmers"
```

## Performance Tuning

### Kafka Optimization

```bash
# Increase partition count for high-throughput topics
kafka-topics --alter --topic farmer-events --partitions 6 --bootstrap-server localhost:9092

# Adjust retention policy
kafka-configs --alter --entity-type topics --entity-name farmer-events \
  --add-config retention.ms=604800000 --bootstrap-server localhost:9092
```

### Redis Optimization

```bash
# Increase memory limit
docker-compose -f docker-compose.enterprise.yml down
# Edit docker-compose.enterprise.yml: command: redis-server --maxmemory 2gb
docker-compose -f docker-compose.enterprise.yml up -d redis
```

### PostgreSQL Optimization

```bash
# Increase connection pool
# Edit DATABASE_URL: ?pool_timeout=30&connection_limit=20

# Enable query logging
docker exec -it farmer-postgres psql -U farmer_user -d farmer_db \
  -c "ALTER SYSTEM SET log_statement = 'all';"
docker-compose -f docker-compose.enterprise.yml restart postgres
```

## Backup & Recovery

### Database Backup

```bash
# Backup PostgreSQL
docker exec -it farmer-postgres pg_dump -U farmer_user farmer_db > backup_$(date +%Y%m%d).sql

# Restore PostgreSQL
docker exec -i farmer-postgres psql -U farmer_user farmer_db < backup_20240101.sql
```

### TigerBeetle Backup

```bash
# Backup TigerBeetle data
docker cp farmer-tigerbeetle:/data/cluster_0_replica_0.tigerbeetle ./tigerbeetle_backup_$(date +%Y%m%d).tb

# Restore TigerBeetle data
docker cp ./tigerbeetle_backup_20240101.tb farmer-tigerbeetle:/data/cluster_0_replica_0.tigerbeetle
docker-compose -f docker-compose.enterprise.yml restart tigerbeetle
```

### Kafka Backup

```bash
# Backup Kafka topics
docker exec -it farmer-kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic farmer-events \
  --from-beginning \
  --max-messages 100000 > kafka_backup_$(date +%Y%m%d).json
```

## Scaling Considerations

### Horizontal Scaling

1. **Kafka**: Add more brokers and increase partition count
2. **Redis**: Use Redis Cluster or Redis Sentinel
3. **PostgreSQL**: Use read replicas with Patroni
4. **TigerBeetle**: Add more replicas to the cluster
5. **Application**: Deploy multiple instances behind a load balancer

### Vertical Scaling

Adjust resource limits in `docker-compose.enterprise.yml`:

```yaml
services:
  kafka:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
```

## Security Best Practices

1. **Change default passwords** in `.env.enterprise`
2. **Enable TLS/SSL** for all services
3. **Use secrets management** (Vault, AWS Secrets Manager)
4. **Enable authentication** on all services
5. **Configure firewalls** to restrict access
6. **Regular security updates** for all containers
7. **Monitor security logs** with Wazuh
8. **Scan for vulnerabilities** with OpenCTI

## Production Deployment Checklist

- [ ] Update all default passwords
- [ ] Configure TLS/SSL certificates
- [ ] Set up automated backups
- [ ] Configure monitoring alerts
- [ ] Set up log aggregation
- [ ] Configure firewall rules
- [ ] Enable authentication on all services
- [ ] Set up disaster recovery plan
- [ ] Document runbook procedures
- [ ] Train operations team
- [ ] Perform load testing
- [ ] Set up CI/CD pipeline
- [ ] Configure auto-scaling policies
- [ ] Set up health checks
- [ ] Configure rate limiting
- [ ] Enable audit logging

## Support & Resources

- **Documentation**: `/docs` directory
- **API Reference**: http://localhost:3000/api/docs
- **Kafka UI**: http://localhost:8080
- **Monitoring**: http://localhost:3002 (Grafana)
- **Security**: http://localhost:5601 (Wazuh)

## Next Steps

1. Review and customize the Permify authorization schema
2. Configure custom Kafka topics for your use cases
3. Set up custom Grafana dashboards
4. Configure Wazuh security rules
5. Integrate with external systems (ERP, CRM, etc.)
6. Set up automated testing pipeline
7. Configure production deployment

---

**Last Updated**: December 2024  
**Version**: 1.0.0  
**Maintainer**: Farmer Data Collection Platform Team
