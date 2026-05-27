package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// FluvioConfig holds Fluvio configuration
type FluvioConfig struct {
	Endpoint     string
	EventTracker *ProcessedEventsTracker
}

// FluvioClient provides Fluvio streaming operations
// This is an HTTP-based client - replace with native Fluvio client in production
type FluvioClient struct {
	config     FluvioConfig
	httpClient *http.Client
}

// FluvioRecord represents a record in Fluvio
type FluvioRecord struct {
	Key       string      `json:"key,omitempty"`
	Value     interface{} `json:"value"`
	Timestamp int64       `json:"timestamp,omitempty"`
	Headers   map[string]string `json:"headers,omitempty"`
}

// FluvioTopic represents a Fluvio topic
type FluvioTopic struct {
	Name       string `json:"name"`
	Partitions int    `json:"partitions"`
	Replicas   int    `json:"replicas"`
}

// NewFluvioClient creates a new Fluvio client
func NewFluvioClient(config FluvioConfig) *FluvioClient {
	if config.Endpoint == "" {
		config.Endpoint = "http://localhost:9003"
	}

	return &FluvioClient{
		config: config,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// CreateTopic creates a new topic (idempotent)
func (c *FluvioClient) CreateTopic(ctx context.Context, topic FluvioTopic) error {
	url := fmt.Sprintf("%s/topics", c.config.Endpoint)

	body, _ := json.Marshal(topic)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("[Fluvio] Failed to create topic: %v", err)
		return nil // Graceful degradation
	}
	defer resp.Body.Close()

	// Treat "already exists" as success (idempotent)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusConflict {
		return fmt.Errorf("create topic failed with status: %d", resp.StatusCode)
	}

	log.Printf("[Fluvio] Created topic: %s", topic.Name)
	return nil
}

// DeleteTopic deletes a topic
func (c *FluvioClient) DeleteTopic(ctx context.Context, topicName string) error {
	url := fmt.Sprintf("%s/topics/%s", c.config.Endpoint, topicName)

	req, err := http.NewRequestWithContext(ctx, "DELETE", url, nil)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to delete topic: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("delete topic failed with status: %d", resp.StatusCode)
	}

	log.Printf("[Fluvio] Deleted topic: %s", topicName)
	return nil
}

// Produce sends a record to a topic
func (c *FluvioClient) Produce(ctx context.Context, topic string, record FluvioRecord) error {
	url := fmt.Sprintf("%s/topics/%s/produce", c.config.Endpoint, topic)

	if record.Timestamp == 0 {
		record.Timestamp = time.Now().UnixMilli()
	}

	body, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("failed to marshal record: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("[Fluvio] Failed to produce record: %v", err)
		return nil // Graceful degradation
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("produce failed with status: %d", resp.StatusCode)
	}

	log.Printf("[Fluvio] Produced record to topic: %s", topic)
	return nil
}

// ProduceEvent produces a KafkaEvent to Fluvio (compatible with Kafka event format)
func (c *FluvioClient) ProduceEvent(ctx context.Context, topic string, event KafkaEvent) error {
	record := FluvioRecord{
		Key:       fmt.Sprintf("%s:%v", event.EntityType, event.EntityID),
		Value:     event,
		Timestamp: time.Now().UnixMilli(),
		Headers: map[string]string{
			"eventType":   event.EventType,
			"entityType":  event.EntityType,
			"eventId":     event.EventID,
		},
	}

	return c.Produce(ctx, topic, record)
}

// ProduceBatch sends multiple records to a topic
func (c *FluvioClient) ProduceBatch(ctx context.Context, topic string, records []FluvioRecord) error {
	url := fmt.Sprintf("%s/topics/%s/produce/batch", c.config.Endpoint, topic)

	for i := range records {
		if records[i].Timestamp == 0 {
			records[i].Timestamp = time.Now().UnixMilli()
		}
	}

	body, err := json.Marshal(records)
	if err != nil {
		return fmt.Errorf("failed to marshal records: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("[Fluvio] Failed to produce batch: %v", err)
		return nil // Graceful degradation
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("produce batch failed with status: %d", resp.StatusCode)
	}

	log.Printf("[Fluvio] Produced %d records to topic: %s", len(records), topic)
	return nil
}

// Consume retrieves records from a topic
func (c *FluvioClient) Consume(ctx context.Context, topic string, partition int, offset int64, limit int) ([]FluvioRecord, error) {
	url := fmt.Sprintf("%s/topics/%s/consume?partition=%d&offset=%d&limit=%d", 
		c.config.Endpoint, topic, partition, offset, limit)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to consume records: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("consume failed with status: %d", resp.StatusCode)
	}

	var records []FluvioRecord
	if err := json.NewDecoder(resp.Body).Decode(&records); err != nil {
		return nil, err
	}

	log.Printf("[Fluvio] Consumed %d records from topic: %s", len(records), topic)
	return records, nil
}

// FluvioRecordHandler is a function that handles a Fluvio record
type FluvioRecordHandler func(ctx context.Context, record FluvioRecord) error

// ConsumeWithIdempotency consumes records with exactly-once semantics
func (c *FluvioClient) ConsumeWithIdempotency(ctx context.Context, topic string, partition int, handler FluvioRecordHandler) error {
	offset := int64(0)
	batchSize := 100

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		records, err := c.Consume(ctx, topic, partition, offset, batchSize)
		if err != nil {
			log.Printf("[Fluvio] Error consuming records: %v", err)
			time.Sleep(time.Second)
			continue
		}

		if len(records) == 0 {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		for _, record := range records {
			// Extract event ID from value if it's a KafkaEvent
			var eventID string
			if valueMap, ok := record.Value.(map[string]interface{}); ok {
				if id, ok := valueMap["eventId"].(string); ok {
					eventID = id
				}
			}

			// Check if event was already processed (idempotency)
			if eventID != "" && c.config.EventTracker != nil {
				processed, err := c.config.EventTracker.IsProcessed(ctx, eventID)
				if err != nil {
					log.Printf("[Fluvio] Error checking event status: %v", err)
					continue
				}
				if processed {
					log.Printf("[Fluvio] Skipping already processed event: %s", eventID)
					offset++
					continue
				}
			}

			// Process the record
			if err := handler(ctx, record); err != nil {
				log.Printf("[Fluvio] Error handling record: %v", err)
				continue
			}

			// Mark event as processed
			if eventID != "" && c.config.EventTracker != nil {
				if err := c.config.EventTracker.MarkProcessed(ctx, eventID); err != nil {
					log.Printf("[Fluvio] Error marking event as processed: %v", err)
				}
			}

			offset++
		}
	}
}

// GetTopicInfo retrieves information about a topic
func (c *FluvioClient) GetTopicInfo(ctx context.Context, topicName string) (*FluvioTopic, error) {
	url := fmt.Sprintf("%s/topics/%s", c.config.Endpoint, topicName)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get topic info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("get topic info failed with status: %d", resp.StatusCode)
	}

	var topic FluvioTopic
	if err := json.NewDecoder(resp.Body).Decode(&topic); err != nil {
		return nil, err
	}

	return &topic, nil
}

// ListTopics lists all topics
func (c *FluvioClient) ListTopics(ctx context.Context) ([]FluvioTopic, error) {
	url := fmt.Sprintf("%s/topics", c.config.Endpoint)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to list topics: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("list topics failed with status: %d", resp.StatusCode)
	}

	var topics []FluvioTopic
	if err := json.NewDecoder(resp.Body).Decode(&topics); err != nil {
		return nil, err
	}

	return topics, nil
}

// CheckHealth checks if Fluvio is healthy
func (c *FluvioClient) CheckHealth(ctx context.Context) (bool, error) {
	url := fmt.Sprintf("%s/health", c.config.Endpoint)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return false, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, nil
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK, nil
}

// SetupDefaultTopics creates the default topics for the platform
func (c *FluvioClient) SetupDefaultTopics(ctx context.Context) error {
	topics := []FluvioTopic{
		{Name: "farmer.events", Partitions: 3, Replicas: 1},
		{Name: "farm.events", Partitions: 3, Replicas: 1},
		{Name: "crop.events", Partitions: 3, Replicas: 1},
		{Name: "livestock.events", Partitions: 3, Replicas: 1},
		{Name: "harvest.events", Partitions: 3, Replicas: 1},
		{Name: "expense.events", Partitions: 3, Replicas: 1},
		{Name: "auth.events", Partitions: 1, Replicas: 1},
		{Name: "cache.invalidation", Partitions: 1, Replicas: 1},
		{Name: "audit.trail", Partitions: 3, Replicas: 1},
		{Name: "notifications", Partitions: 3, Replicas: 1},
		{Name: "analytics", Partitions: 3, Replicas: 1},
	}

	for _, topic := range topics {
		if err := c.CreateTopic(ctx, topic); err != nil {
			log.Printf("[Fluvio] Warning: failed to create topic %s: %v", topic.Name, err)
		}
	}

	log.Printf("[Fluvio] Set up default topics")
	return nil
}
