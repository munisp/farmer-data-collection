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

func TestInitiatePayment(t *testing.T) {
	srv := NewServer(loadConfig())
	body := `{"phone":"+2348012345678","amount":5000,"currency":"NGN","reference":"test-pay-001","provider":"mpesa"}`
	req := httptest.NewRequest(http.MethodPost, "/api/payments/initiate", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handleInitiatePayment(w, req)

	// Expect 200 (mock mode) or 503 (no Mojaloop)
	if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable && w.Code != http.StatusAccepted {
		t.Fatalf("expected 200/202/503, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCheckPaymentStatus(t *testing.T) {
	srv := NewServer(loadConfig())
	req := httptest.NewRequest(http.MethodGet, "/api/payments/status/test-ref-001", nil)
	w := httptest.NewRecorder()
	srv.handleCheckStatus(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusNotFound && w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 200/404/503, got %d", w.Code)
	}
}

func TestGetSupportedProviders(t *testing.T) {
	srv := NewServer(loadConfig())
	req := httptest.NewRequest(http.MethodGet, "/api/payments/providers", nil)
	w := httptest.NewRecorder()
	srv.handleGetProviders(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp []interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		// May be object instead of array
		var obj map[string]interface{}
		if err2 := json.Unmarshal(w.Body.Bytes(), &obj); err2 != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
	}
}
