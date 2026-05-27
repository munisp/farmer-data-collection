import { pgTable, serial, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { users } from "./schema.js";

/**
 * Alert Thresholds Table
 * Stores user-defined thresholds for analytics metrics
 */
export const alertThresholds = pgTable("alert_thresholds", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  metricName: varchar("metric_name", { length: 100 }).notNull(), // e.g., "total_cost", "message_volume", "engagement_rate"
  thresholdType: varchar("threshold_type", { length: 20 }).notNull(), // "above", "below", "equals"
  thresholdValue: integer("threshold_value").notNull(), // The threshold value
  isActive: boolean("is_active").default(true).notNull(),
  notificationChannel: varchar("notification_channel", { length: 50 }).default("email"), // "email", "sms", "push"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Alert History Table
 * Tracks when alerts are triggered
 */
export const alertHistory = pgTable("alert_history", {
  id: serial("id").primaryKey(),
  thresholdId: integer("threshold_id").references(() => alertThresholds.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  metricName: varchar("metric_name", { length: 100 }).notNull(),
  actualValue: integer("actual_value").notNull(),
  thresholdValue: integer("threshold_value").notNull(),
  message: varchar("message", { length: 500 }),
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
