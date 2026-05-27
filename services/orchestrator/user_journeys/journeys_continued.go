package user_journeys

import (
	"time"

	"go.temporal.io/sdk/workflow"
	"orchestrator/activities"
)

// ============================================================================
// USER JOURNEYS 9-20 FOR AGRICULTURAL FINANCE PLATFORM
// ============================================================================

// Journey 9: Loan Disbursement and Repayment Tracking
// UI: AdminDisbursements.tsx, RepaymentTracking.tsx, MyLoans.tsx
// Backend: disbursement-router.ts, microfinance-router.ts
type LoanDisbursementInput struct {
	ApplicationID int     `json:"application_id"`
	FarmerID      int     `json:"farmer_id"`
	UserID        int     `json:"user_id"`
	ApprovedAmount float64 `json:"approved_amount"`
	InterestRate  float64 `json:"interest_rate"`
	TermMonths    int     `json:"term_months"`
	AccountNumber string  `json:"account_number"`
	BankCode      string  `json:"bank_code"`
}

type LoanDisbursementOutput struct {
	LoanID          int     `json:"loan_id"`
	DisbursementID  string  `json:"disbursement_id"`
	TransactionID   string  `json:"transaction_id"`
	RepaymentSchedule []RepaymentInstallment `json:"repayment_schedule"`
	FirstDueDate    string  `json:"first_due_date"`
}

type RepaymentInstallment struct {
	InstallmentNo int     `json:"installment_no"`
	DueDate       string  `json:"due_date"`
	Principal     float64 `json:"principal"`
	Interest      float64 `json:"interest"`
	TotalAmount   float64 `json:"total_amount"`
}

func LoanDisbursementWorkflow(ctx workflow.Context, input LoanDisbursementInput) (*LoanDisbursementOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Loan Disbursement Journey", "ApplicationID", input.ApplicationID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Create loan record
	var loanOutput activities.CreateLoanOutput
	err := workflow.ExecuteActivity(ctx, "CreateLoan", activities.CreateLoanInput{
		ApplicationID:  input.ApplicationID,
		FarmerID:       input.FarmerID,
		Amount:         input.ApprovedAmount,
		InterestRate:   input.InterestRate,
		TermMonths:     input.TermMonths,
	}).Get(ctx, &loanOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Create TigerBeetle ledger entries
	var ledgerOutput activities.CreateLedgerEntryOutput
	err = workflow.ExecuteActivity(ctx, "CreateLedgerEntry", activities.CreateLedgerEntryInput{
		AccountType:     "loan_disbursement",
		EntityID:        loanOutput.LoanID,
		Amount:          input.ApprovedAmount,
		Status:          "pending",
		TransactionType: "disbursement",
	}).Get(ctx, &ledgerOutput)
	if err != nil {
		return nil, err
	}

	// Step 3: Process bank transfer
	var transferOutput activities.ProcessBankTransferOutput
	err = workflow.ExecuteActivity(ctx, "ProcessBankTransfer", activities.ProcessBankTransferInput{
		LoanID:        loanOutput.LoanID,
		Amount:        input.ApprovedAmount,
		AccountNumber: input.AccountNumber,
		BankCode:      input.BankCode,
	}).Get(ctx, &transferOutput)
	if err != nil {
		return nil, err
	}

	// Step 4: Generate repayment schedule
	var scheduleOutput activities.GenerateRepaymentScheduleOutput
	err = workflow.ExecuteActivity(ctx, "GenerateRepaymentSchedule", activities.GenerateRepaymentScheduleInput{
		LoanID:       loanOutput.LoanID,
		Principal:    input.ApprovedAmount,
		InterestRate: input.InterestRate,
		TermMonths:   input.TermMonths,
	}).Get(ctx, &scheduleOutput)
	if err != nil {
		return nil, err
	}

	// Step 5: Sync to ERPNext
	workflow.ExecuteActivity(ctx, "SyncToERPNext", activities.SyncToERPNextInput{
		FarmerID:   input.FarmerID,
		EntityType: "loan",
		LoanID:     loanOutput.LoanID,
		Amount:     input.ApprovedAmount,
	})

	// Step 6: Send disbursement notification
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "Loan Disbursed",
		Message:  "Your loan of ₦" + formatAmount(input.ApprovedAmount) + " has been disbursed to your account.",
		Type:     "loan_disbursement",
		Priority: "high",
	})

	// Step 7: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "loan_disbursed",
		EntityID:  loanOutput.LoanID,
		Data: map[string]interface{}{
			"loan_id":        loanOutput.LoanID,
			"farmer_id":      input.FarmerID,
			"amount":         input.ApprovedAmount,
			"interest_rate":  input.InterestRate,
			"term_months":    input.TermMonths,
		},
	})

	// Convert schedule to output format
	var repaymentSchedule []RepaymentInstallment
	for _, inst := range scheduleOutput.Installments {
		repaymentSchedule = append(repaymentSchedule, RepaymentInstallment{
			InstallmentNo: inst.InstallmentNo,
			DueDate:       inst.DueDate,
			Principal:     inst.Principal,
			Interest:      inst.Interest,
			TotalAmount:   inst.TotalAmount,
		})
	}

	return &LoanDisbursementOutput{
		LoanID:            loanOutput.LoanID,
		DisbursementID:    transferOutput.DisbursementID,
		TransactionID:     transferOutput.TransactionID,
		RepaymentSchedule: repaymentSchedule,
		FirstDueDate:      scheduleOutput.FirstDueDate,
	}, nil
}

// Journey 10: Weather-Indexed Crop Insurance
// UI: CropInsurance.tsx (to be created), RiskComplianceDashboard.tsx
// Backend: crop-insurance-service.ts, weather-router.ts
type CropInsuranceInput struct {
	FarmerID         int     `json:"farmer_id"`
	UserID           int     `json:"user_id"`
	FarmID           int     `json:"farm_id"`
	CropID           int     `json:"crop_id"`
	CropName         string  `json:"crop_name"`
	AreaInsured      float64 `json:"area_insured"`
	CoverageAmount   float64 `json:"coverage_amount"`
	PremiumAmount    float64 `json:"premium_amount"`
	SeasonStartDate  string  `json:"season_start_date"`
	SeasonEndDate    string  `json:"season_end_date"`
}

type CropInsuranceOutput struct {
	PolicyID         string  `json:"policy_id"`
	PolicyNumber     string  `json:"policy_number"`
	Status           string  `json:"status"`
	PremiumPaid      bool    `json:"premium_paid"`
	CoverageDetails  map[string]interface{} `json:"coverage_details"`
}

func CropInsuranceWorkflow(ctx workflow.Context, input CropInsuranceInput) (*CropInsuranceOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Crop Insurance Journey", "FarmID", input.FarmID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Assess farm risk
	var riskOutput activities.AssessFarmRiskOutput
	err := workflow.ExecuteActivity(ctx, "AssessFarmRisk", activities.AssessFarmRiskInput{
		FarmID:   input.FarmID,
		CropName: input.CropName,
	}).Get(ctx, &riskOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Create insurance policy
	var policyOutput activities.CreateInsurancePolicyOutput
	err = workflow.ExecuteActivity(ctx, "CreateInsurancePolicy", activities.CreateInsurancePolicyInput{
		FarmerID:        input.FarmerID,
		FarmID:          input.FarmID,
		CropID:          input.CropID,
		AreaInsured:     input.AreaInsured,
		CoverageAmount:  input.CoverageAmount,
		PremiumAmount:   input.PremiumAmount,
		RiskScore:       riskOutput.RiskScore,
		SeasonStartDate: input.SeasonStartDate,
		SeasonEndDate:   input.SeasonEndDate,
	}).Get(ctx, &policyOutput)
	if err != nil {
		return nil, err
	}

	// Step 3: Process premium payment via TigerBeetle
	var paymentOutput activities.ProcessPaymentOutput
	err = workflow.ExecuteActivity(ctx, "ProcessPayment", activities.ProcessPaymentInput{
		OrderID:       policyOutput.PolicyID,
		Amount:        int(input.PremiumAmount),
		PayerID:       input.FarmerID,
		PayeeID:       0, // Insurance provider
		PaymentMethod: "insurance_premium",
	}).Get(ctx, &paymentOutput)
	if err != nil {
		logger.Warn("Premium payment failed", "error", err)
	}

	// Step 4: Set up weather monitoring
	workflow.ExecuteActivity(ctx, "SetupWeatherMonitoring", activities.SetupWeatherMonitoringInput{
		PolicyID:        policyOutput.PolicyID,
		FarmID:          input.FarmID,
		SeasonStartDate: input.SeasonStartDate,
		SeasonEndDate:   input.SeasonEndDate,
		TriggerThresholds: map[string]float64{
			"drought_days":     14,
			"flood_mm":         200,
			"temperature_high": 40,
		},
	})

	// Step 5: Send policy confirmation
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "Insurance Policy Activated",
		Message:  "Your crop insurance policy #" + policyOutput.PolicyNumber + " is now active.",
		Type:     "insurance",
		Priority: "high",
	})

	// Step 6: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "insurance_policy_created",
		EntityID:  policyOutput.PolicyID,
		Data: map[string]interface{}{
			"policy_id":       policyOutput.PolicyID,
			"farmer_id":       input.FarmerID,
			"farm_id":         input.FarmID,
			"coverage_amount": input.CoverageAmount,
			"premium_amount":  input.PremiumAmount,
			"risk_score":      riskOutput.RiskScore,
		},
	})

	return &CropInsuranceOutput{
		PolicyID:     string(rune(policyOutput.PolicyID)),
		PolicyNumber: policyOutput.PolicyNumber,
		Status:       "active",
		PremiumPaid:  paymentOutput.Status == "completed",
		CoverageDetails: map[string]interface{}{
			"area_insured":    input.AreaInsured,
			"coverage_amount": input.CoverageAmount,
			"risk_score":      riskOutput.RiskScore,
		},
	}, nil
}

// Journey 11: Input Financing for Farmers
// UI: FarmerFinancialProfile.tsx, InputYieldAnalytics.tsx
// Backend: input-financing-service.ts, microfinance-router.ts
type InputFinancingInput struct {
	FarmerID      int                `json:"farmer_id"`
	UserID        int                `json:"user_id"`
	FarmID        int                `json:"farm_id"`
	CropID        int                `json:"crop_id"`
	SeasonID      int                `json:"season_id"`
	InputRequests []InputRequest     `json:"input_requests"`
}

type InputRequest struct {
	InputType   string  `json:"input_type"` // seeds, fertilizer, pesticides
	Quantity    float64 `json:"quantity"`
	Unit        string  `json:"unit"`
	EstimatedCost float64 `json:"estimated_cost"`
}

type InputFinancingOutput struct {
	FinancingID     int     `json:"financing_id"`
	TotalAmount     float64 `json:"total_amount"`
	ApprovedAmount  float64 `json:"approved_amount"`
	InterestRate    float64 `json:"interest_rate"`
	RepaymentDate   string  `json:"repayment_date"`
	InputOrders     []InputOrder `json:"input_orders"`
}

type InputOrder struct {
	OrderID   int     `json:"order_id"`
	InputType string  `json:"input_type"`
	Status    string  `json:"status"`
}

func InputFinancingWorkflow(ctx workflow.Context, input InputFinancingInput) (*InputFinancingOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Input Financing Journey", "FarmerID", input.FarmerID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Calculate total input cost
	totalCost := 0.0
	for _, req := range input.InputRequests {
		totalCost += req.EstimatedCost
	}

	// Step 1: Check farmer eligibility
	var eligibilityOutput activities.CheckFinancingEligibilityOutput
	err := workflow.ExecuteActivity(ctx, "CheckFinancingEligibility", activities.CheckFinancingEligibilityInput{
		FarmerID:    input.FarmerID,
		Amount:      totalCost,
		Purpose:     "input_financing",
	}).Get(ctx, &eligibilityOutput)
	if err != nil || !eligibilityOutput.Eligible {
		return nil, workflow.NewApplicationError("Not eligible for input financing", "ELIGIBILITY_ERROR", nil)
	}

	// Step 2: Create financing record
	var financingOutput activities.CreateInputFinancingOutput
	err = workflow.ExecuteActivity(ctx, "CreateInputFinancing", activities.CreateInputFinancingInput{
		FarmerID:       input.FarmerID,
		FarmID:         input.FarmID,
		CropID:         input.CropID,
		TotalAmount:    totalCost,
		ApprovedAmount: eligibilityOutput.ApprovedAmount,
		InterestRate:   eligibilityOutput.InterestRate,
	}).Get(ctx, &financingOutput)
	if err != nil {
		return nil, err
	}

	// Step 3: Create input orders
	var inputOrders []InputOrder
	for _, req := range input.InputRequests {
		var orderOutput activities.CreateInputOrderOutput
		err = workflow.ExecuteActivity(ctx, "CreateInputOrder", activities.CreateInputOrderInput{
			FinancingID: financingOutput.FinancingID,
			FarmerID:    input.FarmerID,
			InputType:   req.InputType,
			Quantity:    req.Quantity,
			Unit:        req.Unit,
			Amount:      req.EstimatedCost,
		}).Get(ctx, &orderOutput)
		if err != nil {
			logger.Warn("Failed to create input order", "type", req.InputType, "error", err)
			continue
		}
		inputOrders = append(inputOrders, InputOrder{
			OrderID:   orderOutput.OrderID,
			InputType: req.InputType,
			Status:    "pending_delivery",
		})
	}

	// Step 4: Create TigerBeetle ledger entry
	workflow.ExecuteActivity(ctx, "CreateLedgerEntry", activities.CreateLedgerEntryInput{
		AccountType:     "input_financing",
		EntityID:        financingOutput.FinancingID,
		Amount:          eligibilityOutput.ApprovedAmount,
		Status:          "disbursed",
		TransactionType: "input_finance_disbursement",
	})

	// Step 5: Sync to ERPNext
	workflow.ExecuteActivity(ctx, "SyncToERPNext", activities.SyncToERPNextInput{
		FarmerID:   input.FarmerID,
		EntityType: "input_financing",
		Amount:     eligibilityOutput.ApprovedAmount,
	})

	// Step 6: Send notification
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "Input Financing Approved",
		Message:  "Your input financing of ₦" + formatAmount(eligibilityOutput.ApprovedAmount) + " has been approved.",
		Type:     "financing",
		Priority: "high",
	})

	// Step 7: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "input_financing_approved",
		EntityID:  financingOutput.FinancingID,
		Data: map[string]interface{}{
			"financing_id":    financingOutput.FinancingID,
			"farmer_id":       input.FarmerID,
			"total_amount":    totalCost,
			"approved_amount": eligibilityOutput.ApprovedAmount,
			"input_count":     len(input.InputRequests),
		},
	})

	return &InputFinancingOutput{
		FinancingID:    financingOutput.FinancingID,
		TotalAmount:    totalCost,
		ApprovedAmount: eligibilityOutput.ApprovedAmount,
		InterestRate:   eligibilityOutput.InterestRate,
		RepaymentDate:  financingOutput.RepaymentDate,
		InputOrders:    inputOrders,
	}, nil
}

// Journey 12: Harvest Recording and Quality Grading
// UI: Harvests.tsx, AIDiagnostics.tsx
// Backend: harvest activities, ml-models-router.ts
type HarvestRecordingInput struct {
	UserID        int     `json:"user_id"`
	FarmID        int     `json:"farm_id"`
	CropID        int     `json:"crop_id"`
	HarvestDate   string  `json:"harvest_date"`
	Quantity      float64 `json:"quantity"`
	Unit          string  `json:"unit"`
	ImageURLs     []string `json:"image_urls"`
	StorageMethod string  `json:"storage_method"`
}

type HarvestRecordingOutput struct {
	HarvestID     int     `json:"harvest_id"`
	QualityGrade  string  `json:"quality_grade"`
	QualityScore  float64 `json:"quality_score"`
	EstimatedValue float64 `json:"estimated_value"`
	StorageRecommendation string `json:"storage_recommendation"`
}

func HarvestRecordingWorkflow(ctx workflow.Context, input HarvestRecordingInput) (*HarvestRecordingOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Harvest Recording Journey", "CropID", input.CropID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Record harvest
	var harvestOutput activities.RecordHarvestOutput
	err := workflow.ExecuteActivity(ctx, "RecordHarvest", activities.RecordHarvestInput{
		CropID:      input.CropID,
		HarvestDate: time.Now(),
		Quantity:    input.Quantity,
		Unit:        input.Unit,
		Quality:     "pending_grading",
		MarketPrice: 0,
	}).Get(ctx, &harvestOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Grade produce quality using ML
	var gradeOutput activities.GradeProduceOutput
	if len(input.ImageURLs) > 0 {
		err = workflow.ExecuteActivity(ctx, "GradeProduce", activities.GradeProduceInput{
			HarvestID: harvestOutput.HarvestID,
			CropName:  "",
			ImageURL:  input.ImageURLs[0],
		}).Get(ctx, &gradeOutput)
		if err != nil {
			logger.Warn("Quality grading failed", "error", err)
			gradeOutput.Grade = "ungraded"
			gradeOutput.QualityScore = 0.5
		}
	}

	// Step 3: Get current market price
	var priceOutput activities.GetMarketPriceOutput
	err = workflow.ExecuteActivity(ctx, "GetMarketPrice", activities.GetMarketPriceInput{
		CropID: input.CropID,
	}).Get(ctx, &priceOutput)
	if err != nil {
		logger.Warn("Market price fetch failed", "error", err)
	}

	// Calculate estimated value
	estimatedValue := input.Quantity * priceOutput.PricePerUnit * gradeOutput.QualityScore

	// Step 4: Update harvest with grade and value
	workflow.ExecuteActivity(ctx, "UpdateHarvest", activities.UpdateHarvestInput{
		HarvestID:      harvestOutput.HarvestID,
		QualityGrade:   gradeOutput.Grade,
		QualityScore:   gradeOutput.QualityScore,
		EstimatedValue: estimatedValue,
	})

	// Step 5: Generate storage recommendation
	var storageOutput activities.GetStorageRecommendationOutput
	err = workflow.ExecuteActivity(ctx, "GetStorageRecommendation", activities.GetStorageRecommendationInput{
		CropID:        input.CropID,
		Quantity:      input.Quantity,
		QualityGrade:  gradeOutput.Grade,
		StorageMethod: input.StorageMethod,
	}).Get(ctx, &storageOutput)
	if err != nil {
		logger.Warn("Storage recommendation failed", "error", err)
	}

	// Step 6: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "harvest_recorded",
		EntityID:  harvestOutput.HarvestID,
		Data: map[string]interface{}{
			"harvest_id":      harvestOutput.HarvestID,
			"farm_id":         input.FarmID,
			"crop_id":         input.CropID,
			"quantity":        input.Quantity,
			"quality_grade":   gradeOutput.Grade,
			"quality_score":   gradeOutput.QualityScore,
			"estimated_value": estimatedValue,
		},
	})

	// Step 7: Send notification
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "Harvest Recorded",
		Message:  "Your harvest has been recorded. Quality grade: " + gradeOutput.Grade,
		Type:     "harvest",
		Priority: "medium",
	})

	return &HarvestRecordingOutput{
		HarvestID:             harvestOutput.HarvestID,
		QualityGrade:          gradeOutput.Grade,
		QualityScore:          gradeOutput.QualityScore,
		EstimatedValue:        estimatedValue,
		StorageRecommendation: storageOutput.Recommendation,
	}, nil
}

// Journey 13: Agent Task Assignment and Verification
// UI: AgentTasksDashboard.tsx, FieldAgentDashboard.tsx
// Backend: agent-productivity-router.ts
type AgentTaskInput struct {
	AgentID       int    `json:"agent_id"`
	TaskType      string `json:"task_type"` // farmer_verification, farm_visit, kyc_collection
	FarmerID      int    `json:"farmer_id"`
	FarmID        int    `json:"farm_id,omitempty"`
	Priority      string `json:"priority"`
	DueDate       string `json:"due_date"`
	Instructions  string `json:"instructions"`
}

type AgentTaskOutput struct {
	TaskID        int    `json:"task_id"`
	Status        string `json:"status"`
	AssignedAt    string `json:"assigned_at"`
	NotificationSent bool `json:"notification_sent"`
}

func AgentTaskWorkflow(ctx workflow.Context, input AgentTaskInput) (*AgentTaskOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Agent Task Journey", "AgentID", input.AgentID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Create task
	var taskOutput activities.CreateAgentTaskOutput
	err := workflow.ExecuteActivity(ctx, "CreateAgentTask", activities.CreateAgentTaskInput{
		AgentID:      input.AgentID,
		TaskType:     input.TaskType,
		FarmerID:     input.FarmerID,
		FarmID:       input.FarmID,
		Priority:     input.Priority,
		DueDate:      input.DueDate,
		Instructions: input.Instructions,
	}).Get(ctx, &taskOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Send notification to agent
	var notifOutput activities.SendNotificationOutput
	err = workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.AgentID,
		Title:    "New Task Assigned",
		Message:  "You have been assigned a new " + input.TaskType + " task. Due: " + input.DueDate,
		Type:     "task_assignment",
		Priority: input.Priority,
	}).Get(ctx, &notifOutput)
	if err != nil {
		logger.Warn("Notification failed", "error", err)
	}

	// Step 3: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "agent_task_assigned",
		EntityID:  taskOutput.TaskID,
		Data: map[string]interface{}{
			"task_id":   taskOutput.TaskID,
			"agent_id":  input.AgentID,
			"task_type": input.TaskType,
			"farmer_id": input.FarmerID,
			"priority":  input.Priority,
		},
	})

	return &AgentTaskOutput{
		TaskID:           taskOutput.TaskID,
		Status:           "assigned",
		AssignedAt:       time.Now().Format(time.RFC3339),
		NotificationSent: notifOutput.Sent,
	}, nil
}

// Journey 14: KYC Verification Process
// UI: KycVerification.tsx, KycAdminDashboard.tsx
// Backend: kyc-router.ts, kyc-service.ts
type KYCVerificationInput struct {
	FarmerID      int           `json:"farmer_id"`
	UserID        int           `json:"user_id"`
	Documents     []KYCDocument `json:"documents"`
	BiometricData map[string]interface{} `json:"biometric_data,omitempty"`
}

type KYCVerificationOutput struct {
	VerificationID int    `json:"verification_id"`
	Status         string `json:"status"`
	Score          int    `json:"score"`
	Tier           string `json:"tier"` // basic, standard, enhanced
	ExpiryDate     string `json:"expiry_date"`
}

func KYCVerificationWorkflow(ctx workflow.Context, input KYCVerificationInput) (*KYCVerificationOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting KYC Verification Journey", "FarmerID", input.FarmerID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Process documents
	var docOutput activities.ProcessKYCOutput
	err := workflow.ExecuteActivity(ctx, "ProcessKYC", activities.ProcessKYCInput{
		FarmerID:  input.FarmerID,
		Documents: input.Documents,
	}).Get(ctx, &docOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Verify identity
	var verifyOutput activities.VerifyIdentityOutput
	err = workflow.ExecuteActivity(ctx, "VerifyIdentity", activities.VerifyIdentityInput{
		FarmerID:      input.FarmerID,
		DocumentData:  docOutput.ExtractedData,
		BiometricData: input.BiometricData,
	}).Get(ctx, &verifyOutput)
	if err != nil {
		return nil, err
	}

	// Step 3: Calculate KYC score and tier
	var scoreOutput activities.CalculateKYCScoreOutput
	err = workflow.ExecuteActivity(ctx, "CalculateKYCScore", activities.CalculateKYCScoreInput{
		FarmerID:         input.FarmerID,
		DocumentCount:    len(input.Documents),
		VerificationScore: verifyOutput.Score,
	}).Get(ctx, &scoreOutput)
	if err != nil {
		return nil, err
	}

	// Step 4: Update farmer KYC status
	workflow.ExecuteActivity(ctx, "UpdateFarmerKYC", activities.UpdateFarmerKYCInput{
		FarmerID: input.FarmerID,
		Status:   scoreOutput.Status,
		Tier:     scoreOutput.Tier,
		Score:    scoreOutput.Score,
	})

	// Step 5: Sync to Permify for authorization
	workflow.ExecuteActivity(ctx, "SyncToPermify", activities.SyncToPermifyInput{
		EntityType: "farmer",
		EntityID:   input.FarmerID,
		Permissions: map[string]bool{
			"can_apply_loan":     scoreOutput.Tier != "basic",
			"can_trade":          true,
			"can_export":         scoreOutput.Tier == "enhanced",
			"can_access_premium": scoreOutput.Tier == "enhanced",
		},
	})

	// Step 6: Send notification
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "KYC Verification Complete",
		Message:  "Your KYC verification is complete. Status: " + scoreOutput.Status + ", Tier: " + scoreOutput.Tier,
		Type:     "kyc",
		Priority: "high",
	})

	// Step 7: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "kyc_verified",
		EntityID:  input.FarmerID,
		Data: map[string]interface{}{
			"farmer_id":      input.FarmerID,
			"status":         scoreOutput.Status,
			"tier":           scoreOutput.Tier,
			"score":          scoreOutput.Score,
			"document_count": len(input.Documents),
		},
	})

	return &KYCVerificationOutput{
		VerificationID: docOutput.VerificationID,
		Status:         scoreOutput.Status,
		Score:          scoreOutput.Score,
		Tier:           scoreOutput.Tier,
		ExpiryDate:     time.Now().AddDate(1, 0, 0).Format("2006-01-02"),
	}, nil
}

// Journey 15: Carbon Credit Registration
// UI: CarbonCredits.tsx (to be created), SustainabilityDashboard.tsx
// Backend: carbon-credit-service.ts
type CarbonCreditInput struct {
	FarmerID      int     `json:"farmer_id"`
	UserID        int     `json:"user_id"`
	FarmID        int     `json:"farm_id"`
	ProjectType   string  `json:"project_type"` // agroforestry, soil_carbon, methane_reduction
	AreaHectares  float64 `json:"area_hectares"`
	BaselineData  map[string]interface{} `json:"baseline_data"`
}

type CarbonCreditOutput struct {
	ProjectID       int     `json:"project_id"`
	EstimatedCredits float64 `json:"estimated_credits"`
	CreditUnit      string  `json:"credit_unit"`
	VerificationStatus string `json:"verification_status"`
	EstimatedValue  float64 `json:"estimated_value"`
}

func CarbonCreditWorkflow(ctx workflow.Context, input CarbonCreditInput) (*CarbonCreditOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Carbon Credit Journey", "FarmID", input.FarmID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Register carbon project
	var projectOutput activities.RegisterCarbonProjectOutput
	err := workflow.ExecuteActivity(ctx, "RegisterCarbonProject", activities.RegisterCarbonProjectInput{
		FarmerID:     input.FarmerID,
		FarmID:       input.FarmID,
		ProjectType:  input.ProjectType,
		AreaHectares: input.AreaHectares,
		BaselineData: input.BaselineData,
	}).Get(ctx, &projectOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Calculate estimated credits
	var creditsOutput activities.CalculateCarbonCreditsOutput
	err = workflow.ExecuteActivity(ctx, "CalculateCarbonCredits", activities.CalculateCarbonCreditsInput{
		ProjectID:    projectOutput.ProjectID,
		ProjectType:  input.ProjectType,
		AreaHectares: input.AreaHectares,
		BaselineData: input.BaselineData,
	}).Get(ctx, &creditsOutput)
	if err != nil {
		return nil, err
	}

	// Step 3: Get carbon credit market price
	var priceOutput activities.GetCarbonPriceOutput
	err = workflow.ExecuteActivity(ctx, "GetCarbonPrice", activities.GetCarbonPriceInput{
		CreditType: input.ProjectType,
	}).Get(ctx, &priceOutput)
	if err != nil {
		logger.Warn("Carbon price fetch failed", "error", err)
	}

	estimatedValue := creditsOutput.EstimatedCredits * priceOutput.PricePerCredit

	// Step 4: Create verification request
	workflow.ExecuteActivity(ctx, "CreateVerificationRequest", activities.CreateVerificationRequestInput{
		ProjectID:   projectOutput.ProjectID,
		ProjectType: input.ProjectType,
	})

	// Step 5: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "carbon_project_registered",
		EntityID:  projectOutput.ProjectID,
		Data: map[string]interface{}{
			"project_id":        projectOutput.ProjectID,
			"farmer_id":         input.FarmerID,
			"farm_id":           input.FarmID,
			"project_type":      input.ProjectType,
			"area_hectares":     input.AreaHectares,
			"estimated_credits": creditsOutput.EstimatedCredits,
			"estimated_value":   estimatedValue,
		},
	})

	// Step 6: Send notification
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "Carbon Project Registered",
		Message:  "Your carbon credit project has been registered. Estimated credits: " + formatAmount(creditsOutput.EstimatedCredits) + " tCO2e",
		Type:     "carbon_credit",
		Priority: "medium",
	})

	return &CarbonCreditOutput{
		ProjectID:          projectOutput.ProjectID,
		EstimatedCredits:   creditsOutput.EstimatedCredits,
		CreditUnit:         "tCO2e",
		VerificationStatus: "pending",
		EstimatedValue:     estimatedValue,
	}, nil
}

// Journey 16: Traceability Chain Creation
// UI: TraceabilityDashboard.tsx
// Backend: traceability-router.ts
type TraceabilityInput struct {
	UserID      int    `json:"user_id"`
	FarmID      int    `json:"farm_id"`
	CropID      int    `json:"crop_id"`
	HarvestID   int    `json:"harvest_id"`
	BatchNumber string `json:"batch_number"`
	Quantity    float64 `json:"quantity"`
	Unit        string `json:"unit"`
}

type TraceabilityOutput struct {
	TraceabilityID string `json:"traceability_id"`
	QRCode         string `json:"qr_code"`
	BlockchainHash string `json:"blockchain_hash"`
	ChainComplete  bool   `json:"chain_complete"`
}

func TraceabilityWorkflow(ctx workflow.Context, input TraceabilityInput) (*TraceabilityOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Traceability Journey", "HarvestID", input.HarvestID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Create traceability record
	var traceOutput activities.CreateTraceabilityOutput
	err := workflow.ExecuteActivity(ctx, "CreateTraceability", activities.CreateTraceabilityInput{
		FarmID:   input.FarmID,
		CropID:   input.CropID,
		Quantity: input.Quantity,
	}).Get(ctx, &traceOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Link harvest to traceability
	workflow.ExecuteActivity(ctx, "LinkHarvestToTraceability", activities.LinkHarvestToTraceabilityInput{
		TraceabilityID: traceOutput.TraceabilityID,
		HarvestID:      input.HarvestID,
		BatchNumber:    input.BatchNumber,
	})

	// Step 3: Generate QR code
	var qrOutput activities.GenerateQRCodeOutput
	err = workflow.ExecuteActivity(ctx, "GenerateQRCode", activities.GenerateQRCodeInput{
		TraceabilityID: traceOutput.TraceabilityID,
		Data: map[string]interface{}{
			"farm_id":      input.FarmID,
			"crop_id":      input.CropID,
			"harvest_id":   input.HarvestID,
			"batch_number": input.BatchNumber,
			"quantity":     input.Quantity,
		},
	}).Get(ctx, &qrOutput)
	if err != nil {
		logger.Warn("QR code generation failed", "error", err)
	}

	// Step 4: Create blockchain record (simulated)
	var blockchainOutput activities.CreateBlockchainRecordOutput
	err = workflow.ExecuteActivity(ctx, "CreateBlockchainRecord", activities.CreateBlockchainRecordInput{
		TraceabilityID: traceOutput.TraceabilityID,
		Data: map[string]interface{}{
			"farm_id":      input.FarmID,
			"crop_id":      input.CropID,
			"harvest_id":   input.HarvestID,
			"batch_number": input.BatchNumber,
			"quantity":     input.Quantity,
			"timestamp":    time.Now().Unix(),
		},
	}).Get(ctx, &blockchainOutput)
	if err != nil {
		logger.Warn("Blockchain record failed", "error", err)
	}

	// Step 5: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "traceability_created",
		EntityID:  input.HarvestID,
		Data: map[string]interface{}{
			"traceability_id": traceOutput.TraceabilityID,
			"farm_id":         input.FarmID,
			"crop_id":         input.CropID,
			"harvest_id":      input.HarvestID,
			"batch_number":    input.BatchNumber,
		},
	})

	return &TraceabilityOutput{
		TraceabilityID: traceOutput.TraceabilityID,
		QRCode:         qrOutput.QRCodeURL,
		BlockchainHash: blockchainOutput.Hash,
		ChainComplete:  true,
	}, nil
}

// Journey 17: Weather Alert and Advisory
// UI: WeatherDashboard.tsx, NotificationCenter.tsx
// Backend: weather-router.ts, voice-advisory-service.ts
type WeatherAlertInput struct {
	FarmID      int    `json:"farm_id"`
	UserID      int    `json:"user_id"`
	AlertType   string `json:"alert_type"` // drought, flood, frost, heat_wave
	Severity    string `json:"severity"`   // low, medium, high, critical
	StartDate   string `json:"start_date"`
	EndDate     string `json:"end_date"`
	Description string `json:"description"`
}

type WeatherAlertOutput struct {
	AlertID           int      `json:"alert_id"`
	NotificationsSent int      `json:"notifications_sent"`
	Recommendations   []string `json:"recommendations"`
	AffectedCrops     []int    `json:"affected_crops"`
}

func WeatherAlertWorkflow(ctx workflow.Context, input WeatherAlertInput) (*WeatherAlertOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Weather Alert Journey", "FarmID", input.FarmID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Create weather alert
	var alertOutput activities.CreateWeatherAlertOutput
	err := workflow.ExecuteActivity(ctx, "CreateWeatherAlert", activities.CreateWeatherAlertInput{
		FarmID:      input.FarmID,
		AlertType:   input.AlertType,
		Severity:    input.Severity,
		StartDate:   input.StartDate,
		EndDate:     input.EndDate,
		Description: input.Description,
	}).Get(ctx, &alertOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Get affected crops
	var cropsOutput activities.GetFarmCropsOutput
	err = workflow.ExecuteActivity(ctx, "GetFarmCrops", activities.GetFarmCropsInput{
		FarmID: input.FarmID,
	}).Get(ctx, &cropsOutput)
	if err != nil {
		logger.Warn("Failed to get farm crops", "error", err)
	}

	// Step 3: Generate recommendations
	var recsOutput activities.GenerateWeatherRecommendationsOutput
	err = workflow.ExecuteActivity(ctx, "GenerateWeatherRecommendations", activities.GenerateWeatherRecommendationsInput{
		AlertType:     input.AlertType,
		Severity:      input.Severity,
		AffectedCrops: cropsOutput.CropIDs,
	}).Get(ctx, &recsOutput)
	if err != nil {
		logger.Warn("Failed to generate recommendations", "error", err)
	}

	// Step 4: Send multi-channel notifications
	notificationsSent := 0

	// SMS notification
	var smsOutput activities.SendNotificationOutput
	err = workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "Weather Alert: " + input.AlertType,
		Message:  input.Description + ". " + recsOutput.Recommendations[0],
		Type:     "weather_alert",
		Priority: input.Severity,
	}).Get(ctx, &smsOutput)
	if smsOutput.Sent {
		notificationsSent++
	}

	// Voice advisory for critical alerts
	if input.Severity == "critical" || input.Severity == "high" {
		workflow.ExecuteActivity(ctx, "SendVoiceAdvisory", activities.SendVoiceAdvisoryInput{
			UserID:  input.UserID,
			Message: input.Description + ". Recommended action: " + recsOutput.Recommendations[0],
		})
		notificationsSent++
	}

	// Step 5: Check insurance policies
	workflow.ExecuteActivity(ctx, "CheckInsuranceTrigger", activities.CheckInsuranceTriggerInput{
		FarmID:    input.FarmID,
		AlertType: input.AlertType,
		Severity:  input.Severity,
	})

	// Step 6: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "weather_alert_issued",
		EntityID:  alertOutput.AlertID,
		Data: map[string]interface{}{
			"alert_id":      alertOutput.AlertID,
			"farm_id":       input.FarmID,
			"alert_type":    input.AlertType,
			"severity":      input.Severity,
			"affected_crops": len(cropsOutput.CropIDs),
		},
	})

	return &WeatherAlertOutput{
		AlertID:           alertOutput.AlertID,
		NotificationsSent: notificationsSent,
		Recommendations:   recsOutput.Recommendations,
		AffectedCrops:     cropsOutput.CropIDs,
	}, nil
}

// Journey 18: Expense Tracking and Budgeting
// UI: Expenses.tsx, FinancialReports.tsx
// Backend: expense activities, accounting services
type ExpenseTrackingInput struct {
	UserID        int     `json:"user_id"`
	FarmID        int     `json:"farm_id"`
	CropID        int     `json:"crop_id,omitempty"`
	Category      string  `json:"category"`
	Description   string  `json:"description"`
	Amount        float64 `json:"amount"`
	PaymentMethod string  `json:"payment_method"`
	ReceiptURL    string  `json:"receipt_url,omitempty"`
}

type ExpenseTrackingOutput struct {
	ExpenseID       int     `json:"expense_id"`
	BudgetRemaining float64 `json:"budget_remaining"`
	CategoryTotal   float64 `json:"category_total"`
	MonthlyTotal    float64 `json:"monthly_total"`
}

func ExpenseTrackingWorkflow(ctx workflow.Context, input ExpenseTrackingInput) (*ExpenseTrackingOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Expense Tracking Journey", "FarmID", input.FarmID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Record expense
	var expenseOutput activities.RecordExpenseOutput
	err := workflow.ExecuteActivity(ctx, "RecordExpense", activities.RecordExpenseInput{
		UserID:        input.UserID,
		FarmID:        input.FarmID,
		CropID:        input.CropID,
		Category:      input.Category,
		Description:   input.Description,
		Amount:        int(input.Amount),
		PaymentMethod: input.PaymentMethod,
	}).Get(ctx, &expenseOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Create TigerBeetle ledger entry
	workflow.ExecuteActivity(ctx, "CreateLedgerEntry", activities.CreateLedgerEntryInput{
		AccountType:     "expense",
		EntityID:        expenseOutput.ExpenseID,
		Amount:          input.Amount,
		Status:          "completed",
		TransactionType: "expense_" + input.Category,
	})

	// Step 3: Get budget status
	var budgetOutput activities.GetBudgetStatusOutput
	err = workflow.ExecuteActivity(ctx, "GetBudgetStatus", activities.GetBudgetStatusInput{
		FarmID:   input.FarmID,
		Category: input.Category,
	}).Get(ctx, &budgetOutput)
	if err != nil {
		logger.Warn("Budget status fetch failed", "error", err)
	}

	// Step 4: Get category and monthly totals
	var totalsOutput activities.GetExpenseTotalsOutput
	err = workflow.ExecuteActivity(ctx, "GetExpenseTotals", activities.GetExpenseTotalsInput{
		FarmID:   input.FarmID,
		Category: input.Category,
	}).Get(ctx, &totalsOutput)
	if err != nil {
		logger.Warn("Expense totals fetch failed", "error", err)
	}

	// Step 5: Check budget alerts
	if budgetOutput.BudgetRemaining < budgetOutput.BudgetTotal*0.2 {
		workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
			UserID:   input.UserID,
			Title:    "Budget Alert",
			Message:  "Your " + input.Category + " budget is running low. Remaining: ₦" + formatAmount(budgetOutput.BudgetRemaining),
			Type:     "budget_alert",
			Priority: "high",
		})
	}

	// Step 6: Sync to ERPNext
	workflow.ExecuteActivity(ctx, "SyncToERPNext", activities.SyncToERPNextInput{
		FarmerID:   input.UserID,
		EntityType: "expense",
		Amount:     input.Amount,
	})

	// Step 7: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "expense_recorded",
		EntityID:  expenseOutput.ExpenseID,
		Data: map[string]interface{}{
			"expense_id":    expenseOutput.ExpenseID,
			"farm_id":       input.FarmID,
			"category":      input.Category,
			"amount":        input.Amount,
			"monthly_total": totalsOutput.MonthlyTotal,
		},
	})

	return &ExpenseTrackingOutput{
		ExpenseID:       expenseOutput.ExpenseID,
		BudgetRemaining: budgetOutput.BudgetRemaining,
		CategoryTotal:   totalsOutput.CategoryTotal,
		MonthlyTotal:    totalsOutput.MonthlyTotal,
	}, nil
}

// Journey 19: Analytics Dashboard Generation
// UI: Analytics.tsx, AdvancedAnalytics.tsx, InputYieldAnalytics.tsx
// Backend: analytics-router.ts, analytics-service.ts
type AnalyticsDashboardInput struct {
	UserID      int    `json:"user_id"`
	FarmerID    int    `json:"farmer_id,omitempty"`
	FarmID      int    `json:"farm_id,omitempty"`
	ReportType  string `json:"report_type"` // farm_performance, financial, yield, market
	StartDate   string `json:"start_date"`
	EndDate     string `json:"end_date"`
}

type AnalyticsDashboardOutput struct {
	ReportID    int                    `json:"report_id"`
	ReportURL   string                 `json:"report_url"`
	Metrics     map[string]interface{} `json:"metrics"`
	Insights    []string               `json:"insights"`
	GeneratedAt string                 `json:"generated_at"`
}

func AnalyticsDashboardWorkflow(ctx workflow.Context, input AnalyticsDashboardInput) (*AnalyticsDashboardOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Analytics Dashboard Journey", "ReportType", input.ReportType)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Fetch data from Lakehouse
	var dataOutput activities.FetchLakehouseDataOutput
	err := workflow.ExecuteActivity(ctx, "FetchLakehouseData", activities.FetchLakehouseDataInput{
		FarmerID:   input.FarmerID,
		FarmID:     input.FarmID,
		ReportType: input.ReportType,
		StartDate:  input.StartDate,
		EndDate:    input.EndDate,
	}).Get(ctx, &dataOutput)
	if err != nil {
		return nil, err
	}

	// Step 2: Calculate metrics
	var metricsOutput activities.CalculateMetricsOutput
	err = workflow.ExecuteActivity(ctx, "CalculateMetrics", activities.CalculateMetricsInput{
		ReportType: input.ReportType,
		RawData:    dataOutput.Data,
	}).Get(ctx, &metricsOutput)
	if err != nil {
		return nil, err
	}

	// Step 3: Generate insights using ML
	var insightsOutput activities.GenerateInsightsOutput
	err = workflow.ExecuteActivity(ctx, "GenerateInsights", activities.GenerateInsightsInput{
		ReportType: input.ReportType,
		Metrics:    metricsOutput.Metrics,
	}).Get(ctx, &insightsOutput)
	if err != nil {
		logger.Warn("Insights generation failed", "error", err)
	}

	// Step 4: Generate report
	var reportOutput activities.GenerateReportOutput
	err = workflow.ExecuteActivity(ctx, "GenerateReport", activities.GenerateReportInput{
		UserID:     input.UserID,
		ReportType: input.ReportType,
		StartDate:  input.StartDate,
		EndDate:    input.EndDate,
	}).Get(ctx, &reportOutput)
	if err != nil {
		return nil, err
	}

	// Step 5: Cache report in Redis
	workflow.ExecuteActivity(ctx, "CacheReport", activities.CacheReportInput{
		ReportID:  reportOutput.ReportID,
		ReportURL: reportOutput.ReportURL,
		Metrics:   metricsOutput.Metrics,
		TTL:       3600, // 1 hour
	})

	// Step 6: Send notification
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "Report Ready",
		Message:  "Your " + input.ReportType + " report is ready to view.",
		Type:     "report",
		Priority: "medium",
	})

	return &AnalyticsDashboardOutput{
		ReportID:    reportOutput.ReportID,
		ReportURL:   reportOutput.ReportURL,
		Metrics:     metricsOutput.Metrics,
		Insights:    insightsOutput.Insights,
		GeneratedAt: time.Now().Format(time.RFC3339),
	}, nil
}

// Journey 20: Multi-Crop Season Planning
// UI: Crops.tsx, MultiFarmDashboard.tsx, CropWizard.tsx
// Backend: crop activities, land-suitability-router.ts
type SeasonPlanningInput struct {
	UserID       int           `json:"user_id"`
	FarmerID     int           `json:"farmer_id"`
	FarmID       int           `json:"farm_id"`
	SeasonYear   int           `json:"season_year"`
	SeasonType   string        `json:"season_type"` // wet, dry, harmattan
	CropPlans    []CropPlan    `json:"crop_plans"`
}

type CropPlan struct {
	CropName     string  `json:"crop_name"`
	Variety      string  `json:"variety"`
	AreaPlanned  float64 `json:"area_planned"`
	PlantingDate string  `json:"planting_date"`
}

type SeasonPlanningOutput struct {
	SeasonID          int                    `json:"season_id"`
	CropRecords       []CropRecord           `json:"crop_records"`
	TotalAreaPlanned  float64                `json:"total_area_planned"`
	EstimatedYield    float64                `json:"estimated_yield"`
	EstimatedRevenue  float64                `json:"estimated_revenue"`
	Recommendations   []string               `json:"recommendations"`
}

type CropRecord struct {
	CropID           int     `json:"crop_id"`
	CropName         string  `json:"crop_name"`
	SuitabilityScore float64 `json:"suitability_score"`
	PredictedYield   float64 `json:"predicted_yield"`
}

func SeasonPlanningWorkflow(ctx workflow.Context, input SeasonPlanningInput) (*SeasonPlanningOutput, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("Starting Season Planning Journey", "FarmID", input.FarmID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Create season record
	var seasonOutput activities.CreateSeasonOutput
	err := workflow.ExecuteActivity(ctx, "CreateSeason", activities.CreateSeasonInput{
		FarmID:     input.FarmID,
		SeasonYear: input.SeasonYear,
		SeasonType: input.SeasonType,
	}).Get(ctx, &seasonOutput)
	if err != nil {
		return nil, err
	}

	var cropRecords []CropRecord
	totalArea := 0.0
	totalEstimatedYield := 0.0
	totalEstimatedRevenue := 0.0

	// Step 2: Process each crop plan
	for _, plan := range input.CropPlans {
		// Check land suitability
		var suitOutput activities.CalculateSuitabilityOutput
		workflow.ExecuteActivity(ctx, "CalculateSuitability", activities.CalculateSuitabilityInput{
			CropName: plan.CropName,
		}).Get(ctx, &suitOutput)

		// Create crop record
		var cropOutput activities.CreateCropOutput
		err = workflow.ExecuteActivity(ctx, "CreateCrop", activities.CreateCropInput{
			UserID:       input.UserID,
			FarmID:       input.FarmID,
			CropName:     plan.CropName,
			CropVariety:  plan.Variety,
			PlantingDate: parseDate(plan.PlantingDate),
			AreaPlanted:  plan.AreaPlanned,
			Season:       input.SeasonType,
		}).Get(ctx, &cropOutput)
		if err != nil {
			logger.Warn("Failed to create crop", "crop", plan.CropName, "error", err)
			continue
		}

		// Predict yield
		var yieldOutput activities.PredictYieldOutput
		workflow.ExecuteActivity(ctx, "PredictYield", activities.PredictYieldInput{
			CropID:      cropOutput.CropID,
			CropName:    plan.CropName,
			AreaPlanted: plan.AreaPlanned,
		}).Get(ctx, &yieldOutput)

		// Get price forecast
		var priceOutput activities.ForecastPriceOutput
		workflow.ExecuteActivity(ctx, "ForecastPrice", activities.ForecastPriceInput{
			CropName: plan.CropName,
			Quantity: yieldOutput.PredictedYield,
		}).Get(ctx, &priceOutput)

		cropRecords = append(cropRecords, CropRecord{
			CropID:           cropOutput.CropID,
			CropName:         plan.CropName,
			SuitabilityScore: suitOutput.Score,
			PredictedYield:   yieldOutput.PredictedYield,
		})

		totalArea += plan.AreaPlanned
		totalEstimatedYield += yieldOutput.PredictedYield
		totalEstimatedRevenue += yieldOutput.PredictedYield * float64(priceOutput.ForecastedPrice)
	}

	// Step 3: Generate season recommendations
	var recsOutput activities.GenerateSeasonRecommendationsOutput
	workflow.ExecuteActivity(ctx, "GenerateSeasonRecommendations", activities.GenerateSeasonRecommendationsInput{
		FarmID:     input.FarmID,
		SeasonType: input.SeasonType,
		CropPlans:  input.CropPlans,
	}).Get(ctx, &recsOutput)

	// Step 4: Sync to ERPNext
	workflow.ExecuteActivity(ctx, "SyncToERPNext", activities.SyncToERPNextInput{
		FarmerID:   input.FarmerID,
		EntityType: "season_plan",
		SeasonID:   seasonOutput.SeasonID,
	})

	// Step 5: Push to Lakehouse
	workflow.ExecuteActivity(ctx, "PushToLakehouse", activities.PushToLakehouseInput{
		EventType: "season_planned",
		EntityID:  seasonOutput.SeasonID,
		Data: map[string]interface{}{
			"season_id":          seasonOutput.SeasonID,
			"farm_id":            input.FarmID,
			"season_type":        input.SeasonType,
			"crop_count":         len(input.CropPlans),
			"total_area":         totalArea,
			"estimated_yield":    totalEstimatedYield,
			"estimated_revenue":  totalEstimatedRevenue,
		},
	})

	// Step 6: Send notification
	workflow.ExecuteActivity(ctx, "SendNotification", activities.SendNotificationInput{
		UserID:   input.UserID,
		Title:    "Season Plan Created",
		Message:  "Your " + input.SeasonType + " season plan has been created with " + string(rune(len(input.CropPlans))) + " crops.",
		Type:     "season_plan",
		Priority: "medium",
	})

	return &SeasonPlanningOutput{
		SeasonID:         seasonOutput.SeasonID,
		CropRecords:      cropRecords,
		TotalAreaPlanned: totalArea,
		EstimatedYield:   totalEstimatedYield,
		EstimatedRevenue: totalEstimatedRevenue,
		Recommendations:  recsOutput.Recommendations,
	}, nil
}

// Helper functions
func formatAmount(amount float64) string {
	return string(rune(int(amount)))
}

func parseDate(dateStr string) time.Time {
	t, _ := time.Parse("2006-01-02", dateStr)
	return t
}
