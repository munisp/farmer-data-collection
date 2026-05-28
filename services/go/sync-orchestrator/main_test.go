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

func TestSyncPush(t *testing.T) {
	srv := NewServer(loadConfig())
	body := `{"user_id":1,"entity_type":"farmer","records":[{"id":1,"name":"Test Farmer","phone":"+2348000000001"}],"client_version":1}`
	req := httptest.NewRequest(http.MethodPost, "/api/sync/push", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handleSyncPush(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusAccepted && w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 200/202/503, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSyncPull(t *testing.T) {
	srv := NewServer(loadConfig())
	body := `{"user_id":1,"entity_type":"farmer","last_sync_version":0}`
	req := httptest.NewRequest(http.MethodPost, "/api/sync/pull", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handleSyncPull(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 200/503, got %d: %s", w.Code, w.Body.String())
	}
}

func TestConflictResolution(t *testing.T) {
	srv := NewServer(loadConfig())
	body := `{"entity_type":"farmer","record_id":1,"local_version":2,"server_version":3,"local_data":{"name":"Local"},"server_data":{"name":"Server"},"strategy":"server_wins"}`
	req := httptest.NewRequest(http.MethodPost, "/api/sync/resolve-conflict", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handleResolveConflict(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable && w.Code != http.StatusBadRequest {
		t.Fatalf("expected 200/400/503, got %d: %s", w.Code, w.Body.String())
	}
}

func TestSyncStatus(t *testing.T) {
	srv := NewServer(loadConfig())
	req := httptest.NewRequest(http.MethodGet, "/api/sync/status/1", nil)
	w := httptest.NewRecorder()
	srv.handleSyncStatus(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusNotFound {
		t.Fatalf("expected 200/404, got %d", w.Code)
	}

	if w.Code == http.StatusOK {
		var resp map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
	}
}
