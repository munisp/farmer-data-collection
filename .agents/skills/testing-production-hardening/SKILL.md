---
name: testing-production-hardening
description: Test production hardening across 25 dimensions — resilient HTTP, security (JWT), DB integration, gRPC, mTLS, integration tests, Docker healthchecks, Prometheus alerting, pool monitoring, CI pipeline, Dockerfiles, Grafana dashboards, Vault TLS, test suites, Detox mobile, CI workflow, Loki/Promtail log aggregation, client code quality, mobile CI, code coverage config. Use when verifying inter-service communication, circuit breakers, authentication, infrastructure changes, or production readiness gaps.
---

# Testing Production Hardening (25-Dimension Audit)

## Overview
Production hardening covers 10 dimensions across the TypeScript backend and infrastructure:
1. **HTTP Resilience** — `server/services/resilient-http.ts` wraps all inter-service `fetch()` calls with circuit breaker + retry
2. **Security** — 5 routers converted from `publicProcedure` to `protectedProcedure` (JWT required)
3. **Database** — `admin-dashboard-router.ts` uses real PostgreSQL queries (no mock data)
4. **gRPC** — `proto/farmconnect.proto` + `server/services/grpc-client.ts` with circuit breaker
5. **mTLS** — `infra/mtls/generate-certs.sh` + `server/services/mtls-client.ts`
6. **Integration Tests** — `server/__tests__/integration-critical-flows.test.ts` (29 tests)
7. **Docker Healthchecks** — 35 healthchecks across all docker-compose services
8. **Prometheus Alerting** — `prometheus/alerts.yml` with 5 groups, 14 rules
9. **DB Pool Monitor** — `server/db.ts` auto-starts pool monitor on connect, exports `getPool()`
10. **CI Pipeline** — `.github/workflows/ci-cd.yml` includes microservice test matrix (Go/Python/Rust)

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
# Expect: 24 tests, 24 passed (SQL injection regex g-flag bug was fixed)

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

### 10. Docker Healthcheck Verification
```bash
grep -c "healthcheck:" docker-compose.yml
# Expect: 35 (all services including app, postgres, redis, jaeger, all microservices)

# Verify app service has a healthcheck:
grep -A5 "curl.*localhost:3000" docker-compose.yml | head -6
# Expect: test: ["CMD-SHELL", "curl -sf http://localhost:3000/api/health || exit 1"]
```

### 11. Prometheus Alerting Rules
```bash
# Validate YAML:
python3 -c "import yaml; yaml.safe_load(open('prometheus/alerts.yml')); print('VALID')"
# Expect: VALID

# Check structure:
python3 -c "
import yaml
data = yaml.safe_load(open('prometheus/alerts.yml'))
groups = data['groups']
total = sum(len(g['rules']) for g in groups)
print(f'Groups: {len(groups)}, Rules: {total}')
assert len(groups) == 5 and total == 14
"
# Expect: Groups: 5, Rules: 14

# Verify prometheus.yml references alerts:
grep "rule_files" prometheus/prometheus.yml
# Expect: rule_files: followed by - "alerts.yml"
```

### 12. DB Pool Monitor
```bash
# Verify exports:
grep -c "export function getPool" server/db.ts           # Expect: 1
grep -c "export function startPoolMonitor" server/db.ts  # Expect: 1
grep -c "export function stopPoolMonitor" server/db.ts   # Expect: 1

# Verify auto-start on DB connect:
grep "startPoolMonitor()" server/db.ts | grep -v "export function"
# Expect: exactly 1 line (the auto-start call inside getDb)

# Verify stop on closeDb:
grep "stopPoolMonitor()" server/db.ts
# Expect: called inside closeDb function
```

### 13. CI Microservice Test Matrix
```bash
grep -c "microservice-tests:" .github/workflows/ci-cd.yml  # Expect: 1
grep "lang:" .github/workflows/ci-cd.yml | sed 's/.*lang: //'
# Expect: go, python, rust (3 matrix entries)
```

### 14. Vitest Coverage
```bash
# Verify @vitest/coverage-v8 is installed:
npm ls @vitest/coverage-v8
# Expect: @vitest/coverage-v8@2.x.x (must match vitest version)

# Run coverage on a single test file:
npx vitest run --coverage server/__tests__/production-readiness.test.ts 2>&1 | grep "Coverage summary"
# Expect: coverage percentages appear (thresholds may fail for single-file run — that's expected)
```

### 15. Vault Configuration
```bash
[ -f vault/config.hcl ] && echo "EXISTS" || echo "MISSING"       # Expect: EXISTS
[ -x vault/init-secrets.sh ] && echo "EXECUTABLE" || echo "NO"   # Expect: EXECUTABLE
grep -c "vault kv put" vault/init-secrets.sh                      # Expect: >= 10
```

### 16. CI Workflow Verification
```bash
# Verify no pnpm references remain (project uses npm):
grep -c "pnpm" .github/workflows/ci-cd.yml
# Expect: 0 (exit code 1 from grep means no matches — that's correct)

# Verify npm ci is used (not npm install):
grep -c "npm ci" .github/workflows/ci-cd.yml
# Expect: >= 3 (lint, test, build, load-test, audit jobs)

# Verify .npmrc exists with legacy-peer-deps:
cat .npmrc
# Expect: legacy-peer-deps=true

# Verify prettier is non-blocking:
grep "prettier" .github/workflows/ci-cd.yml | grep "||"
# Expect: has fallback operator (1007 preexisting formatting issues)

# Verify Grafana alert templates are properly quoted:
python3 -c "import yaml; yaml.safe_load(open('config/grafana/provisioning/alerting/alerts.yml')); print('VALID')"
# Expect: VALID ({{ }} Grafana templates must be in quotes for YAML)
```

### 17. Dockerfile Coverage Verification
```bash
# Go services (expect 17 total, 0 missing):
ok=0; miss=0; for svc in $(ls services/go/ | grep -v shared); do
  if [ -f "services/go/$svc/Dockerfile" ]; then ok=$((ok+1)); else echo "MISSING: $svc"; miss=$((miss+1)); fi
done; echo "Go: $ok with Dockerfile, $miss missing"

# Python services (expect 23 total, 0 missing):
ok=0; miss=0; for svc in $(ls services/python/ | grep -v shared | grep -v __pycache__); do
  if [ -f "services/python/$svc/Dockerfile" ]; then ok=$((ok+1)); else echo "MISSING: $svc"; miss=$((miss+1)); fi
done; echo "Python: $ok with Dockerfile, $miss missing"

# Verify new Dockerfiles have HEALTHCHECK:
for svc in apisix-gateway delivery-service drone-service equipment-fleet-service messaging-middleware mobile-money-service supply-chain-service; do
  echo -n "$svc: "; grep -c "HEALTHCHECK" services/go/$svc/Dockerfile
done
# Expect: all return 1
```

### 18. Grafana Provisioning Verification
```bash
# Dashboard panel count and types:
python3 -c "import json; d=json.load(open('config/grafana/dashboards/distributed-tracing.json')); print(f'Panels: {len(d[\"panels\"])}'); print('Has traces:', 'traces' in [p['type'] for p in d['panels']])"
# Expect: Panels: 8, Has traces: True

# Datasource provisioning:
grep -c "type: prometheus" config/grafana/provisioning/datasources/datasources.yml  # Expect: 1
grep -c "type: jaeger" config/grafana/provisioning/datasources/datasources.yml      # Expect: 1

# Docker-compose mounts:
grep "provisioning/datasources" docker-compose.yml  # Expect: found
grep "grafana/dashboards" docker-compose.yml | grep -v "#"  # Expect: found
```

### 19. Vault TLS Deployment Verification
```bash
[ -f vault/deploy-tls.sh ] && echo "EXISTS" || echo "MISSING"
[ -x vault/deploy-tls.sh ] && echo "EXECUTABLE" || echo "NOT_EXEC"
grep -c "openssl verify" vault/deploy-tls.sh     # Expect: >= 1
grep -cE "dev|staging|production" vault/deploy-tls.sh  # Expect: >= 3
grep -ciE "mtls|client.cert|client.key" vault/deploy-tls.sh  # Expect: >= 1
```

### 20. New Test Suites (DB Backup + ERPNext)
```bash
npx vitest run server/__tests__/db-backup-s3-integration.test.ts 2>&1 | grep -E "Test Files|Tests "
# Expect: 1 passed (1), Tests 13 passed (13)

npx vitest run server/__tests__/erpnext-integration.test.ts 2>&1 | grep -E "Test Files|Tests "
# Expect: 1 passed (1), Tests 10 passed (10)
```

### 21. Mobile Detox Configuration
```bash
[ -f mobile/.detoxrc.js ] && echo "EXISTS" || echo "MISSING"
grep -c "ios\|android" mobile/.detoxrc.js  # Expect: >= 4
grep -c "device\|element\|by\|expect" mobile/e2e/farmerRegistration.test.ts  # Expect: >= 10
grep -c "detox" mobile/e2e/jest.config.js  # Expect: >= 1
```

### 22. Loki Log Aggregation Config
```bash
# Validate Loki config YAML with key assertions:
python3 -c "
import yaml
d = yaml.safe_load(open('config/loki/loki-config.yml'))
assert d['server']['http_listen_port'] == 3100, 'wrong port'
assert d['schema_config']['configs'][0]['store'] == 'tsdb', 'wrong store'
assert d['limits_config']['reject_old_samples'] == True, 'no rejection'
assert d['analytics']['reporting_enabled'] == False, 'analytics on'
print('LOKI CONFIG VALID')
"
# Expect: LOKI CONFIG VALID

# Validate Promtail config:
python3 -c "
import yaml
d = yaml.safe_load(open('config/promtail/promtail-config.yml'))
assert d['clients'][0]['url'] == 'http://loki:3100/loki/api/v1/push', 'wrong loki url'
jobs = [j['job_name'] for j in d['scrape_configs']]
assert 'docker' in jobs, 'missing docker job'
assert 'farmconnect-app' in jobs, 'missing farmconnect job'
print('PROMTAIL CONFIG VALID')
"
# Expect: PROMTAIL CONFIG VALID

# Docker-compose integration:
grep -c "image: grafana/loki" docker-compose.yml      # Expect: 1
grep -c "image: grafana/promtail" docker-compose.yml   # Expect: 1
grep "farmer-loki" docker-compose.yml                  # Expect: container_name match
grep "farmer-promtail" docker-compose.yml              # Expect: container_name match

# Grafana Loki datasource:
grep -A5 "name: Loki" config/grafana/provisioning/datasources/datasources.yml
# Expect: type: loki, url: http://loki:3100
```

### 23. Client Code Quality Checks
```bash
# Zero empty catch blocks (catch without error parameter):
grep -rn "catch {" client/src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__"
# Expect: empty output (exit code 1 = no matches)
# Note: VoiceNavigation.tsx might have `catch {}` that handles error via UI state — verify nearby code

# Zero console.log in client:
grep -rn "console\.log(" client/src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v "node_modules"
# Expect: empty output (exit code 1)

# Verify previously-empty catches now log errors with module prefix:
grep -A1 "catch (err)" client/src/lib/syncManager.ts | grep "console.warn"
grep -A1 "catch (err)" client/src/lib/offlineDataManager.ts | grep "console.warn"
grep -A1 "catch (err)" client/src/services/offline-sync.ts | grep "console.warn"
# Expect: each returns lines with console.warn('[ModuleName]...')
```

### 24. Mobile CI Job
```bash
grep "mobile-build:" .github/workflows/ci-cd.yml          # Expect: job key exists
grep "Mobile Build (Expo)" .github/workflows/ci-cd.yml    # Expect: job name
grep "expo-cli eas-cli" .github/workflows/ci-cd.yml       # Expect: CLI install step
grep "working-directory: mobile" .github/workflows/ci-cd.yml  # Expect: correct workdir
```

### 25. Code Coverage Configuration
```bash
# Verify thresholds in vitest.config.ts:
grep -A5 "thresholds:" vitest.config.ts
# Expect: lines: 60, functions: 55, branches: 45, statements: 60

# Verify coverage provider installed:
npm ls @vitest/coverage-v8
# Expect: @vitest/coverage-v8@2.x.x (must match vitest version)
```

## Key Behaviors
- Server crashes without `JWT_SECRET` env var — set it via `openssl rand -base64 32`
- Redis is optional — server falls back to in-memory if Redis is unavailable
- `health-router` and `africas-talking-router` intentionally remain `publicProcedure` (health checks + webhooks)
- Preexisting test failures exist (keycloak-integration, enterprise-integration, etc.) — not related to hardening changes
- mTLS is disabled by default (`MTLS_ENABLED` not set) — `createMtlsAgent()` returns `undefined` in dev
- CI uses npm (not pnpm) — `.npmrc` with `legacy-peer-deps=true` is required because `@trpc/client@11.17.0` needs `typescript>=5.7.2` but project uses 5.6.3
- Prettier check in CI is non-blocking — 1007+ files have preexisting formatting issues
- Grafana alert YAML templates (`{{ $values.A.Value }}`) must be quoted or prettier/YAML parsers will fail
- Production readiness audit job requires Python 3.11 (`actions/setup-python@v5`)
- Trivy security scan outputs table format (SARIF requires GitHub Advanced Security to be enabled)
- E2E/integration tests that call `fetch()` against a running server are excluded from CI unit test run
- Go service count is 17 (not 18 as sometimes reported); Python service count is 23 (not 24). Verify with `ls services/go/ | grep -v shared | wc -l`
- `VoiceNavigation.tsx:54` has `catch {}` without error parameter but handles error via UI state — this is a cosmetic inconsistency, not a silent swallowing. All other empty catches are fixed.
- Empty catch verification should exclude test files (`__tests__`) and check both `.ts` and `.tsx` extensions

## Devin Secrets Needed
None — all testing is local. PostgreSQL password is `postgres` (dev default).
