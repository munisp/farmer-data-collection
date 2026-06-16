/**
 * Platform Extensions Schema
 * DB tables for domains that were previously using in-memory mock data.
 * Covers: contract farming, warehouse receipts, API developer portal,
 * decentralized identity, digital twins, supply-demand matching,
 * tokenized assets, parametric insurance, P2P lending, cooperative governance,
 * input financing, extension services, government integration, weather,
 * CEA/indoor farming AI.
 */

import {
  pgTable, serial, integer, varchar, text, timestamp, boolean, numeric,
  jsonb, index, uniqueIndex, pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users, farmers } from "./schema.js";

// ─── Contract Farming ───────────────────────────────────────────────
export const contractStatusEnum = pgEnum("contract_status", [
  "draft", "proposed", "negotiating", "active", "fulfilled", "breached", "expired", "terminated",
]);

export const farmingContracts = pgTable("farming_contracts", {
  id: serial("id").primaryKey(),
  contractCode: varchar("contract_code", { length: 30 }).notNull().unique(),
  farmerId: integer("farmer_id").notNull(),
  offtakerId: integer("offtaker_id").notNull(),
  cropType: varchar("crop_type", { length: 50 }).notNull(),
  variety: varchar("variety", { length: 100 }),
  quantityKg: numeric("quantity_kg", { precision: 12, scale: 2 }).notNull(),
  pricePerKg: numeric("price_per_kg", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("NGN"),
  qualityGrade: varchar("quality_grade", { length: 10 }).notNull().default("A"),
  deliveryDate: timestamp("delivery_date").notNull(),
  deliveryLocation: varchar("delivery_location", { length: 200 }).notNull(),
  status: contractStatusEnum("status").notNull().default("draft"),
  penaltyClause: jsonb("penalty_clause"),
  bonusClause: jsonb("bonus_clause"),
  escrowId: varchar("escrow_id", { length: 50 }),
  insuranceLinked: boolean("insurance_linked").default(false),
  totalValue: numeric("total_value", { precision: 15, scale: 2 }),
  deliveredKg: numeric("delivered_kg", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_farming_contracts_farmer").on(table.farmerId),
  index("idx_farming_contracts_offtaker").on(table.offtakerId),
  index("idx_farming_contracts_status").on(table.status),
]);

export const offtakers = pgTable("offtakers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  crops: jsonb("crops").notNull().default([]),
  regions: jsonb("regions").notNull().default([]),
  rating: numeric("rating", { precision: 3, scale: 1 }).default("0"),
  contractsCompleted: integer("contracts_completed").default(0),
  contactEmail: varchar("contact_email", { length: 200 }),
  contactPhone: varchar("contact_phone", { length: 30 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── API Developer Portal ───────────────────────────────────────────
export const apiKeyStatusEnum = pgEnum("api_key_status", ["active", "revoked", "expired"]);

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  keyHash: varchar("key_hash", { length: 128 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 12 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  tier: varchar("tier", { length: 30 }).notNull().default("free"),
  rateLimit: integer("rate_limit").notNull().default(1000),
  status: apiKeyStatusEnum("status").notNull().default("active"),
  scopes: jsonb("scopes").notNull().default([]),
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_api_keys_user").on(table.userId),
  uniqueIndex("idx_api_keys_hash").on(table.keyHash),
]);

export const apiWebhooks = pgTable("api_webhooks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  events: jsonb("events").notNull().default([]),
  secretHash: varchar("secret_hash", { length: 128 }),
  isActive: boolean("is_active").default(true),
  failureCount: integer("failure_count").default(0),
  lastDeliveredAt: timestamp("last_delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_api_webhooks_user").on(table.userId),
]);

// ─── Decentralized Identity (DID/VC) ────────────────────────────────
export const didDocuments = pgTable("did_documents", {
  id: serial("id").primaryKey(),
  did: varchar("did", { length: 200 }).notNull().unique(),
  userId: integer("user_id").notNull(),
  method: varchar("method", { length: 50 }).notNull().default("did:web"),
  publicKeyMultibase: text("public_key_multibase"),
  verificationMethods: jsonb("verification_methods").notNull().default([]),
  serviceEndpoints: jsonb("service_endpoints").default([]),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_did_user").on(table.userId),
]);

export const verifiableCredentials = pgTable("verifiable_credentials", {
  id: serial("id").primaryKey(),
  credentialId: varchar("credential_id", { length: 100 }).notNull().unique(),
  issuerDid: varchar("issuer_did", { length: 200 }).notNull(),
  subjectDid: varchar("subject_did", { length: 200 }).notNull(),
  credentialType: varchar("credential_type", { length: 100 }).notNull(),
  claims: jsonb("claims").notNull(),
  proof: jsonb("proof"),
  issuanceDate: timestamp("issuance_date").defaultNow().notNull(),
  expirationDate: timestamp("expiration_date"),
  isRevoked: boolean("is_revoked").default(false),
  revocationReason: varchar("revocation_reason", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_vc_issuer").on(table.issuerDid),
  index("idx_vc_subject").on(table.subjectDid),
  index("idx_vc_type").on(table.credentialType),
]);

// ─── Parametric Insurance ───────────────────────────────────────────
export const insurancePolicies = pgTable("insurance_policies", {
  id: serial("id").primaryKey(),
  policyCode: varchar("policy_code", { length: 30 }).notNull().unique(),
  farmerId: integer("farmer_id").notNull(),
  farmId: integer("farm_id"),
  policyType: varchar("policy_type", { length: 50 }).notNull(),
  coverageAmount: numeric("coverage_amount", { precision: 15, scale: 2 }).notNull(),
  premiumAmount: numeric("premium_amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("NGN"),
  triggerConditions: jsonb("trigger_conditions").notNull(),
  parameters: jsonb("parameters"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  dataSource: varchar("data_source", { length: 100 }),
  payoutHistory: jsonb("payout_history").default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_insurance_farmer").on(table.farmerId),
  index("idx_insurance_status").on(table.status),
]);

// ─── P2P Lending & Savings ──────────────────────────────────────────
export const p2pLoans = pgTable("p2p_loans", {
  id: serial("id").primaryKey(),
  loanCode: varchar("loan_code", { length: 30 }).notNull().unique(),
  borrowerId: integer("borrower_id").notNull(),
  lenderId: integer("lender_id"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  interestRate: numeric("interest_rate", { precision: 5, scale: 2 }).notNull(),
  termMonths: integer("term_months").notNull(),
  purpose: varchar("purpose", { length: 200 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  collateralType: varchar("collateral_type", { length: 100 }),
  collateralValue: numeric("collateral_value", { precision: 15, scale: 2 }),
  disbursedAt: timestamp("disbursed_at"),
  repaidAt: timestamp("repaid_at"),
  monthlyPayment: numeric("monthly_payment", { precision: 12, scale: 2 }),
  totalRepaid: numeric("total_repaid", { precision: 15, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_p2p_borrower").on(table.borrowerId),
  index("idx_p2p_lender").on(table.lenderId),
  index("idx_p2p_status").on(table.status),
]);

export const savingsCircles = pgTable("savings_circles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("rotating"),
  contributionAmount: numeric("contribution_amount", { precision: 12, scale: 2 }).notNull(),
  frequency: varchar("frequency", { length: 30 }).notNull().default("monthly"),
  currency: varchar("currency", { length: 10 }).notNull().default("NGN"),
  memberCount: integer("member_count").default(0),
  currentRound: integer("current_round").default(1),
  totalPooled: numeric("total_pooled", { precision: 15, scale: 2 }).default("0"),
  isActive: boolean("is_active").default(true),
  rules: jsonb("rules").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Tokenized Agricultural Assets ──────────────────────────────────
export const tokenizedAssets = pgTable("tokenized_assets", {
  id: serial("id").primaryKey(),
  tokenCode: varchar("token_code", { length: 30 }).notNull().unique(),
  assetType: varchar("asset_type", { length: 50 }).notNull(),
  assetName: varchar("asset_name", { length: 200 }).notNull(),
  description: text("description"),
  totalSupply: integer("total_supply").notNull(),
  availableSupply: integer("available_supply").notNull(),
  pricePerToken: numeric("price_per_token", { precision: 12, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("NGN"),
  underlyingAssetId: integer("underlying_asset_id"),
  farmId: integer("farm_id"),
  yieldRate: numeric("yield_rate", { precision: 5, scale: 2 }),
  maturityDate: timestamp("maturity_date"),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_token_type").on(table.assetType),
  index("idx_token_status").on(table.status),
]);

export const tokenHoldings = pgTable("token_holdings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  tokenId: integer("token_id").notNull(),
  quantity: integer("quantity").notNull(),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 4 }).notNull(),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
}, (table) => [
  index("idx_holdings_user").on(table.userId),
  index("idx_holdings_token").on(table.tokenId),
]);

// ─── Input Financing ────────────────────────────────────────────────
export const inputFinancingApplications = pgTable("input_financing_applications", {
  id: serial("id").primaryKey(),
  applicationCode: varchar("application_code", { length: 30 }).notNull().unique(),
  farmerId: integer("farmer_id").notNull(),
  inputType: varchar("input_type", { length: 50 }).notNull(),
  inputDescription: varchar("input_description", { length: 300 }).notNull(),
  supplierId: integer("supplier_id"),
  requestedAmount: numeric("requested_amount", { precision: 12, scale: 2 }).notNull(),
  approvedAmount: numeric("approved_amount", { precision: 12, scale: 2 }),
  currency: varchar("currency", { length: 10 }).notNull().default("NGN"),
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  repaymentSchedule: jsonb("repayment_schedule"),
  harvestLinked: boolean("harvest_linked").default(false),
  seasonId: varchar("season_id", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_input_fin_farmer").on(table.farmerId),
  index("idx_input_fin_status").on(table.status),
]);

// ─── Extension Services ─────────────────────────────────────────────
export const extensionPrograms = pgTable("extension_programs", {
  id: serial("id").primaryKey(),
  programCode: varchar("program_code", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).notNull(),
  targetCrops: jsonb("target_crops").default([]),
  targetRegions: jsonb("target_regions").default([]),
  deliveryMethod: varchar("delivery_method", { length: 50 }).notNull().default("in_person"),
  curriculum: jsonb("curriculum").default([]),
  enrollmentCount: integer("enrollment_count").default(0),
  maxCapacity: integer("max_capacity"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: varchar("status", { length: 30 }).notNull().default("planned"),
  partnerId: integer("partner_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ext_program_category").on(table.category),
  index("idx_ext_program_status").on(table.status),
]);

export const extensionVisits = pgTable("extension_visits", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull(),
  agentId: integer("agent_id").notNull(),
  farmerId: integer("farmer_id").notNull(),
  visitDate: timestamp("visit_date").notNull(),
  visitType: varchar("visit_type", { length: 50 }).notNull(),
  topics: jsonb("topics").default([]),
  recommendations: jsonb("recommendations").default([]),
  feedback: text("feedback"),
  followUpDate: timestamp("follow_up_date"),
  gpsLocation: jsonb("gps_location"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ext_visit_program").on(table.programId),
  index("idx_ext_visit_farmer").on(table.farmerId),
]);

// ─── Government Integration ─────────────────────────────────────────
export const governmentPrograms = pgTable("government_programs", {
  id: serial("id").primaryKey(),
  programCode: varchar("program_code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 300 }).notNull(),
  ministry: varchar("ministry", { length: 200 }).notNull(),
  country: varchar("country", { length: 10 }).notNull().default("NG"),
  description: text("description"),
  budgetAllocated: numeric("budget_allocated", { precision: 18, scale: 2 }),
  budgetDisbursed: numeric("budget_disbursed", { precision: 18, scale: 2 }).default("0"),
  beneficiaryCount: integer("beneficiary_count").default(0),
  eligibilityCriteria: jsonb("eligibility_criteria").default({}),
  applicationDeadline: timestamp("application_deadline"),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_gov_program_ministry").on(table.ministry),
  index("idx_gov_program_country").on(table.country),
]);

export const governmentBeneficiaries = pgTable("government_beneficiaries", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull(),
  farmerId: integer("farmer_id").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("applied"),
  applicationDate: timestamp("application_date").defaultNow().notNull(),
  approvedDate: timestamp("approved_date"),
  disbursementAmount: numeric("disbursement_amount", { precision: 12, scale: 2 }),
  disbursementDate: timestamp("disbursement_date"),
  verificationData: jsonb("verification_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_gov_ben_program").on(table.programId),
  index("idx_gov_ben_farmer").on(table.farmerId),
]);

// ─── Cooperative Governance ─────────────────────────────────────────
export const governanceProposals = pgTable("governance_proposals", {
  id: serial("id").primaryKey(),
  cooperativeId: integer("cooperative_id").notNull(),
  proposerId: integer("proposer_id").notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("open"),
  votesFor: integer("votes_for").default(0),
  votesAgainst: integer("votes_against").default(0),
  votesAbstain: integer("votes_abstain").default(0),
  quorumRequired: integer("quorum_required").default(50),
  deadline: timestamp("deadline").notNull(),
  outcome: varchar("outcome", { length: 30 }),
  implementedAt: timestamp("implemented_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_proposal_coop").on(table.cooperativeId),
  index("idx_proposal_status").on(table.status),
]);

export const governanceVotes = pgTable("governance_votes", {
  id: serial("id").primaryKey(),
  proposalId: integer("proposal_id").notNull(),
  memberId: integer("member_id").notNull(),
  vote: varchar("vote", { length: 10 }).notNull(),
  reason: text("reason"),
  votedAt: timestamp("voted_at").defaultNow().notNull(),
}, (table) => [
  index("idx_vote_proposal").on(table.proposalId),
  uniqueIndex("idx_vote_unique").on(table.proposalId, table.memberId),
]);

// ─── Supply-Demand Matching ─────────────────────────────────────────
export const supplyListings = pgTable("supply_listings", {
  id: serial("id").primaryKey(),
  farmerId: integer("farmer_id").notNull(),
  cropType: varchar("crop_type", { length: 50 }).notNull(),
  variety: varchar("variety", { length: 100 }),
  quantityKg: numeric("quantity_kg", { precision: 12, scale: 2 }).notNull(),
  pricePerKg: numeric("price_per_kg", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("NGN"),
  availableFrom: timestamp("available_from").notNull(),
  availableUntil: timestamp("available_until"),
  location: varchar("location", { length: 200 }).notNull(),
  qualityGrade: varchar("quality_grade", { length: 10 }),
  certifications: jsonb("certifications").default([]),
  isActive: boolean("is_active").default(true),
  matchedDemandId: integer("matched_demand_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_supply_farmer").on(table.farmerId),
  index("idx_supply_crop").on(table.cropType),
  index("idx_supply_active").on(table.isActive),
]);

export const demandListings = pgTable("demand_listings", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull(),
  cropType: varchar("crop_type", { length: 50 }).notNull(),
  variety: varchar("variety", { length: 100 }),
  quantityKg: numeric("quantity_kg", { precision: 12, scale: 2 }).notNull(),
  maxPricePerKg: numeric("max_price_per_kg", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("NGN"),
  requiredBy: timestamp("required_by").notNull(),
  deliveryLocation: varchar("delivery_location", { length: 200 }).notNull(),
  qualityRequirements: jsonb("quality_requirements").default({}),
  isActive: boolean("is_active").default(true),
  matchedSupplyId: integer("matched_supply_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_demand_buyer").on(table.buyerId),
  index("idx_demand_crop").on(table.cropType),
]);

export const supplyDemandMatches = pgTable("supply_demand_matches", {
  id: serial("id").primaryKey(),
  supplyId: integer("supply_id").notNull(),
  demandId: integer("demand_id").notNull(),
  matchScore: numeric("match_score", { precision: 5, scale: 2 }).notNull(),
  agreedPrice: numeric("agreed_price", { precision: 10, scale: 2 }),
  agreedQuantity: numeric("agreed_quantity", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 30 }).notNull().default("proposed"),
  contractId: integer("contract_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_match_supply").on(table.supplyId),
  index("idx_match_demand").on(table.demandId),
]);

// ─── CEA / Indoor Farming ───────────────────────────────────────────
export const indoorFarms = pgTable("indoor_farms", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  ownerId: integer("owner_id").notNull(),
  farmType: varchar("farm_type", { length: 50 }).notNull(),
  growSystem: varchar("grow_system", { length: 50 }).notNull(),
  squareMeters: numeric("square_meters", { precision: 10, scale: 2 }),
  rackLevels: integer("rack_levels"),
  lightingType: varchar("lighting_type", { length: 50 }),
  climateControlled: boolean("climate_controlled").default(true),
  location: varchar("location", { length: 200 }).notNull(),
  environmentParams: jsonb("environment_params").default({}),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_indoor_farm_owner").on(table.ownerId),
]);

export const growRecipes = pgTable("grow_recipes", {
  id: serial("id").primaryKey(),
  cropType: varchar("crop_type", { length: 50 }).notNull(),
  recipeName: varchar("recipe_name", { length: 200 }).notNull(),
  lightHoursPerDay: numeric("light_hours_per_day", { precision: 4, scale: 1 }),
  temperatureMinC: numeric("temperature_min_c", { precision: 4, scale: 1 }),
  temperatureMaxC: numeric("temperature_max_c", { precision: 4, scale: 1 }),
  humidityMinPct: numeric("humidity_min_pct", { precision: 4, scale: 1 }),
  humidityMaxPct: numeric("humidity_max_pct", { precision: 4, scale: 1 }),
  nutrientSolution: jsonb("nutrient_solution"),
  phMin: numeric("ph_min", { precision: 3, scale: 1 }),
  phMax: numeric("ph_max", { precision: 3, scale: 1 }),
  growthDays: integer("growth_days"),
  expectedYieldKgPerSqm: numeric("expected_yield_kg_per_sqm", { precision: 6, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_grow_recipe_crop").on(table.cropType),
]);

// ─── Weather Extended ───────────────────────────────────────────────
export const weatherForecasts = pgTable("weather_forecasts", {
  id: serial("id").primaryKey(),
  stationId: integer("station_id"),
  latitude: numeric("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: numeric("longitude", { precision: 9, scale: 6 }).notNull(),
  forecastDate: timestamp("forecast_date").notNull(),
  temperatureHighC: numeric("temperature_high_c", { precision: 4, scale: 1 }),
  temperatureLowC: numeric("temperature_low_c", { precision: 4, scale: 1 }),
  precipitationMm: numeric("precipitation_mm", { precision: 6, scale: 1 }),
  humidityPct: numeric("humidity_pct", { precision: 4, scale: 1 }),
  windSpeedKmh: numeric("wind_speed_kmh", { precision: 5, scale: 1 }),
  condition: varchar("condition", { length: 50 }),
  source: varchar("source", { length: 50 }).notNull().default("openweather"),
  confidence: numeric("confidence", { precision: 4, scale: 2 }),
  advisoryText: text("advisory_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_weather_forecast_date").on(table.forecastDate),
  index("idx_weather_forecast_station").on(table.stationId),
]);
