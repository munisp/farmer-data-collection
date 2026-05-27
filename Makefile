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

# Help target
help:
	@echo "Production Readiness Baseline (PRB) v2"
	@echo ""
	@echo "Usage:"
	@echo "  make verify              Run all PRB v2 checks"
	@echo "  make verify-v1           Run PRB v1 checks only (quick)"
	@echo "  make typecheck           Check TypeScript compilation (PRB-004)"
	@echo "  make test                Run tests with coverage (PRB-007)"
	@echo "  make check-secrets       Check for hardcoded credentials (PRB-001)"
	@echo "  make check-mocks         Check for mock functions (PRB-002)"
	@echo "  make check-todos         Check for TODO/FIXME placeholders (PRB-003)"
	@echo "  make check-docker        Check Dockerfile builds (PRB-005)"
	@echo "  make check-db-persistence Check DB config (PRB-006)"
	@echo "  make check-audit         Check for vulnerabilities (PRB-008)"
	@echo "  make check-rate-limiting Check rate limiting (PRB-009)"
	@echo "  make check-health-endpoints Check health endpoints (PRB-010)"
	@echo "  make check-production-readiness Run the comprehensive production readiness audit (PRB-012)"
	@echo "  make check-env-validation Check env validation (PRB-011)"
