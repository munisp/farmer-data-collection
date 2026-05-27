import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/farmer_db';

const sql = postgres(DATABASE_URL, { ssl: false });

async function migrate() {
  console.log('Creating ERPNext integration tables...');

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS erpnext_config (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        erpnext_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        api_secret TEXT NOT NULL,
        sync_enabled BOOLEAN DEFAULT true NOT NULL,
        last_sync_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS erpnext_sync_config (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        sync_enabled BOOLEAN DEFAULT true NOT NULL,
        sync_direction TEXT DEFAULT 'both' NOT NULL,
        conflict_resolution TEXT DEFAULT 'erpnext_wins' NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS erpnext_sync_mapping (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        platform_id INTEGER NOT NULL,
        erpnext_id TEXT NOT NULL,
        erpnext_doctype TEXT NOT NULL,
        sync_enabled BOOLEAN DEFAULT true NOT NULL,
        last_synced_at TIMESTAMP,
        version INTEGER DEFAULT 1 NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS erpnext_sync_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        operation TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        platform_id INTEGER,
        erpnext_id TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        error_stack TEXT,
        request_data JSONB,
        response_data JSONB,
        retry_count INTEGER DEFAULT 0 NOT NULL,
        duration INTEGER,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS erpnext_sync_queue (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        operation TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        platform_id INTEGER,
        erpnext_id TEXT,
        priority INTEGER DEFAULT 5 NOT NULL,
        status TEXT DEFAULT 'pending' NOT NULL,
        payload JSONB NOT NULL,
        scheduled_for TIMESTAMP DEFAULT NOW() NOT NULL,
        processed_at TIMESTAMP,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0 NOT NULL,
        max_retries INTEGER DEFAULT 3 NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS erpnext_sync_conflicts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        entity_type TEXT NOT NULL,
        platform_id INTEGER NOT NULL,
        erpnext_id TEXT NOT NULL,
        platform_data JSONB NOT NULL,
        erpnext_data JSONB NOT NULL,
        platform_version INTEGER NOT NULL,
        erpnext_version INTEGER NOT NULL,
        platform_modified_at TIMESTAMP NOT NULL,
        erpnext_modified_at TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'pending' NOT NULL,
        resolution TEXT,
        resolved_by INTEGER,
        resolved_at TIMESTAMP,
        resolved_data JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `;

    console.log('✅ ERPNext integration tables created successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
