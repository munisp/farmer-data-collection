package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/mux"
)

const port = "8084"

// StreamMessage represents a message in the stream
type StreamMessage struct {
	Topic     string                 `json:"topic"`
	Key       string                 `json:"key,omitempty"`
	Value     interface{}            `json:"value"`
	Timestamp time.Time              `json:"timestamp"`
	Offset    int64                  `json:"offset"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

type ProduceRequest struct {
	Topic    string                 `json:"topic"`
	Key      string                 `json:"key,omitempty"`
	Value    interface{}            `json:"value"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

type ConsumeRequest struct {
	Topic    string `json:"topic"`
	Offset   int64  `json:"offset,omitempty"`
	MaxCount int    `json:"maxCount,omitempty"`
}

type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Fluvio    string    `json:"fluvio"`
	Topics    []string  `json:"topics"`
	Mode      string    `json:"mode"` // "native" or "fallback"
}

// Thread-safe message store with mutex protection
type MessageStore struct {
	mu       sync.RWMutex
	messages map[string][]StreamMessage
}

func NewMessageStore() *MessageStore {
	return &MessageStore{messages: make(map[string][]StreamMessage)}
}

func (s *MessageStore) Produce(topic string, msg StreamMessage) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.messages[topic]; !exists {
		s.messages[topic] = []StreamMessage{}
	}
	msg.Offset = int64(len(s.messages[topic]))
	s.messages[topic] = append(s.messages[topic], msg)
	return len(s.messages[topic]) - 1
}

func (s *MessageStore) Consume(topic string, offset int64, maxCount int) ([]StreamMessage, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	msgs, exists := s.messages[topic]
	if !exists {
		return nil, false
	}
	if offset >= int64(len(msgs)) {
		return []StreamMessage{}, true
	}
	result := msgs[offset:]
	if maxCount > 0 && len(result) > maxCount {
		result = result[:maxCount]
	}
	return result, true
}

func (s *MessageStore) Topics() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	topics := make([]string, 0, len(s.messages))
	for t := range s.messages {
		topics = append(topics, t)
	}
	return topics
}

func (s *MessageStore) TopicInfo() []map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]map[string]interface{}, 0, len(s.messages))
	for topic, msgs := range s.messages {
		info := map[string]interface{}{
			"name":         topic,
			"messageCount": len(msgs),
		}
		if len(msgs) > 0 {
			info["lastTimestamp"] = msgs[len(msgs)-1].Timestamp
		}
		result = append(result, info)
	}
	return result
}

func (s *MessageStore) CreateTopic(topic string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.messages[topic]; exists {
		return false
	}
	s.messages[topic] = []StreamMessage{}
	return true
}

func (s *MessageStore) DeleteTopic(topic string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.messages[topic]; !exists {
		return false
	}
	delete(s.messages, topic)
	return true
}

func (s *MessageStore) TotalMessages() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	total := 0
	for _, msgs := range s.messages {
		total += len(msgs)
	}
	return total
}

var store = NewMessageStore()
var fluvioAvailable = false

// Circuit breaker for Fluvio CLI calls
type CircuitBreaker struct {
	mu               sync.Mutex
	state            string
	failureCount     int
	failureThreshold int
	resetTimeout     time.Duration
	lastFailureTime  time.Time
}

var cb = &CircuitBreaker{
	state:            "CLOSED",
	failureThreshold: 3,
	resetTimeout:     30 * time.Second,
}

func (c *CircuitBreaker) Allow() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.state == "CLOSED" {
		return true
	}
	if c.state == "OPEN" && time.Since(c.lastFailureTime) > c.resetTimeout {
		c.state = "HALF_OPEN"
		return true
	}
	return c.state == "HALF_OPEN"
}

func (c *CircuitBreaker) RecordSuccess() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.failureCount = 0
	c.state = "CLOSED"
}

func (c *CircuitBreaker) RecordFailure() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.failureCount++
	c.lastFailureTime = time.Now()
	if c.failureCount >= c.failureThreshold {
		c.state = "OPEN"
		log.Printf("[Fluvio] Circuit breaker OPEN after %d failures", c.failureCount)
	}
}

func main() {
	log.Println("[Fluvio Service] Starting...")

	initializeFluvio()

	router := mux.NewRouter()
	router.HandleFunc("/health", healthHandler).Methods("GET")
	router.HandleFunc("/produce", produceHandler).Methods("POST")
	router.HandleFunc("/produce/batch", produceBatchHandler).Methods("POST")
	router.HandleFunc("/consume", consumeHandler).Methods("POST")
	router.HandleFunc("/consume/stream", consumeStreamHandler).Methods("GET")
	router.HandleFunc("/topics", listTopicsHandler).Methods("GET")
	router.HandleFunc("/topics/{topic}", createTopicHandler).Methods("POST")
	router.HandleFunc("/topics/{topic}", deleteTopicHandler).Methods("DELETE")
	router.HandleFunc("/metrics", metricsHandler).Methods("GET")

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigChan
		log.Printf("[Fluvio Service] Received %v, shutting down...", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("[Fluvio Service] Shutdown error: %v", err)
		}
	}()

	log.Printf("[Fluvio Service] Listening on port %s", port)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("[Fluvio Service] Failed to start: %v", err)
	}
	log.Println("[Fluvio Service] Stopped")
}

func initializeFluvio() {
	fluvioEndpoint := os.Getenv("FLUVIO_ENDPOINT")
	if fluvioEndpoint == "" {
		fluvioEndpoint = "localhost:9003"
	}
	log.Printf("[Fluvio Service] Attempting connection to Fluvio at %s", fluvioEndpoint)

	// Try native Fluvio CLI
	out, err := exec.Command("fluvio", "version").CombinedOutput()
	if err == nil {
		fluvioAvailable = true
		log.Printf("[Fluvio Service] Fluvio CLI available: %s", strings.TrimSpace(string(out)))
	} else {
		log.Println("[Fluvio Service] Fluvio CLI not available — using in-process fallback store")
	}

	defaultTopics := []string{
		"farmer-data-stream",
		"marketplace-events-stream",
		"analytics-stream",
		"ml-predictions-stream",
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
		store.CreateTopic(topic)
		if fluvioAvailable && cb.Allow() {
			if err := fluvioCreateTopic(topic); err != nil {
				cb.RecordFailure()
			} else {
				cb.RecordSuccess()
			}
		}
		log.Printf("[Fluvio Service] Initialized topic: %s", topic)
	}
}

func fluvioCreateTopic(topic string) error {
	cmd := exec.Command("fluvio", "topic", "create", topic)
	out, err := cmd.CombinedOutput()
	if err != nil && !strings.Contains(string(out), "already exists") {
		return fmt.Errorf("fluvio topic create failed: %s", string(out))
	}
	return nil
}

func fluvioProduce(topic, key string, value []byte) error {
	if !fluvioAvailable || !cb.Allow() {
		return fmt.Errorf("fluvio unavailable")
	}
	cmd := exec.Command("fluvio", "produce", topic, "--key", key)
	cmd.Stdin = strings.NewReader(string(value))
	out, err := cmd.CombinedOutput()
	if err != nil {
		cb.RecordFailure()
		return fmt.Errorf("fluvio produce failed: %s", string(out))
	}
	cb.RecordSuccess()
	return nil
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	mode := "fallback"
	fluvioStatus := "disconnected"
	if fluvioAvailable {
		mode = "native"
		fluvioStatus = "connected"
	}
	response := HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now(),
		Fluvio:    fluvioStatus,
		Topics:    store.Topics(),
		Mode:      mode,
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

	message := StreamMessage{
		Topic:     req.Topic,
		Key:       req.Key,
		Value:     req.Value,
		Timestamp: time.Now(),
		Metadata:  req.Metadata,
	}

	offset := store.Produce(req.Topic, message)

	// Try native Fluvio in background
	if fluvioAvailable {
		go func() {
			val, _ := json.Marshal(req.Value)
			_ = fluvioProduce(req.Topic, req.Key, val)
		}()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "success",
		"topic":     req.Topic,
		"offset":    offset,
		"timestamp": message.Timestamp,
	})
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
		msg := StreamMessage{
			Topic: req.Topic, Key: req.Key, Value: req.Value,
			Timestamp: time.Now(), Metadata: req.Metadata,
		}
		offset := store.Produce(req.Topic, msg)
		results = append(results, map[string]interface{}{"topic": req.Topic, "offset": offset})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "success", "count": len(results), "results": results})
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
	messages, exists := store.Consume(req.Topic, req.Offset, req.MaxCount)
	if !exists {
		http.Error(w, "Topic not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"messages": messages, "count": len(messages)})
}

func consumeStreamHandler(w http.ResponseWriter, r *http.Request) {
	topic := r.URL.Query().Get("topic")
	if topic == "" {
		http.Error(w, "Topic is required", http.StatusBadRequest)
		return
	}
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
	var lastOffset int64

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			messages, exists := store.Consume(topic, lastOffset, 0)
			if !exists || len(messages) == 0 {
				continue
			}
			for _, msg := range messages {
				data, _ := json.Marshal(msg)
				fmt.Fprintf(w, "data: %s\n\n", data)
				flusher.Flush()
			}
			lastOffset += int64(len(messages))
		}
	}
}

func listTopicsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	info := store.TopicInfo()
	json.NewEncoder(w).Encode(map[string]interface{}{"topics": info, "count": len(info)})
}

func createTopicHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	topic := vars["topic"]
	if !store.CreateTopic(topic) {
		http.Error(w, "Topic already exists", http.StatusConflict)
		return
	}
	if fluvioAvailable {
		_ = fluvioCreateTopic(topic)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "created", "topic": topic})
}

func deleteTopicHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	topic := vars["topic"]
	if !store.DeleteTopic(topic) {
		http.Error(w, "Topic not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "topic": topic})
}

func metricsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"totalTopics":    len(store.Topics()),
		"totalMessages":  store.TotalMessages(),
		"fluvioNative":   fluvioAvailable,
		"circuitBreaker": cb.state,
		"timestamp":      time.Now(),
	})
}
