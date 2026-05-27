-- Migration: Add Credit Scoring Schema
-- Created: 2024-12-12
-- Description: Adds tables for credit scoring and risk assessment

-- Credit Scores table
CREATE TABLE IF NOT EXISTS credit_scores (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  band VARCHAR(1) NOT NULL,
  previous_score INTEGER,
  data_completeness INTEGER DEFAULT 0,
  confidence_level VARCHAR(20) DEFAULT 'low',
  recommended_loan_limit DECIMAL(15, 2),
  recommended_term_months INTEGER,
  recommended_interest_rate DECIMAL(5, 2),
  probability_of_default DECIMAL(5, 4),
  model_version VARCHAR(20),
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Credit Score Factors table
CREATE TABLE IF NOT EXISTS credit_score_factors (
  id SERIAL PRIMARY KEY,
  credit_score_id INTEGER NOT NULL REFERENCES credit_scores(id),
  factor_type VARCHAR(50) NOT NULL,
  factor_name VARCHAR(100) NOT NULL,
  raw_value VARCHAR(255),
  normalized_value DECIMAL(5, 2),
  weight DECIMAL(5, 2),
  contribution DECIMAL(5, 2),
  impact VARCHAR(20),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Credit Score History table
CREATE TABLE IF NOT EXISTS credit_score_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  band VARCHAR(1) NOT NULL,
  change_reason VARCHAR(255),
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Credit Band Info table
CREATE TABLE IF NOT EXISTS credit_band_info (
  id SERIAL PRIMARY KEY,
  band VARCHAR(1) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  min_score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  description TEXT,
  color VARCHAR(20),
  interest_rate_modifier DECIMAL(5, 2),
  loan_limit_modifier DECIMAL(5, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default credit bands
INSERT INTO credit_band_info (band, name, min_score, max_score, description, color, interest_rate_modifier, loan_limit_modifier)
VALUES 
  ('A', 'Excellent', 800, 850, 'Excellent credit - lowest risk', '#22c55e', -2.0, 1.5),
  ('B', 'Good', 700, 799, 'Good credit - low risk', '#84cc16', -1.0, 1.2),
  ('C', 'Fair', 600, 699, 'Fair credit - moderate risk', '#eab308', 0.0, 1.0),
  ('D', 'Poor', 500, 599, 'Poor credit - high risk', '#f97316', 2.0, 0.7),
  ('E', 'Very Poor', 300, 499, 'Very poor credit - very high risk', '#ef4444', 5.0, 0.3)
ON CONFLICT (band) DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_credit_scores_user ON credit_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_score_factors_score ON credit_score_factors(credit_score_id);
CREATE INDEX IF NOT EXISTS idx_credit_score_history_user ON credit_score_history(user_id);
