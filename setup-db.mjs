import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/farmer_data',
  ssl: false,
});

async function setupDatabase() {
  try {
    console.log('[Setup] Creating tables...');
    
    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role VARCHAR(50) DEFAULT 'farmer' NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    
    console.log('[Setup] Users table created');
    
    // Insert test user
    const hashedPassword = await bcrypt.hash('password123', 10);
    await pool.query(`
      INSERT INTO users (email, password, first_name, last_name, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING;
    `, ['test@farmer.com', hashedPassword, 'Test', 'Farmer', 'farmer']);
    
    console.log('[Setup] Test user created: test@farmer.com / password123');
    
    console.log('[Setup] Database setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('[Setup] Error:', error);
    process.exit(1);
  }
}

setupDatabase();
