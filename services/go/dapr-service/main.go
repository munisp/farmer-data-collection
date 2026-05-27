package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	dapr "github.com/dapr/go-sdk/client"
	"github.com/dapr/go-sdk/service/common"
	daprd "github.com/dapr/go-sdk/service/http"
	"github.com/gorilla/mux"
)

const (
	stateStoreName = "statestore"
	pubsubName     = "pubsub"
	port           = "8082"
)

var daprClient dapr.Client

// StateData represents data stored in Dapr state store
type StateData struct {
	Key   string      `json:"key"`
	Value interface{} `json:"value"`
}

// PubSubMessage represents a pub/sub message
type PubSubMessage struct {
	Topic string      `json:"topic"`
	Data  interface{} `json:"data"`
}

// HealthResponse represents health check response
type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Dapr      string    `json:"dapr"`
}

func main() {
	log.Println("[Dapr Service] Starting...")

	// Initialize Dapr client
	var err error
	daprClient, err = dapr.NewClient()
	if err != nil {
		log.Fatalf("[Dapr Service] Failed to create Dapr client: %v", err)
	}
	defer daprClient.Close()

	log.Println("[Dapr Service] Dapr client initialized successfully")

	// Create HTTP service for Dapr subscriptions
	s := daprd.NewService(fmt.Sprintf(":%s", port))

	// Subscribe to topics
	if err := s.AddTopicEventHandler(&common.Subscription{
		PubsubName: pubsubName,
		Topic:      "farmer-events",
		Route:      "/events/farmer",
	}, farmerEventHandler); err != nil {
		log.Fatalf("[Dapr Service] Failed to add farmer event handler: %v", err)
	}

	if err := s.AddTopicEventHandler(&common.Subscription{
		PubsubName: pubsubName,
		Topic:      "marketplace-events",
		Route:      "/events/marketplace",
	}, marketplaceEventHandler); err != nil {
		log.Fatalf("[Dapr Service] Failed to add marketplace event handler: %v", err)
	}

	// Start HTTP API server in goroutine
	go startHTTPAPI()

	// Start Dapr service
	log.Printf("[Dapr Service] Listening on port %s", port)
	if err := s.Start(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("[Dapr Service] Failed to start: %v", err)
	}
}

// startHTTPAPI starts the HTTP API for state management
func startHTTPAPI() {
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", healthHandler).Methods("GET")

	// State management endpoints
	router.HandleFunc("/state/{key}", getStateHandler).Methods("GET")
	router.HandleFunc("/state", saveStateHandler).Methods("POST")
	router.HandleFunc("/state/{key}", deleteStateHandler).Methods("DELETE")
	router.HandleFunc("/state/bulk", bulkGetStateHandler).Methods("POST")

	// Pub/sub endpoints
	router.HandleFunc("/publish", publishEventHandler).Methods("POST")

	// Service invocation endpoint
	router.HandleFunc("/invoke/{appId}/{method}", invokeServiceHandler).Methods("POST")

	apiPort := os.Getenv("API_PORT")
	if apiPort == "" {
		apiPort = "8083"
	}

	log.Printf("[Dapr Service] HTTP API listening on port %s", apiPort)
	if err := http.ListenAndServe(":"+apiPort, router); err != nil {
		log.Fatalf("[Dapr Service] HTTP API failed: %v", err)
	}
}

// Health check handler
func healthHandler(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()
	
	// Test Dapr connection by trying to get metadata
	daprStatus := "connected"
	_, err := daprClient.GetMetadata(ctx)
	if err != nil {
		daprStatus = "disconnected"
		log.Printf("[Dapr Service] Health check failed: %v", err)
	}

	response := HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now(),
		Dapr:      daprStatus,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Get state handler
func getStateHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	key := vars["key"]

	ctx := context.Background()
	item, err := daprClient.GetState(ctx, stateStoreName, key, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get state: %v", err), http.StatusInternalServerError)
		return
	}

	if item.Value == nil {
		http.Error(w, "Key not found", http.StatusNotFound)
		return
	}

	response := StateData{
		Key:   key,
		Value: string(item.Value),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Save state handler
func saveStateHandler(w http.ResponseWriter, r *http.Request) {
	var data StateData
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	
	// Convert value to bytes
	valueBytes, err := json.Marshal(data.Value)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to marshal value: %v", err), http.StatusBadRequest)
		return
	}

	if err := daprClient.SaveState(ctx, stateStoreName, data.Key, valueBytes, nil); err != nil {
		http.Error(w, fmt.Sprintf("Failed to save state: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("[Dapr Service] Saved state: key=%s", data.Key)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "key": data.Key})
}

// Delete state handler
func deleteStateHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	key := vars["key"]

	ctx := context.Background()
	if err := daprClient.DeleteState(ctx, stateStoreName, key, nil); err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete state: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("[Dapr Service] Deleted state: key=%s", key)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "key": key})
}

// Bulk get state handler
func bulkGetStateHandler(w http.ResponseWriter, r *http.Request) {
	var keys []string
	if err := json.NewDecoder(r.Body).Decode(&keys); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	items, err := daprClient.GetBulkState(ctx, stateStoreName, keys, nil, 10)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get bulk state: %v", err), http.StatusInternalServerError)
		return
	}

	results := make(map[string]interface{})
	for _, item := range items {
		if item.Value != nil {
			results[item.Key] = string(item.Value)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

// Publish event handler
func publishEventHandler(w http.ResponseWriter, r *http.Request) {
	var message PubSubMessage
	if err := json.NewDecoder(r.Body).Decode(&message); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	
	// Convert data to bytes
	dataBytes, err := json.Marshal(message.Data)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to marshal data: %v", err), http.StatusBadRequest)
		return
	}

	if err := daprClient.PublishEvent(ctx, pubsubName, message.Topic, dataBytes); err != nil {
		http.Error(w, fmt.Sprintf("Failed to publish event: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("[Dapr Service] Published event: topic=%s", message.Topic)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "published", "topic": message.Topic})
}

// Service invocation handler
func invokeServiceHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	appId := vars["appId"]
	method := vars["method"]

	var requestData interface{}
	if err := json.NewDecoder(r.Body).Decode(&requestData); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ctx := context.Background()
	
	content := &dapr.DataContent{
		ContentType: "application/json",
	}
	
	dataBytes, _ := json.Marshal(requestData)
	content.Data = dataBytes

	resp, err := daprClient.InvokeMethodWithContent(ctx, appId, method, "post", content)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to invoke service: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("[Dapr Service] Invoked service: appId=%s, method=%s", appId, method)
	
	w.Header().Set("Content-Type", "application/json")
	w.Write(resp)
}

// Farmer event handler
func farmerEventHandler(ctx context.Context, e *common.TopicEvent) (retry bool, err error) {
	log.Printf("[Dapr Service] Received farmer event: %s", string(e.RawData))
	
	// Process farmer event (e.g., update cache, trigger workflows)
	var eventData map[string]interface{}
	if err := json.Unmarshal(e.RawData, &eventData); err != nil {
		log.Printf("[Dapr Service] Failed to unmarshal farmer event: %v", err)
		return false, err
	}

	// Store event in state for audit trail
	eventKey := fmt.Sprintf("farmer-event-%d", time.Now().UnixNano())
	if err := daprClient.SaveState(ctx, stateStoreName, eventKey, e.RawData, nil); err != nil {
		log.Printf("[Dapr Service] Failed to save farmer event: %v", err)
		return true, err // Retry on failure
	}

	log.Printf("[Dapr Service] Processed farmer event: %s", eventKey)
	return false, nil
}

// Marketplace event handler
func marketplaceEventHandler(ctx context.Context, e *common.TopicEvent) (retry bool, err error) {
	log.Printf("[Dapr Service] Received marketplace event: %s", string(e.RawData))
	
	// Process marketplace event
	var eventData map[string]interface{}
	if err := json.Unmarshal(e.RawData, &eventData); err != nil {
		log.Printf("[Dapr Service] Failed to unmarshal marketplace event: %v", err)
		return false, err
	}

	// Store event in state
	eventKey := fmt.Sprintf("marketplace-event-%d", time.Now().UnixNano())
	if err := daprClient.SaveState(ctx, stateStoreName, eventKey, e.RawData, nil); err != nil {
		log.Printf("[Dapr Service] Failed to save marketplace event: %v", err)
		return true, err
	}

	log.Printf("[Dapr Service] Processed marketplace event: %s", eventKey)
	return false, nil
}
