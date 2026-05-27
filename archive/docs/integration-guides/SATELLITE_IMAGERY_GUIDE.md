# Satellite Imagery & NDVI Integration Guide

## Overview

This guide explains how to integrate satellite imagery and NDVI (Normalized Difference Vegetation Index) data into the Farmer Data Collection Platform for crop health monitoring.

## What is NDVI?

**NDVI (Normalized Difference Vegetation Index)** is a standardized index that measures vegetation health by analyzing the difference between near-infrared (NIR) and red light reflected by vegetation.

**Formula:** `NDVI = (NIR - Red) / (NIR + Red)`

**Value Range:** -1.0 to +1.0
- **< 0**: Water, clouds, snow
- **0 - 0.2**: Bare soil, rock, sand
- **0.2 - 0.5**: Sparse vegetation, stressed crops
- **0.5 - 0.7**: Moderate vegetation, healthy crops
- **0.7 - 1.0**: Dense vegetation, very healthy crops

## Satellite Data Sources

### 1. Sentinel-2 (Recommended)

**Provider:** European Space Agency (ESA) via Copernicus Open Access Hub

**Advantages:**
- Free and open access
- 10m spatial resolution (best for farm-level analysis)
- 5-day revisit time
- Multi-spectral bands including NIR and Red

**API Options:**
- **Sentinel Hub API** (https://www.sentinel-hub.com/)
  - Easy-to-use REST API
  - NDVI calculation built-in
  - Free tier: 30,000 processing units/month
  - Commercial: $0.001 per processing unit

- **Google Earth Engine** (https://earthengine.google.com/)
  - Free for research and education
  - Requires registration
  - Python/JavaScript API
  - Historical data back to 2015

### 2. Landsat 8/9

**Provider:** NASA/USGS

**Advantages:**
- Free and open access
- 30m spatial resolution
- 16-day revisit time
- Long historical archive (1972-present)

**API:** Google Earth Engine, AWS Open Data

### 3. Planet Labs

**Provider:** Planet (Commercial)

**Advantages:**
- 3m spatial resolution
- Daily revisit time
- Best for precision agriculture

**Pricing:** Contact for quote (typically $1-5 per km²/month)

## Implementation Options

### Option 1: Sentinel Hub API (Recommended for Production)

**Step 1: Register and Get API Key**
```bash
# Register at https://www.sentinel-hub.com/
# Create OAuth client and get credentials
```

**Step 2: Install Dependencies**
```bash
npm install axios
```

**Step 3: Create API Endpoint**

```typescript
// server/routers/satellite-router.ts
import { z } from "zod";
import axios from "axios";
import { router, protectedProcedure } from "../trpc";

const SENTINEL_HUB_CLIENT_ID = process.env.SENTINEL_HUB_CLIENT_ID;
const SENTINEL_HUB_CLIENT_SECRET = process.env.SENTINEL_HUB_CLIENT_SECRET;

// Get OAuth token
async function getSentinelHubToken() {
  const response = await axios.post(
    "https://services.sentinel-hub.com/oauth/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: SENTINEL_HUB_CLIENT_ID!,
      client_secret: SENTINEL_HUB_CLIENT_SECRET!,
    }),
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );
  return response.data.access_token;
}

export const satelliteRouter = router({
  getNDVI: protectedProcedure
    .input(
      z.object({
        bbox: z.array(z.number()).length(4), // [minLng, minLat, maxLng, maxLat]
        date: z.string(), // YYYY-MM-DD
        width: z.number().default(512),
        height: z.number().default(512),
      })
    )
    .query(async ({ input }) => {
      const token = await getSentinelHubToken();

      const evalscript = `
        //VERSION=3
        function setup() {
          return {
            input: ["B04", "B08", "dataMask"],
            output: { bands: 4 }
          };
        }

        function evaluatePixel(sample) {
          let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
          
          // Color mapping for NDVI
          if (ndvi < 0) return [0.5, 0.5, 0.5, sample.dataMask]; // Gray (water/clouds)
          if (ndvi < 0.2) return [0.8, 0.7, 0.6, sample.dataMask]; // Brown (bare soil)
          if (ndvi < 0.4) return [1.0, 1.0, 0.6, sample.dataMask]; // Yellow (stressed)
          if (ndvi < 0.6) return [0.8, 1.0, 0.6, sample.dataMask]; // Light green
          if (ndvi < 0.8) return [0.4, 0.8, 0.4, sample.dataMask]; // Green (healthy)
          return [0.0, 0.6, 0.0, sample.dataMask]; // Dark green (very healthy)
        }
      `;

      const response = await axios.post(
        "https://services.sentinel-hub.com/api/v1/process",
        {
          input: {
            bounds: {
              bbox: input.bbox,
              properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
            },
            data: [
              {
                type: "sentinel-2-l2a",
                dataFilter: {
                  timeRange: {
                    from: `${input.date}T00:00:00Z`,
                    to: `${input.date}T23:59:59Z`,
                  },
                  maxCloudCoverage: 30,
                },
              },
            ],
          },
          output: {
            width: input.width,
            height: input.height,
            responses: [
              {
                identifier: "default",
                format: { type: "image/png" },
              },
            ],
          },
          evalscript,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          responseType: "arraybuffer",
        }
      );

      // Convert to base64 for frontend display
      const base64 = Buffer.from(response.data, "binary").toString("base64");
      return {
        image: `data:image/png;base64,${base64}`,
        date: input.date,
        bbox: input.bbox,
      };
    }),
});
```

**Step 4: Frontend Component**

```typescript
// client/src/components/NDVIOverlay.tsx
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface NDVIOverlayProps {
  map: google.maps.Map;
  boundary: any; // GeoJSON geometry
}

export function NDVIOverlay({ map, boundary }: NDVIOverlayProps) {
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlay, setOverlay] = useState<google.maps.GroundOverlay | null>(null);

  const { data, isLoading, refetch } = trpc.satellite.getNDVI.useQuery(
    {
      bbox: calculateBBox(boundary),
      date: new Date().toISOString().split("T")[0],
    },
    { enabled: false }
  );

  const handleToggleNDVI = async () => {
    if (overlayVisible && overlay) {
      overlay.setMap(null);
      setOverlayVisible(false);
    } else {
      const result = await refetch();
      if (result.data) {
        const bounds = new google.maps.LatLngBounds(
          new google.maps.LatLng(result.data.bbox[1], result.data.bbox[0]),
          new google.maps.LatLng(result.data.bbox[3], result.data.bbox[2])
        );

        const groundOverlay = new google.maps.GroundOverlay(
          result.data.image,
          bounds,
          { opacity: 0.7 }
        );

        groundOverlay.setMap(map);
        setOverlay(groundOverlay);
        setOverlayVisible(true);
      }
    }
  };

  return (
    <Button onClick={handleToggleNDVI} disabled={isLoading}>
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Loading NDVI...
        </>
      ) : (
        <>{overlayVisible ? "Hide" : "Show"} NDVI Overlay</>
      )}
    </Button>
  );
}

function calculateBBox(geometry: any): [number, number, number, number] {
  const coords = geometry.coordinates[0];
  const lngs = coords.map((c: number[]) => c[0]);
  const lats = coords.map((c: number[]) => c[1]);
  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
}
```

### Option 2: Google Earth Engine (Free, More Complex)

**Advantages:**
- Completely free
- Access to entire Sentinel-2 and Landsat archive
- Server-side processing

**Disadvantages:**
- Requires Python backend
- More complex setup
- Slower response times

**Implementation:**

```python
# server/satellite_service.py
import ee
import json

# Initialize Earth Engine
ee.Initialize()

def get_ndvi_for_farm(geometry, start_date, end_date):
    """
    Get NDVI imagery for a farm boundary
    
    Args:
        geometry: GeoJSON polygon
        start_date: YYYY-MM-DD
        end_date: YYYY-MM-DD
    
    Returns:
        dict: NDVI statistics and image URL
    """
    # Convert GeoJSON to Earth Engine geometry
    ee_geometry = ee.Geometry.Polygon(geometry['coordinates'])
    
    # Get Sentinel-2 imagery
    collection = (ee.ImageCollection('COPERNICUS/S2_SR')
                  .filterBounds(ee_geometry)
                  .filterDate(start_date, end_date)
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)))
    
    # Calculate NDVI
    def calculate_ndvi(image):
        ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
        return image.addBands(ndvi)
    
    ndvi_collection = collection.map(calculate_ndvi)
    
    # Get median NDVI
    median_ndvi = ndvi_collection.select('NDVI').median()
    
    # Calculate statistics
    stats = median_ndvi.reduceRegion(
        reducer=ee.Reducer.mean().combine(
            ee.Reducer.min(), '', True
        ).combine(
            ee.Reducer.max(), '', True
        ),
        geometry=ee_geometry,
        scale=10,
        maxPixels=1e9
    ).getInfo()
    
    # Get visualization URL
    vis_params = {
        'min': -0.2,
        'max': 0.8,
        'palette': ['brown', 'yellow', 'lightgreen', 'green', 'darkgreen']
    }
    
    map_id = median_ndvi.getMapId(vis_params)
    
    return {
        'mean_ndvi': stats.get('NDVI_mean'),
        'min_ndvi': stats.get('NDVI_min'),
        'max_ndvi': stats.get('NDVI_max'),
        'tile_url': map_id['tile_fetcher'].url_format,
        'date_range': f"{start_date} to {end_date}"
    }
```

### Option 3: Pre-computed NDVI from NASA MODIS (Simplest)

**Advantages:**
- Free API
- No authentication required
- Pre-computed NDVI values

**Disadvantages:**
- Lower resolution (250m - 1km)
- Only suitable for large farms

**API:** https://appeears.earthdatacloud.nasa.gov/

## NDVI Color Legend

```
NDVI Value | Color       | Interpretation
-----------|-------------|------------------
< 0        | Gray        | Water, clouds
0 - 0.2    | Brown       | Bare soil
0.2 - 0.4  | Yellow      | Stressed vegetation
0.4 - 0.6  | Light Green | Moderate health
0.6 - 0.8  | Green       | Healthy crops
0.8 - 1.0  | Dark Green  | Very healthy crops
```

## Use Cases

1. **Crop Health Monitoring**
   - Track NDVI over time to detect stress early
   - Compare different fields

2. **Irrigation Management**
   - Identify areas needing water (low NDVI)
   - Optimize irrigation schedules

3. **Yield Prediction**
   - Correlate peak NDVI with final yield
   - Estimate harvest timing

4. **Pest/Disease Detection**
   - Sudden NDVI drops indicate problems
   - Target scouting efforts

## Best Practices

1. **Temporal Analysis**
   - Don't rely on single date
   - Track NDVI trends over growing season
   - Compare to historical averages

2. **Cloud Filtering**
   - Always filter for cloud coverage < 20%
   - Use median composites for cloudy regions

3. **Ground Truthing**
   - Validate NDVI with field observations
   - Calibrate thresholds for local conditions

4. **Resolution Selection**
   - Sentinel-2 (10m): Best for farms > 1 hectare
   - Landsat (30m): Suitable for farms > 5 hectares
   - MODIS (250m): Only for very large farms

## Cost Estimation

**Sentinel Hub (Recommended):**
- Free tier: 30,000 PU/month (~300 farm images)
- Paid: $0.001/PU (~$0.10 per farm per month)
- Annual cost for 100 farms: ~$120/year

**Google Earth Engine:**
- Free for non-commercial use
- Commercial: Contact for pricing

**Planet Labs:**
- $1-5 per km²/month
- Annual cost for 100 farms (avg 5 ha each): $6,000-30,000/year

## Conclusion

**Recommendation:** Start with **Sentinel Hub API** for production deployment. It offers the best balance of cost, ease of use, and data quality for farm-level NDVI monitoring.

For development and testing, use **Google Earth Engine** to avoid costs while building the feature.
