#!/bin/bash

echo "🚀 Starting Farmer Data Collection Microservices..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Go is installed
if command -v go &> /dev/null; then
    echo -e "${GREEN}✓${NC} Go is installed"
    
    # Start GPS service in background
    echo -e "${YELLOW}Starting GPS Tracking Service (Go) on port 8087...${NC}"
    cd gps-service-go
    go mod download 2>/dev/null
    go run main.go &
    GPS_PID=$!
    cd ..
    echo -e "${GREEN}✓${NC} GPS Service started (PID: $GPS_PID)"
else
    echo -e "${YELLOW}⚠${NC} Go not installed, skipping GPS service"
fi

# Check if Python is installed
if command -v python3 &> /dev/null; then
    echo -e "${GREEN}✓${NC} Python is installed"
    
    # Start Agricultural Models service in background
    echo -e "${YELLOW}Starting Agricultural Models Service (Python) on port 8086...${NC}"
    cd agricultural-models-python
    
    # Create virtual environment if it doesn't exist
    if [ ! -d "venv" ]; then
        python3 -m venv venv
    fi
    
    source venv/bin/activate
    pip install -q -r requirements.txt
    python main.py &
    PYTHON_PID=$!
    cd ..
    echo -e "${GREEN}✓${NC} Agricultural Models Service started (PID: $PYTHON_PID)"
else
    echo -e "${YELLOW}⚠${NC} Python not installed, skipping Agricultural Models service"
fi

echo ""
echo -e "${GREEN}✓ All services started!${NC}"
echo ""
echo "Service URLs:"
echo "  - GPS Tracking (Go):        http://localhost:8087/health"
echo "  - Agricultural Models (Python): http://localhost:8086/health"
echo ""
echo "To stop services:"
echo "  kill $GPS_PID $PYTHON_PID"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for user interrupt
wait
