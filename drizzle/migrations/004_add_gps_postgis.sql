-- Add PostGIS geometry column to gps_tracks table
-- This enables spatial indexing and PostGIS operations on GPS data

-- Add geometry column to gps_tracks (Point with SRID 4326 = WGS 84)
ALTER TABLE gps_tracks ADD COLUMN IF NOT EXISTS location geometry(Point, 4326);

-- Create spatial index on gps_tracks location
CREATE INDEX IF NOT EXISTS gps_tracks_location_gist_idx ON gps_tracks USING GIST (location);

-- Create index on timestamp for time-series queries
CREATE INDEX IF NOT EXISTS gps_tracks_timestamp_btree_idx ON gps_tracks (timestamp DESC);

-- Create composite index for device + time queries
CREATE INDEX IF NOT EXISTS gps_tracks_device_timestamp_idx ON gps_tracks (device_id, timestamp DESC);

-- Update existing rows to populate geometry from lat/lon
UPDATE gps_tracks 
SET location = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4326)
WHERE location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create trigger to auto-populate geometry on insert/update
CREATE OR REPLACE FUNCTION update_gps_track_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude::float, NEW.latitude::float), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gps_tracks_location_trigger ON gps_tracks;
CREATE TRIGGER gps_tracks_location_trigger
  BEFORE INSERT OR UPDATE ON gps_tracks
  FOR EACH ROW
  EXECUTE FUNCTION update_gps_track_location();

-- Add geometry column to gps_devices for last known location
ALTER TABLE gps_devices ADD COLUMN IF NOT EXISTS last_location geometry(Point, 4326);

-- Create spatial index on gps_devices last_location
CREATE INDEX IF NOT EXISTS gps_devices_last_location_gist_idx ON gps_devices USING GIST (last_location);

-- Update existing device locations
UPDATE gps_devices 
SET last_location = ST_SetSRID(ST_MakePoint(last_longitude::float, last_latitude::float), 4326)
WHERE last_location IS NULL AND last_latitude IS NOT NULL AND last_longitude IS NOT NULL;

-- Create trigger for gps_devices location
CREATE OR REPLACE FUNCTION update_gps_device_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_latitude IS NOT NULL AND NEW.last_longitude IS NOT NULL THEN
    NEW.last_location := ST_SetSRID(ST_MakePoint(NEW.last_longitude::float, NEW.last_latitude::float), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gps_devices_location_trigger ON gps_devices;
CREATE TRIGGER gps_devices_location_trigger
  BEFORE INSERT OR UPDATE ON gps_devices
  FOR EACH ROW
  EXECUTE FUNCTION update_gps_device_location();

-- Create view for GPS tracks with farm boundary containment (using PostGIS)
CREATE OR REPLACE VIEW gps_tracks_with_farms AS
SELECT 
  t.id,
  t.user_id,
  t.device_id,
  t.farm_id,
  t.latitude,
  t.longitude,
  t.altitude,
  t.accuracy,
  t.speed,
  t.heading,
  t.timestamp,
  t.activity,
  t.location,
  fb.id as detected_boundary_id,
  fb.name as boundary_name,
  f.farm_name as detected_farm_name
FROM gps_tracks t
LEFT JOIN LATERAL (
  SELECT fb.id, fb.name, fb.farm_id
  FROM farm_boundaries fb
  WHERE fb.user_id = t.user_id
    AND ST_Contains(fb.boundary, t.location)
  LIMIT 1
) fb ON true
LEFT JOIN farms f ON fb.farm_id = f.id;

-- Create materialized view for GPS track statistics per farm
CREATE MATERIALIZED VIEW IF NOT EXISTS gps_farm_statistics AS
SELECT 
  fb.farm_id,
  fb.id as boundary_id,
  fb.name as boundary_name,
  f.farm_name,
  f.user_id,
  COUNT(t.id) as total_tracks,
  COUNT(DISTINCT t.device_id) as unique_devices,
  COUNT(DISTINCT DATE(t.timestamp)) as days_with_activity,
  MIN(t.timestamp) as first_activity,
  MAX(t.timestamp) as last_activity,
  AVG(t.speed::float) as avg_speed,
  SUM(
    CASE WHEN t.activity IS NOT NULL THEN 1 ELSE 0 END
  ) as tracks_with_activity,
  ST_Area(fb.boundary::geography) / 10000 as boundary_area_hectares
FROM farm_boundaries fb
JOIN farms f ON fb.farm_id = f.id
LEFT JOIN gps_tracks t ON t.user_id = fb.user_id 
  AND ST_Contains(fb.boundary, t.location)
GROUP BY fb.farm_id, fb.id, fb.name, f.farm_name, f.user_id, fb.boundary;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS gps_farm_statistics_idx ON gps_farm_statistics (boundary_id);

-- Create function to refresh GPS farm statistics
CREATE OR REPLACE FUNCTION refresh_gps_farm_statistics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY gps_farm_statistics;
END;
$$ LANGUAGE plpgsql;

-- Create view for device coverage analysis
CREATE OR REPLACE VIEW gps_device_coverage AS
SELECT 
  d.id as device_id,
  d.name as device_name,
  d.user_id,
  d.status,
  COUNT(t.id) as total_tracks,
  COUNT(DISTINCT t.farm_id) as farms_visited,
  ST_ConvexHull(ST_Collect(t.location)) as coverage_area,
  ST_Area(ST_ConvexHull(ST_Collect(t.location))::geography) / 10000 as coverage_hectares,
  MIN(t.timestamp) as first_track,
  MAX(t.timestamp) as last_track
FROM gps_devices d
LEFT JOIN gps_tracks t ON d.id = t.device_id
WHERE t.location IS NOT NULL
GROUP BY d.id, d.name, d.user_id, d.status;
