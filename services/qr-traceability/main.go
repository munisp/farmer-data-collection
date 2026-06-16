// QR Code Traceability Service — Go
// Generates and validates QR codes linking produce to farm origin, grade, cold-chain data
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/skip2/go-qrcode"
)

const defaultPort = "8103"

type TraceabilityRecord struct {
	QRCode       string        `json:"qr_code"`
	BatchID      string        `json:"batch_id"`
	ProduceType  string        `json:"produce_type"`
	FarmName     string        `json:"farm_name"`
	FarmerName   string        `json:"farmer_name"`
	Region       string        `json:"region"`
	State        string        `json:"state"`
	HarvestDate  string        `json:"harvest_date"`
	Grade        string        `json:"grade"` // A+, A, B, C, F
	Organic      bool          `json:"organic"`
	ColdChain    *ColdChainLog `json:"cold_chain,omitempty"`
	Signature    string        `json:"signature"`
	CreatedAt    string        `json:"created_at"`
	VerifyURL    string        `json:"verify_url"`
}

type ColdChainLog struct {
	MinTemp     float64 `json:"min_temp_celsius"`
	MaxTemp     float64 `json:"max_temp_celsius"`
	AvgTemp     float64 `json:"avg_temp_celsius"`
	Humidity    float64 `json:"humidity_percent"`
	Duration    string  `json:"duration"`
	Compliant   bool    `json:"compliant"`
	FreshScore  float64 `json:"fresh_score"` // 0-100
}

type GenerateRequest struct {
	BatchID     string        `json:"batch_id"`
	ProduceType string        `json:"produce_type"`
	FarmName    string        `json:"farm_name"`
	FarmerName  string        `json:"farmer_name"`
	Region      string        `json:"region"`
	State       string        `json:"state"`
	HarvestDate string        `json:"harvest_date"`
	Grade       string        `json:"grade"`
	Organic     bool          `json:"organic"`
	ColdChain   *ColdChainLog `json:"cold_chain,omitempty"`
}

type QRService struct {
	signingKey string
	baseURL    string
	records    map[string]*TraceabilityRecord
}

func NewQRService() *QRService {
	baseURL := os.Getenv("QR_BASE_URL")
	if baseURL == "" {
		baseURL = "https://farmconnect.ng/verify"
	}
	return &QRService{
		signingKey: os.Getenv("QR_SIGNING_KEY"),
		baseURL:    baseURL,
		records:    make(map[string]*TraceabilityRecord),
	}
}

func (qs *QRService) sign(data string) string {
	key := qs.signingKey
	if key == "" {
		key = "farmconnect-default-key"
	}
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))[:16]
}

func (qs *QRService) handleGenerate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req GenerateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	sigData := fmt.Sprintf("%s:%s:%s:%s", req.BatchID, req.ProduceType, req.FarmName, req.HarvestDate)
	signature := qs.sign(sigData)
	verifyURL := fmt.Sprintf("%s/%s?sig=%s", qs.baseURL, req.BatchID, signature)

	// QR content = verify URL with essential data
	qrContent := fmt.Sprintf(`{"batch":"%s","produce":"%s","farm":"%s","region":"%s","grade":"%s","harvest":"%s","organic":%v,"verify":"%s"}`,
		req.BatchID, req.ProduceType, req.FarmName, req.Region, req.Grade, req.HarvestDate, req.Organic, verifyURL)

	// Generate QR PNG
	qrPNG, err := qrcode.Encode(qrContent, qrcode.Medium, 512)
	if err != nil {
		http.Error(w, "QR generation failed", http.StatusInternalServerError)
		return
	}

	record := &TraceabilityRecord{
		QRCode:      fmt.Sprintf("data:image/png;base64,%s", encodeBase64(qrPNG)),
		BatchID:     req.BatchID,
		ProduceType: req.ProduceType,
		FarmName:    req.FarmName,
		FarmerName:  req.FarmerName,
		Region:      req.Region,
		State:       req.State,
		HarvestDate: req.HarvestDate,
		Grade:       req.Grade,
		Organic:     req.Organic,
		ColdChain:   req.ColdChain,
		Signature:   signature,
		CreatedAt:   now,
		VerifyURL:   verifyURL,
	}

	qs.records[req.BatchID] = record

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(record)
}

func (qs *QRService) handleVerify(w http.ResponseWriter, r *http.Request) {
	batchID := r.URL.Query().Get("batch_id")
	sig := r.URL.Query().Get("sig")

	if batchID == "" {
		http.Error(w, "batch_id required", http.StatusBadRequest)
		return
	}

	record, exists := qs.records[batchID]
	if !exists {
		http.Error(w, "Batch not found", http.StatusNotFound)
		return
	}

	valid := sig == record.Signature
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"valid":       valid,
		"record":      record,
		"verified_at": time.Now().UTC().Format(time.RFC3339),
	})
}

func (qs *QRService) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"service":   "qr-traceability",
		"records":   len(qs.records),
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func encodeBase64(data []byte) string {
	const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	result := make([]byte, 0, ((len(data)+2)/3)*4)
	for i := 0; i < len(data); i += 3 {
		var b uint32
		remaining := len(data) - i
		b = uint32(data[i]) << 16
		if remaining > 1 {
			b |= uint32(data[i+1]) << 8
		}
		if remaining > 2 {
			b |= uint32(data[i+2])
		}
		result = append(result, base64Chars[(b>>18)&0x3F])
		result = append(result, base64Chars[(b>>12)&0x3F])
		if remaining > 1 {
			result = append(result, base64Chars[(b>>6)&0x3F])
		} else {
			result = append(result, '=')
		}
		if remaining > 2 {
			result = append(result, base64Chars[b&0x3F])
		} else {
			result = append(result, '=')
		}
	}
	return string(result)
}

func main() {
	port := os.Getenv("QR_SERVICE_PORT")
	if port == "" {
		port = defaultPort
	}

	svc := NewQRService()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", svc.handleHealth)
	mux.HandleFunc("/generate", svc.handleGenerate)
	mux.HandleFunc("/verify", svc.handleVerify)

	log.Printf("QR Traceability service starting on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
}
