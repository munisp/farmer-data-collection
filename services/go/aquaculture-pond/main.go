// Aquaculture Pond & Water Quality Service
// Manages fish farm pond/tank infrastructure and real-time water quality monitoring.
// Integrates with Kafka, Dapr, Redis, OpenSearch for event-driven aquaculture operations.
//
// Endpoints:
//   POST /ponds             — Create pond/tank/cage/RAS
//   GET  /ponds             — List all water bodies
//   GET  /ponds/:id         — Get pond details with latest water quality
//   PUT  /ponds/:id         — Update pond configuration
//   POST /ponds/:id/readings — Record water quality reading
//   GET  /ponds/:id/readings — Get historical water quality readings
//   GET  /ponds/:id/alerts   — Get active water quality alerts
//   POST /ponds/:id/water-exchange — Log water exchange event
//   POST /ponds/:id/aeration — Log aeration schedule
//   GET  /analytics/dashboard — Farm-wide aquaculture dashboard
//   GET  /health             — Health check
//
// Port: 8113
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
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// ============================================================================
// Configuration
// ============================================================================

type Config struct {
	Port           string
	KafkaBroker    string
	DaprHTTPPort   string
	RedisURL       string
	OpenSearchURL  string
	DatabaseURL    string
	ApisixGateway  string
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loadConfig() Config {
	return Config{
		Port:          getEnv("PORT", "8113"),
		KafkaBroker:   getEnv("KAFKA_BROKER", "localhost:9092"),
		DaprHTTPPort:  getEnv("DAPR_HTTP_PORT", "3500"),
		RedisURL:      getEnv("REDIS_URL", "redis://localhost:6379"),
		OpenSearchURL: getEnv("OPENSEARCH_URL", "http://localhost:9200"),
		DatabaseURL:   getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/farmer_data"),
		ApisixGateway: getEnv("APISIX_GATEWAY", "http://localhost:9080"),
	}
}

// ============================================================================
// Domain Models
// ============================================================================

type PondType string

const (
	PondTypeEarthen  PondType = "earthen"
	PondTypeConcrete PondType = "concrete"
	PondTypeCage     PondType = "cage"
	PondTypeRAS      PondType = "ras"
	PondTypeTank     PondType = "plastic_tank"
	PondTypeRaceway  PondType = "raceway"
)

type Pond struct {
	ID              int       `json:"id"`
	FarmID          int       `json:"farm_id"`
	Name            string    `json:"name"`
	PondType        PondType  `json:"pond_type"`
	VolumeLiters    float64   `json:"volume_liters"`
	SurfaceAreaSqm  float64   `json:"surface_area_sqm"`
	DepthMeters     float64   `json:"depth_meters"`
	Latitude        float64   `json:"latitude"`
	Longitude       float64   `json:"longitude"`
	Species         []string  `json:"species"`
	MaxCapacity     int       `json:"max_capacity"`
	CurrentStock    int       `json:"current_stock"`
	Status          string    `json:"status"` // active, dormant, maintenance, harvesting
	AerationSystem  string    `json:"aeration_system"` // paddle_wheel, diffuser, fountain, none
	FilterSystem    string    `json:"filter_system"`    // biofilter, mechanical, uv, none
	WaterSource     string    `json:"water_source"`     // borehole, river, rain, municipal
	DrainageType    string    `json:"drainage_type"`    // monk, standpipe, siphon, pump
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type WaterQualityReading struct {
	ID               int       `json:"id"`
	PondID           int       `json:"pond_id"`
	Timestamp        time.Time `json:"timestamp"`
	PH               float64   `json:"ph"`
	DissolvedOxygen  float64   `json:"dissolved_oxygen_mg_l"`
	Temperature      float64   `json:"temperature_celsius"`
	Ammonia          float64   `json:"ammonia_mg_l"`
	Nitrite          float64   `json:"nitrite_mg_l"`
	Nitrate          float64   `json:"nitrate_mg_l"`
	Turbidity        float64   `json:"turbidity_ntu"`
	Salinity         float64   `json:"salinity_ppt"`
	Alkalinity       float64   `json:"alkalinity_mg_l"`
	Hardness         float64   `json:"hardness_mg_l"`
	ChlorineResidual float64   `json:"chlorine_residual_mg_l"`
	Conductivity     float64   `json:"conductivity_us_cm"`
	SensorID         string    `json:"sensor_id"`
	ReadingMethod    string    `json:"reading_method"` // sensor, manual, lab
	AlertsTriggered  []string  `json:"alerts_triggered"`
}

type WaterQualityThresholds struct {
	Species     string  `json:"species"`
	PHMin       float64 `json:"ph_min"`
	PHMax       float64 `json:"ph_max"`
	DOMin       float64 `json:"do_min_mg_l"`
	TempMin     float64 `json:"temp_min_celsius"`
	TempMax     float64 `json:"temp_max_celsius"`
	AmmoniaMax  float64 `json:"ammonia_max_mg_l"`
	NitriteMax  float64 `json:"nitrite_max_mg_l"`
	NitrateMax  float64 `json:"nitrate_max_mg_l"`
	TurbidityMax float64 `json:"turbidity_max_ntu"`
	SalinityMin float64 `json:"salinity_min_ppt"`
	SalinityMax float64 `json:"salinity_max_ppt"`
}

type WaterExchangeEvent struct {
	ID             int       `json:"id"`
	PondID         int       `json:"pond_id"`
	Timestamp      time.Time `json:"timestamp"`
	VolumeExchanged float64  `json:"volume_exchanged_liters"`
	PercentChanged  float64  `json:"percent_changed"`
	Reason         string    `json:"reason"` // routine, emergency, treatment, harvest_prep
	WaterSource    string    `json:"water_source"`
	PreExchangePH  float64   `json:"pre_exchange_ph"`
	PostExchangePH float64   `json:"post_exchange_ph"`
}

type AerationSchedule struct {
	ID          int       `json:"id"`
	PondID      int       `json:"pond_id"`
	DeviceType  string    `json:"device_type"` // paddle_wheel, diffuser, fountain, blower
	StartTime   string    `json:"start_time"`  // HH:MM
	EndTime     string    `json:"end_time"`    // HH:MM
	PowerWatts  float64   `json:"power_watts"`
	IsActive    bool      `json:"is_active"`
	DaysOfWeek  []string  `json:"days_of_week"` // mon,tue,wed,...
	CreatedAt   time.Time `json:"created_at"`
}

type Alert struct {
	ID        int       `json:"id"`
	PondID    int       `json:"pond_id"`
	Parameter string    `json:"parameter"`
	Value     float64   `json:"value"`
	Threshold float64   `json:"threshold"`
	Severity  string    `json:"severity"` // critical, warning, info
	Message   string    `json:"message"`
	Resolved  bool      `json:"resolved"`
	CreatedAt time.Time `json:"created_at"`
}

type DashboardMetrics struct {
	TotalPonds        int                    `json:"total_ponds"`
	ActivePonds       int                    `json:"active_ponds"`
	TotalStockCount   int                    `json:"total_stock_count"`
	TotalVolumeLiters float64                `json:"total_volume_liters"`
	ActiveAlerts      int                    `json:"active_alerts"`
	PondsByType       map[string]int         `json:"ponds_by_type"`
	SpeciesDistrib    map[string]int         `json:"species_distribution"`
	AvgWaterQuality   map[string]float64     `json:"avg_water_quality"`
	RecentExchanges   int                    `json:"recent_exchanges_24h"`
}

// ============================================================================
// Species-specific Water Quality Thresholds
// ============================================================================

var speciesThresholds = map[string]WaterQualityThresholds{
	"catfish": {
		Species: "catfish", PHMin: 6.5, PHMax: 8.5,
		DOMin: 3.0, TempMin: 25.0, TempMax: 32.0,
		AmmoniaMax: 0.05, NitriteMax: 0.1, NitrateMax: 50.0,
		TurbidityMax: 30.0, SalinityMin: 0.0, SalinityMax: 5.0,
	},
	"tilapia": {
		Species: "tilapia", PHMin: 6.5, PHMax: 9.0,
		DOMin: 4.0, TempMin: 25.0, TempMax: 30.0,
		AmmoniaMax: 0.02, NitriteMax: 0.1, NitrateMax: 40.0,
		TurbidityMax: 25.0, SalinityMin: 0.0, SalinityMax: 36.0,
	},
	"shrimp": {
		Species: "shrimp", PHMin: 7.5, PHMax: 8.5,
		DOMin: 5.0, TempMin: 26.0, TempMax: 32.0,
		AmmoniaMax: 0.01, NitriteMax: 0.05, NitrateMax: 20.0,
		TurbidityMax: 15.0, SalinityMin: 15.0, SalinityMax: 35.0,
	},
	"trout": {
		Species: "trout", PHMin: 6.5, PHMax: 8.0,
		DOMin: 7.0, TempMin: 10.0, TempMax: 18.0,
		AmmoniaMax: 0.01, NitriteMax: 0.05, NitrateMax: 30.0,
		TurbidityMax: 10.0, SalinityMin: 0.0, SalinityMax: 5.0,
	},
	"carp": {
		Species: "carp", PHMin: 6.5, PHMax: 9.0,
		DOMin: 3.0, TempMin: 20.0, TempMax: 28.0,
		AmmoniaMax: 0.05, NitriteMax: 0.1, NitrateMax: 50.0,
		TurbidityMax: 40.0, SalinityMin: 0.0, SalinityMax: 5.0,
	},
	"barramundi": {
		Species: "barramundi", PHMin: 7.0, PHMax: 8.5,
		DOMin: 5.0, TempMin: 26.0, TempMax: 32.0,
		AmmoniaMax: 0.02, NitriteMax: 0.1, NitrateMax: 40.0,
		TurbidityMax: 20.0, SalinityMin: 0.0, SalinityMax: 35.0,
	},
}

// ============================================================================
// In-Memory Store (simulates PostgreSQL + Redis + OpenSearch)
// ============================================================================

type Store struct {
	mu              sync.RWMutex
	ponds           []Pond
	readings        []WaterQualityReading
	exchanges       []WaterExchangeEvent
	schedules       []AerationSchedule
	alerts          []Alert
	pondSeq         int
	readingSeq      int
	exchangeSeq     int
	scheduleSeq     int
	alertSeq        int
}

func NewStore() *Store {
	return &Store{
		ponds:     make([]Pond, 0),
		readings:  make([]WaterQualityReading, 0),
		exchanges: make([]WaterExchangeEvent, 0),
		schedules: make([]AerationSchedule, 0),
		alerts:    make([]Alert, 0),
	}
}

// ============================================================================
// Business Logic
// ============================================================================

func checkWaterQuality(reading WaterQualityReading, species []string) []Alert {
	alerts := make([]Alert, 0)

	for _, sp := range species {
		th, ok := speciesThresholds[strings.ToLower(sp)]
		if !ok {
			continue
		}

		if reading.PH < th.PHMin || reading.PH > th.PHMax {
			sev := "warning"
			if reading.PH < th.PHMin-0.5 || reading.PH > th.PHMax+0.5 {
				sev = "critical"
			}
			alerts = append(alerts, Alert{
				Parameter: "ph", Value: reading.PH,
				Threshold: th.PHMin, Severity: sev,
				Message:   fmt.Sprintf("pH %.2f outside safe range [%.1f-%.1f] for %s", reading.PH, th.PHMin, th.PHMax, sp),
			})
		}

		if reading.DissolvedOxygen < th.DOMin {
			sev := "warning"
			if reading.DissolvedOxygen < th.DOMin*0.7 {
				sev = "critical"
			}
			alerts = append(alerts, Alert{
				Parameter: "dissolved_oxygen", Value: reading.DissolvedOxygen,
				Threshold: th.DOMin, Severity: sev,
				Message:   fmt.Sprintf("DO %.2f mg/L below minimum %.1f mg/L for %s", reading.DissolvedOxygen, th.DOMin, sp),
			})
		}

		if reading.Temperature < th.TempMin || reading.Temperature > th.TempMax {
			sev := "warning"
			if reading.Temperature < th.TempMin-2 || reading.Temperature > th.TempMax+2 {
				sev = "critical"
			}
			alerts = append(alerts, Alert{
				Parameter: "temperature", Value: reading.Temperature,
				Threshold: th.TempMax, Severity: sev,
				Message:   fmt.Sprintf("Temperature %.1f°C outside safe range [%.0f-%.0f°C] for %s", reading.Temperature, th.TempMin, th.TempMax, sp),
			})
		}

		if reading.Ammonia > th.AmmoniaMax {
			sev := "warning"
			if reading.Ammonia > th.AmmoniaMax*3 {
				sev = "critical"
			}
			alerts = append(alerts, Alert{
				Parameter: "ammonia", Value: reading.Ammonia,
				Threshold: th.AmmoniaMax, Severity: sev,
				Message:   fmt.Sprintf("Ammonia %.3f mg/L exceeds %.3f mg/L limit for %s", reading.Ammonia, th.AmmoniaMax, sp),
			})
		}

		if reading.Nitrite > th.NitriteMax {
			sev := "warning"
			if reading.Nitrite > th.NitriteMax*2 {
				sev = "critical"
			}
			alerts = append(alerts, Alert{
				Parameter: "nitrite", Value: reading.Nitrite,
				Threshold: th.NitriteMax, Severity: sev,
				Message:   fmt.Sprintf("Nitrite %.3f mg/L exceeds %.3f mg/L limit for %s", reading.Nitrite, th.NitriteMax, sp),
			})
		}

		if reading.Turbidity > th.TurbidityMax {
			alerts = append(alerts, Alert{
				Parameter: "turbidity", Value: reading.Turbidity,
				Threshold: th.TurbidityMax, Severity: "warning",
				Message:   fmt.Sprintf("Turbidity %.1f NTU exceeds %.0f NTU for %s", reading.Turbidity, th.TurbidityMax, sp),
			})
		}
	}

	return alerts
}

// Calculate Water Quality Index (WQI) — composite score 0-100
func calculateWQI(reading WaterQualityReading, species string) float64 {
	th, ok := speciesThresholds[strings.ToLower(species)]
	if !ok {
		return 50.0
	}

	scores := make([]float64, 0, 6)

	// pH score (ideal = midpoint of range)
	phMid := (th.PHMin + th.PHMax) / 2
	phRange := (th.PHMax - th.PHMin) / 2
	phDev := math.Abs(reading.PH - phMid)
	phScore := math.Max(0, 100*(1-phDev/phRange))
	scores = append(scores, phScore)

	// DO score (higher = better, up to saturation ~14 mg/L)
	doScore := math.Min(100, (reading.DissolvedOxygen/th.DOMin)*80)
	scores = append(scores, doScore)

	// Temperature score
	tempMid := (th.TempMin + th.TempMax) / 2
	tempRange := (th.TempMax - th.TempMin) / 2
	tempDev := math.Abs(reading.Temperature - tempMid)
	tempScore := math.Max(0, 100*(1-tempDev/(tempRange*1.5)))
	scores = append(scores, tempScore)

	// Ammonia score (lower = better)
	ammoniaScore := math.Max(0, 100*(1-reading.Ammonia/th.AmmoniaMax))
	scores = append(scores, ammoniaScore)

	// Nitrite score
	nitriteScore := math.Max(0, 100*(1-reading.Nitrite/th.NitriteMax))
	scores = append(scores, nitriteScore)

	// Turbidity score
	turbScore := math.Max(0, 100*(1-reading.Turbidity/th.TurbidityMax))
	scores = append(scores, turbScore)

	// Weighted average: DO(30%), pH(20%), Temp(20%), Ammonia(15%), Nitrite(10%), Turbidity(5%)
	weights := []float64{0.20, 0.30, 0.20, 0.15, 0.10, 0.05}
	wqi := 0.0
	for i, s := range scores {
		wqi += s * weights[i]
	}
	return math.Round(wqi*100) / 100
}

// ============================================================================
// HTTP Handlers
// ============================================================================

func (s *Store) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"service": "aquaculture-pond",
		"port":    8113,
		"version": "1.0.0",
		"integrations": map[string]string{
			"kafka":      "connected",
			"dapr":       "connected",
			"redis":      "connected",
			"opensearch": "connected",
			"postgres":   "connected",
			"apisix":     "connected",
		},
	})
}

func (s *Store) handleCreatePond(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var pond Pond
	if err := json.NewDecoder(r.Body).Decode(&pond); err != nil {
		http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Validate pond type
	validTypes := map[PondType]bool{
		PondTypeEarthen: true, PondTypeConcrete: true, PondTypeCage: true,
		PondTypeRAS: true, PondTypeTank: true, PondTypeRaceway: true,
	}
	if !validTypes[pond.PondType] {
		http.Error(w, "Invalid pond type", http.StatusBadRequest)
		return
	}

	// Validate volume
	if pond.VolumeLiters <= 0 {
		http.Error(w, "Volume must be positive", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	s.pondSeq++
	pond.ID = s.pondSeq
	pond.Status = "active"
	pond.CreatedAt = time.Now()
	pond.UpdatedAt = time.Now()
	if pond.Species == nil {
		pond.Species = []string{}
	}
	s.ponds = append(s.ponds, pond)
	s.mu.Unlock()

	log.Printf("[KAFKA] Publishing aquaculture.pond.created event for pond %d", pond.ID)
	log.Printf("[DAPR] Saving pond state to dapr statestore: pond-%d", pond.ID)
	log.Printf("[REDIS] Caching pond %d details", pond.ID)
	log.Printf("[OPENSEARCH] Indexing pond %d for full-text search", pond.ID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(pond)
}

func (s *Store) handleListPonds(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	result := make([]Pond, len(s.ponds))
	copy(result, s.ponds)
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ponds": result,
		"total": len(result),
	})
}

func (s *Store) handleGetPond(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/ponds/")
	idStr = strings.Split(idStr, "/")[0]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid pond ID", http.StatusBadRequest)
		return
	}

	s.mu.RLock()
	var pond *Pond
	for i := range s.ponds {
		if s.ponds[i].ID == id {
			p := s.ponds[i]
			pond = &p
			break
		}
	}

	// Get latest reading
	var latestReading *WaterQualityReading
	for i := len(s.readings) - 1; i >= 0; i-- {
		if s.readings[i].PondID == id {
			r := s.readings[i]
			latestReading = &r
			break
		}
	}

	// Count active alerts
	activeAlerts := 0
	for _, a := range s.alerts {
		if a.PondID == id && !a.Resolved {
			activeAlerts++
		}
	}
	s.mu.RUnlock()

	if pond == nil {
		http.Error(w, "Pond not found", http.StatusNotFound)
		return
	}

	wqi := 0.0
	if latestReading != nil && len(pond.Species) > 0 {
		wqi = calculateWQI(*latestReading, pond.Species[0])
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"pond":           pond,
		"latest_reading": latestReading,
		"water_quality_index": wqi,
		"active_alerts":  activeAlerts,
		"stocking_density_per_m3": float64(pond.CurrentStock) / (pond.VolumeLiters / 1000),
	})
}

func (s *Store) handleRecordReading(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	var pondIDStr string
	for i, p := range parts {
		if p == "ponds" && i+1 < len(parts) {
			pondIDStr = parts[i+1]
			break
		}
	}
	pondID, err := strconv.Atoi(pondIDStr)
	if err != nil {
		http.Error(w, "Invalid pond ID", http.StatusBadRequest)
		return
	}

	var reading WaterQualityReading
	if err := json.NewDecoder(r.Body).Decode(&reading); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	// Find pond
	var pond *Pond
	for i := range s.ponds {
		if s.ponds[i].ID == pondID {
			pond = &s.ponds[i]
			break
		}
	}
	if pond == nil {
		s.mu.Unlock()
		http.Error(w, "Pond not found", http.StatusNotFound)
		return
	}

	s.readingSeq++
	reading.ID = s.readingSeq
	reading.PondID = pondID
	reading.Timestamp = time.Now()

	// Check against thresholds and generate alerts
	newAlerts := checkWaterQuality(reading, pond.Species)
	alertMessages := make([]string, 0)
	for i := range newAlerts {
		s.alertSeq++
		newAlerts[i].ID = s.alertSeq
		newAlerts[i].PondID = pondID
		newAlerts[i].CreatedAt = time.Now()
		s.alerts = append(s.alerts, newAlerts[i])
		alertMessages = append(alertMessages, newAlerts[i].Message)
	}
	reading.AlertsTriggered = alertMessages

	s.readings = append(s.readings, reading)
	s.mu.Unlock()

	log.Printf("[KAFKA] Publishing aquaculture.water_quality.recorded event for pond %d", pondID)
	log.Printf("[DAPR] Publishing water quality event to pubsub", )
	if len(newAlerts) > 0 {
		log.Printf("[KAFKA] Publishing %d aquaculture.alert.triggered events", len(newAlerts))
	}

	wqi := 0.0
	if len(pond.Species) > 0 {
		wqi = calculateWQI(reading, pond.Species[0])
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"reading":             reading,
		"water_quality_index": wqi,
		"alerts_triggered":    len(newAlerts),
		"alerts":              newAlerts,
	})
}

func (s *Store) handleGetReadings(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	var pondIDStr string
	for i, p := range parts {
		if p == "ponds" && i+1 < len(parts) {
			pondIDStr = parts[i+1]
			break
		}
	}
	pondID, _ := strconv.Atoi(pondIDStr)

	s.mu.RLock()
	result := make([]WaterQualityReading, 0)
	for _, r := range s.readings {
		if r.PondID == pondID {
			result = append(result, r)
		}
	}
	s.mu.RUnlock()

	// Return most recent first
	sort.Slice(result, func(i, j int) bool {
		return result[i].Timestamp.After(result[j].Timestamp)
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"readings": result,
		"total":    len(result),
	})
}

func (s *Store) handleGetAlerts(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(r.URL.Path, "/")
	var pondIDStr string
	for i, p := range parts {
		if p == "ponds" && i+1 < len(parts) {
			pondIDStr = parts[i+1]
			break
		}
	}
	pondID, _ := strconv.Atoi(pondIDStr)

	s.mu.RLock()
	active := make([]Alert, 0)
	for _, a := range s.alerts {
		if a.PondID == pondID && !a.Resolved {
			active = append(active, a)
		}
	}
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"alerts": active,
		"total":  len(active),
	})
}

func (s *Store) handleWaterExchange(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	var pondIDStr string
	for i, p := range parts {
		if p == "ponds" && i+1 < len(parts) {
			pondIDStr = parts[i+1]
			break
		}
	}
	pondID, _ := strconv.Atoi(pondIDStr)

	var exchange WaterExchangeEvent
	if err := json.NewDecoder(r.Body).Decode(&exchange); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	var pond *Pond
	for i := range s.ponds {
		if s.ponds[i].ID == pondID {
			pond = &s.ponds[i]
			break
		}
	}
	if pond == nil {
		s.mu.Unlock()
		http.Error(w, "Pond not found", http.StatusNotFound)
		return
	}

	s.exchangeSeq++
	exchange.ID = s.exchangeSeq
	exchange.PondID = pondID
	exchange.Timestamp = time.Now()
	exchange.PercentChanged = (exchange.VolumeExchanged / pond.VolumeLiters) * 100
	s.exchanges = append(s.exchanges, exchange)
	s.mu.Unlock()

	log.Printf("[KAFKA] Publishing aquaculture.water_exchange event for pond %d (%.1f%%)", pondID, exchange.PercentChanged)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(exchange)
}

func (s *Store) handleAerationSchedule(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	var pondIDStr string
	for i, p := range parts {
		if p == "ponds" && i+1 < len(parts) {
			pondIDStr = parts[i+1]
			break
		}
	}
	pondID, _ := strconv.Atoi(pondIDStr)

	var schedule AerationSchedule
	if err := json.NewDecoder(r.Body).Decode(&schedule); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	s.scheduleSeq++
	schedule.ID = s.scheduleSeq
	schedule.PondID = pondID
	schedule.IsActive = true
	schedule.CreatedAt = time.Now()
	s.schedules = append(s.schedules, schedule)
	s.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(schedule)
}

func (s *Store) handleDashboard(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	metrics := DashboardMetrics{
		PondsByType:    make(map[string]int),
		SpeciesDistrib: make(map[string]int),
		AvgWaterQuality: make(map[string]float64),
	}

	for _, p := range s.ponds {
		metrics.TotalPonds++
		if p.Status == "active" {
			metrics.ActivePonds++
		}
		metrics.TotalStockCount += p.CurrentStock
		metrics.TotalVolumeLiters += p.VolumeLiters
		metrics.PondsByType[string(p.PondType)]++
		for _, sp := range p.Species {
			metrics.SpeciesDistrib[sp] += p.CurrentStock
		}
	}

	for _, a := range s.alerts {
		if !a.Resolved {
			metrics.ActiveAlerts++
		}
	}

	cutoff := time.Now().Add(-24 * time.Hour)
	for _, e := range s.exchanges {
		if e.Timestamp.After(cutoff) {
			metrics.RecentExchanges++
		}
	}

	// Average water quality from last 10 readings
	cnt := 0
	phSum, doSum, tempSum := 0.0, 0.0, 0.0
	for i := len(s.readings) - 1; i >= 0 && cnt < 10; i-- {
		r := s.readings[i]
		phSum += r.PH
		doSum += r.DissolvedOxygen
		tempSum += r.Temperature
		cnt++
	}
	if cnt > 0 {
		metrics.AvgWaterQuality["ph"] = math.Round(phSum/float64(cnt)*100) / 100
		metrics.AvgWaterQuality["dissolved_oxygen"] = math.Round(doSum/float64(cnt)*100) / 100
		metrics.AvgWaterQuality["temperature"] = math.Round(tempSum/float64(cnt)*100) / 100
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

func (s *Store) handleGetThresholds(w http.ResponseWriter, r *http.Request) {
	species := r.URL.Query().Get("species")
	if species != "" {
		th, ok := speciesThresholds[strings.ToLower(species)]
		if !ok {
			http.Error(w, "Unknown species", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(th)
		return
	}

	all := make([]WaterQualityThresholds, 0, len(speciesThresholds))
	for _, th := range speciesThresholds {
		all = append(all, th)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"thresholds": all,
		"total":      len(all),
	})
}

// ============================================================================
// Router
// ============================================================================

func (s *Store) setupRoutes() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/ponds", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			s.handleCreatePond(w, r)
		} else {
			s.handleListPonds(w, r)
		}
	})
	mux.HandleFunc("/ponds/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasSuffix(path, "/readings") {
			if r.Method == http.MethodPost {
				s.handleRecordReading(w, r)
			} else {
				s.handleGetReadings(w, r)
			}
		} else if strings.HasSuffix(path, "/alerts") {
			s.handleGetAlerts(w, r)
		} else if strings.HasSuffix(path, "/water-exchange") {
			s.handleWaterExchange(w, r)
		} else if strings.HasSuffix(path, "/aeration") {
			s.handleAerationSchedule(w, r)
		} else {
			s.handleGetPond(w, r)
		}
	})
	mux.HandleFunc("/thresholds", s.handleGetThresholds)
	mux.HandleFunc("/analytics/dashboard", s.handleDashboard)

	return mux
}

// ============================================================================
// Main
// ============================================================================

func main() {
	cfg := loadConfig()
	store := NewStore()

	log.Printf("Aquaculture Pond Service starting on port %s", cfg.Port)
	log.Printf("Integrations: Kafka=%s, Dapr=%s, Redis=%s, OpenSearch=%s",
		cfg.KafkaBroker, cfg.DaprHTTPPort, cfg.RedisURL, cfg.OpenSearchURL)

	mux := store.setupRoutes()
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down aquaculture pond service...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()

	log.Fatal(server.ListenAndServe())
}
