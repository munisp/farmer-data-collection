import { z } from "zod";
import { router, publicProcedure, protectedProcedure, createContext, middleware } from "./_core/trpc-base.js";
import { pushChanges, pullChanges, syncRequestSchemaExport, pullChangesSchemaExport } from "./sync-router.js";
import { dashboardCacheRouter } from "./dashboard-cache-router.js";
import { adminRouter } from "./admin-router.js";
import { financialReportsRouter } from "./financial-reports-router.js";
import { exportRouter } from "./export-router.js";
import { marketplaceRouter } from "./marketplace-router";
import { stripeMarketplaceRouter } from "./stripe-marketplace-router";
import { messagingRouter } from "./routers/messaging-router.js";
import { voiceRouter } from "./voice-router.js";
import { analyticsRouter } from "./routers/analytics-router.js";
import { mlPredictionsRouter } from "./ml-predictions-router.js";
import { productReviewsRouter } from "./product-reviews-router";
import { reviewAnalyticsRouter } from "./review-analytics-router.js";
import { reviewResponsesRouter } from "./review-responses-router.js";
import { moderationAnalyticsRouter } from "./moderation-analytics-router.js";
import { responseTemplatesRouter } from "./response-templates-router.js";
import { moderationWorkflowRouter } from "./moderation-workflow-router.js";
import { mlModelsRouter } from "./routers/ml-models-router.js";
import { spatialRouter } from "./routers/spatial-router.js";
import { weatherRouter } from "./routers/weather-router.js";
import { agriculturalIntelligenceRouter } from "./routers/agricultural-intelligence-router.js";
import { accountingRouter } from "./accounting-router.js";
import { hrRouter } from "./hr-router.js";
import { inventoryRouter } from "./inventory-router.js";
import { bankingRouter } from "./banking-router.js";
import { microfinanceRouter } from "./routers/microfinance-router.js";
import { microfinanceFlatProcedures } from "./microfinance-procedures-flat.js";
import { disbursementRouter } from "./routers/disbursement-router.js";
import { riskAssessmentRouter } from "./routers/risk-assessment-router.js";
import { loanApplicationRouter } from "./routers/loan-application-router.js";
import { africasTalkingRouter } from "./routers/africas-talking-router.js";
import { smsRouter } from "./routers/sms-router.js";
import { smsTemplatesRouter } from "./routers/sms-templates-router.js";
import { smsResponsesRouter } from "./routers/sms-responses-router.js";
import { smsAnalyticsRouter } from "./routers/sms-analytics-router.js";
import { microfinanceActiveLoansRouter } from "./routers/microfinance-active-loans.js";
import { erpnextRouter } from "./routers/erpnext-router.js";
import { healthRouter } from "./routers/health-router.js";
import { auditTrailRouter } from "./audit-trail-router.js";
import { permifyRouter } from "./permify-router.js";
import { exchangeRouter } from "./routers/exchange-router.js";
import { cooperativeRouter } from "./routers/cooperative-router.js";
import { notificationRouter } from "./routers/notification-router.js";
import { creditScoringRouter } from "./routers/credit-scoring-router.js";
import { agentProductivityRouter } from "./routers/agent-productivity-router.js";
import { traceabilityRouter } from "./routers/traceability-router.js";
import { kycRouter } from "./routers/kyc-router.js";
import { adminDashboardRouter } from "./routers/admin-dashboard-router.js";
import { gpsTrackingRouter } from "./routers/gps-tracking-router.js";
import { landSuitabilityRouter } from "./routers/land-suitability-router.js";
import { farmerFeaturesRouter } from "./routers/farmer-features-router.js";
import { satelliteImageryRouter } from "./satellite-imagery-router.js";
import { fieldOverviewRouter } from "./routers/field-overview-router.js";
import { mobileMoneyRouter } from "./routers/mobile-money-router.js";
import { deliveryRouter } from "./routers/delivery-router.js";
import { escrowRouter } from "./routers/escrow-router.js";
import { chamaRouter } from "./routers/chama-router.js";
import { subscriptionRouter } from "./routers/subscription-router.js";
import { coldChainRouter } from "./routers/cold-chain-router.js";
import { priceAlertsRouter } from "./routers/price-alerts-router.js";
import { marketplaceEnhancementsRouter } from "./routers/marketplace-enhancements-router.js";
import { whatsappAiRouter } from "./routers/whatsapp-ai-router.js";
import { weatherAlertsRouter } from "./routers/weather-alerts-router.js";
import { financialEnhancementsRouter } from "./routers/financial-enhancements-router.js";
import { governmentSubsidyRouter } from "./routers/government-subsidy-router.js";
import { platformAdvancedRouter } from "./routers/platform-advanced-router.js";
import { soilAnalysisRouter } from "./routers/soil-analysis-router.js";
import { droneRouter } from "./routers/drone-router.js";
import { equipmentFleetRouter } from "./routers/equipment-fleet-router.js";
import { agriLlmRouter } from "./routers/agri-llm-router.js";
import { iotGatewayRouter } from "./routers/iot-gateway-router.js";
import { farmsRouter, livestockRouter, cropsRouter, harvestsRouter, expensesRouter, farmInputsRouter, equipmentRouter, inventoryEnhancementsRouter, traceabilityEnhancementsRouter } from "./routers/core-features-router.js";
import { orderFulfillmentRouter } from "./routers/order-fulfillment-router.js";
import { retailStoreRouter } from "./routers/retail-store-router.js";
import { loanDecisioningRouter } from "./routers/loan-decisioning-router.js";
import { predictiveAnalyticsRouter } from "./routers/predictive-analytics-router.js";
import { iotRulesEngineRouter } from "./routers/iot-rules-engine-router.js";
import { paymentOrchestratorRouter } from "./routers/payment-orchestrator-router.js";
import { complianceRouter } from "./routers/compliance-router.js";
import { collectionsWorkflowRouter } from "./routers/collections-workflow-router.js";
import { stressTestingRouter } from "./routers/stress-testing-router.js";
import { marketDataRouter } from "./routers/market-data-router.js";
import { regulatoryReportingRouter } from "./routers/regulatory-reporting-router.js";
import { communicationAIRouter } from "./routers/communication-ai-router.js";
import { blockchainProvenanceRouter } from "./routers/blockchain-provenance-router.js";
import { subscriptionDeliveryRouter } from "./routers/subscription-delivery-router.js";
import { ceaAIRouter } from "./routers/cea-ai-router.js";
import { aquaculturePondRouter } from "./routers/aquaculture-pond-router.js";
import { aquacultureFeedRouter } from "./routers/aquaculture-feed-router.js";
import { aquacultureAIRouter } from "./routers/aquaculture-ai-router.js";
import { contractFarmingRouter } from "./routers/contract-farming-router.js";
import { warehouseReceiptRouter } from "./routers/warehouse-receipt-router.js";
import { conversationalCommerceRouter } from "./routers/conversational-commerce-router.js";
import { cooperativeGovernanceRouter } from "./routers/cooperative-governance-router.js";
import { inputFinancingRouter } from "./routers/input-financing-router.js";
import { parametricInsuranceRouter } from "./routers/parametric-insurance-router.js";
import { p2pLendingRouter } from "./routers/p2p-lending-router.js";
import { extensionServicesRouter } from "./routers/extension-services-router.js";
import { governmentIntegrationRouter } from "./routers/government-integration-router.js";
import { supplyDemandMatchingRouter } from "./routers/supply-demand-matching-router.js";
import { tokenizedAssetsRouter } from "./routers/tokenized-assets-router.js";
import { digitalTwinRouter } from "./routers/digital-twin-router.js";
import { apiDeveloperPortalRouter } from "./routers/api-developer-portal-router.js";
import { decentralizedIdentityRouter } from "./routers/decentralized-identity-router.js";

import { authRouter as authRouterSimple } from "./auth-router-simple.js";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is required. Generate one with: openssl rand -base64 32"
  );
}

// Re-export createContext, middleware, router, and procedures for server setup
export { createContext, middleware, router, protectedProcedure, publicProcedure };

// Auth router - use simple version that bypasses Drizzle ORM schema issues
const authRouter = authRouterSimple;

export const appRouter = router({
  auth: authRouter,
  dashboard: dashboardCacheRouter,
  admin: adminRouter,
  financialReports: financialReportsRouter,
  export: exportRouter,
  marketplace: marketplaceRouter,
  stripeMarketplace: stripeMarketplaceRouter,
  messaging: messagingRouter,
  voice: voiceRouter,
  analytics: analyticsRouter,
  mlPredictions: mlPredictionsRouter,
  productReviews: productReviewsRouter,
  reviewAnalytics: reviewAnalyticsRouter,
  reviewResponses: reviewResponsesRouter,
  moderationAnalytics: moderationAnalyticsRouter,
  responseTemplates: responseTemplatesRouter,
  moderationWorkflow: moderationWorkflowRouter,
  mlModels: mlModelsRouter,
  spatial: spatialRouter,
  weather: weatherRouter,
  agriculturalIntelligence: agriculturalIntelligenceRouter,
  accounting: accountingRouter,
  hr: hrRouter,
  inventory: inventoryRouter,
  banking: bankingRouter,
  microfinance: router({
    ...microfinanceRouter._def.procedures,
    ...microfinanceActiveLoansRouter._def.procedures,
    ...microfinanceFlatProcedures,
  }),
  disbursement: disbursementRouter,
  riskAssessment: riskAssessmentRouter,
  loanApplication: loanApplicationRouter,
  africasTalking: africasTalkingRouter,
  sms: smsRouter,
  smsTemplates: smsTemplatesRouter,
  smsResponses: smsResponsesRouter,
  smsAnalytics: smsAnalyticsRouter,
  erpnext: erpnextRouter,
    health: healthRouter,
    auditTrail: auditTrailRouter,
    permify: permifyRouter,
        exchange: exchangeRouter,
        cooperative: cooperativeRouter,
        notification: notificationRouter,
        creditScoring: creditScoringRouter,
                agentProductivity: agentProductivityRouter,
                traceability: traceabilityRouter,
                kyc: kycRouter,
                adminDashboard: adminDashboardRouter,
                                gpsTracking: gpsTrackingRouter,
                                                                                                  landSuitability: landSuitabilityRouter,
                                    farmerFeatures: farmerFeaturesRouter,
                                    satelliteImagery: satelliteImageryRouter,
                                    fieldOverview: fieldOverviewRouter,
  // === Supply Chain Phase 1-4 Routers ===
  mobileMoney: mobileMoneyRouter,
  delivery: deliveryRouter,
  escrow: escrowRouter,
  chama: chamaRouter,
  subscription: subscriptionRouter,
  coldChain: coldChainRouter,
  priceAlerts: priceAlertsRouter,
  marketplaceEnhancements: marketplaceEnhancementsRouter,
  whatsappAi: whatsappAiRouter,
  weatherAlerts: weatherAlertsRouter,
  financialEnhancements: financialEnhancementsRouter,
  governmentSubsidy: governmentSubsidyRouter,
  platformAdvanced: platformAdvancedRouter,
  soilAnalysis: soilAnalysisRouter,
  // === Next-Gen AI Equipment & LLM Routers ===
  drone: droneRouter,
  equipmentFleet: equipmentFleetRouter,
  agriLlm: agriLlmRouter,
  iotGateway: iotGatewayRouter,
  // === Farm-to-Home Pipeline ===
  orderFulfillment: orderFulfillmentRouter,
  retailStore: retailStoreRouter,
  // === Core Feature Routers (Production-Grade CRUD + Analytics) ===
  coreFarms: farmsRouter,
  coreLivestock: livestockRouter,
  coreCrops: cropsRouter,
  coreHarvests: harvestsRouter,
  coreExpenses: expensesRouter,
  coreFarmInputs: farmInputsRouter,
  coreEquipment: equipmentRouter,
  inventoryEnhancements: inventoryEnhancementsRouter,
  traceabilityEnhancements: traceabilityEnhancementsRouter,
  // === Business Logic V3: Decision Engine, Analytics, IoT Rules, Payments, Compliance ===
  loanDecisioning: loanDecisioningRouter,
  predictiveAnalytics: predictiveAnalyticsRouter,
  iotRulesEngine: iotRulesEngineRouter,
  paymentOrchestrator: paymentOrchestratorRouter,
  compliance: complianceRouter,
  collectionsWorkflow: collectionsWorkflowRouter,
  stressTesting: stressTestingRouter,
  marketData: marketDataRouter,
  regulatoryReporting: regulatoryReportingRouter,
  communicationAI: communicationAIRouter,
  // === Urban Vertical Farming Gap Implementation ===
  blockchainProvenance: blockchainProvenanceRouter,
  subscriptionDelivery: subscriptionDeliveryRouter,
  ceaAI: ceaAIRouter,
  // === Aquaculture / Fish Farming Module ===
  aquaculturePond: aquaculturePondRouter,
  aquacultureFeed: aquacultureFeedRouter,
  aquacultureAI: aquacultureAIRouter,
  // === Platform Recommendations Implementation ===
  contractFarming: contractFarmingRouter,
  warehouseReceipt: warehouseReceiptRouter,
  conversationalCommerce: conversationalCommerceRouter,
  cooperativeGovernance: cooperativeGovernanceRouter,
  inputFinancing: inputFinancingRouter,
  parametricInsurance: parametricInsuranceRouter,
  p2pLending: p2pLendingRouter,
  extensionServices: extensionServicesRouter,
  governmentIntegration: governmentIntegrationRouter,
  supplyDemandMatching: supplyDemandMatchingRouter,
  tokenizedAssets: tokenizedAssetsRouter,
  digitalTwin: digitalTwinRouter,
  apiDeveloperPortal: apiDeveloperPortalRouter,
  decentralizedIdentity: decentralizedIdentityRouter,
  sync: router({
    push: protectedProcedure
      .input(syncRequestSchemaExport)
      .mutation(async ({ input, ctx }) => {
        return await pushChanges(input, (ctx as any).user.id);
      }),
    pull: protectedProcedure
      .input(pullChangesSchemaExport)
      .query(async ({ input, ctx }) => {
        return await pullChanges(input, (ctx as any).user.id);
      }),
  }),
});

export type AppRouter = typeof appRouter;
