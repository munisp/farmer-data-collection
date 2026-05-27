-- Migration: Add KYC and Notification Schemas
-- Created: 2024-12-12
-- Description: Adds tables for KYC verification and notification management

-- KYC Documents table
CREATE TABLE IF NOT EXISTS kyc_documents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  document_number VARCHAR(100),
  issuing_country VARCHAR(50),
  issuing_authority VARCHAR(255),
  issue_date DATE,
  expiry_date DATE,
  front_image_url VARCHAR(500),
  back_image_url VARCHAR(500),
  selfie_url VARCHAR(500),
  verification_status VARCHAR(20) DEFAULT 'pending',
  verification_notes TEXT,
  verified_by INTEGER,
  verified_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- KYC Verifications table
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  verification_level VARCHAR(20) DEFAULT 'basic',
  status VARCHAR(20) DEFAULT 'pending',
  basic_completed BOOLEAN DEFAULT FALSE,
  basic_completed_at TIMESTAMP,
  enhanced_completed BOOLEAN DEFAULT FALSE,
  enhanced_completed_at TIMESTAMP,
  full_completed BOOLEAN DEFAULT FALSE,
  full_completed_at TIMESTAMP,
  risk_score INTEGER,
  risk_factors TEXT,
  notes TEXT,
  reviewed_by INTEGER,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  category VARCHAR(50) DEFAULT 'general',
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  priority VARCHAR(20) DEFAULT 'normal',
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  action_url VARCHAR(500),
  action_label VARCHAR(100),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification Preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT TRUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  in_app_enabled BOOLEAN DEFAULT TRUE,
  price_alerts BOOLEAN DEFAULT TRUE,
  weather_alerts BOOLEAN DEFAULT TRUE,
  loan_reminders BOOLEAN DEFAULT TRUE,
  market_updates BOOLEAN DEFAULT TRUE,
  cooperative_updates BOOLEAN DEFAULT TRUE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  language VARCHAR(10) DEFAULT 'en',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Price Alerts table
CREATE TABLE IF NOT EXISTS price_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  crop_name VARCHAR(100) NOT NULL,
  market_name VARCHAR(255),
  condition VARCHAR(20) NOT NULL,
  target_price DECIMAL(15, 2) NOT NULL,
  current_price DECIMAL(15, 2),
  currency VARCHAR(3) DEFAULT 'NGN',
  triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMP,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Weather Alerts table
CREATE TABLE IF NOT EXISTS weather_alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  farm_id INTEGER,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  location VARCHAR(255),
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_kyc_documents_user ON kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verifications_user ON kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_weather_alerts_user ON weather_alerts(user_id);
