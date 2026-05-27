import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import { sql } from 'drizzle-orm';

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/farmer_data',
  ssl: false,
});

const db = drizzle(pool);

async function migrate() {
  console.log('Creating loan application tables...');

  // Create loan_applications table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS loan_applications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      application_number VARCHAR(50) NOT NULL UNIQUE,
      loan_amount INTEGER NOT NULL,
      purpose TEXT NOT NULL,
      term_months INTEGER NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      address TEXT NOT NULL,
      employment_status VARCHAR(100),
      monthly_income INTEGER,
      income_source TEXT,
      farm_size VARCHAR(100),
      crop_types TEXT,
      years_of_farming INTEGER,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER,
      reviewed_at TIMESTAMP,
      review_notes TEXT,
      rejection_reason TEXT,
      approved_amount INTEGER,
      approved_term_months INTEGER,
      approved_interest_rate INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMP
    )
  `);

  // Create application_documents table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS application_documents (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      document_type VARCHAR(100) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      s3_key VARCHAR(500) NOT NULL,
      s3_url TEXT NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      verified_by INTEGER,
      verified_at TIMESTAMP,
      verification_notes TEXT,
      uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Create application_status_history table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS application_status_history (
      id SERIAL PRIMARY KEY,
      application_id INTEGER NOT NULL,
      from_status VARCHAR(50),
      to_status VARCHAR(50) NOT NULL,
      changed_by INTEGER,
      notes TEXT,
      changed_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  console.log('✅ Loan application tables created successfully');
  await pool.end();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
