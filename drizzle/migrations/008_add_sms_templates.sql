-- SMS Templates Table
CREATE TABLE IF NOT EXISTS sms_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL,
  subject VARCHAR(200),
  body TEXT NOT NULL,
  variables TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  is_default BOOLEAN DEFAULT FALSE NOT NULL,
  usage_count INTEGER DEFAULT 0 NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- SMS Scheduled Messages Table
CREATE TABLE IF NOT EXISTS sms_scheduled_messages (
  id SERIAL PRIMARY KEY,
  template_id INTEGER REFERENCES sms_templates(id),
  recipient_phone VARCHAR(20) NOT NULL,
  recipient_name VARCHAR(200),
  message TEXT NOT NULL,
  scheduled_for TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  sent_at TIMESTAMP,
  delivery_status VARCHAR(20),
  message_id VARCHAR(100),
  error_message TEXT,
  cost INTEGER DEFAULT 0,
  metadata TEXT,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sms_templates_type ON sms_templates(type);
CREATE INDEX IF NOT EXISTS idx_sms_templates_is_active ON sms_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_sms_scheduled_status ON sms_scheduled_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_scheduled_for ON sms_scheduled_messages(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_sms_scheduled_recipient ON sms_scheduled_messages(recipient_phone);

-- Insert default templates
INSERT INTO sms_templates (name, type, subject, body, variables, description, is_default, created_by) VALUES
('Payment Reminder - 3 Days', 'payment_reminder', 'Payment Reminder', 'Dear {{borrowerName}}, this is a reminder that your loan payment of ₦{{amount}} is due on {{dueDate}}. Please make your payment on time to avoid penalties. Thank you!', '["borrowerName", "amount", "dueDate", "loanNumber"]', 'Default payment reminder sent 3 days before due date', true, 1),
('Loan Approval', 'loan_approval', 'Loan Approved', 'Congratulations {{borrowerName}}! Your loan application for ₦{{amount}} has been approved. Disbursement will be processed within 1-3 business days. Loan ID: {{loanNumber}}', '["borrowerName", "amount", "loanNumber", "interestRate", "term"]', 'Notification sent when loan is approved', true, 1),
('Loan Rejection', 'loan_rejection', 'Loan Application Update', 'Dear {{borrowerName}}, we regret to inform you that your loan application has not been approved at this time. Reason: {{reason}}. You may reapply after addressing the concerns.', '["borrowerName", "reason", "loanNumber"]', 'Notification sent when loan is rejected', true, 1),
('Disbursement Notification', 'disbursement', 'Loan Disbursed', 'Dear {{borrowerName}}, your loan of ₦{{amount}} has been disbursed to your account. First payment of ₦{{monthlyPayment}} is due on {{firstPaymentDate}}. Loan ID: {{loanNumber}}', '["borrowerName", "amount", "monthlyPayment", "firstPaymentDate", "loanNumber"]', 'Notification sent when loan is disbursed', true, 1),
('Overdue Payment', 'overdue', 'Overdue Payment Notice', 'Dear {{borrowerName}}, your payment of ₦{{amount}} was due on {{dueDate}} and is now overdue. Please make your payment immediately to avoid additional penalties. Contact us if you need assistance.', '["borrowerName", "amount", "dueDate", "loanNumber", "daysOverdue"]', 'Notification sent for overdue payments', true, 1),
('Payment Confirmation', 'payment_confirmation', 'Payment Received', 'Thank you {{borrowerName}}! We have received your payment of ₦{{amount}} for loan {{loanNumber}}. Your next payment of ₦{{nextAmount}} is due on {{nextDueDate}}.', '["borrowerName", "amount", "loanNumber", "nextAmount", "nextDueDate"]', 'Confirmation sent after payment is received', true, 1);
