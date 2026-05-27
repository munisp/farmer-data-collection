# IBM Granite Geospatial Models Integration Guide

## Overview

This guide explains how to integrate IBM Granite Geospatial AI models into the Farmer Data Collection Platform. The integration provides advanced satellite imagery analysis capabilities including flood detection, crop health monitoring, biomass estimation, and more.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Farmer Data Collection Platform              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐ │
│  │   Frontend   │◄────►│  tRPC API    │◄────►│  PostgreSQL  │ │
│  │  (React)     │      │  (Node.js)   │      │  Database    │ │
│  └──────────────┘      └──────┬───────┘      └──────────────┘ │
│                               │                                 │
│                               ▼                                 │
│                      ┌──────────────────┐                       │
│                      │  ML Service API  │                       │
│                      │  (FastAPI)       │                       │
│                      └────────┬─────────┘                       │
│                               │                                 │
│         ┌─────────────────────┼─────────────────────┐          │
│         ▼                     ▼                     ▼           │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐   │
│  │   Granite   │      │  Sentinel   │      │    Redis    │   │
│  │   Models    │      │  Hub API    │      │   Cache     │   │
│  └─────────────┘      └─────────────┘      └─────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. ML Service (FastAPI)

**Location**: `/ml-service/`

**Purpose**: Standalone Python service for running Granite model inference

**Key Files**:
- `app.py` - FastAPI application with REST endpoints
- `models/flood_detection.py` - Granite flood detection model wrapper
- `preprocessing/sentinel_hub.py` - Sentinel Hub API client
- `preprocessing/image_processing.py` - Image preprocessing utilities

**Endpoints**:
- `GET /health` - Health check
- `POST /api/flood-detection` - Flood detection inference
- `GET /api/flood-detection/mock` - Mock endpoint for testing

### 2. Sentinel Hub Integration

**Purpose**: Fetch real satellite imagery from Sentinel-2 and Sentinel-1

**Required Credentials**:
- Client ID
- Client Secret
- Instance ID

**Sign up**: https://www.sentinel-hub.com/

**Free Tier**: 5,000 processing units/month (~500 requests)

### 3. tRPC Integration (TODO)

**Location**: `/server/routers/granite-router.ts`

**Purpose**: Bridge between frontend and ML service

**Example**:
```typescript
export const graniteRouter = router({
  detectFlood: protectedProcedure
    .input(z.object({
      farmId: z.number(),
      date: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      // Get farm coordinates from database
      const farm = await ctx.db.select().from(farms)
        .where(eq(farms.id, input.farmId))
        .limit(1);
      
      // Call ML service
      const response = await axios.post(
        `${ML_SERVICE_URL}/api/flood-detection`,
        {
          latitude: farm[0].latitude,
          longitude: farm[0].longitude,
          date: input.date
        }
      );
      
      return response.data;
    }),
});
```

### 4. Frontend Components (TODO)

**Location**: `/client/src/components/`

**Components to Create**:
- `FloodDetectionWidget.tsx` - Display flood alerts
- `SatelliteImageryViewer.tsx` - View satellite imagery
- `CropHealthDashboard.tsx` - NDVI/EVI/SAVI visualization
- `AIInsightsPanel.tsx` - Unified AI insights

## Setup Instructions

### Step 1: Set Up Sentinel Hub

1. **Create Account**
   - Go to https://www.sentinel-hub.com/
   - Sign up for free account
   - Verify email

2. **Create OAuth Client**
   - Navigate to Dashboard → User Settings → OAuth clients
   - Click "Create new OAuth client"
   - Note your Client ID and Client Secret

3. **Get Instance ID**
   - Navigate to Configuration Utility
   - Create a new configuration
   - Note your Instance ID

4. **Add to Environment Variables**
   ```bash
   # Add to .env file
   SENTINEL_HUB_CLIENT_ID=your_client_id_here
   SENTINEL_HUB_CLIENT_SECRET=your_client_secret_here
   SENTINEL_HUB_INSTANCE_ID=your_instance_id_here
   ```

### Step 2: Install ML Service Dependencies

```bash
cd ml-service

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Step 3: Test ML Service Locally

```bash
# Run ML service
uvicorn app:app --host 0.0.0.0 --port 8001 --reload

# In another terminal, test health endpoint
curl http://localhost:8001/health

# Test mock flood detection (no credentials needed)
curl "http://localhost:8001/api/flood-detection/mock?latitude=51.5074&longitude=-0.1278"
```

### Step 4: Deploy with Docker Compose

```bash
# Build and start all services
docker-compose up -d

# Check logs
docker-compose logs -f ml-service

# Test ML service
curl http://localhost:8001/health
```

### Step 5: Integrate with tRPC Backend

1. **Create Granite Router**
   ```bash
   # Create new router file
   touch server/routers/granite-router.ts
   ```

2. **Add to Main Router**
   ```typescript
   // server/index.ts
   import { graniteRouter } from './routers/granite-router';
   
   export const appRouter = router({
     // ... existing routers
     granite: graniteRouter,
   });
   ```

3. **Add ML Service URL to Environment**
   ```bash
   # Add to .env
   ML_SERVICE_URL=http://localhost:8001
   ```

### Step 6: Create Frontend Components

1. **Install Dependencies** (if needed)
   ```bash
   cd client
   pnpm add recharts date-fns
   ```

2. **Create Flood Detection Widget**
   ```typescript
   // client/src/components/FloodDetectionWidget.tsx
   import { trpc } from '@/lib/trpc';
   
   export function FloodDetectionWidget({ farmId }: { farmId: number }) {
     const { data, isLoading } = trpc.granite.detectFlood.useQuery({ farmId });
     
     // ... implementation
   }
   ```

3. **Add to Farm Detail Page**
   ```typescript
   // client/src/pages/FarmDetail.tsx
   import { FloodDetectionWidget } from '@/components/FloodDetectionWidget';
   
   // In component:
   <FloodDetectionWidget farmId={farmId} />
   ```

## Available Models

### 1. Flood Detection ✅ IMPLEMENTED

**Model**: `ibm-granite/granite-geospatial-uki-flooddetection`

**Use Case**: Detect flooded areas in agricultural fields

**Input**: 
- Sentinel-2 multispectral (Blue, Green, Red, NIR, SWIR1, SWIR2)
- Sentinel-1 SAR (VV, VH)
- Cloud mask

**Output**:
- Binary segmentation mask (water/no water)
- Flood percentage
- Flood area in km²
- Severity classification
- Recommended actions

**Status**: ✅ Fully implemented in ML service

### 2. Biomass Estimation 🔄 TODO

**Model**: `ibm-granite/granite-geospatial-biomass`

**Use Case**: Estimate above-ground crop biomass

**Input**: Sentinel-2 multispectral imagery

**Output**: Biomass estimation in tons/hectare

**Implementation Steps**:
1. Create `models/biomass.py`
2. Add preprocessing in `image_processing.py`
3. Create API endpoint in `app.py`
4. Add tRPC integration

### 3. Canopy Height 🔄 TODO

**Model**: `ibm-granite/granite-geospatial-canopyheight`

**Use Case**: Monitor crop growth stages

**Input**: Sentinel-2 multispectral imagery

**Output**: Canopy height in meters

### 4. Land Surface Temperature 🔄 TODO

**Model**: `ibm-granite/granite-geospatial-land-surface-temperature`

**Use Case**: Detect heat stress in crops

**Input**: Sentinel-2 multispectral imagery

**Output**: Temperature in Celsius

### 5. Weather Downscaling 🔄 TODO

**Model**: `ibm-granite/granite-geospatial-wxc-downscaling`

**Use Case**: High-resolution weather predictions

**Input**: Low-resolution weather data

**Output**: High-resolution weather forecast

## Testing

### Unit Tests

```bash
cd ml-service
pytest tests/ -v
```

### Integration Tests

```bash
# Test Sentinel Hub connection
python -c "
from preprocessing.sentinel_hub import SentinelHubClient
client = SentinelHubClient()
print('Sentinel Hub: OK')
"

# Test model loading
python -c "
from models.flood_detection import FloodDetectionModel
model = FloodDetectionModel()
print('Model loading: OK')
"
```

### End-to-End Test

```bash
# 1. Start ML service
uvicorn app:app --port 8001 &

# 2. Test flood detection with real coordinates (London)
curl -X POST http://localhost:8001/api/flood-detection \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 51.5074,
    "longitude": -0.1278,
    "bbox_size_km": 5.0
  }'
```

## Performance Optimization

### 1. Model Caching

Models are loaded once and cached in memory:
```python
# Global model instance (lazy loading)
flood_model = None

def get_flood_model():
    global flood_model
    if flood_model is None:
        flood_model = FloodDetectionModel()
    return flood_model
```

### 2. Result Caching with Redis

Results are cached for 1 hour:
```python
cache_key = f"flood:{lat}:{lon}:{date}"
redis_client.setex(cache_key, 3600, json.dumps(result))
```

### 3. GPU Acceleration

Enable GPU for faster inference:
```python
# Automatic GPU detection
device = 'cuda' if torch.cuda.is_available() else 'cpu'
model.to(device)
```

**Performance Comparison**:
- CPU: ~3-5 seconds per request
- GPU: ~0.5-1 second per request

### 4. Batch Processing

For multiple farms:
```python
# TODO: Implement batch endpoint
@app.post("/api/flood-detection/batch")
async def detect_flood_batch(requests: List[FloodDetectionRequest]):
    # Process multiple locations in parallel
    pass
```

## Cost Management

### Sentinel Hub Costs

**Free Tier**:
- 5,000 processing units/month
- ~500 requests for 512x512 images
- Good for testing and small deployments

**Paid Tier**:
- $0.0024 per processing unit
- ~$12/month for 5,000 requests
- ~$120/month for 50,000 requests

**Optimization Tips**:
1. Cache results for 1-24 hours
2. Use larger bounding boxes for multiple nearby farms
3. Reduce image resolution for less critical analyses
4. Schedule batch processing during off-peak hours

### Compute Costs

**CPU** (Recommended for < 100 requests/day):
- Local server: $0
- Cloud VM: ~$20-50/month

**GPU** (Recommended for > 100 requests/day):
- Cloud GPU: ~$0.50-1.00/hour
- Dedicated GPU server: ~$200-500/month

## Monitoring

### Health Checks

```bash
# Check ML service health
curl http://localhost:8001/health

# Expected response:
{
  "status": "healthy",
  "models_loaded": true,
  "sentinel_hub_configured": true,
  "redis_available": true
}
```

### Metrics

Monitor these metrics:
- Request latency (target: < 5 seconds)
- Cache hit rate (target: > 60%)
- Error rate (target: < 1%)
- Model inference time
- Sentinel Hub quota usage

### Logging

```python
# ML service logs
docker-compose logs -f ml-service

# Filter for errors
docker-compose logs ml-service | grep ERROR
```

## Troubleshooting

### Issue: "Sentinel Hub credentials not configured"

**Solution**:
```bash
# Check environment variables
echo $SENTINEL_HUB_CLIENT_ID
echo $SENTINEL_HUB_CLIENT_SECRET

# Add to .env file
SENTINEL_HUB_CLIENT_ID=your_client_id
SENTINEL_HUB_CLIENT_SECRET=your_client_secret
```

### Issue: "No Sentinel-2 data available"

**Possible Causes**:
1. No satellite coverage for the date range
2. High cloud coverage (> 80%)
3. Invalid coordinates

**Solution**:
- Increase `days_back` parameter (default: 7)
- Try different dates
- Verify coordinates are valid

### Issue: Model loading errors

**Solution**:
```bash
# Clear Hugging Face cache
rm -rf ~/.cache/huggingface

# Re-download models
python -c "
from transformers import AutoModelForImageSegmentation
model = AutoModelForImageSegmentation.from_pretrained(
    'ibm-granite/granite-geospatial-uki-flooddetection'
)
"
```

### Issue: Out of memory

**Solution**:
1. Reduce image resolution
2. Process one request at a time
3. Use GPU with more VRAM
4. Implement request queuing

## Next Steps

1. ✅ Set up Sentinel Hub account
2. ✅ Deploy ML service with Docker Compose
3. 🔄 Create tRPC integration
4. 🔄 Build frontend components
5. 🔄 Add biomass estimation model
6. 🔄 Add canopy height model
7. 🔄 Add land surface temperature model
8. 🔄 Implement batch processing
9. 🔄 Add historical analysis
10. 🔄 Create AI insights dashboard

## Resources

- [IBM Granite Models Collection](https://huggingface.co/collections/ibm-granite/granite-geospatial-models)
- [Sentinel Hub Documentation](https://docs.sentinel-hub.com/)
- [Sentinel-2 User Guide](https://sentinel.esa.int/web/sentinel/user-guides/sentinel-2-msi)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Transformers Documentation](https://huggingface.co/docs/transformers)

## Support

For questions and issues:
- Check ML service logs: `docker-compose logs ml-service`
- Review Sentinel Hub quota: https://apps.sentinel-hub.com/dashboard/
- Test with mock endpoint first: `/api/flood-detection/mock`
