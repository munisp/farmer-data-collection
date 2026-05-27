package user_journeys

import (
	"time"

	"go.temporal.io/sdk/workflow"
	"orchestrator/activities"
	"orchestrator/middleware"
)

// ============================================================================
// TOP 20 USER JOURNEYS FOR AGRICULTURAL FINANCE PLATFORM
// Each journey integrates with: Kafka, Dapr, Fluvio, Redis, APISIX,
// Keycloak, Permify, TigerBeetle, Lakehouse, PostgreSQL
// ============================================================================

// Journey 1: Farmer Onboarding with KYC and ERPNext Sync
// UI: FarmerOnboardingWizard.tsx, QuickFarmerRegistration.tsx
// Backend: kyc-router.ts, erpnext-router.ts, keycloak-service.ts
type FarmerOnboardingInput struct {
	FirstName       string                 `json:"first_name"`
	LastName        string                 `json:"last_name"`
	PhoneNumber     string                 `json:"phone_number"`
	Email           string                 `json:"email"`
	NationalID      string                 `json:"national_id"`
	Location        string                 `json:"location"`
	FarmDetails     []FarmRegistration     `json:"farm_details"`
	KYCDocuments    []KYCDocument          `json:"kyc_documents"`
	Metadata        map[string]interface{} `json:"metadata"`
}

type FarmRegistration struct {
	FarmName     string  `json:"farm_name"`
	FarmSize     float64 `json:"farm_size"`
	FarmSizeUnit string  `json:"farm_size_unit"`
	Location     string  `json:"location"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	SoilType     string  `json:"soil_type"`
}

type KYCDocument struct {
	DocumentType string `json:"document_type"`
	DocumentURL  string `json:"document_url"`
}

type FarmerOnboardingOutput struct {
	FarmerID       int    `json:"farmer_id"`
	UserID         int    `json:"user_id"`
	KYCStatus      string `json:"kyc_status"`
	ERPNextID      string `json:"erpnext_id"`
	FarmIDs        []int  `json:"farm_ids"`
	CreditScore    int    `json:"credit_score"`
	WelcomeSent    bool   `json:"welcome_sent"`
}

func FarmerOnboardingWorkflow(ctx workflow.Context, input FarmerOnboardingInput) (*FarmerOnboardingOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Farmer Onboarding Journey", "phone", input.PhoneNumber)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Create Keycloak user (Auth)
	var authOutput activities.CreateUserOutput
	err := workflow.ExecuteActivity(ctx, "CreateUser", activities.CreateUserInput{
		Email:       input.Email,
		PhoneNumber: input.PhoneNumber,
		FirstName:   input.FirstName,
		LastName:    input.LastName,
		Role:        "farmer",
	}).Get(ctx, &authOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Create farmer record
	var farmerOutput activities.CreateFarmerOutput
	err = workflow.ExecuteActivity(ctx, "CreateFarmer", activities.CreateFarmerInput{
		UserID:      authOutput.UserID,
		FirstName:   input.FirstName,
		LastName:    input.LastName,
		PhoneNumber: input.PhoneNumber,
		Email:       input.Email,
		NationalID:  input.NationalID,
		Location:    input.Location,
	}).Get(ctx, &farmerOutput)
	if err != nil {
		return nil, err
	}

	// Step 3: Register farms
	var farmIDs []int
	for _, farm := range input.FarmDetails {
		var farmOutput activities.CreateFarmOutput
		err = workflow.ExecuteActivity(ctx, "CreateFarm", activities.CreateFarmInput{
			UserID:       authOutput.UserID,
			FarmerID:     farmerOutput.FarmerID,
			FarmName:     farm.FarmName,
			FarmSize:     farm.FarmSize,
			FarmSizeUnit: farm.FarmSizeUnit,
			Location:     farm.Location,
			Latitude:     farm.Latitude,
			Longitude:    farm.Longitude,
			SoilType:     farm.SoilType,
		}).Get(ctx, &farmOutput)
		if err != nil {
			logger.Warn("Failed to create farm", "error", err)
			continue
		}
		farmIDs = append(farmIDs, farmOutput.FarmID)
	}

	// Step 4: Process KYC documents
	var kycOutput activities.ProcessKYCOutput
	err = workflow.ExecuteActivity(ctx, "ProcessKYC", activities.ProcessKYCInput{
		FarmerID:  farmerOutput.FarmerID,
		Documents: input.KYCDocuments,
	}).Get(ctx, &kycOutput)
	if err != nil {
		logger.Warn("KYC processing failed", "error", err)
	}

	// Step 5: Calculate initial credit score
	var creditOutput activities.CalculateCreditScoreOutput
	err = workflow.ExecuteActivity(ctx, "CalculateCreditScore", activities.CalculateCreditScoreInput{
		FarmerID: farmerOutput.FarmerID,
	}).Get(ctx, &creditOutput)
	if err != nil {
		logger.Warn("Credit score calculation failed", "error", err)
	}

	// Step 6: Sync to ERPNext
	var erpOutput activities.SyncToERPNextOutput
	err = workflow.ExecuteActivity(ctx, "SyncToERPNext", activities.SyncToERPNextInput{
		FarmerID:    farmerOutput.FarmerID,
		EntityType:  "customer",
		FarmerName:  input.FirstName + " " + input.LastName,
		PhoneNumber: input.PhoneNumber,
	}).Get(ctx, &erpOutput)
	if err != nil {
		logger.Warn("ERPNext sync failed", "error", err)
	}

	// Step 7: Send welcome notification (WhatsApp/SMS)
	var notifOutput activities.SendNotificationOutput
	err = workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   authOutput.UserID,
		Title:    "Welcome to AgriFinance Platform",
		Message:  "Your account has been created. Your farmer ID is: " + string(rune(farmerOutput.FarmerID)),
		Type:     "welcome",
		Priority: "high",
	}).Get(ctx, &notifOutput)

	// Step 8: Push to Lakehouse for analytics
	var analyticsOutput activities.PushToLakehouseOutput
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "farmer_onboarded",
		EntityID:  farmerOutput.FarmerID,
		Data: map[string]interface{}{
			"farmer_id":    farmerOutput.FarmerID,
			"location":     input.Location,
			"farm_count":   len(farmIDs),
			"kyc_status":   kycOutput.Status,
			"credit_score": creditOutput.Score,
		},
	}).Get(ctx, &analyticsOutput)

	return &FarmerOnboardingOutput{
		FarmerID:    farmerOutput.FarmerID,
		UserID:      authOutput.UserID,
		KYCStatus:   kycOutput.Status,
		ERPNextID:   erpOutput.ERPNextID,
		FarmIDs:     farmIDs,
		CreditScore: creditOutput.Score,
		WelcomeSent: notifOutput.Sent,
	}, nil
}

// Journey 2: Farm Geotagging and Boundary Mapping
// UI: FarmGeotagging.tsx, GPSTracking.tsx, FarmersMapView.tsx
// Backend: gps-tracking-router.ts, spatial-router.ts
type FarmGeotaggingInput struct {
	UserID       int                `json:"user_id"`
	FarmID       int                `json:"farm_id"`
	CenterPoint  GPSCoordinate      `json:"center_point"`
	BoundaryPoints []GPSCoordinate  `json:"boundary_points"`
	AccuracyThreshold float64       `json:"accuracy_threshold"`
}

type GPSCoordinate struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Accuracy  float64 `json:"accuracy"`
	Timestamp string  `json:"timestamp"`
}

type FarmGeotaggingOutput struct {
	FarmID          int     `json:"farm_id"`
	CalculatedArea  float64 `json:"calculated_area"`
	AreaUnit        string  `json:"area_unit"`
	BoundaryValid   bool    `json:"boundary_valid"`
	SpatialRecordID int     `json:"spatial_record_id"`
}

func FarmGeotaggingWorkflow(ctx workflow.Context, input FarmGeotaggingInput) (*FarmGeotaggingOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Farm Geotagging Journey", "FarmID", input.FarmID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Validate GPS accuracy
	var validationOutput activities.ValidateGPSOutput
	err := workflow.ExecuteActivity(ctx, "ValidateGPS", activities.ValidateGPSInput{
		Coordinates:       input.BoundaryPoints,
		AccuracyThreshold: input.AccuracyThreshold,
	}).Get(ctx, &validationOutput)
	if err != nil || !validationOutput.Valid {
		return nil, workflow.NewApplicationError("GPS accuracy below threshold", "GPS_ACCURACY_ERROR", nil)
	}

	// Step 2: Save farm center point
	var centerOutput activities.SaveFarmCenterOutput
	err = workflow.ExecuteActivity(ctx, "SaveFarmCenter", activities.SaveFarmCenterInput{
		FarmID:    input.FarmID,
		Latitude:  input.CenterPoint.Latitude,
		Longitude: input.CenterPoint.Longitude,
		Accuracy:  input.CenterPoint.Accuracy,
	}).Get(ctx, &centerOutput)
	if err != nil {
		return nil, err
	}

	// Step 3: Save boundary polygon
	var boundaryOutput activities.SaveFarmBoundaryOutput
	err = workflow.ExecuteActivity(ctx, "SaveFarmBoundary", activities.SaveFarmBoundaryInput{
		FarmID:         input.FarmID,
		BoundaryPoints: input.BoundaryPoints,
	}).Get(ctx, &boundaryOutput)
	if err != nil {
		return nil, err
	}

	// Step 4: Calculate area from polygon
	var areaOutput activities.CalculateFarmAreaOutput
	err = workflow.ExecuteActivity(ctx, "CalculateFarmArea", activities.CalculateFarmAreaInput{
		FarmID:         input.FarmID,
		BoundaryPoints: input.BoundaryPoints,
	}).Get(ctx, &areaOutput)
	if err != nil {
		return nil, err
	}

	// Step 5: Create spatial record in PostGIS
	var spatialOutput activities.CreateSpatialRecordOutput
	err = workflow.ExecuteActivity(ctx, "CreateSpatialRecord", activities.CreateSpatialRecordInput{
		FarmID:         input.FarmID,
		CenterPoint:    input.CenterPoint,
		BoundaryPoints: input.BoundaryPoints,
		CalculatedArea: areaOutput.Area,
	}).Get(ctx, &spatialOutput)
	if err != nil {
		return nil, err
	}

	// Step 6: Push to Lakehouse/Sedona for spatial analytics
	var lakehouseOutput activities.PushToLakehouseOutput
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "farm_geotagged",
		EntityID:  input.FarmID,
		Data: map[string]interface{}{
			"farm_id":         input.FarmID,
			"calculated_area": areaOutput.Area,
			"boundary_points": len(input.BoundaryPoints),
			"center_lat":      input.CenterPoint.Latitude,
			"center_lng":      input.CenterPoint.Longitude,
		},
	}).Get(ctx, &lakehouseOutput)

	// Step 7: Send confirmation notification
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "Farm Boundary Saved",
		Message:  "Your farm boundary has been recorded. Calculated area: " + string(rune(int(areaOutput.Area))) + " hectares",
		Type:     "confirmation",
		Priority: "medium",
	})

	return &FarmGeotaggingOutput{
		FarmID:          input.FarmID,
		CalculatedArea:  areaOutput.Area,
		AreaUnit:        "hectares",
		BoundaryValid:   boundaryOutput.Valid,
		SpatialRecordID: spatialOutput.RecordID,
	}, nil
}

// Journey 3: Loan Application with Credit Scoring
// UI: LoanApplicationForm.tsx, BorrowerDashboard.tsx, CreditScoreView.tsx
// Backend: microfinance-router.ts, credit-scoring-router.ts, loan-application-router.ts
type LoanApplicationInput struct {
	FarmerID      int     `json:"farmer_id"`
	UserID        int     `json:"user_id"`
	LoanAmount    float64 `json:"loan_amount"`
	LoanPurpose   string  `json:"loan_purpose"`
	TermMonths    int     `json:"term_months"`
	CollateralType string `json:"collateral_type"`
	CollateralValue float64 `json:"collateral_value"`
	CropID        int     `json:"crop_id,omitempty"`
}

type LoanApplicationOutput struct {
	ApplicationID   int     `json:"application_id"`
	CreditScore     int     `json:"credit_score"`
	RiskCategory    string  `json:"risk_category"`
	ApprovedAmount  float64 `json:"approved_amount"`
	InterestRate    float64 `json:"interest_rate"`
	Status          string  `json:"status"`
	MonthlyPayment  float64 `json:"monthly_payment"`
}

func LoanApplicationWorkflow(ctx workflow.Context, input LoanApplicationInput) (*LoanApplicationOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Loan Application Journey", "FarmerID", input.FarmerID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Verify KYC status
	var kycOutput activities.CheckKYCStatusOutput
	err := workflow.ExecuteActivity(ctx, "CheckKYCStatus", activities.CheckKYCStatusInput{
		FarmerID: input.FarmerID,
	}).Get(ctx, &kycOutput)
	if err != nil || kycOutput.Status != "verified" {
		return nil, workflow.NewApplicationError("KYC verification required", "KYC_REQUIRED", nil)
	}

	// Step 2: Calculate credit score
	var creditOutput activities.CalculateCreditScoreOutput
	err = workflow.ExecuteActivity(ctx, "CalculateCreditScore", activities.CalculateCreditScoreInput{
		FarmerID: input.FarmerID,
	}).Get(ctx, &creditOutput)
	if err != nil {
		return nil, err
	}

	// Step 3: Assess risk
	var riskOutput activities.AssessRiskOutput
	err = workflow.ExecuteActivity(ctx, "AssessRisk", activities.AssessRiskInput{
		FarmerID:        input.FarmerID,
		CreditScore:     creditOutput.Score,
		LoanAmount:      input.LoanAmount,
		CollateralValue: input.CollateralValue,
	}).Get(ctx, &riskOutput)
	if err != nil {
		return nil, err
	}

	// Step 4: Create loan application
	var appOutput activities.CreateLoanApplicationOutput
	err = workflow.ExecuteActivity(ctx, "CreateLoanApplication", activities.CreateLoanApplicationInput{
		FarmerID:        input.FarmerID,
		UserID:          input.UserID,
		LoanAmount:      input.LoanAmount,
		LoanPurpose:     input.LoanPurpose,
		TermMonths:      input.TermMonths,
		CreditScore:     creditOutput.Score,
		RiskCategory:    riskOutput.Category,
		CollateralType:  input.CollateralType,
		CollateralValue: input.CollateralValue,
	}).Get(ctx, &appOutput)
	if err != nil {
		return nil, err
	}

	// Step 5: Calculate interest rate based on risk
	interestRate := calculateInterestRate(creditOutput.Score, riskOutput.Category)
	monthlyPayment := calculateMonthlyPayment(input.LoanAmount, interestRate, input.TermMonths)

	// Step 6: Create TigerBeetle ledger entry (pending)
	var ledgerOutput activities.CreateLedgerEntryOutput
	workflow.ExecuteActivity(ctx, "CreateLedgerEntry", activities.CreateLedgerEntryInput{
		AccountType:   "loan_application",
		EntityID:      appOutput.ApplicationID,
		Amount:        input.LoanAmount,
		Status:        "pending",
		TransactionType: "loan_application",
	}).Get(ctx, &ledgerOutput)

	// Step 7: Send notification
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "Loan Application Submitted",
		Message:  "Your loan application for ₦" + string(rune(int(input.LoanAmount))) + " has been submitted for review.",
		Type:     "loan_update",
		Priority: "high",
	})

	// Step 8: Push to Lakehouse for analytics
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "loan_application_submitted",
		EntityID:  appOutput.ApplicationID,
		Data: map[string]interface{}{
			"application_id": appOutput.ApplicationID,
			"farmer_id":      input.FarmerID,
			"loan_amount":    input.LoanAmount,
			"credit_score":   creditOutput.Score,
			"risk_category":  riskOutput.Category,
			"interest_rate":  interestRate,
		},
	})

	return &LoanApplicationOutput{
		ApplicationID:  appOutput.ApplicationID,
		CreditScore:    creditOutput.Score,
		RiskCategory:   riskOutput.Category,
		ApprovedAmount: input.LoanAmount,
		InterestRate:   interestRate,
		Status:         "pending_review",
		MonthlyPayment: monthlyPayment,
	}, nil
}

// Journey 4: Marketplace Listing and Order Processing
// UI: MarketplaceBrowse.tsx, MarketplaceListing.tsx, MyListings.tsx
// Backend: exchange-router.ts, marketplace activities
type MarketplaceListingInput struct {
	UserID       int     `json:"user_id"`
	FarmID       int     `json:"farm_id"`
	CropID       int     `json:"crop_id"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
	PricePerUnit float64 `json:"price_per_unit"`
	Category     string  `json:"category"`
	Images       []string `json:"images"`
}

type MarketplaceListingOutput struct {
	ListingID     int     `json:"listing_id"`
	Status        string  `json:"status"`
	TotalValue    float64 `json:"total_value"`
	QualityGrade  string  `json:"quality_grade"`
	TraceabilityID string `json:"traceability_id"`
}

func MarketplaceListingWorkflow(ctx workflow.Context, input MarketplaceListingInput) (*MarketplaceListingOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Marketplace Listing Journey", "UserID", input.UserID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Grade produce quality (ML)
	var gradeOutput activities.GradeProduceOutput
	if len(input.Images) > 0 {
		err := workflow.ExecuteActivity(ctx, "GradeProduce", activities.GradeProduceInput{
			CropID:   input.CropID,
			ImageURL: input.Images[0],
		}).Get(ctx, &gradeOutput)
		if err != nil {
			logger.Warn("Quality grading failed", "error", err)
			gradeOutput.Grade = "ungraded"
		}
	}

	// Step 2: Create traceability record
	var traceOutput activities.CreateTraceabilityOutput
	err := workflow.ExecuteActivity(ctx, "CreateTraceability", activities.CreateTraceabilityInput{
		FarmID:   input.FarmID,
		CropID:   input.CropID,
		Quantity: input.Quantity,
		Grade:    gradeOutput.Grade,
	}).Get(ctx, &traceOutput)
	if err != nil {
		logger.Warn("Traceability creation failed", "error", err)
	}

	// Step 3: Create marketplace listing
	var listingOutput activities.CreateListingOutput
	err = workflow.ExecuteActivity(ctx, "CreateListing", activities.CreateListingInput{
		UserID:       input.UserID,
		FarmID:       input.FarmID,
		CropID:       input.CropID,
		Title:        input.Title,
		Description:  input.Description,
		Quantity:     input.Quantity,
		Unit:         input.Unit,
		PricePerUnit: int(input.PricePerUnit),
		Category:     input.Category,
	}).Get(ctx, &listingOutput)
	if err != nil {
		return nil, err
	}

	// Step 4: Push to Lakehouse for analytics
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "listing_created",
		EntityID:  listingOutput.ListingID,
		Data: map[string]interface{}{
			"listing_id":     listingOutput.ListingID,
			"farm_id":        input.FarmID,
			"crop_id":        input.CropID,
			"quantity":       input.Quantity,
			"price_per_unit": input.PricePerUnit,
			"quality_grade":  gradeOutput.Grade,
			"category":       input.Category,
		},
	})

	return &MarketplaceListingOutput{
		ListingID:      listingOutput.ListingID,
		Status:         "active",
		TotalValue:     input.Quantity * input.PricePerUnit,
		QualityGrade:   gradeOutput.Grade,
		TraceabilityID: traceOutput.TraceabilityID,
	}, nil
}

// Journey 5: Order Processing with Payment via TigerBeetle
// UI: Checkout.tsx, MyOrders.tsx, MySales.tsx
// Backend: exchange-router.ts, tigerbeetle-ledger.ts
type OrderProcessingInput struct {
	BuyerID     int     `json:"buyer_id"`
	SellerID    int     `json:"seller_id"`
	ListingID   int     `json:"listing_id"`
	Quantity    float64 `json:"quantity"`
	TotalAmount float64 `json:"total_amount"`
	PaymentMethod string `json:"payment_method"`
}

type OrderProcessingOutput struct {
	OrderID       int    `json:"order_id"`
	TransactionID string `json:"transaction_id"`
	Status        string `json:"status"`
	EscrowID      string `json:"escrow_id"`
}

func OrderProcessingWorkflow(ctx workflow.Context, input OrderProcessingInput) (*OrderProcessingOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Order Processing Journey", "ListingID", input.ListingID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Verify listing availability
	var listingOutput activities.VerifyListingOutput
	err := workflow.ExecuteActivity(ctx, "VerifyListing", activities.VerifyListingInput{
		ListingID: input.ListingID,
		Quantity:  input.Quantity,
	}).Get(ctx, &listingOutput)
	if err != nil || !listingOutput.Available {
		return nil, workflow.NewApplicationError("Listing not available", "LISTING_UNAVAILABLE", nil)
	}

	// Step 2: Create order
	var orderOutput activities.CreateOrderOutput
	err = workflow.ExecuteActivity(ctx, "CreateOrder", activities.CreateOrderInput{
		BuyerID:     input.BuyerID,
		ListingID:   input.ListingID,
		Quantity:    input.Quantity,
		TotalAmount: int(input.TotalAmount),
	}).Get(ctx, &orderOutput)
	if err != nil {
		return nil, err
	}

	// Step 3: Create escrow in TigerBeetle
	var escrowOutput activities.CreateEscrowOutput
	err = workflow.ExecuteActivity(ctx, "CreateEscrow", activities.CreateEscrowInput{
		OrderID:     orderOutput.OrderID,
		BuyerID:     input.BuyerID,
		SellerID:    input.SellerID,
		Amount:      input.TotalAmount,
	}).Get(ctx, &escrowOutput)
	if err != nil {
		return nil, err
	}

	// Step 4: Process payment
	var paymentOutput activities.ProcessPaymentOutput
	err = workflow.ExecuteActivity(ctx, "ProcessPayment", activities.ProcessPaymentInput{
		OrderID:       orderOutput.OrderID,
		Amount:        int(input.TotalAmount),
		PayerID:       input.BuyerID,
		PayeeID:       input.SellerID,
		PaymentMethod: input.PaymentMethod,
	}).Get(ctx, &paymentOutput)
	if err != nil {
		return nil, err
	}

	// Step 5: Update listing quantity
	workflow.ExecuteActivity(ctx, "UpdateListingQuantity", activities.UpdateListingQuantityInput{
		ListingID:        input.ListingID,
		QuantityReserved: input.Quantity,
	})

	// Step 6: Send notifications to buyer and seller
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.BuyerID,
		Title:    "Order Confirmed",
		Message:  "Your order #" + string(rune(orderOutput.OrderID)) + " has been confirmed.",
		Type:     "order_update",
		Priority: "high",
	})

	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.SellerID,
		Title:    "New Order Received",
		Message:  "You have received a new order #" + string(rune(orderOutput.OrderID)),
		Type:     "order_update",
		Priority: "high",
	})

	// Step 7: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "order_processed",
		EntityID:  orderOutput.OrderID,
		Data: map[string]interface{}{
			"order_id":       orderOutput.OrderID,
			"buyer_id":       input.BuyerID,
			"seller_id":      input.SellerID,
			"total_amount":   input.TotalAmount,
			"payment_method": input.PaymentMethod,
		},
	})

	return &OrderProcessingOutput{
		OrderID:       orderOutput.OrderID,
		TransactionID: paymentOutput.TransactionID,
		Status:        "confirmed",
		EscrowID:      escrowOutput.EscrowID,
	}, nil
}

// Journey 6: Yield Prediction with AI/ML Models
// UI: YieldPrediction.tsx, AgriculturalModels.tsx, PrecisionAgDashboard.tsx
// Backend: ml-models-router.ts, agricultural-intelligence-router.ts
type YieldPredictionInput struct {
	UserID      int     `json:"user_id"`
	FarmID      int     `json:"farm_id"`
	CropID      int     `json:"crop_id"`
	CropName    string  `json:"crop_name"`
	AreaPlanted float64 `json:"area_planted"`
	SoilType    string  `json:"soil_type"`
	PlantingDate string `json:"planting_date"`
}

type YieldPredictionOutput struct {
	PredictionID    int     `json:"prediction_id"`
	PredictedYield  float64 `json:"predicted_yield"`
	YieldUnit       string  `json:"yield_unit"`
	Confidence      float64 `json:"confidence"`
	OptimalHarvest  string  `json:"optimal_harvest_date"`
	Recommendations []string `json:"recommendations"`
}

func YieldPredictionWorkflow(ctx workflow.Context, input YieldPredictionInput) (*YieldPredictionOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Yield Prediction Journey", "CropID", input.CropID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Get weather data
	var weatherOutput activities.GetWeatherDataOutput
	err := workflow.ExecuteActivity(ctx, "GetWeatherData", activities.GetWeatherDataInput{
		FarmID: input.FarmID,
	}).Get(ctx, &weatherOutput)
	if err != nil {
		logger.Warn("Weather data fetch failed", "error", err)
	}

	// Step 2: Get soil data
	var soilOutput activities.GetSoilDataOutput
	err = workflow.ExecuteActivity(ctx, "GetSoilData", activities.GetSoilDataInput{
		FarmID:   input.FarmID,
		SoilType: input.SoilType,
	}).Get(ctx, &soilOutput)
	if err != nil {
		logger.Warn("Soil data fetch failed", "error", err)
	}

	// Step 3: Run ML yield prediction
	var yieldOutput activities.PredictYieldOutput
	err = workflow.ExecuteActivity(ctx, "PredictYield", activities.PredictYieldInput{
		CropID:      input.CropID,
		CropName:    input.CropName,
		AreaPlanted: input.AreaPlanted,
		SoilType:    input.SoilType,
		WeatherData: weatherOutput.Data,
	}).Get(ctx, &yieldOutput)
	if err != nil {
		return nil, err
	}

	// Step 4: Calculate optimal harvest date
	var harvestOutput activities.CalculateHarvestDateOutput
	err = workflow.ExecuteActivity(ctx, "CalculateHarvestDate", activities.CalculateHarvestDateInput{
		CropName:     input.CropName,
		PlantingDate: input.PlantingDate,
		WeatherData:  weatherOutput.Data,
	}).Get(ctx, &harvestOutput)
	if err != nil {
		logger.Warn("Harvest date calculation failed", "error", err)
	}

	// Step 5: Generate recommendations
	var recsOutput activities.GenerateRecommendationsOutput
	err = workflow.ExecuteActivity(ctx, "GenerateRecommendations", activities.GenerateRecommendationsInput{
		CropName:       input.CropName,
		PredictedYield: yieldOutput.PredictedYield,
		SoilData:       soilOutput.Data,
		WeatherData:    weatherOutput.Data,
	}).Get(ctx, &recsOutput)
	if err != nil {
		logger.Warn("Recommendations generation failed", "error", err)
	}

	// Step 6: Save prediction record
	var saveOutput activities.SavePredictionOutput
	err = workflow.ExecuteActivity(ctx, "SavePrediction", activities.SavePredictionInput{
		FarmID:         input.FarmID,
		CropID:         input.CropID,
		PredictedYield: yieldOutput.PredictedYield,
		Confidence:     yieldOutput.Confidence,
	}).Get(ctx, &saveOutput)
	if err != nil {
		logger.Warn("Prediction save failed", "error", err)
	}

	// Step 7: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "yield_predicted",
		EntityID:  input.CropID,
		Data: map[string]interface{}{
			"farm_id":         input.FarmID,
			"crop_id":         input.CropID,
			"predicted_yield": yieldOutput.PredictedYield,
			"confidence":      yieldOutput.Confidence,
			"area_planted":    input.AreaPlanted,
		},
	})

	// Step 8: Send notification
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "Yield Prediction Ready",
		Message:  "Your predicted yield for " + input.CropName + " is " + string(rune(int(yieldOutput.PredictedYield))) + " tons",
		Type:     "prediction",
		Priority: "medium",
	})

	return &YieldPredictionOutput{
		PredictionID:    saveOutput.PredictionID,
		PredictedYield:  yieldOutput.PredictedYield,
		YieldUnit:       yieldOutput.Unit,
		Confidence:      yieldOutput.Confidence,
		OptimalHarvest:  harvestOutput.OptimalDate,
		Recommendations: recsOutput.Recommendations,
	}, nil
}

// Journey 7: Land Suitability Assessment
// UI: LandSuitabilityAssessment.tsx, SpatialAnalytics.tsx
// Backend: land-suitability-router.ts, spatial-router.ts
type LandSuitabilityInput struct {
	UserID    int     `json:"user_id"`
	FarmID    int     `json:"farm_id"`
	CropName  string  `json:"crop_name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type LandSuitabilityOutput struct {
	AssessmentID     int                    `json:"assessment_id"`
	SuitabilityScore float64                `json:"suitability_score"`
	SuitabilityClass string                 `json:"suitability_class"`
	SoilAnalysis     map[string]interface{} `json:"soil_analysis"`
	ClimateAnalysis  map[string]interface{} `json:"climate_analysis"`
	Recommendations  []string               `json:"recommendations"`
}

func LandSuitabilityWorkflow(ctx workflow.Context, input LandSuitabilityInput) (*LandSuitabilityOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Land Suitability Assessment Journey", "FarmID", input.FarmID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Analyze soil characteristics
	var soilOutput activities.AnalyzeSoilOutput
	err := workflow.ExecuteActivity(ctx, "AnalyzeSoil", activities.AnalyzeSoilInput{
		FarmID:    input.FarmID,
		Latitude:  input.Latitude,
		Longitude: input.Longitude,
	}).Get(ctx, &soilOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Analyze climate data
	var climateOutput activities.AnalyzeClimateOutput
	err = workflow.ExecuteActivity(ctx, "AnalyzeClimate", activities.AnalyzeClimateInput{
		Latitude:  input.Latitude,
		Longitude: input.Longitude,
		CropName:  input.CropName,
	}).Get(ctx, &climateOutput)
	if err != nil {
		return nil, err
	}

	// Step 3: Calculate suitability score
	var suitabilityOutput activities.CalculateSuitabilityOutput
	err = workflow.ExecuteActivity(ctx, "CalculateSuitability", activities.CalculateSuitabilityInput{
		CropName:    input.CropName,
		SoilData:    soilOutput.Data,
		ClimateData: climateOutput.Data,
	}).Get(ctx, &suitabilityOutput)
	if err != nil {
		return nil, err
	}

	// Step 4: Generate recommendations
	var recsOutput activities.GenerateSuitabilityRecsOutput
	err = workflow.ExecuteActivity(ctx, "GenerateSuitabilityRecs", activities.GenerateSuitabilityRecsInput{
		CropName:         input.CropName,
		SuitabilityScore: suitabilityOutput.Score,
		SoilData:         soilOutput.Data,
		ClimateData:      climateOutput.Data,
	}).Get(ctx, &recsOutput)
	if err != nil {
		logger.Warn("Recommendations generation failed", "error", err)
	}

	// Step 5: Save assessment
	var saveOutput activities.SaveAssessmentOutput
	err = workflow.ExecuteActivity(ctx, "SaveAssessment", activities.SaveAssessmentInput{
		FarmID:           input.FarmID,
		CropName:         input.CropName,
		SuitabilityScore: suitabilityOutput.Score,
		SuitabilityClass: suitabilityOutput.Class,
	}).Get(ctx, &saveOutput)
	if err != nil {
		logger.Warn("Assessment save failed", "error", err)
	}

	// Step 6: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "land_suitability_assessed",
		EntityID:  input.FarmID,
		Data: map[string]interface{}{
			"farm_id":           input.FarmID,
			"crop_name":         input.CropName,
			"suitability_score": suitabilityOutput.Score,
			"suitability_class": suitabilityOutput.Class,
		},
	})

	return &LandSuitabilityOutput{
		AssessmentID:     saveOutput.AssessmentID,
		SuitabilityScore: suitabilityOutput.Score,
		SuitabilityClass: suitabilityOutput.Class,
		SoilAnalysis:     soilOutput.Data,
		ClimateAnalysis:  climateOutput.Data,
		Recommendations:  recsOutput.Recommendations,
	}, nil
}

// Journey 8: Cooperative Management and Revenue Distribution
// UI: CooperativeDashboard.tsx, PortfolioAtRiskDashboard.tsx
// Backend: cooperative-router.ts, tigerbeetle-ledger.ts
type CooperativeManagementInput struct {
	CooperativeID int     `json:"cooperative_id"`
	HarvestCycle  int     `json:"harvest_cycle"`
	TotalRevenue  float64 `json:"total_revenue"`
	MemberIDs     []int   `json:"member_ids"`
}

type CooperativeManagementOutput struct {
	DistributionID   int                `json:"distribution_id"`
	TotalDistributed float64            `json:"total_distributed"`
	MemberPayments   []MemberPayment    `json:"member_payments"`
	CooperativeFund  float64            `json:"cooperative_fund"`
}

type MemberPayment struct {
	MemberID int     `json:"member_id"`
	Amount   float64 `json:"amount"`
	Status   string  `json:"status"`
}

func CooperativeManagementWorkflow(ctx workflow.Context, input CooperativeManagementInput) (*CooperativeManagementOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Cooperative Management Journey", "CooperativeID", input.CooperativeID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Calculate distribution (70% to members, 20% cooperative fund, 10% operational)
	memberShare := input.TotalRevenue * 0.70 / float64(len(input.MemberIDs))
	cooperativeFund := input.TotalRevenue * 0.20
	
	var memberPayments []MemberPayment
	totalDistributed := 0.0

	// Step 1: Process payments to each member
	for _, memberID := range input.MemberIDs {
		var paymentOutput activities.ProcessPaymentOutput
		err := workflow.ExecuteActivity(ctx, "ProcessPayment", activities.ProcessPaymentInput{
			OrderID:       input.CooperativeID*1000 + input.HarvestCycle,
			Amount:        int(memberShare),
			PayerID:       input.CooperativeID,
			PayeeID:       memberID,
			PaymentMethod: "cooperative_distribution",
		}).Get(ctx, &paymentOutput)

		status := "completed"
		if err != nil {
			status = "failed"
			logger.Warn("Payment failed for member", "memberID", memberID, "error", err)
		} else {
			totalDistributed += memberShare
		}

		memberPayments = append(memberPayments, MemberPayment{
			MemberID: memberID,
			Amount:   memberShare,
			Status:   status,
		})

		// Send notification to member
		workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
			UserID:   memberID,
			Title:    "Cooperative Payment",
			Message:  "You have received ₦" + string(rune(int(memberShare))) + " from cooperative distribution",
			Type:     "payment",
			Priority: "high",
		})
	}

	// Step 2: Record cooperative fund
	var fundOutput activities.CreateLedgerEntryOutput
	workflow.ExecuteActivity(ctx, "CreateLedgerEntry", activities.CreateLedgerEntryInput{
		AccountType:     "cooperative_fund",
		EntityID:        input.CooperativeID,
		Amount:          cooperativeFund,
		Status:          "completed",
		TransactionType: "fund_allocation",
	}).Get(ctx, &fundOutput)

	// Step 3: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "cooperative_distribution",
		EntityID:  input.CooperativeID,
		Data: map[string]interface{}{
			"cooperative_id":    input.CooperativeID,
			"harvest_cycle":     input.HarvestCycle,
			"total_revenue":     input.TotalRevenue,
			"total_distributed": totalDistributed,
			"member_count":      len(input.MemberIDs),
			"cooperative_fund":  cooperativeFund,
		},
	})

	return &CooperativeManagementOutput{
		DistributionID:   input.HarvestCycle,
		TotalDistributed: totalDistributed,
		MemberPayments:   memberPayments,
		CooperativeFund:  cooperativeFund,
	}, nil
}

// Helper functions
func calculateInterestRate(creditScore int, riskCategory string) float64 {
	baseRate := 15.0
	if creditScore >= 750 {
		baseRate = 12.0
	} else if creditScore >= 650 {
		baseRate = 15.0
	} else if creditScore >= 550 {
		baseRate = 18.0
	} else {
		baseRate = 22.0
	}
	
	switch riskCategory {
	case "low":
		return baseRate - 2.0
	case "medium":
		return baseRate
	case "high":
		return baseRate + 3.0
	default:
		return baseRate
	}
}

func calculateMonthlyPayment(principal float64, annualRate float64, termMonths int) float64 {
	monthlyRate := annualRate / 100 / 12
	payment := principal * (monthlyRate * pow(1+monthlyRate, float64(termMonths))) / (pow(1+monthlyRate, float64(termMonths)) - 1)
	return payment
}

func pow(base, exp float64) float64 {
	result := 1.0
	for i := 0; i < int(exp); i++ {
		result *= base
	}
	return result
}
