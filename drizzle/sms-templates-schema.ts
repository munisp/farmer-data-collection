import { pgTable, serial, text, timestamp, boolean, varchar, integer } from "drizzle-orm/pg-core";

/**
 * SMS Templates Schema
 * 
 * Stores reusable SMS message templates with variable substitution support.
 * Templates can be used for payment reminders, loan notifications, and custom messages.
 */

export const smsTemplates = pgTable("sms_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // Template name for identification
  type: varchar("type", { length: 50 }).notNull(), // payment_reminder, loan_approval, loan_rejection, disbursement, overdue, custom
  subject: varchar("subject", { length: 200 }), // Optional subject/title
  body: text("body").notNull(), // Template body with {{variables}}
  variables: text("variables").notNull(), // JSON array of available variables: ["borrowerName", "amount", "dueDate", etc.]
  description: text("description"), // Description of when to use this template
  isActive: boolean("is_active").default(true).notNull(), // Whether template is active
  isDefault: boolean("is_default").default(false).notNull(), // Whether this is the default template for this type
  usageCount: integer("usage_count").default(0).notNull(), // Track how many times used
  createdBy: integer("created_by").notNull(), // User ID who created the template
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const smsScheduledMessages = pgTable("sms_scheduled_messages", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => smsTemplates.id), // Optional: use template
  recipientPhone: varchar("recipient_phone", { length: 20 }).notNull(), // E.164 format
  recipientName: varchar("recipient_name", { length: 200 }), // Optional recipient name
  message: text("message").notNull(), // Final message after variable substitution
  scheduledFor: timestamp("scheduled_for").notNull(), // When to send
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, sent, failed, cancelled
  sentAt: timestamp("sent_at"), // Actual send time
  deliveryStatus: varchar("delivery_status", { length: 20 }), // delivered, failed, unknown
  messageId: varchar("message_id", { length: 100 }), // Africa's Talking message ID
  errorMessage: text("error_message"), // Error details if failed
  cost: integer("cost").default(0), // Cost in cents
  metadata: text("metadata"), // JSON: {loanId, userId, etc.}
  createdBy: integer("created_by").notNull(), // User ID who scheduled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SmsTemplate = typeof smsTemplates.$inferSelect;
export type InsertSmsTemplate = typeof smsTemplates.$inferInsert;
export type SmsScheduledMessage = typeof smsScheduledMessages.$inferSelect;
export type InsertSmsScheduledMessage = typeof smsScheduledMessages.$inferInsert;
