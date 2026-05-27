package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"time"

	"github.com/gorilla/mux"
)

// GPSPoint represents a GPS coordinate
type GPSPoint struct {
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Altitude  float64   `json:"altitude"`
	Timestamp time.Time `json:"timestamp"`
}

// GPSTrack represents a collection of GPS points
type GPSTrack struct {
	DeviceID string     `json:"device_id"`
	Points   []GPSPoint `json:"points"`
}

// GeofenceZone represents a geofence boundary
type GeofenceZone struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Center    GPSPoint  `json:"center"`
	RadiusKm  float64   `json:"radius_km"`
	CreatedAt time.Time `json:"created_at"`
}

// TrackStatistics represents GPS track analytics
type TrackStatistics struct {
	TotalDistance   float64 `json:"total_distance_km"`
	AverageSpeed    float64 `json:"average_speed_kmh"`
	MaxSpeed        float64 `json:"max_speed_kmh"`
	Duration        float64 `json:"duration_minutes"`
	PointCount      int     `json:"point_count"`
	BoundingBox     BBox    `json:"bounding_box"`
}

// BBox represents a bounding box
type BBox struct {
	MinLat float64 `json:"min_lat"`
	MaxLat float64 `json:"max_lat"`
	MinLon float64 `json:"min_lon"`
	MaxLon float64 `json:"max_lon"`
}

// HealthResponse for health check endpoint
type HealthResponse struct {
	Status    string    `json:"status"`
	Service   string    `json:"service"`
	Timestamp time.Time `json:"timestamp"`
	Version   string    `json:"version"`
}

func main() {
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", healthCheckHandler).Methods("GET")

	// GPS tracking endpoints
	router.HandleFunc("/api/gps/calculate-distance", calculateDistanceHandler).Methods("POST")
	router.HandleFunc("/api/gps/track-statistics", trackStatisticsHandler).Methods("POST")
	router.HandleFunc("/api/gps/geofence-check", geofenceCheckHandler).Methods("POST")
	router.HandleFunc("/api/gps/simplify-track", simplifyTrackHandler).Methods("POST")
	router.HandleFunc("/api/gps/generate-heatmap", generateHeatmapHandler).Methods("POST")

	// CORS middleware
	router.Use(corsMiddleware)

	port := ":8087"
	log.Printf("🚀 GPS Tracking Service (Go) starting on port %s", port)
	log.Fatal(http.ListenAndServe(port, router))
}

// CORS middleware
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Health check handler
func healthCheckHandler(w http.ResponseWriter, r *http.Request) {
	response := HealthResponse{
		Status:    "healthy",
		Service:   "GPS Tracking Service (Go)",
		Timestamp: time.Now(),
		Version:   "1.0.0",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Calculate distance between two GPS points
func calculateDistanceHandler(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Point1 GPSPoint `json:"point1"`
		Point2 GPSPoint `json:"point2"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	distance := haversineDistance(
		request.Point1.Latitude, request.Point1.Longitude,
		request.Point2.Latitude, request.Point2.Longitude,
	)

	response := map[string]interface{}{
		"distance_km":     distance,
		"distance_meters": distance * 1000,
		"distance_miles":  distance * 0.621371,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Calculate track statistics
func trackStatisticsHandler(w http.ResponseWriter, r *http.Request) {
	var track GPSTrack

	if err := json.NewDecoder(r.Body).Decode(&track); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	stats := calculateTrackStatistics(track)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// Check if point is within geofence
func geofenceCheckHandler(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Point GPSPoint       `json:"point"`
		Zones []GeofenceZone `json:"zones"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	violations := []GeofenceZone{}
	insideZones := []GeofenceZone{}

	for _, zone := range request.Zones {
		distance := haversineDistance(
			request.Point.Latitude, request.Point.Longitude,
			zone.Center.Latitude, zone.Center.Longitude,
		)

		if distance <= zone.RadiusKm {
			insideZones = append(insideZones, zone)
		} else {
			violations = append(violations, zone)
		}
	}

	response := map[string]interface{}{
		"inside_zones": insideZones,
		"violations":   violations,
		"total_zones":  len(request.Zones),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Simplify GPS track using Douglas-Peucker algorithm
func simplifyTrackHandler(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Track     GPSTrack `json:"track"`
		Tolerance float64  `json:"tolerance"` // in meters
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	simplified := douglasPeucker(request.Track.Points, request.Tolerance/1000.0) // convert to km

	response := map[string]interface{}{
		"original_points":   len(request.Track.Points),
		"simplified_points": len(simplified),
		"reduction_percent": float64(len(request.Track.Points)-len(simplified)) / float64(len(request.Track.Points)) * 100,
		"points":            simplified,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Generate heatmap data from GPS tracks
func generateHeatmapHandler(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Tracks   []GPSTrack `json:"tracks"`
		GridSize float64    `json:"grid_size"` // in km
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	heatmap := generateHeatmap(request.Tracks, request.GridSize)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(heatmap)
}

// Haversine distance calculation
func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusKm = 6371.0

	dLat := toRadians(lat2 - lat1)
	dLon := toRadians(lon2 - lon1)

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRadians(lat1))*math.Cos(toRadians(lat2))*
			math.Sin(dLon/2)*math.Sin(dLon/2)

	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusKm * c
}

func toRadians(degrees float64) float64 {
	return degrees * math.Pi / 180
}

// Calculate track statistics
func calculateTrackStatistics(track GPSTrack) TrackStatistics {
	if len(track.Points) < 2 {
		return TrackStatistics{}
	}

	var totalDistance float64
	var maxSpeed float64
	var speeds []float64

	minLat, maxLat := track.Points[0].Latitude, track.Points[0].Latitude
	minLon, maxLon := track.Points[0].Longitude, track.Points[0].Longitude

	for i := 1; i < len(track.Points); i++ {
		prev := track.Points[i-1]
		curr := track.Points[i]

		// Update bounding box
		minLat = math.Min(minLat, curr.Latitude)
		maxLat = math.Max(maxLat, curr.Latitude)
		minLon = math.Min(minLon, curr.Longitude)
		maxLon = math.Max(maxLon, curr.Longitude)

		// Calculate distance
		dist := haversineDistance(prev.Latitude, prev.Longitude, curr.Latitude, curr.Longitude)
		totalDistance += dist

		// Calculate speed
		timeDiff := curr.Timestamp.Sub(prev.Timestamp).Hours()
		if timeDiff > 0 {
			speed := dist / timeDiff
			speeds = append(speeds, speed)
			maxSpeed = math.Max(maxSpeed, speed)
		}
	}

	// Calculate average speed
	var avgSpeed float64
	if len(speeds) > 0 {
		sum := 0.0
		for _, s := range speeds {
			sum += s
		}
		avgSpeed = sum / float64(len(speeds))
	}

	// Calculate duration
	duration := track.Points[len(track.Points)-1].Timestamp.Sub(track.Points[0].Timestamp).Minutes()

	return TrackStatistics{
		TotalDistance: totalDistance,
		AverageSpeed:  avgSpeed,
		MaxSpeed:      maxSpeed,
		Duration:      duration,
		PointCount:    len(track.Points),
		BoundingBox: BBox{
			MinLat: minLat,
			MaxLat: maxLat,
			MinLon: minLon,
			MaxLon: maxLon,
		},
	}
}

// Douglas-Peucker algorithm for track simplification
func douglasPeucker(points []GPSPoint, tolerance float64) []GPSPoint {
	if len(points) < 3 {
		return points
	}

	// Find point with maximum distance
	maxDist := 0.0
	maxIndex := 0

	for i := 1; i < len(points)-1; i++ {
		dist := perpendicularDistance(points[i], points[0], points[len(points)-1])
		if dist > maxDist {
			maxDist = dist
			maxIndex = i
		}
	}

	// If max distance is greater than tolerance, recursively simplify
	if maxDist > tolerance {
		left := douglasPeucker(points[:maxIndex+1], tolerance)
		right := douglasPeucker(points[maxIndex:], tolerance)

		// Combine results (remove duplicate middle point)
		return append(left[:len(left)-1], right...)
	}

	// Return endpoints
	return []GPSPoint{points[0], points[len(points)-1]}
}

// Calculate perpendicular distance from point to line
func perpendicularDistance(point, lineStart, lineEnd GPSPoint) float64 {
	// Simplified version using haversine
	// For more accuracy, use proper perpendicular distance calculation
	d1 := haversineDistance(point.Latitude, point.Longitude, lineStart.Latitude, lineStart.Longitude)
	d2 := haversineDistance(point.Latitude, point.Longitude, lineEnd.Latitude, lineEnd.Longitude)
	d3 := haversineDistance(lineStart.Latitude, lineStart.Longitude, lineEnd.Latitude, lineEnd.Longitude)

	// Use triangle inequality
	return math.Abs(d1 + d2 - d3)
}

// Generate heatmap from GPS tracks
func generateHeatmap(tracks []GPSTrack, gridSize float64) map[string]interface{} {
	grid := make(map[string]int)

	for _, track := range tracks {
		for _, point := range track.Points {
			// Round to grid
			gridLat := math.Floor(point.Latitude/gridSize) * gridSize
			gridLon := math.Floor(point.Longitude/gridSize) * gridSize
			key := fmt.Sprintf("%.6f,%.6f", gridLat, gridLon)
			grid[key]++
		}
	}

	// Convert to array format
	heatmapPoints := []map[string]interface{}{}
	for key, count := range grid {
		var lat, lon float64
		fmt.Sscanf(key, "%f,%f", &lat, &lon)
		heatmapPoints = append(heatmapPoints, map[string]interface{}{
			"latitude":  lat,
			"longitude": lon,
			"intensity": count,
		})
	}

	return map[string]interface{}{
		"points":    heatmapPoints,
		"grid_size": gridSize,
		"total_cells": len(heatmapPoints),
	}
}
