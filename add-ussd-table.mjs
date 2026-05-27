import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/farmer_data');

async function migrate() {
  try {
    console.log('Creating ussd_sessions table...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS ussd_sessions (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL UNIQUE,
        phone_number VARCHAR(20) NOT NULL,
        step VARCHAR(50) NOT NULL,
        data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    
    console.log('✓ ussd_sessions table created successfully');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
