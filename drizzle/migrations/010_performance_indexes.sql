-- Performance Indexes for Hot Paths
-- This migration adds indexes to optimize common query patterns

-- ============================================================================
-- Marketplace Search Indexes
-- ============================================================================

-- Product listings search by category, location, and status
CREATE INDEX IF NOT EXISTS idx_listings_category_status ON listings(category, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(location);
CREATE INDEX IF NOT EXISTS idx_listings_price_range ON listings(price) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_listings_seller_id ON listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON listings(created_at DESC);

-- Product search full-text (if not already exists)
CREATE INDEX IF NOT EXISTS idx_listings_search ON listings USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- ============================================================================
-- Microfinance Indexes
-- ============================================================================

-- Loan queries by status and user
CREATE INDEX IF NOT EXISTS idx_loans_user_status ON loans(user_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_status_due_date ON loans(status, due_date) WHERE status IN ('active', 'overdue');
CREATE INDEX IF NOT EXISTS idx_loans_lender_status ON loans(lender_id, status);

-- Loan applications
CREATE INDEX IF NOT EXISTS idx_loan_applications_user ON loan_applications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_applications_status_created ON loan_applications(status, created_at DESC);

-- Repayments
CREATE INDEX IF NOT EXISTS idx_repayments_loan_id ON repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_repayments_due_date ON repayments(due_date) WHERE status = 'pending';

-- ============================================================================
-- Exchange Indexes
-- ============================================================================

-- Order book queries (most critical for exchange performance)
CREATE INDEX IF NOT EXISTS idx_exchange_orders_book ON exchange_orders(commodity_id, side, status, price) 
  WHERE status IN ('open', 'partially_filled');
CREATE INDEX IF NOT EXISTS idx_exchange_orders_trader ON exchange_orders(trader_id, status);
CREATE INDEX IF NOT EXISTS idx_exchange_orders_created ON exchange_orders(created_at DESC);

-- Trade history
CREATE INDEX IF NOT EXISTS idx_exchange_trades_commodity ON exchange_trades(commodity_id, trade_time DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_trades_buyer ON exchange_trades(buyer_order_id);
CREATE INDEX IF NOT EXISTS idx_exchange_trades_seller ON exchange_trades(seller_order_id);

-- Price candles for charts
CREATE INDEX IF NOT EXISTS idx_exchange_candles_lookup ON exchange_price_candles(commodity_id, interval, period_start DESC);

-- ============================================================================
-- Analytics Indexes
-- ============================================================================

-- User activity tracking
CREATE INDEX IF NOT EXISTS idx_user_activities_user_date ON user_activities(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activities_type_date ON user_activities(activity_type, created_at DESC);

-- Event analytics
CREATE INDEX IF NOT EXISTS idx_events_type_date ON events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user_date ON events(user_id, created_at DESC);

-- ============================================================================
-- Farmer Management Indexes
-- ============================================================================

-- Farmer search
CREATE INDEX IF NOT EXISTS idx_farmers_phone ON farmers(phone);
CREATE INDEX IF NOT EXISTS idx_farmers_national_id ON farmers(national_id) WHERE national_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_farmers_location ON farmers(village, district, region);
CREATE INDEX IF NOT EXISTS idx_farmers_status ON farmers(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_farmers_search ON farmers USING gin(to_tsvector('english', first_name || ' ' || last_name));

-- Farm queries
CREATE INDEX IF NOT EXISTS idx_farms_farmer ON farms(farmer_id);
CREATE INDEX IF NOT EXISTS idx_farms_location ON farms USING gist(location) WHERE location IS NOT NULL;

-- Crop and harvest tracking
CREATE INDEX IF NOT EXISTS idx_crops_farm ON crops(farm_id);
CREATE INDEX IF NOT EXISTS idx_harvests_crop_date ON harvests(crop_id, harvest_date DESC);

-- ============================================================================
-- Communication Indexes
-- ============================================================================

-- SMS/Message logs
CREATE INDEX IF NOT EXISTS idx_message_logs_recipient ON message_logs(recipient_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_logs_status ON message_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_logs_external_id ON message_logs(external_message_id) WHERE external_message_id IS NOT NULL;

-- Notification queue
CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_user ON notification_queue(user_id, created_at DESC);

-- ============================================================================
-- Financial Indexes
-- ============================================================================

-- Account balances
CREATE INDEX IF NOT EXISTS idx_account_balances_user ON account_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_account_balances_type ON account_balances(account_type);

-- Transactions
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(transaction_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference_id) WHERE reference_id IS NOT NULL;

-- ============================================================================
-- Audit and Security Indexes
-- ============================================================================

-- Audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_date ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Processed events (idempotency)
CREATE INDEX IF NOT EXISTS idx_processed_events_lookup ON processed_events(event_type, event_id);

-- ============================================================================
-- Partial Indexes for Common Filters
-- ============================================================================

-- Active users only
CREATE INDEX IF NOT EXISTS idx_users_active ON users(email) WHERE is_active = true;

-- Pending approvals
CREATE INDEX IF NOT EXISTS idx_pending_approvals ON loan_applications(created_at DESC) WHERE status = 'pending';

-- Overdue loans
CREATE INDEX IF NOT EXISTS idx_overdue_loans ON loans(due_date) WHERE status = 'overdue';

-- ============================================================================
-- Composite Indexes for Common Joins
-- ============================================================================

-- Farmer with farms
CREATE INDEX IF NOT EXISTS idx_farmer_farms_composite ON farms(farmer_id, status);

-- User orders
CREATE INDEX IF NOT EXISTS idx_user_orders_composite ON orders(buyer_id, status, created_at DESC);

-- Seller listings
CREATE INDEX IF NOT EXISTS idx_seller_listings_composite ON listings(seller_id, status, created_at DESC);
