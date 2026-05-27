-- Create loan disbursements table
CREATE TABLE IF NOT EXISTS loan_disbursements (
  id SERIAL PRIMARY KEY,
  loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  disbursement_number VARCHAR(50) UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  method VARCHAR(50) NOT NULL,
  bank_name VARCHAR(255),
  account_number VARCHAR(50),
  account_name VARCHAR(255),
  mobile_money_provider VARCHAR(100),
  mobile_money_number VARCHAR(20),
  transaction_reference VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMP,
  processed_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  notes TEXT,
  failure_reason TEXT,
  processed_by INTEGER REFERENCES users(id),
  processing_fee INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create disbursement status history table
CREATE TABLE IF NOT EXISTS disbursement_status_history (
  id SERIAL PRIMARY KEY,
  disbursement_id INTEGER NOT NULL REFERENCES loan_disbursements(id) ON DELETE CASCADE,
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_disbursements_loan_id ON loan_disbursements(loan_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_user_id ON loan_disbursements(user_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_status ON loan_disbursements(status);
CREATE INDEX IF NOT EXISTS idx_disbursement_history_disbursement_id ON disbursement_status_history(disbursement_id);
