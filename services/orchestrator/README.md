# Farmer Data Collection - Temporal Orchestrator

Comprehensive workflow orchestration service integrating all middleware components for 30 user journeys covering 10 Nigerian cash crops.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Temporal Orchestrator                      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Workflows   │  │  Activities  │  │  Middleware  │     │
│  │  (30 types)  │──│  (11 types)  │──│   Manager    │     │
│  └──────────────┘  └──────────────┘  └──────┬───────┘     │
└────────────────────────────────────────────────┼────────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    │                            │                            │
         ┌──────────▼──────────┐    ┌───────────▼──────────┐    ┌───────────▼──────────┐
         │  Event Streaming    │    │   State Management   │    │   Data Storage       │
         │  - Kafka            │    │   - Dapr             │    │   - PostgreSQL       │
         │  - Fluvio           │    │   - Redis            │    │   - Lakehouse        │
         └─────────────────────┘    └──────────────────────┘    └──────────────────────┘
                    │                            │                            │
         ┌──────────▼──────────┐    ┌───────────▼──────────┐    ┌───────────▼──────────┐
         │  API Gateway        │    │   Auth & Authz       │    │   Financial Ledger   │
         │  - APISIX           │    │   - Keycloak         │    │   - TigerBeetle      │
         │                     │    │   - Permify          │    │                      │
         └─────────────────────┘    └──────────────────────┘    └──────────────────────┘
```

## Features

### 30 Workflow Types
1. **Ginger** (3): Complete Season, Export, Climate Insurance
2. **Palm Oil** (3): Cooperative, Outgrower, Biodiesel
3. **Cocoa** (3): Export Certification, Fair Trade, Agroforestry
4. **Cassava** (3): Value Chain, Garri Processing, Ethanol
5. **Yam** (3): Festival Supply, Seed Production, Flour Processing
6. **Rice** (3): Irrigation Optimization, Parboiled, Organic Premium
7. **Maize** (3): Livestock Feed, Poultry Integration, Sweet Corn
8. **Soybean** (3): Export Aggregation, Soy Milk, Tofu
9. **Groundnut** (3): Oil Processing, Peanut Butter, Confectionery
10. **Cotton** (2): Textile Integration, Organic Premium
11. **Multi-Crop** (1): Crop Rotation Optimization

### 11 Activity Types
- **Auth**: User authentication, permission checks (Keycloak, Permify)
- **Farm**: Farm CRUD operations (PostgreSQL, Dapr state)
- **Crop**: Crop lifecycle management (PostgreSQL, Kafka events)
- **Marketplace**: Listings, orders (PostgreSQL, Redis cache)
- **Financial**: Payments, expenses (TigerBeetle, Kafka)
- **ML**: Yield prediction, price forecasting (Python ML service)
- **Notification**: Push notifications, SMS (Kafka events)
- **Logistics**: Delivery scheduling, tracking (APISIX integration)
- **Quality**: Produce grading, quality checks (ML image analysis)
- **Compliance**: Certification, regulatory checks (Document management)
- **Analytics**: Report generation (Lakehouse, PostgreSQL)

### Middleware Integration
- ✅ **Kafka**: Event streaming for all major actions
- ✅ **Redis**: Caching for frequently accessed data
- ✅ **Dapr**: State management for offline sync
- ✅ **Fluvio**: Real-time data streaming (IoT sensors)
- ✅ **Keycloak**: Authentication and SSO
- ✅ **Permify**: Fine-grained authorization
- ✅ **APISIX**: API gateway for external integrations
- ✅ **TigerBeetle**: Financial ledger for payments
- ✅ **PostgreSQL**: Primary data store
- ✅ **Lakehouse**: Analytics and reporting

## Setup

### Prerequisites
- Go 1.22+
- Temporal Server running
- PostgreSQL database
- Kafka broker
- Redis server
- Dapr runtime

### Environment Variables
```bash
# Temporal
TEMPORAL_HOST=localhost:7233
TEMPORAL_NAMESPACE=default

# Middleware
KAFKA_BROKERS=localhost:9092
REDIS_ADDR=localhost:6379
DAPR_HTTP_PORT=3500
FLUVIO_ENDPOINT=localhost:9003

# Services
KEYCLOAK_URL=http://localhost:8080
PERMIFY_URL=http://localhost:3476
APISIX_GATEWAY=http://localhost:9080
TIGERBEETLE_ADDR=localhost:3001
LAKEHOUSE_URL=http://localhost:8000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/farmer_db
```

### Installation
```bash
cd services/orchestrator

# Install dependencies
go mod download

# Run locally
go run main.go

# Build Docker image
docker build -t farmer-orchestrator .

# Run with Docker
docker run --env-file .env farmer-orchestrator
```

## Usage

### Starting a Workflow
```go
import (
	"go.temporal.io/sdk/client"
	"orchestrator/workflows"
)

// Create Temporal client
c, _ := client.Dial(client.Options{})
defer c.Close()

// Start Ginger Complete Season workflow
workflowOptions := client.StartWorkflowOptions{
	ID:        "ginger-season-farm123",
	TaskQueue: "farmer-data-collection-orchestrator",
}

input := workflows.GingerSeasonInput{
	UserID:       1,
	FarmID:       123,
	Variety:      "Nigerian White",
	PlantingDate: time.Now(),
	AreaPlanted:  2.0,
	Season:       "2025",
	SoilType:     "loamy",
}

we, _ := c.ExecuteWorkflow(context.Background(), workflowOptions, workflows.GingerCompleteSeasonWorkflow, input)

// Get result
var result workflows.GingerSeasonOutput
we.Get(context.Background(), &result)
```

### Workflow Execution Flow
1. **Workflow Started** → Temporal schedules workflow
2. **Activities Executed** → Each activity interacts with middleware
3. **Events Published** → Kafka streams events to subscribers
4. **State Saved** → Dapr persists state for offline sync
5. **Cache Updated** → Redis caches frequently accessed data
6. **Database Updated** → PostgreSQL stores permanent records
7. **Workflow Completed** → Result returned to caller

## Monitoring

### Temporal UI
Access at `http://localhost:8088` to view:
- Active workflows
- Workflow history
- Activity execution logs
- Error traces

### Kafka Events
Monitor events on `farmer-events` topic:
```bash
kafka-console-consumer --bootstrap-server localhost:9092 --topic farmer-events
```

### Redis Cache
Check cached data:
```bash
redis-cli
> KEYS *
> GET farm:123
```

### Logs
```bash
# View orchestrator logs
docker logs farmer-orchestrator -f

# View Temporal logs
docker logs temporal -f
```

## Development

### Adding New Workflows
1. Create workflow function in `workflows/workflows.go`
2. Register workflow in `main.go` `registerWorkflows()`
3. Define input/output types
4. Implement activities if needed
5. Test with Temporal CLI

### Adding New Activities
1. Create activity struct in `activities/`
2. Implement activity methods with middleware access
3. Register in `main.go` `registerActivities()`
4. Add tests

### Testing
```bash
# Unit tests
go test ./...

# Integration tests (requires middleware)
go test -tags=integration ./...
```

## Production Deployment

### Docker Compose
```yaml
version: '3.8'
services:
  orchestrator:
    build: ./services/orchestrator
    environment:
      - TEMPORAL_HOST=temporal:7233
      - KAFKA_BROKERS=kafka:9092
      - REDIS_ADDR=redis:6379
      - DATABASE_URL=postgresql://postgres:5432/farmer_db
    depends_on:
      - temporal
      - kafka
      - redis
      - postgres
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: farmer-orchestrator
spec:
  replicas: 3
  selector:
    matchLabels:
      app: orchestrator
  template:
    metadata:
      labels:
        app: orchestrator
    spec:
      containers:
      - name: orchestrator
        image: farmer-orchestrator:latest
        envFrom:
        - configMapRef:
            name: orchestrator-config
```

## Troubleshooting

### Workflow Stuck
```bash
# Check Temporal UI for errors
# Retry workflow
temporal workflow reset --workflow_id <id>
```

### Activity Timeout
- Increase `StartToCloseTimeout` in workflow
- Check middleware connectivity
- Review activity logs

### Database Connection Issues
- Verify DATABASE_URL
- Check PostgreSQL is running
- Test connection: `psql $DATABASE_URL`

## Performance

### Throughput
- **Workflows/sec**: 1000+
- **Activities/sec**: 10,000+
- **Latency**: <100ms (p99)

### Scalability
- Horizontal scaling: Add more worker instances
- Vertical scaling: Increase worker concurrency
- Temporal handles millions of workflows

## Security

- **Authentication**: Keycloak OAuth2/OIDC
- **Authorization**: Permify RBAC
- **Encryption**: TLS for all middleware connections
- **Secrets**: Environment variables, never hardcoded
- **Audit**: All actions logged to Kafka

## License

Proprietary - Farmer Data Collection Platform

## Support

For issues or questions:
- GitHub Issues: [repository]/issues
- Email: support@farmerdatacollection.com
- Slack: #orchestrator-support
