/**
 * Notification Infrastructure Schema
 * Supports push notifications, in-app notifications, and notification preferences
 */

import { pgTable, serial, varchar, text, integer, boolean, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './schema';

// Notification channel enum
export const notificationChannelEnum = pgEnum('notification_channel', [
  'push',           // Mobile/Web push notifications
  'in_app',         // In-app notification center
  'email',          // Email notifications
  'sms',            // SMS notifications
  'whatsapp',       // WhatsApp notifications
]);

// Notification category enum
export const notificationCategoryEnum = pgEnum('notification_category', [
  'price_alert',        // Market price alerts
  'weather_alert',      // Weather warnings
  'loan_status',        // Loan application updates
  'payment_reminder',   // Repayment reminders
  'order_update',       // Marketplace order updates
  'harvest_reminder',   // Harvest timing reminders
  'sync_status',        // Offline sync status
  'system',             // System notifications
  'promotional',        // Marketing/promotional
  'security',           // Security alerts
  'cooperative',        // Cooperative updates
  'agent_task',         // Field agent tasks
]);

// Notification priority enum
export const notificationPriorityEnum = pgEnum('notification_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);

// Notification status enum
export const notificationStatusEnum = pgEnum('notification_status', [
  'pending',
  'sent',
  'delivered',
  'read',
  'failed',
  'cancelled',
]);

// User notification preferences
export const notificationPreferences = pgTable('notification_preferences', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull().unique(),
  
  // Channel preferences
  pushEnabled: boolean('push_enabled').default(true),
  emailEnabled: boolean('email_enabled').default(true),
  smsEnabled: boolean('sms_enabled').default(false),
  whatsappEnabled: boolean('whatsapp_enabled').default(false),
  inAppEnabled: boolean('in_app_enabled').default(true),
  
  // Category preferences (JSON object with category -> enabled mapping)
  categoryPreferences: jsonb('category_preferences'),
  
  // Quiet hours
  quietHoursEnabled: boolean('quiet_hours_enabled').default(false),
  quietHoursStart: varchar('quiet_hours_start', { length: 10 }), // HH:MM format
  quietHoursEnd: varchar('quiet_hours_end', { length: 10 }),
  
  // Frequency settings
  digestEnabled: boolean('digest_enabled').default(false),
  digestFrequency: varchar('digest_frequency', { length: 20 }), // daily, weekly
  digestTime: varchar('digest_time', { length: 10 }), // HH:MM format
  
  // Language preference
  language: varchar('language', { length: 10 }).default('en'),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Push notification tokens
export const pushTokens = pgTable('push_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  
  // Token details
  token: text('token').notNull(),
  platform: varchar('platform', { length: 20 }).notNull(), // ios, android, web
  deviceId: varchar('device_id', { length: 255 }),
  deviceName: varchar('device_name', { length: 255 }),
  
  // Status
  isActive: boolean('is_active').default(true),
  lastUsed: timestamp('last_used'),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Notifications table
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  
  // Notification content
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  imageUrl: varchar('image_url', { length: 500 }),
  
  // Classification
  category: notificationCategoryEnum('category').notNull(),
  priority: notificationPriorityEnum('priority').notNull().default('normal'),
  
  // Delivery
  channel: notificationChannelEnum('channel').notNull(),
  status: notificationStatusEnum('status').notNull().default('pending'),
  
  // Action
  actionUrl: varchar('action_url', { length: 500 }), // Deep link or URL
  actionData: jsonb('action_data'), // Additional data for the action
  
  // Reference
  referenceType: varchar('reference_type', { length: 50 }), // loan, order, harvest, etc.
  referenceId: integer('reference_id'),
  
  // Scheduling
  scheduledFor: timestamp('scheduled_for'),
  expiresAt: timestamp('expires_at'),
  
  // Delivery tracking
  sentAt: timestamp('sent_at'),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),
  failureReason: text('failure_reason'),
  
  // Metadata
  metadata: jsonb('metadata'),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Price alerts
export const priceAlerts = pgTable('price_alerts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  
  // Alert configuration
  cropType: varchar('crop_type', { length: 100 }).notNull(),
  region: varchar('region', { length: 255 }),
  
  // Threshold
  alertType: varchar('alert_type', { length: 20 }).notNull(), // above, below, change
  thresholdPrice: integer('threshold_price').notNull(), // In cents
  percentageChange: integer('percentage_change'), // For change alerts
  
  // Status
  isActive: boolean('is_active').default(true),
  lastTriggered: timestamp('last_triggered'),
  triggerCount: integer('trigger_count').default(0),
  
  // Cooldown
  cooldownMinutes: integer('cooldown_minutes').default(60),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Weather alerts
export const weatherAlerts = pgTable('weather_alerts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  farmId: integer('farm_id'),
  
  // Alert details
  alertType: varchar('alert_type', { length: 50 }).notNull(), // rain, drought, frost, heat, storm, flood
  severity: varchar('severity', { length: 20 }).notNull(), // advisory, watch, warning, emergency
  
  // Location
  latitude: varchar('latitude', { length: 20 }),
  longitude: varchar('longitude', { length: 20 }),
  region: varchar('region', { length: 255 }),
  
  // Content
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  recommendation: text('recommendation'),
  
  // Timing
  validFrom: timestamp('valid_from').notNull(),
  validUntil: timestamp('valid_until'),
  
  // Source
  source: varchar('source', { length: 100 }), // weather_api, manual, government
  externalId: varchar('external_id', { length: 100 }),
  
  // Status
  isActive: boolean('is_active').default(true),
  acknowledgedAt: timestamp('acknowledged_at'),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Notification templates
export const notificationTemplates = pgTable('notification_templates', {
  id: serial('id').primaryKey(),
  
  // Template identification
  templateKey: varchar('template_key', { length: 100 }).notNull().unique(),
  category: notificationCategoryEnum('category').notNull(),
  
  // Content
  titleTemplate: varchar('title_template', { length: 255 }).notNull(),
  bodyTemplate: text('body_template').notNull(),
  
  // Channels
  supportedChannels: text('supported_channels'), // JSON array
  
  // Localization
  language: varchar('language', { length: 10 }).default('en'),
  
  // Status
  isActive: boolean('is_active').default(true),
  
  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
  }),
}));

export const pushTokensRelations = relations(pushTokens, ({ one }) => ({
  user: one(users, {
    fields: [pushTokens.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const priceAlertsRelations = relations(priceAlerts, ({ one }) => ({
  user: one(users, {
    fields: [priceAlerts.userId],
    references: [users.id],
  }),
}));

export const weatherAlertsRelations = relations(weatherAlerts, ({ one }) => ({
  user: one(users, {
    fields: [weatherAlerts.userId],
    references: [users.id],
  }),
}));

// Type exports
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
export type PushToken = typeof pushTokens.$inferSelect;
export type NewPushToken = typeof pushTokens.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type PriceAlert = typeof priceAlerts.$inferSelect;
export type NewPriceAlert = typeof priceAlerts.$inferInsert;
export type WeatherAlert = typeof weatherAlerts.$inferSelect;
export type NewWeatherAlert = typeof weatherAlerts.$inferInsert;
export type NotificationTemplate = typeof notificationTemplates.$inferSelect;
export type NewNotificationTemplate = typeof notificationTemplates.$inferInsert;
