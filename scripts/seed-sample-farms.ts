import { getDb } from "../server/db.js";
import { farms, farmers, users } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";

/**
 * Seed script to create sample farms with real Nigerian GPS coordinates
 * for testing agricultural intelligence features (soil moisture, GDD, pest/disease)
 * 
 * Run with: npx tsx scripts/seed-sample-farms.ts
 */

async function seedSampleFarms() {
  console.log("🌱 Starting sample farms seeding...");
  
  try {
    const db = await getDb();
    
    if (!db) {
      console.error("❌ Failed to connect to database");
      process.exit(1);
    }
    
    // Get the first user (test@farmer.com) to assign farms
    const existingUsers = await db.select().from(users).limit(1);
    
    if (existingUsers.length === 0) {
      console.error("❌ No users found. Please create a user first (register at /register)");
      process.exit(1);
    }
    
    const userId = existingUsers[0]!.id;
    console.log(`✅ Found user ID: ${userId}`);
    
    // Check if farmer exists for this user
    let farmerRecord = await db.select().from(farmers).where(eq(farmers.userId, userId)).limit(1);
    
    if (farmerRecord.length === 0) {
      // Create farmer record
      console.log("📝 Creating farmer record...");
      const newFarmer = await db.insert(farmers).values({
        userId: userId,
        firstName: "Test",
        lastName: "Farmer",
        phoneNumber: "+2348012345678",
        email: "test@farmer.com",
        dateOfBirth: new Date("1985-01-01"),
        gender: "male",
        address: "Lagos, Nigeria",
        stateOfResidence: "Lagos",
        localGovernmentArea: "Ikeja",
        farmingExperience: 10,
        primaryCrop: "Maize",
        farmSize: 5.0,
        educationLevel: "secondary",
        registrationDate: new Date(),
      }).returning();
      
      farmerRecord = newFarmer;
      console.log(`✅ Farmer created with ID: ${farmerRecord[0]!.id}`);
    } else {
      console.log(`✅ Using existing farmer ID: ${farmerRecord[0]!.id}`);
    }
    
    const farmerId = farmerRecord[0]!.id;
    
    // Sample farms with real Nigerian GPS coordinates
    const sampleFarms = [
      {
        userId: userId,
        farmerId: farmerId,
        farmName: "Lagos Maize Farm",
        latitude: 6.5244,
        longitude: 3.3792,
        farmSize: 5.0,
        soilType: "loamy",
        irrigationType: "drip",
        registrationDate: new Date(),
      },
      {
        userId: userId,
        farmerId: farmerId,
        farmName: "Kano Rice Farm",
        latitude: 12.0022,
        longitude: 8.5919,
        farmSize: 10.0,
        soilType: "clay",
        irrigationType: "flood",
        registrationDate: new Date(),
      },
      {
        userId: userId,
        farmerId: farmerId,
        farmName: "Ibadan Cassava Farm",
        latitude: 7.3775,
        longitude: 3.9470,
        farmSize: 8.0,
        soilType: "sandy loam",
        irrigationType: null,
        registrationDate: new Date(),
      },
      {
        userId: userId,
        farmerId: farmerId,
        farmName: "Kaduna Sorghum Farm",
        latitude: 10.5105,
        longitude: 7.4165,
        farmSize: 12.0,
        soilType: "loamy",
        irrigationType: "sprinkler",
        registrationDate: new Date(),
      },
      {
        userId: userId,
        farmerId: farmerId,
        farmName: "Port Harcourt Yam Farm",
        latitude: 4.8156,
        longitude: 7.0498,
        farmSize: 6.0,
        soilType: "clay loam",
        irrigationType: null,
        registrationDate: new Date(),
      },
    ];
    
    console.log(`📍 Creating ${sampleFarms.length} sample farms with real GPS coordinates...`);
    
    for (const farm of sampleFarms) {
      const inserted = await db.insert(farms).values(farm).returning();
      console.log(`  ✅ Created: ${farm.farmName} (${farm.latitude}, ${farm.longitude})`);
    }
    
    console.log("\n🎉 Sample farms seeding completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`  - User ID: ${userId}`);
    console.log(`  - Farmer ID: ${farmerId}`);
    console.log(`  - Farms created: ${sampleFarms.length}`);
    console.log("\n📍 GPS Coordinates:");
    sampleFarms.forEach(farm => {
      console.log(`  - ${farm.farmName}: ${farm.latitude}°N, ${farm.longitude}°E`);
    });
    console.log("\n🧪 Next steps:");
    console.log("  1. Run: npx tsx scripts/seed-sample-crops.ts");
    console.log("  2. Navigate to /agricultural-intelligence");
    console.log("  3. Test soil moisture monitoring with real coordinates");
    
  } catch (error) {
    console.error("❌ Error seeding sample farms:", error);
    throw error;
  }
}

seedSampleFarms()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
