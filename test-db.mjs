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

async function testDb() {
  try {
    const pool = new Pool({
      connectionString: "postgresql://postgres:postgres@localhost:5432/farmer_data",
    });
    
    const db = drizzle(pool, { schema: { users } });
    
    console.log("Testing database connection...");
    
    // Test 1: Check if user exists
    console.log("\n1. Checking if test@farmer.com exists...");
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, "test@farmer.com"))
      .limit(1);
    
    console.log("Existing user query result:", existingUser);
    
    // Test 2: Try to insert a user
    if (existingUser.length === 0) {
      console.log("\n2. Inserting test user...");
      const newUser = await db
        .insert(users)
        .values({
          email: "test@farmer.com",
          password: "$2a$10$test",
          firstName: "Test",
          lastName: "Farmer",
          role: "farmer",
          isActive: true,
        })
        .returning();
      
      console.log("Inserted user:", newUser);
    } else {
      console.log("\n2. User already exists, skipping insert");
    }
    
    await pool.end();
    console.log("\nTest completed successfully!");
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

testDb();
