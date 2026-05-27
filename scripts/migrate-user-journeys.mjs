import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as fs from 'fs';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/farmer_db';
const sql = postgres(connectionString, { ssl: false });
const db = drizzle(sql);

const migrationSQL = fs.readFileSync('./drizzle/migrations/add_user_journey_tables.sql', 'utf-8');

// Split by semicolon and execute each statement
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`Executing ${statements.length} SQL statements...`);

for (const statement of statements) {
  try {
    await sql.unsafe(statement);
    console.log('✓', statement.substring(0, 60) + '...');
  } catch (error) {
    console.error('✗', statement.substring(0, 60), error.message);
  }
}

await sql.end();
console.log('\nMigration complete!');
