import { pgTable, serial, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./schema";

/**
 * User Notification Preferences
 * Stores user preferences for SMS notifications
 */
export const userNotificationPreferences = pgTable("user_notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  // SMS Notification Preferences
  smsEnabled: boolean("sms_enabled").notNull().default(true),
  paymentReminders: boolean("payment_reminders").notNull().default(true),
  loanApprovalNotifications: boolean("loan_approval_notifications").notNull().default(true),
  loanDisbursementNotifications: boolean("loan_disbursement_notifications").notNull().default(true),
  overdueNotifications: boolean("overdue_notifications").notNull().default(true),
  marketingMessages: boolean("marketing_messages").notNull().default(false),
  
  // Reminder Timing Preferences
  reminderDaysBefore: integer("reminder_days_before").notNull().default(3), // Days before due date
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_notification_preferences_user_id_idx").on(table.userId),
}));
