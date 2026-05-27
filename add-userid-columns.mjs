import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/farmer_data',
  ssl: false
});

async function addUserIdColumns() {
  const client = await pool.connect();
  
  try {
    console.log('Starting migration to add user_id columns...');
    
    // Get the first user ID to use as default
    const userResult = await client.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length === 0) {
      console.error('No users found in database. Please create a user first.');
      return;
    }
    const defaultUserId = userResult.rows[0].id;
    console.log(`Using user ID ${defaultUserId} as default for existing records`);
    
    // Add user_id column to farmers table
    console.log('Adding user_id to farmers table...');
    await client.query(`
      ALTER TABLE farmers 
      ADD COLUMN IF NOT EXISTS user_id INTEGER;
    `);
    await client.query(`
      UPDATE farmers 
      SET user_id = $1 
      WHERE user_id IS NULL;
    `, [defaultUserId]);
    await client.query(`
      ALTER TABLE farmers 
      ALTER COLUMN user_id SET NOT NULL;
    `);
    await client.query(`
      ALTER TABLE farmers 
      ADD CONSTRAINT farmers_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) 
      ON DELETE CASCADE;
    `);
    
    // Add user_id column to farms table
    console.log('Adding user_id to farms table...');
    await client.query(`
      ALTER TABLE farms 
      ADD COLUMN IF NOT EXISTS user_id INTEGER;
    `);
    await client.query(`
      UPDATE farms 
      SET user_id = $1 
      WHERE user_id IS NULL;
    `, [defaultUserId]);
    await client.query(`
      ALTER TABLE farms 
      ALTER COLUMN user_id SET NOT NULL;
    `);
    await client.query(`
      ALTER TABLE farms 
      ADD CONSTRAINT farms_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) 
      ON DELETE CASCADE;
    `);
    
    // Add user_id column to crops table
    console.log('Adding user_id to crops table...');
    await client.query(`
      ALTER TABLE crops 
      ADD COLUMN IF NOT EXISTS user_id INTEGER;
    `);
    await client.query(`
      UPDATE crops 
      SET user_id = $1 
      WHERE user_id IS NULL;
    `, [defaultUserId]);
    await client.query(`
      ALTER TABLE crops 
      ALTER COLUMN user_id SET NOT NULL;
    `);
    await client.query(`
      ALTER TABLE crops 
      ADD CONSTRAINT crops_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) 
      ON DELETE CASCADE;
    `);
    
    // Add user_id column to livestock table
    console.log('Adding user_id to livestock table...');
    await client.query(`
      ALTER TABLE livestock 
      ADD COLUMN IF NOT EXISTS user_id INTEGER;
    `);
    await client.query(`
      UPDATE livestock 
      SET user_id = $1 
      WHERE user_id IS NULL;
    `, [defaultUserId]);
    await client.query(`
      ALTER TABLE livestock 
      ALTER COLUMN user_id SET NOT NULL;
    `);
    await client.query(`
      ALTER TABLE livestock 
      ADD CONSTRAINT livestock_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) 
      ON DELETE CASCADE;
    `);
    
    // Add user_id column to farm_inputs table
    console.log('Adding user_id to farm_inputs table...');
    await client.query(`
      ALTER TABLE farm_inputs 
      ADD COLUMN IF NOT EXISTS user_id INTEGER;
    `);
    await client.query(`
      UPDATE farm_inputs 
      SET user_id = $1 
      WHERE user_id IS NULL;
    `, [defaultUserId]);
    await client.query(`
      ALTER TABLE farm_inputs 
      ALTER COLUMN user_id SET NOT NULL;
    `);
    await client.query(`
      ALTER TABLE farm_inputs 
      ADD CONSTRAINT farm_inputs_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) 
      ON DELETE CASCADE;
    `);
    
    // Add user_id column to harvests table
    console.log('Adding user_id to harvests table...');
    await client.query(`
      ALTER TABLE harvests 
      ADD COLUMN IF NOT EXISTS user_id INTEGER;
    `);
    await client.query(`
      UPDATE harvests 
      SET user_id = $1 
      WHERE user_id IS NULL;
    `, [defaultUserId]);
    await client.query(`
      ALTER TABLE harvests 
      ALTER COLUMN user_id SET NOT NULL;
    `);
    await client.query(`
      ALTER TABLE harvests 
      ADD CONSTRAINT harvests_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) 
      ON DELETE CASCADE;
    `);
    
    // Add user_id column to expenses table
    console.log('Adding user_id to expenses table...');
    await client.query(`
      ALTER TABLE expenses 
      ADD COLUMN IF NOT EXISTS user_id INTEGER;
    `);
    await client.query(`
      UPDATE expenses 
      SET user_id = $1 
      WHERE user_id IS NULL;
    `, [defaultUserId]);
    await client.query(`
      ALTER TABLE expenses 
      ALTER COLUMN user_id SET NOT NULL;
    `);
    await client.query(`
      ALTER TABLE expenses 
      ADD CONSTRAINT expenses_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES users(id) 
      ON DELETE CASCADE;
    `);
    
    console.log('✅ Migration completed successfully!');
    console.log('All tables now have user_id foreign keys.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addUserIdColumns();
