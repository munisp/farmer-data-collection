package integrations

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// FeatureServiceClient manages all feature service integrations
type FeatureServiceClient struct {
	iotServiceURL          string
	satelliteServiceURL    string
	exportDocsServiceURL   string
	multiCurrencyServiceURL string
	carbonCreditsServiceURL string
	certificationServiceURL string
	equipmentRentalServiceURL string
	coldStorageServiceURL  string
	httpClient            *http.Client
}

// NewFeatureServiceClient creates a new feature service client
func NewFeatureServiceClient() *FeatureServiceClient {
	return &FeatureServiceClient{
		iotServiceURL:          "http://iot-service:8090",
		satelliteServiceURL:    "http://satellite-service:8091",
		exportDocsServiceURL:   "http://export-docs-service:8092",
		multiCurrencyServiceURL: "http://multi-currency-service:8093",
		carbonCreditsServiceURL: "http://carbon-credits-service:8094",
		certificationServiceURL: "http://certification-service:8095",
		equipmentRentalServiceURL: "http://equipment-rental-service:8096",
		coldStorageServiceURL:  "http://cold-storage-service:8097",
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// IoT Sensor Integration
type SensorData struct {
	SensorID    string                 `json:"sensor_id"`
	FieldID     string                 `json:"field_id"`
	Timestamp   time.Time              `json:"timestamp"`
	Metrics     map[string]interface{} `json:"metrics"`
	SensorType  string                 `json:"sensor_type"`
}

func (c *FeatureServiceClient) GetFieldSensorData(ctx context.Context, fieldID string) ([]SensorData, error) {
	url := fmt.Sprintf("%s/api/sensors/field/%s", c.iotServiceURL, fieldID)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var data []SensorData
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	return data, nil
}

func (c *FeatureServiceClient) SubscribeToSensorAlerts(ctx context.Context, fieldID string, callback func(SensorData)) error {
	// MQTT subscription handled by IoT service
	url := fmt.Sprintf("%s/api/sensors/subscribe/%s", c.iotServiceURL, fieldID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

// Satellite Imagery Integration
type SatelliteImage struct {
	ImageID    string    `json:"image_id"`
	FieldID    string    `json:"field_id"`
	CaptureDate time.Time `json:"capture_date"`
	ImageURL   string    `json:"image_url"`
	Analysis   map[string]interface{} `json:"analysis"`
	NDVIScore  float64   `json:"ndvi_score"`
}

func (c *FeatureServiceClient) GetFieldSatelliteImages(ctx context.Context, fieldID string, startDate, endDate time.Time) ([]SatelliteImage, error) {
	url := fmt.Sprintf("%s/api/satellite/field/%s?start=%s&end=%s",
		c.satelliteServiceURL, fieldID, startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var images []SatelliteImage
	if err := json.NewDecoder(resp.Body).Decode(&images); err != nil {
		return nil, err
	}

	return images, nil
}

func (c *FeatureServiceClient) AnalyzeFieldHealth(ctx context.Context, fieldID string) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/api/satellite/analyze/%s", c.satelliteServiceURL, fieldID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var analysis map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&analysis); err != nil {
		return nil, err
	}

	return analysis, nil
}

// Export Documentation Integration
type ExportDocument struct {
	DocumentID   string    `json:"document_id"`
	DocumentType string    `json:"document_type"`
	Country      string    `json:"country"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	DocumentURL  string    `json:"document_url"`
}

func (c *FeatureServiceClient) GenerateExportDocuments(ctx context.Context, harvestID string, country string) ([]ExportDocument, error) {
	url := fmt.Sprintf("%s/api/export/generate", c.exportDocsServiceURL)
	payload := map[string]string{
		"harvest_id": harvestID,
		"country":    country,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var docs []ExportDocument
	if err := json.NewDecoder(resp.Body).Decode(&docs); err != nil {
		return nil, err
	}

	return docs, nil
}

// Multi-Currency Integration
type CurrencyConversion struct {
	FromCurrency string  `json:"from_currency"`
	ToCurrency   string  `json:"to_currency"`
	Amount       float64 `json:"amount"`
	ConvertedAmount float64 `json:"converted_amount"`
	ExchangeRate float64 `json:"exchange_rate"`
	Timestamp    time.Time `json:"timestamp"`
}

func (c *FeatureServiceClient) ConvertCurrency(ctx context.Context, from, to string, amount float64) (*CurrencyConversion, error) {
	url := fmt.Sprintf("%s/api/currency/convert?from=%s&to=%s&amount=%f",
		c.multiCurrencyServiceURL, from, to, amount)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var conversion CurrencyConversion
	if err := json.NewDecoder(resp.Body).Decode(&conversion); err != nil {
		return nil, err
	}

	return &conversion, nil
}

// Carbon Credits Integration
type CarbonCredit struct {
	CreditID      string    `json:"credit_id"`
	FarmerID      string    `json:"farmer_id"`
	FieldID       string    `json:"field_id"`
	CreditAmount  float64   `json:"credit_amount"`
	VerifiedDate  time.Time `json:"verified_date"`
	Status        string    `json:"status"`
	MarketValue   float64   `json:"market_value"`
}

func (c *FeatureServiceClient) CalculateCarbonCredits(ctx context.Context, fieldID string, practiceData map[string]interface{}) (*CarbonCredit, error) {
	url := fmt.Sprintf("%s/api/carbon/calculate", c.carbonCreditsServiceURL)
	payload := map[string]interface{}{
		"field_id": fieldID,
		"practices": practiceData,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var credit CarbonCredit
	if err := json.NewDecoder(resp.Body).Decode(&credit); err != nil {
		return nil, err
	}

	return &credit, nil
}

// Certification Integration
type Certification struct {
	CertID       string    `json:"cert_id"`
	CertType     string    `json:"cert_type"`
	FarmerID     string    `json:"farmer_id"`
	Status       string    `json:"status"`
	IssuedDate   time.Time `json:"issued_date"`
	ExpiryDate   time.Time `json:"expiry_date"`
	CertificateURL string  `json:"certificate_url"`
}

func (c *FeatureServiceClient) ApplyForCertification(ctx context.Context, farmerID, certType string) (*Certification, error) {
	url := fmt.Sprintf("%s/api/certification/apply", c.certificationServiceURL)
	payload := map[string]string{
		"farmer_id": farmerID,
		"cert_type": certType,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var cert Certification
	if err := json.NewDecoder(resp.Body).Decode(&cert); err != nil {
		return nil, err
	}

	return &cert, nil
}

// Equipment Rental Integration
type EquipmentRental struct {
	RentalID     string    `json:"rental_id"`
	EquipmentID  string    `json:"equipment_id"`
	EquipmentType string   `json:"equipment_type"`
	FarmerID     string    `json:"farmer_id"`
	StartDate    time.Time `json:"start_date"`
	EndDate      time.Time `json:"end_date"`
	DailyRate    float64   `json:"daily_rate"`
	TotalCost    float64   `json:"total_cost"`
	Status       string    `json:"status"`
}

func (c *FeatureServiceClient) SearchAvailableEquipment(ctx context.Context, equipmentType string, location string, date time.Time) ([]EquipmentRental, error) {
	url := fmt.Sprintf("%s/api/equipment/search?type=%s&location=%s&date=%s",
		c.equipmentRentalServiceURL, equipmentType, location, date.Format("2006-01-02"))
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var equipment []EquipmentRental
	if err := json.NewDecoder(resp.Body).Decode(&equipment); err != nil {
		return nil, err
	}

	return equipment, nil
}

func (c *FeatureServiceClient) BookEquipment(ctx context.Context, equipmentID, farmerID string, startDate, endDate time.Time) (*EquipmentRental, error) {
	url := fmt.Sprintf("%s/api/equipment/book", c.equipmentRentalServiceURL)
	payload := map[string]interface{}{
		"equipment_id": equipmentID,
		"farmer_id":    farmerID,
		"start_date":   startDate,
		"end_date":     endDate,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var rental EquipmentRental
	if err := json.NewDecoder(resp.Body).Decode(&rental); err != nil {
		return nil, err
	}

	return &rental, nil
}

// Cold Storage Integration
type ColdStorageUnit struct {
	UnitID       string    `json:"unit_id"`
	FacilityID   string    `json:"facility_id"`
	Temperature  float64   `json:"temperature"`
	Humidity     float64   `json:"humidity"`
	Capacity     float64   `json:"capacity"`
	Occupied     float64   `json:"occupied"`
	Status       string    `json:"status"`
	LastUpdated  time.Time `json:"last_updated"`
}

func (c *FeatureServiceClient) GetAvailableColdStorage(ctx context.Context, location string, capacity float64) ([]ColdStorageUnit, error) {
	url := fmt.Sprintf("%s/api/storage/available?location=%s&capacity=%f",
		c.coldStorageServiceURL, location, capacity)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var units []ColdStorageUnit
	if err := json.NewDecoder(resp.Body).Decode(&units); err != nil {
		return nil, err
	}

	return units, nil
}

func (c *FeatureServiceClient) ReserveColdStorage(ctx context.Context, unitID, harvestID string, quantity float64, duration int) error {
	url := fmt.Sprintf("%s/api/storage/reserve", c.coldStorageServiceURL)
	payload := map[string]interface{}{
		"unit_id":    unitID,
		"harvest_id": harvestID,
		"quantity":   quantity,
		"duration":   duration,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}
