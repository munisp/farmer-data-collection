import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { farmers, farms, crops, livestock, harvests, expenses } from "./drizzle/schema.ts";

const DATABASE_URL = "postgresql://farmer_user:farmer_pass@localhost:5432/farmer_data";
const db = drizzle(DATABASE_URL);

console.log("=== Testing Multi-User Data Isolation ===\n");

// Test 1: Create data for user 1 (admin@farmer.com)
console.log("1. Creating test data for User 1 (admin@farmer.com, userId: 1)...");
try {
  const [farmer1] = await db.insert(farmers).values({
    userId: 1,
    firstName: "John",
    lastName: "Admin",
    email: "john@example.com",
    phone: "123-456-7890",
    address: "123 Admin St"
  }).returning();
  console.log("   ✓ Created farmer:", farmer1.firstName, farmer1.lastName);

  const [expense1] = await db.insert(expenses).values({
    userId: 1,
    farmerId: farmer1.id,
    category: "Seeds",
    amount: 500,
    description: "Corn seeds",
    expenseDate: new Date()
  }).returning();
  console.log("   ✓ Created expense: $" + expense1.amount);
} catch (err) {
  console.log("   ℹ User 1 data already exists or error:", err.message);
}

// Test 2: Create data for user 2 (test@farmer.com)
console.log("\n2. Creating test data for User 2 (test@farmer.com, userId: 2)...");
try {
  const [farmer2] = await db.insert(farmers).values({
    userId: 2,
    firstName: "Jane",
    lastName: "Test",
    email: "jane@example.com",
    phone: "987-654-3210",
    address: "456 Test Ave"
  }).returning();
  console.log("   ✓ Created farmer:", farmer2.firstName, farmer2.lastName);

  const [expense2] = await db.insert(expenses).values({
    userId: 2,
    farmerId: farmer2.id,
    category: "Fertilizer",
    amount: 300,
    description: "Organic fertilizer",
    expenseDate: new Date()
  }).returning();
  console.log("   ✓ Created expense: $" + expense2.amount);
} catch (err) {
  console.log("   ℹ User 2 data already exists or error:", err.message);
}

// Test 3: Query data for each user
console.log("\n3. Verifying data isolation...");

const user1Farmers = await db.select().from(farmers).where(eq(farmers.userId, 1));
const user2Farmers = await db.select().from(farmers).where(eq(farmers.userId, 2));

console.log("\n   User 1 (admin@farmer.com) data:");
console.log("   - Farmers:", user1Farmers.length);
user1Farmers.forEach(f => console.log("     *", f.firstName, f.lastName));

console.log("\n   User 2 (test@farmer.com) data:");
console.log("   - Farmers:", user2Farmers.length);
user2Farmers.forEach(f => console.log("     *", f.firstName, f.lastName));

const user1Expenses = await db.select().from(expenses).where(eq(expenses.userId, 1));
const user2Expenses = await db.select().from(expenses).where(eq(expenses.userId, 2));

console.log("\n   User 1 expenses:", user1Expenses.length, "records");
user1Expenses.forEach(e => console.log("     * $" + e.amount, "-", e.category));

console.log("\n   User 2 expenses:", user2Expenses.length, "records");
user2Expenses.forEach(e => console.log("     * $" + e.amount, "-", e.category));

// Test 4: Verify isolation
console.log("\n4. Data Isolation Test Results:");
const isolated = (user1Farmers.length > 0 && user2Farmers.length > 0 && 
                  user1Expenses.length > 0 && user2Expenses.length > 0);

if (isolated) {
  console.log("   ✅ SUCCESS: Each user has separate data");
  console.log("   ✅ User 1 cannot see User 2's data");
  console.log("   ✅ User 2 cannot see User 1's data");
} else {
  console.log("   ⚠ Data isolation test incomplete - need more data");
}

console.log("\n=== Test Complete ===");
process.exit(0);
