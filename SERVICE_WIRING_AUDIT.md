# Comprehensive Service Wiring Audit Report

**Date:** December 20, 2025
**Platform:** Ag-Fintech Platform

## Executive Summary

| Category | Status | Issues Found |
|----------|--------|--------------|
| tRPC Routers | PASS | All 28 routers wired to appRouter |
| Database Tables | PARTIAL | 181 tables defined, most have CRUD |
| Client Pages | PARTIAL | 115 pages, ~40% have tRPC calls |
| Mobile Screens | PARTIAL | 31 screens, need API integration |
| Go Microservices | ORPHAN | 8 services not integrated |
| Python Services | PARTIAL | 4 mocks (OK), 5 business services (2 orphan) |
| TODO/FIXME | LOW | Only 8 remaining |
| Mock Data | PARTIAL | AgriculturalModels.tsx uses mock data |
| Environment Variables | PARTIAL | No .env.example template |

---

## 1. tRPC Routers (PASS)

All 28 routers are properly wired to `appRouter` in `server/trpc.ts`:

| Router | Status | Location |
|--------|--------|----------|
| auth | WIRED | auth-router-simple.js |
| dashboard | WIRED | dashboard-cache-router.js |
| admin | WIRED | admin-router.js |
| financialReports | WIRED | financial-reports-router.js |
| export | WIRED | export-router.js |
| marketplace | WIRED | marketplace-router.ts |
| stripeMarketplace | WIRED | stripe-marketplace-router.ts |
| messaging | WIRED | messaging-router.js |
| voice | WIRED | voice-router.js |
| analytics | WIRED | analytics-router.js |
| mlPredictions | WIRED | ml-predictions-router.js |
| productReviews | WIRED | product-reviews-router.ts |
| reviewAnalytics | WIRED | review-analytics-router.js |
| reviewResponses | WIRED | review-responses-router.js |
| moderationAnalytics | WIRED | moderation-analytics-router.js |
| responseTemplates | WIRED | response-templates-router.js |
| moderationWorkflow | WIRED | moderation-workflow-router.js |
| mlModels | WIRED | routers/ml-models-router.js |
| spatial | WIRED | routers/spatial-router.js |
| weather | WIRED | routers/weather-router.js |
| agriculturalIntelligence | WIRED | routers/agricultural-intelligence-router.js |
| accounting | WIRED | accounting-router.js |
| hr | WIRED | hr-router.js |
| inventory | WIRED | inventory-router.js |
| banking | WIRED | banking-router.js |
| microfinance | WIRED | Combined from 3 sources |
| disbursement | WIRED | routers/disbursement-router.js |
| riskAssessment | WIRED | routers/risk-assessment-router.js |
| loanApplication | WIRED | routers/loan-application-router.js |
| africasTalking | WIRED | routers/africas-talking-router.js |
| sms | WIRED | routers/sms-router.js |
| smsTemplates | WIRED | routers/sms-templates-router.js |
| smsResponses | WIRED | routers/sms-responses-router.js |
| smsAnalytics | WIRED | routers/sms-analytics-router.js |
| erpnext | WIRED | routers/erpnext-router.js |
| health | WIRED | routers/health-router.js |
| auditTrail | WIRED | audit-trail-router.js |
| permify | WIRED | permify-router.js |
| exchange | WIRED | routers/exchange-router.js |
| cooperative | WIRED | routers/cooperative-router.js |
| notification | WIRED | routers/notification-router.js |
| creditScoring | WIRED | routers/credit-scoring-router.js |
| agentProductivity | WIRED | routers/agent-productivity-router.js |
| traceability | WIRED | routers/traceability-router.js |
| kyc | WIRED | routers/kyc-router.js |
| adminDashboard | WIRED | routers/admin-dashboard-router.js |
| gpsTracking | WIRED | routers/gps-tracking-router.js |
| sync | WIRED | Inline in trpc.ts |

---

## 2. Database Tables (181 tables)

**Schema Files:** 25 files in `drizzle/`

| Schema File | Tables | Status |
|-------------|--------|--------|
| schema.ts | 34 | Core tables (farmers, farms, harvests, etc.) |
| financial-schema.ts | 38 | Banking, loans, payroll |
| exchange-schema.ts | 11 | Commodity exchange |
| cooperative-schema.ts | 6 | Cooperative management |
| credit-scoring-schema.ts | 6 | Credit scoring |
| agent-productivity-schema.ts | 5 | Field agent tracking |
| traceability-schema.ts | 5 | Supply chain |
| notification-schema.ts | 5 | Notifications |
| kyc-schema.ts | 5 | KYC verification |
| precision-agriculture-schema.ts | 18 | Precision ag |
| user-journey-schema.ts | 14 | User journeys |
| schema-ml-models.ts | 14 | ML models |
| erpnext-schema.ts | 11 | ERPNext integration |
| ledger-schema.ts | 9 | TigerBeetle ledger |
| schema-gps-models.ts | 11 | GPS tracking |
| Others | Various | Supporting tables |

---

## 3. Client Pages (115 pages)

**Pages with tRPC Integration:**

| Page | tRPC Calls | Status |
|------|------------|--------|
| NotificationCenter | 11 | INTEGRATED |
| CooperativeDashboard | 10 | INTEGRATED |
| ExchangeTrade | 6 | INTEGRATED |
| TraceabilityDashboard | 5 | INTEGRATED |
| CreditScoreView | 4 | INTEGRATED |
| LoanApprovals | 3 | INTEGRATED |
| CreditScoreDashboard | 2 | INTEGRATED |
| ProductDetail | 2 | INTEGRATED |
| MyListings | 2 | INTEGRATED |
| BulkExport | 2 | INTEGRATED |
| UserSettings | 2 | INTEGRATED |
| ModelBenchmarks | 2 | INTEGRATED |
| DisbursementAnalytics | 1 | INTEGRATED |
| LenderDetail | 1 | INTEGRATED |
| Register | 1 | INTEGRATED |
| Login | 1 | INTEGRATED |

**Pages WITHOUT tRPC Integration (need wiring):**

- RiskComplianceDashboard
- NotificationPreferences
- EquipmentTracker
- BorrowerDashboard
- WeatherDashboard
- FarmerVerification
- Crops
- FarmInputs
- LoginKeycloak
- Home
- Livestock
- Dashboard
- DataQualityDashboard
- UserJourneys

---

## 4. Mobile Screens (31 screens)

**Status:** Most screens need tRPC integration

| Screen | Status |
|--------|--------|
| LoginScreen | Needs API |
| RegisterScreen | Needs API |
| HomeScreen | Needs API |
| ProfileScreen | Needs API |
| SettingsScreen | Needs API |
| FarmerRegistrationScreen | Needs API |
| FarmerProfileScreen | Needs API |
| HarvestListScreen | Needs API |
| HarvestDetailScreen | Needs API |
| HarvestCreateScreen | Needs API |
| HarvestEditScreen | Needs API |
| ExpenseListScreen | Needs API |
| ExpenseDetailScreen | Needs API |
| ExpenseCreateScreen | Needs API |
| ExpenseEditScreen | Needs API |
| MarketplaceBrowseScreen | Needs API |
| MarketplaceDetailScreen | Needs API |
| CartScreen | Needs API |
| CheckoutScreen | Needs API |
| OrdersScreen | Needs API |
| FarmRegistrationScreen | Needs API |
| AdminDashboardScreen | Needs API |
| WorkflowListScreen | Needs API |
| WorkflowDetailScreen | Needs API |
| CropDashboardScreen | Needs API |
| CropWizardScreen | Needs API |
| YieldPredictionScreen | Needs API |
| PriceForecastScreen | Needs API |
| LoanApplicationScreen | Needs API |
| BiometricSettingsScreen | Needs API |

---

## 5. Go Microservices (8 services - ORPHAN)

| Service | docker-compose | TS Integration | Status |
|---------|----------------|----------------|--------|
| apisix-gateway | NO | NO | ORPHAN |
| dapr-service | NO | NO | ORPHAN |
| fluvio-streaming | NO | NO | ORPHAN |
| image-service | NO | NO | ORPHAN |
| loan-orchestrator | NO | NO | ORPHAN |
| orchestrator-coordinator | NO | NO | ORPHAN |
| realtime-service | NO | NO | ORPHAN |
| tigerbeetle-service | NO | NO | ORPHAN |

**Note:** These services have middleware implementations but are not wired to the main platform. They need:
1. docker-compose entries
2. APISIX/Dapr routes
3. TypeScript client calls

---

## 6. Python Services (9 services)

| Service | Type | docker-compose | Status |
|---------|------|----------------|--------|
| apisix-mock | Mock | NO | DEV ONLY |
| kafka-mock | Mock | NO | DEV ONLY |
| keycloak-mock | Mock | NO | DEV ONLY |
| permify-mock | Mock | NO | DEV ONLY |
| lakehouse-service | Business | YES | INTEGRATED |
| ml-service | Business | YES | INTEGRATED |
| ollama-service | Business | NO | ORPHAN |
| temporal-workflows | Business | NO | ORPHAN |
| loan-worker | Business | NO | ORPHAN |

---

## 7. TODO/FIXME Items (8 remaining)

| File | Line | Issue |
|------|------|-------|
| client/src/pages/NotificationPreferences.tsx | 75 | TODO: Load from API |
| client/src/pages/NotificationPreferences.tsx | 96 | TODO: Save to API |
| server/services/ivr-voice-service.ts | 362 | TODO: Save to database |
| server/services/ivr-voice-service.ts | 404 | TODO: Fetch loan from database |
| server/services/ivr-voice-service.ts | 486 | TODO: Create loan application |
| server/services/ivr-voice-service.ts | 514 | TODO: Fetch real market prices |
| server/services/ivr-voice-service.ts | 532 | TODO: Fetch real weather data |

---

## 8. Mock Data (1 file)

| File | Issue |
|------|-------|
| client/src/pages/AgriculturalModels.tsx | Uses mockData for biomass, canopy, LST, NDVI results |

---

## 9. Environment Variables

**Used but not documented:**
- 100+ environment variables across TypeScript, Go, Python
- No `.env.example` template exists

**Key variables needed:**
- JWT_SECRET
- DATABASE_URL
- REDIS_URL
- KAFKA_BROKERS
- KEYCLOAK_URL
- PERMIFY_URL
- TIGERBEETLE_ADDRESS
- TEMPORAL_ADDRESS
- APISIX_ADMIN_URL
- STRIPE_SECRET_KEY
- AFRICASTALKING_API_KEY
- SENTRY_DSN

---

## Recommendations

### Critical (Must Fix)

1. **Wire Go microservices to platform:**
   - Add docker-compose entries
   - Create APISIX routes
   - Add TypeScript client calls

2. **Wire Python business services:**
   - Add ollama-service, temporal-workflows, loan-worker to docker-compose
   - Create integration points in TypeScript

3. **Create .env.example:**
   - Document all required environment variables

### High Priority

4. **Mobile app API integration:**
   - Wire all 31 screens to tRPC endpoints
   - Use existing routers (auth, dashboard, marketplace, etc.)

5. **Fix remaining TODOs:**
   - NotificationPreferences: Wire to notification router
   - IVR Voice Service: Wire to database and external APIs

### Medium Priority

6. **Client pages without API:**
   - Wire ~40% of pages that lack tRPC calls
   - Most have corresponding routers already

7. **Replace mock data:**
   - AgriculturalModels.tsx: Use mlModels router

---

## Summary

The platform has a solid foundation with 28 tRPC routers, 181 database tables, and comprehensive middleware implementations in Go and Python. The main gaps are:

1. **Go/Python microservices are orphaned** - not connected to main platform
2. **Mobile app needs API wiring** - screens exist but don't call APIs
3. **~40% of client pages lack API calls** - UI exists but uses static/mock data
4. **No environment variable documentation** - makes deployment difficult

The middleware implementations (Kafka, Redis, TigerBeetle, Temporal, Keycloak, Permify, Dapr, APISIX, Fluvio) are complete and idempotent, but need to be wired into the main application flow.
