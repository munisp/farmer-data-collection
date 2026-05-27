# Advanced Features Documentation

This document describes the advanced features added to the Farmer Data Collection application.

## Architecture Overview

Polyglot microservices architecture:
- **Node.js/TypeScript**: Main application server (tRPC)
- **Go**: GPS tracking service (Port 8087)
- **Python**: Agricultural models service (Port 8086)

## GPS Tracking System

High-performance geospatial calculations using Go.

Features:
- Device management
- Real-time tracking
- Distance calculations (Haversine)
- Geofencing
- Track simplification (Douglas-Peucker)
- Heatmap generation

## Weather Dashboard

Real-time weather data and agricultural indices.

Features:
- Current weather conditions
- 5-day forecast
- Agricultural indices (Heat Stress, ET₀, GDD, Frost Risk)
- Irrigation recommendations

## Agricultural Models

Advanced crop analysis using Python.

Models:
1. **Biomass Estimation**: NDVI-based regression
2. **Canopy Height**: Logistic growth curves
3. **LST Analysis**: Crop water stress index
4. **NDVI Calculation**: Vegetation health assessment

## Deployment

Development:
\`\`\`bash
cd services
./start-services.sh
\`\`\`

Testing:
\`\`\`bash
cd services
./test-services.sh
\`\`\`

See services/README.md for detailed documentation.
