-- Migration: Add Traceability Schema
-- Created: 2024-12-12
-- Description: Adds tables for agricultural product traceability and supply chain tracking

-- Traceability Batches table
CREATE TABLE IF NOT EXISTS traceability_batches (
  id SERIAL PRIMARY KEY,
  batch_code VARCHAR(50) NOT NULL UNIQUE,
  product_type VARCHAR(100) NOT NULL,
  crop_name VARCHAR(100),
  variety VARCHAR(100),
  quantity DECIMAL(15, 2) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  quality_grade VARCHAR(20),
  origin_farm_id INTEGER,
  origin_farmer_id INTEGER,
  origin_cooperative_id INTEGER,
  harvest_date DATE,
  production_date DATE,
  expiry_date DATE,
  certification TEXT,
  organic BOOLEAN DEFAULT FALSE,
  fair_trade BOOLEAN DEFAULT FALSE,
  current_location VARCHAR(255),
  current_holder_id INTEGER,
  current_holder_type VARCHAR(50),
  status VARCHAR(20) DEFAULT 'created',
  qr_code_url VARCHAR(500),
  blockchain_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Traceability Events table
CREATE TABLE IF NOT EXISTS traceability_events (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES traceability_batches(id),
  event_type VARCHAR(50) NOT NULL,
  event_date TIMESTAMP NOT NULL,
  location VARCHAR(255),
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  actor_id INTEGER,
  actor_type VARCHAR(50),
  actor_name VARCHAR(255),
  description TEXT,
  quantity_change DECIMAL(15, 2),
  new_quantity DECIMAL(15, 2),
  temperature DECIMAL(5, 2),
  humidity DECIMAL(5, 2),
  notes TEXT,
  documents TEXT,
  photos TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verified_by INTEGER,
  verified_at TIMESTAMP,
  blockchain_tx_hash VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Collection Centers table
CREATE TABLE IF NOT EXISTS collection_centers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE,
  center_type VARCHAR(50) DEFAULT 'collection',
  address TEXT,
  region VARCHAR(100),
  district VARCHAR(100),
  country VARCHAR(50) DEFAULT 'Nigeria',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  capacity DECIMAL(15, 2),
  capacity_unit VARCHAR(20),
  current_stock DECIMAL(15, 2) DEFAULT 0,
  manager_id INTEGER,
  phone VARCHAR(20),
  email VARCHAR(255),
  operating_hours VARCHAR(100),
  services TEXT,
  equipment TEXT,
  certifications TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Warehouses table
CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE,
  warehouse_type VARCHAR(50) DEFAULT 'general',
  address TEXT,
  region VARCHAR(100),
  district VARCHAR(100),
  country VARCHAR(50) DEFAULT 'Nigeria',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  total_capacity DECIMAL(15, 2),
  available_capacity DECIMAL(15, 2),
  capacity_unit VARCHAR(20),
  temperature_controlled BOOLEAN DEFAULT FALSE,
  min_temperature DECIMAL(5, 2),
  max_temperature DECIMAL(5, 2),
  humidity_controlled BOOLEAN DEFAULT FALSE,
  manager_id INTEGER,
  phone VARCHAR(20),
  email VARCHAR(255),
  certifications TEXT,
  insurance_info TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Warehouse Receipts table
CREATE TABLE IF NOT EXISTS warehouse_receipts (
  id SERIAL PRIMARY KEY,
  receipt_number VARCHAR(50) NOT NULL UNIQUE,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
  batch_id INTEGER REFERENCES traceability_batches(id),
  depositor_id INTEGER NOT NULL,
  depositor_type VARCHAR(50),
  product_type VARCHAR(100) NOT NULL,
  quantity DECIMAL(15, 2) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  quality_grade VARCHAR(20),
  deposit_date DATE NOT NULL,
  expected_withdrawal_date DATE,
  actual_withdrawal_date DATE,
  storage_fee_rate DECIMAL(10, 2),
  total_storage_fee DECIMAL(15, 2),
  collateral_value DECIMAL(15, 2),
  pledged_to INTEGER,
  pledge_date DATE,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_traceability_batches_code ON traceability_batches(batch_code);
CREATE INDEX IF NOT EXISTS idx_traceability_batches_farm ON traceability_batches(origin_farm_id);
CREATE INDEX IF NOT EXISTS idx_traceability_batches_farmer ON traceability_batches(origin_farmer_id);
CREATE INDEX IF NOT EXISTS idx_traceability_events_batch ON traceability_events(batch_id);
CREATE INDEX IF NOT EXISTS idx_traceability_events_date ON traceability_events(event_date);
CREATE INDEX IF NOT EXISTS idx_collection_centers_region ON collection_centers(region);
CREATE INDEX IF NOT EXISTS idx_warehouses_region ON warehouses(region);
CREATE INDEX IF NOT EXISTS idx_warehouse_receipts_warehouse ON warehouse_receipts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_receipts_depositor ON warehouse_receipts(depositor_id);
