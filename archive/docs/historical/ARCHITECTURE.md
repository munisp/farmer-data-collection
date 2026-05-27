# Platform Architecture

## System Overview

The Farmer Data Collection Platform is a cloud-native, event-driven microservices architecture designed for high availability, scalability, and resilience.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Gateway (APISIX)                     │
│                    + OpenAppSec WAF + SSL/TLS                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼────────┐  ┌──────▼──────┐  ┌───────▼────────┐
│  auth-service  │  │farmer-service│  │marketplace-svc │
│  (Go+Keycloak) │  │    (Go)      │  │     (Go)       │
└───────┬────────┘  └──────┬───────┘  └───────┬────────┘
        │                  │                  │
┌───────▼────────┐  ┌──────▼──────┐  ┌───────▼────────┐
│analytics-svc   │  │weather-svc  │  │notification-svc│
│  (Python)      │  │  (Python)   │  │   (Python)     │
└───────┬────────┘  └──────┬───────┘  └───────┬────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼────────┐  ┌──────▼──────┐  ┌───────▼────────┐
│  Kafka Cluster │  │Redis Cluster│  │PostgreSQL HA   │
│  (3 brokers)   │  │  (3 nodes)  │  │  + PgBouncer   │
└────────────────┘  └─────────────┘  └────────────────┘
```

## Components

### Frontend Layer

**Technology:** React 19 + TypeScript + Vite

**Features:**
- Responsive UI with Tailwind CSS
- Real-time updates via tRPC
- Offline-first with PGlite
- Progressive Web App (PWA)

### API Gateway

**Technology:** Apache APISIX + etcd cluster

**Capabilities:**
- Request routing and load balancing
- Rate limiting and throttling
- JWT authentication
- Request/response transformation
- Metrics collection
- Circuit breaker patterns

**Security:** OpenAppSec WAF for DDoS protection and threat detection

### Microservices

#### auth-service (Go)
- **Purpose:** Authentication and authorization
- **Tech:** Go, Keycloak, Permify
- **Features:** JWT tokens, RBAC, SSO
- **Port:** 8080

#### farmer-service (Go)
- **Purpose:** Core farmer/farm/crop/livestock management
- **Tech:** Go, PostgreSQL, Kafka
- **Features:** CRUD operations, geospatial queries, event publishing
- **Port:** 8081

#### analytics-service (Python)
- **Purpose:** Geospatial analytics and yield analysis
- **Tech:** Python, Apache Sedona, PostGIS
- **Features:** Clustering, heatmaps, predictive analytics
- **Port:** 8082

#### notification-service (Python)
- **Purpose:** Multi-channel notifications
- **Tech:** Python, Africa's Talking API
- **Features:** SMS, Voice, Email, USSD
- **Port:** 8083

#### weather-service (Python)
- **Purpose:** Weather data and forecasts
- **Tech:** Python, OpenWeatherMap API
- **Features:** Current weather, forecasts, agricultural indices
- **Port:** 8084

#### iot-service (Python)
- **Purpose:** IoT sensor data ingestion
- **Tech:** Python, MQTT, Kafka
- **Features:** Real-time sensor data, alerts, anomaly detection
- **Port:** 8085

#### ml-service (Python)
- **Purpose:** AI/ML inference
- **Tech:** Python, IBM Granite, TensorFlow
- **Features:** Disease detection, yield prediction, chatbot
- **Port:** 8086

#### marketplace-service (Go)
- **Purpose:** Agricultural product marketplace
- **Tech:** Go, PostgreSQL, Stripe
- **Features:** Product listings, orders, reviews, payments
- **Port:** 8087

#### erp-integration-service (Go)
- **Purpose:** ERPNext synchronization
- **Tech:** Go, ERPNext API
- **Features:** Bi-directional sync, event-driven updates
- **Port:** 8088

### Infrastructure Services

#### PostgreSQL HA
- **Setup:** Primary + Replica with PgBouncer
- **Features:** Automatic failover, connection pooling
- **Port:** 5432 (primary), 6432 (PgBouncer)

#### Redis Cluster
- **Setup:** 3 nodes with cluster mode
- **Features:** Automatic sharding, high availability
- **Ports:** 6379, 6380, 6381

#### Kafka Cluster
- **Setup:** 3 brokers in KRaft mode (no Zookeeper)
- **Features:** Event streaming, replication factor 3
- **Ports:** 9092, 9093, 9094

#### Keycloak HA
- **Setup:** 2 instances with shared database
- **Features:** SSO, OAuth2, OpenID Connect
- **Ports:** 8080, 8081

#### Permify
- **Purpose:** Fine-grained authorization
- **Features:** Relationship-based access control
- **Port:** 3476

#### Temporal
- **Purpose:** Workflow orchestration
- **Features:** Durable workflows, retries, compensation
- **Port:** 7233

#### TigerBeetle
- **Purpose:** Financial ledger
- **Features:** Double-entry accounting, ACID transactions
- **Port:** 3000

#### MinIO + Trino
- **Purpose:** Data lakehouse
- **Features:** S3-compatible storage, SQL queries
- **Ports:** 9000 (MinIO), 8082 (Trino)

#### Prometheus + Grafana
- **Purpose:** Monitoring and observability
- **Features:** Metrics collection, dashboards, alerts
- **Ports:** 9090 (Prometheus), 3001 (Grafana)

## Data Flow

### Write Path

```
User → API Gateway → Microservice → PostgreSQL
                                   → Kafka (event)
                                   → Redis (cache)
```

### Read Path

```
User → API Gateway → Microservice → Redis (cache hit)
                                   → PostgreSQL (cache miss)
```

### Event Flow

```
Microservice → Kafka → Event Consumers → Analytics/Notifications/Audit
```

## Communication Patterns

### Synchronous
- REST API via APISIX
- tRPC for frontend-backend communication
- gRPC for service-to-service (future)

### Asynchronous
- Kafka for event streaming
- Temporal for workflow orchestration
- Redis Pub/Sub for real-time updates

## Data Storage

### Operational Data
- **PostgreSQL:** Transactional data (farmers, farms, crops)
- **Redis:** Session data, cache, real-time state

### Analytical Data
- **MinIO:** Raw data lake (Bronze layer)
- **Trino:** Query engine for analytics (Silver/Gold layers)

### Event Store
- **Kafka:** Event sourcing, audit trail

## Security

### Authentication
- JWT tokens issued by Keycloak
- OAuth2/OpenID Connect for SSO
- API keys for service-to-service

### Authorization
- Permify for fine-grained permissions
- Role-based access control (RBAC)
- Attribute-based access control (ABAC)

### Network Security
- OpenAppSec WAF for DDoS protection
- TLS/SSL for encryption in transit
- Network policies in Kubernetes

### Data Security
- Encryption at rest (PostgreSQL, MinIO)
- Encryption in transit (TLS everywhere)
- Secrets management (Kubernetes Secrets/Vault)

## Scalability

### Horizontal Scaling
- Stateless microservices (scale to N instances)
- Kafka partitioning for parallel processing
- Redis cluster for distributed caching

### Vertical Scaling
- PostgreSQL read replicas
- Resource limits per service
- Auto-scaling based on metrics

## High Availability

### Service Level
- Multiple instances per microservice
- Health checks and readiness probes
- Circuit breakers and retries

### Data Level
- PostgreSQL primary-replica replication
- Redis cluster with automatic failover
- Kafka replication factor 3

### Infrastructure Level
- Multi-zone deployment (Kubernetes)
- Load balancing (APISIX)
- Backup and disaster recovery

## Monitoring

### Metrics
- Prometheus for metrics collection
- Grafana for visualization
- Custom business metrics

### Logging
- Structured logging (JSON)
- Centralized log aggregation (future: Loki)
- Log retention policies

### Tracing
- OpenTelemetry instrumentation
- Distributed tracing (future: Jaeger/Tempo)
- Performance profiling

## Deployment

### Development
- Docker Compose for local development
- Hot reload for rapid iteration

### Production
- Kubernetes for orchestration
- Helm charts for deployment
- GitOps with ArgoCD (future)

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, tRPC, Drizzle ORM |
| Microservices | Go, Python |
| API Gateway | Apache APISIX |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Messaging | Kafka 3.6 (KRaft) |
| Auth | Keycloak 23 |
| Authorization | Permify |
| Workflows | Temporal |
| Ledger | TigerBeetle |
| Lakehouse | MinIO + Trino |
| Monitoring | Prometheus + Grafana |
| Security | OpenAppSec WAF |

## Design Principles

1. **Microservices:** Loosely coupled, independently deployable
2. **Event-Driven:** Asynchronous communication via events
3. **API-First:** Well-defined contracts (OpenAPI/tRPC)
4. **Cloud-Native:** Containerized, orchestrated, scalable
5. **Security-First:** Defense in depth, least privilege
6. **Observability:** Metrics, logs, traces for all services
7. **Resilience:** Fault tolerance, graceful degradation
8. **Performance:** Caching, connection pooling, optimization

## Future Enhancements

- [ ] Service mesh (Istio/Linkerd)
- [ ] GraphQL federation
- [ ] Machine learning pipelines
- [ ] Real-time analytics with Flink
- [ ] Blockchain for supply chain traceability
- [ ] Mobile apps (React Native)
- [ ] Multi-region deployment
- [ ] Chaos engineering
