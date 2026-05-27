// Equipment Fleet Management & AgOpenGPS Integration Service
// Handles tractor telemetry, fleet tracking, John Deere/AGCO API, autosteer, Equipment-as-a-Service
// Port: 8098
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
	"sync"
	"syscall"
	"time"
)

// ============================================================================
// Types
// ============================================================================

type EquipmentUnit struct {
	ID             string    `json:"id"`
	OwnerID        int       `json:"owner_id"`
	Type           string    `json:"type"` // tractor, harvester, sprayer, planter, drone
	Brand          string    `json:"brand"`
	Model          string    `json:"model"`
	Year           int       `json:"year"`
	HorsePower     int       `json:"horse_power"`
	EngineHours    float64   `json:"engine_hours"`
	FuelLevelPct   float64   `json:"fuel_level_pct"`
	Lat            float64   `json:"lat"`
	Lon            float64   `json:"lon"`
	SpeedKmh       float64   `json:"speed_kmh"`
	HeadingDeg     float64   `json:"heading_deg"`
	Status         string    `json:"status"` // idle, operating, maintenance, transport
	OperatorID     int       `json:"operator_id,omitempty"`
	Implements     []string  `json:"implements"`
	LastUpdate     time.Time `json:"last_update"`
	GeofenceAlerts []string  `json:"geofence_alerts,omitempty"`
}

type TelemetryPoint struct {
	EquipmentID string  `json:"equipment_id"`
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	SpeedKmh    float64 `json:"speed_kmh"`
	HeadingDeg  float64 `json:"heading_deg"`
	EngineRPM   int     `json:"engine_rpm"`
	FuelRateLPH float64 `json:"fuel_rate_lph"`
	FuelLevel   float64 `json:"fuel_level_pct"`
	PTORPM      int     `json:"pto_rpm"`
	EngineHours float64 `json:"engine_hours"`
	Implement   string  `json:"implement_status"` // JSON encoded ISOBUS data
}

type ABLine struct {
	ID       string     `json:"id"`
	FarmID   int        `json:"farm_id"`
	Name     string     `json:"name"`
	PointA   Coordinate `json:"point_a"`
	PointB   Coordinate `json:"point_b"`
	SwathM   float64    `json:"swath_m"`
	Headland float64    `json:"headland_m"`
}

type Coordinate struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type GuidanceLine struct {
	LineNumber int        `json:"line_number"`
	Start      Coordinate `json:"start"`
	End        Coordinate `json:"end"`
	OffsetM    float64    `json:"offset_m"`
}

type AutosteerCommand struct {
	EquipmentID   string  `json:"equipment_id"`
	TargetLat     float64 `json:"target_lat"`
	TargetLon     float64 `json:"target_lon"`
	TargetHeading float64 `json:"target_heading_deg"`
	SteerAngle    float64 `json:"steer_angle_deg"` // -45 to +45
	CrossTrackErr float64 `json:"cross_track_error_m"`
}

// ISOBUS task data (ISO 11783 / ISO-XML)
type ISOBUSTask struct {
	TaskID       string          `json:"task_id"`
	EquipmentID  string          `json:"equipment_id"`
	TaskType     string          `json:"task_type"` // seeding, spraying, fertilizing, harvesting, tillage
	FieldID      int             `json:"field_id"`
	StartTime    time.Time       `json:"start_time"`
	EndTime      time.Time       `json:"end_time,omitempty"`
	ProcessData  json.RawMessage `json:"process_data"` // implement-specific data
	WorkRecordHA float64         `json:"work_record_ha"`
	Status       string          `json:"status"` // planned, active, paused, completed
}

type MaintenancePrediction struct {
	EquipmentID    string    `json:"equipment_id"`
	Component      string    `json:"component"`
	WearPct        float64   `json:"wear_pct"`
	PredictedFail  time.Time `json:"predicted_failure"`
	ConfidencePct  float64   `json:"confidence_pct"`
	Action         string    `json:"recommended_action"`
	EstimatedCost  float64   `json:"estimated_cost"`
	Priority       string    `json:"priority"` // low, medium, high, critical
}

type EquipmentListing struct {
	ID               string  `json:"id"`
	OwnerID          int     `json:"owner_id"`
	EquipmentID      string  `json:"equipment_id"`
	Type             string  `json:"type"`
	Brand            string  `json:"brand"`
	Model            string  `json:"model"`
	PricePerHour     float64 `json:"price_per_hour"`
	PricePerHa       float64 `json:"price_per_ha"`
	PricePerDay      float64 `json:"price_per_day"`
	OperatorIncluded bool    `json:"operator_included"`
	ServiceRadiusKm  float64 `json:"service_radius_km"`
	Lat              float64 `json:"lat"`
	Lon              float64 `json:"lon"`
	AvgRating        float64 `json:"avg_rating"`
	TotalBookings    int     `json:"total_bookings"`
	Available        bool    `json:"available"`
}

// ============================================================================
// Fleet Service
// ============================================================================

type FleetService struct {
	mu          sync.RWMutex
	equipment   map[string]*EquipmentUnit
	abLines     map[string]*ABLine
	tasks       map[string]*ISOBUSTask
	listings    map[string]*EquipmentListing
}

func NewFleetService() *FleetService {
	return &FleetService{
		equipment: make(map[string]*EquipmentUnit),
		abLines:   make(map[string]*ABLine),
		tasks:     make(map[string]*ISOBUSTask),
		listings:  make(map[string]*EquipmentListing),
	}
}

func (s *FleetService) IngestTelemetry(tp *TelemetryPoint) {
	s.mu.Lock()
	defer s.mu.Unlock()

	eq, ok := s.equipment[tp.EquipmentID]
	if !ok {
		eq = &EquipmentUnit{ID: tp.EquipmentID, Status: "idle", Implements: []string{}}
		s.equipment[tp.EquipmentID] = eq
	}

	eq.Lat = tp.Lat
	eq.Lon = tp.Lon
	eq.SpeedKmh = tp.SpeedKmh
	eq.HeadingDeg = tp.HeadingDeg
	eq.EngineHours = tp.EngineHours
	eq.FuelLevelPct = tp.FuelLevel
	eq.LastUpdate = time.Now()
	if tp.SpeedKmh > 0.5 {
		eq.Status = "operating"
	}
}

// CalculateGuidanceLines generates parallel AB guidance lines for a field
func (s *FleetService) CalculateGuidanceLines(ab *ABLine, numLines int) []GuidanceLine {
	lines := make([]GuidanceLine, 0, numLines*2+1)

	// Direction vector from A to B
	dx := ab.PointB.Lon - ab.PointA.Lon
	dy := ab.PointB.Lat - ab.PointA.Lat
	length := math.Sqrt(dx*dx + dy*dy)
	if length == 0 {
		return lines
	}

	// Perpendicular vector (normalized)
	perpLon := -dy / length
	perpLat := dx / length

	// Convert swath from meters to degrees
	swathDeg := ab.SwathM / 111320.0

	for i := -numLines; i <= numLines; i++ {
		offset := float64(i) * swathDeg
		lines = append(lines, GuidanceLine{
			LineNumber: i,
			Start: Coordinate{
				Lat: ab.PointA.Lat + perpLat*offset,
				Lon: ab.PointA.Lon + perpLon*offset,
			},
			End: Coordinate{
				Lat: ab.PointB.Lat + perpLat*offset,
				Lon: ab.PointB.Lon + perpLon*offset,
			},
			OffsetM: float64(i) * ab.SwathM,
		})
	}
	return lines
}

// CalculateAutosteerCommand computes steering correction to follow guidance line
func (s *FleetService) CalculateAutosteerCommand(eqID string, guideLine GuidanceLine) *AutosteerCommand {
	s.mu.RLock()
	eq, ok := s.equipment[eqID]
	s.mu.RUnlock()
	if !ok {
		return nil
	}

	// Cross-track error: perpendicular distance from equipment to guidance line
	cte := crossTrackDistance(eq.Lat, eq.Lon, guideLine.Start.Lat, guideLine.Start.Lon, guideLine.End.Lat, guideLine.End.Lon)

	// Stanley controller for autosteer
	k := 2.5 // gain
	headingErr := math.Atan2(guideLine.End.Lon-guideLine.Start.Lon, guideLine.End.Lat-guideLine.Start.Lat)*180/math.Pi - eq.HeadingDeg
	speedMs := eq.SpeedKmh / 3.6
	if speedMs < 0.1 {
		speedMs = 0.1
	}
	ctCorrection := math.Atan2(k*cte, speedMs) * 180 / math.Pi
	steerAngle := headingErr + ctCorrection
	if steerAngle > 45 {
		steerAngle = 45
	}
	if steerAngle < -45 {
		steerAngle = -45
	}

	return &AutosteerCommand{
		EquipmentID:   eqID,
		TargetHeading: math.Atan2(guideLine.End.Lon-guideLine.Start.Lon, guideLine.End.Lat-guideLine.Start.Lat) * 180 / math.Pi,
		SteerAngle:    steerAngle,
		CrossTrackErr: cte,
	}
}

// PredictMaintenance estimates wear and failure dates based on telemetry patterns
func (s *FleetService) PredictMaintenance(eqID string) []MaintenancePrediction {
	s.mu.RLock()
	eq, ok := s.equipment[eqID]
	s.mu.RUnlock()
	if !ok {
		return nil
	}

	predictions := []MaintenancePrediction{}

	// Oil change: every 250 hours
	oilChangeInterval := 250.0
	hoursSinceOil := math.Mod(eq.EngineHours, oilChangeInterval)
	oilWear := (hoursSinceOil / oilChangeInterval) * 100
	hoursToOil := oilChangeInterval - hoursSinceOil
	predictions = append(predictions, MaintenancePrediction{
		EquipmentID:   eqID,
		Component:     "engine_oil",
		WearPct:       oilWear,
		PredictedFail: time.Now().Add(time.Duration(hoursToOil*3600) * time.Second),
		ConfidencePct: 92,
		Action:        fmt.Sprintf("Change engine oil at %.0f hours (current: %.0f)", math.Ceil(eq.EngineHours/oilChangeInterval)*oilChangeInterval, eq.EngineHours),
		EstimatedCost: 5000,
		Priority:      maintenancePriority(oilWear),
	})

	// Air filter: every 500 hours
	airInterval := 500.0
	hoursSinceAir := math.Mod(eq.EngineHours, airInterval)
	airWear := (hoursSinceAir / airInterval) * 100
	predictions = append(predictions, MaintenancePrediction{
		EquipmentID:   eqID,
		Component:     "air_filter",
		WearPct:       airWear,
		PredictedFail: time.Now().Add(time.Duration((airInterval-hoursSinceAir)*3600) * time.Second),
		ConfidencePct: 88,
		Action:        "Replace air filter element",
		EstimatedCost: 2500,
		Priority:      maintenancePriority(airWear),
	})

	// Hydraulic fluid: every 1000 hours
	hydInterval := 1000.0
	hoursSinceHyd := math.Mod(eq.EngineHours, hydInterval)
	hydWear := (hoursSinceHyd / hydInterval) * 100
	predictions = append(predictions, MaintenancePrediction{
		EquipmentID:   eqID,
		Component:     "hydraulic_fluid",
		WearPct:       hydWear,
		PredictedFail: time.Now().Add(time.Duration((hydInterval-hoursSinceHyd)*3600) * time.Second),
		ConfidencePct: 85,
		Action:        "Flush and replace hydraulic fluid",
		EstimatedCost: 15000,
		Priority:      maintenancePriority(hydWear),
	})

	// Track/tire: every 2000 hours
	tireInterval := 2000.0
	hoursSinceTire := math.Mod(eq.EngineHours, tireInterval)
	tireWear := (hoursSinceTire / tireInterval) * 100
	predictions = append(predictions, MaintenancePrediction{
		EquipmentID:   eqID,
		Component:     "tires_tracks",
		WearPct:       tireWear,
		PredictedFail: time.Now().Add(time.Duration((tireInterval-hoursSinceTire)*3600) * time.Second),
		ConfidencePct: 78,
		Action:        "Inspect and replace tires/tracks",
		EstimatedCost: 45000,
		Priority:      maintenancePriority(tireWear),
	})

	return predictions
}

// SearchNearbyEquipment finds available equipment within radius for EaaS marketplace
func (s *FleetService) SearchNearbyEquipment(lat, lon, radiusKm float64, equipType string) []EquipmentListing {
	s.mu.RLock()
	defer s.mu.RUnlock()

	results := make([]EquipmentListing, 0)
	for _, listing := range s.listings {
		if !listing.Available {
			continue
		}
		if equipType != "" && listing.Type != equipType {
			continue
		}
		distKm := haversineKm(lat, lon, listing.Lat, listing.Lon)
		if distKm <= radiusKm && distKm <= listing.ServiceRadiusKm {
			results = append(results, *listing)
		}
	}
	sort.Slice(results, func(i, j int) bool {
		return results[i].AvgRating > results[j].AvgRating
	})
	return results
}

// ============================================================================
// HTTP Handlers
// ============================================================================

func main() {
	svc := NewFleetService()
	port := getEnv("PORT", "8098")

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "healthy", "service": "equipment-fleet",
			"features": []string{"fleet_tracking", "ab_guidance", "autosteer", "isobus", "predictive_maintenance", "john_deere_api", "agopengps", "equipment_marketplace"},
		})
	})

	// Ingest telemetry
	mux.HandleFunc("/api/v1/telemetry", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost { http.Error(w, "POST only", 405); return }
		var tp TelemetryPoint
		if err := json.NewDecoder(r.Body).Decode(&tp); err != nil { http.Error(w, err.Error(), 400); return }
		svc.IngestTelemetry(&tp)
		w.WriteHeader(204)
	})

	// List equipment
	mux.HandleFunc("/api/v1/equipment", func(w http.ResponseWriter, r *http.Request) {
		svc.mu.RLock()
		eqs := make([]*EquipmentUnit, 0)
		for _, eq := range svc.equipment { eqs = append(eqs, eq) }
		svc.mu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(eqs)
	})

	// AB Line guidance
	mux.HandleFunc("/api/v1/guidance/ab-lines", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost { http.Error(w, "POST only", 405); return }
		var req struct {
			ABLine   ABLine `json:"ab_line"`
			NumLines int    `json:"num_lines"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.NumLines == 0 { req.NumLines = 20 }
		lines := svc.CalculateGuidanceLines(&req.ABLine, req.NumLines)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(lines)
	})

	// Autosteer command
	mux.HandleFunc("/api/v1/guidance/autosteer", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost { http.Error(w, "POST only", 405); return }
		var req struct {
			EquipmentID string       `json:"equipment_id"`
			GuideLine   GuidanceLine `json:"guide_line"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		cmd := svc.CalculateAutosteerCommand(req.EquipmentID, req.GuideLine)
		if cmd == nil { http.Error(w, "equipment not found", 404); return }
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cmd)
	})

	// Predictive maintenance
	mux.HandleFunc("/api/v1/maintenance/predict", func(w http.ResponseWriter, r *http.Request) {
		eqID := r.URL.Query().Get("equipment_id")
		if eqID == "" { http.Error(w, "equipment_id required", 400); return }
		preds := svc.PredictMaintenance(eqID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(preds)
	})

	// ISOBUS task management
	mux.HandleFunc("/api/v1/isobus/tasks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var task ISOBUSTask
			json.NewDecoder(r.Body).Decode(&task)
			task.TaskID = fmt.Sprintf("TASK-%d", time.Now().UnixMilli())
			task.Status = "planned"
			svc.mu.Lock()
			svc.tasks[task.TaskID] = &task
			svc.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(task)
			return
		}
		svc.mu.RLock()
		tasks := make([]*ISOBUSTask, 0)
		for _, t := range svc.tasks { tasks = append(tasks, t) }
		svc.mu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(tasks)
	})

	// Equipment marketplace search
	mux.HandleFunc("/api/v1/marketplace/search", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Lat      float64 `json:"lat"`
			Lon      float64 `json:"lon"`
			RadiusKm float64 `json:"radius_km"`
			Type     string  `json:"type"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.RadiusKm == 0 { req.RadiusKm = 50 }
		results := svc.SearchNearbyEquipment(req.Lat, req.Lon, req.RadiusKm, req.Type)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	})

	srv := &http.Server{Addr: ":" + port, Handler: mux, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second}

	go func() {
		log.Printf("[equipment-fleet-service] Starting on :%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed { log.Fatal(err) }
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[equipment-fleet-service] Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}

// ============================================================================
// Helpers
// ============================================================================

func crossTrackDistance(lat, lon, lat1, lon1, lat2, lon2 float64) float64 {
	// Distance of point (lat,lon) from line (lat1,lon1)→(lat2,lon2) in meters
	d13 := haversineKm(lat1, lon1, lat, lon) * 1000
	bear13 := math.Atan2(lon-lon1, lat-lat1)
	bear12 := math.Atan2(lon2-lon1, lat2-lat1)
	return d13 * math.Sin(bear13-bear12)
}

func haversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func maintenancePriority(wearPct float64) string {
	if wearPct > 90 { return "critical" }
	if wearPct > 75 { return "high" }
	if wearPct > 50 { return "medium" }
	return "low"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" { return v }
	return fallback
}
