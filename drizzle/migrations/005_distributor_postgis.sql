-- PostGIS spatial extensions for distributor network
-- Adds geometry columns, spatial indexes, and coverage area polygons

-- Ensure PostGIS extension is available
CREATE EXTENSION IF NOT EXISTS postgis;

-- Step 1: Add PostGIS geometry column for warehouse location (Point, SRID 4326 = WGS 84)
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS location geometry(Point, 4326);

-- Step 2: Populate geometry column from existing lat/lon data
UPDATE distributors
SET location = ST_SetSRID(ST_MakePoint(
  CAST(longitude AS DOUBLE PRECISION),
  CAST(latitude AS DOUBLE PRECISION)
), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND location IS NULL;

-- Step 3: Add coverage area polygon column (service zone around warehouse)
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS coverage_area geometry(Polygon, 4326);

-- Step 4: Generate default coverage polygons (25km buffer around warehouse point)
UPDATE distributors
SET coverage_area = ST_Transform(
  ST_Buffer(ST_Transform(location, 3857), 25000),  -- 25km buffer in meters (using Web Mercator for distance)
  4326  -- Back to WGS 84
)
WHERE location IS NOT NULL AND coverage_area IS NULL;

-- Step 5: Add delivery routes geometry (MultiLineString for route networks)
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS delivery_routes geometry(MultiLineString, 4326);

-- Step 6: Create spatial indexes for fast geo-queries
CREATE INDEX IF NOT EXISTS idx_distributors_location_gist ON distributors USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_distributors_coverage_gist ON distributors USING GIST(coverage_area);
CREATE INDEX IF NOT EXISTS idx_distributors_delivery_routes_gist ON distributors USING GIST(delivery_routes);

-- Step 7: Add consignment tracking with PostGIS (origin and destination points)
ALTER TABLE consignments ADD COLUMN IF NOT EXISTS origin_location geometry(Point, 4326);
ALTER TABLE consignments ADD COLUMN IF NOT EXISTS destination_location geometry(Point, 4326);
ALTER TABLE consignments ADD COLUMN IF NOT EXISTS current_location geometry(Point, 4326);
ALTER TABLE consignments ADD COLUMN IF NOT EXISTS route_geometry geometry(LineString, 4326);

CREATE INDEX IF NOT EXISTS idx_consignments_origin_gist ON consignments USING GIST(origin_location);
CREATE INDEX IF NOT EXISTS idx_consignments_destination_gist ON consignments USING GIST(destination_location);
CREATE INDEX IF NOT EXISTS idx_consignments_current_gist ON consignments USING GIST(current_location);

-- Step 8: Spatial analytics views

-- View: Distributor coverage overlap analysis
CREATE OR REPLACE VIEW vw_distributor_coverage_analysis AS
SELECT
  d1.id AS distributor_id,
  d1.business_name,
  d1.status,
  ST_Area(ST_Transform(d1.coverage_area, 3857)) / 1000000 AS coverage_area_km2,
  COUNT(d2.id) AS overlapping_distributors,
  COALESCE(
    SUM(ST_Area(ST_Transform(ST_Intersection(d1.coverage_area, d2.coverage_area), 3857))) / 1000000,
    0
  ) AS total_overlap_km2
FROM distributors d1
LEFT JOIN distributors d2
  ON d1.id != d2.id
  AND d1.coverage_area IS NOT NULL
  AND d2.coverage_area IS NOT NULL
  AND ST_Intersects(d1.coverage_area, d2.coverage_area)
WHERE d1.coverage_area IS NOT NULL
GROUP BY d1.id, d1.business_name, d1.status, d1.coverage_area;

-- View: Farms nearest to each distributor
CREATE OR REPLACE VIEW vw_farm_distributor_proximity AS
SELECT
  f.id AS farm_id,
  f.name AS farm_name,
  d.id AS distributor_id,
  d.business_name AS distributor_name,
  d.status AS distributor_status,
  ST_Distance(
    ST_Transform(f.location, 3857),
    ST_Transform(d.location, 3857)
  ) / 1000 AS distance_km
FROM farms f
CROSS JOIN LATERAL (
  SELECT d2.*
  FROM distributors d2
  WHERE d2.location IS NOT NULL
    AND d2.status = 'approved'
  ORDER BY f.location <-> d2.location
  LIMIT 5
) d
WHERE f.location IS NOT NULL;

-- View: Distributor heatmap data (density per region)
CREATE OR REPLACE VIEW vw_distributor_density AS
SELECT
  ST_SnapToGrid(location, 0.5) AS grid_point,
  COUNT(*) AS distributor_count,
  SUM(CAST(warehouse_capacity_kg AS NUMERIC)) AS total_capacity_kg,
  AVG(CAST(average_rating AS NUMERIC)) AS avg_rating
FROM distributors
WHERE location IS NOT NULL
GROUP BY ST_SnapToGrid(location, 0.5);

-- Function: Find distributors within radius of a point
CREATE OR REPLACE FUNCTION find_distributors_near(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 50
)
RETURNS TABLE(
  id INTEGER,
  business_name VARCHAR,
  distance_km DOUBLE PRECISION,
  warehouse_capacity_kg DECIMAL,
  status VARCHAR,
  coverage_regions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.business_name,
    ST_Distance(
      ST_Transform(d.location, 3857),
      ST_Transform(ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326), 3857)
    ) / 1000 AS distance_km,
    d.warehouse_capacity_kg,
    d.status,
    d.coverage_regions::jsonb
  FROM distributors d
  WHERE d.location IS NOT NULL
    AND ST_DWithin(
      d.location::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000  -- Convert km to meters for geography type
    )
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: Find optimal distributor for a farm (closest approved with capacity)
CREATE OR REPLACE FUNCTION find_optimal_distributor(
  p_farm_lat DOUBLE PRECISION,
  p_farm_lng DOUBLE PRECISION,
  p_commodity VARCHAR DEFAULT NULL,
  p_quantity_kg DECIMAL DEFAULT 0
)
RETURNS TABLE(
  distributor_id INTEGER,
  business_name VARCHAR,
  distance_km DOUBLE PRECISION,
  available_capacity_kg NUMERIC,
  average_rating DECIMAL,
  score DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS distributor_id,
    d.business_name,
    ST_Distance(
      ST_Transform(d.location, 3857),
      ST_Transform(ST_SetSRID(ST_MakePoint(p_farm_lng, p_farm_lat), 4326), 3857)
    ) / 1000 AS distance_km,
    CAST(d.warehouse_capacity_kg AS NUMERIC) AS available_capacity_kg,
    d.average_rating,
    -- Score: lower distance is better, higher rating is better, must have capacity
    (1.0 / GREATEST(ST_Distance(
      ST_Transform(d.location, 3857),
      ST_Transform(ST_SetSRID(ST_MakePoint(p_farm_lng, p_farm_lat), 4326), 3857)
    ) / 1000, 0.1)) * COALESCE(CAST(d.average_rating AS DOUBLE PRECISION), 3.0) AS score
  FROM distributors d
  WHERE d.location IS NOT NULL
    AND d.status = 'approved'
    AND (p_quantity_kg = 0 OR CAST(d.warehouse_capacity_kg AS NUMERIC) >= p_quantity_kg)
  ORDER BY score DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate coverage gaps (areas not served by any distributor)
CREATE OR REPLACE FUNCTION get_coverage_gaps(
  p_region_wkt TEXT DEFAULT NULL  -- Optional WKT polygon to constrain analysis
)
RETURNS TABLE(
  gap_geometry geometry,
  gap_area_km2 DOUBLE PRECISION
) AS $$
DECLARE
  v_union geometry;
  v_region geometry;
BEGIN
  -- Union all coverage areas
  SELECT ST_Union(coverage_area) INTO v_union
  FROM distributors
  WHERE coverage_area IS NOT NULL AND status = 'approved';

  IF v_union IS NULL THEN
    RETURN;
  END IF;

  -- If region specified, use it; otherwise use bounding box of all distributors
  IF p_region_wkt IS NOT NULL THEN
    v_region := ST_GeomFromText(p_region_wkt, 4326);
  ELSE
    v_region := ST_Envelope(v_union);
  END IF;

  -- Return the difference (gaps)
  RETURN QUERY
  SELECT
    ST_Difference(v_region, v_union) AS gap_geometry,
    ST_Area(ST_Transform(ST_Difference(v_region, v_union), 3857)) / 1000000 AS gap_area_km2;
END;
$$ LANGUAGE plpgsql;
