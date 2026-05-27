package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/mux"
)

const port = "8085"

var apisixAdminURL string
var apisixAdminKey string

// Circuit breaker state
type CircuitBreaker struct {
	mu               sync.Mutex
	state            string // CLOSED, OPEN, HALF_OPEN
	failureCount     int
	failureThreshold int
	resetTimeout     time.Duration
	lastFailureTime  time.Time
}

var cb = &CircuitBreaker{
	state:            "CLOSED",
	failureThreshold: 5,
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
		log.Printf("[APISIX Gateway] Circuit breaker OPEN after %d failures", c.failureCount)
	}
}

func (c *CircuitBreaker) State() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.state
}

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

type Upstream struct {
	Type  string `json:"type"`
	Nodes []Node `json:"nodes"`
}

type Node struct {
	Host   string `json:"host"`
	Port   int    `json:"port"`
	Weight int    `json:"weight"`
}

type HealthResponse struct {
	Status         string    `json:"status"`
	Timestamp      time.Time `json:"timestamp"`
	APISIX         string    `json:"apisix"`
	CircuitBreaker string    `json:"circuitBreaker"`
}

var httpClient = &http.Client{Timeout: 10 * time.Second}

func main() {
	log.Println("[APISIX Gateway] Starting...")

	apisixAdminURL = os.Getenv("APISIX_ADMIN_URL")
	if apisixAdminURL == "" {
		apisixAdminURL = "http://localhost:9180"
	}

	apisixAdminKey = os.Getenv("APISIX_ADMIN_KEY")
	if apisixAdminKey == "" {
		log.Println("[APISIX Gateway] WARNING: APISIX_ADMIN_KEY not set — using default (not for production)")
		apisixAdminKey = "edd1c9f034335f136f87ad84b625c8f1"
	}

	log.Printf("[APISIX Gateway] Admin URL: %s", apisixAdminURL)

	if err := initializeRoutes(); err != nil {
		log.Printf("[APISIX Gateway] Warning: Failed to initialize routes: %v", err)
	}

	router := mux.NewRouter()
	router.HandleFunc("/health", healthHandler).Methods("GET")
	router.HandleFunc("/routes", listRoutesHandler).Methods("GET")
	router.HandleFunc("/routes", createRouteHandler).Methods("POST")
	router.HandleFunc("/routes/{id}", getRouteHandler).Methods("GET")
	router.HandleFunc("/routes/{id}", updateRouteHandler).Methods("PUT")
	router.HandleFunc("/routes/{id}", deleteRouteHandler).Methods("DELETE")
	router.HandleFunc("/upstreams", listUpstreamsHandler).Methods("GET")

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigChan
		log.Printf("[APISIX Gateway] Received %v, shutting down...", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("[APISIX Gateway] Shutdown error: %v", err)
		}
	}()

	log.Printf("[APISIX Gateway] Listening on port %s", port)
	if err := srv.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("[APISIX Gateway] Failed to start: %v", err)
	}
	log.Println("[APISIX Gateway] Stopped")
}

func apisixRequest(method, path string, body io.Reader) (*http.Response, error) {
	if !cb.Allow() {
		return nil, fmt.Errorf("circuit breaker OPEN — APISIX requests rejected")
	}

	url := apisixAdminURL + path
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-KEY", apisixAdminKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		cb.RecordFailure()
		return nil, err
	}
	if resp.StatusCode >= 500 {
		cb.RecordFailure()
		return resp, fmt.Errorf("APISIX returned %d", resp.StatusCode)
	}
	cb.RecordSuccess()
	return resp, nil
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
				Type:  "roundrobin",
				Nodes: []Node{{Host: "localhost", Port: 3001, Weight: 1}},
			},
			Plugins: map[string]interface{}{
				"cors":      map[string]interface{}{},
				"limit-req": map[string]interface{}{"rate": 100, "burst": 50},
			},
			Description: "Main Node.js tRPC API",
		},
		{
			ID:   "ml-service",
			Name: "Python ML Service",
			URI:  "/ml/*",
			Methods: []string{"GET", "POST"},
			Upstream: Upstream{
				Type:  "roundrobin",
				Nodes: []Node{{Host: "localhost", Port: 3000, Weight: 1}},
			},
			Description: "Python ML prediction service",
		},
		{
			ID:   "image-service",
			Name: "Go Image Service",
			URI:  "/images/*",
			Methods: []string{"GET", "POST"},
			Upstream: Upstream{
				Type:  "roundrobin",
				Nodes: []Node{{Host: "localhost", Port: 8080, Weight: 1}},
			},
			Description: "Go image processing service",
		},
		{
			ID:   "websocket-service",
			Name: "Go WebSocket Service",
			URI:  "/ws/*",
			Methods: []string{"GET"},
			Upstream: Upstream{
				Type:  "roundrobin",
				Nodes: []Node{{Host: "localhost", Port: 8081, Weight: 1}},
			},
			Plugins: map[string]interface{}{"websocket": map[string]interface{}{}},
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
	apisixStatus := "unknown"
	resp, err := apisixRequest("GET", "/apisix/admin/routes", nil)
	if err == nil {
		defer resp.Body.Close()
		apisixStatus = "connected"
	} else {
		apisixStatus = "disconnected"
	}

	response := HealthResponse{
		Status:         "healthy",
		Timestamp:      time.Now(),
		APISIX:         apisixStatus,
		CircuitBreaker: cb.State(),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func listRoutesHandler(w http.ResponseWriter, r *http.Request) {
	resp, err := apisixRequest("GET", "/apisix/admin/routes", nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list routes: %v", err), http.StatusServiceUnavailable)
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
	json.NewEncoder(w).Encode(map[string]string{"status": "created", "id": route.ID})
}

func createRoute(route Route) error {
	data, err := json.Marshal(route)
	if err != nil {
		return err
	}
	resp, err := apisixRequest("PUT", fmt.Sprintf("/apisix/admin/routes/%s", route.ID), bytes.NewBuffer(data))
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
	resp, err := apisixRequest("GET", fmt.Sprintf("/apisix/admin/routes/%s", id), nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get route: %v", err), http.StatusServiceUnavailable)
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
	json.NewEncoder(w).Encode(map[string]string{"status": "updated", "id": id})
}

func deleteRouteHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	resp, err := apisixRequest("DELETE", fmt.Sprintf("/apisix/admin/routes/%s", id), nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete route: %v", err), http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()
	log.Printf("[APISIX Gateway] Deleted route: %s", id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted", "id": id})
}

func listUpstreamsHandler(w http.ResponseWriter, r *http.Request) {
	resp, err := apisixRequest("GET", "/apisix/admin/upstreams", nil)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to list upstreams: %v", err), http.StatusServiceUnavailable)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.Write(body)
}
