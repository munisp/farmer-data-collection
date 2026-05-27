# Geospatial Features Guide

Complete guide to PostGIS-powered spatial features in the Farmer Data Collection Platform.

---

## Table of Contents

1. [Overview](#overview)
2. [PostGIS Setup](#postgis-setup)
3. [Database Schema](#database-schema)
4. [Spatial Queries](#spatial-queries)
5. [GeoJSON Import/Export](#geojson-importexport)
6. [Farm Boundaries](#farm-boundaries)
7. [Spatial Analytics](#spatial-analytics)
8. [Frontend Integration](#frontend-integration)
9. [Performance Optimization](#performance-optimization)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The platform now includes comprehensive geospatial capabilities powered by **PostGIS**, the spatial extension for PostgreSQL. This enables:

✅ **Accurate location tracking** with Point geometry  
✅ **Farm boundary mapping** with Polygon geometry  
✅ **Spatial queries** (distance, containment, intersection)  
✅ **GeoJSON import/export** for GIS interoperability  
✅ **Automatic area/perimeter calculations**  
✅ **Spatial indexing** for fast queries  
✅ **WGS 84 coordinate system** (SRID 4326) for GPS compatibility  

---

## PostGIS Setup

### 1. Enable PostGIS Extension

```sql
-- Run this in your PostgreSQL database
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verify installation
SELECT PostGIS_Version();
```

### 2. Run Migrations

```bash
# Apply PostGIS migrations
psql -U your_user -d farmer_data -f drizzle/migrations/001_enable_postgis.sql
psql -U your_user -d farmer_data -f drizzle/migrations/002_migrate_farms_to_postgis.sql
psql -U your_user -d farmer_data -f drizzle/migrations/003_create_farm_boundaries.sql
```

### 3. Verify Setup

```sql
-- Check if PostGIS is enabled
SELECT * FROM pg_extension WHERE extname = 'postgis';

-- Check spatial_ref_sys table (should have 8000+ rows)
SELECT COUNT(*) FROM spatial_ref_sys;

-- Verify SRID 4326 (WGS 84)
SELECT * FROM spatial_ref_sys WHERE srid = 4326;
```

---

## Database Schema

### Farms Table (Enhanced)

```sql
CREATE TABLE farms (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  farmer_id INTEGER REFERENCES farmers(id),
  name VARCHAR(255) NOT NULL,
  
  -- PostGIS Point geometry (SRID 4326 = WGS 84)
  location geometry(Point, 4326),
  
  -- Backward compatibility (kept for migration)
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  
  size DOUBLE PRECISION,
  unit VARCHAR(20),
  soil_type VARCHAR(100),
  irrigation_type VARCHAR(100),
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Spatial index for fast queries
CREATE INDEX idx_farms_location ON farms USING GIST (location);
```

### Farm Boundaries Table (New)

```sql
CREATE TABLE farm_boundaries (
  id SERIAL PRIMARY KEY,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- PostGIS Polygon geometry (SRID 4326 = WGS 84)
  boundary geometry(Polygon, 4326) NOT NULL,
  
  -- Auto-calculated fields
  area_sqm DOUBLE PRECISION GENERATED ALWAYS AS (ST_Area(boundary::geography)) STORED,
  area_hectares DOUBLE PRECISION GENERATED ALWAYS AS (ST_Area(boundary::geography) / 10000.0) STORED,
  perimeter_m DOUBLE PRECISION GENERATED ALWAYS AS (ST_Perimeter(boundary::geography)) STORED,
  
  name VARCHAR(255),
  description TEXT,
  boundary_type VARCHAR(50) DEFAULT 'manual',
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT check_valid_boundary CHECK (ST_IsValid(boundary)),
  CONSTRAINT check_min_points CHECK (ST_NPoints(boundary) >= 4),
  CONSTRAINT check_reasonable_area CHECK (
    ST_Area(boundary::geography) / 10000.0 BETWEEN 0.01 AND 100000
  )
);

-- Spatial index
CREATE INDEX idx_farm_boundaries_boundary ON farm_boundaries USING GIST (boundary);
```

---

## Spatial Queries

### Distance Queries

**Find farms within radius:**

```sql
-- Find all farms within 5km of a point
SELECT 
  f.id,
  f.name,
  ST_Distance(
    f.location::geography,
    ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography
  ) / 1000.0 as distance_km
FROM farms f
WHERE ST_DWithin(
  f.location::geography,
  ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography,
  5000  -- 5000 meters = 5km
)
ORDER BY distance_km ASC;
```

**Find nearest farms:**

```sql
-- Find 10 nearest farms to a point
SELECT 
  f.id,
  f.name,
  ST_Distance(
    f.location::geography,
    ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography
  ) / 1000.0 as distance_km
FROM farms f
WHERE f.location IS NOT NULL
ORDER BY f.location <-> ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)
LIMIT 10;
```

### Containment Queries

**Check if point is within boundary:**

```sql
-- Check if a GPS point is within any farm boundary
SELECT 
  fb.id,
  fb.name,
  fb.area_hectares,
  f.name as farm_name
FROM farm_boundaries fb
JOIN farms f ON fb.farm_id = f.id
WHERE ST_Contains(
  fb.boundary,
  ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)
)
LIMIT 1;
```

### Intersection Queries

**Find overlapping boundaries:**

```sql
-- Find farm boundaries that overlap
SELECT 
  fb1.id as boundary1_id,
  fb1.name as boundary1_name,
  fb2.id as boundary2_id,
  fb2.name as boundary2_name,
  ST_Area(ST_Intersection(fb1.boundary, fb2.boundary)::geography) / 10000.0 as overlap_hectares
FROM farm_boundaries fb1
JOIN farm_boundaries fb2 ON fb1.id < fb2.id
WHERE ST_Intersects(fb1.boundary, fb2.boundary);
```

---

## GeoJSON Import/Export

### Export to GeoJSON

**Single boundary:**

```sql
SELECT 
  json_build_object(
    'type', 'Feature',
    'geometry', ST_AsGeoJSON(boundary)::json,
    'properties', json_build_object(
      'id', id,
      'name', name,
      'area_hectares', area_hectares,
      'perimeter_m', perimeter_m
    )
  )
FROM farm_boundaries
WHERE id = 1;
```

**Feature collection (all boundaries):**

```sql
SELECT 
  json_build_object(
    'type', 'FeatureCollection',
    'features', json_agg(
      json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(boundary)::json,
        'properties', json_build_object(
          'id', id,
          'name', name,
          'area_hectares', area_hectares
        )
      )
    )
  )
FROM farm_boundaries;
```

### Import from GeoJSON

**Insert boundary from GeoJSON:**

```sql
-- Example GeoJSON polygon
INSERT INTO farm_boundaries (farm_id, user_id, boundary, name)
VALUES (
  1,  -- farm_id
  1,  -- user_id
  ST_GeomFromGeoJSON('{
    "type": "Polygon",
    "coordinates": [[
      [3.3792, 6.5244],
      [3.3802, 6.5244],
      [3.3802, 6.5254],
      [3.3792, 6.5254],
      [3.3792, 6.5244]
    ]]
  }'),
  'North Field'
);
```

---

## Farm Boundaries

### Drawing Boundaries

Use Google Maps Drawing Manager to let farmers draw their farm boundaries:

```typescript
// Initialize drawing manager
const drawingManager = new google.maps.drawing.DrawingManager({
  drawingMode: google.maps.drawing.OverlayType.POLYGON,
  drawingControl: true,
  drawingControlOptions: {
    position: google.maps.ControlPosition.TOP_CENTER,
    drawingModes: [google.maps.drawing.OverlayType.POLYGON],
  },
  polygonOptions: {
    fillColor: "#00FF00",
    fillOpacity: 0.3,
    strokeWeight: 2,
    strokeColor: "#00AA00",
    editable: true,
  },
});

// Listen for polygon complete event
google.maps.event.addListener(drawingManager, "polygoncomplete", (polygon) => {
  const coordinates = polygon.getPath().getArray().map((latLng) => [
    latLng.lng(),
    latLng.lat(),
  ]);
  
  // Close the polygon
  coordinates.push(coordinates[0]);
  
  // Save to database via tRPC
  trpc.spatial.importBoundaryFromGeoJSON.mutate({
    farmId: currentFarmId,
    name: "My Farm Boundary",
    geoJSON: {
      type: "Polygon",
      coordinates: [coordinates],
    },
  });
});
```

### Calculating Area

Area is automatically calculated in both square meters and hectares:

```sql
-- Get farm boundary with area
SELECT 
  id,
  name,
  area_sqm,        -- Square meters (auto-calculated)
  area_hectares,   -- Hectares (auto-calculated)
  perimeter_m      -- Perimeter in meters (auto-calculated)
FROM farm_boundaries
WHERE farm_id = 1;
```

---

## Spatial Analytics

### Farm Density Heatmap

```sql
-- Get farm density by grid cell (0.01 degree cells ≈ 1km)
SELECT 
  FLOOR(ST_X(location) / 0.01) * 0.01 as grid_lon,
  FLOOR(ST_Y(location) / 0.01) * 0.01 as grid_lat,
  COUNT(*) as farm_count
FROM farms
WHERE location IS NOT NULL
GROUP BY grid_lon, grid_lat
HAVING COUNT(*) > 0
ORDER BY farm_count DESC;
```

### Crop Distribution by Region

```sql
-- Analyze crop distribution spatially
SELECT 
  c.crop_name,
  COUNT(*) as farm_count,
  AVG(ST_Y(f.location)) as avg_latitude,
  AVG(ST_X(f.location)) as avg_longitude
FROM crops c
JOIN farms f ON c.farm_id = f.id
WHERE f.location IS NOT NULL
GROUP BY c.crop_name
ORDER BY farm_count DESC;
```

### Nearest Market Analysis

```sql
-- Find nearest market for each farm (assuming markets table)
SELECT 
  f.id,
  f.name as farm_name,
  m.name as nearest_market,
  ST_Distance(f.location::geography, m.location::geography) / 1000.0 as distance_km
FROM farms f
CROSS JOIN LATERAL (
  SELECT id, name, location
  FROM markets
  ORDER BY location <-> f.location
  LIMIT 1
) m
WHERE f.location IS NOT NULL;
```

---

## Frontend Integration

### tRPC Endpoints

```typescript
// Find farms within radius
const { data: nearbyFarms } = trpc.spatial.findFarmsWithinRadius.useQuery({
  latitude: 6.5244,
  longitude: 3.3792,
  radiusMeters: 5000, // 5km
});

// Find nearest farms
const { data: nearest } = trpc.spatial.findNearestFarms.useQuery({
  latitude: 6.5244,
  longitude: 3.3792,
  limit: 10,
});

// Check if point is within boundary
const { data: containingFarm } = trpc.spatial.findFarmContainingPoint.useQuery({
  latitude: 6.5244,
  longitude: 3.3792,
});

// Get all boundaries as GeoJSON
const { data: geoJSON } = trpc.spatial.getAllBoundariesGeoJSON.useQuery();

// Import boundary from GeoJSON
const importMutation = trpc.spatial.importBoundaryFromGeoJSON.useMutation();
await importMutation.mutateAsync({
  farmId: 1,
  name: "North Field",
  geoJSON: {
    type: "Polygon",
    coordinates: [[[3.3792, 6.5244], [3.3802, 6.5244], ...]],
  },
});
```

### Display on Map

```typescript
// Display farm boundaries on Google Maps
const map = new google.maps.Map(document.getElementById("map"), {
  center: { lat: 6.5244, lng: 3.3792 },
  zoom: 12,
});

// Fetch GeoJSON data
const geoJSON = await trpc.spatial.getAllBoundariesGeoJSON.query();

// Add to map
map.data.addGeoJson(geoJSON);

// Style polygons
map.data.setStyle({
  fillColor: "green",
  fillOpacity: 0.3,
  strokeColor: "darkgreen",
  strokeWeight: 2,
});
```

---

## Performance Optimization

### Spatial Indexes

Spatial indexes (GIST) are automatically created for fast queries:

```sql
-- Verify indexes exist
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE '%location%' OR indexname LIKE '%boundary%';
```

### Query Performance Tips

1. **Always use spatial indexes:**
   ```sql
   -- Good: Uses spatial index
   WHERE ST_DWithin(location::geography, point::geography, 5000)
   
   -- Bad: Table scan
   WHERE ST_Distance(location::geography, point::geography) < 5000
   ```

2. **Use geography for accurate distances:**
   ```sql
   -- Accurate (meters on Earth's surface)
   ST_Distance(location::geography, point::geography)
   
   -- Fast but less accurate (degrees)
   ST_Distance(location, point)
   ```

3. **Limit result sets:**
   ```sql
   -- Always add LIMIT for large datasets
   ORDER BY location <-> point
   LIMIT 100
   ```

4. **Use bounding box pre-filter:**
   ```sql
   -- Fast bounding box check first, then accurate distance
   WHERE location && ST_Expand(point, 0.1)  -- Bounding box
     AND ST_DWithin(location::geography, point::geography, 5000)
   ```

---

## Troubleshooting

### Common Issues

**1. PostGIS extension not found:**

```bash
# Install PostGIS
sudo apt-get install postgresql-14-postgis-3

# Or on macOS
brew install postgis
```

**2. Invalid geometry errors:**

```sql
-- Check for invalid geometries
SELECT id, ST_IsValid(boundary), ST_IsValidReason(boundary)
FROM farm_boundaries
WHERE NOT ST_IsValid(boundary);

-- Fix invalid geometries
UPDATE farm_boundaries
SET boundary = ST_MakeValid(boundary)
WHERE NOT ST_IsValid(boundary);
```

**3. SRID mismatch errors:**

```sql
-- Check SRID
SELECT id, ST_SRID(location) FROM farms;

-- Fix SRID
UPDATE farms
SET location = ST_SetSRID(location, 4326)
WHERE ST_SRID(location) != 4326;
```

**4. Slow spatial queries:**

```sql
-- Analyze query performance
EXPLAIN ANALYZE
SELECT * FROM farms
WHERE ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint(3.3792, 6.5244), 4326)::geography, 5000);

-- Rebuild spatial index if needed
REINDEX INDEX idx_farms_location;
```

---

## Next Steps

1. **Implement UI for farm boundary drawing** (Google Maps Drawing Manager)
2. **Add spatial analytics dashboard** (heatmaps, density maps)
3. **Integrate with satellite imagery** (Sentinel-2 for NDVI)
4. **Add Apache Sedona** for distributed spatial processing
5. **Implement data lake** for historical spatial data

---

## References

- [PostGIS Documentation](https://postgis.net/documentation/)
- [PostGIS Spatial Functions](https://postgis.net/docs/reference.html)
- [Google Maps Drawing Manager](https://developers.google.com/maps/documentation/javascript/drawinglayer)
- [GeoJSON Specification](https://geojson.org/)
- [WGS 84 Coordinate System](https://en.wikipedia.org/wiki/World_Geodetic_System)
