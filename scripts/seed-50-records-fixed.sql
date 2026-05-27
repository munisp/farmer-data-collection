-- Seed 45 more farmers (we already have 5, to get to 50 total)
INSERT INTO farmers (user_id, first_name, last_name, phone_number, email, address, village, district, region, national_id, registration_date, is_active, verification_status, version)
SELECT 
  1,
  (ARRAY['Oluwaseun', 'Chidinma', 'Emeka', 'Fatima', 'Yusuf', 'Blessing', 'Tunde', 'Aisha', 'Chinedu', 'Halima', 'Kunle', 'Ngozi', 'Musa', 'Adaeze', 'Segun', 'Zainab', 'Obinna', 'Hauwa', 'Femi', 'Amaka', 'Suleiman', 'Chiamaka', 'Danjuma', 'Nneka', 'Babatunde', 'Mariam', 'Ikechukwu', 'Rashida', 'Adeola', 'Khadija', 'Chukwuemeka', 'Salamatu', 'Olumide', 'Hadiza', 'Nnamdi', 'Bilkisu', 'Ayodele', 'Jamila', 'Obiora', 'Safiya', 'Kayode', 'Rukayat', 'Ugochukwu', 'Asabe', 'Temitope'])[i],
  (ARRAY['Adeyemi', 'Okoro', 'Nwachukwu', 'Abdullahi', 'Bello', 'Okonkwo', 'Abubakar', 'Eze', 'Ibrahim', 'Okafor', 'Olawale', 'Chukwu', 'Sani', 'Nwosu', 'Adeleke', 'Mohammed', 'Igwe', 'Yusuf', 'Ogundimu', 'Onyeka', 'Danladi', 'Uzoma', 'Garba', 'Obiora', 'Fashola', 'Aliyu', 'Anyanwu', 'Musa', 'Bakare', 'Hassan', 'Obi', 'Lawal', 'Oyelaran', 'Umar', 'Agu', 'Shehu', 'Adebayo', 'Abubakar', 'Nwankwo', 'Idris', 'Oladipo', 'Bala', 'Eze', 'Tanko', 'Afolabi'])[i],
  '+234' || (7000000000 + i * 1111111)::bigint::text,
  'farmer' || (i + 5) || '@example.com',
  (i * 10)::text || ' Farm Road, ' || (ARRAY['Lagos', 'Kano', 'Ibadan', 'Abuja', 'Port Harcourt', 'Benin City', 'Kaduna', 'Enugu', 'Calabar', 'Jos'])[1 + (i % 10)],
  (ARRAY['Agege', 'Sabon Gari', 'Oke-Ado', 'Wuse', 'Diobu', 'Ugbowo', 'Barnawa', 'Abakpa', 'Calabar South', 'Bukuru'])[1 + (i % 10)],
  (ARRAY['Lagos Island', 'Kano Municipal', 'Ibadan North', 'Abuja Municipal', 'Port Harcourt City', 'Oredo', 'Kaduna South', 'Enugu East', 'Calabar Municipal', 'Jos South'])[1 + (i % 10)],
  (ARRAY['Lagos State', 'Kano State', 'Oyo State', 'FCT Abuja', 'Rivers State', 'Edo State', 'Kaduna State', 'Enugu State', 'Cross River State', 'Plateau State'])[1 + (i % 10)],
  'NIN-' || (10000000 + i * 1000000)::text,
  NOW(),
  true,
  'pending',
  1
FROM generate_series(1, 45) AS i;

-- Seed 50 farms (linked to farmers)
INSERT INTO farms (user_id, farmer_id, farm_name, farm_size, farm_size_unit, location, latitude, longitude, soil_type, irrigation_type, created_at, updated_at, version)
SELECT 
  1,
  ((i - 1) % 50) + 1,
  (ARRAY['Green Valley', 'Sunrise', 'Golden Harvest', 'River View', 'Mountain Top', 'Palm Grove', 'Fertile Plains', 'Oasis', 'Savanna', 'Forest Edge'])[1 + (i % 10)] || ' Farm ' || i,
  (5 + (i % 20))::numeric,
  'acres',
  (ARRAY['Lagos', 'Kano', 'Ibadan', 'Abuja', 'Port Harcourt', 'Benin City', 'Kaduna', 'Enugu', 'Calabar', 'Jos'])[1 + (i % 10)],
  6.5 + (i % 10) * 0.1,
  3.3 + (i % 10) * 0.1,
  (ARRAY['loamy', 'clay', 'sandy', 'silt', 'peat'])[1 + (i % 5)],
  (ARRAY['drip', 'sprinkler', 'flood', 'rain-fed', 'manual'])[1 + (i % 5)],
  NOW(),
  NOW(),
  1
FROM generate_series(1, 50) AS i;

-- Seed 50 crops (linked to farms)
INSERT INTO crops (user_id, farm_id, crop_name, crop_variety, planting_date, expected_harvest_date, area_planted, area_unit, status, created_at, updated_at, version)
SELECT 
  1,
  ((i - 1) % 50) + 1,
  (ARRAY['Cassava', 'Maize', 'Rice', 'Yam', 'Sorghum', 'Millet', 'Cowpea', 'Groundnut', 'Tomato', 'Pepper'])[1 + (i % 10)],
  (ARRAY['TMS 30572', 'SAMMAZ 15', 'FARO 44', 'White Yam', 'Samsorg 17', 'SOSAT-C88', 'IT97K-499-35', 'SAMNUT 24', 'Roma VF', 'Tatase'])[1 + (i % 10)],
  NOW() - (i * interval '7 days'),
  NOW() + ((90 + i * 3) * interval '1 day'),
  (2 + (i % 8))::numeric,
  'acres',
  (ARRAY['planted', 'growing', 'flowering', 'harvesting', 'completed'])[1 + (i % 5)],
  NOW(),
  NOW(),
  1
FROM generate_series(1, 50) AS i;

-- Seed 50 livestock (linked to farms)
INSERT INTO livestock (user_id, farm_id, animal_type, breed, quantity, purpose, acquisition_date, health_status, created_at, updated_at, version)
SELECT 
  1,
  ((i - 1) % 50) + 1,
  (ARRAY['cattle', 'goat', 'sheep', 'poultry', 'pig', 'fish', 'rabbit', 'turkey', 'duck', 'guinea fowl'])[1 + (i % 10)],
  (ARRAY['Sokoto Gudali', 'West African Dwarf', 'Yankasa', 'Noiler', 'Large White', 'Tilapia', 'Chinchilla', 'Bronze', 'Khaki Campbell', 'Pearl'])[1 + (i % 10)],
  (5 + i * 2),
  (ARRAY['meat', 'dairy', 'eggs', 'breeding', 'dual-purpose'])[1 + (i % 5)],
  NOW() - (i * interval '30 days'),
  (ARRAY['healthy', 'sick', 'recovering', 'quarantine', 'healthy'])[1 + (i % 5)],
  NOW(),
  NOW(),
  1
FROM generate_series(1, 50) AS i;

-- Seed 50 harvests (linked to crops)
INSERT INTO harvests (user_id, crop_id, quantity, unit, harvest_date, quality, storage_location, notes, created_at, updated_at, version)
SELECT 
  1,
  ((i - 1) % 50) + 1,
  (100 + i * 50)::numeric,
  (ARRAY['kg', 'tonnes', 'bags', 'bundles', 'crates'])[1 + (i % 5)],
  NOW() - (i * interval '14 days'),
  (ARRAY['A', 'B', 'C', 'A', 'B'])[1 + (i % 5)],
  (ARRAY['Warehouse A', 'Silo 1', 'Cold Storage', 'Barn', 'Open Storage'])[1 + (i % 5)],
  'Harvest batch ' || i,
  NOW(),
  NOW(),
  1
FROM generate_series(1, 50) AS i;

-- Seed 50 expenses (linked to farms)
INSERT INTO expenses (user_id, farm_id, category, amount, description, expense_date, payment_method, created_at, updated_at, version)
SELECT 
  1,
  ((i - 1) % 50) + 1,
  (ARRAY['seeds', 'fertilizer', 'pesticides', 'labor', 'equipment', 'transport', 'storage', 'irrigation', 'veterinary', 'feed'])[1 + (i % 10)],
  (5000 + i * 1000),
  'Expense for ' || (ARRAY['seeds', 'fertilizer', 'pesticides', 'labor', 'equipment', 'transport', 'storage', 'irrigation', 'veterinary', 'feed'])[1 + (i % 10)] || ' - batch ' || i,
  NOW() - (i * interval '7 days'),
  (ARRAY['cash', 'bank_transfer', 'mobile_money', 'credit', 'cash'])[1 + (i % 5)],
  NOW(),
  NOW(),
  1
FROM generate_series(1, 50) AS i;

-- Seed 50 farm_inputs (linked to farms)
INSERT INTO farm_inputs (user_id, farm_id, input_type, input_name, quantity, unit, purchase_date, cost_per_unit, total_cost, supplier, created_at, updated_at, version)
SELECT 
  1,
  ((i - 1) % 50) + 1,
  (ARRAY['seed', 'fertilizer', 'pesticide', 'herbicide', 'equipment'])[1 + (i % 5)],
  (ARRAY['Hybrid Maize Seed', 'NPK 15-15-15', 'Cypermethrin', 'Glyphosate', 'Hoe'])[1 + (i % 5)] || ' ' || i,
  (10 + i * 5)::numeric,
  (ARRAY['kg', 'bags', 'litres', 'litres', 'pieces'])[1 + (i % 5)],
  NOW() - (i * interval '30 days'),
  (200 + i * 50),
  (2000 + i * 500) * (10 + i * 5),
  (ARRAY['AgroMart', 'FarmSupply Co', 'AgriChem Ltd', 'GreenGrow', 'FarmTools Inc'])[1 + (i % 5)],
  NOW(),
  NOW(),
  1
FROM generate_series(1, 50) AS i;

SELECT 'Seeding complete!' as status,
  (SELECT COUNT(*) FROM farmers WHERE user_id = 1) as farmers_count,
  (SELECT COUNT(*) FROM farms WHERE user_id = 1) as farms_count,
  (SELECT COUNT(*) FROM crops WHERE user_id = 1) as crops_count,
  (SELECT COUNT(*) FROM livestock WHERE user_id = 1) as livestock_count,
  (SELECT COUNT(*) FROM harvests WHERE user_id = 1) as harvests_count,
  (SELECT COUNT(*) FROM expenses WHERE user_id = 1) as expenses_count,
  (SELECT COUNT(*) FROM farm_inputs WHERE user_id = 1) as farm_inputs_count;
