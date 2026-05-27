import { pgTable, serial, integer, varchar, boolean, timestamp, text } from "drizzle-orm/pg-core";

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
