import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { pgTable, serial, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";

const { Pool } = pg;

// Define users table schema
const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  role: varchar("role", { length: 50 }).default("farmer").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

async function testDrizzleError() {
  try {
    const pool = new Pool({
      connectionString: "postgresql://postgres:postgres@localhost:5432/farmer_data",
    });
    
    const db = drizzle(pool, { schema: { users } });
    
    console.log("Testing Drizzle query...");
    
    // This should work
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, "test@farmer.com"))
      .limit(1);
    
    console.log("Query successful, result:", result);
    console.log("Result type:", typeof result);
    console.log("Result is array:", Array.isArray(result));
    console.log("Result length:", result.length);
    
    if (result.length > 0) {
      console.log("User found:", result[0]);
    } else {
      console.log("No user found");
    }
    
    await pool.end();
  } catch (error) {
    console.error("Error occurred:");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Full error object:", JSON.stringify(error, null, 2));
    process.exit(1);
  }
}

testDrizzleError();
