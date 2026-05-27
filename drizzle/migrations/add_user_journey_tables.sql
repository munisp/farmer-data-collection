-- User Journey Database Migration
-- Generated: 2025-11-25

-- Farm Profiles
CREATE TABLE IF NOT EXISTS farm_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  farm_name VARCHAR(255) NOT NULL,
  farm_size DECIMAL(10,2) NOT NULL,
  location_lat DECIMAL(10,8),
  location_lng DECIMAL(11,8),
  soil_type VARCHAR(100),
  water_source VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Planting Records
CREATE TABLE IF NOT EXISTS planting_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  crop_id INTEGER REFERENCES crops(id),
  crop_type VARCHAR(100) NOT NULL,
  planting_date DATE NOT NULL,
  expected_harvest_date DATE,
  area DECIMAL(10,2) NOT NULL,
  seed_variety VARCHAR(100),
  planting_method VARCHAR(100),
  status VARCHAR(50) DEFAULT 'planted' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Loan Accounts
CREATE TABLE IF NOT EXISTS loan_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount DECIMAL(12,2) NOT NULL,
  interest_rate DECIMAL(5,2) NOT NULL,
  purpose TEXT,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  credit_score INTEGER,
  disbursed_at TIMESTAMP,
  due_date DATE,
  total_repaid DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS loan_repayments (
  id SERIAL PRIMARY KEY,
  loan_id INTEGER NOT NULL REFERENCES loan_accounts(id),
  amount DECIMAL(12,2) NOT NULL,
  payment_date TIMESTAMP DEFAULT NOW() NOT NULL,
  payment_method VARCHAR(50),
  transaction_id VARCHAR(100)
);

-- Group Savings
CREATE TABLE IF NOT EXISTS group_savings (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(255) NOT NULL,
  leader_user_id INTEGER NOT NULL REFERENCES users(id),
  total_balance DECIMAL(12,2) DEFAULT 0 NOT NULL,
  contribution_amount DECIMAL(10,2),
  contribution_frequency VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES group_savings(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role VARCHAR(50) DEFAULT 'member' NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW() NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE TABLE IF NOT EXISTS group_contributions (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES group_savings(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount DECIMAL(10,2) NOT NULL,
  contribution_date TIMESTAMP DEFAULT NOW() NOT NULL,
  transaction_id VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS group_investments (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES group_savings(id),
  investment_type VARCHAR(100) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  purchase_date TIMESTAMP DEFAULT NOW() NOT NULL,
  status VARCHAR(50) DEFAULT 'active' NOT NULL
);

-- Insurance
CREATE TABLE IF NOT EXISTS insurance_policies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  policy_number VARCHAR(100) NOT NULL UNIQUE,
  policy_type VARCHAR(100) NOT NULL,
  coverage_amount DECIMAL(12,2) NOT NULL,
  premium DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'active' NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS insurance_claims (
  id SERIAL PRIMARY KEY,
  policy_id INTEGER NOT NULL REFERENCES insurance_policies(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  claim_number VARCHAR(100) NOT NULL UNIQUE,
  claim_amount DECIMAL(12,2) NOT NULL,
  damage_type VARCHAR(100) NOT NULL,
  damage_percentage INTEGER,
  description TEXT,
  photo_urls TEXT,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  assessor_notes TEXT,
  approved_amount DECIMAL(12,2),
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Negotiations
CREATE TABLE IF NOT EXISTS negotiations (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES produce_listings(id),
  buyer_id INTEGER NOT NULL REFERENCES users(id),
  seller_id INTEGER NOT NULL REFERENCES users(id),
  initial_price DECIMAL(10,2) NOT NULL,
  counter_price DECIMAL(10,2),
  final_price DECIMAL(10,2),
  quantity DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'active' NOT NULL,
  last_offer_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS negotiation_messages (
  id SERIAL PRIMARY KEY,
  negotiation_id INTEGER NOT NULL REFERENCES negotiations(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  offer_price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Planting Calendars
CREATE TABLE IF NOT EXISTS planting_calendars (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  year INTEGER NOT NULL,
  crop_type VARCHAR(100) NOT NULL,
  planting_month INTEGER NOT NULL,
  harvest_month INTEGER NOT NULL,
  recommended_area DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS annual_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  year INTEGER NOT NULL,
  total_revenue DECIMAL(12,2) NOT NULL,
  total_expenses DECIMAL(12,2) NOT NULL,
  net_profit DECIMAL(12,2) NOT NULL,
  roi DECIMAL(5,2),
  top_crop VARCHAR(100),
  recommendations TEXT,
  pdf_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Crop Diseases
CREATE TABLE IF NOT EXISTS crop_diseases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  crop_id INTEGER REFERENCES crops(id),
  disease_name VARCHAR(255) NOT NULL,
  severity VARCHAR(50),
  photo_url VARCHAR(500),
  ai_diagnosis TEXT,
  treatment_plan TEXT,
  status VARCHAR(50) DEFAULT 'active' NOT NULL,
  detected_at TIMESTAMP DEFAULT NOW() NOT NULL,
  treated_at TIMESTAMP,
  recovered_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disease_follow_ups (
  id SERIAL PRIMARY KEY,
  disease_id INTEGER NOT NULL REFERENCES crop_diseases(id),
  photo_url VARCHAR(500),
  notes TEXT,
  improvement_status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Scheduled Reminders
CREATE TABLE IF NOT EXISTS scheduled_reminders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  reminder_type VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  channel VARCHAR(50) NOT NULL,
  frequency VARCHAR(50),
  next_send_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_farm_profiles_user_id ON farm_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_planting_records_user_id ON planting_records(user_id);
CREATE INDEX IF NOT EXISTS idx_loan_accounts_user_id ON loan_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_group_savings_leader ON group_savings(leader_user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_user_id ON insurance_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_user_id ON insurance_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_buyer_id ON negotiations(buyer_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_seller_id ON negotiations(seller_id);
CREATE INDEX IF NOT EXISTS idx_planting_calendars_user_id ON planting_calendars(user_id);
CREATE INDEX IF NOT EXISTS idx_annual_reports_user_id ON annual_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_crop_diseases_user_id ON crop_diseases(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_user_id ON scheduled_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reminders_next_send ON scheduled_reminders(next_send_at) WHERE is_active = TRUE;
