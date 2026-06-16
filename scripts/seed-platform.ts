/**
 * Comprehensive Platform Seed Script
 * Generates realistic data for all tables across the FarmConnect platform.
 *
 * Usage:
 *   npx tsx scripts/seed-platform.ts
 *
 * Requires: DATABASE_URL environment variable
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/farmer_data';

const client = postgres(DATABASE_URL, { max: 5 });
const db = drizzle(client);

// ===== Helpers =====

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomPhone(): string {
  const prefix = randomChoice(['+254', '+256', '+255', '+234', '+233']);
  return `${prefix}${randomInt(700000000, 799999999)}`;
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function randomUUID(): string {
  return crypto.randomUUID();
}

// ===== Data Constants =====

const KENYAN_FIRST_NAMES = [
  'Wanjiku', 'Kamau', 'Achieng', 'Odhiambo', 'Nyambura', 'Mwangi', 'Atieno', 'Kipchoge',
  'Wangari', 'Kiptoo', 'Njeri', 'Omondi', 'Wairimu', 'Kiprotich', 'Akinyi', 'Mutiso',
  'Njoki', 'Chebet', 'Nafula', 'Barasa', 'Moraa', 'Nyakio', 'Adhiambo', 'Karanja',
  'Muthoni', 'Koech', 'Apiyo', 'Onyango', 'Kemunto', 'Rotich',
];

const KENYAN_LAST_NAMES = [
  'Wanjala', 'Ochieng', 'Kamau', 'Maina', 'Kiplagat', 'Nyong\'o', 'Muturi', 'Oginga',
  'Kenyatta', 'Ndirangu', 'Wamalwa', 'Kibaki', 'Odinga', 'Kosgei', 'Musyoka', 'Nyachae',
  'Mudavadi', 'Ngilu', 'Wetangula', 'Sang', 'Kimutai', 'Langat', 'Bett', 'Cheruiyot',
  'Ngugi', 'Wainaina', 'Gitau', 'Njoroge', 'Kariuki', 'Thuo',
];

const VILLAGES = [
  'Githunguri', 'Limuru', 'Kiambu', 'Nyeri', 'Nanyuki', 'Eldoret', 'Kericho', 'Kisumu',
  'Nakuru', 'Naivasha', 'Thika', 'Embu', 'Meru', 'Machakos', 'Kajiado', 'Narok',
  'Bungoma', 'Kakamega', 'Siaya', 'Migori',
];

const DISTRICTS = [
  'Kiambu', 'Nyeri', 'Nyandarua', 'Laikipia', 'Uasin Gishu', 'Kericho', 'Kisumu',
  'Nakuru', 'Nairobi', 'Machakos', 'Kajiado', 'Narok', 'Bungoma', 'Kakamega',
];

const REGIONS = ['Central', 'Rift Valley', 'Western', 'Nyanza', 'Eastern', 'Coast', 'Nairobi'];

const CROPS = [
  { name: 'Maize', variety: ['H614', 'H513', 'DH04', 'WH507'], season: 'Long Rains' },
  { name: 'Tea', variety: ['TRFK 6/8', 'TRFK 31/8', 'Purple Tea', 'Clone 12/12'], season: 'Year-round' },
  { name: 'Coffee', variety: ['SL28', 'SL34', 'Ruiru 11', 'Batian'], season: 'Long Rains' },
  { name: 'Wheat', variety: ['Kenya Fahari', 'Eagle 10', 'Robin', 'Kwale'], season: 'Short Rains' },
  { name: 'Rice', variety: ['Basmati 370', 'BW 196', 'IR 2793', 'NERICA'], season: 'Long Rains' },
  { name: 'Avocado', variety: ['Hass', 'Fuerte', 'Pinkerton', 'Ettinger'], season: 'Year-round' },
  { name: 'Tomato', variety: ['Cal J', 'Rio Grande', 'Kilele F1', 'Anna F1'], season: 'Year-round' },
  { name: 'Potato', variety: ['Shangi', 'Dutch Robijn', 'Kenya Mpya', 'Tigoni'], season: 'Short Rains' },
  { name: 'Beans', variety: ['KK8', 'Rose Coco', 'Mwitemania', 'GLP 2'], season: 'Long Rains' },
  { name: 'Sorghum', variety: ['Gadam', 'Serena', 'IS8193', 'Seredo'], season: 'Long Rains' },
  { name: 'Mango', variety: ['Apple', 'Kent', 'Tommy Atkins', 'Ngowe'], season: 'Hot Season' },
  { name: 'Sugarcane', variety: ['CO421', 'N14', 'CO617', 'KEN 82-247'], season: 'Year-round' },
];

const LIVESTOCK_TYPES = [
  { type: 'Cattle', breeds: ['Friesian', 'Ayrshire', 'Jersey', 'Boran', 'Sahiwal'], purposes: ['Dairy', 'Beef', 'Dual-purpose'] },
  { type: 'Goats', breeds: ['Alpine', 'Toggenburg', 'Galla', 'Small East African', 'Boer'], purposes: ['Dairy', 'Meat', 'Fiber'] },
  { type: 'Sheep', breeds: ['Dorper', 'Red Maasai', 'Corriedale', 'Hampshire'], purposes: ['Meat', 'Wool'] },
  { type: 'Poultry', breeds: ['Kienyeji', 'Kuroiler', 'KARI Improved', 'Rainbow Rooster'], purposes: ['Eggs', 'Meat', 'Dual-purpose'] },
  { type: 'Pigs', breeds: ['Large White', 'Landrace', 'Hampshire', 'Duroc'], purposes: ['Pork'] },
];

const SOIL_TYPES = ['Clay', 'Sandy', 'Loam', 'Clay Loam', 'Sandy Loam', 'Silt Loam', 'Red Volcanic', 'Black Cotton'];
const IRRIGATION_TYPES = ['Drip', 'Sprinkler', 'Furrow', 'Flood', 'Rain-fed', 'Center Pivot'];
const INPUT_TYPES = ['Fertilizer', 'Pesticide', 'Herbicide', 'Seeds', 'Manure', 'Fungicide'];
const INPUT_NAMES: Record<string, string[]> = {
  Fertilizer: ['DAP', 'CAN', 'NPK 17:17:17', 'Urea', 'TSP', 'Mavuno Planting'],
  Pesticide: ['Duduthrin', 'Thunder', 'Tata Alpha', 'Striker', 'Pentagon'],
  Herbicide: ['Roundup', 'Weedall', 'Gramoxone', 'Lumax', 'Primextra'],
  Seeds: ['Certified Maize H614', 'Potato Shangi', 'Bean KK8', 'Wheat Eagle 10'],
  Manure: ['Farmyard Manure', 'Compost', 'Vermicompost', 'Green Manure'],
  Fungicide: ['Ridomil', 'Dithane M-45', 'Score', 'Amistar'],
};

const EXPENSE_CATEGORIES = ['Labor', 'Transport', 'Storage', 'Packaging', 'Marketing', 'Insurance', 'Equipment Rental', 'Veterinary'];

// ===== Seed Functions =====

async function seedUsers(count: number): Promise<number[]> {
  console.log(`  Seeding ${count} users...`);
  const ids: number[] = [];

  // Admin user
  const [admin] = await db.execute(sql`
    INSERT INTO users (email, password, first_name, last_name, phone_number, role, is_active)
    VALUES ('admin@farmconnect.co.ke', ${hashPassword('admin123')}, 'Admin', 'User', '+254700000001', 'admin', true)
    ON CONFLICT (email) DO UPDATE SET first_name = 'Admin'
    RETURNING id
  `);
  ids.push(Number((admin as any).id));

  for (let i = 0; i < count - 1; i++) {
    const firstName = randomChoice(KENYAN_FIRST_NAMES);
    const lastName = randomChoice(KENYAN_LAST_NAMES);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/'/g, '')}${randomInt(1, 999)}@farmconnect.co.ke`;
    const role = randomChoice(['farmer', 'farmer', 'farmer', 'farmer', 'agent', 'mfi_officer', 'trader', 'cooperative_manager']);

    try {
      const [user] = await db.execute(sql`
        INSERT INTO users (email, password, first_name, last_name, phone_number, role, is_active)
        VALUES (${email}, ${hashPassword('password123')}, ${firstName}, ${lastName}, ${randomPhone()}, ${role}, true)
        ON CONFLICT (email) DO NOTHING
        RETURNING id
      `);
      if (user) ids.push(Number((user as any).id));
    } catch {
      // Skip duplicates
    }
  }

  console.log(`    Created ${ids.length} users`);
  return ids;
}

async function seedFarmers(userIds: number[]): Promise<number[]> {
  const farmerUserIds = userIds.slice(0, Math.min(userIds.length, 50));
  console.log(`  Seeding ${farmerUserIds.length} farmers...`);
  const ids: number[] = [];

  for (const userId of farmerUserIds) {
    const firstName = randomChoice(KENYAN_FIRST_NAMES);
    const lastName = randomChoice(KENYAN_LAST_NAMES);

    try {
      const [farmer] = await db.execute(sql`
        INSERT INTO farmers (user_id, first_name, last_name, phone_number, email, village, district, region, national_id, is_active, verification_status)
        VALUES (${userId}, ${firstName}, ${lastName}, ${randomPhone()}, ${`${firstName.toLowerCase()}@example.com`}, ${randomChoice(VILLAGES)}, ${randomChoice(DISTRICTS)}, ${randomChoice(REGIONS)}, ${String(randomInt(10000000, 99999999))}, true, ${randomChoice(['verified', 'verified', 'verified', 'pending', 'pending'])})
        RETURNING id
      `);
      if (farmer) ids.push(Number((farmer as any).id));
    } catch {
      // Skip if farmer already exists for user
    }
  }

  console.log(`    Created ${ids.length} farmers`);
  return ids;
}

async function seedFarms(farmerIds: number[], userIds: number[]): Promise<number[]> {
  const count = Math.min(farmerIds.length * 2, 100);
  console.log(`  Seeding ${count} farms...`);
  const ids: number[] = [];

  for (let i = 0; i < count; i++) {
    const farmerId = randomChoice(farmerIds);
    const userId = randomChoice(userIds);
    const farmNames = ['Sunrise Farm', 'Green Valley', 'Mountain View', 'Riverside', 'Hilltop', 'Sunny Meadow', 'Golden Harvest', 'Peace Farm'];

    try {
      const [farm] = await db.execute(sql`
        INSERT INTO farms (farmer_id, user_id, farm_name, farm_size, farm_size_unit, location, latitude, longitude, soil_type, irrigation_type)
        VALUES (${farmerId}, ${userId}, ${`${randomChoice(farmNames)} ${randomInt(1, 99)}`}, ${randomFloat(0.5, 50)}, 'acres', ${randomChoice(VILLAGES)}, ${randomFloat(-1.5, 1.5, 6)}, ${randomFloat(34, 41, 6)}, ${randomChoice(SOIL_TYPES)}, ${randomChoice(IRRIGATION_TYPES)})
        RETURNING id
      `);
      if (farm) ids.push(Number((farm as any).id));
    } catch {
      // Skip
    }
  }

  console.log(`    Created ${ids.length} farms`);
  return ids;
}

async function seedCrops(farmIds: number[], userIds: number[]): Promise<number[]> {
  const count = Math.min(farmIds.length * 3, 200);
  console.log(`  Seeding ${count} crops...`);
  const ids: number[] = [];

  for (let i = 0; i < count; i++) {
    const crop = randomChoice(CROPS);
    const plantingDate = randomDate(new Date('2024-01-01'), new Date('2025-06-01'));
    const harvestDate = new Date(plantingDate.getTime() + randomInt(60, 180) * 86400000);

    try {
      const [result] = await db.execute(sql`
        INSERT INTO crops (farm_id, user_id, crop_name, crop_variety, planting_date, expected_harvest_date, area_planted, area_unit, season, status, price_per_unit)
        VALUES (${randomChoice(farmIds)}, ${randomChoice(userIds)}, ${crop.name}, ${randomChoice(crop.variety)}, ${plantingDate.toISOString()}, ${harvestDate.toISOString()}, ${randomFloat(0.25, 10)}, 'acres', ${crop.season}, ${randomChoice(['planted', 'growing', 'flowering', 'harvested', 'harvested'])}, ${randomInt(500, 15000)})
        RETURNING id
      `);
      if (result) ids.push(Number((result as any).id));
    } catch {
      // Skip
    }
  }

  console.log(`    Created ${ids.length} crops`);
  return ids;
}

async function seedLivestock(farmIds: number[], userIds: number[]): Promise<void> {
  const count = Math.min(farmIds.length * 2, 80);
  console.log(`  Seeding ${count} livestock records...`);
  let created = 0;

  for (let i = 0; i < count; i++) {
    const animal = randomChoice(LIVESTOCK_TYPES);
    const acquisitionDate = randomDate(new Date('2022-01-01'), new Date('2025-01-01'));

    try {
      await db.execute(sql`
        INSERT INTO livestock (farm_id, user_id, animal_type, breed, quantity, purpose, acquisition_date, acquisition_cost, current_value, health_status)
        VALUES (${randomChoice(farmIds)}, ${randomChoice(userIds)}, ${animal.type}, ${randomChoice(animal.breeds)}, ${randomInt(1, 50)}, ${randomChoice(animal.purposes)}, ${acquisitionDate.toISOString()}, ${randomInt(5000, 150000)}, ${randomInt(8000, 200000)}, ${randomChoice(['healthy', 'healthy', 'healthy', 'sick', 'recovering'])})
      `);
      created++;
    } catch {
      // Skip
    }
  }
  console.log(`    Created ${created} livestock records`);
}

async function seedFarmInputs(farmIds: number[], cropIds: number[], userIds: number[]): Promise<void> {
  const count = Math.min(cropIds.length * 2, 150);
  console.log(`  Seeding ${count} farm input records...`);
  let created = 0;

  for (let i = 0; i < count; i++) {
    const inputType = randomChoice(INPUT_TYPES);
    const inputName = randomChoice(INPUT_NAMES[inputType] || ['Generic Input']);

    try {
      await db.execute(sql`
        INSERT INTO farm_inputs (farm_id, crop_id, user_id, input_type, input_name, quantity, unit, cost_per_unit, total_cost, purchase_date, application_date, supplier, notes)
        VALUES (${randomChoice(farmIds)}, ${randomChoice(cropIds)}, ${randomChoice(userIds)}, ${inputType}, ${inputName}, ${randomFloat(1, 100)}, ${randomChoice(['kg', 'litres', 'bags', 'packets'])}, ${randomInt(100, 5000)}, ${randomInt(500, 50000)}, ${randomDate(new Date('2024-01-01'), new Date('2025-06-01')).toISOString()}, ${randomDate(new Date('2024-01-01'), new Date('2025-06-01')).toISOString()}, ${randomChoice(['Kenya Seed Co', 'Twiga Chemicals', 'Syngenta EA', 'KARI', 'Agri-Input Supplies', 'Local Agro-vet'])}, ${randomChoice(['Applied during planting', 'Top dressing', 'Pest control application', 'Pre-emergence', ''])})
      `);
      created++;
    } catch {
      // Skip
    }
  }
  console.log(`    Created ${created} farm input records`);
}

async function seedHarvests(cropIds: number[], userIds: number[]): Promise<void> {
  const count = Math.min(cropIds.length, 120);
  console.log(`  Seeding ${count} harvest records...`);
  let created = 0;

  for (let i = 0; i < count; i++) {
    try {
      await db.execute(sql`
        INSERT INTO harvests (crop_id, user_id, quantity, unit, harvest_date, quality, storage_location, notes)
        VALUES (${cropIds[i % cropIds.length]}, ${randomChoice(userIds)}, ${randomFloat(50, 5000)}, ${randomChoice(['kg', 'tonnes', 'bags'])}, ${randomDate(new Date('2024-06-01'), new Date('2025-06-01')).toISOString()}, ${randomChoice(['Grade A', 'Grade B', 'Grade C', 'Premium', 'Standard'])}, ${randomChoice(['Farm store', 'Warehouse', 'Collection point', 'Co-op store', 'Home'])}, ${randomChoice(['Good harvest', 'Affected by rain', 'Excellent quality', 'Average yield', ''])})
      `);
      created++;
    } catch {
      // Skip
    }
  }
  console.log(`    Created ${created} harvest records`);
}

async function seedExpenses(farmIds: number[], userIds: number[]): Promise<void> {
  const count = Math.min(farmIds.length * 3, 150);
  console.log(`  Seeding ${count} expense records...`);
  let created = 0;

  for (let i = 0; i < count; i++) {
    try {
      await db.execute(sql`
        INSERT INTO expenses (farm_id, user_id, category, description, amount, expense_date, payment_method, receipt)
        VALUES (${randomChoice(farmIds)}, ${randomChoice(userIds)}, ${randomChoice(EXPENSE_CATEGORIES)}, ${randomChoice(['Casual labor for weeding', 'Transport to market', 'Storage rental', 'Packaging materials', 'Vet visit', 'Equipment hire', 'Marketing fees', 'Insurance premium'])}, ${randomInt(500, 50000)}, ${randomDate(new Date('2024-01-01'), new Date('2025-06-01')).toISOString()}, ${randomChoice(['Cash', 'M-Pesa', 'Bank Transfer', 'Cheque'])}, ${`RCP-${randomInt(10000, 99999)}`})
      `);
      created++;
    } catch {
      // Skip
    }
  }
  console.log(`    Created ${created} expense records`);
}

async function seedMarketplace(userIds: number[]): Promise<void> {
  console.log('  Seeding marketplace listings...');
  let created = 0;

  for (let i = 0; i < 60; i++) {
    const crop = randomChoice(CROPS);
    const pricePerUnit = randomInt(20, 500);
    const quantity = randomInt(50, 5000);

    try {
      await db.execute(sql`
        INSERT INTO produce_listings (user_id, title, description, category, quantity, unit, price_per_unit, total_price, organic, location, available_from, available_until, status, views)
        VALUES (${randomChoice(userIds)}, ${`Fresh ${crop.name} - ${randomChoice(crop.variety)}`}, ${`High quality ${crop.name} from ${randomChoice(REGIONS)} Kenya. ${randomChoice(['Freshly harvested', 'Well sorted', 'Grade A quality', 'Organically grown', 'Direct from farm'])}.`}, 'produce', ${quantity}, ${randomChoice(['kg', 'tonnes', 'bags', 'crates'])}, ${pricePerUnit}, ${pricePerUnit * quantity}, ${Math.random() > 0.7}, ${randomChoice(VILLAGES)}, ${randomDate(new Date('2025-01-01'), new Date('2025-06-01')).toISOString()}, ${randomDate(new Date('2025-07-01'), new Date('2025-12-01')).toISOString()}, ${randomChoice(['active', 'active', 'active', 'sold', 'expired'])}, ${randomInt(0, 500)})
      `);
      created++;
    } catch {
      // Skip
    }
  }
  console.log(`    Created ${created} marketplace listings`);
}

async function seedKycProfiles(userIds: number[]): Promise<void> {
  console.log('  Seeding KYC profiles...');
  let created = 0;

  for (const userId of userIds.slice(0, 40)) {
    const tier = randomChoice(['unverified', 'basic', 'basic', 'standard', 'standard', 'enhanced', 'premium']);
    const status = tier === 'unverified' ? 'pending' : randomChoice(['approved', 'approved', 'in_review']);

    try {
      await db.execute(sql`
        INSERT INTO user_kyc_profiles (user_id, current_tier, status, phone_verified, email_verified, id_verified, address_verified, biometric_verified, legal_first_name, legal_last_name, nationality, country, risk_score, risk_level)
        VALUES (${userId}, ${tier}, ${status}, ${tier !== 'unverified'}, ${['standard', 'enhanced', 'premium'].includes(tier)}, ${['standard', 'enhanced', 'premium'].includes(tier)}, ${['enhanced', 'premium'].includes(tier)}, ${tier === 'premium'}, ${randomChoice(KENYAN_FIRST_NAMES)}, ${randomChoice(KENYAN_LAST_NAMES)}, 'Kenyan', 'KE', ${randomInt(10, 80)}, ${randomChoice(['low', 'low', 'medium', 'high'])})
        ON CONFLICT (user_id) DO NOTHING
      `);
      created++;
    } catch {
      // Skip
    }
  }
  console.log(`    Created ${created} KYC profiles`);
}

async function seedSupplyChain(userIds: number[], farmIds: number[]): Promise<void> {
  console.log('  Seeding supply chain data...');

  // Delivery zones
  const zones = ['Nairobi CBD', 'Kiambu County', 'Nakuru Town', 'Eldoret', 'Kisumu City', 'Mombasa'];
  for (const zone of zones) {
    try {
      await db.execute(sql`
        INSERT INTO delivery_zones (name, city, country, base_fee, per_km_fee, currency, active)
        VALUES (${zone}, ${zone}, 'Nigeria', ${randomInt(100, 500)}, ${randomInt(10, 50)}, 'NGN', true)
      `);
    } catch { /* Skip */ }
  }

  // Collection points
  for (let i = 0; i < 15; i++) {
    try {
      await db.execute(sql`
        INSERT INTO collection_points (name, address, latitude, longitude, capacity_tons, operating_hours, contact_phone, active)
        VALUES (${`${randomChoice(VILLAGES)} Collection Center ${i + 1}`}, ${randomChoice(VILLAGES)}, ${randomFloat(-1.5, 1.5, 6)}, ${randomFloat(34, 41, 6)}, ${randomFloat(5, 100)}, ${'Mon-Sat 6AM-6PM'}, ${randomPhone()}, true)
      `);
    } catch { /* Skip */ }
  }

  // Chama groups
  for (let i = 0; i < 10; i++) {
    try {
      await db.execute(sql`
        INSERT INTO chama_groups (name, description, created_by, location, contribution_amount, contribution_frequency, max_members, is_active)
        VALUES (${`${randomChoice(VILLAGES)} ${randomChoice(['Women', 'Youth', 'Farmers', 'Dairy'])} Chama`}, ${`Community savings group from ${randomChoice(VILLAGES)}`}, ${randomChoice(userIds)}, ${randomChoice(VILLAGES)}, ${randomInt(500, 5000)}, ${randomChoice(['weekly', 'monthly', 'bi-weekly'])}, ${randomInt(10, 30)}, true)
      `);
    } catch { /* Skip */ }
  }

  // Mobile money accounts
  for (const userId of userIds.slice(0, 30)) {
    try {
      await db.execute(sql`
        INSERT INTO mobile_money_accounts (user_id, provider, phone_number, account_name, balance, currency, is_primary, is_verified)
        VALUES (${userId}, ${randomChoice(['mpesa', 'airtel_money', 'equitel'])}, ${randomPhone()}, ${`${randomChoice(KENYAN_FIRST_NAMES)} ${randomChoice(KENYAN_LAST_NAMES)}`}, ${randomInt(0, 100000)}, 'NGN', true, true)
      `);
    } catch { /* Skip */ }
  }

  // Price alerts
  for (let i = 0; i < 30; i++) {
    const crop = randomChoice(CROPS);
    try {
      await db.execute(sql`
        INSERT INTO price_alerts (user_id, crop_name, target_price, current_price, alert_type, is_active, market_location)
        VALUES (${randomChoice(userIds)}, ${crop.name}, ${randomInt(20, 500)}, ${randomInt(15, 600)}, ${randomChoice(['above', 'below'])}, true, ${randomChoice(VILLAGES)})
      `);
    } catch { /* Skip */ }
  }

  // Soil tests
  for (let i = 0; i < 25; i++) {
    try {
      await db.execute(sql`
        INSERT INTO soil_tests (user_id, farm_id, ph, nitrogen, phosphorus, potassium, organic_matter, cec, soil_type, health_score, fertility_rating, test_date, latitude, longitude)
        VALUES (${randomChoice(userIds)}, ${randomChoice(farmIds)}, ${randomFloat(4.5, 8.5)}, ${randomFloat(5, 80)}, ${randomFloat(3, 60)}, ${randomFloat(30, 300)}, ${randomFloat(0.5, 6.0)}, ${randomFloat(5, 40)}, ${randomChoice(SOIL_TYPES)}, ${randomFloat(20, 95)}, ${randomChoice(['poor', 'fair', 'good', 'excellent'])}, ${randomDate(new Date('2024-01-01'), new Date('2025-06-01')).toISOString()}, ${randomFloat(-1.5, 1.5, 6)}, ${randomFloat(34, 41, 6)})
      `);
    } catch { /* Skip */ }
  }

  // Subscription plans
  const plans = [
    { name: 'Weekly Veggie Box', price: 1500, frequency: 'weekly' },
    { name: 'Monthly Fruit Basket', price: 3000, frequency: 'monthly' },
    { name: 'Farm Fresh Dairy', price: 2000, frequency: 'weekly' },
    { name: 'Organic Produce Pack', price: 4000, frequency: 'bi-weekly' },
  ];
  for (const plan of plans) {
    try {
      await db.execute(sql`
        INSERT INTO subscription_plans (name, description, price, currency, frequency, is_active)
        VALUES (${plan.name}, ${`Fresh ${plan.name} delivered to your door`}, ${plan.price}, 'NGN', ${plan.frequency}, true)
      `);
    } catch { /* Skip */ }
  }

  console.log('    Supply chain data seeded');
}

async function seedWeatherStations(): Promise<void> {
  console.log('  Seeding weather stations...');
  const stations = [
    { name: 'Kiambu Weather Station', lat: -1.1714, lon: 36.8350 },
    { name: 'Nakuru Met Station', lat: -0.3031, lon: 36.0800 },
    { name: 'Eldoret Airport Met', lat: 0.4044, lon: 35.2889 },
    { name: 'Kisumu Airport Met', lat: -0.0914, lon: 34.7289 },
    { name: 'Nairobi Wilson Met', lat: -1.3214, lon: 36.8144 },
    { name: 'Meru Ag Station', lat: 0.0500, lon: 37.6500 },
    { name: 'Kericho Tea Station', lat: -0.3692, lon: 35.2864 },
    { name: 'Nyeri Highland Met', lat: -0.4167, lon: 36.9500 },
  ];

  for (const station of stations) {
    try {
      await db.execute(sql`
        INSERT INTO weather_stations (name, latitude, longitude, elevation, station_type, is_active, data_frequency)
        VALUES (${station.name}, ${station.lat}, ${station.lon}, ${randomInt(1000, 2500)}, ${randomChoice(['automatic', 'manual', 'satellite'])}, true, ${randomChoice(['hourly', '15min', '30min'])})
      `);
    } catch { /* Skip */ }
  }
  console.log('    Weather stations seeded');
}

async function seedAuditLogs(userIds: number[]): Promise<void> {
  console.log('  Seeding audit logs...');
  const actions = ['login', 'create_farmer', 'update_farm', 'create_listing', 'process_payment', 'approve_loan', 'export_data', 'update_settings'];
  let created = 0;

  for (let i = 0; i < 100; i++) {
    try {
      await db.execute(sql`
        INSERT INTO audit_logs (event_id, event_type, entity_type, entity_id, user_id, timestamp, data, metadata)
        VALUES (${randomUUID()}, ${randomChoice(actions)}, ${randomChoice(['farmer', 'farm', 'crop', 'listing', 'order', 'loan'])}, ${String(randomInt(1, 100))}, ${randomChoice(userIds)}, ${randomDate(new Date('2024-01-01'), new Date('2025-06-01')).toISOString()}, ${JSON.stringify({ source: 'web', browser: 'Chrome' })}, ${JSON.stringify({ ip: `192.168.${randomInt(1, 254)}.${randomInt(1, 254)}` })})
      `);
      created++;
    } catch {
      // Skip
    }
  }
  console.log(`    Created ${created} audit logs`);
}

// ===== Main Seed Function =====

async function seed() {
  console.log('🌱 Starting comprehensive platform seed...\n');
  const startTime = Date.now();

  try {
    // Core entities
    const userIds = await seedUsers(60);
    const farmerIds = await seedFarmers(userIds);
    const farmIds = await seedFarms(farmerIds, userIds);
    const cropIds = await seedCrops(farmIds, userIds);

    // Agricultural data
    await seedLivestock(farmIds, userIds);
    await seedFarmInputs(farmIds, cropIds, userIds);
    await seedHarvests(cropIds, userIds);
    await seedExpenses(farmIds, userIds);

    // Marketplace
    await seedMarketplace(userIds);

    // KYC
    await seedKycProfiles(userIds);

    // Supply chain & services
    await seedSupplyChain(userIds, farmIds);

    // Weather
    await seedWeatherStations();

    // Audit
    await seedAuditLogs(userIds);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Seed completed in ${elapsed}s`);
    console.log('\nSummary:');
    console.log(`  Users: ${userIds.length}`);
    console.log(`  Farmers: ${farmerIds.length}`);
    console.log(`  Farms: ${farmIds.length}`);
    console.log(`  Crops: ${cropIds.length}`);
    console.log(`  + livestock, inputs, harvests, expenses, marketplace, KYC, supply chain, weather, audit logs`);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
