// Feature Flags Service — Go + Dapr state store
// Provides runtime feature flag evaluation for progressive rollouts
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	dapr "github.com/dapr/go-sdk/client"
)

const (
	stateStoreName = "featureflags-store"
	defaultPort    = "8101"
)

type FeatureFlag struct {
	Name        string            `json:"name"`
	Enabled     bool              `json:"enabled"`
	Percentage  int               `json:"percentage"` // 0-100 for gradual rollout
	Rules       []TargetingRule   `json:"rules,omitempty"`
	Variants    map[string]string `json:"variants,omitempty"`
	Description string            `json:"description,omitempty"`
	CreatedAt   string            `json:"created_at"`
	UpdatedAt   string            `json:"updated_at"`
}

type TargetingRule struct {
	Attribute string `json:"attribute"` // e.g., "user_role", "region", "org_id"
	Operator  string `json:"operator"`  // "eq", "neq", "in", "contains"
	Value     string `json:"value"`
	Enabled   bool   `json:"enabled"`
}

type EvalRequest struct {
	FlagName   string            `json:"flag_name"`
	Context    map[string]string `json:"context,omitempty"` // user attributes
	DefaultVal bool              `json:"default_value"`
}

type EvalResponse struct {
	FlagName string `json:"flag_name"`
	Enabled  bool   `json:"enabled"`
	Variant  string `json:"variant,omitempty"`
	Reason   string `json:"reason"`
}

type FlagService struct {
	daprClient dapr.Client
	cache      map[string]*FeatureFlag
	mu         sync.RWMutex
}

func NewFlagService() *FlagService {
	fs := &FlagService{
		cache: make(map[string]*FeatureFlag),
	}

	client, err := dapr.NewClient()
	if err != nil {
		log.Printf("WARN: Dapr client unavailable, using in-memory store: %v", err)
	} else {
		fs.daprClient = client
	}

	// Seed default flags for FarmConnect
	fs.seedDefaults()
	return fs
}

func (fs *FlagService) seedDefaults() {
	defaults := []FeatureFlag{
		{Name: "whatsapp_notifications", Enabled: false, Percentage: 0, Description: "WhatsApp Business API notifications"},
		{Name: "offline_marketplace", Enabled: true, Percentage: 100, Description: "Offline-first marketplace browsing"},
		{Name: "voice_navigation", Enabled: false, Percentage: 10, Description: "Voice-first navigation for low-literacy farmers"},
		{Name: "credit_scoring_v2", Enabled: false, Percentage: 25, Description: "Enhanced credit scoring with geospatial data"},
		{Name: "dark_mode", Enabled: true, Percentage: 100, Description: "Dark/light mode toggle"},
		{Name: "qr_traceability", Enabled: true, Percentage: 100, Description: "QR code produce traceability"},
		{Name: "weather_alerts", Enabled: false, Percentage: 50, Description: "Proactive weather alerts via SMS/WhatsApp"},
		{Name: "cooperative_dashboard", Enabled: true, Percentage: 100, Description: "Cooperative aggregate reporting dashboard"},
		{Name: "payment_reconciliation", Enabled: false, Percentage: 0, Description: "TigerBeetle payment reconciliation"},
		{Name: "rtk_gps_mode", Enabled: true, Percentage: 100, Description: "RTK GPS mode for precise farm boundary measurement"},
		{Name: "opensearch_fulltext", Enabled: false, Percentage: 30, Description: "OpenSearch-powered full-text marketplace search"},
		{Name: "pdf_reports", Enabled: true, Percentage: 100, Description: "PDF farm/loan/delivery reports"},
	}

	now := time.Now().UTC().Format(time.RFC3339)
	for _, f := range defaults {
		f.CreatedAt = now
		f.UpdatedAt = now
		fs.cache[f.Name] = &f
	}
}

func (fs *FlagService) evaluate(flagName string, ctx map[string]string) EvalResponse {
	fs.mu.RLock()
	flag, exists := fs.cache[flagName]
	fs.mu.RUnlock()

	if !exists {
		return EvalResponse{FlagName: flagName, Enabled: false, Reason: "flag_not_found"}
	}

	if !flag.Enabled {
		return EvalResponse{FlagName: flagName, Enabled: false, Reason: "flag_disabled"}
	}

	// Check targeting rules
	for _, rule := range flag.Rules {
		attrVal, ok := ctx[rule.Attribute]
		if !ok {
			continue
		}
		matched := false
		switch rule.Operator {
		case "eq":
			matched = attrVal == rule.Value
		case "neq":
			matched = attrVal != rule.Value
		case "contains":
			matched = len(attrVal) > 0 && len(rule.Value) > 0
		}
		if matched {
			return EvalResponse{FlagName: flagName, Enabled: rule.Enabled, Reason: "rule_match"}
		}
	}

	// Percentage rollout based on user_id hash
	if flag.Percentage < 100 {
		userID, ok := ctx["user_id"]
		if ok {
			hash := 0
			for _, c := range userID {
				hash = (hash*31 + int(c)) % 100
			}
			if hash < 0 {
				hash = -hash
			}
			if hash >= flag.Percentage {
				return EvalResponse{FlagName: flagName, Enabled: false, Reason: "percentage_excluded"}
			}
		}
	}

	return EvalResponse{FlagName: flagName, Enabled: true, Reason: "enabled"}
}

func (fs *FlagService) handleEval(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req EvalRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	result := fs.evaluate(req.FlagName, req.Context)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (fs *FlagService) handleBulkEval(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Flags   []string          `json:"flags"`
		Context map[string]string `json:"context,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	results := make([]EvalResponse, 0, len(req.Flags))
	for _, name := range req.Flags {
		results = append(results, fs.evaluate(name, req.Context))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (fs *FlagService) handleFlags(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		fs.mu.RLock()
		flags := make([]*FeatureFlag, 0, len(fs.cache))
		for _, f := range fs.cache {
			flags = append(flags, f)
		}
		fs.mu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(flags)

	case http.MethodPut:
		var flag FeatureFlag
		if err := json.NewDecoder(r.Body).Decode(&flag); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		flag.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		if flag.CreatedAt == "" {
			flag.CreatedAt = flag.UpdatedAt
		}
		fs.mu.Lock()
		fs.cache[flag.Name] = &flag
		fs.mu.Unlock()

		// Persist to Dapr state store if available
		if fs.daprClient != nil {
			data, _ := json.Marshal(flag)
			_ = fs.daprClient.SaveState(context.Background(), stateStoreName, "flag:"+flag.Name, data, nil)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(flag)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (fs *FlagService) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "ok",
		"service":    "feature-flags",
		"dapr":       fs.daprClient != nil,
		"flags":      len(fs.cache),
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	})
}

func main() {
	port := os.Getenv("FEATURE_FLAGS_PORT")
	if port == "" {
		port = defaultPort
	}

	svc := NewFlagService()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", svc.handleHealth)
	mux.HandleFunc("/evaluate", svc.handleEval)
	mux.HandleFunc("/evaluate/bulk", svc.handleBulkEval)
	mux.HandleFunc("/flags", svc.handleFlags)

	log.Printf("Feature Flags service starting on :%s (%d flags loaded)", port, len(svc.cache))

	portNum, _ := strconv.Atoi(port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", portNum), mux); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
