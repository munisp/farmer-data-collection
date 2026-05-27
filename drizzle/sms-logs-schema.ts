import { pgTable, serial, integer, varchar, text, timestamp, decimal } from "drizzle-orm/pg-core";
import { users } from "./schema";
import { loans } from "./financial-schema";

export const smsDeliveryLogs = pgTable("sms_delivery_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  loanId: integer("loan_id").references(() => loans.id),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  messageType: varchar("message_type", { length: 50 }).notNull(), // 'payment_reminder', 'loan_approval', 'disbursement', 'overdue_alert'
  messageContent: text("message_content").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // 'pending', 'sent', 'delivered', 'failed'
  providerMessageId: varchar("provider_message_id", { length: 255 }),
  providerStatus: varchar("provider_status", { length: 50 }),
  errorMessage: text("error_message"),
  costAmount: decimal("cost_amount", { precision: 10, scale: 4 }),
  costCurrency: varchar("cost_currency", { length: 3 }).default("NGN"),
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
