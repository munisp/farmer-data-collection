/**
 * GPS Tracking and Advanced Agricultural Models Schema
 * 
 * Tables:
 * - gps_devices: GPS device registration and management
 * - gps_tracks: Real-time GPS tracking data
 * - weather_data: Historical weather data storage
 * - biomass_data: Biomass estimation data
 * - canopy_height_data: Canopy height measurements
 * - lst_data: Land Surface Temperature data
 */

import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  timestamp,
  decimal,
  boolean,
  json,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================================
// GPS DEVICE MANAGEMENT
// ============================================================================

export const gpsDevices = pgTable(
  "gps_devices",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    farmId: integer("farm_id"), // Optional: link to specific farm
    deviceId: varchar("device_id", { length: 255 }).notNull().unique(), // Unique device identifier
    name: varchar("name", { length: 255 }).notNull(),
    deviceType: varchar("device_type", { length: 100 }), // e.g., "smartphone", "gps_tracker", "drone"
    status: varchar("status", { length: 50 }).notNull().default("active"), // active, inactive, lost, maintenance
    batteryLevel: integer("battery_level"), // 0-100
    lastLatitude: decimal("last_latitude", { precision: 10, scale: 7 }),
    lastLongitude: decimal("last_longitude", { precision: 10, scale: 7 }),
    lastAltitude: decimal("last_altitude", { precision: 10, scale: 2 }), // meters
    lastAccuracy: decimal("last_accuracy", { precision: 10, scale: 2 }), // meters
    lastSeenAt: timestamp("last_seen_at"),
    metadata: json("metadata"), // Device specs, firmware version, etc.
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    version: integer("version").notNull().default(0),
  },
  (table) => ({
    userIdIdx: index("gps_devices_user_id_idx").on(table.userId),
    farmIdIdx: index("gps_devices_farm_id_idx").on(table.farmId),
    deviceIdIdx: index("gps_devices_device_id_idx").on(table.deviceId),
    statusIdx: index("gps_devices_status_idx").on(table.status),
  })
);

// ============================================================================
// GPS TRACKING DATA
// ============================================================================

export const gpsTracks = pgTable(
  "gps_tracks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    deviceId: integer("device_id").notNull(), // Foreign key to gps_devices
    farmId: integer("farm_id"), // Optional: link to specific farm
    latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
    altitude: decimal("altitude", { precision: 10, scale: 2 }), // meters
    accuracy: decimal("accuracy", { precision: 10, scale: 2 }), // meters
    speed: decimal("speed", { precision: 10, scale: 2 }), // meters/second
    heading: decimal("heading", { precision: 5, scale: 2 }), // degrees (0-360)
    timestamp: timestamp("timestamp").notNull(),
    activity: varchar("activity", { length: 100 }), // e.g., "planting", "harvesting", "spraying"
    notes: text("notes"),
    metadata: json("metadata"), // Additional sensor data, photos, etc.
    clientId: varchar("client_id", { length: 255 }), // Client-generated ID for idempotency/duplicate detection
    createdAt: timestamp("created_at").notNull().defaultNow(),
    version: integer("version").notNull().default(0),
  },
  (table) => ({
    userIdIdx: index("gps_tracks_user_id_idx").on(table.userId),
    deviceIdIdx: index("gps_tracks_device_id_idx").on(table.deviceId),
    farmIdIdx: index("gps_tracks_farm_id_idx").on(table.farmId),
    timestampIdx: index("gps_tracks_timestamp_idx").on(table.timestamp),
    clientIdIdx: index("gps_tracks_client_id_idx").on(table.clientId), // Index for duplicate detection
  })
);

// ============================================================================
// WEATHER DATA STORAGE
// ============================================================================

export const weatherData = pgTable(
  "weather_data",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    farmId: integer("farm_id"), // Optional: link to specific farm
    latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
    longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
    timestamp: timestamp("timestamp").notNull(),
    temperature: decimal("temperature", { precision: 5, scale: 2 }), // Celsius
    feelsLike: decimal("feels_like", { precision: 5, scale: 2 }), // Celsius
    humidity: integer("humidity"), // Percentage (0-100)
    pressure: integer("pressure"), // hPa
    windSpeed: decimal("wind_speed", { precision: 5, scale: 2 }), // m/s
    windDirection: integer("wind_direction"), // degrees (0-360)
    precipitation: decimal("precipitation", { precision: 10, scale: 2 }), // mm
    cloudCover: integer("cloud_cover"), // Percentage (0-100)
    visibility: integer("visibility"), // meters
    uvIndex: decimal("uv_index", { precision: 4, scale: 2 }),
    weatherCondition: varchar("weather_condition", { length: 100 }), // e.g., "Clear", "Rain", "Cloudy"
    weatherDescription: text("weather_description"),
    sunrise: timestamp("sunrise"),
    sunset: timestamp("sunset"),
    source: varchar("source", { length: 100 }).notNull().default("openweathermap"), // API source
    metadata: json("metadata"), // Additional weather data
    createdAt: timestamp("created_at").notNull().defaultNow(),
    version: integer("version").notNull().default(0),
  },
  (table) => ({
    userIdIdx: index("weather_data_user_id_idx").on(table.userId),
    farmIdIdx: index("weather_data_farm_id_idx").on(table.farmId),
    timestampIdx: index("weather_data_timestamp_idx").on(table.timestamp),
    locationIdx: index("weather_data_location_idx").on(table.latitude, table.longitude),
  })
);

// ============================================================================
// BIOMASS DATA
// ============================================================================

export const biomassData = pgTable(
  "biomass_data",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    farmId: integer("farm_id").notNull(),
    cropId: integer("crop_id"), // Optional: link to specific crop
    timestamp: timestamp("timestamp").notNull(),
    biomassValue: decimal("biomass_value", { precision: 10, scale: 2 }).notNull(), // kg/ha or tons/ha
    unit: varchar("unit", { length: 50 }).notNull().default("kg/ha"),
    method: varchar("method", { length: 100 }).notNull(), // e.g., "ndvi", "satellite", "manual_measurement"
    confidence: decimal("confidence", { precision: 5, scale: 2 }), // 0-100
    ndviValue: decimal("ndvi_value", { precision: 5, scale: 4 }), // -1 to 1
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    imageUrl: text("image_url"), // Satellite/drone image URL
    notes: text("notes"),
    metadata: json("metadata"), // Additional model parameters, sensor data
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    version: integer("version").notNull().default(0),
  },
  (table) => ({
    userIdIdx: index("biomass_data_user_id_idx").on(table.userId),
    farmIdIdx: index("biomass_data_farm_id_idx").on(table.farmId),
    cropIdIdx: index("biomass_data_crop_id_idx").on(table.cropId),
    timestampIdx: index("biomass_data_timestamp_idx").on(table.timestamp),
  })
);

// ============================================================================
// CANOPY HEIGHT DATA
// ============================================================================

export const canopyHeightData = pgTable(
  "canopy_height_data",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    farmId: integer("farm_id").notNull(),
    cropId: integer("crop_id"), // Optional: link to specific crop
    timestamp: timestamp("timestamp").notNull(),
    heightValue: decimal("height_value", { precision: 10, scale: 2 }).notNull(), // meters
    method: varchar("method", { length: 100 }).notNull(), // e.g., "lidar", "drone_photogrammetry", "manual_measurement"
    confidence: decimal("confidence", { precision: 5, scale: 2 }), // 0-100
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    coverageArea: decimal("coverage_area", { precision: 10, scale: 2 }), // hectares
    averageHeight: decimal("average_height", { precision: 10, scale: 2 }), // meters
    maxHeight: decimal("max_height", { precision: 10, scale: 2 }), // meters
    minHeight: decimal("min_height", { precision: 10, scale: 2 }), // meters
    imageUrl: text("image_url"), // 3D model or image URL
    notes: text("notes"),
    metadata: json("metadata"), // Point cloud data, processing parameters
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    version: integer("version").notNull().default(0),
  },
  (table) => ({
    userIdIdx: index("canopy_height_data_user_id_idx").on(table.userId),
    farmIdIdx: index("canopy_height_data_farm_id_idx").on(table.farmId),
    cropIdIdx: index("canopy_height_data_crop_id_idx").on(table.cropId),
    timestampIdx: index("canopy_height_data_timestamp_idx").on(table.timestamp),
  })
);

// ============================================================================
// LAND SURFACE TEMPERATURE (LST) DATA
// ============================================================================

export const lstData = pgTable(
  "lst_data",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    farmId: integer("farm_id").notNull(),
    cropId: integer("crop_id"), // Optional: link to specific crop
    timestamp: timestamp("timestamp").notNull(),
    temperature: decimal("temperature", { precision: 5, scale: 2 }).notNull(), // Celsius
    temperatureMin: decimal("temperature_min", { precision: 5, scale: 2 }), // Celsius
    temperatureMax: decimal("temperature_max", { precision: 5, scale: 2 }), // Celsius
    temperatureAvg: decimal("temperature_avg", { precision: 5, scale: 2 }), // Celsius
    source: varchar("source", { length: 100 }).notNull(), // e.g., "landsat8", "modis", "sentinel3", "thermal_camera"
    resolution: integer("resolution"), // meters (spatial resolution)
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    coverageArea: decimal("coverage_area", { precision: 10, scale: 2 }), // hectares
    cloudCover: integer("cloud_cover"), // Percentage (0-100)
    quality: varchar("quality", { length: 50 }), // e.g., "high", "medium", "low"
    imageUrl: text("image_url"), // Thermal image URL
    notes: text("notes"),
    metadata: json("metadata"), // Satellite metadata, processing parameters
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    version: integer("version").notNull().default(0),
  },
  (table) => ({
    userIdIdx: index("lst_data_user_id_idx").on(table.userId),
    farmIdIdx: index("lst_data_farm_id_idx").on(table.farmId),
    cropIdIdx: index("lst_data_crop_id_idx").on(table.cropId),
    timestampIdx: index("lst_data_timestamp_idx").on(table.timestamp),
    sourceIdx: index("lst_data_source_idx").on(table.source),
  })
);
