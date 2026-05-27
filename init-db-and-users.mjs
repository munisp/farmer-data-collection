import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/farmer_data";

async function initDatabase() {
  console.log('🔧 Initializing database...');
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: false,
  });
  
  const db = drizzle(pool);

  try {
    // Create users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone_number VARCHAR(20),
        role VARCHAR(50) DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Users table created/verified');

    // Check if test users exist
    const result = await pool.query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(result.rows[0].count);
    
    if (userCount === 0) {
      console.log('📝 Creating test users...');
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      
      await pool.query(`
        INSERT INTO users (email, password, first_name, last_name, phone_number, role, is_active)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7),
          ($8, $9, $10, $11, $12, $13, $14)
      `, [
        'admin@farmer.com', hashedPassword, 'Admin', 'User', '+1234567890', 'admin', true,
        'agent@farmer.com', hashedPassword, 'Field', 'Agent', '+1234567891', 'user', true
      ]);
      
      console.log('✅ Test users created:');
      console.log('   - admin@farmer.com / Password123! (admin)');
      console.log('   - agent@farmer.com / Password123! (user)');
    } else {
      console.log(`ℹ️  Database already has ${userCount} user(s)`);
      const users = await pool.query('SELECT id, email, first_name, last_name, role FROM users');
      console.log('   Existing users:');
      users.rows.forEach(user => {
        console.log(`   - ${user.email} (${user.role})`);
      });
    }

    console.log('\n✨ Database initialization complete!');
    console.log('\n🔑 You can now log in with:');
    console.log('   Email: admin@farmer.com');
    console.log('   Password: Password123!');
    
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

initDatabase().catch(console.error);
