-- FarmConnect Extended Seed Data
-- Covers financial, exchange, KYC, agent, cooperative, precision agriculture,
-- ERPNext, loan, credit scoring, disbursement, ledger, notifications, platform extensions
-- Run after scripts/seed.sql

-- ============================================================
-- FINANCIAL MODULE (31 tables)
-- ============================================================

-- Journal Entries
INSERT INTO journal_entries (id, entry_number, entry_date, description, total_debit, total_credit, status, created_by, approved_by) VALUES
('JE-001', 'JE-2024-001', '2024-01-15', 'Seed purchase from Syngenta Nigeria', 450000, 450000, 'posted', 19, 20),
('JE-002', 'JE-2024-002', '2024-01-20', 'Fertilizer bulk purchase', 850000, 850000, 'posted', 19, 20),
('JE-003', 'JE-2024-003', '2024-02-01', 'Revenue from maize sales Batch B-001', 2400000, 2400000, 'posted', 19, 20),
('JE-004', 'JE-2024-004', '2024-02-10', 'Transport cost for delivery zone Lagos-Central', 180000, 180000, 'draft', 19, NULL),
('JE-005', 'JE-2024-005', '2024-02-15', 'Commission to agent Kayode', 125000, 125000, 'posted', 19, 20);

-- Financial Periods
INSERT INTO financial_periods (id, period_name, start_date, end_date, status, fiscal_year) VALUES
('FP-Q1-24', 'Q1 2024', '2024-01-01', '2024-03-31', 'closed', 2024),
('FP-Q2-24', 'Q2 2024', '2024-04-01', '2024-06-30', 'closed', 2024),
('FP-Q3-24', 'Q3 2024', '2024-07-01', '2024-09-30', 'active', 2024),
('FP-Q4-24', 'Q4 2024', '2024-10-01', '2024-12-31', 'future', 2024);

-- Employees
INSERT INTO employees (id, user_id, employee_number, first_name, last_name, email, department, position, hire_date, salary, status) VALUES
('EMP-001', 19, 'FC-EMP-001', 'Admin', 'FarmConnect', 'admin@farmconnect.ng', 'Operations', 'Platform Manager', '2023-01-15', 950000, 'active'),
('EMP-002', 21, 'FC-EMP-002', 'Kayode', 'Olaniyi', 'agent.oyo@farmconnect.ng', 'Field Operations', 'Senior Agent', '2023-03-01', 420000, 'active'),
('EMP-003', 22, 'FC-EMP-003', 'Chidinma', 'Onuoha', 'agent.anambra@farmconnect.ng', 'Field Operations', 'Agent', '2023-06-15', 350000, 'active'),
('EMP-004', 16, 'FC-EMP-004', 'Sunday', 'Okeke', 'driver.lagos@farmconnect.ng', 'Logistics', 'Senior Driver', '2023-02-01', 280000, 'active'),
('EMP-005', 17, 'FC-EMP-005', 'Musa', 'Garba', 'driver.abuja@farmconnect.ng', 'Logistics', 'Driver', '2023-04-01', 250000, 'active');

-- Payroll Records
INSERT INTO payroll_records (id, employee_id, period, gross_salary, tax, pension, net_salary, status, paid_at) VALUES
('PAY-001', 'EMP-001', '2024-07', 950000, 142500, 76000, 731500, 'paid', '2024-07-28'),
('PAY-002', 'EMP-002', '2024-07', 420000, 42000, 33600, 344400, 'paid', '2024-07-28'),
('PAY-003', 'EMP-003', '2024-07', 350000, 31500, 28000, 290500, 'paid', '2024-07-28'),
('PAY-004', 'EMP-004', '2024-07', 280000, 22400, 22400, 235200, 'paid', '2024-07-28'),
('PAY-005', 'EMP-005', '2024-07', 250000, 18750, 20000, 211250, 'paid', '2024-07-28');

-- Fixed Assets
INSERT INTO fixed_assets (id, asset_number, name, category, purchase_date, purchase_cost, useful_life_months, depreciation_method, current_value, status) VALUES
('FA-001', 'FC-ASSET-001', 'Cold Storage Facility Lagos', 'Building', '2023-01-15', 45000000, 240, 'straight_line', 42750000, 'active'),
('FA-002', 'FC-ASSET-002', 'Delivery Truck (3-ton Refrigerated)', 'Vehicle', '2023-03-01', 18500000, 96, 'straight_line', 15583333, 'active'),
('FA-003', 'FC-ASSET-003', 'IoT Sensor Network (100 units)', 'Equipment', '2023-06-01', 8500000, 60, 'straight_line', 6516667, 'active'),
('FA-004', 'FC-ASSET-004', 'Server Infrastructure', 'IT Equipment', '2023-02-01', 12000000, 48, 'straight_line', 7500000, 'active'),
('FA-005', 'FC-ASSET-005', 'Drone Fleet (5 units)', 'Equipment', '2023-09-01', 15000000, 36, 'straight_line', 10000000, 'active');

-- ============================================================
-- LEDGER MODULE (9 tables)
-- ============================================================

INSERT INTO ledger_account_types (id, name, normal_balance, category) VALUES
('LAT-001', 'Asset', 'debit', 'balance_sheet'),
('LAT-002', 'Liability', 'credit', 'balance_sheet'),
('LAT-003', 'Equity', 'credit', 'balance_sheet'),
('LAT-004', 'Revenue', 'credit', 'income_statement'),
('LAT-005', 'Expense', 'debit', 'income_statement');

INSERT INTO ledger_accounts (id, account_number, name, type_id, parent_id, currency, balance, is_active) VALUES
('LA-001', '1001', 'Cash at Bank (NGN)', 'LAT-001', NULL, 'NGN', 45800000, true),
('LA-002', '1002', 'Accounts Receivable', 'LAT-001', NULL, 'NGN', 12500000, true),
('LA-003', '1003', 'Inventory - Farm Produce', 'LAT-001', NULL, 'NGN', 28700000, true),
('LA-004', '2001', 'Accounts Payable', 'LAT-002', NULL, 'NGN', 8900000, true),
('LA-005', '2002', 'Escrow Liability', 'LAT-002', NULL, 'NGN', 15600000, true),
('LA-006', '3001', 'Retained Earnings', 'LAT-003', NULL, 'NGN', 62000000, true),
('LA-007', '4001', 'Marketplace Revenue', 'LAT-004', NULL, 'NGN', 89500000, true),
('LA-008', '4002', 'Delivery Fee Revenue', 'LAT-004', NULL, 'NGN', 12800000, true),
('LA-009', '5001', 'Logistics Costs', 'LAT-005', NULL, 'NGN', 18500000, true),
('LA-010', '5002', 'Agent Commissions', 'LAT-005', NULL, 'NGN', 8700000, true);

INSERT INTO ledger_fee_schedule (id, name, fee_type, amount, percentage, min_amount, max_amount, currency, is_active) VALUES
('LFS-001', 'Marketplace Transaction Fee', 'percentage', 0, 2.5, 500, 50000, 'NGN', true),
('LFS-002', 'Delivery Flat Fee', 'fixed', 1500, 0, 1500, 1500, 'NGN', true),
('LFS-003', 'Escrow Processing Fee', 'percentage', 0, 1.0, 200, 25000, 'NGN', true),
('LFS-004', 'Cold Chain Premium', 'percentage', 0, 3.5, 1000, 75000, 'NGN', true),
('LFS-005', 'Agent Commission', 'percentage', 0, 5.0, 500, 100000, 'NGN', true);

-- ============================================================
-- EXCHANGE MODULE (11 tables)
-- ============================================================

INSERT INTO exchange_commodities (id, symbol, name, category, unit, min_lot_size, tick_size, is_active) VALUES
('EC-001', 'MAIZE-NG', 'Nigerian Maize', 'grain', 'kg', 100, 50, true),
('EC-002', 'RICE-NG', 'Nigerian Rice (Ofada)', 'grain', 'kg', 50, 100, true),
('EC-003', 'CASSAVA-NG', 'Nigerian Cassava', 'tuber', 'kg', 200, 25, true),
('EC-004', 'COCOA-NG', 'Nigerian Cocoa', 'cash_crop', 'kg', 25, 500, true),
('EC-005', 'PALM-NG', 'Palm Oil (Nigerian)', 'oil', 'litre', 50, 100, true),
('EC-006', 'CATFISH-NG', 'Catfish (Table Size)', 'aquaculture', 'kg', 10, 200, true),
('EC-007', 'TILAPIA-NG', 'Tilapia (Table Size)', 'aquaculture', 'kg', 10, 150, true),
('EC-008', 'TOMATO-NG', 'Fresh Tomatoes', 'vegetable', 'basket', 5, 500, true);

INSERT INTO exchange_traders (id, user_id, trader_type, company_name, verification_status, trading_limit, total_volume, total_trades) VALUES
('ET-001', 1, 'farmer', NULL, 'verified', 5000000, 2450000, 18),
('ET-002', 11, 'buyer', 'Lagos Fresh Mart', 'verified', 25000000, 18500000, 45),
('ET-003', 12, 'buyer', 'Abuja Agro Traders', 'verified', 15000000, 12800000, 32),
('ET-004', 5, 'farmer', NULL, 'verified', 3000000, 1200000, 12),
('ET-005', 13, 'buyer', 'Kano Commodity Exchange', 'verified', 50000000, 35000000, 78);

INSERT INTO exchange_accounts (id, trader_id, currency, balance, available_balance, frozen_balance, margin_balance) VALUES
('EA-001', 'ET-001', 'NGN', 2450000, 2100000, 350000, 0),
('EA-002', 'ET-002', 'NGN', 18500000, 15200000, 3300000, 0),
('EA-003', 'ET-003', 'NGN', 12800000, 10500000, 2300000, 0),
('EA-004', 'ET-004', 'NGN', 1200000, 950000, 250000, 0),
('EA-005', 'ET-005', 'NGN', 35000000, 28000000, 7000000, 0);

-- ============================================================
-- KYC MODULE (5 tables)
-- ============================================================

INSERT INTO user_kyc_profiles (id, user_id, tier, status, first_name, last_name, date_of_birth, nationality, phone_verified, email_verified, risk_score) VALUES
('KYC-001', 1, 'tier_3', 'approved', 'Adebayo', 'Okonkwo', '1985-03-15', 'NG', true, true, 15),
('KYC-002', 2, 'tier_2', 'approved', 'Chinwe', 'Eze', '1990-07-22', 'NG', true, true, 22),
('KYC-003', 11, 'tier_3', 'approved', 'Tunde', 'Bakare', '1978-11-05', 'NG', true, true, 10),
('KYC-004', 4, 'tier_1', 'approved', 'Fatima', 'Abdullahi', '1992-01-30', 'NG', true, false, 35),
('KYC-005', 13, 'tier_3', 'approved', 'Aisha', 'Suleiman', '1982-09-18', 'NG', true, true, 12);

INSERT INTO kyc_documents (id, kyc_profile_id, document_type, document_number, issuing_authority, issue_date, expiry_date, verification_status) VALUES
('KYCD-001', 'KYC-001', 'national_id', 'NIN-12345678901', 'NIMC', '2020-01-15', '2030-01-15', 'verified'),
('KYCD-002', 'KYC-001', 'bvn', 'BVN-22345678901', 'CBN', '2018-06-01', NULL, 'verified'),
('KYCD-003', 'KYC-002', 'national_id', 'NIN-23456789012', 'NIMC', '2021-03-20', '2031-03-20', 'verified'),
('KYCD-004', 'KYC-003', 'national_id', 'NIN-34567890123', 'NIMC', '2019-08-10', '2029-08-10', 'verified'),
('KYCD-005', 'KYC-003', 'cac', 'RC-1234567', 'CAC', '2022-01-01', '2025-01-01', 'verified');

-- ============================================================
-- AGENT PRODUCTIVITY MODULE (6 tables)
-- ============================================================

INSERT INTO agent_territories (id, agent_id, name, state, lgas, farmer_count, active) VALUES
('AT-001', 21, 'Oyo Central', 'Oyo', '["Ibadan North","Ibadan South","Ido","Akinyele"]', 85, true),
('AT-002', 22, 'Anambra South', 'Anambra', '["Awka South","Nnewi North","Onitsha South"]', 62, true),
('AT-003', 21, 'Oyo North', 'Oyo', '["Iseyin","Saki West","Ogbomoso"]', 48, true);

INSERT INTO agent_tasks (id, agent_id, territory_id, task_type, title, description, priority, status, due_date, completed_at) VALUES
('ATSK-001', 21, 'AT-001', 'farmer_registration', 'Register 10 new farmers in Akinyele', 'Target cassava farmers in Akinyele LGA', 'high', 'completed', '2024-07-15', '2024-07-12'),
('ATSK-002', 21, 'AT-001', 'farm_visit', 'Quality inspection for harvest season', 'Visit farms for pre-harvest quality check', 'medium', 'completed', '2024-07-20', '2024-07-19'),
('ATSK-003', 22, 'AT-002', 'farmer_training', 'GAP training workshop Nnewi', 'Good Agricultural Practices for rice farmers', 'high', 'in_progress', '2024-08-01', NULL),
('ATSK-004', 21, 'AT-003', 'data_collection', 'Soil sample collection Iseyin', 'Collect soil samples from 20 farms', 'medium', 'pending', '2024-08-10', NULL),
('ATSK-005', 22, 'AT-002', 'dispute_resolution', 'Resolve payment dispute OD-005', 'Mediate between farmer and buyer', 'high', 'completed', '2024-07-25', '2024-07-24');

INSERT INTO agent_performance_metrics (id, agent_id, period, farmers_registered, visits_completed, tasks_completed, revenue_generated, farmer_satisfaction, rating) VALUES
('APM-001', 21, '2024-07', 12, 28, 15, 2450000, 4.6, 4.7),
('APM-002', 22, '2024-07', 8, 22, 11, 1850000, 4.4, 4.5),
('APM-003', 21, '2024-06', 10, 25, 13, 2100000, 4.5, 4.6),
('APM-004', 22, '2024-06', 9, 20, 12, 1720000, 4.3, 4.4);

-- ============================================================
-- COOPERATIVE MODULE (7 tables)
-- ============================================================

INSERT INTO cooperatives (id, name, registration_number, state, lga, chairman_id, secretary_id, member_count, total_savings, status) VALUES
('COOP-001', 'Oyo Maize Farmers Cooperative', 'COOP/OY/2023/001', 'Oyo', 'Iseyin', 1, 5, 45, 12500000, 'active'),
('COOP-002', 'Anambra Rice Growers Union', 'COOP/AN/2023/002', 'Anambra', 'Awka South', 3, 6, 38, 8900000, 'active'),
('COOP-003', 'Kano Groundnut Alliance', 'COOP/KN/2023/003', 'Kano', 'Bichi', 4, 7, 62, 18500000, 'active'),
('COOP-004', 'Niger Delta Fisheries Coop', 'COOP/RV/2023/004', 'Rivers', 'Port Harcourt', 9, 2, 28, 6200000, 'active');

INSERT INTO cooperative_members (id, cooperative_id, user_id, role, share_count, joined_at, status) VALUES
('CM-001', 'COOP-001', 1, 'chairman', 50, '2023-01-15', 'active'),
('CM-002', 'COOP-001', 5, 'secretary', 30, '2023-01-15', 'active'),
('CM-003', 'COOP-001', 2, 'member', 20, '2023-02-01', 'active'),
('CM-004', 'COOP-002', 3, 'chairman', 45, '2023-03-01', 'active'),
('CM-005', 'COOP-002', 6, 'secretary', 25, '2023-03-01', 'active'),
('CM-006', 'COOP-003', 4, 'chairman', 60, '2023-02-15', 'active'),
('CM-007', 'COOP-003', 7, 'member', 35, '2023-03-01', 'active'),
('CM-008', 'COOP-004', 9, 'chairman', 40, '2023-04-01', 'active');

INSERT INTO cooperative_accounts (id, cooperative_id, account_type, currency, balance, interest_rate) VALUES
('CA-001', 'COOP-001', 'savings', 'NGN', 12500000, 8.5),
('CA-002', 'COOP-001', 'loan', 'NGN', 5500000, 12.0),
('CA-003', 'COOP-002', 'savings', 'NGN', 8900000, 8.5),
('CA-004', 'COOP-003', 'savings', 'NGN', 18500000, 9.0),
('CA-005', 'COOP-004', 'savings', 'NGN', 6200000, 8.0);

-- ============================================================
-- CREDIT SCORING MODULE (7 tables)
-- ============================================================

INSERT INTO credit_score_models (id, name, version, description, weights, is_active) VALUES
('CSM-001', 'FarmConnect Agri-Score V2', '2.0', 'Agricultural credit scoring model for smallholder farmers', '{"repayment_history":0.35,"farm_productivity":0.25,"savings_behavior":0.20,"market_engagement":0.15,"social_trust":0.05}', true);

INSERT INTO credit_scores (id, user_id, model_id, score, grade, factors, calculated_at) VALUES
('CS-001', 1, 'CSM-001', 745, 'A', '{"repayment_history":92,"farm_productivity":78,"savings_behavior":85,"market_engagement":70,"social_trust":65}', NOW() - INTERVAL '7 days'),
('CS-002', 2, 'CSM-001', 680, 'B', '{"repayment_history":85,"farm_productivity":65,"savings_behavior":72,"market_engagement":55,"social_trust":80}', NOW() - INTERVAL '7 days'),
('CS-003', 3, 'CSM-001', 620, 'B', '{"repayment_history":78,"farm_productivity":60,"savings_behavior":55,"market_engagement":65,"social_trust":70}', NOW() - INTERVAL '7 days'),
('CS-004', 4, 'CSM-001', 550, 'C', '{"repayment_history":60,"farm_productivity":55,"savings_behavior":50,"market_engagement":45,"social_trust":75}', NOW() - INTERVAL '7 days'),
('CS-005', 5, 'CSM-001', 790, 'A', '{"repayment_history":95,"farm_productivity":82,"savings_behavior":90,"market_engagement":75,"social_trust":85}', NOW() - INTERVAL '7 days');

-- ============================================================
-- LOAN APPLICATION MODULE (4 tables)
-- ============================================================

INSERT INTO loan_applications (id, applicant_id, amount, purpose, loan_type, term_months, interest_rate, status, credit_score, submitted_at, decided_at) VALUES
('LOAN-001', 1, 2500000, 'Purchase improved maize seedlings and NPK fertilizer for 5ha', 'agricultural', 12, 15.5, 'approved', 745, NOW() - INTERVAL '30 days', NOW() - INTERVAL '25 days'),
('LOAN-002', 2, 1500000, 'Expand rice paddies with irrigation equipment', 'equipment', 18, 16.0, 'approved', 680, NOW() - INTERVAL '20 days', NOW() - INTERVAL '15 days'),
('LOAN-003', 4, 800000, 'Purchase groundnut shelling machine', 'equipment', 6, 18.0, 'pending', 550, NOW() - INTERVAL '5 days', NULL),
('LOAN-004', 5, 3500000, 'Cocoa farm expansion (2 additional hectares)', 'agricultural', 24, 14.5, 'approved', 790, NOW() - INTERVAL '45 days', NOW() - INTERVAL '40 days'),
('LOAN-005', 3, 1200000, 'Cold storage unit for cassava chips', 'equipment', 12, 16.5, 'disbursed', 620, NOW() - INTERVAL '60 days', NOW() - INTERVAL '55 days');

-- ============================================================
-- DISBURSEMENT MODULE (3 tables)
-- ============================================================

INSERT INTO loan_disbursements (id, loan_id, amount, disbursement_method, account_number, status, disbursed_at) VALUES
('DISB-001', 'LOAN-001', 2500000, 'bank_transfer', '0123456789', 'completed', NOW() - INTERVAL '24 days'),
('DISB-002', 'LOAN-002', 1500000, 'mobile_money', '+2348012345002', 'completed', NOW() - INTERVAL '14 days'),
('DISB-003', 'LOAN-004', 3500000, 'bank_transfer', '0987654321', 'completed', NOW() - INTERVAL '39 days'),
('DISB-004', 'LOAN-005', 1200000, 'bank_transfer', '1122334455', 'completed', NOW() - INTERVAL '54 days');

-- ============================================================
-- PRECISION AGRICULTURE MODULE (13 tables)
-- ============================================================

INSERT INTO field_boundaries (id, farm_id, boundary_type, coordinates, area_ha, perimeter_m, source) VALUES
('FB-001', 1, 'polygon', '[[7.3986,3.9470],[7.3990,3.9470],[7.3990,3.9475],[7.3986,3.9475]]', 5.2, 920, 'gps_survey'),
('FB-002', 2, 'polygon', '[[6.8735,7.3984],[6.8740,7.3984],[6.8740,7.3990],[6.8735,7.3990]]', 3.8, 780, 'satellite'),
('FB-003', 3, 'polygon', '[[6.2100,7.0850],[6.2105,7.0850],[6.2105,7.0855],[6.2100,7.0855]]', 4.5, 860, 'gps_survey'),
('FB-004', 4, 'polygon', '[[12.0150,8.5200],[12.0155,8.5200],[12.0155,8.5205],[12.0150,8.5205]]', 8.0, 1140, 'drone_mapping'),
('FB-005', 5, 'polygon', '[[7.1000,4.8300],[7.1005,4.8300],[7.1005,4.8305],[7.1000,4.8305]]', 6.5, 1020, 'gps_survey');

INSERT INTO yield_predictions (id, farm_id, crop_type, predicted_yield_kg, confidence, prediction_date, model_version, factors) VALUES
('YP-001', 1, 'maize', 18500, 0.82, '2024-07-01', 'v2.1', '{"soil_ndvi":0.72,"rainfall_mm":850,"temperature_avg":28.5}'),
('YP-002', 2, 'rice', 12800, 0.78, '2024-07-01', 'v2.1', '{"soil_ndvi":0.68,"rainfall_mm":1100,"temperature_avg":27.2}'),
('YP-003', 3, 'cassava', 32000, 0.85, '2024-07-01', 'v2.1', '{"soil_ndvi":0.75,"rainfall_mm":920,"temperature_avg":28.0}'),
('YP-004', 4, 'groundnut', 9600, 0.74, '2024-07-01', 'v2.1', '{"soil_ndvi":0.58,"rainfall_mm":650,"temperature_avg":32.1}'),
('YP-005', 5, 'cocoa', 5200, 0.88, '2024-07-01', 'v2.1', '{"soil_ndvi":0.80,"rainfall_mm":1400,"temperature_avg":26.8}');

INSERT INTO crop_health_reports (id, farm_id, crop_type, health_status, disease_detected, severity, recommendation, reported_at) VALUES
('CHR-001', 1, 'maize', 'healthy', NULL, NULL, 'Continue current practices. Apply foliar feed in 2 weeks.', NOW() - INTERVAL '5 days'),
('CHR-002', 2, 'rice', 'warning', 'blast', 'moderate', 'Apply tricyclazole fungicide at 0.6g/L immediately. Reduce nitrogen application.', NOW() - INTERVAL '3 days'),
('CHR-003', 3, 'cassava', 'healthy', NULL, NULL, 'Good growth. Weed control needed within 7 days.', NOW() - INTERVAL '7 days'),
('CHR-004', 4, 'groundnut', 'critical', 'aflatoxin_risk', 'high', 'Harvest immediately if mature. Dry to <9% moisture within 48 hours.', NOW() - INTERVAL '1 day'),
('CHR-005', 5, 'cocoa', 'warning', 'black_pod', 'low', 'Apply copper-based fungicide. Improve drainage in affected section.', NOW() - INTERVAL '4 days');

INSERT INTO ai_diagnostics (id, farm_id, image_url, diagnosis, confidence, model_version, recommendations, created_at) VALUES
('AID-001', 1, '/images/maize-leaf-001.jpg', 'healthy', 0.95, 'plant-disease-v3', '["Continue monitoring","Apply foliar feed in 14 days"]', NOW() - INTERVAL '5 days'),
('AID-002', 2, '/images/rice-leaf-001.jpg', 'rice_blast', 0.87, 'plant-disease-v3', '["Apply tricyclazole","Reduce nitrogen","Improve field drainage"]', NOW() - INTERVAL '3 days'),
('AID-003', 4, '/images/groundnut-pod-001.jpg', 'aflatoxin_risk', 0.82, 'plant-disease-v3', '["Immediate harvest","Quick drying","Proper storage"]', NOW() - INTERVAL '1 day'),
('AID-004', 5, '/images/cocoa-pod-001.jpg', 'black_pod', 0.79, 'plant-disease-v3', '["Copper fungicide","Remove infected pods","Improve canopy management"]', NOW() - INTERVAL '4 days');

INSERT INTO scouting_tasks (id, farm_id, assigned_to, task_type, priority, status, description, due_date, completed_at, findings) VALUES
('ST-001', 1, 21, 'pest_monitoring', 'medium', 'completed', 'Check for fall armyworm in maize fields', '2024-07-15', '2024-07-14', '{"pest_found":false,"notes":"No armyworm damage observed"}'),
('ST-002', 2, 22, 'disease_check', 'high', 'completed', 'Inspect rice paddies for blast symptoms', '2024-07-18', '2024-07-17', '{"disease_found":true,"severity":"moderate","area_affected_pct":15}'),
('ST-003', 4, 21, 'harvest_assessment', 'high', 'in_progress', 'Assess groundnut maturity for harvest timing', '2024-07-25', NULL, NULL),
('ST-004', 5, 22, 'soil_sampling', 'medium', 'pending', 'Collect soil samples for cocoa nutrient analysis', '2024-08-01', NULL, NULL);

INSERT INTO equipment (id, farm_id, name, category, purchase_date, purchase_cost, condition, next_maintenance_date) VALUES
('EQ-001', 1, 'Knapsack Sprayer (16L)', 'spraying', '2023-06-15', 45000, 'good', '2024-08-15'),
('EQ-002', 1, 'Maize Sheller (Manual)', 'processing', '2023-08-01', 85000, 'good', '2024-09-01'),
('EQ-003', 2, 'Rice Thresher', 'processing', '2023-05-01', 250000, 'fair', '2024-07-30'),
('EQ-004', 4, 'Groundnut Decorticator', 'processing', '2024-01-15', 180000, 'excellent', '2025-01-15'),
('EQ-005', 5, 'Cocoa Fermentation Box', 'processing', '2023-03-01', 120000, 'good', '2024-09-15');

-- ============================================================
-- ERPNEXT INTEGRATION MODULE (11 tables)
-- ============================================================

INSERT INTO erpnext_config (id, instance_url, api_key, api_secret, company, default_warehouse, sync_enabled, last_sync_at) VALUES
('ERP-001', 'https://farmconnect.erpnext.com', 'fc-api-key-001', 'fc-api-secret-001', 'FarmConnect Nigeria Ltd', 'Lagos Main Warehouse', true, NOW() - INTERVAL '1 hour');

INSERT INTO erpnext_sync_config (id, config_id, doctype, direction, frequency, last_run, status) VALUES
('ESC-001', 'ERP-001', 'Sales Invoice', 'push', 'hourly', NOW() - INTERVAL '1 hour', 'active'),
('ESC-002', 'ERP-001', 'Purchase Order', 'push', 'hourly', NOW() - INTERVAL '1 hour', 'active'),
('ESC-003', 'ERP-001', 'Stock Entry', 'bidirectional', 'realtime', NOW() - INTERVAL '5 minutes', 'active'),
('ESC-004', 'ERP-001', 'Customer', 'push', 'daily', NOW() - INTERVAL '12 hours', 'active'),
('ESC-005', 'ERP-001', 'Item', 'pull', 'daily', NOW() - INTERVAL '12 hours', 'active');

-- ============================================================
-- NOTIFICATION MODULE (7 tables)
-- ============================================================

INSERT INTO notification_templates (id, name, channel, subject, body, variables, is_active) VALUES
('NT-001', 'order_confirmed', 'sms', NULL, 'Your order {{order_number}} has been confirmed. Total: NGN {{amount}}. Track at {{tracking_url}}', '["order_number","amount","tracking_url"]', true),
('NT-002', 'harvest_ready', 'push', 'Harvest Ready!', 'Your {{crop}} on {{farm}} is ready for harvest. Estimated yield: {{yield}}kg', '["crop","farm","yield"]', true),
('NT-003', 'payment_received', 'sms', NULL, 'Payment of NGN {{amount}} received for order {{order_number}}. Balance: NGN {{balance}}', '["amount","order_number","balance"]', true),
('NT-004', 'price_alert', 'push', 'Price Alert', '{{crop}} price has {{direction}} to NGN {{price}}/{{unit}} in {{market}}', '["crop","direction","price","unit","market"]', true),
('NT-005', 'weather_warning', 'sms', NULL, 'WEATHER ALERT: {{alert_type}} expected in {{area}}. {{recommendation}}', '["alert_type","area","recommendation"]', true);

INSERT INTO notification_preferences (id, user_id, channel, category, enabled, quiet_hours_start, quiet_hours_end) VALUES
('NP-001', 1, 'sms', 'orders', true, '22:00', '06:00'),
('NP-002', 1, 'push', 'prices', true, NULL, NULL),
('NP-003', 1, 'sms', 'weather', true, NULL, NULL),
('NP-004', 11, 'sms', 'orders', true, '23:00', '07:00'),
('NP-005', 11, 'push', 'prices', true, NULL, NULL);

-- ============================================================
-- PLATFORM EXTENSIONS MODULE (25 tables)
-- ============================================================

-- Farming Contracts
INSERT INTO farming_contracts (id, farmer_id, offtaker_id, crop_type, quantity_kg, price_per_kg, delivery_date, status, contract_value, advance_paid) VALUES
('FC-001', 1, 'OFT-001', 'maize', 5000, 480, '2024-09-30', 'active', 2400000, 720000),
('FC-002', 2, 'OFT-002', 'rice', 3000, 850, '2024-10-15', 'active', 2550000, 765000),
('FC-003', 4, 'OFT-003', 'groundnut', 2000, 1200, '2024-09-15', 'active', 2400000, 480000),
('FC-004', 5, 'OFT-001', 'cocoa', 1000, 4500, '2024-11-30', 'active', 4500000, 1350000),
('FC-005', 3, 'OFT-002', 'cassava', 8000, 180, '2024-08-30', 'delivered', 1440000, 432000);

INSERT INTO offtakers (id, name, company_type, contact_email, contact_phone, commodities, min_order_kg, payment_terms_days, rating) VALUES
('OFT-001', 'Flour Mills of Nigeria', 'processor', 'procurement@fmn.ng', '+2349012345001', '["maize","wheat","cocoa"]', 5000, 30, 4.8),
('OFT-002', 'Dangote Rice Mills', 'processor', 'sourcing@dangote-rice.ng', '+2349012345002', '["rice","cassava"]', 3000, 21, 4.6),
('OFT-003', 'TGI Foods', 'exporter', 'buying@tgifoods.ng', '+2349012345003', '["groundnut","sesame","cashew"]', 2000, 14, 4.5),
('OFT-004', 'Nestle Nigeria', 'multinational', 'agri-sourcing@nestle.ng', '+2349012345004', '["cocoa","maize","soybean"]', 10000, 45, 4.9),
('OFT-005', 'Olam Nigeria', 'exporter', 'procurement@olam.ng', '+2349012345005', '["cocoa","cashew","sesame","rice"]', 5000, 30, 4.7);

-- DID (Decentralized Identity)
INSERT INTO did_documents (id, user_id, did_method, did_uri, public_key, status, created_at) VALUES
('DID-001', 1, 'did:farmconnect', 'did:farmconnect:ng:farmer:adebayo-okonkwo', 'ed25519:base58:7Yx...', 'active', NOW() - INTERVAL '90 days'),
('DID-002', 2, 'did:farmconnect', 'did:farmconnect:ng:farmer:chinwe-eze', 'ed25519:base58:8Bz...', 'active', NOW() - INTERVAL '85 days'),
('DID-003', 5, 'did:farmconnect', 'did:farmconnect:ng:farmer:oluwaseun-adeyemi', 'ed25519:base58:9Ca...', 'active', NOW() - INTERVAL '80 days'),
('DID-004', 11, 'did:farmconnect', 'did:farmconnect:ng:buyer:tunde-bakare', 'ed25519:base58:4Dw...', 'active', NOW() - INTERVAL '75 days');

INSERT INTO verifiable_credentials (id, did_id, credential_type, issuer, claims, issued_at, expires_at, status) VALUES
('VC-001', 'DID-001', 'FarmerIdentity', 'did:farmconnect:ng:authority', '{"name":"Adebayo Okonkwo","nin":"NIN-12345678901","farmSize":"5.2ha","crops":["maize","cassava"]}', NOW() - INTERVAL '90 days', NOW() + INTERVAL '365 days', 'valid'),
('VC-002', 'DID-001', 'CreditHistory', 'did:farmconnect:ng:credit-bureau', '{"score":745,"grade":"A","loans_repaid":3,"total_borrowed":7500000}', NOW() - INTERVAL '30 days', NOW() + INTERVAL '180 days', 'valid'),
('VC-003', 'DID-002', 'OrganicCertification', 'did:farmconnect:ng:cert-authority', '{"standard":"NAFDAC-Organic","valid_from":"2024-01-01","crops":["rice"]}', NOW() - INTERVAL '180 days', NOW() + INTERVAL '180 days', 'valid'),
('VC-004', 'DID-003', 'CreditHistory', 'did:farmconnect:ng:credit-bureau', '{"score":790,"grade":"A","loans_repaid":5,"total_borrowed":12000000}', NOW() - INTERVAL '30 days', NOW() + INTERVAL '180 days', 'valid');

-- Insurance Policies
INSERT INTO insurance_policies (id, farmer_id, product_type, coverage_amount, premium, start_date, end_date, status, claims_count) VALUES
('INS-001', 1, 'drought', 5000000, 275000, '2024-04-01', '2024-10-31', 'active', 0),
('INS-002', 2, 'flood', 3000000, 195000, '2024-05-01', '2024-11-30', 'active', 0),
('INS-003', 4, 'pest', 2000000, 140000, '2024-03-01', '2024-09-30', 'active', 1),
('INS-004', 5, 'comprehensive', 8000000, 560000, '2024-01-01', '2024-12-31', 'active', 0),
('INS-005', 9, 'aquaculture', 4000000, 320000, '2024-06-01', '2025-05-31', 'active', 0);

-- Tokenized Assets
INSERT INTO tokenized_assets (id, asset_type, name, description, total_tokens, token_price, underlying_value, owner_id, status) VALUES
('TOKEN-001', 'farm_land', 'Adebayo Okonkwo Farm (5.2ha)', 'Fractionalized ownership of productive maize farm in Oyo', 1000, 52000, 52000000, 1, 'active'),
('TOKEN-002', 'carbon_credit', 'Ondo Agroforestry Carbon Bundle', 'Verified carbon credits from 50ha agroforestry project', 500, 25000, 12500000, 5, 'active'),
('TOKEN-003', 'warehouse_receipt', 'Lagos Maize WR-2024-Q3', 'Warehoused 50MT Grade A maize, insured storage', 200, 120000, 24000000, 'COOP-001', 'active'),
('TOKEN-004', 'equipment', 'Community Tractor Share', 'Shared ownership of 75HP tractor + implements', 100, 185000, 18500000, 'COOP-003', 'active');

INSERT INTO token_holdings (id, asset_id, holder_id, quantity, purchase_price, purchased_at) VALUES
('TH-001', 'TOKEN-001', 11, 50, 52000, NOW() - INTERVAL '60 days'),
('TH-002', 'TOKEN-001', 12, 30, 52000, NOW() - INTERVAL '55 days'),
('TH-003', 'TOKEN-002', 13, 100, 25000, NOW() - INTERVAL '45 days'),
('TH-004', 'TOKEN-003', 11, 20, 120000, NOW() - INTERVAL '30 days'),
('TH-005', 'TOKEN-004', 1, 10, 185000, NOW() - INTERVAL '20 days');

-- Indoor Farms (Vertical Farming)
INSERT INTO indoor_farms (id, owner_id, name, farm_type, location, area_sqm, rack_levels, active_crops, status) VALUES
('IF-001', 1, 'Lagos Urban Farm A', 'vertical', 'Victoria Island, Lagos', 500, 8, '["lettuce","spinach","basil","microgreens"]', 'active'),
('IF-002', 11, 'Abuja Indoor Greens', 'container', 'Wuse 2, Abuja', 120, 5, '["tomato","pepper","herbs"]', 'active'),
('IF-003', 5, 'Ibadan Hydro Farm', 'hydroponic', 'Bodija, Ibadan', 300, 6, '["lettuce","strawberry","cucumber"]', 'active');

-- Supply-Demand Matching
INSERT INTO supply_listings (id, farmer_id, commodity, quantity_kg, price_per_kg, available_from, location, status) VALUES
('SL-001', 1, 'maize', 8000, 450, '2024-09-15', 'Iseyin, Oyo', 'active'),
('SL-002', 2, 'rice', 4500, 820, '2024-10-01', 'Nsukka, Enugu', 'active'),
('SL-003', 3, 'cassava', 12000, 165, '2024-08-20', 'Awka, Anambra', 'active'),
('SL-004', 4, 'groundnut', 3000, 1150, '2024-09-01', 'Bichi, Kano', 'matched'),
('SL-005', 5, 'cocoa', 2000, 4200, '2024-11-15', 'Idanre, Ondo', 'active');

INSERT INTO demand_listings (id, buyer_id, commodity, quantity_kg, max_price_per_kg, needed_by, location, status) VALUES
('DL-001', 11, 'maize', 10000, 500, '2024-09-30', 'Lagos', 'active'),
('DL-002', 12, 'rice', 5000, 900, '2024-10-15', 'Abuja', 'active'),
('DL-003', 13, 'groundnut', 3000, 1250, '2024-09-15', 'Kano', 'matched'),
('DL-004', 14, 'cassava', 15000, 180, '2024-08-30', 'Port Harcourt', 'active'),
('DL-005', 15, 'cocoa', 2500, 4500, '2024-12-01', 'Ibadan', 'active');

INSERT INTO supply_demand_matches (id, supply_id, demand_id, matched_quantity_kg, agreed_price, match_score, status, matched_at) VALUES
('SDM-001', 'SL-004', 'DL-003', 3000, 1200, 0.92, 'confirmed', NOW() - INTERVAL '5 days');

-- ============================================================
-- SUBSIDY MODULE (3 tables)
-- ============================================================

INSERT INTO subsidy_programs (id, name, agency, description, total_budget, disbursed, beneficiary_count, status, start_date, end_date) VALUES
('SUB-001', 'Anchor Borrowers Programme', 'CBN', 'Subsidized credit for smallholder farmers growing priority crops', 500000000000, 280000000000, 4200000, 'active', '2024-01-01', '2024-12-31'),
('SUB-002', 'Growth Enhancement Support', 'FMARD', 'E-wallet subsidy for fertilizer and improved seeds', 120000000000, 85000000000, 2800000, 'active', '2024-03-01', '2024-09-30'),
('SUB-003', 'Youth in Agribusiness', 'NIRSAL', 'Low-interest loans for young farmers (18-35)', 50000000000, 22000000000, 180000, 'active', '2024-01-01', '2025-12-31');

INSERT INTO subsidy_applications (id, program_id, farmer_id, amount_requested, status, submitted_at, approved_at) VALUES
('SA-001', 'SUB-001', 1, 2500000, 'approved', NOW() - INTERVAL '90 days', NOW() - INTERVAL '80 days'),
('SA-002', 'SUB-002', 2, 450000, 'approved', NOW() - INTERVAL '60 days', NOW() - INTERVAL '55 days'),
('SA-003', 'SUB-003', 5, 5000000, 'approved', NOW() - INTERVAL '120 days', NOW() - INTERVAL '110 days'),
('SA-004', 'SUB-001', 4, 1800000, 'pending', NOW() - INTERVAL '10 days', NULL),
('SA-005', 'SUB-002', 3, 350000, 'approved', NOW() - INTERVAL '45 days', NOW() - INTERVAL '40 days');

INSERT INTO subsidy_disbursements (id, application_id, amount, method, reference, disbursed_at, status) VALUES
('SD-001', 'SA-001', 2500000, 'bank_transfer', 'ABP/2024/001234', NOW() - INTERVAL '75 days', 'completed'),
('SD-002', 'SA-002', 450000, 'e_wallet', 'GES/2024/005678', NOW() - INTERVAL '50 days', 'completed'),
('SD-003', 'SA-003', 5000000, 'bank_transfer', 'YIA/2024/000789', NOW() - INTERVAL '100 days', 'completed'),
('SD-004', 'SA-005', 350000, 'e_wallet', 'GES/2024/009012', NOW() - INTERVAL '35 days', 'completed');

-- ============================================================
-- AGRICULTURAL INTELLIGENCE MODULE (4 tables)
-- ============================================================

INSERT INTO crop_calendar (id, crop_type, region, activity, start_week, end_week, description) VALUES
('CC-001', 'maize', 'southwest', 'land_preparation', 8, 12, 'Clear and ridge land. Apply basal fertilizer.'),
('CC-002', 'maize', 'southwest', 'planting', 12, 14, 'Plant at 75x25cm spacing. 2 seeds per hole.'),
('CC-003', 'maize', 'southwest', 'first_weeding', 15, 17, 'Manual or herbicide weeding 3-4 weeks after planting.'),
('CC-004', 'maize', 'southwest', 'fertilizer_top_dress', 18, 20, 'Apply NPK 15:15:15 at 6 weeks after planting.'),
('CC-005', 'maize', 'southwest', 'harvest', 28, 32, 'Harvest when husks are dry and kernels are hard.'),
('CC-006', 'rice', 'southeast', 'nursery', 12, 14, 'Establish nursery beds. Soak seeds 24hrs before sowing.'),
('CC-007', 'rice', 'southeast', 'transplanting', 17, 19, 'Transplant 21-day seedlings at 20x20cm spacing.'),
('CC-008', 'rice', 'southeast', 'harvest', 34, 38, 'Harvest when 80% of grains are golden yellow.');

INSERT INTO pest_disease_risks (id, crop_type, region, pest_or_disease, risk_level, season, prevention, treatment) VALUES
('PDR-001', 'maize', 'southwest', 'Fall Armyworm', 'high', 'early_season', 'Early planting, push-pull intercropping', 'Emamectin benzoate 5% SG at 0.4g/L'),
('PDR-002', 'rice', 'southeast', 'Rice Blast', 'medium', 'wet_season', 'Resistant varieties, balanced nitrogen', 'Tricyclazole 75% WP at 0.6g/L'),
('PDR-003', 'cassava', 'southeast', 'Cassava Mosaic Disease', 'high', 'all_year', 'Use clean planting material, rogue infected plants', 'No chemical treatment. Remove and burn infected plants'),
('PDR-004', 'cocoa', 'southwest', 'Black Pod Disease', 'medium', 'wet_season', 'Regular pruning, good drainage, shade management', 'Metalaxyl + Copper hydroxide at 2.5g/L'),
('PDR-005', 'groundnut', 'northwest', 'Aflatoxin Contamination', 'high', 'harvest', 'Timely harvest, rapid drying to <9% moisture', 'No post-contamination treatment. Prevention only.');

-- ============================================================
-- GPS & REMOTE SENSING MODULE (6 tables)
-- ============================================================

INSERT INTO gps_devices (id, farm_id, device_type, serial_number, status, last_reading_at) VALUES
('GPS-001', 1, 'soil_sensor', 'SS-NGR-001', 'active', NOW() - INTERVAL '2 hours'),
('GPS-002', 2, 'weather_station', 'WS-NGR-001', 'active', NOW() - INTERVAL '1 hour'),
('GPS-003', 3, 'soil_sensor', 'SS-NGR-002', 'active', NOW() - INTERVAL '3 hours'),
('GPS-004', 4, 'drone_tracker', 'DT-NGR-001', 'active', NOW() - INTERVAL '12 hours'),
('GPS-005', 5, 'soil_sensor', 'SS-NGR-003', 'active', NOW() - INTERVAL '4 hours');

-- ============================================================
-- ML MODELS MODULE (4 tables)
-- ============================================================

INSERT INTO community_models (id, name, creator_id, model_type, accuracy, description, downloads, rating, is_public) VALUES
('MLM-001', 'Maize Disease Detector v3', 5, 'image_classification', 0.92, 'Detects 8 common maize diseases from leaf images', 245, 4.7, true),
('MLM-002', 'Yield Predictor (Southwest)', 1, 'regression', 0.85, 'Predicts maize/cassava yield from NDVI + weather data', 128, 4.3, true),
('MLM-003', 'Pest Early Warning', 3, 'anomaly_detection', 0.88, 'Detects pest infestation patterns from IoT sensor data', 89, 4.5, true),
('MLM-004', 'Price Forecast 7-day', 19, 'time_series', 0.79, 'Predicts commodity prices using ARIMA + market sentiment', 312, 4.1, true),
('MLM-005', 'Soil Nutrient Mapper', 2, 'spatial_regression', 0.83, 'Maps NPK distribution from limited soil samples', 67, 4.4, true);

-- ============================================================
-- WEATHER DATA & FORECASTS (extends existing)
-- ============================================================

INSERT INTO weather_forecasts (id, station_id, forecast_date, max_temp, min_temp, rainfall_mm, humidity_pct, wind_speed_kmh, conditions, confidence) VALUES
('WF-001', 1, CURRENT_DATE + 1, 32.5, 23.0, 15.0, 78, 12, 'partly_cloudy_rain', 0.82),
('WF-002', 1, CURRENT_DATE + 2, 31.0, 22.5, 25.0, 85, 8, 'thunderstorm', 0.75),
('WF-003', 1, CURRENT_DATE + 3, 30.5, 22.0, 5.0, 72, 15, 'partly_cloudy', 0.70),
('WF-004', 2, CURRENT_DATE + 1, 28.0, 21.0, 40.0, 90, 6, 'heavy_rain', 0.78),
('WF-005', 2, CURRENT_DATE + 2, 27.5, 20.5, 30.0, 88, 8, 'rain', 0.72);

-- ============================================================
-- GOVERNANCE MODULE (from platform extensions)
-- ============================================================

INSERT INTO governance_proposals (id, cooperative_id, title, description, proposal_type, proposed_by, status, votes_for, votes_against, voting_deadline) VALUES
('GP-001', 'COOP-001', 'Invest in shared tractor', 'Purchase 75HP tractor for member use at subsidized rates', 'investment', 1, 'approved', 32, 8, NOW() - INTERVAL '14 days'),
('GP-002', 'COOP-002', 'Open satellite collection point in Enugu', 'Establish new collection center to reduce transport costs', 'expansion', 3, 'voting', 18, 5, NOW() + INTERVAL '7 days'),
('GP-003', 'COOP-003', 'Increase share price from NGN 10K to NGN 15K', 'Reflect growth in cooperative assets and market value', 'policy', 4, 'voting', 25, 12, NOW() + INTERVAL '14 days');

INSERT INTO governance_votes (id, proposal_id, voter_id, vote, reason, voted_at) VALUES
('GV-001', 'GP-001', 1, 'for', 'Tractor will reduce labor costs by 40%', NOW() - INTERVAL '20 days'),
('GV-002', 'GP-001', 5, 'for', 'Good investment for planting season', NOW() - INTERVAL '19 days'),
('GV-003', 'GP-001', 2, 'against', 'Maintenance costs may be too high', NOW() - INTERVAL '18 days'),
('GV-004', 'GP-002', 3, 'for', 'Transport savings will benefit all members', NOW() - INTERVAL '3 days'),
('GV-005', 'GP-003', 7, 'for', 'Fair reflection of cooperative growth', NOW() - INTERVAL '2 days');

-- ============================================================
-- INPUT FINANCING (from platform extensions)
-- ============================================================

INSERT INTO input_financing_applications (id, farmer_id, season, input_type, supplier, amount, status, approved_at, repayment_due) VALUES
('IFA-001', 1, '2024-early', 'seeds', 'Syngenta Nigeria', 450000, 'repaid', NOW() - INTERVAL '120 days', NOW() - INTERVAL '30 days'),
('IFA-002', 2, '2024-early', 'fertilizer', 'Notore Chemical', 380000, 'active', NOW() - INTERVAL '90 days', NOW() + INTERVAL '60 days'),
('IFA-003', 4, '2024-early', 'pesticide', 'BASF Nigeria', 250000, 'active', NOW() - INTERVAL '60 days', NOW() + INTERVAL '90 days'),
('IFA-004', 5, '2024-main', 'seedlings', 'CRIN Ibadan', 850000, 'approved', NOW() - INTERVAL '30 days', NOW() + INTERVAL '180 days'),
('IFA-005', 3, '2024-early', 'fertilizer', 'Indorama Eleme', 320000, 'overdue', NOW() - INTERVAL '150 days', NOW() - INTERVAL '10 days');

-- ============================================================
-- EXTENSION SERVICES (from platform extensions)
-- ============================================================

INSERT INTO extension_programs (id, name, provider, target_crop, region, start_date, end_date, enrolled_farmers, status) VALUES
('EP-001', 'GAP Certification Training', 'NAQS', 'mixed', 'national', '2024-01-01', '2024-12-31', 450, 'active'),
('EP-002', 'Climate-Smart Agriculture', 'FAO/IFAD', 'maize', 'southwest', '2024-03-01', '2024-09-30', 200, 'active'),
('EP-003', 'Aquaculture Best Practices', 'WorldFish', 'fish', 'south-south', '2024-04-01', '2024-10-31', 85, 'active'),
('EP-004', 'Digital Farming Skills', 'GIZ/NIRSAL', 'mixed', 'national', '2024-02-01', '2025-01-31', 320, 'active');

INSERT INTO extension_visits (id, program_id, farmer_id, agent_id, visit_date, topic, duration_minutes, notes, rating) VALUES
('EV-001', 'EP-001', 1, 21, '2024-07-10', 'Post-harvest handling and storage', 90, 'Covered proper drying techniques and hermetic storage', 5),
('EV-002', 'EP-002', 2, 22, '2024-07-12', 'Water management for climate resilience', 120, 'Demonstrated AWD technique for rice paddies', 4),
('EV-003', 'EP-001', 4, 21, '2024-07-15', 'Aflatoxin prevention in groundnuts', 75, 'Practical demo of proper drying and sorting', 5),
('EV-004', 'EP-004', 5, 22, '2024-07-18', 'Using FarmConnect marketplace effectively', 60, 'Helped set up produce listings and pricing', 4);

-- ============================================================
-- GOVERNMENT INTEGRATION (from platform extensions)
-- ============================================================

INSERT INTO government_programs (id, name, ministry, description, budget, target_beneficiaries, active) VALUES
('GOV-001', 'National Agricultural Growth Scheme', 'FMARD', 'Comprehensive support for smallholder productivity improvement', 150000000000, 5000000, true),
('GOV-002', 'Agro-Processing Support Fund', 'BOI', 'Loans for agro-processing enterprises at 9% interest', 50000000000, 200000, true),
('GOV-003', 'Agricultural Insurance Premium Subsidy', 'NAIC', '50% premium subsidy for crop and livestock insurance', 25000000000, 1500000, true);

INSERT INTO government_beneficiaries (id, program_id, farmer_id, benefit_type, amount, status, enrolled_at) VALUES
('GB-001', 'GOV-001', 1, 'input_subsidy', 500000, 'active', NOW() - INTERVAL '180 days'),
('GB-002', 'GOV-001', 2, 'input_subsidy', 350000, 'active', NOW() - INTERVAL '150 days'),
('GB-003', 'GOV-002', 3, 'processing_loan', 2000000, 'active', NOW() - INTERVAL '120 days'),
('GB-004', 'GOV-003', 1, 'insurance_subsidy', 137500, 'active', NOW() - INTERVAL '90 days'),
('GB-005', 'GOV-003', 5, 'insurance_subsidy', 280000, 'active', NOW() - INTERVAL '90 days');

