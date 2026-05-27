package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"
)

const (
	port = "8085"
)

var apisixAdminURL string
var apisixAdminKey string

// Route represents an APISIX route configuration
type Route struct {
	ID          string                 `json:"id,omitempty"`
	Name        string                 `json:"name"`
	URI         string                 `json:"uri"`
	Methods     []string               `json:"methods,omitempty"`
	Upstream    Upstream               `json:"upstream"`
	Plugins     map[string]interface{} `json:"plugins,omitempty"`
	Description string                 `json:"desc,omitempty"`
}

// Upstream represents an APISIX upstream configuration
type Upstream struct {
	Type  string `json:"type"`
	Nodes []Node `json:"nodes"`
}

// Node represents an upstream node
type Node struct {
	Host   string `json:"host"`
	Port   int    `json:"port"`
	Weight int    `json:"weight"`
}

// HealthResponse represents health check response
type HealthResponse struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	APISIX    string    `json:"apisix"`
	AdminURL  string    `json:"adminUrl"`
}

func main() {
	log.Println("[APISIX Gateway] Starting...")

	// Initialize APISIX configuration
	apisixAdminURL = os.Getenv("APISIX_ADMIN_URL")
	if apisixAdminURL == "" {
		apisixAdminURL = "http://localhost:9180"
	}

	apisixAdminKey = os.Getenv("APISIX_ADMIN_KEY")
	if apisixAdminKey == "" {
		apisixAdminKey = "edd1c9f034335f136f87ad84b625c8f1"
	}

	log.Printf("[APISIX Gateway] Admin URL: %s", apisixAdminURL)

	// Initialize default routes
	if err := initializeRoutes(); err != nil {
		log.Printf("[APISIX Gateway] Warning: Failed to initialize routes: %v", err)
	}

	// Create HTTP router
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", healthHandler).Methods("GET")

	// Route management
	router.HandleFunc("/routes", listRoutesHandler).Methods("GET")
	router.HandleFunc("/routes", createRouteHandler).Methods("POST")
	router.HandleFunc("/routes/{id}", getRouteHandler).Methods("GET")
	router.HandleFunc("/routes/{id}", updateRouteHandler).Methods("PUT")
	router.HandleFunc("/routes/{id}", deleteRouteHandler).Methods("DELETE")

	// Upstream management
	router.HandleFunc("/upstreams", listUpstreamsHandler).Methods("GET")

	log.Printf("[APISIX Gateway] Listening on port %s", port)
	if err := http.ListenAndServe(":"+port, router); err != nil {
		log.Fatalf("[APISIX Gateway] Failed to start: %v", err)
	}
}

func initializeRoutes() error {
	log.Println("[APISIX Gateway] Initializing default routes...")

	routes := []Route{
		{
			ID:   "node-api",
			Name: "Node.js API",
			URI:  "/api/*",
			Methods: []string{"GET", "POST", "PUT", "DELETE"},
			Upstream: Upstream{
				Type: "roundrobin",
				Nodes: []Node{
					{Host: "localhost", Port: 3001, Weight: 1},
				},
			},
			Plugins: map[string]interface{}{
				"cors": map[string]interface{}{},
				"limit-req": map[string]interface{}{
					"rate":  100,
					"burst": 50,
				},
			},
			Description: "Main Node.js tRPC API",
		},
		{
			ID:   "ml-service",
			Name: "Python ML Service",
			URI:  "/ml/*",
			Methods: []string{"GET", "POST"},
			Upstream: Upstream{
				Type: "roundrobin",
				Nodes: []Node{
					{Host: "localhost", Port: 3000, Weight: 1},
				},
			},
			Description: "Python ML prediction service",
		},
		{
			ID:   "image-service",
			Name: "Go Image Service",
			URI:  "/images/*",
			Methods: []string{"GET", "POST"},
			Upstream: Upstream{
				Type: "roundrobin",
				Nodes: []Node{
					{Host: "localhost", Port: 8080, Weight: 1},
				},
			},
			Description: "Go image processing service",
		},
		{
			ID:   "websocket-service",
			Name: "Go WebSocket Service",
			URI:  "/ws/*",
			Methods: []string{"GET"},
			Upstream: Upstream{
				Type: "roundrobin",
				Nodes: []Node{
					{Host: "localhost", Port: 8081, Weight: 1},
				},
			},
			Plugins: map[string]interface{}{
				"websocket": map[string]interface{}{},
			},
			Description: "Go real-time WebSocket service",
		},
	}

	for _, route := range routes {
		if err := createRoute(route); err != nil {
			log.Printf("[APISIX Gateway] Failed to create route %s: %v", route.Name, err)
		} else {
			log.Printf("[APISIX Gateway] Created route: %s", route.Name)
		}
	}

	return nil
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	// Check APISIX admin API health
	apisixStatus := "unknown"
	resp, err := http.Get(apisixAdminURL + "/apisix/admin/routes")
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == 200 {
			apisixStatus = "connected"
		} else {
			apisixStatus = "error"
		}
	} else {
		apisixStatus = "disconnected"
	}

	response := HealthResponse{
		Status:    "healthy",
		Timestamp: time.Now(),
		APISIX:    apisixStatus,
		AdminURL:  apisixAdminURL,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func listRoutesHandler(w http.ResponseWriter, r *http.Request) {
	req, err := http.NewRequest("GET", apisixAdminURL+"/apisix/admin/routes", nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create request: %v", err), http.StatusInternalServerError)
		return
	}

	req.Header.Set("X-API-KEY", apisixAdminKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list routes: %v", err), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
}

func createRouteHandler(w http.ResponseWriter, r *http.Request) {
	var route Route
	if err := json.NewDecoder(r.Body).Decode(&route); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := createRoute(route); err != nil {
		http.Error(w, fmt.Sprintf("Failed to create route: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "created",
		"id":     route.ID,
	})
}

func createRoute(route Route) error {
	data, err := json.Marshal(route)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/apisix/admin/routes/%s", apisixAdminURL, route.ID)
	req, err := http.NewRequest("PUT", url, bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-KEY", apisixAdminKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("APISIX returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

func getRouteHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	url := fmt.Sprintf("%s/apisix/admin/routes/%s", apisixAdminURL, id)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create request: %v", err), http.StatusInternalServerError)
		return
	}

	req.Header.Set("X-API-KEY", apisixAdminKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get route: %v", err), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}

func updateRouteHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var route Route
	if err := json.NewDecoder(r.Body).Decode(&route); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	route.ID = id
	if err := createRoute(route); err != nil {
		http.Error(w, fmt.Sprintf("Failed to update route: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "updated",
		"id":     id,
	})
}

func deleteRouteHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	url := fmt.Sprintf("%s/apisix/admin/routes/%s", apisixAdminURL, id)
	req, err := http.NewRequest("DELETE", url, nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create request: %v", err), http.StatusInternalServerError)
		return
	}

	req.Header.Set("X-API-KEY", apisixAdminKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete route: %v", err), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	log.Printf("[APISIX Gateway] Deleted route: %s", id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "deleted",
		"id":     id,
	})
}

func listUpstreamsHandler(w http.ResponseWriter, r *http.Request) {
	req, err := http.NewRequest("GET", apisixAdminURL+"/apisix/admin/upstreams", nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create request: %v", err), http.StatusInternalServerError)
		return
	}

	req.Header.Set("X-API-KEY", apisixAdminKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list upstreams: %v", err), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
}
