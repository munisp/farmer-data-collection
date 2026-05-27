-- ERPNext Integration Database Migration Script
-- This script creates all necessary tables for ERPNext bidirectional synchronization
-- Run this script against your PostgreSQL database before using ERPNext integration

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ERPNext Configuration Table
-- Stores ERPNext instance connection details per user
-- ============================================================================
CREATE TABLE IF NOT EXISTS erpnext_config (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  erpnext_url VARCHAR(500) NOT NULL,
  api_key VARCHAR(500) NOT NULL,  -- TODO: Encrypt in production
  api_secret VARCHAR(500) NOT NULL,  -- TODO: Encrypt in production
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_erpnext_config_user_id ON erpnext_config(user_id);

-- ============================================================================
-- ERPNext Sync Configuration Table
-- Per-entity sync settings (enable/disable, direction, conflict resolution)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erpnext_sync_config (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  entity_type VARCHAR(50) NOT NULL,  -- customer, supplier, item, invoice, payment, journal
  sync_enabled BOOLEAN DEFAULT true,
  sync_direction VARCHAR(20) DEFAULT 'both',  -- push, pull, both
  conflict_resolution VARCHAR(20) DEFAULT 'erpnext_wins',  -- erpnext_wins, platform_wins, manual
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_erpnext_sync_config_user_id ON erpnext_sync_config(user_id);
CREATE INDEX IF NOT EXISTS idx_erpnext_sync_config_entity_type ON erpnext_sync_config(entity_type);

-- ============================================================================
-- ERPNext Entity Mappings Table
-- Maps platform entities to ERPNext entities (bidirectional lookup)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erpnext_entity_mappings (
  id SERIAL PRIMARY KEY,
  platform_entity VARCHAR(50) NOT NULL,  -- user, supplier, inventory_item, order, payment, journal_entry
  platform_id VARCHAR(100) NOT NULL,
  erpnext_entity VARCHAR(50) NOT NULL,  -- Customer, Supplier, Item, Sales Invoice, Payment Entry, Journal Entry
  erpnext_id VARCHAR(100) NOT NULL,
  last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform_entity, platform_id),
  UNIQUE(erpnext_entity, erpnext_id)
);

CREATE INDEX IF NOT EXISTS idx_erpnext_mappings_platform ON erpnext_entity_mappings(platform_entity, platform_id);
CREATE INDEX IF NOT EXISTS idx_erpnext_mappings_erpnext ON erpnext_entity_mappings(erpnext_entity, erpnext_id);

-- ============================================================================
-- ERPNext Sync Logs Table
-- Audit trail of all sync operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS erpnext_sync_logs (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL,
  sync_type VARCHAR(10) NOT NULL,  -- push, pull
  status VARCHAR(20) NOT NULL,  -- success, error
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erpnext_sync_logs_entity_type ON erpnext_sync_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_erpnext_sync_logs_sync_type ON erpnext_sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_erpnext_sync_logs_status ON erpnext_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_erpnext_sync_logs_synced_at ON erpnext_sync_logs(synced_at DESC);

-- ============================================================================
-- ERPNext Sync Queue Table
-- Queue for pending sync operations (for async processing)
-- ============================================================================
CREATE TABLE IF NOT EXISTS erpnext_sync_queue (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  sync_direction VARCHAR(10) NOT NULL,  -- push, pull
  priority INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erpnext_sync_queue_user_id ON erpnext_sync_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_erpnext_sync_queue_status ON erpnext_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_erpnext_sync_queue_scheduled_at ON erpnext_sync_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_erpnext_sync_queue_priority ON erpnext_sync_queue(priority DESC);

-- ============================================================================
-- ERPNext Conflict Resolution Table
-- Stores conflicts that require manual resolution
-- ============================================================================
CREATE TABLE IF NOT EXISTS erpnext_conflicts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  platform_id VARCHAR(100) NOT NULL,
  erpnext_id VARCHAR(100) NOT NULL,
  conflict_type VARCHAR(50) NOT NULL,  -- data_mismatch, duplicate, missing_reference
  platform_data JSONB,
  erpnext_data JSONB,
  resolution_strategy VARCHAR(20),  -- erpnext_wins, platform_wins, merge, skip
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP,
  resolved_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_erpnext_conflicts_user_id ON erpnext_conflicts(user_id);
CREATE INDEX IF NOT EXISTS idx_erpnext_conflicts_resolved ON erpnext_conflicts(resolved);
CREATE INDEX IF NOT EXISTS idx_erpnext_conflicts_entity_type ON erpnext_conflicts(entity_type);

-- ============================================================================
-- Verification Queries
-- Run these to verify tables were created successfully
-- ============================================================================

-- Count of tables created
SELECT 
  'erpnext_config' as table_name,
  COUNT(*) as row_count
FROM erpnext_config
UNION ALL
SELECT 
  'erpnext_sync_config',
  COUNT(*)
FROM erpnext_sync_config
UNION ALL
SELECT 
  'erpnext_entity_mappings',
  COUNT(*)
FROM erpnext_entity_mappings
UNION ALL
SELECT 
  'erpnext_sync_logs',
  COUNT(*)
FROM erpnext_sync_logs
UNION ALL
SELECT 
  'erpnext_sync_queue',
  COUNT(*)
FROM erpnext_sync_queue
UNION ALL
SELECT 
  'erpnext_conflicts',
  COUNT(*)
FROM erpnext_conflicts;

-- ============================================================================
-- Rollback Script (use if you need to remove ERPNext tables)
-- ============================================================================

/*
-- Uncomment to rollback (WARNING: This will delete all ERPNext sync data)

DROP TABLE IF EXISTS erpnext_conflicts CASCADE;
DROP TABLE IF EXISTS erpnext_sync_queue CASCADE;
DROP TABLE IF EXISTS erpnext_sync_logs CASCADE;
DROP TABLE IF EXISTS erpnext_entity_mappings CASCADE;
DROP TABLE IF EXISTS erpnext_sync_config CASCADE;
DROP TABLE IF EXISTS erpnext_config CASCADE;

*/

-- ============================================================================
-- Migration Complete
-- ============================================================================

SELECT 'ERPNext database migration completed successfully!' as status;
