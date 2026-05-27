package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

// Config holds application configuration
type Config struct {
	Port         string
	DatabaseURL  string
	RedisURL     string
	KafkaBrokers []string
}

// Service represents the marketplace service
type Service struct {
	config *Config
	db     *sql.DB
	redis  *redis.Client
	kafka  *kafka.Writer
	logger *zap.Logger
}

// Product represents a marketplace product listing
type Product struct {
	ID          string    `json:"id"`
	SellerID    string    `json:"seller_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Category    string    `json:"category"` // crops, livestock, equipment, inputs
	Quantity    float64   `json:"quantity"`
	Unit        string    `json:"unit"`
	PricePerUnit float64  `json:"price_per_unit"`
	Currency    string    `json:"currency"`
	Location    string    `json:"location"`
	ImageURLs   []string  `json:"image_urls,omitempty"`
	Status      string    `json:"status"` // available, sold, reserved
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Order represents a marketplace order
type Order struct {
	ID           string    `json:"id"`
	ProductID    string    `json:"product_id"`
	BuyerID      string    `json:"buyer_id"`
	SellerID     string    `json:"seller_id"`
	Quantity     float64   `json:"quantity"`
	TotalPrice   float64   `json:"total_price"`
	Currency     string    `json:"currency"`
	Status       string    `json:"status"` // pending, confirmed, shipped, delivered, cancelled
	PaymentStatus string   `json:"payment_status"` // pending, paid, refunded
	DeliveryAddress string `json:"delivery_address"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Review represents a product or seller review
type Review struct {
	ID         string    `json:"id"`
	ProductID  string    `json:"product_id,omitempty"`
	SellerID   string    `json:"seller_id,omitempty"`
	BuyerID    string    `json:"buyer_id"`
	Rating     int       `json:"rating"` // 1-5
	Comment    string    `json:"comment"`
	CreatedAt  time.Time `json:"created_at"`
}

// Event represents a domain event
type Event struct {
	Type      string                 `json:"type"`
	Timestamp time.Time              `json:"timestamp"`
	EntityID  string                 `json:"entity_id"`
	Data      map[string]interface{} `json:"data"`
}

func main() {
	// Load environment variables
	godotenv.Load()

	// Initialize logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// Load configuration
	config := &Config{
		Port:         getEnv("PORT", "8086"),
		DatabaseURL:  getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/farmer_db?sslmode=disable"),
		RedisURL:     getEnv("REDIS_URL", "redis://localhost:6379"),
		KafkaBrokers: []string{getEnv("KAFKA_BROKERS", "localhost:9092")},
	}

	// Initialize service
	service, err := NewService(config, logger)
	if err != nil {
		logger.Fatal("Failed to initialize service", zap.Error(err))
	}
	defer service.Close()

	// Setup router
	router := setupRouter(service)

	// Start server
	logger.Info("Starting marketplace service", zap.String("port", config.Port))
	if err := router.Run(":" + config.Port); err != nil {
		logger.Fatal("Failed to start server", zap.Error(err))
	}
}

// NewService creates a new marketplace service instance
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
		Topic:    "marketplace.events",
		Balancer: &kafka.LeastBytes{},
	}

	return &Service{
		config: config,
		db:     db,
		redis:  redisClient,
		kafka:  kafkaWriter,
		logger: logger,
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
		// Product routes
		v1.POST("/products", service.handleCreateProduct)
		v1.GET("/products", service.handleListProducts)
		v1.GET("/products/:id", service.handleGetProduct)
		v1.PUT("/products/:id", service.handleUpdateProduct)
		v1.DELETE("/products/:id", service.handleDeleteProduct)
		v1.GET("/products/search", service.handleSearchProducts)

		// Order routes
		v1.POST("/orders", service.handleCreateOrder)
		v1.GET("/orders", service.handleListOrders)
		v1.GET("/orders/:id", service.handleGetOrder)
		v1.PUT("/orders/:id/status", service.handleUpdateOrderStatus)
		v1.POST("/orders/:id/cancel", service.handleCancelOrder)

		// Review routes
		v1.POST("/reviews", service.handleCreateReview)
		v1.GET("/reviews/product/:product_id", service.handleGetProductReviews)
		v1.GET("/reviews/seller/:seller_id", service.handleGetSellerReviews)
	}

	return router
}

// Product handlers
func (s *Service) handleCreateProduct(c *gin.Context) {
	var product Product
	if err := c.ShouldBindJSON(&product); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	product.ID = uuid.New().String()
	product.Status = "available"
	product.CreatedAt = time.Now()
	product.UpdatedAt = time.Now()

	imageURLsJSON, _ := json.Marshal(product.ImageURLs)

	_, err := s.db.Exec(`
		INSERT INTO products (id, seller_id, name, description, category, quantity, unit, price_per_unit, currency, location, image_urls, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`, product.ID, product.SellerID, product.Name, product.Description, product.Category,
		product.Quantity, product.Unit, product.PricePerUnit, product.Currency, product.Location,
		imageURLsJSON, product.Status, product.CreatedAt, product.UpdatedAt)

	if err != nil {
		s.logger.Error("Failed to create product", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create product"})
		return
	}

	s.publishEvent(Event{
		Type:      "product.created",
		Timestamp: time.Now(),
		EntityID:  product.ID,
		Data: map[string]interface{}{
			"name":     product.Name,
			"category": product.Category,
			"price":    product.PricePerUnit,
		},
	})

	c.JSON(http.StatusCreated, product)
}

func (s *Service) handleListProducts(c *gin.Context) {
	category := c.Query("category")
	sellerID := c.Query("seller_id")
	status := c.Query("status")

	query := `
		SELECT id, seller_id, name, description, category, quantity, unit, price_per_unit, currency, location, image_urls, status, created_at, updated_at
		FROM products
		WHERE 1=1
	`
	args := []interface{}{}
	argCount := 1

	if category != "" {
		query += fmt.Sprintf(" AND category = $%d", argCount)
		args = append(args, category)
		argCount++
	}

	if sellerID != "" {
		query += fmt.Sprintf(" AND seller_id = $%d", argCount)
		args = append(args, sellerID)
		argCount++
	}

	if status != "" {
		query += fmt.Sprintf(" AND status = $%d", argCount)
		args = append(args, status)
		argCount++
	}

	query += " ORDER BY created_at DESC LIMIT 100"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		s.logger.Error("Failed to list products", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list products"})
		return
	}
	defer rows.Close()

	products := []Product{}
	for rows.Next() {
		var product Product
		var imageURLsJSON []byte

		err := rows.Scan(&product.ID, &product.SellerID, &product.Name, &product.Description,
			&product.Category, &product.Quantity, &product.Unit, &product.PricePerUnit,
			&product.Currency, &product.Location, &imageURLsJSON, &product.Status,
			&product.CreatedAt, &product.UpdatedAt)
		if err != nil {
			continue
		}

		if len(imageURLsJSON) > 0 {
			json.Unmarshal(imageURLsJSON, &product.ImageURLs)
		}

		products = append(products, product)
	}

	c.JSON(http.StatusOK, products)
}

func (s *Service) handleGetProduct(c *gin.Context) {
	id := c.Param("id")

	var product Product
	var imageURLsJSON []byte

	err := s.db.QueryRow(`
		SELECT id, seller_id, name, description, category, quantity, unit, price_per_unit, currency, location, image_urls, status, created_at, updated_at
		FROM products
		WHERE id = $1
	`, id).Scan(&product.ID, &product.SellerID, &product.Name, &product.Description,
		&product.Category, &product.Quantity, &product.Unit, &product.PricePerUnit,
		&product.Currency, &product.Location, &imageURLsJSON, &product.Status,
		&product.CreatedAt, &product.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
		return
	}

	if len(imageURLsJSON) > 0 {
		json.Unmarshal(imageURLsJSON, &product.ImageURLs)
	}

	c.JSON(http.StatusOK, product)
}

func (s *Service) handleUpdateProduct(c *gin.Context) {
	id := c.Param("id")

	var product Product
	if err := c.ShouldBindJSON(&product); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	product.UpdatedAt = time.Now()
	imageURLsJSON, _ := json.Marshal(product.ImageURLs)

	_, err := s.db.Exec(`
		UPDATE products
		SET name = $1, description = $2, category = $3, quantity = $4, unit = $5, price_per_unit = $6, currency = $7, location = $8, image_urls = $9, status = $10, updated_at = $11
		WHERE id = $12
	`, product.Name, product.Description, product.Category, product.Quantity, product.Unit,
		product.PricePerUnit, product.Currency, product.Location, imageURLsJSON, product.Status,
		product.UpdatedAt, id)

	if err != nil {
		s.logger.Error("Failed to update product", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update product"})
		return
	}

	s.publishEvent(Event{
		Type:      "product.updated",
		Timestamp: time.Now(),
		EntityID:  id,
		Data: map[string]interface{}{
			"name": product.Name,
		},
	})

	c.JSON(http.StatusOK, product)
}

func (s *Service) handleDeleteProduct(c *gin.Context) {
	id := c.Param("id")

	_, err := s.db.Exec("DELETE FROM products WHERE id = $1", id)
	if err != nil {
		s.logger.Error("Failed to delete product", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete product"})
		return
	}

	s.publishEvent(Event{
		Type:      "product.deleted",
		Timestamp: time.Now(),
		EntityID:  id,
		Data:      map[string]interface{}{},
	})

	c.JSON(http.StatusOK, gin.H{"message": "Product deleted successfully"})
}

func (s *Service) handleSearchProducts(c *gin.Context) {
	searchTerm := c.Query("q")

	rows, err := s.db.Query(`
		SELECT id, seller_id, name, description, category, quantity, unit, price_per_unit, currency, location, image_urls, status, created_at, updated_at
		FROM products
		WHERE (name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
		  AND status = 'available'
		ORDER BY created_at DESC
		LIMIT 50
	`, "%"+searchTerm+"%")

	if err != nil {
		s.logger.Error("Failed to search products", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search products"})
		return
	}
	defer rows.Close()

	products := []Product{}
	for rows.Next() {
		var product Product
		var imageURLsJSON []byte

		err := rows.Scan(&product.ID, &product.SellerID, &product.Name, &product.Description,
			&product.Category, &product.Quantity, &product.Unit, &product.PricePerUnit,
			&product.Currency, &product.Location, &imageURLsJSON, &product.Status,
			&product.CreatedAt, &product.UpdatedAt)
		if err != nil {
			continue
		}

		if len(imageURLsJSON) > 0 {
			json.Unmarshal(imageURLsJSON, &product.ImageURLs)
		}

		products = append(products, product)
	}

	c.JSON(http.StatusOK, products)
}

// Order handlers
func (s *Service) handleCreateOrder(c *gin.Context) {
	var order Order
	if err := c.ShouldBindJSON(&order); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	order.ID = uuid.New().String()
	order.Status = "pending"
	order.PaymentStatus = "pending"
	order.CreatedAt = time.Now()
	order.UpdatedAt = time.Now()

	_, err := s.db.Exec(`
		INSERT INTO orders (id, product_id, buyer_id, seller_id, quantity, total_price, currency, status, payment_status, delivery_address, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, order.ID, order.ProductID, order.BuyerID, order.SellerID, order.Quantity,
		order.TotalPrice, order.Currency, order.Status, order.PaymentStatus,
		order.DeliveryAddress, order.CreatedAt, order.UpdatedAt)

	if err != nil {
		s.logger.Error("Failed to create order", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create order"})
		return
	}

	s.publishEvent(Event{
		Type:      "order.created",
		Timestamp: time.Now(),
		EntityID:  order.ID,
		Data: map[string]interface{}{
			"product_id":  order.ProductID,
			"buyer_id":    order.BuyerID,
			"total_price": order.TotalPrice,
		},
	})

	c.JSON(http.StatusCreated, order)
}

func (s *Service) handleListOrders(c *gin.Context) {
	buyerID := c.Query("buyer_id")
	sellerID := c.Query("seller_id")

	query := `
		SELECT id, product_id, buyer_id, seller_id, quantity, total_price, currency, status, payment_status, delivery_address, created_at, updated_at
		FROM orders
		WHERE 1=1
	`
	args := []interface{}{}
	argCount := 1

	if buyerID != "" {
		query += fmt.Sprintf(" AND buyer_id = $%d", argCount)
		args = append(args, buyerID)
		argCount++
	}

	if sellerID != "" {
		query += fmt.Sprintf(" AND seller_id = $%d", argCount)
		args = append(args, sellerID)
		argCount++
	}

	query += " ORDER BY created_at DESC LIMIT 100"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		s.logger.Error("Failed to list orders", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list orders"})
		return
	}
	defer rows.Close()

	orders := []Order{}
	for rows.Next() {
		var order Order
		err := rows.Scan(&order.ID, &order.ProductID, &order.BuyerID, &order.SellerID,
			&order.Quantity, &order.TotalPrice, &order.Currency, &order.Status,
			&order.PaymentStatus, &order.DeliveryAddress, &order.CreatedAt, &order.UpdatedAt)
		if err != nil {
			continue
		}
		orders = append(orders, order)
	}

	c.JSON(http.StatusOK, orders)
}

func (s *Service) handleGetOrder(c *gin.Context) {
	id := c.Param("id")

	var order Order
	err := s.db.QueryRow(`
		SELECT id, product_id, buyer_id, seller_id, quantity, total_price, currency, status, payment_status, delivery_address, created_at, updated_at
		FROM orders
		WHERE id = $1
	`, id).Scan(&order.ID, &order.ProductID, &order.BuyerID, &order.SellerID,
		&order.Quantity, &order.TotalPrice, &order.Currency, &order.Status,
		&order.PaymentStatus, &order.DeliveryAddress, &order.CreatedAt, &order.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Order not found"})
		return
	}

	c.JSON(http.StatusOK, order)
}

func (s *Service) handleUpdateOrderStatus(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		Status        string `json:"status"`
		PaymentStatus string `json:"payment_status,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := s.db.Exec(`
		UPDATE orders
		SET status = $1, payment_status = COALESCE(NULLIF($2, ''), payment_status), updated_at = NOW()
		WHERE id = $3
	`, req.Status, req.PaymentStatus, id)

	if err != nil {
		s.logger.Error("Failed to update order status", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update order status"})
		return
	}

	s.publishEvent(Event{
		Type:      "order.status_updated",
		Timestamp: time.Now(),
		EntityID:  id,
		Data: map[string]interface{}{
			"status": req.Status,
		},
	})

	c.JSON(http.StatusOK, gin.H{"message": "Order status updated"})
}

func (s *Service) handleCancelOrder(c *gin.Context) {
	id := c.Param("id")

	_, err := s.db.Exec(`
		UPDATE orders
		SET status = 'cancelled', updated_at = NOW()
		WHERE id = $1
	`, id)

	if err != nil {
		s.logger.Error("Failed to cancel order", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cancel order"})
		return
	}

	s.publishEvent(Event{
		Type:      "order.cancelled",
		Timestamp: time.Now(),
		EntityID:  id,
		Data:      map[string]interface{}{},
	})

	c.JSON(http.StatusOK, gin.H{"message": "Order cancelled"})
}

// Review handlers
func (s *Service) handleCreateReview(c *gin.Context) {
	var review Review
	if err := c.ShouldBindJSON(&review); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	review.ID = uuid.New().String()
	review.CreatedAt = time.Now()

	_, err := s.db.Exec(`
		INSERT INTO reviews (id, product_id, seller_id, buyer_id, rating, comment, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, review.ID, review.ProductID, review.SellerID, review.BuyerID, review.Rating, review.Comment, review.CreatedAt)

	if err != nil {
		s.logger.Error("Failed to create review", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create review"})
		return
	}

	s.publishEvent(Event{
		Type:      "review.created",
		Timestamp: time.Now(),
		EntityID:  review.ID,
		Data: map[string]interface{}{
			"rating": review.Rating,
		},
	})

	c.JSON(http.StatusCreated, review)
}

func (s *Service) handleGetProductReviews(c *gin.Context) {
	productID := c.Param("product_id")

	rows, err := s.db.Query(`
		SELECT id, product_id, seller_id, buyer_id, rating, comment, created_at
		FROM reviews
		WHERE product_id = $1
		ORDER BY created_at DESC
	`, productID)

	if err != nil {
		s.logger.Error("Failed to get product reviews", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get reviews"})
		return
	}
	defer rows.Close()

	reviews := []Review{}
	for rows.Next() {
		var review Review
		err := rows.Scan(&review.ID, &review.ProductID, &review.SellerID, &review.BuyerID,
			&review.Rating, &review.Comment, &review.CreatedAt)
		if err != nil {
			continue
		}
		reviews = append(reviews, review)
	}

	c.JSON(http.StatusOK, reviews)
}

func (s *Service) handleGetSellerReviews(c *gin.Context) {
	sellerID := c.Param("seller_id")

	rows, err := s.db.Query(`
		SELECT id, product_id, seller_id, buyer_id, rating, comment, created_at
		FROM reviews
		WHERE seller_id = $1
		ORDER BY created_at DESC
	`, sellerID)

	if err != nil {
		s.logger.Error("Failed to get seller reviews", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get reviews"})
		return
	}
	defer rows.Close()

	reviews := []Review{}
	for rows.Next() {
		var review Review
		err := rows.Scan(&review.ID, &review.ProductID, &review.SellerID, &review.BuyerID,
			&review.Rating, &review.Comment, &review.CreatedAt)
		if err != nil {
			continue
		}
		reviews = append(reviews, review)
	}

	c.JSON(http.StatusOK, reviews)
}

// publishEvent publishes an event to Kafka
func (s *Service) publishEvent(event Event) {
	data, err := json.Marshal(event)
	if err != nil {
		s.logger.Error("Failed to marshal event", zap.Error(err))
		return
	}

	err = s.kafka.WriteMessages(context.Background(), kafka.Message{
		Key:   []byte(event.EntityID),
		Value: data,
	})

	if err != nil {
		s.logger.Error("Failed to publish event", zap.Error(err))
	}
}

// initSchema initializes the database schema
func initSchema(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS products (
		id UUID PRIMARY KEY,
		seller_id UUID NOT NULL,
		name VARCHAR(255) NOT NULL,
		description TEXT,
		category VARCHAR(100) NOT NULL,
		quantity DOUBLE PRECISION NOT NULL,
		unit VARCHAR(50) NOT NULL,
		price_per_unit DOUBLE PRECISION NOT NULL,
		currency VARCHAR(10) NOT NULL DEFAULT 'USD',
		location VARCHAR(255),
		image_urls JSONB,
		status VARCHAR(50) NOT NULL DEFAULT 'available',
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS orders (
		id UUID PRIMARY KEY,
		product_id UUID NOT NULL REFERENCES products(id),
		buyer_id UUID NOT NULL,
		seller_id UUID NOT NULL,
		quantity DOUBLE PRECISION NOT NULL,
		total_price DOUBLE PRECISION NOT NULL,
		currency VARCHAR(10) NOT NULL DEFAULT 'USD',
		status VARCHAR(50) NOT NULL DEFAULT 'pending',
		payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
		delivery_address TEXT,
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS reviews (
		id UUID PRIMARY KEY,
		product_id UUID REFERENCES products(id),
		seller_id UUID,
		buyer_id UUID NOT NULL,
		rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
		comment TEXT,
		created_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
	CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
	CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
	CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
	CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);
	CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
	CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews(seller_id);
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
