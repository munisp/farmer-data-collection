import { pgTable, serial, text, timestamp, varchar, integer } from "drizzle-orm/pg-core";

/**
 * SMS Responses Schema
 * 
 * Stores incoming SMS responses from borrowers for two-way communication.
 * Supports response classification, auto-replies, and admin review.
 */

export const smsResponses = pgTable("sms_responses", {
  id: serial("id").primaryKey(),
  fromPhone: varchar("from_phone", { length: 20 }).notNull(), // Sender's phone number (E.164 format)
  toPhone: varchar("to_phone", { length: 20 }).notNull(), // Our shortcode/number
  message: text("message").notNull(), // The incoming message content
  messageId: varchar("message_id", { length: 100 }), // Africa's Talking message ID
  
  // Classification
  category: varchar("category", { length: 50 }), // payment_confirmation, query, complaint, acknowledgment, other
  sentiment: varchar("sentiment", { length: 20 }), // positive, negative, neutral
  isProcessed: varchar("is_processed", { length: 20 }).default("pending").notNull(), // pending, processed, requires_attention
  
  // Related entities
  userId: integer("user_id"), // Matched user ID (if found)
  loanId: integer("loan_id"), // Related loan ID (if identified)
  originalMessageId: varchar("original_message_id", { length: 100 }), // ID of message they're responding to
  
  // Auto-reply
  autoReplyMessage: text("auto_reply_message"), // Auto-reply sent (if any)
  autoReplySentAt: timestamp("auto_reply_sent_at"), // When auto-reply was sent
  
  // Admin handling
  assignedTo: integer("assigned_to"), // Admin user ID assigned to handle this
  notes: text("notes"), // Admin notes about the response
  resolvedAt: timestamp("resolved_at"), // When marked as resolved
  resolvedBy: integer("resolved_by"), // Admin who resolved it
  
  // Metadata
  metadata: text("metadata"), // JSON: {keywords, confidence, etc.}
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SmsResponse = typeof smsResponses.$inferSelect;
export type InsertSmsResponse = typeof smsResponses.$inferInsert;
