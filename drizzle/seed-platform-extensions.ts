/**
 * Seed data for platform extension tables.
 * Run with: npx tsx drizzle/seed-platform-extensions.ts
 */

import { getDb } from "../server/db.js";
import {
  farmingContracts, offtakers, apiKeys, apiWebhooks,
  didDocuments, verifiableCredentials, insurancePolicies,
  p2pLoans, savingsCircles, tokenizedAssets, tokenHoldings,
  inputFinancingApplications, extensionPrograms, extensionVisits,
  governmentPrograms, governmentBeneficiaries, governanceProposals,
  supplyListings, demandListings, indoorFarms, growRecipes, weatherForecasts,
} from "./platform-extensions-schema.js";

export async function seedPlatformExtensions() {
  const db = await getDb();
  if (!db) { console.error("No database connection"); return; }

  // ─── Offtakers ──────────────────────────────────────────────
  await db.insert(offtakers).values([
    { name: "Lagos Foods Ltd", type: "processor", crops: ["maize", "sorghum"], regions: ["Lagos", "Ogun"], rating: "4.8", contractsCompleted: 45, contactEmail: "procurement@lagosfoods.ng", contactPhone: "+2348012345678" },
    { name: "Kano Agro Industries", type: "miller", crops: ["rice", "wheat"], regions: ["Kano", "Kaduna"], rating: "4.5", contractsCompleted: 32, contactEmail: "orders@kanoagro.ng", contactPhone: "+2348023456789" },
    { name: "Cassava Processing Co", type: "processor", crops: ["cassava"], regions: ["Ogun", "Oyo"], rating: "4.6", contractsCompleted: 28, contactEmail: "supply@cassavaprocessing.ng", contactPhone: "+2348034567890" },
    { name: "Fresh Exports NG", type: "exporter", crops: ["vegetables", "fruits"], regions: ["Nationwide"], rating: "4.9", contractsCompleted: 67, contactEmail: "exports@freshexports.ng", contactPhone: "+2348045678901" },
    { name: "Poultry Feed Corp", type: "feed_manufacturer", crops: ["maize", "soybean"], regions: ["Ibadan", "Lagos"], rating: "4.3", contractsCompleted: 19, contactEmail: "feed@poultryfeedcorp.ng", contactPhone: "+2348056789012" },
  ]).onConflictDoNothing();

  // ─── Farming Contracts ──────────────────────────────────────
  await db.insert(farmingContracts).values([
    { contractCode: "CF-001", farmerId: 1, offtakerId: 1, cropType: "maize", variety: "WEMA-1001", quantityKg: "5000", pricePerKg: "280", deliveryDate: new Date("2026-08-15"), deliveryLocation: "Lagos Aggregation Center", status: "active", penaltyClause: { lateDeliveryPenaltyPercent: 2, qualityDeviationPenaltyPercent: 5, shortfallPenaltyPercent: 3, forcesMajeure: true }, bonusClause: { earlyDeliveryBonusPercent: 1, premiumQualityBonusPercent: 3, volumeExcessBonusPercent: 1.5 }, escrowId: "ESC-CF-001", insuranceLinked: true, totalValue: "1400000" },
    { contractCode: "CF-002", farmerId: 2, offtakerId: 2, cropType: "rice", variety: "FARO-44", quantityKg: "10000", pricePerKg: "450", deliveryDate: new Date("2026-09-01"), deliveryLocation: "Kano Processing Mill", status: "active", penaltyClause: { lateDeliveryPenaltyPercent: 2, qualityDeviationPenaltyPercent: 5, shortfallPenaltyPercent: 3, forcesMajeure: true }, totalValue: "4500000" },
    { contractCode: "CF-003", farmerId: 3, offtakerId: 3, cropType: "cassava", variety: "TME-419", quantityKg: "20000", pricePerKg: "120", deliveryDate: new Date("2026-07-30"), deliveryLocation: "Ogun Starch Factory", status: "proposed", insuranceLinked: true, totalValue: "2400000" },
  ]).onConflictDoNothing();

  // ─── Insurance Policies ─────────────────────────────────────
  await db.insert(insurancePolicies).values([
    { policyCode: "PI-001", farmerId: 1, policyType: "drought", coverageAmount: "500000", premiumAmount: "25000", triggerConditions: { type: "rainfall_deficit", threshold_mm: 50, monitoring_period_days: 30 }, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), dataSource: "satellite:CHIRPS" },
    { policyCode: "PI-002", farmerId: 2, policyType: "flood", coverageAmount: "750000", premiumAmount: "37500", triggerConditions: { type: "excess_rainfall", threshold_mm: 200, monitoring_period_days: 7 }, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), dataSource: "satellite:GPM" },
    { policyCode: "PI-003", farmerId: 3, policyType: "pest_outbreak", coverageAmount: "300000", premiumAmount: "15000", triggerConditions: { type: "ndvi_anomaly", threshold: -0.3, monitoring_period_days: 14 }, startDate: new Date("2026-03-01"), endDate: new Date("2026-11-30"), dataSource: "satellite:MODIS" },
  ]).onConflictDoNothing();

  // ─── P2P Loans ──────────────────────────────────────────────
  await db.insert(p2pLoans).values([
    { loanCode: "P2P-001", borrowerId: 1, lenderId: 4, amount: "100000", interestRate: "12.5", termMonths: 6, purpose: "Seed purchase for maize planting season", status: "active", collateralType: "harvest_pledge", collateralValue: "200000", monthlyPayment: "17708" },
    { loanCode: "P2P-002", borrowerId: 2, amount: "250000", interestRate: "15", termMonths: 12, purpose: "Irrigation equipment installation", status: "pending", collateralType: "land_title", collateralValue: "1000000", monthlyPayment: "22616" },
    { loanCode: "P2P-003", borrowerId: 3, lenderId: 5, amount: "50000", interestRate: "10", termMonths: 3, purpose: "Fertilizer for cassava", status: "repaid", collateralType: "warehouse_receipt", collateralValue: "80000", monthlyPayment: "17167", totalRepaid: "51500" },
  ]).onConflictDoNothing();

  // ─── Savings Circles ────────────────────────────────────────
  await db.insert(savingsCircles).values([
    { name: "Maize Farmers United", type: "rotating", contributionAmount: "5000", frequency: "monthly", memberCount: 12, currentRound: 5, totalPooled: "300000", rules: { latePaymentPenalty: 500, maxMissedPayments: 2 } },
    { name: "Women Rice Growers", type: "accumulating", contributionAmount: "3000", frequency: "weekly", memberCount: 20, currentRound: 15, totalPooled: "900000", rules: { interestOnLoans: 5, maxLoanMultiplier: 3 } },
  ]).onConflictDoNothing();

  // ─── Tokenized Assets ──────────────────────────────────────
  await db.insert(tokenizedAssets).values([
    { tokenCode: "FARM-001", assetType: "farmland", assetName: "50-Hectare Maize Farm Ogun", totalSupply: 1000, availableSupply: 650, pricePerToken: "5000", yieldRate: "18.5", maturityDate: new Date("2027-06-01"), metadata: { location: "Ogun State", soilType: "loamy", irrigated: true } },
    { tokenCode: "HARVEST-001", assetType: "harvest_future", assetName: "Rice Harvest 2026 Kano", totalSupply: 500, availableSupply: 200, pricePerToken: "10000", yieldRate: "22", maturityDate: new Date("2026-12-01"), metadata: { expectedYieldTons: 50, variety: "FARO-44" } },
    { tokenCode: "CARBON-001", assetType: "carbon_credit", assetName: "Agroforestry Carbon Credits", totalSupply: 2000, availableSupply: 1800, pricePerToken: "2500", metadata: { standard: "Gold Standard", vintage: 2026, tCO2e: 1 } },
  ]).onConflictDoNothing();

  // ─── Extension Programs ─────────────────────────────────────
  await db.insert(extensionPrograms).values([
    { programCode: "EXT-001", name: "Climate-Smart Agriculture Training", category: "climate_adaptation", targetCrops: ["maize", "rice", "cassava"], targetRegions: ["North Central", "South West"], deliveryMethod: "in_person", curriculum: [{ module: "Soil Conservation", hours: 4 }, { module: "Water Harvesting", hours: 3 }, { module: "Drought-Resistant Varieties", hours: 2 }], enrollmentCount: 150, maxCapacity: 200, startDate: new Date("2026-06-01"), endDate: new Date("2026-09-30"), status: "active" },
    { programCode: "EXT-002", name: "Digital Farming Tools Workshop", category: "technology", targetCrops: ["all"], targetRegions: ["Nationwide"], deliveryMethod: "hybrid", curriculum: [{ module: "GPS Farm Mapping", hours: 3 }, { module: "Mobile Money for Farmers", hours: 2 }, { module: "Market Price Apps", hours: 2 }], enrollmentCount: 80, maxCapacity: 500, startDate: new Date("2026-07-01"), status: "planned" },
    { programCode: "EXT-003", name: "Integrated Pest Management", category: "crop_protection", targetCrops: ["tomato", "pepper", "vegetables"], targetRegions: ["North West", "North Central"], deliveryMethod: "in_person", curriculum: [{ module: "Pest Identification", hours: 4 }, { module: "Biological Control", hours: 3 }, { module: "Safe Pesticide Use", hours: 3 }], enrollmentCount: 200, maxCapacity: 200, startDate: new Date("2026-04-01"), endDate: new Date("2026-06-30"), status: "completed" },
  ]).onConflictDoNothing();

  // ─── Government Programs ────────────────────────────────────
  await db.insert(governmentPrograms).values([
    { programCode: "FMARD-ABP-2026", name: "Anchor Borrowers Programme", ministry: "Federal Ministry of Agriculture", description: "Provide farm inputs and credit to smallholder farmers to boost production of key commodities", budgetAllocated: "100000000000", budgetDisbursed: "45000000000", beneficiaryCount: 4200000, eligibilityCriteria: { minFarmSize: 0.5, maxFarmSize: 5, crops: ["rice", "maize", "wheat", "cassava", "cotton", "soybean"] }, status: "active", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") },
    { programCode: "FMARD-YAGEP-2026", name: "Youth Agricultural Entrepreneurship Programme", ministry: "Federal Ministry of Agriculture", description: "Train and equip young Nigerians in modern agricultural practices", budgetAllocated: "10000000000", budgetDisbursed: "3500000000", beneficiaryCount: 50000, eligibilityCriteria: { minAge: 18, maxAge: 35, education: "secondary" }, status: "active", startDate: new Date("2026-03-01") },
    { programCode: "CBN-CACS-2026", name: "Commercial Agriculture Credit Scheme", ministry: "Central Bank of Nigeria", description: "Provide long-term finance at single-digit interest to commercial farmers", budgetAllocated: "500000000000", budgetDisbursed: "200000000000", beneficiaryCount: 680, eligibilityCriteria: { minLoanAmount: 2000000, businessPlan: true, collateral: true }, status: "active" },
  ]).onConflictDoNothing();

  // ─── Indoor Farms ───────────────────────────────────────────
  await db.insert(indoorFarms).values([
    { name: "Lagos Vertical Greens", ownerId: 1, farmType: "vertical", growSystem: "NFT_hydroponic", squareMeters: "500", rackLevels: 8, lightingType: "LED_full_spectrum", location: "Lagos, Victoria Island", environmentParams: { targetTempC: 24, targetHumidityPct: 65, co2Ppm: 800 } },
    { name: "Abuja Container Farm", ownerId: 2, farmType: "container", growSystem: "deep_water_culture", squareMeters: "40", rackLevels: 4, lightingType: "LED_red_blue", location: "Abuja, Wuse", environmentParams: { targetTempC: 22, targetHumidityPct: 70, co2Ppm: 600 } },
  ]).onConflictDoNothing();

  // ─── Grow Recipes ───────────────────────────────────────────
  await db.insert(growRecipes).values([
    { cropType: "lettuce", recipeName: "Butterhead Lettuce - NFT", lightHoursPerDay: "16", temperatureMinC: "18", temperatureMaxC: "24", humidityMinPct: "50", humidityMaxPct: "70", nutrientSolution: { N: 150, P: 50, K: 200, Ca: 150, Mg: 50, pH: 5.8, EC: 1.2 }, phMin: "5.5", phMax: "6.5", growthDays: 35, expectedYieldKgPerSqm: "8.5" },
    { cropType: "basil", recipeName: "Genovese Basil - DWC", lightHoursPerDay: "18", temperatureMinC: "20", temperatureMaxC: "28", humidityMinPct: "40", humidityMaxPct: "60", nutrientSolution: { N: 200, P: 60, K: 250, Ca: 180, Mg: 60, pH: 6.0, EC: 1.4 }, phMin: "5.5", phMax: "6.5", growthDays: 28, expectedYieldKgPerSqm: "4.5" },
    { cropType: "strawberry", recipeName: "Indoor Strawberry - Vertical", lightHoursPerDay: "14", temperatureMinC: "15", temperatureMaxC: "22", humidityMinPct: "55", humidityMaxPct: "75", nutrientSolution: { N: 100, P: 80, K: 300, Ca: 120, Mg: 40, pH: 5.8, EC: 1.6 }, phMin: "5.5", phMax: "6.2", growthDays: 60, expectedYieldKgPerSqm: "6.0" },
    { cropType: "spinach", recipeName: "Baby Spinach - NFT", lightHoursPerDay: "12", temperatureMinC: "15", temperatureMaxC: "20", humidityMinPct: "50", humidityMaxPct: "70", nutrientSolution: { N: 180, P: 50, K: 220, Ca: 150, Mg: 70, pH: 6.0, EC: 1.8 }, phMin: "6.0", phMax: "7.0", growthDays: 25, expectedYieldKgPerSqm: "5.0" },
    { cropType: "microgreens", recipeName: "Mixed Microgreens - Tray", lightHoursPerDay: "16", temperatureMinC: "18", temperatureMaxC: "24", humidityMinPct: "40", humidityMaxPct: "60", nutrientSolution: { N: 80, P: 30, K: 100, pH: 6.0, EC: 0.8 }, phMin: "5.5", phMax: "6.5", growthDays: 12, expectedYieldKgPerSqm: "3.0" },
  ]).onConflictDoNothing();

  console.log("Platform extensions seeded successfully");
}

// Self-execute if run directly
if (process.argv[1]?.includes("seed-platform-extensions")) {
  seedPlatformExtensions().catch(console.error).finally(() => process.exit(0));
}
