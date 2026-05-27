-- Migration: Add export_schedules table for scheduled exports
-- Date: 2024-11-25

CREATE TABLE IF NOT EXISTS export_schedules (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  data_type VARCHAR(50) NOT NULL, -- 'crops', 'expenses', 'harvests', 'financial'
  format VARCHAR(10) NOT NULL DEFAULT 'csv', -- 'csv' or 'json'
  frequency VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly'
  email VARCHAR(255) NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  last_run TIMESTAMP,
  next_run TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_export_schedules_user_id ON export_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_export_schedules_enabled ON export_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_export_schedules_next_run ON export_schedules(next_run);
