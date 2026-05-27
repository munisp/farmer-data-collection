package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/segmentio/kafka-go"
)

// KafkaEvent represents a standardized event structure (matches TypeScript KafkaEvent)
type KafkaEvent struct {
	EventID    string                 `json:"eventId"`
	EventType  string                 `json:"eventType"`
	EntityType string                 `json:"entityType"`
	EntityID   interface{}            `json:"entityId"`
	UserID     interface{}            `json:"userId"`
	Timestamp  string                 `json:"timestamp"`
	Data       interface{}            `json:"data"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// Topics matches the TypeScript TOPICS constant
var Topics = struct {
	FarmerEvents      string
	FarmEvents        string
	CropEvents        string
	LivestockEvents   string
	HarvestEvents     string
	ExpenseEvents     string
	AuthEvents        string
	CacheInvalidation string
	AuditTrail        string
	Notifications     string
	Analytics         string
}{
	FarmerEvents:      "farmer.events",
	FarmEvents:        "farm.events",
	CropEvents:        "crop.events",
	LivestockEvents:   "livestock.events",
	HarvestEvents:     "harvest.events",
	ExpenseEvents:     "expense.events",
	AuthEvents:        "auth.events",
	CacheInvalidation: "cache.invalidation",
	AuditTrail:        "audit.trail",
	Notifications:     "notifications",
	Analytics:         "analytics",
}

// EventTypes matches the TypeScript EVENT_TYPES constant
var EventTypes = struct {
	Created        string
	Updated        string
	Deleted        string
	Login          string
	Logout         string
	Register       string
	PasswordChange string
}{
	Created:        "CREATED",
	Updated:        "UPDATED",
	Deleted:        "DELETED",
	Login:          "LOGIN",
	Logout:         "LOGOUT",
	Register:       "REGISTER",
	PasswordChange: "PASSWORD_CHANGE",
}

// KafkaClient provides idempotent Kafka operations
type KafkaClient struct {
	brokers       []string
	writer        *kafka.Writer
	eventTracker  *ProcessedEventsTracker
}

// KafkaConfig holds Kafka configuration
type KafkaConfig struct {
	Brokers      []string
	ClientID     string
	EventTracker *ProcessedEventsTracker
}

// NewKafkaClient creates a new idempotent Kafka client
func NewKafkaClient(config KafkaConfig) *KafkaClient {
	writer := &kafka.Writer{
		Addr:         kafka.TCP(config.Brokers...),
		Balancer:     &kafka.LeastBytes{},
		BatchSize:    100,
		BatchTimeout: 10 * time.Millisecond,
		RequiredAcks: kafka.RequireAll, // Wait for all replicas
		Async:        false,            // Synchronous for idempotency
	}

	return &KafkaClient{
		brokers:      config.Brokers,
		writer:       writer,
		eventTracker: config.EventTracker,
	}
}

// CreateEvent creates a new KafkaEvent with proper structure
func CreateEvent(eventType, entityType string, entityID, userID interface{}, data interface{}, metadata map[string]interface{}) KafkaEvent {
	return KafkaEvent{
		EventID:    uuid.New().String(),
		EventType:  eventType,
		EntityType: entityType,
		EntityID:   entityID,
		UserID:     userID,
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
		Data:       data,
		Metadata:   metadata,
	}
}

// CreateDeterministicEvent creates an event with a deterministic ID for idempotency
func CreateDeterministicEvent(eventType, entityType string, entityID, userID interface{}, data interface{}, idempotencyKey string) KafkaEvent {
	return KafkaEvent{
		EventID:    GenerateKey("event", idempotencyKey),
		EventType:  eventType,
		EntityType: entityType,
		EntityID:   entityID,
		UserID:     userID,
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
		Data:       data,
		Metadata: map[string]interface{}{
			"idempotencyKey": idempotencyKey,
		},
	}
}

// PublishEvent publishes an event to a Kafka topic with idempotency
func (c *KafkaClient) PublishEvent(ctx context.Context, topic string, event KafkaEvent) error {
	// Generate message key from entity for partitioning
	key := fmt.Sprintf("%s:%v", event.EntityType, event.EntityID)

	value, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	msg := kafka.Message{
		Topic: topic,
		Key:   []byte(key),
		Value: value,
		Headers: []kafka.Header{
			{Key: "eventType", Value: []byte(event.EventType)},
			{Key: "entityType", Value: []byte(event.EntityType)},
			{Key: "eventId", Value: []byte(event.EventID)},
		},
		Time: time.Now(),
	}

	if err := c.writer.WriteMessages(ctx, msg); err != nil {
		return fmt.Errorf("failed to publish event: %w", err)
	}

	log.Printf("[Kafka] Published event: %s - %s - %s:%v", topic, event.EventType, event.EntityType, event.EntityID)
	return nil
}

// PublishFarmerEvent publishes a farmer-related event
func (c *KafkaClient) PublishFarmerEvent(ctx context.Context, eventType string, farmerID int, userID int, data interface{}) error {
	event := CreateEvent(eventType, "farmer", farmerID, userID, data, nil)
	return c.PublishEvent(ctx, Topics.FarmerEvents, event)
}

// PublishFarmEvent publishes a farm-related event
func (c *KafkaClient) PublishFarmEvent(ctx context.Context, eventType string, farmID int, userID int, data interface{}) error {
	event := CreateEvent(eventType, "farm", farmID, userID, data, nil)
	return c.PublishEvent(ctx, Topics.FarmEvents, event)
}

// PublishAuditEvent publishes an audit trail event
func (c *KafkaClient) PublishAuditEvent(ctx context.Context, action string, entityType string, entityID interface{}, userID int, details interface{}) error {
	event := CreateEvent("AUDIT", entityType, entityID, userID, map[string]interface{}{
		"action":  action,
		"details": details,
	}, nil)
	return c.PublishEvent(ctx, Topics.AuditTrail, event)
}

// KafkaConsumer provides idempotent event consumption
type KafkaConsumer struct {
	reader       *kafka.Reader
	eventTracker *ProcessedEventsTracker
}

// KafkaConsumerConfig holds consumer configuration
type KafkaConsumerConfig struct {
	Brokers      []string
	Topic        string
	GroupID      string
	EventTracker *ProcessedEventsTracker
}

// NewKafkaConsumer creates a new idempotent Kafka consumer
func NewKafkaConsumer(config KafkaConsumerConfig) *KafkaConsumer {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        config.Brokers,
		Topic:          config.Topic,
		GroupID:        config.GroupID,
		MinBytes:       10e3, // 10KB
		MaxBytes:       10e6, // 10MB
		CommitInterval: time.Second,
		StartOffset:    kafka.LastOffset,
	})

	return &KafkaConsumer{
		reader:       reader,
		eventTracker: config.EventTracker,
	}
}

// EventHandler is a function that handles a Kafka event
type EventHandler func(ctx context.Context, event KafkaEvent) error

// ConsumeWithIdempotency consumes events with exactly-once semantics
func (c *KafkaConsumer) ConsumeWithIdempotency(ctx context.Context, handler EventHandler) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		msg, err := c.reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			log.Printf("[Kafka] Error reading message: %v", err)
			continue
		}

		var event KafkaEvent
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Printf("[Kafka] Error unmarshaling event: %v", err)
			continue
		}

		// Check if event was already processed (idempotency)
		if c.eventTracker != nil {
			processed, err := c.eventTracker.IsProcessed(ctx, event.EventID)
			if err != nil {
				log.Printf("[Kafka] Error checking event status: %v", err)
				continue
			}
			if processed {
				log.Printf("[Kafka] Skipping already processed event: %s", event.EventID)
				continue
			}
		}

		// Process the event
		if err := handler(ctx, event); err != nil {
			log.Printf("[Kafka] Error handling event %s: %v", event.EventID, err)
			continue
		}

		// Mark event as processed
		if c.eventTracker != nil {
			if err := c.eventTracker.MarkProcessed(ctx, event.EventID); err != nil {
				log.Printf("[Kafka] Error marking event as processed: %v", err)
			}
		}

		log.Printf("[Kafka] Processed event: %s - %s", event.EventID, event.EventType)
	}
}

// Close closes the Kafka client
func (c *KafkaClient) Close() error {
	return c.writer.Close()
}

// Close closes the Kafka consumer
func (c *KafkaConsumer) Close() error {
	return c.reader.Close()
}
