package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

// Config holds application configuration
type Config struct {
	Port          string
	DatabaseURL   string
	RedisURL      string
	KafkaBrokers  []string
	ERPNextURL    string
	ERPNextAPIKey string
	ERPNextSecret string
}

// Service represents the ERP integration service
type Service struct {
	config     *Config
	db         *sql.DB
	redis      *redis.Client
	kafka      *kafka.Writer
	logger     *zap.Logger
	httpClient *http.Client
	syncCount  prometheus.Counter
}

// ERPNextClient handles ERPNext API communication
type ERPNextClient struct {
	baseURL   string
	apiKey    string
	apiSecret string
	client    *http.Client
}

// SyncRecord tracks synchronization status
type SyncRecord struct {
	ID           string    `json:"id"`
	EntityType   string    `json:"entity_type"` // farmer, farm, product, order, etc.
	EntityID     string    `json:"entity_id"`
	ERPDocType   string    `json:"erp_doc_type"` // Customer, Item, Sales Order, etc.
	ERPDocName   string    `json:"erp_doc_name"`
	SyncStatus   string    `json:"sync_status"` // pending, synced, failed
	LastSyncAt   *time.Time `json:"last_sync_at,omitempty"`
	ErrorMessage string    `json:"error_message,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func main() {
	// Load environment variables
	godotenv.Load()

	// Initialize logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// Load configuration
	config := &Config{
		Port:          getEnv("PORT", "8087"),
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/farmer_db?sslmode=disable"),
		RedisURL:      getEnv("REDIS_URL", "redis://localhost:6379"),
		KafkaBrokers:  []string{getEnv("KAFKA_BROKERS", "localhost:9092")},
		ERPNextURL:    getEnv("ERPNEXT_URL", "https://erp.example.com"),
		ERPNextAPIKey: getEnv("ERPNEXT_API_KEY", ""),
		ERPNextSecret: getEnv("ERPNEXT_API_SECRET", ""),
	}

	// Initialize service
	service, err := NewService(config, logger)
	if err != nil {
		logger.Fatal("Failed to initialize service", zap.Error(err))
	}
	defer service.Close()

	// Start Kafka consumer for event-driven sync
	go service.startEventConsumer()

	// Setup router
	router := setupRouter(service)

	// Start server
	logger.Info("Starting ERP integration service", zap.String("port", config.Port))
	if err := router.Run(":" + config.Port); err != nil {
		logger.Fatal("Failed to start server", zap.Error(err))
	}
}

// NewService creates a new ERP integration service instance
func NewService(config *Config, logger *zap.Logger) (*Service, error) {
	// Connect to database
	db, err := sql.Open("postgres", config.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Initialize database schema
	if err := initSchema(db); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	// Connect to Redis
	opt, err := redis.ParseURL(config.RedisURL)
	if err != nil {
		logger.Warn("Failed to parse Redis URL, using default", zap.Error(err))
		opt = &redis.Options{Addr: "localhost:6379"}
	}
	redisClient := redis.NewClient(opt)

	// Test Redis connection
	ctx := context.Background()
	if err := redisClient.Ping(ctx).Err(); err != nil {
		logger.Warn("Failed to connect to Redis", zap.Error(err))
	}

	// Initialize Kafka writer
	kafkaWriter := &kafka.Writer{
		Addr:     kafka.TCP(config.KafkaBrokers...),
		Topic:    "erp.events",
		Balancer: &kafka.LeastBytes{},
	}

	// Prometheus metrics
	syncCount := prometheus.NewCounter(prometheus.CounterOpts{
		Name: "erp_sync_total",
		Help: "Total number of ERP synchronizations",
	})
	prometheus.MustRegister(syncCount)

	return &Service{
		config:     config,
		db:         db,
		redis:      redisClient,
		kafka:      kafkaWriter,
		logger:     logger,
		httpClient: &http.Client{Timeout: 30 * time.Second},
		syncCount:  syncCount,
	}, nil
}

// Close closes all service connections
func (s *Service) Close() {
	if s.db != nil {
		s.db.Close()
	}
	if s.redis != nil {
		s.redis.Close()
	}
	if s.kafka != nil {
		s.kafka.Close()
	}
}

// setupRouter configures the HTTP router
func setupRouter(service *Service) *gin.Engine {
	router := gin.Default()

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy"})
	})

	// Metrics
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// API routes
	v1 := router.Group("/api/v1")
	{
		// Sync routes
		v1.POST("/sync/farmer/:id", service.handleSyncFarmer)
		v1.POST("/sync/product/:id", service.handleSyncProduct)
		v1.POST("/sync/order/:id", service.handleSyncOrder)
		v1.POST("/sync/all", service.handleSyncAll)

		// Sync status routes
		v1.GET("/sync/status/:entity_type/:entity_id", service.handleGetSyncStatus)
		v1.GET("/sync/pending", service.handleGetPendingSync)
		v1.POST("/sync/retry/:id", service.handleRetrySync)
	}

	return router
}

// ERPNext API methods
func (s *Service) createERPNextCustomer(farmerID string) error {
	// Get farmer details
	var name, phone, email, location string
	err := s.db.QueryRow(`
		SELECT name, phone, email, location
		FROM farmers
		WHERE id = $1
	`, farmerID).Scan(&name, &phone, &email, &location)

	if err != nil {
		return fmt.Errorf("failed to get farmer: %w", err)
	}

	// Create customer in ERPNext
	customer := map[string]interface{}{
		"doctype":       "Customer",
		"customer_name": name,
		"customer_type": "Individual",
		"customer_group": "Farmers",
		"territory":     location,
		"mobile_no":     phone,
		"email_id":      email,
	}

	erpDocName, err := s.createERPNextDoc(customer)
	if err != nil {
		return err
	}

	// Record sync
	_, err = s.db.Exec(`
		INSERT INTO erp_sync_records (id, entity_type, entity_id, erp_doc_type, erp_doc_name, sync_status, last_sync_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
		ON CONFLICT (entity_type, entity_id) DO UPDATE
		SET erp_doc_name = $5, sync_status = $6, last_sync_at = NOW(), updated_at = NOW()
	`, uuid.New().String(), "farmer", farmerID, "Customer", erpDocName, "synced")

	s.syncCount.Inc()
	return err
}

func (s *Service) createERPNextItem(productID string) error {
	// Get product details
	var name, description, category string
	var pricePerUnit float64
	err := s.db.QueryRow(`
		SELECT name, description, category, price_per_unit
		FROM products
		WHERE id = $1
	`, productID).Scan(&name, &description, &category, &pricePerUnit)

	if err != nil {
		return fmt.Errorf("failed to get product: %w", err)
	}

	// Create item in ERPNext
	item := map[string]interface{}{
		"doctype":          "Item",
		"item_code":        productID,
		"item_name":        name,
		"description":      description,
		"item_group":       category,
		"stock_uom":        "Kg",
		"is_stock_item":    1,
		"is_sales_item":    1,
		"standard_rate":    pricePerUnit,
	}

	erpDocName, err := s.createERPNextDoc(item)
	if err != nil {
		return err
	}

	// Record sync
	_, err = s.db.Exec(`
		INSERT INTO erp_sync_records (id, entity_type, entity_id, erp_doc_type, erp_doc_name, sync_status, last_sync_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
		ON CONFLICT (entity_type, entity_id) DO UPDATE
		SET erp_doc_name = $5, sync_status = $6, last_sync_at = NOW(), updated_at = NOW()
	`, uuid.New().String(), "product", productID, "Item", erpDocName, "synced")

	s.syncCount.Inc()
	return err
}

func (s *Service) createERPNextSalesOrder(orderID string) error {
	// Get order details
	var productID, buyerID string
	var quantity, totalPrice float64
	err := s.db.QueryRow(`
		SELECT product_id, buyer_id, quantity, total_price
		FROM orders
		WHERE id = $1
	`, orderID).Scan(&productID, &buyerID, &quantity, &totalPrice)

	if err != nil {
		return fmt.Errorf("failed to get order: %w", err)
	}

	// Get customer ERPNext name
	var customerName string
	err = s.db.QueryRow(`
		SELECT erp_doc_name
		FROM erp_sync_records
		WHERE entity_type = 'farmer' AND entity_id = $1
	`, buyerID).Scan(&customerName)

	if err != nil {
		return fmt.Errorf("customer not synced to ERP: %w", err)
	}

	// Create sales order in ERPNext
	salesOrder := map[string]interface{}{
		"doctype":      "Sales Order",
		"customer":     customerName,
		"delivery_date": time.Now().AddDate(0, 0, 7).Format("2006-01-02"),
		"items": []map[string]interface{}{
			{
				"item_code": productID,
				"qty":       quantity,
				"rate":      totalPrice / quantity,
			},
		},
	}

	erpDocName, err := s.createERPNextDoc(salesOrder)
	if err != nil {
		return err
	}

	// Record sync
	_, err = s.db.Exec(`
		INSERT INTO erp_sync_records (id, entity_type, entity_id, erp_doc_type, erp_doc_name, sync_status, last_sync_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW())
		ON CONFLICT (entity_type, entity_id) DO UPDATE
		SET erp_doc_name = $5, sync_status = $6, last_sync_at = NOW(), updated_at = NOW()
	`, uuid.New().String(), "order", orderID, "Sales Order", erpDocName, "synced")

	s.syncCount.Inc()
	return err
}

func (s *Service) createERPNextDoc(doc map[string]interface{}) (string, error) {
	// In production, this would make actual API call to ERPNext
	// For now, simulate successful creation
	
	if s.config.ERPNextAPIKey == "" {
		s.logger.Warn("ERPNext API key not configured, simulating sync")
		return fmt.Sprintf("MOCK-%s", uuid.New().String()[:8]), nil
	}

	// Make API request to ERPNext
	jsonData, err := json.Marshal(doc)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest("POST", s.config.ERPNextURL+"/api/resource/"+doc["doctype"].(string), bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "token "+s.config.ERPNextAPIKey+":"+s.config.ERPNextSecret)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ERPNext API error: %s", string(body))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	data := result["data"].(map[string]interface{})
	return data["name"].(string), nil
}

// HTTP handlers
func (s *Service) handleSyncFarmer(c *gin.Context) {
	farmerID := c.Param("id")

	if err := s.createERPNextCustomer(farmerID); err != nil {
		s.logger.Error("Failed to sync farmer", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Farmer synced successfully"})
}

func (s *Service) handleSyncProduct(c *gin.Context) {
	productID := c.Param("id")

	if err := s.createERPNextItem(productID); err != nil {
		s.logger.Error("Failed to sync product", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Product synced successfully"})
}

func (s *Service) handleSyncOrder(c *gin.Context) {
	orderID := c.Param("id")

	if err := s.createERPNextSalesOrder(orderID); err != nil {
		s.logger.Error("Failed to sync order", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Order synced successfully"})
}

func (s *Service) handleSyncAll(c *gin.Context) {
	// Sync all pending records
	go func() {
		s.logger.Info("Starting full sync")
		// Implementation would sync all entities
	}()

	c.JSON(http.StatusAccepted, gin.H{"message": "Full sync initiated"})
}

func (s *Service) handleGetSyncStatus(c *gin.Context) {
	entityType := c.Param("entity_type")
	entityID := c.Param("entity_id")

	var record SyncRecord
	err := s.db.QueryRow(`
		SELECT id, entity_type, entity_id, erp_doc_type, erp_doc_name, sync_status, last_sync_at, error_message, created_at, updated_at
		FROM erp_sync_records
		WHERE entity_type = $1 AND entity_id = $2
	`, entityType, entityID).Scan(&record.ID, &record.EntityType, &record.EntityID,
		&record.ERPDocType, &record.ERPDocName, &record.SyncStatus, &record.LastSyncAt,
		&record.ErrorMessage, &record.CreatedAt, &record.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sync record not found"})
		return
	}

	c.JSON(http.StatusOK, record)
}

func (s *Service) handleGetPendingSync(c *gin.Context) {
	rows, err := s.db.Query(`
		SELECT id, entity_type, entity_id, erp_doc_type, erp_doc_name, sync_status, last_sync_at, error_message, created_at, updated_at
		FROM erp_sync_records
		WHERE sync_status IN ('pending', 'failed')
		ORDER BY created_at ASC
		LIMIT 100
	`)

	if err != nil {
		s.logger.Error("Failed to get pending sync", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get pending sync"})
		return
	}
	defer rows.Close()

	records := []SyncRecord{}
	for rows.Next() {
		var record SyncRecord
		err := rows.Scan(&record.ID, &record.EntityType, &record.EntityID, &record.ERPDocType,
			&record.ERPDocName, &record.SyncStatus, &record.LastSyncAt, &record.ErrorMessage,
			&record.CreatedAt, &record.UpdatedAt)
		if err != nil {
			continue
		}
		records = append(records, record)
	}

	c.JSON(http.StatusOK, records)
}

func (s *Service) handleRetrySync(c *gin.Context) {
	id := c.Param("id")

	var entityType, entityID string
	err := s.db.QueryRow(`
		SELECT entity_type, entity_id
		FROM erp_sync_records
		WHERE id = $1
	`, id).Scan(&entityType, &entityID)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sync record not found"})
		return
	}

	// Retry sync based on entity type
	switch entityType {
	case "farmer":
		err = s.createERPNextCustomer(entityID)
	case "product":
		err = s.createERPNextItem(entityID)
	case "order":
		err = s.createERPNextSalesOrder(entityID)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unknown entity type"})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Sync retried successfully"})
}

// startEventConsumer consumes events from Kafka and triggers sync
func (s *Service) startEventConsumer() {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers: s.config.KafkaBrokers,
		Topic:   "farmer.events",
		GroupID: "erp-integration",
	})
	defer reader.Close()

	s.logger.Info("Starting event consumer")

	for {
		msg, err := reader.ReadMessage(context.Background())
		if err != nil {
			s.logger.Error("Failed to read message", zap.Error(err))
			continue
		}

		var event map[string]interface{}
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			s.logger.Error("Failed to unmarshal event", zap.Error(err))
			continue
		}

		// Handle events
		eventType := event["type"].(string)
		switch eventType {
		case "farmer.created":
			s.createERPNextCustomer(event["entity_id"].(string))
		case "product.created":
			s.createERPNextItem(event["entity_id"].(string))
		case "order.created":
			s.createERPNextSalesOrder(event["entity_id"].(string))
		}
	}
}

// initSchema initializes the database schema
func initSchema(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS erp_sync_records (
		id UUID PRIMARY KEY,
		entity_type VARCHAR(50) NOT NULL,
		entity_id UUID NOT NULL,
		erp_doc_type VARCHAR(100) NOT NULL,
		erp_doc_name VARCHAR(255),
		sync_status VARCHAR(50) NOT NULL DEFAULT 'pending',
		last_sync_at TIMESTAMP,
		error_message TEXT,
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
		UNIQUE(entity_type, entity_id)
	);

	CREATE INDEX IF NOT EXISTS idx_erp_sync_status ON erp_sync_records(sync_status);
	CREATE INDEX IF NOT EXISTS idx_erp_sync_entity ON erp_sync_records(entity_type, entity_id);
	`

	_, err := db.Exec(schema)
	return err
}

// getEnv gets environment variable with fallback
func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
