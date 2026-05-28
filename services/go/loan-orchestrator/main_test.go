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

func TestSubmitLoanApplication(t *testing.T) {
	srv := NewServer(loadConfig())
	body := `{"farmer_id":1,"amount":50000,"currency":"NGN","purpose":"seeds","term_months":6,"collateral_type":"warehouse_receipt","collateral_value":75000}`
	req := httptest.NewRequest(http.MethodPost, "/api/loans/apply", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handleSubmitApplication(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusCreated && w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 200/201/503, got %d: %s", w.Code, w.Body.String())
	}
}

func TestGetLoanStatus(t *testing.T) {
	srv := NewServer(loadConfig())
	req := httptest.NewRequest(http.MethodGet, "/api/loans/status/LOAN-001", nil)
	w := httptest.NewRecorder()
	srv.handleGetLoanStatus(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusNotFound {
		t.Fatalf("expected 200/404, got %d", w.Code)
	}
}

func TestCreditScoreCheck(t *testing.T) {
	srv := NewServer(loadConfig())
	body := `{"farmer_id":1}`
	req := httptest.NewRequest(http.MethodPost, "/api/loans/credit-check", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	srv.handleCreditCheck(w, req)

	if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 200/503, got %d: %s", w.Code, w.Body.String())
	}

	if w.Code == http.StatusOK {
		var resp map[string]interface{}
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid JSON: %v", err)
		}
	}
}
