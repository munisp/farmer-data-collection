# Top 20 User Journeys - Temporal Orchestration

This document describes the top 20 user journeys implemented with Temporal workflow orchestration for the Agricultural Finance Platform.

## Architecture Overview

Each user journey is implemented as a Temporal workflow that:
1. Accepts typed input parameters
2. Orchestrates multiple activities across services
3. Integrates with middleware (Kafka, Redis, Dapr, PostgreSQL)
4. Publishes events for audit trails and analytics
5. Returns typed output with results

## Middleware Integration

All workflows integrate with the following middleware:

| Middleware | Purpose |
|------------|---------|
| **Kafka** | Event streaming, audit trails, async messaging |
| **Redis** | Caching, session state, rate limiting |
| **Dapr** | Service-to-service communication |
| **PostgreSQL** | Persistent data storage |
| **TigerBeetle** | Double-entry accounting ledger |
| **Lakehouse** | Analytics data pipeline |
| **Keycloak** | Authentication |
| **Permify** | Authorization |

## User Journeys

### Journey 1: Farmer Onboarding with KYC and ERPNext Sync
**UI Pages:** FarmerOnboardingWizard.tsx, QuickFarmerRegistration.tsx
**Backend:** kyc-router.ts, erpnext-router.ts, keycloak-service.ts

**Flow:**
1. Create Keycloak user account
2. Create farmer record in database
3. Register farms with GPS coordinates
4. Process KYC documents
5. Calculate initial credit score
6. Sync to ERPNext
7. Send welcome notification
8. Push analytics to Lakehouse

### Journey 2: Farm Geotagging and Boundary Mapping
**UI Pages:** FarmGeotagging.tsx, GPSTracking.tsx, FarmersMapView.tsx
**Backend:** gps-tracking-router.ts, spatial-router.ts

**Flow:**
1. Validate GPS accuracy
2. Save farm center point
3. Save boundary polygon
4. Calculate area from polygon
5. Create spatial record in PostGIS
6. Push to Lakehouse/Sedona
7. Send confirmation notification

### Journey 3: Loan Application with Credit Scoring
**UI Pages:** LoanApplicationForm.tsx, BorrowerDashboard.tsx, CreditScoreView.tsx
**Backend:** microfinance-router.ts, credit-scoring-router.ts

**Flow:**
1. Verify KYC status
2. Calculate credit score
3. Assess risk
4. Create loan application
5. Calculate interest rate
6. Create TigerBeetle ledger entry
7. Send notification
8. Push to Lakehouse

### Journey 4: Marketplace Listing and Order Processing
**UI Pages:** MarketplaceBrowse.tsx, MarketplaceListing.tsx, MyListings.tsx
**Backend:** exchange-router.ts

**Flow:**
1. Grade produce quality (ML)
2. Create traceability record
3. Create marketplace listing
4. Push to Lakehouse

### Journey 5: Order Processing with Payment via TigerBeetle
**UI Pages:** Checkout.tsx, MyOrders.tsx, MySales.tsx
**Backend:** exchange-router.ts, tigerbeetle-ledger.ts

**Flow:**
1. Verify listing availability
2. Create order
3. Create escrow in TigerBeetle
4. Process payment
5. Update listing quantity
6. Send notifications to buyer and seller
7. Push to Lakehouse

### Journey 6: Yield Prediction with AI/ML Models
**UI Pages:** YieldPrediction.tsx, AgriculturalModels.tsx, PrecisionAgDashboard.tsx
**Backend:** ml-models-router.ts, agricultural-intelligence-router.ts

**Flow:**
1. Get weather data
2. Get soil data
3. Run ML yield prediction
4. Calculate optimal harvest date
5. Generate recommendations
6. Save prediction record
7. Push to Lakehouse
8. Send notification

### Journey 7: Land Suitability Assessment
**UI Pages:** LandSuitabilityAssessment.tsx, SpatialAnalytics.tsx
**Backend:** land-suitability-router.ts, spatial-router.ts

**Flow:**
1. Analyze soil characteristics
2. Analyze climate data
3. Calculate suitability score
4. Generate recommendations
5. Save assessment
6. Push to Lakehouse

### Journey 8: Cooperative Management and Revenue Distribution
**UI Pages:** CooperativeDashboard.tsx, PortfolioAtRiskDashboard.tsx
**Backend:** cooperative-router.ts, tigerbeetle-ledger.ts

**Flow:**
1. Process payments to each member (70% distribution)
2. Record cooperative fund (20%)
3. Send notifications to members
4. Push to Lakehouse

### Journey 9: Loan Disbursement and Repayment Tracking
**UI Pages:** AdminDisbursements.tsx, RepaymentTracking.tsx, MyLoans.tsx
**Backend:** disbursement-router.ts, microfinance-router.ts

**Flow:**
1. Create loan record
2. Create TigerBeetle ledger entries
3. Process bank transfer
4. Generate repayment schedule
5. Sync to ERPNext
6. Send disbursement notification
7. Push to Lakehouse

### Journey 10: Weather-Indexed Crop Insurance
**UI Pages:** RiskComplianceDashboard.tsx
**Backend:** crop-insurance-service.ts, weather-router.ts

**Flow:**
1. Assess farm risk
2. Create insurance policy
3. Process premium payment via TigerBeetle
4. Set up weather monitoring
5. Send policy confirmation
6. Push to Lakehouse

### Journey 11: Input Financing for Farmers
**UI Pages:** FarmerFinancialProfile.tsx, InputYieldAnalytics.tsx
**Backend:** input-financing-service.ts, microfinance-router.ts

**Flow:**
1. Check farmer eligibility
2. Create financing record
3. Create input orders
4. Create TigerBeetle ledger entry
5. Sync to ERPNext
6. Send notification
7. Push to Lakehouse

### Journey 12: Harvest Recording and Quality Grading
**UI Pages:** Harvests.tsx, AIDiagnostics.tsx
**Backend:** harvest activities, ml-models-router.ts

**Flow:**
1. Record harvest
2. Grade produce quality using ML
3. Get current market price
4. Update harvest with grade and value
5. Generate storage recommendation
6. Push to Lakehouse
7. Send notification

### Journey 13: Agent Task Assignment and Verification
**UI Pages:** AgentTasksDashboard.tsx, FieldAgentDashboard.tsx
**Backend:** agent-productivity-router.ts

**Flow:**
1. Create task
2. Send notification to agent
3. Push to Lakehouse

### Journey 14: KYC Verification Process
**UI Pages:** KycVerification.tsx, KycAdminDashboard.tsx
**Backend:** kyc-router.ts, kyc-service.ts

**Flow:**
1. Process documents
2. Verify identity
3. Calculate KYC score and tier
4. Update farmer KYC status
5. Sync to Permify for authorization
6. Send notification
7. Push to Lakehouse

### Journey 15: Carbon Credit Registration
**UI Pages:** SustainabilityDashboard.tsx
**Backend:** carbon-credit-service.ts

**Flow:**
1. Register carbon project
2. Calculate estimated credits
3. Get carbon credit market price
4. Create verification request
5. Push to Lakehouse
6. Send notification

### Journey 16: Traceability Chain Creation
**UI Pages:** TraceabilityDashboard.tsx
**Backend:** traceability-router.ts

**Flow:**
1. Create traceability record
2. Link harvest to traceability
3. Generate QR code
4. Create blockchain record
5. Push to Lakehouse

### Journey 17: Weather Alert and Advisory
**UI Pages:** WeatherDashboard.tsx, NotificationCenter.tsx
**Backend:** weather-router.ts, voice-advisory-service.ts

**Flow:**
1. Create weather alert
2. Get affected crops
3. Generate recommendations
4. Send multi-channel notifications (SMS, Voice)
5. Check insurance triggers
6. Push to Lakehouse

### Journey 18: Expense Tracking and Budgeting
**UI Pages:** Expenses.tsx, FinancialReports.tsx
**Backend:** expense activities, accounting services

**Flow:**
1. Record expense
2. Create TigerBeetle ledger entry
3. Get budget status
4. Get category and monthly totals
5. Check budget alerts
6. Sync to ERPNext
7. Push to Lakehouse

### Journey 19: Analytics Dashboard Generation
**UI Pages:** Analytics.tsx, AdvancedAnalytics.tsx, InputYieldAnalytics.tsx
**Backend:** analytics-router.ts, analytics-service.ts

**Flow:**
1. Fetch data from Lakehouse
2. Calculate metrics
3. Generate insights using ML
4. Generate report
5. Cache report in Redis
6. Send notification

### Journey 20: Multi-Crop Season Planning
**UI Pages:** Crops.tsx, MultiFarmDashboard.tsx, CropWizard.tsx
**Backend:** crop activities, land-suitability-router.ts

**Flow:**
1. Create season record
2. For each crop: check suitability, create record, predict yield, forecast price
3. Generate season recommendations
4. Sync to ERPNext
5. Push to Lakehouse
6. Send notification

## Running the Orchestrator

```bash
cd services/orchestrator
go build -o orchestrator .
./orchestrator
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| TEMPORAL_HOST | localhost:7233 | Temporal server address |
| TEMPORAL_NAMESPACE | default | Temporal namespace |
| KAFKA_BROKERS | localhost:9092 | Kafka broker addresses |
| REDIS_ADDR | localhost:6379 | Redis server address |
| DATABASE_URL | postgresql://localhost:5432/farmer_db | PostgreSQL connection |
| DAPR_HTTP_PORT | 3500 | Dapr sidecar port |
| KEYCLOAK_URL | http://localhost:8080 | Keycloak server |
| PERMIFY_URL | http://localhost:3476 | Permify server |
| TIGERBEETLE_ADDR | localhost:3001 | TigerBeetle address |
| LAKEHOUSE_URL | http://localhost:8000 | Lakehouse endpoint |

## File Structure

```
services/orchestrator/
├── main.go                           # Entry point, registers workflows and activities
├── middleware/
│   └── manager.go                    # Middleware connection manager
├── workflows/
│   └── workflows.go                  # 30 crop-specific workflows
├── user_journeys/
│   ├── journeys.go                   # User journeys 1-8
│   └── journeys_continued.go         # User journeys 9-20
├── activities/
│   ├── auth_activities.go            # Authentication activities
│   ├── farm_activities.go            # Farm management activities
│   ├── crop_activities.go            # Crop management activities
│   ├── marketplace_activities.go     # Marketplace activities
│   ├── financial_activities.go       # Financial activities
│   ├── ml_activities.go              # ML/AI activities
│   ├── notification_activities.go    # Notification activities
│   ├── logistics_activities.go       # Logistics activities
│   ├── quality_activities.go         # Quality control activities
│   ├── compliance_activities.go      # Compliance activities
│   ├── analytics_activities.go       # Analytics activities
│   └── extended_activities.go        # Extended activities for user journeys
└── USER_JOURNEYS_README.md           # This documentation
```

## Total Workflows Registered

- **30 Crop Workflows** (Ginger, Palm Oil, Cocoa, Cassava, Yam, Rice, Maize, Soybean, Groundnut, Cotton, Multi-crop)
- **20 User Journey Workflows** (Onboarding, Geotagging, Loans, Marketplace, etc.)
- **Total: 50 Workflows**

## Total Activity Types

- **11 Core Activity Types** (Auth, Farm, Crop, Marketplace, Financial, ML, Notification, Logistics, Quality, Compliance, Analytics)
- **4 Extended Activity Types** (Farmer, GPS, Loan, Weather)
- **Total: 15 Activity Types**
