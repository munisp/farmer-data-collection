import { pgTable, serial, integer, varchar, text, decimal, timestamp, boolean, date, json, index, uniqueIndex } from "drizzle-orm/pg-core";

// Note: Precision agriculture features are integrated into the main schema
// user-journey-schema and agricultural-intelligence-schema are imported separately
// to avoid circular dependency issues during drizzle-kit operations

// USSD Sessions table - stores USSD session state for feature phone users
export const ussdSessions = pgTable("ussd_sessions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 100 }).notNull().unique(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  step: varchar("step", { length: 50 }).notNull(),
  data: text("data").notNull(), // JSON string
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Users table for authentication - MUST be defined first for foreign key references
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(), // hashed password
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  phoneNumber: varchar("phone_number", { length: 20 }),
  role: varchar("role", { length: 50 }).default("farmer").notNull(), // farmer, admin, etc.
  isActive: boolean("is_active").default(true).notNull(),
  language: varchar("language", { length: 20 }).default("english"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Farmers table - stores farmer profile information
export const farmers = pgTable("farmers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  village: varchar("village", { length: 100 }),
  district: varchar("district", { length: 100 }),
  region: varchar("region", { length: 100 }),
  nationalId: varchar("national_id", { length: 50 }),
  photoUrl: varchar("photo_url", { length: 500 }),
  registrationDate: timestamp("registration_date").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  verificationStatus: varchar("verification_status", { length: 20 }).default("pending").notNull(), // pending, verified, rejected
  verifiedBy: integer("verified_by").references(() => users.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at"),
  verificationNotes: text("verification_notes"),
  // Sync metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  clientId: varchar("client_id", { length: 100 }),
});

// Farms table - stores farm information
export const farms = pgTable("farms", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  farmerId: integer("farmer_id").notNull().references(() => farmers.id, { onDelete: "cascade" }),
  farmName: varchar("farm_name", { length: 200 }).notNull(),
  farmSize: decimal("farm_size", { precision: 10, scale: 2 }),
  farmSizeUnit: varchar("farm_size_unit", { length: 20 }).default("acres"),
  location: text("location"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  soilType: varchar("soil_type", { length: 100 }),
  irrigationType: varchar("irrigation_type", { length: 100 }),
  boundary: text("boundary"), // GeoJSON polygon coordinates
  // Sync metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  clientId: varchar("client_id", { length: 100 }),
});

// Crops table - stores crop cultivation records
export const crops = pgTable("crops", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  farmId: integer("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),
  cropName: varchar("crop_name", { length: 100 }).notNull(),
  cropVariety: varchar("crop_variety", { length: 100 }),
  plantingDate: timestamp("planting_date").notNull(),
  expectedHarvestDate: timestamp("expected_harvest_date"),
  actualHarvestDate: timestamp("actual_harvest_date"),
  areaPlanted: decimal("area_planted", { precision: 10, scale: 2 }),
  areaUnit: varchar("area_unit", { length: 20 }).default("acres"),
  season: varchar("season", { length: 50 }),
  status: varchar("status", { length: 50 }).default("planted"),
  pricePerUnit: integer("price_per_unit").default(1000), // Price in cents (e.g., 1000 = $10.00)
  notes: text("notes"),
  // Sync metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  clientId: varchar("client_id", { length: 100 }),
});

// Livestock table - stores livestock records
export const livestock = pgTable("livestock", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  farmId: integer("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),
  animalType: varchar("animal_type", { length: 100 }).notNull(),
  breed: varchar("breed", { length: 100 }),
  quantity: integer("quantity").notNull(),
  purpose: varchar("purpose", { length: 100 }),
  acquisitionDate: timestamp("acquisition_date").notNull(),
  acquisitionCost: integer("acquisition_cost"),
  currentValue: integer("current_value"),
  healthStatus: varchar("health_status", { length: 50 }).default("healthy"),
  notes: text("notes"),
  // Sync metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  clientId: varchar("client_id", { length: 100 }),
});

// Farm Inputs table - stores seeds, fertilizers, pesticides, etc.
export const farmInputs = pgTable("farm_inputs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  farmId: integer("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),
  cropId: integer("crop_id").references(() => crops.id, { onDelete: "set null" }),
  inputType: varchar("input_type", { length: 50 }).notNull(),
  inputName: varchar("input_name", { length: 200 }).notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  costPerUnit: integer("cost_per_unit"),
  totalCost: integer("total_cost"),
  supplier: varchar("supplier", { length: 200 }),
  purchaseDate: timestamp("purchase_date").notNull(),
  applicationDate: timestamp("application_date"),
  notes: text("notes"),
  // Sync metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  clientId: varchar("client_id", { length: 100 }),
});

// Harvest Records table - stores harvest data
export const harvests = pgTable("harvests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cropId: integer("crop_id").notNull().references(() => crops.id, { onDelete: "cascade" }),
  harvestDate: timestamp("harvest_date").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  quality: varchar("quality", { length: 50 }),
  storageLocation: varchar("storage_location", { length: 200 }),
  marketPrice: integer("market_price"),
  soldQuantity: decimal("sold_quantity", { precision: 10, scale: 2 }),
  revenue: integer("revenue"),
  notes: text("notes"),
  // Sync metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  clientId: varchar("client_id", { length: 100 }),
});

// Expenses table - stores farm expenses
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  farmId: integer("farm_id").notNull().references(() => farms.id, { onDelete: "cascade" }),
  cropId: integer("crop_id").references(() => crops.id, { onDelete: "set null" }),
  category: varchar("category", { length: 100 }).notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  expenseDate: timestamp("expense_date").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }),
  receipt: varchar("receipt", { length: 500 }),
  notes: text("notes"),
  // Sync metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  clientId: varchar("client_id", { length: 100 }),
});

// Audit Logs table - stores all events for compliance and debugging
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  eventId: varchar("event_id", { length: 255 }).notNull().unique(),
  eventType: varchar("event_type", { length: 50 }).notNull(), // CREATED, UPDATED, DELETED, LOGIN, etc.
  entityType: varchar("entity_type", { length: 50 }).notNull(), // farmer, farm, crop, user, etc.
  entityId: varchar("entity_id", { length: 255 }).notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp").notNull(),
  data: json("data"), // Event payload
  metadata: json("metadata"), // Additional context
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("audit_logs_user_id_idx").on(table.userId),
  entityIdx: index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  timestampIdx: index("audit_logs_timestamp_idx").on(table.timestamp),
  eventTypeIdx: index("audit_logs_event_type_idx").on(table.eventType),
}));

// Processed Events table - tracks processed webhook/event IDs for idempotency
// Prevents duplicate processing of the same event (e.g., delivery reports, ERPNext webhooks)
export const processedEvents = pgTable("processed_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'delivery_report', 'erpnext_webhook', 'sms_inbound', etc.
  externalId: varchar("external_id", { length: 255 }).notNull(), // External message/event ID
  source: varchar("source", { length: 50 }).notNull(), // 'africas_talking', 'erpnext', etc.
  processedAt: timestamp("processed_at").defaultNow().notNull(),
  correlationId: varchar("correlation_id", { length: 100 }), // For request tracing
  metadata: json("metadata"), // Additional context about the event
}, (table) => ({
  // Unique constraint on event type + external ID + source to prevent duplicates
  uniqueEventIdx: uniqueIndex("processed_events_unique_idx").on(table.eventType, table.externalId, table.source),
  // Index for cleanup queries (delete old processed events)
  processedAtIdx: index("processed_events_processed_at_idx").on(table.processedAt),
}));

// Account Balances table - tracks financial account balances
export const accountBalances = pgTable("account_balances", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountType: varchar("account_type", { length: 50 }).notNull(), // cash, bank, revenue, expense
  accountName: varchar("account_name", { length: 200 }).notNull(),
  balance: integer("balance").default(0).notNull(), // in cents
  currency: varchar("currency", { length: 3 }).default("USD").notNull(),
  lastTransactionDate: timestamp("last_transaction_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userAccountIdx: index("account_balances_user_account_idx").on(table.userId, table.accountType),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Farmer = typeof farmers.$inferSelect;
export type InsertFarmer = typeof farmers.$inferInsert;
export type Farm = typeof farms.$inferSelect;
export type InsertFarm = typeof farms.$inferInsert;
export type Crop = typeof crops.$inferSelect;
export type InsertCrop = typeof crops.$inferInsert;
export type Livestock = typeof livestock.$inferSelect;
export type InsertLivestock = typeof livestock.$inferInsert;
export type FarmInput = typeof farmInputs.$inferSelect;
export type InsertFarmInput = typeof farmInputs.$inferInsert;
export type Harvest = typeof harvests.$inferSelect;
export type InsertHarvest = typeof harvests.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type AccountBalance = typeof accountBalances.$inferSelect;
export type InsertAccountBalance = typeof accountBalances.$inferInsert;

// Export Schedules table - stores scheduled export configurations
export const exportSchedules = pgTable("export_schedules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  dataType: varchar("data_type", { length: 50 }).notNull(), // 'crops', 'expenses', 'harvests', 'financial'
  format: varchar("format", { length: 10 }).notNull().default("csv"), // 'csv' or 'json'
  frequency: varchar("frequency", { length: 20 }).notNull(), // 'daily', 'weekly', 'monthly'
  email: varchar("email", { length: 255 }).notNull(),
  enabled: boolean("enabled").default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ExportSchedule = typeof exportSchedules.$inferSelect;
export type InsertExportSchedule = typeof exportSchedules.$inferInsert;

// ============================================================================
// MARKETPLACE TABLES
// ============================================================================

// Produce Listings - Farmers list their produce for sale
export const produceListings = pgTable("produce_listings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  farmId: integer("farm_id").references(() => farms.id, { onDelete: "set null" }),
  cropId: integer("crop_id").references(() => crops.id, { onDelete: "set null" }),
  
  // Product Information
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(),
  
  // Quantity and Pricing
  quantity: integer("quantity").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  pricePerUnit: integer("price_per_unit").notNull(),
  totalPrice: integer("total_price").notNull(),
  
  // Certifications
  organic: boolean("organic").default(false),
  certification: varchar("certification", { length: 100 }),
  
  // Availability
  availableFrom: timestamp("available_from"),
  availableUntil: timestamp("available_until"),
  
  // Delivery Options
  deliveryOptions: text("delivery_options").$type<{ pickup: boolean; delivery: boolean; shipping: boolean }>(),
  
  // Location
  location: text("location").$type<{ lat?: number; lng?: number; address?: string; city?: string; state?: string; zip?: string }>(),
  
  // Media
  photos: text("photos").$type<string[]>(),
  
  // Status and Metrics
  status: varchar("status", { length: 20 }).default("active").notNull(),
  views: integer("views").default(0),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Marketplace Orders - Buyer orders from sellers
export const marketplaceOrders = pgTable("marketplace_orders", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sellerId: integer("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Order Information
  orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
  totalAmount: integer("total_amount").notNull(),
  
  // Status
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  paymentStatus: varchar("payment_status", { length: 20 }).default("pending").notNull(),
  
  // Payment
  paymentMethod: varchar("payment_method", { length: 50 }),
  paymentIntentId: varchar("payment_intent_id", { length: 100 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  stripeSessionId: varchar("stripe_session_id", { length: 255 }),
  paidAt: timestamp("paid_at"),
  
  // Delivery
  deliveryMethod: varchar("delivery_method", { length: 50 }),
  deliveryAddress: text("delivery_address").$type<{ street: string; city: string; state: string; zip: string; country: string }>(),
  deliveryDate: timestamp("delivery_date"),
  deliveryNotes: text("delivery_notes"),
  trackingNumber: varchar("tracking_number", { length: 100 }),
  
  // Communication
  notes: text("notes"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at"),
  deliveredAt: timestamp("delivered_at"),
});

// Order Items - Line items for each order
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => marketplaceOrders.id, { onDelete: "cascade" }),
  listingId: integer("listing_id").notNull().references(() => produceListings.id, { onDelete: "restrict" }),
  
  // Snapshot at time of order
  quantity: integer("quantity").notNull(),
  pricePerUnit: integer("price_per_unit").notNull(),
  totalPrice: integer("total_price").notNull(),
  
  // Product snapshot
  productTitle: varchar("product_title", { length: 200 }).notNull(),
  productUnit: varchar("product_unit", { length: 20 }).notNull(),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Buyer Profiles - Additional information for buyers
export const buyerProfiles = pgTable("buyer_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  
  // Business Information
  businessName: varchar("business_name", { length: 200 }),
  businessType: varchar("business_type", { length: 50 }),
  phone: varchar("phone", { length: 20 }),
  
  // Delivery Addresses
  deliveryAddresses: text("delivery_addresses").$type<Array<{ street: string; city: string; state: string; zip: string; country: string; label?: string }>>(),
  defaultDeliveryAddressIndex: integer("default_delivery_address_index").default(0),
  
  // Preferences
  preferences: text("preferences").$type<{ organicOnly?: boolean; deliveryOnly?: boolean; maxDistance?: number }>(),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Marketplace Reviews - Ratings and feedback
export const marketplaceReviews = pgTable("marketplace_reviews", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => marketplaceOrders.id, { onDelete: "cascade" }),
  reviewerId: integer("reviewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  revieweeId: integer("reviewee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Review Content
  rating: integer("rating").notNull(),
  comment: text("comment"),
  
  // Review Type
  reviewType: varchar("review_type", { length: 20 }),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shopping Cart Items - Temporary cart storage
export const shoppingCartItems = pgTable("shopping_cart_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  listingId: integer("listing_id").notNull().references(() => produceListings.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Marketplace Messages - Buyer-seller communication
export const marketplaceMessages = pgTable("marketplace_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  recipientId: integer("recipient_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  listingId: integer("listing_id").references(() => produceListings.id, { onDelete: "set null" }),
  orderId: integer("order_id").references(() => marketplaceOrders.id, { onDelete: "set null" }),
  
  // Message Content
  subject: varchar("subject", { length: 200 }),
  message: text("message").notNull(),
  
  // Status
  read: boolean("read").default(false),
  readAt: timestamp("read_at"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Type exports for marketplace tables
export type ProduceListing = typeof produceListings.$inferSelect;
export type InsertProduceListing = typeof produceListings.$inferInsert;
export type MarketplaceOrder = typeof marketplaceOrders.$inferSelect;
export type InsertMarketplaceOrder = typeof marketplaceOrders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;
export type BuyerProfile = typeof buyerProfiles.$inferSelect;
export type InsertBuyerProfile = typeof buyerProfiles.$inferInsert;
export type MarketplaceReview = typeof marketplaceReviews.$inferSelect;
export type InsertMarketplaceReview = typeof marketplaceReviews.$inferInsert;
export type ShoppingCartItem = typeof shoppingCartItems.$inferSelect;
export type InsertShoppingCartItem = typeof shoppingCartItems.$inferInsert;
export type MarketplaceMessage = typeof marketplaceMessages.$inferSelect;
export type InsertMarketplaceMessage = typeof marketplaceMessages.$inferInsert;

// ============================================================================
// MESSAGING CHANNELS (USSD, SMS, WhatsApp)
// ============================================================================

// Messaging Sessions - Tracks active USSD/SMS/WhatsApp sessions
export const messagingSessions = pgTable("messaging_sessions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 255 }).notNull().unique(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  channel: varchar("channel", { length: 20 }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  state: varchar("state", { length: 100 }).notNull().default("start"),
  context: json("context").default({}),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Message Logs - Logs all inbound and outbound messages
export const messageLogs = pgTable("message_logs", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 255 }),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  channel: varchar("channel", { length: 20 }).notNull(),
  direction: varchar("direction", { length: 10 }).notNull(),
  messageText: text("message_text"),
  messageData: json("message_data"),
  status: varchar("status", { length: 50 }).default("sent"),
  responseTimeMs: integer("response_time_ms"), // Time to process/respond in milliseconds
  externalMessageId: varchar("external_message_id", { length: 255 }), // External provider message ID
  errorCode: varchar("error_code", { length: 50 }),
  errorMessage: text("error_message"),
  networkCode: varchar("network_code", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Phone User Mapping - Maps phone numbers to user accounts
export const phoneUserMapping = pgTable("phone_user_mapping", {
  id: serial("id").primaryKey(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull().unique(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  verified: boolean("verified").default(false),
  verificationCode: varchar("verification_code", { length: 10 }),
  verificationExpiresAt: timestamp("verification_expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Notification Queue - Queue for sending SMS/WhatsApp notifications
export const notificationQueue = pgTable("notification_queue", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  channel: varchar("channel", { length: 20 }).notNull(),
  notificationType: varchar("notification_type", { length: 50 }).notNull(),
  messageText: text("message_text").notNull(),
  messageData: json("message_data"),
  status: varchar("status", { length: 50 }).default("pending"),
  attempts: integer("attempts").default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  scheduledAt: timestamp("scheduled_at").notNull().defaultNow(),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Type exports for messaging channels
export type MessagingSession = typeof messagingSessions.$inferSelect;
export type InsertMessagingSession = typeof messagingSessions.$inferInsert;
export type MessageLog = typeof messageLogs.$inferSelect;
export type InsertMessageLog = typeof messageLogs.$inferInsert;
export type PhoneUserMapping = typeof phoneUserMapping.$inferSelect;
export type InsertPhoneUserMapping = typeof phoneUserMapping.$inferInsert;
export type NotificationQueue = typeof notificationQueue.$inferSelect;
export type InsertNotificationQueue = typeof notificationQueue.$inferInsert;

// Product Reviews - Customer reviews for produce listings
export const productReviews = pgTable("product_reviews", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => produceListings.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => marketplaceOrders.id, { onDelete: "set null" }),
  
  // Review Content
  rating: integer("rating").notNull(), // 1-5 stars
  title: varchar("title", { length: 200 }),
  comment: text("comment"),
  photos: text("photos"), // Comma-separated photo URLs
  
  // Verification
  verifiedPurchase: boolean("verified_purchase").default(false),
  
  // Moderation
  status: varchar("status", { length: 20 }).default("published"), // published, hidden, flagged
  
  // Helpfulness voting
  helpfulCount: integer("helpful_count").default(0),
  unhelpfulCount: integer("unhelpful_count").default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Review Votes - Track who voted reviews as helpful/unhelpful
export const reviewVotes = pgTable("review_votes", {
  id: serial("id").primaryKey(),
  reviewId: integer("review_id").notNull().references(() => productReviews.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  voteType: varchar("vote_type", { length: 20 }).notNull(), // helpful, unhelpful
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Seller Ratings - Aggregate ratings for sellers
export const sellerRatings = pgTable("seller_ratings", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  
  // Rating Metrics
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }).default("0"),
  totalReviews: integer("total_reviews").default(0),
  fiveStarCount: integer("five_star_count").default(0),
  fourStarCount: integer("four_star_count").default(0),
  threeStarCount: integer("three_star_count").default(0),
  twoStarCount: integer("two_star_count").default(0),
  oneStarCount: integer("one_star_count").default(0),
  
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Review Responses - Seller responses to reviews
export const reviewResponses = pgTable("review_responses", {
  id: serial("id").primaryKey(),
  reviewId: integer("review_id").notNull().references(() => productReviews.id, { onDelete: "cascade" }),
  sellerId: integer("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // Response Content
  response: text("response").notNull(),
  
  // Moderation
  status: varchar("status", { length: 20 }).default("published"), // published, hidden
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Type exports for reviews
export type ProductReview = typeof productReviews.$inferSelect;
export type InsertProductReview = typeof productReviews.$inferInsert;
export type ReviewVote = typeof reviewVotes.$inferSelect;
export type InsertReviewVote = typeof reviewVotes.$inferInsert;
export type ReviewResponse = typeof reviewResponses.$inferSelect;
export type InsertReviewResponse = typeof reviewResponses.$inferInsert;
export type SellerRating = typeof sellerRatings.$inferSelect;
export type InsertSellerRating = typeof sellerRatings.$inferInsert;

// ============================================================================
// Alert Thresholds & History
// ============================================================================

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

// Type exports for alerts
export type AlertThreshold = typeof alertThresholds.$inferSelect;
export type InsertAlertThreshold = typeof alertThresholds.$inferInsert;
export type AlertHistory = typeof alertHistory.$inferSelect;
export type InsertAlertHistory = typeof alertHistory.$inferInsert;

// ============================================================================
// Crop Analysis (AI-powered disease detection)
// ============================================================================

/**
 * Crop Analyses Table
 * Stores AI-powered crop health analysis results
 */
export const cropAnalyses = pgTable("crop_analyses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  farmId: integer("farm_id").references(() => farms.id, { onDelete: "set null" }),
  
  // Image data
  imageUrl: text("image_url").notNull(),
  
  // Analysis results
  cropType: varchar("crop_type", { length: 100 }).notNull(),
  healthStatus: varchar("health_status", { length: 50 }).notNull(), // healthy, diseased, pest_infestation, nutrient_deficiency, unknown
  confidence: integer("confidence").notNull(), // 0-100
  
  // Detailed results stored as JSON
  diseases: json("diseases").default([]), // Array of disease identifications
  pests: json("pests").default([]), // Array of pest identifications
  nutrientDeficiencies: json("nutrient_deficiencies").default([]), // Array of nutrient deficiencies
  recommendations: json("recommendations").default([]), // Array of recommendations
  overallAssessment: text("overall_assessment"),
  
  // Metadata
  analysisProvider: varchar("analysis_provider", { length: 50 }).default("openai"), // openai, google, custom
  processingTimeMs: integer("processing_time_ms"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Type exports for crop analyses
export type CropAnalysis = typeof cropAnalyses.$inferSelect;
export type InsertCropAnalysis = typeof cropAnalyses.$inferInsert;

// Export financial schema
export * from './financial-schema';

// Export SMS templates schema
export * from './sms-templates-schema';
export * from './sms-responses-schema';

// Export supply chain & delivery schema
export * from './supply-chain-schema';

// Export subsidy & extension worker schema
export * from './schema-subsidy';
