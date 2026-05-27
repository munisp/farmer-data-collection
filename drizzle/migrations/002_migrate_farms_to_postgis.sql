-- Migrate farms table to use PostGIS geometry types
-- This migration converts latitude/longitude columns to a single geometry column

-- Step 1: Add geometry column (SRID 4326 = WGS 84)
ALTER TABLE farms ADD COLUMN IF NOT EXISTS location geometry(Point, 4326);

-- Step 2: Populate geometry column from existing lat/lon data
UPDATE farms 
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Step 3: Create spatial index for fast spatial queries
CREATE INDEX IF NOT EXISTS idx_farms_location ON farms USING GIST (location);

-- Step 4: Add check constraint to ensure valid coordinates
ALTER TABLE farms ADD CONSTRAINT IF NOT EXISTS check_valid_location 
  CHECK (location IS NULL OR ST_IsValid(location));

-- Optional: Keep latitude/longitude columns for backward compatibility
-- If you want to remove them later, uncomment these lines:
-- ALTER TABLE farms DROP COLUMN IF EXISTS latitude;
-- ALTER TABLE farms DROP COLUMN IF EXISTS longitude;

-- Add comment for documentation
COMMENT ON COLUMN farms.location IS 'Farm location as PostGIS Point geometry (SRID 4326 - WGS 84)';
