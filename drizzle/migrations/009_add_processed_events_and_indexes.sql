-- Migration: Add processed_events table for idempotency and indexes for performance
-- Created: 2024-12-11

-- Create processed_events table for webhook/event idempotency
CREATE TABLE IF NOT EXISTS processed_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  source VARCHAR(50) NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW() NOT NULL,
  correlation_id VARCHAR(100),
  metadata JSONB,
  
  -- Unique constraint to prevent duplicate processing
  CONSTRAINT processed_events_unique_idx UNIQUE (event_type, external_id, source)
);

-- Index for cleanup queries (delete old processed events)
CREATE INDEX IF NOT EXISTS processed_events_processed_at_idx ON processed_events (processed_at);

-- Add index on message_logs.external_message_id for efficient delivery report lookups
CREATE INDEX IF NOT EXISTS message_logs_external_message_id_idx ON message_logs (external_message_id);

-- Add index on notification_queue for monitoring queue lag
CREATE INDEX IF NOT EXISTS notification_queue_status_scheduled_idx ON notification_queue (status, scheduled_at);

-- Comment on table
COMMENT ON TABLE processed_events IS 'Tracks processed webhook/event IDs for idempotency - prevents duplicate processing of delivery reports, ERPNext webhooks, etc.';
