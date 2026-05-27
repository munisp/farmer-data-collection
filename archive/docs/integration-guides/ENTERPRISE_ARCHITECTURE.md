# Enterprise Architecture - Farmer Data Collection Platform

## Overview

This document describes the enterprise-grade architecture for the Farmer Data Collection Platform, transforming it from a monolithic application into a distributed microservices platform with comprehensive middleware integration.

## Architecture Principles

1. **Microservices Architecture**: Decompose the monolith into independent, scalable services
2. **Event-Driven Design**: Use event streaming for loose coupling and real-time processing
3. **API Gateway Pattern**: Centralized entry point for all client requests
4. **Service Mesh**: Manage service-to-service communication with Dapr
5. **Workflow Orchestration**: Handle complex business processes with Temporal
6. **Fine-Grained Authorization**: Implement attribute and relationship-based access control
7. **Financial Integrity**: Use immutable ledger for all financial transactions

## System Components

### 1. API Gateway Layer

**APISIX API Gateway**
- **Purpose**: Single entry point for all client requests
- **Features**:
  - Request routing to microservices
  - Rate limiting and throttling
  - Authentication and authorization
  - Request/response transformation
  - Load balancing
  - Circuit breaker patterns
  - API versioning
- **Port**: 9080 (HTTP), 9443 (HTTPS)
- **Admin API**: 9180

### 2. Authentication & Authorization

**Keycloak (Identity & Access Management)**
- **Purpose**: Enterprise-grade authentication and SSO
- **Features**:
  - OAuth 2.0 / OpenID Connect
  - User federation (LDAP, Active Directory)
  - Social login integration
  - Multi-factor authentication
  - Role-based access control
  - Single sign-on (SSO)
- **Port**: 8080
- **Database**: PostgreSQL (dedicated schema)

**Permify (Fine-Grained Authorization)**
- **Purpose**: Attribute and relationship-based access control
- **Features**:
  - Resource-level permissions
  - Relationship-based access (farmer owns farm)
  - Attribute-based policies
  - Permission caching
  - Audit trail
- **Port**: 3476 (HTTP), 3478 (gRPC)

### 3. Caching & Session Management

**Redis**
- **Purpose**: High-performance caching and session storage
- **Use Cases**:
  - User session storage
  - Database query caching
  - Dashboard statistics caching
  - Real-time pub/sub messaging
  - Rate limiting counters
- **Port**: 6379
- **Persistence**: RDB + AOF

### 4. Event Streaming & Messaging

**Apache Kafka**
- **Purpose**: Distributed event streaming platform
- **Topics**:
  - `farmer.events` - Farmer lifecycle events
  - `farm.events` - Farm operations events
  - `harvest.events` - Harvest recording events
  - `expense.events` - Financial transaction events
  - `analytics.events` - Analytics and reporting events
- **Components**:
  - Zookeeper (port 2181)
  - Kafka Broker (port 9092)
  - Schema Registry (port 8081)
- **Retention**: 7 days (configurable)

**Fluvio**
- **Purpose**: Real-time data streaming with SQL queries
- **Use Cases**:
  - Real-time analytics
  - Stream processing
  - Data transformation pipelines
- **Port**: 9003

### 5. Service Mesh & Communication

**Dapr (Distributed Application Runtime)**
- **Purpose**: Simplify microservices development
- **Features**:
  - Service-to-service invocation
  - State management
  - Pub/sub messaging
  - Resource bindings
  - Secrets management
  - Observability (tracing, metrics)
  - Resiliency (retries, circuit breakers)
- **Sidecar Port**: 3500 (per service)
- **Dashboard**: 8080

### 6. Workflow Orchestration

**Temporal**
- **Purpose**: Durable workflow execution
- **Workflows**:
  - Farmer onboarding process
  - Harvest processing pipeline
  - Report generation workflow
  - Data synchronization workflow
  - Bulk import/export operations
- **Components**:
  - Temporal Server (port 7233)
  - Temporal UI (port 8088)
  - Worker processes
- **Database**: PostgreSQL (dedicated schema)

### 7. Financial Ledger

**TigerBeetle**
- **Purpose**: High-performance financial ledger
- **Features**:
  - Double-entry bookkeeping
  - ACID transactions
  - Immutable audit trail
  - High throughput (1M+ TPS)
  - Multi-currency support
- **Port**: 3000 (gRPC)
- **Cluster**: 3 replicas for HA

### 8. Data Layer

**PostgreSQL**
- **Purpose**: Primary data store
- **Schemas**:
  - `public` - Application data (farmers, farms, crops, etc.)
  - `keycloak` - Identity management
  - `temporal` - Workflow state
  - `audit` - Audit logs
- **Port**: 5432
- **Replication**: Master-slave (optional)

## Microservices Architecture

### Service Decomposition

#### 1. **Auth Service**
- **Responsibility**: Authentication and user management
- **Technology**: Node.js + Keycloak client
- **Port**: 3001
- **Database**: Keycloak PostgreSQL schema
- **Events Published**:
  - `user.registered`
  - `user.logged_in`
  - `user.logged_out`

#### 2. **Farmer Service**
- **Responsibility**: Farmer profile management
- **Technology**: Node.js + tRPC
- **Port**: 3002
- **Database**: PostgreSQL `farmers` table
- **Events Published**:
  - `farmer.created`
  - `farmer.updated`
  - `farmer.deleted`
- **Events Consumed**:
  - `user.registered` (create farmer profile)

#### 3. **Farm Service**
- **Responsibility**: Farm and land management
- **Technology**: Node.js + tRPC
- **Port**: 3003
- **Database**: PostgreSQL `farms` table
- **Events Published**:
  - `farm.created`
  - `farm.updated`
  - `farm.deleted`

#### 4. **Crop Service**
- **Responsibility**: Crop cultivation tracking
- **Technology**: Node.js + tRPC
- **Port**: 3004
- **Database**: PostgreSQL `crops` table
- **Events Published**:
  - `crop.planted`
  - `crop.updated`
  - `crop.harvested`

#### 5. **Livestock Service**
- **Responsibility**: Livestock management
- **Technology**: Node.js + tRPC
- **Port**: 3005
- **Database**: PostgreSQL `livestock` table
- **Events Published**:
  - `livestock.added`
  - `livestock.updated`
  - `livestock.sold`

#### 6. **Harvest Service**
- **Responsibility**: Harvest recording and tracking
- **Technology**: Node.js + tRPC
- **Port**: 3006
- **Database**: PostgreSQL `harvests` table
- **Events Published**:
  - `harvest.recorded`
  - `harvest.updated`

#### 7. **Expense Service**
- **Responsibility**: Financial expense tracking
- **Technology**: Node.js + TigerBeetle client
- **Port**: 3007
- **Database**: PostgreSQL `expenses` table + TigerBeetle ledger
- **Events Published**:
  - `expense.recorded`
  - `expense.updated`
  - `transaction.posted`

#### 8. **Analytics Service**
- **Responsibility**: Data analytics and reporting
- **Technology**: Node.js + tRPC
- **Port**: 3008
- **Database**: PostgreSQL (read replicas)
- **Events Consumed**:
  - All domain events for real-time analytics

#### 9. **Sync Service**
- **Responsibility**: Client-server data synchronization
- **Technology**: Node.js + PGlite sync protocol
- **Port**: 3009
- **Database**: PostgreSQL + Redis cache

#### 10. **Notification Service**
- **Responsibility**: Push notifications and alerts
- **Technology**: Node.js + Redis pub/sub
- **Port**: 3010
- **Events Consumed**:
  - All domain events for notification triggers

### Frontend Application

**React Web App**
- **Technology**: React 19 + Vite + PGlite
- **Port**: 3000
- **Features**:
  - Offline-first architecture
  - Local PGlite database
  - Background sync with server
  - Real-time updates via WebSocket
- **Authentication**: Keycloak OIDC
- **API Communication**: APISIX Gateway

## Data Flow Patterns

### 1. Command Flow (Write Operations)

```
Client → APISIX Gateway → Service (via Dapr)
                              ↓
                         Validate with Permify
                              ↓
                         Write to PostgreSQL
                              ↓
                         Publish Event to Kafka
                              ↓
                         Update Redis Cache
```

### 2. Query Flow (Read Operations)

```
Client → APISIX Gateway → Service (via Dapr)
                              ↓
                         Check Redis Cache
                              ↓ (cache miss)
                         Query PostgreSQL
                              ↓
                         Update Redis Cache
                              ↓
                         Return Response
```

### 3. Event-Driven Flow

```
Service A → Publish Event to Kafka
                ↓
           Kafka Topic
                ↓
           Service B (Consumer) → Process Event
                                      ↓
                                  Update State
                                      ↓
                                  Publish New Event
```

### 4. Workflow Orchestration Flow

```
Client → Trigger Workflow (Temporal)
              ↓
         Temporal Workflow
              ↓
         Execute Activities (call services via Dapr)
              ↓
         Handle Retries/Failures
              ↓
         Complete Workflow
```

## Security Architecture

### Authentication Flow

1. User accesses application
2. Redirect to Keycloak login
3. User authenticates (username/password, MFA, social login)
4. Keycloak issues JWT access token and refresh token
5. Client stores tokens securely
6. All API requests include Bearer token
7. APISIX validates token with Keycloak
8. Service receives validated user context

### Authorization Flow

1. Service receives authenticated request
2. Extract user identity and resource
3. Call Permify to check permissions
4. Permify evaluates policies and relationships
5. Return allow/deny decision
6. Service proceeds or returns 403 Forbidden

### Data Security

- **Encryption at Rest**: PostgreSQL encryption, TigerBeetle encryption
- **Encryption in Transit**: TLS for all service communication
- **Secrets Management**: Dapr secrets with Kubernetes/Vault backend
- **API Security**: Rate limiting, IP whitelisting, WAF rules

## Scalability & High Availability

### Horizontal Scaling

- **Stateless Services**: Scale to N instances behind load balancer
- **Kafka**: Multi-broker cluster with replication factor 3
- **Redis**: Redis Cluster or Sentinel for HA
- **PostgreSQL**: Read replicas for query distribution
- **TigerBeetle**: 3+ node cluster for fault tolerance

### Load Balancing

- **APISIX**: Round-robin, least connections, consistent hashing
- **Dapr**: Built-in load balancing for service invocation
- **Kafka**: Partition-based load distribution

### Fault Tolerance

- **Circuit Breakers**: Dapr resiliency policies
- **Retries**: Exponential backoff with jitter
- **Timeouts**: Per-service timeout configuration
- **Health Checks**: Liveness and readiness probes
- **Graceful Degradation**: Fallback to cached data

## Observability

### Logging

- **Centralized Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **Structured Logs**: JSON format with correlation IDs
- **Log Levels**: DEBUG, INFO, WARN, ERROR
- **Retention**: 30 days

### Metrics

- **Metrics Collection**: Prometheus
- **Dashboards**: Grafana
- **Key Metrics**:
  - Request rate, latency, error rate (RED)
  - CPU, memory, disk usage
  - Database connection pool stats
  - Kafka consumer lag
  - Cache hit/miss ratio

### Tracing

- **Distributed Tracing**: Jaeger or Zipkin
- **Trace Context**: W3C Trace Context standard
- **Sampling**: Adaptive sampling (100% errors, 1% success)

### Monitoring

- **Health Checks**: `/health` endpoint per service
- **Alerting**: Prometheus Alertmanager
- **On-Call**: PagerDuty integration
- **SLOs**: 99.9% uptime, <200ms p95 latency

## Deployment Architecture

### Development Environment

- **Docker Compose**: All services in containers
- **Local Kubernetes**: Minikube or Kind (optional)
- **Hot Reload**: Nodemon for backend, Vite HMR for frontend

### Production Environment

- **Container Orchestration**: Kubernetes
- **Cloud Platform**: AWS, GCP, or Azure
- **Infrastructure as Code**: Terraform
- **CI/CD**: GitHub Actions or GitLab CI
- **Deployment Strategy**: Blue-green or canary

## Cost Optimization

- **Auto-scaling**: Scale down during low traffic
- **Resource Limits**: CPU and memory limits per service
- **Caching**: Reduce database load with Redis
- **Read Replicas**: Offload read queries from master
- **Spot Instances**: Use for non-critical workloads

## Migration Strategy

### Phase 1: Infrastructure Setup
1. Deploy all middleware services
2. Configure networking and security
3. Set up monitoring and logging

### Phase 2: Authentication Migration
1. Migrate users to Keycloak
2. Update frontend to use OIDC
3. Replace JWT validation with Keycloak

### Phase 3: Service Decomposition
1. Extract one service at a time
2. Implement event publishing
3. Update API gateway routes

### Phase 4: Event-Driven Migration
1. Implement event consumers
2. Migrate to CQRS pattern
3. Add event sourcing

### Phase 5: Workflow Migration
1. Identify long-running processes
2. Implement Temporal workflows
3. Migrate batch jobs

### Phase 6: Financial System Migration
1. Migrate expenses to TigerBeetle
2. Implement double-entry bookkeeping
3. Add reconciliation processes

## Conclusion

This enterprise architecture provides a scalable, resilient, and maintainable platform for farmer data collection. The microservices approach enables independent scaling and deployment, while the event-driven design ensures loose coupling and real-time processing capabilities.
