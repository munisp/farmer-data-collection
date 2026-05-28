package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthEndpoint(t *testing.T) {
	srv := NewServer(loadConfig())
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	srv.handleHealth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

func TestPublishLocation(t *testing.T) {
	srv := NewServer(loadConfig())
	body := `{"device_id":"device-001","latitude":6.5244,"longitude":3.3792,"accuracy":5.0,"speed":0,"heading":0,"timestamp":"2026-01-01T00:00:00Z"}`
	req := httptest.NewRequest(http.MethodPost, "/api/gps/publish", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handlePublishLocation(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusAccepted && w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 200/202/503, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetLatestLocation(t *testing.T) {
	srv := NewServer(loadConfig())
	req := httptest.NewRequest(http.MethodGet, "/api/gps/latest/device-001", nil)
	w := httptest.NewRecorder()
	srv.handleGetLatestLocation(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusNotFound {
		t.Fatalf("expected 200/404, got %d", w.Code)
	}
}

func TestGeofenceCheck(t *testing.T) {
	srv := NewServer(loadConfig())
	body := `{"latitude":6.5244,"longitude":3.3792,"geofence_id":"farm-001"}`
	req := httptest.NewRequest(http.MethodPost, "/api/gps/geofence-check", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handleGeofenceCheck(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusNotFound && w.Code != http.StatusBadRequest {
		t.Fatalf("expected 200/400/404, got %d: %s", w.Code, w.Body.String())
	}

	if w.Code == http.StatusOK {
		var resp map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
	}
}
