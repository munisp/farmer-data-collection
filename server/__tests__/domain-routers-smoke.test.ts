/**
 * Smoke tests for all domain routers.
 * Verifies that every router exports correctly and has expected procedures.
 */
import { describe, it, expect } from "vitest";

const routerModules = [
  { path: "../routers/cooperative-governance-router.js", name: "cooperativeGovernanceRouter", procedures: ["listProposals", "createProposal", "castVote"] },
  { path: "../routers/extension-services-router.js", name: "extensionServicesRouter", procedures: ["listPrograms", "enrollFarmer"] },
  { path: "../routers/government-integration-router.js", name: "governmentIntegrationRouter", procedures: ["listPrograms"] },
  { path: "../routers/input-financing-router.js", name: "inputFinancingRouter", procedures: ["listApplications", "applyForFinancing"] },
  { path: "../routers/supply-demand-matching-router.js", name: "supplyDemandMatchingRouter", procedures: ["listSupplyListings", "listDemandListings"] },
  { path: "../routers/contract-farming-router.js", name: "contractFarmingRouter", procedures: ["listContracts", "createContract"] },
  { path: "../routers/parametric-insurance-router.js", name: "parametricInsuranceRouter", procedures: ["listPolicies", "createPolicy"] },
  { path: "../routers/tokenized-assets-router.js", name: "tokenizedAssetsRouter", procedures: ["listAssets"] },
  { path: "../routers/decentralized-identity-router.js", name: "decentralizedIdentityRouter", procedures: ["resolveDID", "createDID", "issueCredential", "verifyCredential"] },
  { path: "../routers/api-developer-portal-router.js", name: "apiDeveloperPortalRouter", procedures: ["listApiKeys", "createApiKey"] },
  { path: "../routers/weather-router.js", name: "weatherRouter", procedures: ["getCurrentWeather", "getForecast"] },
  { path: "../routers/blockchain-provenance-router.js", name: "blockchainProvenanceRouter", procedures: ["getStats", "getChainInfo", "registerAsset"] },
  { path: "../routers/subscription-delivery-router.js", name: "subscriptionDeliveryRouter", procedures: ["listMicroZones"] },
  { path: "../routers/cea-ai-router.js", name: "ceaAIRouter", procedures: ["listIndoorFarms", "listGrowRecipes", "getFarmTypes"] },
  { path: "../routers/aquaculture-pond-router.js", name: "aquaculturePondRouter", procedures: ["listSpeciesThresholds", "listPondTypes", "getDashboard"] },
  { path: "../routers/aquaculture-feed-router.js", name: "aquacultureFeedRouter", procedures: ["listSpecies", "getSpeciesProfile", "calculateFCR"] },
  { path: "../routers/aquaculture-ai-router.js", name: "aquacultureAIRouter", procedures: ["listDiseases", "listGrowthModels", "diagnoseFishDisease"] },
  { path: "../routers/warehouse-receipt-router.js", name: "warehouseReceiptRouter", procedures: ["listReceipts"] },
  { path: "../routers/conversational-commerce-router.js", name: "conversationalCommerceRouter", procedures: ["processMessage"] },
  { path: "../routers/p2p-lending-router.js", name: "p2pLendingRouter", procedures: ["listLoans"] },
  { path: "../routers/digital-twin-router.js", name: "digitalTwinRouter", procedures: ["getFarmTwin", "runSimulation", "getSensorData"] },
];

describe("Domain Router Smoke Tests", () => {
  for (const { path, name, procedures } of routerModules) {
    describe(name, () => {
      it(`should export ${name}`, async () => {
        const mod = await import(path);
        expect(mod[name]).toBeDefined();
      });

      for (const proc of procedures) {
        it(`should have procedure: ${proc}`, async () => {
          const mod = await import(path);
          const router = mod[name];
          expect(router._def.procedures[proc]).toBeDefined();
        });
      }
    });
  }
});
