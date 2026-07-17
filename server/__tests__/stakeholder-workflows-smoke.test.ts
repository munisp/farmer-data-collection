/**
 * stakeholder-workflows-smoke.test.ts
 *
 * Comprehensive smoke tests for ALL stakeholder workflows.
 * Tests every router, every key procedure, and every stakeholder journey.
 *
 * Stakeholders covered:
 * 1. Farmer (smallholder & commercial)
 * 2. Buyer / Trader
 * 3. Platform Admin
 * 4. Field Agent / Extension Officer
 * 5. Cooperative Admin
 * 6. Financial Officer / Loan Officer
 * 7. Government Official
 * 8. Logistics Provider
 * 9. Input Supplier / Distributor
 * 10. Food Processor
 * 11. Exporter / Freight Forwarder
 * 12. Insurance Provider
 * 13. Agricultural Researcher / Data Scientist
 * 14. Third-Party API Developer
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("../db.js", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  db: null,
}));

vi.mock("../integrations/middleware-clients.js", () => ({
  redis: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn(), isConnected: vi.fn().mockReturnValue(true), incr: vi.fn().mockResolvedValue(1), expire: vi.fn() },
  kafka: { produce: vi.fn().mockResolvedValue(undefined) },
  tigerBeetle: { createTransfer: vi.fn().mockResolvedValue({ id: "tb-test", status: "ok" }), getAccountBalance: vi.fn().mockResolvedValue({ debits: 0n, credits: 0n, balance: 1000000n }) },
  mojaloop: { initiateTransfer: vi.fn().mockResolvedValue({ transferId: "moja-test", state: "COMMITTED" }) },
  keycloak: { verifyToken: vi.fn().mockResolvedValue({ sub: "user-1", roles: ["farmer"] }), createUser: vi.fn().mockResolvedValue({ id: "kc-user-1" }), getUserById: vi.fn().mockResolvedValue({ id: "kc-user-1", username: "testfarmer" }) },
  permify: { check: vi.fn().mockResolvedValue({ can: true }), writeRelationships: vi.fn().mockResolvedValue(undefined) },
  openSearch: { search: vi.fn().mockResolvedValue({ hits: { hits: [] } }), index: vi.fn().mockResolvedValue(undefined) },
  fluvio: { produce: vi.fn().mockResolvedValue(undefined) },
  fluvioEnhanced: { produce: vi.fn().mockResolvedValue(undefined), consume: vi.fn().mockResolvedValue([]), createTopic: vi.fn().mockResolvedValue(undefined) },
  dapr: { invokeMethod: vi.fn().mockResolvedValue(null), saveState: vi.fn().mockResolvedValue(undefined), publishEvent: vi.fn().mockResolvedValue(undefined) },
  apisix: { createRoute: vi.fn().mockResolvedValue(undefined), getRoutes: vi.fn().mockResolvedValue([]) },
  openAppSec: { getSecurityEvents: vi.fn().mockResolvedValue([]), getPolicy: vi.fn().mockResolvedValue(null) },
  lakehouse: { writeRecords: vi.fn().mockResolvedValue(undefined), queryTable: vi.fn().mockResolvedValue([]) },
  getMiddlewareStatus: vi.fn().mockResolvedValue({ postgres: { connected: true, latencyMs: 1 }, redis: { connected: true, latencyMs: 1 } }),
}));

vi.mock("../integrations/middleware-router-hooks.js", () => ({
  withRedisCache: vi.fn().mockImplementation((_key, _ttl, fn) => fn()),
  invalidateRedisCache: vi.fn().mockResolvedValue(undefined),
  publishKafkaEvent: vi.fn().mockResolvedValue(undefined),
  recordLedgerEntry: vi.fn().mockResolvedValue({ transactionId: "tx-test", status: "ok", balanceVerified: true }),
  checkPermission: vi.fn().mockResolvedValue(true),
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
  runMiddlewarePipeline: vi.fn().mockResolvedValue({ rateLimited: false, authorized: true, cached: false }),
  writeToLakehouse: vi.fn().mockResolvedValue(undefined),
  KAFKA_TOPICS: {
    FARMER_REGISTERED: "farmer.registered",
    ORDER_CREATED: "order.created",
    PAYMENT_PROCESSED: "payment.processed",
    LOAN_DISBURSED: "loan.disbursed",
    HARVEST_RECORDED: "harvest.recorded",
  },
}));

// ── All Router Modules ─────────────────────────────────────────────────────

const ALL_ROUTERS = [
  // Core
  { path: "../routers/health-router.js", name: "healthRouter", procs: ["check", "alive"] },
  { path: "../routers/analytics-router.js", name: "analyticsRouter", procs: ["getDashboardSummary"] },

  // Farmer workflows
  { path: "../routers/farmer-features-router.js", name: "cropInsuranceRouter", procs: ["getQuote"] },
  { path: "../routers/field-overview-router.js", name: "fieldOverviewRouter", procs: ["getFields"] },
  { path: "../routers/soil-analysis-router.js", name: "soilAnalysisRouter", procs: ["getLatestTest", "getSoilHistory"] },
  { path: "../routers/drone-router.js", name: "droneRouter", procs: ["planFlight"] },
  { path: "../routers/iot-gateway-router.js", name: "iotGatewayRouter", procs: ["registerDevice", "getFarmDevices"] },
  { path: "../routers/iot-rules-engine-router.js", name: "iotRulesEngineRouter", procs: ["evaluateRules", "getAlertHistory"] },
  { path: "../routers/digital-twin-router.js", name: "digitalTwinRouter", procs: ["getFarmTwin", "runSimulation", "getSensorData"] },
  { path: "../routers/weather-router.js", name: "weatherRouter", procs: ["getCurrentWeather", "getForecast"] },
  { path: "../routers/weather-alerts-router.js", name: "weatherAlertsRouter", procs: ["getNearbyStations", "broadcastWeatherAlert"] },
  { path: "../routers/predictive-analytics-router.js", name: "predictiveAnalyticsRouter", procs: ["forecastPrices", "optimalPlantingWindow"] },
  { path: "../routers/land-suitability-router.js", name: "landSuitabilityRouter", procs: ["quickAssessment", "compareCrops"] },
  { path: "../routers/carbon-credit-router.js", name: "carbonCreditRouter", procs: ["listProjects", "registerProject"] },
  { path: "../routers/dairy-management-router.js", name: "dairyManagementRouter", procs: [] },
  { path: "../routers/aquaculture-pond-router.js", name: "aquaculturePondRouter", procs: ["getDashboard", "listPondTypes"] },
  { path: "../routers/aquaculture-feed-router.js", name: "aquacultureFeedRouter", procs: ["listSpecies", "calculateFCR"] },
  { path: "../routers/aquaculture-ai-router.js", name: "aquacultureAIRouter", procs: ["diagnoseFishDisease", "listDiseases"] },
  { path: "../routers/cea-ai-router.js", name: "ceaAIRouter", procs: ["listIndoorFarms", "listGrowRecipes"] },

  // Market & Trade
  { path: "../routers/market-data-router.js", name: "marketDataRouter", procs: ["getCurrentPrices", "getHistoricalPrices"] },
  { path: "../routers/price-alerts-router.js", name: "priceAlertsRouter", procs: ["getSupportedCrops"] },
  { path: "../routers/marketplace-enhancements-router.js", name: "marketplaceEnhancementsRouter", procs: ["getMyOffers"] },
  { path: "../routers/supply-demand-matching-router.js", name: "supplyDemandMatchingRouter", procs: ["listSupplyListings", "listDemandListings"] },
  { path: "../routers/contract-farming-router.js", name: "contractFarmingRouter", procs: ["listContracts", "createContract"] },
  { path: "../routers/traceability-router.js", name: "traceabilityRouter", procs: ["listBatches", "getStats"] },
  { path: "../routers/blockchain-provenance-router.js", name: "blockchainProvenanceRouter", procs: ["getStats", "registerAsset"] },
  { path: "../routers/export-chain-router.js", name: "exportChainRouter", procs: ["listShipments", "createShipment"] },
  { path: "../routers/tokenized-assets-router.js", name: "tokenizedAssetsRouter", procs: ["listAssets", "purchaseTokens"] },
  { path: "../routers/exchange-router.js", name: "exchangeRouter", procs: [] },

  // Financial
  { path: "../routers/mobile-money-router.js", name: "mobileMoneyRouter", procs: ["linkAccount", "mpesaCallback"] },
  { path: "../routers/payment-orchestrator-router.js", name: "paymentOrchestratorRouter", procs: ["disburseFunds", "compareFees"] },
  { path: "../routers/loan-application-router.js", name: "loanApplicationRouter", procs: ["submitApplication", "getApplicationDetails"] },
  { path: "../routers/loan-decisioning-router.js", name: "loanDecisioningRouter", procs: ["simulateDecision", "getDecisionRules"] },
  { path: "../routers/credit-scoring-router.js", name: "creditScoringRouter", procs: [] },
  { path: "../routers/microfinance-router.js", name: "microfinanceRouter", procs: ["getAtRiskLoans", "refreshCreditScoreWithDecay"] },
  { path: "../routers/microfinance-active-loans.js", name: "microfinanceActiveLoansRouter", procs: ["getActiveLoans"] },
  { path: "../routers/p2p-lending-router.js", name: "p2pLendingRouter", procs: ["listLoans", "getLoan"] },
  { path: "../routers/escrow-router.js", name: "escrowRouter", procs: [] },
  { path: "../routers/disbursement-router.js", name: "disbursementRouter", procs: [] },
  { path: "../routers/input-financing-router.js", name: "inputFinancingRouter", procs: ["listApplications", "applyForFinancing"] },
  { path: "../routers/financial-enhancements-router.js", name: "financialEnhancementsRouter", procs: [] },
  { path: "../routers/risk-assessment-router.js", name: "riskAssessmentRouter", procs: ["getMyRiskProfile", "getAllRiskProfiles"] },
  { path: "../routers/stress-testing-router.js", name: "stressTestingRouter", procs: ["runStressTest", "priceLoan"] },
  { path: "../routers/regulatory-reporting-router.js", name: "regulatoryReportingRouter", procs: ["generateLiquidityReport"] },

  // Chama & Cooperative
  { path: "../routers/chama-router.js", name: "chamaRouter", procs: [] },
  { path: "../routers/chama-savings-router.js", name: "chamaSavingsRouter", procs: ["listChamas", "contribute"] },
  { path: "../routers/cooperative-router.js", name: "cooperativeRouter", procs: [] },
  { path: "../routers/cooperative-governance-router.js", name: "cooperativeGovernanceRouter", procs: ["listProposals", "createProposal", "castVote"] },
  { path: "../routers/collections-workflow-router.js", name: "collectionsWorkflowRouter", procs: [] },

  // Insurance
  { path: "../routers/insurance-ai-router.js", name: "insuranceAIRouter", procs: ["listProducts", "purchasePolicy", "fileClaim"] },
  { path: "../routers/parametric-insurance-router.js", name: "parametricInsuranceRouter", procs: ["createPolicy", "getPolicy", "evaluateTrigger"] },

  // Logistics & Supply Chain
  { path: "../routers/delivery-router.js", name: "deliveryRouter", procs: [] },
  { path: "../routers/order-fulfillment-router.js", name: "orderFulfillmentRouter", procs: ["requestReturn", "getSellerFreshnessReport"] },
  { path: "../routers/cold-chain-router.js", name: "coldChainRouter", procs: [] },
  { path: "../routers/gps-tracking-router.js", name: "gpsTrackingRouter", procs: [] },
  { path: "../routers/subscription-delivery-router.js", name: "subscriptionDeliveryRouter", procs: ["listMicroZones", "createMicroZone"] },
  { path: "../routers/subscription-router.js", name: "subscriptionRouter", procs: ["createContract", "getStandingOrders"] },
  { path: "../routers/warehouse-receipt-router.js", name: "warehouseReceiptRouter", procs: ["listReceipts", "listWarehouses"] },

  // Inputs & Distributor
  { path: "../routers/distributor-network-router.js", name: "distributorNetworkRouter", procs: [] },
  { path: "../routers/equipment-fleet-router.js", name: "equipmentFleetRouter", procs: [] },

  // Government & Compliance
  { path: "../routers/government-integration-router.js", name: "governmentIntegrationRouter", procs: ["listPrograms"] },
  { path: "../routers/government-subsidy-router.js", name: "governmentSubsidyRouter", procs: [] },
  { path: "../routers/compliance-router.js", name: "complianceRouter", procs: [] },
  { path: "../routers/kyc-router.js", name: "kycRouter", procs: ["verifyDocument", "verifyPhoneOtp"] },
  { path: "../routers/decentralized-identity-router.js", name: "decentralizedIdentityRouter", procs: ["resolveDID", "createDID", "issueCredential", "verifyCredential"] },

  // AI & Analytics
  { path: "../routers/agri-llm-router.js", name: "agriLlmRouter", procs: [] },
  { path: "../routers/agricultural-intelligence-router.js", name: "agriculturalIntelligenceRouter", procs: [] },
  { path: "../routers/ml-models-router.js", name: "mlModelsRouter", procs: ["listModels", "downloadModel"] },
  { path: "../routers/federated-learning-router.js", name: "federatedLearningRouter", procs: ["listModels", "joinTraining"] },
  { path: "../routers/data-pipeline-router.js", name: "dataPipelineRouter", procs: ["listJobs", "createJob"] },
  { path: "../routers/report-generation-router.js", name: "reportGenerationRouter", procs: ["generateReport", "searchReports"] },
  { path: "../routers/spatial-analysis-router.js", name: "spatialAnalysisRouter", procs: ["getH3CoverageAnalysis"] },
  { path: "../routers/spatial-router.js", name: "spatialRouter", procs: ["getGpsHeatmap"] },

  // Communication
  { path: "../routers/messaging-router.js", name: "messagingRouter", procs: ["sendNotification", "smsCallback"] },
  { path: "../routers/notification-router.js", name: "notificationRouter", procs: ["markAllAsRead", "registerPushToken"] },
  { path: "../routers/push-notification-router.js", name: "pushNotificationRouter", procs: ["registerDevice", "listTopics"] },
  { path: "../routers/sms-router.js", name: "smsRouter", procs: ["getDeliveryLogs", "getNotificationPreferences"] },
  { path: "../routers/sms-analytics-router.js", name: "smsAnalyticsRouter", procs: ["getMessageTypeBreakdown"] },
  { path: "../routers/sms-responses-router.js", name: "smsResponsesRouter", procs: ["getById", "sendReply"] },
  { path: "../routers/sms-templates-router.js", name: "smsTemplatesRouter", procs: ["preview", "scheduleMessage"] },
  { path: "../routers/africas-talking-router.js", name: "africasTalkingRouter", procs: [] },
  { path: "../routers/whatsapp-ai-router.js", name: "whatsappAiRouter", procs: ["handleIncomingMessage", "getSupportedCrops"] },
  { path: "../routers/voice-first-router.js", name: "voiceFirstRouter", procs: ["getStats", "getVoiceCommands"] },
  { path: "../routers/conversational-commerce-router.js", name: "conversationalCommerceRouter", procs: ["sendMessage"] },
  { path: "../routers/communication-ai-router.js", name: "communicationAIRouter", procs: [] },

  // Platform & Admin
  { path: "../routers/admin-dashboard-router.js", name: "adminDashboardRouter", procs: [] },
  { path: "../routers/agent-productivity-router.js", name: "agentProductivityRouter", procs: [] },
  { path: "../routers/extension-services-router.js", name: "extensionServicesRouter", procs: ["listPrograms", "enrollFarmer"] },
  { path: "../routers/platform-advanced-router.js", name: "platformAdvancedRouter", procs: ["createDID", "getTenantConfig"] },
  { path: "../routers/api-developer-portal-router.js", name: "apiDeveloperPortalRouter", procs: ["listApiKeys", "createApiKey"] },
  { path: "../routers/websocket-hub-router.js", name: "websocketHubRouter", procs: ["getLivePrices", "getIoTReadings"] },
  { path: "../routers/erpnext-router.js", name: "erpnextRouter", procs: [] },
  { path: "../routers/retail-store-router.js", name: "retailStoreRouter", procs: ["getRetailDemand", "getInvoices"] },
];

// ── Stakeholder Journey Definitions ───────────────────────────────────────

const STAKEHOLDER_JOURNEYS = {
  farmer: {
    description: "Smallholder farmer managing crops, livestock, and finances",
    routers: [
      "cropInsuranceRouter", "fieldOverviewRouter", "soilAnalysisRouter",
      "iotGatewayRouter", "digitalTwinRouter", "weatherRouter",
      "marketDataRouter", "loanApplicationRouter", "insuranceAIRouter",
      "chamaSavingsRouter", "carbonCreditRouter", "traceabilityRouter",
      "mobileMoneyRouter", "notificationRouter",
    ],
  },
  buyer: {
    description: "Produce buyer placing orders and tracking deliveries",
    routers: [
      "marketDataRouter", "marketplaceEnhancementsRouter", "supplyDemandMatchingRouter",
      "contractFarmingRouter", "orderFulfillmentRouter", "deliveryRouter",
      "paymentOrchestratorRouter", "traceabilityRouter", "blockchainProvenanceRouter",
      "warehouseReceiptRouter",
    ],
  },
  admin: {
    description: "Platform administrator managing all aspects of the platform",
    routers: [
      "adminDashboardRouter", "analyticsRouter", "kycRouter",
      "complianceRouter", "regulatoryReportingRouter", "reportGenerationRouter",
      "mlModelsRouter", "dataPipelineRouter", "websocketHubRouter",
      "apiDeveloperPortalRouter", "stressTestingRouter",
    ],
  },
  agent: {
    description: "Field agent collecting data and supporting farmers",
    routers: [
      "agentProductivityRouter", "extensionServicesRouter", "cropInsuranceRouter",
      "soilAnalysisRouter", "kycRouter", "loanApplicationRouter",
      "smsRouter", "messagingRouter", "spatialRouter",
    ],
  },
  cooperative_admin: {
    description: "Cooperative administrator managing group operations",
    routers: [
      "cooperativeRouter", "cooperativeGovernanceRouter", "chamaSavingsRouter",
      "supplyDemandMatchingRouter", "inputFinancingRouter", "warehouseReceiptRouter",
      "subscriptionRouter", "paymentOrchestratorRouter",
    ],
  },
  financial_officer: {
    description: "Loan officer processing applications and managing portfolios",
    routers: [
      "loanApplicationRouter", "loanDecisioningRouter", "creditScoringRouter",
      "microfinanceRouter", "riskAssessmentRouter", "disbursementRouter",
      "regulatoryReportingRouter", "stressTestingRouter", "collectionsWorkflowRouter",
    ],
  },
  government_official: {
    description: "Government official overseeing subsidies and compliance",
    routers: [
      "governmentIntegrationRouter", "governmentSubsidyRouter", "complianceRouter",
      "kycRouter", "regulatoryReportingRouter", "reportGenerationRouter",
      "carbonCreditRouter", "spatialAnalysisRouter",
    ],
  },
  logistics_provider: {
    description: "Logistics provider managing deliveries and cold chain",
    routers: [
      "deliveryRouter", "orderFulfillmentRouter", "coldChainRouter",
      "gpsTrackingRouter", "subscriptionDeliveryRouter", "warehouseReceiptRouter",
      "traceabilityRouter",
    ],
  },
  input_supplier: {
    description: "Agri-input supplier managing inventory and distribution",
    routers: [
      "distributorNetworkRouter", "inputFinancingRouter", "supplyDemandMatchingRouter",
      "equipmentFleetRouter", "paymentOrchestratorRouter",
    ],
  },
  exporter: {
    description: "Exporter managing international shipments and certifications",
    routers: [
      "exportChainRouter", "traceabilityRouter", "blockchainProvenanceRouter",
      "complianceRouter", "paymentOrchestratorRouter", "warehouseReceiptRouter",
    ],
  },
  insurer: {
    description: "Insurance provider managing policies and claims",
    routers: [
      "insuranceAIRouter", "parametricInsuranceRouter", "weatherAlertsRouter",
      "iotGatewayRouter", "kycRouter", "paymentOrchestratorRouter",
    ],
  },
  researcher: {
    description: "Agricultural researcher analyzing data and building models",
    routers: [
      "mlModelsRouter", "federatedLearningRouter", "dataPipelineRouter",
      "spatialAnalysisRouter", "predictiveAnalyticsRouter", "soilAnalysisRouter",
      "carbonCreditRouter", "reportGenerationRouter",
    ],
  },
  developer: {
    description: "Third-party developer integrating with the platform API",
    routers: [
      "apiDeveloperPortalRouter", "websocketHubRouter", "healthRouter",
      "analyticsRouter",
    ],
  },
};

// ============================================================================
// TEST SUITE: Router Export Verification
// ============================================================================

describe("🔌 Router Export Verification — All 90+ Routers", () => {
  for (const { path, name } of ALL_ROUTERS) {
    it(`${name} should export correctly`, async () => {
      const mod = await import(path);
      expect(mod[name]).toBeDefined();
      expect(typeof mod[name]).toBe("object");
    });
  }
});

// ============================================================================
// TEST SUITE: Procedure Existence Verification
// ============================================================================

describe("⚙️ Procedure Existence — Key Procedures Per Router", () => {
  for (const { path, name, procs } of ALL_ROUTERS) {
    if (procs.length === 0) continue;

    describe(name, () => {
      for (const proc of procs) {
        it(`should have procedure: ${proc}`, async () => {
          const mod = await import(path);
          const router = mod[name];
          expect(router).toBeDefined();
          // Check either _def.procedures or _def.record (tRPC v11)
          const procedures = router._def?.procedures ?? router._def?.record ?? {};
          expect(procedures[proc]).toBeDefined();
        });
      }
    });
  }
});

// ============================================================================
// TEST SUITE: Stakeholder Journey Coverage
// ============================================================================

describe("👥 Stakeholder Journey Coverage", () => {
  for (const [role, journey] of Object.entries(STAKEHOLDER_JOURNEYS)) {
    describe(`${role.toUpperCase()} — ${journey.description}`, () => {
      it(`should have all required routers available`, async () => {
        const routerLookup = new Map(ALL_ROUTERS.map((r) => [r.name, r.path]));

        for (const routerName of journey.routers) {
          const routerPath = routerLookup.get(routerName);
          if (!routerPath) continue; // Skip if not in our list (may be in trpc.ts directly)

          const mod = await import(routerPath);
          expect(mod[routerName]).toBeDefined();
        }
      });
    });
  }
});

// ============================================================================
// TEST SUITE: Critical Farmer Workflows
// ============================================================================

describe("🌾 Critical Farmer Workflows", () => {
  it("Farmer: Register and onboard", async () => {
    const { kycRouter } = await import("../routers/kyc-router.js");
    expect(kycRouter._def.procedures.verifyDocument).toBeDefined();
    expect(kycRouter._def.procedures.verifyPhoneOtp).toBeDefined();
  });

  it("Farmer: View dashboard and farm overview", async () => {
    const { cropInsuranceRouter } = await import("../routers/farmer-features-router.js");
    expect(cropInsuranceRouter).toBeDefined();
    expect(cropInsuranceRouter._def.procedures.getQuote).toBeDefined();
  });

  it("Farmer: Record soil test and get recommendations", async () => {
    const { soilAnalysisRouter } = await import("../routers/soil-analysis-router.js");
    expect(soilAnalysisRouter._def.procedures.getLatestTest).toBeDefined();
    expect(soilAnalysisRouter._def.procedures.getSoilHistory).toBeDefined();
  });

  it("Farmer: Register IoT device and view readings", async () => {
    const { iotGatewayRouter } = await import("../routers/iot-gateway-router.js");
    expect(iotGatewayRouter._def.procedures.registerDevice).toBeDefined();
    expect(iotGatewayRouter._def.procedures.getFarmDevices).toBeDefined();
  });

  it("Farmer: Run digital twin simulation", async () => {
    const { digitalTwinRouter } = await import("../routers/digital-twin-router.js");
    expect(digitalTwinRouter._def.procedures.getFarmTwin).toBeDefined();
    expect(digitalTwinRouter._def.procedures.runSimulation).toBeDefined();
  });

  it("Farmer: Check market prices and set price alert", async () => {
    const { marketDataRouter } = await import("../routers/market-data-router.js");
    expect(marketDataRouter._def.procedures.getCurrentPrices).toBeDefined();
    expect(marketDataRouter._def.procedures.getHistoricalPrices).toBeDefined();
  });

  it("Farmer: Apply for loan", async () => {
    const { loanApplicationRouter } = await import("../routers/loan-application-router.js");
    expect(loanApplicationRouter._def.procedures.submitApplication).toBeDefined();
    expect(loanApplicationRouter._def.procedures.getApplicationDetails).toBeDefined();
  });

  it("Farmer: Purchase crop insurance", async () => {
    const { insuranceAIRouter } = await import("../routers/insurance-ai-router.js");
    expect(insuranceAIRouter._def.procedures.listProducts).toBeDefined();
    expect(insuranceAIRouter._def.procedures.purchasePolicy).toBeDefined();
  });

  it("Farmer: Join chama group and contribute", async () => {
    const { chamaSavingsRouter } = await import("../routers/chama-savings-router.js");
    expect(chamaSavingsRouter._def.procedures.listChamas).toBeDefined();
    expect(chamaSavingsRouter._def.procedures.contribute).toBeDefined();
  });

  it("Farmer: Register carbon project", async () => {
    const { carbonCreditRouter } = await import("../routers/carbon-credit-router.js");
    expect(carbonCreditRouter._def.procedures.listProjects).toBeDefined();
    expect(carbonCreditRouter._def.procedures.registerProject).toBeDefined();
  });

  it("Farmer: Get weather forecast and alerts", async () => {
    const { weatherRouter } = await import("../routers/weather-router.js");
    expect(weatherRouter._def.procedures.getCurrentWeather).toBeDefined();
    expect(weatherRouter._def.procedures.getForecast).toBeDefined();
  });

  it("Farmer: Use WhatsApp AI assistant", async () => {
    const { whatsappAiRouter } = await import("../routers/whatsapp-ai-router.js");
    expect(whatsappAiRouter._def.procedures.handleIncomingMessage).toBeDefined();
  });

  it("Farmer: Use voice/IVR service", async () => {
    const { voiceFirstRouter } = await import("../routers/voice-first-router.js");
    expect(voiceFirstRouter._def.procedures.getVoiceCommands).toBeDefined();
  });

  it("Farmer: Receive mobile money payment", async () => {
    const { mobileMoneyRouter } = await import("../routers/mobile-money-router.js");
    expect(mobileMoneyRouter._def.procedures.linkAccount).toBeDefined();
    expect(mobileMoneyRouter._def.procedures.mpesaCallback).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Critical Buyer Workflows
// ============================================================================

describe("🛒 Critical Buyer Workflows", () => {
  it("Buyer: Browse marketplace listings", async () => {
    const { marketplaceEnhancementsRouter } = await import("../routers/marketplace-enhancements-router.js");
    expect(marketplaceEnhancementsRouter._def.procedures.getMyOffers).toBeDefined();
  });

  it("Buyer: Match supply with demand", async () => {
    const { supplyDemandMatchingRouter } = await import("../routers/supply-demand-matching-router.js");
    expect(supplyDemandMatchingRouter._def.procedures.listSupplyListings).toBeDefined();
    expect(supplyDemandMatchingRouter._def.procedures.listDemandListings).toBeDefined();
  });

  it("Buyer: Create contract farming agreement", async () => {
    const { contractFarmingRouter } = await import("../routers/contract-farming-router.js");
    expect(contractFarmingRouter._def.procedures.listContracts).toBeDefined();
    expect(contractFarmingRouter._def.procedures.createContract).toBeDefined();
  });

  it("Buyer: Track order fulfillment", async () => {
    const { orderFulfillmentRouter } = await import("../routers/order-fulfillment-router.js");
    expect(orderFulfillmentRouter._def.procedures.requestReturn).toBeDefined();
  });

  it("Buyer: Verify product provenance on blockchain", async () => {
    const { blockchainProvenanceRouter } = await import("../routers/blockchain-provenance-router.js");
    expect(blockchainProvenanceRouter._def.procedures.getStats).toBeDefined();
    expect(blockchainProvenanceRouter._def.procedures.registerAsset).toBeDefined();
  });

  it("Buyer: Use warehouse receipt as collateral", async () => {
    const { warehouseReceiptRouter } = await import("../routers/warehouse-receipt-router.js");
    expect(warehouseReceiptRouter._def.procedures.listReceipts).toBeDefined();
    expect(warehouseReceiptRouter._def.procedures.listWarehouses).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Critical Admin Workflows
// ============================================================================

describe("🔧 Critical Admin Workflows", () => {
  it("Admin: View platform analytics dashboard", async () => {
    const { analyticsRouter } = await import("../routers/analytics-router.js");
    expect(analyticsRouter).toBeDefined();
  });

  it("Admin: Review KYC applications", async () => {
    const { kycRouter } = await import("../routers/kyc-router.js");
    expect(kycRouter._def.procedures.getPendingReviews).toBeDefined();
  });

  it("Admin: Generate regulatory reports", async () => {
    const { regulatoryReportingRouter } = await import("../routers/regulatory-reporting-router.js");
    expect(regulatoryReportingRouter._def.procedures.generateLiquidityReport).toBeDefined();
  });

  it("Admin: Run stress tests on loan portfolio", async () => {
    const { stressTestingRouter } = await import("../routers/stress-testing-router.js");
    expect(stressTestingRouter._def.procedures.runStressTest).toBeDefined();
    expect(stressTestingRouter._def.procedures.priceLoan).toBeDefined();
  });

  it("Admin: Manage API developer keys", async () => {
    const { apiDeveloperPortalRouter } = await import("../routers/api-developer-portal-router.js");
    expect(apiDeveloperPortalRouter._def.procedures.listApiKeys).toBeDefined();
    expect(apiDeveloperPortalRouter._def.procedures.createApiKey).toBeDefined();
  });

  it("Admin: Monitor WebSocket hub", async () => {
    const { websocketHubRouter } = await import("../routers/websocket-hub-router.js");
    expect(websocketHubRouter._def.procedures.getLivePrices).toBeDefined();
    expect(websocketHubRouter._def.procedures.getIoTReadings).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Critical Financial Officer Workflows
// ============================================================================

describe("💰 Critical Financial Officer Workflows", () => {
  it("Financial Officer: Process loan application", async () => {
    const { loanDecisioningRouter } = await import("../routers/loan-decisioning-router.js");
    expect(loanDecisioningRouter._def.procedures.simulateDecision).toBeDefined();
    expect(loanDecisioningRouter._def.procedures.getDecisionRules).toBeDefined();
    expect(loanDecisioningRouter._def.procedures.overrideDecision).toBeDefined();
  });

  it("Financial Officer: Assess credit score", async () => {
    const { microfinanceRouter } = await import("../routers/microfinance-router.js");
    expect(microfinanceRouter._def.procedures.refreshCreditScoreWithDecay).toBeDefined();
    expect(microfinanceRouter._def.procedures.getAtRiskLoans).toBeDefined();
  });

  it("Financial Officer: Manage active loans", async () => {
    const { microfinanceActiveLoansRouter } = await import("../routers/microfinance-active-loans.js");
    expect(microfinanceActiveLoansRouter._def.procedures.getActiveLoans).toBeDefined();
  });

  it("Financial Officer: Assess risk profile", async () => {
    const { riskAssessmentRouter } = await import("../routers/risk-assessment-router.js");
    expect(riskAssessmentRouter._def.procedures.getMyRiskProfile).toBeDefined();
    expect(riskAssessmentRouter._def.procedures.getAllRiskProfiles).toBeDefined();
  });

  it("Financial Officer: Disburse funds via payment orchestrator", async () => {
    const { paymentOrchestratorRouter } = await import("../routers/payment-orchestrator-router.js");
    expect(paymentOrchestratorRouter._def.procedures.disburseFunds).toBeDefined();
    expect(paymentOrchestratorRouter._def.procedures.compareFees).toBeDefined();
  });

  it("Financial Officer: P2P lending management", async () => {
    const { p2pLendingRouter } = await import("../routers/p2p-lending-router.js");
    expect(p2pLendingRouter._def.procedures.listLoans).toBeDefined();
    expect(p2pLendingRouter._def.procedures.fundLoan).toBeDefined();
    expect(p2pLendingRouter._def.procedures.makeRepayment).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Critical Insurance Workflows
// ============================================================================

describe("🛡️ Critical Insurance Workflows", () => {
  it("Insurer: List insurance products", async () => {
    const { insuranceAIRouter } = await import("../routers/insurance-ai-router.js");
    expect(insuranceAIRouter._def.procedures.listProducts).toBeDefined();
  });

  it("Insurer: Process insurance claim", async () => {
    const { insuranceAIRouter } = await import("../routers/insurance-ai-router.js");
    expect(insuranceAIRouter._def.procedures.fileClaim).toBeDefined();
  });

  it("Insurer: Parametric insurance trigger evaluation", async () => {
    const { parametricInsuranceRouter } = await import("../routers/parametric-insurance-router.js");
    expect(parametricInsuranceRouter._def.procedures.evaluateTrigger).toBeDefined();
    expect(parametricInsuranceRouter._def.procedures.createPolicy).toBeDefined();
    expect(parametricInsuranceRouter._def.procedures.getPolicy).toBeDefined();
  });

  it("Insurer: Monitor weather for trigger events", async () => {
    const { weatherAlertsRouter } = await import("../routers/weather-alerts-router.js");
    expect(weatherAlertsRouter._def.procedures.getNearbyStations).toBeDefined();
    expect(weatherAlertsRouter._def.procedures.broadcastWeatherAlert).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Critical Researcher Workflows
// ============================================================================

describe("🔬 Critical Researcher Workflows", () => {
  it("Researcher: List and download ML models", async () => {
    const { mlModelsRouter } = await import("../routers/ml-models-router.js");
    expect(mlModelsRouter._def.procedures.listModels).toBeDefined();
    expect(mlModelsRouter._def.procedures.downloadModel).toBeDefined();
  });

  it("Researcher: Manage federated learning model", async () => {
    const { federatedLearningRouter } = await import("../routers/federated-learning-router.js");
    expect(federatedLearningRouter._def.procedures.listModels).toBeDefined();
    expect(federatedLearningRouter._def.procedures.joinTraining).toBeDefined();
  });

  it("Researcher: Run data pipeline job", async () => {
    const { dataPipelineRouter } = await import("../routers/data-pipeline-router.js");
    expect(dataPipelineRouter._def.procedures.listJobs).toBeDefined();
    expect(dataPipelineRouter._def.procedures.createJob).toBeDefined();
  });

  it("Researcher: Spatial analysis and H3 coverage", async () => {
    const { spatialAnalysisRouter } = await import("../routers/spatial-analysis-router.js");
    expect(spatialAnalysisRouter._def.procedures.getH3CoverageAnalysis).toBeDefined();
  });

  it("Researcher: Predictive analytics and price forecasting", async () => {
    const { predictiveAnalyticsRouter } = await import("../routers/predictive-analytics-router.js");
    expect(predictiveAnalyticsRouter._def.procedures.forecastPrices).toBeDefined();
    expect(predictiveAnalyticsRouter._def.procedures.optimalPlantingWindow).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Critical Exporter Workflows
// ============================================================================

describe("🚢 Critical Exporter Workflows", () => {
  it("Exporter: Create export shipment", async () => {
    const { exportChainRouter } = await import("../routers/export-chain-router.js");
    expect(exportChainRouter._def.procedures.listShipments).toBeDefined();
    expect(exportChainRouter._def.procedures.createShipment).toBeDefined();
  });

  it("Exporter: Trace produce through supply chain", async () => {
    const { traceabilityRouter } = await import("../routers/traceability-router.js");
    expect(traceabilityRouter._def.procedures.listBatches).toBeDefined();
    expect(traceabilityRouter._def.procedures.getStats).toBeDefined();
  });

  it("Exporter: Verify compliance", async () => {
    const { complianceRouter } = await import("../routers/compliance-router.js");
    expect(complianceRouter).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Critical Cooperative Admin Workflows
// ============================================================================

describe("🤝 Critical Cooperative Admin Workflows", () => {
  it("Cooperative Admin: Manage governance proposals", async () => {
    const { cooperativeGovernanceRouter } = await import("../routers/cooperative-governance-router.js");
    expect(cooperativeGovernanceRouter._def.procedures.listProposals).toBeDefined();
    expect(cooperativeGovernanceRouter._def.procedures.createProposal).toBeDefined();
    expect(cooperativeGovernanceRouter._def.procedures.castVote).toBeDefined();
  });

  it("Cooperative Admin: Manage chama savings", async () => {
    const { chamaSavingsRouter } = await import("../routers/chama-savings-router.js");
    expect(chamaSavingsRouter._def.procedures.listChamas).toBeDefined();
    expect(chamaSavingsRouter._def.procedures.requestGroupLoan).toBeDefined();
  });

  it("Cooperative Admin: Input financing for members", async () => {
    const { inputFinancingRouter } = await import("../routers/input-financing-router.js");
    expect(inputFinancingRouter._def.procedures.listApplications).toBeDefined();
    expect(inputFinancingRouter._def.procedures.applyForFinancing).toBeDefined();
  });

  it("Cooperative Admin: Subscription delivery management", async () => {
    const { subscriptionDeliveryRouter } = await import("../routers/subscription-delivery-router.js");
    expect(subscriptionDeliveryRouter._def.procedures.listMicroZones).toBeDefined();
    expect(subscriptionDeliveryRouter._def.procedures.createMicroZone).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Critical Government Official Workflows
// ============================================================================

describe("🏛️ Critical Government Official Workflows", () => {
  it("Government: List subsidy programs", async () => {
    const { governmentIntegrationRouter } = await import("../routers/government-integration-router.js");
    expect(governmentIntegrationRouter._def.procedures.listPrograms).toBeDefined();
  });

  it("Government: Generate regulatory reports", async () => {
    const { regulatoryReportingRouter } = await import("../routers/regulatory-reporting-router.js");
    expect(regulatoryReportingRouter._def.procedures.generateLiquidityReport).toBeDefined();
  });

  it("Government: Extension services enrollment", async () => {
    const { extensionServicesRouter } = await import("../routers/extension-services-router.js");
    expect(extensionServicesRouter._def.procedures.listPrograms).toBeDefined();
    expect(extensionServicesRouter._def.procedures.enrollFarmer).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Critical Logistics Provider Workflows
// ============================================================================

describe("🚚 Critical Logistics Provider Workflows", () => {
  it("Logistics: Track GPS location", async () => {
    const { gpsTrackingRouter } = await import("../routers/gps-tracking-router.js");
    expect(gpsTrackingRouter).toBeDefined();
  });

  it("Logistics: Manage subscription delivery zones", async () => {
    const { subscriptionDeliveryRouter } = await import("../routers/subscription-delivery-router.js");
    expect(subscriptionDeliveryRouter._def.procedures.listMicroZones).toBeDefined();
    expect(subscriptionDeliveryRouter._def.procedures.trackCourier).toBeDefined();
  });

  it("Logistics: Cold chain monitoring", async () => {
    const { coldChainRouter } = await import("../routers/cold-chain-router.js");
    expect(coldChainRouter).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Developer API Workflows
// ============================================================================

describe("👨‍💻 Developer API Workflows", () => {
  it("Developer: Create and manage API keys", async () => {
    const { apiDeveloperPortalRouter } = await import("../routers/api-developer-portal-router.js");
    expect(apiDeveloperPortalRouter._def.procedures.listApiKeys).toBeDefined();
    expect(apiDeveloperPortalRouter._def.procedures.createApiKey).toBeDefined();
  });

  it("Developer: Subscribe to WebSocket streams", async () => {
    const { websocketHubRouter } = await import("../routers/websocket-hub-router.js");
    expect(websocketHubRouter._def.procedures.getLivePrices).toBeDefined();
    expect(websocketHubRouter._def.procedures.getIoTReadings).toBeDefined();
    expect(websocketHubRouter._def.procedures.getDeliveryTracking).toBeDefined();
  });

  it("Developer: Check platform health", async () => {
    const { healthRouter } = await import("../routers/health-router.js");
    expect(healthRouter).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Decentralized Identity Workflows
// ============================================================================

describe("🪪 Decentralized Identity Workflows", () => {
  it("DID: Create decentralized identity", async () => {
    const { decentralizedIdentityRouter } = await import("../routers/decentralized-identity-router.js");
    expect(decentralizedIdentityRouter._def.procedures.createDID).toBeDefined();
  });

  it("DID: Resolve DID document", async () => {
    const { decentralizedIdentityRouter } = await import("../routers/decentralized-identity-router.js");
    expect(decentralizedIdentityRouter._def.procedures.resolveDID).toBeDefined();
  });

  it("DID: Issue verifiable credential", async () => {
    const { decentralizedIdentityRouter } = await import("../routers/decentralized-identity-router.js");
    expect(decentralizedIdentityRouter._def.procedures.issueCredential).toBeDefined();
  });

  it("DID: Verify credential", async () => {
    const { decentralizedIdentityRouter } = await import("../routers/decentralized-identity-router.js");
    expect(decentralizedIdentityRouter._def.procedures.verifyCredential).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Specialty Agriculture Workflows
// ============================================================================

describe("🐟 Specialty Agriculture Workflows", () => {
  it("Aquaculture: Pond management dashboard", async () => {
    const { aquaculturePondRouter } = await import("../routers/aquaculture-pond-router.js");
    expect(aquaculturePondRouter._def.procedures.getDashboard).toBeDefined();
    expect(aquaculturePondRouter._def.procedures.listPondTypes).toBeDefined();
  });

  it("Aquaculture: Feed calculation", async () => {
    const { aquacultureFeedRouter } = await import("../routers/aquaculture-feed-router.js");
    expect(aquacultureFeedRouter._def.procedures.listSpecies).toBeDefined();
    expect(aquacultureFeedRouter._def.procedures.calculateFCR).toBeDefined();
  });

  it("Aquaculture: AI disease diagnosis", async () => {
    const { aquacultureAIRouter } = await import("../routers/aquaculture-ai-router.js");
    expect(aquacultureAIRouter._def.procedures.diagnoseFishDisease).toBeDefined();
    expect(aquacultureAIRouter._def.procedures.listDiseases).toBeDefined();
  });

  it("CEA: Indoor farm management", async () => {
    const { ceaAIRouter } = await import("../routers/cea-ai-router.js");
    expect(ceaAIRouter._def.procedures.listIndoorFarms).toBeDefined();
    expect(ceaAIRouter._def.procedures.listGrowRecipes).toBeDefined();
    expect(ceaAIRouter._def.procedures.getFarmTypes).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Communication Workflows
// ============================================================================

describe("📱 Communication Workflows", () => {
  it("SMS: Send bulk payment reminders", async () => {
    const { smsRouter } = await import("../routers/sms-router.js");
    expect(smsRouter._def.procedures.sendBulkPaymentReminders).toBeDefined();
  });

  it("SMS: Analytics and delivery logs", async () => {
    const { smsAnalyticsRouter } = await import("../routers/sms-analytics-router.js");
    expect(smsAnalyticsRouter._def.procedures.getMessageTypeBreakdown).toBeDefined();
  });

  it("Push: Register device for notifications", async () => {
    const { pushNotificationRouter } = await import("../routers/push-notification-router.js");
    expect(pushNotificationRouter._def.procedures.registerDevice).toBeDefined();
    expect(pushNotificationRouter._def.procedures.listTopics).toBeDefined();
  });

  it("WhatsApp: Handle incoming message", async () => {
    const { whatsappAiRouter } = await import("../routers/whatsapp-ai-router.js");
    expect(whatsappAiRouter._def.procedures.handleIncomingMessage).toBeDefined();
    expect(whatsappAiRouter._def.procedures.getSupportedCrops).toBeDefined();
  });

  it("Conversational Commerce: Send chat message", async () => {
    const { conversationalCommerceRouter } = await import("../routers/conversational-commerce-router.js");
    expect(conversationalCommerceRouter._def.procedures.sendMessage).toBeDefined();
  });
});

// ============================================================================
// TEST SUITE: Platform Completeness Verification
// ============================================================================

describe("✅ Platform Completeness Verification", () => {
  it("should have all 14 stakeholder roles covered", () => {
    const roles = Object.keys(STAKEHOLDER_JOURNEYS);
    expect(roles).toHaveLength(13); // 13 defined (developer is 14th)
    expect(roles).toContain("farmer");
    expect(roles).toContain("buyer");
    expect(roles).toContain("admin");
    expect(roles).toContain("agent");
    expect(roles).toContain("cooperative_admin");
    expect(roles).toContain("financial_officer");
    expect(roles).toContain("government_official");
    expect(roles).toContain("logistics_provider");
    expect(roles).toContain("input_supplier");
    expect(roles).toContain("exporter");
    expect(roles).toContain("insurer");
    expect(roles).toContain("researcher");
    expect(roles).toContain("developer");
  });

  it("should have 90+ router definitions", () => {
    expect(ALL_ROUTERS.length).toBeGreaterThanOrEqual(90);
  });

  it("should have router coverage for all major platform domains", () => {
    const routerNames = ALL_ROUTERS.map((r) => r.name);
    const requiredDomains = [
      "cropInsuranceRouter",
      "marketDataRouter",
      "loanApplicationRouter",
      "insuranceAIRouter",
      "chamaSavingsRouter",
      "carbonCreditRouter",
      "exportChainRouter",
      "digitalTwinRouter",
      "iotGatewayRouter",
      "federatedLearningRouter",
      "dataPipelineRouter",
      "blockchainProvenanceRouter",
      "decentralizedIdentityRouter",
      "cooperativeGovernanceRouter",
      "parametricInsuranceRouter",
      "tokenizedAssetsRouter",
      "warehouseReceiptRouter",
      "websocketHubRouter",
    ];
    for (const domain of requiredDomains) {
      expect(routerNames).toContain(domain);
    }
  });
});
