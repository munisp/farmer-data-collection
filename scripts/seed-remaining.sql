-- ═══════════════════════════════════════════════════════════════════════════════
-- FarmConnect Platform — Remaining Tables Seed Data
-- Covers 102 additional tables not yet seeded
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── AI & ML ───────────────────────────────────────────────────────────────
INSERT INTO ai_conversations (id, user_id, session_type, language, started_at, messages_count, status) VALUES
  ('conv-001', 'user-001', 'crop_advisory', 'en', '2024-07-20 08:00:00', 5, 'completed'),
  ('conv-002', 'user-002', 'market_inquiry', 'sw', '2024-07-20 09:30:00', 3, 'active'),
  ('conv-003', 'user-003', 'pest_diagnosis', 'en', '2024-07-20 11:00:00', 7, 'completed');

INSERT INTO ml_models (id, name, version, model_type, accuracy, status, trained_at) VALUES
  ('ml-001', 'crop_disease_detector_v3', '3.2.1', 'image_classification', 0.94, 'active', '2024-06-15 04:00:00'),
  ('ml-002', 'yield_predictor_maize', '2.1.0', 'regression', 0.87, 'active', '2024-06-20 04:00:00'),
  ('ml-003', 'price_forecast_ensemble', '1.5.0', 'time_series', 0.91, 'active', '2024-07-01 04:00:00');

INSERT INTO model_benchmarks (id, model_id, metric, value, dataset, evaluated_at) VALUES
  ('bench-001', 'ml-001', 'f1_score', 0.92, 'test_set_v3', '2024-06-15 06:00:00'),
  ('bench-002', 'ml-002', 'rmse', 0.15, 'holdout_2024', '2024-06-20 06:00:00'),
  ('bench-003', 'ml-003', 'mape', 0.08, 'backtest_90d', '2024-07-01 06:00:00');

INSERT INTO model_downloads (id, model_id, user_id, downloaded_at, device_type) VALUES
  ('dl-001', 'ml-001', 'user-001', '2024-07-15 10:00:00', 'android'),
  ('dl-002', 'ml-001', 'user-002', '2024-07-16 11:00:00', 'ios'),
  ('dl-003', 'ml-002', 'user-003', '2024-07-17 09:00:00', 'android');

INSERT INTO model_ratings (id, model_id, user_id, rating, feedback, created_at) VALUES
  ('rate-001', 'ml-001', 'user-001', 5, 'Very accurate detection of cassava mosaic', '2024-07-18 10:00:00'),
  ('rate-002', 'ml-002', 'user-002', 4, 'Good predictions for maize, less accurate for sorghum', '2024-07-19 11:00:00');

INSERT INTO model_sync_queue (id, model_id, device_id, status, queued_at) VALUES
  ('sync-001', 'ml-001', 'device-android-001', 'pending', '2024-07-28 06:00:00'),
  ('sync-002', 'ml-003', 'device-ios-002', 'completed', '2024-07-27 12:00:00');

-- ─── Alerts & Monitoring ───────────────────────────────────────────────────
INSERT INTO alert_thresholds (id, metric, threshold_value, operator, severity, enabled) VALUES
  ('thresh-001', 'soil_moisture', 20.0, 'less_than', 'critical', true),
  ('thresh-002', 'temperature', 40.0, 'greater_than', 'warning', true),
  ('thresh-003', 'ph_level', 4.5, 'less_than', 'critical', true);

INSERT INTO alert_history (id, threshold_id, triggered_at, value, acknowledged, farm_id) VALUES
  ('alert-001', 'thresh-001', '2024-07-25 14:30:00', 18.5, true, 'farm-001'),
  ('alert-002', 'thresh-002', '2024-07-26 13:00:00', 41.2, false, 'farm-002'),
  ('alert-003', 'thresh-001', '2024-07-27 09:00:00', 15.0, false, 'farm-003');

-- ─── API Management ────────────────────────────────────────────────────────
INSERT INTO api_keys (id, name, key_hash, user_id, permissions, rate_limit, created_at, expires_at) VALUES
  ('apikey-001', 'Production App', 'sha256_abc123', 'user-001', '["read:farmers","write:orders"]', 1000, '2024-01-01 00:00:00', '2025-01-01 00:00:00'),
  ('apikey-002', 'Analytics Dashboard', 'sha256_def456', 'user-002', '["read:analytics","read:reports"]', 500, '2024-03-01 00:00:00', '2025-03-01 00:00:00');

INSERT INTO api_webhooks (id, url, events, secret_hash, active, created_at) VALUES
  ('wh-001', 'https://partner.example.com/webhooks/orders', '["order.created","order.fulfilled"]', 'whsec_abc123', true, '2024-02-01 00:00:00'),
  ('wh-002', 'https://analytics.example.com/ingest', '["harvest.recorded","price.updated"]', 'whsec_def456', true, '2024-04-01 00:00:00');

-- ─── Loan & Finance ────────────────────────────────────────────────────────
INSERT INTO application_documents (id, application_id, document_type, file_url, verified, uploaded_at) VALUES
  ('doc-001', 'loan-app-001', 'national_id', '/uploads/docs/id-001.pdf', true, '2024-07-10 09:00:00'),
  ('doc-002', 'loan-app-001', 'farm_title', '/uploads/docs/title-001.pdf', true, '2024-07-10 09:05:00'),
  ('doc-003', 'loan-app-002', 'national_id', '/uploads/docs/id-002.pdf', false, '2024-07-15 10:00:00');

INSERT INTO application_status_history (id, application_id, status, changed_by, reason, changed_at) VALUES
  ('ash-001', 'loan-app-001', 'submitted', 'user-001', 'Initial submission', '2024-07-10 09:10:00'),
  ('ash-002', 'loan-app-001', 'under_review', 'officer-001', 'Documents verified', '2024-07-11 10:00:00'),
  ('ash-003', 'loan-app-001', 'approved', 'officer-001', 'All criteria met', '2024-07-12 14:00:00');

INSERT INTO loan_accounts (id, user_id, loan_type, principal, interest_rate, term_months, status, disbursed_at) VALUES
  ('lacct-001', 'user-001', 'agricultural', 500000, 0.12, 12, 'active', '2024-07-12 15:00:00'),
  ('lacct-002', 'user-002', 'input_financing', 200000, 0.15, 6, 'active', '2024-06-01 10:00:00'),
  ('lacct-003', 'user-003', 'equipment', 1500000, 0.10, 24, 'active', '2024-05-15 09:00:00');

INSERT INTO loans (id, borrower_id, amount, currency, interest_rate, status, purpose, created_at) VALUES
  ('loan-001', 'user-001', 500000, 'NGN', 0.12, 'active', 'Maize planting inputs', '2024-07-12 15:00:00'),
  ('loan-002', 'user-002', 200000, 'NGN', 0.15, 'active', 'Fertilizer purchase', '2024-06-01 10:00:00'),
  ('loan-003', 'user-003', 1500000, 'NGN', 0.10, 'disbursed', 'Tractor acquisition', '2024-05-15 09:00:00');

INSERT INTO loan_repayments (id, loan_id, amount, payment_date, method, status) VALUES
  ('repay-001', 'loan-001', 50000, '2024-08-12 10:00:00', 'mobile_money', 'completed'),
  ('repay-002', 'loan-002', 40000, '2024-07-01 09:00:00', 'bank_transfer', 'completed'),
  ('repay-003', 'loan-001', 50000, '2024-09-12 10:00:00', 'mobile_money', 'pending');

INSERT INTO lenders (id, name, type, interest_rate_min, interest_rate_max, max_loan_amount, active) VALUES
  ('lender-001', 'Kuda MFB', 'microfinance_bank', 0.08, 0.18, 5000000, true),
  ('lender-002', 'FarmFund Nigeria', 'development_finance', 0.05, 0.12, 20000000, true),
  ('lender-003', 'Agri-Credit Union Kano', 'credit_union', 0.10, 0.15, 2000000, true);

INSERT INTO p2p_loans (id, lender_id, borrower_id, amount, interest_rate, term_months, status, created_at) VALUES
  ('p2p-001', 'user-004', 'user-001', 100000, 0.08, 3, 'active', '2024-07-01 10:00:00'),
  ('p2p-002', 'user-005', 'user-002', 250000, 0.10, 6, 'repaid', '2024-04-01 10:00:00');

INSERT INTO disbursement_status_history (id, disbursement_id, status, notes, changed_at) VALUES
  ('dsh-001', 'disb-001', 'initiated', 'Disbursement process started', '2024-07-12 15:00:00'),
  ('dsh-002', 'disb-001', 'completed', 'Funds transferred to M-Pesa', '2024-07-12 15:05:00');

-- ─── HR & Workforce ────────────────────────────────────────────────────────
INSERT INTO attendance_records (id, employee_id, date, check_in, check_out, status) VALUES
  ('att-001', 'emp-001', '2024-07-28', '08:00:00', '17:00:00', 'present'),
  ('att-002', 'emp-002', '2024-07-28', '08:30:00', '17:30:00', 'present'),
  ('att-003', 'emp-003', '2024-07-28', NULL, NULL, 'absent');

INSERT INTO leave_requests (id, employee_id, leave_type, start_date, end_date, status, reason) VALUES
  ('leave-001', 'emp-001', 'annual', '2024-08-01', '2024-08-05', 'approved', 'Family vacation'),
  ('leave-002', 'emp-002', 'sick', '2024-07-20', '2024-07-21', 'approved', 'Medical appointment');

INSERT INTO shifts (id, name, start_time, end_time, days) VALUES
  ('shift-001', 'Morning', '06:00:00', '14:00:00', '["mon","tue","wed","thu","fri"]'),
  ('shift-002', 'Afternoon', '14:00:00', '22:00:00', '["mon","tue","wed","thu","fri"]'),
  ('shift-003', 'Weekend', '08:00:00', '16:00:00', '["sat","sun"]');

INSERT INTO employee_allowances (id, employee_id, allowance_type, amount, currency, effective_date) VALUES
  ('allow-001', 'emp-001', 'transport', 15000, 'NGN', '2024-01-01'),
  ('allow-002', 'emp-001', 'housing', 50000, 'NGN', '2024-01-01'),
  ('allow-003', 'emp-002', 'transport', 12000, 'NGN', '2024-01-01');

INSERT INTO employee_loans (id, employee_id, amount, interest_rate, term_months, status, disbursed_at) VALUES
  ('eloan-001', 'emp-001', 200000, 0.05, 12, 'active', '2024-03-01 10:00:00'),
  ('eloan-002', 'emp-002', 100000, 0.05, 6, 'repaid', '2024-01-01 10:00:00');

INSERT INTO time_entries (id, employee_id, project, hours, date, description) VALUES
  ('te-001', 'emp-001', 'Field Inspection', 4.5, '2024-07-28', 'Visited 3 farms in Kano zone'),
  ('te-002', 'emp-002', 'Data Collection', 6.0, '2024-07-28', 'Registered 8 new farmers'),
  ('te-003', 'emp-003', 'Training', 3.0, '2024-07-28', 'Conducted GAP training session');

-- ─── Financial Transactions ────────────────────────────────────────────────
INSERT INTO bank_transactions (id, account_id, amount, currency, type, reference, description, transaction_date) VALUES
  ('btx-001', 'bank-001', 500000, 'NGN', 'credit', 'TRF/2024/001', 'Loan disbursement', '2024-07-12 15:00:00'),
  ('btx-002', 'bank-001', -50000, 'NGN', 'debit', 'TRF/2024/002', 'Repayment collection', '2024-08-12 10:00:00'),
  ('btx-003', 'bank-002', 1200000, 'NGN', 'credit', 'TRF/2024/003', 'Cocoa sale proceeds', '2024-07-20 14:00:00');

INSERT INTO payment_requests (id, from_user, to_user, amount, currency, status, method, created_at) VALUES
  ('pr-001', 'user-001', 'user-004', 50000, 'NGN', 'completed', 'mobile_money', '2024-08-12 10:00:00'),
  ('pr-002', 'user-002', 'lender-001', 40000, 'NGN', 'completed', 'bank_transfer', '2024-07-01 09:00:00');

INSERT INTO mojaloop_transactions (id, payer_id, payee_id, amount, currency, status, transfer_id, created_at) VALUES
  ('moja-001', 'user-001', 'supplier-001', 75000, 'NGN', 'committed', 'tf-abc-001', '2024-07-25 10:00:00'),
  ('moja-002', 'user-002', 'user-005', 30000, 'NGN', 'committed', 'tf-abc-002', '2024-07-26 11:00:00');

-- ─── Exchange & Trading ────────────────────────────────────────────────────
INSERT INTO exchange_orders (id, trader_id, commodity_id, side, order_type, quantity, price, status, created_at) VALUES
  ('eo-001', 'trader-001', 'cocoa', 'buy', 'limit', 1000, 4500, 'filled', '2024-07-20 09:00:00'),
  ('eo-002', 'trader-002', 'maize', 'sell', 'market', 5000, 280, 'filled', '2024-07-20 09:30:00'),
  ('eo-003', 'trader-001', 'cashew', 'buy', 'limit', 2000, 3200, 'open', '2024-07-28 10:00:00');

INSERT INTO exchange_trades (id, buy_order_id, sell_order_id, commodity_id, quantity, price, executed_at) VALUES
  ('et-001', 'eo-001', 'eo-sell-001', 'cocoa', 1000, 4500, '2024-07-20 09:01:00'),
  ('et-002', 'eo-buy-002', 'eo-002', 'maize', 5000, 280, '2024-07-20 09:31:00');

INSERT INTO exchange_positions (id, trader_id, commodity_id, quantity, avg_price, unrealized_pnl) VALUES
  ('ep-001', 'trader-001', 'cocoa', 1000, 4500, 125000),
  ('ep-002', 'trader-002', 'maize', -5000, 280, -50000);

INSERT INTO exchange_settlements (id, trade_id, status, settled_amount, settled_at) VALUES
  ('es-001', 'et-001', 'settled', 4500000, '2024-07-22 10:00:00'),
  ('es-002', 'et-002', 'settled', 1400000, '2024-07-22 10:00:00');

INSERT INTO exchange_transactions (id, account_id, type, amount, currency, reference, created_at) VALUES
  ('etx-001', 'eacct-001', 'deposit', 10000000, 'NGN', 'DEP-2024-001', '2024-07-01 08:00:00'),
  ('etx-002', 'eacct-001', 'trade_debit', -4500000, 'NGN', 'TRADE-et-001', '2024-07-20 09:01:00');

INSERT INTO exchange_order_events (id, order_id, event_type, details, created_at) VALUES
  ('eoe-001', 'eo-001', 'placed', '{"price":4500,"quantity":1000}', '2024-07-20 09:00:00'),
  ('eoe-002', 'eo-001', 'filled', '{"fill_price":4500,"fill_quantity":1000}', '2024-07-20 09:01:00');

INSERT INTO exchange_price_candles (id, commodity_id, interval, open, high, low, close, volume, timestamp) VALUES
  ('epc-001', 'cocoa', '1h', 4480, 4520, 4470, 4500, 15000, '2024-07-20 09:00:00'),
  ('epc-002', 'maize', '1h', 275, 282, 274, 280, 85000, '2024-07-20 09:00:00');

-- ─── Ledger & Accounting ───────────────────────────────────────────────────
INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, debit, credit, description) VALUES
  ('jel-001', 'je-001', 'acct-cash', 500000, 0, 'Cash received from loan'),
  ('jel-002', 'je-001', 'acct-loan-payable', 0, 500000, 'Loan payable recorded'),
  ('jel-003', 'je-002', 'acct-revenue', 0, 1200000, 'Cocoa sale revenue');

INSERT INTO ledger_entries (id, account_id, amount, type, reference, created_at) VALUES
  ('le-001', 'acct-001', 500000, 'credit', 'loan-disb-001', '2024-07-12 15:00:00'),
  ('le-002', 'acct-002', 50000, 'debit', 'repay-001', '2024-08-12 10:00:00');

INSERT INTO ledger_transactions (id, from_account, to_account, amount, currency, status, created_at) VALUES
  ('lt-001', 'acct-operating', 'acct-user-001', 500000, 'NGN', 'completed', '2024-07-12 15:00:00'),
  ('lt-002', 'acct-user-001', 'acct-operating', 50000, 'NGN', 'completed', '2024-08-12 10:00:00');

INSERT INTO ledger_holds (id, account_id, amount, reason, expires_at, created_at) VALUES
  ('lh-001', 'acct-user-001', 100000, 'escrow_order_001', '2024-08-15 00:00:00', '2024-07-28 10:00:00');

INSERT INTO ledger_daily_snapshots (id, account_id, date, balance, pending_holds) VALUES
  ('lds-001', 'acct-001', '2024-07-28', 4500000, 100000),
  ('lds-002', 'acct-002', '2024-07-28', 12500000, 0);

INSERT INTO ledger_reconciliation (id, account_id, period_start, period_end, status, discrepancy) VALUES
  ('lr-001', 'acct-001', '2024-07-01', '2024-07-31', 'completed', 0);

INSERT INTO depreciation_schedule (id, asset_id, period, amount, accumulated, book_value) VALUES
  ('dep-001', 'asset-001', '2024-07', 25000, 175000, 825000),
  ('dep-002', 'asset-002', '2024-07', 50000, 350000, 1650000);

INSERT INTO annual_reports (id, fiscal_year, report_type, generated_at, status, file_url) VALUES
  ('ar-001', 2023, 'financial_statements', '2024-02-15 10:00:00', 'published', '/reports/2023_financials.pdf'),
  ('ar-002', 2023, 'audit_report', '2024-03-01 10:00:00', 'published', '/reports/2023_audit.pdf');

-- ─── Marketplace & Commerce ────────────────────────────────────────────────
INSERT INTO negotiations (id, buyer_id, seller_id, listing_id, status, created_at) VALUES
  ('neg-001', 'user-002', 'user-001', 'listing-001', 'accepted', '2024-07-15 10:00:00'),
  ('neg-002', 'user-004', 'user-003', 'listing-002', 'pending', '2024-07-28 09:00:00');

INSERT INTO negotiation_offers (id, negotiation_id, offered_by, price, quantity, message, created_at) VALUES
  ('noff-001', 'neg-001', 'user-002', 260, 500, 'Can you do 260/kg for 500kg?', '2024-07-15 10:00:00'),
  ('noff-002', 'neg-001', 'user-001', 270, 500, 'Best I can do is 270/kg', '2024-07-15 11:00:00'),
  ('noff-003', 'neg-001', 'user-002', 270, 500, 'Deal at 270/kg', '2024-07-15 12:00:00');

INSERT INTO negotiation_messages (id, negotiation_id, sender_id, message, created_at) VALUES
  ('nmsg-001', 'neg-001', 'user-002', 'When can you deliver?', '2024-07-15 12:05:00'),
  ('nmsg-002', 'neg-001', 'user-001', 'Next Tuesday, to your warehouse in Kano', '2024-07-15 12:10:00');

INSERT INTO marketplace_messages (id, order_id, sender_id, recipient_id, message, created_at) VALUES
  ('mm-001', 'order-001', 'user-001', 'user-002', 'Your order is being packed', '2024-07-20 14:00:00'),
  ('mm-002', 'order-001', 'user-002', 'user-001', 'Great, thank you!', '2024-07-20 14:05:00');

INSERT INTO bulk_discount_tiers (id, listing_id, min_quantity, discount_percent) VALUES
  ('bdt-001', 'listing-001', 100, 5),
  ('bdt-002', 'listing-001', 500, 10),
  ('bdt-003', 'listing-001', 1000, 15);

INSERT INTO shopping_cart_items (id, user_id, listing_id, quantity, added_at) VALUES
  ('cart-001', 'user-002', 'listing-001', 50, '2024-07-28 10:00:00'),
  ('cart-002', 'user-004', 'listing-003', 100, '2024-07-28 11:00:00');

INSERT INTO delivery_ratings (id, delivery_id, rating, comment, created_at) VALUES
  ('drate-001', 'del-001', 5, 'Fast and produce was fresh', '2024-07-22 16:00:00'),
  ('drate-002', 'del-002', 4, 'Good delivery, slight delay', '2024-07-23 17:00:00');

-- ─── Savings & Groups ──────────────────────────────────────────────────────
INSERT INTO savings_circles (id, name, members_count, contribution_amount, frequency, status, created_at) VALUES
  ('sc-001', 'Kano Women Farmers Circle', 12, 5000, 'weekly', 'active', '2024-01-15 10:00:00'),
  ('sc-002', 'Ondo Cocoa Growers Club', 8, 10000, 'monthly', 'active', '2024-03-01 10:00:00');

INSERT INTO savings_transactions (id, account_id, amount, type, reference, created_at) VALUES
  ('st-001', 'savings-001', 5000, 'deposit', 'weekly-contrib-w30', '2024-07-22 10:00:00'),
  ('st-002', 'savings-001', 5000, 'deposit', 'weekly-contrib-w31', '2024-07-29 10:00:00'),
  ('st-003', 'savings-002', -60000, 'withdrawal', 'payout-jul-2024', '2024-07-31 10:00:00');

INSERT INTO group_members (id, group_id, user_id, role, joined_at) VALUES
  ('gm-001', 'sc-001', 'user-001', 'treasurer', '2024-01-15 10:00:00'),
  ('gm-002', 'sc-001', 'user-002', 'member', '2024-01-15 10:00:00'),
  ('gm-003', 'sc-002', 'user-003', 'chairperson', '2024-03-01 10:00:00');

INSERT INTO group_contributions (id, group_id, member_id, amount, period, paid_at) VALUES
  ('gc-001', 'sc-001', 'user-001', 5000, '2024-W30', '2024-07-22 10:00:00'),
  ('gc-002', 'sc-001', 'user-002', 5000, '2024-W30', '2024-07-22 10:30:00');

INSERT INTO group_savings (id, group_id, total_balance, interest_earned, last_payout_date) VALUES
  ('gs-001', 'sc-001', 360000, 12000, '2024-06-30'),
  ('gs-002', 'sc-002', 480000, 8000, '2024-06-30');

INSERT INTO group_investments (id, group_id, investment_type, amount, expected_return, status, created_at) VALUES
  ('gi-001', 'sc-001', 'cooperative_shares', 100000, 0.12, 'active', '2024-04-01 10:00:00'),
  ('gi-002', 'sc-002', 'treasury_bills', 200000, 0.08, 'active', '2024-05-01 10:00:00');

-- ─── Equipment & Fleet ─────────────────────────────────────────────────────
INSERT INTO equipment_bookings (id, equipment_id, user_id, start_date, end_date, status, total_cost) VALUES
  ('eb-001', 'equip-001', 'user-001', '2024-08-01', '2024-08-03', 'confirmed', 45000),
  ('eb-002', 'equip-002', 'user-003', '2024-08-05', '2024-08-06', 'pending', 30000);

INSERT INTO equipment_rentals (id, equipment_id, renter_id, daily_rate, start_date, end_date, status) VALUES
  ('er-001', 'equip-001', 'user-001', 15000, '2024-08-01', '2024-08-03', 'active'),
  ('er-002', 'equip-003', 'user-002', 8000, '2024-08-10', '2024-08-12', 'reserved');

INSERT INTO equipment_telemetry (id, equipment_id, latitude, longitude, fuel_level, engine_hours, recorded_at) VALUES
  ('et-001', 'equip-001', 12.0022, 8.5920, 0.75, 1250.5, '2024-07-28 14:00:00'),
  ('et-002', 'equip-001', 12.0025, 8.5918, 0.72, 1251.0, '2024-07-28 14:30:00');

INSERT INTO equipment_maintenance_predictions (id, equipment_id, component, failure_probability, predicted_date, severity) VALUES
  ('emp-001', 'equip-001', 'hydraulic_pump', 0.35, '2024-09-15', 'medium'),
  ('emp-002', 'equip-002', 'engine_belt', 0.60, '2024-08-20', 'high');

-- ─── Drone & Imagery ───────────────────────────────────────────────────────
INSERT INTO drone_imagery (id, flight_id, image_type, file_url, resolution_cm, captured_at) VALUES
  ('di-001', 'flight-001', 'rgb', '/imagery/flight-001-rgb.tiff', 2.5, '2024-07-15 10:30:00'),
  ('di-002', 'flight-001', 'ndvi', '/imagery/flight-001-ndvi.tiff', 2.5, '2024-07-15 10:30:00'),
  ('di-003', 'flight-002', 'thermal', '/imagery/flight-002-thermal.tiff', 5.0, '2024-07-20 11:00:00');

-- ─── Agriculture & Crops ───────────────────────────────────────────────────
INSERT INTO crop_analyses (id, crop_id, analysis_type, results, analyzed_at) VALUES
  ('ca-001', 'crop-001', 'nutrient_deficiency', '{"nitrogen":"low","phosphorus":"adequate","potassium":"adequate"}', '2024-07-15 10:00:00'),
  ('ca-002', 'crop-002', 'growth_stage', '{"stage":"flowering","days_to_harvest":45}', '2024-07-20 10:00:00');

INSERT INTO crop_diseases (id, name, crop_type, symptoms, treatment, severity) VALUES
  ('cd-001', 'Cassava Mosaic Disease', 'cassava', 'Yellow-green mottling on leaves, leaf curling', 'Remove infected plants, use resistant varieties', 'high'),
  ('cd-002', 'Maize Streak Virus', 'maize', 'Yellow streaks on leaves parallel to midrib', 'Control leafhopper vectors, resistant varieties', 'medium'),
  ('cd-003', 'Rice Blast', 'rice', 'Diamond-shaped lesions on leaves', 'Apply fungicide, use resistant varieties', 'high');

INSERT INTO disease_follow_ups (id, disease_report_id, notes, status, followed_up_at) VALUES
  ('dfu-001', 'dreport-001', 'Applied neem-based treatment, monitoring', 'in_progress', '2024-07-18 10:00:00'),
  ('dfu-002', 'dreport-002', 'Removed affected plants, no spread observed', 'resolved', '2024-07-22 10:00:00');

INSERT INTO planting_calendars (id, region, crop, optimal_start, optimal_end, season) VALUES
  ('pc-001', 'Northern Nigeria', 'maize', '2024-05-15', '2024-06-30', 'rainy'),
  ('pc-002', 'Southern Nigeria', 'cassava', '2024-03-01', '2024-04-30', 'early_rain'),
  ('pc-003', 'Northern Nigeria', 'groundnut', '2024-06-01', '2024-07-15', 'rainy');

INSERT INTO planting_records (id, farm_id, crop_id, area_ha, planting_date, seed_variety, quantity_kg) VALUES
  ('pr-001', 'farm-001', 'crop-001', 2.5, '2024-06-01', 'SAMMAZ-15', 25),
  ('pr-002', 'farm-002', 'crop-002', 1.0, '2024-03-15', 'TME-419', 500);

INSERT INTO prescription_maps (id, farm_id, map_type, data, generated_at) VALUES
  ('pm-001', 'farm-001', 'fertilizer_application', '{"zones":[{"zone_id":"z1","rate_kg_ha":120,"type":"NPK"},{"zone_id":"z2","rate_kg_ha":80,"type":"urea"}]}', '2024-07-10 08:00:00'),
  ('pm-002', 'farm-002', 'irrigation', '{"zones":[{"zone_id":"z1","duration_min":45},{"zone_id":"z2","duration_min":30}]}', '2024-07-12 08:00:00');

INSERT INTO soil_history (id, farm_id, test_date, ph, nitrogen, phosphorus, potassium, organic_matter) VALUES
  ('sh-001', 'farm-001', '2024-01-15', 6.2, 0.15, 12.5, 180, 2.8),
  ('sh-002', 'farm-001', '2024-07-15', 6.5, 0.18, 14.0, 195, 3.1),
  ('sh-003', 'farm-002', '2024-07-15', 5.8, 0.12, 8.5, 150, 2.2);

INSERT INTO soil_moisture_readings (id, device_id, farm_id, depth_cm, moisture_percent, temperature, recorded_at) VALUES
  ('smr-001', 'iot-001', 'farm-001', 15, 32.5, 28.0, '2024-07-28 08:00:00'),
  ('smr-002', 'iot-001', 'farm-001', 30, 38.2, 26.5, '2024-07-28 08:00:00'),
  ('smr-003', 'iot-002', 'farm-002', 15, 22.0, 30.0, '2024-07-28 08:00:00');

INSERT INTO irrigation_recommendations (id, farm_id, zone, duration_minutes, frequency, priority, generated_at) VALUES
  ('ir-001', 'farm-001', 'zone_a', 45, 'daily', 'high', '2024-07-28 06:00:00'),
  ('ir-002', 'farm-002', 'zone_b', 30, 'twice_daily', 'critical', '2024-07-28 06:00:00');

INSERT INTO farm_boundaries (id, farm_id, geometry_type, coordinates, area_ha, verified) VALUES
  ('fb-001', 'farm-001', 'polygon', '[[12.001,8.591],[12.003,8.591],[12.003,8.593],[12.001,8.593]]', 3.2, true),
  ('fb-002', 'farm-002', 'polygon', '[[7.401,3.901],[7.403,3.901],[7.403,3.903],[7.401,3.903]]', 1.5, true);

INSERT INTO farm_digital_twins (id, farm_id, model_version, last_updated, simulation_results) VALUES
  ('fdt-001', 'farm-001', '2.1', '2024-07-28 06:00:00', '{"predicted_yield_kg":4500,"water_stress":0.15,"nutrient_status":"adequate"}'),
  ('fdt-002', 'farm-002', '2.1', '2024-07-28 06:00:00', '{"predicted_yield_kg":2200,"water_stress":0.45,"nutrient_status":"deficient_N"}');

INSERT INTO farm_profiles (id, farm_id, soil_type, climate_zone, elevation_m, water_source, certified_organic) VALUES
  ('fp-001', 'farm-001', 'sandy_loam', 'guinea_savanna', 520, 'borehole', false),
  ('fp-002', 'farm-002', 'clay_loam', 'tropical_rainforest', 120, 'river', true);

-- ─── Indoor Farming ────────────────────────────────────────────────────────
INSERT INTO grow_recipes (id, crop, environment, light_hours, temperature_c, humidity_pct, nutrient_solution, growth_days) VALUES
  ('gr-001', 'lettuce', 'vertical_farm', 16, 22, 65, 'hydroponic_a_mix', 28),
  ('gr-002', 'tomato', 'greenhouse', 14, 25, 70, 'nutrient_film_technique', 75),
  ('gr-003', 'basil', 'vertical_farm', 14, 24, 60, 'deep_water_culture', 21);

-- ─── ERPNext Integration ───────────────────────────────────────────────────
INSERT INTO erpnext_orders (id, erpnext_id, order_type, customer, total_amount, status, synced_at) VALUES
  ('erpo-001', 'SO-2024-0125', 'sales_order', 'Kano Agro Dealers', 2500000, 'submitted', '2024-07-20 10:00:00'),
  ('erpo-002', 'PO-2024-0089', 'purchase_order', 'Fertilizer Supplies Ltd', 1800000, 'completed', '2024-07-15 09:00:00');

INSERT INTO erpnext_order_items (id, order_id, item_code, item_name, quantity, rate, amount) VALUES
  ('erpi-001', 'erpo-001', 'MAIZE-50KG', 'Maize (50kg bag)', 50, 25000, 1250000),
  ('erpi-002', 'erpo-001', 'COCOA-25KG', 'Cocoa Beans (25kg)', 50, 25000, 1250000),
  ('erpi-003', 'erpo-002', 'NPK-50KG', 'NPK Fertilizer (50kg)', 100, 18000, 1800000);

INSERT INTO erpnext_payments (id, erpnext_id, payment_type, amount, currency, party, status, synced_at) VALUES
  ('erpp-001', 'PE-2024-0200', 'receive', 2500000, 'NGN', 'Kano Agro Dealers', 'submitted', '2024-07-22 10:00:00'),
  ('erpp-002', 'PE-2024-0201', 'pay', 1800000, 'NGN', 'Fertilizer Supplies Ltd', 'submitted', '2024-07-17 09:00:00');

INSERT INTO erpnext_payment_references (id, payment_id, reference_type, reference_name, amount) VALUES
  ('erpref-001', 'erpp-001', 'Sales Order', 'SO-2024-0125', 2500000),
  ('erpref-002', 'erpp-002', 'Purchase Order', 'PO-2024-0089', 1800000);

INSERT INTO erpnext_sync_log (id, entity_type, entity_id, direction, status, synced_at, error) VALUES
  ('esl-001', 'sales_order', 'SO-2024-0125', 'push', 'success', '2024-07-20 10:00:00', NULL),
  ('esl-002', 'payment', 'PE-2024-0200', 'push', 'success', '2024-07-22 10:00:00', NULL),
  ('esl-003', 'customer', 'CUST-005', 'pull', 'failed', '2024-07-23 10:00:00', 'Connection timeout');

INSERT INTO erpnext_sync_queue (id, entity_type, entity_id, operation, priority, status, queued_at) VALUES
  ('esq-001', 'customer', 'CUST-005', 'pull', 'high', 'pending', '2024-07-23 10:05:00'),
  ('esq-002', 'stock_entry', 'STE-2024-0050', 'push', 'normal', 'processing', '2024-07-28 09:00:00');

INSERT INTO erpnext_sync_mapping (id, local_entity, erpnext_entity, field_mapping, active) VALUES
  ('esm-001', 'farmers', 'Customer', '{"name":"customer_name","phone":"mobile_no","region":"territory"}', true),
  ('esm-002', 'produce_listings', 'Item', '{"crop":"item_name","price":"standard_rate","unit":"stock_uom"}', true);

INSERT INTO erpnext_sync_conflicts (id, entity_type, entity_id, local_value, remote_value, resolution, created_at) VALUES
  ('esc-001', 'customer', 'CUST-003', '{"phone":"08012345678"}', '{"phone":"08087654321"}', 'pending', '2024-07-25 10:00:00');

-- ─── Communication & Messaging ─────────────────────────────────────────────
INSERT INTO message_logs (id, channel, recipient, content_hash, status, sent_at) VALUES
  ('mlog-001', 'sms', '+2348012345678', 'sha256_msg001', 'delivered', '2024-07-28 10:00:00'),
  ('mlog-002', 'whatsapp', '+2348098765432', 'sha256_msg002', 'delivered', '2024-07-28 10:05:00'),
  ('mlog-003', 'push', 'device-token-001', 'sha256_msg003', 'sent', '2024-07-28 10:10:00');

INSERT INTO messaging_sessions (id, user_id, channel, started_at, last_message_at, messages_count, status) VALUES
  ('msess-001', 'user-001', 'whatsapp', '2024-07-28 09:00:00', '2024-07-28 09:15:00', 8, 'completed'),
  ('msess-002', 'user-002', 'ussd', '2024-07-28 10:00:00', '2024-07-28 10:02:00', 4, 'completed');

INSERT INTO phone_user_mapping (id, phone_number, user_id, verified, created_at) VALUES
  ('pum-001', '+2348012345678', 'user-001', true, '2024-01-15 10:00:00'),
  ('pum-002', '+2348098765432', 'user-002', true, '2024-02-01 10:00:00');

INSERT INTO ussd_sessions (id, phone_number, session_code, current_menu, data, started_at, last_activity) VALUES
  ('ussd-001', '+2348012345678', '*384*100#', 'main_menu', '{"language":"en"}', '2024-07-28 10:00:00', '2024-07-28 10:02:00'),
  ('ussd-002', '+2348076543210', '*384*100#', 'check_price', '{"language":"ha","commodity":"maize"}', '2024-07-28 10:30:00', '2024-07-28 10:31:00');

INSERT INTO scheduled_reminders (id, user_id, type, message, scheduled_for, channel, status) VALUES
  ('rem-001', 'user-001', 'loan_repayment', 'Your loan repayment of NGN 50,000 is due tomorrow', '2024-08-11 08:00:00', 'sms', 'scheduled'),
  ('rem-002', 'user-003', 'planting_window', 'Optimal planting window for groundnut starts next week', '2024-05-28 08:00:00', 'push', 'sent');

INSERT INTO sms_delivery_logs (id, message_id, provider, status, delivered_at, cost) VALUES
  ('sdl-001', 'mlog-001', 'africas_talking', 'delivered', '2024-07-28 10:00:02', 4.5),
  ('sdl-002', 'sms-002', 'twilio', 'delivered', '2024-07-28 10:05:03', 3.8);

INSERT INTO sms_responses (id, message_id, response_text, received_at) VALUES
  ('sr-001', 'mlog-001', '1', '2024-07-28 10:01:00'),
  ('sr-002', 'sms-003', 'YES', '2024-07-28 11:00:00');

INSERT INTO sms_scheduled_messages (id, recipient, content, scheduled_for, status, campaign) VALUES
  ('ssm-001', '+2348012345678', 'Market price update: Maize NGN 280/kg (+5%)', '2024-07-29 07:00:00', 'scheduled', 'daily_prices'),
  ('ssm-002', '+2348098765432', 'Weather alert: Heavy rain expected in Kano tomorrow', '2024-07-28 18:00:00', 'sent', 'weather_alerts');

-- ─── Reviews & Ratings ─────────────────────────────────────────────────────
INSERT INTO review_responses (id, review_id, responder_id, response, created_at) VALUES
  ('rr-001', 'review-001', 'user-001', 'Thank you for your kind review! We always aim for quality.', '2024-07-20 15:00:00'),
  ('rr-002', 'review-002', 'user-003', 'Sorry about the delay. We have improved our packaging process.', '2024-07-22 10:00:00');

INSERT INTO review_votes (id, review_id, user_id, helpful, created_at) VALUES
  ('rv-001', 'review-001', 'user-004', true, '2024-07-21 10:00:00'),
  ('rv-002', 'review-001', 'user-005', true, '2024-07-21 11:00:00'),
  ('rv-003', 'review-002', 'user-004', false, '2024-07-23 10:00:00');

-- ─── Insurance ─────────────────────────────────────────────────────────────
INSERT INTO insurance_claims (id, policy_id, claim_type, amount, status, evidence, filed_at) VALUES
  ('ic-001', 'policy-001', 'drought', 150000, 'approved', '{"satellite_ndvi":0.15,"rainfall_mm":12}', '2024-07-10 10:00:00'),
  ('ic-002', 'policy-002', 'flood', 200000, 'under_review', '{"water_level_m":2.5,"area_affected_ha":1.2}', '2024-07-25 10:00:00');

-- ─── Supply Chain & Inventory ──────────────────────────────────────────────
INSERT INTO inventory_transactions (id, item_id, type, quantity, reference, created_at) VALUES
  ('it-001', 'inv-001', 'inbound', 500, 'PO-2024-0089', '2024-07-15 10:00:00'),
  ('it-002', 'inv-001', 'outbound', -100, 'SO-2024-0125', '2024-07-20 14:00:00'),
  ('it-003', 'inv-002', 'adjustment', -5, 'STOCK-COUNT-JUL', '2024-07-28 16:00:00');

INSERT INTO supply_contracts (id, supplier_id, buyer_id, commodity, quantity, price_per_unit, start_date, end_date, status) VALUES
  ('sc-001', 'user-001', 'user-004', 'maize', 5000, 280, '2024-07-01', '2024-12-31', 'active'),
  ('sc-002', 'user-003', 'user-005', 'cocoa', 2000, 4500, '2024-08-01', '2025-02-28', 'pending');

-- ─── Extensions & Field Work ───────────────────────────────────────────────
INSERT INTO extension_worker_visits (id, worker_id, farmer_id, visit_date, purpose, notes, duration_minutes) VALUES
  ('ewv-001', 'emp-001', 'user-001', '2024-07-15', 'crop_monitoring', 'Maize at tasseling stage, good health', 45),
  ('ewv-002', 'emp-002', 'user-002', '2024-07-18', 'pest_management', 'Advised on armyworm control measures', 60);

-- ─── Export & Scheduling ───────────────────────────────────────────────────
INSERT INTO export_schedules (id, report_type, frequency, format, recipients, last_run, next_run, active) VALUES
  ('es-001', 'daily_transactions', 'daily', 'csv', '["finance@farmconnect.ng"]', '2024-07-28 06:00:00', '2024-07-29 06:00:00', true),
  ('es-002', 'weekly_farmer_report', 'weekly', 'pdf', '["operations@farmconnect.ng","cto@farmconnect.ng"]', '2024-07-22 06:00:00', '2024-07-29 06:00:00', true);

-- ─── Work Orders ───────────────────────────────────────────────────────────
INSERT INTO work_orders (id, title, description, assigned_to, priority, status, due_date, created_at) VALUES
  ('wo-001', 'Tractor Maintenance', 'Scheduled 500-hour service for John Deere 5075E', 'emp-003', 'high', 'in_progress', '2024-08-01', '2024-07-25 10:00:00'),
  ('wo-002', 'Warehouse Fumigation', 'Monthly fumigation of grain storage facility', 'emp-002', 'medium', 'scheduled', '2024-08-05', '2024-07-28 10:00:00');

INSERT INTO work_order_items (id, work_order_id, item, quantity, unit_cost, status) VALUES
  ('woi-001', 'wo-001', 'Engine oil (10W-40)', 5, 3500, 'procured'),
  ('woi-002', 'wo-001', 'Oil filter', 1, 8000, 'procured'),
  ('woi-003', 'wo-002', 'Phosphine tablets', 20, 1500, 'pending');

-- ─── Misc Remaining ────────────────────────────────────────────────────────
INSERT INTO credit_score_history (id, user_id, score, grade, factors, calculated_at) VALUES
  ('csh-001', 'user-001', 720, 'A', '{"repayment_history":0.95,"loan_utilization":0.3,"account_age_months":18}', '2024-07-01 02:00:00'),
  ('csh-002', 'user-002', 650, 'B', '{"repayment_history":0.85,"loan_utilization":0.6,"account_age_months":8}', '2024-07-01 02:00:00');

INSERT INTO processed_events (id, event_type, payload_hash, processed_at, source) VALUES
  ('pe-001', 'order.created', 'sha256_evt001', '2024-07-28 10:00:00', 'kafka'),
  ('pe-002', 'payment.processed', 'sha256_evt002', '2024-07-28 10:01:00', 'kafka');

INSERT INTO user_notification_preferences (id, user_id, channel, enabled, categories) VALUES
  ('unp-001', 'user-001', 'push', true, '["orders","payments","weather"]'),
  ('unp-002', 'user-001', 'sms', true, '["loan_reminders","price_alerts"]'),
  ('unp-003', 'user-002', 'push', true, '["orders","weather"]');

INSERT INTO account_balances_new (id, account_id, available, pending, reserved, currency, updated_at) VALUES
  ('abn-001', 'acct-001', 4500000, 100000, 50000, 'NGN', '2024-07-28 14:00:00'),
  ('abn-002', 'acct-002', 12500000, 0, 0, 'NGN', '2024-07-28 14:00:00');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Seed complete: 102 tables covered
-- ═══════════════════════════════════════════════════════════════════════════════
