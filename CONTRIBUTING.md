# Contributing to FarmConnect

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/munisp/farmer-data-collection.git
cd farmer-data-collection
npm install

# 2. Start infrastructure (requires Docker)
make up

# 3. Run migrations & seed data
make migrate
make seed

# 4. Start dev server
make dev

# 5. Verify everything works
make smoke
```

The app is at `http://localhost:3001`. Swagger docs at `/api/docs`.

## Architecture

```
farmer-data-collection/
├── client/                    # React PWA (Vite + TailwindCSS)
│   ├── src/pages/             # 140+ pages (marketplace, aquaculture, financial, etc.)
│   └── src/components/        # Shared components
├── server/                    # tRPC API Server (TypeScript)
│   ├── routers/               # 81+ tRPC routers
│   ├── services/              # Business logic, middleware clients
│   ├── config/                # Environment-overridable business rules
│   └── __tests__/             # Vitest test suites
├── services/                  # Polyglot microservices
│   ├── *-go/                  # Go services (gRPC + HTTP)
│   ├── *-rust/                # Rust services (gRPC + HTTP)
│   └── *-python/              # Python services (gRPC + HTTP)
├── proto/                     # gRPC proto definitions (16 services)
├── drizzle/                   # Database schemas & migrations
├── k8s/                       # Kubernetes manifests
│   ├── hardening/             # PDB, NetworkPolicy, CronJobs
│   ├── istio/                 # Service mesh configs
│   └── monitoring/            # Prometheus, Grafana
├── scripts/                   # Operational scripts
│   ├── backup/                # DR scripts (PG, Redis, TigerBeetle)
│   ├── load-testing/          # k6 performance baselines
│   └── e2e-smoke-test.sh      # E2E endpoint verification
└── terraform/                 # Infrastructure as Code (AWS)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TailwindCSS, PWA |
| API | tRPC, Express, TypeScript |
| Go services | net/http, gRPC, Kafka client |
| Rust services | Actix-Web, tonic (gRPC), TigerBeetle client |
| Python services | FastAPI, gRPC, PyTorch |
| Database | PostgreSQL 16 (PostGIS), Drizzle ORM |
| Cache | Redis 7 |
| Streaming | Kafka (KRaft), Fluvio |
| Financial ledger | TigerBeetle |
| Auth | Keycloak, JWT (HMAC-SHA256) |
| Authorization | Permify (ReBAC) |
| Search | OpenSearch |
| API Gateway | APISIX |
| WAF | OpenAppSec |
| Workflow | Temporal |
| Service mesh | Istio (mTLS) |
| Observability | OpenTelemetry, Prometheus, Grafana |
| IaC | Terraform (AWS) |

## Development Workflow

### Adding a tRPC Router

1. Create `server/routers/my-feature-router.ts`
2. Follow the pattern from existing routers (Zod validation, middleware hooks)
3. Register in `server/routers/index.ts`
4. Add frontend page in `client/src/pages/`
5. Run `npx tsc --noEmit` to verify types
6. Run `npx vitest run` to verify no regressions

### Adding a Polyglot Service

1. Create directory under `services/my-service-{go,rust,python}/`
2. Include: Dockerfile, health endpoint, gRPC + HTTP servers
3. Add proto definition in `proto/farmconnect.proto`
4. Add to `docker-compose.dev.yml`
5. Add to `.github/workflows/ci-cd.yml` test matrix
6. Create tRPC orchestrator router with `resilientPost` circuit breaker

### Running Tests

```bash
make test          # TypeScript tests (vitest)
make test-all      # All languages (TS + Go + Python + Rust)
make smoke         # E2E smoke tests (requires running server)
make verify        # PRB v2 production readiness checks
```

### Database Changes

```bash
make migrate-status   # Check current state
# Edit drizzle/schema.ts (or domain-specific schema files)
npx drizzle-kit generate   # Generate migration
make migrate          # Apply
make seed             # Re-seed if needed
```

## Conventions

- **TypeScript**: Zod validation on all tRPC inputs, `logger` for errors (not `console.error`)
- **Go**: Standard library HTTP + gRPC, structured logging
- **Rust**: Actix-Web, serde for JSON, tonic for gRPC
- **Python**: FastAPI, Pydantic models, pytest for testing
- **Config**: All thresholds and business rules are env-overridable via `server/config/business-rules.ts`
- **Secrets**: Never hardcode. Use `process.env.XXX` with fallback pattern
- **Middleware**: Use `server/services/middleware-integration.ts` hooks for Redis/Kafka/OpenSearch

## Port Assignments

| Port | Service | Language |
|------|---------|----------|
| 3001 | FarmConnect API | TypeScript |
| 5432 | PostgreSQL | - |
| 6379 | Redis | - |
| 8080 | Keycloak | - |
| 8093 | Price Prediction | Python |
| 8096 | GPS Streaming | Go |
| 8097 | Tile Cache | Go |
| 8098 | Equipment Fleet | Go |
| 8099 | Spatial Query | Rust |
| 8100 | Geocoding | Python |
| 8101 | Feature Flags | Go |
| 8107 | Weather Alerts | Python |
| 8108 | Credit Scoring | Python |
| 8109 | Voice Navigation | Python |
| 8110 | Blockchain Provenance | Go |
| 8111 | Urban Delivery | Rust |
| 8112 | CEA AI (Indoor Farming) | Python |
| 8113 | Aquaculture Pond | Go |
| 8114 | Aquaculture Feed | Rust |
| 8115 | Aquaculture AI | Python |
| 8116 | Contract Farming | Go |
| 8117 | Warehouse Receipt | Rust |
| 8118 | Conversational Commerce | Python |
| 9090-9118 | gRPC ports (matching HTTP +1000) | - |
| 9200 | OpenSearch | - |
| 9092 | Kafka | - |

## CI/CD

The GitHub Actions pipeline runs:
1. **Lint** — TypeScript type checking, Prettier
2. **Test** — Vitest with PostgreSQL + Redis services
3. **Microservice Tests** — Go/Python/Rust test matrix
4. **Build** — Vite production build (size < 50MB)
5. **Security** — npm audit, secret scanning
6. **E2E Smoke Tests** — Server startup + 24 endpoint checks
7. **Docker Build** — Multi-stage image push to GHCR (main/develop only)
8. **Branch Protection Gate** — All checks must pass for merge

## Operational Runbooks

See `docs/runbooks/incident-response.md` for SEV1-4 incident response procedures.
