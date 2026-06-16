package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
)

// ============================================================================
// Delivery & Fleet Management Service (Go)
// Handles: route optimization, driver assignment, delivery tracking,
// collection point management, last-mile logistics
// PostGIS queries via database/sql, Sedona analytics via Spark jobs
// Middleware: Kafka, Dapr, Redis, APISIX
// ============================================================================

type Config struct {
	Port         string
	DatabaseURL  string
	KafkaBrokers string
	RedisURL     string
	DaprHTTPPort string
}

func loadConfig() *Config {
	return &Config{
		Port:         getEnv("PORT", "8091"),
		DatabaseURL:  getEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/farmer_data"),
		KafkaBrokers: getEnv("KAFKA_BROKERS", "localhost:9093"),
		RedisURL:     getEnv("REDIS_URL", "localhost:6379"),
		DaprHTTPPort: getEnv("DAPR_HTTP_PORT", "3500"),
	}
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// ============================================================================
// Domain Types
// ============================================================================

type Coordinate struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type DeliveryZone struct {
	ID                int     `json:"id"`
	Name              string  `json:"name"`
	City              string  `json:"city"`
	Country           string  `json:"country"`
	PricingMultiplier float64 `json:"pricing_multiplier"`
	BaseFee           int     `json:"base_fee"`
	PerKmFee          int     `json:"per_km_fee"`
}

type Driver struct {
	ID               int        `json:"id"`
	UserID           int        `json:"user_id"`
	VehicleType      string     `json:"vehicle_type"`
	HasRefrigeration bool       `json:"has_refrigeration"`
	CapacityKg       int        `json:"capacity_kg"`
	CurrentLocation  Coordinate `json:"current_location"`
	Rating           float64    `json:"rating"`
	OnlineStatus     string     `json:"online_status"`
	TotalDeliveries  int        `json:"total_deliveries"`
}

type DeliveryRequest struct {
	OrderID           int        `json:"order_id"`
	PickupLocation    Coordinate `json:"pickup_location"`
	DeliveryLocation  Coordinate `json:"delivery_location"`
	WeightKg          float64    `json:"weight_kg"`
	RequiresColdChain bool       `json:"requires_cold_chain"`
	Priority          string     `json:"priority"`
	ScheduledPickup   string     `json:"scheduled_pickup,omitempty"`
}

type RouteResult struct {
	DistanceKm       float64 `json:"distance_km"`
	EstimatedMinutes int     `json:"estimated_minutes"`
	RoadQuality      string  `json:"road_quality"`
	Waypoints        []Coordinate `json:"waypoints,omitempty"`
}

type DeliveryAssignment struct {
	ID               int        `json:"id"`
	OrderID          int        `json:"order_id"`
	DriverID         int        `json:"driver_id"`
	Status           string     `json:"status"`
	EstimatedArrival string     `json:"estimated_arrival"`
	Route            RouteResult `json:"route"`
}

type CollectionPoint struct {
	ID            int        `json:"id"`
	Name          string     `json:"name"`
	Location      Coordinate `json:"location"`
	CapacityTons  float64    `json:"capacity_tons"`
	OperatingHours string    `json:"operating_hours"`
	ContactPhone  string     `json:"contact_phone"`
}

type DeliveryTracking struct {
	AssignmentID int        `json:"assignment_id"`
	Location     Coordinate `json:"location"`
	Temperature  float64    `json:"temperature,omitempty"`
	Speed        float64    `json:"speed,omitempty"`
	Timestamp    string     `json:"timestamp"`
}

// ============================================================================
// Route Optimization Engine (Haversine + road quality factors)
// In production, integrate with OSRM or Valhalla for real routing
// ============================================================================

func haversineDistance(a, b Coordinate) float64 {
	const R = 6371.0 // Earth radius km
	dLat := (b.Latitude - a.Latitude) * math.Pi / 180
	dLon := (b.Longitude - a.Longitude) * math.Pi / 180
	lat1 := a.Latitude * math.Pi / 180
	lat2 := b.Latitude * math.Pi / 180

	sinDLat := math.Sin(dLat / 2)
	sinDLon := math.Sin(dLon / 2)
	aVal := sinDLat*sinDLat + math.Cos(lat1)*math.Cos(lat2)*sinDLon*sinDLon
	c := 2 * math.Atan2(math.Sqrt(aVal), math.Sqrt(1-aVal))
	return R * c
}

func roadQualityFactor(quality string) float64 {
	switch quality {
	case "highway":
		return 1.0
	case "paved":
		return 1.3
	case "gravel":
		return 1.8
	case "dirt":
		return 2.5
	case "seasonal":
		return 3.0
	default:
		return 1.5
	}
}

func calculateRoute(pickup, delivery Coordinate, roadQuality string) RouteResult {
	distance := haversineDistance(pickup, delivery)
	factor := roadQualityFactor(roadQuality)
	actualDistance := distance * factor

	// Average speed varies by road quality
	avgSpeedKmH := 60.0 / factor
	estimatedMinutes := int(actualDistance / avgSpeedKmH * 60)

	return RouteResult{
		DistanceKm:       math.Round(actualDistance*100) / 100,
		EstimatedMinutes: estimatedMinutes,
		RoadQuality:      roadQuality,
	}
}

// Multi-stop route optimization (nearest neighbor heuristic)
func optimizeMultiStopRoute(origin Coordinate, stops []Coordinate) []int {
	n := len(stops)
	if n <= 1 {
		result := make([]int, n)
		for i := range result {
			result[i] = i
		}
		return result
	}

	visited := make([]bool, n)
	order := make([]int, 0, n)
	current := origin

	for len(order) < n {
		bestIdx := -1
		bestDist := math.MaxFloat64
		for i := 0; i < n; i++ {
			if !visited[i] {
				d := haversineDistance(current, stops[i])
				if d < bestDist {
					bestDist = d
					bestIdx = i
				}
			}
		}
		if bestIdx >= 0 {
			visited[bestIdx] = true
			order = append(order, bestIdx)
			current = stops[bestIdx]
		}
	}
	return order
}

// ============================================================================
// Driver Assignment Engine
// ============================================================================

type DriverPool struct {
	drivers []Driver
	mu      sync.RWMutex
}

func NewDriverPool() *DriverPool {
	return &DriverPool{drivers: []Driver{}}
}

func (dp *DriverPool) UpdateDriverLocation(driverID int, loc Coordinate) {
	dp.mu.Lock()
	defer dp.mu.Unlock()
	for i := range dp.drivers {
		if dp.drivers[i].ID == driverID {
			dp.drivers[i].CurrentLocation = loc
			return
		}
	}
}

func (dp *DriverPool) SetDriverOnline(driver Driver) {
	dp.mu.Lock()
	defer dp.mu.Unlock()
	for i := range dp.drivers {
		if dp.drivers[i].ID == driver.ID {
			dp.drivers[i] = driver
			return
		}
	}
	dp.drivers = append(dp.drivers, driver)
}

func (dp *DriverPool) SetDriverOffline(driverID int) {
	dp.mu.Lock()
	defer dp.mu.Unlock()
	for i := range dp.drivers {
		if dp.drivers[i].ID == driverID {
			dp.drivers = append(dp.drivers[:i], dp.drivers[i+1:]...)
			return
		}
	}
}

type DriverScore struct {
	Driver   Driver
	Distance float64
	Score    float64
}

func (dp *DriverPool) FindBestDriver(req DeliveryRequest) (*Driver, error) {
	dp.mu.RLock()
	defer dp.mu.RUnlock()

	var candidates []DriverScore
	for _, d := range dp.drivers {
		if d.OnlineStatus != "online" {
			continue
		}
		if req.RequiresColdChain && !d.HasRefrigeration {
			continue
		}
		if req.WeightKg > float64(d.CapacityKg) {
			continue
		}

		dist := haversineDistance(d.CurrentLocation, req.PickupLocation)
		// Score: lower is better. Factors: distance (40%), rating (30%), experience (30%)
		distScore := dist / 50.0 // normalize to 50km
		ratingScore := (5.0 - d.Rating) / 5.0
		expScore := 1.0 / (1.0 + float64(d.TotalDeliveries)/100.0)
		score := 0.4*distScore + 0.3*ratingScore + 0.3*expScore

		candidates = append(candidates, DriverScore{Driver: d, Distance: dist, Score: score})
	}

	if len(candidates) == 0 {
		return nil, fmt.Errorf("no available drivers for this delivery")
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Score < candidates[j].Score
	})

	return &candidates[0].Driver, nil
}

// ============================================================================
// Event Publisher (Kafka via Dapr)
// ============================================================================

type EventPublisher struct {
	daprURL string
	client  *http.Client
}

func NewEventPublisher(daprPort string) *EventPublisher {
	return &EventPublisher{
		daprURL: fmt.Sprintf("http://localhost:%s", daprPort),
		client:  &http.Client{Timeout: 5 * time.Second},
	}
}

func (ep *EventPublisher) Publish(ctx context.Context, topic string, event interface{}) {
	body, err := json.Marshal(event)
	if err != nil {
		return
	}
	url := fmt.Sprintf("%s/v1.0/publish/kafka-pubsub/%s", ep.daprURL, topic)
	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(body)))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := ep.client.Do(req)
	if err != nil {
		log.Printf("[Delivery] Dapr publish fallback: %v", err)
		return
	}
	defer resp.Body.Close()
}

// ============================================================================
// HTTP Server
// ============================================================================

type Server struct {
	config    *Config
	pool      *DriverPool
	publisher *EventPublisher
}

func NewServer(cfg *Config) *Server {
	return &Server{
		config:    cfg,
		pool:      NewDriverPool(),
		publisher: NewEventPublisher(cfg.DaprHTTPPort),
	}
}

func (s *Server) handleCalculateRoute(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Pickup      Coordinate `json:"pickup"`
		Delivery    Coordinate `json:"delivery"`
		RoadQuality string     `json:"road_quality"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}
	if req.RoadQuality == "" {
		req.RoadQuality = "paved"
	}

	route := calculateRoute(req.Pickup, req.Delivery, req.RoadQuality)
	writeJSON(w, http.StatusOK, route)
}

func (s *Server) handleOptimizeMultiStop(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Origin Coordinate   `json:"origin"`
		Stops  []Coordinate `json:"stops"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}

	order := optimizeMultiStopRoute(req.Origin, req.Stops)
	optimizedStops := make([]Coordinate, len(order))
	for i, idx := range order {
		optimizedStops[i] = req.Stops[idx]
	}

	totalDistance := 0.0
	current := req.Origin
	for _, stop := range optimizedStops {
		totalDistance += haversineDistance(current, stop)
		current = stop
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"order":          order,
		"stops":          optimizedStops,
		"total_distance": math.Round(totalDistance*100) / 100,
	})
}

func (s *Server) handleRequestDelivery(w http.ResponseWriter, r *http.Request) {
	var req DeliveryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}

	driver, err := s.pool.FindBestDriver(req)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"status":  "queued",
			"message": "No drivers available, order queued for assignment",
		})

		s.publisher.Publish(r.Context(), "delivery-events", map[string]interface{}{
			"type":     "delivery_queued",
			"order_id": req.OrderID,
			"reason":   err.Error(),
		})
		return
	}

	route := calculateRoute(req.PickupLocation, req.DeliveryLocation, "paved")
	estimatedArrival := time.Now().Add(time.Duration(route.EstimatedMinutes+15) * time.Minute)

	assignment := DeliveryAssignment{
		OrderID:          req.OrderID,
		DriverID:         driver.ID,
		Status:           "assigned",
		EstimatedArrival: estimatedArrival.UTC().Format(time.RFC3339),
		Route:            route,
	}

	s.publisher.Publish(r.Context(), "delivery-events", map[string]interface{}{
		"type":              "delivery_assigned",
		"order_id":          req.OrderID,
		"driver_id":         driver.ID,
		"estimated_arrival": assignment.EstimatedArrival,
		"distance_km":       route.DistanceKm,
		"timestamp":         time.Now().UTC().Format(time.RFC3339),
	})

	writeJSON(w, http.StatusOK, assignment)
}

func (s *Server) handleDriverOnline(w http.ResponseWriter, r *http.Request) {
	var driver Driver
	if err := json.NewDecoder(r.Body).Decode(&driver); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}
	driver.OnlineStatus = "online"
	s.pool.SetDriverOnline(driver)

	s.publisher.Publish(r.Context(), "delivery-events", map[string]interface{}{
		"type":      "driver_online",
		"driver_id": driver.ID,
		"location":  driver.CurrentLocation,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})

	writeJSON(w, http.StatusOK, map[string]string{"status": "online"})
}

func (s *Server) handleDriverOffline(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DriverID int `json:"driver_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}
	s.pool.SetDriverOffline(req.DriverID)

	s.publisher.Publish(r.Context(), "delivery-events", map[string]interface{}{
		"type":      "driver_offline",
		"driver_id": req.DriverID,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})

	writeJSON(w, http.StatusOK, map[string]string{"status": "offline"})
}

func (s *Server) handleUpdateLocation(w http.ResponseWriter, r *http.Request) {
	var tracking DeliveryTracking
	if err := json.NewDecoder(r.Body).Decode(&tracking); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}

	s.publisher.Publish(r.Context(), "delivery-tracking", map[string]interface{}{
		"type":          "location_update",
		"assignment_id": tracking.AssignmentID,
		"location":      tracking.Location,
		"temperature":   tracking.Temperature,
		"speed":         tracking.Speed,
		"timestamp":     time.Now().UTC().Format(time.RFC3339),
	})

	writeJSON(w, http.StatusOK, map[string]string{"status": "tracked"})
}

func (s *Server) handleDeliveryZoneLookup(w http.ResponseWriter, r *http.Request) {
	var req Coordinate
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}

	// PostGIS query: SELECT * FROM delivery_zones
	// WHERE ST_Contains(ST_GeomFromText(polygon_wkt, 4326), ST_MakePoint(longitude, latitude))
	// Fallback: return nearest zone
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":  "Zone lookup requires PostGIS — use tRPC router for DB queries",
		"location": req,
	})
}

func (s *Server) handleNearbyCollectionPoints(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Location Coordinate `json:"location"`
		RadiusKm float64    `json:"radius_km"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}

	// PostGIS query: SELECT *, ST_Distance(ST_MakePoint(longitude, latitude)::geography,
	// ST_MakePoint($1, $2)::geography) / 1000 as distance_km FROM collection_points
	// WHERE ST_DWithin(ST_MakePoint(longitude, latitude)::geography, ST_MakePoint($1, $2)::geography, $3 * 1000)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":   "Use tRPC router for PostGIS-backed collection point queries",
		"location":  req.Location,
		"radius_km": req.RadiusKm,
	})
}

func (s *Server) handleEstimateDeliveryFee(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Pickup     Coordinate `json:"pickup"`
		Delivery   Coordinate `json:"delivery"`
		WeightKg   float64    `json:"weight_kg"`
		ColdChain  bool       `json:"cold_chain"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}

	distance := haversineDistance(req.Pickup, req.Delivery)
	baseFee := 100 // KES base fee
	perKmFee := 15 // KES per km
	weightSurcharge := int(req.WeightKg / 10) * 20

	fee := baseFee + int(distance)*perKmFee + weightSurcharge
	if req.ColdChain {
		fee = int(float64(fee) * 1.5)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"fee":         fee,
		"currency":    "KES",
		"distance_km": math.Round(distance*100) / 100,
		"breakdown": map[string]int{
			"base_fee":         baseFee,
			"distance_fee":     int(distance) * perKmFee,
			"weight_surcharge": weightSurcharge,
			"cold_chain_fee":   fee - baseFee - int(distance)*perKmFee - weightSurcharge,
		},
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":         "healthy",
		"service":        "delivery-fleet-management",
		"online_drivers": len(s.pool.drivers),
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
	})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func main() {
	cfg := loadConfig()
	srv := NewServer(cfg)

	mux := http.NewServeMux()

	// Route optimization
	mux.HandleFunc("/api/routes/calculate", srv.handleCalculateRoute)
	mux.HandleFunc("/api/routes/optimize-multi-stop", srv.handleOptimizeMultiStop)
	mux.HandleFunc("/api/delivery/estimate-fee", srv.handleEstimateDeliveryFee)

	// Delivery assignment
	mux.HandleFunc("/api/delivery/request", srv.handleRequestDelivery)

	// Driver management
	mux.HandleFunc("/api/drivers/online", srv.handleDriverOnline)
	mux.HandleFunc("/api/drivers/offline", srv.handleDriverOffline)
	mux.HandleFunc("/api/drivers/update-location", srv.handleUpdateLocation)

	// Zone & collection points
	mux.HandleFunc("/api/zones/lookup", srv.handleDeliveryZoneLookup)
	mux.HandleFunc("/api/collection-points/nearby", srv.handleNearbyCollectionPoints)

	// Health
	mux.HandleFunc("/health", srv.handleHealth)
	mux.HandleFunc("/dapr/subscribe", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, []map[string]string{
			{"pubsubname": "kafka-pubsub", "topic": "delivery-events", "route": "/events/delivery"},
		})
	})

	httpSrv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("[Delivery] Server starting on port %s", cfg.Port)
		if err := httpSrv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("[Delivery] Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[Delivery] Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	httpSrv.Shutdown(ctx)
	log.Println("[Delivery] Server stopped")
}
