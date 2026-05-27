# Preliminary Platform Wiring Findings

## Router Composition

The running server mounts the following primary backend surfaces:

| Surface | Mount point |
| --- | --- |
| tRPC application router | `/api/trpc` |
| WebSocket API router | `/api/websocket` |
| USSD routes | `/api/ussd` |
| SMS routes | `/api/sms` |
| WhatsApp routes | `/api/whatsapp` |
| Liveness endpoint | `/health` |
| Kubernetes liveness alias | `/healthz` |
| Kubernetes readiness endpoint | `/readyz` |
| Prometheus metrics | `/metrics` |

The server entrypoint also initializes Kafka topics and consumers, Dapr consumers, Redis-backed caching and rate limiting, cron jobs, an SMS scheduler, WebSocket infrastructure, and the analytics lakehouse subsystem.

## tRPC Router Coverage

The main tRPC composition includes a wide range of domains, including authentication, dashboard, admin, financial reports, export, marketplace, messaging, voice, analytics, ML predictions, review workflows, weather, spatial intelligence, accounting, HR, inventory, banking, microfinance, disbursement, risk assessment, loan applications, Africa's Talking, ERPNext, health, audit trail, permissions, exchange, cooperatives, notifications, credit scoring, agent productivity, traceability, KYC, admin dashboard, GPS tracking, land suitability, farmer features, satellite imagery, and offline sync.

## Potential Wiring Risk Signals

A quick repository-reference scan suggests the following low-reference service roots should be reviewed first for possible orchestration or runtime wiring gaps.

| Service root | Approximate repository references | Initial interpretation |
| --- | ---: | --- |
| `agricultural-models-python` | 2 | Likely lightly wired or only documented |
| `gps-service-go` | 2 | Likely isolated or infrastructure-only integration |
| `event-consumer` | 2 | Likely runtime-coupled but sparsely referenced in source |
| `erp-integration-service` | 6 | Present but may not be fully orchestrated across app flows |
| `cache-service` | 7 | Runtime infrastructure present, limited code references |
| `marketplace-service` | 11 | Needs confirmation against frontend and backend marketplace flows |
| `notification-service` | 14 | Needs confirmation against actual user-facing notification flows |
| `model-serving` | 14 | Needs confirmation against ML prediction and inference endpoints |

## Notes for Next Audit Steps

The reference-count method is only a triage signal and not proof of orphaning. The next audit stages should verify whether each low-reference service is:

1. referenced by Docker Compose, Kubernetes, or deployment manifests,
2. invoked by server-side code or background consumers,
3. surfaced through frontend or mobile user flows, and
4. covered by health checks, smoke tests, or documented operational procedures.
