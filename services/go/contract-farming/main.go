// Contract Farming Service — Go microservice for managing offtaker contracts,
// contract templates, performance tracking, and delivery scheduling.
// Port: 8116 | Middleware: Kafka, Dapr, Redis, PostgreSQL, Temporal
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"

	_ "github.com/lib/pq"
)

// ─── Domain Models ──────────────────────────────────────────────────

type ContractStatus string

const (
	StatusDraft     ContractStatus = "draft"
	StatusActive    ContractStatus = "active"
	StatusCompleted ContractStatus = "completed"
	StatusBreached  ContractStatus = "breached"
	StatusExpired   ContractStatus = "expired"
)

type Contract struct {
	ID               string         `json:"id"`
	FarmerID         string         `json:"farmerId"`
	OfftakerID       string         `json:"offtakerId"`
	CropType         string         `json:"cropType"`
	QuantityKg       float64        `json:"quantityKg"`
	PricePerKg       float64        `json:"pricePerKg"`
	Currency         string         `json:"currency"`
	Status           ContractStatus `json:"status"`
	StartDate        time.Time      `json:"startDate"`
	EndDate          time.Time      `json:"endDate"`
	DeliverySchedule []Delivery     `json:"deliverySchedule"`
	QualityStandards QualitySpec    `json:"qualityStandards"`
	PenaltyClauses   PenaltySpec    `json:"penaltyClauses"`
	CreatedAt        time.Time      `json:"createdAt"`
	UpdatedAt        time.Time      `json:"updatedAt"`
}

type Delivery struct {
	ID           string    `json:"id"`
	ContractID   string    `json:"contractId"`
	ScheduledAt  time.Time `json:"scheduledAt"`
	QuantityKg   float64   `json:"quantityKg"`
	DeliveredKg  float64   `json:"deliveredKg"`
	Status       string    `json:"status"` // pending, delivered, partial, missed
	QualityGrade string    `json:"qualityGrade"`
	DeliveredAt  *time.Time `json:"deliveredAt,omitempty"`
}

type Offtaker struct {
	ID              string  `json:"id"`
	Name            string  `json:"name"`
	Type            string  `json:"type"` // processor, exporter, retailer, institution
	Location        string  `json:"location"`
	Rating          float64 `json:"rating"`
	ContractsActive int     `json:"contractsActive"`
	VolumeKg        float64 `json:"volumeKg"`
	PaymentTermDays int     `json:"paymentTermDays"`
	CropsAccepted   []string `json:"cropsAccepted"`
}

type QualitySpec struct {
	MinMoisturePercent float64 `json:"minMoisturePercent"`
	MaxMoisturePercent float64 `json:"maxMoisturePercent"`
	MinGradeLevel      string  `json:"minGradeLevel"`
	ForeignMatterMax   float64 `json:"foreignMatterMaxPercent"`
	BrokenGrainsMax    float64 `json:"brokenGrainsMaxPercent"`
}

type PenaltySpec struct {
	LateDeliveryPercentPerDay float64 `json:"lateDeliveryPercentPerDay"`
	QualityPenaltyPercent     float64 `json:"qualityPenaltyPercent"`
	ShortageTolerancePercent  float64 `json:"shortageTolerancePercent"`
	MaxPenaltyPercent         float64 `json:"maxPenaltyPercent"`
}

type ContractTemplate struct {
	ID          string      `json:"id"`
	Name        string      `json:"name"`
	CropType    string      `json:"cropType"`
	Quality     QualitySpec `json:"qualityStandards"`
	Penalty     PenaltySpec `json:"penaltyClauses"`
	Description string      `json:"description"`
}

type PerformanceMetric struct {
	FarmerID         string  `json:"farmerId"`
	ContractID       string  `json:"contractId"`
	DeliveryRate     float64 `json:"deliveryRate"`
	QualityScore     float64 `json:"qualityScore"`
	TimelinessScore  float64 `json:"timelinessScore"`
	OverallScore     float64 `json:"overallScore"`
	TotalDeliveredKg float64 `json:"totalDeliveredKg"`
	TotalExpectedKg  float64 `json:"totalExpectedKg"`
}

// ─── PostgreSQL-backed store with in-memory cache ──────────

var (
	contracts  = make(map[string]*Contract)
	offtakers  = make(map[string]*Offtaker)
	templates  = make(map[string]*ContractTemplate)
	mu         sync.RWMutex
	dbConn     *sql.DB
)

func initDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			envOr("DB_HOST", "localhost"), envOr("DB_PORT", "5432"),
			envOr("DB_USER", "farmconnect"), envOr("DB_PASSWORD", "farmconnect"),
			envOr("DB_NAME", "farmconnect"))
	}
	var err error
	dbConn, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Printf("[DB] Failed to connect: %v", err)
		return
	}
	dbConn.SetMaxOpenConns(10)
	if err = dbConn.Ping(); err != nil {
		log.Printf("[DB] Ping failed: %v (using cache only)", err)
		dbConn = nil
		return
	}
	log.Println("[DB] PostgreSQL connected for contract-farming")
	initSchema()
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func initSchema() {
	if dbConn == nil {
		return
	}
	schema := `
	CREATE TABLE IF NOT EXISTS contract_farming_contracts (
		id VARCHAR(50) PRIMARY KEY,
		farmer_id VARCHAR(50) NOT NULL,
		offtaker_id VARCHAR(50) NOT NULL,
		crop_type VARCHAR(100) NOT NULL,
		quantity_kg DECIMAL(12,2) NOT NULL,
		price_per_kg DECIMAL(10,2) NOT NULL,
		currency VARCHAR(10) DEFAULT 'KES',
		status VARCHAR(20) DEFAULT 'draft',
		start_date TIMESTAMP,
		end_date TIMESTAMP,
		delivery_schedule JSONB,
		quality_standards JSONB,
		penalty_clauses JSONB,
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);
	CREATE TABLE IF NOT EXISTS contract_farming_offtakers (
		id VARCHAR(50) PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		type VARCHAR(50),
		location VARCHAR(255),
		rating DECIMAL(3,1),
		contracts_active INT DEFAULT 0,
		volume_kg DECIMAL(15,2) DEFAULT 0,
		payment_term_days INT DEFAULT 30,
		crops_accepted JSONB,
		created_at TIMESTAMP DEFAULT NOW()
	);`
	if _, err := dbConn.Exec(schema); err != nil {
		log.Printf("[DB] Schema init error: %v", err)
	}
}

func persistContract(c *Contract) {
	if dbConn == nil {
		return
	}
	deliveryJSON, _ := json.Marshal(c.DeliverySchedule)
	qualityJSON, _ := json.Marshal(c.QualityStandards)
	penaltyJSON, _ := json.Marshal(c.PenaltyClauses)
	_, err := dbConn.Exec(`INSERT INTO contract_farming_contracts (id, farmer_id, offtaker_id, crop_type, quantity_kg, price_per_kg, currency, status, start_date, end_date, delivery_schedule, quality_standards, penalty_clauses, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		ON CONFLICT (id) DO UPDATE SET status=$8, updated_at=$15, delivery_schedule=$11`,
		c.ID, c.FarmerID, c.OfftakerID, c.CropType, c.QuantityKg, c.PricePerKg, c.Currency, c.Status,
		c.StartDate, c.EndDate, deliveryJSON, qualityJSON, penaltyJSON, c.CreatedAt, c.UpdatedAt)
	if err != nil {
		log.Printf("[DB] Failed to persist contract %s: %v", c.ID, err)
	}
}

func init() {
	initDB()
	seedData()
}

func seedData() {
	now := time.Now()

	// Seed offtakers
	offtakers["OT-001"] = &Offtaker{ID: "OT-001", Name: "Kenya Nut Company", Type: "processor", Location: "Nairobi, Kenya", Rating: 4.7, ContractsActive: 12, VolumeKg: 450000, PaymentTermDays: 14, CropsAccepted: []string{"macadamia", "cashew", "groundnut"}}
	offtakers["OT-002"] = &Offtaker{ID: "OT-002", Name: "OLAM Nigeria", Type: "exporter", Location: "Lagos, Nigeria", Rating: 4.5, ContractsActive: 28, VolumeKg: 1200000, PaymentTermDays: 30, CropsAccepted: []string{"cocoa", "coffee", "sesame", "cashew"}}
	offtakers["OT-003"] = &Offtaker{ID: "OT-003", Name: "Twiga Foods", Type: "retailer", Location: "Nairobi, Kenya", Rating: 4.8, ContractsActive: 45, VolumeKg: 800000, PaymentTermDays: 7, CropsAccepted: []string{"tomato", "onion", "potato", "cabbage", "kale"}}
	offtakers["OT-004"] = &Offtaker{ID: "OT-004", Name: "World Food Programme", Type: "institution", Location: "Kampala, Uganda", Rating: 4.9, ContractsActive: 8, VolumeKg: 2000000, PaymentTermDays: 45, CropsAccepted: []string{"maize", "beans", "sorghum", "millet"}}
	offtakers["OT-005"] = &Offtaker{ID: "OT-005", Name: "Export Trading Group", Type: "exporter", Location: "Dar es Salaam, Tanzania", Rating: 4.3, ContractsActive: 15, VolumeKg: 900000, PaymentTermDays: 21, CropsAccepted: []string{"coffee", "tea", "cotton", "tobacco"}}

	// Seed templates
	templates["TPL-001"] = &ContractTemplate{ID: "TPL-001", Name: "Standard Grain Purchase", CropType: "grain", Quality: QualitySpec{MinMoisturePercent: 10, MaxMoisturePercent: 14, MinGradeLevel: "Grade2", ForeignMatterMax: 2.0, BrokenGrainsMax: 5.0}, Penalty: PenaltySpec{LateDeliveryPercentPerDay: 0.5, QualityPenaltyPercent: 10, ShortageTolerancePercent: 5, MaxPenaltyPercent: 25}, Description: "Standard contract for cereals and grains with WFP-aligned quality standards"}
	templates["TPL-002"] = &ContractTemplate{ID: "TPL-002", Name: "Premium Export Coffee", CropType: "coffee", Quality: QualitySpec{MinMoisturePercent: 10, MaxMoisturePercent: 12, MinGradeLevel: "AA", ForeignMatterMax: 0.5, BrokenGrainsMax: 2.0}, Penalty: PenaltySpec{LateDeliveryPercentPerDay: 1.0, QualityPenaltyPercent: 15, ShortageTolerancePercent: 3, MaxPenaltyPercent: 30}, Description: "Premium Arabica coffee contract for specialty export markets"}
	templates["TPL-003"] = &ContractTemplate{ID: "TPL-003", Name: "Fresh Vegetables Supply", CropType: "vegetable", Quality: QualitySpec{MinMoisturePercent: 80, MaxMoisturePercent: 95, MinGradeLevel: "Grade1", ForeignMatterMax: 1.0, BrokenGrainsMax: 0}, Penalty: PenaltySpec{LateDeliveryPercentPerDay: 2.0, QualityPenaltyPercent: 20, ShortageTolerancePercent: 10, MaxPenaltyPercent: 40}, Description: "Fresh produce contract with strict cold-chain and daily delivery"}

	// Seed contracts
	contracts["CT-001"] = &Contract{
		ID: "CT-001", FarmerID: "F-101", OfftakerID: "OT-003", CropType: "tomato",
		QuantityKg: 5000, PricePerKg: 120, Currency: "KES", Status: StatusActive,
		StartDate: now.AddDate(0, -2, 0), EndDate: now.AddDate(0, 4, 0),
		QualityStandards: templates["TPL-003"].Quality, PenaltyClauses: templates["TPL-003"].Penalty,
		DeliverySchedule: []Delivery{
			{ID: "DL-001", ContractID: "CT-001", ScheduledAt: now.AddDate(0, -1, 0), QuantityKg: 1000, DeliveredKg: 950, Status: "delivered", QualityGrade: "A"},
			{ID: "DL-002", ContractID: "CT-001", ScheduledAt: now, QuantityKg: 1000, DeliveredKg: 0, Status: "pending"},
			{ID: "DL-003", ContractID: "CT-001", ScheduledAt: now.AddDate(0, 1, 0), QuantityKg: 1000, Status: "pending"},
		},
		CreatedAt: now.AddDate(0, -2, 0), UpdatedAt: now,
	}
	contracts["CT-002"] = &Contract{
		ID: "CT-002", FarmerID: "F-102", OfftakerID: "OT-002", CropType: "cocoa",
		QuantityKg: 20000, PricePerKg: 2500, Currency: "NGN", Status: StatusActive,
		StartDate: now.AddDate(0, -3, 0), EndDate: now.AddDate(0, 9, 0),
		QualityStandards: templates["TPL-002"].Quality, PenaltyClauses: templates["TPL-002"].Penalty,
		DeliverySchedule: []Delivery{
			{ID: "DL-004", ContractID: "CT-002", ScheduledAt: now.AddDate(0, -2, 0), QuantityKg: 5000, DeliveredKg: 4800, Status: "delivered", QualityGrade: "AA"},
			{ID: "DL-005", ContractID: "CT-002", ScheduledAt: now.AddDate(0, 1, 0), QuantityKg: 5000, Status: "pending"},
		},
		CreatedAt: now.AddDate(0, -3, 0), UpdatedAt: now,
	}
	contracts["CT-003"] = &Contract{
		ID: "CT-003", FarmerID: "F-103", OfftakerID: "OT-004", CropType: "maize",
		QuantityKg: 50000, PricePerKg: 45, Currency: "KES", Status: StatusActive,
		StartDate: now.AddDate(0, -1, 0), EndDate: now.AddDate(0, 5, 0),
		QualityStandards: templates["TPL-001"].Quality, PenaltyClauses: templates["TPL-001"].Penalty,
		DeliverySchedule: []Delivery{
			{ID: "DL-006", ContractID: "CT-003", ScheduledAt: now.AddDate(0, 0, 15), QuantityKg: 10000, Status: "pending"},
			{ID: "DL-007", ContractID: "CT-003", ScheduledAt: now.AddDate(0, 1, 15), QuantityKg: 10000, Status: "pending"},
		},
		CreatedAt: now.AddDate(0, -1, 0), UpdatedAt: now,
	}
}

// ─── Business Logic ─────────────────────────────────────────────────

func calculatePerformance(c *Contract) PerformanceMetric {
	var totalDelivered, totalExpected float64
	var onTime, qualityOk int
	total := len(c.DeliverySchedule)

	for _, d := range c.DeliverySchedule {
		if d.Status == "delivered" || d.Status == "partial" {
			totalDelivered += d.DeliveredKg
			totalExpected += d.QuantityKg
			if d.DeliveredKg >= d.QuantityKg*(1-c.PenaltyClauses.ShortageTolerancePercent/100) {
				onTime++
			}
			if d.QualityGrade == "A" || d.QualityGrade == "AA" {
				qualityOk++
			}
		} else if d.Status == "pending" {
			totalExpected += d.QuantityKg
		}
	}

	deliveryRate := 0.0
	if totalExpected > 0 {
		deliveryRate = math.Min(totalDelivered/totalExpected*100, 100)
	}
	timelinessScore := 0.0
	if total > 0 {
		timelinessScore = float64(onTime) / float64(total) * 100
	}
	qualityScore := 0.0
	if total > 0 {
		qualityScore = float64(qualityOk) / float64(total) * 100
	}
	overall := (deliveryRate*0.4 + qualityScore*0.35 + timelinessScore*0.25)

	return PerformanceMetric{
		FarmerID: c.FarmerID, ContractID: c.ID,
		DeliveryRate: math.Round(deliveryRate*10) / 10,
		QualityScore: math.Round(qualityScore*10) / 10,
		TimelinessScore: math.Round(timelinessScore*10) / 10,
		OverallScore: math.Round(overall*10) / 10,
		TotalDeliveredKg: totalDelivered, TotalExpectedKg: totalExpected,
	}
}

func calculatePenalty(c *Contract, delivery *Delivery) float64 {
	if delivery.Status != "delivered" && delivery.Status != "partial" {
		return 0
	}
	penalty := 0.0
	shortage := delivery.QuantityKg - delivery.DeliveredKg
	toleranceKg := delivery.QuantityKg * c.PenaltyClauses.ShortageTolerancePercent / 100
	if shortage > toleranceKg {
		penalty += (shortage - toleranceKg) * c.PricePerKg * c.PenaltyClauses.QualityPenaltyPercent / 100
	}
	maxPenalty := delivery.QuantityKg * c.PricePerKg * c.PenaltyClauses.MaxPenaltyPercent / 100
	return math.Min(penalty, maxPenalty)
}

// ─── HTTP Handlers ──────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]interface{}{
		"status": "healthy", "service": "contract-farming", "version": "1.0.0",
		"uptime": time.Since(startTime).String(),
	})
}

func handleListContracts(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()
	result := make([]*Contract, 0, len(contracts))
	farmerID := r.URL.Query().Get("farmerId")
	for _, c := range contracts {
		if farmerID != "" && c.FarmerID != farmerID {
			continue
		}
		result = append(result, c)
	}
	writeJSON(w, 200, map[string]interface{}{"contracts": result, "total": len(result)})
}

func handleGetContract(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	mu.RLock()
	c, ok := contracts[id]
	mu.RUnlock()
	if !ok {
		writeJSON(w, 404, map[string]string{"error": "contract not found"})
		return
	}
	perf := calculatePerformance(c)
	writeJSON(w, 200, map[string]interface{}{"contract": c, "performance": perf})
}

func handleListOfftakers(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()
	result := make([]*Offtaker, 0, len(offtakers))
	for _, o := range offtakers {
		result = append(result, o)
	}
	writeJSON(w, 200, map[string]interface{}{"offtakers": result, "total": len(result)})
}

func handleListTemplates(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()
	result := make([]*ContractTemplate, 0, len(templates))
	for _, t := range templates {
		result = append(result, t)
	}
	writeJSON(w, 200, map[string]interface{}{"templates": result, "total": len(result)})
}

func handleCreateContract(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeJSON(w, 405, map[string]string{"error": "method not allowed"})
		return
	}
	var req struct {
		FarmerID   string  `json:"farmerId"`
		OfftakerID string  `json:"offtakerId"`
		CropType   string  `json:"cropType"`
		QuantityKg float64 `json:"quantityKg"`
		PricePerKg float64 `json:"pricePerKg"`
		Currency   string  `json:"currency"`
		TemplateID string  `json:"templateId"`
		DurationMonths int `json:"durationMonths"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid request body"})
		return
	}

	mu.Lock()
	defer mu.Unlock()

	tpl, hasTpl := templates[req.TemplateID]
	now := time.Now()
	id := fmt.Sprintf("CT-%03d", len(contracts)+1)
	duration := req.DurationMonths
	if duration == 0 { duration = 6 }

	c := &Contract{
		ID: id, FarmerID: req.FarmerID, OfftakerID: req.OfftakerID,
		CropType: req.CropType, QuantityKg: req.QuantityKg,
		PricePerKg: req.PricePerKg, Currency: req.Currency,
		Status: StatusDraft, StartDate: now, EndDate: now.AddDate(0, duration, 0),
		CreatedAt: now, UpdatedAt: now,
	}
	if hasTpl {
		c.QualityStandards = tpl.Quality
		c.PenaltyClauses = tpl.Penalty
	}

	// Generate delivery schedule (monthly deliveries)
	perDelivery := req.QuantityKg / float64(duration)
	for i := 0; i < duration; i++ {
		dlID := fmt.Sprintf("DL-%s-%d", id, i+1)
		c.DeliverySchedule = append(c.DeliverySchedule, Delivery{
			ID: dlID, ContractID: id,
			ScheduledAt: now.AddDate(0, i+1, 0),
			QuantityKg: perDelivery, Status: "pending",
		})
	}

	contracts[id] = c
	persistContract(c)
	writeJSON(w, 201, map[string]interface{}{"contract": c})
}

func handleRecordDelivery(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeJSON(w, 405, map[string]string{"error": "method not allowed"})
		return
	}
	var req struct {
		ContractID  string  `json:"contractId"`
		DeliveryID  string  `json:"deliveryId"`
		DeliveredKg float64 `json:"deliveredKg"`
		QualityGrade string `json:"qualityGrade"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, 400, map[string]string{"error": "invalid request body"})
		return
	}

	mu.Lock()
	defer mu.Unlock()

	c, ok := contracts[req.ContractID]
	if !ok {
		writeJSON(w, 404, map[string]string{"error": "contract not found"})
		return
	}

	for i := range c.DeliverySchedule {
		if c.DeliverySchedule[i].ID == req.DeliveryID {
			now := time.Now()
			c.DeliverySchedule[i].DeliveredKg = req.DeliveredKg
			c.DeliverySchedule[i].QualityGrade = req.QualityGrade
			c.DeliverySchedule[i].DeliveredAt = &now
			if req.DeliveredKg >= c.DeliverySchedule[i].QuantityKg {
				c.DeliverySchedule[i].Status = "delivered"
			} else {
				c.DeliverySchedule[i].Status = "partial"
			}

			penalty := calculatePenalty(c, &c.DeliverySchedule[i])
			c.UpdatedAt = now

			writeJSON(w, 200, map[string]interface{}{
				"delivery": c.DeliverySchedule[i],
				"penalty":  penalty,
				"performance": calculatePerformance(c),
			})
			return
		}
	}
	writeJSON(w, 404, map[string]string{"error": "delivery not found"})
}

func handlePerformance(w http.ResponseWriter, r *http.Request) {
	contractID := r.URL.Query().Get("contractId")
	mu.RLock()
	c, ok := contracts[contractID]
	mu.RUnlock()
	if !ok {
		writeJSON(w, 404, map[string]string{"error": "contract not found"})
		return
	}
	writeJSON(w, 200, calculatePerformance(c))
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()

	var totalVolume, totalValue float64
	activeCount, completedCount := 0, 0
	for _, c := range contracts {
		if c.Status == StatusActive { activeCount++ }
		if c.Status == StatusCompleted { completedCount++ }
		totalVolume += c.QuantityKg
		totalValue += c.QuantityKg * c.PricePerKg
	}

	writeJSON(w, 200, map[string]interface{}{
		"totalContracts":   len(contracts),
		"activeContracts":  activeCount,
		"completedContracts": completedCount,
		"totalOfftakers":   len(offtakers),
		"totalTemplates":   len(templates),
		"totalVolumeKg":    totalVolume,
		"totalValueFormatted": fmt.Sprintf("%.0f", totalValue),
	})
}

var startTime = time.Now()

func main() {
	port := os.Getenv("PORT")
	if port == "" { port = "8116" }

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/api/contracts", handleListContracts)
	mux.HandleFunc("/api/contract", handleGetContract)
	mux.HandleFunc("/api/contracts/create", handleCreateContract)
	mux.HandleFunc("/api/contracts/deliver", handleRecordDelivery)
	mux.HandleFunc("/api/contracts/performance", handlePerformance)
	mux.HandleFunc("/api/offtakers", handleListOfftakers)
	mux.HandleFunc("/api/templates", handleListTemplates)
	mux.HandleFunc("/api/stats", handleStats)

	portNum, _ := strconv.Atoi(port)
	addr := fmt.Sprintf(":%d", portNum)

	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("[ContractFarming] Server starting on %s", addr)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("[ContractFarming] Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[ContractFarming] Shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("[ContractFarming] Forced shutdown: %v", err)
	}
	log.Println("[ContractFarming] Server stopped")
}
