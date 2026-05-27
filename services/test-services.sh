#!/bin/bash

echo "🧪 Testing Farmer Data Collection Microservices"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test Go GPS Service
echo -e "${YELLOW}Testing GPS Tracking Service (Go - Port 8087)...${NC}"
echo ""

# Health check
echo "1. Health Check:"
HEALTH_RESPONSE=$(curl -s http://localhost:8087/health)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Health check passed"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo -e "${RED}✗${NC} Health check failed (service may not be running)"
fi
echo ""

# Distance calculation
echo "2. Distance Calculation:"
DISTANCE_RESPONSE=$(curl -s -X POST http://localhost:8087/api/gps/calculate-distance \
  -H "Content-Type: application/json" \
  -d '{
    "point1": {"latitude": 6.5244, "longitude": 3.3792, "timestamp": "2024-01-01T00:00:00Z"},
    "point2": {"latitude": 6.6018, "longitude": 3.3515, "timestamp": "2024-01-01T00:00:00Z"}
  }')

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Distance calculation passed"
    echo "   Response: $DISTANCE_RESPONSE"
else
    echo -e "${RED}✗${NC} Distance calculation failed"
fi
echo ""

# Track statistics
echo "3. Track Statistics:"
STATS_RESPONSE=$(curl -s -X POST http://localhost:8087/api/gps/track-statistics \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "GPS-001",
    "points": [
      {"latitude": 6.5244, "longitude": 3.3792, "altitude": 50, "timestamp": "2024-01-01T00:00:00Z"},
      {"latitude": 6.5250, "longitude": 3.3800, "altitude": 52, "timestamp": "2024-01-01T00:05:00Z"},
      {"latitude": 6.5260, "longitude": 3.3810, "altitude": 54, "timestamp": "2024-01-01T00:10:00Z"}
    ]
  }')

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Track statistics passed"
    echo "   Response: $STATS_RESPONSE"
else
    echo -e "${RED}✗${NC} Track statistics failed"
fi
echo ""

echo "================================================"
echo ""

# Test Python Agricultural Models Service
echo -e "${YELLOW}Testing Agricultural Models Service (Python - Port 8086)...${NC}"
echo ""

# Health check
echo "1. Health Check:"
HEALTH_RESPONSE=$(curl -s http://localhost:8086/health)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Health check passed"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo -e "${RED}✗${NC} Health check failed (service may not be running)"
fi
echo ""

# Biomass estimation
echo "2. Biomass Estimation:"
BIOMASS_RESPONSE=$(curl -s -X POST http://localhost:8086/api/models/biomass/estimate \
  -H "Content-Type: application/json" \
  -d '{
    "ndvi": 0.65,
    "crop_type": "maize",
    "growth_stage": "flowering"
  }')

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Biomass estimation passed"
    echo "   Response: $BIOMASS_RESPONSE"
else
    echo -e "${RED}✗${NC} Biomass estimation failed"
fi
echo ""

# Canopy height estimation
echo "3. Canopy Height Estimation:"
CANOPY_RESPONSE=$(curl -s -X POST http://localhost:8086/api/models/canopy-height/estimate \
  -H "Content-Type: application/json" \
  -d '{
    "crop_type": "maize",
    "days_after_planting": 60,
    "method": "photogrammetry"
  }')

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Canopy height estimation passed"
    echo "   Response: $CANOPY_RESPONSE"
else
    echo -e "${RED}✗${NC} Canopy height estimation failed"
fi
echo ""

# LST analysis
echo "4. LST Analysis:"
LST_RESPONSE=$(curl -s -X POST http://localhost:8086/api/models/lst/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "temperature": 32.5,
    "air_temperature": 28.0,
    "ndvi": 0.7
  }')

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} LST analysis passed"
    echo "   Response: $LST_RESPONSE"
else
    echo -e "${RED}✗${NC} LST analysis failed"
fi
echo ""

# NDVI calculation
echo "5. NDVI Calculation:"
NDVI_RESPONSE=$(curl -s -X POST http://localhost:8086/api/models/ndvi/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "nir": 0.8,
    "red": 0.2
  }')

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} NDVI calculation passed"
    echo "   Response: $NDVI_RESPONSE"
else
    echo -e "${RED}✗${NC} NDVI calculation failed"
fi
echo ""

echo "================================================"
echo -e "${GREEN}✓ Testing completed!${NC}"
echo ""
echo "To start services manually:"
echo "  Go GPS Service:    cd services/gps-service-go && go run main.go"
echo "  Python ML Service: cd services/agricultural-models-python && python main.py"
echo ""
