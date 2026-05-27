import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { users } from './server/db/schema.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ubuntu:password@localhost:5432/farmer_db?sslmode=disable';

const sql = postgres(DATABASE_URL);
const db = drizzle(sql);

async function createTestUsers() {
  const testUsers = [
    { email: 'test1@farmer.com', password: 'TestPass123!', name: 'Test User 1' },
    { email: 'test2@farmer.com', password: 'TestPass123!', name: 'Test User 2' },
    { email: 'test3@farmer.com', password: 'TestPass123!', name: 'Test User 3' },
  ];

  for (const user of testUsers) {
    try {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await db.insert(users).values({
        email: user.email,
        password: hashedPassword,
        name: user.name,
      }).onConflictDoNothing();
      console.log(`Created user: ${user.email}`);
    } catch (error) {
      console.log(`User ${user.email} may already exist:`, error.message);
    }
  }

  await sql.end();
  console.log('Test users created successfully');
}

createTestUsers().catch(console.error);
