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
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["status"] != "healthy" {
		t.Fatalf("expected healthy, got %v", resp["status"])
	}
}

func TestCreateAccount(t *testing.T) {
	srv := NewServer(loadConfig())
	body := `{"user_id":1,"account_type":"savings","currency":"NGN"}`
	req := httptest.NewRequest(http.MethodPost, "/api/accounts", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handleCreateAccount(w, req)

	// May return 200 (mock mode) or 503 (no TigerBeetle connection)
	if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable && w.Code != http.StatusCreated {
		t.Fatalf("expected 200/201/503, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetBalance(t *testing.T) {
	srv := NewServer(loadConfig())
	req := httptest.NewRequest(http.MethodGet, "/api/accounts/1/balance", nil)
	w := httptest.NewRecorder()
	srv.handleGetBalance(w, req)

	// May return 200 or 503 depending on TigerBeetle availability
	if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable && w.Code != http.StatusNotFound {
		t.Fatalf("expected 200/404/503, got %d: %s", w.Code, w.Body.String())
	}
}

func TestTransfer(t *testing.T) {
	srv := NewServer(loadConfig())
	body := `{"from_account":1,"to_account":2,"amount":1000,"currency":"NGN","reference":"test-transfer"}`
	req := httptest.NewRequest(http.MethodPost, "/api/transfers", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handleTransfer(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable && w.Code != http.StatusCreated {
		t.Fatalf("expected 200/201/503, got %d: %s", w.Code, w.Body.String())
	}
}
