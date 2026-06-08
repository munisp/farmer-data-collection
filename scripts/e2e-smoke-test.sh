#!/bin/bash
# FarmConnect E2E Smoke Test Runner
# Verifies all critical endpoints and services are operational
#
# Usage:
#   ./scripts/e2e-smoke-test.sh                   # Test localhost:3001
#   ./scripts/e2e-smoke-test.sh https://api.farm   # Test remote URL
#   CI=true ./scripts/e2e-smoke-test.sh            # Exit 1 on any failure

set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"
TRPC_URL="${BASE_URL}/api/trpc"
TOTAL=0
PASSED=0
FAILED=0
WARNINGS=0
RESULTS=""

# Colors (disabled in CI)
if [ -t 1 ] && [ -z "${CI:-}" ]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[0;33m'
    NC='\033[0m'
else
    GREEN='' RED='' YELLOW='' NC=''
fi

log() { echo -e "$@"; }

pass() {
    TOTAL=$((TOTAL + 1))
    PASSED=$((PASSED + 1))
    RESULTS="${RESULTS}\n  ${GREEN}PASS${NC} $1"
    log "  ${GREEN}PASS${NC} $1"
}

fail() {
    TOTAL=$((TOTAL + 1))
    FAILED=$((FAILED + 1))
    RESULTS="${RESULTS}\n  ${RED}FAIL${NC} $1 — $2"
    log "  ${RED}FAIL${NC} $1 — $2"
}

warn() {
    WARNINGS=$((WARNINGS + 1))
    RESULTS="${RESULTS}\n  ${YELLOW}WARN${NC} $1"
    log "  ${YELLOW}WARN${NC} $1"
}

# Helper: call tRPC endpoint and check HTTP status
trpc_get() {
    local procedure="$1"
    local input="${2:-}"
    local url="${TRPC_URL}/${procedure}"
    if [ -n "$input" ]; then
        url="${url}?input=${input}"
    fi
    curl -s -o /tmp/smoke_response.json -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000"
}

# Helper: check JSON field in response
json_field() {
    local field="$1"
    python3 -c "import json; d=json.load(open('/tmp/smoke_response.json')); print(json.dumps(d${field}))" 2>/dev/null || echo "null"
}

log "\n=== FarmConnect E2E Smoke Tests ==="
log "Target: $BASE_URL"
log "Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')\n"

# ============================================================
# 1. Infrastructure Health
# ============================================================
log "--- Infrastructure Health ---"

# Health endpoint
STATUS=$(curl -s -o /tmp/smoke_response.json -w "%{http_code}" --max-time 5 "${BASE_URL}/health" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
    pass "/health → 200"
else
    fail "/health" "HTTP $STATUS"
fi

# Readiness endpoint
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${BASE_URL}/readyz" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "503" ]; then
    pass "/readyz → $STATUS"
else
    fail "/readyz" "HTTP $STATUS"
fi

# Metrics endpoint
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${BASE_URL}/metrics" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
    pass "/metrics → 200"
else
    fail "/metrics" "HTTP $STATUS"
fi

# Liveness probe
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${BASE_URL}/healthz" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
    pass "/healthz → 200"
else
    fail "/healthz" "HTTP $STATUS"
fi

# ============================================================
# 2. Core tRPC Routers (Public Endpoints)
# ============================================================
log "\n--- Core tRPC Routers ---"

# Marketplace commodities
STATUS=$(trpc_get "marketplace.listCommodities")
if [ "$STATUS" = "200" ]; then
    pass "marketplace.listCommodities → 200"
else
    fail "marketplace.listCommodities" "HTTP $STATUS"
fi

# Analytics dashboard
STATUS=$(trpc_get "analytics.getDashboardMetrics")
if [ "$STATUS" = "200" ]; then
    pass "analytics.getDashboardMetrics → 200"
else
    fail "analytics.getDashboardMetrics" "HTTP $STATUS"
fi

# Health router
STATUS=$(trpc_get "health.check")
if [ "$STATUS" = "200" ]; then
    pass "health.check → 200"
else
    fail "health.check" "HTTP $STATUS"
fi

# ============================================================
# 3. Financial Services
# ============================================================
log "\n--- Financial Services ---"

STATUS=$(trpc_get "mobileMoney.listProviders")
if [ "$STATUS" = "200" ]; then
    pass "mobileMoney.listProviders → 200"
else
    fail "mobileMoney.listProviders" "HTTP $STATUS"
fi

STATUS=$(trpc_get "collections.getSummary")
if [ "$STATUS" = "200" ]; then
    pass "collections.getSummary → 200"
else
    fail "collections.getSummary" "HTTP $STATUS"
fi

# ============================================================
# 4. Polyglot Services (via tRPC orchestrators)
# ============================================================
log "\n--- Polyglot Service Routers ---"

# Blockchain Provenance
STATUS=$(trpc_get "blockchainProvenance.getStats")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ]; then
    pass "blockchainProvenance.getStats → $STATUS"
else
    fail "blockchainProvenance.getStats" "HTTP $STATUS"
fi

# Subscription Delivery (Urban)
STATUS=$(trpc_get "subscriptionDelivery.listMicroZones")
if [ "$STATUS" = "200" ]; then
    pass "subscriptionDelivery.listMicroZones → 200"
else
    fail "subscriptionDelivery.listMicroZones" "HTTP $STATUS"
fi

# CEA AI (Indoor Farming)
STATUS=$(trpc_get "ceaAI.listIndoorCrops")
if [ "$STATUS" = "200" ]; then
    pass "ceaAI.listIndoorCrops → 200"
else
    fail "ceaAI.listIndoorCrops" "HTTP $STATUS"
fi

# Aquaculture
STATUS=$(trpc_get "aquaculturePond.listSpecies")
if [ "$STATUS" = "200" ]; then
    pass "aquaculturePond.listSpecies → 200"
else
    fail "aquaculturePond.listSpecies" "HTTP $STATUS"
fi

STATUS=$(trpc_get "aquacultureFeed.listSpecies")
if [ "$STATUS" = "200" ]; then
    pass "aquacultureFeed.listSpecies → 200"
else
    fail "aquacultureFeed.listSpecies" "HTTP $STATUS"
fi

STATUS=$(trpc_get "aquacultureAI.listDiseases")
if [ "$STATUS" = "200" ]; then
    pass "aquacultureAI.listDiseases → 200"
else
    fail "aquacultureAI.listDiseases" "HTTP $STATUS"
fi

# ============================================================
# 5. Innovation Routers
# ============================================================
log "\n--- Innovation Routers ---"

STATUS=$(trpc_get "insuranceAI.listProducts")
if [ "$STATUS" = "200" ]; then
    pass "insuranceAI.listProducts → 200"
else
    fail "insuranceAI.listProducts" "HTTP $STATUS"
fi

STATUS=$(trpc_get "carbonCredit.listProjects")
if [ "$STATUS" = "200" ]; then
    pass "carbonCredit.listProjects → 200"
else
    fail "carbonCredit.listProjects" "HTTP $STATUS"
fi

STATUS=$(trpc_get "voiceFirstAI.listSupportedLanguages")
if [ "$STATUS" = "200" ]; then
    pass "voiceFirstAI.listSupportedLanguages → 200"
else
    fail "voiceFirstAI.listSupportedLanguages" "HTTP $STATUS"
fi

STATUS=$(trpc_get "chamaSavings.listChamas")
if [ "$STATUS" = "200" ]; then
    pass "chamaSavings.listChamas → 200"
else
    fail "chamaSavings.listChamas" "HTTP $STATUS"
fi

STATUS=$(trpc_get "federatedLearning.listModels")
if [ "$STATUS" = "200" ]; then
    pass "federatedLearning.listModels → 200"
else
    fail "federatedLearning.listModels" "HTTP $STATUS"
fi

# ============================================================
# 6. Export & Pipeline
# ============================================================
log "\n--- Export & Pipeline ---"

STATUS=$(trpc_get "exportChain.listShipments")
if [ "$STATUS" = "200" ]; then
    pass "exportChain.listShipments → 200"
else
    fail "exportChain.listShipments" "HTTP $STATUS"
fi

STATUS=$(trpc_get "dataPipeline.listJobs")
if [ "$STATUS" = "200" ]; then
    pass "dataPipeline.listJobs → 200"
else
    fail "dataPipeline.listJobs" "HTTP $STATUS"
fi

# ============================================================
# 7. Protected Endpoints (should return 401)
# ============================================================
log "\n--- Auth Protection ---"

STATUS=$(trpc_get "adminDashboard.getSystemStatus")
if [ "$STATUS" = "401" ]; then
    pass "adminDashboard.getSystemStatus → 401 (protected)"
elif [ "$STATUS" = "200" ]; then
    fail "adminDashboard.getSystemStatus" "Expected 401, got 200 (unprotected!)"
else
    fail "adminDashboard.getSystemStatus" "HTTP $STATUS"
fi

# ============================================================
# 8. Static Assets / Frontend
# ============================================================
log "\n--- Frontend ---"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${BASE_URL}/" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
    pass "/ (index.html) → 200"
else
    fail "/" "HTTP $STATUS"
fi

# ============================================================
# Summary
# ============================================================
log "\n==========================================="
log "  TOTAL: $TOTAL | PASSED: $PASSED | FAILED: $FAILED | WARNINGS: $WARNINGS"
log "==========================================="

if [ "$FAILED" -gt 0 ]; then
    log "\n${RED}SMOKE TEST FAILED${NC} — $FAILED failures"
    [ -n "${CI:-}" ] && exit 1
    exit 0
else
    log "\n${GREEN}ALL SMOKE TESTS PASSED${NC}"
    exit 0
fi
