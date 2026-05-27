-- Create lenders table
CREATE TABLE IF NOT EXISTS lenders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  lender_type VARCHAR(50) NOT NULL,
  contact_person VARCHAR(200),
  phone_number VARCHAR(20),
  email VARCHAR(320),
  address TEXT,
  interest_rate_min INTEGER,
  interest_rate_max INTEGER,
  max_loan_amount INTEGER,
  min_loan_amount INTEGER,
  terms_and_conditions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lenders_user_id_idx ON lenders(user_id);

-- Insert default lender
INSERT INTO lenders (id, user_id, name, lender_type, is_active) 
VALUES (1, 1, 'Default Lender', 'bank', true) 
ON CONFLICT (id) DO NOTHING;

-- Create loans table
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
  monthly_payment INTEGER,
  total_amount INTEGER,
  outstanding_balance INTEGER,
  next_payment_due TIMESTAMP,
  application_date TIMESTAMP,
  disbursement_date TIMESTAMP,
  disbursed_at TIMESTAMP,
  maturity_date TIMESTAMP,
  paid_off_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  purpose TEXT,
  collateral TEXT,
  rejection_reason TEXT,
  guarantor_id INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  disbursement_transaction_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loans_user_id_idx ON loans(user_id);
CREATE INDEX IF NOT EXISTS loans_status_idx ON loans(status);

-- Create loan_repayments table
CREATE TABLE IF NOT EXISTS loan_repayments (
  id SERIAL PRIMARY KEY,
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  payment_number INTEGER NOT NULL,
  due_date TIMESTAMP NOT NULL,
  paid_date TIMESTAMP,
  principal_amount INTEGER NOT NULL,
  interest_amount INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(50),
  transaction_reference VARCHAR(100),
  bank_transaction_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loan_repayments_loan_id_idx ON loan_repayments(loan_id);

-- Create credit_scores table
CREATE TABLE IF NOT EXISTS credit_scores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  previous_score INTEGER,
  score_change INTEGER,
  risk_category VARCHAR(20) NOT NULL,
  payment_history_score INTEGER,
  credit_utilization_score INTEGER,
  credit_age_score INTEGER,
  credit_mix_score INTEGER,
  calculated_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_scores_user_id_idx ON credit_scores(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS credit_scores_user_id_unique ON credit_scores(user_id);

-- Create credit_score_history table
CREATE TABLE IF NOT EXISTS credit_score_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  risk_category VARCHAR(20) NOT NULL,
  change_reason TEXT,
  calculated_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_score_history_user_id_idx ON credit_score_history(user_id);
CREATE INDEX IF NOT EXISTS credit_score_history_calculated_at_idx ON credit_score_history(calculated_at);

-- Savings tables are already created, but let's ensure they exist
CREATE TABLE IF NOT EXISTS savings_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farmer_id INTEGER,
  account_number VARCHAR(50) NOT NULL UNIQUE,
  account_name VARCHAR(200) NOT NULL,
  account_type VARCHAR(50) NOT NULL DEFAULT 'regular',
  balance INTEGER NOT NULL DEFAULT 0,
  interest_rate INTEGER NOT NULL DEFAULT 0,
  minimum_balance INTEGER DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS savings_accounts_user_id_idx ON savings_accounts(user_id);
CREATE INDEX IF NOT EXISTS savings_accounts_status_idx ON savings_accounts(status);

CREATE TABLE IF NOT EXISTS savings_transactions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES savings_accounts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  transaction_method VARCHAR(50),
  reference VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS savings_transactions_account_id_idx ON savings_transactions(account_id);
CREATE INDEX IF NOT EXISTS savings_transactions_user_id_idx ON savings_transactions(user_id);
CREATE INDEX IF NOT EXISTS savings_transactions_created_at_idx ON savings_transactions(created_at);
