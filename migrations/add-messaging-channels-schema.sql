-- Messaging Channels Schema for USSD, SMS, WhatsApp
-- Supports feature phone and messaging app access

-- USSD/SMS/WhatsApp Sessions
CREATE TABLE IF NOT EXISTS messaging_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('ussd', 'sms', 'whatsapp')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  state VARCHAR(100) NOT NULL DEFAULT 'start',
  context JSONB DEFAULT '{}',
  last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
);

CREATE INDEX idx_messaging_sessions_phone ON messaging_sessions(phone_number);
CREATE INDEX idx_messaging_sessions_session_id ON messaging_sessions(session_id);
CREATE INDEX idx_messaging_sessions_user_id ON messaging_sessions(user_id);
CREATE INDEX idx_messaging_sessions_channel ON messaging_sessions(channel);
CREATE INDEX idx_messaging_sessions_expires_at ON messaging_sessions(expires_at);

-- Message Logs (for all channels)
CREATE TABLE IF NOT EXISTS message_logs (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255),
  phone_number VARCHAR(20) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('ussd', 'sms', 'whatsapp')),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text TEXT,
  message_data JSONB,
  status VARCHAR(50) DEFAULT 'sent',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_logs_phone ON message_logs(phone_number);
CREATE INDEX idx_message_logs_session_id ON message_logs(session_id);
CREATE INDEX idx_message_logs_channel ON message_logs(channel);
CREATE INDEX idx_message_logs_created_at ON message_logs(created_at DESC);

-- Phone Number to User Mapping
CREATE TABLE IF NOT EXISTS phone_user_mapping (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  verified BOOLEAN DEFAULT FALSE,
  verification_code VARCHAR(10),
  verification_expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phone_user_mapping_phone ON phone_user_mapping(phone_number);
CREATE INDEX idx_phone_user_mapping_user_id ON phone_user_mapping(user_id);

-- Notification Queue (for SMS/WhatsApp notifications)
CREATE TABLE IF NOT EXISTS notification_queue (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
  notification_type VARCHAR(50) NOT NULL,
  message_text TEXT NOT NULL,
  message_data JSONB,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  scheduled_at TIMESTAMP NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_queue_user_id ON notification_queue(user_id);
CREATE INDEX idx_notification_queue_phone ON notification_queue(phone_number);
CREATE INDEX idx_notification_queue_status ON notification_queue(status);
CREATE INDEX idx_notification_queue_scheduled_at ON notification_queue(scheduled_at);

COMMENT ON TABLE messaging_sessions IS 'Tracks active USSD/SMS/WhatsApp sessions for stateful interactions';
COMMENT ON TABLE message_logs IS 'Logs all inbound and outbound messages across all channels';
COMMENT ON TABLE phone_user_mapping IS 'Maps phone numbers to user accounts for authentication';
COMMENT ON TABLE notification_queue IS 'Queue for sending SMS/WhatsApp notifications';
