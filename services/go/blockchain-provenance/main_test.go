package main

import (
	"encoding/json"
	"testing"
)

func TestLedgerCreateAsset(t *testing.T) {
	ledger := NewLedger()

	assetData := `{"cropType":"Kale","variety":"Collard","quantity":50,"unit":"kg","origin":{"village":"Westlands","region":"Nairobi"},"isOrganic":true,"certifications":["organic"]}`
	dataHash := computeHash(assetData)

	txID, blockNum := ledger.CreateAsset("BATCH-001", assetData, dataHash, "user-1")

	if txID == "" {
		t.Error("Expected non-empty txID")
	}
	if blockNum != 0 {
		t.Errorf("Expected blockNum 0, got %d", blockNum)
	}

	asset, ok := ledger.GetAsset("BATCH-001")
	if !ok {
		t.Fatal("Asset not found after creation")
	}
	if asset.CropType != "Kale" {
		t.Errorf("Expected CropType 'Kale', got '%s'", asset.CropType)
	}
	if asset.Status != "registered" {
		t.Errorf("Expected status 'registered', got '%s'", asset.Status)
	}
}

func TestLedgerTransferAsset(t *testing.T) {
	ledger := NewLedger()

	assetData := `{"cropType":"Basil","quantity":10,"unit":"kg"}`
	ledger.CreateAsset("BATCH-002", assetData, computeHash(assetData), "user-1")

	transferData := `{"from":{"entity":"Farm A","type":"farmer"},"to":{"entity":"Hub B","type":"collector"},"location":"Kilimani"}`
	txID, blockNum := ledger.TransferAsset("BATCH-002", transferData, computeHash(transferData), "user-1")

	if txID == "" {
		t.Error("Expected non-empty txID")
	}
	if blockNum != 1 {
		t.Errorf("Expected blockNum 1, got %d", blockNum)
	}

	trail := ledger.GetProvenanceTrail("BATCH-002")
	if len(trail.Transfers) != 1 {
		t.Errorf("Expected 1 transfer, got %d", len(trail.Transfers))
	}
	if trail.Transfers[0].FromEntity != "Farm A" {
		t.Errorf("Expected FromEntity 'Farm A', got '%s'", trail.Transfers[0].FromEntity)
	}
}

func TestLedgerQualityCheck(t *testing.T) {
	ledger := NewLedger()

	assetData := `{"cropType":"Spinach","quantity":25,"unit":"kg"}`
	ledger.CreateAsset("BATCH-003", assetData, computeHash(assetData), "user-1")

	inspectionData := `{"inspector":{"id":"insp-1","name":"John K","org":"KEBS"},"grade":"premium","passed":true}`
	txID, _ := ledger.RecordQualityCheck("BATCH-003", inspectionData, computeHash(inspectionData), "user-1")

	if txID == "" {
		t.Error("Expected non-empty txID")
	}

	asset, _ := ledger.GetAsset("BATCH-003")
	if asset.QualityGrade != "premium" {
		t.Errorf("Expected grade 'premium', got '%s'", asset.QualityGrade)
	}
}

func TestLedgerCertification(t *testing.T) {
	ledger := NewLedger()

	assetData := `{"cropType":"Lettuce","quantity":30,"unit":"kg"}`
	ledger.CreateAsset("BATCH-004", assetData, computeHash(assetData), "user-1")

	certData := `{"certification":{"name":"Organic Kenya","body":"KOBS","id":"cert-001","issuedDate":"2026-01-15"}}`
	txID, _ := ledger.IssueCertification("BATCH-004", certData, computeHash(certData), "user-1")

	if txID == "" {
		t.Error("Expected non-empty txID")
	}

	trail := ledger.GetProvenanceTrail("BATCH-004")
	if len(trail.Certifications) != 1 {
		t.Errorf("Expected 1 certification, got %d", len(trail.Certifications))
	}
}

func TestLedgerBlockChain(t *testing.T) {
	ledger := NewLedger()

	// Create 3 transactions to build a chain
	ledger.CreateAsset("B1", `{"cropType":"A"}`, "h1", "u1")
	ledger.CreateAsset("B2", `{"cropType":"B"}`, "h2", "u1")
	ledger.TransferAsset("B1", `{"from":{"entity":"X","type":"farmer"},"to":{"entity":"Y","type":"collector"}}`, "h3", "u1")

	height := ledger.GetChainHeight()
	if height != 3 {
		t.Errorf("Expected chain height 3, got %d", height)
	}

	block, ok := ledger.GetBlock(0)
	if !ok {
		t.Fatal("Block 0 not found")
	}
	if block.PreviousHash != "0000000000000000000000000000000000000000000000000000000000000000" {
		t.Error("Genesis block should have zero previous hash")
	}

	block1, _ := ledger.GetBlock(1)
	if block1.PreviousHash != block.DataHash {
		t.Error("Block 1 previous hash should match block 0 data hash")
	}
}

func TestLedgerStats(t *testing.T) {
	ledger := NewLedger()

	ledger.CreateAsset("B1", `{"cropType":"A"}`, "h1", "u1")
	ledger.CreateAsset("B2", `{"cropType":"B"}`, "h2", "u1")
	ledger.TransferAsset("B1", `{}`, "h3", "u1")
	ledger.RecordQualityCheck("B1", `{"grade":"premium","passed":true}`, "h4", "u1")
	ledger.IssueCertification("B2", `{"certification":{"name":"Organic"}}`, "h5", "u1")

	stats := ledger.GetStats()
	if stats["totalAssets"].(int) != 2 {
		t.Errorf("Expected 2 assets, got %v", stats["totalAssets"])
	}
	if stats["totalBlocks"].(int) != 5 {
		t.Errorf("Expected 5 blocks, got %v", stats["totalBlocks"])
	}
}

func TestComputeHash(t *testing.T) {
	hash := computeHash("test-data")
	if len(hash) != 64 {
		t.Errorf("Expected 64-char hex hash, got %d chars", len(hash))
	}

	// Same input = same output
	hash2 := computeHash("test-data")
	if hash != hash2 {
		t.Error("Hash should be deterministic")
	}

	// Different input = different output
	hash3 := computeHash("different-data")
	if hash == hash3 {
		t.Error("Different data should produce different hashes")
	}
}

func TestConsumerScanJSON(t *testing.T) {
	result := ConsumerScanResult{
		Product: ConsumerProduct{
			BatchCode:    "BATCH-001",
			Crop:         "Kale",
			Certifications: []string{"organic"},
		},
		Origin: ConsumerOrigin{
			Country: "Kenya",
		},
		Verification: ConsumerVerification{
			BlockchainVerified: true,
			DataIntegrity:      "Verified on Hyperledger Fabric",
		},
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("Failed to marshal: %v", err)
	}
	if len(data) == 0 {
		t.Error("Expected non-empty JSON")
	}
}
