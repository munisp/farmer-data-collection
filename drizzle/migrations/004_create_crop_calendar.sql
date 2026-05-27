-- Create crop_calendar table for GDD-based planting and harvesting predictions
CREATE TABLE IF NOT EXISTS crop_calendar (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_id INTEGER REFERENCES farms(id) ON DELETE CASCADE,
  crop_name VARCHAR(100) NOT NULL,
  crop_variety VARCHAR(100),
  planting_date DATE NOT NULL,
  expected_harvest_date DATE,
  actual_harvest_date DATE,
  growth_stage VARCHAR(50) NOT NULL DEFAULT 'planning',
  base_temperature DECIMAL(5,2) DEFAULT 10.0,
  gdd_target INTEGER NOT NULL,
  gdd_accumulated INTEGER DEFAULT 0,
  days_to_maturity INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'planned',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on user_id for fast user-specific queries
CREATE INDEX IF NOT EXISTS idx_crop_calendar_user_id ON crop_calendar(user_id);

-- Create index on farm_id
CREATE INDEX IF NOT EXISTS idx_crop_calendar_farm_id ON crop_calendar(farm_id);

-- Create index on planting_date for date range queries
CREATE INDEX IF NOT EXISTS idx_crop_calendar_planting_date ON crop_calendar(planting_date);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_crop_calendar_status ON crop_calendar(status);

-- Create index on growth_stage
CREATE INDEX IF NOT EXISTS idx_crop_calendar_growth_stage ON crop_calendar(growth_stage);

COMMENT ON TABLE crop_calendar IS 'Crop calendar with GDD-based planting and harvesting predictions';
COMMENT ON COLUMN crop_calendar.base_temperature IS 'Base temperature for GDD calculation in Celsius';
COMMENT ON COLUMN crop_calendar.gdd_target IS 'Target GDD for crop maturity';
COMMENT ON COLUMN crop_calendar.gdd_accumulated IS 'Accumulated GDD since planting';
COMMENT ON COLUMN crop_calendar.growth_stage IS 'Current growth stage: planning, germination, vegetative, flowering, fruiting, maturity, harvested';
COMMENT ON COLUMN crop_calendar.status IS 'Calendar status: planned, active, completed, cancelled';
