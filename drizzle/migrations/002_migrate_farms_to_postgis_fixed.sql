-- Migrate farms table to use PostGIS geometry types
-- This migration converts the text location column to geometry and adds lat/lon geometry column

-- Step 1: Drop the existing text location column and add geometry column
ALTER TABLE farms DROP COLUMN IF EXISTS location;
ALTER TABLE farms ADD COLUMN location geometry(Point, 4326);

-- Step 2: Populate geometry column from existing lat/lon data
UPDATE farms 
SET location = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Step 3: Create spatial index for fast spatial queries
CREATE INDEX IF NOT EXISTS idx_farms_location ON farms USING GIST (location);

-- Step 4: Add check constraint to ensure valid coordinates
ALTER TABLE farms ADD CONSTRAINT check_valid_location 
  CHECK (location IS NULL OR ST_IsValid(location));

-- Add comment for documentation
COMMENT ON COLUMN farms.location IS 'Farm location as PostGIS Point geometry (SRID 4326 - WGS 84)';
