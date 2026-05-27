import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import { users, farmers, farms, crops, livestock, harvests, expenses } from '../drizzle/schema.ts';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/farmer_data';

async function seed() {
  console.log('🌱 Starting database seeding...');
  
  const client = postgres(DATABASE_URL);
  const db = drizzle(client);

  try {
    // Create test users
    console.log('Creating test users...');
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    
    const testUsers = await db.insert(users).values([
      {
        email: 'admin@farmer.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
      },
      {
        email: 'agent@farmer.com',
        password: hashedPassword,
        firstName: 'Field',
        lastName: 'Agent',
        role: 'user',
      },
    ]).returning();
    
    console.log(`✓ Created ${testUsers.length} test users`);

    // Create sample farmers
    console.log('Creating sample farmers...');
    const sampleFarmers = await db.insert(farmers).values([
      {
        userId: testUsers[0].id,
        firstName: 'Adebayo',
        lastName: 'Ogunlesi',
        phoneNumber: '+2348012345678',
        email: 'adebayo@example.com',
        address: '12 Farm Road, Ibadan',
        village: 'Oke-Ado',
        district: 'Ibadan North',
        region: 'Oyo State',
        nationalId: 'NIN-12345678901',
      },
      {
        userId: testUsers[1].id,
        firstName: 'Ngozi',
        lastName: 'Eze',
        phoneNumber: '+2348098765432',
        email: 'ngozi@example.com',
        address: '45 Village Square, Enugu',
        village: 'Abakpa',
        district: 'Enugu East',
        region: 'Enugu State',
        nationalId: 'NIN-98765432109',
      },
      {
        userId: testUsers[0].id,
        firstName: 'Ibrahim',
        lastName: 'Mohammed',
        phoneNumber: '+2347012345678',
        email: 'ibrahim@example.com',
        address: '78 Market Street, Kano',
        village: 'Sabon Gari',
        district: 'Kano Municipal',
        region: 'Kano State',
        nationalId: 'NIN-11223344556',
      },
      {
        userId: testUsers[1].id,
        firstName: 'Amina',
        lastName: 'Bello',
        phoneNumber: '+2348087654321',
        email: 'amina@example.com',
        address: '23 Green Avenue, Kaduna',
        village: 'Barnawa',
        district: 'Kaduna South',
        region: 'Kaduna State',
        nationalId: 'NIN-66778899001',
      },
      {
        userId: testUsers[0].id,
        firstName: 'Chukwuma',
        lastName: 'Nwosu',
        phoneNumber: '+2349012345678',
        email: 'chukwuma@example.com',
        address: '56 Palm Street, Owerri',
        village: 'New Owerri',
        district: 'Owerri Municipal',
        region: 'Imo State',
        nationalId: 'NIN-22334455667',
      },
    ]).returning();
    
    console.log(`✓ Created ${sampleFarmers.length} sample farmers`);

    // Create sample farms
    console.log('Creating sample farms...');
    const sampleFarms = await db.insert(farms).values([
      {
        userId: testUsers[0].id,
        farmerId: sampleFarmers[0].id,
        farmName: 'Ogunlesi Cassava Farm',
        farmSize: '5.5',
        farmSizeUnit: 'hectares',
        location: 'Ibadan, Oyo State',
        latitude: '7.3775',
        longitude: '3.9470',
        soilType: 'loamy',
        irrigationType: 'rainfed',
      },
      {
        userId: testUsers[1].id,
        farmerId: sampleFarmers[1].id,
        farmName: 'Eze Maize Farm',
        farmSize: '3.2',
        farmSizeUnit: 'hectares',
        location: 'Enugu, Enugu State',
        latitude: '6.5244',
        longitude: '7.5100',
        soilType: 'clay',
        irrigationType: 'drip',
      },
      {
        userId: testUsers[0].id,
        farmerId: sampleFarmers[2].id,
        farmName: 'Mohammed Rice Plantation',
        farmSize: '12.0',
        farmSizeUnit: 'hectares',
        location: 'Kano, Kano State',
        latitude: '12.0022',
        longitude: '8.5920',
        soilType: 'sandy',
        irrigationType: 'sprinkler',
      },
    ]).returning();
    
    console.log(`✓ Created ${sampleFarms.length} sample farms`);

    // Create sample crops
    console.log('Creating sample crops...');
    const sampleCrops = await db.insert(crops).values([
      {
        userId: testUsers[0].id,
        farmId: sampleFarms[0].id,
        cropName: 'Cassava',
        variety: 'TME 419',
        plantingDate: new Date('2024-03-15'),
        expectedHarvestDate: new Date('2024-12-15'),
        plantedArea: '5.5',
        plantedAreaUnit: 'hectares',
        status: 'growing',
      },
      {
        userId: testUsers[1].id,
        farmId: sampleFarms[1].id,
        cropName: 'Maize',
        variety: 'Yellow Dent',
        plantingDate: new Date('2024-04-01'),
        expectedHarvestDate: new Date('2024-08-01'),
        plantedArea: '3.2',
        plantedAreaUnit: 'hectares',
        status: 'harvested',
      },
      {
        userId: testUsers[0].id,
        farmId: sampleFarms[2].id,
        cropName: 'Rice',
        variety: 'FARO 44',
        plantingDate: new Date('2024-05-10'),
        expectedHarvestDate: new Date('2024-10-10'),
        plantedArea: '12.0',
        plantedAreaUnit: 'hectares',
        status: 'growing',
      },
    ]).returning();
    
    console.log(`✓ Created ${sampleCrops.length} sample crops`);

    // Create sample livestock
    console.log('Creating sample livestock...');
    const sampleLivestock = await db.insert(livestock).values([
      {
        userId: testUsers[0].id,
        farmId: sampleFarms[0].id,
        animalType: 'Cattle',
        breed: 'White Fulani',
        quantity: 15,
        purpose: 'meat',
        acquisitionDate: new Date('2023-01-15'),
        healthStatus: 'healthy',
      },
      {
        userId: testUsers[1].id,
        farmId: sampleFarms[1].id,
        animalType: 'Poultry',
        breed: 'Broiler',
        quantity: 200,
        purpose: 'meat',
        acquisitionDate: new Date('2024-06-01'),
        healthStatus: 'healthy',
      },
    ]).returning();
    
    console.log(`✓ Created ${sampleLivestock.length} sample livestock records`);

    // Create sample harvests
    console.log('Creating sample harvests...');
    const sampleHarvests = await db.insert(harvests).values([
      {
        userId: testUsers[1].id,
        cropId: sampleCrops[1].id,
        harvestDate: new Date('2024-08-05'),
        quantity: '4500',
        unit: 'kg',
        quality: 'good',
        storageLocation: 'Main Warehouse',
        revenue: 675000,
      },
    ]).returning();
    
    console.log(`✓ Created ${sampleHarvests.length} sample harvest records`);

    // Create sample expenses
    console.log('Creating sample expenses...');
    const sampleExpenses = await db.insert(expenses).values([
      {
        userId: testUsers[0].id,
        farmId: sampleFarms[0].id,
        category: 'seeds',
        description: 'Cassava stems for planting',
        amount: 125000,
        expenseDate: new Date('2024-03-10'),
        paymentMethod: 'cash',
      },
      {
        userId: testUsers[1].id,
        farmId: sampleFarms[1].id,
        category: 'fertilizer',
        description: 'NPK fertilizer 50kg bags',
        amount: 85000,
        expenseDate: new Date('2024-04-15'),
        paymentMethod: 'bank_transfer',
      },
      {
        userId: testUsers[0].id,
        farmId: sampleFarms[2].id,
        category: 'labor',
        description: 'Seasonal workers for planting',
        amount: 450000,
        expenseDate: new Date('2024-05-05'),
        paymentMethod: 'cash',
      },
      {
        userId: testUsers[0].id,
        farmId: sampleFarms[0].id,
        category: 'equipment',
        description: 'Tractor rental for land preparation',
        amount: 200000,
        expenseDate: new Date('2024-03-05'),
        paymentMethod: 'bank_transfer',
      },
    ]).returning();
    
    console.log(`✓ Created ${sampleExpenses.length} sample expense records`);

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Users: ${testUsers.length}`);
    console.log(`   Farmers: ${sampleFarmers.length}`);
    console.log(`   Farms: ${sampleFarms.length}`);
    console.log(`   Crops: ${sampleCrops.length}`);
    console.log(`   Livestock: ${sampleLivestock.length}`);
    console.log(`   Harvests: ${sampleHarvests.length}`);
    console.log(`   Expenses: ${sampleExpenses.length}`);
    console.log('\n🔑 Test Credentials:');
    console.log('   Admin: admin@farmer.com / Password123!');
    console.log('   Agent: agent@farmer.com / Password123!');
    console.log('   User: test@farmer.com / Password123!');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    await client.end();
  }
}

seed();
