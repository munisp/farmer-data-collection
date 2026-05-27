package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

/*
Model Serving Service (Go)

High-performance model serving and edge optimization service.

Features:
1. Fast model serving with gRPC/HTTP
2. Model caching and preloading
3. Edge device optimization
4. Adaptive inference (device capability detection)
5. Model quantization (INT8, FP16)
6. Batch inference optimization
7. Load balancing across model replicas

Tech Stack:
- Go for high performance and low latency
- ONNX Runtime for cross-platform inference
- gRPC for efficient communication
- Prometheus for metrics
*/

// Configuration
const (
	DefaultPort     = "8087"
	ModelCacheSize  = 5 // Number of models to keep in memory
	MaxBatchSize    = 32
	InferenceTimeout = 30 * time.Second
)

// ModelInfo represents model metadata
type ModelInfo struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	DisplayName     string   `json:"display_name"`
	Version         string   `json:"version"`
	Type            string   `json:"type"`
	Framework       string   `json:"framework"`
	Variant         string   `json:"variant"`
	ModelSize       int64    `json:"model_size"`
	Checksum        string   `json:"checksum"`
	Accuracy        float64  `json:"accuracy"`
	AvgInferenceMs  int      `json:"avg_inference_ms"`
	SupportedCrops  []string `json:"supported_crops"`
	SupportedRegions []string `json:"supported_regions"`
	MinRamMB        int      `json:"min_ram_mb"`
	TargetDevice    string   `json:"target_device"`
	LoadedAt        *time.Time `json:"loaded_at,omitempty"`
}

// InferenceRequest represents an inference request
type InferenceRequest struct {
	ModelID   string                 `json:"model_id"`
	ImageData string                 `json:"image_data,omitempty"` // Base64
	ImageURL  string                 `json:"image_url,omitempty"`
	CropType  string                 `json:"crop_type,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// InferenceResponse represents an inference response
type InferenceResponse struct {
	ModelID         string                   `json:"model_id"`
	Predictions     []map[string]interface{} `json:"predictions"`
	Confidence      float64                  `json:"confidence"`
	InferenceTimeMs int64                    `json:"inference_time_ms"`
	Recommendations []string                 `json:"recommendations,omitempty"`
}

// DeviceCapability represents device hardware capabilities
type DeviceCapability struct {
	DeviceType string `json:"device_type"` // high, medium, low, minimal
	RamMB      int    `json:"ram_mb"`
	HasGPU     bool   `json:"has_gpu"`
	CPUCores   int    `json:"cpu_cores"`
	NetworkType string `json:"network_type"` // wifi, 4g, 3g, 2g
}

// ModelCache manages loaded models in memory
type ModelCache struct {
	models map[string]*ModelInfo
	mu     sync.RWMutex
	maxSize int
}

// NewModelCache creates a new model cache
func NewModelCache(maxSize int) *ModelCache {
	return &ModelCache{
		models: make(map[string]*ModelInfo),
		maxSize: maxSize,
	}
}

// Get retrieves a model from cache
func (mc *ModelCache) Get(modelID string) (*ModelInfo, bool) {
	mc.mu.RLock()
	defer mc.mu.RUnlock()
	model, ok := mc.models[modelID]
	return model, ok
}

// Put adds a model to cache
func (mc *ModelCache) Put(model *ModelInfo) {
	mc.mu.Lock()
	defer mc.mu.Unlock()
	
	// Simple LRU: if cache is full, remove oldest
	if len(mc.models) >= mc.maxSize {
		var oldestID string
		var oldestTime time.Time
		
		for id, m := range mc.models {
			if m.LoadedAt != nil && (oldestTime.IsZero() || m.LoadedAt.Before(oldestTime)) {
				oldestID = id
				oldestTime = *m.LoadedAt
			}
		}
		
		if oldestID != "" {
			delete(mc.models, oldestID)
			log.Printf("Evicted model %s from cache", oldestID)
		}
	}
	
	now := time.Now()
	model.LoadedAt = &now
	mc.models[model.ID] = model
	log.Printf("Loaded model %s into cache", model.ID)
}

// List returns all cached models
func (mc *ModelCache) List() []*ModelInfo {
	mc.mu.RLock()
	defer mc.mu.RUnlock()
	
	models := make([]*ModelInfo, 0, len(mc.models))
	for _, model := range mc.models {
		models = append(models, model)
	}
	return models
}

// Global model cache
var modelCache *ModelCache

// ============================================================================
// HTTP Handlers
// ============================================================================

// HealthCheckHandler handles health check requests
func HealthCheckHandler(w http.ResponseWriter, r *http.Request) {
	response := map[string]interface{}{
		"status":    "healthy",
		"service":   "model-serving",
		"version":   "1.0.0",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"models_loaded": len(modelCache.List()),
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ListModelsHandler lists all loaded models
func ListModelsHandler(w http.ResponseWriter, r *http.Request) {
	models := modelCache.List()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"models": models,
		"count":  len(models),
	})
}

// LoadModelHandler loads a model into cache
func LoadModelHandler(w http.ResponseWriter, r *http.Request) {
	var model ModelInfo
	if err := json.NewDecoder(r.Body).Decode(&model); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	// Simulate model loading (in production, load actual ONNX model)
	modelCache.Put(&model)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "success",
		"model_id": model.ID,
		"message":  "Model loaded successfully",
	})
}

// InferenceHandler handles inference requests
func InferenceHandler(w http.ResponseWriter, r *http.Request) {
	var req InferenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	// Check if model is loaded
	model, ok := modelCache.Get(req.ModelID)
	if !ok {
		http.Error(w, fmt.Sprintf("Model %s not loaded", req.ModelID), http.StatusNotFound)
		return
	}
	
	startTime := time.Now()
	
	// Mock inference (in production, run actual ONNX inference)
	predictions := []map[string]interface{}{
		{
			"class":         "Maize Leaf Blight",
			"confidence":    0.92,
			"severity":      "moderate",
			"affected_area": "35%",
		},
		{
			"class":         "Healthy",
			"confidence":    0.08,
			"severity":      "none",
			"affected_area": "0%",
		},
	}
	
	recommendations := []string{
		"Apply fungicide (Mancozeb 80% WP) at 2.5kg/ha",
		"Improve field drainage to reduce moisture",
		"Remove and destroy infected leaves",
		"Monitor field every 3-4 days",
	}
	
	inferenceTime := time.Since(startTime).Milliseconds()
	
	response := InferenceResponse{
		ModelID:         req.ModelID,
		Predictions:     predictions,
		Confidence:      0.92,
		InferenceTimeMs: inferenceTime,
		Recommendations: recommendations,
	}
	
	log.Printf("Inference completed for model %s in %dms", model.Name, inferenceTime)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// BatchInferenceHandler handles batch inference requests
func BatchInferenceHandler(w http.ResponseWriter, r *http.Request) {
	var requests []InferenceRequest
	if err := json.NewDecoder(r.Body).Decode(&requests); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	if len(requests) > MaxBatchSize {
		http.Error(w, fmt.Sprintf("Batch size exceeds maximum of %d", MaxBatchSize), http.StatusBadRequest)
		return
	}
	
	startTime := time.Now()
	responses := make([]InferenceResponse, 0, len(requests))
	
	// Process batch (in production, optimize with parallel processing)
	for _, req := range requests {
		// Mock individual inference
		resp := InferenceResponse{
			ModelID: req.ModelID,
			Predictions: []map[string]interface{}{
				{"class": "Disease Detected", "confidence": 0.85},
			},
			Confidence:      0.85,
			InferenceTimeMs: 100,
		}
		responses = append(responses, resp)
	}
	
	totalTime := time.Since(startTime).Milliseconds()
	
	result := map[string]interface{}{
		"results":           responses,
		"total_count":       len(responses),
		"total_time_ms":     totalTime,
		"avg_time_per_item": totalTime / int64(len(responses)),
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// DetectDeviceCapabilityHandler detects device capabilities
func DetectDeviceCapabilityHandler(w http.ResponseWriter, r *http.Request) {
	// In production, detect actual device capabilities from headers/user-agent
	capability := DeviceCapability{
		DeviceType:  "medium",
		RamMB:       4096,
		HasGPU:      false,
		CPUCores:    4,
		NetworkType: "4g",
	}
	
	// Recommend model variant based on capability
	var recommendedVariant string
	switch capability.DeviceType {
	case "high":
		recommendedVariant = "full"
	case "medium":
		recommendedVariant = "quantized"
	case "low":
		recommendedVariant = "pruned"
	case "minimal":
		recommendedVariant = "compressed"
	default:
		recommendedVariant = "quantized"
	}
	
	response := map[string]interface{}{
		"capability":          capability,
		"recommended_variant": recommendedVariant,
		"can_run_offline":     capability.RamMB >= 2048,
		"recommended_batch_size": capability.CPUCores * 2,
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// OptimizeModelHandler optimizes a model for edge devices
func OptimizeModelHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ModelID          string `json:"model_id"`
		OptimizationType string `json:"optimization_type"` // quantize, prune, compress
		TargetDevice     string `json:"target_device"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	// Mock optimization (in production, perform actual model optimization)
	optimizedModelID := fmt.Sprintf("%s_%s_%s", req.ModelID, req.OptimizationType, req.TargetDevice)
	
	response := map[string]interface{}{
		"status":             "optimization_started",
		"original_model_id":  req.ModelID,
		"optimized_model_id": optimizedModelID,
		"optimization_type":  req.OptimizationType,
		"target_device":      req.TargetDevice,
		"estimated_time_minutes": 10,
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// ============================================================================
// Metrics
// ============================================================================

// MetricsHandler exposes Prometheus metrics
func MetricsHandler(w http.ResponseWriter, r *http.Request) {
	// In production, integrate with Prometheus client
	metrics := `# HELP model_inference_duration_ms Model inference duration in milliseconds
# TYPE model_inference_duration_ms histogram
model_inference_duration_ms_bucket{model="maize_disease_v1",le="50"} 10
model_inference_duration_ms_bucket{model="maize_disease_v1",le="100"} 45
model_inference_duration_ms_bucket{model="maize_disease_v1",le="200"} 89
model_inference_duration_ms_bucket{model="maize_disease_v1",le="+Inf"} 100
model_inference_duration_ms_sum{model="maize_disease_v1"} 12450
model_inference_duration_ms_count{model="maize_disease_v1"} 100

# HELP models_loaded Number of models currently loaded in memory
# TYPE models_loaded gauge
models_loaded ` + fmt.Sprintf("%d", len(modelCache.List())) + `

# HELP inference_requests_total Total number of inference requests
# TYPE inference_requests_total counter
inference_requests_total{model="maize_disease_v1",status="success"} 1250
inference_requests_total{model="pest_detector_v1",status="success"} 890
`
	
	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte(metrics))
}

// ============================================================================
// Main
// ============================================================================

func main() {
	// Initialize model cache
	modelCache = NewModelCache(ModelCacheSize)
	
	// Load sample models on startup
	loadSampleModels()
	
	// Create router
	r := mux.NewRouter()
	
	// Health check
	r.HandleFunc("/health", HealthCheckHandler).Methods("GET")
	
	// Model management
	r.HandleFunc("/models", ListModelsHandler).Methods("GET")
	r.HandleFunc("/models/load", LoadModelHandler).Methods("POST")
	
	// Inference
	r.HandleFunc("/inference", InferenceHandler).Methods("POST")
	r.HandleFunc("/inference/batch", BatchInferenceHandler).Methods("POST")
	
	// Device capability
	r.HandleFunc("/device/capability", DetectDeviceCapabilityHandler).Methods("GET")
	
	// Optimization
	r.HandleFunc("/optimize", OptimizeModelHandler).Methods("POST")
	
	// Metrics
	r.HandleFunc("/metrics", MetricsHandler).Methods("GET")
	
	// Get port from environment
	port := os.Getenv("MODEL_SERVING_PORT")
	if port == "" {
		port = DefaultPort
	}
	
	// Start server
	addr := fmt.Sprintf("0.0.0.0:%s", port)
	log.Printf("🚀 Model Serving Service starting on %s", addr)
	log.Printf("📊 Model cache size: %d", ModelCacheSize)
	log.Printf("✅ Service ready!")
	
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal(err)
	}
}

// loadSampleModels loads sample models on startup
func loadSampleModels() {
	sampleModels := []*ModelInfo{
		{
			ID:              "maize_disease_v1",
			Name:            "maize_disease_detector",
			DisplayName:     "Maize Disease Detector v1.0",
			Version:         "1.0.0",
			Type:            "disease_detection",
			Framework:       "onnx",
			Variant:         "quantized",
			ModelSize:       150 * 1024 * 1024,
			Checksum:        "abc123...",
			Accuracy:        0.9250,
			AvgInferenceMs:  145,
			SupportedCrops:  []string{"maize", "corn"},
			SupportedRegions: []string{"west_africa", "east_africa"},
			MinRamMB:        512,
			TargetDevice:    "medium",
		},
		{
			ID:              "pest_detector_v1",
			Name:            "pest_identifier",
			DisplayName:     "Agricultural Pest Detector v1.0",
			Version:         "1.0.0",
			Type:            "pest_identification",
			Framework:       "onnx",
			Variant:         "pruned",
			ModelSize:       85 * 1024 * 1024,
			Checksum:        "def456...",
			Accuracy:        0.8950,
			AvgInferenceMs:  98,
			SupportedCrops:  []string{"maize", "cassava", "rice", "sorghum"},
			SupportedRegions: []string{"west_africa", "east_africa", "southern_africa"},
			MinRamMB:        256,
			TargetDevice:    "low",
		},
	}
	
	for _, model := range sampleModels {
		modelCache.Put(model)
	}
	
	log.Printf("Loaded %d sample models", len(sampleModels))
}
