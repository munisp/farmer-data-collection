-- GPS Devices Table
CREATE TABLE IF NOT EXISTS gps_devices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  farm_id INTEGER,
  device_id VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  device_type VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  battery_level INTEGER,
  last_latitude DECIMAL(10, 7),
  last_longitude DECIMAL(10, 7),
  last_altitude DECIMAL(10, 2),
  last_accuracy DECIMAL(10, 2),
  last_seen_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS gps_devices_user_id_idx ON gps_devices(user_id);
CREATE INDEX IF NOT EXISTS gps_devices_farm_id_idx ON gps_devices(farm_id);
CREATE INDEX IF NOT EXISTS gps_devices_device_id_idx ON gps_devices(device_id);
CREATE INDEX IF NOT EXISTS gps_devices_status_idx ON gps_devices(status);

-- GPS Tracks Table
CREATE TABLE IF NOT EXISTS gps_tracks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  device_id INTEGER NOT NULL,
  farm_id INTEGER,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  altitude DECIMAL(10, 2),
  accuracy DECIMAL(10, 2),
  speed DECIMAL(10, 2),
  heading DECIMAL(5, 2),
  timestamp TIMESTAMP NOT NULL,
  activity VARCHAR(100),
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS gps_tracks_user_id_idx ON gps_tracks(user_id);
CREATE INDEX IF NOT EXISTS gps_tracks_device_id_idx ON gps_tracks(device_id);
CREATE INDEX IF NOT EXISTS gps_tracks_farm_id_idx ON gps_tracks(farm_id);
CREATE INDEX IF NOT EXISTS gps_tracks_timestamp_idx ON gps_tracks(timestamp);

-- Weather Data Table
CREATE TABLE IF NOT EXISTS weather_data (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  farm_id INTEGER,
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  temperature DECIMAL(5, 2),
  feels_like DECIMAL(5, 2),
  humidity INTEGER,
  pressure INTEGER,
  wind_speed DECIMAL(5, 2),
  wind_direction INTEGER,
  precipitation DECIMAL(10, 2),
  cloud_cover INTEGER,
  visibility INTEGER,
  uv_index DECIMAL(4, 2),
  weather_condition VARCHAR(100),
  weather_description TEXT,
  sunrise TIMESTAMP,
  sunset TIMESTAMP,
  source VARCHAR(100) NOT NULL DEFAULT 'openweathermap',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS weather_data_user_id_idx ON weather_data(user_id);
CREATE INDEX IF NOT EXISTS weather_data_farm_id_idx ON weather_data(farm_id);
CREATE INDEX IF NOT EXISTS weather_data_timestamp_idx ON weather_data(timestamp);
CREATE INDEX IF NOT EXISTS weather_data_location_idx ON weather_data(latitude, longitude);

-- Biomass Data Table
CREATE TABLE IF NOT EXISTS biomass_data (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  farm_id INTEGER NOT NULL,
  crop_id INTEGER,
  timestamp TIMESTAMP NOT NULL,
  biomass_value DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(50) NOT NULL DEFAULT 'kg/ha',
  method VARCHAR(100) NOT NULL,
  confidence DECIMAL(5, 2),
  ndvi_value DECIMAL(5, 4),
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  image_url TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS biomass_data_user_id_idx ON biomass_data(user_id);
CREATE INDEX IF NOT EXISTS biomass_data_farm_id_idx ON biomass_data(farm_id);
CREATE INDEX IF NOT EXISTS biomass_data_crop_id_idx ON biomass_data(crop_id);
CREATE INDEX IF NOT EXISTS biomass_data_timestamp_idx ON biomass_data(timestamp);

-- Canopy Height Data Table
CREATE TABLE IF NOT EXISTS canopy_height_data (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  farm_id INTEGER NOT NULL,
  crop_id INTEGER,
  timestamp TIMESTAMP NOT NULL,
  height_value DECIMAL(10, 2) NOT NULL,
  method VARCHAR(100) NOT NULL,
  confidence DECIMAL(5, 2),
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  coverage_area DECIMAL(10, 2),
  average_height DECIMAL(10, 2),
  max_height DECIMAL(10, 2),
  min_height DECIMAL(10, 2),
  image_url TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS canopy_height_data_user_id_idx ON canopy_height_data(user_id);
CREATE INDEX IF NOT EXISTS canopy_height_data_farm_id_idx ON canopy_height_data(farm_id);
CREATE INDEX IF NOT EXISTS canopy_height_data_crop_id_idx ON canopy_height_data(crop_id);
CREATE INDEX IF NOT EXISTS canopy_height_data_timestamp_idx ON canopy_height_data(timestamp);

-- LST Data Table
CREATE TABLE IF NOT EXISTS lst_data (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  farm_id INTEGER NOT NULL,
  crop_id INTEGER,
  timestamp TIMESTAMP NOT NULL,
  temperature DECIMAL(5, 2) NOT NULL,
  temperature_min DECIMAL(5, 2),
  temperature_max DECIMAL(5, 2),
  temperature_avg DECIMAL(5, 2),
  source VARCHAR(100) NOT NULL,
  resolution INTEGER,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  coverage_area DECIMAL(10, 2),
  cloud_cover INTEGER,
  quality VARCHAR(50),
  image_url TEXT,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS lst_data_user_id_idx ON lst_data(user_id);
CREATE INDEX IF NOT EXISTS lst_data_farm_id_idx ON lst_data(farm_id);
CREATE INDEX IF NOT EXISTS lst_data_crop_id_idx ON lst_data(crop_id);
CREATE INDEX IF NOT EXISTS lst_data_timestamp_idx ON lst_data(timestamp);
CREATE INDEX IF NOT EXISTS lst_data_source_idx ON lst_data(source);
