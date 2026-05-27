-- Migration: Add Cooperative Schema
-- Created: 2024-12-12
-- Description: Adds tables for cooperative management including members, accounts, transactions, loans, and meetings

-- Cooperatives table
CREATE TABLE IF NOT EXISTS cooperatives (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  registration_number VARCHAR(100) UNIQUE,
  cooperative_type VARCHAR(50) NOT NULL DEFAULT 'farmer_cooperative',
  description TEXT,
  address TEXT,
  region VARCHAR(100),
  district VARCHAR(100),
  country VARCHAR(50) DEFAULT 'Nigeria',
  phone VARCHAR(20),
  email VARCHAR(255),
  website VARCHAR(255),
  logo_url VARCHAR(500),
  founded_date DATE,
  registration_date DATE,
  status VARCHAR(20) DEFAULT 'active',
  total_members INTEGER DEFAULT 0,
  total_savings DECIMAL(15, 2) DEFAULT 0,
  total_loans_disbursed DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cooperative members table
CREATE TABLE IF NOT EXISTS cooperative_members (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  user_id INTEGER,
  member_number VARCHAR(50),
  role VARCHAR(50) DEFAULT 'member',
  join_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(20) DEFAULT 'active',
  shares INTEGER DEFAULT 0,
  share_value DECIMAL(15, 2) DEFAULT 0,
  savings_balance DECIMAL(15, 2) DEFAULT 0,
  loan_balance DECIMAL(15, 2) DEFAULT 0,
  guarantor_for TEXT,
  guaranteed_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cooperative accounts table
CREATE TABLE IF NOT EXISTS cooperative_accounts (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  account_type VARCHAR(50) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  balance DECIMAL(15, 2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'NGN',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cooperative transactions table
CREATE TABLE IF NOT EXISTS cooperative_transactions (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  member_id INTEGER REFERENCES cooperative_members(id),
  account_id INTEGER REFERENCES cooperative_accounts(id),
  transaction_type VARCHAR(50) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'NGN',
  reference VARCHAR(100),
  description TEXT,
  status VARCHAR(20) DEFAULT 'completed',
  processed_by INTEGER,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cooperative loans table
CREATE TABLE IF NOT EXISTS cooperative_loans (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  member_id INTEGER NOT NULL REFERENCES cooperative_members(id),
  loan_number VARCHAR(50),
  loan_type VARCHAR(50) DEFAULT 'personal',
  principal_amount DECIMAL(15, 2) NOT NULL,
  interest_rate DECIMAL(5, 2) NOT NULL,
  term_months INTEGER NOT NULL,
  disbursement_date DATE,
  maturity_date DATE,
  outstanding_balance DECIMAL(15, 2),
  status VARCHAR(20) DEFAULT 'pending',
  purpose TEXT,
  guarantors TEXT,
  collateral TEXT,
  approved_by INTEGER,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cooperative meetings table
CREATE TABLE IF NOT EXISTS cooperative_meetings (
  id SERIAL PRIMARY KEY,
  cooperative_id INTEGER NOT NULL REFERENCES cooperatives(id),
  meeting_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  scheduled_date TIMESTAMP NOT NULL,
  location VARCHAR(255),
  agenda TEXT,
  minutes TEXT,
  attendees TEXT,
  status VARCHAR(20) DEFAULT 'scheduled',
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_cooperative_members_cooperative ON cooperative_members(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_members_user ON cooperative_members(user_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_transactions_cooperative ON cooperative_transactions(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_transactions_member ON cooperative_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_loans_cooperative ON cooperative_loans(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_loans_member ON cooperative_loans(member_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_meetings_cooperative ON cooperative_meetings(cooperative_id);
