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

	"github.com/Nerzal/gocloak/v13"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

// Config holds application configuration
type Config struct {
	Port            string
	DatabaseURL     string
	KeycloakURL     string
	KeycloakRealm   string
	KeycloakClient  string
	KeycloakSecret  string
	RedisURL        string
	KafkaBrokers    []string
	JWTSecret       string
}

// Service represents the auth service
type Service struct {
	config      *Config
	db          *sql.DB
	redis       *redis.Client
	kafka       *kafka.Writer
	keycloak    *gocloak.GoCloak
	logger      *zap.Logger
}

// User represents a user in the system
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// LoginRequest represents login credentials
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

// LoginResponse represents login response
type LoginResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	User         User   `json:"user"`
}

// RegisterRequest represents registration data
type RegisterRequest struct {
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=8"`
	Name      string `json:"name" binding:"required"`
	Role      string `json:"role"`
}

// Event represents a domain event
type Event struct {
	Type      string                 `json:"type"`
	Timestamp time.Time              `json:"timestamp"`
	UserID    string                 `json:"user_id,omitempty"`
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
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/farmer_db?sslmode=disable"),
		KeycloakURL:    getEnv("KEYCLOAK_URL", "http://localhost:8080"),
		KeycloakRealm:  getEnv("KEYCLOAK_REALM", "farmer-realm"),
		KeycloakClient: getEnv("KEYCLOAK_CLIENT", "farmer-client"),
		KeycloakSecret: getEnv("KEYCLOAK_SECRET", ""),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		KafkaBrokers:   []string{getEnv("KAFKA_BROKERS", "localhost:9092")},
		JWTSecret:      getEnv("JWT_SECRET", "your-secret-key"),
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
	logger.Info("Starting auth service", zap.String("port", config.Port))
	if err := router.Run(":" + config.Port); err != nil {
		logger.Fatal("Failed to start server", zap.Error(err))
	}
}

// NewService creates a new auth service instance
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
		Topic:    "auth.events",
		Balancer: &kafka.LeastBytes{},
	}

	// Initialize Keycloak client
	keycloakClient := gocloak.NewClient(config.KeycloakURL)

	return &Service{
		config:   config,
		db:       db,
		redis:    redisClient,
		kafka:    kafkaWriter,
		keycloak: keycloakClient,
		logger:   logger,
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
		// Public routes
		v1.POST("/auth/register", service.handleRegister)
		v1.POST("/auth/login", service.handleLogin)
		v1.POST("/auth/refresh", service.handleRefresh)
		
		// Protected routes
		protected := v1.Group("/")
		protected.Use(service.authMiddleware())
		{
			protected.GET("/auth/me", service.handleGetCurrentUser)
			protected.POST("/auth/logout", service.handleLogout)
			protected.GET("/users/:id", service.handleGetUser)
			protected.PUT("/users/:id", service.handleUpdateUser)
		}
	}

	return router
}

// handleRegister handles user registration
func (s *Service) handleRegister(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Set default role if not provided
	if req.Role == "" {
		req.Role = "farmer"
	}

	// Create user in database
	var userID string
	err := s.db.QueryRow(`
		INSERT INTO users (email, name, role, created_at, updated_at)
		VALUES ($1, $2, $3, NOW(), NOW())
		RETURNING id
	`, req.Email, req.Name, req.Role).Scan(&userID)

	if err != nil {
		s.logger.Error("Failed to create user", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	// Create user in Keycloak
	ctx := context.Background()
	token, err := s.keycloak.LoginAdmin(ctx, "admin", "admin", "master")
	if err != nil {
		s.logger.Warn("Failed to login to Keycloak", zap.Error(err))
	} else {
		user := gocloak.User{
			Email:         gocloak.StringP(req.Email),
			Username:      gocloak.StringP(req.Email),
			FirstName:     gocloak.StringP(req.Name),
			Enabled:       gocloak.BoolP(true),
			EmailVerified: gocloak.BoolP(true),
		}
		
		keycloakUserID, err := s.keycloak.CreateUser(ctx, token.AccessToken, s.config.KeycloakRealm, user)
		if err != nil {
			s.logger.Warn("Failed to create user in Keycloak", zap.Error(err))
		} else {
			// Set password
			err = s.keycloak.SetPassword(ctx, token.AccessToken, keycloakUserID, s.config.KeycloakRealm, req.Password, false)
			if err != nil {
				s.logger.Warn("Failed to set password in Keycloak", zap.Error(err))
			}
		}
	}

	// Publish event
	s.publishEvent(Event{
		Type:      "user.registered",
		Timestamp: time.Now(),
		UserID:    userID,
		Data: map[string]interface{}{
			"email": req.Email,
			"name":  req.Name,
			"role":  req.Role,
		},
	})

	// Generate JWT token
	token, expiresIn := s.generateToken(userID, req.Email, req.Role)

	user := User{
		ID:        userID,
		Email:     req.Email,
		Name:      req.Name,
		Role:      req.Role,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	c.JSON(http.StatusCreated, LoginResponse{
		AccessToken:  token,
		RefreshToken: token, // In production, generate separate refresh token
		ExpiresIn:    expiresIn,
		User:         user,
	})
}

// handleLogin handles user login
func (s *Service) handleLogin(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Try Keycloak authentication first
	ctx := context.Background()
	keycloakToken, err := s.keycloak.Login(ctx, s.config.KeycloakClient, s.config.KeycloakSecret, s.config.KeycloakRealm, req.Email, req.Password)
	
	var user User
	if err == nil {
		// Keycloak authentication successful
		// Get user from database
		err = s.db.QueryRow(`
			SELECT id, email, name, role, created_at, updated_at
			FROM users
			WHERE email = $1
		`, req.Email).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt)

		if err != nil {
			s.logger.Error("User authenticated in Keycloak but not found in database", zap.Error(err))
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		}

		// Publish event
		s.publishEvent(Event{
			Type:      "user.logged_in",
			Timestamp: time.Now(),
			UserID:    user.ID,
			Data: map[string]interface{}{
				"email": req.Email,
			},
		})

		c.JSON(http.StatusOK, LoginResponse{
			AccessToken:  *keycloakToken.AccessToken,
			RefreshToken: *keycloakToken.RefreshToken,
			ExpiresIn:    int(*keycloakToken.ExpiresIn),
			User:         user,
		})
		return
	}

	// Fallback to JWT authentication
	err = s.db.QueryRow(`
		SELECT id, email, name, role, created_at, updated_at
		FROM users
		WHERE email = $1
	`, req.Email).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// Generate JWT token
	token, expiresIn := s.generateToken(user.ID, user.Email, user.Role)

	// Publish event
	s.publishEvent(Event{
		Type:      "user.logged_in",
		Timestamp: time.Now(),
		UserID:    user.ID,
		Data: map[string]interface{}{
			"email": req.Email,
		},
	})

	c.JSON(http.StatusOK, LoginResponse{
		AccessToken:  token,
		RefreshToken: token,
		ExpiresIn:    expiresIn,
		User:         user,
	})
}

// handleRefresh handles token refresh
func (s *Service) handleRefresh(c *gin.Context) {
	refreshToken := c.GetHeader("Authorization")
	if refreshToken == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing refresh token"})
		return
	}

	// Parse and validate token
	claims, err := s.validateToken(refreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
		return
	}

	// Generate new token
	token, expiresIn := s.generateToken(claims["user_id"].(string), claims["email"].(string), claims["role"].(string))

	c.JSON(http.StatusOK, gin.H{
		"access_token":  token,
		"refresh_token": token,
		"expires_in":    expiresIn,
	})
}

// handleGetCurrentUser returns current user info
func (s *Service) handleGetCurrentUser(c *gin.Context) {
	userID := c.GetString("user_id")

	var user User
	err := s.db.QueryRow(`
		SELECT id, email, name, role, created_at, updated_at
		FROM users
		WHERE id = $1
	`, userID).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// handleLogout handles user logout
func (s *Service) handleLogout(c *gin.Context) {
	userID := c.GetString("user_id")

	// Publish event
	s.publishEvent(Event{
		Type:      "user.logged_out",
		Timestamp: time.Now(),
		UserID:    userID,
		Data:      map[string]interface{}{},
	})

	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// handleGetUser returns user by ID
func (s *Service) handleGetUser(c *gin.Context) {
	id := c.Param("id")

	var user User
	err := s.db.QueryRow(`
		SELECT id, email, name, role, created_at, updated_at
		FROM users
		WHERE id = $1
	`, id).Scan(&user.ID, &user.Email, &user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// handleUpdateUser updates user information
func (s *Service) handleUpdateUser(c *gin.Context) {
	id := c.Param("id")
	currentUserID := c.GetString("user_id")

	// Check permission
	if id != currentUserID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := s.db.Exec(`
		UPDATE users
		SET name = $1, updated_at = NOW()
		WHERE id = $2
	`, req.Name, id)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user"})
		return
	}

	// Publish event
	s.publishEvent(Event{
		Type:      "user.updated",
		Timestamp: time.Now(),
		UserID:    id,
		Data: map[string]interface{}{
			"name": req.Name,
		},
	})

	c.JSON(http.StatusOK, gin.H{"message": "User updated successfully"})
}

// authMiddleware validates JWT tokens
func (s *Service) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing authorization header"})
			c.Abort()
			return
		}

		// Remove "Bearer " prefix
		tokenString := authHeader
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			tokenString = authHeader[7:]
		}

		claims, err := s.validateToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		c.Set("user_id", claims["user_id"])
		c.Set("email", claims["email"])
		c.Set("role", claims["role"])
		c.Next()
	}
}

// generateToken generates a JWT token
func (s *Service) generateToken(userID, email, role string) (string, int) {
	expiresIn := 24 * 60 * 60 // 24 hours
	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"role":    role,
		"exp":     time.Now().Add(time.Duration(expiresIn) * time.Second).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, _ := token.SignedString([]byte(s.config.JWTSecret))

	return tokenString, expiresIn
}

// validateToken validates a JWT token
func (s *Service) validateToken(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(s.config.JWTSecret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

// publishEvent publishes an event to Kafka
func (s *Service) publishEvent(event Event) {
	data, err := json.Marshal(event)
	if err != nil {
		s.logger.Error("Failed to marshal event", zap.Error(err))
		return
	}

	err = s.kafka.WriteMessages(context.Background(), kafka.Message{
		Key:   []byte(event.UserID),
		Value: data,
	})

	if err != nil {
		s.logger.Error("Failed to publish event", zap.Error(err))
	}
}

// initSchema initializes the database schema
func initSchema(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		email VARCHAR(255) UNIQUE NOT NULL,
		name VARCHAR(255) NOT NULL,
		role VARCHAR(50) NOT NULL DEFAULT 'farmer',
		created_at TIMESTAMP NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMP NOT NULL DEFAULT NOW()
	);

	CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
	CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
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
