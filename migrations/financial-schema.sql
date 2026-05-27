-- ============================================================================
-- FINANCIAL SCHEMA MIGRATION
-- Accounting, ERP, Banking (Mojaloop), and Microfinance Tables
-- ============================================================================

-- ============================================================================
-- ACCOUNTING MODULE
-- ============================================================================

CREATE TABLE IF NOT EXISTS journal_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_number VARCHAR(50) NOT NULL UNIQUE,
  entry_date TIMESTAMP NOT NULL,
  description TEXT NOT NULL,
  reference VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by INTEGER REFERENCES users(id),
  posted_at TIMESTAMP,
  reversed_at TIMESTAMP,
  reversal_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS journal_entries_user_id_idx ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS journal_entries_entry_date_idx ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS journal_entries_status_idx ON journal_entries(status);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id SERIAL PRIMARY KEY,
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_code VARCHAR(20) NOT NULL,
  debit INTEGER NOT NULL DEFAULT 0,
  credit INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  farm_id INTEGER REFERENCES farms(id),
  crop_id INTEGER REFERENCES crops(id),
  cost_center VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS journal_entry_lines_journal_entry_id_idx ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS journal_entry_lines_account_code_idx ON journal_entry_lines(account_code);

CREATE TABLE IF NOT EXISTS account_balances_new (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_code VARCHAR(20) NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
  fiscal_year INTEGER NOT NULL,
  UNIQUE(user_id, account_code, fiscal_year)
);

CREATE INDEX IF NOT EXISTS account_balances_new_user_id_idx ON account_balances_new(user_id);

CREATE TABLE IF NOT EXISTS financial_periods (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_name VARCHAR(50) NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  closed_at TIMESTAMP,
  closed_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS financial_periods_user_id_idx ON financial_periods(user_id);

-- ============================================================================
-- ERP - INVENTORY MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(200),
  phone_number VARCHAR(20),
  email VARCHAR(320),
  address TEXT,
  payment_terms VARCHAR(100),
  rating INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS suppliers_user_id_idx ON suppliers(user_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type VARCHAR(50) NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  unit VARCHAR(50) NOT NULL,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  unit_cost INTEGER NOT NULL,
  supplier_id INTEGER REFERENCES suppliers(id),
  storage_location VARCHAR(100),
  expiry_date TIMESTAMP,
  batch_number VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_items_user_id_idx ON inventory_items(user_id);
CREATE INDEX IF NOT EXISTS inventory_items_item_type_idx ON inventory_items(item_type);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost INTEGER,
  total_cost INTEGER,
  transaction_date TIMESTAMP NOT NULL,
  reference VARCHAR(100),
  farm_id INTEGER REFERENCES farms(id),
  crop_id INTEGER REFERENCES crops(id),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_transactions_user_id_idx ON inventory_transactions(user_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_item_id_idx ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS inventory_transactions_transaction_date_idx ON inventory_transactions(transaction_date);

-- ============================================================================
-- ERP - WORK ORDER MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_order_number VARCHAR(50) NOT NULL UNIQUE,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  crop_id INTEGER REFERENCES crops(id),
  task_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  scheduled_date TIMESTAMP NOT NULL,
  completed_date TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  assigned_to INTEGER REFERENCES users(id),
  estimated_cost INTEGER,
  actual_cost INTEGER,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS work_orders_user_id_idx ON work_orders(user_id);
CREATE INDEX IF NOT EXISTS work_orders_farm_id_idx ON work_orders(farm_id);
CREATE INDEX IF NOT EXISTS work_orders_status_idx ON work_orders(status);

CREATE TABLE IF NOT EXISTS work_order_items (
  id SERIAL PRIMARY KEY,
  work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity_planned INTEGER NOT NULL,
  quantity_used INTEGER,
  unit_cost INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS work_order_items_work_order_id_idx ON work_order_items(work_order_id);

-- ============================================================================
-- ERP - ASSET MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS fixed_assets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type VARCHAR(50) NOT NULL,
  asset_name VARCHAR(200) NOT NULL,
  description TEXT,
  purchase_date TIMESTAMP NOT NULL,
  purchase_cost INTEGER NOT NULL,
  salvage_value INTEGER NOT NULL DEFAULT 0,
  useful_life INTEGER NOT NULL,
  depreciation_method VARCHAR(50) NOT NULL DEFAULT 'straight_line',
  accumulated_depreciation INTEGER NOT NULL DEFAULT 0,
  current_value INTEGER NOT NULL,
  location VARCHAR(200),
  serial_number VARCHAR(100),
  condition VARCHAR(50),
  maintenance_schedule TEXT,
  last_maintenance_date TIMESTAMP,
  next_maintenance_date TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fixed_assets_user_id_idx ON fixed_assets(user_id);
CREATE INDEX IF NOT EXISTS fixed_assets_asset_type_idx ON fixed_assets(asset_type);

CREATE TABLE IF NOT EXISTS depreciation_schedule (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_date TIMESTAMP NOT NULL,
  depreciation_amount INTEGER NOT NULL,
  accumulated_depreciation INTEGER NOT NULL,
  book_value INTEGER NOT NULL,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS depreciation_schedule_asset_id_idx ON depreciation_schedule(asset_id);

-- ============================================================================
-- ERP - TIME & ATTENDANCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_number VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(200) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  email VARCHAR(320),
  role VARCHAR(100) NOT NULL,
  hourly_rate INTEGER,
  hire_date TIMESTAMP NOT NULL,
  termination_date TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  biometric_id VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employees_user_id_idx ON employees(user_id);
CREATE INDEX IF NOT EXISTS employees_phone_number_idx ON employees(phone_number);

CREATE TABLE IF NOT EXISTS time_entries (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  clock_in TIMESTAMP NOT NULL,
  clock_out TIMESTAMP,
  hours_worked DECIMAL(5,2),
  work_type VARCHAR(100),
  farm_id INTEGER REFERENCES farms(id),
  crop_id INTEGER REFERENCES crops(id),
  work_order_id INTEGER REFERENCES work_orders(id),
  clock_in_location TEXT,
  clock_out_location TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS time_entries_employee_id_idx ON time_entries(employee_id);
CREATE INDEX IF NOT EXISTS time_entries_clock_in_idx ON time_entries(clock_in);

CREATE TABLE IF NOT EXISTS attendance_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL,
  clock_in_time TIMESTAMP,
  clock_out_time TIMESTAMP,
  hours_worked DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

CREATE INDEX IF NOT EXISTS attendance_records_employee_id_idx ON attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS attendance_records_date_idx ON attendance_records(date);

CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_name VARCHAR(100) NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  days_of_week TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shifts_user_id_idx ON shifts(user_id);

CREATE TABLE IF NOT EXISTS leave_requests (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type VARCHAR(50) NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leave_requests_employee_id_idx ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON leave_requests(status);

CREATE TABLE IF NOT EXISTS payroll_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  hours_worked DECIMAL(6,2) NOT NULL,
  regular_hours DECIMAL(6,2),
  overtime_hours DECIMAL(6,2),
  hourly_rate INTEGER NOT NULL,
  gross_pay INTEGER NOT NULL,
  deductions INTEGER DEFAULT 0,
  net_pay INTEGER NOT NULL,
  payment_date TIMESTAMP,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payroll_records_employee_id_idx ON payroll_records(employee_id);
CREATE INDEX IF NOT EXISTS payroll_records_period_end_idx ON payroll_records(period_end);

-- ============================================================================
-- BANKING - MOJALOOP INTEGRATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_number VARCHAR(50) NOT NULL,
  account_name VARCHAR(200) NOT NULL,
  bank_name VARCHAR(200),
  bank_code VARCHAR(20),
  account_type VARCHAR(50) DEFAULT 'savings',
  mojaloop_party_id VARCHAR(100),
  mojaloop_party_id_type VARCHAR(50),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bank_accounts_user_id_idx ON bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS bank_accounts_account_number_idx ON bank_accounts(account_number);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES bank_accounts(id),
  transaction_type VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  reference VARCHAR(100),
  description TEXT,
  mojaloop_transaction_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  transaction_date TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  failure_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bank_transactions_user_id_idx ON bank_transactions(user_id);
CREATE INDEX IF NOT EXISTS bank_transactions_transaction_date_idx ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS bank_transactions_status_idx ON bank_transactions(status);

CREATE TABLE IF NOT EXISTS mojaloop_transactions (
  id SERIAL PRIMARY KEY,
  bank_transaction_id INTEGER REFERENCES bank_transactions(id) ON DELETE CASCADE,
  transfer_id VARCHAR(100) NOT NULL UNIQUE,
  quote_id VARCHAR(100),
  transaction_id VARCHAR(100),
  payer_party_id_type VARCHAR(50),
  payer_party_id VARCHAR(100),
  payee_party_id_type VARCHAR(50),
  payee_party_id VARCHAR(100),
  amount INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL,
  transaction_type VARCHAR(50),
  note TEXT,
  status VARCHAR(20) NOT NULL,
  error_code VARCHAR(50),
  error_description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mojaloop_transactions_transfer_id_idx ON mojaloop_transactions(transfer_id);

CREATE TABLE IF NOT EXISTS payment_requests (
  id SERIAL PRIMARY KEY,
  payee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payer_id INTEGER REFERENCES users(id),
  amount INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  description TEXT,
  qr_code TEXT,
  qr_code_data TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP,
  paid_at TIMESTAMP,
  bank_transaction_id INTEGER REFERENCES bank_transactions(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_requests_payee_id_idx ON payment_requests(payee_id);
CREATE INDEX IF NOT EXISTS payment_requests_status_idx ON payment_requests(status);

-- ============================================================================
-- MICROFINANCE - LOAN MANAGEMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS lenders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL,
  contact_person VARCHAR(200),
  phone_number VARCHAR(20),
  email VARCHAR(320),
  address TEXT,
  interest_rate_range VARCHAR(50),
  max_loan_amount INTEGER,
  min_loan_amount INTEGER,
  mojaloop_party_id VARCHAR(100),
  api_endpoint VARCHAR(500),
  api_key VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loans (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loan_number VARCHAR(50) NOT NULL UNIQUE,
  lender_id INTEGER NOT NULL REFERENCES lenders(id) ON DELETE RESTRICT,
  loan_type VARCHAR(50) NOT NULL,
  principal_amount INTEGER NOT NULL,
  interest_rate INTEGER NOT NULL,
  term INTEGER NOT NULL,
  disbursement_date TIMESTAMP,
  maturity_date TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  purpose TEXT,
  collateral TEXT,
  guarantor_id INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  disbursement_transaction_id INTEGER REFERENCES bank_transactions(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loans_user_id_idx ON loans(user_id);
CREATE INDEX IF NOT EXISTS loans_status_idx ON loans(status);

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
  bank_transaction_id INTEGER REFERENCES bank_transactions(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loan_repayments_loan_id_idx ON loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS loan_repayments_due_date_idx ON loan_repayments(due_date);
CREATE INDEX IF NOT EXISTS loan_repayments_status_idx ON loan_repayments(status);

CREATE TABLE IF NOT EXISTS credit_scores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  rating VARCHAR(20) NOT NULL,
  max_loan_amount INTEGER NOT NULL,
  interest_rate INTEGER NOT NULL,
  calculated_at TIMESTAMP NOT NULL,
  factors TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_scores_user_id_idx ON credit_scores(user_id);

CREATE TABLE IF NOT EXISTS credit_score_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  rating VARCHAR(20) NOT NULL,
  factors TEXT,
  calculated_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS credit_score_history_user_id_idx ON credit_score_history(user_id);
CREATE INDEX IF NOT EXISTS credit_score_history_calculated_at_idx ON credit_score_history(calculated_at);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
