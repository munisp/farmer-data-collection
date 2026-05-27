#!/bin/bash

# Unified Middleware Startup Script
# Starts all 8 middleware services with health checks and monitoring
# Usage: ./scripts/start-all-services.sh [--dev|--prod]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MODE="${1:-dev}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs"
PID_DIR="$PROJECT_ROOT/pids"

# Create directories
mkdir -p "$LOG_DIR" "$PID_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Farmer Data Collection Platform${NC}"
echo -e "${BLUE}Unified Middleware Startup${NC}"
echo -e "${BLUE}Mode: $MODE${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to wait for service to be healthy
wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=30
    local attempt=1
    
    echo -e "${YELLOW}Waiting for $name to be healthy...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ $name is healthy${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}✗ $name failed to start${NC}"
    return 1
}

# Function to start a service
start_service() {
    local name=$1
    local command=$2
    local port=$3
    local health_url=$4
    
    echo -e "${BLUE}Starting $name...${NC}"
    
    # Check if already running
    if check_port $port; then
        echo -e "${YELLOW}⚠ $name already running on port $port${NC}"
        return 0
    fi
    
    # Start the service
    cd "$PROJECT_ROOT"
    eval "$command" > "$LOG_DIR/$name.log" 2>&1 &
    local pid=$!
    echo $pid > "$PID_DIR/$name.pid"
    
    # Wait for health check
    if [ -n "$health_url" ]; then
        if wait_for_service "$name" "$health_url"; then
            echo -e "${GREEN}✓ $name started (PID: $pid, Port: $port)${NC}"
        else
            echo -e "${RED}✗ $name failed health check${NC}"
            return 1
        fi
    else
        sleep 2
        echo -e "${GREEN}✓ $name started (PID: $pid, Port: $port)${NC}"
    fi
    
    echo ""
}

# Stop all services function
stop_all_services() {
    echo -e "${YELLOW}Stopping all services...${NC}"
    
    for pidfile in "$PID_DIR"/*.pid; do
        if [ -f "$pidfile" ]; then
            local pid=$(cat "$pidfile")
            local name=$(basename "$pidfile" .pid)
            
            if kill -0 $pid 2>/dev/null; then
                echo -e "${YELLOW}Stopping $name (PID: $pid)...${NC}"
                kill $pid 2>/dev/null || true
                sleep 1
                
                # Force kill if still running
                if kill -0 $pid 2>/dev/null; then
                    kill -9 $pid 2>/dev/null || true
                fi
            fi
            
            rm "$pidfile"
        fi
    done
    
    echo -e "${GREEN}All services stopped${NC}"
}

# Trap to stop services on script exit
trap stop_all_services EXIT INT TERM

echo -e "${BLUE}=== Starting Infrastructure Services ===${NC}"
echo ""

# 1. Redis (if not already running)
if ! check_port 6379; then
    echo -e "${YELLOW}Redis not detected. Please start Redis manually:${NC}"
    echo -e "${YELLOW}  sudo systemctl start redis${NC}"
    echo -e "${YELLOW}  or: redis-server &${NC}"
    echo ""
fi

# 2. PostgreSQL (check only)
if ! check_port 5432; then
    echo -e "${YELLOW}PostgreSQL not detected. Please start PostgreSQL manually:${NC}"
    echo -e "${YELLOW}  sudo systemctl start postgresql${NC}"
    echo ""
fi

echo -e "${BLUE}=== Starting Go Microservices ===${NC}"
echo ""

# 3. Go Image Processing Service
start_service \
    "image-service" \
    "$PROJECT_ROOT/services/go/image-service/image-service" \
    "8080" \
    "http://localhost:8080/health"

# 4. Go WebSocket Service
start_service \
    "websocket-service" \
    "$PROJECT_ROOT/services/go/websocket-service/websocket-service" \
    "8081" \
    "http://localhost:8081/health"

# 5. Dapr Service
start_service \
    "dapr-service" \
    "$PROJECT_ROOT/services/go/dapr-service/dapr-service" \
    "8082" \
    "http://localhost:8082/health"

# 6. APISIX Gateway
start_service \
    "apisix-gateway" \
    "$PROJECT_ROOT/services/go/apisix-gateway/apisix-gateway" \
    "8085" \
    "http://localhost:8085/health"

# 7. Fluvio Streaming Service
start_service \
    "fluvio-streaming" \
    "$PROJECT_ROOT/services/go/fluvio-streaming/fluvio-streaming" \
    "8084" \
    "http://localhost:8084/health"

echo -e "${BLUE}=== Starting Python Services ===${NC}"
echo ""

# 8. Python ML Service
start_service \
    "ml-service" \
    "cd $PROJECT_ROOT/services/python/ml-service && python3 main.py" \
    "8000" \
    "http://localhost:8000/health"

# 9. Temporal Workflows (worker mode)
if [ "$MODE" = "prod" ]; then
    start_service \
        "temporal-worker" \
        "cd $PROJECT_ROOT/services/python/temporal-workflows && python3 worker.py" \
        "" \
        ""
fi

echo -e "${BLUE}=== Starting Node.js Backend ===${NC}"
echo ""

# 10. Main Application Server
if [ "$MODE" = "dev" ]; then
    start_service \
        "app-server" \
        "cd $PROJECT_ROOT && pnpm dev" \
        "3000" \
        "http://localhost:3000/api/health"
else
    start_service \
        "app-server" \
        "cd $PROJECT_ROOT && NODE_ENV=production node dist/index.js" \
        "3000" \
        "http://localhost:3000/api/health"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All services started successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Service Status:${NC}"
echo -e "  Image Service:      http://localhost:8080"
echo -e "  WebSocket Service:  http://localhost:8081"
echo -e "  Dapr Service:       http://localhost:8082"
echo -e "  APISIX Gateway:     http://localhost:8085"
echo -e "  Fluvio Streaming:   http://localhost:8084"
echo -e "  ML Service:         http://localhost:8000"
echo -e "  Main Application:   http://localhost:3000"
echo ""
echo -e "${BLUE}Logs:${NC} $LOG_DIR"
echo -e "${BLUE}PIDs:${NC} $PID_DIR"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep script running
wait
