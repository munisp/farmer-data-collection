package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleHealth(t *testing.T) {
	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	handleHealth(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["status"] != "healthy" {
		t.Fatal("expected healthy status")
	}
}

func TestHandleListOfftakers(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/offtakers", nil)
	w := httptest.NewRecorder()
	handleListOfftakers(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	total := int(body["total"].(float64))
	if total != 5 {
		t.Fatalf("expected 5 offtakers, got %d", total)
	}
}

func TestHandleListTemplates(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/templates", nil)
	w := httptest.NewRecorder()
	handleListTemplates(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	total := int(body["total"].(float64))
	if total != 3 {
		t.Fatalf("expected 3 templates, got %d", total)
	}
}

func TestHandleListContracts(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/contracts", nil)
	w := httptest.NewRecorder()
	handleListContracts(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	total := int(body["total"].(float64))
	if total < 3 {
		t.Fatalf("expected at least 3 contracts, got %d", total)
	}
}

func TestHandleStats(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/stats", nil)
	w := httptest.NewRecorder()
	handleStats(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["totalContracts"].(float64) < 3 {
		t.Fatal("expected at least 3 contracts in stats")
	}
	if body["totalOfftakers"].(float64) != 5 {
		t.Fatal("expected 5 offtakers in stats")
	}
}

func TestCreateContract(t *testing.T) {
	body := `{"farmerId":"F-999","offtakerId":"OT-003","cropType":"tomato","quantityKg":1000,"pricePerKg":120,"currency":"KES","templateId":"TPL-003","durationMonths":3}`
	req := httptest.NewRequest("POST", "/api/contracts/create", strings.NewReader(body))
	w := httptest.NewRecorder()
	handleCreateContract(w, req)
	if w.Code != 201 {
		t.Fatalf("expected 201, got %d", w.Code)
	}
	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	contract := resp["contract"].(map[string]interface{})
	if contract["cropType"] != "tomato" {
		t.Fatal("expected tomato crop type")
	}
	schedule := contract["deliverySchedule"].([]interface{})
	if len(schedule) != 3 {
		t.Fatalf("expected 3 deliveries for 3 months, got %d", len(schedule))
	}
}

func TestPerformanceCalculation(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/contracts/performance?contractId=CT-001", nil)
	w := httptest.NewRecorder()
	handlePerformance(w, req)
	if w.Code != 200 {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var perf PerformanceMetric
	json.Unmarshal(w.Body.Bytes(), &perf)
	if perf.DeliveryRate <= 0 {
		t.Fatal("expected positive delivery rate")
	}
	if perf.OverallScore <= 0 {
		t.Fatal("expected positive overall score")
	}
}
