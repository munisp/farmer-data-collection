package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"
)

const (
	port = "8084"
)

// StreamMessage represents a message in the stream
type StreamMessage struct {
	Topic     string                 `json:"topic"`
	Key       string                 `json:"key,omitempty"`
	Value     interface{}            `json:"value"`
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// ProduceRequest represents a request to produce messages
type ProduceRequest struct {
	Topic    string      `json:"topic"`
	Key      string      `json:"key,omitempty"`
	Value    interface{} `json:"value"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// ConsumeRequest represents a request to consume messages
type ConsumeRequest struct {
	Topic    string `json:"topic"`
	Offset   int64  `json:"offset,omitempty"`
	MaxCount int    `json:"maxCount,omitempty"`
}

// HealthResponse represents health check response
type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Fluvio    string    `json:"fluvio"`
	Topics    []string  `json:"topics"`
}

// In-memory message store (for demo purposes - replace with actual Fluvio client)
var messageStore = make(map[string][]StreamMessage)

func main() {
	log.Println("[Fluvio Service] Starting...")

	// Initialize Fluvio client (simulated for now)
	initializeFluvio()

	// Create HTTP router
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", healthHandler).Methods("GET")

	// Producer endpoints
	router.HandleFunc("/produce", produceHandler).Methods("POST")
	router.HandleFunc("/produce/batch", produceBatchHandler).Methods("POST")

	// Consumer endpoints
	router.HandleFunc("/consume", consumeHandler).Methods("POST")
	router.HandleFunc("/consume/stream", consumeStreamHandler).Methods("GET")

	// Topic management
	router.HandleFunc("/topics", listTopicsHandler).Methods("GET")
	router.HandleFunc("/topics/{topic}", createTopicHandler).Methods("POST")
	router.HandleFunc("/topics/{topic}", deleteTopicHandler).Methods("DELETE")

	// Metrics
	router.HandleFunc("/metrics", metricsHandler).Methods("GET")

	log.Printf("[Fluvio Service] Listening on port %s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatalf("[Fluvio Service] Failed to start: %v", err)
	}
}

func initializeFluvio() {
	// Initialize Fluvio client connection
	// In production, this would connect to actual Fluvio cluster
	fluvioEndpoint := os.Getenv("FLUVIO_ENDPOINT")
	if fluvioEndpoint == "" {
		fluvioEndpoint = "localhost:9003"
	}

	log.Printf("[Fluvio Service] Connecting to Fluvio at %s", fluvioEndpoint)
	
	// Create default topics
	defaultTopics := []string{
		"farmer-data-stream",
		"marketplace-events-stream",
		"analytics-stream",
		"ml-predictions-stream",
		// Financial/Payment streams (Mojaloop & TigerBeetle)
		"mojaloop-transfers-stream",
		"mojaloop-quotes-stream",
		"mojaloop-parties-stream",
		"mojaloop-settlements-stream",
		"tigerbeetle-ledger-stream",
		"tigerbeetle-accounts-stream",
		"loan-disbursements-stream",
		"loan-repayments-stream",
		"payment-events-stream",
	}

	for _, topic := range defaultTopics {
		messageStore[topic] = []StreamMessage{}
		log.Printf("[Fluvio Service] Initialized topic: %s", topic)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	topics := make([]string, 0, len(messageStore))
	for topic := range messageStore {
		topics = append(topics, topic)
	}

	response := HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now(),
		Fluvio:    "connected",
		Topics:    topics,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func produceHandler(w http.ResponseWriter, r *http.Request) {
	var req ProduceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Topic == "" {
		http.Error(w, "Topic is required", http.StatusBadRequest)
		return
	}

	// Create message
	message := StreamMessage{
		Topic:     req.Topic,
		Key:       req.Key,
		Value:     req.Value,
		Timestamp: time.Now(),
		Metadata:  req.Metadata,
	}

	// Store message (in production, this would send to Fluvio)
	if _, exists := messageStore[req.Topic]; !exists {
		messageStore[req.Topic] = []StreamMessage{}
	}
	messageStore[req.Topic] = append(messageStore[req.Topic], message)

	log.Printf("[Fluvio Service] Produced message to topic %s: key=%s", req.Topic, req.Key)

	response := map[string]interface{}{
		"status":    "success",
		"topic":     req.Topic,
		"offset":    len(messageStore[req.Topic]) - 1,
		"timestamp": message.Timestamp,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func produceBatchHandler(w http.ResponseWriter, r *http.Request) {
	var requests []ProduceRequest
	if err := json.NewDecoder(r.Body).Decode(&requests); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	results := make([]map[string]interface{}, 0, len(requests))

	for _, req := range requests {
		if req.Topic == "" {
			continue
		}

		message := StreamMessage{
			Topic:     req.Topic,
			Key:       req.Key,
			Value:     req.Value,
			Timestamp: time.Now(),
			Metadata:  req.Metadata,
		}

		if _, exists := messageStore[req.Topic]; !exists {
			messageStore[req.Topic] = []StreamMessage{}
		}
		messageStore[req.Topic] = append(messageStore[req.Topic], message)

		results = append(results, map[string]interface{}{
			"topic":  req.Topic,
			"offset": len(messageStore[req.Topic]) - 1,
		})
	}

	log.Printf("[Fluvio Service] Produced %d messages in batch", len(results))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "success",
		"count":   len(results),
		"results": results,
	})
}

func consumeHandler(w http.ResponseWriter, r *http.Request) {
	var req ConsumeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Topic == "" {
		http.Error(w, "Topic is required", http.StatusBadRequest)
		return
	}

	messages, exists := messageStore[req.Topic]
	if !exists {
		http.Error(w, "Topic not found", http.StatusNotFound)
		return
	}

	// Apply offset
	if req.Offset >= int64(len(messages)) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"messages": []StreamMessage{},
			"count":    0,
		})
		return
	}

	messages = messages[req.Offset:]

	// Apply max count
	if req.MaxCount > 0 && len(messages) > req.MaxCount {
		messages = messages[:req.MaxCount]
	}

	log.Printf("[Fluvio Service] Consumed %d messages from topic %s", len(messages), req.Topic)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"messages": messages,
		"count":    len(messages),
	})
}

func consumeStreamHandler(w http.ResponseWriter, r *http.Request) {
	topic := r.URL.Query().Get("topic")
	if topic == "" {
		http.Error(w, "Topic is required", http.StatusBadRequest)
		return
	}

	// Set headers for SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming not supported", http.StatusInternalServerError)
		return
	}

	ctx := r.Context()
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	lastOffset := 0

	log.Printf("[Fluvio Service] Started streaming from topic %s", topic)

	for {
		select {
		case <-ctx.Done():
			log.Printf("[Fluvio Service] Client disconnected from stream")
			return
		case <-ticker.C:
			messages, exists := messageStore[topic]
			if !exists || len(messages) <= lastOffset {
				continue
			}

			// Send new messages
			newMessages := messages[lastOffset:]
			for _, msg := range newMessages {
				data, _ := json.Marshal(msg)
				fmt.Fprintf(w, "data: %s\n\n", data)
				flusher.Flush()
			}

			lastOffset = len(messages)
		}
	}
}

func listTopicsHandler(w http.ResponseWriter, r *http.Request) {
	topics := make([]map[string]interface{}, 0, len(messageStore))
	
	for topic, messages := range messageStore {
		topics = append(topics, map[string]interface{}{
			"name":          topic,
			"messageCount":  len(messages),
			"lastTimestamp": getLastTimestamp(messages),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"topics": topics,
		"count":  len(topics),
	})
}

func createTopicHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	topic := vars["topic"]

	if _, exists := messageStore[topic]; exists {
		http.Error(w, "Topic already exists", http.StatusConflict)
		return
	}

	messageStore[topic] = []StreamMessage{}
	log.Printf("[Fluvio Service] Created topic: %s", topic)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "created",
		"topic":  topic,
	})
}

func deleteTopicHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	topic := vars["topic"]

	if _, exists := messageStore[topic]; !exists {
		http.Error(w, "Topic not found", http.StatusNotFound)
		return
	}

	delete(messageStore, topic)
	log.Printf("[Fluvio Service] Deleted topic: %s", topic)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "deleted",
		"topic":  topic,
	})
}

func metricsHandler(w http.ResponseWriter, r *http.Request) {
	totalMessages := 0
	for _, messages := range messageStore {
		totalMessages += len(messages)
	}

	metrics := map[string]interface{}{
		"totalTopics":   len(messageStore),
		"totalMessages": totalMessages,
		"timestamp":     time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

func getLastTimestamp(messages []StreamMessage) *time.Time {
	if len(messages) == 0 {
		return nil
	}
	ts := messages[len(messages)-1].Timestamp
	return &ts
}
