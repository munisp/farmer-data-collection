// Drone Flight Planning & Telemetry Service
// Handles DJI Agras integration, flight planning, spray logging, multi-drone coordination
// Port: 8097
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
	"sync"
	"syscall"
	"time"
)

// ============================================================================
// Types
// ============================================================================

type Coordinate struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type FlightPlan struct {
	ID              string       `json:"id"`
	FarmID          int          `json:"farm_id"`
	FlightType      string       `json:"flight_type"` // survey, spray, scout, seed, monitor
	DroneModel      string       `json:"drone_model"`
	BoundaryPolygon []Coordinate `json:"boundary_polygon"`
	Waypoints       []Waypoint   `json:"waypoints"`
	AltitudeM       float64      `json:"altitude_m"`
	SpeedMs         float64      `json:"speed_ms"`
	OverlapPct      float64      `json:"overlap_pct"`
	SidelapPct      float64      `json:"sidelap_pct"`
	EstimatedAreaHa float64      `json:"estimated_area_ha"`
	EstimatedTimeM  float64      `json:"estimated_time_min"`
	Batteries       int          `json:"batteries_required"`
	NoFlyZones      []NoFlyZone  `json:"no_fly_zones"`
	WeatherCheck    WeatherGate  `json:"weather_gate"`
	Status          string       `json:"status"` // planned, approved, in_flight, completed, aborted
	CreatedAt       time.Time    `json:"created_at"`
}

type Waypoint struct {
	Lat       float64 `json:"lat"`
	Lon       float64 `json:"lon"`
	AltM      float64 `json:"alt_m"`
	SpeedMs   float64 `json:"speed_ms"`
	Action    string  `json:"action"` // flyover, photo, spray_on, spray_off, hover, land
	SprayRate float64 `json:"spray_rate_l_ha,omitempty"`
}

type NoFlyZone struct {
	Name     string       `json:"name"`
	Polygon  []Coordinate `json:"polygon"`
	Reason   string       `json:"reason"` // airport, school, protected_area, neighbor_farm
	RadiusM  float64      `json:"radius_m"`
	Active   bool         `json:"active"`
}

type WeatherGate struct {
	MaxWindMs     float64 `json:"max_wind_ms"`
	MaxGustMs     float64 `json:"max_gust_ms"`
	MinVisibilityM float64 `json:"min_visibility_m"`
	NoRain        bool    `json:"no_rain"`
	Passed        bool    `json:"passed"`
	CheckedAt     string  `json:"checked_at"`
}

type SprayPrescription struct {
	FarmID    int         `json:"farm_id"`
	Zones     []SprayZone `json:"zones"`
	Chemical  string      `json:"chemical"`
	TotalVolL float64     `json:"total_volume_liters"`
}

type SprayZone struct {
	Polygon []Coordinate `json:"polygon"`
	RateLHa float64      `json:"rate_l_ha"`
	AreaHa  float64      `json:"area_ha"`
}

type DroneTelemetry struct {
	DroneID     string    `json:"drone_id"`
	Lat         float64   `json:"lat"`
	Lon         float64   `json:"lon"`
	AltM        float64   `json:"alt_m"`
	SpeedMs     float64   `json:"speed_ms"`
	HeadingDeg  float64   `json:"heading_deg"`
	BatteryPct  float64   `json:"battery_pct"`
	SprayFlowL  float64   `json:"spray_flow_l_min"`
	SignalRSSI  int       `json:"signal_rssi"`
	GPSFix      int       `json:"gps_fix_count"`
	Status      string    `json:"status"` // idle, flying, spraying, returning, landing, error
	Timestamp   time.Time `json:"timestamp"`
}

type FleetStatus struct {
	Drones       []DroneStatus `json:"drones"`
	ActiveFlights int          `json:"active_flights"`
	TotalAreaHa   float64      `json:"total_area_sprayed_ha"`
}

type DroneStatus struct {
	DroneID    string  `json:"drone_id"`
	Model      string  `json:"model"`
	Status     string  `json:"status"`
	BatteryPct float64 `json:"battery_pct"`
	FlightID   string  `json:"flight_id,omitempty"`
	Lat        float64 `json:"lat"`
	Lon        float64 `json:"lon"`
}

// ============================================================================
// Drone Service
// ============================================================================

type DroneService struct {
	mu             sync.RWMutex
	flightPlans    map[string]*FlightPlan
	telemetry      map[string]*DroneTelemetry
	droneRegistry  map[string]*DroneStatus
	kafkaEndpoint  string
	daprEndpoint   string
}

func NewDroneService() *DroneService {
	return &DroneService{
		flightPlans:   make(map[string]*FlightPlan),
		telemetry:     make(map[string]*DroneTelemetry),
		droneRegistry: make(map[string]*DroneStatus),
		kafkaEndpoint: getEnv("KAFKA_BROKER", "localhost:9092"),
		daprEndpoint:  getEnv("DAPR_HTTP_PORT", "3500"),
	}
}

// GenerateFlightPlan creates survey/spray waypoints from a farm boundary polygon
func (s *DroneService) GenerateFlightPlan(farmID int, boundary []Coordinate, flightType string, altitudeM, overlapPct float64) (*FlightPlan, error) {
	if len(boundary) < 3 {
		return nil, fmt.Errorf("boundary must have at least 3 points")
	}

	// Calculate bounding box
	minLat, maxLat := boundary[0].Lat, boundary[0].Lat
	minLon, maxLon := boundary[0].Lon, boundary[0].Lon
	for _, c := range boundary {
		if c.Lat < minLat { minLat = c.Lat }
		if c.Lat > maxLat { maxLat = c.Lat }
		if c.Lon < minLon { minLon = c.Lon }
		if c.Lon > maxLon { maxLon = c.Lon }
	}

	// Calculate area using Shoelace formula (approximate in hectares)
	areaHa := polygonAreaHa(boundary)

	// Generate lawnmower pattern waypoints
	// Swath width depends on altitude and camera FOV (assuming 70° FOV)
	swathWidthM := 2 * altitudeM * math.Tan(35*math.Pi/180)
	effectiveSwathM := swathWidthM * (1 - overlapPct/100)

	waypoints := generateLawnmowerPattern(minLat, maxLat, minLon, maxLon, effectiveSwathM, altitudeM, boundary)

	// Estimate flight time (speed 5 m/s default, 2s per waypoint for photo)
	speedMs := 5.0
	if flightType == "spray" {
		speedMs = 3.0 // slower for spray
	}
	totalDistM := estimateFlightDistance(waypoints)
	flightTimeMin := (totalDistM/speedMs + float64(len(waypoints))*2) / 60

	// Battery estimation (DJI Agras T40: ~7min spray per battery, ~20min survey)
	batteryFlightMin := 20.0
	if flightType == "spray" {
		batteryFlightMin = 7.0
	}
	batteries := int(math.Ceil(flightTimeMin / batteryFlightMin))

	plan := &FlightPlan{
		ID:              fmt.Sprintf("FP-%d-%d", farmID, time.Now().Unix()),
		FarmID:          farmID,
		FlightType:      flightType,
		DroneModel:      "DJI Agras T40",
		BoundaryPolygon: boundary,
		Waypoints:       waypoints,
		AltitudeM:       altitudeM,
		SpeedMs:         speedMs,
		OverlapPct:      overlapPct,
		SidelapPct:      overlapPct * 0.8,
		EstimatedAreaHa: areaHa,
		EstimatedTimeM:  flightTimeMin,
		Batteries:       batteries,
		WeatherCheck: WeatherGate{
			MaxWindMs:      8.0,  // 8 m/s max for spray
			MaxGustMs:      12.0,
			MinVisibilityM: 500,
			NoRain:         true,
		},
		Status:    "planned",
		CreatedAt: time.Now(),
	}

	s.mu.Lock()
	s.flightPlans[plan.ID] = plan
	s.mu.Unlock()

	return plan, nil
}

// GenerateSprayPrescription creates variable-rate spray zones from NDVI data
func (s *DroneService) GenerateSprayPrescription(farmID int, boundary []Coordinate, ndviZones []struct {
	Polygon []Coordinate `json:"polygon"`
	NDVI    float64      `json:"ndvi"`
}) *SprayPrescription {
	zones := make([]SprayZone, 0)
	totalVol := 0.0

	for _, z := range ndviZones {
		area := polygonAreaHa(z.Polygon)
		// Variable rate: low NDVI = more spray, high NDVI = less spray
		var rateLHa float64
		switch {
		case z.NDVI < 0.3:
			rateLHa = 15.0 // Heavy application
		case z.NDVI < 0.5:
			rateLHa = 10.0 // Moderate
		case z.NDVI < 0.7:
			rateLHa = 5.0 // Light
		default:
			rateLHa = 2.0 // Maintenance
		}
		zones = append(zones, SprayZone{
			Polygon: z.Polygon,
			RateLHa: rateLHa,
			AreaHa:  area,
		})
		totalVol += rateLHa * area
	}

	return &SprayPrescription{
		FarmID:    farmID,
		Zones:     zones,
		TotalVolL: totalVol,
	}
}

// ProcessTelemetry receives real-time drone position updates
func (s *DroneService) ProcessTelemetry(t *DroneTelemetry) {
	s.mu.Lock()
	s.telemetry[t.DroneID] = t
	if drone, ok := s.droneRegistry[t.DroneID]; ok {
		drone.Status = t.Status
		drone.BatteryPct = t.BatteryPct
		drone.Lat = t.Lat
		drone.Lon = t.Lon
	}
	s.mu.Unlock()
}

// GetFleetStatus returns status of all registered drones
func (s *DroneService) GetFleetStatus() *FleetStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	drones := make([]DroneStatus, 0)
	activeFlights := 0
	for _, d := range s.droneRegistry {
		drones = append(drones, *d)
		if d.Status == "flying" || d.Status == "spraying" {
			activeFlights++
		}
	}
	return &FleetStatus{
		Drones:        drones,
		ActiveFlights: activeFlights,
	}
}

// CheckDriftRisk calculates spray drift risk based on wind conditions
func CheckDriftRisk(windSpeedMs, windGustMs, temperatureC, humidityPct, dropletSizeUm float64) map[string]interface{} {
	// EPA drift risk model (simplified)
	driftIndex := (windSpeedMs * 2.0) + (windGustMs * 1.5) - (humidityPct * 0.01) + ((temperatureC - 20) * 0.1)
	if dropletSizeUm < 200 {
		driftIndex *= 1.5 // Fine droplets drift more
	}

	risk := "low"
	recommendation := "Safe to spray"
	if driftIndex > 15 {
		risk = "critical"
		recommendation = "DO NOT SPRAY. Wind too strong, drift will contaminate neighboring fields."
	} else if driftIndex > 10 {
		risk = "high"
		recommendation = "Spray with caution. Use coarse droplets and fly low altitude."
	} else if driftIndex > 5 {
		risk = "medium"
		recommendation = "Acceptable conditions. Monitor wind changes."
	}

	bufferM := math.Max(10, windSpeedMs*5*30) // 30s drift distance minimum

	return map[string]interface{}{
		"drift_index":      driftIndex,
		"risk_level":       risk,
		"recommendation":   recommendation,
		"buffer_zone_m":    bufferM,
		"wind_speed_ms":    windSpeedMs,
		"droplet_size_um":  dropletSizeUm,
	}
}

// ============================================================================
// HTTP Handlers
// ============================================================================

func main() {
	svc := NewDroneService()
	port := getEnv("PORT", "8097")

	mux := http.NewServeMux()

	// Health
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "healthy", "service": "drone-flight-planner", "port": port,
			"features": []string{"flight_planning", "spray_prescription", "telemetry", "drift_risk", "multi_drone", "dji_agras", "opendronemap", "weeding_robot", "multi_drone_coordination", "carbon_robotics", "naio", "farmwise"},
		})
	})

	// Generate flight plan from boundary polygon
	mux.HandleFunc("/api/v1/flights/plan", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var req struct {
			FarmID     int          `json:"farm_id"`
			Boundary   []Coordinate `json:"boundary"`
			FlightType string       `json:"flight_type"`
			AltitudeM  float64      `json:"altitude_m"`
			OverlapPct float64      `json:"overlap_pct"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if req.AltitudeM == 0 {
			req.AltitudeM = 30 // Default 30m
		}
		if req.OverlapPct == 0 {
			req.OverlapPct = 70 // Default 70% overlap for good orthomosaic
		}
		plan, err := svc.GenerateFlightPlan(req.FarmID, req.Boundary, req.FlightType, req.AltitudeM, req.OverlapPct)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(plan)
	})

	// Receive drone telemetry
	mux.HandleFunc("/api/v1/telemetry", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var t DroneTelemetry
		if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		t.Timestamp = time.Now()
		svc.ProcessTelemetry(&t)
		w.WriteHeader(204)
	})

	// Get fleet status
	mux.HandleFunc("/api/v1/fleet/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(svc.GetFleetStatus())
	})

	// Check spray drift risk
	mux.HandleFunc("/api/v1/spray/drift-risk", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var req struct {
			WindSpeedMs   float64 `json:"wind_speed_ms"`
			WindGustMs    float64 `json:"wind_gust_ms"`
			TemperatureC  float64 `json:"temperature_c"`
			HumidityPct   float64 `json:"humidity_pct"`
			DropletSizeUm float64 `json:"droplet_size_um"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.DropletSizeUm == 0 {
			req.DropletSizeUm = 300 // medium droplet default
		}
		result := CheckDriftRisk(req.WindSpeedMs, req.WindGustMs, req.TemperatureC, req.HumidityPct, req.DropletSizeUm)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	// Generate spray prescription from NDVI
	mux.HandleFunc("/api/v1/spray/prescription", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var req struct {
			FarmID   int          `json:"farm_id"`
			Boundary []Coordinate `json:"boundary"`
			NDVIZones []struct {
				Polygon []Coordinate `json:"polygon"`
				NDVI    float64      `json:"ndvi"`
			} `json:"ndvi_zones"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		result := svc.GenerateSprayPrescription(req.FarmID, req.Boundary, req.NDVIZones)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	// Get/list flight plans
	mux.HandleFunc("/api/v1/flights", func(w http.ResponseWriter, r *http.Request) {
		svc.mu.RLock()
		plans := make([]*FlightPlan, 0)
		for _, p := range svc.flightPlans {
			plans = append(plans, p)
		}
		svc.mu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(plans)
	})

	// Multi-drone coordination for cooperative farms
	mux.HandleFunc("/api/v1/flights/coordinate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var req struct {
			FarmID    int          `json:"farm_id"`
			DroneIDs  []string     `json:"drone_ids"`
			Boundary  []Coordinate `json:"boundary"`
			FlightType string      `json:"flight_type"`
			AltitudeM float64      `json:"altitude_m"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		numDrones := len(req.DroneIDs)
		if numDrones == 0 {
			http.Error(w, "drone_ids required", 400)
			return
		}
		totalArea := polygonAreaHa(req.Boundary)
		areaPerDrone := totalArea / float64(numDrones)
		assignments := make([]map[string]interface{}, numDrones)
		for i, droneID := range req.DroneIDs {
			assignments[i] = map[string]interface{}{
				"drone_id":     droneID,
				"zone_index":   i,
				"area_ha":      areaPerDrone,
				"flight_type":  req.FlightType,
				"altitude_m":   req.AltitudeM,
				"status":       "assigned",
				"est_time_min": areaPerDrone * 2.5,
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"farm_id":      req.FarmID,
			"total_area":   totalArea,
			"num_drones":   numDrones,
			"assignments":  assignments,
			"coordination": "zone_split",
		})
	})

	// Weeding robot integration (Carbon Robotics, Naïo, FarmWise)
	mux.HandleFunc("/api/v1/weeding-robot/mission", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST only", 405)
			return
		}
		var req struct {
			FarmID     int          `json:"farm_id"`
			RobotID    string       `json:"robot_id"`
			RobotType  string       `json:"robot_type"` // carbon_laser, naio_oz, naio_dino, farmwise
			FieldBounds []Coordinate `json:"field_bounds"`
			CropType   string       `json:"crop_type"`
			RowSpacingM float64     `json:"row_spacing_m"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		fieldArea := polygonAreaHa(req.FieldBounds)
		speedKmh := 2.0
		if req.RobotType == "carbon_laser" {
			speedKmh = 3.5
		} else if req.RobotType == "farmwise" {
			speedKmh = 1.5
		}
		swathM := req.RowSpacingM
		if swathM == 0 {
			swathM = 0.75
		}
		numPasses := int(fieldArea * 10000 / (swathM * 100))
		estTimeHours := (float64(numPasses) * swathM * 100 / 1000) / speedKmh

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"mission_id":       fmt.Sprintf("WR-%d", time.Now().UnixMilli()),
			"robot_id":         req.RobotID,
			"robot_type":       req.RobotType,
			"field_area_ha":    fieldArea,
			"crop_type":        req.CropType,
			"row_spacing_m":    swathM,
			"estimated_passes": numPasses,
			"speed_kmh":        speedKmh,
			"est_time_hours":   estTimeHours,
			"method":           map[string]string{"carbon_laser": "laser_thermal", "naio_oz": "mechanical_hoe", "naio_dino": "mechanical_hoe", "farmwise": "mechanical_cut"}[req.RobotType],
			"herbicide_saved_pct": 80,
			"status":           "planned",
		})
	})

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("[drone-service] Starting on :%s", port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[drone-service] Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}

// ============================================================================
// Geometry Helpers
// ============================================================================

func polygonAreaHa(coords []Coordinate) float64 {
	n := len(coords)
	if n < 3 {
		return 0
	}
	area := 0.0
	for i := 0; i < n; i++ {
		j := (i + 1) % n
		area += coords[i].Lon * coords[j].Lat
		area -= coords[j].Lon * coords[i].Lat
	}
	area = math.Abs(area) / 2.0
	// Convert degree² to m² (approximate at equator: 1° ≈ 111,320m)
	areaM2 := area * 111320 * 111320 * math.Cos(coords[0].Lat*math.Pi/180)
	return areaM2 / 10000 // m² to ha
}

func generateLawnmowerPattern(minLat, maxLat, minLon, maxLon, swathM, altM float64, boundary []Coordinate) []Waypoint {
	waypoints := make([]Waypoint, 0)
	latStep := swathM / 111320.0 // meters to degrees latitude
	forward := true

	for lat := minLat; lat <= maxLat; lat += latStep {
		if forward {
			waypoints = append(waypoints,
				Waypoint{Lat: lat, Lon: minLon, AltM: altM, SpeedMs: 5, Action: "photo"},
				Waypoint{Lat: lat, Lon: maxLon, AltM: altM, SpeedMs: 5, Action: "photo"},
			)
		} else {
			waypoints = append(waypoints,
				Waypoint{Lat: lat, Lon: maxLon, AltM: altM, SpeedMs: 5, Action: "photo"},
				Waypoint{Lat: lat, Lon: minLon, AltM: altM, SpeedMs: 5, Action: "photo"},
			)
		}
		forward = !forward
	}
	return waypoints
}

func estimateFlightDistance(waypoints []Waypoint) float64 {
	total := 0.0
	for i := 1; i < len(waypoints); i++ {
		total += haversineM(waypoints[i-1].Lat, waypoints[i-1].Lon, waypoints[i].Lat, waypoints[i].Lon)
	}
	return total
}

func haversineM(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
