package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"

	"orchestrator/activities"
	"orchestrator/middleware"
	"orchestrator/user_journeys"
	"orchestrator/workflows"
)

const (
	TaskQueueName = "farmer-data-collection-orchestrator"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Initialize Temporal client
	temporalClient, err := client.Dial(client.Options{
		HostPort:  getEnv("TEMPORAL_HOST", "localhost:7233"),
		Namespace: getEnv("TEMPORAL_NAMESPACE", "default"),
	})
	if err != nil {
		log.Fatalf("Unable to create Temporal client: %v", err)
	}
	defer temporalClient.Close()

	// Initialize middleware connections
	middlewareConfig := &middleware.Config{
		KafkaBrokers:      getEnv("KAFKA_BROKERS", "localhost:9092"),
		RedisAddr:         getEnv("REDIS_ADDR", "localhost:6379"),
		DaprHTTPPort:      getEnv("DAPR_HTTP_PORT", "3500"),
		FluvioEndpoint:    getEnv("FLUVIO_ENDPOINT", "localhost:9003"),
		KeycloakURL:       getEnv("KEYCLOAK_URL", "http://localhost:8080"),
		PermifyURL:        getEnv("PERMIFY_URL", "http://localhost:3476"),
		APISIXGateway:     getEnv("APISIX_GATEWAY", "http://localhost:9080"),
		TigerBeetleAddr:   getEnv("TIGERBEETLE_ADDR", "localhost:3001"),
		LakehouseURL:      getEnv("LAKEHOUSE_URL", "http://localhost:8000"),
		PostgresURL:       getEnv("DATABASE_URL", "postgresql://localhost:5432/farmer_db"),
	}

	middlewareManager, err := middleware.NewManager(middlewareConfig)
	if err != nil {
		log.Fatalf("Failed to initialize middleware manager: %v", err)
	}
	defer middlewareManager.Close()

	log.Println("✅ Middleware connections established")

	// Create Temporal worker
	w := worker.New(temporalClient, TaskQueueName, worker.Options{})

	// Register all workflows
	registerWorkflows(w)

	// Register all activities with middleware manager
	registerActivities(w, middlewareManager)

	log.Printf("🚀 Orchestrator worker starting on task queue: %s\n", TaskQueueName)

	// Start worker
	err = w.Run(worker.InterruptCh())
	if err != nil {
		log.Fatalf("Worker failed: %v", err)
	}

	// Graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan
	log.Println("🛑 Shutting down orchestrator gracefully...")
}

func registerWorkflows(w worker.Worker) {
	// Ginger workflows
	w.RegisterWorkflow(workflows.GingerCompleteSeasonWorkflow)
	w.RegisterWorkflow(workflows.GingerExportWorkflow)
	w.RegisterWorkflow(workflows.GingerClimateInsuranceWorkflow)

	// Palm Oil workflows
	w.RegisterWorkflow(workflows.PalmOilCooperativeWorkflow)
	w.RegisterWorkflow(workflows.PalmOilOutgrowerWorkflow)
	w.RegisterWorkflow(workflows.PalmOilBiodieselWorkflow)

	// Cocoa workflows
	w.RegisterWorkflow(workflows.CocoaExportCertificationWorkflow)
	w.RegisterWorkflow(workflows.CocoaFairTradeWorkflow)
	w.RegisterWorkflow(workflows.CocoaAgroforestryWorkflow)

	// Cassava workflows
	w.RegisterWorkflow(workflows.CassavaValueChainWorkflow)
	w.RegisterWorkflow(workflows.CassavaGarriProcessingWorkflow)
	w.RegisterWorkflow(workflows.CassavaEthanolWorkflow)

	// Yam workflows
	w.RegisterWorkflow(workflows.YamFestivalSupplyWorkflow)
	w.RegisterWorkflow(workflows.YamSeedProductionWorkflow)
	w.RegisterWorkflow(workflows.YamFlourProcessingWorkflow)

	// Rice workflows
	w.RegisterWorkflow(workflows.RiceIrrigationOptimizationWorkflow)
	w.RegisterWorkflow(workflows.RiceParboiledValueChainWorkflow)
	w.RegisterWorkflow(workflows.RiceOrganicPremiumWorkflow)

	// Maize workflows
	w.RegisterWorkflow(workflows.MaizeLivestockFeedWorkflow)
	w.RegisterWorkflow(workflows.MaizePoultryIntegrationWorkflow)
	w.RegisterWorkflow(workflows.MaizeSweetCornWorkflow)

	// Soybean workflows
	w.RegisterWorkflow(workflows.SoybeanExportAggregationWorkflow)
	w.RegisterWorkflow(workflows.SoybeanSoyMilkWorkflow)
	w.RegisterWorkflow(workflows.SoybeanTofuWorkflow)

	// Groundnut workflows
	w.RegisterWorkflow(workflows.GroundnutOilProcessingWorkflow)
	w.RegisterWorkflow(workflows.GroundnutPeanutButterWorkflow)
	w.RegisterWorkflow(workflows.GroundnutConfectioneryWorkflow)

	// Cotton workflows
	w.RegisterWorkflow(workflows.CottonTextileIntegrationWorkflow)
	w.RegisterWorkflow(workflows.CottonOrganicPremiumWorkflow)

	// Multi-crop workflows
	w.RegisterWorkflow(workflows.MultiCropRotationWorkflow)

	// ============================================================================
	// TOP 20 USER JOURNEY WORKFLOWS
	// ============================================================================
	
	// Journey 1: Farmer Onboarding with KYC and ERPNext Sync
	w.RegisterWorkflow(user_journeys.FarmerOnboardingWorkflow)
	
	// Journey 2: Farm Geotagging and Boundary Mapping
	w.RegisterWorkflow(user_journeys.FarmGeotaggingWorkflow)
	
	// Journey 3: Loan Application with Credit Scoring
	w.RegisterWorkflow(user_journeys.LoanApplicationWorkflow)
	
	// Journey 4: Marketplace Listing and Order Processing
	w.RegisterWorkflow(user_journeys.MarketplaceListingWorkflow)
	
	// Journey 5: Order Processing with Payment via TigerBeetle
	w.RegisterWorkflow(user_journeys.OrderProcessingWorkflow)
	
	// Journey 6: Yield Prediction with AI/ML Models
	w.RegisterWorkflow(user_journeys.YieldPredictionWorkflow)
	
	// Journey 7: Land Suitability Assessment
	w.RegisterWorkflow(user_journeys.LandSuitabilityWorkflow)
	
	// Journey 8: Cooperative Management and Revenue Distribution
	w.RegisterWorkflow(user_journeys.CooperativeManagementWorkflow)
	
	// Journey 9: Loan Disbursement and Repayment Tracking
	w.RegisterWorkflow(user_journeys.LoanDisbursementWorkflow)
	
	// Journey 10: Weather-Indexed Crop Insurance
	w.RegisterWorkflow(user_journeys.CropInsuranceWorkflow)
	
	// Journey 11: Input Financing for Farmers
	w.RegisterWorkflow(user_journeys.InputFinancingWorkflow)
	
	// Journey 12: Harvest Recording and Quality Grading
	w.RegisterWorkflow(user_journeys.HarvestRecordingWorkflow)
	
	// Journey 13: Agent Task Assignment and Verification
	w.RegisterWorkflow(user_journeys.AgentTaskWorkflow)
	
	// Journey 14: KYC Verification Process
	w.RegisterWorkflow(user_journeys.KYCVerificationWorkflow)
	
	// Journey 15: Carbon Credit Registration
	w.RegisterWorkflow(user_journeys.CarbonCreditWorkflow)
	
	// Journey 16: Traceability Chain Creation
	w.RegisterWorkflow(user_journeys.TraceabilityWorkflow)
	
	// Journey 17: Weather Alert and Advisory
	w.RegisterWorkflow(user_journeys.WeatherAlertWorkflow)
	
	// Journey 18: Expense Tracking and Budgeting
	w.RegisterWorkflow(user_journeys.ExpenseTrackingWorkflow)
	
	// Journey 19: Analytics Dashboard Generation
	w.RegisterWorkflow(user_journeys.AnalyticsDashboardWorkflow)
	
	// Journey 20: Multi-Crop Season Planning
	w.RegisterWorkflow(user_journeys.SeasonPlanningWorkflow)

	log.Println("✅ Registered 30 crop workflows + 20 user journey workflows (50 total)")
}

func registerActivities(w worker.Worker, mm *middleware.Manager) {
	// Create activity instances with middleware access
	authActivities := activities.NewAuthActivities(mm)
	farmActivities := activities.NewFarmActivities(mm)
	cropActivities := activities.NewCropActivities(mm)
	marketplaceActivities := activities.NewMarketplaceActivities(mm)
	financialActivities := activities.NewFinancialActivities(mm)
	mlActivities := activities.NewMLActivities(mm)
	notificationActivities := activities.NewNotificationActivities(mm)
	logisticsActivities := activities.NewLogisticsActivities(mm)
	qualityActivities := activities.NewQualityActivities(mm)
	complianceActivities := activities.NewComplianceActivities(mm)
	analyticsActivities := activities.NewAnalyticsActivities(mm)

	// Extended activities for user journeys
	farmerActivities := activities.NewFarmerActivities(mm)
	gpsActivities := activities.NewGPSActivities(mm)
	loanActivities := activities.NewLoanActivities(mm)
	weatherActivities := activities.NewWeatherActivities(mm)

	// Register all activities
	w.RegisterActivity(authActivities)
	w.RegisterActivity(farmActivities)
	w.RegisterActivity(cropActivities)
	w.RegisterActivity(marketplaceActivities)
	w.RegisterActivity(financialActivities)
	w.RegisterActivity(mlActivities)
	w.RegisterActivity(notificationActivities)
	w.RegisterActivity(logisticsActivities)
	w.RegisterActivity(qualityActivities)
	w.RegisterActivity(complianceActivities)
	w.RegisterActivity(analyticsActivities)

	// Register extended activities for user journeys
	w.RegisterActivity(farmerActivities)
	w.RegisterActivity(gpsActivities)
	w.RegisterActivity(loanActivities)
	w.RegisterActivity(weatherActivities)

	log.Println("✅ Registered 15 activity types with middleware integration (11 core + 4 extended)")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
