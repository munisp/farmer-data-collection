#!/bin/bash

# Stop All Middleware Services Script
# Usage: ./scripts/stop-all-services.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$PROJECT_ROOT/pids"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Stopping All Services${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ ! -d "$PID_DIR" ]; then
    echo -e "${YELLOW}No PID directory found. Services may not be running.${NC}"
    exit 0
fi

stopped_count=0
failed_count=0

for pidfile in "$PID_DIR"/*.pid; do
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile")
        name=$(basename "$pidfile" .pid)
        
        if kill -0 $pid 2>/dev/null; then
            echo -e "${YELLOW}Stopping $name (PID: $pid)...${NC}"
            
            # Try graceful shutdown first
            kill $pid 2>/dev/null || true
            sleep 2
            
            # Force kill if still running
            if kill -0 $pid 2>/dev/null; then
                echo -e "${YELLOW}  Force killing $name...${NC}"
                kill -9 $pid 2>/dev/null || true
            fi
            
            # Verify stopped
            if ! kill -0 $pid 2>/dev/null; then
                echo -e "${GREEN}✓ $name stopped${NC}"
                stopped_count=$((stopped_count + 1))
            else
                echo -e "${RED}✗ Failed to stop $name${NC}"
                failed_count=$((failed_count + 1))
            fi
        else
            echo -e "${YELLOW}⚠ $name not running (stale PID file)${NC}"
        fi
        
        rm "$pidfile"
    fi
done

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Stopped: $stopped_count services${NC}"
if [ $failed_count -gt 0 ]; then
    echo -e "${RED}Failed: $failed_count services${NC}"
fi
echo -e "${BLUE}========================================${NC}"
