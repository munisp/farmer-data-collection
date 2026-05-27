-- Create pest_disease_risks table for weather-based risk scoring
CREATE TABLE IF NOT EXISTS pest_disease_risks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_id INTEGER REFERENCES farms(id) ON DELETE CASCADE,
  crop_name VARCHAR(100) NOT NULL,
  pest_disease_name VARCHAR(200) NOT NULL,
  pest_disease_type VARCHAR(20) NOT NULL CHECK (pest_disease_type IN ('pest', 'disease')),
  risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_score DECIMAL(5,2) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  temperature_factor DECIMAL(5,2),
  humidity_factor DECIMAL(5,2),
  rainfall_factor DECIMAL(5,2),
  wind_factor DECIMAL(5,2),
  recommendation TEXT,
  action_required BOOLEAN DEFAULT FALSE,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on user_id
CREATE INDEX IF NOT EXISTS idx_pest_disease_risks_user_id ON pest_disease_risks(user_id);

-- Create index on farm_id
CREATE INDEX IF NOT EXISTS idx_pest_disease_risks_farm_id ON pest_disease_risks(farm_id);

-- Create index on risk_level for filtering high-priority alerts
CREATE INDEX IF NOT EXISTS idx_pest_disease_risks_risk_level ON pest_disease_risks(risk_level);

-- Create index on detected_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_pest_disease_risks_detected_at ON pest_disease_risks(detected_at);

-- Create index on action_required for filtering actionable alerts
CREATE INDEX IF NOT EXISTS idx_pest_disease_risks_action_required ON pest_disease_risks(action_required);

-- Create index on acknowledged for filtering unacknowledged alerts
CREATE INDEX IF NOT EXISTS idx_pest_disease_risks_acknowledged ON pest_disease_risks(acknowledged);

-- Create composite index for active alerts
CREATE INDEX IF NOT EXISTS idx_pest_disease_risks_active ON pest_disease_risks(user_id, acknowledged, expires_at) 
  WHERE acknowledged = FALSE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

COMMENT ON TABLE pest_disease_risks IS 'Pest and disease risk assessments based on weather conditions';
COMMENT ON COLUMN pest_disease_risks.risk_score IS 'Risk score from 0-100 based on weather conditions';
COMMENT ON COLUMN pest_disease_risks.temperature_factor IS 'Temperature contribution to risk (0-1)';
COMMENT ON COLUMN pest_disease_risks.humidity_factor IS 'Humidity contribution to risk (0-1)';
COMMENT ON COLUMN pest_disease_risks.rainfall_factor IS 'Rainfall contribution to risk (0-1)';
COMMENT ON COLUMN pest_disease_risks.wind_factor IS 'Wind speed contribution to risk (0-1)';
COMMENT ON COLUMN pest_disease_risks.action_required IS 'Whether immediate action is needed';
COMMENT ON COLUMN pest_disease_risks.expires_at IS 'When this risk assessment expires (typically 7 days)';
