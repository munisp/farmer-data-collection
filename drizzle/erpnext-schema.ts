import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * ERPNext Integration Schema
 * 
 * Tables for managing ERPNext integration, sync mappings, and logs
 */

// ERPNext configuration table
export const erpnextConfig = pgTable("erpnext_config", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  erpnextUrl: text("erpnext_url").notNull(),
  apiKey: text("api_key").notNull(), // Should be encrypted
  apiSecret: text("api_secret").notNull(), // Should be encrypted
  syncEnabled: boolean("sync_enabled").default(true).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Entity type sync configuration
export const erpnextSyncConfig = pgTable("erpnext_sync_config", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  entityType: text("entity_type").notNull(), // customer, supplier, item, invoice, payment, journal
  syncEnabled: boolean("sync_enabled").default(true).notNull(),
  syncDirection: text("sync_direction").default("both").notNull(), // push, pull, both
  conflictResolution: text("conflict_resolution").default("erpnext_wins").notNull(), // erpnext_wins, platform_wins, manual
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Mapping between platform entities and ERPNext entities
export const erpnextSyncMapping = pgTable("erpnext_sync_mapping", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  entityType: text("entity_type").notNull(),
  platformId: integer("platform_id").notNull(),
  erpnextId: text("erpnext_id").notNull(), // ERPNext docname
  erpnextDoctype: text("erpnext_doctype").notNull(),
  syncEnabled: boolean("sync_enabled").default(true).notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  version: integer("version").default(1).notNull(), // For conflict detection
  metadata: jsonb("metadata"), // Additional mapping data
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Sync operation log
export const erpnextSyncLog = pgTable("erpnext_sync_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  operation: text("operation").notNull(), // push, pull, sync, delete
  entityType: text("entity_type").notNull(),
  platformId: integer("platform_id"),
  erpnextId: text("erpnext_id"),
  status: text("status").notNull(), // success, error, pending, retrying
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
  requestData: jsonb("request_data"),
  responseData: jsonb("response_data"),
  retryCount: integer("retry_count").default(0).notNull(),
  duration: integer("duration"), // milliseconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sync queue for async processing
export const erpnextSyncQueue = pgTable("erpnext_sync_queue", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  operation: text("operation").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"), // Platform entity ID
  platformId: integer("platform_id"),
  erpnextId: text("erpnext_id"),
  syncDirection: text("sync_direction").default("push").notNull(), // push, pull, both
  priority: integer("priority").default(5).notNull(), // 1-10, higher = more urgent
  status: text("status").default("pending").notNull(), // pending, processing, completed, failed
  payload: jsonb("payload").notNull(),
  scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
  scheduledAt: timestamp("scheduled_at"),
  processedAt: timestamp("processed_at"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Orders table for ERPNext sales invoice sync
export const erpnextOrders = pgTable("erpnext_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  farmerId: integer("farmer_id"), // Reference to farmer
  cooperativeId: integer("cooperative_id"), // Reference to cooperative
  orderNumber: text("order_number").notNull(),
  orderDate: timestamp("order_date").notNull(),
  dueDate: timestamp("due_date"),
  status: text("status").default("draft").notNull(), // draft, submitted, paid, cancelled
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),
  currency: text("currency").default("KES").notNull(),
  exchangeRate: integer("exchange_rate").default(1),
  subtotal: integer("subtotal").notNull(), // In cents
  taxAmount: integer("tax_amount").default(0),
  discountAmount: integer("discount_amount").default(0),
  shippingAmount: integer("shipping_amount").default(0),
  totalAmount: integer("total_amount").notNull(), // In cents
  paidAmount: integer("paid_amount").default(0),
  outstandingAmount: integer("outstanding_amount"),
  notes: text("notes"),
  termsAndConditions: text("terms_and_conditions"),
  erpnextId: text("erpnext_id"), // ERPNext Sales Invoice name
  erpnextSynced: boolean("erpnext_synced").default(false),
  erpnextSyncedAt: timestamp("erpnext_synced_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Order line items
export const erpnextOrderItems = pgTable("erpnext_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  itemCode: text("item_code").notNull(),
  itemName: text("item_name").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull(),
  uom: text("uom").default("Nos").notNull(), // Unit of measure
  rate: integer("rate").notNull(), // Price per unit in cents
  amount: integer("amount").notNull(), // quantity * rate in cents
  discountPercent: integer("discount_percent").default(0),
  discountAmount: integer("discount_amount").default(0),
  taxRate: integer("tax_rate").default(0),
  taxAmount: integer("tax_amount").default(0),
  netAmount: integer("net_amount").notNull(), // Final amount after discounts and tax
  warehouseId: text("warehouse_id"),
  batchNo: text("batch_no"),
  serialNo: text("serial_no"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Payments table for ERPNext payment entry sync
export const erpnextPayments = pgTable("erpnext_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  orderId: integer("order_id"), // Reference to order
  farmerId: integer("farmer_id"), // Reference to farmer
  paymentNumber: text("payment_number").notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  paymentType: text("payment_type").notNull(), // receive, pay, internal_transfer
  partyType: text("party_type").notNull(), // Customer, Supplier, Employee
  partyName: text("party_name").notNull(),
  partyEmail: text("party_email"),
  partyPhone: text("party_phone"),
  modeOfPayment: text("mode_of_payment").notNull(), // Cash, Bank Transfer, Mobile Money, etc.
  currency: text("currency").default("KES").notNull(),
  exchangeRate: integer("exchange_rate").default(1),
  paidAmount: integer("paid_amount").notNull(), // In cents
  receivedAmount: integer("received_amount"), // In cents (for currency conversion)
  referenceNo: text("reference_no"), // Bank reference, M-Pesa code, etc.
  referenceDate: timestamp("reference_date"),
  bankAccount: text("bank_account"),
  status: text("status").default("draft").notNull(), // draft, submitted, cancelled
  remarks: text("remarks"),
  erpnextId: text("erpnext_id"), // ERPNext Payment Entry name
  erpnextSynced: boolean("erpnext_synced").default(false),
  erpnextSyncedAt: timestamp("erpnext_synced_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Payment references (links payments to invoices)
export const erpnextPaymentReferences = pgTable("erpnext_payment_references", {
  id: serial("id").primaryKey(),
  paymentId: integer("payment_id").notNull(),
  referenceDoctype: text("reference_doctype").notNull(), // Sales Invoice, Purchase Invoice
  referenceName: text("reference_name").notNull(), // Invoice number
  totalAmount: integer("total_amount").notNull(), // Invoice total in cents
  outstandingAmount: integer("outstanding_amount").notNull(), // Before payment
  allocatedAmount: integer("allocated_amount").notNull(), // Amount allocated from this payment
  exchangeRate: integer("exchange_rate").default(1),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Conflict resolution table (for manual resolution)
export const erpnextSyncConflicts = pgTable("erpnext_sync_conflicts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  entityType: text("entity_type").notNull(),
  platformId: integer("platform_id").notNull(),
  erpnextId: text("erpnext_id").notNull(),
  platformData: jsonb("platform_data").notNull(),
  erpnextData: jsonb("erpnext_data").notNull(),
  platformVersion: integer("platform_version").notNull(),
  erpnextVersion: integer("erpnext_version").notNull(),
  platformModifiedAt: timestamp("platform_modified_at").notNull(),
  erpnextModifiedAt: timestamp("erpnext_modified_at").notNull(),
  status: text("status").default("pending").notNull(), // pending, resolved, ignored
  resolution: text("resolution"), // use_platform, use_erpnext, manual_merge
  resolvedBy: integer("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  resolvedData: jsonb("resolved_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
