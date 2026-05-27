-- Migration: Add missing tables (audit_logs, account_balances) and performance indexes
-- Date: 2024-11-25
-- Description: Adds admin features tables and optimizes query performance

-- ============================================================================
-- 1. Create audit_logs table
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  changes JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Index for querying audit logs by user
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

-- Index for querying audit logs by entity
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- Index for querying audit logs by date
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- 2. Create account_balances table
-- ============================================================================
CREATE TABLE IF NOT EXISTS account_balances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  farm_id INTEGER NOT NULL REFERENCES farms(id),
  balance INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW() NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Index for querying balances by user
CREATE INDEX IF NOT EXISTS idx_account_balances_user_id ON account_balances(user_id);

-- Index for querying balances by farm
CREATE INDEX IF NOT EXISTS idx_account_balances_farm_id ON account_balances(farm_id);

-- Unique constraint to prevent duplicate balances per farm
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_balances_user_farm ON account_balances(user_id, farm_id);

-- ============================================================================
-- 3. Add performance indexes on existing tables
-- ============================================================================

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Farmers table indexes
CREATE INDEX IF NOT EXISTS idx_farmers_user_id ON farmers(user_id);

-- Farms table indexes
CREATE INDEX IF NOT EXISTS idx_farms_user_id ON farms(user_id);

-- Crops table indexes
CREATE INDEX IF NOT EXISTS idx_crops_user_id ON crops(user_id);
CREATE INDEX IF NOT EXISTS idx_crops_farm_id ON crops(farm_id);
CREATE INDEX IF NOT EXISTS idx_crops_planting_date ON crops(planting_date);
CREATE INDEX IF NOT EXISTS idx_crops_status ON crops(status);

-- Livestock table indexes
CREATE INDEX IF NOT EXISTS idx_livestock_user_id ON livestock(user_id);
CREATE INDEX IF NOT EXISTS idx_livestock_farm_id ON livestock(farm_id);

-- Farm Inputs table indexes
CREATE INDEX IF NOT EXISTS idx_farm_inputs_user_id ON farm_inputs(user_id);
CREATE INDEX IF NOT EXISTS idx_farm_inputs_farm_id ON farm_inputs(farm_id);
CREATE INDEX IF NOT EXISTS idx_farm_inputs_crop_id ON farm_inputs(crop_id);

-- Expenses table indexes
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_farm_id ON expenses(farm_id);
CREATE INDEX IF NOT EXISTS idx_expenses_crop_id ON expenses(crop_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- Harvests table indexes
CREATE INDEX IF NOT EXISTS idx_harvests_user_id ON harvests(user_id);
CREATE INDEX IF NOT EXISTS idx_harvests_crop_id ON harvests(crop_id);
CREATE INDEX IF NOT EXISTS idx_harvests_date ON harvests(harvest_date DESC);

-- ============================================================================
-- 4. Add notifications table (if not exists)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================================================
-- Migration complete
-- ============================================================================
