import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'farmer_data',
  user: 'postgres',
  password: 'postgres'
});

async function setupMicrofinanceTables() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Create lenders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lenders (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(50) NOT NULL,
        contact_person VARCHAR(200),
        phone_number VARCHAR(20),
        email VARCHAR(200),
        address TEXT,
        interest_rate_min INTEGER,
        interest_rate_max INTEGER,
        max_loan_amount INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created lenders table');

    // Create loan_applications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS loan_applications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        application_number VARCHAR(50) NOT NULL UNIQUE,
        lender_id INTEGER REFERENCES lenders(id) ON DELETE SET NULL,
        loan_type VARCHAR(50) NOT NULL,
        requested_amount INTEGER NOT NULL,
        approved_amount INTEGER,
        interest_rate INTEGER,
        repayment_period INTEGER NOT NULL,
        purpose TEXT NOT NULL,
        collateral TEXT,
        guarantor_name VARCHAR(200),
        guarantor_phone VARCHAR(20),
        status VARCHAR(50) DEFAULT 'pending',
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP,
        reviewer_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created loan_applications table');

    // Create loans table
    await client.query(`
      CREATE TABLE IF NOT EXISTS loans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        loan_number VARCHAR(50) NOT NULL UNIQUE,
        lender_id INTEGER NOT NULL REFERENCES lenders(id) ON DELETE RESTRICT,
        loan_type VARCHAR(50) NOT NULL,
        principal_amount INTEGER NOT NULL,
        interest_rate INTEGER NOT NULL,
        term INTEGER NOT NULL,
        term_months INTEGER,
        disbursement_date DATE,
        maturity_date DATE,
        status VARCHAR(50) DEFAULT 'pending',
        outstanding_balance INTEGER,
        total_paid INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created loans table');

    // Create loan_repayments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS loan_repayments (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        payment_number INTEGER NOT NULL,
        due_date DATE NOT NULL,
        amount_due INTEGER NOT NULL,
        amount_paid INTEGER DEFAULT 0,
        payment_date DATE,
        payment_method VARCHAR(50),
        status VARCHAR(50) DEFAULT 'pending',
        late_fee INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created loan_repayments table');

    // Create credit_scores table
    await client.query(`
      CREATE TABLE IF NOT EXISTS credit_scores (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        score INTEGER NOT NULL,
        rating VARCHAR(20) NOT NULL,
        factors JSONB,
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Created credit_scores table');

    // Insert test lender
    await client.query(`
      INSERT INTO lenders (name, type, contact_person, phone_number, email, interest_rate_min, interest_rate_max, max_loan_amount)
      VALUES 
        ('Farmers Microfinance Bank', 'microfinance', 'John Smith', '+2348012345678', 'info@farmersmfb.ng', 1000, 2000, 500000000),
        ('Agricultural Cooperative Society', 'cooperative', 'Jane Doe', '+2348087654321', 'contact@agcoop.ng', 800, 1500, 300000000),
        ('Rural Development Bank', 'bank', 'Peter Johnson', '+2348098765432', 'support@rdb.ng', 1200, 1800, 1000000000)
      ON CONFLICT DO NOTHING
    `);
    console.log('✓ Inserted test lenders');

    console.log('\n✅ Microfinance database setup complete!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

setupMicrofinanceTables();
