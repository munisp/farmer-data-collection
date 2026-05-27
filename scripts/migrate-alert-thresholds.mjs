import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/farmer_data';

async function migrate() {
  const config = {
    connectionString: DATABASE_URL
  };
  
  // Disable SSL for local PostgreSQL
  if (DATABASE_URL.includes('localhost')) {
    config.ssl = { rejectUnauthorized: false };
  }
  
  const client = new Client(config);
  
  try {
    await client.connect();
    console.log('[Migration] Connected to database');

    // Create alert_thresholds table
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_thresholds (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        metric_name VARCHAR(100) NOT NULL,
        threshold_type VARCHAR(20) NOT NULL,
        threshold_value INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        notification_channel VARCHAR(50) DEFAULT 'email',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('[Migration] Created alert_thresholds table');

    // Create alert_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS alert_history (
        id SERIAL PRIMARY KEY,
        threshold_id INTEGER REFERENCES alert_thresholds(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        metric_name VARCHAR(100) NOT NULL,
        actual_value INTEGER NOT NULL,
        threshold_value INTEGER NOT NULL,
        message VARCHAR(500),
        acknowledged BOOLEAN DEFAULT false,
        acknowledged_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('[Migration] Created alert_history table');

    console.log('[Migration] Migration completed successfully');
  } catch (error) {
    console.error('[Migration] Error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch(console.error);
