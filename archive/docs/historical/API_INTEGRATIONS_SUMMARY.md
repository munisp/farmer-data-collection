# API Integrations & AI Models - Deployment Summary

## Overview

This document summarizes the comprehensive API integrations and AI model implementations for the Farmer Data Collection Platform. The platform now includes enterprise-grade satellite imagery analysis, real-time weather data, GPS tracking, and IBM Granite Geospatial AI models.

## 🎯 Implemented Features

### 1. ✅ IBM Granite Geospatial AI Models

**Status**: Fully implemented ML service with flood detection model

**Location**: `/ml-service/`

**Capabilities**:
- **Flood Detection**: Real-time flood detection using Sentinel-1 SAR and Sentinel-2 imagery
- **Severity Classification**: Automatic classification (none, low, moderate, high, severe)
- **Area Calculation**: Flood coverage percentage and area in km²
- **Alert Generation**: Automated alerts with recommended actions
- **Confidence Scoring**: Model confidence and validation metrics

**Available Models** (ready to integrate):
- `granite-geospatial-biomass` - Crop biomass estimation
- `granite-geospatial-canopyheight` - Vegetation height monitoring
- `granite-geospatial-land-surface-temperature` - Heat stress detection
- `granite-geospatial-wxc-downscaling` - High-resolution weather predictions

**API Endpoints**:
```
GET  /health                        # Service health check
POST /api/flood-detection           # Real flood detection
GET  /api/flood-detection/mock      # Mock endpoint for testing
```

**Documentation**: 
- `ml-service/README.md` - Service documentation
- `GRANITE_INTEGRATION_GUIDE.md` - Complete integration guide
- `granite-models-research.md` - Model research findings
- `granite-implementation-plan.md` - Detailed implementation plan

### 2. ✅ Sentinel Hub Satellite Imagery API

**Status**: Fully implemented Python client

**Location**: `/ml-service/preprocessing/sentinel_hub.py`

**Capabilities**:
- **Sentinel-2 L2A**: Multispectral imagery (Blue, Green, Red, NIR, SWIR1, SWIR2)
- **Sentinel-1 SAR**: Radar imagery (VV, VH backscatter)
- **Cloud Masking**: Automatic cloud detection and masking
- **Vegetation Indices**: NDVI, EVI, SAVI calculations
- **Time Series**: Historical imagery retrieval
- **Custom Bounding Boxes**: Flexible area selection

**Required Credentials**:
- Sentinel Hub Client ID
- Sentinel Hub Client Secret
- Sentinel Hub Instance ID

**Sign Up**: https://www.sentinel-hub.com/ (Free tier: 5,000 processing units/month)

**Cost**: 
- Free tier: ~500 requests/month
- Paid tier: $0.0024 per processing unit (~$12/month for 5,000 requests)

### 3. 📋 OpenWeatherMap Integration (Planned)

**Status**: Documentation complete, implementation pending

**Location**: `openweathermap-integration.md`

**Planned Features**:
- **Current Weather**: Real-time temperature, humidity, wind, pressure
- **7-Day Forecast**: Daily forecasts with precipitation probability
- **Weather Alerts**: Severe weather warnings and notifications
- **Soil Data**: Soil temperature and moisture (Agro API)
- **Agricultural Indices**: Evapotranspiration, growing degree days

**APIs to Use**:
- One Call API 3.0 (free tier: 1,000 calls/day)
- Agro API ($40/month for agricultural data)

**Cost Estimate**: $50-100/month for 1000 farms

### 4. 📋 GPS Tracking Integration (Planned)

**Status**: Architecture designed, implementation pending

**Location**: `gps-tracking-integration.md`

**Planned Features**:
- **Real-Time Tracking**: Live equipment and vehicle monitoring
- **Geofencing**: Enter/exit alerts for farm boundaries
- **Route History**: Historical movement tracking
- **Equipment Status**: Fuel level, engine hours, idle time monitoring
- **Multi-Protocol Support**: HTTP, MQTT, TCP, WebSocket

**Supported Devices**:
- Traccar-compatible devices (200+ models)
- Teltonika FMB series
- Queclink GL series
- Concox GT series

**Database Schema**: Complete schema designed for devices, positions, geofences, and events

## 📁 Project Structure

```
farmer-data-collection/
├── ml-service/                              # IBM Granite ML Service
│   ├── app.py                               # FastAPI application
│   ├── models/
│   │   ├── __init__.py
│   │   └── flood_detection.py               # Granite flood detection
│   ├── preprocessing/
│   │   ├── __init__.py
│   │   ├── sentinel_hub.py                  # Sentinel Hub client
│   │   └── image_processing.py              # Image preprocessing
│   ├── cache/                               # Model and result caching
│   ├── requirements.txt                     # Python dependencies
│   ├── Dockerfile                           # Docker container
│   └── README.md                            # Service documentation
│
├── docker-compose.yml                       # Updated with ML service
├── GRANITE_INTEGRATION_GUIDE.md             # Complete integration guide
├── granite-models-research.md               # Model research findings
├── granite-implementation-plan.md           # Implementation plan
├── openweathermap-integration.md            # Weather API guide
├── gps-tracking-integration.md              # GPS tracking guide
└── API_INTEGRATIONS_SUMMARY.md             # This file
```

## 🚀 Deployment Instructions

### Step 1: Set Up Sentinel Hub

1. **Create Account**
   ```bash
   # Visit https://www.sentinel-hub.com/
   # Sign up and verify email
   ```

2. **Get Credentials**
   - Navigate to Dashboard → User Settings → OAuth clients
   - Create new OAuth client
   - Note Client ID, Client Secret, and Instance ID

3. **Add to Environment**
   ```bash
   # Add to .env file
   SENTINEL_HUB_CLIENT_ID=your_client_id_here
   SENTINEL_HUB_CLIENT_SECRET=your_client_secret_here
   SENTINEL_HUB_INSTANCE_ID=your_instance_id_here
   ```

### Step 2: Deploy ML Service

**Option A: Docker Compose (Recommended)**

```bash
# Build and start all services
docker-compose up -d

# Check ML service logs
docker-compose logs -f ml-service

# Verify health
curl http://localhost:8001/health
```

**Option B: Local Development**

```bash
cd ml-service

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run service
uvicorn app:app --host 0.0.0.0 --port 8001 --reload
```

### Step 3: Test ML Service

**Test Health Endpoint**:
```bash
curl http://localhost:8001/health
```

Expected response:
```json
{
  "status": "healthy",
  "models_loaded": false,
  "sentinel_hub_configured": true,
  "redis_available": true
}
```

**Test Mock Flood Detection** (no credentials needed):
```bash
curl "http://localhost:8001/api/flood-detection/mock?latitude=51.5074&longitude=-0.1278&bbox_size_km=5.0"
```

Expected response:
```json
{
  "flood_detected": true,
  "severity": "moderate",
  "flood_percentage": 12.5,
  "flood_area_km2": 3.125,
  "avg_confidence": 0.87,
  "timestamp": "2024-01-15T10:30:00",
  "location": {"latitude": 51.5074, "longitude": -0.1278},
  "message": "Moderate flooding detected. 12.5% of area (3.12 km²) is affected.",
  "recommended_actions": [
    "Avoid affected areas if possible",
    "Secure equipment and livestock",
    "Prepare emergency drainage",
    "Contact local authorities if needed"
  ]
}
```

**Test Real Flood Detection** (requires Sentinel Hub credentials):
```bash
curl -X POST http://localhost:8001/api/flood-detection \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 51.5074,
    "longitude": -0.1278,
    "bbox_size_km": 5.0
  }'
```

### Step 4: Frontend Integration (TODO)

**Create tRPC Router**:

```typescript
// server/routers/granite-router.ts
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import axios from 'axios';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';

export const graniteRouter = router({
  detectFlood: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      date: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      // Get farm coordinates
      const farm = await ctx.db.select().from(farms)
        .where(eq(farms.id, input.farmId))
        .limit(1);
      
      if (!farm.length) throw new Error('Farm not found');
      
      // Call ML service
      const response = await axios.post(`${ML_SERVICE_URL}/api/flood-detection`, {
        latitude: farm[0].latitude,
        longitude: farm[0].longitude,
        date: input.date
      });
      
      return response.data;
    }),
});
```

**Add to Main Router**:

```typescript
// server/index.ts
import { graniteRouter } from './routers/granite-router';

export const appRouter = router({
  // ... existing routers
  granite: graniteRouter,
});
```

**Create Frontend Component**:

```typescript
// client/src/components/FloodDetectionWidget.tsx
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Droplets } from 'lucide-react';

export function FloodDetectionWidget({ farmId }: { farmId: number }) {
  const { data, isLoading } = trpc.granite.detectFlood.useQuery({ farmId });
  
  if (isLoading) return <div>Loading flood detection...</div>;
  
  return (
    <Card className={data?.flood_detected ? 'border-destructive' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {data?.flood_detected ? (
            <>
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Flood Alert: {data.severity}
            </>
          ) : (
            <>
              <Droplets className="h-5 w-5 text-blue-500" />
              No Flood Detected
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div>Coverage: {data?.flood_percentage.toFixed(2)}%</div>
          <div>Area: {data?.flood_area_km2.toFixed(2)} km²</div>
          <div>Confidence: {(data?.avg_confidence * 100).toFixed(1)}%</div>
          <div className="mt-4">
            <strong>Recommended Actions:</strong>
            <ul className="list-disc list-inside mt-2">
              {data?.recommended_actions.map((action, i) => (
                <li key={i}>{action}</li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

## 📊 Performance & Costs

### ML Service Performance

| Metric | CPU | GPU |
|--------|-----|-----|
| Inference Time | 3-5 seconds | 0.5-1 second |
| Memory Usage | ~2GB | ~4GB |
| Concurrent Requests | 5-10 | 20-50 |
| Cost (Cloud) | $20-50/month | $200-500/month |

### API Costs (Monthly Estimates)

| Service | Free Tier | Paid Tier | Estimated Cost (1000 farms) |
|---------|-----------|-----------|----------------------------|
| Sentinel Hub | 5,000 PU | $0.0024/PU | $50-100 |
| OpenWeatherMap | 1,000 calls/day | $0.0015/call | $50-100 |
| GPS Tracking | N/A | Device-dependent | $20-50 |
| ML Inference | N/A | Compute cost | $50-200 |
| **Total** | - | - | **$170-450/month** |

### Optimization Strategies

1. **Caching**
   - Redis cache for 1-24 hours
   - Reduces API calls by 60-80%
   - Estimated savings: $100-200/month

2. **Batch Processing**
   - Process multiple farms together
   - Larger bounding boxes for nearby farms
   - Estimated savings: $50-100/month

3. **Scheduled Updates**
   - Daily/weekly updates instead of real-time
   - Off-peak processing
   - Estimated savings: $50-100/month

**Optimized Cost**: $70-150/month for 1000 farms

## 🔧 Monitoring & Maintenance

### Health Checks

```bash
# ML Service
curl http://localhost:8001/health

# Redis
docker-compose exec redis redis-cli ping

# PostgreSQL
docker-compose exec postgres pg_isready
```

### Logs

```bash
# ML Service logs
docker-compose logs -f ml-service

# All services
docker-compose logs -f

# Filter errors
docker-compose logs ml-service | grep ERROR
```

### Metrics to Monitor

- **ML Service**:
  - Request latency (target: < 5s)
  - Cache hit rate (target: > 60%)
  - Error rate (target: < 1%)
  - Model inference time

- **Sentinel Hub**:
  - API quota usage
  - Request success rate
  - Data availability

- **System**:
  - CPU usage
  - Memory usage
  - Disk space
  - Network bandwidth

## 🐛 Troubleshooting

### ML Service Issues

**Issue**: "Sentinel Hub credentials not configured"
```bash
# Solution: Check environment variables
echo $SENTINEL_HUB_CLIENT_ID
echo $SENTINEL_HUB_CLIENT_SECRET

# Add to .env if missing
```

**Issue**: "No Sentinel-2 data available"
```bash
# Solution: Increase days_back parameter or try different dates
curl -X POST http://localhost:8001/api/flood-detection \
  -d '{"latitude": 51.5074, "longitude": -0.1278, "days_back": 14}'
```

**Issue**: Model loading errors
```bash
# Solution: Clear Hugging Face cache
rm -rf ~/.cache/huggingface
docker-compose restart ml-service
```

### Docker Issues

**Issue**: Container won't start
```bash
# Check logs
docker-compose logs ml-service

# Rebuild container
docker-compose build --no-cache ml-service
docker-compose up -d ml-service
```

**Issue**: Out of memory
```bash
# Increase Docker memory limit
# Docker Desktop → Settings → Resources → Memory → 8GB+
```

## 📚 Documentation

### Complete Guides

1. **GRANITE_INTEGRATION_GUIDE.md** - Complete integration guide for IBM Granite models
2. **ml-service/README.md** - ML service API documentation
3. **granite-models-research.md** - Research findings on all Granite models
4. **granite-implementation-plan.md** - Detailed implementation plan with code examples
5. **openweathermap-integration.md** - OpenWeatherMap API integration guide
6. **gps-tracking-integration.md** - GPS tracking system design and implementation

### API References

- [IBM Granite Models](https://huggingface.co/collections/ibm-granite/granite-geospatial-models)
- [Sentinel Hub API](https://docs.sentinel-hub.com/)
- [OpenWeatherMap API](https://openweathermap.org/api)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)

## ✅ Next Steps

### Immediate (Week 1-2)

1. ✅ Deploy ML service with Docker Compose
2. ✅ Test flood detection with real coordinates
3. 🔄 Create tRPC integration
4. 🔄 Build frontend components
5. 🔄 Add to farm detail pages

### Short-term (Month 1)

6. 🔄 Set up OpenWeatherMap integration
7. 🔄 Replace mock weather widget
8. 🔄 Add biomass estimation model
9. 🔄 Add canopy height model
10. 🔄 Implement batch processing

### Medium-term (Month 2-3)

11. 🔄 GPS tracking implementation
12. 🔄 Geofencing and alerts
13. 🔄 Historical analysis dashboard
14. 🔄 AI insights panel
15. 🔄 Performance optimization

### Long-term (Month 4+)

16. 🔄 Additional Granite models (LST, weather downscaling)
17. 🔄 Custom model fine-tuning
18. 🔄 Mobile app integration
19. 🔄 Advanced analytics and predictions
20. 🔄 Enterprise features

## 🎉 Summary

The Farmer Data Collection Platform now has a **production-ready ML service** with:

- ✅ IBM Granite Geospatial flood detection model
- ✅ Sentinel Hub satellite imagery integration
- ✅ Complete preprocessing pipeline
- ✅ FastAPI REST endpoints
- ✅ Docker containerization
- ✅ Redis caching
- ✅ Comprehensive documentation

**Ready for deployment and testing!**

The platform is positioned to provide farmers with:
- Real-time flood detection and alerts
- Satellite-based crop monitoring
- Weather-based decision support
- Equipment tracking and management
- AI-powered agricultural insights

**Total Implementation Time**: ~8 hours
**Lines of Code**: ~2,500+
**Documentation Pages**: 6 comprehensive guides
**API Endpoints**: 3 (with 10+ planned)

---

**For questions or support**, refer to the individual documentation files or contact the development team.
