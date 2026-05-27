import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { users } from "./drizzle/schema.js";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const DATABASE_URL = "postgresql://postgres@localhost:5432/farmer_data?sslmode=disable";

console.log("JWT_SECRET:", JWT_SECRET);
console.log("DATABASE_URL:", DATABASE_URL);

const db = drizzle(DATABASE_URL);

// Check user
const [user] = await db.select().from(users).where(eq(users.id, 2)).limit(1);
console.log("\nUser from DB:", user);

// Test token
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImVtYWlsIjoidGVzdEBmYXJtZXIuY29tIiwicm9sZSI6ImZhcm1lciIsImlhdCI6MTc2NDAwODk1NywiZXhwIjoxNzY0NjEzNzU3fQ.5xBkI44LuqZ2Lpej-RACygPFVxvkLaftf5KkNhlX3No";

try {
  const decoded = jwt.verify(token, JWT_SECRET);
  console.log("\nToken decoded:", decoded);
} catch (error) {
  console.error("\nToken verification failed:", error.message);
}

process.exit(0);
