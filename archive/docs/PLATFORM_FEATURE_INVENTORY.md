# Platform Feature Inventory

**Generated:** November 25, 2025  
**Purpose:** Validate existing features for user journey implementation

## Database Tables (28 tables)

### Core User Management
- ✅ users - User accounts
- ✅ farmers - Farmer profiles
- ✅ phoneUserMapping - Phone number to user mapping
- ✅ messagingSessions - USSD/SMS/WhatsApp session state
- ✅ messageLogs - Message audit trail

### Farm Operations
- ✅ farms - Farm profiles with GPS
- ✅ crops - Crop cultivation records
- ✅ livestock - Livestock management
- ✅ farmInputs - Seeds, fertilizers, pesticides
- ✅ harvests - Harvest records
- ✅ expenses - Farm expenses

### Marketplace
- ✅ produceListings - Product listings
- ✅ marketplaceOrders - Orders
- ✅ orderItems - Order line items
- ✅ buyerProfiles - Buyer information
- ✅ marketplaceReviews - Product reviews
- ✅ shoppingCartItems - Shopping cart
- ✅ marketplaceMessages - Buyer-seller chat
- ✅ productReviews - Detailed reviews
- ✅ reviewVotes - Helpful/unhelpful votes
- ✅ sellerRatings - Seller reputation
- ✅ reviewResponses - Seller responses

### System
- ✅ auditLogs - Audit trail
- ✅ accountBalances - Financial balances
- ✅ exportSchedules - Data export schedules
- ✅ notificationQueue - Push notifications
- ✅ alertThresholds - Alert configuration
- ✅ alertHistory - Alert history

## Messaging Service Functions (14 functions)

### Authentication
- ✅ getUserByPhone - Get user by phone number
- ✅ registerUserByPhone - Register new user
- ✅ verifyPhoneNumber - Verify OTP code
- ✅ resendVerificationCode - Resend OTP

### Farm Operations
- ✅ createHarvest - Record harvest
- ✅ getRecentHarvests - List harvests
- ✅ createExpense - Record expense
- ✅ getRecentExpenses - List expenses
- ✅ getFinancialSummary - Financial reports

### Marketplace
- ✅ createListing - Create product listing
- ✅ getMarketplaceListings - Browse products
- ✅ getListingById - Get product details
- ✅ createOrder - Place order
- ✅ getMyOrders - Order history

## Messaging Channels

### USSD (Implemented)
- ✅ Interactive menu system
- ✅ Multi-step data entry
- ✅ Session state management
- ✅ Multi-language (EN, HA, YO, IG)
- ✅ Navigation (back, home, help)

### SMS (Implemented)
- ✅ Command-based interaction
- ✅ REGISTER, HARVEST, EXPENSE, LIST, MARKET, ORDERS, BALANCE, HELP
- ✅ Multi-word parameters
- ✅ Error messages

### WhatsApp (Implemented)
- ✅ Conversational AI
- ✅ Natural language parsing
- ✅ Rich formatting (emojis, bold, lists)
- ✅ Context-aware responses
- ✅ Media upload support

### Voice (Implemented)
- ✅ IVR system
- ✅ DTMF input
- ✅ Voice recording
- ✅ Text-to-speech
- ✅ Multi-language prompts

## Microservices (Go/Python)

### Go Services
- ✅ image-service - Image processing
- ✅ realtime-service - WebSocket server
- ✅ dapr-service - Dapr integration
- ✅ apisix-gateway - API Gateway
- ✅ fluvio-streaming - Event streaming

### Python Services
- ✅ ml-service - Crop yield prediction, price forecasting
- ✅ temporal-workflows - Order processing, data export, report generation

## Middleware Integration

### Currently Integrated
- ✅ Redis - Caching
- ✅ Kafka - Event streaming
- ✅ PostgreSQL - Primary database

### Partially Integrated
- ⚠️ Keycloak - SSO (configured, not fully used)
- ⚠️ Permify - Authorization (configured, not fully used)
- ⚠️ Dapr - Service mesh (service exists, not orchestrated)
- ⚠️ APISIX - API Gateway (service exists, not orchestrated)
- ⚠️ Fluvio - Streaming (service exists, not orchestrated)
- ⚠️ Temporal - Workflows (basic workflows, needs orchestration)

### Not Integrated
- ❌ TigerBeetle - Ledger (not implemented)
- ❌ Lakehouse - Data warehouse (not implemented)

## Frontend (PWA)

### Pages
- ✅ Dashboard - Overview
- ✅ Farmers - Farmer management
- ✅ Farms - Farm management
- ✅ Crops - Crop tracking
- ✅ Livestock - Livestock management
- ✅ Harvests - Harvest records
- ✅ Expenses - Expense tracking
- ✅ Marketplace - Product browsing
- ✅ Analytics - Multi-channel analytics
- ✅ Reports - Financial reports

### Missing for User Journeys
- ❌ USSD session viewer
- ❌ SMS conversation history
- ❌ WhatsApp chat interface
- ❌ Journey tracking dashboard
- ❌ Multi-channel unified inbox

## Mobile App

### Screens (22 screens)
- ✅ Authentication (Login, Register)
- ✅ Home Dashboard
- ✅ Harvests (List, Detail, Create, Edit)
- ✅ Expenses (List, Detail, Create, Edit)
- ✅ Marketplace (Browse, Detail, Cart, Checkout, Orders)
- ✅ ML Tools (Yield Prediction, Price Forecast)
- ✅ Profile (Profile, Settings)

### Missing for User Journeys
- ❌ USSD simulator
- ❌ SMS conversation view
- ❌ WhatsApp integration
- ❌ Journey progress tracker

## Gaps for User Journey Implementation

### Critical Missing Features
1. **Temporal Orchestrator** - No unified orchestration layer
2. **TigerBeetle Integration** - No financial ledger
3. **Lakehouse Integration** - No data warehouse
4. **Journey Tracking** - No user journey state management
5. **Multi-Channel Inbox** - No unified message view
6. **Middleware Orchestration** - Services exist but not coordinated

### Required Implementations
1. Create Temporal orchestration workflows for 10 user journeys
2. Implement TigerBeetle for financial transactions
3. Set up Lakehouse for analytics
4. Build journey tracking system
5. Create unified messaging interface (PWA + Mobile)
6. Integrate all middleware services with orchestrator
