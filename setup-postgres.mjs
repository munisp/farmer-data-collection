import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/farmer_data';

const pool = new Pool({
  connectionString: DATABASE_URL,
});

async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Setting up PostgreSQL database schema...');
    
    // Drop existing tables if they exist (fresh start)
    await client.query('DROP TABLE IF EXISTS expenses CASCADE');
    await client.query('DROP TABLE IF EXISTS harvests CASCADE');
    await client.query('DROP TABLE IF EXISTS farm_inputs CASCADE');
    await client.query('DROP TABLE IF EXISTS livestock CASCADE');
    await client.query('DROP TABLE IF EXISTS crops CASCADE');
    await client.query('DROP TABLE IF EXISTS farms CASCADE');
    await client.query('DROP TABLE IF EXISTS farmers CASCADE');
    
    // Create farmers table
    await client.query(`
      CREATE TABLE farmers (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20),
        email VARCHAR(255),
        address TEXT,
        village VARCHAR(100),
        district VARCHAR(100),
        region VARCHAR(100),
        national_id VARCHAR(50),
        registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100)
      )
    `);
    console.log('✓ Created farmers table');
    
    // Create farms table
    await client.query(`
      CREATE TABLE farms (
        id SERIAL PRIMARY KEY,
        farmer_id INTEGER NOT NULL REFERENCES farmers(id),
        farm_name VARCHAR(200) NOT NULL,
        farm_size DECIMAL(10, 2),
        farm_size_unit VARCHAR(20) DEFAULT 'acres',
        location TEXT,
        latitude DECIMAL(10, 7),
        longitude DECIMAL(10, 7),
        soil_type VARCHAR(100),
        irrigation_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100)
      )
    `);
    console.log('✓ Created farms table');
    
    // Create crops table
    await client.query(`
      CREATE TABLE crops (
        id SERIAL PRIMARY KEY,
        farm_id INTEGER NOT NULL REFERENCES farms(id),
        crop_name VARCHAR(100) NOT NULL,
        crop_variety VARCHAR(100),
        planting_date TIMESTAMP NOT NULL,
        expected_harvest_date TIMESTAMP,
        actual_harvest_date TIMESTAMP,
        area_planted DECIMAL(10, 2),
        area_unit VARCHAR(20) DEFAULT 'acres',
        season VARCHAR(50),
        status VARCHAR(50) DEFAULT 'planted',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100)
      )
    `);
    console.log('✓ Created crops table');
    
    // Create livestock table
    await client.query(`
      CREATE TABLE livestock (
        id SERIAL PRIMARY KEY,
        farm_id INTEGER NOT NULL REFERENCES farms(id),
        animal_type VARCHAR(100) NOT NULL,
        breed VARCHAR(100),
        quantity INTEGER NOT NULL,
        purpose VARCHAR(100),
        acquisition_date TIMESTAMP NOT NULL,
        acquisition_cost INTEGER,
        current_value INTEGER,
        health_status VARCHAR(50) DEFAULT 'healthy',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100)
      )
    `);
    console.log('✓ Created livestock table');
    
    // Create farm_inputs table
    await client.query(`
      CREATE TABLE farm_inputs (
        id SERIAL PRIMARY KEY,
        farm_id INTEGER NOT NULL REFERENCES farms(id),
        crop_id INTEGER REFERENCES crops(id),
        input_type VARCHAR(50) NOT NULL,
        input_name VARCHAR(200) NOT NULL,
        quantity DECIMAL(10, 2) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        cost_per_unit INTEGER,
        total_cost INTEGER,
        supplier VARCHAR(200),
        purchase_date TIMESTAMP NOT NULL,
        application_date TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100)
      )
    `);
    console.log('✓ Created farm_inputs table');
    
    // Create harvests table
    await client.query(`
      CREATE TABLE harvests (
        id SERIAL PRIMARY KEY,
        crop_id INTEGER NOT NULL REFERENCES crops(id),
        harvest_date TIMESTAMP NOT NULL,
        quantity DECIMAL(10, 2) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        quality VARCHAR(50),
        storage_location VARCHAR(200),
        market_price INTEGER,
        sold_quantity DECIMAL(10, 2),
        revenue INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100)
      )
    `);
    console.log('✓ Created harvests table');
    
    // Create expenses table
    await client.query(`
      CREATE TABLE expenses (
        id SERIAL PRIMARY KEY,
        farm_id INTEGER NOT NULL REFERENCES farms(id),
        crop_id INTEGER REFERENCES crops(id),
        category VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        amount INTEGER NOT NULL,
        expense_date TIMESTAMP NOT NULL,
        payment_method VARCHAR(50),
        receipt VARCHAR(500),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        version INTEGER DEFAULT 1 NOT NULL,
        client_id VARCHAR(100)
      )
    `);
    console.log('✓ Created expenses table');
    
    console.log('\n✅ Database schema setup completed successfully!');
    
  } catch (error) {
    console.error('Error setting up database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase().catch(console.error);
