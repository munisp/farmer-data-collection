-- Create user_notification_preferences table
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sms_enabled BOOLEAN DEFAULT true,
  payment_reminders BOOLEAN DEFAULT true,
  loan_approvals BOOLEAN DEFAULT true,
  disbursement_notifications BOOLEAN DEFAULT true,
  overdue_alerts BOOLEAN DEFAULT true,
  marketing_messages BOOLEAN DEFAULT false,
  reminder_days_before INTEGER DEFAULT 3 CHECK (reminder_days_before BETWEEN 1 AND 7),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON user_notification_preferences(user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notification_prefs_timestamp
BEFORE UPDATE ON user_notification_preferences
FOR EACH ROW
EXECUTE FUNCTION update_notification_prefs_updated_at();
