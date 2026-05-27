-- Enable PostGIS extension for spatial data support
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Verify PostGIS installation
SELECT PostGIS_Version();

-- Create spatial reference system table if not exists (usually created automatically)
-- SRID 4326 is WGS 84 (standard GPS coordinates)
