// Supply Chain Tracking & Provenance Service
// Tracks produce from farm-to-market, certifications, cold chain handoffs, warehouse inventory
// Port: 8099
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

type Config struct {
	Port        string
	DatabaseURL string
	KafkaBroker string
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loadConfig() Config {
	return Config{
		Port:        getEnv("PORT", "8099"),
		DatabaseURL: getEnv("DATABASE_URL", "postgres://localhost:5432/farmerdb"),
		KafkaBroker: getEnv("KAFKA_BROKER", "localhost:9092"),
	}
}

// ShipmentStatus tracks produce movement from farm to market
type ShipmentStatus string

const (
	StatusCreated    ShipmentStatus = "created"
	StatusPickedUp   ShipmentStatus = "picked_up"
	StatusInTransit  ShipmentStatus = "in_transit"
	StatusAtWarehouse ShipmentStatus = "at_warehouse"
	StatusDelivered  ShipmentStatus = "delivered"
)

// Shipment represents a produce shipment through the supply chain
type Shipment struct {
	ID              string         `json:"id"`
	OrderID         string         `json:"orderId"`
	FarmerID        int            `json:"farmerId"`
	BuyerID         int            `json:"buyerId"`
	ProduceType     string         `json:"produceType"`
	QuantityKg      float64        `json:"quantityKg"`
	Status          ShipmentStatus `json:"status"`
	Origin          GeoPoint       `json:"origin"`
	Destination     GeoPoint       `json:"destination"`
	CurrentLocation GeoPoint       `json:"currentLocation"`
	PickupTime      *time.Time     `json:"pickupTime,omitempty"`
	DeliveryTime    *time.Time     `json:"deliveryTime,omitempty"`
	Temperature     float64        `json:"temperature"`
	Checkpoints     []Checkpoint   `json:"checkpoints"`
	CreatedAt       time.Time      `json:"createdAt"`
}

type GeoPoint struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type Checkpoint struct {
	Location  GeoPoint  `json:"location"`
	Timestamp time.Time `json:"timestamp"`
	Status    string    `json:"status"`
	Handler   string    `json:"handler"`
	Notes     string    `json:"notes,omitempty"`
}

// ProvenanceRecord tracks certifications and quality checks
type ProvenanceRecord struct {
	ShipmentID     string    `json:"shipmentId"`
	CertificationType string `json:"certificationType"`
	IssuedBy       string    `json:"issuedBy"`
	IssuedAt       time.Time `json:"issuedAt"`
	ExpiresAt      time.Time `json:"expiresAt"`
	Details        map[string]interface{} `json:"details"`
}

// WarehouseInventory tracks produce stored at aggregation points
type WarehouseInventory struct {
	WarehouseID string    `json:"warehouseId"`
	ProduceType string    `json:"produceType"`
	QuantityKg  float64   `json:"quantityKg"`
	Grade       string    `json:"grade"`
	ReceivedAt  time.Time `json:"receivedAt"`
	ExpiresAt   time.Time `json:"expiresAt"`
}

// SupplyChainStore provides thread-safe in-memory storage
type SupplyChainStore struct {
	mu          sync.RWMutex
	shipments   map[string]*Shipment
	provenance  []ProvenanceRecord
	inventory   map[string][]WarehouseInventory
}

func NewSupplyChainStore() *SupplyChainStore {
	return &SupplyChainStore{
		shipments:  make(map[string]*Shipment),
		provenance: []ProvenanceRecord{},
		inventory:  make(map[string][]WarehouseInventory),
	}
}

func (s *SupplyChainStore) CreateShipment(shipment *Shipment) {
	s.mu.Lock()
	defer s.mu.Unlock()
	shipment.CreatedAt = time.Now()
	shipment.Status = StatusCreated
	s.shipments[shipment.ID] = shipment
}

func (s *SupplyChainStore) GetShipment(id string) *Shipment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.shipments[id]
}

func (s *SupplyChainStore) UpdateStatus(id string, status ShipmentStatus, location GeoPoint) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	ship, ok := s.shipments[id]
	if !ok {
		return false
	}
	ship.Status = status
	ship.CurrentLocation = location
	ship.Checkpoints = append(ship.Checkpoints, Checkpoint{
		Location:  location,
		Timestamp: time.Now(),
		Status:    string(status),
	})
	if status == StatusDelivered {
		now := time.Now()
		ship.DeliveryTime = &now
	}
	return true
}

func (s *SupplyChainStore) ListShipments() []*Shipment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]*Shipment, 0, len(s.shipments))
	for _, ship := range s.shipments {
		result = append(result, ship)
	}
	return result
}

func (s *SupplyChainStore) AddProvenance(record ProvenanceRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.provenance = append(s.provenance, record)
}

func (s *SupplyChainStore) GetProvenance(shipmentID string) []ProvenanceRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := []ProvenanceRecord{}
	for _, r := range s.provenance {
		if r.ShipmentID == shipmentID {
			result = append(result, r)
		}
	}
	return result
}

func (s *SupplyChainStore) AddInventory(warehouseID string, inv WarehouseInventory) {
	s.mu.Lock()
	defer s.mu.Unlock()
	inv.WarehouseID = warehouseID
	inv.ReceivedAt = time.Now()
	s.inventory[warehouseID] = append(s.inventory[warehouseID], inv)
}

func (s *SupplyChainStore) GetInventory(warehouseID string) []WarehouseInventory {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.inventory[warehouseID]
}

func main() {
	cfg := loadConfig()
	store := NewSupplyChainStore()

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "ok",
			"service": "supply-chain-service",
			"version": "1.0.0",
			"uptime":  time.Since(time.Now()).String(),
		})
	})

	mux.HandleFunc("/api/shipments", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodGet:
			json.NewEncoder(w).Encode(store.ListShipments())
		case http.MethodPost:
			var ship Shipment
			if err := json.NewDecoder(r.Body).Decode(&ship); err != nil {
				http.Error(w, `{"error":"invalid_json"}`, http.StatusBadRequest)
				return
			}
			store.CreateShipment(&ship)
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(ship)
		default:
			http.Error(w, `{"error":"method_not_allowed"}`, http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/shipments/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		id := r.URL.Path[len("/api/shipments/"):]
		if id == "" {
			http.Error(w, `{"error":"missing_id"}`, http.StatusBadRequest)
			return
		}
		ship := store.GetShipment(id)
		if ship == nil {
			http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(ship)
	})

	mux.HandleFunc("/api/provenance", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		shipmentID := r.URL.Query().Get("shipmentId")
		if shipmentID == "" {
			http.Error(w, `{"error":"missing_shipment_id"}`, http.StatusBadRequest)
			return
		}
		records := store.GetProvenance(shipmentID)
		json.NewEncoder(w).Encode(records)
	})

	mux.HandleFunc("/api/inventory/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		warehouseID := r.URL.Path[len("/api/inventory/"):]
		if warehouseID == "" {
			http.Error(w, `{"error":"missing_warehouse_id"}`, http.StatusBadRequest)
			return
		}
		inv := store.GetInventory(warehouseID)
		json.NewEncoder(w).Encode(inv)
	})

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("[SupplyChain] Server starting on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("[SupplyChain] Server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	log.Println("[SupplyChain] Shutting down gracefully...")
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("[SupplyChain] Forced shutdown: %v", err)
	}
	log.Println("[SupplyChain] Server stopped")
}
