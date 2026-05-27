-- Create farm_boundaries table for storing farm polygon boundaries
-- This allows farmers to draw their farm boundaries on a map

CREATE TABLE IF NOT EXISTS farm_boundaries (
  id SERIAL PRIMARY KEY,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Polygon geometry for farm boundary (SRID 4326 = WGS 84)
  boundary geometry(Polygon, 4326) NOT NULL,
  
  -- Calculated area in square meters
  area_sqm DOUBLE PRECISION GENERATED ALWAYS AS (ST_Area(boundary::geography)) STORED,
  
  -- Calculated area in hectares (1 hectare = 10,000 sqm)
  area_hectares DOUBLE PRECISION GENERATED ALWAYS AS (ST_Area(boundary::geography) / 10000.0) STORED,
  
  -- Calculated perimeter in meters
  perimeter_m DOUBLE PRECISION GENERATED ALWAYS AS (ST_Perimeter(boundary::geography)) STORED,
  
  -- Optional metadata
  name VARCHAR(255),
  description TEXT,
  boundary_type VARCHAR(50) DEFAULT 'manual', -- manual, gps_tracked, satellite
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Ensure valid geometry
  CONSTRAINT check_valid_boundary CHECK (ST_IsValid(boundary)),
  
  -- Ensure polygon has at least 4 points (triangle + closing point)
  CONSTRAINT check_min_points CHECK (ST_NPoints(boundary) >= 4),
  
  -- Ensure reasonable area (between 0.01 and 100,000 hectares)
  CONSTRAINT check_reasonable_area CHECK (
    ST_Area(boundary::geography) / 10000.0 BETWEEN 0.01 AND 100000
  )
);

-- Create spatial index for fast spatial queries
CREATE INDEX idx_farm_boundaries_boundary ON farm_boundaries USING GIST (boundary);

-- Create index for farm_id lookups
CREATE INDEX idx_farm_boundaries_farm_id ON farm_boundaries(farm_id);

-- Create index for user_id lookups
CREATE INDEX idx_farm_boundaries_user_id ON farm_boundaries(user_id);

-- Add comments for documentation
COMMENT ON TABLE farm_boundaries IS 'Stores polygon boundaries for farms with automatic area/perimeter calculations';
COMMENT ON COLUMN farm_boundaries.boundary IS 'Farm boundary as PostGIS Polygon geometry (SRID 4326 - WGS 84)';
COMMENT ON COLUMN farm_boundaries.area_sqm IS 'Calculated area in square meters (automatically computed)';
COMMENT ON COLUMN farm_boundaries.area_hectares IS 'Calculated area in hectares (automatically computed)';
COMMENT ON COLUMN farm_boundaries.perimeter_m IS 'Calculated perimeter in meters (automatically computed)';
