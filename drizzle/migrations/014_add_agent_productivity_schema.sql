-- Migration: Add Agent Productivity Schema
-- Created: 2024-12-12
-- Description: Adds tables for field agent task management and performance tracking

-- Agent Tasks table
CREATE TABLE IF NOT EXISTS agent_tasks (
  id SERIAL PRIMARY KEY,
  task_code VARCHAR(50),
  agent_id INTEGER NOT NULL,
  assigned_by INTEGER,
  task_type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'pending',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_farmer_id INTEGER,
  target_farm_id INTEGER,
  target_cooperative_id INTEGER,
  target_loan_id INTEGER,
  scheduled_date DATE,
  scheduled_time TIME,
  due_date DATE,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  location_address VARCHAR(500),
  notes TEXT,
  outcome VARCHAR(50),
  outcome_notes TEXT,
  attachments TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent Visits table
CREATE TABLE IF NOT EXISTS agent_visits (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  task_id INTEGER REFERENCES agent_tasks(id),
  farmer_id INTEGER,
  farm_id INTEGER,
  visit_type VARCHAR(50) NOT NULL,
  visit_date DATE NOT NULL,
  check_in_time TIMESTAMP,
  check_out_time TIMESTAMP,
  check_in_lat DECIMAL(10, 8),
  check_in_lng DECIMAL(11, 8),
  check_out_lat DECIMAL(10, 8),
  check_out_lng DECIMAL(11, 8),
  duration_minutes INTEGER,
  distance_km DECIMAL(10, 2),
  purpose TEXT,
  findings TEXT,
  recommendations TEXT,
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_date DATE,
  photos TEXT,
  signature_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent Performance Metrics table
CREATE TABLE IF NOT EXISTS agent_performance_metrics (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  period_type VARCHAR(20) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  tasks_assigned INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  tasks_overdue INTEGER DEFAULT 0,
  visits_made INTEGER DEFAULT 0,
  visit_success_rate DECIMAL(5, 2),
  farmers_registered INTEGER DEFAULT 0,
  farms_mapped INTEGER DEFAULT 0,
  loans_assessed INTEGER DEFAULT 0,
  repayments_collected DECIMAL(15, 2) DEFAULT 0,
  total_distance_km DECIMAL(10, 2) DEFAULT 0,
  avg_visit_duration_minutes INTEGER,
  customer_satisfaction_score DECIMAL(3, 2),
  data_quality_score DECIMAL(3, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent Dashboard Stats table
CREATE TABLE IF NOT EXISTS agent_dashboard_stats (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  stat_date DATE NOT NULL,
  pending_tasks INTEGER DEFAULT 0,
  completed_today INTEGER DEFAULT 0,
  overdue_tasks INTEGER DEFAULT 0,
  visits_today INTEGER DEFAULT 0,
  distance_today_km DECIMAL(10, 2) DEFAULT 0,
  farmers_visited_today INTEGER DEFAULT 0,
  collections_today DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id, stat_date)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_scheduled ON agent_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_agent_visits_agent ON agent_visits(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_visits_date ON agent_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_agent_performance_agent ON agent_performance_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_dashboard_agent_date ON agent_dashboard_stats(agent_id, stat_date);
