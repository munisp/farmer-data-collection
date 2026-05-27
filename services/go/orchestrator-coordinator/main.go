package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

/*
Orchestrator Coordinator Service
Central coordination point for all user journey workflows

Integrates:
- Temporal workflows
- TigerBeetle ledger
- Lakehouse analytics
- Kafka event streaming
- Dapr service mesh
- APISIX API gateway
- Keycloak authentication
- Permify authorization
- Redis caching
- Fluvio real-time streaming
*/

var (
	temporalURL     = getEnv("TEMPORAL_URL", "http://localhost:7233")
	tigerbeetleURL  = getEnv("TIGERBEETLE_URL", "http://localhost:8084")
	lakehouseURL    = getEnv("LAKEHOUSE_URL", "http://localhost:8085")
	kafkaURL        = getEnv("KAFKA_URL", "localhost:9092")
	redisURL        = getEnv("REDIS_URL", "localhost:6379")
	apisixURL       = getEnv("APISIX_URL", "http://localhost:9080")
	keycloakURL     = getEnv("KEYCLOAK_URL", "http://localhost:8080")
	permifyURL      = getEnv("PERMIFY_URL", "http://localhost:3476")
)

type UserJourneyRequest struct {
	JourneyType string                 `json:"journey_type"`
	UserID      int                    `json:"user_id"`
	Data        map[string]interface{} `json:"data"`
	Channel     string                 `json:"channel"` // ussd, sms, whatsapp
}

type UserJourneyResponse struct {
	Success    bool                   `json:"success"`
	JourneyID  string                 `json:"journey_id"`
	WorkflowID string                 `json:"workflow_id"`
	Status     string                 `json:"status"`
	Message    string                 `json:"message"`
	Data       map[string]interface{} `json:"data"`
}

func main() {
	port := getEnv("PORT", "8086")

	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(120 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Routes
	r.Get("/health", healthHandler)
	r.Post("/journey/start", startJourneyHandler)
	r.Get("/journey/{journey_id}/status", getJourneyStatusHandler)
	r.Post("/journey/{journey_id}/signal", sendJourneySignalHandler)
	
	// Journey-specific endpoints
	r.Post("/journey/registration-harvest", registrationHarvestHandler)
	r.Post("/journey/expense-tracking", expenseTrackingHandler)
	r.Post("/journey/marketplace-sale", marketplaceSaleHandler)
	r.Post("/journey/planting-advisory", plantingAdvisoryHandler)
	r.Post("/journey/loan-application", loanApplicationHandler)
	r.Post("/journey/disease-management", diseaseManagementHandler)
	r.Post("/journey/group-savings", groupSavingsHandler)
	r.Post("/journey/insurance-claim", insuranceClaimHandler)
	r.Post("/journey/market-negotiation", marketNegotiationHandler)
	r.Post("/journey/annual-report", annualReportHandler)

	log.Printf("Orchestrator Coordinator starting on port %s", port)
	log.Printf("Temporal: %s", temporalURL)
	log.Printf("TigerBeetle: %s", tigerbeetleURL)
	log.Printf("Lakehouse: %s", lakehouseURL)
	
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	// Check all service health
	services := map[string]string{
		"temporal":     temporalURL + "/health",
		"tigerbeetle": tigerbeetleURL + "/health",
		"lakehouse":   lakehouseURL + "/health",
	}

	health := map[string]interface{}{
		"status":    "healthy",
		"service":   "orchestrator-coordinator",
		"timestamp": time.Now(),
		"services":  make(map[string]string),
	}

	for name, url := range services {
		status := "unknown"
		resp, err := http.Get(url)
		if err == nil && resp.StatusCode == 200 {
			status = "healthy"
		} else {
			status = "unhealthy"
		}
		health["services"].(map[string]string)[name] = status
	}

	json.NewEncoder(w).Encode(health)
}

func startJourneyHandler(w http.ResponseWriter, r *http.Request) {
	var req UserJourneyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Generate journey ID
	journeyID := fmt.Sprintf("%s_%d_%d", req.JourneyType, req.UserID, time.Now().Unix())

	// Route to appropriate journey handler
	var response UserJourneyResponse
	
	switch req.JourneyType {
	case "registration_harvest":
		response = handleRegistrationHarvest(req, journeyID)
	case "expense_tracking":
		response = handleExpenseTracking(req, journeyID)
	case "marketplace_sale":
		response = handleMarketplaceSale(req, journeyID)
	case "planting_advisory":
		response = handlePlantingAdvisory(req, journeyID)
	case "loan_application":
		response = handleLoanApplication(req, journeyID)
	case "disease_management":
		response = handleDiseaseManagement(req, journeyID)
	case "group_savings":
		response = handleGroupSavings(req, journeyID)
	case "insurance_claim":
		response = handleInsuranceClaim(req, journeyID)
	case "market_negotiation":
		response = handleMarketNegotiation(req, journeyID)
	case "annual_report":
		response = handleAnnualReport(req, journeyID)
	default:
		http.Error(w, "Unknown journey type", http.StatusBadRequest)
		return
	}

	// Track journey in Lakehouse
	trackJourneyEvent(journeyID, req.UserID, req.JourneyType, "started", req.Data)

	// Publish to Kafka
	publishKafkaEvent("journey.started", map[string]interface{}{
		"journey_id":   journeyID,
		"journey_type": req.JourneyType,
		"user_id":      req.UserID,
		"channel":      req.Channel,
	})

	json.NewEncoder(w).Encode(response)
}

func getJourneyStatusHandler(w http.ResponseWriter, r *http.Request) {
	journeyID := chi.URLParam(r, "journey_id")
	
	// Query Temporal workflow status
	// (Mock implementation)
	status := map[string]interface{}{
		"journey_id": journeyID,
		"status":     "in_progress",
		"timestamp":  time.Now(),
	}

	json.NewEncoder(w).Encode(status)
}

func sendJourneySignalHandler(w http.ResponseWriter, r *http.Request) {
	journeyID := chi.URLParam(r, "journey_id")
	
	var signal map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&signal); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Send signal to Temporal workflow
	log.Printf("Sending signal to journey %s: %v", journeyID, signal)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":    true,
		"journey_id": journeyID,
		"signal":     signal,
	})
}

// ============================================================================
// JOURNEY HANDLERS
// ============================================================================

func registrationHarvestHandler(w http.ResponseWriter, r *http.Request) {
	var req UserJourneyRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	journeyID := fmt.Sprintf("reg_%d_%d", req.UserID, time.Now().Unix())
	response := handleRegistrationHarvest(req, journeyID)
	
	json.NewEncoder(w).Encode(response)
}

func expenseTrackingHandler(w http.ResponseWriter, r *http.Request) {
	var req UserJourneyRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	journeyID := fmt.Sprintf("exp_%d_%d", req.UserID, time.Now().Unix())
	response := handleExpenseTracking(req, journeyID)
	
	json.NewEncoder(w).Encode(response)
}

func marketplaceSaleHandler(w http.ResponseWriter, r *http.Request) {
	var req UserJourneyRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	journeyID := fmt.Sprintf("mkt_%d_%d", req.UserID, time.Now().Unix())
	response := handleMarketplaceSale(req, journeyID)
	
	json.NewEncoder(w).Encode(response)
}

func plantingAdvisoryHandler(w http.ResponseWriter, r *http.Request) {
	var req UserJourneyRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	journeyID := fmt.Sprintf("plt_%d_%d", req.UserID, time.Now().Unix())
	response := handlePlantingAdvisory(req, journeyID)
	
	json.NewEncoder(w).Encode(response)
}

func loanApplicationHandler(w http.ResponseWriter, r *http.Request) {
	var req UserJourneyRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	journeyID := fmt.Sprintf("loan_%d_%d", req.UserID, time.Now().Unix())
	response := handleLoanApplication(req, journeyID)
	
	json.NewEncoder(w).Encode(response)
}

func diseaseManagementHandler(w http.ResponseWriter, r *http.Request) {
	var req UserJourneyRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	journeyID := fmt.Sprintf("dis_%d_%d", req.UserID, time.Now().Unix())
	response := handleDiseaseManagement(req, journeyID)
	
	json.NewEncoder(w).Encode(response)
}

func groupSavingsHandler(w http.ResponseWriter, r *http.Request) {
	var req UserJourneyRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	journeyID := fmt.Sprintf("grp_%d_%d", req.UserID, time.Now().Unix())
	response := handleGroupSavings(req, journeyID)
	
	json.NewEncoder(w).Encode(response)
}

func insuranceClaimHandler(w http.ResponseWriter, r *http.Request) {
	var req UserJourneyRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	journeyID := fmt.Sprintf("ins_%d_%d", req.UserID, time.Now().Unix())
	response := handleInsuranceClaim(req, journeyID)
	
	json.NewEncoder(w).Encode(response)
}

func marketNegotiationHandler(w http.ResponseWriter, r *http.Request) {
	var req UserJourneyRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	journeyID := fmt.Sprintf("neg_%d_%d", req.UserID, time.Now().Unix())
	response := handleMarketNegotiation(req, journeyID)
	
	json.NewEncoder(w).Encode(response)
}

func annualReportHandler(w http.ResponseWriter, r *http.Request) {
	var req UserJourneyRequest
	json.NewDecoder(r.Body).Decode(&req)
	
	journeyID := fmt.Sprintf("rpt_%d_%d", req.UserID, time.Now().Unix())
	response := handleAnnualReport(req, journeyID)
	
	json.NewEncoder(w).Encode(response)
}

// ============================================================================
// JOURNEY IMPLEMENTATION FUNCTIONS
// ============================================================================

func handleRegistrationHarvest(req UserJourneyRequest, journeyID string) UserJourneyResponse {
	log.Printf("Starting registration & harvest journey for user %d", req.UserID)
	
	// Create TigerBeetle account
	createTigerbeetleAccount(req.UserID)
	
	// Start Temporal workflow
	workflowID := startTemporalWorkflow("RegisterAndHarvestWorkflow", req.Data)
	
	return UserJourneyResponse{
		Success:    true,
		JourneyID:  journeyID,
		WorkflowID: workflowID,
		Status:     "started",
		Message:    "Registration and harvest journey started",
		Data:       make(map[string]interface{}),
	}
}

func handleExpenseTracking(req UserJourneyRequest, journeyID string) UserJourneyResponse {
	log.Printf("Starting expense tracking journey for user %d", req.UserID)
	
	// Record expense in TigerBeetle
	amount := req.Data["amount"].(float64)
	createLedgerEntry(req.UserID, "expense", -amount, req.Data)
	
	// Start Temporal workflow
	workflowID := startTemporalWorkflow("DailyExpenseTrackingWorkflow", req.Data)
	
	// Get weekly summary from Lakehouse
	weeklySummary := getLakehouseWeeklyExpenses(req.UserID)
	
	return UserJourneyResponse{
		Success:    true,
		JourneyID:  journeyID,
		WorkflowID: workflowID,
		Status:     "completed",
		Message:    "Expense tracked successfully",
		Data:       weeklySummary,
	}
}

func handleMarketplaceSale(req UserJourneyRequest, journeyID string) UserJourneyResponse {
	log.Printf("Starting marketplace sale journey for user %d", req.UserID)
	
	workflowID := startTemporalWorkflow("MarketplaceSaleWorkflow", req.Data)
	
	return UserJourneyResponse{
		Success:    true,
		JourneyID:  journeyID,
		WorkflowID: workflowID,
		Status:     "started",
		Message:    "Marketplace listing created",
		Data:       make(map[string]interface{}),
	}
}

func handlePlantingAdvisory(req UserJourneyRequest, journeyID string) UserJourneyResponse {
	log.Printf("Starting planting advisory journey for user %d", req.UserID)
	
	workflowID := startTemporalWorkflow("PlantingAdvisoryWorkflow", req.Data)
	
	return UserJourneyResponse{
		Success:    true,
		JourneyID:  journeyID,
		WorkflowID: workflowID,
		Status:     "started",
		Message:    "Planting advisory started",
		Data:       make(map[string]interface{}),
	}
}

func handleLoanApplication(req UserJourneyRequest, journeyID string) UserJourneyResponse {
	log.Printf("Starting loan application journey for user %d", req.UserID)
	
	// Get ML features from Lakehouse
	mlFeatures := getLakehouseMLFeatures(req.UserID)
	req.Data["ml_features"] = mlFeatures
	
	workflowID := startTemporalWorkflow("LoanApplicationWorkflow", req.Data)
	
	return UserJourneyResponse{
		Success:    true,
		JourneyID:  journeyID,
		WorkflowID: workflowID,
		Status:     "started",
		Message:    "Loan application submitted",
		Data:       make(map[string]interface{}),
	}
}

func handleDiseaseManagement(req UserJourneyRequest, journeyID string) UserJourneyResponse {
	log.Printf("Starting disease management journey for user %d", req.UserID)
	
	workflowID := startTemporalWorkflow("CropDiseaseManagementWorkflow", req.Data)
	
	return UserJourneyResponse{
		Success:    true,
		JourneyID:  journeyID,
		WorkflowID: workflowID,
		Status:     "started",
		Message:    "Disease analysis started",
		Data:       make(map[string]interface{}),
	}
}

func handleGroupSavings(req UserJourneyRequest, journeyID string) UserJourneyResponse {
	log.Printf("Starting group savings journey for user %d", req.UserID)
	
	workflowID := startTemporalWorkflow("GroupSavingsWorkflow", req.Data)
	
	return UserJourneyResponse{
		Success:    true,
		JourneyID:  journeyID,
		WorkflowID: workflowID,
		Status:     "started",
		Message:    "Group savings created",
		Data:       make(map[string]interface{}),
	}
}

func handleInsuranceClaim(req UserJourneyRequest, journeyID string) UserJourneyResponse {
	log.Printf("Starting insurance claim journey for user %d", req.UserID)
	
	workflowID := startTemporalWorkflow("InsuranceClaimWorkflow", req.Data)
	
	return UserJourneyResponse{
		Success:    true,
		JourneyID:  journeyID,
		WorkflowID: workflowID,
		Status:     "started",
		Message:    "Insurance claim submitted",
		Data:       make(map[string]interface{}),
	}
}

func handleMarketNegotiation(req UserJourneyRequest, journeyID string) UserJourneyResponse {
	log.Printf("Starting market negotiation journey for user %d", req.UserID)
	
	// Get market prices from Lakehouse
	product := req.Data["product"].(string)
	marketPrices := getLakehouseMarketPrices(product)
	req.Data["market_prices"] = marketPrices
	
	workflowID := startTemporalWorkflow("MarketNegotiationWorkflow", req.Data)
	
	return UserJourneyResponse{
		Success:    true,
		JourneyID:  journeyID,
		WorkflowID: workflowID,
		Status:     "started",
		Message:    "Market listing created",
		Data:       marketPrices,
	}
}

func handleAnnualReport(req UserJourneyRequest, journeyID string) UserJourneyResponse {
	log.Printf("Starting annual report journey for user %d", req.UserID)
	
	// Get annual data from Lakehouse
	year := int(req.Data["year"].(float64))
	annualData := getLakehouseAnnualReport(req.UserID, year)
	req.Data["annual_data"] = annualData
	
	workflowID := startTemporalWorkflow("AnnualReportWorkflow", req.Data)
	
	return UserJourneyResponse{
		Success:    true,
		JourneyID:  journeyID,
		WorkflowID: workflowID,
		Status:     "started",
		Message:    "Annual report generation started",
		Data:       annualData,
	}
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

func createTigerbeetleAccount(userID int) {
	url := tigerbeetleURL + "/accounts"
	data := map[string]interface{}{
		"user_id":  userID,
		"currency": "NGN",
		"ledger":   1,
	}
	
	makeHTTPRequest("POST", url, data)
}

func createLedgerEntry(userID int, txType string, amount float64, metadata map[string]interface{}) {
	url := tigerbeetleURL + "/transfers"
	data := map[string]interface{}{
		"from_user_id": userID,
		"to_user_id":   999999, // System account
		"amount":       int64(amount * 100), // Convert to kobo
		"currency":     "NGN",
		"type":         txType,
		"reference":    metadata,
	}
	
	makeHTTPRequest("POST", url, data)
}

func startTemporalWorkflow(workflowType string, data map[string]interface{}) string {
	// Mock implementation - in production, use Temporal SDK
	workflowID := fmt.Sprintf("%s_%d", workflowType, time.Now().Unix())
	log.Printf("Started Temporal workflow: %s", workflowID)
	return workflowID
}

func trackJourneyEvent(journeyID string, userID int, journeyType, step string, data map[string]interface{}) {
	url := lakehouseURL + "/user-journey/track"
	payload := map[string]interface{}{
		"journey_id":   journeyID,
		"user_id":      userID,
		"journey_type": journeyType,
		"step":         step,
		"status":       "in_progress",
		"data":         data,
		"timestamp":    time.Now(),
	}
	
	makeHTTPRequest("POST", url, payload)
}

func publishKafkaEvent(topic string, data map[string]interface{}) {
	// Mock implementation - in production, use Kafka producer
	log.Printf("Published to Kafka topic %s: %v", topic, data)
}

func getLakehouseWeeklyExpenses(userID int) map[string]interface{} {
	url := fmt.Sprintf("%s/analytics/weekly-expenses/%d", lakehouseURL, userID)
	resp := makeHTTPRequest("GET", url, nil)
	return resp
}

func getLakehouseMLFeatures(userID int) map[string]interface{} {
	url := fmt.Sprintf("%s/ml/features/%d", lakehouseURL, userID)
	resp := makeHTTPRequest("GET", url, nil)
	return resp
}

func getLakehouseMarketPrices(product string) map[string]interface{} {
	url := fmt.Sprintf("%s/market-prices/%s", lakehouseURL, product)
	resp := makeHTTPRequest("GET", url, nil)
	return resp
}

func getLakehouseAnnualReport(userID int, year int) map[string]interface{} {
	url := fmt.Sprintf("%s/analytics/annual-report/%d/%d", lakehouseURL, userID, year)
	resp := makeHTTPRequest("GET", url, nil)
	return resp
}

func makeHTTPRequest(method, url string, data interface{}) map[string]interface{} {
	var req *http.Request
	var err error

	if data != nil {
		jsonData, _ := json.Marshal(data)
		req, err = http.NewRequest(method, url, bytes.NewBuffer(jsonData))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req, err = http.NewRequest(method, url, nil)
	}

	if err != nil {
		log.Printf("Error creating request: %v", err)
		return nil
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Error making request to %s: %v", url, err)
		return nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	
	var result map[string]interface{}
	json.Unmarshal(body, &result)
	
	return result
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
