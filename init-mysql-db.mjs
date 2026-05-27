import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

// Parse DATABASE_URL
const dbUrl = process.env.DATABASE_URL || "mysql://root:password@localhost:3306/farmer_data";
const url = new URL(dbUrl);

const config = {
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.substring(1).split('?')[0],
  ssl: url.searchParams.get('ssl') ? { rejectUnauthorized: true } : undefined
};

async function initDatabase() {
  console.log('🔧 Initializing MySQL database...');
  console.log(`   Host: ${config.host}`);
  console.log(`   Database: ${config.database}`);
  
  let connection;
  
  try {
    connection = await mysql.createConnection(config);
    console.log('✅ Connected to database');

    // Create users table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone_number VARCHAR(20),
        role VARCHAR(50) DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Users table created/verified');

    // Check if test users exist
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM users');
    const userCount = rows[0].count;
    
    if (userCount === 0) {
      console.log('📝 Creating test users...');
      const hashedPassword = await bcrypt.hash('Password123!', 10);
      
      await connection.execute(`
        INSERT INTO users (email, password, first_name, last_name, phone_number, role, is_active)
        VALUES 
          (?, ?, ?, ?, ?, ?, ?),
          (?, ?, ?, ?, ?, ?, ?)
      `, [
        'admin@farmer.com', hashedPassword, 'Admin', 'User', '+1234567890', 'admin', true,
        'agent@farmer.com', hashedPassword, 'Field', 'Agent', '+1234567891', 'user', true
      ]);
      
      console.log('✅ Test users created:');
      console.log('   - admin@farmer.com / Password123! (admin)');
      console.log('   - agent@farmer.com / Password123! (user)');
    } else {
      console.log(`ℹ️  Database already has ${userCount} user(s)`);
      const [users] = await connection.execute('SELECT id, email, first_name, last_name, role FROM users');
      console.log('   Existing users:');
      users.forEach(user => {
        console.log(`   - ${user.email} (${user.role})`);
      });
    }

    console.log('\n✨ Database initialization complete!');
    console.log('\n🔑 You can now log in with:');
    console.log('   Email: admin@farmer.com');
    console.log('   Password: Password123!');
    
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initDatabase().catch(console.error);
