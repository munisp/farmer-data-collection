#!/bin/bash

# Automated Remediation Master Script
# Detects common issues and applies automated fixes
# Usage: ./scripts/remediation/auto-remediate.sh [--dry-run]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DRY_RUN=false
LOG_FILE="logs/remediation.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Create logs directory
mkdir -p logs

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Automated Remediation System${NC}"
echo -e "${BLUE}========================================${NC}"
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
fi
echo ""

log "Starting automated remediation"

# ============================================================================
# Check 1: Kafka Consumer Lag
# ============================================================================

echo -e "${BLUE}Checking Kafka consumer lag...${NC}"

KAFKA_LAG=$(kafka-consumer-groups --bootstrap-server localhost:9092 \
    --group farmer-platform-consumers \
    --describe 2>/dev/null | grep -v "CURRENT-OFFSET" | awk '{sum+=$5} END {print sum}' || echo "0")

if [ "$KAFKA_LAG" -gt 1000 ]; then
    echo -e "${RED}✗ High Kafka lag detected: $KAFKA_LAG messages${NC}"
    log "High Kafka lag detected: $KAFKA_LAG messages"
    
    if [ "$DRY_RUN" = false ]; then
        echo -e "${YELLOW}Applying fix: Scaling Kafka consumers...${NC}"
        "$SCRIPT_DIR/fix-kafka-lag.sh" --auto
        log "Kafka lag remediation applied"
    else
        echo -e "${YELLOW}Would run: $SCRIPT_DIR/fix-kafka-lag.sh --auto${NC}"
    fi
else
    echo -e "${GREEN}✓ Kafka lag is normal: $KAFKA_LAG messages${NC}"
fi

echo ""

# ============================================================================
# Check 2: Redis Memory Usage
# ============================================================================

echo -e "${BLUE}Checking Redis memory usage...${NC}"

REDIS_MEMORY=$(redis-cli INFO memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r' || echo "0M")
REDIS_MAX=$(redis-cli INFO memory 2>/dev/null | grep "maxmemory_human" | cut -d: -f2 | tr -d '\r' || echo "0M")
REDIS_PERCENT=$(redis-cli INFO memory 2>/dev/null | grep "used_memory_rss_human" | cut -d: -f2 | tr -d '\r' || echo "0")

echo -e "Memory usage: $REDIS_MEMORY / $REDIS_MAX"

# Simple check - if Redis is running and memory seems high
if redis-cli PING 2>/dev/null | grep -q "PONG"; then
    REDIS_KEYS=$(redis-cli DBSIZE | grep -o '[0-9]*')
    
    if [ "$REDIS_KEYS" -gt 100000 ]; then
        echo -e "${YELLOW}⚠ High number of Redis keys: $REDIS_KEYS${NC}"
        log "High Redis key count: $REDIS_KEYS"
        
        if [ "$DRY_RUN" = false ]; then
            echo -e "${YELLOW}Applying fix: Cleaning up expired keys...${NC}"
            "$SCRIPT_DIR/cleanup-redis.sh" --expired-only
            log "Redis cleanup applied"
        else
            echo -e "${YELLOW}Would run: $SCRIPT_DIR/cleanup-redis.sh --expired-only${NC}"
        fi
    else
        echo -e "${GREEN}✓ Redis memory usage is normal${NC}"
    fi
else
    echo -e "${RED}✗ Redis is not responding${NC}"
    log "Redis is not responding"
    
    if [ "$DRY_RUN" = false ]; then
        echo -e "${YELLOW}Applying fix: Restarting Redis...${NC}"
        sudo systemctl restart redis || true
        log "Redis restart attempted"
    fi
fi

echo ""

# ============================================================================
# Check 3: Service Health
# ============================================================================

echo -e "${BLUE}Checking service health...${NC}"

SERVICES_DOWN=0

# Check if services are running via PID files
if [ -d "pids" ]; then
    for pidfile in pids/*.pid; do
        if [ -f "$pidfile" ]; then
            pid=$(cat "$pidfile")
            service=$(basename "$pidfile" .pid)
            
            if ! kill -0 $pid 2>/dev/null; then
                echo -e "${RED}✗ Service down: $service${NC}"
                log "Service down: $service"
                SERVICES_DOWN=$((SERVICES_DOWN + 1))
                
                if [ "$DRY_RUN" = false ]; then
                    echo -e "${YELLOW}Applying fix: Restarting $service...${NC}"
                    "$SCRIPT_DIR/restart-service.sh" "$service"
                    log "Service restart: $service"
                else
                    echo -e "${YELLOW}Would run: $SCRIPT_DIR/restart-service.sh $service${NC}"
                fi
            fi
        fi
    done
fi

if [ $SERVICES_DOWN -eq 0 ]; then
    echo -e "${GREEN}✓ All services are running${NC}"
fi

echo ""

# ============================================================================
# Check 4: Database Connections
# ============================================================================

echo -e "${BLUE}Checking database connections...${NC}"

DB_CONNECTIONS=$(psql -U postgres -t -c "SELECT count(*) FROM pg_stat_activity;" 2>/dev/null | tr -d ' ' || echo "0")
DB_MAX=$(psql -U postgres -t -c "SHOW max_connections;" 2>/dev/null | tr -d ' ' || echo "100")

if [ "$DB_CONNECTIONS" -gt 0 ]; then
    DB_PERCENT=$((DB_CONNECTIONS * 100 / DB_MAX))
    echo -e "Connections: $DB_CONNECTIONS / $DB_MAX ($DB_PERCENT%)"
    
    if [ $DB_PERCENT -gt 80 ]; then
        echo -e "${RED}✗ High database connection usage: $DB_PERCENT%${NC}"
        log "High database connection usage: $DB_PERCENT%"
        
        if [ "$DRY_RUN" = false ]; then
            echo -e "${YELLOW}Applying fix: Killing slow queries...${NC}"
            "$SCRIPT_DIR/kill-slow-queries.sh" --threshold 30s
            log "Slow queries killed"
        else
            echo -e "${YELLOW}Would run: $SCRIPT_DIR/kill-slow-queries.sh --threshold 30s${NC}"
        fi
    else
        echo -e "${GREEN}✓ Database connection usage is normal${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Could not check database connections${NC}"
fi

echo ""

# ============================================================================
# Check 5: Disk Space
# ============================================================================

echo -e "${BLUE}Checking disk space...${NC}"

DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')

echo -e "Disk usage: $DISK_USAGE%"

if [ "$DISK_USAGE" -gt 90 ]; then
    echo -e "${RED}✗ Critical disk space: $DISK_USAGE%${NC}"
    log "Critical disk space: $DISK_USAGE%"
    
    if [ "$DRY_RUN" = false ]; then
        echo -e "${YELLOW}Applying fix: Cleaning up old logs...${NC}"
        find logs/ -name "*.log" -mtime +7 -delete
        find logs/remediation/ -name "*.log" -mtime +30 -delete
        log "Old logs cleaned up"
    else
        echo -e "${YELLOW}Would clean up old logs${NC}"
    fi
elif [ "$DISK_USAGE" -gt 80 ]; then
    echo -e "${YELLOW}⚠ High disk usage: $DISK_USAGE%${NC}"
    log "High disk usage: $DISK_USAGE%"
else
    echo -e "${GREEN}✓ Disk space is adequate${NC}"
fi

echo ""

# ============================================================================
# Check 6: Event Loop Lag
# ============================================================================

echo -e "${BLUE}Checking Node.js event loop lag...${NC}"

EVENT_LOOP_LAG=$(curl -s http://localhost:9464/metrics 2>/dev/null | grep "nodejs_eventloop_lag_seconds" | grep -v "#" | awk '{print $2}' || echo "0")

if [ -n "$EVENT_LOOP_LAG" ] && [ "$EVENT_LOOP_LAG" != "0" ]; then
    # Convert to milliseconds for comparison
    LAG_MS=$(echo "$EVENT_LOOP_LAG * 1000" | bc -l | cut -d. -f1)
    
    echo -e "Event loop lag: ${LAG_MS}ms"
    
    if [ "$LAG_MS" -gt 100 ]; then
        echo -e "${RED}✗ High event loop lag: ${LAG_MS}ms${NC}"
        log "High event loop lag: ${LAG_MS}ms"
        
        if [ "$DRY_RUN" = false ]; then
            echo -e "${YELLOW}Applying fix: Restarting Node.js services...${NC}"
            "$SCRIPT_DIR/restart-service.sh" backend
            log "Backend service restarted due to high event loop lag"
        else
            echo -e "${YELLOW}Would restart backend service${NC}"
        fi
    else
        echo -e "${GREEN}✓ Event loop lag is normal${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Could not check event loop lag${NC}"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Remediation Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}DRY RUN completed - no changes were made${NC}"
else
    echo -e "${GREEN}Automated remediation completed${NC}"
fi

echo -e "Log file: $LOG_FILE"
echo -e "${BLUE}========================================${NC}"

log "Automated remediation completed"
