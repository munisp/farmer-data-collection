import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://farmer_user:farmer_pass@localhost:5432/farmer_data?sslmode=disable';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: false,
});

async function setupAllTables() {
  const client = await pool.connect();
  
  try {
    console.log('Setting up all database tables...\n');
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role VARCHAR(50) DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created users table');

    // Create SMS templates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sms_templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        message_template TEXT NOT NULL,
        variables JSONB,
        category VARCHAR(100),
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created sms_templates table');

    // Create SMS scheduled messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sms_scheduled_messages (
        id SERIAL PRIMARY KEY,
        template_id INTEGER,
        recipient_phone VARCHAR(20) NOT NULL,
        recipient_name VARCHAR(200),
        message TEXT NOT NULL,
        scheduled_for TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        sent_at TIMESTAMP,
        delivery_status VARCHAR(50),
        message_id VARCHAR(255),
        error_message TEXT,
        cost DECIMAL(10, 4),
        metadata JSONB,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created sms_scheduled_messages table');

    // Create SMS logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sms_logs (
        id SERIAL PRIMARY KEY,
        recipient_phone VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        sent_at TIMESTAMP,
        delivery_status VARCHAR(50),
        message_id VARCHAR(255),
        error_message TEXT,
        cost DECIMAL(10, 4),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created sms_logs table');

    // Create ERPNext config table
    await client.query(`
      CREATE TABLE IF NOT EXISTS erpnext_config (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        erpnext_url VARCHAR(500) NOT NULL,
        api_key VARCHAR(500) NOT NULL,
        api_secret VARCHAR(500) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created erpnext_config table');

    // Create ERPNext sync mapping table
    await client.query(`
      CREATE TABLE IF NOT EXISTS erpnext_sync_mapping (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        platform_id INTEGER NOT NULL,
        erpnext_id VARCHAR(255) NOT NULL,
        erpnext_doctype VARCHAR(100) NOT NULL,
        version INTEGER DEFAULT 1,
        last_synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, entity_type, platform_id)
      )
    `);
    console.log('✓ Created erpnext_sync_mapping table');

    // Create ERPNext sync log table
    await client.query(`
      CREATE TABLE IF NOT EXISTS erpnext_sync_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id INTEGER,
        direction VARCHAR(20) NOT NULL,
        operation VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        error_message TEXT,
        request_data JSONB,
        response_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created erpnext_sync_log table');

    // Create ERPNext sync queue table
    await client.query(`
      CREATE TABLE IF NOT EXISTS erpnext_sync_queue (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id INTEGER NOT NULL,
        operation VARCHAR(50) NOT NULL,
        priority INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        status VARCHAR(50) DEFAULT 'pending',
        error_message TEXT,
        data JSONB,
        scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created erpnext_sync_queue table');

    // Create ERPNext sync conflicts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS erpnext_sync_conflicts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        platform_id INTEGER NOT NULL,
        erpnext_id VARCHAR(255) NOT NULL,
        platform_data JSONB NOT NULL,
        erpnext_data JSONB NOT NULL,
        platform_version INTEGER,
        erpnext_version INTEGER,
        resolution_strategy VARCHAR(100),
        resolved_at TIMESTAMP,
        resolved_by INTEGER,
        resolution_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created erpnext_sync_conflicts table');

    // Add userId columns to existing tables if they don't exist
    await client.query(`
      ALTER TABLE farmers ADD COLUMN IF NOT EXISTS user_id INTEGER
    `);
    await client.query(`
      ALTER TABLE farms ADD COLUMN IF NOT EXISTS user_id INTEGER
    `);
    await client.query(`
      ALTER TABLE crops ADD COLUMN IF NOT EXISTS user_id INTEGER
    `);
    await client.query(`
      ALTER TABLE livestock ADD COLUMN IF NOT EXISTS user_id INTEGER
    `);
    await client.query(`
      ALTER TABLE farm_inputs ADD COLUMN IF NOT EXISTS user_id INTEGER
    `);
    await client.query(`
      ALTER TABLE harvests ADD COLUMN IF NOT EXISTS user_id INTEGER
    `);
    await client.query(`
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id INTEGER
    `);
    console.log('✓ Added user_id columns to all data tables');

    console.log('\n✅ All database tables setup completed successfully!');
    
  } catch (error) {
    console.error('Error setting up tables:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

setupAllTables().catch(console.error);
