package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreatePond(t *testing.T) {
	store := NewStore()
	mux := store.setupRoutes()

	body := `{"farm_id":1,"name":"Catfish Pond Alpha","pond_type":"earthen","volume_liters":50000,"surface_area_sqm":100,"depth_meters":1.5,"species":["catfish"],"max_capacity":500,"current_stock":200,"aeration_system":"paddle_wheel","filter_system":"none","water_source":"borehole","drainage_type":"monk"}`
	req := httptest.NewRequest(http.MethodPost, "/ponds", bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var pond Pond
	json.NewDecoder(rec.Body).Decode(&pond)
	if pond.ID != 1 {
		t.Fatalf("expected ID 1, got %d", pond.ID)
	}
	if pond.PondType != PondTypeEarthen {
		t.Fatalf("expected earthen, got %s", pond.PondType)
	}
	if pond.VolumeLiters != 50000 {
		t.Fatalf("expected 50000L, got %f", pond.VolumeLiters)
	}
}

func TestListPonds(t *testing.T) {
	store := NewStore()
	mux := store.setupRoutes()

	// Create 2 ponds
	for _, name := range []string{"Pond A", "Pond B"} {
		body, _ := json.Marshal(Pond{Name: name, PondType: PondTypeEarthen, VolumeLiters: 10000, Species: []string{"catfish"}})
		req := httptest.NewRequest(http.MethodPost, "/ponds", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
	}

	req := httptest.NewRequest(http.MethodGet, "/ponds", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	var result map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&result)
	total := int(result["total"].(float64))
	if total != 2 {
		t.Fatalf("expected 2 ponds, got %d", total)
	}
}

func TestWaterQualityAlerts(t *testing.T) {
	// Test catfish thresholds
	reading := WaterQualityReading{
		PH: 5.0, // Too low for catfish (6.5-8.5)
		DissolvedOxygen: 2.0, // Too low (min 3.0)
		Temperature: 28.0,
		Ammonia: 0.1, // Too high (max 0.05)
		Nitrite: 0.05,
		Turbidity: 10.0,
	}

	alerts := checkWaterQuality(reading, []string{"catfish"})
	if len(alerts) < 3 {
		t.Fatalf("expected at least 3 alerts (pH, DO, ammonia), got %d", len(alerts))
	}

	// Verify pH alert is critical (5.0 < 6.5-0.5=6.0)
	phAlert := alerts[0]
	if phAlert.Parameter != "ph" {
		t.Fatalf("expected ph alert first, got %s", phAlert.Parameter)
	}
	if phAlert.Severity != "critical" {
		t.Fatalf("expected critical severity for pH 5.0, got %s", phAlert.Severity)
	}
}

func TestWaterQualityNoAlerts(t *testing.T) {
	// Perfect conditions for catfish
	reading := WaterQualityReading{
		PH: 7.5,
		DissolvedOxygen: 6.0,
		Temperature: 28.0,
		Ammonia: 0.01,
		Nitrite: 0.02,
		Turbidity: 10.0,
	}

	alerts := checkWaterQuality(reading, []string{"catfish"})
	if len(alerts) != 0 {
		t.Fatalf("expected 0 alerts for perfect conditions, got %d", len(alerts))
	}
}

func TestWQICalculation(t *testing.T) {
	// Perfect reading for catfish
	reading := WaterQualityReading{
		PH: 7.5, DissolvedOxygen: 6.0, Temperature: 28.5,
		Ammonia: 0.01, Nitrite: 0.02, Turbidity: 5.0,
	}
	wqi := calculateWQI(reading, "catfish")
	if wqi < 70 || wqi > 100 {
		t.Fatalf("expected WQI 70-100 for perfect conditions, got %.2f", wqi)
	}

	// Bad reading
	badReading := WaterQualityReading{
		PH: 5.0, DissolvedOxygen: 1.0, Temperature: 40.0,
		Ammonia: 0.2, Nitrite: 0.5, Turbidity: 50.0,
	}
	badWqi := calculateWQI(badReading, "catfish")
	if badWqi >= wqi {
		t.Fatalf("bad WQI %.2f should be lower than good WQI %.2f", badWqi, wqi)
	}
}

func TestSpeciesThresholds(t *testing.T) {
	expected := []string{"catfish", "tilapia", "shrimp", "trout", "carp", "barramundi"}
	for _, sp := range expected {
		if _, ok := speciesThresholds[sp]; !ok {
			t.Fatalf("missing threshold for species: %s", sp)
		}
	}

	if len(speciesThresholds) != 6 {
		t.Fatalf("expected 6 species thresholds, got %d", len(speciesThresholds))
	}

	// Verify catfish specifics
	cat := speciesThresholds["catfish"]
	if cat.PHMin != 6.5 || cat.PHMax != 8.5 {
		t.Fatalf("catfish pH range wrong: expected 6.5-8.5, got %.1f-%.1f", cat.PHMin, cat.PHMax)
	}
	if cat.DOMin != 3.0 {
		t.Fatalf("catfish DO min wrong: expected 3.0, got %.1f", cat.DOMin)
	}
	if cat.TempMin != 25.0 || cat.TempMax != 32.0 {
		t.Fatalf("catfish temp range wrong: expected 25-32, got %.0f-%.0f", cat.TempMin, cat.TempMax)
	}

	// Shrimp needs higher salinity
	shrimp := speciesThresholds["shrimp"]
	if shrimp.SalinityMin != 15.0 {
		t.Fatalf("shrimp salinity min should be 15.0, got %.1f", shrimp.SalinityMin)
	}
}

func TestRecordReadingAndAlerts(t *testing.T) {
	store := NewStore()
	mux := store.setupRoutes()

	// Create pond
	pondBody := `{"farm_id":1,"name":"Test Pond","pond_type":"concrete","volume_liters":20000,"species":["tilapia"],"max_capacity":300,"current_stock":100}`
	req := httptest.NewRequest(http.MethodPost, "/ponds", bytes.NewBufferString(pondBody))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("failed to create pond: %d", rec.Code)
	}

	// Record reading with high ammonia (triggers alert for tilapia)
	readingBody := `{"ph":7.5,"dissolved_oxygen_mg_l":5.0,"temperature_celsius":27.0,"ammonia_mg_l":0.1,"nitrite_mg_l":0.02,"turbidity_ntu":10.0}`
	req = httptest.NewRequest(http.MethodPost, "/ponds/1/readings", bytes.NewBufferString(readingBody))
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	var result map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&result)
	alertsTriggered := int(result["alerts_triggered"].(float64))
	if alertsTriggered < 1 {
		t.Fatalf("expected at least 1 alert for ammonia 0.1 (tilapia max 0.02), got %d", alertsTriggered)
	}
}

func TestWaterExchange(t *testing.T) {
	store := NewStore()
	mux := store.setupRoutes()

	// Create pond
	pondBody := `{"farm_id":1,"name":"Exchange Test","pond_type":"ras","volume_liters":10000,"species":["trout"],"max_capacity":200,"current_stock":50}`
	req := httptest.NewRequest(http.MethodPost, "/ponds", bytes.NewBufferString(pondBody))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	// Log water exchange
	exchangeBody := `{"volume_exchanged_liters":2000,"reason":"routine","water_source":"borehole","pre_exchange_ph":7.2,"post_exchange_ph":7.4}`
	req = httptest.NewRequest(http.MethodPost, "/ponds/1/water-exchange", bytes.NewBufferString(exchangeBody))
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", rec.Code)
	}

	var exchange WaterExchangeEvent
	json.NewDecoder(rec.Body).Decode(&exchange)
	if exchange.PercentChanged != 20.0 {
		t.Fatalf("expected 20%% water exchange, got %.1f%%", exchange.PercentChanged)
	}
}

func TestDashboard(t *testing.T) {
	store := NewStore()
	mux := store.setupRoutes()

	// Create 2 ponds
	for _, pt := range []string{"earthen", "concrete"} {
		body, _ := json.Marshal(map[string]interface{}{
			"name": pt + " pond", "pond_type": pt, "volume_liters": 10000,
			"species": []string{"catfish"}, "current_stock": 100,
		})
		req := httptest.NewRequest(http.MethodPost, "/ponds", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
	}

	req := httptest.NewRequest(http.MethodGet, "/analytics/dashboard", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	var metrics DashboardMetrics
	json.NewDecoder(rec.Body).Decode(&metrics)
	if metrics.TotalPonds != 2 {
		t.Fatalf("expected 2 ponds, got %d", metrics.TotalPonds)
	}
	if metrics.TotalStockCount != 200 {
		t.Fatalf("expected 200 stock, got %d", metrics.TotalStockCount)
	}
}

func TestHealthEndpoint(t *testing.T) {
	store := NewStore()
	mux := store.setupRoutes()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var result map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&result)
	if result["service"] != "aquaculture-pond" {
		t.Fatalf("expected service aquaculture-pond, got %s", result["service"])
	}
}

func TestInvalidPondType(t *testing.T) {
	store := NewStore()
	mux := store.setupRoutes()

	body := `{"name":"Bad Pond","pond_type":"swimming_pool","volume_liters":10000}`
	req := httptest.NewRequest(http.MethodPost, "/ponds", bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid pond type, got %d", rec.Code)
	}
}
