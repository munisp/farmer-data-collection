#!/usr/bin/env node

/**
 * ERPNext Database Migration Runner
 * 
 * This script runs the ERPNext table migration SQL script against PostgreSQL
 * 
 * Usage:
 *   node scripts/run-erpnext-migration.mjs
 * 
 * Environment Variables:
 *   DATABASE_URL - PostgreSQL connection string (default: local postgres)
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database connection
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/farmer_data';

async function runMigration() {
  console.log('🚀 Starting ERPNext database migration...\n');
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    // Test connection
    console.log('📡 Testing database connection...');
    const client = await pool.connect();
    console.log('✅ Database connection successful\n');

    // Read SQL migration file
    console.log('📄 Reading migration SQL file...');
    const sqlPath = join(__dirname, 'migrate-erpnext-tables.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    console.log('✅ SQL file loaded\n');

    // Execute migration
    console.log('⚙️  Executing migration...');
    await client.query(sql);
    console.log('✅ Migration executed successfully\n');

    // Verify tables were created
    console.log('🔍 Verifying tables...');
    const verifyQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name LIKE 'erpnext_%'
      ORDER BY table_name;
    `;
    
    const result = await client.query(verifyQuery);
    
    if (result.rows.length > 0) {
      console.log('✅ ERPNext tables created:');
      result.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('⚠️  No ERPNext tables found. Migration may have failed.');
    }

    // Get row counts
    console.log('\n📊 Table row counts:');
    const tables = result.rows.map(r => r.table_name);
    for (const table of tables) {
      const countResult = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
      console.log(`   - ${table}: ${countResult.rows[0].count} rows`);
    }

    client.release();
    console.log('\n✨ Migration completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
