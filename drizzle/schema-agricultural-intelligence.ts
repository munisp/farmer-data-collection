/**
 * Agricultural Intelligence Schema
 * 
 * Tables for:
 * - Crop Calendar with GDD tracking
 * - Pest and Disease Risk assessments
 */

import { pgTable, serial, integer, varchar, text, timestamp, decimal, boolean, jsonb } from "drizzle-orm/pg-core";

// Crop Calendar - stores planting dates, GDD accumulation, and harvest predictions
export const cropCalendar = pgTable("crop_calendar", {
  id: serial("id").primaryKey(),
  cropId: integer("crop_id").notNull(),
  plantingDate: timestamp("planting_date"),
  estimatedHarvestDate: timestamp("estimated_harvest_date"),
  actualHarvestDate: timestamp("actual_harvest_date"),
  cumulativeGDD: integer("cumulative_gdd").default(0), // Growing Degree Days accumulated
  currentStage: varchar("current_stage", { length: 100 }), // Current growth stage
  gddToMaturity: integer("gdd_to_maturity"), // Total GDD needed for maturity
  percentComplete: decimal("percent_complete", { precision: 5, scale: 2 }), // Percentage of growth complete
  isOnTrack: boolean("is_on_track").default(true), // Whether crop is developing on schedule
  recommendations: jsonb("recommendations"), // Array of recommendations
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Pest and Disease Risk Assessments - stores risk scores and alerts
export const pestDiseaseRisks = pgTable("pest_disease_risks", {
  id: serial("id").primaryKey(),
  cropId: integer("crop_id").notNull(),
  pestOrDisease: varchar("pest_or_disease", { length: 200 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'pest' or 'disease'
  riskLevel: varchar("risk_level", { length: 20 }).notNull(), // 'low', 'medium', 'high', 'critical'
  riskScore: integer("risk_score").notNull(), // 0-100
  temperature: decimal("temperature", { precision: 5, scale: 2 }), // °C
  humidity: decimal("humidity", { precision: 5, scale: 2 }), // %
  rainfall: decimal("rainfall", { precision: 7, scale: 2 }), // mm
  recommendation: text("recommendation"),
  assessmentDate: timestamp("assessment_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Soil Moisture Readings - stores historical soil moisture data
export const soilMoistureReadings = pgTable("soil_moisture_readings", {
  id: serial("id").primaryKey(),
  cropId: integer("crop_id").notNull(),
  moisture: decimal("moisture", { precision: 5, scale: 3 }).notNull(), // Volumetric water content (0-1)
  source: varchar("source", { length: 50 }).notNull(), // 'nasa_smap', 'copernicus', 'local_sensor'
  depth: integer("depth").notNull(), // Depth in cm
  quality: varchar("quality", { length: 20 }).notNull(), // 'high', 'medium', 'low'
  readingDate: timestamp("reading_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Irrigation Recommendations - stores irrigation advice history
export const irrigationRecommendations = pgTable("irrigation_recommendations", {
  id: serial("id").primaryKey(),
  cropId: integer("crop_id").notNull(),
  shouldIrrigate: boolean("should_irrigate").notNull(),
  urgency: varchar("urgency", { length: 20 }).notNull(), // 'immediate', 'soon', 'monitor', 'none'
  waterAmount: integer("water_amount").notNull(), // mm of water needed
  moistureStatus: varchar("moisture_status", { length: 20 }).notNull(), // 'optimal', 'adequate', 'critical', 'stress'
  reason: text("reason").notNull(),
  nextCheckDate: timestamp("next_check_date"),
  recommendationDate: timestamp("recommendation_date").notNull(),
  wasFollowed: boolean("was_followed"), // Track if farmer followed recommendation
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Type exports
export type CropCalendar = typeof cropCalendar.$inferSelect;
export type InsertCropCalendar = typeof cropCalendar.$inferInsert;
export type PestDiseaseRisk = typeof pestDiseaseRisks.$inferSelect;
export type InsertPestDiseaseRisk = typeof pestDiseaseRisks.$inferInsert;
export type SoilMoistureReading = typeof soilMoistureReadings.$inferSelect;
export type InsertSoilMoistureReading = typeof soilMoistureReadings.$inferInsert;
export type IrrigationRecommendation = typeof irrigationRecommendations.$inferSelect;
export type InsertIrrigationRecommendation = typeof irrigationRecommendations.$inferInsert;
