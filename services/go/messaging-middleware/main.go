package main

import (
	"context"
	"crypto/sha256"
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
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/segmentio/kafka-go"
)

// ============================================================================
// Configuration
// ============================================================================

type Config struct {
	Port           string
	RedisURL       string
	KafkaBrokers   []string
	TigerBeetleURL string
	PermifyURL     string
	AllowedOrigins []string
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
		Port:           getEnvOrDefault("MESSAGING_PORT", "8091"),
		RedisURL:       getEnvOrDefault("REDIS_URL", "localhost:6379"),
		KafkaBrokers:   strings.Split(kafkaBrokers, ","),
		TigerBeetleURL: getEnvOrDefault("TIGERBEETLE_URL", "localhost:3000"),
		PermifyURL:     getEnvOrDefault("PERMIFY_URL", "http://localhost:3476"),
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

type MessageChannel string

const (
	ChannelSMS      MessageChannel = "sms"
	ChannelWhatsApp MessageChannel = "whatsapp"
	ChannelUSSD     MessageChannel = "ussd"
)

type MessageStatus string

const (
	StatusPending   MessageStatus = "pending"
	StatusSent      MessageStatus = "sent"
	StatusDelivered MessageStatus = "delivered"
	StatusFailed    MessageStatus = "failed"
	StatusRead      MessageStatus = "read"
)

type MessageDirection string

const (
	DirectionOutbound MessageDirection = "outbound"
	DirectionInbound  MessageDirection = "inbound"
)

// MessageEvent represents a messaging event for Kafka
type MessageEvent struct {
	ID           string                 `json:"id"`
	Channel      MessageChannel         `json:"channel"`
	Direction    MessageDirection       `json:"direction"`
	PhoneNumber  string                 `json:"phoneNumber"`
	UserID       int64                  `json:"userId,omitempty"`
	Provider     string                 `json:"provider"`
	Status       MessageStatus          `json:"status"`
	Content      string                 `json:"content,omitempty"`
	TemplateID   string                 `json:"templateId,omitempty"`
	ExternalID   string                 `json:"externalId,omitempty"`
	ErrorCode    string                 `json:"errorCode,omitempty"`
	ErrorMessage string                 `json:"errorMessage,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
	Timestamp    time.Time              `json:"timestamp"`
	Checksum     string                 `json:"checksum"`
}

// USSDSessionEvent represents a USSD session event
type USSDSessionEvent struct {
	SessionID    string                 `json:"sessionId"`
	PhoneNumber  string                 `json:"phoneNumber"`
	ServiceCode  string                 `json:"serviceCode"`
	Step         string                 `json:"step"`
	Input        string                 `json:"input,omitempty"`
	Response     string                 `json:"response,omitempty"`
	IsCompleted  bool                   `json:"isCompleted"`
	Action       string                 `json:"action,omitempty"`
	Duration     int64                  `json:"durationMs,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
	Timestamp    time.Time              `json:"timestamp"`
}

// ProviderHealthEvent represents provider health status
type ProviderHealthEvent struct {
	Provider           string    `json:"provider"`
	Channel            string    `json:"channel"`
	IsHealthy          bool      `json:"isHealthy"`
	ConsecutiveFailures int      `json:"consecutiveFailures"`
	LastSuccessAt      *time.Time `json:"lastSuccessAt,omitempty"`
	LastFailureAt      *time.Time `json:"lastFailureAt,omitempty"`
	TotalSent          int64     `json:"totalSent"`
	TotalFailed        int64     `json:"totalFailed"`
	Timestamp          time.Time `json:"timestamp"`
}

// TigerBeetleLedgerEntry for message audit trail
type TigerBeetleLedgerEntry struct {
	ID            string                 `json:"id"`
	TransactionID string                 `json:"transactionId"`
	Channel       MessageChannel         `json:"channel"`
	Direction     MessageDirection       `json:"direction"`
	PhoneNumber   string                 `json:"phoneNumber"`
	UserID        int64                  `json:"userId"`
	Provider      string                 `json:"provider"`
	Status        MessageStatus          `json:"status"`
	Checksum      string                 `json:"checksum"`
	Data          map[string]interface{} `json:"data"`
	Timestamp     time.Time              `json:"timestamp"`
}

// MessagingMetrics for analytics
type MessagingMetrics struct {
	Channel           MessageChannel `json:"channel"`
	TotalSent         int64          `json:"totalSent"`
	TotalDelivered    int64          `json:"totalDelivered"`
	TotalFailed       int64          `json:"totalFailed"`
	TotalInbound      int64          `json:"totalInbound"`
	DeliveryRate      float64        `json:"deliveryRate"`
	AvgLatencyMs      float64        `json:"avgLatencyMs"`
	ProviderBreakdown map[string]int64 `json:"providerBreakdown"`
	HourlyVolume      map[int]int64  `json:"hourlyVolume"`
	Timestamp         time.Time      `json:"timestamp"`
}

// ============================================================================
// Messaging Middleware Service
// ============================================================================

type MessagingMiddleware struct {
	config      *Config
	redisClient *redis.Client
	kafkaWriters map[string]*kafka.Writer
	kafkaReaders map[string]*kafka.Reader
	hub         *WebSocketHub
	metrics     *MetricsCollector
	mu          sync.RWMutex
	ctx         context.Context
	cancel      context.CancelFunc
}

func NewMessagingMiddleware(config *Config) *MessagingMiddleware {
	ctx, cancel := context.WithCancel(context.Background())

	// Initialize Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr:     config.RedisURL,
		Password: os.Getenv("REDIS_PASSWORD"),
		DB:       0,
	})

	// Initialize Kafka writers for each channel
	kafkaWriters := map[string]*kafka.Writer{
		"sms-events": &kafka.Writer{
			Addr:         kafka.TCP(config.KafkaBrokers...),
			Topic:        "sms-events",
			Balancer:     &kafka.LeastBytes{},
			BatchTimeout: 10 * time.Millisecond,
		},
		"whatsapp-events": &kafka.Writer{
			Addr:         kafka.TCP(config.KafkaBrokers...),
			Topic:        "whatsapp-events",
			Balancer:     &kafka.LeastBytes{},
			BatchTimeout: 10 * time.Millisecond,
		},
		"ussd-events": &kafka.Writer{
			Addr:         kafka.TCP(config.KafkaBrokers...),
			Topic:        "ussd-events",
			Balancer:     &kafka.LeastBytes{},
			BatchTimeout: 10 * time.Millisecond,
		},
		"provider-health": &kafka.Writer{
			Addr:         kafka.TCP(config.KafkaBrokers...),
			Topic:        "provider-health",
			Balancer:     &kafka.LeastBytes{},
			BatchTimeout: 10 * time.Millisecond,
		},
	}

	// Initialize Kafka readers
	kafkaReaders := map[string]*kafka.Reader{
		"sms-events": kafka.NewReader(kafka.ReaderConfig{
			Brokers:        config.KafkaBrokers,
			Topic:          "sms-events",
			GroupID:        "messaging-middleware",
			MinBytes:       10e3,
			MaxBytes:       10e6,
			CommitInterval: time.Second,
		}),
		"whatsapp-events": kafka.NewReader(kafka.ReaderConfig{
			Brokers:        config.KafkaBrokers,
			Topic:          "whatsapp-events",
			GroupID:        "messaging-middleware",
			MinBytes:       10e3,
			MaxBytes:       10e6,
			CommitInterval: time.Second,
		}),
		"ussd-events": kafka.NewReader(kafka.ReaderConfig{
			Brokers:        config.KafkaBrokers,
			Topic:          "ussd-events",
			GroupID:        "messaging-middleware",
			MinBytes:       10e3,
			MaxBytes:       10e6,
			CommitInterval: time.Second,
		}),
	}

	return &MessagingMiddleware{
		config:       config,
		redisClient:  redisClient,
		kafkaWriters: kafkaWriters,
		kafkaReaders: kafkaReaders,
		hub:          NewWebSocketHub(),
		metrics:      NewMetricsCollector(),
		ctx:          ctx,
		cancel:       cancel,
	}
}

func (m *MessagingMiddleware) Start() error {
	// Start WebSocket hub
	go m.hub.Run()

	// Start Kafka consumers
	go m.consumeSMSEvents()
	go m.consumeWhatsAppEvents()
	go m.consumeUSSDEvents()

	// Start metrics collector
	go m.metrics.Start()

	// Start provider health monitor
	go m.monitorProviderHealth()

	log.Println("[MessagingMiddleware] Started successfully")
	return nil
}

func (m *MessagingMiddleware) Stop() {
	m.cancel()
	for _, writer := range m.kafkaWriters {
		writer.Close()
	}
	for _, reader := range m.kafkaReaders {
		reader.Close()
	}
	m.redisClient.Close()
	log.Println("[MessagingMiddleware] Stopped")
}

// ============================================================================
// Message Event Publishing
// ============================================================================

func (m *MessagingMiddleware) PublishSMSEvent(event *MessageEvent) error {
	event.Channel = ChannelSMS
	event.Timestamp = time.Now()
	event.Checksum = m.generateChecksum(event)

	return m.publishEvent("sms-events", event)
}

func (m *MessagingMiddleware) PublishWhatsAppEvent(event *MessageEvent) error {
	event.Channel = ChannelWhatsApp
	event.Timestamp = time.Now()
	event.Checksum = m.generateChecksum(event)

	return m.publishEvent("whatsapp-events", event)
}

func (m *MessagingMiddleware) PublishUSSDEvent(event *USSDSessionEvent) error {
	event.Timestamp = time.Now()

	return m.publishEvent("ussd-events", event)
}

func (m *MessagingMiddleware) PublishProviderHealth(event *ProviderHealthEvent) error {
	event.Timestamp = time.Now()

	return m.publishEvent("provider-health", event)
}

func (m *MessagingMiddleware) publishEvent(topic string, event interface{}) error {
	writer, ok := m.kafkaWriters[topic]
	if !ok {
		return fmt.Errorf("unknown topic: %s", topic)
	}

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	err = writer.WriteMessages(m.ctx, kafka.Message{
		Key:   []byte(fmt.Sprintf("%d", time.Now().UnixNano())),
		Value: data,
	})
	if err != nil {
		log.Printf("[MessagingMiddleware] Failed to publish to %s: %v", topic, err)
		return err
	}

	log.Printf("[MessagingMiddleware] Published event to %s", topic)
	return nil
}

func (m *MessagingMiddleware) generateChecksum(event *MessageEvent) string {
	data := fmt.Sprintf("%s:%s:%s:%s:%s:%d",
		event.ID, event.Channel, event.PhoneNumber, event.Provider, event.Status, event.Timestamp.UnixNano())
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])
}

// ============================================================================
// Kafka Consumers
// ============================================================================

func (m *MessagingMiddleware) consumeSMSEvents() {
	reader := m.kafkaReaders["sms-events"]
	for {
		select {
		case <-m.ctx.Done():
			return
		default:
			msg, err := reader.ReadMessage(m.ctx)
			if err != nil {
				if m.ctx.Err() != nil {
					return
				}
				log.Printf("[MessagingMiddleware] SMS read error: %v", err)
				continue
			}

			var event MessageEvent
			if err := json.Unmarshal(msg.Value, &event); err != nil {
				log.Printf("[MessagingMiddleware] SMS unmarshal error: %v", err)
				continue
			}

			m.processSMSEvent(&event)
		}
	}
}

func (m *MessagingMiddleware) consumeWhatsAppEvents() {
	reader := m.kafkaReaders["whatsapp-events"]
	for {
		select {
		case <-m.ctx.Done():
			return
		default:
			msg, err := reader.ReadMessage(m.ctx)
			if err != nil {
				if m.ctx.Err() != nil {
					return
				}
				log.Printf("[MessagingMiddleware] WhatsApp read error: %v", err)
				continue
			}

			var event MessageEvent
			if err := json.Unmarshal(msg.Value, &event); err != nil {
				log.Printf("[MessagingMiddleware] WhatsApp unmarshal error: %v", err)
				continue
			}

			m.processWhatsAppEvent(&event)
		}
	}
}

func (m *MessagingMiddleware) consumeUSSDEvents() {
	reader := m.kafkaReaders["ussd-events"]
	for {
		select {
		case <-m.ctx.Done():
			return
		default:
			msg, err := reader.ReadMessage(m.ctx)
			if err != nil {
				if m.ctx.Err() != nil {
					return
				}
				log.Printf("[MessagingMiddleware] USSD read error: %v", err)
				continue
			}

			var event USSDSessionEvent
			if err := json.Unmarshal(msg.Value, &event); err != nil {
				log.Printf("[MessagingMiddleware] USSD unmarshal error: %v", err)
				continue
			}

			m.processUSSDEvent(&event)
		}
	}
}

// ============================================================================
// Event Processing
// ============================================================================

func (m *MessagingMiddleware) processSMSEvent(event *MessageEvent) {
	log.Printf("[MessagingMiddleware] Processing SMS event: %s -> %s (%s)", event.ID, event.PhoneNumber, event.Status)

	// Update metrics
	m.metrics.RecordMessage(string(event.Channel), string(event.Status), event.Provider)

	// Record in TigerBeetle ledger
	m.recordInLedger(event)

	// Broadcast to WebSocket clients
	m.hub.BroadcastToAll(&WebSocketMessage{
		Type:    "sms_event",
		Channel: string(event.Channel),
		Data:    event,
	})

	// Store in Redis for quick access
	m.cacheMessageEvent(event)
}

func (m *MessagingMiddleware) processWhatsAppEvent(event *MessageEvent) {
	log.Printf("[MessagingMiddleware] Processing WhatsApp event: %s -> %s (%s)", event.ID, event.PhoneNumber, event.Status)

	// Update metrics
	m.metrics.RecordMessage(string(event.Channel), string(event.Status), event.Provider)

	// Record in TigerBeetle ledger
	m.recordInLedger(event)

	// Broadcast to WebSocket clients
	m.hub.BroadcastToAll(&WebSocketMessage{
		Type:    "whatsapp_event",
		Channel: string(event.Channel),
		Data:    event,
	})

	// Store in Redis for quick access
	m.cacheMessageEvent(event)
}

func (m *MessagingMiddleware) processUSSDEvent(event *USSDSessionEvent) {
	log.Printf("[MessagingMiddleware] Processing USSD event: %s step=%s completed=%v", event.SessionID, event.Step, event.IsCompleted)

	// Update metrics
	if event.IsCompleted {
		m.metrics.RecordUSSDCompletion(event.Action, event.Duration)
	} else {
		m.metrics.RecordUSSDStep(event.Step)
	}

	// Broadcast to WebSocket clients
	m.hub.BroadcastToAll(&WebSocketMessage{
		Type:    "ussd_event",
		Channel: "ussd",
		Data:    event,
	})

	// Store session analytics in Redis
	m.cacheUSSDSession(event)
}

// ============================================================================
// TigerBeetle Ledger
// ============================================================================

func (m *MessagingMiddleware) recordInLedger(event *MessageEvent) {
	entry := TigerBeetleLedgerEntry{
		ID:            fmt.Sprintf("msg-%s-%d", event.ID, time.Now().UnixNano()),
		TransactionID: event.ID,
		Channel:       event.Channel,
		Direction:     event.Direction,
		PhoneNumber:   event.PhoneNumber,
		UserID:        event.UserID,
		Provider:      event.Provider,
		Status:        event.Status,
		Checksum:      event.Checksum,
		Data: map[string]interface{}{
			"content":      event.Content,
			"templateId":   event.TemplateID,
			"externalId":   event.ExternalID,
			"errorCode":    event.ErrorCode,
			"errorMessage": event.ErrorMessage,
		},
		Timestamp: event.Timestamp,
	}

	// Store in Redis as TigerBeetle mock (in production, call actual TigerBeetle)
	data, _ := json.Marshal(entry)
	key := fmt.Sprintf("ledger:message:%s", entry.ID)
	m.redisClient.Set(m.ctx, key, data, 30*24*time.Hour)

	log.Printf("[MessagingMiddleware] Recorded ledger entry: %s", entry.ID)
}

// ============================================================================
// Permify Authorization
// ============================================================================

func (m *MessagingMiddleware) CheckSendPermission(userID int64, channel string, phoneNumber string) (bool, error) {
	// In production, call Permify API
	// For now, implement basic rate limiting check
	key := fmt.Sprintf("permify:send:%d:%s", userID, channel)
	count, err := m.redisClient.Incr(m.ctx, key).Result()
	if err != nil {
		return false, err
	}

	// Set expiry on first increment
	if count == 1 {
		m.redisClient.Expire(m.ctx, key, time.Hour)
	}

	// Rate limit: 100 messages per hour per channel
	if count > 100 {
		log.Printf("[MessagingMiddleware] Rate limit exceeded for user %d on %s", userID, channel)
		return false, nil
	}

	return true, nil
}

// ============================================================================
// Provider Health Monitoring
// ============================================================================

func (m *MessagingMiddleware) monitorProviderHealth() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			return
		case <-ticker.C:
			m.checkProviderHealth()
		}
	}
}

func (m *MessagingMiddleware) checkProviderHealth() {
	providers := []struct {
		name    string
		channel string
	}{
		{"africas_talking", "sms"},
		{"twilio", "sms"},
		{"meta", "whatsapp"},
		{"twilio", "whatsapp"},
	}

	for _, p := range providers {
		key := fmt.Sprintf("provider:health:%s:%s", p.channel, p.name)
		data, err := m.redisClient.Get(m.ctx, key).Result()
		if err != nil {
			continue
		}

		var health ProviderHealthEvent
		if json.Unmarshal([]byte(data), &health) == nil {
			// Publish health event
			m.PublishProviderHealth(&health)
		}
	}
}

func (m *MessagingMiddleware) UpdateProviderHealth(channel, provider string, isHealthy bool, failures int) {
	event := &ProviderHealthEvent{
		Provider:            provider,
		Channel:             channel,
		IsHealthy:           isHealthy,
		ConsecutiveFailures: failures,
		Timestamp:           time.Now(),
	}

	// Store in Redis
	data, _ := json.Marshal(event)
	key := fmt.Sprintf("provider:health:%s:%s", channel, provider)
	m.redisClient.Set(m.ctx, key, data, 24*time.Hour)

	// Publish to Kafka
	m.PublishProviderHealth(event)

	// Broadcast via WebSocket
	m.hub.BroadcastToAll(&WebSocketMessage{
		Type:    "provider_health",
		Channel: channel,
		Data:    event,
	})
}

// ============================================================================
// Redis Caching
// ============================================================================

func (m *MessagingMiddleware) cacheMessageEvent(event *MessageEvent) {
	data, _ := json.Marshal(event)
	key := fmt.Sprintf("message:%s:%s", event.Channel, event.ID)
	m.redisClient.Set(m.ctx, key, data, 24*time.Hour)

	// Add to sorted set for time-based queries
	m.redisClient.ZAdd(m.ctx, fmt.Sprintf("messages:%s", event.Channel), &redis.Z{
		Score:  float64(event.Timestamp.UnixNano()),
		Member: event.ID,
	})
}

func (m *MessagingMiddleware) cacheUSSDSession(event *USSDSessionEvent) {
	data, _ := json.Marshal(event)
	key := fmt.Sprintf("ussd:session:%s", event.SessionID)
	m.redisClient.Set(m.ctx, key, data, 1*time.Hour)

	// Track step progression for analytics
	stepKey := fmt.Sprintf("ussd:steps:%s", event.Step)
	m.redisClient.Incr(m.ctx, stepKey)
}

// ============================================================================
// WebSocket Hub
// ============================================================================

type WebSocketHub struct {
	clients    map[*WebSocketClient]bool
	broadcast  chan *WebSocketMessage
	register   chan *WebSocketClient
	unregister chan *WebSocketClient
	mu         sync.RWMutex
}

type WebSocketClient struct {
	UserID int64
	Conn   *websocket.Conn
	Send   chan *WebSocketMessage
}

type WebSocketMessage struct {
	Type    string      `json:"type"`
	Channel string      `json:"channel"`
	Data    interface{} `json:"data"`
}

func NewWebSocketHub() *WebSocketHub {
	return &WebSocketHub{
		clients:    make(map[*WebSocketClient]bool),
		broadcast:  make(chan *WebSocketMessage, 256),
		register:   make(chan *WebSocketClient),
		unregister: make(chan *WebSocketClient),
	}
}

func (h *WebSocketHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("[WebSocket] Client registered: user %d", client.UserID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("[WebSocket] Client unregistered: user %d", client.UserID)

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *WebSocketHub) BroadcastToAll(message *WebSocketMessage) {
	h.broadcast <- message
}

func (h *WebSocketHub) BroadcastToUser(userID int64, message *WebSocketMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		if client.UserID == userID {
			select {
			case client.Send <- message:
			default:
				close(client.Send)
				delete(h.clients, client)
			}
		}
	}
}

// ============================================================================
// Metrics Collector
// ============================================================================

type MetricsCollector struct {
	messageCounts map[string]map[string]int64 // channel -> status -> count
	providerCounts map[string]map[string]int64 // channel -> provider -> count
	ussdSteps     map[string]int64
	ussdCompletions map[string]int64
	latencies     []float64
	mu            sync.RWMutex
}

func NewMetricsCollector() *MetricsCollector {
	return &MetricsCollector{
		messageCounts:   make(map[string]map[string]int64),
		providerCounts:  make(map[string]map[string]int64),
		ussdSteps:       make(map[string]int64),
		ussdCompletions: make(map[string]int64),
		latencies:       []float64{},
	}
}

func (mc *MetricsCollector) Start() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		mc.logMetrics()
	}
}

func (mc *MetricsCollector) RecordMessage(channel, status, provider string) {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	if mc.messageCounts[channel] == nil {
		mc.messageCounts[channel] = make(map[string]int64)
	}
	mc.messageCounts[channel][status]++

	if mc.providerCounts[channel] == nil {
		mc.providerCounts[channel] = make(map[string]int64)
	}
	mc.providerCounts[channel][provider]++
}

func (mc *MetricsCollector) RecordUSSDStep(step string) {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	mc.ussdSteps[step]++
}

func (mc *MetricsCollector) RecordUSSDCompletion(action string, durationMs int64) {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	mc.ussdCompletions[action]++
	mc.latencies = append(mc.latencies, float64(durationMs))
}

func (mc *MetricsCollector) logMetrics() {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	log.Printf("[Metrics] Message counts: %v", mc.messageCounts)
	log.Printf("[Metrics] Provider counts: %v", mc.providerCounts)
	log.Printf("[Metrics] USSD steps: %v", mc.ussdSteps)
	log.Printf("[Metrics] USSD completions: %v", mc.ussdCompletions)
}

func (mc *MetricsCollector) GetMetrics() map[string]interface{} {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	return map[string]interface{}{
		"messageCounts":   mc.messageCounts,
		"providerCounts":  mc.providerCounts,
		"ussdSteps":       mc.ussdSteps,
		"ussdCompletions": mc.ussdCompletions,
		"timestamp":       time.Now().Unix(),
	}
}

// ============================================================================
// HTTP Handlers
// ============================================================================

var middleware *MessagingMiddleware

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func handlePublishSMS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var event MessageEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := middleware.PublishSMSEvent(&event); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"eventId": event.ID,
	})
}

func handlePublishWhatsApp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var event MessageEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := middleware.PublishWhatsAppEvent(&event); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"eventId": event.ID,
	})
}

func handlePublishUSSD(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var event USSDSessionEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := middleware.PublishUSSDEvent(&event); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"sessionId": event.SessionID,
	})
}

func handleCheckPermission(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("userId")
	channel := r.URL.Query().Get("channel")
	phoneNumber := r.URL.Query().Get("phoneNumber")

	var userID int64
	fmt.Sscanf(userIDStr, "%d", &userID)

	allowed, err := middleware.CheckSendPermission(userID, channel, phoneNumber)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"allowed": allowed,
		"userId":  userID,
		"channel": channel,
	})
}

func handleProviderHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var event ProviderHealthEvent
		if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		middleware.UpdateProviderHealth(event.Channel, event.Provider, event.IsHealthy, event.ConsecutiveFailures)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})
		return
	}

	// GET - return all provider health
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"providers": []string{"africas_talking", "twilio", "meta"},
		"timestamp": time.Now().Unix(),
	})
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade error: %v", err)
		return
	}

	userIDStr := r.URL.Query().Get("userId")
	var userID int64
	fmt.Sscanf(userIDStr, "%d", &userID)

	client := &WebSocketClient{
		UserID: userID,
		Conn:   conn,
		Send:   make(chan *WebSocketMessage, 256),
	}

	middleware.hub.register <- client

	// Write pump
	go func() {
		defer func() {
			middleware.hub.unregister <- client
			conn.Close()
		}()

		for message := range client.Send {
			if err := conn.WriteJSON(message); err != nil {
				log.Printf("[WebSocket] Write error: %v", err)
				return
			}
		}
	}()

	// Read pump
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WebSocket] Read error: %v", err)
			}
			break
		}
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "healthy",
		"service":   "messaging-middleware",
		"version":   "1.0.0",
		"timestamp": time.Now().Unix(),
	})
}

func handleMetrics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(middleware.metrics.GetMetrics())
}

// ============================================================================
// Main
// ============================================================================

func main() {
	config := loadConfig()
	middleware = NewMessagingMiddleware(config)

	if err := middleware.Start(); err != nil {
		log.Fatalf("[MessagingMiddleware] Failed to start: %v", err)
	}
	defer middleware.Stop()

	// Setup routes
	router := mux.NewRouter()
	
	// Event publishing endpoints
	router.HandleFunc("/api/messaging/sms/event", handlePublishSMS).Methods("POST")
	router.HandleFunc("/api/messaging/whatsapp/event", handlePublishWhatsApp).Methods("POST")
	router.HandleFunc("/api/messaging/ussd/event", handlePublishUSSD).Methods("POST")
	
	// Authorization
	router.HandleFunc("/api/messaging/permission", handleCheckPermission).Methods("GET")
	
	// Provider health
	router.HandleFunc("/api/messaging/provider/health", handleProviderHealth).Methods("GET", "POST")
	
	// WebSocket for real-time events
	router.HandleFunc("/ws/messaging", handleWebSocket)
	
	// Health and metrics
	router.HandleFunc("/health", handleHealth)
	router.HandleFunc("/metrics", handleMetrics)

	// Start server
	addr := fmt.Sprintf(":%s", config.Port)
	log.Printf("[MessagingMiddleware] Starting server on %s", addr)
	log.Printf("[MessagingMiddleware] SMS events: POST http://localhost%s/api/messaging/sms/event", addr)
	log.Printf("[MessagingMiddleware] WhatsApp events: POST http://localhost%s/api/messaging/whatsapp/event", addr)
	log.Printf("[MessagingMiddleware] USSD events: POST http://localhost%s/api/messaging/ussd/event", addr)
	log.Printf("[MessagingMiddleware] WebSocket: ws://localhost%s/ws/messaging", addr)
	log.Printf("[MessagingMiddleware] Health: http://localhost%s/health", addr)

	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("[MessagingMiddleware] Server failed: %v", err)
	}
}
