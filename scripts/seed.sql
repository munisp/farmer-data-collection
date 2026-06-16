-- FarmConnect Comprehensive Seed Data
-- West African (Nigeria) agricultural data
-- Populates all key tables with realistic production data

-- ============================================================
-- 1. USERS (24 users)
-- ============================================================
INSERT INTO users (id, email, password, first_name, last_name, phone_number, role, is_active, language) VALUES
(1, 'adebayo.okonkwo@farmconnect.ng', '$2b$10$seedhashedpassword1', 'Adebayo', 'Okonkwo', '+2348012345001', 'farmer', true, 'english'),
(2, 'chinwe.eze@farmconnect.ng', '$2b$10$seedhashedpassword2', 'Chinwe', 'Eze', '+2348012345002', 'farmer', true, 'english'),
(3, 'emeka.nwosu@farmconnect.ng', '$2b$10$seedhashedpassword3', 'Emeka', 'Nwosu', '+2348012345003', 'farmer', true, 'igbo'),
(4, 'fatima.abdullahi@farmconnect.ng', '$2b$10$seedhashedpassword4', 'Fatima', 'Abdullahi', '+2348012345004', 'farmer', true, 'hausa'),
(5, 'oluwaseun.adeyemi@farmconnect.ng', '$2b$10$seedhashedpassword5', 'Oluwaseun', 'Adeyemi', '+2348012345005', 'farmer', true, 'yoruba'),
(6, 'ngozi.okafor@farmconnect.ng', '$2b$10$seedhashedpassword6', 'Ngozi', 'Okafor', '+2348012345006', 'farmer', true, 'english'),
(7, 'ibrahim.musa@farmconnect.ng', '$2b$10$seedhashedpassword7', 'Ibrahim', 'Musa', '+2348012345007', 'farmer', true, 'hausa'),
(8, 'amina.bello@farmconnect.ng', '$2b$10$seedhashedpassword8', 'Amina', 'Bello', '+2348012345008', 'farmer', true, 'english'),
(9, 'chukwuma.igwe@farmconnect.ng', '$2b$10$seedhashedpassword9', 'Chukwuma', 'Igwe', '+2348012345009', 'farmer', true, 'igbo'),
(10, 'yusuf.abubakar@farmconnect.ng', '$2b$10$seedhashedpassword10', 'Yusuf', 'Abubakar', '+2348012345010', 'farmer', true, 'hausa'),
(11, 'buyer.lagos@market.ng', '$2b$10$seedhashedpassword11', 'Tunde', 'Bakare', '+2348023456001', 'buyer', true, 'english'),
(12, 'buyer.abuja@market.ng', '$2b$10$seedhashedpassword12', 'Grace', 'Okoro', '+2348023456002', 'buyer', true, 'english'),
(13, 'buyer.kano@market.ng', '$2b$10$seedhashedpassword13', 'Aisha', 'Suleiman', '+2348023456003', 'buyer', true, 'hausa'),
(14, 'buyer.ph@market.ng', '$2b$10$seedhashedpassword14', 'Obiora', 'Nnamdi', '+2348023456004', 'buyer', true, 'english'),
(15, 'buyer.ibadan@market.ng', '$2b$10$seedhashedpassword15', 'Folake', 'Adeola', '+2348023456005', 'buyer', true, 'yoruba'),
(16, 'driver.lagos@farmconnect.ng', '$2b$10$seedhashedpassword16', 'Sunday', 'Okeke', '+2348034567001', 'driver', true, 'english'),
(17, 'driver.abuja@farmconnect.ng', '$2b$10$seedhashedpassword17', 'Musa', 'Garba', '+2348034567002', 'driver', true, 'hausa'),
(18, 'driver.enugu@farmconnect.ng', '$2b$10$seedhashedpassword18', 'Obinna', 'Agu', '+2348034567003', 'driver', true, 'igbo'),
(19, 'admin@farmconnect.ng', '$2b$10$seedhashedpassword19', 'Admin', 'FarmConnect', '+2348045678001', 'admin', true, 'english'),
(20, 'superadmin@farmconnect.ng', '$2b$10$seedhashedpassword20', 'Super', 'Admin', '+2348045678002', 'admin', true, 'english'),
(21, 'agent.oyo@farmconnect.ng', '$2b$10$seedhashedpassword21', 'Kayode', 'Olaniyi', '+2348056789001', 'agent', true, 'yoruba'),
(22, 'agent.anambra@farmconnect.ng', '$2b$10$seedhashedpassword22', 'Chidinma', 'Onuoha', '+2348056789002', 'agent', true, 'igbo'),
(23, 'retail.freshmart@stores.ng', '$2b$10$seedhashedpassword23', 'Kehinde', 'Fashola', '+2348067890001', 'buyer', true, 'english'),
(24, 'retail.mamankechi@stores.ng', '$2b$10$seedhashedpassword24', 'Blessing', 'Uche', '+2348067890002', 'buyer', true, 'english');
SELECT setval('users_id_seq', 24);

-- ============================================================
-- 2. FARMERS
-- ============================================================
INSERT INTO farmers (id, user_id, first_name, last_name, phone_number, email, address, village, district, region, national_id, verification_status, verified_by, verified_at) VALUES
(1, 1, 'Adebayo', 'Okonkwo', '+2348012345001', 'adebayo.okonkwo@farmconnect.ng', '15 Farm Road, Oke-Ogun', 'Iseyin', 'Oke-Ogun', 'Oyo', 'NIN-12345678901', 'verified', 19, NOW() - INTERVAL '30 days'),
(2, 2, 'Chinwe', 'Eze', '+2348012345002', 'chinwe.eze@farmconnect.ng', '7 Agric Lane, Nsukka', 'Nsukka', 'Enugu North', 'Enugu', 'NIN-23456789012', 'verified', 19, NOW() - INTERVAL '25 days'),
(3, 3, 'Emeka', 'Nwosu', '+2348012345003', 'emeka.nwosu@farmconnect.ng', '23 Cassava Street, Awka', 'Awka', 'Awka South', 'Anambra', 'NIN-34567890123', 'verified', 19, NOW() - INTERVAL '20 days'),
(4, 4, 'Fatima', 'Abdullahi', '+2348012345004', 'fatima.abdullahi@farmconnect.ng', '45 Groundnut Avenue, Kano', 'Bichi', 'Bichi', 'Kano', 'NIN-45678901234', 'verified', 19, NOW() - INTERVAL '18 days'),
(5, 5, 'Oluwaseun', 'Adeyemi', '+2348012345005', 'oluwaseun.adeyemi@farmconnect.ng', '8 Cocoa Road, Ondo', 'Idanre', 'Idanre', 'Ondo', 'NIN-56789012345', 'verified', 19, NOW() - INTERVAL '15 days'),
(6, 6, 'Ngozi', 'Okafor', '+2348012345006', 'ngozi.okafor@farmconnect.ng', '12 Yam Market, Benue', 'Otukpo', 'Otukpo', 'Benue', 'NIN-67890123456', 'verified', 19, NOW() - INTERVAL '12 days'),
(7, 7, 'Ibrahim', 'Musa', '+2348012345007', 'ibrahim.musa@farmconnect.ng', '3 Rice Paddy Lane, Kebbi', 'Argungu', 'Argungu', 'Kebbi', 'NIN-78901234567', 'verified', 19, NOW() - INTERVAL '10 days'),
(8, 8, 'Amina', 'Bello', '+2348012345008', 'amina.bello@farmconnect.ng', '19 Tomato Close, Kaduna', 'Zaria', 'Zaria', 'Kaduna', 'NIN-89012345678', 'pending', NULL, NULL),
(9, 9, 'Chukwuma', 'Igwe', '+2348012345009', 'chukwuma.igwe@farmconnect.ng', '27 Palm Oil Drive, Imo', 'Owerri', 'Owerri West', 'Imo', 'NIN-90123456789', 'verified', 19, NOW() - INTERVAL '8 days'),
(10, 10, 'Yusuf', 'Abubakar', '+2348012345010', 'yusuf.abubakar@farmconnect.ng', '5 Millet Way, Sokoto', 'Sokoto South', 'Sokoto South', 'Sokoto', 'NIN-01234567890', 'pending', NULL, NULL);
SELECT setval('farmers_id_seq', 10);

-- ============================================================
-- 3. FARMS
-- ============================================================
INSERT INTO farms (id, user_id, farmer_id, farm_name, farm_size, farm_size_unit, location, latitude, longitude, soil_type, irrigation_type) VALUES
(1, 1, 1, 'Okonkwo Cassava Estate', 12.50, 'hectares', 'Iseyin, Oyo State', 7.9710, 3.5940, 'Loamy', 'rainfed'),
(2, 1, 1, 'Okonkwo Maize Plot', 5.00, 'hectares', 'Iseyin North, Oyo State', 7.9800, 3.6010, 'Sandy loam', 'drip'),
(3, 2, 2, 'Eze Rice Paddies', 8.00, 'hectares', 'Nsukka, Enugu State', 6.8567, 7.3955, 'Clay loam', 'flood'),
(4, 3, 3, 'Nwosu Oil Palm Plantation', 20.00, 'hectares', 'Awka, Anambra State', 6.2106, 7.0747, 'Laterite', 'rainfed'),
(5, 4, 4, 'Abdullahi Groundnut Farm', 15.00, 'hectares', 'Bichi, Kano State', 12.2319, 8.2467, 'Sandy', 'well'),
(6, 5, 5, 'Adeyemi Cocoa Plantation', 25.00, 'hectares', 'Idanre, Ondo State', 7.1167, 5.1167, 'Volcanic loam', 'rainfed'),
(7, 6, 6, 'Okafor Yam Farm', 10.00, 'hectares', 'Otukpo, Benue State', 7.1904, 8.1300, 'Loamy', 'rainfed'),
(8, 7, 7, 'Musa Rice Valley', 18.00, 'hectares', 'Argungu, Kebbi State', 12.7489, 4.5253, 'Alluvial', 'canal'),
(9, 8, 8, 'Bello Tomato Gardens', 6.00, 'hectares', 'Zaria, Kaduna State', 11.0855, 7.7108, 'Loamy sand', 'drip'),
(10, 9, 9, 'Igwe Palm Oil Estate', 30.00, 'hectares', 'Owerri, Imo State', 5.4836, 7.0333, 'Laterite', 'rainfed'),
(11, 10, 10, 'Abubakar Millet Farm', 12.00, 'hectares', 'Sokoto South, Sokoto State', 13.0059, 5.2476, 'Sandy', 'well'),
(12, 5, 5, 'Adeyemi Plantain Grove', 8.00, 'hectares', 'Akure, Ondo State', 7.2526, 5.2103, 'Clay loam', 'rainfed'),
(13, 6, 6, 'Okafor Vegetables Plot', 3.00, 'hectares', 'Otukpo East, Benue State', 7.1950, 8.1400, 'Loamy', 'sprinkler'),
(14, 4, 4, 'Abdullahi Sorghum Field', 10.00, 'hectares', 'Bichi North, Kano State', 12.2400, 8.2500, 'Sandy loam', 'rainfed'),
(15, 2, 2, 'Eze Vegetable Garden', 2.00, 'hectares', 'Nsukka South, Enugu State', 6.8500, 7.3900, 'Loamy', 'drip');
SELECT setval('farms_id_seq', 15);

-- ============================================================
-- 4. CROPS (25 crops)
-- ============================================================
INSERT INTO crops (id, user_id, farm_id, crop_name, crop_variety, planting_date, expected_harvest_date, actual_harvest_date, area_planted, area_unit, season, status, price_per_unit) VALUES
(1, 1, 1, 'Cassava', 'TMS 30572', NOW() - INTERVAL '8 months', NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months', 10.00, 'hectares', '2025 Main', 'harvested', 45000),
(2, 1, 1, 'Cassava', 'TMS 98/0505', NOW() - INTERVAL '4 months', NOW() + INTERVAL '4 months', NULL, 8.00, 'hectares', '2026 Main', 'growing', 48000),
(3, 1, 2, 'Maize', 'SAMMAZ 15', NOW() - INTERVAL '3 months', NOW() + INTERVAL '1 month', NULL, 5.00, 'hectares', '2026 Main', 'growing', 32000),
(4, 2, 3, 'Rice', 'FARO 44', NOW() - INTERVAL '5 months', NOW() - INTERVAL '1 month', NOW() - INTERVAL '3 weeks', 6.00, 'hectares', '2025 Dry', 'harvested', 75000),
(5, 2, 3, 'Rice', 'FARO 52', NOW() - INTERVAL '2 months', NOW() + INTERVAL '3 months', NULL, 7.00, 'hectares', '2026 Wet', 'growing', 78000),
(6, 3, 4, 'Oil Palm', 'Tenera', NOW() - INTERVAL '3 years', NULL, NULL, 18.00, 'hectares', 'Perennial', 'growing', 120000),
(7, 4, 5, 'Groundnut', 'SAMNUT 24', NOW() - INTERVAL '4 months', NOW() - INTERVAL '1 month', NOW() - INTERVAL '2 weeks', 12.00, 'hectares', '2025 Dry', 'harvested', 55000),
(8, 4, 14, 'Sorghum', 'SAMSORG 17', NOW() - INTERVAL '3 months', NOW() + INTERVAL '2 months', NULL, 8.00, 'hectares', '2026 Main', 'growing', 28000),
(9, 5, 6, 'Cocoa', 'Amelonado', NOW() - INTERVAL '5 years', NULL, NULL, 20.00, 'hectares', 'Perennial', 'growing', 850000),
(10, 5, 12, 'Plantain', 'Agbagba', NOW() - INTERVAL '10 months', NOW() - INTERVAL '1 month', NOW() - INTERVAL '3 weeks', 6.00, 'hectares', '2025 Main', 'harvested', 35000),
(11, 6, 7, 'Yam', 'White Yam', NOW() - INTERVAL '7 months', NOW() - INTERVAL '1 month', NOW() - INTERVAL '10 days', 8.00, 'hectares', '2025 Main', 'harvested', 65000),
(12, 6, 13, 'Tomato', 'UC82B', NOW() - INTERVAL '3 months', NOW() + INTERVAL '1 month', NULL, 2.00, 'hectares', '2026 Dry', 'growing', 42000),
(13, 6, 13, 'Pepper', 'Nsukka Yellow', NOW() - INTERVAL '4 months', NOW() + INTERVAL '2 weeks', NULL, 1.00, 'hectares', '2026 Dry', 'flowering', 55000),
(14, 7, 8, 'Rice', 'FARO 66', NOW() - INTERVAL '4 months', NOW() + INTERVAL '1 month', NULL, 15.00, 'hectares', '2026 Wet', 'growing', 72000),
(15, 8, 9, 'Tomato', 'Roma VF', NOW() - INTERVAL '2 months', NOW() + INTERVAL '1 month', NULL, 4.00, 'hectares', '2026 Dry', 'flowering', 38000),
(16, 8, 9, 'Onion', 'Red Creole', NOW() - INTERVAL '3 months', NOW() + INTERVAL '3 weeks', NULL, 2.00, 'hectares', '2026 Dry', 'growing', 45000),
(17, 9, 10, 'Oil Palm', 'Dura x Pisifera', NOW() - INTERVAL '4 years', NULL, NULL, 25.00, 'hectares', 'Perennial', 'growing', 130000),
(18, 10, 11, 'Millet', 'SOSAT-C88', NOW() - INTERVAL '3 months', NOW() + INTERVAL '1 month', NULL, 10.00, 'hectares', '2026 Main', 'growing', 22000),
(19, 10, 11, 'Cowpea', 'IT97K-499-35', NOW() - INTERVAL '2 months', NOW() + INTERVAL '2 months', NULL, 5.00, 'hectares', '2026 Main', 'growing', 35000),
(20, 2, 15, 'Spinach', 'Efo Tete', NOW() - INTERVAL '6 weeks', NOW() + INTERVAL '2 weeks', NULL, 1.00, 'hectares', '2026 Dry', 'growing', 18000),
(21, 2, 15, 'Okra', 'Clemson Spineless', NOW() - INTERVAL '2 months', NOW() + INTERVAL '3 weeks', NULL, 0.50, 'hectares', '2026 Dry', 'growing', 25000),
(22, 5, 6, 'Cocoa', 'F3 Amazon', NOW() - INTERVAL '4 years', NULL, NULL, 5.00, 'hectares', 'Perennial', 'growing', 900000),
(23, 7, 8, 'Rice', 'NERICA-L 34', NOW() - INTERVAL '3 months', NOW() + INTERVAL '2 months', NULL, 3.00, 'hectares', '2026 Wet', 'planted', 80000),
(24, 1, 2, 'Soybean', 'TGx 1448-2E', NOW() - INTERVAL '3 months', NOW() + INTERVAL '1 month', NULL, 3.00, 'hectares', '2026 Main', 'growing', 42000),
(25, 6, 7, 'Yam', 'Water Yam', NOW() - INTERVAL '6 months', NOW() + INTERVAL '1 month', NULL, 2.00, 'hectares', '2026 Main', 'growing', 58000);
SELECT setval('crops_id_seq', 25);

-- ============================================================
-- 5. HARVESTS
-- ============================================================
INSERT INTO harvests (id, user_id, crop_id, harvest_date, quantity, unit, quality, storage_location, market_price, sold_quantity, revenue, notes) VALUES
(1, 1, 1, NOW() - INTERVAL '2 months', 25000.00, 'kg', 'Grade A', 'Iseyin Warehouse', 45, 20000.00, 900000, 'Excellent cassava yield'),
(2, 2, 4, NOW() - INTERVAL '3 weeks', 18000.00, 'kg', 'Grade A', 'Nsukka Rice Mill', 75, 15000.00, 1125000, 'FARO 44 premium paddy'),
(3, 4, 7, NOW() - INTERVAL '2 weeks', 8000.00, 'kg', 'Grade A', 'Bichi Store', 55, 6000.00, 330000, 'Clean shelled groundnuts'),
(4, 5, 10, NOW() - INTERVAL '3 weeks', 12000.00, 'bunches', 'Grade A', 'Ondo Cold Store', 3500, 10000.00, 35000000, 'Mature plantain bunches'),
(5, 6, 11, NOW() - INTERVAL '10 days', 15000.00, 'tubers', 'Grade A', 'Otukpo Yam Barn', 800, 12000.00, 9600000, 'Premium white yam'),
(6, 3, 6, NOW() - INTERVAL '1 month', 5000.00, 'kg', 'Grade B', 'Awka Processing Mill', 350, 4500.00, 1575000, 'Fresh palm fruit bunches'),
(7, 9, 17, NOW() - INTERVAL '3 weeks', 6000.00, 'kg', 'Grade A', 'Owerri Oil Mill', 380, 5500.00, 2090000, 'High quality palm fruit'),
(8, 5, 9, NOW() - INTERVAL '2 months', 3000.00, 'kg', 'Grade A', 'Idanre Cocoa Store', 2800, 2500.00, 7000000, 'Fermented cocoa beans'),
(9, 7, 14, NOW() - INTERVAL '6 months', 22000.00, 'kg', 'Grade A', 'Argungu Rice Store', 70, 20000.00, 1400000, 'Kebbi premium rice'),
(10, 6, 13, NOW() - INTERVAL '2 months', 2000.00, 'kg', 'Grade A', 'Otukpo Market', 1200, 1800.00, 2160000, 'Nsukka yellow pepper'),
(11, 8, 15, NOW() - INTERVAL '1 month', 5000.00, 'kg', 'Grade A', 'Zaria Cold Store', 250, 4000.00, 1000000, 'Fresh roma tomatoes');
SELECT setval('harvests_id_seq', 11);

-- ============================================================
-- 6. LIVESTOCK
-- ============================================================
INSERT INTO livestock (id, user_id, farm_id, animal_type, breed, quantity, purpose, acquisition_date, acquisition_cost, current_value, health_status, notes) VALUES
(1, 1, 1, 'Cattle', 'White Fulani', 15, 'Dual purpose', NOW() - INTERVAL '2 years', 3500000, 5250000, 'healthy', 'Free range grazing'),
(2, 4, 5, 'Goats', 'West African Dwarf', 30, 'Meat', NOW() - INTERVAL '1 year', 450000, 750000, 'healthy', 'Fed on groundnut haulms'),
(3, 6, 7, 'Chickens', 'Noiler', 200, 'Eggs + Meat', NOW() - INTERVAL '6 months', 200000, 400000, 'healthy', 'Free range layers'),
(4, 7, 8, 'Cattle', 'Sokoto Gudali', 25, 'Meat', NOW() - INTERVAL '18 months', 6250000, 8750000, 'healthy', 'Fattening for market'),
(5, 10, 11, 'Sheep', 'Yankasa', 40, 'Meat', NOW() - INTERVAL '1 year', 1200000, 1800000, 'healthy', 'Grazing alongside millet'),
(6, 2, 3, 'Fish', 'Catfish (Clarias)', 5000, 'Sale', NOW() - INTERVAL '4 months', 750000, 1500000, 'healthy', 'Earthen pond aquaculture');
SELECT setval('livestock_id_seq', 6);

-- ============================================================
-- 7. FARM INPUTS (correct columns: input_name, cost_per_unit, total_cost)
-- ============================================================
INSERT INTO farm_inputs (id, user_id, farm_id, crop_id, input_type, input_name, quantity, unit, cost_per_unit, total_cost, supplier, purchase_date, notes) VALUES
(1, 1, 1, 1, 'fertilizer', 'NPK 15-15-15', 50, 'bags', 15000, 750000, 'Notore Chemicals', NOW() - INTERVAL '4 months', 'Applied at planting'),
(2, 1, 2, 3, 'seed', 'SAMMAZ 15 Maize Seed', 100, 'kg', 1500, 150000, 'Premier Seeds', NOW() - INTERVAL '3 months', 'Certified seeds'),
(3, 2, 3, 4, 'fertilizer', 'Urea 46-0-0', 30, 'bags', 14000, 420000, 'Indorama Eleme', NOW() - INTERVAL '5 months', 'Top dressing'),
(4, 4, 5, 7, 'seed', 'SAMNUT 24 Groundnut', 200, 'kg', 900, 180000, 'IAR Samaru', NOW() - INTERVAL '4 months', 'Foundation seed'),
(5, 6, 7, 11, 'seed', 'Yam Setts (White Yam)', 5000, 'setts', 300, 1500000, 'IITA Ibadan', NOW() - INTERVAL '7 months', 'Minisett technology'),
(6, 7, 8, 14, 'herbicide', 'Orizo Plus', 20, 'litres', 8000, 160000, 'Syngenta Nigeria', NOW() - INTERVAL '3 months', 'Pre-emergence rice'),
(7, 8, 9, 15, 'fertilizer', 'NPK 20-10-10', 15, 'bags', 15000, 225000, 'Golden Fertilizer', NOW() - INTERVAL '2 months', 'Tomato basal application'),
(8, 5, 6, 9, 'pesticide', 'Ridomil Gold', 5, 'kg', 12500, 62500, 'Syngenta Nigeria', NOW() - INTERVAL '2 months', 'Black pod prevention');
SELECT setval('farm_inputs_id_seq', 8);

-- ============================================================
-- 8. EXPENSES (correct columns: expense_date, receipt)
-- ============================================================
INSERT INTO expenses (id, user_id, farm_id, category, description, amount, expense_date, payment_method, notes) VALUES
(1, 1, 1, 'labor', 'Cassava harvesting crew (15 workers x 3 days)', 225000, NOW() - INTERVAL '2 months', 'cash', 'Harvest labor'),
(2, 1, 1, 'transport', 'Truck hire Iseyin to Lagos market', 150000, NOW() - INTERVAL '7 weeks', 'mobile_money', '10-ton truck'),
(3, 2, 3, 'labor', 'Rice transplanting crew', 180000, NOW() - INTERVAL '5 months', 'cash', '20 workers'),
(4, 4, 5, 'equipment', 'Tractor hire for land preparation', 120000, NOW() - INTERVAL '4 months', 'bank_transfer', '15 hectares'),
(5, 5, 6, 'input', 'Cocoa seedlings (500 units)', 375000, NOW() - INTERVAL '6 months', 'cash', 'Gap filling'),
(6, 6, 7, 'storage', 'Yam barn construction', 450000, NOW() - INTERVAL '3 months', 'bank_transfer', '500 tuber capacity'),
(7, 7, 8, 'irrigation', 'Canal maintenance and pump repair', 85000, NOW() - INTERVAL '2 months', 'cash', 'Seasonal maintenance'),
(8, 8, 9, 'input', 'Drip irrigation pipes (200m)', 340000, NOW() - INTERVAL '3 months', 'bank_transfer', 'Netafim brand');
SELECT setval('expenses_id_seq', 8);

-- ============================================================
-- 9. PRODUCE LISTINGS
-- ============================================================
INSERT INTO produce_listings (id, user_id, farm_id, crop_id, title, description, category, quantity, unit, price_per_unit, total_price, organic, available_from, available_until, delivery_options, location, status, views) VALUES
(1, 1, 1, 1, 'Premium Cassava Tubers - Iseyin', 'Fresh TMS 30572 cassava tubers, harvested within 48hrs. For garri, fufu, starch.', 'tubers', 5000, 'kg', 45, 225000, false, NOW() - INTERVAL '2 months', NOW() + INTERVAL '2 weeks', '["pickup","delivery"]', '{"state":"Oyo","city":"Iseyin","address":"Farm Road, Oke-Ogun"}', 'active', 342),
(2, 2, 3, 4, 'FARO 44 Paddy Rice - Nsukka', 'Premium long-grain paddy rice, sun-dried to 14% moisture.', 'grains', 3000, 'kg', 75, 225000, false, NOW() - INTERVAL '3 weeks', NOW() + INTERVAL '6 weeks', '["pickup","delivery"]', '{"state":"Enugu","city":"Nsukka","address":"Agric Lane"}', 'active', 218),
(3, 4, 5, 7, 'Shelled Groundnuts - Kano', 'Clean shelled groundnuts, SAMNUT 24. Low aflatoxin.', 'legumes', 2000, 'kg', 55, 110000, false, NOW() - INTERVAL '2 weeks', NOW() + INTERVAL '4 weeks', '["pickup"]', '{"state":"Kano","city":"Bichi","address":"Groundnut Avenue"}', 'active', 156),
(4, 5, 12, 10, 'Fresh Plantain Bunches - Ondo', 'Mature Agbagba plantain, 8-12 fingers per hand.', 'fruits', 2000, 'bunches', 3500, 7000000, true, NOW() - INTERVAL '3 weeks', NOW() + INTERVAL '1 week', '["pickup","delivery"]', '{"state":"Ondo","city":"Idanre","address":"Cocoa Road"}', 'active', 445),
(5, 6, 7, 11, 'Premium White Yam - Benue', 'Large tubers (2-5kg each), excellent pounding quality.', 'tubers', 3000, 'tubers', 800, 2400000, false, NOW() - INTERVAL '10 days', NOW() + INTERVAL '3 weeks', '["pickup","delivery"]', '{"state":"Benue","city":"Otukpo","address":"Yam Market Road"}', 'active', 523),
(6, 3, 4, 6, 'Crude Palm Oil - Anambra', 'Fresh pressed crude palm oil, bright orange, high vitamin A.', 'oils', 200, 'litres', 1200, 240000, true, NOW() - INTERVAL '1 month', NOW() + INTERVAL '2 months', '["delivery"]', '{"state":"Imo","city":"Owerri","address":"Oil Palm Street"}', 'active', 189),
(7, 5, 6, 9, 'Fermented Cocoa Beans - Ondo', 'Grade 1 fermented cocoa beans, 7% moisture. Export quality.', 'cash_crops', 500, 'kg', 2800, 1400000, true, NOW() - INTERVAL '2 months', NOW() + INTERVAL '3 months', '["pickup","delivery"]', '{"state":"Ondo","city":"Idanre","address":"Forest Reserve Rd"}', 'active', 67),
(8, 7, 8, 14, 'Kebbi Premium Rice - Argungu', 'Stone-free, long-grain FARO 66 rice. Locally parboiled.', 'grains', 5000, 'kg', 72, 360000, false, NOW() - INTERVAL '1 month', NOW() + INTERVAL '2 months', '["pickup","delivery"]', '{"state":"Kebbi","city":"Argungu","address":"Rice Mill Road"}', 'active', 312),
(9, 8, 9, 15, 'Fresh Roma Tomatoes - Kaduna', 'Fresh, firm Roma VF tomatoes. Sorted and graded.', 'vegetables', 1000, 'kg', 250, 250000, false, NOW() - INTERVAL '1 week', NOW() + INTERVAL '2 weeks', '["pickup"]', '{"state":"Kaduna","city":"Zaria","address":"Tomato Valley"}', 'active', 278),
(10, 6, 13, 13, 'Nsukka Yellow Pepper - Benue', 'Aromatic dried and ground. Very spicy. 1kg bags.', 'spices', 500, 'kg', 3500, 1750000, true, NOW() - INTERVAL '2 months', NOW() + INTERVAL '4 months', '["pickup","delivery"]', '{"state":"Enugu","city":"Nsukka","address":"Pepper Farm Rd"}', 'active', 145),
(11, 10, 11, 18, 'Pearl Millet - Sokoto', 'Clean pearl millet, SOSAT-C88. For fura, tuwo, flour.', 'grains', 3000, 'kg', 22, 66000, false, NOW() - INTERVAL '2 weeks', NOW() + INTERVAL '6 weeks', '["pickup"]', '{"state":"Sokoto","city":"Sokoto","address":"Grain Market"}', 'active', 89),
(12, 9, 10, 17, 'Organic Palm Kernel Oil - Imo', 'Cold-pressed palm kernel oil, 100% organic.', 'oils', 300, 'litres', 1800, 540000, true, NOW() - INTERVAL '3 weeks', NOW() + INTERVAL '2 months', '["delivery"]', '{"state":"Anambra","city":"Onitsha","address":"Palm Oil Market"}', 'active', 102);
SELECT setval('produce_listings_id_seq', 12);

-- ============================================================
-- 10. BUYER PROFILES (correct columns)
-- ============================================================
INSERT INTO buyer_profiles (id, user_id, business_name, business_type, phone, delivery_addresses, preferences) VALUES
(1, 11, 'Lagos Fresh Foods Ltd', 'wholesaler', '+2348023456001', '["45 Balogun Street, Lagos Island"]', '{"cold_chain":true}'),
(2, 12, 'Abuja Organic Market', 'retailer', '+2348023456002', '["12 Wuse Market, Zone 5, Abuja"]', '{"organic":true}'),
(3, 13, 'Kano Grains Trading Co', 'wholesaler', '+2348023456003', '["78 Dawanau Market, Kano"]', '{"bulk":true}'),
(4, 14, 'Port Harcourt Foods Hub', 'processor', '+2348023456004', '["23 Trans Amadi, Port Harcourt"]', '{"express":true}'),
(5, 15, 'Ibadan Farm-Fresh Depot', 'distributor', '+2348023456005', '["5 Bodija Market, Ibadan"]', '{"local":true}');
SELECT setval('buyer_profiles_id_seq', 5);

-- ============================================================
-- 11. MARKETPLACE ORDERS
-- ============================================================
INSERT INTO marketplace_orders (id, buyer_id, seller_id, order_number, total_amount, status, payment_status, payment_method, delivery_method, delivery_address, delivery_date, tracking_number, created_at, confirmed_at, delivered_at) VALUES
(1, 11, 1, 'ORD-2026-00001', 900000, 'delivered', 'paid', 'bank_transfer', 'delivery', '45 Balogun Street, Lagos', NOW() - INTERVAL '6 weeks', 'TRK-NG-001', NOW() - INTERVAL '7 weeks', NOW() - INTERVAL '6 weeks' - INTERVAL '1 day', NOW() - INTERVAL '6 weeks'),
(2, 12, 2, 'ORD-2026-00002', 375000, 'delivered', 'paid', 'bank_transfer', 'delivery', '12 Wuse Market, Abuja', NOW() - INTERVAL '3 weeks', 'TRK-NG-002', NOW() - INTERVAL '4 weeks', NOW() - INTERVAL '3 weeks' - INTERVAL '2 days', NOW() - INTERVAL '3 weeks'),
(3, 13, 4, 'ORD-2026-00003', 550000, 'delivered', 'paid', 'cash', 'pickup', 'Dawanau Market, Kano', NOW() - INTERVAL '2 weeks', NULL, NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '2 weeks' - INTERVAL '1 day', NOW() - INTERVAL '2 weeks'),
(4, 11, 5, 'ORD-2026-00004', 3500000, 'shipped', 'paid', 'bank_transfer', 'delivery', '45 Balogun Street, Lagos', NOW() + INTERVAL '2 days', 'TRK-NG-004', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days', NULL),
(5, 14, 6, 'ORD-2026-00005', 2400000, 'shipped', 'paid', 'bank_transfer', 'delivery', '23 Trans Amadi, PH', NOW() + INTERVAL '1 day', 'TRK-NG-005', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', NULL),
(6, 15, 1, 'ORD-2026-00006', 450000, 'confirmed', 'paid', 'mobile_money', 'delivery', '5 Bodija Market, Ibadan', NOW() + INTERVAL '3 days', NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '12 hours', NULL),
(7, 12, 7, 'ORD-2026-00007', 720000, 'preparing', 'paid', 'bank_transfer', 'delivery', '12 Wuse Market, Abuja', NOW() + INTERVAL '5 days', NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NULL),
(8, 11, 8, 'ORD-2026-00008', 250000, 'pending', 'pending', 'bank_transfer', 'delivery', '45 Balogun Street, Lagos', NOW() + INTERVAL '7 days', NULL, NOW() - INTERVAL '1 day', NULL, NULL),
(9, 13, 10, 'ORD-2026-00009', 132000, 'delivered', 'paid', 'cash', 'pickup', 'Dawanau Market, Kano', NOW() - INTERVAL '1 week', NULL, NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '8 days', NOW() - INTERVAL '1 week'),
(10, 14, 3, 'ORD-2026-00010', 240000, 'delivered', 'paid', 'bank_transfer', 'delivery', '23 Trans Amadi, PH', NOW() - INTERVAL '2 weeks', 'TRK-NG-010', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '2 weeks' - INTERVAL '3 days', NOW() - INTERVAL '2 weeks'),
(11, 15, 6, 'ORD-2026-00011', 1750000, 'confirmed', 'paid', 'mobile_money', 'delivery', '5 Bodija Market, Ibadan', NOW() + INTERVAL '4 days', NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '6 hours', NULL),
(12, 12, 9, 'ORD-2026-00012', 540000, 'delivered', 'paid', 'bank_transfer', 'delivery', '12 Wuse Market, Abuja', NOW() - INTERVAL '10 days', 'TRK-NG-012', NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '11 days', NOW() - INTERVAL '10 days'),
(13, 11, 7, 'ORD-2026-00013', 360000, 'preparing', 'paid', 'bank_transfer', 'delivery', '45 Balogun Street, Lagos', NOW() + INTERVAL '6 days', NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '8 hours', NULL),
(14, 13, 1, 'ORD-2026-00014', 225000, 'pending', 'pending', 'cash', 'pickup', 'Dawanau Market, Kano', NULL, NULL, NOW(), NULL, NULL),
(15, 15, 5, 'ORD-2026-00015', 1400000, 'delivered', 'paid', 'bank_transfer', 'delivery', '5 Bodija Market, Ibadan', NOW() - INTERVAL '5 weeks', 'TRK-NG-015', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '5 weeks' - INTERVAL '2 days', NOW() - INTERVAL '5 weeks');
SELECT setval('marketplace_orders_id_seq', 15);

-- ============================================================
-- 12. ORDER ITEMS
-- ============================================================
INSERT INTO order_items (id, order_id, listing_id, quantity, unit, price_per_unit, subtotal) VALUES
(1, 1, 1, 5000, 'kg', 45, 225000),
(2, 2, 2, 3000, 'kg', 75, 225000),
(3, 3, 3, 2000, 'kg', 55, 110000),
(4, 4, 4, 1000, 'bunches', 3500, 3500000),
(5, 5, 5, 3000, 'tubers', 800, 2400000),
(6, 6, 1, 3000, 'kg', 45, 135000),
(7, 7, 8, 5000, 'kg', 72, 360000),
(8, 8, 9, 1000, 'kg', 250, 250000),
(9, 9, 11, 3000, 'kg', 22, 66000),
(10, 10, 6, 200, 'litres', 1200, 240000),
(11, 11, 10, 500, 'kg', 3500, 1750000),
(12, 12, 12, 300, 'litres', 1800, 540000),
(13, 13, 8, 5000, 'kg', 72, 360000),
(14, 14, 1, 5000, 'kg', 45, 225000),
(15, 15, 7, 500, 'kg', 2800, 1400000);
SELECT setval('order_items_id_seq', 15);

-- ============================================================
-- 13. ESCROW ACCOUNTS
-- ============================================================
INSERT INTO escrow_accounts (id, order_id, buyer_id, seller_id, amount, currency, status, release_condition, auto_release_at, released_at) VALUES
(1, 1, 11, 1, 900000, 'NGN', 'released', 'buyer_confirmation', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '6 weeks'),
(2, 2, 12, 2, 375000, 'NGN', 'released', 'buyer_confirmation', NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '3 weeks'),
(3, 3, 13, 4, 550000, 'NGN', 'released', 'buyer_confirmation', NOW() - INTERVAL '1 week', NOW() - INTERVAL '2 weeks'),
(4, 4, 11, 5, 3500000, 'NGN', 'held', 'buyer_confirmation', NOW() + INTERVAL '9 days', NULL),
(5, 5, 14, 6, 2400000, 'NGN', 'held', 'buyer_confirmation', NOW() + INTERVAL '8 days', NULL),
(6, 6, 15, 1, 450000, 'NGN', 'held', 'buyer_confirmation', NOW() + INTERVAL '10 days', NULL),
(7, 9, 13, 10, 132000, 'NGN', 'released', 'buyer_confirmation', NOW(), NOW() - INTERVAL '1 week'),
(8, 10, 14, 3, 240000, 'NGN', 'released', 'buyer_confirmation', NOW() - INTERVAL '1 week', NOW() - INTERVAL '2 weeks'),
(9, 12, 12, 9, 540000, 'NGN', 'released', 'buyer_confirmation', NOW() - INTERVAL '3 days', NOW() - INTERVAL '10 days'),
(10, 15, 15, 5, 1400000, 'NGN', 'released', 'buyer_confirmation', NOW() - INTERVAL '4 weeks', NOW() - INTERVAL '5 weeks');
SELECT setval('escrow_accounts_id_seq', 10);

-- ============================================================
-- 14. DRIVERS (correct columns)
-- ============================================================
INSERT INTO drivers (id, user_id, license_number, vehicle_type, vehicle_registration, has_refrigeration, capacity_kg, current_latitude, current_longitude, rating, total_deliveries, active, online_status) VALUES
(1, 16, 'DRV-LAG-2024-001', 'truck', 'LAG-234-XY', true, 5000, 6.5244, 3.3792, 4.7, 156, true, 'online'),
(2, 17, 'DRV-ABJ-2024-002', 'van', 'ABJ-567-CD', true, 2000, 9.0579, 7.4951, 4.5, 89, true, 'on_delivery'),
(3, 18, 'DRV-ENU-2024-003', 'motorcycle', 'ENU-890-EF', false, 100, 6.4410, 7.4943, 4.8, 203, true, 'online');
SELECT setval('drivers_id_seq', 3);

-- ============================================================
-- 15. VEHICLES (correct columns)
-- ============================================================
INSERT INTO vehicles (id, driver_id, type, capacity_kg, has_refrigeration, license_plate, make, model, year, status) VALUES
(1, 1, 'truck', 5000, true, 'LAG-234-XY', 'Toyota', 'Dyna', 2022, 'active'),
(2, 2, 'van', 2000, true, 'ABJ-567-CD', 'Ford', 'Transit', 2023, 'active'),
(3, 3, 'motorcycle', 100, false, 'ENU-890-EF', 'Bajaj', 'Boxer 150', 2024, 'active');
SELECT setval('vehicles_id_seq', 3);

-- ============================================================
-- 16. DELIVERY ZONES (correct columns)
-- ============================================================
INSERT INTO delivery_zones (id, name, city, country, base_fee, per_km_fee, active) VALUES
(1, 'Lagos Metro', 'Lagos', 'Nigeria', 50000, 150, true),
(2, 'Abuja Metro', 'Abuja', 'Nigeria', 40000, 120, true),
(3, 'South-East Corridor', 'Enugu', 'Nigeria', 35000, 100, true),
(4, 'North-West Zone', 'Kano', 'Nigeria', 45000, 130, true);
SELECT setval('delivery_zones_id_seq', 4);

-- ============================================================
-- 17. DELIVERY ROUTES (correct columns)
-- ============================================================
INSERT INTO delivery_routes (id, origin_latitude, origin_longitude, destination_latitude, destination_longitude, distance_km, estimated_minutes, road_quality) VALUES
(1, 7.9710, 3.5940, 6.4531, 3.3958, 210.0, 300, 'good'),
(2, 6.8567, 7.3955, 9.0579, 7.4951, 320.0, 420, 'fair'),
(3, 12.2319, 8.2467, 12.0000, 8.5167, 45.0, 60, 'good'),
(4, 7.1904, 8.1300, 4.8156, 7.0498, 380.0, 480, 'fair'),
(5, 12.7489, 4.5253, 9.0579, 7.4951, 650.0, 720, 'poor'),
(6, 7.1167, 5.1167, 6.4531, 3.3958, 280.0, 360, 'good');
SELECT setval('delivery_routes_id_seq', 6);

-- ============================================================
-- 18. DELIVERY ASSIGNMENTS
-- ============================================================
INSERT INTO delivery_assignments (id, order_id, driver_id, route_id, status, pickup_time, delivery_time, estimated_arrival, actual_arrival, temperature, notes) VALUES
(1, 1, 1, 1, 'delivered', NOW() - INTERVAL '7 weeks' + INTERVAL '1 day', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks' + INTERVAL '2 hours', NOW() - INTERVAL '6 weeks', 22.5, 'Delivered on time'),
(2, 2, 2, 2, 'delivered', NOW() - INTERVAL '4 weeks' + INTERVAL '1 day', NOW() - INTERVAL '3 weeks', NOW() - INTERVAL '3 weeks' + INTERVAL '3 hours', NOW() - INTERVAL '3 weeks', 24.0, 'Delivered on time'),
(3, 4, 1, 6, 'in_transit', NOW() - INTERVAL '1 day', NULL, NOW() + INTERVAL '2 days', NULL, 8.5, 'Cold chain active, plantain'),
(4, 5, 3, 4, 'in_transit', NOW() - INTERVAL '2 days', NULL, NOW() + INTERVAL '1 day', NULL, 18.0, 'Yam delivery in progress'),
(5, 10, 3, 4, 'delivered', NOW() - INTERVAL '3 weeks' + INTERVAL '1 day', NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '2 weeks' + INTERVAL '4 hours', NOW() - INTERVAL '2 weeks', 25.0, 'Palm oil delivery'),
(6, 12, 2, 2, 'delivered', NOW() - INTERVAL '2 weeks' + INTERVAL '1 day', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days' + INTERVAL '2 hours', NOW() - INTERVAL '10 days', 26.0, 'Palm kernel oil'),
(7, 15, 1, 6, 'delivered', NOW() - INTERVAL '6 weeks' + INTERVAL '1 day', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '5 weeks' + INTERVAL '5 hours', NOW() - INTERVAL '5 weeks', 12.0, 'Cocoa beans');
SELECT setval('delivery_assignments_id_seq', 7);

-- ============================================================
-- 19. DELIVERY TRACKING
-- ============================================================
INSERT INTO delivery_tracking (id, assignment_id, latitude, longitude, temperature, humidity, speed, heading, timestamp) VALUES
(1, 3, 7.1167, 5.1167, 8.5, 85.0, 0.0, 0, NOW() - INTERVAL '1 day'),
(2, 3, 7.0500, 4.8000, 8.2, 84.0, 65.5, 225, NOW() - INTERVAL '20 hours'),
(3, 3, 6.9200, 4.5000, 8.0, 83.0, 70.0, 220, NOW() - INTERVAL '16 hours'),
(4, 3, 6.7800, 4.1000, 8.8, 86.0, 55.0, 230, NOW() - INTERVAL '12 hours'),
(5, 3, 6.6500, 3.8000, 9.0, 85.0, 60.0, 235, NOW() - INTERVAL '8 hours'),
(6, 3, 6.5500, 3.5000, 8.5, 84.0, 45.0, 240, NOW() - INTERVAL '4 hours'),
(7, 4, 7.1904, 8.1300, 18.0, 70.0, 0.0, 0, NOW() - INTERVAL '2 days'),
(8, 4, 6.9000, 7.8000, 19.0, 68.0, 55.0, 180, NOW() - INTERVAL '36 hours'),
(9, 4, 6.5000, 7.2000, 18.5, 72.0, 60.0, 190, NOW() - INTERVAL '24 hours'),
(10, 4, 5.8000, 6.9000, 19.5, 75.0, 50.0, 200, NOW() - INTERVAL '12 hours');
SELECT setval('delivery_tracking_id_seq', 10);

-- ============================================================
-- 20. COLLECTION POINTS (correct columns)
-- ============================================================
INSERT INTO collection_points (id, name, latitude, longitude, address, capacity_tons, operating_hours, contact_phone, active) VALUES
(1, 'Iseyin Collection Center', 7.9710, 3.5940, 'Iseyin Market, Oyo State', 50.0, '06:00-18:00', '+2348012345001', true),
(2, 'Nsukka Agric Hub', 6.8567, 7.3955, 'University Road, Nsukka', 30.0, '07:00-17:00', '+2348012345002', true),
(3, 'Bichi Collection Point', 12.2319, 8.2467, 'Bichi Market, Kano', 40.0, '06:00-19:00', '+2348012345004', true),
(4, 'Otukpo Yam Center', 7.1904, 8.1300, 'Otukpo Main Market, Benue', 60.0, '05:00-18:00', '+2348012345006', true);
SELECT setval('collection_points_id_seq', 4);

-- ============================================================
-- 21. AGGREGATION HUBS (correct columns)
-- ============================================================
INSERT INTO aggregation_hubs (id, name, latitude, longitude, address, cold_storage_capacity_tons, processing_capacity_tons, grading_enabled, contact_phone, active) VALUES
(1, 'Lagos Distribution Hub', 6.5895, 3.3918, 'Mile 12 Market Complex, Lagos', 100.0, 500.0, true, '+2348091234001', true),
(2, 'Abuja Agric Hub', 9.1000, 7.3500, 'Dei-Dei Market, Abuja', 50.0, 300.0, true, '+2348091234002', true),
(3, 'Kano Commodity Hub', 12.0000, 8.5167, 'Dawanau International Market', 0.0, 800.0, true, '+2348091234003', true),
(4, 'Enugu Processing Center', 6.4410, 7.4943, 'New Haven, Enugu', 30.0, 200.0, true, '+2348091234004', true);
SELECT setval('aggregation_hubs_id_seq', 4);

-- ============================================================
-- 22. COLD CHAIN SENSORS & READINGS
-- ============================================================
INSERT INTO cold_chain_sensors (id, sensor_id, vehicle_id, facility_id, sensor_type, min_temp, max_temp, alert_threshold_high, alert_threshold_low, active, last_reading) VALUES
(1, 'SENSOR-LAG-001', 1, NULL, 'temperature_humidity', -5.00, 45.00, 15.00, 2.00, true, NOW() - INTERVAL '1 hour'),
(2, 'SENSOR-ABJ-001', 2, NULL, 'temperature_humidity', -5.00, 45.00, 15.00, 2.00, true, NOW() - INTERVAL '2 hours'),
(3, 'SENSOR-HUB-LAG', NULL, 1, 'temperature', -10.00, 50.00, 8.00, -2.00, true, NOW() - INTERVAL '30 minutes'),
(4, 'SENSOR-HUB-ABJ', NULL, 2, 'temperature_humidity', -10.00, 50.00, 10.00, 0.00, true, NOW() - INTERVAL '45 minutes'),
(5, 'SENSOR-ENU-001', 3, NULL, 'temperature', -5.00, 45.00, 20.00, 5.00, true, NOW() - INTERVAL '3 hours');
SELECT setval('cold_chain_sensors_id_seq', 5);

INSERT INTO cold_chain_readings (id, sensor_id, temperature, humidity, latitude, longitude, battery_level, alert_triggered) VALUES
(1, 'SENSOR-LAG-001', 8.50, 85.0, 6.5500, 3.5000, 92, false),
(2, 'SENSOR-LAG-001', 8.20, 84.0, 6.6500, 3.8000, 90, false),
(3, 'SENSOR-LAG-001', 9.00, 86.0, 6.7800, 4.1000, 88, false),
(4, 'SENSOR-ABJ-001', 24.00, 65.0, 9.0579, 7.4951, 95, false),
(5, 'SENSOR-HUB-LAG', 4.50, NULL, 6.5895, 3.3918, 100, false),
(6, 'SENSOR-HUB-ABJ', 6.00, 70.0, 9.1000, 7.3500, 98, false),
(7, 'SENSOR-ENU-001', 18.00, 70.0, 6.4410, 7.4943, 85, false),
(8, 'SENSOR-LAG-001', 16.50, 78.0, 7.0500, 4.8000, 84, true);
SELECT setval('cold_chain_readings_id_seq', 8);

-- ============================================================
-- 23. MARKETPLACE REVIEWS (correct columns)
-- ============================================================
INSERT INTO marketplace_reviews (id, order_id, reviewer_id, reviewee_id, rating, comment, review_type) VALUES
(1, 1, 11, 1, 5, 'Excellent cassava quality! Fresh tubers, delivered on time to Lagos.', 'buyer_to_seller'),
(2, 2, 12, 2, 4, 'Good rice quality, well packaged. Slight delivery delay.', 'buyer_to_seller'),
(3, 3, 13, 4, 5, 'Best groundnuts in Kano! Clean, no aflatoxin.', 'buyer_to_seller'),
(4, 9, 13, 10, 4, 'Good millet quality. Fair pricing.', 'buyer_to_seller'),
(5, 10, 14, 3, 5, 'Premium palm oil! Bright color, great taste.', 'buyer_to_seller'),
(6, 12, 12, 9, 5, 'Organic palm kernel oil, excellent quality.', 'buyer_to_seller'),
(7, 15, 15, 5, 5, 'Export-grade cocoa beans. Properly fermented.', 'buyer_to_seller');
SELECT setval('marketplace_reviews_id_seq', 7);

-- ============================================================
-- 24. SELLER RATINGS (correct columns)
-- ============================================================
INSERT INTO seller_ratings (id, seller_id, average_rating, total_reviews, five_star_count, four_star_count, three_star_count, two_star_count, one_star_count) VALUES
(1, 1, 4.80, 2, 1, 1, 0, 0, 0),
(2, 2, 4.00, 1, 0, 1, 0, 0, 0),
(3, 3, 5.00, 1, 1, 0, 0, 0, 0),
(4, 4, 5.00, 1, 1, 0, 0, 0, 0),
(5, 5, 5.00, 2, 2, 0, 0, 0, 0),
(6, 6, 4.50, 1, 0, 1, 0, 0, 0),
(7, 9, 5.00, 1, 1, 0, 0, 0, 0),
(8, 10, 4.00, 1, 0, 1, 0, 0, 0);
SELECT setval('seller_ratings_id_seq', 8);

-- ============================================================
-- 25. ORDER RETURNS
-- ============================================================
INSERT INTO order_returns (id, order_id, buyer_id, seller_id, reason, description, return_method, refund_amount, refund_method, status, seller_response, approved_at, received_at, refunded_at) VALUES
(1, 1, 11, 1, 'quality_issue', '200kg cassava tubers showed signs of rot upon delivery.', 'collection_point', 9000, 'mobile_money', 'refunded', 'We apologize. Full refund for affected quantity.', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '4 weeks' - INTERVAL '3 days', NOW() - INTERVAL '4 weeks'),
(2, 9, 13, 10, 'wrong_item', 'Received regular millet instead of pearl millet SOSAT-C88.', 'pickup', 66000, 'cash', 'approved', 'Sorry for the mix-up. Will arrange replacement.', NOW() - INTERVAL '4 days', NULL, NULL),
(3, 2, 12, 2, 'damaged', 'Rice bags were wet during transit. 500kg affected.', 'delivery', 37500, 'bank_transfer', 'requested', NULL, NULL, NULL, NULL);
SELECT setval('order_returns_id_seq', 3);

-- ============================================================
-- 26. ORDER FRESHNESS LOGS
-- ============================================================
INSERT INTO order_freshness_logs (id, order_id, assignment_id, sensor_id, avg_temperature, max_temperature, min_temperature, avg_humidity, total_transit_minutes, cold_chain_breaches, estimated_shelf_life_hours, freshness_score, freshness_grade, harvest_date, pack_date, delivery_date) VALUES
(1, 1, 1, 'SENSOR-LAG-001', 22.50, 28.00, 18.00, 72.0, 300, 0, 168, 85.0, 'A', NOW() - INTERVAL '7 weeks' - INTERVAL '2 days', NOW() - INTERVAL '7 weeks' - INTERVAL '1 day', NOW() - INTERVAL '6 weeks'),
(2, 4, 3, 'SENSOR-LAG-001', 8.50, 9.00, 8.00, 85.0, NULL, 0, 120, 92.0, 'A+', NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days', NULL),
(3, 5, 4, 'SENSOR-ENU-001', 18.00, 20.00, 16.00, 70.0, NULL, 0, 336, 78.0, 'B+', NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days', NULL),
(4, 10, 5, 'SENSOR-ENU-001', 25.00, 28.00, 22.00, 68.0, 480, 0, 720, 90.0, 'A', NOW() - INTERVAL '3 weeks' - INTERVAL '3 days', NOW() - INTERVAL '3 weeks' - INTERVAL '2 days', NOW() - INTERVAL '2 weeks'),
(5, 15, 7, 'SENSOR-LAG-001', 12.00, 15.00, 10.00, 55.0, 360, 0, 2160, 95.0, 'A+', NOW() - INTERVAL '6 weeks' - INTERVAL '5 days', NOW() - INTERVAL '6 weeks' - INTERVAL '3 days', NOW() - INTERVAL '5 weeks'),
(6, 2, 2, 'SENSOR-ABJ-001', 24.00, 30.00, 20.00, 65.0, 420, 1, 480, 68.0, 'C+', NOW() - INTERVAL '4 weeks' - INTERVAL '3 days', NOW() - INTERVAL '4 weeks' - INTERVAL '2 days', NOW() - INTERVAL '3 weeks');
SELECT setval('order_freshness_logs_id_seq', 6);

-- ============================================================
-- 27. ORDER NOTIFICATIONS
-- ============================================================
INSERT INTO order_notifications (id, order_id, user_id, channel, event_type, title, body, sent_at, read_at, delivery_status) VALUES
(1, 1, 11, 'push', 'order_confirmed', 'Order Confirmed', 'Your order ORD-2026-00001 for cassava has been confirmed.', NOW() - INTERVAL '7 weeks', NOW() - INTERVAL '7 weeks' + INTERVAL '5 minutes', 'delivered'),
(2, 1, 11, 'sms', 'order_shipped', 'Order Shipped', 'Your cassava order is on the way! Tracking: TRK-NG-001.', NOW() - INTERVAL '6 weeks' - INTERVAL '1 day', NULL, 'delivered'),
(3, 1, 11, 'push', 'order_delivered', 'Order Delivered', 'Your cassava tubers have been delivered to Lagos.', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks' + INTERVAL '10 minutes', 'delivered'),
(4, 1, 1, 'push', 'payment_received', 'Payment Received', 'You received NGN 900,000 for order ORD-2026-00001.', NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks' + INTERVAL '2 minutes', 'delivered'),
(5, 4, 11, 'push', 'order_shipped', 'Order Shipped', 'Your plantain order is on the way! Cold chain active at 8.5C.', NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours', 'delivered'),
(6, 5, 14, 'push', 'order_shipped', 'Order Shipped', 'Your yam order is being delivered. ETA: tomorrow.', NOW() - INTERVAL '2 days', NULL, 'delivered'),
(7, 8, 11, 'push', 'order_created', 'New Order', 'Your order ORD-2026-00008 for tomatoes has been placed.', NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours', 'delivered'),
(8, 8, 8, 'push', 'new_order_received', 'New Order!', 'You have a new order for 1000kg tomatoes from Tunde Bakare.', NOW() - INTERVAL '1 day', NULL, 'delivered'),
(9, 14, 1, 'sms', 'new_order_received', 'New Order', 'New order ORD-2026-00014 for 5000kg cassava. Buyer: Aisha Suleiman.', NOW(), NULL, 'pending'),
(10, 6, 15, 'push', 'order_confirmed', 'Order Confirmed', 'Adebayo Okonkwo confirmed your cassava order.', NOW() - INTERVAL '12 hours', NOW() - INTERVAL '11 hours', 'delivered');
SELECT setval('order_notifications_id_seq', 10);

-- ============================================================
-- 28. RETAIL STORES (B2B)
-- ============================================================
INSERT INTO retail_stores (id, owner_id, name, business_type, registration_number, tax_id, address, city, state, country, latitude, longitude, contact_phone, contact_email, operating_hours, delivery_instructions, preferred_delivery_days, payment_terms, credit_limit, credit_used, currency, verified, verified_at, tier, avg_monthly_volume, preferred_categories, active) VALUES
(1, 23, 'FreshMart Supermarket', 'supermarket', 'RC-12345678', 'TIN-98765432', '15 Admiralty Way, Lekki Phase 1', 'Lagos', 'Lagos', 'Nigeria', 6.4281, 3.4536, '+2348067890001', 'retail.freshmart@stores.ng', '{"mon-sat":"08:00-21:00","sun":"10:00-18:00"}', 'Deliver to loading bay at back entrance.', '["monday","wednesday","friday"]', 'net_7', 5000000, 1200000, 'NGN', true, NOW() - INTERVAL '2 months', 'premium', 15000000, '["vegetables","fruits","tubers","grains"]', true),
(2, 24, 'Mama Nkechi Foods', 'restaurant', 'RC-23456789', 'TIN-87654321', '8 Allen Avenue, Ikeja', 'Lagos', 'Lagos', 'Nigeria', 6.6018, 3.3515, '+2348067890002', 'retail.mamankechi@stores.ng', '{"mon-sun":"06:00-22:00"}', 'Kitchen entrance on the left side.', '["tuesday","thursday","saturday"]', 'cod', 0, 0, 'NGN', true, NOW() - INTERVAL '1 month', 'standard', 8000000, '["vegetables","spices","oils","tubers"]', true),
(3, 11, 'Lagos Fresh Foods Wholesale', 'wholesaler', 'RC-34567890', 'TIN-76543210', '45 Balogun Street, Lagos Island', 'Lagos', 'Lagos', 'Nigeria', 6.4531, 3.3958, '+2348023456001', 'buyer.lagos@market.ng', '{"mon-sat":"05:00-19:00"}', 'Gate 3, warehouse section B.', '["monday","tuesday","wednesday","thursday","friday"]', 'net_14', 10000000, 3500000, 'NGN', true, NOW() - INTERVAL '3 months', 'premium', 50000000, '["grains","tubers","vegetables","fruits","oils"]', true),
(4, 12, 'Abuja Organic Shop', 'grocery', 'RC-45678901', 'TIN-65432109', '12 Wuse Market, Zone 5', 'Abuja', 'FCT', 'Nigeria', 9.0579, 7.4951, '+2348023456002', 'buyer.abuja@market.ng', '{"mon-sat":"09:00-20:00","sun":"12:00-18:00"}', 'Front door delivery only.', '["wednesday","saturday"]', 'net_7', 2000000, 500000, 'NGN', true, NOW() - INTERVAL '6 weeks', 'standard', 10000000, '["fruits","vegetables","spices","oils"]', true),
(5, 15, 'Bodija Market Depot', 'wholesaler', 'RC-56789012', NULL, '5 Bodija Market Complex', 'Ibadan', 'Oyo', 'Nigeria', 7.4167, 3.9000, '+2348023456005', 'buyer.ibadan@market.ng', '{"mon-sat":"04:00-18:00"}', 'Ask for Alhaji Bodija at stall 45.', '["monday","wednesday","friday","saturday"]', 'net_30', 8000000, 2000000, 'NGN', true, NOW() - INTERVAL '2 months', 'premium', 30000000, '["tubers","grains","vegetables"]', true);
SELECT setval('retail_stores_id_seq', 5);

-- ============================================================
-- 29. RETAIL STANDING ORDERS
-- ============================================================
INSERT INTO retail_standing_orders (id, store_id, seller_id, category, product_name, weekly_quantity, unit, max_price_per_unit, quality_grade, delivery_day, delivery_time_slot, requires_cold_chain, auto_renew, status, last_fulfilled_at, fulfillment_rate) VALUES
(1, 1, 6, 'tubers', 'White Yam', 500, 'tubers', 900, 'A', 'monday', 'morning', false, true, 'active', NOW() - INTERVAL '3 days', 95.00),
(2, 1, 1, 'tubers', 'Cassava Tubers', 1000, 'kg', 50, 'A', 'wednesday', 'morning', false, true, 'active', NOW() - INTERVAL '5 days', 98.00),
(3, 1, 8, 'vegetables', 'Fresh Tomatoes', 200, 'kg', 300, 'A', 'monday', 'early_morning', true, true, 'active', NOW() - INTERVAL '3 days', 88.00),
(4, 2, 6, 'vegetables', 'Nsukka Yellow Pepper', 20, 'kg', 4000, 'A', 'tuesday', 'morning', false, true, 'active', NOW() - INTERVAL '5 days', 92.00),
(5, 2, 3, 'oils', 'Crude Palm Oil', 50, 'litres', 1300, 'A', 'thursday', 'morning', false, true, 'active', NOW() - INTERVAL '3 days', 100.00),
(6, 3, 7, 'grains', 'Kebbi Premium Rice', 5000, 'kg', 80, 'A', 'monday', 'morning', false, true, 'active', NOW() - INTERVAL '3 days', 90.00),
(7, 3, 1, 'tubers', 'Cassava Tubers', 10000, 'kg', 48, 'A', 'wednesday', 'morning', false, true, 'active', NOW() - INTERVAL '5 days', 96.00),
(8, 4, 5, 'fruits', 'Fresh Plantain', 200, 'bunches', 4000, 'A', 'wednesday', 'morning', true, true, 'active', NOW() - INTERVAL '5 days', 85.00),
(9, 4, 2, 'grains', 'FARO 44 Rice', 500, 'kg', 80, 'A', 'saturday', 'morning', false, true, 'active', NOW() - INTERVAL '1 day', 94.00),
(10, 5, 6, 'tubers', 'White Yam', 2000, 'tubers', 850, 'A', 'monday', 'early_morning', false, true, 'active', NOW() - INTERVAL '3 days', 92.00);
SELECT setval('retail_standing_orders_id_seq', 10);

-- ============================================================
-- 30. RETAIL INVOICES
-- ============================================================
INSERT INTO retail_invoices (id, store_id, invoice_number, order_id, subtotal, tax_amount, delivery_fee, total_amount, currency, status, due_date, paid_at, payment_method, payment_reference, notes, line_items) VALUES
(1, 1, 'INV-2026-0001', 5, 2400000, 180000, 150000, 2730000, 'NGN', 'paid', NOW() - INTERVAL '1 week', NOW() - INTERVAL '5 days', 'bank_transfer', 'REF-GTB-20260501', 'White yam delivery', '[{"item":"White Yam","qty":3000,"unit":"tubers","price":800}]'),
(2, 1, 'INV-2026-0002', 6, 450000, 33750, 50000, 533750, 'NGN', 'unpaid', NOW() + INTERVAL '3 days', NULL, NULL, NULL, 'Cassava tubers May', '[{"item":"Cassava","qty":3000,"unit":"kg","price":45}]'),
(3, 2, 'INV-2026-0003', NULL, 180000, 13500, 25000, 218500, 'NGN', 'paid', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', 'cash', 'CASH-20260523', 'Weekly pepper and palm oil', '[{"item":"Pepper","qty":20,"unit":"kg","price":3500}]'),
(4, 3, 'INV-2026-0004', 13, 360000, 27000, 75000, 462000, 'NGN', 'unpaid', NOW() + INTERVAL '10 days', NULL, NULL, NULL, 'Kebbi rice weekly', '[{"item":"Rice","qty":5000,"unit":"kg","price":72}]'),
(5, 3, 'INV-2026-0005', 1, 900000, 67500, 150000, 1117500, 'NGN', 'paid', NOW() - INTERVAL '5 weeks', NOW() - INTERVAL '4 weeks', 'bank_transfer', 'REF-FBN-20260420', 'Cassava bulk April', '[{"item":"Cassava","qty":20000,"unit":"kg","price":45}]'),
(6, 4, 'INV-2026-0006', NULL, 540000, 40500, 80000, 660500, 'NGN', 'overdue', NOW() - INTERVAL '3 days', NULL, NULL, NULL, 'Plantain and rice', '[{"item":"Plantain","qty":100,"unit":"bunches","price":3500}]'),
(7, 5, 'INV-2026-0007', 11, 1750000, 131250, 100000, 1981250, 'NGN', 'unpaid', NOW() + INTERVAL '25 days', NULL, NULL, NULL, 'Nsukka yellow pepper bulk', '[{"item":"Pepper","qty":500,"unit":"kg","price":3500}]'),
(8, 1, 'INV-2026-0008', NULL, 625000, 46875, 50000, 721875, 'NGN', 'paid', NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '10 days', 'bank_transfer', 'REF-UBA-20260515', 'Standing order fulfillment', '[{"item":"Tomatoes","qty":200,"unit":"kg","price":250}]');
SELECT setval('retail_invoices_id_seq', 8);

-- ============================================================
-- 31. MOBILE MONEY ACCOUNTS
-- ============================================================
INSERT INTO mobile_money_accounts (id, user_id, provider, phone_number, account_name, is_default, verified) VALUES
(1, 1, 'MTN MoMo', '+2348012345001', 'Adebayo Okonkwo', true, true),
(2, 2, 'Airtel Money', '+2348012345002', 'Chinwe Eze', true, true),
(3, 4, 'MTN MoMo', '+2348012345004', 'Fatima Abdullahi', true, true),
(4, 5, 'OPay', '+2348012345005', 'Oluwaseun Adeyemi', true, true),
(5, 6, 'PalmPay', '+2348012345006', 'Ngozi Okafor', true, true),
(6, 11, 'OPay', '+2348023456001', 'Tunde Bakare', true, true),
(7, 12, 'MTN MoMo', '+2348023456002', 'Grace Okoro', true, true),
(8, 7, 'MTN MoMo', '+2348012345007', 'Ibrahim Musa', true, true);
SELECT setval('mobile_money_accounts_id_seq', 8);

-- ============================================================
-- 32. MOBILE MONEY TRANSACTIONS (correct columns)
-- ============================================================
INSERT INTO mobile_money_transactions (id, user_id, provider, transaction_type, amount, currency, phone_number, provider_transaction_id, order_id, status) VALUES
(1, 1, 'MTN MoMo', 'credit', 900000, 'NGN', '+2348012345001', 'MTN-REF-001', 1, 'completed'),
(2, 2, 'Airtel Money', 'credit', 375000, 'NGN', '+2348012345002', 'AIR-REF-001', 2, 'completed'),
(3, 5, 'OPay', 'credit', 1400000, 'NGN', '+2348012345005', 'OPY-REF-001', 15, 'completed'),
(4, 11, 'OPay', 'debit', 450000, 'NGN', '+2348023456001', 'OPY-REF-002', 6, 'completed'),
(5, 6, 'PalmPay', 'credit', 2400000, 'NGN', '+2348012345006', 'PLP-REF-001', 5, 'completed');
SELECT setval('mobile_money_transactions_id_seq', 5);

-- ============================================================
-- 33. CHAMA GROUPS (VSLA)
-- ============================================================
INSERT INTO chama_groups (id, name, description, chairperson_id, treasurer_id, secretary_id, contribution_amount, contribution_frequency, currency, max_members, loan_interest_rate, max_loan_multiplier, meeting_day, location, status) VALUES
(1, 'Iseyin Farmers Cooperative Savings', 'Weekly savings for cassava and maize farmers in Iseyin', 1, 5, 2, 5000, 'weekly', 'NGN', 20, 5.00, 3.00, 'saturday', 'Iseyin Community Hall, Oyo State', 'active'),
(2, 'Nsukka Women Agric Group', 'Bi-weekly savings for women farmers in Nsukka', 2, 6, 8, 3000, 'biweekly', 'NGN', 15, 3.00, 2.50, 'wednesday', 'Nsukka Town Hall, Enugu State', 'active'),
(3, 'Argungu Rice Farmers Association', 'Monthly savings for rice farmers', 7, 10, 4, 10000, 'monthly', 'NGN', 30, 8.00, 3.00, 'friday', 'Argungu Farmers Center, Kebbi', 'active');
SELECT setval('chama_groups_id_seq', 3);

INSERT INTO chama_members (id, group_id, user_id, role, shares, status, joined_at) VALUES
(1, 1, 1, 'chairperson', 10, 'active', NOW() - INTERVAL '1 year'),
(2, 1, 5, 'treasurer', 8, 'active', NOW() - INTERVAL '1 year'),
(3, 1, 2, 'secretary', 6, 'active', NOW() - INTERVAL '11 months'),
(4, 1, 6, 'member', 5, 'active', NOW() - INTERVAL '10 months'),
(5, 1, 3, 'member', 4, 'active', NOW() - INTERVAL '9 months'),
(6, 2, 2, 'chairperson', 8, 'active', NOW() - INTERVAL '8 months'),
(7, 2, 6, 'treasurer', 6, 'active', NOW() - INTERVAL '8 months'),
(8, 2, 8, 'secretary', 5, 'active', NOW() - INTERVAL '7 months'),
(9, 3, 7, 'chairperson', 12, 'active', NOW() - INTERVAL '6 months'),
(10, 3, 10, 'treasurer', 10, 'active', NOW() - INTERVAL '6 months'),
(11, 3, 4, 'secretary', 8, 'active', NOW() - INTERVAL '5 months');
SELECT setval('chama_members_id_seq', 11);

INSERT INTO chama_contributions (id, group_id, member_id, amount, currency, period, status, paid_at) VALUES
(1, 1, 1, 5000, 'NGN', '2026-W20', 'paid', NOW() - INTERVAL '2 weeks'),
(2, 1, 2, 5000, 'NGN', '2026-W20', 'paid', NOW() - INTERVAL '2 weeks'),
(3, 1, 3, 5000, 'NGN', '2026-W20', 'paid', NOW() - INTERVAL '2 weeks'),
(4, 1, 4, 5000, 'NGN', '2026-W20', 'paid', NOW() - INTERVAL '13 days'),
(5, 1, 5, 5000, 'NGN', '2026-W20', 'paid', NOW() - INTERVAL '13 days'),
(6, 1, 1, 5000, 'NGN', '2026-W21', 'paid', NOW() - INTERVAL '1 week'),
(7, 1, 2, 5000, 'NGN', '2026-W21', 'paid', NOW() - INTERVAL '6 days'),
(8, 2, 6, 3000, 'NGN', '2026-W20', 'paid', NOW() - INTERVAL '10 days'),
(9, 2, 7, 3000, 'NGN', '2026-W20', 'paid', NOW() - INTERVAL '10 days'),
(10, 2, 8, 3000, 'NGN', '2026-W20', 'paid', NOW() - INTERVAL '9 days'),
(11, 3, 9, 10000, 'NGN', '2026-05', 'paid', NOW() - INTERVAL '3 weeks'),
(12, 3, 10, 10000, 'NGN', '2026-05', 'paid', NOW() - INTERVAL '3 weeks'),
(13, 3, 11, 10000, 'NGN', '2026-05', 'paid', NOW() - INTERVAL '2 weeks');
SELECT setval('chama_contributions_id_seq', 13);

INSERT INTO chama_loans (id, group_id, member_id, amount, interest_rate, term_months, status, purpose, approved_by, disbursed_at, due_date) VALUES
(1, 1, 5, 150000, 5.00, 3, 'active', 'Purchase maize seeds', 1, NOW() - INTERVAL '1 month', NOW() + INTERVAL '2 months'),
(2, 2, 8, 50000, 3.00, 2, 'active', 'Drip irrigation equipment', 2, NOW() - INTERVAL '2 weeks', NOW() + INTERVAL '6 weeks'),
(3, 3, 11, 200000, 8.00, 6, 'active', 'Tractor hire for land preparation', 7, NOW() - INTERVAL '3 weeks', NOW() + INTERVAL '5 months');
SELECT setval('chama_loans_id_seq', 3);

-- ============================================================
-- 34. COOPERATIVES
-- ============================================================
INSERT INTO cooperatives (id, name, registration_number, type, status, village, district, region, country, latitude, longitude, phone, email, address, share_value, minimum_shares, monthly_contribution, founded_date, description) VALUES
(1, 'Oyo State Cassava Growers Cooperative', 'COOP-OY-2024-001', 'farmer_cooperative', 'active', 'Iseyin', 'Oke-Ogun', 'Oyo', 'Nigeria', 7.9710, 3.5940, '+2349012345001', 'cassava.coop@farmconnect.ng', 'Cooperative Building, Iseyin Market', 50000, 5, 10000, NOW() - INTERVAL '2 years', 'Cooperative of cassava farmers in Oyo State'),
(2, 'South-East Oil Palm Producers Union', 'COOP-AN-2023-002', 'marketing_cooperative', 'active', 'Awka', 'Awka South', 'Anambra', 'Nigeria', 6.2106, 7.0747, '+2349012345002', 'oilpalm.coop@farmconnect.ng', 'NAFDAC Road, Awka', 100000, 3, 15000, NOW() - INTERVAL '3 years', 'Union of oil palm producers across South-East Nigeria'),
(3, 'Kebbi-Sokoto Rice Farmers Alliance', 'COOP-KB-2024-003', 'farmer_cooperative', 'active', 'Argungu', 'Argungu', 'Kebbi', 'Nigeria', 12.7489, 4.5253, '+2349012345003', 'rice.alliance@farmconnect.ng', 'Argungu Farming Center', 25000, 10, 8000, NOW() - INTERVAL '18 months', 'Alliance of rice farmers along Kebbi-Sokoto river basin');
SELECT setval('cooperatives_id_seq', 3);

INSERT INTO cooperative_members (id, cooperative_id, user_id, role, shares, status, joined_at) VALUES
(1, 1, 1, 'chairman', 20, 'active', NOW() - INTERVAL '2 years'),
(2, 1, 5, 'member', 10, 'active', NOW() - INTERVAL '18 months'),
(3, 1, 6, 'member', 8, 'active', NOW() - INTERVAL '1 year'),
(4, 2, 3, 'chairman', 15, 'active', NOW() - INTERVAL '3 years'),
(5, 2, 9, 'member', 10, 'active', NOW() - INTERVAL '2 years'),
(6, 3, 7, 'chairman', 25, 'active', NOW() - INTERVAL '18 months'),
(7, 3, 10, 'member', 15, 'active', NOW() - INTERVAL '1 year'),
(8, 3, 4, 'member', 12, 'active', NOW() - INTERVAL '10 months');
SELECT setval('cooperative_members_id_seq', 8);

-- ============================================================
-- 35. WEATHER STATIONS & DATA (correct columns)
-- ============================================================
INSERT INTO weather_stations (id, station_id, name, latitude, longitude, region, station_type, elevation, owner_id, status, active) VALUES
(1, 'WS-OYO-001', 'Iseyin Agro-Met Station', 7.9710, 3.5940, 'Oyo', 'automated', 250.00, 1, 'active', true),
(2, 'WS-ENU-001', 'Nsukka Weather Station', 6.8567, 7.3955, 'Enugu', 'automated', 420.00, 2, 'active', true),
(3, 'WS-KAN-001', 'Bichi Agro Station', 12.2319, 8.2467, 'Kano', 'manual', 380.00, 4, 'active', true),
(4, 'WS-OND-001', 'Idanre Cocoa Belt Station', 7.1167, 5.1167, 'Ondo', 'automated', 180.00, 5, 'active', true),
(5, 'WS-BEN-001', 'Otukpo Agricultural Station', 7.1904, 8.1300, 'Benue', 'automated', 150.00, 6, 'active', true);
SELECT setval('weather_stations_id_seq', 5);

INSERT INTO weather_data (id, user_id, farm_id, latitude, longitude, timestamp, temperature, humidity, wind_speed, precipitation, weather_condition, source) VALUES
(1, 1, 1, 7.9710, 3.5940, NOW() - INTERVAL '1 hour', 32.5, 78.0, 8.5, 0.0, 'Clear', 'station'),
(2, 1, 1, 7.9710, 3.5940, NOW() - INTERVAL '6 hours', 28.0, 85.0, 15.0, 12.5, 'Rain', 'station'),
(3, 2, 3, 6.8567, 7.3955, NOW() - INTERVAL '1 hour', 29.5, 82.0, 6.0, 0.0, 'Partly Cloudy', 'station'),
(4, 4, 5, 12.2319, 8.2467, NOW() - INTERVAL '2 hours', 38.0, 35.0, 12.0, 0.0, 'Clear', 'station'),
(5, 5, 6, 7.1167, 5.1167, NOW() - INTERVAL '3 hours', 27.0, 90.0, 5.0, 25.0, 'Heavy Rain', 'station'),
(6, 6, 7, 7.1904, 8.1300, NOW() - INTERVAL '1 hour', 31.0, 75.0, 7.0, 0.0, 'Clear', 'station'),
(7, 1, 1, 7.9710, 3.5940, NOW() - INTERVAL '12 hours', 26.0, 92.0, 20.0, 35.0, 'Thunderstorm', 'station'),
(8, 4, 5, 12.2319, 8.2467, NOW() - INTERVAL '6 hours', 42.0, 20.0, 18.0, 0.0, 'Hot', 'station');
SELECT setval('weather_data_id_seq', 8);

-- ============================================================
-- 36. PRICE ALERTS (correct columns)
-- ============================================================
INSERT INTO price_alerts (id, user_id, crop, alert_type, threshold, currency, notification_channel, phone_number, region, active) VALUES
(1, 1, 'Cassava', 'price_above', 50000, 'NGN', 'sms', '+2348012345001', 'oyo', true),
(2, 2, 'Rice', 'price_above', 80000, 'NGN', 'push', '+2348012345002', 'enugu', true),
(3, 4, 'Groundnut', 'price_above', 60000, 'NGN', 'sms', '+2348012345004', 'kano', true),
(4, 5, 'Cocoa', 'price_above', 3000000, 'NGN', 'push', '+2348012345005', 'ondo', true),
(5, 6, 'Yam', 'price_below', 700000, 'NGN', 'sms', '+2348012345006', 'benue', true),
(6, 7, 'Rice', 'price_below', 65000, 'NGN', 'push', '+2348012345007', 'kebbi', true),
(7, 8, 'Tomato', 'price_below', 200000, 'NGN', 'sms', '+2348012345008', 'kaduna', true),
(8, 11, 'Cassava', 'price_below', 40000, 'NGN', 'push', '+2348023456001', 'lagos', true);
SELECT setval('price_alerts_id_seq', 8);

-- ============================================================
-- 37. SUBSCRIPTION PLANS & SUBSCRIPTIONS
-- ============================================================
INSERT INTO subscription_plans (id, name, description, category, items, price_per_delivery, currency, frequency, max_subscribers, active) VALUES
(1, 'Lagos Fresh Veggie Box', 'Weekly box of fresh vegetables from Benue and Oyo farms', 'vegetables', '["Tomatoes 2kg","Pepper 1kg","Spinach 1kg","Okra 1kg","Onions 2kg"]', 15000, 'NGN', 'weekly', 200, true),
(2, 'Nigerian Staples Pack', 'Monthly delivery of Nigerian staple foods', 'staples', '["Rice 10kg","Garri 5kg","Yam flour 5kg","Palm oil 2L"]', 45000, 'NGN', 'monthly', 150, true),
(3, 'Fruit Basket Premium', 'Bi-weekly fresh fruit delivery', 'fruits', '["Plantain 1 bunch","Oranges 2kg","Pineapple 2","Watermelon 1"]', 12000, 'NGN', 'biweekly', 100, true),
(4, 'Farm-Fresh Protein Pack', 'Weekly protein delivery from local farms', 'protein', '["Eggs 1 crate","Catfish 2kg","Chicken 1 whole"]', 25000, 'NGN', 'weekly', 80, true);
SELECT setval('subscription_plans_id_seq', 4);

INSERT INTO subscriptions (id, user_id, plan_id, start_date, delivery_address, preferences, payment_method, status) VALUES
(1, 11, 1, NOW() - INTERVAL '2 months', '45 Balogun Street, Lagos Island', '{"extra_tomato":true}', 'mobile_money', 'active'),
(2, 12, 2, NOW() - INTERVAL '1 month', '12 Wuse Market, Zone 5, Abuja', '{"prefer_local_rice":true}', 'bank_transfer', 'active'),
(3, 14, 3, NOW() - INTERVAL '3 weeks', '23 Trans Amadi, Port Harcourt', '{"ripe_plantain":true}', 'mobile_money', 'active'),
(4, 15, 1, NOW() - INTERVAL '6 weeks', '5 Bodija Market, Ibadan', NULL, 'cash', 'active'),
(5, 11, 4, NOW() - INTERVAL '1 month', '45 Balogun Street, Lagos Island', NULL, 'mobile_money', 'active');
SELECT setval('subscriptions_id_seq', 5);

-- ============================================================
-- 38. CREDIT SCORES
-- ============================================================
INSERT INTO credit_scores (id, user_id, score, risk_level, factors, model_version, calculated_at) VALUES
(1, 1, 780, 'low', '{"repayment_history":95,"farm_size":85,"cooperative_membership":90,"years_farming":88}', 'v2.1', NOW() - INTERVAL '1 week'),
(2, 2, 720, 'low', '{"repayment_history":88,"farm_size":70,"cooperative_membership":85,"years_farming":75}', 'v2.1', NOW() - INTERVAL '1 week'),
(3, 3, 690, 'medium', '{"repayment_history":82,"farm_size":90,"cooperative_membership":80,"years_farming":65}', 'v2.1', NOW() - INTERVAL '1 week'),
(4, 4, 750, 'low', '{"repayment_history":90,"farm_size":80,"cooperative_membership":88,"years_farming":80}', 'v2.1', NOW() - INTERVAL '1 week'),
(5, 5, 810, 'low', '{"repayment_history":98,"farm_size":95,"cooperative_membership":92,"years_farming":90}', 'v2.1', NOW() - INTERVAL '1 week'),
(6, 6, 700, 'low', '{"repayment_history":85,"farm_size":75,"cooperative_membership":82,"years_farming":70}', 'v2.1', NOW() - INTERVAL '1 week'),
(7, 7, 740, 'low', '{"repayment_history":88,"farm_size":85,"cooperative_membership":78,"years_farming":82}', 'v2.1', NOW() - INTERVAL '1 week'),
(8, 8, 580, 'high', '{"repayment_history":60,"farm_size":55,"cooperative_membership":40,"years_farming":50}', 'v2.1', NOW() - INTERVAL '1 week');
SELECT setval('credit_scores_id_seq', 8);

-- ============================================================
-- 39. SOIL TESTS
-- ============================================================
INSERT INTO soil_tests (id, user_id, farm_id, ph, nitrogen, phosphorus, potassium, organic_matter, cec, texture, moisture, test_method, lab_name, recommendations, overall_score, created_at) VALUES
(1, 1, 1, 6.2, 0.15, 12.5, 0.35, 2.8, 15.0, 'loamy', 42.0, 'lab', 'IITA Ibadan Soil Lab', '["Apply NPK 15-15-15 at 200kg/ha","Add organic mulch"]', 72, NOW() - INTERVAL '3 months'),
(2, 2, 3, 5.8, 0.12, 8.0, 0.28, 2.2, 12.0, 'clay_loam', 55.0, 'lab', 'UNN Soil Science Lab', '["Apply urea at 100kg/ha","Add compost 5t/ha"]', 58, NOW() - INTERVAL '2 months'),
(3, 4, 5, 7.1, 0.08, 6.5, 0.22, 1.5, 8.0, 'sandy', 18.0, 'kit', NULL, '["Nitrogen deficient - apply urea","Mulching recommended"]', 45, NOW() - INTERVAL '6 weeks'),
(4, 5, 6, 5.5, 0.20, 15.0, 0.42, 3.5, 18.0, 'volcanic_loam', 60.0, 'lab', 'Cocoa Research Institute', '["Ideal for cocoa","Maintain organic mulch layer"]', 85, NOW() - INTERVAL '4 months'),
(5, 6, 7, 6.5, 0.18, 14.0, 0.38, 3.0, 16.0, 'loamy', 48.0, 'lab', 'IITA Ibadan Soil Lab', '["Good for yam production","Apply potassium supplement"]', 78, NOW() - INTERVAL '5 months'),
(6, 7, 8, 6.8, 0.10, 7.0, 0.25, 1.8, 10.0, 'alluvial', 70.0, 'lab', 'Kebbi State Agric Lab', '["Nitrogen deficient","Good water retention"]', 62, NOW() - INTERVAL '2 months');
SELECT setval('soil_tests_id_seq', 6);

-- ============================================================
-- 40. KYC PROFILES
-- ============================================================
INSERT INTO user_kyc_profiles (id, user_id, tier, status, first_name, last_name, date_of_birth, nationality, address, id_type, id_number, phone_verified, email_verified, submitted_at, verified_at, verified_by) VALUES
(1, 1, 'enhanced', 'approved', 'Adebayo', 'Okonkwo', '1985-03-15', 'Nigerian', '15 Farm Road, Iseyin, Oyo State', 'national_id', 'NIN-12345678901', true, true, NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months' + INTERVAL '2 days', 19),
(2, 2, 'enhanced', 'approved', 'Chinwe', 'Eze', '1990-07-22', 'Nigerian', '7 Agric Lane, Nsukka, Enugu State', 'national_id', 'NIN-23456789012', true, true, NOW() - INTERVAL '6 weeks', NOW() - INTERVAL '6 weeks' + INTERVAL '1 day', 19),
(3, 4, 'basic', 'approved', 'Fatima', 'Abdullahi', '1988-11-08', 'Nigerian', '45 Groundnut Avenue, Bichi, Kano', 'voters_card', 'VC-45678901', true, false, NOW() - INTERVAL '1 month', NOW() - INTERVAL '1 month' + INTERVAL '3 days', 19),
(4, 5, 'full', 'approved', 'Oluwaseun', 'Adeyemi', '1982-01-30', 'Nigerian', '8 Cocoa Road, Idanre, Ondo State', 'national_id', 'NIN-56789012345', true, true, NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months' + INTERVAL '1 day', 20),
(5, 11, 'enhanced', 'approved', 'Tunde', 'Bakare', '1978-06-12', 'Nigerian', '45 Balogun Street, Lagos Island', 'national_id', 'NIN-11223344556', true, true, NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months' + INTERVAL '2 days', 19);
SELECT setval('user_kyc_profiles_id_seq', 5);

-- ============================================================
-- 41. IOT DEVICES & READINGS
-- ============================================================
INSERT INTO iot_devices (id, device_id, user_id, farm_id, device_type, name, latitude, longitude, status, battery_level, firmware_version, last_seen) VALUES
(1, 'IOT-OYO-SOIL-001', 1, 1, 'soil_sensor', 'Cassava Field Soil Monitor', 7.9710, 3.5940, 'online', 85, '2.1.0', NOW() - INTERVAL '10 minutes'),
(2, 'IOT-ENU-SOIL-001', 2, 3, 'soil_sensor', 'Rice Paddy Monitor', 6.8567, 7.3955, 'online', 72, '2.1.0', NOW() - INTERVAL '15 minutes'),
(3, 'IOT-KAN-WEATHER-001', 4, 5, 'weather_station', 'Bichi Weather Station', 12.2319, 8.2467, 'online', 90, '3.0.1', NOW() - INTERVAL '5 minutes'),
(4, 'IOT-OND-SOIL-001', 5, 6, 'soil_sensor', 'Cocoa Soil Monitor', 7.1167, 5.1167, 'online', 68, '2.1.0', NOW() - INTERVAL '30 minutes'),
(5, 'IOT-BEN-WATER-001', 6, 7, 'water_sensor', 'Yam Field Water Level', 7.1904, 8.1300, 'offline', 15, '1.5.2', NOW() - INTERVAL '2 hours');
SELECT setval('iot_devices_id_seq', 5);

INSERT INTO iot_readings (id, device_id, reading_type, value, unit, metadata, recorded_at) VALUES
(1, 'IOT-OYO-SOIL-001', 'soil_moisture', 42.0, 'percent', '{"depth_cm":30}', NOW() - INTERVAL '10 minutes'),
(2, 'IOT-OYO-SOIL-001', 'soil_temperature', 28.5, 'celsius', '{"depth_cm":30}', NOW() - INTERVAL '10 minutes'),
(3, 'IOT-ENU-SOIL-001', 'soil_moisture', 65.0, 'percent', '{"depth_cm":20}', NOW() - INTERVAL '15 minutes'),
(4, 'IOT-ENU-SOIL-001', 'water_level', 15.0, 'cm', '{"paddy_section":"A"}', NOW() - INTERVAL '15 minutes'),
(5, 'IOT-KAN-WEATHER-001', 'temperature', 38.0, 'celsius', NULL, NOW() - INTERVAL '5 minutes'),
(6, 'IOT-KAN-WEATHER-001', 'humidity', 35.0, 'percent', NULL, NOW() - INTERVAL '5 minutes'),
(7, 'IOT-OND-SOIL-001', 'soil_ph', 5.5, 'ph', '{"depth_cm":25}', NOW() - INTERVAL '30 minutes'),
(8, 'IOT-BEN-WATER-001', 'soil_moisture', 48.0, 'percent', '{"depth_cm":20}', NOW() - INTERVAL '2 hours');
SELECT setval('iot_readings_id_seq', 8);

-- ============================================================
-- 42. EQUIPMENT LISTINGS
-- ============================================================
INSERT INTO equipment_listings (id, owner_id, name, description, category, brand, model, year, condition, daily_rate, weekly_rate, currency, location, latitude, longitude, available, status) VALUES
(1, 1, 'John Deere 5075E Tractor', '75HP tractor with disc plough. Up to 20 hectares.', 'tractor', 'John Deere', '5075E', 2022, 'good', 80000, 450000, 'NGN', 'Iseyin, Oyo State', 7.9710, 3.5940, true, 'active'),
(2, 7, 'Massey Ferguson 385 Tractor', '85HP tractor, 4WD with harrow and planter.', 'tractor', 'Massey Ferguson', '385', 2021, 'excellent', 95000, 550000, 'NGN', 'Argungu, Kebbi', 12.7489, 4.5253, true, 'active'),
(3, 5, 'Honda Water Pump WB30', '3-inch centrifugal pump, 1100L/min.', 'pump', 'Honda', 'WB30', 2023, 'good', 15000, 80000, 'NGN', 'Idanre, Ondo', 7.1167, 5.1167, true, 'active'),
(4, 6, 'Boom Sprayer 500L', 'Tractor-mounted boom sprayer with 12m width.', 'sprayer', 'Jacto', 'Condor 600', 2023, 'good', 25000, 140000, 'NGN', 'Otukpo, Benue', 7.1904, 8.1300, false, 'active');
SELECT setval('equipment_listings_id_seq', 4);

-- ============================================================
-- 43. SUPPLIERS & INVENTORY
-- ============================================================
INSERT INTO suppliers (id, name, contact_person, phone, email, address, category, rating, status) VALUES
(1, 'Notore Chemical Industries', 'Sales Dept', '+2348091000001', 'sales@notore.com', 'Onne, Rivers State', 'fertilizer', 4.5, 'active'),
(2, 'Premier Seeds Nigeria', 'Seed Division', '+2348091000002', 'orders@premierseeds.ng', 'Zaria, Kaduna', 'seeds', 4.7, 'active'),
(3, 'Syngenta Nigeria', 'Agri Solutions', '+2348091000003', 'nigeria@syngenta.com', 'Victoria Island, Lagos', 'pesticide', 4.8, 'active'),
(4, 'Golden Fertilizer Company', 'Customer Service', '+2348091000004', 'sales@goldenfertilizer.ng', 'Ikorodu, Lagos', 'fertilizer', 4.3, 'active');
SELECT setval('suppliers_id_seq', 4);

INSERT INTO inventory_items (id, user_id, item_type, item_name, category, unit, quantity_on_hand, reorder_level, reorder_quantity, unit_cost, supplier_id, storage_location, expiry_date, batch_number) VALUES
(1, 1, 'fertilizer', 'NPK 15-15-15', 'input', 'bags', 25, 10, 50, 15000, 1, 'Iseyin Store Room A', NOW() + INTERVAL '1 year', 'NPK-2026-001'),
(2, 1, 'seed', 'SAMMAZ 15 Maize Seed', 'input', 'kg', 50, 20, 100, 1500, 2, 'Iseyin Seed Store', NOW() + INTERVAL '6 months', 'MZ-2026-001'),
(3, 2, 'fertilizer', 'Urea 46-0-0', 'input', 'bags', 15, 5, 30, 14000, 1, 'Nsukka Store', NOW() + INTERVAL '18 months', 'UR-2026-001'),
(4, 4, 'pesticide', 'Karate 2.5EC', 'input', 'litres', 8, 3, 10, 8500, 3, 'Bichi Chemical Store', NOW() + INTERVAL '2 years', 'KR-2026-001'),
(5, 6, 'produce', 'White Yam', 'harvest', 'tubers', 3000, 500, 0, 800, NULL, 'Otukpo Yam Barn', NOW() + INTERVAL '3 months', 'YM-2026-001'),
(6, 7, 'produce', 'Paddy Rice', 'harvest', 'kg', 8000, 1000, 0, 72, NULL, 'Argungu Rice Store', NOW() + INTERVAL '12 months', 'RC-2026-001');
SELECT setval('inventory_items_id_seq', 6);

-- ============================================================
-- 44. STANDING ORDERS (correct columns)
-- ============================================================
INSERT INTO standing_orders (id, buyer_id, crop_type, quantity_kg, frequency, delivery_day, max_price_per_kg, delivery_address, start_date, status) VALUES
(1, 11, 'Cassava', 5000, 'weekly', 'wednesday', 50, '45 Balogun Street, Lagos', NOW() - INTERVAL '2 months', 'active'),
(2, 12, 'Rice', 3000, 'biweekly', 'saturday', 80, '12 Wuse Market, Abuja', NOW() - INTERVAL '1 month', 'active'),
(3, 13, 'Groundnut', 2000, 'monthly', 'monday', 60, '78 Dawanau Market, Kano', NOW() - INTERVAL '3 weeks', 'active'),
(4, 14, 'Yam', 1000, 'weekly', 'thursday', 900, '23 Trans Amadi, PH', NOW() - INTERVAL '6 weeks', 'active'),
(5, 15, 'Plantain', 500, 'biweekly', 'friday', 4000, '5 Bodija Market, Ibadan', NOW() - INTERVAL '1 month', 'active');
SELECT setval('standing_orders_id_seq', 5);

-- ============================================================
-- 45. BANK ACCOUNTS (correct columns)
-- ============================================================
INSERT INTO bank_accounts (id, user_id, account_number, account_name, bank_name, bank_code, is_verified, is_primary) VALUES
(1, 1, '3012345678', 'Adebayo Okonkwo', 'First Bank of Nigeria', '011', true, true),
(2, 2, '2023456789', 'Chinwe Eze', 'Zenith Bank', '057', true, true),
(3, 5, '0134567890', 'Oluwaseun Adeyemi', 'GTBank', '058', true, true),
(4, 11, '1045678901', 'Tunde Bakare', 'UBA', '033', true, true),
(5, 23, '0056789012', 'Kehinde Fashola', 'Access Bank', '044', true, true);
SELECT setval('bank_accounts_id_seq', 5);

-- ============================================================
-- 46. ACCOUNT BALANCES (correct columns)
-- ============================================================
INSERT INTO account_balances (id, user_id, account_type, account_name, balance, currency, last_transaction_date) VALUES
(1, 1, 'farming', 'Main Account', 2070000, 'NGN', NOW() - INTERVAL '6 weeks'),
(2, 2, 'farming', 'Main Account', 1125000, 'NGN', NOW() - INTERVAL '3 weeks'),
(3, 3, 'farming', 'Main Account', 1575000, 'NGN', NOW() - INTERVAL '1 month'),
(4, 4, 'farming', 'Main Account', 330000, 'NGN', NOW() - INTERVAL '2 weeks'),
(5, 5, 'farming', 'Main Account', 8400000, 'NGN', NOW() - INTERVAL '5 weeks'),
(6, 6, 'farming', 'Main Account', 9600000, 'NGN', NOW() - INTERVAL '10 days'),
(7, 7, 'farming', 'Main Account', 1400000, 'NGN', NOW() - INTERVAL '6 months'),
(8, 8, 'farming', 'Main Account', 0, 'NGN', NULL),
(9, 9, 'farming', 'Main Account', 2090000, 'NGN', NOW() - INTERVAL '3 weeks'),
(10, 10, 'farming', 'Main Account', 132000, 'NGN', NOW() - INTERVAL '1 week');
SELECT setval('account_balances_id_seq', 10);

-- ============================================================
-- 47. PRODUCT REVIEWS (correct columns)
-- ============================================================
INSERT INTO product_reviews (id, listing_id, user_id, order_id, rating, title, comment, verified_purchase, status, helpful_count) VALUES
(1, 1, 11, 1, 5, 'Best cassava in Lagos', 'Fresh tubers, consistent quality. My customers love them.', true, 'approved', 12),
(2, 2, 12, 2, 4, 'Good rice quality', 'Well-dried paddy rice, minimal stones.', true, 'approved', 8),
(3, 5, 14, 5, 5, 'Premium yam tubers', 'Large, smooth tubers perfect for our restaurant.', true, 'approved', 15),
(4, 3, 13, 3, 5, 'Top quality groundnuts', 'Clean, no aflatoxin. Perfect for oil milling.', true, 'approved', 6),
(5, 7, 15, 15, 5, 'Export-grade cocoa', 'Properly fermented beans, great aroma.', true, 'approved', 3);
SELECT setval('product_reviews_id_seq', 5);

-- ============================================================
-- 48. WAREHOUSES & RECEIPTS (correct columns)
-- ============================================================
INSERT INTO warehouses (id, name, code, warehouse_type, address, city, region, latitude, longitude, phone, total_capacity, available_capacity, is_active) VALUES
(1, 'Lagos Agricultural Warehouse', 'WAR-LAG-001', 'cold_storage', 'Mile 12 Complex, Lagos', 'Lagos', 'Lagos', 6.5895, 3.3918, '+2348091234001', 100000, 65000, true),
(2, 'Abuja Commodity Warehouse', 'WAR-ABJ-001', 'dry_storage', 'Dei-Dei, Abuja', 'Abuja', 'FCT', 9.1000, 7.3500, '+2348091234002', 50000, 38000, true),
(3, 'Kano Grain Silos', 'WAR-KAN-001', 'silo', 'Dawanau, Kano', 'Kano', 'Kano', 12.0000, 8.5167, '+2348091234003', 200000, 115000, true);
SELECT setval('warehouses_id_seq', 3);

INSERT INTO warehouse_receipts (id, receipt_number, warehouse_id, depositor_id, depositor_type, commodity_type, quantity, unit, quality_grade, estimated_value, deposit_date, expected_release_date, status, daily_storage_fee) VALUES
(1, 'WR-2026-001', 1, 1, 'farmer', 'Cassava', 10000, 'kg', 'A', 450000, NOW() - INTERVAL '2 months', NOW() + INTERVAL '1 month', 'active', 500),
(2, 'WR-2026-002', 3, 7, 'farmer', 'Rice Paddy', 8000, 'kg', 'A', 576000, NOW() - INTERVAL '1 month', NOW() + INTERVAL '5 months', 'active', 400),
(3, 'WR-2026-003', 1, 6, 'farmer', 'Yam', 5000, 'tubers', 'A', 4000000, NOW() - INTERVAL '10 days', NOW() + INTERVAL '2 months', 'active', 800);
SELECT setval('warehouse_receipts_id_seq', 3);

-- ============================================================
-- 49. TRACEABILITY EVENTS (correct columns)
-- ============================================================
INSERT INTO traceability_events (id, batch_id, event_type, event_description, location, latitude, longitude, quality_grade, temperature, humidity, performed_by, organization_name, is_verified, event_timestamp) VALUES
(1, 'BATCH-CASSAVA-001', 'harvest', 'Cassava harvest from Okonkwo Estate', 'Iseyin, Oyo State', 7.9710, 3.5940, 'A', 28.0, 72.0, 1, 'Okonkwo Farms', true, NOW() - INTERVAL '2 months'),
(2, 'BATCH-CASSAVA-001', 'quality_check', 'Quality grading at collection center', 'Iseyin Collection Center', 7.9710, 3.5940, 'A', 25.0, 68.0, 19, 'FarmConnect QA', true, NOW() - INTERVAL '2 months' + INTERVAL '1 day'),
(3, 'BATCH-CASSAVA-001', 'transport', 'Transport Iseyin to Lagos', 'En route', 6.5895, 3.3918, 'A', 22.5, 75.0, 16, 'FarmConnect Logistics', true, NOW() - INTERVAL '7 weeks'),
(4, 'BATCH-CASSAVA-001', 'delivery', 'Delivered to Lagos Fresh Foods', 'Lagos Island', 6.4531, 3.3958, 'A', 23.0, 70.0, 16, 'FarmConnect Logistics', true, NOW() - INTERVAL '6 weeks'),
(5, 'BATCH-RICE-001', 'harvest', 'Rice harvest from Eze Paddies', 'Nsukka, Enugu State', 6.8567, 7.3955, NULL, 29.0, 82.0, 2, 'Eze Farms', true, NOW() - INTERVAL '3 weeks'),
(6, 'BATCH-RICE-001', 'processing', 'Rice milling at Nsukka mill', 'Nsukka Rice Mill', 6.8567, 7.3955, 'A', 30.0, 60.0, 2, 'Nsukka Rice Mill', true, NOW() - INTERVAL '3 weeks' + INTERVAL '2 days'),
(7, 'BATCH-YAM-001', 'harvest', 'White yam harvest from Okafor Farm', 'Otukpo, Benue', 7.1904, 8.1300, 'A', 31.0, 75.0, 6, 'Okafor Farms', true, NOW() - INTERVAL '10 days'),
(8, 'BATCH-YAM-001', 'storage', 'Stored in traditional yam barn', 'Otukpo Yam Barn', 7.1904, 8.1300, 'A', 26.0, 65.0, 6, 'Okafor Farms', true, NOW() - INTERVAL '10 days');
SELECT setval('traceability_events_id_seq', 8);

-- ============================================================
-- 50. AUDIT LOGS (correct columns)
-- ============================================================
INSERT INTO audit_logs (id, event_id, event_type, entity_type, entity_id, user_id, data) VALUES
(1, 'EVT-001', 'verify_farmer', 'farmer', '1', 19, '{"status":"approved","notes":"NIN verified"}'),
(2, 'EVT-002', 'create_listing', 'listing', '1', 1, '{"title":"Premium Cassava Tubers","quantity":5000}'),
(3, 'EVT-003', 'place_order', 'order', '1', 11, '{"total":900000,"items":1}'),
(4, 'EVT-004', 'confirm_order', 'order', '1', 1, '{"status":"confirmed"}'),
(5, 'EVT-005', 'complete_delivery', 'delivery', '1', 16, '{"status":"delivered","temp":22.5}'),
(6, 'EVT-006', 'release_escrow', 'escrow', '1', 19, '{"amount":900000,"to_user":1}'),
(7, 'EVT-007', 'register_store', 'store', '1', 23, '{"name":"FreshMart Supermarket"}'),
(8, 'EVT-008', 'submit_return', 'return', '1', 11, '{"reason":"quality_issue","amount":9000}');
SELECT setval('audit_logs_id_seq', 8);

-- ============================================================
-- 51. SAVINGS (correct columns)
-- ============================================================
INSERT INTO savings_accounts (id, user_id, farmer_id, account_number, account_name, account_type, balance, interest_rate, status) VALUES
(1, 1, 1, 'SAV-001-001', 'Adebayo Farm Savings', 'farm_savings', 500000, 8.5, 'active'),
(2, 2, 2, 'SAV-002-001', 'Chinwe Farm Savings', 'farm_savings', 250000, 8.5, 'active'),
(3, 5, 5, 'SAV-005-001', 'Oluwaseun Investment', 'investment', 1200000, 12.0, 'active'),
(4, 6, 6, 'SAV-006-001', 'Ngozi Farm Savings', 'farm_savings', 380000, 8.5, 'active');
SELECT setval('savings_accounts_id_seq', 4);

INSERT INTO savings_goals (id, user_id, name, target_amount, current_amount, currency, deadline, status) VALUES
(1, 1, 'New Tractor Fund', 5000000, 2070000, 'NGN', NOW() + INTERVAL '6 months', 'active'),
(2, 2, 'Rice Mill Equipment', 3000000, 1125000, 'NGN', NOW() + INTERVAL '1 year', 'active'),
(3, 5, 'Cocoa Processing Plant', 15000000, 8400000, 'NGN', NOW() + INTERVAL '2 years', 'active'),
(4, 6, 'Cold Storage Facility', 8000000, 2500000, 'NGN', NOW() + INTERVAL '18 months', 'active');
SELECT setval('savings_goals_id_seq', 4);

-- ============================================================
-- 52. DRONE FLIGHTS (correct columns)
-- ============================================================
INSERT INTO drone_flights (id, farm_id, user_id, drone_model, flight_type, planned_area_ha, actual_area_ha, altitude_m, start_time, end_time, duration_minutes, battery_start_pct, battery_end_pct, images_captured, status, notes) VALUES
(1, 1, 1, 'DJI Agras T30', 'survey', 10.00, 10.00, 80, NOW() - INTERVAL '2 weeks', NOW() - INTERVAL '2 weeks' + INTERVAL '45 minutes', 45, 100, 35, 120, 'completed', 'Cassava field health survey'),
(2, 6, 5, 'DJI Phantom 4 RTK', 'monitoring', 20.00, 20.00, 100, NOW() - INTERVAL '1 week', NOW() - INTERVAL '1 week' + INTERVAL '60 minutes', 60, 100, 28, 200, 'completed', 'Cocoa canopy inspection');
SELECT setval('drone_flights_id_seq', 2);

-- ============================================================
-- 53. NOTIFICATION QUEUE (correct columns)
-- ============================================================
INSERT INTO notification_queue (id, user_id, phone_number, channel, notification_type, message_text, status, sent_at) VALUES
(1, 1, '+2348012345001', 'push', 'order', 'New order ORD-2026-00014 for 5000kg cassava from Aisha Suleiman.', 'sent', NOW()),
(2, 8, '+2348012345008', 'push', 'order', 'New order for 1000kg tomatoes from Tunde Bakare.', 'sent', NOW() - INTERVAL '1 day'),
(3, 11, '+2348023456001', 'push', 'delivery', 'Your plantain order is 4 hours away. Temp: 8.5C.', 'sent', NOW() - INTERVAL '4 hours'),
(4, 6, '+2348012345006', 'push', 'payment', 'NGN 2,400,000 received for yam standing order.', 'sent', NOW() - INTERVAL '1 week'),
(5, 2, '+2348012345002', 'sms', 'weather', 'Heavy rainfall expected in Nsukka tomorrow (35mm).', 'sent', NOW() - INTERVAL '12 hours'),
(6, 4, '+2348012345004', 'push', 'price', 'Groundnut prices approaching target at Dawanau Market.', 'sent', NOW() - INTERVAL '2 days'),
(7, 7, '+2348012345007', 'sms', 'cooperative', 'Kebbi-Sokoto Rice Alliance meeting this Friday.', 'pending', NULL),
(8, 1, '+2348012345001', 'push', 'credit', 'Your credit score improved to 780. Qualify for loans up to NGN 2M.', 'sent', NOW() - INTERVAL '1 week');
SELECT setval('notification_queue_id_seq', 8);

-- ============================================================
-- 54. SMS TEMPLATES (correct columns)
-- ============================================================
INSERT INTO sms_templates (id, name, type, subject, body, variables, description, is_active, is_default) VALUES
(1, 'order_confirmation', 'transactional', 'Order Confirmed', 'Your order {{order_number}} for {{product}} confirmed. Seller: {{seller_name}}. Delivery by: {{delivery_date}}.', '["order_number","product","seller_name","delivery_date"]', 'Sent when an order is confirmed', true, true),
(2, 'price_alert', 'alert', 'Price Alert', 'FarmConnect: {{crop}} price is now {{price}}/{{unit}} at {{market}}. Target: {{target_price}}.', '["crop","price","unit","market","target_price"]', 'Triggered by price alert rules', true, true),
(3, 'weather_alert', 'alert', 'Weather Alert', 'Weather Alert for {{location}}: {{alert_type}} expected. {{details}}.', '["location","alert_type","details"]', 'Weather warning notifications', true, true),
(4, 'payment_received', 'transactional', 'Payment Received', 'You received NGN {{amount}} from {{source}} for {{description}}.', '["amount","source","description"]', 'Payment confirmation', true, true),
(5, 'chama_reminder', 'reminder', 'Contribution Reminder', '{{group_name}} contribution of NGN {{amount}} is due on {{date}}.', '["group_name","amount","date"]', 'Chama contribution reminder', true, true);
SELECT setval('sms_templates_id_seq', 5);

-- ============================================================
-- 55. CONSUMER PROFILES (correct columns)
-- ============================================================
INSERT INTO consumer_profiles (id, user_id, delivery_addresses, dietary_preferences) VALUES
(1, 11, '["45 Balogun Street, Lagos Island"]', '{"organic":true}'),
(2, 12, '["12 Wuse Market, Zone 5, Abuja"]', '{"halal":true}'),
(3, 14, '["23 Trans Amadi, Port Harcourt"]', '{"bulk":true}'),
(4, 15, '["5 Bodija Market, Ibadan"]', '{"price_sensitive":true}');
SELECT setval('consumer_profiles_id_seq', 4);

-- ============================================================
-- 56. QUALITY GRADES (correct columns)
-- ============================================================
INSERT INTO quality_grades (id, batch_id, graded_by, hub_id, grade, crop_type, moisture_content, foreign_matter, notes) VALUES
(1, 'BATCH-CASSAVA-001', 19, 1, 'A', 'Cassava', 65.0, 2.0, 'Excellent tubers, uniform size'),
(2, 'BATCH-RICE-001', 19, 4, 'A', 'Rice', 14.0, 1.5, 'Premium rice, well-dried'),
(3, 'BATCH-YAM-001', 19, 4, 'A', 'Yam', 60.0, 3.0, 'Large tubers, no rot'),
(4, 'BATCH-PLANTAIN-001', 19, 1, 'A', 'Plantain', 70.0, 1.0, 'Mature, uniform ripeness'),
(5, 'BATCH-TOMATO-001', 19, 2, 'B', 'Tomato', 92.0, 8.0, 'Good but some overripe');
SELECT setval('quality_grades_id_seq', 5);

-- Done! All key tables seeded with Nigerian agricultural data.
