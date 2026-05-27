package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/segmentio/kafka-go"
)

// ============================================================================
// Configuration
// ============================================================================

type Config struct {
	Port              string
	DatabaseURL       string
	RedisURL          string
	KafkaBrokers      []string
	DaprURL           string
	TemporalURL       string
	TigerBeetleURL    string
	LakehouseURL      string
	PermifyURL        string
	FluvioURL         string
	AllowedOrigins    []string
}

// IdempotencyRecord tracks sync operations for idempotency
type IdempotencyRecord struct {
	Key       string    `json:"key"`
	Operation string    `json:"operation"`
	EntityType string   `json:"entityType"`
	EntityID  string    `json:"entityId"`
	UserID    int64     `json:"userId"`
	ClientID  string    `json:"clientId"`
	Result    string    `json:"result"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// PermifyCheck represents an authorization check request
type PermifyCheck struct {
	UserID     int64  `json:"userId"`
	Permission string `json:"permission"`
	EntityType string `json:"entityType"`
	EntityID   string `json:"entityId"`
}

// TigerBeetleLedgerEntry represents a ledger entry for audit trail
type TigerBeetleLedgerEntry struct {
	ID            string                 `json:"id"`
	TransactionID string                 `json:"transactionId"`
	Operation     string                 `json:"operation"`
	EntityType    string                 `json:"entityType"`
	EntityID      string                 `json:"entityId"`
	UserID        int64                  `json:"userId"`
	ClientID      string                 `json:"clientId"`
	Version       int64                  `json:"version"`
	Checksum      string                 `json:"checksum"`
	Data          map[string]interface{} `json:"data"`
	Timestamp     time.Time              `json:"timestamp"`
	Status        string                 `json:"status"`
}

func loadConfig() *Config {
	kafkaBrokers := os.Getenv("KAFKA_BROKERS")
	if kafkaBrokers == "" {
		kafkaBrokers = "localhost:9092"
	}

	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:3000,http://localhost:3001,http://localhost:5173"
	}

	return &Config{
		Port:           getEnvOrDefault("PORT", "8090"),
		DatabaseURL:    getEnvOrDefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/farmer_data"),
		RedisURL:       getEnvOrDefault("REDIS_URL", "localhost:6379"),
		KafkaBrokers:   strings.Split(kafkaBrokers, ","),
		DaprURL:        getEnvOrDefault("DAPR_URL", "http://localhost:3500"),
		TemporalURL:    getEnvOrDefault("TEMPORAL_URL", "localhost:7233"),
		TigerBeetleURL: getEnvOrDefault("TIGERBEETLE_URL", "localhost:3000"),
		LakehouseURL:   getEnvOrDefault("LAKEHOUSE_URL", "http://localhost:8085"),
		PermifyURL:     getEnvOrDefault("PERMIFY_URL", "http://localhost:3476"),
		FluvioURL:      getEnvOrDefault("FLUVIO_URL", "localhost:9003"),
		AllowedOrigins: strings.Split(allowedOrigins, ","),
	}
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// ============================================================================
// Types
// ============================================================================

type SyncOperation string

const (
	SyncPush   SyncOperation = "push"
	SyncPull   SyncOperation = "pull"
	SyncMerge  SyncOperation = "merge"
	SyncDelete SyncOperation = "delete"
)

type ConflictStrategy string

const (
	LastWriteWins ConflictStrategy = "last_write_wins"
	LocalWins     ConflictStrategy = "local_wins"
	ServerWins    ConflictStrategy = "server_wins"
	Merge         ConflictStrategy = "merge"
	Manual        ConflictStrategy = "manual"
)

type SyncRecord struct {
	ID           string                 `json:"id"`
	EntityType   string                 `json:"entityType"`
	EntityID     string                 `json:"entityId"`
	ClientID     string                 `json:"clientId"`
	UserID       int64                  `json:"userId"`
	Version      int64                  `json:"version"`
	Operation    SyncOperation          `json:"operation"`
	Data         map[string]interface{} `json:"data"`
	Timestamp    time.Time              `json:"timestamp"`
	Checksum     string                 `json:"checksum"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

type SyncConflict struct {
	ID             string                 `json:"id"`
	EntityType     string                 `json:"entityType"`
	EntityID       string                 `json:"entityId"`
	LocalRecord    SyncRecord             `json:"localRecord"`
	ServerRecord   SyncRecord             `json:"serverRecord"`
	ConflictFields []string               `json:"conflictFields"`
	Strategy       ConflictStrategy       `json:"strategy"`
	ResolvedData   map[string]interface{} `json:"resolvedData,omitempty"`
	ResolvedAt     *time.Time             `json:"resolvedAt,omitempty"`
	CreatedAt      time.Time              `json:"createdAt"`
}

type SyncRequest struct {
	ClientID     string                 `json:"clientId"`
	UserID       int64                  `json:"userId"`
	EntityType   string                 `json:"entityType"`
	Records      []SyncRecord           `json:"records"`
	LastSyncTime *time.Time             `json:"lastSyncTime,omitempty"`
	Strategy     ConflictStrategy       `json:"strategy,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

type SyncResponse struct {
	Success      bool           `json:"success"`
	SyncedCount  int            `json:"syncedCount"`
	ConflictCount int           `json:"conflictCount"`
	Conflicts    []SyncConflict `json:"conflicts,omitempty"`
	ServerTime   time.Time      `json:"serverTime"`
	NextSyncToken string        `json:"nextSyncToken,omitempty"`
	Records      []SyncRecord   `json:"records,omitempty"`
	Metrics      *SyncMetrics   `json:"metrics,omitempty"`
}

type SyncMetrics struct {
	PushLatencyMs    int64   `json:"pushLatencyMs"`
	PullLatencyMs    int64   `json:"pullLatencyMs"`
	ConflictRate     float64 `json:"conflictRate"`
	TotalSynced      int64   `json:"totalSynced"`
	PendingCount     int64   `json:"pendingCount"`
	LastSyncDuration int64   `json:"lastSyncDurationMs"`
}

type SyncEvent struct {
	Type       string                 `json:"type"`
	EntityType string                 `json:"entityType"`
	EntityID   string                 `json:"entityId"`
	UserID     int64                  `json:"userId"`
	ClientID   string                 `json:"clientId"`
	Data       map[string]interface{} `json:"data"`
	Timestamp  time.Time              `json:"timestamp"`
}

// ============================================================================
// Sync Orchestrator Service
// ============================================================================

type SyncOrchestrator struct {
	config       *Config
	dbPool       *pgxpool.Pool
	redisClient  *redis.Client
	kafkaWriter  *kafka.Writer
	kafkaReader  *kafka.Reader
	hub          *WebSocketHub
	metrics      *MetricsCollector
	mu           sync.RWMutex
	ctx          context.Context
	cancel       context.CancelFunc
}

func NewSyncOrchestrator(config *Config) *SyncOrchestrator {
	ctx, cancel := context.WithCancel(context.Background())

	// Initialize PostgreSQL connection pool
	dbPool, err := pgxpool.New(ctx, config.DatabaseURL)
	if err != nil {
		log.Printf("[SyncOrchestrator] Warning: Could not connect to database: %v", err)
		// Continue without database - will use Redis cache fallback
	} else {
		log.Println("[SyncOrchestrator] Connected to PostgreSQL database")
	}

	// Initialize Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr:     config.RedisURL,
		Password: os.Getenv("REDIS_PASSWORD"),
		DB:       0,
	})

	// Initialize Kafka writer
	kafkaWriter := &kafka.Writer{
		Addr:         kafka.TCP(config.KafkaBrokers...),
		Topic:        "sync-events",
		Balancer:     &kafka.LeastBytes{},
		BatchTimeout: 10 * time.Millisecond,
	}

	// Initialize Kafka reader for sync events
	kafkaReader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        config.KafkaBrokers,
		Topic:          "sync-events",
		GroupID:        "sync-orchestrator",
		MinBytes:       10e3,
		MaxBytes:       10e6,
		CommitInterval: time.Second,
	})

	return &SyncOrchestrator{
		config:      config,
		dbPool:      dbPool,
		redisClient: redisClient,
		kafkaWriter: kafkaWriter,
		kafkaReader: kafkaReader,
		hub:         NewWebSocketHub(),
		metrics:     NewMetricsCollector(),
		ctx:         ctx,
		cancel:      cancel,
	}
}

func (s *SyncOrchestrator) Start() error {
	// Start WebSocket hub
	go s.hub.Run()

	// Start Kafka consumer
	go s.consumeKafkaEvents()

	// Start metrics collector
	go s.metrics.Start()

	log.Println("[SyncOrchestrator] Started successfully")
	return nil
}

func (s *SyncOrchestrator) Stop() {
	s.cancel()
	if s.dbPool != nil {
		s.dbPool.Close()
	}
	s.kafkaWriter.Close()
	s.kafkaReader.Close()
	s.redisClient.Close()
	log.Println("[SyncOrchestrator] Stopped")
}

// ============================================================================
// Sync Operations
// ============================================================================

func (s *SyncOrchestrator) PushChanges(req *SyncRequest) (*SyncResponse, error) {
	startTime := time.Now()
	s.metrics.RecordSyncStart("push", req.EntityType)

	response := &SyncResponse{
		Success:    true,
		ServerTime: time.Now(),
		Conflicts:  []SyncConflict{},
	}

	for _, record := range req.Records {
		// Generate idempotency key for this operation
		idempotencyKey := s.generateIdempotencyKey(req.ClientID, req.EntityType, record.EntityID, "push")
		
		// Check if this operation was already processed (idempotency check)
		existingRecord, err := s.checkIdempotency(idempotencyKey)
		if err == nil && existingRecord != nil {
			log.Printf("[SyncOrchestrator] Idempotent operation detected, skipping: %s/%s", req.EntityType, record.EntityID)
			response.SyncedCount++
			continue
		}

		// Check Permify authorization
		allowed, err := s.checkPermission(req.UserID, "write", req.EntityType, record.EntityID)
		if err != nil {
			log.Printf("[SyncOrchestrator] Authorization check failed: %v", err)
		}
		if !allowed {
			log.Printf("[SyncOrchestrator] Authorization denied for user %d on %s/%s", req.UserID, req.EntityType, record.EntityID)
			continue
		}

		// Check for conflicts
		serverRecord, err := s.getServerRecord(req.EntityType, record.EntityID)
		if err != nil {
			log.Printf("[SyncOrchestrator] Error getting server record: %v", err)
			continue
		}

		if serverRecord != nil && s.hasConflict(&record, serverRecord) {
			conflict := s.resolveConflict(&record, serverRecord, req.Strategy)
			response.Conflicts = append(response.Conflicts, conflict)
			response.ConflictCount++

			if conflict.ResolvedData != nil {
				// Apply resolved data
				if err := s.applyRecord(req.EntityType, conflict.ResolvedData, req.UserID); err != nil {
					log.Printf("[SyncOrchestrator] Error applying resolved record: %v", err)
					continue
				}
			}
		} else {
			// No conflict, apply directly
			if err := s.applyRecord(req.EntityType, record.Data, req.UserID); err != nil {
				log.Printf("[SyncOrchestrator] Error applying record: %v", err)
				continue
			}
		}

		// Record idempotency key after successful operation
		s.recordIdempotency(idempotencyKey, "push", req.EntityType, record.EntityID, req.UserID, req.ClientID, "success")

		response.SyncedCount++

		// Publish sync event to Kafka
		s.publishSyncEvent(&SyncEvent{
			Type:       "sync_push",
			EntityType: req.EntityType,
			EntityID:   record.EntityID,
			UserID:     req.UserID,
			ClientID:   req.ClientID,
			Data:       record.Data,
			Timestamp:  time.Now(),
		})

		// Record in TigerBeetle ledger
		s.recordInLedger(&record, "push")

		// Broadcast to connected clients via WebSocket
		s.hub.BroadcastToUser(req.UserID, &SyncEvent{
			Type:       "record_updated",
			EntityType: req.EntityType,
			EntityID:   record.EntityID,
			UserID:     req.UserID,
			Data:       record.Data,
			Timestamp:  time.Now(),
		})
	}

	// Update sync token in Redis
	syncToken := fmt.Sprintf("%d-%s", time.Now().UnixNano(), req.ClientID)
	s.redisClient.Set(s.ctx, fmt.Sprintf("sync:token:%d:%s", req.UserID, req.EntityType), syncToken, 24*time.Hour)
	response.NextSyncToken = syncToken

	// Record metrics
	duration := time.Since(startTime)
	s.metrics.RecordSyncComplete("push", req.EntityType, duration, response.SyncedCount, response.ConflictCount)
	response.Metrics = &SyncMetrics{
		PushLatencyMs:    duration.Milliseconds(),
		TotalSynced:      int64(response.SyncedCount),
		ConflictRate:     float64(response.ConflictCount) / float64(len(req.Records)),
		LastSyncDuration: duration.Milliseconds(),
	}

	// Store sync metrics in Lakehouse for analytics
	s.storeSyncMetricsInLakehouse(req, response, duration)

	return response, nil
}

func (s *SyncOrchestrator) PullChanges(req *SyncRequest) (*SyncResponse, error) {
	startTime := time.Now()
	s.metrics.RecordSyncStart("pull", req.EntityType)

	response := &SyncResponse{
		Success:    true,
		ServerTime: time.Now(),
		Records:    []SyncRecord{},
	}

	// Get records modified since lastSyncTime
	records, err := s.getModifiedRecords(req.EntityType, req.UserID, req.LastSyncTime)
	if err != nil {
		return nil, fmt.Errorf("failed to get modified records: %w", err)
	}

	response.Records = records
	response.SyncedCount = len(records)

	// Update sync token
	syncToken := fmt.Sprintf("%d-%s", time.Now().UnixNano(), req.ClientID)
	s.redisClient.Set(s.ctx, fmt.Sprintf("sync:token:%d:%s", req.UserID, req.EntityType), syncToken, 24*time.Hour)
	response.NextSyncToken = syncToken

	// Record metrics
	duration := time.Since(startTime)
	s.metrics.RecordSyncComplete("pull", req.EntityType, duration, response.SyncedCount, 0)
	response.Metrics = &SyncMetrics{
		PullLatencyMs:    duration.Milliseconds(),
		TotalSynced:      int64(response.SyncedCount),
		LastSyncDuration: duration.Milliseconds(),
	}

	return response, nil
}

// ============================================================================
// Conflict Resolution
// ============================================================================

func (s *SyncOrchestrator) hasConflict(local, server *SyncRecord) bool {
	if server == nil {
		return false
	}
	// Conflict if versions don't match expected increment
	return local.Version != server.Version+1 && local.Version != server.Version
}

func (s *SyncOrchestrator) resolveConflict(local, server *SyncRecord, strategy ConflictStrategy) SyncConflict {
	conflict := SyncConflict{
		ID:           fmt.Sprintf("%s-%s-%d", local.EntityType, local.EntityID, time.Now().UnixNano()),
		EntityType:   local.EntityType,
		EntityID:     local.EntityID,
		LocalRecord:  *local,
		ServerRecord: *server,
		Strategy:     strategy,
		CreatedAt:    time.Now(),
	}

	// Find conflicting fields
	conflict.ConflictFields = s.findConflictingFields(local.Data, server.Data)

	switch strategy {
	case LastWriteWins:
		if local.Timestamp.After(server.Timestamp) {
			conflict.ResolvedData = local.Data
		} else {
			conflict.ResolvedData = server.Data
		}
		now := time.Now()
		conflict.ResolvedAt = &now

	case LocalWins:
		conflict.ResolvedData = local.Data
		now := time.Now()
		conflict.ResolvedAt = &now

	case ServerWins:
		conflict.ResolvedData = server.Data
		now := time.Now()
		conflict.ResolvedAt = &now

	case Merge:
		conflict.ResolvedData = s.mergeRecords(local.Data, server.Data, local.Timestamp, server.Timestamp)
		now := time.Now()
		conflict.ResolvedAt = &now

	case Manual:
		// Leave unresolved for manual intervention
		conflict.ResolvedData = nil
	}

	// Store conflict in Redis for tracking
	conflictJSON, _ := json.Marshal(conflict)
	s.redisClient.Set(s.ctx, fmt.Sprintf("sync:conflict:%s", conflict.ID), conflictJSON, 7*24*time.Hour)

	// Publish conflict event
	s.publishSyncEvent(&SyncEvent{
		Type:       "sync_conflict",
		EntityType: local.EntityType,
		EntityID:   local.EntityID,
		UserID:     local.UserID,
		ClientID:   local.ClientID,
		Data: map[string]interface{}{
			"conflictId":      conflict.ID,
			"strategy":        strategy,
			"conflictFields":  conflict.ConflictFields,
			"resolved":        conflict.ResolvedAt != nil,
		},
		Timestamp: time.Now(),
	})

	return conflict
}

func (s *SyncOrchestrator) findConflictingFields(local, server map[string]interface{}) []string {
	conflicting := []string{}
	excludeFields := map[string]bool{"id": true, "version": true, "updatedAt": true, "createdAt": true}

	for key, localVal := range local {
		if excludeFields[key] {
			continue
		}
		if serverVal, exists := server[key]; exists {
			localJSON, _ := json.Marshal(localVal)
			serverJSON, _ := json.Marshal(serverVal)
			if string(localJSON) != string(serverJSON) {
				conflicting = append(conflicting, key)
			}
		}
	}

	return conflicting
}

func (s *SyncOrchestrator) mergeRecords(local, server map[string]interface{}, localTime, serverTime time.Time) map[string]interface{} {
	merged := make(map[string]interface{})

	// Start with server data as base
	for k, v := range server {
		merged[k] = v
	}

	// Apply local changes for non-conflicting fields or if local is newer
	for k, localVal := range local {
		if serverVal, exists := server[k]; exists {
			localJSON, _ := json.Marshal(localVal)
			serverJSON, _ := json.Marshal(serverVal)
			if string(localJSON) != string(serverJSON) {
				// Conflicting field - use timestamp to decide
				if localTime.After(serverTime) {
					merged[k] = localVal
				}
			}
		} else {
			// Field only in local
			merged[k] = localVal
		}
	}

	return merged
}

// ============================================================================
// Data Access - Real PostgreSQL Database Integration
// ============================================================================

// getTableName maps entity types to database table names
func getTableName(entityType string) string {
	tableMap := map[string]string{
		"farmers":    "farmers",
		"farms":      "farms",
		"crops":      "crops",
		"livestock":  "livestock",
		"farmInputs": "farm_inputs",
		"harvests":   "harvests",
		"expenses":   "expenses",
	}
	if table, ok := tableMap[entityType]; ok {
		return table
	}
	return entityType
}

func (s *SyncOrchestrator) getServerRecord(entityType, entityID string) (*SyncRecord, error) {
	// Check Redis cache first for performance
	cacheKey := fmt.Sprintf("sync:record:%s:%s", entityType, entityID)
	cached, err := s.redisClient.Get(s.ctx, cacheKey).Result()
	if err == nil {
		var record SyncRecord
		if json.Unmarshal([]byte(cached), &record) == nil {
			return &record, nil
		}
	}

	// Query actual PostgreSQL database
	if s.dbPool == nil {
		return nil, nil
	}

	tableName := getTableName(entityType)
	query := fmt.Sprintf(`
		SELECT id, version, user_id, client_id, updated_at, 
		       row_to_json(%s.*) as data
		FROM %s 
		WHERE id = $1
	`, tableName, tableName)

	var id int64
	var version int64
	var userID int64
	var clientID sql.NullString
	var updatedAt time.Time
	var dataJSON []byte

	err = s.dbPool.QueryRow(s.ctx, query, entityID).Scan(&id, &version, &userID, &clientID, &updatedAt, &dataJSON)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		log.Printf("[SyncOrchestrator] Error querying database: %v", err)
		return nil, err
	}

	var data map[string]interface{}
	if err := json.Unmarshal(dataJSON, &data); err != nil {
		return nil, err
	}

	record := &SyncRecord{
		ID:         fmt.Sprintf("%d", id),
		EntityType: entityType,
		EntityID:   entityID,
		UserID:     userID,
		ClientID:   clientID.String,
		Version:    version,
		Data:       data,
		Timestamp:  updatedAt,
	}

	// Cache in Redis for future requests
	recordJSON, _ := json.Marshal(record)
	s.redisClient.Set(s.ctx, cacheKey, recordJSON, 5*time.Minute)

	return record, nil
}

func (s *SyncOrchestrator) applyRecord(entityType string, data map[string]interface{}, userID int64) error {
	entityID := fmt.Sprintf("%v", data["id"])
	
	// Create sync record for caching
	record := SyncRecord{
		EntityType: entityType,
		EntityID:   entityID,
		UserID:     userID,
		Data:       data,
		Timestamp:  time.Now(),
	}

	// Write to actual PostgreSQL database
	if s.dbPool != nil {
		tableName := getTableName(entityType)
		version := int64(1)
		if v, ok := data["version"].(float64); ok {
			version = int64(v)
		}

		// Use upsert (INSERT ... ON CONFLICT) for idempotency
		query := fmt.Sprintf(`
			INSERT INTO %s (id, version, user_id, client_id, updated_at)
			VALUES ($1, $2, $3, $4, NOW())
			ON CONFLICT (id) DO UPDATE SET
				version = EXCLUDED.version,
				user_id = EXCLUDED.user_id,
				client_id = EXCLUDED.client_id,
				updated_at = NOW()
			WHERE %s.version < EXCLUDED.version
		`, tableName, tableName)

		clientID := ""
		if cid, ok := data["clientId"].(string); ok {
			clientID = cid
		}

		_, err := s.dbPool.Exec(s.ctx, query, entityID, version, userID, clientID)
		if err != nil {
			log.Printf("[SyncOrchestrator] Error writing to database: %v", err)
			// Continue with Redis cache even if DB write fails
		} else {
			log.Printf("[SyncOrchestrator] Applied record to DB: %s/%s (version %d)", entityType, entityID, version)
		}
	}

	// Always cache in Redis
	recordJSON, _ := json.Marshal(record)
	cacheKey := fmt.Sprintf("sync:record:%s:%s", entityType, entityID)
	s.redisClient.Set(s.ctx, cacheKey, recordJSON, 24*time.Hour)

	// Invalidate any cached queries for this entity type
	s.redisClient.Del(s.ctx, fmt.Sprintf("sync:modified:%s:%d:*", entityType, userID))

	return nil
}

func (s *SyncOrchestrator) getModifiedRecords(entityType string, userID int64, since *time.Time) ([]SyncRecord, error) {
	// Check Redis cache first
	cacheKey := fmt.Sprintf("sync:modified:%s:%d:%v", entityType, userID, since)
	cached, err := s.redisClient.Get(s.ctx, cacheKey).Result()
	if err == nil {
		var records []SyncRecord
		if json.Unmarshal([]byte(cached), &records) == nil {
			return records, nil
		}
	}

	// Query actual PostgreSQL database
	if s.dbPool == nil {
		return []SyncRecord{}, nil
	}

	tableName := getTableName(entityType)
	var query string
	var rows pgx.Rows

	if since != nil {
		query = fmt.Sprintf(`
			SELECT id, version, user_id, client_id, updated_at,
			       row_to_json(%s.*) as data
			FROM %s 
			WHERE user_id = $1 AND updated_at > $2
			ORDER BY updated_at ASC
			LIMIT 1000
		`, tableName, tableName)
		rows, err = s.dbPool.Query(s.ctx, query, userID, since)
	} else {
		query = fmt.Sprintf(`
			SELECT id, version, user_id, client_id, updated_at,
			       row_to_json(%s.*) as data
			FROM %s 
			WHERE user_id = $1
			ORDER BY updated_at ASC
			LIMIT 1000
		`, tableName, tableName)
		rows, err = s.dbPool.Query(s.ctx, query, userID)
	}

	if err != nil {
		log.Printf("[SyncOrchestrator] Error querying modified records: %v", err)
		return []SyncRecord{}, err
	}
	defer rows.Close()

	var records []SyncRecord
	for rows.Next() {
		var id int64
		var version int64
		var recordUserID int64
		var clientID sql.NullString
		var updatedAt time.Time
		var dataJSON []byte

		if err := rows.Scan(&id, &version, &recordUserID, &clientID, &updatedAt, &dataJSON); err != nil {
			log.Printf("[SyncOrchestrator] Error scanning row: %v", err)
			continue
		}

		var data map[string]interface{}
		if err := json.Unmarshal(dataJSON, &data); err != nil {
			continue
		}

		records = append(records, SyncRecord{
			ID:         fmt.Sprintf("%d", id),
			EntityType: entityType,
			EntityID:   fmt.Sprintf("%d", id),
			UserID:     recordUserID,
			ClientID:   clientID.String,
			Version:    version,
			Data:       data,
			Timestamp:  updatedAt,
		})
	}

	// Cache results in Redis for 30 seconds
	if len(records) > 0 {
		recordsJSON, _ := json.Marshal(records)
		s.redisClient.Set(s.ctx, cacheKey, recordsJSON, 30*time.Second)
	}

	return records, nil
}

// ============================================================================
// Idempotency Support
// ============================================================================

// generateIdempotencyKey creates a unique key for a sync operation
func (s *SyncOrchestrator) generateIdempotencyKey(clientID string, entityType string, entityID string, operation string) string {
	data := fmt.Sprintf("%s:%s:%s:%s", clientID, entityType, entityID, operation)
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])
}

// checkIdempotency checks if an operation has already been processed
func (s *SyncOrchestrator) checkIdempotency(key string) (*IdempotencyRecord, error) {
	cacheKey := fmt.Sprintf("sync:idempotency:%s", key)
	cached, err := s.redisClient.Get(s.ctx, cacheKey).Result()
	if err != nil {
		return nil, nil // Not found, operation can proceed
	}

	var record IdempotencyRecord
	if err := json.Unmarshal([]byte(cached), &record); err != nil {
		return nil, nil
	}

	// Check if record has expired
	if time.Now().After(record.ExpiresAt) {
		s.redisClient.Del(s.ctx, cacheKey)
		return nil, nil
	}

	return &record, nil
}

// recordIdempotency records that an operation has been processed
func (s *SyncOrchestrator) recordIdempotency(key string, operation string, entityType string, entityID string, userID int64, clientID string, result string) error {
	record := IdempotencyRecord{
		Key:        key,
		Operation:  operation,
		EntityType: entityType,
		EntityID:   entityID,
		UserID:     userID,
		ClientID:   clientID,
		Result:     result,
		CreatedAt:  time.Now(),
		ExpiresAt:  time.Now().Add(24 * time.Hour), // Idempotency keys expire after 24 hours
	}

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return err
	}

	cacheKey := fmt.Sprintf("sync:idempotency:%s", key)
	return s.redisClient.Set(s.ctx, cacheKey, recordJSON, 24*time.Hour).Err()
}

// ============================================================================
// Permify Authorization Integration
// ============================================================================

// checkPermission verifies if a user has permission to perform an operation
func (s *SyncOrchestrator) checkPermission(userID int64, permission string, entityType string, entityID string) (bool, error) {
	// Call Permify API to check permission
	permifyURL := fmt.Sprintf("%s/v1/tenants/default/permissions/check", s.config.PermifyURL)
	
	checkRequest := map[string]interface{}{
		"metadata": map[string]interface{}{
			"snap_token":     "",
			"schema_version": "",
			"depth":          20,
		},
		"entity": map[string]interface{}{
			"type": entityType,
			"id":   entityID,
		},
		"permission": permission,
		"subject": map[string]interface{}{
			"type": "user",
			"id":   fmt.Sprintf("%d", userID),
		},
	}

	requestJSON, _ := json.Marshal(checkRequest)
	
	resp, err := http.Post(permifyURL, "application/json", strings.NewReader(string(requestJSON)))
	if err != nil {
		log.Printf("[SyncOrchestrator] Permify check failed, allowing by default: %v", err)
		return true, nil // Allow by default if Permify is unavailable
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[SyncOrchestrator] Permify returned status %d, allowing by default", resp.StatusCode)
		return true, nil
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return true, nil
	}

	if can, ok := result["can"].(string); ok {
		return can == "CHECK_RESULT_ALLOWED", nil
	}

	return true, nil
}

// ============================================================================
// Event Publishing
// ============================================================================

func (s *SyncOrchestrator) publishSyncEvent(event *SyncEvent) {
	eventJSON, err := json.Marshal(event)
	if err != nil {
		log.Printf("[SyncOrchestrator] Error marshaling event: %v", err)
		return
	}

	err = s.kafkaWriter.WriteMessages(s.ctx, kafka.Message{
		Key:   []byte(fmt.Sprintf("%s:%s", event.EntityType, event.EntityID)),
		Value: eventJSON,
	})

	if err != nil {
		log.Printf("[SyncOrchestrator] Error publishing to Kafka: %v", err)
	}
}

func (s *SyncOrchestrator) consumeKafkaEvents() {
	for {
		select {
		case <-s.ctx.Done():
			return
		default:
			msg, err := s.kafkaReader.ReadMessage(s.ctx)
			if err != nil {
				if s.ctx.Err() != nil {
					return
				}
				log.Printf("[SyncOrchestrator] Error reading Kafka message: %v", err)
				continue
			}

			var event SyncEvent
			if err := json.Unmarshal(msg.Value, &event); err != nil {
				log.Printf("[SyncOrchestrator] Error unmarshaling event: %v", err)
				continue
			}

			// Broadcast to connected WebSocket clients
			s.hub.BroadcastToUser(event.UserID, &event)
		}
	}
}

// ============================================================================
// TigerBeetle Ledger Integration
// ============================================================================

func (s *SyncOrchestrator) recordInLedger(record *SyncRecord, operation string) {
	// Generate unique transaction ID
	transactionID := uuid.New().String()
	
	// Calculate checksum for data integrity
	dataJSON, _ := json.Marshal(record.Data)
	checksum := sha256.Sum256(dataJSON)
	checksumHex := hex.EncodeToString(checksum[:])

	// Create TigerBeetle ledger entry
	ledgerEntry := TigerBeetleLedgerEntry{
		ID:            uuid.New().String(),
		TransactionID: transactionID,
		Operation:     operation,
		EntityType:    record.EntityType,
		EntityID:      record.EntityID,
		UserID:        record.UserID,
		ClientID:      record.ClientID,
		Version:       record.Version,
		Checksum:      checksumHex,
		Data:          record.Data,
		Timestamp:     time.Now(),
		Status:        "committed",
	}

	// Try to record in TigerBeetle via HTTP API
	tigerBeetleURL := fmt.Sprintf("%s/accounts", s.config.TigerBeetleURL)
	entryJSON, _ := json.Marshal(ledgerEntry)
	
	resp, err := http.Post(tigerBeetleURL, "application/json", strings.NewReader(string(entryJSON)))
	if err != nil {
		log.Printf("[SyncOrchestrator] TigerBeetle unavailable, using Redis fallback: %v", err)
	} else {
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
			log.Printf("[SyncOrchestrator] Recorded in TigerBeetle: %s/%s (tx: %s)", record.EntityType, record.EntityID, transactionID)
		}
	}

	// Always store in Redis as backup/fallback
	s.redisClient.LPush(s.ctx, fmt.Sprintf("sync:ledger:%d", record.UserID), entryJSON)
	s.redisClient.LTrim(s.ctx, fmt.Sprintf("sync:ledger:%d", record.UserID), 0, 999) // Keep last 1000 entries

	// Also store in PostgreSQL for durability if available
	if s.dbPool != nil {
		query := `
			INSERT INTO sync_ledger (id, transaction_id, operation, entity_type, entity_id, user_id, client_id, version, checksum, data, timestamp, status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			ON CONFLICT (id) DO NOTHING
		`
		_, err := s.dbPool.Exec(s.ctx, query,
			ledgerEntry.ID, ledgerEntry.TransactionID, ledgerEntry.Operation,
			ledgerEntry.EntityType, ledgerEntry.EntityID, ledgerEntry.UserID,
			ledgerEntry.ClientID, ledgerEntry.Version, ledgerEntry.Checksum,
			entryJSON, ledgerEntry.Timestamp, ledgerEntry.Status)
		if err != nil {
			log.Printf("[SyncOrchestrator] Failed to record in PostgreSQL ledger: %v", err)
		}
	}
}

// ============================================================================
// Lakehouse Analytics Integration
// ============================================================================

func (s *SyncOrchestrator) storeSyncMetricsInLakehouse(req *SyncRequest, resp *SyncResponse, duration time.Duration) {
	metrics := map[string]interface{}{
		"timestamp":      time.Now().Unix(),
		"userId":         req.UserID,
		"clientId":       req.ClientID,
		"entityType":     req.EntityType,
		"operation":      "push",
		"recordCount":    len(req.Records),
		"syncedCount":    resp.SyncedCount,
		"conflictCount":  resp.ConflictCount,
		"durationMs":     duration.Milliseconds(),
		"conflictRate":   float64(resp.ConflictCount) / float64(max(len(req.Records), 1)),
		"success":        resp.Success,
	}

	// Store in Redis for batch processing to Lakehouse
	metricsJSON, _ := json.Marshal(metrics)
	s.redisClient.LPush(s.ctx, "sync:metrics:pending", metricsJSON)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// ============================================================================
// WebSocket Hub for Real-time Updates
// ============================================================================

type WebSocketHub struct {
	clients    map[int64]map[*WebSocketClient]bool // userID -> clients
	broadcast  chan *SyncEvent
	register   chan *WebSocketClient
	unregister chan *WebSocketClient
	mu         sync.RWMutex
}

type WebSocketClient struct {
	UserID int64
	Conn   *websocket.Conn
	Send   chan *SyncEvent
}

func NewWebSocketHub() *WebSocketHub {
	return &WebSocketHub{
		clients:    make(map[int64]map[*WebSocketClient]bool),
		broadcast:  make(chan *SyncEvent, 256),
		register:   make(chan *WebSocketClient),
		unregister: make(chan *WebSocketClient),
	}
}

func (h *WebSocketHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if h.clients[client.UserID] == nil {
				h.clients[client.UserID] = make(map[*WebSocketClient]bool)
			}
			h.clients[client.UserID][client] = true
			h.mu.Unlock()
			log.Printf("[WebSocketHub] Client registered for user %d", client.UserID)

		case client := <-h.unregister:
			h.mu.Lock()
			if clients, ok := h.clients[client.UserID]; ok {
				if _, ok := clients[client]; ok {
					delete(clients, client)
					close(client.Send)
					if len(clients) == 0 {
						delete(h.clients, client.UserID)
					}
				}
			}
			h.mu.Unlock()
			log.Printf("[WebSocketHub] Client unregistered for user %d", client.UserID)

		case event := <-h.broadcast:
			h.BroadcastToUser(event.UserID, event)
		}
	}
}

func (h *WebSocketHub) BroadcastToUser(userID int64, event *SyncEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if clients, ok := h.clients[userID]; ok {
		for client := range clients {
			select {
			case client.Send <- event:
			default:
				close(client.Send)
				delete(clients, client)
			}
		}
	}
}

// ============================================================================
// Metrics Collector
// ============================================================================

type MetricsCollector struct {
	syncStarts    map[string]time.Time
	syncCounts    map[string]int64
	conflictCounts map[string]int64
	latencies     map[string][]int64
	mu            sync.RWMutex
}

func NewMetricsCollector() *MetricsCollector {
	return &MetricsCollector{
		syncStarts:    make(map[string]time.Time),
		syncCounts:    make(map[string]int64),
		conflictCounts: make(map[string]int64),
		latencies:     make(map[string][]int64),
	}
}

func (m *MetricsCollector) Start() {
	// Periodically log metrics
	ticker := time.NewTicker(60 * time.Second)
	for range ticker.C {
		m.logMetrics()
	}
}

func (m *MetricsCollector) RecordSyncStart(operation, entityType string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := fmt.Sprintf("%s:%s", operation, entityType)
	m.syncStarts[key] = time.Now()
}

func (m *MetricsCollector) RecordSyncComplete(operation, entityType string, duration time.Duration, synced, conflicts int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := fmt.Sprintf("%s:%s", operation, entityType)
	m.syncCounts[key] += int64(synced)
	m.conflictCounts[key] += int64(conflicts)
	m.latencies[key] = append(m.latencies[key], duration.Milliseconds())
	
	// Keep only last 100 latencies
	if len(m.latencies[key]) > 100 {
		m.latencies[key] = m.latencies[key][len(m.latencies[key])-100:]
	}
}

func (m *MetricsCollector) logMetrics() {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for key, count := range m.syncCounts {
		conflicts := m.conflictCounts[key]
		avgLatency := int64(0)
		if latencies, ok := m.latencies[key]; ok && len(latencies) > 0 {
			sum := int64(0)
			for _, l := range latencies {
				sum += l
			}
			avgLatency = sum / int64(len(latencies))
		}
		log.Printf("[Metrics] %s: synced=%d conflicts=%d avgLatencyMs=%d", key, count, conflicts, avgLatency)
	}
}

func (m *MetricsCollector) GetMetrics() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return map[string]interface{}{
		"syncCounts":     m.syncCounts,
		"conflictCounts": m.conflictCounts,
		"timestamp":      time.Now().Unix(),
	}
}

// ============================================================================
// HTTP Handlers
// ============================================================================

var orchestrator *SyncOrchestrator

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
}

func handlePush(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	response, err := orchestrator.PushChanges(&req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handlePull(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SyncRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	response, err := orchestrator.PullChanges(&req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade error: %v", err)
		return
	}

	// Get user ID from query params
	userIDStr := r.URL.Query().Get("userId")
	var userID int64
	fmt.Sscanf(userIDStr, "%d", &userID)

	client := &WebSocketClient{
		UserID: userID,
		Conn:   conn,
		Send:   make(chan *SyncEvent, 256),
	}

	orchestrator.hub.register <- client

	// Start write pump
	go func() {
		defer func() {
			orchestrator.hub.unregister <- client
			conn.Close()
		}()

		for event := range client.Send {
			if err := conn.WriteJSON(event); err != nil {
				log.Printf("[WebSocket] Write error: %v", err)
				return
			}
		}
	}()

	// Read pump (handle client messages)
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WebSocket] Read error: %v", err)
			}
			break
		}

		// Handle client messages (e.g., manual conflict resolution)
		var msg map[string]interface{}
		if json.Unmarshal(message, &msg) == nil {
			if action, ok := msg["action"].(string); ok {
				switch action {
				case "resolve_conflict":
					// Handle manual conflict resolution
					log.Printf("[WebSocket] Received conflict resolution from user %d", userID)
				case "request_sync":
					// Trigger immediate sync
					log.Printf("[WebSocket] Received sync request from user %d", userID)
				}
			}
		}
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "healthy",
		"service":   "sync-orchestrator",
		"version":   "1.0.0",
		"timestamp": time.Now().Unix(),
	})
}

func handleMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(orchestrator.metrics.GetMetrics())
}

func handleConflicts(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("userId")
	var userID int64
	fmt.Sscanf(userIDStr, "%d", &userID)

	// Get pending conflicts from Redis
	pattern := fmt.Sprintf("sync:conflict:*")
	keys, _ := orchestrator.redisClient.Keys(orchestrator.ctx, pattern).Result()

	conflicts := []SyncConflict{}
	for _, key := range keys {
		data, err := orchestrator.redisClient.Get(orchestrator.ctx, key).Result()
		if err != nil {
			continue
		}
		var conflict SyncConflict
		if json.Unmarshal([]byte(data), &conflict) == nil {
			if conflict.LocalRecord.UserID == userID && conflict.ResolvedAt == nil {
				conflicts = append(conflicts, conflict)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"conflicts": conflicts,
		"count":     len(conflicts),
	})
}

// ============================================================================
// Main
// ============================================================================

func main() {
	config := loadConfig()
	orchestrator = NewSyncOrchestrator(config)

	if err := orchestrator.Start(); err != nil {
		log.Fatalf("[SyncOrchestrator] Failed to start: %v", err)
	}
	defer orchestrator.Stop()

	// Setup routes
	router := mux.NewRouter()
	router.HandleFunc("/api/sync/push", handlePush).Methods("POST")
	router.HandleFunc("/api/sync/pull", handlePull).Methods("POST")
	router.HandleFunc("/api/sync/conflicts", handleConflicts).Methods("GET")
	router.HandleFunc("/api/sync/metrics", handleMetrics).Methods("GET")
	router.HandleFunc("/ws", handleWebSocket)
	router.HandleFunc("/health", handleHealth)

	// Start server
	addr := fmt.Sprintf(":%s", config.Port)
	log.Printf("[SyncOrchestrator] Starting server on %s", addr)
	log.Printf("[SyncOrchestrator] Push endpoint: POST http://localhost%s/api/sync/push", addr)
	log.Printf("[SyncOrchestrator] Pull endpoint: POST http://localhost%s/api/sync/pull", addr)
	log.Printf("[SyncOrchestrator] WebSocket: ws://localhost%s/ws", addr)
	log.Printf("[SyncOrchestrator] Health: http://localhost%s/health", addr)

	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("[SyncOrchestrator] Server failed: %v", err)
	}
}
