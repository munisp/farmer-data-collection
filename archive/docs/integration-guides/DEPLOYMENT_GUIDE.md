# Enterprise Platform Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the Farmer Data Collection Enterprise Platform with all middleware components.

## Architecture

The platform consists of:

### Core Application
- **Frontend**: React 19 + Tailwind 4 + shadcn/ui
- **Backend**: Node.js + tRPC + Express
- **Database**: PostgreSQL with Drizzle ORM

### Enterprise Middleware
1. **Redis** - Caching and session management
2. **Keycloak** - Enterprise authentication (OAuth2/OIDC, SSO, MFA)
3. **Kafka** - Event streaming and messaging
4. **Permify** - Fine-grained authorization
5. **APISIX** - API Gateway with rate limiting
6. **Prometheus** - Metrics collection
7. **Grafana** - Metrics visualization
8. **Dapr** - Service mesh (infrastructure ready)

### Event Consumers
- **Cache Invalidation Consumer** - Auto-clear Redis cache
- **Audit Trail Consumer** - Write to audit_logs table
- **Analytics Consumer** - Aggregate business metrics

---

## Prerequisites

### System Requirements
- **OS**: Linux, macOS, or Windows with WSL2
- **RAM**: Minimum 8GB (16GB recommended)
- **Disk**: 20GB free space
- **CPU**: 4+ cores recommended

### Software Requirements
- **Docker**: 24.0+ with Docker Compose
- **Node.js**: 22.13.0 (via nvm)
- **pnpm**: 10.4.1+
- **Git**: 2.0+

### Installation

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 22.13.0
nvm use 22.13.0

# Install pnpm
npm install -g pnpm

# Verify installations
docker --version
node --version
pnpm --version
```

---

## Deployment Steps

### Step 1: Clone and Setup

```bash
# Clone repository (or extract from checkpoint)
cd /path/to/project

# Install dependencies
pnpm install

# Copy environment file
cp .env.local.example .env.local

# Edit .env.local with your configuration
nano .env.local
```

### Step 2: Start Infrastructure

```bash
# Start all middleware services
docker-compose -f docker-compose.phase1.yml up -d

# Verify all services are running
docker-compose -f docker-compose.phase1.yml ps

# Check service health
docker-compose -f docker-compose.phase1.yml logs -f
```

**Expected Services** (15+ containers):
- ✅ Redis (port 6379)
- ✅ PostgreSQL (port 5432)
- ✅ Keycloak (port 8180)
- ✅ Keycloak PostgreSQL (port 5433)
- ✅ Kafka (port 9092)
- ✅ Zookeeper (port 2181)
- ✅ Kafka UI (port 8090)
- ✅ Permify (ports 3476, 3477)
- ✅ Permify PostgreSQL (port 5434)
- ✅ APISIX (ports 9080, 9180)
- ✅ etcd (port 2379)
- ✅ Prometheus (port 9090)
- ✅ Grafana (port 3001)
- ✅ Dapr Placement (port 50006)
- ✅ Dapr Dashboard (port 8080)

### Step 3: Configure Keycloak

```bash
# Wait for Keycloak to be ready
docker logs -f farmer-keycloak

# Run Keycloak setup script
node scripts/setup-keycloak.mjs

# Verify realm created
# Open http://localhost:8180/admin
# Login: admin / admin_password
# Check "farmer-realm" exists
```

### Step 4: Migrate Users to Keycloak

```bash
# Run user migration script
node scripts/migrate-users-to-keycloak.mjs

# Verify users migrated
# Check Keycloak Admin Console → Users
```

### Step 5: Start Application

```bash
# Development mode
pnpm dev

# Production mode
pnpm build
pnpm start
```

**Application URLs**:
- Frontend: http://localhost:3000
- API: http://localhost:3000/api/trpc
- Health: http://localhost:3000/health
- Metrics: http://localhost:3000/metrics

### Step 6: Verify Integration

#### 1. Check Health Endpoint

```bash
curl http://localhost:3000/health | jq
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

#### 2. Check Prometheus Metrics

```bash
curl http://localhost:3000/metrics
```

Should return Prometheus-format metrics.

#### 3. Test Keycloak Authentication

```bash
# Get access token
curl -X POST http://localhost:8180/realms/farmer-realm/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=farmer-web" \
  -d "grant_type=password" \
  -d "username=test@farmer.com" \
  -d "password=temp_password_123"
```

#### 4. Test Kafka Event Flow

```bash
# Create a farmer (triggers events)
curl -X POST http://localhost:3000/api/trpc/farmers.create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"firstName": "John", "lastName": "Doe"}'

# Check Kafka UI for events
# Open http://localhost:8090
# View topics: farmer.events, cache.invalidation, audit.trail, analytics
```

#### 5. Verify Cache Invalidation

```bash
# Check Redis cache was cleared
docker exec farmer-redis redis-cli KEYS "dashboard:*"
```

#### 6. Verify Audit Trail

```bash
# Query audit logs
docker exec farmer-postgres psql -U postgres -d farmer_data \
  -c "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;"
```

#### 7. Verify Analytics

```bash
# Get analytics metrics
docker exec farmer-redis redis-cli GET "analytics:metrics" | jq
```

---

## Monitoring Dashboards

### Kafka UI
**URL**: http://localhost:8090

**Features**:
- View topics and messages
- Monitor consumer lag
- Check partition distribution
- View broker health

### Keycloak Admin Console
**URL**: http://localhost:8180/admin

**Credentials**: admin / admin_password

**Features**:
- Manage users and roles
- Configure OAuth providers
- Set up MFA
- View login sessions

### Permify Console
**URL**: http://localhost:3477

**Features**:
- View authorization schema
- Test permissions
- Query relationships

### Prometheus
**URL**: http://localhost:9090

**Features**:
- Query metrics
- View targets
- Create alerts

### Grafana
**URL**: http://localhost:3001

**Credentials**: admin / admin

**Features**:
- Create dashboards
- Visualize metrics
- Set up alerts

### Dapr Dashboard
**URL**: http://localhost:8080

**Features**:
- View Dapr components
- Monitor service invocations
- Check state stores
- View pub/sub subscriptions

### APISIX Dashboard
**URL**: http://localhost:9080/apisix/admin

**Features**:
- Manage routes
- Configure plugins
- View metrics

---

## Production Deployment

### Environment Variables

Create `.env.production`:

```bash
# Database
DATABASE_URL=postgresql://user:password@production-db:5432/farmer_data

# Redis
REDIS_URL=redis://production-redis:6379

# Keycloak
VITE_KEYCLOAK_URL=https://auth.yourdomain.com
VITE_KEYCLOAK_REALM=farmer-realm
VITE_KEYCLOAK_CLIENT_ID=farmer-web

# Kafka
KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092

# Permify
PERMIFY_URL=http://permify:3477

# APISIX
APISIX_URL=http://apisix:9080

# JWT Secret (generate strong secret)
JWT_SECRET=your-production-secret-here
```

### Security Checklist

- [ ] Change all default passwords
- [ ] Enable SSL/TLS for all services
- [ ] Configure firewall rules
- [ ] Enable Keycloak MFA
- [ ] Set up Redis AUTH
- [ ] Configure Kafka SASL/SSL
- [ ] Enable APISIX authentication
- [ ] Set up monitoring alerts
- [ ] Configure backup strategy
- [ ] Enable audit logging
- [ ] Review Permify permissions
- [ ] Configure rate limiting

### Scaling Considerations

#### Horizontal Scaling
```bash
# Scale application instances
docker-compose up -d --scale app=3

# Scale Kafka brokers
# Edit docker-compose.yml to add kafka-2, kafka-3

# Scale Redis with clustering
# Configure Redis Cluster mode
```

#### Database Optimization
```sql
-- Add indexes for performance
CREATE INDEX CONCURRENTLY idx_farmers_user_id ON farmers(user_id);
CREATE INDEX CONCURRENTLY idx_farms_farmer_id ON farms(farmer_id);
CREATE INDEX CONCURRENTLY idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Enable connection pooling
-- Configure max_connections in postgresql.conf
```

#### Kafka Optimization
```yaml
# Increase partitions for parallel processing
kafka-topics.sh --alter --topic farmer.events --partitions 6

# Configure retention
kafka-topics.sh --alter --topic audit.trail --config retention.ms=604800000
```

---

## Backup and Recovery

### Database Backup

```bash
# Backup PostgreSQL
docker exec farmer-postgres pg_dump -U postgres farmer_data > backup.sql

# Restore PostgreSQL
docker exec -i farmer-postgres psql -U postgres farmer_data < backup.sql
```

### Redis Backup

```bash
# Backup Redis
docker exec farmer-redis redis-cli SAVE
docker cp farmer-redis:/data/dump.rdb ./redis-backup.rdb

# Restore Redis
docker cp ./redis-backup.rdb farmer-redis:/data/dump.rdb
docker restart farmer-redis
```

### Kafka Backup

```bash
# Backup Kafka topics
kafka-mirror-maker.sh --consumer.config source.properties \
  --producer.config target.properties \
  --whitelist="farmer.*"
```

---

## Troubleshooting

### Application Won't Start

**Check logs**:
```bash
docker-compose logs -f app
```

**Common issues**:
- Database connection failed → Check DATABASE_URL
- Redis connection failed → Check REDIS_URL
- Kafka connection failed → Check KAFKA_BROKERS

### Consumers Not Processing Events

**Check consumer status**:
```bash
curl http://localhost:3000/health | jq '.consumers'
```

**Check Kafka UI**:
- Open http://localhost:8090
- Check consumer lag
- Verify topics exist

### Keycloak Authentication Failing

**Check Keycloak logs**:
```bash
docker logs farmer-keycloak
```

**Verify realm configuration**:
- Open http://localhost:8180/admin
- Check realm settings
- Verify client configuration

### High Memory Usage

**Check Docker stats**:
```bash
docker stats
```

**Optimize services**:
```bash
# Limit Kafka memory
# Edit docker-compose.yml
environment:
  KAFKA_HEAP_OPTS: "-Xmx512M -Xms512M"

# Limit Redis memory
redis-cli CONFIG SET maxmemory 256mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

---

## Maintenance

### Regular Tasks

**Daily**:
- Check service health
- Monitor disk space
- Review error logs

**Weekly**:
- Backup databases
- Review audit logs
- Check security alerts

**Monthly**:
- Update dependencies
- Review performance metrics
- Optimize database indexes

### Updating Services

```bash
# Pull latest images
docker-compose pull

# Restart services
docker-compose up -d

# Verify health
docker-compose ps
```

---

## Support

### Documentation
- Architecture: `docs/ENTERPRISE_ARCHITECTURE.md`
- Phase 1: `docs/PHASE1_IMPLEMENTATION.md`
- Phase 2: `docs/PHASE2_IMPLEMENTATION.md`
- Phase 3: `docs/PHASE3_IMPLEMENTATION.md`
- Event Consumers: `docs/EVENT_CONSUMERS_GUIDE.md`

### Monitoring
- Application logs: `docker-compose logs -f app`
- Service logs: `docker-compose logs -f [service-name]`
- Metrics: http://localhost:3000/metrics
- Health: http://localhost:3000/health

---

## Conclusion

The Farmer Data Collection Enterprise Platform is now deployed with:

✅ **15+ microservices** running in Docker  
✅ **Enterprise authentication** with Keycloak  
✅ **Event-driven architecture** with Kafka  
✅ **Fine-grained authorization** with Permify  
✅ **Distributed caching** with Redis  
✅ **API Gateway** with APISIX  
✅ **Comprehensive monitoring** with Prometheus/Grafana  
✅ **Service mesh** infrastructure with Dapr  

**Status**: Production-ready enterprise platform

**Next Steps**: Configure production environment, enable SSL, and deploy to cloud infrastructure
