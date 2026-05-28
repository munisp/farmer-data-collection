---
name: testing-production-hardening
description: Test production hardening across 6 dimensions — resilient HTTP, security (JWT), DB integration, gRPC, mTLS, integration tests. Use when verifying inter-service communication, circuit breakers, authentication, or infrastructure changes.
---

# Testing Production Hardening (6-Dimension Audit)

## Overview
Production hardening covers 6 dimensions across the TypeScript backend:
1. **HTTP Resilience** — `server/services/resilient-http.ts` wraps all inter-service `fetch()` calls with circuit breaker + retry
2. **Security** — 5 routers converted from `publicProcedure` to `protectedProcedure` (JWT required)
3. **Database** — `admin-dashboard-router.ts` uses real PostgreSQL queries (no mock data)
4. **gRPC** — `proto/farmconnect.proto` + `server/services/grpc-client.ts` with circuit breaker
5. **mTLS** — `infra/mtls/generate-certs.sh` + `server/services/mtls-client.ts`
6. **Integration Tests** — `server/__tests__/integration-critical-flows.test.ts` (29 tests)

## Prerequisites
```bash
cd /home/ubuntu/repos/farmer-data-collection
npm install  # if not already done
```

PostgreSQL must be running on localhost:5432 (user: postgres, password: postgres).
OpenSSL must be available for mTLS cert testing.

## Testing Procedure

### 1. TypeScript + Build Verification
```bash
npx tsc --noEmit                    # Expect: exit code 0, no output
npx vite build                      # Expect: exit code 0, "modules transformed"
```

### 2. Integration Tests
```bash
# Production readiness tests (10 suites: sanitization, JWT, CORS, rate limiting, permissions, etc.):
npx vitest run server/__tests__/production-readiness.test.ts
# Expect: 24 tests (23 passed, 1 known failure — SQL injection regex g-flag bug)

# Critical flows integration tests:
npx vitest run server/__tests__/integration-critical-flows.test.ts
# Expect: 29 passed, 0 failed

# Circuit breaker subset:
npx vitest run server/__tests__/integration-critical-flows.test.ts -t "Circuit Breaker"
# Expect: 2 passed
```

> **Known issue:** `detectSqlInjection` in production-readiness.test.ts uses a regex with the `/g` flag, which makes `RegExp.test()` stateful (`lastIndex` persists between calls). The second assertion `detectSqlInjection("SELECT * FROM users")` may fail. Fix: remove the `g` flag from `SQL_INJECTION_PATTERNS` or create a new RegExp per call.

### 3. Security Verification
```bash
# All 5 routers must have 0 publicProcedure:
grep -c "publicProcedure" server/routers/{agent-productivity,cooperative,credit-scoring,notification,traceability}-router.ts
# Expect: all return 0

# All 5 must have protectedProcedure:
grep -c "protectedProcedure" server/routers/{agent-productivity,cooperative,credit-scoring,notification,traceability}-router.ts
# Expect: all return > 0
```

### 4. HTTP Resilience Verification
```bash
# No raw fetch() in routers:
grep -rn "await fetch(" server/routers/ --include="*.ts" | grep -v "resilientFetch\|resilientPost\|resilientGet\|test\|backup"
# Expect: empty output

# All routers use resilient imports:
for r in delivery cold-chain mobile-money price-alerts soil-analysis agri-llm equipment-fleet weather-alerts whatsapp-ai kyc drone; do
  echo -n "$r: "; grep -c "resilient" server/routers/${r}-router.ts
done
# Expect: all return > 0
```

### 5. Admin Dashboard Verification
```bash
grep -c "mockOfficers\|mockReports\|Math\.random" server/routers/admin-dashboard-router.ts  # Expect: 0
grep -c "requireDb\|from.*drizzle" server/routers/admin-dashboard-router.ts                 # Expect: > 2
```

### 6. mTLS Certificate Testing
```bash
rm -rf /tmp/farmconnect-certs
bash infra/mtls/generate-certs.sh /tmp/farmconnect-certs
# Expect: "Certificate generation complete", 11 server + 11 client dirs

openssl verify -CAfile /tmp/farmconnect-certs/ca/ca.crt /tmp/farmconnect-certs/server/api-gateway/server.crt
# Expect: "OK"

openssl verify -CAfile /tmp/farmconnect-certs/ca/ca.crt /tmp/farmconnect-certs/client/delivery-service/client.crt
# Expect: "OK"
```

### 7. gRPC Proto Verification
```bash
grep "^service " proto/farmconnect.proto
# Expect: DeliveryService, MobileMoneyService, ColdChainService, MLInferenceService, TokenizationService
```

### 8. Server Startup + Protected Route Test
```bash
# Server requires JWT_SECRET:
JWT_SECRET="demo-secret-key-for-local-development-only-32chars" \
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/farmer_data \
PORT=3001 npx tsx server/index.ts > /tmp/server.log 2>&1 &

# Wait ~8s for startup, then:
curl -s http://localhost:3001/health       # Expect: {"status":"ok","redis":"disconnected",...}
curl -s http://localhost:3001/healthz      # Expect: {"status":"ok","timestamp":"<ISO8601>"}
curl -s http://localhost:3001/readyz       # Expect: {"status":"ready","checks":{"database":{"status":"ok"},...}}

# Protected route without JWT:
curl -s http://localhost:3001/api/trpc/agentProductivity.getDashboardStats
# Expect: {"code":"UNAUTHORIZED","httpStatus":401}

# Verify structured JSON logging (Pino):
head -5 /tmp/server.log
# Expect: every line is valid JSON with "level", "time", "service", "msg" fields
# First line (non-JSON) may be vite env injection — ignore it

# OpenAPI documentation:
curl -s http://localhost:3001/api/openapi.json | jq '{openapi: .openapi, title: .info.title, path_count: (.paths | keys | length)}'
# Expect: {"openapi":"3.0.3","title":"FarmConnect API","path_count":45}

# Swagger UI:
curl -s http://localhost:3001/api/docs | grep '<title>'
# Expect: <title>FarmConnect API Documentation</title>
```

> **Tip:** Use `> /tmp/server.log 2>&1 &` to capture server output for log verification. The server takes ~8s to fully start (Keycloak, Permify, consumer manager init). Port 3001 may conflict if a previous server instance is running — use `fuser -k 3001/tcp` to kill it first.

### 9. Full Test Suite Regression
```bash
npx vitest run 2>&1 | grep -E "Test Files|Tests "
# Compare failed count to known preexisting failures (~5-6)
# Fail if count increased
```

## Key Behaviors
- Server crashes without `JWT_SECRET` env var — set it via `openssl rand -base64 32`
- Redis is optional — server falls back to in-memory if Redis is unavailable
- `health-router` and `africas-talking-router` intentionally remain `publicProcedure` (health checks + webhooks)
- Preexisting test failures exist (keycloak-integration, enterprise-integration, etc.) — not related to hardening changes
- mTLS is disabled by default (`MTLS_ENABLED` not set) — `createMtlsAgent()` returns `undefined` in dev

## Devin Secrets Needed
None — all testing is local. PostgreSQL password is `postgres` (dev default).
