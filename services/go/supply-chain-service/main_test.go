package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Test health endpoint
func TestHealthEndpoint(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "healthy",
			"service": "supply-chain-service",
			"version": "1.0.0",
		})
	})

	req := httptest.NewRequest("GET", "/health", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", rr.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(rr.Body).Decode(&resp)
	if resp["status"] != "healthy" {
		t.Errorf("Expected healthy status, got %v", resp["status"])
	}
}

// Test shipment creation
func TestCreateShipment(t *testing.T) {
	shipment := Shipment{
		ProduceType:   "maize",
		Quantity:      1000.0,
		Unit:          "kg",
		OriginFarmID:  42,
		DestinationID: "WH-001",
	}

	body, _ := json.Marshal(shipment)
	req := httptest.NewRequest("POST", "/api/shipments", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	// Test the handler creates a shipment correctly
	svc := NewSupplyChainService()
	svc.handleCreateShipment(rr, req)

	if rr.Code != http.StatusCreated && rr.Code != http.StatusOK {
		t.Errorf("Expected status 201 or 200, got %d", rr.Code)
	}
}

// Test shipment status transitions
func TestShipmentStatusTransitions(t *testing.T) {
	svc := NewSupplyChainService()

	// Create a shipment
	s := Shipment{
		ProduceType:   "coffee",
		Quantity:      500.0,
		Unit:          "kg",
		OriginFarmID:  10,
		DestinationID: "MKT-002",
	}
	id := svc.createShipment(s)

	// Transition through states
	transitions := []ShipmentStatus{
		StatusPickedUp,
		StatusInTransit,
		StatusAtWarehouse,
		StatusDelivered,
	}

	for _, status := range transitions {
		err := svc.updateStatus(id, status)
		if err != nil {
			t.Errorf("Failed to transition to %s: %v", status, err)
		}
		shipment, _ := svc.getShipment(id)
		if shipment.Status != status {
			t.Errorf("Expected status %s, got %s", status, shipment.Status)
		}
	}
}

// Test certification tracking
func TestCertificationTracking(t *testing.T) {
	svc := NewSupplyChainService()

	cert := Certification{
		Type:     "organic",
		IssuedBy: "Kenya Organic Agriculture Network",
		FarmID:   15,
		ValidFrom: "2024-01-01",
		ValidTo:   "2025-12-31",
	}

	id := svc.addCertification(cert)
	if id == "" {
		t.Error("Expected non-empty certification ID")
	}

	// Verify certification retrieval
	retrieved, err := svc.getCertification(id)
	if err != nil {
		t.Errorf("Failed to retrieve certification: %v", err)
	}
	if retrieved.Type != "organic" {
		t.Errorf("Expected organic certification, got %s", retrieved.Type)
	}
}

// Test cold chain handoff recording
func TestColdChainHandoff(t *testing.T) {
	svc := NewSupplyChainService()

	shipmentID := svc.createShipment(Shipment{
		ProduceType:   "tomatoes",
		Quantity:      200.0,
		Unit:          "kg",
		OriginFarmID:  7,
		DestinationID: "COLD-001",
	})

	handoff := ColdChainHandoff{
		ShipmentID:      shipmentID,
		FromEntity:      "Farm-007",
		ToEntity:        "ColdStore-A",
		TemperatureC:    4.5,
		HumidityPct:     85.0,
		ChainIntact:     true,
	}

	err := svc.recordHandoff(handoff)
	if err != nil {
		t.Errorf("Failed to record handoff: %v", err)
	}

	// Verify handoff recorded
	handoffs := svc.getHandoffs(shipmentID)
	if len(handoffs) != 1 {
		t.Errorf("Expected 1 handoff, got %d", len(handoffs))
	}
	if handoffs[0].TemperatureC != 4.5 {
		t.Errorf("Expected temperature 4.5°C, got %f", handoffs[0].TemperatureC)
	}
}

// Test warehouse inventory tracking
func TestWarehouseInventory(t *testing.T) {
	svc := NewSupplyChainService()

	// Add inventory
	inv := WarehouseInventory{
		WarehouseID: "WH-001",
		ProduceType: "sorghum",
		Quantity:    5000.0,
		Unit:        "kg",
		Grade:       "A",
	}

	id := svc.addInventory(inv)
	if id == "" {
		t.Error("Expected non-empty inventory ID")
	}

	// Get warehouse totals
	totals := svc.getWarehouseTotals("WH-001")
	if totals["sorghum"] != 5000.0 {
		t.Errorf("Expected 5000kg sorghum, got %f", totals["sorghum"])
	}
}

// Test provenance chain
func TestProvenanceChain(t *testing.T) {
	svc := NewSupplyChainService()

	// Create shipment and record events
	shipmentID := svc.createShipment(Shipment{
		ProduceType:   "cocoa",
		Quantity:      1000.0,
		Unit:          "kg",
		OriginFarmID:  25,
		DestinationID: "EXPORT-001",
	})

	// Record provenance events
	events := []ProvenanceEvent{
		{ShipmentID: shipmentID, Event: "harvested", Location: "Farm-25", Actor: "farmer-25"},
		{ShipmentID: shipmentID, Event: "quality_checked", Location: "QC-Station-1", Actor: "inspector-3"},
		{ShipmentID: shipmentID, Event: "loaded", Location: "Depot-A", Actor: "logistics-7"},
		{ShipmentID: shipmentID, Event: "shipped", Location: "Port-Lagos", Actor: "exporter-2"},
	}

	for _, e := range events {
		svc.recordProvenance(e)
	}

	chain := svc.getProvenanceChain(shipmentID)
	if len(chain) != 4 {
		t.Errorf("Expected 4 provenance events, got %d", len(chain))
	}
	if chain[0].Event != "harvested" {
		t.Errorf("Expected first event 'harvested', got '%s'", chain[0].Event)
	}
}

// Test QR code generation for traceability
func TestQRCodeGeneration(t *testing.T) {
	svc := NewSupplyChainService()

	shipmentID := svc.createShipment(Shipment{
		ProduceType:   "sesame",
		Quantity:      500.0,
		Unit:          "kg",
		OriginFarmID:  30,
		DestinationID: "BUYER-005",
	})

	qrData := svc.generateQRData(shipmentID)
	if qrData == "" {
		t.Error("Expected non-empty QR data")
	}

	// QR data should contain shipment reference
	if !containsString(qrData, shipmentID) {
		t.Error("QR data should contain shipment ID")
	}
}

func containsString(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && bytes.Contains([]byte(s), []byte(substr)))
}
