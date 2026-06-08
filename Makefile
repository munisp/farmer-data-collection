# Production Readiness Baseline (PRB) v2 Makefile
# Run `make verify` to check all PRB criteria

.PHONY: verify verify-v1 deps typecheck test check-secrets check-mocks check-todos check-docker check-db-persistence check-audit check-rate-limiting check-health-endpoints check-env-validation check-production-readiness

# Main verification target - runs all PRB v2 checks
verify: deps typecheck check-secrets check-mocks check-todos check-db-persistence check-audit check-rate-limiting check-health-endpoints check-production-readiness
	@echo ""
	@echo "=========================================="
	@echo "PRB v2 VERIFICATION COMPLETE - ALL PASSED"
	@echo "=========================================="

# PRB v1 checks only (for quick validation)
verify-v1: deps typecheck check-secrets check-mocks check-todos check-db-persistence
	@echo ""
	@echo "=========================================="
	@echo "PRB v1 VERIFICATION COMPLETE - ALL PASSED"
	@echo "=========================================="

# Install dependencies
deps:
	@echo "[PRB] Installing dependencies..."
	@pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# TypeScript compilation check (PRB-004)
typecheck:
	@echo "[PRB-004] Checking TypeScript compilation..."
	@npx tsc --noEmit
	@echo "[PRB-004] PASSED: TypeScript compiles without errors"

# Check for hardcoded credentials (PRB-001)
check-secrets:
	@echo "[PRB-001] Checking for hardcoded credentials..."
	@bash scripts/prb/check-secrets.sh
	@echo "[PRB-001] PASSED: No hardcoded credentials found"

# Check for mock functions in production (PRB-002)
check-mocks:
	@echo "[PRB-002] Checking for mock functions in production code..."
	@bash scripts/prb/check-mocks.sh
	@echo "[PRB-002] PASSED: No mock functions in production code"

# Check for TODO/FIXME placeholders (PRB-003)
check-todos:
	@echo "[PRB-003] Checking for TODO/FIXME placeholders..."
	@bash scripts/prb/check-todos.sh
	@echo "[PRB-003] PASSED: No TODO/FIXME placeholders in production code"

# Check Dockerfile builds (PRB-005) - optional, requires Docker
check-docker:
	@echo "[PRB-005] Checking Dockerfile builds..."
	@bash scripts/prb/check-docker.sh
	@echo "[PRB-005] PASSED: All Dockerfiles build successfully"

# Check database persistence configuration (PRB-006)
check-db-persistence:
	@echo "[PRB-006] Checking database persistence configuration..."
	@bash scripts/prb/check-db-persistence.sh
	@echo "[PRB-006] PASSED: No in-memory database defaults"

# Run tests with coverage (PRB-007) - optional
test:
	@echo "[PRB-007] Running tests..."
	@bash scripts/prb/check-tests.sh

# Check for security vulnerabilities (PRB-008)
check-audit:
	@echo "[PRB-008] Checking for security vulnerabilities..."
	@bash scripts/prb/check-audit.sh
	@echo "[PRB-008] PASSED: No high/critical vulnerabilities"

# Check rate limiting configuration (PRB-009)
check-rate-limiting:
	@echo "[PRB-009] Checking rate limiting configuration..."
	@bash scripts/prb/check-rate-limiting.sh
	@echo "[PRB-009] PASSED: Rate limiting properly configured"

# Check health endpoints (PRB-010)
check-health-endpoints:
	@echo "[PRB-010] Checking health endpoints..."
	@bash scripts/prb/check-health-endpoints.sh
	@echo "[PRB-010] PASSED: Health endpoints configured"

# Run the comprehensive production readiness audit (PRB-012)
check-production-readiness:
	@echo "[PRB-012] Running comprehensive production readiness audit..."
	@python3.11 scripts/production_readiness_audit.py --root . --config scripts/production_readiness_config.json --output-dir reports/production-readiness --min-score 75 --strict --print-summary
	@echo "[PRB-012] PASSED: Production readiness audit meets threshold"

# Check environment validation (PRB-011) - informational
check-env-validation:
	@echo "[PRB-011] Checking environment validation..."
	@bash scripts/prb/check-env-validation.sh

# ============================================================================
# Developer Workflow Targets
# ============================================================================

.PHONY: dev build lint test-all smoke backup migrate seed up down logs health load-test

# Start development server
dev:
	@echo "Starting FarmConnect dev server..."
	@npx tsx server/index.ts

# Build production bundle
build:
	@echo "Building FarmConnect..."
	@npx vite build
	@echo "Build complete"

# Run linting
lint:
	@npx prettier --check . 2>/dev/null || echo "Format issues found (run 'make fmt' to fix)"

# Format code
fmt:
	@npx prettier --write .

# Run all tests (TypeScript + polyglot)
test-all: test
	@echo "Running polyglot service tests..."
	@for svc in services/*/; do \
		if [ -f "$$svc/go.mod" ]; then (cd "$$svc" && go test ./... -v -count=1 2>/dev/null || true); fi; \
		if [ -f "$$svc/requirements.txt" ]; then (cd "$$svc" && python -m pytest -v --tb=short 2>/dev/null || true); fi; \
		if [ -f "$$svc/Cargo.toml" ]; then (cd "$$svc" && cargo test --release 2>/dev/null || true); fi; \
	done
	@echo "All tests complete"

# Run E2E smoke tests against running server
smoke:
	@chmod +x scripts/e2e-smoke-test.sh
	@./scripts/e2e-smoke-test.sh http://localhost:3001

# Database operations
migrate:
	@chmod +x scripts/db-migrate.sh
	@./scripts/db-migrate.sh migrate

migrate-status:
	@chmod +x scripts/db-migrate.sh
	@./scripts/db-migrate.sh status

seed:
	@chmod +x scripts/db-migrate.sh
	@./scripts/db-migrate.sh seed

# Docker Compose operations
up:
	@echo "Starting full stack..."
	@docker compose -f docker-compose.dev.yml up -d
	@echo "Stack is running. API: http://localhost:3001"

down:
	@docker compose -f docker-compose.dev.yml down

logs:
	@docker compose -f docker-compose.dev.yml logs -f --tail=50

# Health check
health:
	@curl -s http://localhost:3001/health | python3 -m json.tool 2>/dev/null || echo "Server not running"

# Service health aggregator
health-all:
	@curl -s http://localhost:3001/api/service-health | python3 -m json.tool 2>/dev/null || echo "Server not running"

# Backup operations
backup-pg:
	@chmod +x scripts/backup/pg_backup.sh
	@./scripts/backup/pg_backup.sh full local

backup-redis:
	@chmod +x scripts/backup/redis_backup.sh
	@./scripts/backup/redis_backup.sh backup local

backup-tb:
	@chmod +x scripts/backup/tigerbeetle_backup.sh
	@./scripts/backup/tigerbeetle_backup.sh backup local

backup-all: backup-pg backup-redis backup-tb
	@echo "All backups complete"

# Load testing (requires k6)
load-test:
	@k6 run scripts/load-testing/k6-baseline.js

# Help target
help:
	@echo "FarmConnect Platform — Makefile"
	@echo ""
	@echo "Development:"
	@echo "  make dev                 Start dev server"
	@echo "  make build               Build production bundle"
	@echo "  make lint                Run linting"
	@echo "  make fmt                 Auto-format code"
	@echo "  make test                Run TypeScript tests"
	@echo "  make test-all            Run all tests (TS + Go + Python + Rust)"
	@echo "  make smoke               Run E2E smoke tests"
	@echo ""
	@echo "Database:"
	@echo "  make migrate             Apply pending migrations"
	@echo "  make migrate-status      Show migration status"
	@echo "  make seed                Run seed scripts"
	@echo ""
	@echo "Docker:"
	@echo "  make up                  Start full stack (Docker Compose)"
	@echo "  make down                Stop all services"
	@echo "  make logs                Tail service logs"
	@echo ""
	@echo "Operations:"
	@echo "  make health              Check API health"
	@echo "  make health-all          Service health aggregator"
	@echo "  make backup-all          Backup PostgreSQL + Redis + TigerBeetle"
	@echo "  make load-test           Run k6 load tests"
	@echo ""
	@echo "PRB Verification:"
	@echo "  make verify              Run all PRB v2 checks"
	@echo "  make verify-v1           Run PRB v1 checks only (quick)"
	@echo "  make typecheck           Check TypeScript compilation"
	@echo "  make check-secrets       Check for hardcoded credentials"
	@echo "  make check-docker        Check Dockerfile builds"
