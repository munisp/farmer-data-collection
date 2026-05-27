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

	"github.com/go-redis/redis/v8"
	"github.com/gorilla/mux"
)

// ============================================================================
// Configuration
// ============================================================================

var (
	redisClient *redis.Client
	ctx         = context.Background()
)

const (
	DefaultTTL        = 5 * time.Minute
	DashboardTTL      = 1 * time.Minute
	StatisticsTTL     = 30 * time.Second
	UserSessionTTL    = 24 * time.Hour
	QueryCacheTTL     = 10 * time.Minute
)

// ============================================================================
// Types
// ============================================================================

type CacheRequest struct {
	Key   string      `json:"key"`
	Value interface{} `json:"value"`
	TTL   int         `json:"ttl"` // seconds
}

type CacheResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
}

type InvalidateRequest struct {
	Pattern string `json:"pattern"`
}

type StatsResponse struct {
	TotalKeys      int64             `json:"total_keys"`
	UsedMemory     string            `json:"used_memory"`
	HitRate        float64           `json:"hit_rate"`
	ConnectedClients int64           `json:"connected_clients"`
	Uptime         int64             `json:"uptime_seconds"`
}

// ============================================================================
// Redis Client Initialization
// ============================================================================

func initRedis() {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	redisClient = redis.NewClient(&redis.Options{
		Addr:         redisAddr,
		Password:     os.Getenv("REDIS_PASSWORD"),
		DB:           0,
		DialTimeout:  10 * time.Second,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		PoolSize:     10,
	})

	// Test connection
	_, err := redisClient.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}

	log.Println("✅ Connected to Redis successfully")
}

// ============================================================================
// HTTP Handlers
// ============================================================================

// Health check endpoint
func healthHandler(w http.ResponseWriter, r *http.Request) {
	_, err := redisClient.Ping(ctx).Result()
	
	response := CacheResponse{
		Success: err == nil,
		Message: "Cache service is healthy",
	}

	if err != nil {
		response.Message = fmt.Sprintf("Redis connection error: %v", err)
		w.WriteHeader(http.StatusServiceUnavailable)
	}

	json.NewEncoder(w).Encode(response)
}

// Get cached value
func getHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	key := vars["key"]

	if key == "" {
		http.Error(w, "Key is required", http.StatusBadRequest)
		return
	}

	val, err := redisClient.Get(ctx, key).Result()
	
	if err == redis.Nil {
		json.NewEncoder(w).Encode(CacheResponse{
			Success: false,
			Message: "Key not found",
		})
		return
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Try to parse as JSON
	var jsonData interface{}
	if err := json.Unmarshal([]byte(val), &jsonData); err == nil {
		json.NewEncoder(w).Encode(CacheResponse{
			Success: true,
			Data:    jsonData,
		})
	} else {
		json.NewEncoder(w).Encode(CacheResponse{
			Success: true,
			Data:    val,
		})
	}
}

// Set cache value
func setHandler(w http.ResponseWriter, r *http.Request) {
	var req CacheRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Key == "" {
		http.Error(w, "Key is required", http.StatusBadRequest)
		return
	}

	// Convert value to JSON string
	valueJSON, err := json.Marshal(req.Value)
	if err != nil {
		http.Error(w, "Failed to serialize value", http.StatusInternalServerError)
		return
	}

	// Determine TTL
	ttl := DefaultTTL
	if req.TTL > 0 {
		ttl = time.Duration(req.TTL) * time.Second
	}

	// Set in Redis
	err = redisClient.Set(ctx, req.Key, valueJSON, ttl).Err()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(CacheResponse{
		Success: true,
		Message: fmt.Sprintf("Key '%s' cached with TTL %v", req.Key, ttl),
	})
}

// Delete cache key
func deleteHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	key := vars["key"]

	if key == "" {
		http.Error(w, "Key is required", http.StatusBadRequest)
		return
	}

	err := redisClient.Del(ctx, key).Err()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(CacheResponse{
		Success: true,
		Message: fmt.Sprintf("Key '%s' deleted", key),
	})
}

// Invalidate cache by pattern
func invalidateHandler(w http.ResponseWriter, r *http.Request) {
	var req InvalidateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Pattern == "" {
		http.Error(w, "Pattern is required", http.StatusBadRequest)
		return
	}

	// Find keys matching pattern
	keys, err := redisClient.Keys(ctx, req.Pattern).Result()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Delete matching keys
	if len(keys) > 0 {
		err = redisClient.Del(ctx, keys...).Err()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	json.NewEncoder(w).Encode(CacheResponse{
		Success: true,
		Message: fmt.Sprintf("Invalidated %d keys matching pattern '%s'", len(keys), req.Pattern),
		Data:    map[string]interface{}{"count": len(keys), "keys": keys},
	})
}

// Get cache statistics
func statsHandler(w http.ResponseWriter, r *http.Request) {
	_, err := redisClient.Info(ctx, "stats", "memory", "server").Result()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	dbSize, _ := redisClient.DBSize(ctx).Result()

	// Parse info for key metrics
	stats := StatsResponse{
		TotalKeys: dbSize,
	}

	json.NewEncoder(w).Encode(CacheResponse{
		Success: true,
		Data:    stats,
	})
}

// Flush all cache
func flushHandler(w http.ResponseWriter, r *http.Request) {
	err := redisClient.FlushDB(ctx).Err()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(CacheResponse{
		Success: true,
		Message: "All cache cleared",
	})
}

// ============================================================================
// Middleware
// ============================================================================

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("[%s] %s %s", r.Method, r.RequestURI, r.RemoteAddr)
		next.ServeHTTP(w, r)
		log.Printf("[%s] %s completed in %v", r.Method, r.RequestURI, time.Since(start))
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		next.ServeHTTP(w, r)
	})
}

func jsonMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		next.ServeHTTP(w, r)
	})
}

// ============================================================================
// Main
// ============================================================================

func main() {
	log.Println("=" + string(make([]byte, 58)) + "=")
	log.Println("Farmer Data Collection - Cache Service (Go)")
	log.Println("=" + string(make([]byte, 58)) + "=")

	// Initialize Redis
	initRedis()

	// Create router
	r := mux.NewRouter()

	// Apply middleware
	r.Use(loggingMiddleware)
	r.Use(corsMiddleware)
	r.Use(jsonMiddleware)

	// Routes
	r.HandleFunc("/health", healthHandler).Methods("GET")
	r.HandleFunc("/cache/{key}", getHandler).Methods("GET")
	r.HandleFunc("/cache", setHandler).Methods("POST")
	r.HandleFunc("/cache/{key}", deleteHandler).Methods("DELETE")
	r.HandleFunc("/cache/invalidate", invalidateHandler).Methods("POST")
	r.HandleFunc("/cache/stats", statsHandler).Methods("GET")
	r.HandleFunc("/cache/flush", flushHandler).Methods("POST")

	// Server configuration
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("🚀 Cache service starting on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down cache service...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	redisClient.Close()
	log.Println("Cache service stopped")
}
