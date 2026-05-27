package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// ============================================================================
// Configuration
// ============================================================================

type Config struct {
	Port           string
	DatabaseURL    string
	KafkaBrokers   string
	BatchSize      int
	FlushInterval  time.Duration
	MaxSpeedMS     float64 // Maximum realistic speed in m/s
	MinAccuracyM   float64 // Minimum acceptable accuracy in meters
	RateLimitPerMin int
}

func LoadConfig() *Config {
	return &Config{
		Port:           getEnv("PORT", "8085"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/farmer_db"),
		KafkaBrokers:   getEnv("KAFKA_BROKERS", "localhost:9092"),
		BatchSize:      getEnvInt("GPS_BATCH_SIZE", 100),
		FlushInterval:  time.Duration(getEnvInt("GPS_FLUSH_INTERVAL_MS", 5000)) * time.Millisecond,
		MaxSpeedMS:     getEnvFloat("GPS_MAX_SPEED_MS", 55.56),    // 200 km/h
		MinAccuracyM:   getEnvFloat("GPS_MIN_ACCURACY_M", 100.0),  // 100 meters
		RateLimitPerMin: getEnvInt("GPS_RATE_LIMIT_PER_MIN", 60),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}

func getEnvFloat(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return defaultValue
}

// ============================================================================
// Types
// ============================================================================

type GPSPoint struct {
	DeviceID  string    `json:"device_id"`
	UserID    int       `json:"user_id"`
	FarmID    *int      `json:"farm_id,omitempty"`
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Altitude  *float64  `json:"altitude,omitempty"`
	Accuracy  *float64  `json:"accuracy,omitempty"`
	Speed     *float64  `json:"speed,omitempty"`
	Heading   *float64  `json:"heading,omitempty"`
	Timestamp time.Time `json:"timestamp"`
	Activity  *string   `json:"activity,omitempty"`
	Metadata  *string   `json:"metadata,omitempty"`
}

type BatchIngestRequest struct {
	Points []GPSPoint `json:"points"`
}

type IngestResponse struct {
	Success       bool   `json:"success"`
	PointsIngested int   `json:"points_ingested"`
	PointsRejected int   `json:"points_rejected"`
	Message       string `json:"message,omitempty"`
}

type DeviceRateLimit struct {
	Count     int
	ResetTime time.Time
}

// ============================================================================
// Prometheus Metrics
// ============================================================================

var (
	gpsPointsIngested = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gps_points_ingested_total",
			Help: "Total GPS points ingested",
		},
		[]string{"status"},
	)
	gpsPointsRejected = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gps_points_rejected_total",
			Help: "Total GPS points rejected",
		},
		[]string{"reason"},
	)
	gpsBatchDuration = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "gps_batch_insert_duration_seconds",
			Help:    "Duration of batch insert operations",
			Buckets: prometheus.DefBuckets,
		},
	)
	gpsBufferSize = prometheus.NewGauge(
		prometheus.GaugeOpts{
			Name: "gps_buffer_size",
			Help: "Current size of GPS point buffer",
		},
	)
)

func init() {
	prometheus.MustRegister(gpsPointsIngested)
	prometheus.MustRegister(gpsPointsRejected)
	prometheus.MustRegister(gpsBatchDuration)
	prometheus.MustRegister(gpsBufferSize)
}

// ============================================================================
// GPS Streaming Service
// ============================================================================

type GPSStreamingService struct {
	config     *Config
	db         *sql.DB
	buffer     []GPSPoint
	bufferMu   sync.Mutex
	rateLimits map[string]*DeviceRateLimit
	rateMu     sync.RWMutex
	lastPoints map[string]GPSPoint // For quality filtering
	lastMu     sync.RWMutex
	ctx        context.Context
	cancel     context.CancelFunc
}

func NewGPSStreamingService(config *Config) (*GPSStreamingService, error) {
	db, err := sql.Open("postgres", config.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())

	svc := &GPSStreamingService{
		config:     config,
		db:         db,
		buffer:     make([]GPSPoint, 0, config.BatchSize),
		rateLimits: make(map[string]*DeviceRateLimit),
		lastPoints: make(map[string]GPSPoint),
		ctx:        ctx,
		cancel:     cancel,
	}

	// Start background flush goroutine
	go svc.backgroundFlush()

	log.Printf("[GPS] Service initialized with batch_size=%d, flush_interval=%v", config.BatchSize, config.FlushInterval)
	return svc, nil
}

func (s *GPSStreamingService) Close() {
	s.cancel()
	s.Flush() // Final flush
	s.db.Close()
}

// ============================================================================
// Quality Filtering
// ============================================================================

func (s *GPSStreamingService) validatePoint(point GPSPoint) (bool, string) {
	// Check accuracy threshold
	if point.Accuracy != nil && *point.Accuracy > s.config.MinAccuracyM {
		return false, "accuracy_too_low"
	}

	// Check for valid coordinates
	if point.Latitude < -90 || point.Latitude > 90 {
		return false, "invalid_latitude"
	}
	if point.Longitude < -180 || point.Longitude > 180 {
		return false, "invalid_longitude"
	}

	// Check for impossible speed jumps
	s.lastMu.RLock()
	lastPoint, exists := s.lastPoints[point.DeviceID]
	s.lastMu.RUnlock()

	if exists {
		timeDiff := point.Timestamp.Sub(lastPoint.Timestamp).Seconds()
		if timeDiff > 0 {
			distance := haversineDistance(lastPoint.Latitude, lastPoint.Longitude, point.Latitude, point.Longitude)
			speed := distance / timeDiff
			if speed > s.config.MaxSpeedMS {
				return false, "impossible_speed"
			}
		}
	}

	return true, ""
}

func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000 // Earth radius in meters
	
	lat1Rad := lat1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180
	deltaLat := (lat2 - lat1) * math.Pi / 180
	deltaLon := (lon2 - lon1) * math.Pi / 180

	a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*
			math.Sin(deltaLon/2)*math.Sin(deltaLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return R * c
}

// ============================================================================
// Rate Limiting
// ============================================================================

func (s *GPSStreamingService) checkRateLimit(deviceID string) bool {
	s.rateMu.Lock()
	defer s.rateMu.Unlock()

	now := time.Now()
	limit, exists := s.rateLimits[deviceID]

	if !exists || now.After(limit.ResetTime) {
		s.rateLimits[deviceID] = &DeviceRateLimit{
			Count:     1,
			ResetTime: now.Add(time.Minute),
		}
		return true
	}

	if limit.Count >= s.config.RateLimitPerMin {
		return false
	}

	limit.Count++
	return true
}

// ============================================================================
// Geofencing with PostGIS
// ============================================================================

func (s *GPSStreamingService) findFarmContainingPoint(ctx context.Context, userID int, lon, lat float64) (*int, error) {
	var farmID int
	err := s.db.QueryRowContext(ctx, `
		SELECT fb.farm_id
		FROM farm_boundaries fb
		WHERE fb.user_id = $1
		  AND ST_Contains(
			fb.boundary,
			ST_SetSRID(ST_MakePoint($2, $3), 4326)
		  )
		ORDER BY fb.area_hectares ASC
		LIMIT 1
	`, userID, lon, lat).Scan(&farmID)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &farmID, nil
}

// ============================================================================
// Buffer Management
// ============================================================================

func (s *GPSStreamingService) AddPoint(point GPSPoint) (bool, string) {
	// Rate limiting
	if !s.checkRateLimit(point.DeviceID) {
		gpsPointsRejected.WithLabelValues("rate_limited").Inc()
		return false, "rate_limited"
	}

	// Quality validation
	valid, reason := s.validatePoint(point)
	if !valid {
		gpsPointsRejected.WithLabelValues(reason).Inc()
		return false, reason
	}

	// Auto-detect farm using PostGIS geofencing
	if point.FarmID == nil {
		farmID, err := s.findFarmContainingPoint(s.ctx, point.UserID, point.Longitude, point.Latitude)
		if err != nil {
			log.Printf("[GPS] Geofencing error: %v", err)
		} else {
			point.FarmID = farmID
		}
	}

	// Update last known point for quality filtering
	s.lastMu.Lock()
	s.lastPoints[point.DeviceID] = point
	s.lastMu.Unlock()

	// Add to buffer
	s.bufferMu.Lock()
	s.buffer = append(s.buffer, point)
	bufferLen := len(s.buffer)
	s.bufferMu.Unlock()

	gpsBufferSize.Set(float64(bufferLen))

	// Flush if buffer is full
	if bufferLen >= s.config.BatchSize {
		go s.Flush()
	}

	gpsPointsIngested.WithLabelValues("buffered").Inc()
	return true, ""
}

func (s *GPSStreamingService) Flush() error {
	s.bufferMu.Lock()
	if len(s.buffer) == 0 {
		s.bufferMu.Unlock()
		return nil
	}

	points := s.buffer
	s.buffer = make([]GPSPoint, 0, s.config.BatchSize)
	s.bufferMu.Unlock()

	gpsBufferSize.Set(0)

	start := time.Now()
	err := s.batchInsert(points)
	duration := time.Since(start)
	gpsBatchDuration.Observe(duration.Seconds())

	if err != nil {
		log.Printf("[GPS] Batch insert failed: %v", err)
		// Re-add points to buffer on failure
		s.bufferMu.Lock()
		s.buffer = append(points, s.buffer...)
		s.bufferMu.Unlock()
		return err
	}

	log.Printf("[GPS] Flushed %d points in %v", len(points), duration)
	gpsPointsIngested.WithLabelValues("inserted").Add(float64(len(points)))
	return nil
}

func (s *GPSStreamingService) batchInsert(points []GPSPoint) error {
	if len(points) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(s.ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(s.ctx, `
		INSERT INTO gps_tracks (
			user_id, device_id, farm_id, latitude, longitude, altitude,
			accuracy, speed, heading, timestamp, activity, metadata, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, p := range points {
		// Get device_id as integer from gps_devices table
		var deviceIDInt int
		err := tx.QueryRowContext(s.ctx, `
			SELECT id FROM gps_devices WHERE device_id = $1 AND user_id = $2
		`, p.DeviceID, p.UserID).Scan(&deviceIDInt)
		
		if err == sql.ErrNoRows {
			// Auto-register device
			err = tx.QueryRowContext(s.ctx, `
				INSERT INTO gps_devices (user_id, device_id, name, status, created_at, updated_at)
				VALUES ($1, $2, $3, 'active', NOW(), NOW())
				RETURNING id
			`, p.UserID, p.DeviceID, "Auto-registered device").Scan(&deviceIDInt)
		}
		if err != nil {
			log.Printf("[GPS] Device lookup/registration failed: %v", err)
			continue
		}

		_, err = stmt.ExecContext(s.ctx,
			p.UserID, deviceIDInt, p.FarmID, p.Latitude, p.Longitude, p.Altitude,
			p.Accuracy, p.Speed, p.Heading, p.Timestamp, p.Activity, p.Metadata,
		)
		if err != nil {
			log.Printf("[GPS] Insert failed for point: %v", err)
		}
	}

	return tx.Commit()
}

func (s *GPSStreamingService) backgroundFlush() {
	ticker := time.NewTicker(s.config.FlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			if err := s.Flush(); err != nil {
				log.Printf("[GPS] Background flush error: %v", err)
			}
		}
	}
}

// ============================================================================
// HTTP Handlers
// ============================================================================

func (s *GPSStreamingService) HandleIngest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var point GPSPoint
	if err := json.NewDecoder(r.Body).Decode(&point); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	success, reason := s.AddPoint(point)
	
	w.Header().Set("Content-Type", "application/json")
	if !success {
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(IngestResponse{
			Success: false,
			Message: reason,
		})
		return
	}

	json.NewEncoder(w).Encode(IngestResponse{
		Success:        true,
		PointsIngested: 1,
	})
}

func (s *GPSStreamingService) HandleBatchIngest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BatchIngestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ingested := 0
	rejected := 0

	for _, point := range req.Points {
		success, _ := s.AddPoint(point)
		if success {
			ingested++
		} else {
			rejected++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(IngestResponse{
		Success:        ingested > 0,
		PointsIngested: ingested,
		PointsRejected: rejected,
	})
}

func (s *GPSStreamingService) HandleFlush(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	err := s.Flush()
	w.Header().Set("Content-Type", "application/json")
	
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Buffer flushed",
	})
}

func (s *GPSStreamingService) HandleHealth(w http.ResponseWriter, r *http.Request) {
	s.bufferMu.Lock()
	bufferSize := len(s.buffer)
	s.bufferMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "healthy",
		"service":     "gps-streaming",
		"version":     "1.0.0",
		"buffer_size": bufferSize,
	})
}

func (s *GPSStreamingService) HandleStats(w http.ResponseWriter, r *http.Request) {
	s.bufferMu.Lock()
	bufferSize := len(s.buffer)
	s.bufferMu.Unlock()

	s.rateMu.RLock()
	activeDevices := len(s.rateLimits)
	s.rateMu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"buffer_size":    bufferSize,
		"active_devices": activeDevices,
		"batch_size":     s.config.BatchSize,
		"flush_interval": s.config.FlushInterval.String(),
	})
}

// ============================================================================
// Main
// ============================================================================

func main() {
	config := LoadConfig()

	svc, err := NewGPSStreamingService(config)
	if err != nil {
		log.Fatalf("[GPS] Failed to initialize service: %v", err)
	}
	defer svc.Close()

	router := mux.NewRouter()

	// GPS endpoints
	router.HandleFunc("/api/v1/gps/ingest", svc.HandleIngest).Methods("POST")
	router.HandleFunc("/api/v1/gps/batch", svc.HandleBatchIngest).Methods("POST")
	router.HandleFunc("/api/v1/gps/flush", svc.HandleFlush).Methods("POST")
	router.HandleFunc("/api/v1/gps/stats", svc.HandleStats).Methods("GET")

	// Health and metrics
	router.HandleFunc("/health", svc.HandleHealth).Methods("GET")
	router.Handle("/metrics", promhttp.Handler())

	// Start server
	addr := ":" + config.Port
	log.Printf("[GPS] Starting GPS streaming service on %s", addr)
	log.Printf("[GPS] Ingest endpoint: POST http://localhost%s/api/v1/gps/ingest", addr)
	log.Printf("[GPS] Batch endpoint: POST http://localhost%s/api/v1/gps/batch", addr)

	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("[GPS] Server failed: %v", err)
	}
}
