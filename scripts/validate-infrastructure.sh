#!/bin/bash
# Infrastructure Validation Script
# Validates all infrastructure services are healthy and properly configured

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
KAFKA_BROKER="${KAFKA_BROKER:-localhost:9092}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
API_URL="${API_URL:-http://localhost:3001}"

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
}

log_info() {
    echo -e "[INFO] $1"
}

# Check if a TCP port is open
check_tcp() {
    local host=$1
    local port=$2
    local timeout=${3:-5}
    
    if timeout $timeout bash -c "cat < /dev/null > /dev/tcp/$host/$port" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Check if an HTTP endpoint returns expected status
check_http() {
    local url=$1
    local expected_status=${2:-200}
    local timeout=${3:-10}
    
    local status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout $timeout "$url" 2>/dev/null || echo "000")
    
    if [ "$status" == "$expected_status" ]; then
        return 0
    else
        return 1
    fi
}

echo "=========================================="
echo "Infrastructure Validation"
echo "=========================================="
echo ""

# 1. PostgreSQL
echo "--- PostgreSQL ---"
if check_tcp "$POSTGRES_HOST" "$POSTGRES_PORT"; then
    log_pass "PostgreSQL is reachable on $POSTGRES_HOST:$POSTGRES_PORT"
    
    # Check if we can connect with psql
    if command -v psql &> /dev/null; then
        if psql "$DATABASE_URL" -c "SELECT 1" &> /dev/null; then
            log_pass "PostgreSQL connection successful"
            
            # Check table count
            TABLE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>/dev/null | tr -d ' ')
            if [ -n "$TABLE_COUNT" ] && [ "$TABLE_COUNT" -gt 0 ]; then
                log_pass "PostgreSQL has $TABLE_COUNT tables"
            else
                log_warn "PostgreSQL has no tables - migrations may not have run"
            fi
        else
            log_fail "PostgreSQL connection failed"
        fi
    else
        log_warn "psql not installed - skipping detailed checks"
    fi
else
    log_fail "PostgreSQL is not reachable on $POSTGRES_HOST:$POSTGRES_PORT"
fi
echo ""

# 2. Redis
echo "--- Redis ---"
if check_tcp "$REDIS_HOST" "$REDIS_PORT"; then
    log_pass "Redis is reachable on $REDIS_HOST:$REDIS_PORT"
    
    # Check if we can ping Redis
    if command -v redis-cli &> /dev/null; then
        PONG=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING 2>/dev/null)
        if [ "$PONG" == "PONG" ]; then
            log_pass "Redis PING successful"
        else
            log_fail "Redis PING failed"
        fi
    else
        log_warn "redis-cli not installed - skipping detailed checks"
    fi
else
    log_fail "Redis is not reachable on $REDIS_HOST:$REDIS_PORT"
fi
echo ""

# 3. Kafka
echo "--- Kafka ---"
KAFKA_HOST=$(echo "$KAFKA_BROKER" | cut -d: -f1)
KAFKA_PORT=$(echo "$KAFKA_BROKER" | cut -d: -f2)
if check_tcp "$KAFKA_HOST" "$KAFKA_PORT" 10; then
    log_pass "Kafka broker is reachable on $KAFKA_BROKER"
else
    log_warn "Kafka broker is not reachable on $KAFKA_BROKER (optional service)"
fi
echo ""

# 4. Keycloak
echo "--- Keycloak ---"
if check_http "$KEYCLOAK_URL/health/ready" 200; then
    log_pass "Keycloak is healthy at $KEYCLOAK_URL"
elif check_http "$KEYCLOAK_URL" 200; then
    log_pass "Keycloak is reachable at $KEYCLOAK_URL"
else
    log_warn "Keycloak is not reachable at $KEYCLOAK_URL (optional service)"
fi
echo ""

# 5. API Server
echo "--- API Server ---"
if check_http "$API_URL/health" 200; then
    log_pass "API server is healthy at $API_URL"
    
    # Check tRPC endpoint
    if check_http "$API_URL/api/trpc" 200; then
        log_pass "tRPC endpoint is accessible"
    else
        log_warn "tRPC endpoint returned non-200 status"
    fi
else
    log_fail "API server is not healthy at $API_URL"
fi
echo ""

# 6. Environment Variables
echo "--- Environment Variables ---"
REQUIRED_VARS=("DATABASE_URL" "JWT_SECRET")
OPTIONAL_VARS=("REDIS_URL" "STRIPE_SECRET_KEY" "AFRICASTALKING_API_KEY" "KEYCLOAK_URL")

for var in "${REQUIRED_VARS[@]}"; do
    if [ -n "${!var}" ]; then
        log_pass "$var is set"
    else
        log_fail "$var is not set (required)"
    fi
done

for var in "${OPTIONAL_VARS[@]}"; do
    if [ -n "${!var}" ]; then
        log_pass "$var is set"
    else
        log_warn "$var is not set (optional)"
    fi
done
echo ""

# 7. File System Checks
echo "--- File System ---"
if [ -f "package.json" ]; then
    log_pass "package.json exists"
else
    log_fail "package.json not found"
fi

if [ -d "node_modules" ]; then
    log_pass "node_modules directory exists"
else
    log_fail "node_modules not found - run pnpm install"
fi

if [ -d "drizzle/migrations" ]; then
    MIGRATION_COUNT=$(ls -1 drizzle/migrations/*.sql 2>/dev/null | wc -l)
    log_pass "Found $MIGRATION_COUNT migration files"
else
    log_warn "drizzle/migrations directory not found"
fi
echo ""

# Summary
echo "=========================================="
echo "Validation Summary"
echo "=========================================="
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Infrastructure validation FAILED${NC}"
    echo "Please fix the failed checks before deploying."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}Infrastructure validation PASSED with warnings${NC}"
    echo "Review warnings before deploying to production."
    exit 0
else
    echo -e "${GREEN}Infrastructure validation PASSED${NC}"
    echo "All checks passed. Ready for deployment."
    exit 0
fi
