import { pgTable, serial, integer, varchar, text, timestamp, decimal, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { users, farms } from './schema.js';

/**
 * Precision Agriculture Database Schema
 * 
 * This schema supports advanced precision agriculture features including:
 * - Satellite imagery and vegetation indices (NDVI, NDRE)
 * - Field boundary mapping with GeoJSON
 * - Soil and crop health monitoring
 * - AI-powered diagnostics
 * - Equipment tracking and fuel monitoring
 * - Weather forecasting and alerts
 * - Yield prediction and analytics
 */

// Field Boundaries - Precise field mapping with GeoJSON polygons
export const fieldBoundaries = pgTable('field_boundaries', {
  id: serial('id').primaryKey(),
  farmId: integer('farm_id').references(() => farms.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  fieldName: varchar('field_name', { length: 255 }).notNull(),
  boundary: jsonb('boundary').notNull(), // GeoJSON Polygon
  areaHectares: decimal('area_hectares', { precision: 10, scale: 4 }).notNull(),
  cropType: varchar('crop_type', { length: 100 }),
  soilType: varchar('soil_type', { length: 100 }),
  irrigationType: varchar('irrigation_type', { length: 50 }), // drip, sprinkler, flood, rainfed
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  farmIdIdx: index('field_boundaries_farm_id_idx').on(table.farmId),
  userIdIdx: index('field_boundaries_user_id_idx').on(table.userId),
}));

// Field Zones - Precision mapping zones within fields
export const fieldZones = pgTable('field_zones', {
  id: serial('id').primaryKey(),
  fieldBoundaryId: integer('field_boundary_id').references(() => fieldBoundaries.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  zoneName: varchar('zone_name', { length: 255 }).notNull(),
  zoneType: varchar('zone_type', { length: 50 }).notNull(), // management_zone, soil_zone, yield_zone
  boundary: jsonb('boundary').notNull(), // GeoJSON Polygon
  areaHectares: decimal('area_hectares', { precision: 10, scale: 4 }).notNull(),
  properties: jsonb('properties'), // Zone-specific properties (soil pH, organic matter, etc.)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  fieldBoundaryIdIdx: index('field_zones_field_boundary_id_idx').on(table.fieldBoundaryId),
  userIdIdx: index('field_zones_user_id_idx').on(table.userId),
}));

// Satellite Imagery - Store satellite image metadata and URLs
export const satelliteImagery = pgTable('satellite_imagery', {
  id: serial('id').primaryKey(),
  fieldBoundaryId: integer('field_boundary_id').references(() => fieldBoundaries.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  imageDate: timestamp('image_date').notNull(),
  satelliteSource: varchar('satellite_source', { length: 50 }).notNull(), // sentinel-2, landsat-8, planet
  imageType: varchar('image_type', { length: 50 }).notNull(), // true_color, false_color, ndvi, ndre
  imageUrl: text('image_url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  cloudCoverage: decimal('cloud_coverage', { precision: 5, scale: 2 }), // Percentage
  resolution: decimal('resolution', { precision: 10, scale: 2 }), // Meters per pixel
  metadata: jsonb('metadata'), // Additional satellite metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  fieldBoundaryIdIdx: index('satellite_imagery_field_boundary_id_idx').on(table.fieldBoundaryId),
  userIdIdx: index('satellite_imagery_user_id_idx').on(table.userId),
  imageDateIdx: index('satellite_imagery_image_date_idx').on(table.imageDate),
}));

// Vegetation Indices - Time-series NDVI, NDRE, and other indices
export const vegetationIndices = pgTable('vegetation_indices', {
  id: serial('id').primaryKey(),
  fieldBoundaryId: integer('field_boundary_id').references(() => fieldBoundaries.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  measurementDate: timestamp('measurement_date').notNull(),
  ndvi: decimal('ndvi', { precision: 5, scale: 4 }), // -1 to 1
  ndre: decimal('ndre', { precision: 5, scale: 4 }), // Normalized Difference Red Edge
  evi: decimal('evi', { precision: 5, scale: 4 }), // Enhanced Vegetation Index
  savi: decimal('savi', { precision: 5, scale: 4 }), // Soil Adjusted Vegetation Index
  gndvi: decimal('gndvi', { precision: 5, scale: 4 }), // Green NDVI
  meanValue: decimal('mean_value', { precision: 5, scale: 4 }),
  minValue: decimal('min_value', { precision: 5, scale: 4 }),
  maxValue: decimal('max_value', { precision: 5, scale: 4 }),
  stdDev: decimal('std_dev', { precision: 5, scale: 4 }),
  satelliteImageId: integer('satellite_image_id').references(() => satelliteImagery.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  fieldBoundaryIdIdx: index('vegetation_indices_field_boundary_id_idx').on(table.fieldBoundaryId),
  userIdIdx: index('vegetation_indices_user_id_idx').on(table.userId),
  measurementDateIdx: index('vegetation_indices_measurement_date_idx').on(table.measurementDate),
}));

// Soil Reports - Soil analysis and condition reports
export const soilReports = pgTable('soil_reports', {
  id: serial('id').primaryKey(),
  fieldBoundaryId: integer('field_boundary_id').references(() => fieldBoundaries.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  reportDate: timestamp('report_date').notNull(),
  reportType: varchar('report_type', { length: 50 }).notNull(), // lab_analysis, field_test, satellite_derived
  ph: decimal('ph', { precision: 4, scale: 2 }),
  organicMatter: decimal('organic_matter', { precision: 5, scale: 2 }), // Percentage
  nitrogen: decimal('nitrogen', { precision: 10, scale: 2 }), // ppm or kg/ha
  phosphorus: decimal('phosphorus', { precision: 10, scale: 2 }),
  potassium: decimal('potassium', { precision: 10, scale: 2 }),
  soilMoisture: decimal('soil_moisture', { precision: 5, scale: 2 }), // Percentage
  temperature: decimal('temperature', { precision: 5, scale: 2 }), // Celsius
  texture: varchar('texture', { length: 50 }), // clay, loam, sand, etc.
  recommendations: text('recommendations'),
  labResults: jsonb('lab_results'), // Full lab report data
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  fieldBoundaryIdIdx: index('soil_reports_field_boundary_id_idx').on(table.fieldBoundaryId),
  userIdIdx: index('soil_reports_user_id_idx').on(table.userId),
  reportDateIdx: index('soil_reports_report_date_idx').on(table.reportDate),
}));

// Crop Health Reports - Crop condition assessments
export const cropHealthReports = pgTable('crop_health_reports', {
  id: serial('id').primaryKey(),
  fieldBoundaryId: integer('field_boundary_id').references(() => fieldBoundaries.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  reportDate: timestamp('report_date').notNull(),
  growthStage: varchar('growth_stage', { length: 100 }).notNull(),
  healthScore: decimal('health_score', { precision: 5, scale: 2 }).notNull(), // 0-100
  stressLevel: varchar('stress_level', { length: 50 }), // none, low, moderate, high, severe
  stressType: varchar('stress_type', { length: 100 }), // water, nutrient, disease, pest, heat
  canopyCover: decimal('canopy_cover', { precision: 5, scale: 2 }), // Percentage
  leafAreaIndex: decimal('leaf_area_index', { precision: 5, scale: 2 }),
  biomass: decimal('biomass', { precision: 10, scale: 2 }), // kg/ha
  observations: text('observations'),
  recommendations: text('recommendations'),
  images: jsonb('images'), // Array of image URLs
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  fieldBoundaryIdIdx: index('crop_health_reports_field_boundary_id_idx').on(table.fieldBoundaryId),
  userIdIdx: index('crop_health_reports_user_id_idx').on(table.userId),
  reportDateIdx: index('crop_health_reports_report_date_idx').on(table.reportDate),
}));

// AI Diagnostics - AI-powered crop disease and pest detection
export const aiDiagnostics = pgTable('ai_diagnostics', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  fieldBoundaryId: integer('field_boundary_id').references(() => fieldBoundaries.id),
  diagnosisDate: timestamp('diagnosis_date').defaultNow().notNull(),
  imageUrl: text('image_url').notNull(),
  diagnosisType: varchar('diagnosis_type', { length: 50 }).notNull(), // disease, pest, nutrient_deficiency, weed
  detectedIssue: varchar('detected_issue', { length: 255 }).notNull(),
  confidence: decimal('confidence', { precision: 5, scale: 2 }).notNull(), // 0-100
  severity: varchar('severity', { length: 50 }), // low, moderate, high, critical
  affectedArea: decimal('affected_area', { precision: 10, scale: 2 }), // Percentage or hectares
  symptoms: text('symptoms'),
  treatment: text('treatment'),
  preventionMeasures: text('prevention_measures'),
  aiModel: varchar('ai_model', { length: 100 }), // Model version used
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('ai_diagnostics_user_id_idx').on(table.userId),
  fieldBoundaryIdIdx: index('ai_diagnostics_field_boundary_id_idx').on(table.fieldBoundaryId),
  diagnosisDateIdx: index('ai_diagnostics_diagnosis_date_idx').on(table.diagnosisDate),
}));

// Field Scouting Tasks - Organize field inspection activities
export const scoutingTasks = pgTable('scouting_tasks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  fieldBoundaryId: integer('field_boundary_id').references(() => fieldBoundaries.id).notNull(),
  taskName: varchar('task_name', { length: 255 }).notNull(),
  taskType: varchar('task_type', { length: 50 }).notNull(), // inspection, sampling, monitoring, treatment
  priority: varchar('priority', { length: 20 }).notNull(), // low, medium, high, urgent
  status: varchar('status', { length: 50 }).notNull(), // pending, in_progress, completed, cancelled
  scheduledDate: timestamp('scheduled_date'),
  completedDate: timestamp('completed_date'),
  assignedTo: varchar('assigned_to', { length: 255 }),
  scoutingRoute: jsonb('scouting_route'), // GeoJSON LineString
  observations: text('observations'),
  images: jsonb('images'), // Array of image URLs
  recommendations: text('recommendations'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('scouting_tasks_user_id_idx').on(table.userId),
  fieldBoundaryIdIdx: index('scouting_tasks_field_boundary_id_idx').on(table.fieldBoundaryId),
  statusIdx: index('scouting_tasks_status_idx').on(table.status),
  scheduledDateIdx: index('scouting_tasks_scheduled_date_idx').on(table.scheduledDate),
}));

// Weather Alerts - Weather forecasts and severe weather alerts
export const weatherAlerts = pgTable('weather_alerts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  fieldBoundaryId: integer('field_boundary_id').references(() => fieldBoundaries.id),
  alertDate: timestamp('alert_date').defaultNow().notNull(),
  alertType: varchar('alert_type', { length: 50 }).notNull(), // frost, heat, rain, wind, hail, drought
  severity: varchar('severity', { length: 20 }).notNull(), // advisory, watch, warning, emergency
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time'),
  temperature: decimal('temperature', { precision: 5, scale: 2 }),
  precipitation: decimal('precipitation', { precision: 10, scale: 2 }), // mm
  windSpeed: decimal('wind_speed', { precision: 5, scale: 2 }), // km/h
  humidity: decimal('humidity', { precision: 5, scale: 2 }), // Percentage
  description: text('description'),
  recommendations: text('recommendations'),
  isRead: boolean('is_read').default(false),
  isSent: boolean('is_sent').default(false), // SMS/Email notification sent
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('weather_alerts_user_id_idx').on(table.userId),
  fieldBoundaryIdIdx: index('weather_alerts_field_boundary_id_idx').on(table.fieldBoundaryId),
  alertDateIdx: index('weather_alerts_alert_date_idx').on(table.alertDate),
  severityIdx: index('weather_alerts_severity_idx').on(table.severity),
}));

// Yield Predictions - ML-based yield forecasting
export const yieldPredictions = pgTable('yield_predictions', {
  id: serial('id').primaryKey(),
  fieldBoundaryId: integer('field_boundary_id').references(() => fieldBoundaries.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  predictionDate: timestamp('prediction_date').defaultNow().notNull(),
  harvestDate: timestamp('harvest_date'),
  cropType: varchar('crop_type', { length: 100 }).notNull(),
  predictedYield: decimal('predicted_yield', { precision: 10, scale: 2 }).notNull(), // kg/ha or tons/ha
  confidence: decimal('confidence', { precision: 5, scale: 2 }).notNull(), // 0-100
  minYield: decimal('min_yield', { precision: 10, scale: 2 }),
  maxYield: decimal('max_yield', { precision: 10, scale: 2 }),
  actualYield: decimal('actual_yield', { precision: 10, scale: 2 }), // Filled after harvest
  predictionModel: varchar('prediction_model', { length: 100 }),
  inputFactors: jsonb('input_factors'), // Weather, NDVI, soil, historical data
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  fieldBoundaryIdIdx: index('yield_predictions_field_boundary_id_idx').on(table.fieldBoundaryId),
  userIdIdx: index('yield_predictions_user_id_idx').on(table.userId),
  predictionDateIdx: index('yield_predictions_prediction_date_idx').on(table.predictionDate),
}));

// Equipment - Farm equipment and machinery tracking
export const equipment = pgTable('equipment', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  equipmentName: varchar('equipment_name', { length: 255 }).notNull(),
  equipmentType: varchar('equipment_type', { length: 100 }).notNull(), // tractor, harvester, sprayer, planter, etc.
  manufacturer: varchar('manufacturer', { length: 100 }),
  model: varchar('model', { length: 100 }),
  serialNumber: varchar('serial_number', { length: 100 }),
  purchaseDate: timestamp('purchase_date'),
  purchasePrice: decimal('purchase_price', { precision: 12, scale: 2 }),
  currentValue: decimal('current_value', { precision: 12, scale: 2 }),
  status: varchar('status', { length: 50 }).notNull(), // active, maintenance, retired
  fuelType: varchar('fuel_type', { length: 50 }), // diesel, petrol, electric, hybrid
  fuelCapacity: decimal('fuel_capacity', { precision: 10, scale: 2 }), // Liters
  hoursUsed: decimal('hours_used', { precision: 10, scale: 2 }),
  gpsTrackerId: varchar('gps_tracker_id', { length: 100 }),
  lastMaintenanceDate: timestamp('last_maintenance_date'),
  nextMaintenanceDate: timestamp('next_maintenance_date'),
  images: jsonb('images'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('equipment_user_id_idx').on(table.userId),
  statusIdx: index('equipment_status_idx').on(table.status),
}));

// Fuel Logs - Track fuel consumption and costs
export const fuelLogs = pgTable('fuel_logs', {
  id: serial('id').primaryKey(),
  equipmentId: integer('equipment_id').references(() => equipment.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  logDate: timestamp('log_date').defaultNow().notNull(),
  fuelType: varchar('fuel_type', { length: 50 }).notNull(),
  quantity: decimal('quantity', { precision: 10, scale: 2 }).notNull(), // Liters
  costPerUnit: decimal('cost_per_unit', { precision: 10, scale: 2 }),
  totalCost: decimal('total_cost', { precision: 12, scale: 2 }),
  odometerReading: decimal('odometer_reading', { precision: 10, scale: 2 }), // Hours or km
  fuelEfficiency: decimal('fuel_efficiency', { precision: 10, scale: 2 }), // L/hr or L/100km
  location: varchar('location', { length: 255 }),
  operator: varchar('operator', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  equipmentIdIdx: index('fuel_logs_equipment_id_idx').on(table.equipmentId),
  userIdIdx: index('fuel_logs_user_id_idx').on(table.userId),
  logDateIdx: index('fuel_logs_log_date_idx').on(table.logDate),
}));

// Export types for use in application
export type FieldBoundary = typeof fieldBoundaries.$inferSelect;
export type InsertFieldBoundary = typeof fieldBoundaries.$inferInsert;

export type FieldZone = typeof fieldZones.$inferSelect;
export type InsertFieldZone = typeof fieldZones.$inferInsert;

export type SatelliteImage = typeof satelliteImagery.$inferSelect;
export type InsertSatelliteImage = typeof satelliteImagery.$inferInsert;

export type VegetationIndex = typeof vegetationIndices.$inferSelect;
export type InsertVegetationIndex = typeof vegetationIndices.$inferInsert;

export type SoilReport = typeof soilReports.$inferSelect;
export type InsertSoilReport = typeof soilReports.$inferInsert;

export type CropHealthReport = typeof cropHealthReports.$inferSelect;
export type InsertCropHealthReport = typeof cropHealthReports.$inferInsert;

export type AIDiagnostic = typeof aiDiagnostics.$inferSelect;
export type InsertAIDiagnostic = typeof aiDiagnostics.$inferInsert;

export type ScoutingTask = typeof scoutingTasks.$inferSelect;
export type InsertScoutingTask = typeof scoutingTasks.$inferInsert;

export type WeatherAlert = typeof weatherAlerts.$inferSelect;
export type InsertWeatherAlert = typeof weatherAlerts.$inferInsert;

export type YieldPrediction = typeof yieldPredictions.$inferSelect;
export type InsertYieldPrediction = typeof yieldPredictions.$inferInsert;

export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = typeof equipment.$inferInsert;

export type FuelLog = typeof fuelLogs.$inferSelect;
export type InsertFuelLog = typeof fuelLogs.$inferInsert;
