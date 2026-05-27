import { getDb } from "../server/db.js";
import { crops, farms, users } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";

/**
 * Seed script to create sample crops with planting dates
 * for testing GDD (Growing Degree Days) tracking and harvest predictions
 * 
 * Run with: npx tsx scripts/seed-sample-crops.ts
 */

async function seedSampleCrops() {
  console.log("🌱 Starting sample crops seeding...");
  
  try {
    const db = await getDb();
    
    if (!db) {
      console.error("❌ Failed to connect to database");
      process.exit(1);
    }
    
    // Get the first user
    const existingUsers = await db.select().from(users).limit(1);
    
    if (existingUsers.length === 0) {
      console.error("❌ No users found. Please run seed-sample-farms.ts first");
      process.exit(1);
    }
    
    const userId = existingUsers[0]!.id;
    console.log(`✅ Found user ID: ${userId}`);
    
    // Get all farms for this user
    const userFarms = await db.select().from(farms).where(eq(farms.userId, userId));
    
    if (userFarms.length === 0) {
      console.error("❌ No farms found. Please run seed-sample-farms.ts first");
      process.exit(1);
    }
    
    console.log(`✅ Found ${userFarms.length} farms`);
    
    // Calculate planting dates for different growth stages
    const today = new Date();
    const daysAgo = (days: number) => {
      const date = new Date(today);
      date.setDate(date.getDate() - days);
      return date;
    };
    
    // Sample crops with strategic planting dates for testing different growth stages
    const sampleCrops = [
      // Lagos Maize Farm - Early vegetative stage (planted 20 days ago)
      {
        userId: userId,
        farmId: userFarms.find(f => f.farmName === "Lagos Maize Farm")?.id || userFarms[0]!.id,
        cropName: "Maize",
        variety: "SAMMAZ 15",
        plantingDate: daysAgo(20),
        expectedHarvestDate: new Date(daysAgo(20).getTime() + 120 * 24 * 60 * 60 * 1000), // 120 days from planting
        fieldSize: 2.5,
        quantityPlanted: 50,
        unit: "kg",
        status: "growing",
        notes: "Early vegetative stage - testing GDD accumulation",
      },
      // Kano Rice Farm - Mid vegetative stage (planted 45 days ago)
      {
        userId: userId,
        farmId: userFarms.find(f => f.farmName === "Kano Rice Farm")?.id || userFarms[1]?.id || userFarms[0]!.id,
        cropName: "Rice",
        variety: "FARO 44",
        plantingDate: daysAgo(45),
        expectedHarvestDate: new Date(daysAgo(45).getTime() + 140 * 24 * 60 * 60 * 1000), // 140 days from planting
        fieldSize: 5.0,
        quantityPlanted: 100,
        unit: "kg",
        status: "growing",
        notes: "Mid vegetative stage - approaching flowering",
      },
      // Ibadan Cassava Farm - Recently planted (planted 10 days ago)
      {
        userId: userId,
        farmId: userFarms.find(f => f.farmName === "Ibadan Cassava Farm")?.id || userFarms[2]?.id || userFarms[0]!.id,
        cropName: "Cassava",
        variety: "TME 419",
        plantingDate: daysAgo(10),
        expectedHarvestDate: new Date(daysAgo(10).getTime() + 365 * 24 * 60 * 60 * 1000), // 365 days from planting
        fieldSize: 4.0,
        quantityPlanted: 2000,
        unit: "stems",
        status: "planted",
        notes: "Early establishment stage - testing initial GDD tracking",
      },
      // Kaduna Sorghum Farm - Flowering stage (planted 70 days ago)
      {
        userId: userId,
        farmId: userFarms.find(f => f.farmName === "Kaduna Sorghum Farm")?.id || userFarms[3]?.id || userFarms[0]!.id,
        cropName: "Sorghum",
        variety: "ICSV 400",
        plantingDate: daysAgo(70),
        expectedHarvestDate: new Date(daysAgo(70).getTime() + 110 * 24 * 60 * 60 * 1000), // 110 days from planting
        fieldSize: 6.0,
        quantityPlanted: 40,
        unit: "kg",
        status: "flowering",
        notes: "Flowering stage - critical period for pest monitoring",
      },
      // Port Harcourt Yam Farm - Early growth (planted 30 days ago)
      {
        userId: userId,
        farmId: userFarms.find(f => f.farmName === "Port Harcourt Yam Farm")?.id || userFarms[4]?.id || userFarms[0]!.id,
        cropName: "Yam",
        variety: "White Yam (Puna)",
        plantingDate: daysAgo(30),
        expectedHarvestDate: new Date(daysAgo(30).getTime() + 270 * 24 * 60 * 60 * 1000), // 270 days from planting
        fieldSize: 3.0,
        quantityPlanted: 500,
        unit: "tubers",
        status: "growing",
        notes: "Early tuber formation stage",
      },
      // Additional crop for near-harvest testing (planted 100 days ago)
      {
        userId: userId,
        farmId: userFarms[0]!.id,
        cropName: "Cowpea",
        variety: "IT90K-277-2",
        plantingDate: daysAgo(100),
        expectedHarvestDate: new Date(daysAgo(100).getTime() + 75 * 24 * 60 * 60 * 1000), // 75 days from planting (short season)
        fieldSize: 1.5,
        quantityPlanted: 20,
        unit: "kg",
        status: "ready",
        notes: "Near maturity - testing harvest approaching alerts",
      },
    ];
    
    console.log(`🌾 Creating ${sampleCrops.length} sample crops with planting dates...`);
    
    const insertedCrops = [];
    for (const crop of sampleCrops) {
      const inserted = await db.insert(crops).values(crop).returning();
      insertedCrops.push(inserted[0]);
      
      const daysAfterPlanting = Math.floor((today.getTime() - crop.plantingDate.getTime()) / (24 * 60 * 60 * 1000));
      const daysToHarvest = Math.floor((crop.expectedHarvestDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      
      console.log(`  ✅ Created: ${crop.cropName} (${crop.variety})`);
      console.log(`     - Planted: ${daysAfterPlanting} days ago`);
      console.log(`     - Harvest in: ${daysToHarvest} days`);
      console.log(`     - Status: ${crop.status}`);
    }
    
    console.log("\n🎉 Sample crops seeding completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`  - User ID: ${userId}`);
    console.log(`  - Crops created: ${sampleCrops.length}`);
    console.log("\n🌱 Crop Growth Stages:");
    console.log("  - Cassava (10 days): Early establishment");
    console.log("  - Maize (20 days): Early vegetative");
    console.log("  - Yam (30 days): Early tuber formation");
    console.log("  - Rice (45 days): Mid vegetative");
    console.log("  - Sorghum (70 days): Flowering");
    console.log("  - Cowpea (100 days): Near maturity");
    
    console.log("\n🧪 Next steps:");
    console.log("  1. Navigate to /agricultural-intelligence");
    console.log("  2. Select a crop from the dropdown");
    console.log("  3. View GDD accumulation and growth stage");
    console.log("  4. Check soil moisture for the farm");
    console.log("  5. Review pest/disease risk alerts");
    console.log("\n💡 Testing scenarios:");
    console.log("  - Early stage (Cassava): Low GDD, emergence stage");
    console.log("  - Mid stage (Rice): Moderate GDD, vegetative stage");
    console.log("  - Late stage (Cowpea): High GDD, maturity stage");
    console.log("  - Flowering (Sorghum): Critical pest monitoring period");
    
  } catch (error) {
    console.error("❌ Error seeding sample crops:", error);
    throw error;
  }
}

seedSampleCrops()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
