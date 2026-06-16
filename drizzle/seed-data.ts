/**
 * Production seed data for all platform domains.
 * Run with: npx tsx drizzle/seed-data.ts
 */
import { getDb } from "../server/db.js";
import {
  farmingContracts, warehouseReceipts, supplyListings, demandListings,
  governanceProposals, extensionPrograms, governmentPrograms,
  inputFinancingApplications, insurancePolicies, tokenizedAssets,
  didDocuments, verifiableCredentials, apiKeys, weatherForecasts,
  indoorFarms, growRecipes,
} from "./platform-extensions-schema.js";

async function seed() {
  const db = await getDb();
  if (!db) { console.error("No database connection"); process.exit(1); }

  console.log("Seeding platform data...");

  // Contract Farming
  await db.insert(farmingContracts).values([
    { contractCode: "CF-SEED001", farmerId: 1, offtakerId: 10, cropType: "maize", variety: "SAMMAZ-15", quantityKg: "5000", pricePerKg: "450", currency: "NGN", qualityGrade: "A", deliveryDate: new Date("2026-08-15"), deliveryLocation: "Kano Warehouse A", status: "active", totalValue: "2250000", penaltyClause: { lateDeliveryPenaltyPercent: 2, shortfallPenaltyPercent: 3 }, bonusClause: { earlyDeliveryBonusPercent: 1 } },
    { contractCode: "CF-SEED002", farmerId: 2, offtakerId: 11, cropType: "rice", variety: "FARO-44", quantityKg: "3000", pricePerKg: "750", currency: "NGN", qualityGrade: "B", deliveryDate: new Date("2026-09-01"), deliveryLocation: "Lagos Processing Hub", status: "active", totalValue: "2250000" },
    { contractCode: "CF-SEED003", farmerId: 3, offtakerId: 12, cropType: "soybean", quantityKg: "2000", pricePerKg: "600", currency: "NGN", qualityGrade: "A", deliveryDate: new Date("2026-10-01"), deliveryLocation: "Abuja Distribution Center", status: "draft", totalValue: "1200000" },
  ]).onConflictDoNothing();

  // Warehouse Receipts
  await db.insert(warehouseReceipts).values([
    { receiptCode: "WR-SEED001", farmerId: 1, warehouseId: 1, commodityType: "maize", quantityKg: "5000", qualityGrade: "A", storageStartDate: new Date("2026-05-01"), expectedReleaseDate: new Date("2026-08-15"), status: "stored", currentValuePerKg: "480" },
    { receiptCode: "WR-SEED002", farmerId: 2, warehouseId: 2, commodityType: "rice", quantityKg: "3000", qualityGrade: "B", storageStartDate: new Date("2026-04-15"), expectedReleaseDate: new Date("2026-07-30"), status: "stored", currentValuePerKg: "800" },
  ]).onConflictDoNothing();

  // Supply Listings
  await db.insert(supplyListings).values([
    { farmerId: 1, cropType: "maize", variety: "SAMMAZ-15", quantityKg: "10000", pricePerKg: "450", currency: "NGN", availableFrom: new Date("2026-07-01"), availableUntil: new Date("2026-09-30"), location: "Kano, Nigeria", qualityGrade: "A", isActive: true },
    { farmerId: 2, cropType: "rice", variety: "FARO-44", quantityKg: "5000", pricePerKg: "750", currency: "NGN", availableFrom: new Date("2026-08-01"), location: "Benue, Nigeria", qualityGrade: "B", isActive: true },
    { farmerId: 3, cropType: "cassava", quantityKg: "20000", pricePerKg: "200", currency: "NGN", availableFrom: new Date("2026-06-15"), location: "Ogun, Nigeria", isActive: true },
    { farmerId: 4, cropType: "tomato", variety: "Roma VF", quantityKg: "3000", pricePerKg: "500", currency: "NGN", availableFrom: new Date("2026-06-01"), location: "Kaduna, Nigeria", qualityGrade: "A", isActive: true },
  ]).onConflictDoNothing();

  // Demand Listings
  await db.insert(demandListings).values([
    { buyerId: 10, cropType: "maize", quantityKg: "50000", maxPricePerKg: "500", currency: "NGN", requiredBy: new Date("2026-09-15"), deliveryLocation: "Lagos Industrial Zone", qualityRequirements: { minGrade: "B", moisture: "<14%" }, isActive: true },
    { buyerId: 11, cropType: "rice", quantityKg: "20000", maxPricePerKg: "800", currency: "NGN", requiredBy: new Date("2026-10-01"), deliveryLocation: "Abuja Market", isActive: true },
    { buyerId: 12, cropType: "cassava", quantityKg: "100000", maxPricePerKg: "250", currency: "NGN", requiredBy: new Date("2026-12-01"), deliveryLocation: "Oyo Processing Plant", isActive: true },
  ]).onConflictDoNothing();

  // Governance Proposals
  await db.insert(governanceProposals).values([
    { cooperativeId: 1, title: "Increase membership dues by 10%", description: "Proposal to raise annual dues from NGN 5,000 to NGN 5,500 to fund new equipment purchases.", category: "financial", proposerId: 1, status: "open", quorumRequired: 50, deadline: new Date("2026-06-15") },
    { cooperativeId: 1, title: "Establish seed bank for drought-resistant varieties", description: "Create cooperative seed bank with 5 drought-resistant maize and sorghum varieties.", category: "operations", proposerId: 2, status: "open", quorumRequired: 40, deadline: new Date("2026-06-30") },
    { cooperativeId: 2, title: "Partner with MFI for group lending", description: "Form partnership with First Bank Microfinance for group-guaranteed agricultural loans.", category: "financial", proposerId: 5, status: "closed", quorumRequired: 60, deadline: new Date("2026-05-01"), outcome: "approved", votesFor: 45, votesAgainst: 12, votesAbstain: 3 },
  ]).onConflictDoNothing();

  // Extension Programs
  await db.insert(extensionPrograms).values([
    { name: "Climate-Smart Agriculture Training", description: "12-week program on drought mitigation, water harvesting, and heat-tolerant crop varieties.", programType: "training", targetCrop: "maize", region: "Northern Nigeria", startDate: new Date("2026-06-01"), endDate: new Date("2026-08-31"), maxParticipants: 200, enrollmentCount: 145, status: "active" },
    { name: "Post-Harvest Loss Reduction", description: "Hands-on training in hermetic storage, solar drying, and quality grading.", programType: "workshop", targetCrop: "rice", region: "South-West Nigeria", startDate: new Date("2026-07-01"), endDate: new Date("2026-07-15"), maxParticipants: 50, enrollmentCount: 38, status: "active" },
    { name: "Integrated Pest Management", description: "IPM techniques for tomato and pepper production using biological controls.", programType: "field_demonstration", targetCrop: "tomato", region: "Kaduna State", startDate: new Date("2026-05-15"), endDate: new Date("2026-06-15"), maxParticipants: 100, enrollmentCount: 92, status: "active" },
  ]).onConflictDoNothing();

  // Government Programs
  await db.insert(governmentPrograms).values([
    { programName: "Anchor Borrowers Programme", description: "CBN-backed program providing subsidized loans for smallholder farmers producing rice, wheat, maize.", ministry: "Federal Ministry of Agriculture", fundingAmount: "500000000", currency: "NGN", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), eligibilityCriteria: { minFarmSize: 1, maxFarmSize: 5, crops: ["rice", "wheat", "maize"] }, status: "active", maxBeneficiaries: 10000 },
    { programName: "Youth Agricultural Entrepreneurs", description: "Grant program for youth (18-35) establishing modern farming enterprises.", ministry: "Ministry of Youth Development", fundingAmount: "100000000", currency: "NGN", startDate: new Date("2026-03-01"), endDate: new Date("2027-03-01"), eligibilityCriteria: { minAge: 18, maxAge: 35, businessPlan: true }, status: "active", maxBeneficiaries: 500 },
  ]).onConflictDoNothing();

  // Input Financing
  await db.insert(inputFinancingApplications).values([
    { applicationCode: "IF-SEED001", farmerId: 1, inputType: "seeds", inputDescription: "SAMMAZ-15 improved maize seeds, 50kg bags x 10", requestedAmount: "250000", status: "approved", approvedAmount: "200000", supplierId: 20, harvestLinked: true, seasonId: "2026-wet" },
    { applicationCode: "IF-SEED002", farmerId: 2, inputType: "fertilizer", inputDescription: "NPK 15-15-15 fertilizer, 50kg bags x 20", requestedAmount: "400000", status: "pending", supplierId: 21, harvestLinked: true, seasonId: "2026-wet" },
    { applicationCode: "IF-SEED003", farmerId: 3, inputType: "equipment", inputDescription: "Knapsack sprayer and irrigation pump", requestedAmount: "150000", status: "disbursed", approvedAmount: "150000", harvestLinked: false },
  ]).onConflictDoNothing();

  // Insurance Policies
  await db.insert(insurancePolicies).values([
    { policyCode: "PI-SEED001", farmerId: 1, policyType: "rainfall_deficit", coverageAmount: "500000", premiumAmount: "25000", triggerConditions: { type: "rainfall_deficit", threshold_mm: 50, measurement_period_days: 30 }, startDate: new Date("2026-06-01"), endDate: new Date("2026-11-30"), dataSource: "NIMET", status: "active" },
    { policyCode: "PI-SEED002", farmerId: 2, policyType: "temperature_extreme", coverageAmount: "300000", premiumAmount: "15000", triggerConditions: { type: "temperature_extreme", max_temp_c: 42, min_temp_c: 8 }, startDate: new Date("2026-06-01"), endDate: new Date("2026-10-31"), dataSource: "satellite", status: "active" },
  ]).onConflictDoNothing();

  // Tokenized Assets
  await db.insert(tokenizedAssets).values([
    { tokenCode: "TKN-FARM001", assetType: "farmland", assetName: "5-Acre Maize Farm, Kano", description: "Fractional ownership of productive irrigated farmland", totalSupply: 1000, availableSupply: 750, pricePerToken: "5000", currency: "NGN", yieldRate: "12.5", status: "active" },
    { tokenCode: "TKN-HARV001", assetType: "harvest_future", assetName: "2026 Rice Harvest, Benue", description: "Pre-purchase of Q3 2026 rice harvest at fixed price", totalSupply: 500, availableSupply: 320, pricePerToken: "3000", currency: "NGN", yieldRate: "8.0", maturityDate: new Date("2026-10-01"), status: "active" },
    { tokenCode: "TKN-CARB001", assetType: "carbon_credit", assetName: "Agroforestry Carbon Credits", description: "Verified emission reduction from tree planting", totalSupply: 2000, availableSupply: 1800, pricePerToken: "15000", currency: "NGN", status: "active" },
  ]).onConflictDoNothing();

  // DID Documents
  await db.insert(didDocuments).values([
    { did: "did:farmconnect:farmer:1", userId: 1, method: "did:web", publicKeyMultibase: "z6Mkf5rGMoatrSj1f4CyvuHBeXJELe9RPdzo2PKGNCKVtZxP", verificationMethods: [{ id: "did:farmconnect:farmer:1#key-1", type: "Ed25519VerificationKey2020", publicKeyMultibase: "z6Mkf5rGMoatrSj1f4CyvuHBeXJELe9RPdzo2PKGNCKVtZxP" }], serviceEndpoints: [] },
    { did: "did:farmconnect:farmer:2", userId: 2, method: "did:web", publicKeyMultibase: "z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK", verificationMethods: [{ id: "did:farmconnect:farmer:2#key-1", type: "Ed25519VerificationKey2020", publicKeyMultibase: "z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK" }], serviceEndpoints: [] },
  ]).onConflictDoNothing();

  // Verifiable Credentials
  await db.insert(verifiableCredentials).values([
    { credentialId: "vc:farmconnect:credit:1:001", issuerDid: "did:farmconnect:mfi:microfinance-bank-ng", subjectDid: "did:farmconnect:farmer:1", credentialType: "credit_history", claims: { creditScore: 720, loansRepaid: 5, onTimePayments: 100 }, proof: { type: "Ed25519Signature2020", created: "2026-03-01", verificationMethod: "did:farmconnect:mfi:microfinance-bank-ng#key-1", proofPurpose: "assertionMethod" }, expirationDate: new Date("2027-03-01") },
    { credentialId: "vc:farmconnect:land:1:001", issuerDid: "did:farmconnect:gov:lands-registry-ng", subjectDid: "did:farmconnect:farmer:1", credentialType: "land_ownership", claims: { parcelId: "OG/ABK/2024/001", sizeAcres: 5, location: "Abeokuta South, Ogun" }, proof: { type: "Ed25519Signature2020", created: "2026-01-15", verificationMethod: "did:farmconnect:gov:lands-registry-ng#key-1", proofPurpose: "assertionMethod" }, expirationDate: new Date("2031-01-15") },
  ]).onConflictDoNothing();

  // Weather Forecasts
  await db.insert(weatherForecasts).values([
    { latitude: "9.0579", longitude: "7.4951", forecastDate: new Date("2026-05-28"), temperatureHighC: "35.2", temperatureLowC: "22.1", precipitationMm: "15.0", humidityPct: "72.0", windSpeedKmh: "12.5", condition: "Partly Cloudy", source: "openweather", confidence: "0.85", advisoryText: "Good conditions for field work. Light rain expected in the afternoon." },
    { latitude: "6.5244", longitude: "3.3792", forecastDate: new Date("2026-05-28"), temperatureHighC: "32.0", temperatureLowC: "24.5", precipitationMm: "45.0", humidityPct: "85.0", windSpeedKmh: "18.0", condition: "Thunderstorms", source: "openweather", confidence: "0.78", advisoryText: "Heavy rain expected. Avoid spraying pesticides. Ensure drainage channels are clear." },
    { latitude: "12.0022", longitude: "8.5920", forecastDate: new Date("2026-05-28"), temperatureHighC: "38.5", temperatureLowC: "25.0", precipitationMm: "0.0", humidityPct: "35.0", windSpeedKmh: "8.0", condition: "Clear", source: "openweather", confidence: "0.92", advisoryText: "High temperatures. Increase irrigation frequency. Monitor for heat stress in crops." },
  ]).onConflictDoNothing();

  // Indoor Farms (CEA)
  await db.insert(indoorFarms).values([
    { farmName: "Lagos Vertical Farm Alpha", farmType: "vertical", locationCity: "Lagos", totalAreaSqm: "500", growingLevels: 8, cropTypes: ["lettuce", "basil", "spinach", "kale"], lightingType: "LED full-spectrum", irrigationType: "NFT hydroponic", climateControlled: true, status: "active" },
    { farmName: "Abuja Container Farm", farmType: "container", locationCity: "Abuja", totalAreaSqm: "40", growingLevels: 4, cropTypes: ["strawberry", "microgreens", "herbs"], lightingType: "LED", irrigationType: "drip", climateControlled: true, status: "active" },
    { farmName: "Kano Greenhouse Complex", farmType: "greenhouse", locationCity: "Kano", totalAreaSqm: "2000", growingLevels: 1, cropTypes: ["tomato", "pepper", "cucumber"], lightingType: "natural+supplemental", irrigationType: "drip", climateControlled: false, status: "active" },
  ]).onConflictDoNothing();

  // Grow Recipes
  await db.insert(growRecipes).values([
    { recipeName: "Butterhead Lettuce - Optimal", cropType: "lettuce", variety: "Butterhead", growthCycleDays: 35, lightHoursPerDay: 16, temperatureMinC: "18", temperatureMaxC: "24", humidityMinPct: "60", humidityMaxPct: "75", phMin: "5.8", phMax: "6.2", ecMin: "0.8", ecMax: "1.2", nutrientSolution: { N: 150, P: 50, K: 200, Ca: 200, Mg: 50 }, yieldPerSqmKg: "4.5", isPublic: true },
    { recipeName: "Cherry Tomato - Hydroponic", cropType: "tomato", variety: "Cherry", growthCycleDays: 90, lightHoursPerDay: 14, temperatureMinC: "20", temperatureMaxC: "28", humidityMinPct: "55", humidityMaxPct: "70", phMin: "5.5", phMax: "6.5", ecMin: "2.0", ecMax: "3.5", nutrientSolution: { N: 200, P: 60, K: 350, Ca: 250, Mg: 50 }, yieldPerSqmKg: "8.0", isPublic: true },
  ]).onConflictDoNothing();

  console.log("Seed data inserted successfully.");
}

seed().catch(console.error);
