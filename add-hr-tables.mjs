import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/farmer_data';
const client = postgres(connectionString);
const db = drizzle(client);

async function migrate() {
  console.log('Creating employee_allowances table...');
  await client`
    CREATE TABLE IF NOT EXISTS employee_allowances (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      amount INTEGER NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(employee_id, type, month, year)
    )
  `;
  await client`CREATE INDEX IF NOT EXISTS employee_allowances_employee_id_idx ON employee_allowances(employee_id)`;

  console.log('Creating employee_loans table...');
  await client`
    CREATE TABLE IF NOT EXISTS employee_loans (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      monthly_deduction INTEGER NOT NULL,
      start_month INTEGER NOT NULL,
      start_year INTEGER NOT NULL,
      reason TEXT,
      remaining_balance INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `;
  await client`CREATE INDEX IF NOT EXISTS employee_loans_employee_id_idx ON employee_loans(employee_id)`;
  await client`CREATE INDEX IF NOT EXISTS employee_loans_status_idx ON employee_loans(status)`;

  console.log('Adding daysRequested column to leave_requests if not exists...');
  await client`
    ALTER TABLE leave_requests 
    ADD COLUMN IF NOT EXISTS days_requested INTEGER
  `;

  console.log('Adding clockIn and clockOut columns to attendance_records if not exists...');
  await client`
    ALTER TABLE attendance_records 
    ADD COLUMN IF NOT EXISTS clock_in VARCHAR(10),
    ADD COLUMN IF NOT EXISTS clock_out VARCHAR(10)
  `;

  console.log('Migration completed successfully!');
  await client.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
