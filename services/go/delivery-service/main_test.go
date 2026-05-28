package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthEndpoint(t *testing.T) {
	cfg := loadConfig()
	srv := NewServer(cfg)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	srv.handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if resp["status"] != "healthy" {
		t.Fatalf("expected status=healthy, got %v", resp["status"])
	}
}

func TestCalculateRoute(t *testing.T) {
	cfg := loadConfig()
	srv := NewServer(cfg)
	body := `{"pickup":{"latitude":6.5244,"longitude":3.3792},"delivery":{"latitude":6.4500,"longitude":3.4000},"road_quality":"paved"}`
	req := httptest.NewRequest(http.MethodPost, "/api/routes/calculate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handleCalculateRoute(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if resp["distance_km"] == nil {
		t.Fatal("missing distance_km in response")
	}
}

func TestEstimateDeliveryFee(t *testing.T) {
	cfg := loadConfig()
	srv := NewServer(cfg)
	body := `{"pickup":{"latitude":6.5244,"longitude":3.3792},"delivery":{"latitude":6.4500,"longitude":3.4000},"weight_kg":50,"vehicle_type":"motorcycle"}`
	req := httptest.NewRequest(http.MethodPost, "/api/delivery/estimate-fee", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handleEstimateDeliveryFee(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if resp["fee"] == nil {
		t.Fatal("missing fee in response")
	}
}

func TestDriverPoolFindBestDriver(t *testing.T) {
	pool := NewDriverPool()
	pool.SetDriverOnline(Driver{
		ID:         1,
		Name:       "Chukwu",
		Phone:      "+2348012345678",
		Vehicle:    "motorcycle",
		Location:   Coordinate{Latitude: 6.5244, Longitude: 3.3792},
		Rating:     4.5,
		TotalTrips: 100,
	})

	driver, err := pool.FindBestDriver(DeliveryRequest{
		Pickup: Coordinate{Latitude: 6.5250, Longitude: 3.3800},
	})

	if err != nil {
		t.Fatalf("expected a driver, got error: %v", err)
	}
	if driver.ID != 1 {
		t.Fatalf("expected driver 1, got %d", driver.ID)
	}
}

func TestHaversineDistance(t *testing.T) {
	lagos := Coordinate{Latitude: 6.5244, Longitude: 3.3792}
	ibadan := Coordinate{Latitude: 7.3775, Longitude: 3.9470}
	dist := haversineDistance(lagos, ibadan)

	if dist < 100 || dist > 130 {
		t.Fatalf("Lagos-Ibadan distance should be ~119km, got %.2f", dist)
	}
}
