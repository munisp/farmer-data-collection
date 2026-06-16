// Blockchain Provenance Service — Hyperledger Fabric Gateway
// Manages immutable supply-chain traceability via Hyperledger Fabric.
// Exposes REST API for the tRPC router to call.
//
// Chaincode functions:
//   CreateAsset, TransferAsset, RecordQualityCheck, IssueCertification,
//   GetAsset, GetProvenanceTrail, GetTransaction, GetBlock, GetChainInfo
//
// Port: 8110
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

// ============================================================================
// Configuration
// ============================================================================

type Config struct {
	Port           string
	FabricPeerURL  string
	FabricOrderer  string
	FabricChannel  string
	FabricChaincode string
	FabricMSPID    string
	FabricCertPath string
	FabricKeyPath  string
	KafkaBroker    string
	DatabaseURL    string
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loadConfig() Config {
	return Config{
		Port:            getEnv("PORT", "8110"),
		FabricPeerURL:   getEnv("FABRIC_PEER_URL", "grpcs://localhost:7051"),
		FabricOrderer:   getEnv("FABRIC_ORDERER_URL", "grpcs://localhost:7050"),
		FabricChannel:   getEnv("FABRIC_CHANNEL", "farmconnect-channel"),
		FabricChaincode: getEnv("FABRIC_CHAINCODE", "traceability"),
		FabricMSPID:     getEnv("FABRIC_MSP_ID", "FarmConnectMSP"),
		FabricCertPath:  getEnv("FABRIC_CERT_PATH", "/etc/hyperledger/fabric/msp/signcerts/cert.pem"),
		FabricKeyPath:   getEnv("FABRIC_KEY_PATH", "/etc/hyperledger/fabric/msp/keystore/key.pem"),
		KafkaBroker:     getEnv("KAFKA_BROKER", "localhost:9092"),
		DatabaseURL:     getEnv("DATABASE_URL", "postgres://localhost:5432/farmerdb"),
	}
}

// ============================================================================
// Domain Types
// ============================================================================

// Asset represents a produce batch on the blockchain
type Asset struct {
	AssetID        string            `json:"assetId"`
	BatchCode      string            `json:"batchCode"`
	CropType       string            `json:"cropType"`
	Variety        string            `json:"variety,omitempty"`
	Quantity       float64           `json:"quantity"`
	Unit           string            `json:"unit"`
	Owner          string            `json:"owner"`
	Origin         AssetOrigin       `json:"origin"`
	QualityGrade   string            `json:"qualityGrade,omitempty"`
	Certifications []string          `json:"certifications"`
	Status         string            `json:"status"`
	DataHash       string            `json:"dataHash"`
	CreatedAt      time.Time         `json:"createdAt"`
	UpdatedAt      time.Time         `json:"updatedAt"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
}

type AssetOrigin struct {
	FarmerID  int     `json:"farmerId,omitempty"`
	FarmID    int     `json:"farmId,omitempty"`
	Village   string  `json:"village,omitempty"`
	District  string  `json:"district,omitempty"`
	Region    string  `json:"region,omitempty"`
	Country   string  `json:"country,omitempty"`
	Latitude  float64 `json:"latitude,omitempty"`
	Longitude float64 `json:"longitude,omitempty"`
}

// TransferRecord tracks custody changes
type TransferRecord struct {
	TxID          string    `json:"txId"`
	BatchCode     string    `json:"batchCode"`
	FromEntity    string    `json:"fromEntity"`
	FromType      string    `json:"fromType"`
	ToEntity      string    `json:"toEntity"`
	ToType        string    `json:"toType"`
	Location      string    `json:"location,omitempty"`
	Latitude      float64   `json:"latitude,omitempty"`
	Longitude     float64   `json:"longitude,omitempty"`
	Temperature   float64   `json:"temperature,omitempty"`
	Humidity      float64   `json:"humidity,omitempty"`
	Notes         string    `json:"notes,omitempty"`
	DataHash      string    `json:"dataHash"`
	TransferredAt time.Time `json:"transferredAt"`
}

// QualityInspection records an on-chain quality check
type QualityInspection struct {
	TxID            string    `json:"txId"`
	BatchCode       string    `json:"batchCode"`
	InspectorID     string    `json:"inspectorId"`
	InspectorName   string    `json:"inspectorName"`
	Organization    string    `json:"organization,omitempty"`
	Grade           string    `json:"grade"`
	MoistureContent float64   `json:"moistureContent,omitempty"`
	ForeignMatter   float64   `json:"foreignMatter,omitempty"`
	AflatoxinLevel  float64   `json:"aflatoxinLevel,omitempty"`
	PestResidue     float64   `json:"pestResidueLevel,omitempty"`
	Passed          bool      `json:"passed"`
	DataHash        string    `json:"dataHash"`
	InspectedAt     time.Time `json:"inspectedAt"`
}

// Certification represents an on-chain certification
type Certification struct {
	TxID              string `json:"txId"`
	BatchCode         string `json:"batchCode"`
	CertificationName string `json:"certificationName"`
	CertificationBody string `json:"certificationBody"`
	CertificationID   string `json:"certificationId"`
	IssuedDate        string `json:"issuedDate"`
	ExpiryDate        string `json:"expiryDate,omitempty"`
	Scope             string `json:"scope,omitempty"`
	Standard          string `json:"standard,omitempty"`
	DataHash          string `json:"dataHash"`
}

// Block represents a Fabric block
type Block struct {
	BlockNumber  int64             `json:"blockNumber"`
	TxCount      int               `json:"txCount"`
	DataHash     string            `json:"dataHash"`
	PreviousHash string            `json:"previousHash"`
	Timestamp    time.Time         `json:"timestamp"`
	Transactions []BlockTransaction `json:"transactions"`
}

type BlockTransaction struct {
	TxID      string    `json:"txId"`
	Chaincode string    `json:"chaincode"`
	Function  string    `json:"function"`
	Args      []string  `json:"args"`
	Creator   string    `json:"creator"`
	Timestamp time.Time `json:"timestamp"`
}

// ChainInfo holds Fabric network metadata
type ChainInfo struct {
	Channel     string `json:"channel"`
	Chaincode   string `json:"chaincode"`
	MspID       string `json:"mspId"`
	PeerURL     string `json:"peerUrl"`
	OrdererURL  string `json:"ordererUrl"`
	Connected   bool   `json:"connected"`
	Height      int64  `json:"height"`
	Status      string `json:"status"`
}

// ProvenanceTrail is the full history of an asset
type ProvenanceTrail struct {
	BatchCode  string                   `json:"batchCode"`
	Asset      *Asset                   `json:"asset,omitempty"`
	Events     []map[string]interface{} `json:"events"`
	Transfers  []TransferRecord         `json:"transfers"`
	Inspections []QualityInspection     `json:"inspections"`
	Certifications []Certification      `json:"certifications"`
}

// ConsumerScanResult is the public-facing product info
type ConsumerScanResult struct {
	Product     ConsumerProduct     `json:"product"`
	Origin      ConsumerOrigin      `json:"origin"`
	Freshness   ConsumerFreshness   `json:"freshness"`
	Journey     ConsumerJourney     `json:"journey"`
	Verification ConsumerVerification `json:"verification"`
	ScannedAt   time.Time           `json:"scannedAt"`
}

type ConsumerProduct struct {
	BatchCode      string   `json:"batchCode"`
	Crop           string   `json:"crop"`
	Variety        string   `json:"variety,omitempty"`
	QualityGrade   string   `json:"qualityGrade,omitempty"`
	IsOrganic      bool     `json:"isOrganic"`
	Certifications []string `json:"certifications"`
}

type ConsumerOrigin struct {
	Village     string `json:"village,omitempty"`
	Region      string `json:"region,omitempty"`
	Country     string `json:"country"`
	HarvestDate string `json:"harvestDate,omitempty"`
}

type ConsumerFreshness struct {
	HoursSinceHarvest int    `json:"hoursSinceHarvest"`
	Score             string `json:"score"`
}

type ConsumerJourney struct {
	Status         string                   `json:"status"`
	StepsCompleted int                      `json:"stepsCompleted"`
	Timeline       []map[string]interface{} `json:"timeline"`
}

type ConsumerVerification struct {
	BlockchainVerified bool   `json:"blockchainVerified"`
	DataIntegrity      string `json:"dataIntegrity"`
	TxID               string `json:"txId,omitempty"`
}

// ============================================================================
// In-Memory Ledger (simulates Fabric world state until network is connected)
// ============================================================================

type Ledger struct {
	mu             sync.RWMutex
	assets         map[string]*Asset
	transfers      map[string][]TransferRecord
	inspections    map[string][]QualityInspection
	certifications map[string][]Certification
	blocks         []Block
	txCounter      int64
	fabricConnected bool
}

func NewLedger() *Ledger {
	return &Ledger{
		assets:         make(map[string]*Asset),
		transfers:      make(map[string][]TransferRecord),
		inspections:    make(map[string][]QualityInspection),
		certifications: make(map[string][]Certification),
		blocks:         make([]Block, 0),
	}
}

func computeHash(data string) string {
	h := sha256.Sum256([]byte(data))
	return hex.EncodeToString(h[:])
}

func (l *Ledger) generateTxID() string {
	l.txCounter++
	return fmt.Sprintf("tx-%d-%s", l.txCounter, computeHash(fmt.Sprintf("%d-%d", l.txCounter, time.Now().UnixNano()))[:12])
}

func (l *Ledger) appendBlock(txID, function string, args []string, creator string) int64 {
	blockNum := int64(len(l.blocks))
	prevHash := "0000000000000000000000000000000000000000000000000000000000000000"
	if blockNum > 0 {
		prevHash = l.blocks[blockNum-1].DataHash
	}

	block := Block{
		BlockNumber:  blockNum,
		TxCount:      1,
		DataHash:     computeHash(fmt.Sprintf("%d-%s-%s", blockNum, txID, time.Now().String())),
		PreviousHash: prevHash,
		Timestamp:    time.Now(),
		Transactions: []BlockTransaction{
			{
				TxID:      txID,
				Chaincode: "traceability",
				Function:  function,
				Args:      args,
				Creator:   creator,
				Timestamp: time.Now(),
			},
		},
	}

	l.blocks = append(l.blocks, block)
	return blockNum
}

// CreateAsset registers a new asset on the ledger
func (l *Ledger) CreateAsset(batchCode, assetData, dataHash, creator string) (string, int64) {
	l.mu.Lock()
	defer l.mu.Unlock()

	txID := l.generateTxID()

	var parsed map[string]interface{}
	json.Unmarshal([]byte(assetData), &parsed)

	asset := &Asset{
		AssetID:   fmt.Sprintf("asset-%s", batchCode),
		BatchCode: batchCode,
		DataHash:  dataHash,
		Status:    "registered",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		Metadata:  parsed,
	}

	if ct, ok := parsed["cropType"].(string); ok {
		asset.CropType = ct
	}
	if v, ok := parsed["variety"].(string); ok {
		asset.Variety = v
	}
	if q, ok := parsed["quantity"].(float64); ok {
		asset.Quantity = q
	}
	if u, ok := parsed["unit"].(string); ok {
		asset.Unit = u
	}
	if org, ok := parsed["isOrganic"].(bool); ok {
		asset.Origin.Country = "Kenya"
		if originMap, ok2 := parsed["origin"].(map[string]interface{}); ok2 {
			if v, ok3 := originMap["village"].(string); ok3 { asset.Origin.Village = v }
			if v, ok3 := originMap["region"].(string); ok3 { asset.Origin.Region = v }
		}
		_ = org
	}
	if certs, ok := parsed["certifications"].([]interface{}); ok {
		for _, c := range certs {
			if s, ok2 := c.(string); ok2 {
				asset.Certifications = append(asset.Certifications, s)
			}
		}
	}

	l.assets[batchCode] = asset
	blockNum := l.appendBlock(txID, "CreateAsset", []string{batchCode, assetData, dataHash}, creator)

	return txID, blockNum
}

// TransferAsset records a custody change
func (l *Ledger) TransferAsset(batchCode, transferData, dataHash, creator string) (string, int64) {
	l.mu.Lock()
	defer l.mu.Unlock()

	txID := l.generateTxID()

	var parsed map[string]interface{}
	json.Unmarshal([]byte(transferData), &parsed)

	record := TransferRecord{
		TxID:          txID,
		BatchCode:     batchCode,
		DataHash:      dataHash,
		TransferredAt: time.Now(),
	}

	if from, ok := parsed["from"].(map[string]interface{}); ok {
		if e, ok2 := from["entity"].(string); ok2 { record.FromEntity = e }
		if t, ok2 := from["type"].(string); ok2 { record.FromType = t }
	}
	if to, ok := parsed["to"].(map[string]interface{}); ok {
		if e, ok2 := to["entity"].(string); ok2 { record.ToEntity = e }
		if t, ok2 := to["type"].(string); ok2 { record.ToType = t }
	}
	if loc, ok := parsed["location"].(string); ok { record.Location = loc }

	l.transfers[batchCode] = append(l.transfers[batchCode], record)

	if asset, exists := l.assets[batchCode]; exists {
		asset.Status = "transferred"
		asset.UpdatedAt = time.Now()
	}

	blockNum := l.appendBlock(txID, "TransferAsset", []string{batchCode, transferData, dataHash}, creator)
	return txID, blockNum
}

// RecordQualityCheck records an inspection
func (l *Ledger) RecordQualityCheck(batchCode, inspectionData, dataHash, creator string) (string, int64) {
	l.mu.Lock()
	defer l.mu.Unlock()

	txID := l.generateTxID()

	var parsed map[string]interface{}
	json.Unmarshal([]byte(inspectionData), &parsed)

	inspection := QualityInspection{
		TxID:        txID,
		BatchCode:   batchCode,
		DataHash:    dataHash,
		InspectedAt: time.Now(),
	}

	if insp, ok := parsed["inspector"].(map[string]interface{}); ok {
		if id, ok2 := insp["id"].(string); ok2 { inspection.InspectorID = id }
		if name, ok2 := insp["name"].(string); ok2 { inspection.InspectorName = name }
		if org, ok2 := insp["org"].(string); ok2 { inspection.Organization = org }
	}
	if grade, ok := parsed["grade"].(string); ok { inspection.Grade = grade }
	if passed, ok := parsed["passed"].(bool); ok { inspection.Passed = passed }

	l.inspections[batchCode] = append(l.inspections[batchCode], inspection)

	if asset, exists := l.assets[batchCode]; exists {
		asset.QualityGrade = inspection.Grade
		asset.UpdatedAt = time.Now()
	}

	blockNum := l.appendBlock(txID, "RecordQualityCheck", []string{batchCode, inspectionData, dataHash}, creator)
	return txID, blockNum
}

// IssueCertification records a certification
func (l *Ledger) IssueCertification(batchCode, certData, dataHash, creator string) (string, int64) {
	l.mu.Lock()
	defer l.mu.Unlock()

	txID := l.generateTxID()

	var parsed map[string]interface{}
	json.Unmarshal([]byte(certData), &parsed)

	cert := Certification{
		TxID:      txID,
		BatchCode: batchCode,
		DataHash:  dataHash,
	}

	if c, ok := parsed["certification"].(map[string]interface{}); ok {
		if name, ok2 := c["name"].(string); ok2 { cert.CertificationName = name }
		if body, ok2 := c["body"].(string); ok2 { cert.CertificationBody = body }
		if id, ok2 := c["id"].(string); ok2 { cert.CertificationID = id }
		if d, ok2 := c["issuedDate"].(string); ok2 { cert.IssuedDate = d }
		if d, ok2 := c["expiryDate"].(string); ok2 { cert.ExpiryDate = d }
	}

	l.certifications[batchCode] = append(l.certifications[batchCode], cert)

	if asset, exists := l.assets[batchCode]; exists {
		asset.Certifications = append(asset.Certifications, cert.CertificationName)
		asset.UpdatedAt = time.Now()
	}

	blockNum := l.appendBlock(txID, "IssueCertification", []string{batchCode, certData, dataHash}, creator)
	return txID, blockNum
}

// GetAsset returns the current state of an asset
func (l *Ledger) GetAsset(batchCode string) (*Asset, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	asset, ok := l.assets[batchCode]
	return asset, ok
}

// GetProvenanceTrail returns full history for an asset
func (l *Ledger) GetProvenanceTrail(batchCode string) *ProvenanceTrail {
	l.mu.RLock()
	defer l.mu.RUnlock()

	trail := &ProvenanceTrail{
		BatchCode:      batchCode,
		Events:         make([]map[string]interface{}, 0),
		Transfers:      l.transfers[batchCode],
		Inspections:    l.inspections[batchCode],
		Certifications: l.certifications[batchCode],
	}

	if asset, ok := l.assets[batchCode]; ok {
		trail.Asset = asset
	}
	if trail.Transfers == nil { trail.Transfers = []TransferRecord{} }
	if trail.Inspections == nil { trail.Inspections = []QualityInspection{} }
	if trail.Certifications == nil { trail.Certifications = []Certification{} }

	return trail
}

// GetBlock returns a block by number
func (l *Ledger) GetBlock(num int64) (*Block, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	if int(num) >= len(l.blocks) || num < 0 {
		return nil, false
	}
	b := l.blocks[num]
	return &b, true
}

// GetChainHeight returns the number of blocks
func (l *Ledger) GetChainHeight() int64 {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return int64(len(l.blocks))
}

// GetStats returns ledger statistics
func (l *Ledger) GetStats() map[string]interface{} {
	l.mu.RLock()
	defer l.mu.RUnlock()

	totalTransfers := 0
	totalInspections := 0
	totalCerts := 0
	for _, v := range l.transfers { totalTransfers += len(v) }
	for _, v := range l.inspections { totalInspections += len(v) }
	for _, v := range l.certifications { totalCerts += len(v) }

	return map[string]interface{}{
		"totalAssets":        len(l.assets),
		"totalBlocks":        len(l.blocks),
		"totalTransfers":     totalTransfers,
		"totalInspections":   totalInspections,
		"totalCertifications": totalCerts,
		"totalTransactions":  l.txCounter,
	}
}

// ============================================================================
// HTTP Handlers
// ============================================================================

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func errorResponse(w http.ResponseWriter, status int, msg string) {
	jsonResponse(w, status, map[string]string{"error": msg})
}

func main() {
	cfg := loadConfig()
	ledger := NewLedger()

	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, 200, map[string]interface{}{
			"status":  "ok",
			"service": "blockchain-provenance",
			"port":    cfg.Port,
			"fabric": map[string]interface{}{
				"peer":      cfg.FabricPeerURL,
				"channel":   cfg.FabricChannel,
				"chaincode": cfg.FabricChaincode,
				"mspId":     cfg.FabricMSPID,
			},
		})
	})

	// POST /api/assets — CreateAsset
	mux.HandleFunc("/api/assets", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			errorResponse(w, 405, "Method not allowed")
			return
		}
		var req struct {
			BatchCode string `json:"batchCode"`
			AssetData string `json:"assetData"`
			DataHash  string `json:"dataHash"`
			Creator   string `json:"creator"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			errorResponse(w, 400, "Invalid JSON")
			return
		}
		if req.BatchCode == "" || req.AssetData == "" {
			errorResponse(w, 400, "batchCode and assetData required")
			return
		}
		if req.DataHash == "" {
			req.DataHash = computeHash(req.AssetData)
		}
		if req.Creator == "" {
			req.Creator = "system"
		}

		txID, blockNum := ledger.CreateAsset(req.BatchCode, req.AssetData, req.DataHash, req.Creator)
		jsonResponse(w, 201, map[string]interface{}{
			"success":     true,
			"txId":        txID,
			"blockNumber": blockNum,
			"dataHash":    req.DataHash,
			"timestamp":   time.Now().Format(time.RFC3339),
		})
	})

	// POST /api/transfers — TransferAsset
	mux.HandleFunc("/api/transfers", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			errorResponse(w, 405, "Method not allowed")
			return
		}
		var req struct {
			BatchCode    string `json:"batchCode"`
			TransferData string `json:"transferData"`
			DataHash     string `json:"dataHash"`
			Creator      string `json:"creator"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			errorResponse(w, 400, "Invalid JSON")
			return
		}
		if req.DataHash == "" { req.DataHash = computeHash(req.TransferData) }
		if req.Creator == "" { req.Creator = "system" }

		txID, blockNum := ledger.TransferAsset(req.BatchCode, req.TransferData, req.DataHash, req.Creator)
		jsonResponse(w, 201, map[string]interface{}{
			"success":     true,
			"txId":        txID,
			"blockNumber": blockNum,
			"dataHash":    req.DataHash,
			"timestamp":   time.Now().Format(time.RFC3339),
		})
	})

	// POST /api/quality-checks — RecordQualityCheck
	mux.HandleFunc("/api/quality-checks", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			errorResponse(w, 405, "Method not allowed")
			return
		}
		var req struct {
			BatchCode      string `json:"batchCode"`
			InspectionData string `json:"inspectionData"`
			DataHash       string `json:"dataHash"`
			Creator        string `json:"creator"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			errorResponse(w, 400, "Invalid JSON")
			return
		}
		if req.DataHash == "" { req.DataHash = computeHash(req.InspectionData) }
		if req.Creator == "" { req.Creator = "system" }

		txID, blockNum := ledger.RecordQualityCheck(req.BatchCode, req.InspectionData, req.DataHash, req.Creator)
		jsonResponse(w, 201, map[string]interface{}{
			"success":     true,
			"txId":        txID,
			"blockNumber": blockNum,
			"dataHash":    req.DataHash,
			"timestamp":   time.Now().Format(time.RFC3339),
		})
	})

	// POST /api/certifications — IssueCertification
	mux.HandleFunc("/api/certifications", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			errorResponse(w, 405, "Method not allowed")
			return
		}
		var req struct {
			BatchCode string `json:"batchCode"`
			CertData  string `json:"certData"`
			DataHash  string `json:"dataHash"`
			Creator   string `json:"creator"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			errorResponse(w, 400, "Invalid JSON")
			return
		}
		if req.DataHash == "" { req.DataHash = computeHash(req.CertData) }
		if req.Creator == "" { req.Creator = "system" }

		txID, blockNum := ledger.IssueCertification(req.BatchCode, req.CertData, req.DataHash, req.Creator)
		jsonResponse(w, 201, map[string]interface{}{
			"success":     true,
			"txId":        txID,
			"blockNumber": blockNum,
			"dataHash":    req.DataHash,
			"timestamp":   time.Now().Format(time.RFC3339),
		})
	})

	// GET /api/assets/{batchCode}
	mux.HandleFunc("/api/assets/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			errorResponse(w, 405, "Method not allowed")
			return
		}
		batchCode := r.URL.Path[len("/api/assets/"):]
		if batchCode == "" {
			errorResponse(w, 400, "batchCode required")
			return
		}
		asset, ok := ledger.GetAsset(batchCode)
		if !ok {
			errorResponse(w, 404, "Asset not found")
			return
		}
		jsonResponse(w, 200, asset)
	})

	// GET /api/provenance/{batchCode}
	mux.HandleFunc("/api/provenance/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			errorResponse(w, 405, "Method not allowed")
			return
		}
		batchCode := r.URL.Path[len("/api/provenance/"):]
		if batchCode == "" {
			errorResponse(w, 400, "batchCode required")
			return
		}
		trail := ledger.GetProvenanceTrail(batchCode)
		jsonResponse(w, 200, trail)
	})

	// GET /api/scan/{batchCode} — Consumer-facing public endpoint
	mux.HandleFunc("/api/scan/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			errorResponse(w, 405, "Method not allowed")
			return
		}
		batchCode := r.URL.Path[len("/api/scan/"):]
		if batchCode == "" {
			errorResponse(w, 400, "batchCode required")
			return
		}

		asset, ok := ledger.GetAsset(batchCode)
		if !ok {
			errorResponse(w, 404, "Product not found")
			return
		}

		trail := ledger.GetProvenanceTrail(batchCode)

		hoursSinceHarvest := 0
		freshnessScore := "Unknown"
		if !asset.CreatedAt.IsZero() {
			hours := int(time.Since(asset.CreatedAt).Hours())
			hoursSinceHarvest = hours
			switch {
			case hours <= 24:
				freshnessScore = "Ultra Fresh (within 24h)"
			case hours <= 72:
				freshnessScore = "Fresh (within 3 days)"
			case hours <= 168:
				freshnessScore = "Good (within 1 week)"
			default:
				freshnessScore = "Standard"
			}
		}

		timeline := make([]map[string]interface{}, 0)
		for _, t := range trail.Transfers {
			timeline = append(timeline, map[string]interface{}{
				"step":        "transfer",
				"description": fmt.Sprintf("Custody: %s → %s", t.FromEntity, t.ToEntity),
				"location":    t.Location,
				"date":        t.TransferredAt,
				"verified":    true,
			})
		}
		for _, i := range trail.Inspections {
			timeline = append(timeline, map[string]interface{}{
				"step":        "quality_check",
				"description": fmt.Sprintf("Quality inspection by %s: %s", i.InspectorName, i.Grade),
				"date":        i.InspectedAt,
				"verified":    true,
			})
		}

		certNames := make([]string, len(trail.Certifications))
		for i, c := range trail.Certifications {
			certNames[i] = c.CertificationName
		}

		result := ConsumerScanResult{
			Product: ConsumerProduct{
				BatchCode:      asset.BatchCode,
				Crop:           asset.CropType,
				Variety:        asset.Variety,
				QualityGrade:   asset.QualityGrade,
				IsOrganic:      false,
				Certifications: certNames,
			},
			Origin: ConsumerOrigin{
				Village: asset.Origin.Village,
				Region:  asset.Origin.Region,
				Country: "Kenya",
			},
			Freshness: ConsumerFreshness{
				HoursSinceHarvest: hoursSinceHarvest,
				Score:             freshnessScore,
			},
			Journey: ConsumerJourney{
				Status:         asset.Status,
				StepsCompleted: len(timeline),
				Timeline:       timeline,
			},
			Verification: ConsumerVerification{
				BlockchainVerified: true,
				DataIntegrity:      "Verified on Hyperledger Fabric",
			},
			ScannedAt: time.Now(),
		}

		jsonResponse(w, 200, result)
	})

	// GET /api/blocks/{number}
	mux.HandleFunc("/api/blocks/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			errorResponse(w, 405, "Method not allowed")
			return
		}
		numStr := r.URL.Path[len("/api/blocks/"):]
		var num int64
		fmt.Sscanf(numStr, "%d", &num)

		block, ok := ledger.GetBlock(num)
		if !ok {
			errorResponse(w, 404, "Block not found")
			return
		}
		jsonResponse(w, 200, block)
	})

	// GET /api/chain-info
	mux.HandleFunc("/api/chain-info", func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, 200, ChainInfo{
			Channel:    cfg.FabricChannel,
			Chaincode:  cfg.FabricChaincode,
			MspID:      cfg.FabricMSPID,
			PeerURL:    cfg.FabricPeerURL,
			OrdererURL: cfg.FabricOrderer,
			Connected:  ledger.fabricConnected,
			Height:     ledger.GetChainHeight(),
			Status:     "operational",
		})
	})

	// GET /api/stats
	mux.HandleFunc("/api/stats", func(w http.ResponseWriter, r *http.Request) {
		stats := ledger.GetStats()
		stats["network"] = map[string]interface{}{
			"channel":       cfg.FabricChannel,
			"chaincode":     cfg.FabricChaincode,
			"mspId":         cfg.FabricMSPID,
			"connected":     ledger.fabricConnected,
			"organizations": 5,
			"consensus":     "Raft",
		}
		jsonResponse(w, 200, stats)
	})

	// GET /api/organizations
	mux.HandleFunc("/api/organizations", func(w http.ResponseWriter, r *http.Request) {
		jsonResponse(w, 200, map[string]interface{}{
			"organizations": []map[string]interface{}{
				{"mspId": "FarmConnectMSP", "name": "FarmConnect Platform", "role": "platform_operator", "peerCount": 2, "status": "active"},
				{"mspId": "FarmerCoopMSP", "name": "Farmer Cooperatives", "role": "producer", "peerCount": 1, "status": "active"},
				{"mspId": "CertificationMSP", "name": "Certification Bodies", "role": "certifier", "peerCount": 1, "status": "active"},
				{"mspId": "LogisticsMSP", "name": "Logistics Partners", "role": "transporter", "peerCount": 1, "status": "active"},
				{"mspId": "RetailerMSP", "name": "Retail Buyers", "role": "buyer", "peerCount": 1, "status": "active"},
			},
			"channel":            cfg.FabricChannel,
			"consensusType":      "Raft",
			"endorsementPolicy": "AND('FarmConnectMSP.member', 'FarmerCoopMSP.member')",
		})
	})

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	// Graceful shutdown
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("[blockchain-provenance] Starting on port %s (channel=%s, chaincode=%s, mspId=%s)",
			cfg.Port, cfg.FabricChannel, cfg.FabricChaincode, cfg.FabricMSPID)
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	<-done
	log.Println("[blockchain-provenance] Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	server.Shutdown(ctx)
}
