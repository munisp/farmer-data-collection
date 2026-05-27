package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	mw "farmer-platform/services/go/shared/middleware"
)

// LoanApplication represents a loan application
type LoanApplication struct {
	ID          int       `json:"id"`
	FarmerID    int       `json:"farmer_id"`
	Amount      float64   `json:"amount"`
	Purpose     string    `json:"purpose"`
	TermMonths  int       `json:"term_months"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	ApprovedAt  *time.Time `json:"approved_at,omitempty"`
	DisbursedAt *time.Time `json:"disbursed_at,omitempty"`
}

// LoanOrchestrator orchestrates loan processing with idempotency
type LoanOrchestrator struct {
	idempotency  *mw.IdempotencyService
	cache        *mw.CacheService
	kafka        *mw.KafkaClient
	tigerbeetle  *mw.TigerBeetleClient
	temporal     *mw.TemporalClient
	permify      *mw.PermifyClient
	dapr         *mw.DaprClient
	applications map[int]*LoanApplication
}

// NewLoanOrchestrator creates a new loan orchestrator
func NewLoanOrchestrator() (*LoanOrchestrator, error) {
	// Initialize Redis cache
	cache, err := mw.NewCacheService(mw.RedisConfig{
		URL:        getEnv("REDIS_URL", "redis://localhost:6379"),
		DefaultTTL: 5 * time.Minute,
	})
	if err != nil {
		log.Printf("[LoanOrchestrator] Warning: Redis not available: %v", err)
		cache = nil
	}

	// Initialize idempotency service
	var idempotency *mw.IdempotencyService
	if cache != nil {
		idempotency = mw.NewIdempotencyService(cache.GetClient(), 24*time.Hour)
	}

	// Initialize event tracker for Kafka
	var eventTracker *mw.ProcessedEventsTracker
	if cache != nil {
		eventTracker = mw.NewProcessedEventsTracker(cache.GetClient(), 7*24*time.Hour)
	}

	// Initialize Kafka client
	kafka := mw.NewKafkaClient(mw.KafkaConfig{
		Brokers:      []string{getEnv("KAFKA_BROKERS", "localhost:9093")},
		ClientID:     "loan-orchestrator",
		EventTracker: eventTracker,
	})

	// Initialize TigerBeetle client
	tigerbeetle := mw.NewTigerBeetleClient(mw.TigerBeetleConfig{
		ClusterID:        getEnv("TIGERBEETLE_CLUSTER_ID", "0"),
		ReplicaAddresses: []string{getEnv("TIGERBEETLE_ADDRESS", "127.0.0.1:3000")},
		Idempotency:      idempotency,
	})

	// Initialize Temporal client
	temporal := mw.NewTemporalClient(mw.TemporalConfig{
		Address:     getEnv("TEMPORAL_ADDRESS", "localhost:7233"),
		Namespace:   getEnv("TEMPORAL_NAMESPACE", "default"),
		Idempotency: idempotency,
	})

	// Initialize Permify client
	permify := mw.NewPermifyClient(mw.PermifyConfig{
		URL:      getEnv("PERMIFY_URL", "http://localhost:3476"),
		TenantID: getEnv("PERMIFY_TENANT_ID", "default"),
	}, cache)

	// Initialize Dapr client
	dapr := mw.NewDaprClient(mw.DaprConfig{
		Host:     getEnv("DAPR_HOST", "127.0.0.1"),
		HTTPPort: getEnv("DAPR_HTTP_PORT", "3500"),
	}, eventTracker)

	return &LoanOrchestrator{
		idempotency:  idempotency,
		cache:        cache,
		kafka:        kafka,
		tigerbeetle:  tigerbeetle,
		temporal:     temporal,
		permify:      permify,
		dapr:         dapr,
		applications: make(map[int]*LoanApplication),
	}, nil
}

// ApplyForLoan handles loan application with idempotency
func (o *LoanOrchestrator) ApplyForLoan(ctx context.Context, farmerID int, amount float64, purpose string, termMonths int) (*LoanApplication, error) {
	// Generate idempotency key based on business identifiers
	idempotencyKey := mw.GenerateKey("loan-application", farmerID, amount, purpose, termMonths)

	// Try to acquire idempotency lock
	if o.idempotency != nil {
		isNew, existingResult, err := o.idempotency.TryAcquire(ctx, idempotencyKey)
		if err != nil {
			return nil, fmt.Errorf("idempotency check failed: %w", err)
		}

		if !isNew && existingResult != nil {
			if existingResult.Status == "completed" {
				log.Printf("[LoanOrchestrator] Returning cached loan application result")
				var app LoanApplication
				data, _ := json.Marshal(existingResult.Result)
				json.Unmarshal(data, &app)
				return &app, nil
			}
			if existingResult.Status == "failed" {
				return nil, fmt.Errorf("previous attempt failed: %s", existingResult.Error)
			}
			// Still processing - return in-progress status
			return nil, fmt.Errorf("loan application is still being processed")
		}
	}

	// Create loan application
	applicationID := len(o.applications) + 1
	app := &LoanApplication{
		ID:         applicationID,
		FarmerID:   farmerID,
		Amount:     amount,
		Purpose:    purpose,
		TermMonths: termMonths,
		Status:     "pending",
		CreatedAt:  time.Now(),
	}

	o.applications[applicationID] = app

	// Initialize farmer accounts in TigerBeetle (idempotent)
	if err := o.tigerbeetle.InitializeFarmerAccounts(ctx, farmerID); err != nil {
		log.Printf("[LoanOrchestrator] Warning: Failed to initialize farmer accounts: %v", err)
	}

	// Start loan application workflow in Temporal (idempotent)
	_, err := o.temporal.StartLoanApplicationWorkflow(ctx, mw.LoanApplicationInput{
		ApplicationID: applicationID,
		FarmerID:      farmerID,
		Amount:        amount,
		Purpose:       purpose,
		Term:          termMonths,
	})
	if err != nil {
		log.Printf("[LoanOrchestrator] Warning: Failed to start workflow: %v", err)
	}

	// Publish loan application event to Kafka
	event := mw.CreateDeterministicEvent(
		mw.EventTypes.CREATED,
		"loan_application",
		applicationID,
		farmerID,
		app,
		idempotencyKey,
	)
	if err := o.kafka.PublishEvent(ctx, mw.Topics.AUDIT_TRAIL, event); err != nil {
		log.Printf("[LoanOrchestrator] Warning: Failed to publish event: %v", err)
	}

	// Grant farmer access to their loan application in Permify
	if err := o.permify.GrantLoanAccess(ctx, farmerID, applicationID, "owner"); err != nil {
		log.Printf("[LoanOrchestrator] Warning: Failed to grant loan access: %v", err)
	}

	// Cache the result
	if o.cache != nil {
		cacheKey := fmt.Sprintf("loan:application:%d", applicationID)
		o.cache.Set(ctx, cacheKey, app, 1*time.Hour)
	}

	// Mark idempotency as completed
	if o.idempotency != nil {
		o.idempotency.Complete(ctx, idempotencyKey, app)
	}

	log.Printf("[LoanOrchestrator] Created loan application %d for farmer %d", applicationID, farmerID)
	return app, nil
}

// ApproveLoan handles loan approval with idempotency
func (o *LoanOrchestrator) ApproveLoan(ctx context.Context, applicationID int, approverID int) (*LoanApplication, error) {
	// Check permission
	canApprove, err := o.permify.CanApproveLoan(ctx, approverID, applicationID)
	if err != nil {
		log.Printf("[LoanOrchestrator] Warning: Permission check failed: %v", err)
	}
	if !canApprove {
		return nil, fmt.Errorf("user %d is not authorized to approve loan %d", approverID, applicationID)
	}

	// Generate idempotency key
	idempotencyKey := mw.GenerateKey("loan-approval", applicationID, approverID)

	// Try to acquire idempotency lock
	if o.idempotency != nil {
		isNew, existingResult, err := o.idempotency.TryAcquire(ctx, idempotencyKey)
		if err != nil {
			return nil, fmt.Errorf("idempotency check failed: %w", err)
		}

		if !isNew && existingResult != nil && existingResult.Status == "completed" {
			log.Printf("[LoanOrchestrator] Returning cached loan approval result")
			var app LoanApplication
			data, _ := json.Marshal(existingResult.Result)
			json.Unmarshal(data, &app)
			return &app, nil
		}
	}

	// Get application
	app, ok := o.applications[applicationID]
	if !ok {
		return nil, fmt.Errorf("loan application %d not found", applicationID)
	}

	if app.Status != "pending" {
		return nil, fmt.Errorf("loan application %d is not pending (status: %s)", applicationID, app.Status)
	}

	// Update status
	now := time.Now()
	app.Status = "approved"
	app.ApprovedAt = &now

	// Publish approval event
	event := mw.CreateDeterministicEvent(
		mw.EventTypes.UPDATED,
		"loan_application",
		applicationID,
		approverID,
		map[string]interface{}{"status": "approved", "approved_at": now},
		idempotencyKey,
	)
	o.kafka.PublishEvent(ctx, mw.Topics.AUDIT_TRAIL, event)

	// Invalidate cache
	if o.cache != nil {
		cacheKey := fmt.Sprintf("loan:application:%d", applicationID)
		o.cache.Delete(ctx, cacheKey)
	}

	// Mark idempotency as completed
	if o.idempotency != nil {
		o.idempotency.Complete(ctx, idempotencyKey, app)
	}

	log.Printf("[LoanOrchestrator] Approved loan application %d", applicationID)
	return app, nil
}

// DisburseLoan handles loan disbursement with idempotency
func (o *LoanOrchestrator) DisburseLoan(ctx context.Context, applicationID int, disburserID int) (*LoanApplication, error) {
	// Check permission
	canDisburse, err := o.permify.CanDisburseLoan(ctx, disburserID, applicationID)
	if err != nil {
		log.Printf("[LoanOrchestrator] Warning: Permission check failed: %v", err)
	}
	if !canDisburse {
		return nil, fmt.Errorf("user %d is not authorized to disburse loan %d", disburserID, applicationID)
	}

	// Generate idempotency key
	idempotencyKey := mw.GenerateKey("loan-disbursement", applicationID, disburserID)

	// Try to acquire idempotency lock
	if o.idempotency != nil {
		isNew, existingResult, err := o.idempotency.TryAcquire(ctx, idempotencyKey)
		if err != nil {
			return nil, fmt.Errorf("idempotency check failed: %w", err)
		}

		if !isNew && existingResult != nil && existingResult.Status == "completed" {
			log.Printf("[LoanOrchestrator] Returning cached loan disbursement result")
			var app LoanApplication
			data, _ := json.Marshal(existingResult.Result)
			json.Unmarshal(data, &app)
			return &app, nil
		}
	}

	// Get application
	app, ok := o.applications[applicationID]
	if !ok {
		return nil, fmt.Errorf("loan application %d not found", applicationID)
	}

	if app.Status != "approved" {
		return nil, fmt.Errorf("loan application %d is not approved (status: %s)", applicationID, app.Status)
	}

	// Record disbursement in TigerBeetle (idempotent)
	amountCents := uint64(app.Amount * 100)
	if err := o.tigerbeetle.RecordLoanDisbursement(ctx, applicationID, app.FarmerID, amountCents); err != nil {
		log.Printf("[LoanOrchestrator] Warning: Failed to record disbursement: %v", err)
	}

	// Start disbursement workflow in Temporal (idempotent)
	_, err = o.temporal.StartDisbursementWorkflow(ctx, mw.DisbursementInput{
		ApplicationID: applicationID,
		FarmerID:      app.FarmerID,
		Amount:        app.Amount,
		AccountNumber: fmt.Sprintf("FARMER-%d", app.FarmerID),
	})
	if err != nil {
		log.Printf("[LoanOrchestrator] Warning: Failed to start disbursement workflow: %v", err)
	}

	// Update status
	now := time.Now()
	app.Status = "disbursed"
	app.DisbursedAt = &now

	// Publish disbursement event
	event := mw.CreateDeterministicEvent(
		mw.EventTypes.UPDATED,
		"loan_application",
		applicationID,
		disburserID,
		map[string]interface{}{"status": "disbursed", "disbursed_at": now, "amount": app.Amount},
		idempotencyKey,
	)
	o.kafka.PublishEvent(ctx, mw.Topics.AUDIT_TRAIL, event)

	// Publish via Dapr as well
	o.dapr.PublishEvent(ctx, mw.DaprTopics.NOTIFICATIONS, map[string]interface{}{
		"type":       "loan_disbursed",
		"farmer_id":  app.FarmerID,
		"loan_id":    applicationID,
		"amount":     app.Amount,
		"message":    fmt.Sprintf("Your loan of %.2f has been disbursed", app.Amount),
	})

	// Invalidate cache
	if o.cache != nil {
		cacheKey := fmt.Sprintf("loan:application:%d", applicationID)
		o.cache.Delete(ctx, cacheKey)
	}

	// Mark idempotency as completed
	if o.idempotency != nil {
		o.idempotency.Complete(ctx, idempotencyKey, app)
	}

	log.Printf("[LoanOrchestrator] Disbursed loan application %d", applicationID)
	return app, nil
}

// GetLoanApplication retrieves a loan application (with caching)
func (o *LoanOrchestrator) GetLoanApplication(ctx context.Context, applicationID int) (*LoanApplication, error) {
	// Try cache first
	if o.cache != nil {
		cacheKey := fmt.Sprintf("loan:application:%d", applicationID)
		var app LoanApplication
		if err := o.cache.GetOrSet(ctx, cacheKey, &app, func() (interface{}, error) {
			if a, ok := o.applications[applicationID]; ok {
				return a, nil
			}
			return nil, fmt.Errorf("not found")
		}, 1*time.Hour); err == nil {
			return &app, nil
		}
	}

	// Get from memory
	app, ok := o.applications[applicationID]
	if !ok {
		return nil, fmt.Errorf("loan application %d not found", applicationID)
	}

	return app, nil
}

// HTTP Handlers

func (o *LoanOrchestrator) handleApplyForLoan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FarmerID   int     `json:"farmer_id"`
		Amount     float64 `json:"amount"`
		Purpose    string  `json:"purpose"`
		TermMonths int     `json:"term_months"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	app, err := o.ApplyForLoan(r.Context(), req.FarmerID, req.Amount, req.Purpose, req.TermMonths)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(app)
}

func (o *LoanOrchestrator) handleApproveLoan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ApplicationID int `json:"application_id"`
		ApproverID    int `json:"approver_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	app, err := o.ApproveLoan(r.Context(), req.ApplicationID, req.ApproverID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(app)
}

func (o *LoanOrchestrator) handleDisburseLoan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ApplicationID int `json:"application_id"`
		DisburserID   int `json:"disburser_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	app, err := o.DisburseLoan(r.Context(), req.ApplicationID, req.DisburserID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(app)
}

func (o *LoanOrchestrator) handleHealth(w http.ResponseWriter, r *http.Request) {
	health := map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().Format(time.RFC3339),
		"services": map[string]bool{
			"redis":       o.cache != nil,
			"kafka":       o.kafka != nil,
			"tigerbeetle": o.tigerbeetle != nil,
			"temporal":    o.temporal != nil,
			"permify":     o.permify != nil,
			"dapr":        o.dapr != nil,
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func main() {
	log.Println("[LoanOrchestrator] Starting loan orchestrator service...")

	orchestrator, err := NewLoanOrchestrator()
	if err != nil {
		log.Fatalf("Failed to create loan orchestrator: %v", err)
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)

	// Routes
	r.Get("/health", orchestrator.handleHealth)
	r.Post("/loans/apply", orchestrator.handleApplyForLoan)
	r.Post("/loans/approve", orchestrator.handleApproveLoan)
	r.Post("/loans/disburse", orchestrator.handleDisburseLoan)

	port := getEnv("PORT", "8090")
	server := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("[LoanOrchestrator] Shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		server.Shutdown(ctx)
	}()

	log.Printf("[LoanOrchestrator] Listening on port %s", port)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}
