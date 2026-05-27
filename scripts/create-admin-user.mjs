#!/usr/bin/env node
/**
 * Script to create or promote a user to admin role
 * Usage: node scripts/create-admin-user.mjs <email>
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users } from '../drizzle/schema.ts';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local'), override: true });

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/create-admin-user.mjs <email>');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not found in environment');
  process.exit(1);
}

console.log('Connecting to database...');
const client = postgres(DATABASE_URL);
const db = drizzle(client);

try {
  // Find user by email
  console.log(`Looking for user with email: ${email}`);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    console.error(`User with email ${email} not found`);
    console.log('\\nAvailable users:');
    const allUsers = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
    }).from(users);
    console.table(allUsers);
    process.exit(1);
  }

  console.log(`\\nFound user: ${user.firstName} ${user.lastName} (${user.email})`);
  console.log(`Current role: ${user.role}`);

  if (user.role === 'admin') {
    console.log('\\n✅ User is already an admin!');
  } else {
    // Update user role to admin
    console.log('\\nPromoting user to admin...');
    await db.update(users)
      .set({ role: 'admin' })
      .where(eq(users.id, user.id));

    console.log('\\n✅ User successfully promoted to admin!');
  }

  console.log('\\nAdmin user details:');
  console.log(`  Email: ${user.email}`);
  console.log(`  Name: ${user.firstName} ${user.lastName}`);
  console.log(`  Role: admin`);
  console.log('\\nYou can now log in with this user to access the admin dashboard at /admin');

} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} finally {
  await client.end();
}
