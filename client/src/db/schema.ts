import { pgTable, serial, text, integer, decimal, timestamp, boolean, varchar } from "drizzle-orm/pg-core";

// Farmers table - stores farmer profile information
export const farmers = pgTable("farmers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  village: varchar("village", { length: 100 }),
  district: varchar("district", { length: 100 }),
  region: varchar("region", { length: 100 }),
  nationalId: varchar("national_id", { length: 50 }),
  registrationDate: timestamp("registration_date").defaultNow().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // Sync metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  clientId: varchar("client_id", { length: 100 }),
});

// Farms table - stores farm information
export const farms = pgTable("farms", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  farmerId: integer("farmer_id").notNull().references(() => farmers.id),
  farmName: varchar("farm_name", { length: 200 }).notNull(),
  farmSize: decimal("farm_size", { precision: 10, scale: 2 }),
  farmSizeUnit: varchar("farm_size_unit", { length: 20 }).default("acres"),
  location: text("location"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  soilType: varchar("soil_type", { length: 100 }),
  irrigationType: varchar("irrigation_type", { length: 100 }),
  // Sync metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  clientId: varchar("client_id", { length: 100 }),
});

// Crops table - stores crop cultivation records
export const crops = pgTable("crops", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  farmId: integer("farm_id").notNull().references(() => farms.id),
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
  userId: integer("user_id").notNull(),
  farmId: integer("farm_id").notNull().references(() => farms.id),
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
  userId: integer("user_id").notNull(),
  farmId: integer("farm_id").notNull().references(() => farms.id),
  cropId: integer("crop_id").references(() => crops.id),
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
  userId: integer("user_id").notNull(),
  cropId: integer("crop_id").notNull().references(() => crops.id),
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
  userId: integer("user_id").notNull(),
  farmId: integer("farm_id").notNull().references(() => farms.id),
  cropId: integer("crop_id").references(() => crops.id),
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

// Notifications table - stores user notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'harvest_due', 'expense_reminder', 'info', 'warning'
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  relatedId: integer("related_id"), // ID of related entity (crop, expense, etc.)
  relatedType: varchar("related_type", { length: 50 }), // 'crop', 'expense', 'harvest', etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Type exports
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
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
