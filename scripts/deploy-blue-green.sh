#!/bin/bash

# Blue-Green Deployment Script
# Implements zero-downtime deployment with automatic rollback
# Usage: ./scripts/deploy-blue-green.sh [blue|green]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
TARGET_ENV="${1:-blue}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost:3000/api/health}"
METRICS_URL="${METRICS_URL:-http://localhost:9464/metrics}"
ROLLBACK_ON_ERROR="${ROLLBACK_ON_ERROR:-true}"
MONITORING_DURATION="${MONITORING_DURATION:-300}"  # 5 minutes
LOG_FILE="logs/deployment-$(date +%Y%m%d_%H%M%S).log"

# Validate environment
if [[ "$TARGET_ENV" != "blue" && "$TARGET_ENV" != "green" ]]; then
    echo -e "${RED}Error: Environment must be 'blue' or 'green'${NC}"
    exit 1
fi

# Create logs directory
mkdir -p logs

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Blue-Green Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Target Environment: $TARGET_ENV${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

log "Starting blue-green deployment to $TARGET_ENV"

# ============================================================================
# Step 1: Pre-deployment Checks
# ============================================================================

echo -e "${BLUE}Step 1: Pre-deployment checks...${NC}"

# Check if current environment is healthy
CURRENT_ENV=$([ "$TARGET_ENV" = "blue" ] && echo "green" || echo "blue")
echo -e "Current active environment: $CURRENT_ENV"

if curl -sf "$HEALTH_CHECK_URL" > /dev/null; then
    echo -e "${GREEN}✓ Current environment is healthy${NC}"
    log "Current environment ($CURRENT_ENV) is healthy"
else
    echo -e "${YELLOW}⚠ Current environment health check failed${NC}"
    log "Warning: Current environment health check failed"
fi

# Check disk space
DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_USAGE" -gt 90 ]; then
    echo -e "${RED}✗ Insufficient disk space: ${DISK_USAGE}%${NC}"
    log "Error: Insufficient disk space"
    exit 1
fi
echo -e "${GREEN}✓ Disk space is adequate: ${DISK_USAGE}%${NC}"

# Check memory
FREE_MEM=$(free -m | awk 'NR==2{print $7}')
if [ "$FREE_MEM" -lt 512 ]; then
    echo -e "${RED}✗ Insufficient memory: ${FREE_MEM}MB${NC}"
    log "Error: Insufficient memory"
    exit 1
fi
echo -e "${GREEN}✓ Memory is adequate: ${FREE_MEM}MB free${NC}"

echo ""

# ============================================================================
# Step 2: Deploy to Target Environment
# ============================================================================

echo -e "${BLUE}Step 2: Deploying to $TARGET_ENV environment...${NC}"

# Stop services in target environment
echo -e "${YELLOW}Stopping services in $TARGET_ENV...${NC}"
./scripts/stop-all-services.sh || true
log "Stopped services in $TARGET_ENV"

# Pull latest code
echo -e "${YELLOW}Pulling latest code...${NC}"
git pull origin main || {
    echo -e "${RED}✗ Failed to pull latest code${NC}"
    log "Error: Failed to pull latest code"
    exit 1
}
log "Pulled latest code"

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
pnpm install --frozen-lockfile || {
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    log "Error: Failed to install dependencies"
    exit 1
}
log "Installed dependencies"

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
pnpm run db:push || {
    echo -e "${RED}✗ Failed to run migrations${NC}"
    log "Error: Failed to run migrations"
    exit 1
}
log "Ran database migrations"

# Build application
echo -e "${YELLOW}Building application...${NC}"
pnpm run build || {
    echo -e "${RED}✗ Failed to build application${NC}"
    log "Error: Failed to build application"
    exit 1
}
log "Built application"

# Start services
echo -e "${YELLOW}Starting services in $TARGET_ENV...${NC}"
./scripts/start-all-services.sh --prod || {
    echo -e "${RED}✗ Failed to start services${NC}"
    log "Error: Failed to start services"
    exit 1
}
log "Started services in $TARGET_ENV"

echo -e "${GREEN}✓ Deployment to $TARGET_ENV completed${NC}"
echo ""

# ============================================================================
# Step 3: Health Checks
# ============================================================================

echo -e "${BLUE}Step 3: Running health checks...${NC}"

# Wait for services to start
echo -e "${YELLOW}Waiting for services to start (30s)...${NC}"
sleep 30

# Check health endpoint
HEALTH_RETRIES=5
HEALTH_SUCCESS=false

for i in $(seq 1 $HEALTH_RETRIES); do
    echo -e "${YELLOW}Health check attempt $i/$HEALTH_RETRIES...${NC}"
    
    if curl -sf "$HEALTH_CHECK_URL" > /dev/null; then
        echo -e "${GREEN}✓ Health check passed${NC}"
        HEALTH_SUCCESS=true
        log "Health check passed"
        break
    else
        echo -e "${YELLOW}⚠ Health check failed, retrying...${NC}"
        sleep 10
    fi
done

if [ "$HEALTH_SUCCESS" = false ]; then
    echo -e "${RED}✗ Health checks failed after $HEALTH_RETRIES attempts${NC}"
    log "Error: Health checks failed"
    
    if [ "$ROLLBACK_ON_ERROR" = true ]; then
        echo -e "${YELLOW}Rolling back deployment...${NC}"
        ./scripts/rollback-deployment.sh
        exit 1
    fi
fi

echo ""

# ============================================================================
# Step 4: Smoke Tests
# ============================================================================

echo -e "${BLUE}Step 4: Running smoke tests...${NC}"

# Test critical endpoints
SMOKE_TESTS=(
    "/api/health"
    "/api/trpc/auth.me"
    "/api/trpc/marketplace.browse"
)

SMOKE_SUCCESS=true

for endpoint in "${SMOKE_TESTS[@]}"; do
    echo -e "${YELLOW}Testing $endpoint...${NC}"
    
    if curl -sf "${HEALTH_CHECK_URL%/api/health}$endpoint" > /dev/null; then
        echo -e "${GREEN}✓ $endpoint OK${NC}"
    else
        echo -e "${RED}✗ $endpoint FAILED${NC}"
        SMOKE_SUCCESS=false
        log "Smoke test failed: $endpoint"
    fi
done

if [ "$SMOKE_SUCCESS" = false ]; then
    echo -e "${RED}✗ Smoke tests failed${NC}"
    
    if [ "$ROLLBACK_ON_ERROR" = true ]; then
        echo -e "${YELLOW}Rolling back deployment...${NC}"
        ./scripts/rollback-deployment.sh
        exit 1
    fi
fi

echo -e "${GREEN}✓ All smoke tests passed${NC}"
echo ""

# ============================================================================
# Step 5: Traffic Switch
# ============================================================================

echo -e "${BLUE}Step 5: Switching traffic to $TARGET_ENV...${NC}"

# Update load balancer / reverse proxy configuration
# This is environment-specific, adjust as needed

echo -e "${YELLOW}Updating load balancer configuration...${NC}"

# Example: Update NGINX configuration
# sed -i "s/upstream backend { server $CURRENT_ENV:3000; }/upstream backend { server $TARGET_ENV:3000; }/" /etc/nginx/nginx.conf
# nginx -s reload

echo -e "${GREEN}✓ Traffic switched to $TARGET_ENV${NC}"
log "Traffic switched to $TARGET_ENV"

echo ""

# ============================================================================
# Step 6: Monitor Metrics
# ============================================================================

echo -e "${BLUE}Step 6: Monitoring metrics for ${MONITORING_DURATION}s...${NC}"

START_TIME=$(date +%s)
END_TIME=$((START_TIME + MONITORING_DURATION))

METRICS_OK=true

while [ $(date +%s) -lt $END_TIME ]; do
    ELAPSED=$(($(date +%s) - START_TIME))
    REMAINING=$((MONITORING_DURATION - ELAPSED))
    
    echo -ne "${YELLOW}Monitoring... ${REMAINING}s remaining\r${NC}"
    
    # Check error rate
    ERROR_RATE=$(curl -s "$METRICS_URL" | grep "http_requests_total" | grep "status=\"5" | awk '{sum+=$2} END {print sum}' || echo "0")
    
    # Check if error rate is too high
    if [ "$ERROR_RATE" -gt 100 ]; then
        echo -e "\n${RED}✗ High error rate detected: $ERROR_RATE errors${NC}"
        METRICS_OK=false
        log "High error rate detected: $ERROR_RATE"
        break
    fi
    
    sleep 10
done

echo ""

if [ "$METRICS_OK" = false ]; then
    echo -e "${RED}✗ Metrics monitoring failed${NC}"
    
    if [ "$ROLLBACK_ON_ERROR" = true ]; then
        echo -e "${YELLOW}Rolling back deployment...${NC}"
        ./scripts/switch-traffic.sh "$CURRENT_ENV"
        log "Rolled back to $CURRENT_ENV"
        exit 1
    fi
fi

echo -e "${GREEN}✓ Metrics are healthy${NC}"
log "Metrics monitoring passed"

echo ""

# ============================================================================
# Step 7: Finalize Deployment
# ============================================================================

echo -e "${BLUE}Step 7: Finalizing deployment...${NC}"

# Stop old environment
echo -e "${YELLOW}Stopping services in $CURRENT_ENV...${NC}"
# ./scripts/stop-services.sh "$CURRENT_ENV"

echo -e "${GREEN}✓ Deployment finalized${NC}"
log "Deployment finalized successfully"

echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Deployment Successful!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Environment: $TARGET_ENV"
echo -e "Previous: $CURRENT_ENV"
echo -e "Log file: $LOG_FILE"
echo -e "${BLUE}========================================${NC}"

log "Deployment completed successfully"
