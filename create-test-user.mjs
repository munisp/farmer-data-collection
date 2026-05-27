import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './drizzle/schema.ts';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

async function createTestUser() {
  try {
    const hashedPassword = await bcrypt.hash('demo123', 10);
    
    const [user] = await db.insert(schema.users).values({
      email: 'demo@farmer.com',
      password: hashedPassword,
      firstName: 'Demo',
      lastName: 'Farmer',
      role: 'farmer',
      isActive: true,
    }).returning();
    
    console.log('Test user created:', user);
    process.exit(0);
  } catch (error) {
    console.error('Error creating test user:', error);
    process.exit(1);
  }
}

createTestUser();
