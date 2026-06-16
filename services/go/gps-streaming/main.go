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
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

// Real-time GPS Delivery Tracking via WebSocket
//
// Drivers push GPS updates via POST /gps/update or WebSocket /ws/driver/{id}.
// Buyers subscribe to delivery tracking via WebSocket /ws/track/{delivery_id}.
// All positions are broadcast to subscribers in real-time.
//
// Features:
// - WebSocket pub/sub for live driver positions
// - Redis for cross-instance position sharing
// - Geofence alerts (arrival detection)
// - Position history buffer for reconnection
// - Haversine ETA estimation

const (
	defaultPort       = "8098"
	wsReadBufferSize  = 1024
	wsWriteBufferSize = 1024
	positionHistoryN  = 100
	geofenceRadiusM   = 200.0
	pongWait          = 60 * time.Second
	pingPeriod        = 50 * time.Second
	writeWait         = 10 * time.Second
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  wsReadBufferSize,
	WriteBufferSize: wsWriteBufferSize,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Position struct {
	DriverID    int     `json:"driver_id"`
	DeliveryID  int     `json:"delivery_id,omitempty"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Accuracy    float64 `json:"accuracy,omitempty"`
	Speed       float64 `json:"speed,omitempty"`
	Heading     float64 `json:"heading,omitempty"`
	Altitude    float64 `json:"altitude,omitempty"`
	Timestamp   string  `json:"timestamp"`
	BatteryPct  float64 `json:"battery_pct,omitempty"`
}

type TrackingUpdate struct {
	Type       string    `json:"type"`
	Position   *Position `json:"position,omitempty"`
	ETA        *ETAInfo  `json:"eta,omitempty"`
	Geofence   *GeofenceAlert `json:"geofence,omitempty"`
}

type ETAInfo struct {
	DistanceM    float64 `json:"distance_m"`
	EstMinutes   float64 `json:"est_minutes"`
	AvgSpeedKmh  float64 `json:"avg_speed_kmh"`
}

type GeofenceAlert struct {
	DeliveryID int     `json:"delivery_id"`
	DistanceM  float64 `json:"distance_m"`
	Message    string  `json:"message"`
}

type Destination struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type GPSStreamingService struct {
	mu             sync.RWMutex
	redis          *redis.Client
	redisOK        bool
	subscribers    map[int]map[*websocket.Conn]bool // deliveryID -> set of ws connections
	driverConns    map[int]*websocket.Conn          // driverID -> ws connection
	positions      map[int][]Position               // deliveryID -> position history
	destinations   map[int]Destination              // deliveryID -> destination coords
	stats          StreamStats
}

type StreamStats struct {
	ActiveDrivers     int `json:"active_drivers"`
	ActiveSubscribers int `json:"active_subscribers"`
	PositionsRecv     int64 `json:"positions_received"`
	PositionsBcast    int64 `json:"positions_broadcast"`
	GeofenceAlerts    int64 `json:"geofence_alerts"`
}

func NewGPSStreamingService() *GPSStreamingService {
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	var rdb *redis.Client
	redisOK := false
	opts, err := redis.ParseURL(redisURL)
	if err == nil {
		rdb = redis.NewClient(opts)
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if rdb.Ping(ctx).Err() == nil {
			redisOK = true
			log.Printf("[GPSStream] Redis connected")
		}
	}

	return &GPSStreamingService{
		redis:       rdb,
		redisOK:     redisOK,
		subscribers: make(map[int]map[*websocket.Conn]bool),
		driverConns: make(map[int]*websocket.Conn),
		positions:   make(map[int][]Position),
		destinations: make(map[int]Destination),
	}
}

// Haversine distance in meters
func haversine(lat1, lng1, lat2, lng2 float64) float64 {
	const R = 6371000.0
	toRad := func(d float64) float64 { return d * math.Pi / 180.0 }
	dLat := toRad(lat2 - lat1)
	dLng := toRad(lng2 - lng1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*
			math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * R * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func (s *GPSStreamingService) processPosition(pos Position) {
	s.mu.Lock()
	s.stats.PositionsRecv++

	// Store in history buffer
	if pos.DeliveryID > 0 {
		history := s.positions[pos.DeliveryID]
		history = append(history, pos)
		if len(history) > positionHistoryN {
			history = history[len(history)-positionHistoryN:]
		}
		s.positions[pos.DeliveryID] = history
	}
	s.mu.Unlock()

	// Persist to Redis
	if s.redisOK && pos.DeliveryID > 0 {
		ctx := context.Background()
		data, _ := json.Marshal(pos)
		key := fmt.Sprintf("gps:delivery:%d:latest", pos.DeliveryID)
		s.redis.Set(ctx, key, data, 24*time.Hour)

		histKey := fmt.Sprintf("gps:delivery:%d:history", pos.DeliveryID)
		s.redis.LPush(ctx, histKey, data)
		s.redis.LTrim(ctx, histKey, 0, positionHistoryN-1)
		s.redis.Expire(ctx, histKey, 24*time.Hour)
	}

	// Calculate ETA if destination known
	var eta *ETAInfo
	s.mu.RLock()
	if dest, ok := s.destinations[pos.DeliveryID]; ok && pos.DeliveryID > 0 {
		dist := haversine(pos.Latitude, pos.Longitude, dest.Latitude, dest.Longitude)
		speedKmh := pos.Speed * 3.6 // m/s to km/h
		if speedKmh < 5 { speedKmh = 20 } // default to 20 km/h if stationary
		eta = &ETAInfo{
			DistanceM:   dist,
			EstMinutes:  (dist / 1000.0) / speedKmh * 60.0,
			AvgSpeedKmh: speedKmh,
		}
	}
	s.mu.RUnlock()

	// Check geofence
	var geofence *GeofenceAlert
	if eta != nil && eta.DistanceM <= geofenceRadiusM {
		geofence = &GeofenceAlert{
			DeliveryID: pos.DeliveryID,
			DistanceM:  eta.DistanceM,
			Message:    fmt.Sprintf("Driver is %.0fm away from delivery location", eta.DistanceM),
		}
		s.mu.Lock()
		s.stats.GeofenceAlerts++
		s.mu.Unlock()
	}

	// Broadcast to subscribers
	update := TrackingUpdate{
		Type:     "position",
		Position: &pos,
		ETA:      eta,
		Geofence: geofence,
	}
	s.broadcast(pos.DeliveryID, update)
}

func (s *GPSStreamingService) broadcast(deliveryID int, update TrackingUpdate) {
	s.mu.RLock()
	subs := s.subscribers[deliveryID]
	s.mu.RUnlock()

	if len(subs) == 0 {
		return
	}

	data, err := json.Marshal(update)
	if err != nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for conn := range subs {
		conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			conn.Close()
			delete(subs, conn)
		} else {
			s.stats.PositionsBcast++
		}
	}
}

// HandleDriverWS handles WebSocket connections from drivers
func (s *GPSStreamingService) HandleDriverWS(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	driverID, _ := strconv.Atoi(vars["id"])

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[GPSStream] Driver WS upgrade error: %v", err)
		return
	}

	s.mu.Lock()
	s.driverConns[driverID] = conn
	s.stats.ActiveDrivers++
	s.mu.Unlock()

	log.Printf("[GPSStream] Driver %d connected via WebSocket", driverID)

	defer func() {
		s.mu.Lock()
		delete(s.driverConns, driverID)
		s.stats.ActiveDrivers--
		s.mu.Unlock()
		conn.Close()
	}()

	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var pos Position
		if err := json.Unmarshal(msg, &pos); err != nil {
			continue
		}
		pos.DriverID = driverID
		if pos.Timestamp == "" {
			pos.Timestamp = time.Now().UTC().Format(time.RFC3339)
		}

		s.processPosition(pos)
	}
}

// HandleTrackWS handles WebSocket connections from buyers tracking deliveries
func (s *GPSStreamingService) HandleTrackWS(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	deliveryID, _ := strconv.Atoi(vars["delivery_id"])

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[GPSStream] Track WS upgrade error: %v", err)
		return
	}

	s.mu.Lock()
	if s.subscribers[deliveryID] == nil {
		s.subscribers[deliveryID] = make(map[*websocket.Conn]bool)
	}
	s.subscribers[deliveryID][conn] = true
	s.stats.ActiveSubscribers++
	s.mu.Unlock()

	log.Printf("[GPSStream] Subscriber connected for delivery %d", deliveryID)

	// Send position history on connect
	s.mu.RLock()
	history := s.positions[deliveryID]
	s.mu.RUnlock()

	if len(history) > 0 {
		historyUpdate := map[string]interface{}{
			"type":    "history",
			"positions": history,
		}
		data, _ := json.Marshal(historyUpdate)
		conn.WriteMessage(websocket.TextMessage, data)
	}

	defer func() {
		s.mu.Lock()
		if subs, ok := s.subscribers[deliveryID]; ok {
			delete(subs, conn)
			if len(subs) == 0 {
				delete(s.subscribers, deliveryID)
			}
		}
		s.stats.ActiveSubscribers--
		s.mu.Unlock()
		conn.Close()
	}()

	// Keep connection alive with ping/pong
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	go func() {
		for range ticker.C {
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}()

	// Read loop (subscribers mostly listen, but can send destination updates)
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var cmd map[string]interface{}
		if json.Unmarshal(msg, &cmd) == nil {
			if cmd["type"] == "set_destination" {
				lat, _ := cmd["latitude"].(float64)
				lng, _ := cmd["longitude"].(float64)
				if lat != 0 && lng != 0 {
					s.mu.Lock()
					s.destinations[deliveryID] = Destination{Latitude: lat, Longitude: lng}
					s.mu.Unlock()
				}
			}
		}
	}
}

// HandlePositionUpdate handles REST GPS position updates from drivers
func (s *GPSStreamingService) HandlePositionUpdate(w http.ResponseWriter, r *http.Request) {
	var pos Position
	if err := json.NewDecoder(r.Body).Decode(&pos); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}

	if pos.Timestamp == "" {
		pos.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}

	s.processPosition(pos)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// HandleSetDestination sets the delivery destination for geofence/ETA
func (s *GPSStreamingService) HandleSetDestination(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	deliveryID, _ := strconv.Atoi(vars["delivery_id"])

	var dest Destination
	if err := json.NewDecoder(r.Body).Decode(&dest); err != nil {
		http.Error(w, `{"error":"invalid JSON"}`, http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	s.destinations[deliveryID] = dest
	s.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "destination_set"})
}

// HandleGetHistory returns position history for a delivery
func (s *GPSStreamingService) HandleGetHistory(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	deliveryID, _ := strconv.Atoi(vars["delivery_id"])

	s.mu.RLock()
	history := s.positions[deliveryID]
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"delivery_id": deliveryID,
		"positions":   history,
		"count":       len(history),
	})
}

func (s *GPSStreamingService) HandleStats(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	stats := s.stats
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (s *GPSStreamingService) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "healthy",
		"service": "gps-streaming",
		"redis":   s.redisOK,
		"features": []string{
			"websocket-driver-tracking",
			"websocket-buyer-subscription",
			"rest-position-update",
			"geofence-alerts",
			"eta-calculation",
			"position-history",
		},
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	port := os.Getenv("GPS_STREAMING_PORT")
	if port == "" {
		port = defaultPort
	}

	svc := NewGPSStreamingService()

	r := mux.NewRouter()
	r.Use(corsMiddleware)

	// WebSocket endpoints
	r.HandleFunc("/ws/driver/{id}", svc.HandleDriverWS)
	r.HandleFunc("/ws/track/{delivery_id}", svc.HandleTrackWS)

	// REST endpoints
	r.HandleFunc("/gps/update", svc.HandlePositionUpdate).Methods("POST")
	r.HandleFunc("/gps/destination/{delivery_id}", svc.HandleSetDestination).Methods("POST")
	r.HandleFunc("/gps/history/{delivery_id}", svc.HandleGetHistory).Methods("GET")
	r.HandleFunc("/gps/stats", svc.HandleStats).Methods("GET")
	r.HandleFunc("/health", svc.HandleHealth).Methods("GET")

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("[GPSStream] Starting WebSocket GPS streaming on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[GPSStream] Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[GPSStream] Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}
