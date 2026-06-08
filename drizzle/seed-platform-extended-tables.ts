// @ts-nocheck
/**
 * Seed data for schema-platform-extended.ts tables.
 * Covers: chama groups, federated models, export shipments, pipeline jobs,
 * digital twins, chat sessions, market prices, carbon projects, insurance products,
 * IoT devices, soil samples, predictions, retail stores, compliance rules.
 * Run with: npx tsx drizzle/seed-platform-extended-tables.ts
 */
import { getDb } from "../server/db.js";
import {
  carbonProjects, carbonCredits, insuranceProducts,
  complianceRules, paymentTransactions,
  iotDevices, iotReadings, iotRules, digitalTwins,
  soilSamples, predictions, marketPrices, marketAlerts,
  retailStores, retailInventory,
  exportShipments, exportCertifications,
  pipelineJobs, pipelineMetrics,
  chamaGroups, chamaMembers, chamaTransactions,
  chatSessions, chatMessages,
  federatedModels, federatedParticipants,
} from "./schema-platform-extended.js";

export async function seedPlatformExtendedTables() {
  const db = await getDb();
  if (!db) { console.error("No database connection"); return; }

  // ─── Carbon Projects ─────────────────────────────────────────
  await db.insert(carbonProjects).values([
    { name: "Kakamega Agroforestry", methodology: "agroforestry", region: "Western Kenya", areaHectares: "250", annualSequestration: "85", status: "active", verifier: "Verra VCS", startDate: new Date("2025-01-01") },
    { name: "Ogun Biochar Initiative", methodology: "biochar", region: "Ogun State", areaHectares: "120", annualSequestration: "45", status: "active", verifier: "Gold Standard", startDate: new Date("2025-03-01") },
    { name: "Rift Valley Conservation", methodology: "conservation_tillage", region: "Rift Valley", areaHectares: "500", annualSequestration: "150", status: "verified", verifier: "Plan Vivo", startDate: new Date("2024-06-15") },
    { name: "Niger Delta Mangrove Restoration", methodology: "mangrove_restoration", region: "Niger Delta", areaHectares: "180", annualSequestration: "220", status: "active", verifier: "Verra VCS", startDate: new Date("2025-02-01") },
    { name: "Kiambu Cover Crop Project", methodology: "cover_cropping", region: "Central Kenya", areaHectares: "90", annualSequestration: "30", status: "pending", verifier: "Gold Standard", startDate: new Date("2025-06-01") },
  ]).onConflictDoNothing();

  // ─── Carbon Credits ───────────────────────────────────────────
  await db.insert(carbonCredits).values([
    { projectId: 1, vintage: 2025, quantity: "850", pricePerTon: "25.00", status: "available", serialNumber: "VCS-KAF-2025-001" },
    { projectId: 2, vintage: 2025, quantity: "450", pricePerTon: "30.00", status: "available", serialNumber: "GS-OBI-2025-001" },
    { projectId: 3, vintage: 2024, quantity: "1500", pricePerTon: "22.00", status: "retired", serialNumber: "PV-RVC-2024-001" },
    { projectId: 4, vintage: 2025, quantity: "2200", pricePerTon: "35.00", status: "available", serialNumber: "VCS-NDM-2025-001" },
  ]).onConflictDoNothing();

  // ─── Insurance Products ───────────────────────────────────────
  await db.insert(insuranceProducts).values([
    { name: "Drought Shield", type: "drought", description: "Parametric drought insurance triggered by rainfall deficit <50mm in 30 days", basePremiumRate: "5.0", maxCoverage: "500000", triggerType: "rainfall_deficit", triggerThreshold: "50", monitoringSource: "CHIRPS satellite", regions: ["Western Kenya", "Rift Valley", "Eastern Kenya"] },
    { name: "Flood Guard", type: "flood", description: "Flood coverage triggered by excess rainfall >200mm in 7 days", basePremiumRate: "5.5", maxCoverage: "750000", triggerType: "excess_rainfall", triggerThreshold: "200", monitoringSource: "GPM satellite", regions: ["Niger Delta", "Coastal Kenya"] },
    { name: "Pest Protector", type: "pest_outbreak", description: "Coverage against pest outbreaks detected via NDVI anomaly", basePremiumRate: "4.5", maxCoverage: "300000", triggerType: "ndvi_anomaly", triggerThreshold: "-0.3", monitoringSource: "MODIS satellite", regions: ["Nationwide"] },
    { name: "Crop Revenue", type: "price_drop", description: "Revenue protection when market price drops >20% below 30-day average", basePremiumRate: "6.0", maxCoverage: "1000000", triggerType: "price_drop", triggerThreshold: "20", monitoringSource: "Market data feed", regions: ["Nationwide"] },
    { name: "Livestock Shield", type: "disease", description: "Livestock disease coverage for common epidemic outbreaks", basePremiumRate: "7.0", maxCoverage: "2000000", triggerType: "disease_outbreak", triggerThreshold: "1", monitoringSource: "Vet reports", regions: ["Northern Nigeria", "Pastoral Kenya"] },
  ]).onConflictDoNothing();

  // ─── Compliance Rules ─────────────────────────────────────────
  await db.insert(complianceRules).values([
    { ruleCode: "AML-001", name: "Transaction Threshold Alert", category: "aml", description: "Flag transactions exceeding 1M NGN in single transfer", threshold: "1000000", action: "flag_review", severity: "high", enabled: true },
    { ruleCode: "AML-002", name: "Structuring Detection", category: "aml", description: "Detect multiple transactions just below reporting threshold within 24h", threshold: "500000", action: "flag_review", severity: "critical", enabled: true },
    { ruleCode: "KYC-001", name: "KYC Tier Enforcement", category: "kyc", description: "Enforce transaction limits based on KYC verification tier", threshold: "0", action: "block", severity: "high", enabled: true },
    { ruleCode: "SANC-001", name: "Sanctions Screening", category: "sanctions", description: "Screen all parties against OFAC, EU, UN sanctions lists", threshold: "0", action: "block", severity: "critical", enabled: true },
  ]).onConflictDoNothing();

  // ─── IoT Devices ──────────────────────────────────────────────
  await db.insert(iotDevices).values([
    { deviceId: "IOT-001", farmId: 1, type: "soil_moisture", model: "SoilSense Pro 3000", firmware: "v2.1.4", status: "active", lastSeen: new Date(), metadata: { calibrationDate: "2025-12-01", batteryLevel: 87 } },
    { deviceId: "IOT-002", farmId: 1, type: "temperature", model: "TempGuard X1", firmware: "v1.8.2", status: "active", lastSeen: new Date(), metadata: { calibrationDate: "2025-11-15", batteryLevel: 92 } },
    { deviceId: "IOT-003", farmId: 2, type: "humidity", model: "HumidAir 500", firmware: "v3.0.1", status: "active", lastSeen: new Date(), metadata: { calibrationDate: "2025-10-20", batteryLevel: 78 } },
    { deviceId: "IOT-004", farmId: 2, type: "ph_level", model: "pHSensor Pro", firmware: "v1.5.0", status: "active", lastSeen: new Date(), metadata: { calibrationDate: "2025-09-10", batteryLevel: 65 } },
    { deviceId: "IOT-005", farmId: 3, type: "water_level", model: "AquaLevel Ultra", firmware: "v2.3.1", status: "active", lastSeen: new Date(), metadata: { calibrationDate: "2025-11-01", batteryLevel: 95 } },
  ]).onConflictDoNothing();

  // ─── Market Prices ────────────────────────────────────────────
  await db.insert(marketPrices).values([
    { commodity: "Maize", market: "Nairobi", region: "Central Kenya", price: "4500", currency: "KES", unit: "100kg", priceDate: new Date(), source: "EAGC" },
    { commodity: "Coffee (Arabica)", market: "Nairobi", region: "Central Kenya", price: "35000", currency: "KES", unit: "60kg", priceDate: new Date(), source: "NCE" },
    { commodity: "Beans", market: "Nairobi", region: "Central Kenya", price: "12000", currency: "KES", unit: "90kg", priceDate: new Date(), source: "EAGC" },
    { commodity: "Wheat", market: "Nairobi", region: "Rift Valley", price: "5500", currency: "KES", unit: "90kg", priceDate: new Date(), source: "NCPB" },
    { commodity: "Rice", market: "Mwea", region: "Central Kenya", price: "12000", currency: "KES", unit: "50kg", priceDate: new Date(), source: "NCPB" },
    { commodity: "Cocoa", market: "Lagos", region: "Lagos State", price: "250000", currency: "NGN", unit: "tonne", priceDate: new Date(), source: "NCCF" },
    { commodity: "Cashew", market: "Lagos", region: "Lagos State", price: "180000", currency: "NGN", unit: "tonne", priceDate: new Date(), source: "NEPC" },
    { commodity: "Tea", market: "Mombasa", region: "Coastal Kenya", price: "28000", currency: "KES", unit: "chest", priceDate: new Date(), source: "KTDA" },
  ]).onConflictDoNothing();

  // ─── Chama Groups ─────────────────────────────────────────────
  await db.insert(chamaGroups).values([
    { name: "Kilimo Bora Savings", region: "Kiambu", memberCount: 25, totalSavings: "2500000", targetAmount: "5000000", investmentStrategy: "balanced", meetingDay: "Saturday", status: "active" },
    { name: "Umoja Farmers Group", region: "Nakuru", memberCount: 18, totalSavings: "1800000", targetAmount: "3000000", investmentStrategy: "conservative", meetingDay: "Sunday", status: "active" },
    { name: "Mashamba Digital", region: "Meru", memberCount: 30, totalSavings: "3200000", targetAmount: "6000000", investmentStrategy: "aggressive", meetingDay: "Saturday", status: "active" },
    { name: "Vijana Agri Savings", region: "Kisumu", memberCount: 15, totalSavings: "850000", targetAmount: "2000000", investmentStrategy: "balanced", meetingDay: "Friday", status: "active" },
  ]).onConflictDoNothing();

  // ─── Federated Models ─────────────────────────────────────────
  await db.insert(federatedModels).values([
    { name: "Crop Disease Detection v3", modelType: "image_classification", status: "training", participantCount: 145, accuracy: "0.89", currentRound: 12, totalRounds: 50, privacyBudget: "3.0" },
    { name: "Yield Prediction Regional", modelType: "regression", status: "active", participantCount: 230, accuracy: "0.85", currentRound: 50, totalRounds: 50, privacyBudget: "5.0" },
    { name: "Soil Health Assessment", modelType: "multi_class", status: "active", participantCount: 98, accuracy: "0.82", currentRound: 35, totalRounds: 40, privacyBudget: "2.5" },
    { name: "Market Price Forecasting", modelType: "time_series", status: "training", participantCount: 178, accuracy: "0.78", currentRound: 8, totalRounds: 30, privacyBudget: "4.0" },
    { name: "Pest Early Warning", modelType: "anomaly_detection", status: "active", participantCount: 67, accuracy: "0.91", currentRound: 25, totalRounds: 25, privacyBudget: "2.0" },
  ]).onConflictDoNothing();

  // ─── Export Shipments ─────────────────────────────────────────
  await db.insert(exportShipments).values([
    { shipmentCode: "EXP-2025-001", commodity: "Coffee", origin: "Kenya", destination: "Germany", quantity: "20000", unit: "kg", status: "in_transit", exporterId: 1, blockchainHash: "0xabc123", shippingMethod: "sea_freight", estimatedArrival: new Date("2026-07-15") },
    { shipmentCode: "EXP-2025-002", commodity: "Cocoa", origin: "Nigeria", destination: "Netherlands", quantity: "50000", unit: "kg", status: "customs_cleared", exporterId: 2, blockchainHash: "0xdef456", shippingMethod: "sea_freight", estimatedArrival: new Date("2026-06-30") },
    { shipmentCode: "EXP-2025-003", commodity: "Avocados", origin: "Kenya", destination: "UAE", quantity: "8000", unit: "kg", status: "loading", exporterId: 1, shippingMethod: "air_freight", estimatedArrival: new Date("2026-06-10") },
  ]).onConflictDoNothing();

  // ─── Pipeline Jobs ────────────────────────────────────────────
  await db.insert(pipelineJobs).values([
    { jobCode: "ETL-FARM-DATA", name: "Farm Data Ingestion", sourceType: "postgresql", destinationType: "lakehouse_bronze", schedule: "0 */6 * * *", status: "active", lastRunAt: new Date(), recordsProcessed: 125000, avgDurationMs: 45000 },
    { jobCode: "ETL-MARKET-PRICES", name: "Market Price Sync", sourceType: "api", destinationType: "lakehouse_silver", schedule: "*/15 * * * *", status: "active", lastRunAt: new Date(), recordsProcessed: 8500, avgDurationMs: 12000 },
    { jobCode: "ETL-IOT-READINGS", name: "IoT Sensor Aggregation", sourceType: "kafka", destinationType: "lakehouse_bronze", schedule: "*/5 * * * *", status: "active", lastRunAt: new Date(), recordsProcessed: 500000, avgDurationMs: 30000 },
    { jobCode: "ETL-WEATHER", name: "Weather Data Pipeline", sourceType: "api", destinationType: "lakehouse_silver", schedule: "0 */3 * * *", status: "active", lastRunAt: new Date(), recordsProcessed: 3200, avgDurationMs: 8000 },
    { jobCode: "ML-FEATURE-STORE", name: "ML Feature Engineering", sourceType: "lakehouse_silver", destinationType: "lakehouse_gold", schedule: "0 2 * * *", status: "active", lastRunAt: new Date(), recordsProcessed: 75000, avgDurationMs: 180000 },
    { jobCode: "REPORT-DAILY", name: "Daily Report Generation", sourceType: "lakehouse_gold", destinationType: "reporting", schedule: "0 6 * * *", status: "active", lastRunAt: new Date(), recordsProcessed: 50, avgDurationMs: 60000 },
    { jobCode: "BACKUP-INCREMENTAL", name: "Incremental Backup", sourceType: "postgresql", destinationType: "s3", schedule: "0 */12 * * *", status: "active", lastRunAt: new Date(), recordsProcessed: 0, avgDurationMs: 90000 },
  ]).onConflictDoNothing();

  // ─── Digital Twins ────────────────────────────────────────────
  await db.insert(digitalTwins).values([
    { farmId: 1, name: "Kiambu Smart Farm", modelVersion: "2.1", lastSyncAt: new Date(), sensorCount: 8, zoneCount: 4, healthScore: 87, metadata: { soilType: "volcanic_loam", irrigation: "drip", elevation: 1780 } },
    { farmId: 2, name: "Nakuru Grain Estate", modelVersion: "2.0", lastSyncAt: new Date(), sensorCount: 12, zoneCount: 6, healthScore: 92, metadata: { soilType: "red_clay", irrigation: "center_pivot", elevation: 1850 } },
    { farmId: 3, name: "Meru Coffee Plantation", modelVersion: "1.8", lastSyncAt: new Date(), sensorCount: 5, zoneCount: 3, healthScore: 78, metadata: { soilType: "andosol", irrigation: "rain_fed", elevation: 1500 } },
  ]).onConflictDoNothing();

  // ─── Retail Stores ────────────────────────────────────────────
  await db.insert(retailStores).values([
    { storeCode: "RS-001", name: "FarmConnect Nairobi Hub", location: "Westlands, Nairobi", region: "Central Kenya", type: "hub", status: "active", managerName: "Jane Wanjiku", contactPhone: "+254712345678", operatingHours: "Mon-Sat 7:00-19:00" },
    { storeCode: "RS-002", name: "Kilimo Fresh Market", location: "Thika Road, Nairobi", region: "Central Kenya", type: "retail", status: "active", managerName: "Peter Ochieng", contactPhone: "+254723456789", operatingHours: "Daily 6:00-20:00" },
    { storeCode: "RS-003", name: "Lagos Agri Store", location: "Ikeja, Lagos", region: "Lagos State", type: "wholesale", status: "active", managerName: "Adebayo Oluwaseun", contactPhone: "+2348034567890", operatingHours: "Mon-Sat 8:00-18:00" },
  ]).onConflictDoNothing();

  // ─── Soil Samples ─────────────────────────────────────────────
  await db.insert(soilSamples).values([
    { farmId: 1, sampleCode: "SS-2025-001", collectionDate: new Date("2025-12-01"), ph: "6.5", nitrogen: "45", phosphorus: "22", potassium: "180", organicMatter: "3.2", texture: "loam", latitude: "-1.17", longitude: "36.95", depth: "30", recommendations: ["Apply 50kg/ha DAP", "Add compost 2t/ha"] },
    { farmId: 2, sampleCode: "SS-2025-002", collectionDate: new Date("2025-11-15"), ph: "5.8", nitrogen: "32", phosphorus: "15", potassium: "120", organicMatter: "2.1", texture: "clay_loam", latitude: "-0.28", longitude: "36.07", depth: "30", recommendations: ["Apply lime 1t/ha", "Increase nitrogen with CAN 100kg/ha"] },
    { farmId: 3, sampleCode: "SS-2025-003", collectionDate: new Date("2025-10-20"), ph: "7.1", nitrogen: "55", phosphorus: "30", potassium: "200", organicMatter: "4.5", texture: "sandy_loam", latitude: "0.05", longitude: "37.65", depth: "25", recommendations: ["Maintain current regime", "Consider micronutrient foliar spray"] },
  ]).onConflictDoNothing();

  console.log("Platform extended tables seeded successfully.");
}

seedPlatformExtendedTables().catch(console.error);
