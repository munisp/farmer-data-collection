-- Seed Inventory Management and Marketplace Data
-- This script creates synthetic data for the demo user (id=1)

-- ============================================================================
-- SUPPLIERS (for Inventory Management)
-- ============================================================================
INSERT INTO suppliers (user_id, name, contact_person, phone_number, email, address, payment_terms, rating, is_active, created_at, updated_at)
VALUES
  (1, 'AgriSupply Nigeria Ltd', 'Chukwu Emeka', '+234-803-555-0101', 'sales@agrisupply.ng', '15 Industrial Avenue, Lagos', 'Net 30', 5, true, NOW(), NOW()),
  (1, 'FarmTech Solutions', 'Adaeze Okonkwo', '+234-805-555-0202', 'info@farmtech.ng', '42 Commerce Road, Ibadan', 'Net 15', 4, true, NOW(), NOW()),
  (1, 'Green Harvest Inputs', 'Oluwaseun Adeyemi', '+234-802-555-0303', 'orders@greenharvest.ng', '8 Farmers Lane, Kano', 'COD', 4, true, NOW(), NOW()),
  (1, 'Premium Seeds Co', 'Fatima Ibrahim', '+234-806-555-0404', 'seeds@premiumseeds.ng', '23 Agricultural Zone, Kaduna', 'Net 45', 5, true, NOW(), NOW()),
  (1, 'AgroChemicals Plus', 'Bola Ogundimu', '+234-807-555-0505', 'support@agrochemplus.ng', '67 Chemical Drive, Port Harcourt', 'Net 30', 3, true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- INVENTORY ITEMS
-- ============================================================================
INSERT INTO inventory_items (user_id, item_type, item_name, category, unit, quantity_on_hand, reorder_level, reorder_quantity, unit_cost, supplier_id, storage_location, expiry_date, batch_number, created_at, updated_at)
VALUES
  -- Seeds
  (1, 'seed', 'Hybrid Maize Seeds (SAMMAZ 15)', 'Cereals', 'kg', 500, 100, 200, 250000, (SELECT id FROM suppliers WHERE name = 'Premium Seeds Co' LIMIT 1), 'Warehouse A - Shelf 1', '2026-06-30', 'SEED-2024-001', NOW(), NOW()),
  (1, 'seed', 'Improved Cassava Cuttings (TMS 30572)', 'Tubers', 'bundles', 200, 50, 100, 150000, (SELECT id FROM suppliers WHERE name = 'Premium Seeds Co' LIMIT 1), 'Warehouse A - Shelf 2', '2025-03-31', 'SEED-2024-002', NOW(), NOW()),
  (1, 'seed', 'Cowpea Seeds (IT97K-499-35)', 'Legumes', 'kg', 150, 30, 60, 180000, (SELECT id FROM suppliers WHERE name = 'Premium Seeds Co' LIMIT 1), 'Warehouse A - Shelf 3', '2026-01-15', 'SEED-2024-003', NOW(), NOW()),
  (1, 'seed', 'Rice Seeds (FARO 44)', 'Cereals', 'kg', 300, 75, 150, 220000, (SELECT id FROM suppliers WHERE name = 'Premium Seeds Co' LIMIT 1), 'Warehouse A - Shelf 4', '2026-04-20', 'SEED-2024-004', NOW(), NOW()),
  (1, 'seed', 'Tomato Seeds (UC82B)', 'Vegetables', 'packets', 100, 25, 50, 85000, (SELECT id FROM suppliers WHERE name = 'Green Harvest Inputs' LIMIT 1), 'Warehouse A - Shelf 5', '2025-12-31', 'SEED-2024-005', NOW(), NOW()),
  
  -- Fertilizers
  (1, 'fertilizer', 'NPK 15-15-15', 'Compound Fertilizer', 'bags', 250, 50, 100, 1500000, (SELECT id FROM suppliers WHERE name = 'AgriSupply Nigeria Ltd' LIMIT 1), 'Warehouse B - Bay 1', '2026-12-31', 'FERT-2024-001', NOW(), NOW()),
  (1, 'fertilizer', 'Urea (46-0-0)', 'Nitrogen Fertilizer', 'bags', 180, 40, 80, 1200000, (SELECT id FROM suppliers WHERE name = 'AgriSupply Nigeria Ltd' LIMIT 1), 'Warehouse B - Bay 2', '2026-12-31', 'FERT-2024-002', NOW(), NOW()),
  (1, 'fertilizer', 'Single Super Phosphate', 'Phosphate Fertilizer', 'bags', 120, 30, 60, 950000, (SELECT id FROM suppliers WHERE name = 'AgroChemicals Plus' LIMIT 1), 'Warehouse B - Bay 3', '2026-12-31', 'FERT-2024-003', NOW(), NOW()),
  (1, 'fertilizer', 'Organic Compost', 'Organic', 'bags', 400, 100, 200, 350000, (SELECT id FROM suppliers WHERE name = 'Green Harvest Inputs' LIMIT 1), 'Warehouse B - Bay 4', NULL, 'FERT-2024-004', NOW(), NOW()),
  (1, 'fertilizer', 'Potassium Chloride (MOP)', 'Potash Fertilizer', 'bags', 90, 20, 40, 1100000, (SELECT id FROM suppliers WHERE name = 'AgroChemicals Plus' LIMIT 1), 'Warehouse B - Bay 5', '2026-12-31', 'FERT-2024-005', NOW(), NOW()),
  
  -- Pesticides
  (1, 'pesticide', 'Glyphosate Herbicide', 'Herbicide', 'liters', 100, 25, 50, 450000, (SELECT id FROM suppliers WHERE name = 'AgroChemicals Plus' LIMIT 1), 'Chemical Store - Section A', '2025-08-15', 'PEST-2024-001', NOW(), NOW()),
  (1, 'pesticide', 'Cypermethrin Insecticide', 'Insecticide', 'liters', 80, 20, 40, 380000, (SELECT id FROM suppliers WHERE name = 'AgroChemicals Plus' LIMIT 1), 'Chemical Store - Section A', '2025-09-30', 'PEST-2024-002', NOW(), NOW()),
  (1, 'pesticide', 'Mancozeb Fungicide', 'Fungicide', 'kg', 60, 15, 30, 520000, (SELECT id FROM suppliers WHERE name = 'AgroChemicals Plus' LIMIT 1), 'Chemical Store - Section B', '2025-07-20', 'PEST-2024-003', NOW(), NOW()),
  (1, 'pesticide', 'Neem Oil (Organic)', 'Organic Pesticide', 'liters', 50, 10, 25, 280000, (SELECT id FROM suppliers WHERE name = 'Green Harvest Inputs' LIMIT 1), 'Chemical Store - Section C', '2025-12-31', 'PEST-2024-004', NOW(), NOW()),
  
  -- Equipment
  (1, 'equipment', 'Knapsack Sprayer (16L)', 'Spraying Equipment', 'pieces', 15, 3, 5, 2500000, (SELECT id FROM suppliers WHERE name = 'FarmTech Solutions' LIMIT 1), 'Equipment Shed', NULL, 'EQUIP-2024-001', NOW(), NOW()),
  (1, 'equipment', 'Hand Hoe (Heavy Duty)', 'Hand Tools', 'pieces', 50, 10, 20, 350000, (SELECT id FROM suppliers WHERE name = 'FarmTech Solutions' LIMIT 1), 'Equipment Shed', NULL, 'EQUIP-2024-002', NOW(), NOW()),
  (1, 'equipment', 'Cutlass/Machete', 'Hand Tools', 'pieces', 40, 8, 15, 280000, (SELECT id FROM suppliers WHERE name = 'FarmTech Solutions' LIMIT 1), 'Equipment Shed', NULL, 'EQUIP-2024-003', NOW(), NOW()),
  (1, 'equipment', 'Wheelbarrow', 'Transport Equipment', 'pieces', 8, 2, 4, 4500000, (SELECT id FROM suppliers WHERE name = 'FarmTech Solutions' LIMIT 1), 'Equipment Shed', NULL, 'EQUIP-2024-004', NOW(), NOW()),
  (1, 'equipment', 'Irrigation Drip Kit (1 Acre)', 'Irrigation', 'sets', 5, 1, 2, 15000000, (SELECT id FROM suppliers WHERE name = 'FarmTech Solutions' LIMIT 1), 'Equipment Shed', NULL, 'EQUIP-2024-005', NOW(), NOW()),
  (1, 'equipment', 'Harvesting Baskets', 'Harvesting', 'pieces', 100, 20, 40, 150000, (SELECT id FROM suppliers WHERE name = 'AgriSupply Nigeria Ltd' LIMIT 1), 'Equipment Shed', NULL, 'EQUIP-2024-006', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- INVENTORY TRANSACTIONS
-- ============================================================================
INSERT INTO inventory_transactions (user_id, item_id, transaction_type, quantity, unit_cost, total_cost, transaction_date, reference, notes, created_at)
SELECT 
  1,
  ii.id,
  'purchase',
  CASE 
    WHEN ii.item_type = 'seed' THEN 100
    WHEN ii.item_type = 'fertilizer' THEN 50
    WHEN ii.item_type = 'pesticide' THEN 25
    ELSE 10
  END,
  ii.unit_cost,
  ii.unit_cost * CASE 
    WHEN ii.item_type = 'seed' THEN 100
    WHEN ii.item_type = 'fertilizer' THEN 50
    WHEN ii.item_type = 'pesticide' THEN 25
    ELSE 10
  END,
  NOW() - INTERVAL '30 days',
  'PO-2024-' || LPAD(ii.id::text, 4, '0'),
  'Initial stock purchase',
  NOW()
FROM inventory_items ii
WHERE ii.user_id = 1
ON CONFLICT DO NOTHING;

-- Add some usage transactions
INSERT INTO inventory_transactions (user_id, item_id, transaction_type, quantity, unit_cost, total_cost, transaction_date, reference, notes, created_at)
SELECT 
  1,
  ii.id,
  'usage',
  CASE 
    WHEN ii.item_type = 'seed' THEN 20
    WHEN ii.item_type = 'fertilizer' THEN 10
    WHEN ii.item_type = 'pesticide' THEN 5
    ELSE 2
  END,
  ii.unit_cost,
  ii.unit_cost * CASE 
    WHEN ii.item_type = 'seed' THEN 20
    WHEN ii.item_type = 'fertilizer' THEN 10
    WHEN ii.item_type = 'pesticide' THEN 5
    ELSE 2
  END,
  NOW() - INTERVAL '15 days',
  'WO-2024-' || LPAD(ii.id::text, 4, '0'),
  'Applied to North Field planting',
  NOW()
FROM inventory_items ii
WHERE ii.user_id = 1 AND ii.item_type IN ('seed', 'fertilizer', 'pesticide')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- MARKETPLACE PRODUCE LISTINGS
-- ============================================================================
INSERT INTO produce_listings (user_id, farm_id, title, description, category, quantity, unit, price_per_unit, total_price, organic, certification, available_from, available_until, delivery_options, location, status, views, created_at, updated_at)
VALUES
  -- Vegetables
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Fresh Organic Tomatoes', 'Freshly harvested Roma tomatoes from our organic farm. Perfect for cooking and salads. No pesticides used.', 'vegetables', 500, 'kg', 80000, 40000000, true, 'Organic Certified', NOW(), NOW() + INTERVAL '30 days', '{"pickup": true, "delivery": true, "shipping": false}', '{"city": "Lagos", "state": "Lagos", "address": "Epe Farm Settlement"}', 'active', 245, NOW(), NOW()),
  
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Green Bell Peppers', 'Crisp and fresh green bell peppers. Ideal for stir-fry and salads. Harvested this week.', 'vegetables', 200, 'kg', 120000, 24000000, false, NULL, NOW(), NOW() + INTERVAL '21 days', '{"pickup": true, "delivery": true, "shipping": false}', '{"city": "Lagos", "state": "Lagos", "address": "Epe Farm Settlement"}', 'active', 156, NOW(), NOW()),
  
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Fresh Spinach (Efo Tete)', 'Locally grown spinach, washed and ready for cooking. Rich in iron and vitamins.', 'vegetables', 100, 'bundles', 50000, 5000000, true, NULL, NOW(), NOW() + INTERVAL '7 days', '{"pickup": true, "delivery": true, "shipping": false}', '{"city": "Lagos", "state": "Lagos", "address": "Epe Farm Settlement"}', 'active', 89, NOW(), NOW()),
  
  -- Fruits
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Sweet Pineapples', 'Juicy and sweet pineapples from our plantation. Perfect ripeness for immediate consumption.', 'fruits', 300, 'units', 150000, 45000000, false, NULL, NOW(), NOW() + INTERVAL '14 days', '{"pickup": true, "delivery": true, "shipping": true}', '{"city": "Ogun", "state": "Ogun", "address": "Ijebu-Ode Plantation"}', 'active', 312, NOW(), NOW()),
  
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Organic Bananas', 'Naturally ripened bananas. No artificial ripening agents used. Sweet and nutritious.', 'fruits', 500, 'bunches', 80000, 40000000, true, 'Organic Certified', NOW(), NOW() + INTERVAL '10 days', '{"pickup": true, "delivery": true, "shipping": false}', '{"city": "Oyo", "state": "Oyo", "address": "Ibadan Farm"}', 'active', 198, NOW(), NOW()),
  
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Fresh Watermelons', 'Large, sweet watermelons. Average weight 8-10kg each. Perfect for the hot season.', 'fruits', 150, 'units', 250000, 37500000, false, NULL, NOW(), NOW() + INTERVAL '21 days', '{"pickup": true, "delivery": false, "shipping": false}', '{"city": "Kano", "state": "Kano", "address": "Kano Irrigation Farm"}', 'active', 267, NOW(), NOW()),
  
  -- Grains
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Premium White Maize', 'High-quality dried white maize. Moisture content below 13%. Suitable for milling or animal feed.', 'grains', 5000, 'kg', 35000, 175000000, false, NULL, NOW(), NOW() + INTERVAL '90 days', '{"pickup": true, "delivery": true, "shipping": true}', '{"city": "Kaduna", "state": "Kaduna", "address": "Zaria Grain Store"}', 'active', 423, NOW(), NOW()),
  
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Local Rice (Ofada)', 'Authentic Ofada rice with distinctive aroma. Freshly milled and stone-free.', 'grains', 2000, 'kg', 85000, 170000000, true, NULL, NOW(), NOW() + INTERVAL '60 days', '{"pickup": true, "delivery": true, "shipping": true}', '{"city": "Ogun", "state": "Ogun", "address": "Ofada Rice Mill"}', 'active', 534, NOW(), NOW()),
  
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Dried Cowpeas (Black-eyed)', 'Clean, sorted black-eyed peas. No weevils. Perfect for making akara or moi-moi.', 'grains', 1000, 'kg', 65000, 65000000, false, NULL, NOW(), NOW() + INTERVAL '120 days', '{"pickup": true, "delivery": true, "shipping": true}', '{"city": "Kano", "state": "Kano", "address": "Dawanau Market Store"}', 'active', 287, NOW(), NOW()),
  
  -- Dairy & Eggs
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Fresh Farm Eggs', 'Free-range chicken eggs. Collected daily. Rich yellow yolks.', 'eggs', 500, 'dozens', 180000, 90000000, true, NULL, NOW(), NOW() + INTERVAL '14 days', '{"pickup": true, "delivery": true, "shipping": false}', '{"city": "Lagos", "state": "Lagos", "address": "Epe Poultry Farm"}', 'active', 456, NOW(), NOW()),
  
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Fresh Cow Milk', 'Raw, unpasteurized cow milk from grass-fed cattle. Collected fresh daily.', 'dairy', 100, 'liters', 120000, 12000000, true, NULL, NOW(), NOW() + INTERVAL '3 days', '{"pickup": true, "delivery": true, "shipping": false}', '{"city": "Plateau", "state": "Plateau", "address": "Jos Dairy Farm"}', 'active', 178, NOW(), NOW()),
  
  -- Meat & Poultry
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Live Broiler Chickens', 'Healthy broiler chickens, 6-8 weeks old. Average weight 2.5kg. Vaccinated and well-fed.', 'meat', 200, 'units', 450000, 90000000, false, NULL, NOW(), NOW() + INTERVAL '7 days', '{"pickup": true, "delivery": true, "shipping": false}', '{"city": "Lagos", "state": "Lagos", "address": "Epe Poultry Farm"}', 'active', 389, NOW(), NOW()),
  
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Catfish (Live)', 'Fresh catfish from our fish pond. Average weight 1-1.5kg each. Fed with quality fish feed.', 'meat', 300, 'kg', 180000, 54000000, false, NULL, NOW(), NOW() + INTERVAL '5 days', '{"pickup": true, "delivery": true, "shipping": false}', '{"city": "Oyo", "state": "Oyo", "address": "Ibadan Fish Farm"}', 'active', 234, NOW(), NOW()),
  
  -- Honey & Others
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Pure Natural Honey', '100% pure honey from our apiaries. No additives or preservatives. Rich golden color.', 'honey', 50, 'liters', 800000, 40000000, true, 'Organic Certified', NOW(), NOW() + INTERVAL '365 days', '{"pickup": true, "delivery": true, "shipping": true}', '{"city": "Oyo", "state": "Oyo", "address": "Ibadan Apiary"}', 'active', 567, NOW(), NOW()),
  
  (1, (SELECT id FROM farms WHERE user_id = 1 LIMIT 1), 'Fresh Cassava Tubers', 'Freshly harvested cassava tubers. TMS variety. Suitable for garri, fufu, or starch production.', 'other', 2000, 'kg', 25000, 50000000, false, NULL, NOW(), NOW() + INTERVAL '7 days', '{"pickup": true, "delivery": true, "shipping": false}', '{"city": "Ogun", "state": "Ogun", "address": "Abeokuta Farm"}', 'active', 345, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFY DATA
-- ============================================================================
SELECT 'Suppliers created:' as info, COUNT(*) as count FROM suppliers WHERE user_id = 1;
SELECT 'Inventory items created:' as info, COUNT(*) as count FROM inventory_items WHERE user_id = 1;
SELECT 'Inventory transactions created:' as info, COUNT(*) as count FROM inventory_transactions WHERE user_id = 1;
SELECT 'Marketplace listings created:' as info, COUNT(*) as count FROM produce_listings WHERE user_id = 1;
