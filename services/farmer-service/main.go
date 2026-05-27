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

// Service represents the farmer service
type Service struct {
	config *Config
	db     *sql.DB
	redis  *redis.Client
	kafka  *kafka.Writer
	logger *zap.Logger
}

// Farmer represents a farmer in the system
type Farmer struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Name        string    `json:"name"`
	Phone       string    `json:"phone"`
	Email       string    `json:"email"`
	Location    string    `json:"location"`
	Coordinates *GeoPoint `json:"coordinates,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Farm represents a farm
type Farm struct {
	ID          string    `json:"id"`
	FarmerID    string    `json:"farmer_id"`
	Name        string    `json:"name"`
	Size        float64   `json:"size"` // in hectares
	Location    string    `json:"location"`
	Coordinates *GeoPoint `json:"coordinates,omitempty"`
	SoilType    string    `json:"soil_type"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Crop represents a crop
type Crop struct {
	ID           string    `json:"id"`
	FarmID       string    `json:"farm_id"`
	Name         string    `json:"name"`
	Variety      string    `json:"variety"`
	PlantingDate time.Time `json:"planting_date"`
	HarvestDate  *time.Time `json:"harvest_date,omitempty"`
	Area         float64   `json:"area"` // in hectares
	Status       string    `json:"status"` // planted, growing, harvested
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Livestock represents livestock
type Livestock struct {
	ID           string    `json:"id"`
	FarmID       string    `json:"farm_id"`
	Type         string    `json:"type"` // cattle, goat, chicken, etc.
	Breed        string    `json:"breed"`
	Count        int       `json:"count"`
	AcquiredDate time.Time `json:"acquired_date"`
	Status       string    `json:"status"` // healthy, sick, sold
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// GeoPoint represents geographical coordinates
type GeoPoint struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
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
		Port:         getEnv("PORT", "8081"),
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
	logger.Info("Starting farmer service", zap.String("port", config.Port))
	if err := router.Run(":" + config.Port); err != nil {
		logger.Fatal("Failed to start server", zap.Error(err))
	}
}

// NewService creates a new farmer service instance
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
		Topic:    "farmer.events",
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
		// Farmer routes
		v1.POST("/farmers", service.handleCreateFarmer)
		v1.GET("/farmers", service.handleListFarmers)
		v1.GET("/farmers/:id", service.handleGetFarmer)
		v1.PUT("/farmers/:id", service.handleUpdateFarmer)
		v1.DELETE("/farmers/:id", service.handleDeleteFarmer)

		// Farm routes
		v1.POST("/farms", service.handleCreateFarm)
		v1.GET("/farms", service.handleListFarms)
		v1.GET("/farms/:id", service.handleGetFarm)
		v1.PUT("/farms/:id", service.handleUpdateFarm)
		v1.DELETE("/farms/:id", service.handleDeleteFarm)

		// Crop routes
		v1.POST("/crops", service.handleCreateCrop)
		v1.GET("/crops", service.handleListCrops)
		v1.GET("/crops/:id", service.handleGetCrop)
		v1.PUT("/crops/:id", service.handleUpdateCrop)
		v1.DELETE("/crops/:id", service.handleDeleteCrop)

		// Livestock routes
		v1.POST("/livestock", service.handleCreateLivestock)
		v1.GET("/livestock", service.handleListLivestock)
		v1.GET("/livestock/:id", service.handleGetLivestock)
		v1.PUT("/livestock/:id", service.handleUpdateLivestock)
		v1.DELETE("/livestock/:id", service.handleDeleteLivestock)
	}

	return router
}

// Farmer handlers
func (s *Service) handleCreateFarmer(c *gin.Context) {
	var farmer Farmer
	if err := c.ShouldBindJSON(&farmer); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	farmer.ID = uuid.New().String()
	farmer.CreatedAt = time.Now()
	farmer.UpdatedAt = time.Now()

	var lat, lon *float64
	if farmer.Coordinates != nil {
		lat = &farmer.Coordinates.Latitude
		lon = &farmer.Coordinates.Longitude
	}

	_, err := s.db.Exec(`
		INSERT INTO farmers (id, user_id, name, phone, email, location, latitude, longitude, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, farmer.ID, farmer.UserID, farmer.Name, farmer.Phone, farmer.Email, farmer.Location, lat, lon, farmer.CreatedAt, farmer.UpdatedAt)

	if err != nil {
		s.logger.Error("Failed to create farmer", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create farmer"})
		return
	}

	s.publishEvent(Event{
		Type:      "farmer.created",
		Timestamp: time.Now(),
		EntityID:  farmer.ID,
		Data: map[string]interface{}{
			"name":     farmer.Name,
			"location": farmer.Location,
		},
	})

	c.JSON(http.StatusCreated, farmer)
}

func (s *Service) handleListFarmers(c *gin.Context) {
	userID := c.Query("user_id")
	
	query := `
		SELECT id, user_id, name, phone, email, location, latitude, longitude, created_at, updated_at
		FROM farmers
	`
	args := []interface{}{}
	
	if userID != "" {
		query += " WHERE user_id = $1"
		args = append(args, userID)
	}
	
	query += " ORDER BY created_at DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		s.logger.Error("Failed to list farmers", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list farmers"})
		return
	}
	defer rows.Close()

	farmers := []Farmer{}
	for rows.Next() {
		var farmer Farmer
		var lat, lon *float64
		
		err := rows.Scan(&farmer.ID, &farmer.UserID, &farmer.Name, &farmer.Phone, &farmer.Email, 
			&farmer.Location, &lat, &lon, &farmer.CreatedAt, &farmer.UpdatedAt)
		if err != nil {
			continue
		}

		if lat != nil && lon != nil {
			farmer.Coordinates = &GeoPoint{Latitude: *lat, Longitude: *lon}
		}

		farmers = append(farmers, farmer)
	}

	c.JSON(http.StatusOK, farmers)
}

func (s *Service) handleGetFarmer(c *gin.Context) {
	id := c.Param("id")

	var farmer Farmer
	var lat, lon *float64

	err := s.db.QueryRow(`
		SELECT id, user_id, name, phone, email, location, latitude, longitude, created_at, updated_at
		FROM farmers
		WHERE id = $1
	`, id).Scan(&farmer.ID, &farmer.UserID, &farmer.Name, &farmer.Phone, &farmer.Email,
		&farmer.Location, &lat, &lon, &farmer.CreatedAt, &farmer.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Farmer not found"})
		return
	}

	if lat != nil && lon != nil {
		farmer.Coordinates = &GeoPoint{Latitude: *lat, Longitude: *lon}
	}

	c.JSON(http.StatusOK, farmer)
}

func (s *Service) handleUpdateFarmer(c *gin.Context) {
	id := c.Param("id")

	var farmer Farmer
	if err := c.ShouldBindJSON(&farmer); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	farmer.UpdatedAt = time.Now()

	var lat, lon *float64
	if farmer.Coordinates != nil {
		lat = &farmer.Coordinates.Latitude
		lon = &farmer.Coordinates.Longitude
	}

	_, err := s.db.Exec(`
		UPDATE farmers
		SET name = $1, phone = $2, email = $3, location = $4, latitude = $5, longitude = $6, updated_at = $7
		WHERE id = $8
	`, farmer.Name, farmer.Phone, farmer.Email, farmer.Location, lat, lon, farmer.UpdatedAt, id)

	if err != nil {
		s.logger.Error("Failed to update farmer", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update farmer"})
		return
	}

	s.publishEvent(Event{
		Type:      "farmer.updated",
		Timestamp: time.Now(),
		EntityID:  id,
		Data: map[string]interface{}{
			"name": farmer.Name,
		},
	})

	c.JSON(http.StatusOK, farmer)
}

func (s *Service) handleDeleteFarmer(c *gin.Context) {
	id := c.Param("id")

	_, err := s.db.Exec("DELETE FROM farmers WHERE id = $1", id)
	if err != nil {
		s.logger.Error("Failed to delete farmer", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete farmer"})
		return
	}

	s.publishEvent(Event{
		Type:      "farmer.deleted",
		Timestamp: time.Now(),
		EntityID:  id,
		Data:      map[string]interface{}{},
	})

	c.JSON(http.StatusOK, gin.H{"message": "Farmer deleted successfully"})
}

// Farm handlers
func (s *Service) handleCreateFarm(c *gin.Context) {
	var farm Farm
	if err := c.ShouldBindJSON(&farm); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	farm.ID = uuid.New().String()
	farm.CreatedAt = time.Now()
	farm.UpdatedAt = time.Now()

	var lat, lon *float64
	if farm.Coordinates != nil {
		lat = &farm.Coordinates.Latitude
		lon = &farm.Coordinates.Longitude
	}

	_, err := s.db.Exec(`
		INSERT INTO farms (id, farmer_id, name, size, location, latitude, longitude, soil_type, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, farm.ID, farm.FarmerID, farm.Name, farm.Size, farm.Location, lat, lon, farm.SoilType, farm.CreatedAt, farm.UpdatedAt)

	if err != nil {
		s.logger.Error("Failed to create farm", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create farm"})
		return
	}

	s.publishEvent(Event{
		Type:      "farm.created",
		Timestamp: time.Now(),
		EntityID:  farm.ID,
		Data: map[string]interface{}{
			"name":      farm.Name,
			"farmer_id": farm.FarmerID,
			"size":      farm.Size,
		},
	})

	c.JSON(http.StatusCreated, farm)
}

func (s *Service) handleListFarms(c *gin.Context) {
	farmerID := c.Query("farmer_id")
	
	query := `
		SELECT id, farmer_id, name, size, location, latitude, longitude, soil_type, created_at, updated_at
		FROM farms
	`
	args := []interface{}{}
	
	if farmerID != "" {
		query += " WHERE farmer_id = $1"
		args = append(args, farmerID)
	}
	
	query += " ORDER BY created_at DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		s.logger.Error("Failed to list farms", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list farms"})
		return
	}
	defer rows.Close()

	farms := []Farm{}
	for rows.Next() {
		var farm Farm
		var lat, lon *float64
		
		err := rows.Scan(&farm.ID, &farm.FarmerID, &farm.Name, &farm.Size, &farm.Location,
			&lat, &lon, &farm.SoilType, &farm.CreatedAt, &farm.UpdatedAt)
		if err != nil {
			continue
		}

		if lat != nil && lon != nil {
			farm.Coordinates = &GeoPoint{Latitude: *lat, Longitude: *lon}
		}

		farms = append(farms, farm)
	}

	c.JSON(http.StatusOK, farms)
}

func (s *Service) handleGetFarm(c *gin.Context) {
	id := c.Param("id")

	var farm Farm
	var lat, lon *float64

	err := s.db.QueryRow(`
		SELECT id, farmer_id, name, size, location, latitude, longitude, soil_type, created_at, updated_at
		FROM farms
		WHERE id = $1
	`, id).Scan(&farm.ID, &farm.FarmerID, &farm.Name, &farm.Size, &farm.Location,
		&lat, &lon, &farm.SoilType, &farm.CreatedAt, &farm.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Farm not found"})
		return
	}

	if lat != nil && lon != nil {
		farm.Coordinates = &GeoPoint{Latitude: *lat, Longitude: *lon}
	}

	c.JSON(http.StatusOK, farm)
}

func (s *Service) handleUpdateFarm(c *gin.Context) {
	id := c.Param("id")

	var farm Farm
	if err := c.ShouldBindJSON(&farm); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	farm.UpdatedAt = time.Now()

	var lat, lon *float64
	if farm.Coordinates != nil {
		lat = &farm.Coordinates.Latitude
		lon = &farm.Coordinates.Longitude
	}

	_, err := s.db.Exec(`
		UPDATE farms
		SET name = $1, size = $2, location = $3, latitude = $4, longitude = $5, soil_type = $6, updated_at = $7
		WHERE id = $8
	`, farm.Name, farm.Size, farm.Location, lat, lon, farm.SoilType, farm.UpdatedAt, id)

	if err != nil {
		s.logger.Error("Failed to update farm", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update farm"})
		return
	}

	s.publishEvent(Event{
		Type:      "farm.updated",
		Timestamp: time.Now(),
		EntityID:  id,
		Data: map[string]interface{}{
			"name": farm.Name,
			"size": farm.Size,
		},
	})

	c.JSON(http.StatusOK, farm)
}

func (s *Service) handleDeleteFarm(c *gin.Context) {
	id := c.Param("id")

	_, err := s.db.Exec("DELETE FROM farms WHERE id = $1", id)
	if err != nil {
		s.logger.Error("Failed to delete farm", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete farm"})
		return
	}

	s.publishEvent(Event{
		Type:      "farm.deleted",
		Timestamp: time.Now(),
		EntityID:  id,
		Data:      map[string]interface{}{},
	})

	c.JSON(http.StatusOK, gin.H{"message": "Farm deleted successfully"})
}

// Crop handlers (similar pattern)
func (s *Service) handleCreateCrop(c *gin.Context) {
	var crop Crop
	if err := c.ShouldBindJSON(&crop); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	crop.ID = uuid.New().String()
	crop.CreatedAt = time.Now()
	crop.UpdatedAt = time.Now()

	_, err := s.db.Exec(`
		INSERT INTO crops (id, farm_id, name, variety, planting_date, harvest_date, area, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, crop.ID, crop.FarmID, crop.Name, crop.Variety, crop.PlantingDate, crop.HarvestDate, crop.Area, crop.Status, crop.CreatedAt, crop.UpdatedAt)

	if err != nil {
		s.logger.Error("Failed to create crop", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create crop"})
		return
	}

	s.publishEvent(Event{
		Type:      "crop.planted",
		Timestamp: time.Now(),
		EntityID:  crop.ID,
		Data: map[string]interface{}{
			"name":    crop.Name,
			"farm_id": crop.FarmID,
			"area":    crop.Area,
		},
	})

	c.JSON(http.StatusCreated, crop)
}

func (s *Service) handleListCrops(c *gin.Context) {
	farmID := c.Query("farm_id")
	
	query := `
		SELECT id, farm_id, name, variety, planting_date, harvest_date, area, status, created_at, updated_at
		FROM crops
	`
	args := []interface{}{}
	
	if farmID != "" {
		query += " WHERE farm_id = $1"
		args = append(args, farmID)
	}
	
	query += " ORDER BY planting_date DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		s.logger.Error("Failed to list crops", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list crops"})
		return
	}
	defer rows.Close()

	crops := []Crop{}
	for rows.Next() {
		var crop Crop
		err := rows.Scan(&crop.ID, &crop.FarmID, &crop.Name, &crop.Variety, &crop.PlantingDate,
			&crop.HarvestDate, &crop.Area, &crop.Status, &crop.CreatedAt, &crop.UpdatedAt)
		if err != nil {
			continue
		}
		crops = append(crops, crop)
	}

	c.JSON(http.StatusOK, crops)
}

func (s *Service) handleGetCrop(c *gin.Context) {
	id := c.Param("id")

	var crop Crop
	err := s.db.QueryRow(`
		SELECT id, farm_id, name, variety, planting_date, harvest_date, area, status, created_at, updated_at
		FROM crops
		WHERE id = $1
	`, id).Scan(&crop.ID, &crop.FarmID, &crop.Name, &crop.Variety, &crop.PlantingDate,
		&crop.HarvestDate, &crop.Area, &crop.Status, &crop.CreatedAt, &crop.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Crop not found"})
		return
	}

	c.JSON(http.StatusOK, crop)
}

func (s *Service) handleUpdateCrop(c *gin.Context) {
	id := c.Param("id")

	var crop Crop
	if err := c.ShouldBindJSON(&crop); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	crop.UpdatedAt = time.Now()

	_, err := s.db.Exec(`
		UPDATE crops
		SET name = $1, variety = $2, planting_date = $3, harvest_date = $4, area = $5, status = $6, updated_at = $7
		WHERE id = $8
	`, crop.Name, crop.Variety, crop.PlantingDate, crop.HarvestDate, crop.Area, crop.Status, crop.UpdatedAt, id)

	if err != nil {
		s.logger.Error("Failed to update crop", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update crop"})
		return
	}

	s.publishEvent(Event{
		Type:      "crop.updated",
		Timestamp: time.Now(),
		EntityID:  id,
		Data: map[string]interface{}{
			"status": crop.Status,
		},
	})

	c.JSON(http.StatusOK, crop)
}

func (s *Service) handleDeleteCrop(c *gin.Context) {
	id := c.Param("id")

	_, err := s.db.Exec("DELETE FROM crops WHERE id = $1", id)
	if err != nil {
		s.logger.Error("Failed to delete crop", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete crop"})
		return
	}

	s.publishEvent(Event{
		Type:      "crop.deleted",
		Timestamp: time.Now(),
		EntityID:  id,
		Data:      map[string]interface{}{},
	})

	c.JSON(http.StatusOK, gin.H{"message": "Crop deleted successfully"})
}

// Livestock handlers
func (s *Service) handleCreateLivestock(c *gin.Context) {
	var livestock Livestock
	if err := c.ShouldBindJSON(&livestock); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	livestock.ID = uuid.New().String()
	livestock.CreatedAt = time.Now()
	livestock.UpdatedAt = time.Now()

	_, err := s.db.Exec(`
		INSERT INTO livestock (id, farm_id, type, breed, count, acquired_date, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, livestock.ID, livestock.FarmID, livestock.Type, livestock.Breed, livestock.Count, livestock.AcquiredDate, livestock.Status, livestock.CreatedAt, livestock.UpdatedAt)

	if err != nil {
		s.logger.Error("Failed to create livestock", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create livestock"})
		return
	}

	s.publishEvent(Event{
		Type:      "livestock.acquired",
		Timestamp: time.Now(),
		EntityID:  livestock.ID,
		Data: map[string]interface{}{
			"type":    livestock.Type,
			"farm_id": livestock.FarmID,
			"count":   livestock.Count,
		},
	})

	c.JSON(http.StatusCreated, livestock)
}

func (s *Service) handleListLivestock(c *gin.Context) {
	farmID := c.Query("farm_id")
	
	query := `
		SELECT id, farm_id, type, breed, count, acquired_date, status, created_at, updated_at
		FROM livestock
	`
	args := []interface{}{}
	
	if farmID != "" {
		query += " WHERE farm_id = $1"
		args = append(args, farmID)
	}
	
	query += " ORDER BY acquired_date DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		s.logger.Error("Failed to list livestock", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list livestock"})
		return
	}
	defer rows.Close()

	livestockList := []Livestock{}
	for rows.Next() {
		var livestock Livestock
		err := rows.Scan(&livestock.ID, &livestock.FarmID, &livestock.Type, &livestock.Breed, &livestock.Count,
			&livestock.AcquiredDate, &livestock.Status, &livestock.CreatedAt, &livestock.UpdatedAt)
		if err != nil {
			continue
		}
		livestockList = append(livestockList, livestock)
	}

	c.JSON(http.StatusOK, livestockList)
}

func (s *Service) handleGetLivestock(c *gin.Context) {
	id := c.Param("id")

	var livestock Livestock
	err := s.db.QueryRow(`
		SELECT id, farm_id, type, breed, count, acquired_date, status, created_at, updated_at
		FROM livestock
		WHERE id = $1
	`, id).Scan(&livestock.ID, &livestock.FarmID, &livestock.Type, &livestock.Breed, &livestock.Count,
		&livestock.AcquiredDate, &livestock.Status, &livestock.CreatedAt, &livestock.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Livestock not found"})
		return
	}

	c.JSON(http.StatusOK, livestock)
}

func (s *Service) handleUpdateLivestock(c *gin.Context) {
	id := c.Param("id")

	var livestock Livestock
	if err := c.ShouldBindJSON(&livestock); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	livestock.UpdatedAt = time.Now()

	_, err := s.db.Exec(`
		UPDATE livestock
		SET type = $1, breed = $2, count = $3, acquired_date = $4, status = $5, updated_at = $6
		WHERE id = $7
	`, livestock.Type, livestock.Breed, livestock.Count, livestock.AcquiredDate, livestock.Status, livestock.UpdatedAt, id)

	if err != nil {
		s.logger.Error("Failed to update livestock", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update livestock"})
		return
	}

	s.publishEvent(Event{
		Type:      "livestock.updated",
		Timestamp: time.Now(),
		EntityID:  id,
		Data: map[string]interface{}{
			"status": livestock.Status,
			"count":  livestock.Count,
		},
	})

	c.JSON(http.StatusOK, livestock)
}

func (s *Service) handleDeleteLivestock(c *gin.Context) {
	id := c.Param("id")

	_, err := s.db.Exec("DELETE FROM livestock WHERE id = $1", id)
	if err != nil {
		s.logger.Error("Failed to delete livestock", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete livestock"})
		return
	}

	s.publishEvent(Event{
		Type:      "livestock.deleted",
		Timestamp: time.Now(),
		EntityID:  id,
		Data:      map[string]interface{}{},
	})

	c.JSON(http.StatusOK, gin.H{"message": "Livestock deleted successfully"})
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
	CREATE TABLE IF NOT EXISTS farmers (
		id UUID PRIMARY KEY,
		user_id UUID NOT NULL,
		name VARCHAR(255) NOT NULL,
		phone VARCHAR(50),
		email VARCHAR(255),
		location VARCHAR(255),
		latitude DOUBLE PRECISION,
		longitude DOUBLE PRECISION,
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS farms (
		id UUID PRIMARY KEY,
		farmer_id UUID NOT NULL REFERENCES farmers(id) ON DELETE CASCADE,
		name VARCHAR(255) NOT NULL,
		size DOUBLE PRECISION NOT NULL,
		location VARCHAR(255),
		latitude DOUBLE PRECISION,
		longitude DOUBLE PRECISION,
		soil_type VARCHAR(100),
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS crops (
		id UUID PRIMARY KEY,
		farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
		name VARCHAR(255) NOT NULL,
		variety VARCHAR(255),
		planting_date TIMESTAMP NOT NULL,
		harvest_date TIMESTAMP,
		area DOUBLE PRECISION NOT NULL,
		status VARCHAR(50) NOT NULL DEFAULT 'planted',
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	CREATE TABLE IF NOT EXISTS livestock (
		id UUID PRIMARY KEY,
		farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
		type VARCHAR(100) NOT NULL,
		breed VARCHAR(255),
		count INTEGER NOT NULL,
		acquired_date TIMESTAMP NOT NULL,
		status VARCHAR(50) NOT NULL DEFAULT 'healthy',
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_farmers_user_id ON farmers(user_id);
	CREATE INDEX IF NOT EXISTS idx_farms_farmer_id ON farms(farmer_id);
	CREATE INDEX IF NOT EXISTS idx_crops_farm_id ON crops(farm_id);
	CREATE INDEX IF NOT EXISTS idx_livestock_farm_id ON livestock(farm_id);
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
