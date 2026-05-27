# 10 End-to-End User Journeys for USSD/SMS/WhatsApp

**Platform:** Farmer Data Collection  
**Channels:** USSD, SMS, WhatsApp, Voice  
**Date:** November 25, 2025

## Journey 1: New Farmer Registration & First Harvest

**Persona:** Amina, 35, cassava farmer in Kano, Nigeria  
**Device:** Feature phone (Nokia 105)  
**Channel:** USSD

### Journey Steps

1. **Discovery** - Amina dials *384# (USSD shortcode)
2. **Welcome** - System shows welcome menu in Hausa
3. **Registration** - Selects "Register" → Enters name → Receives OTP
4. **Verification** - Enters 6-digit code → Account created
5. **Farm Setup** - Creates farm profile (name, size, location)
6. **First Harvest** - Records cassava harvest (500kg, ₦50,000)
7. **Confirmation** - Receives SMS confirmation with harvest ID

### Required Features

**Existing:**
- ✅ USSD menu system (messaging-router.ts)
- ✅ registerUserByPhone (messaging-service.ts)
- ✅ verifyPhoneNumber (messaging-service.ts)
- ✅ createHarvest (messaging-service.ts)
- ✅ SMS notification (Africa's Talking)

**Missing:**
- ❌ Farm creation via USSD
- ❌ GPS location capture via USSD
- ❌ Temporal workflow for registration journey
- ❌ TigerBeetle ledger entry for harvest value

### Temporal Workflow

```
RegisterAndHarvestWorkflow
├─ Activity: CreateUserAccount
├─ Activity: SendOTP
├─ Activity: VerifyOTP
├─ Activity: CreateFarmProfile
├─ Activity: RecordHarvest
├─ Activity: CreateLedgerEntry (TigerBeetle)
├─ Activity: SendConfirmationSMS
└─ Activity: LogToLakehouse
```

---

## Journey 2: Daily Expense Tracking via SMS

**Persona:** Chidi, 42, maize farmer in Enugu  
**Device:** Basic smartphone  
**Channel:** SMS

### Journey Steps

1. **Morning Expense** - SMS: "EXPENSE Fertilizer 15000 Bought NPK for north field"
2. **Processing** - System parses command → Creates expense record
3. **Confirmation** - SMS reply: "Expense recorded: ₦15,000 for Fertilizer"
4. **Afternoon Expense** - SMS: "EXPENSE Labor 8000 Hired 2 workers"
5. **Daily Summary** - SMS: "BALANCE" → Receives total expenses for the day
6. **Weekly Report** - Every Sunday, receives SMS with weekly expense breakdown

### Required Features

**Existing:**
- ✅ SMS command parsing (messaging-router.ts)
- ✅ createExpense (messaging-service.ts)
- ✅ getFinancialSummary (messaging-service.ts)

**Missing:**
- ❌ Scheduled SMS reports
- ❌ Temporal workflow for expense tracking
- ❌ TigerBeetle double-entry bookkeeping
- ❌ Lakehouse analytics aggregation

### Temporal Workflow

```
DailyExpenseTrackingWorkflow
├─ Activity: ParseSMSCommand
├─ Activity: ValidateExpense
├─ Activity: RecordExpense
├─ Activity: CreateLedgerEntry (TigerBeetle)
├─ Activity: SendConfirmation
├─ Activity: UpdateDailySummary
├─ Schedule: WeeklyReportCron
│   ├─ Activity: AggregateWeeklyExpenses (Lakehouse)
│   └─ Activity: SendWeeklySMS
└─ Activity: LogToKafka
```

---

## Journey 3: Marketplace Sale via WhatsApp

**Persona:** Fatima, 28, tomato farmer in Kaduna  
**Device:** Smartphone (Android)  
**Channel:** WhatsApp

### Journey Steps

1. **List Product** - WhatsApp: "I want to sell 200kg of tomatoes at ₦300/kg"
2. **AI Processing** - GPT-4 extracts: product=tomatoes, quantity=200, unit=kg, price=300
3. **Photo Upload** - Sends photo of tomatoes → AI quality check
4. **Listing Created** - WhatsApp: "✅ Your listing is live! ID: #TOM-1234"
5. **Buyer Inquiry** - Receives WhatsApp: "Buyer Musa wants 50kg. Accept?"
6. **Accept Order** - WhatsApp: "Yes" → Order confirmed
7. **Payment** - Receives notification: "₦15,000 credited to your account"
8. **Delivery** - Updates status: "Delivered" → Funds released

### Required Features

**Existing:**
- ✅ WhatsApp conversational AI (messaging-router.ts)
- ✅ createListing (messaging-service.ts)
- ✅ createOrder (messaging-service.ts)
- ✅ GPT-4 Vision for image analysis

**Missing:**
- ❌ WhatsApp media upload handler
- ❌ Payment integration (TigerBeetle)
- ❌ Escrow system
- ❌ Delivery tracking
- ❌ Temporal workflow for order lifecycle

### Temporal Workflow

```
MarketplaceSaleWorkflow
├─ Activity: ParseWhatsAppMessage (GPT-4)
├─ Activity: ProcessProductImage (Go image-service)
├─ Activity: CreateListing
├─ Signal: BuyerInquiry
├─ Activity: SendSellerNotification
├─ Signal: SellerAcceptance
├─ Activity: CreateOrder
├─ Activity: InitiateEscrow (TigerBeetle)
├─ Signal: DeliveryConfirmation
├─ Activity: ReleaseFunds (TigerBeetle)
├─ Activity: SendPaymentNotification
└─ Activity: LogToLakehouse
```

---

## Journey 4: Weather-Based Planting Advisory

**Persona:** Ibrahim, 50, rice farmer in Katsina  
**Device:** Feature phone  
**Channel:** USSD + SMS

### Journey Steps

1. **Check Weather** - Dials *384# → Selects "Weather Forecast"
2. **Location** - System uses saved farm GPS coordinates
3. **7-Day Forecast** - USSD displays: "Rain expected in 3 days. Good for planting."
4. **Planting Decision** - USSD: "Record planting?" → Selects "Yes"
5. **Crop Selection** - Selects "Rice" → Enters area (2 hectares)
6. **Advisory SMS** - Receives SMS: "Plant rice seeds 2-3cm deep. Water daily for 7 days."
7. **Reminder** - Daily SMS reminders for watering (7 days)
8. **Follow-up** - After 7 days, SMS: "Check seedlings. Report any issues via USSD."

### Required Features

**Existing:**
- ✅ USSD menu system
- ✅ Weather API integration (Open-Meteo)
- ✅ Farm GPS coordinates

**Missing:**
- ❌ Crop planting records
- ❌ Scheduled SMS reminders
- ❌ Crop advisory database
- ❌ Temporal workflow for planting journey

### Temporal Workflow

```
PlantingAdvisoryWorkflow
├─ Activity: FetchWeatherForecast (Open-Meteo API)
├─ Activity: AnalyzePlantingConditions
├─ Activity: SendUSSDForecast
├─ Signal: UserPlantsDecision
├─ Activity: RecordPlanting
├─ Activity: SendPlantingAdvisory
├─ Schedule: DailyReminderCron (7 days)
│   ├─ Activity: SendWateringReminder
│   └─ Activity: CheckReminderCount
├─ Activity: SendFollowUpSMS (Day 8)
└─ Activity: LogToLakehouse
```

---

## Journey 5: Loan Application & Repayment

**Persona:** Ngozi, 38, cassava farmer in Anambra  
**Device:** Smartphone  
**Channel:** WhatsApp

### Journey Steps

1. **Loan Inquiry** - WhatsApp: "I need a loan for fertilizer"
2. **Eligibility Check** - System checks: harvest history, repayment record, farm size
3. **Offer** - WhatsApp: "You qualify for ₦50,000 at 5% interest. Accept?"
4. **Acceptance** - WhatsApp: "Yes" → Loan agreement sent
5. **Disbursement** - ₦50,000 credited to account (TigerBeetle ledger)
6. **Purchase** - Uses loan to buy fertilizer via marketplace
7. **Harvest** - Records harvest after 3 months
8. **Auto-Repayment** - 20% of harvest sale auto-deducted for loan repayment
9. **Completion** - After 5 months: "Loan fully repaid! ✅"

### Required Features

**Existing:**
- ✅ WhatsApp conversational AI
- ✅ Harvest records
- ✅ Expense records
- ✅ Financial summary

**Missing:**
- ❌ Loan management system
- ❌ Credit scoring algorithm
- ❌ TigerBeetle ledger for loans
- ❌ Auto-repayment logic
- ❌ Temporal workflow for loan lifecycle

### Temporal Workflow

```
LoanApplicationWorkflow
├─ Activity: ParseLoanRequest (GPT-4)
├─ Activity: CalculateCreditScore (ML service)
├─ Activity: DetermineLoanOffer
├─ Activity: SendOfferWhatsApp
├─ Signal: UserAcceptance
├─ Activity: CreateLoanAccount (TigerBeetle)
├─ Activity: DisburseFunds (TigerBeetle)
├─ Activity: SendConfirmation
├─ Schedule: MonthlyRepaymentCheck
│   ├─ Activity: CheckHarvestSales
│   ├─ Activity: DeductRepayment (TigerBeetle)
│   └─ Activity: SendRepaymentReceipt
├─ Activity: MarkLoanComplete
└─ Activity: LogToLakehouse
```

---

## Journey 6: Crop Disease Detection & Treatment

**Persona:** Adamu, 45, maize farmer in Sokoto  
**Device:** Smartphone  
**Channel:** WhatsApp

### Journey Steps

1. **Problem Discovery** - Notices yellow leaves on maize plants
2. **Photo Upload** - WhatsApp: "My maize leaves are turning yellow" + photo
3. **AI Diagnosis** - GPT-4 Vision analyzes: "Nitrogen deficiency detected"
4. **Treatment Plan** - WhatsApp: "Apply urea fertilizer (20kg/hectare). Cost: ₦8,000"
5. **Purchase** - WhatsApp: "Buy fertilizer" → Marketplace listing shown
6. **Order** - Selects product → Order placed
7. **Delivery** - Receives fertilizer in 2 days
8. **Application** - Records expense: "EXPENSE Fertilizer 8000 Urea for nitrogen deficiency"
9. **Follow-up** - After 1 week, WhatsApp: "Upload new photo to check improvement"
10. **Recovery** - Uploads photo → AI confirms: "Plants recovering well ✅"

### Required Features

**Existing:**
- ✅ WhatsApp media upload
- ✅ GPT-4 Vision integration
- ✅ Marketplace integration
- ✅ Expense tracking

**Missing:**
- ❌ Crop disease database
- ❌ Treatment recommendation engine
- ❌ Follow-up scheduling
- ❌ Temporal workflow for disease management

### Temporal Workflow

```
CropDiseaseManagementWorkflow
├─ Activity: ReceiveWhatsAppImage
├─ Activity: AnalyzeImage (GPT-4 Vision)
├─ Activity: DiagnoseDiseaseML (Python ML service)
├─ Activity: RecommendTreatment
├─ Activity: SendTreatmentPlan
├─ Signal: UserPurchaseIntent
├─ Activity: ShowMarketplaceListings
├─ Activity: ProcessOrder
├─ Signal: ExpenseRecorded
├─ Schedule: FollowUpReminder (7 days)
├─ Activity: RequestFollowUpPhoto
├─ Activity: AnalyzeRecovery
└─ Activity: LogToLakehouse
```

---

## Journey 7: Group Savings & Investment

**Persona:** Cooperative of 20 farmers in Oyo State  
**Device:** Mixed (feature phones + smartphones)  
**Channel:** USSD + SMS + WhatsApp

### Journey Steps

1. **Group Creation** - Leader creates group via WhatsApp: "Create savings group: Oyo Farmers Cooperative"
2. **Member Invitation** - System sends SMS to 20 members: "Join Oyo Farmers Cooperative? Reply YES"
3. **Acceptance** - Members reply via SMS or USSD
4. **Weekly Contributions** - Every Friday, SMS reminder: "Contribute ₦1,000 to group savings"
5. **Payment** - Members send via USSD or WhatsApp: "PAY GROUP 1000"
6. **Tracking** - Leader receives weekly SMS: "15/20 members paid. Total: ₦15,000"
7. **Investment** - After 3 months, group votes via USSD: "Buy tractor? YES/NO"
8. **Purchase** - Majority votes YES → Group funds used to buy tractor
9. **Usage** - Members book tractor via USSD: "BOOK TRACTOR Dec 1"
10. **Revenue** - Tractor rental income distributed monthly via TigerBeetle

### Required Features

**Existing:**
- ✅ User accounts
- ✅ USSD, SMS, WhatsApp channels

**Missing:**
- ❌ Group management system
- ❌ Savings accounts (TigerBeetle)
- ❌ Voting system
- ❌ Asset management
- ❌ Booking system
- ❌ Revenue distribution
- ❌ Temporal workflow for group operations

### Temporal Workflow

```
GroupSavingsWorkflow
├─ Activity: CreateGroup
├─ Activity: InviteMembers (SMS)
├─ Signal: MemberAcceptance (multiple)
├─ Schedule: WeeklyContributionReminder
│   ├─ Activity: SendReminderSMS
│   └─ Activity: TrackContributions
├─ Activity: UpdateGroupBalance (TigerBeetle)
├─ Signal: InvestmentProposal
├─ Activity: InitiateVoting (USSD)
├─ Activity: TallyVotes
├─ Activity: ProcessInvestment (TigerBeetle)
├─ Activity: UpdateAssetRegistry
├─ Schedule: MonthlyRevenueDistribution
│   ├─ Activity: CalculateRevenue
│   └─ Activity: DistributeFunds (TigerBeetle)
└─ Activity: LogToLakehouse
```

---

## Journey 8: Insurance Claim Processing

**Persona:** Halima, 33, rice farmer in Kebbi  
**Device:** Feature phone  
**Channel:** USSD + SMS

### Journey Steps

1. **Disaster** - Flood destroys 50% of rice crop
2. **Claim Initiation** - Dials *384# → "File Insurance Claim"
3. **Details** - USSD form: Crop type, damage %, estimated loss
4. **Photo Evidence** - SMS: "Send photo to WhatsApp: +234-XXX-XXXX"
5. **Upload** - Sends 3 photos of flooded field via WhatsApp
6. **AI Assessment** - GPT-4 Vision confirms flood damage
7. **Verification** - Insurance agent receives alert → Reviews claim
8. **Approval** - SMS: "Claim approved! ₦120,000 will be paid in 3 days"
9. **Payment** - Funds credited to account (TigerBeetle)
10. **Confirmation** - SMS: "Insurance payment received. Balance: ₦120,000"

### Required Features

**Existing:**
- ✅ USSD menu system
- ✅ WhatsApp media upload
- ✅ GPT-4 Vision

**Missing:**
- ❌ Insurance policy management
- ❌ Claims database
- ❌ Agent workflow
- ❌ Payment integration (TigerBeetle)
- ❌ Temporal workflow for claims processing

### Temporal Workflow

```
InsuranceClaimWorkflow
├─ Activity: InitiateClaim (USSD)
├─ Activity: CollectClaimDetails
├─ Activity: RequestPhotoEvidence (SMS)
├─ Signal: PhotoReceived (WhatsApp)
├─ Activity: AnalyzeDamage (GPT-4 Vision)
├─ Activity: CalculateClaimAmount
├─ Activity: AssignToAgent
├─ Activity: NotifyAgent
├─ Signal: AgentApproval
├─ Activity: ProcessPayment (TigerBeetle)
├─ Activity: SendConfirmationSMS
└─ Activity: LogToLakehouse
```

---

## Journey 9: Market Price Discovery & Negotiation

**Persona:** Yusuf, 40, onion farmer in Kano  
**Device:** Basic smartphone  
**Channel:** SMS + WhatsApp

### Journey Steps

1. **Price Check** - SMS: "PRICE Onions" → Receives: "Avg: ₦250/kg, High: ₦300, Low: ₦200"
2. **Listing** - WhatsApp: "Sell 500kg onions at ₦280/kg"
3. **Buyer Offers** - Receives 3 offers: ₦260, ₦270, ₦275
4. **Counter-Offer** - WhatsApp: "Counter ₦275 with ₦280"
5. **Negotiation** - Buyer: "₦277 final offer"
6. **Acceptance** - WhatsApp: "Accept ₦277" → Order confirmed
7. **Delivery** - Buyer sends location via WhatsApp
8. **Payment** - Escrow: ₦138,500 held (TigerBeetle)
9. **Delivery Confirmation** - Both parties confirm via SMS
10. **Release** - Funds released to Yusuf's account

### Required Features

**Existing:**
- ✅ SMS commands
- ✅ WhatsApp messaging
- ✅ Marketplace listings
- ✅ Order creation

**Missing:**
- ❌ Price discovery API (Lakehouse analytics)
- ❌ Negotiation system
- ❌ Escrow (TigerBeetle)
- ❌ Delivery tracking
- ❌ Temporal workflow for negotiation

### Temporal Workflow

```
MarketNegotiationWorkflow
├─ Activity: FetchMarketPrices (Lakehouse)
├─ Activity: SendPriceSMS
├─ Activity: CreateListing
├─ Signal: BuyerOffer (multiple)
├─ Activity: NotifySellerOffers
├─ Signal: SellerCounterOffer
├─ Activity: SendCounterToBuyer
├─ Signal: BuyerFinalOffer
├─ Signal: SellerAcceptance
├─ Activity: CreateOrder
├─ Activity: InitiateEscrow (TigerBeetle)
├─ Signal: DeliveryConfirmation (both parties)
├─ Activity: ReleaseFunds (TigerBeetle)
└─ Activity: LogToLakehouse
```

---

## Journey 10: Annual Farm Performance Report

**Persona:** Emeka, 55, multi-crop farmer in Imo  
**Device:** Smartphone  
**Channel:** WhatsApp

### Journey Steps

1. **Year-End** - December 31, automatic trigger
2. **Data Aggregation** - System compiles: 12 harvests, 150 expenses, 8 sales
3. **Analytics** - Lakehouse processes: revenue, costs, profit, yield trends
4. **Report Generation** - PDF created with charts and insights
5. **WhatsApp Delivery** - "📊 Your 2025 Farm Report is ready!" + PDF attachment
6. **Review** - Emeka reviews: Total revenue ₦850,000, Profit ₦320,000, ROI 60%
7. **Insights** - "Top crop: Cassava (₦400k). Recommendation: Increase cassava by 20%"
8. **Planning** - WhatsApp: "Create 2026 plan based on recommendations"
9. **Plan Creation** - System generates planting calendar for 2026
10. **Approval** - Emeka approves → Calendar saved, reminders scheduled

### Required Features

**Existing:**
- ✅ Harvest records
- ✅ Expense records
- ✅ Sales records
- ✅ WhatsApp messaging

**Missing:**
- ❌ Annual report generation
- ❌ Lakehouse analytics
- ❌ PDF generation with charts
- ❌ ML recommendations
- ❌ Planting calendar
- ❌ Temporal workflow for annual reporting

### Temporal Workflow

```
AnnualReportWorkflow
├─ Schedule: YearEndTrigger (Dec 31)
├─ Activity: AggregateYearData (Lakehouse)
├─ Activity: CalculateMetrics
├─ Activity: GenerateCharts (Python)
├─ Activity: CreatePDFReport
├─ Activity: GenerateMLRecommendations (Python ML)
├─ Activity: SendWhatsAppReport
├─ Signal: UserRequestsPlan
├─ Activity: GeneratePlantingCalendar
├─ Activity: ScheduleReminders (Temporal)
└─ Activity: LogToLakehouse
```

---

## Summary of Required Implementations

### Database Tables (New)
1. farm_profiles - Farm creation via USSD
2. planting_records - Crop planting tracking
3. loan_accounts - Loan management
4. group_savings - Cooperative savings
5. insurance_policies - Insurance management
6. insurance_claims - Claims processing
7. negotiations - Price negotiation history
8. planting_calendars - Annual planning

### Temporal Workflows (10 New)
1. RegisterAndHarvestWorkflow
2. DailyExpenseTrackingWorkflow
3. MarketplaceSaleWorkflow
4. PlantingAdvisoryWorkflow
5. LoanApplicationWorkflow
6. CropDiseaseManagementWorkflow
7. GroupSavingsWorkflow
8. InsuranceClaimWorkflow
9. MarketNegotiationWorkflow
10. AnnualReportWorkflow

### Middleware Integration
1. **TigerBeetle** - Financial ledger for all transactions
2. **Lakehouse** - Analytics and reporting
3. **Temporal** - Workflow orchestration
4. **Kafka** - Event streaming for all activities
5. **Dapr** - Service mesh coordination
6. **Keycloak** - User authentication
7. **Permify** - Authorization policies
8. **Redis** - Session and cache management
9. **APISIX** - API gateway for all services
10. **Fluvio** - Real-time event streaming

### UI/UX Updates

**PWA:**
- Journey tracking dashboard
- Multi-channel inbox (USSD/SMS/WhatsApp)
- Loan management interface
- Group savings dashboard
- Insurance claims portal
- Annual report viewer

**Mobile:**
- Journey progress tracker
- USSD simulator
- SMS conversation view
- WhatsApp integration
- Loan application flow
- Group management screens
