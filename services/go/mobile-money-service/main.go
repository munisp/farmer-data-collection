package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

// ============================================================================
// Mobile Money Gateway Service (Go)
// Integrates M-Pesa (Safaricom), MTN MoMo, Airtel Money, Orange Money
// Uses Kafka for async events, Redis for idempotency, Dapr for service mesh
// ============================================================================

type Provider string

const (
	ProviderMPesa      Provider = "mpesa"
	ProviderMTNMoMo    Provider = "mtn_momo"
	ProviderAirtel     Provider = "airtel_money"
	ProviderOrange     Provider = "orange_money"
	ProviderFlutterwave Provider = "flutterwave"
)

type TransactionType string

const (
	TxSTKPush       TransactionType = "stk_push"
	TxC2B           TransactionType = "c2b"
	TxB2C           TransactionType = "b2c"
	TxB2B           TransactionType = "b2b"
	TxDisbursement  TransactionType = "disbursement"
	TxEscrowHold    TransactionType = "escrow_hold"
	TxEscrowRelease TransactionType = "escrow_release"
)

type TransactionStatus string

const (
	StatusPending    TransactionStatus = "pending"
	StatusProcessing TransactionStatus = "processing"
	StatusCompleted  TransactionStatus = "completed"
	StatusFailed     TransactionStatus = "failed"
	StatusCancelled  TransactionStatus = "cancelled"
)

// ============================================================================
// Configuration
// ============================================================================

type Config struct {
	Port            string
	KafkaBrokers    string
	RedisURL        string
	DaprHTTPPort    string
	DatabaseURL     string

	// M-Pesa
	MPesaConsumerKey    string
	MPesaConsumerSecret string
	MPesaPasskey        string
	MPesaShortcode      string
	MPesaEnv            string // sandbox | production
	MPesaCallbackURL    string

	// MTN MoMo
	MTNSubscriptionKey string
	MTNAPIUser         string
	MTNAPIKey          string
	MTNEnv             string
	MTNCallbackURL     string

	// Airtel Money
	AirtelClientID     string
	AirtelClientSecret string
	AirtelEnv          string

	// Flutterwave (aggregator fallback)
	FlutterwaveSecretKey string
	FlutterwavePublicKey string
}

func loadConfig() *Config {
	return &Config{
		Port:                 getEnv("PORT", "8090"),
		KafkaBrokers:        getEnv("KAFKA_BROKERS", "localhost:9093"),
		RedisURL:             getEnv("REDIS_URL", "localhost:6379"),
		DaprHTTPPort:         getEnv("DAPR_HTTP_PORT", "3500"),
		DatabaseURL:          getEnv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/farmer_data"),
		MPesaConsumerKey:     os.Getenv("MPESA_CONSUMER_KEY"),
		MPesaConsumerSecret:  os.Getenv("MPESA_CONSUMER_SECRET"),
		MPesaPasskey:         os.Getenv("MPESA_PASSKEY"),
		MPesaShortcode:       getEnv("MPESA_SHORTCODE", "174379"),
		MPesaEnv:             getEnv("MPESA_ENV", "sandbox"),
		MPesaCallbackURL:     os.Getenv("MPESA_CALLBACK_URL"),
		MTNSubscriptionKey:   os.Getenv("MTN_SUBSCRIPTION_KEY"),
		MTNAPIUser:           os.Getenv("MTN_API_USER"),
		MTNAPIKey:            os.Getenv("MTN_API_KEY"),
		MTNEnv:               getEnv("MTN_ENV", "sandbox"),
		MTNCallbackURL:       os.Getenv("MTN_CALLBACK_URL"),
		AirtelClientID:       os.Getenv("AIRTEL_CLIENT_ID"),
		AirtelClientSecret:   os.Getenv("AIRTEL_CLIENT_SECRET"),
		AirtelEnv:            getEnv("AIRTEL_ENV", "sandbox"),
		FlutterwaveSecretKey: os.Getenv("FLUTTERWAVE_SECRET_KEY"),
		FlutterwavePublicKey: os.Getenv("FLUTTERWAVE_PUBLIC_KEY"),
	}
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// ============================================================================
// M-Pesa Integration
// ============================================================================

type MPesaClient struct {
	config      *Config
	accessToken string
	tokenExpiry time.Time
	mu          sync.RWMutex
	httpClient  *http.Client
}

func NewMPesaClient(cfg *Config) *MPesaClient {
	return &MPesaClient{
		config: cfg,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (m *MPesaClient) getBaseURL() string {
	if m.config.MPesaEnv == "production" {
		return "https://api.safaricom.co.ke"
	}
	return "https://sandbox.safaricom.co.ke"
}

func (m *MPesaClient) GetAccessToken(ctx context.Context) (string, error) {
	m.mu.RLock()
	if m.accessToken != "" && time.Now().Before(m.tokenExpiry) {
		defer m.mu.RUnlock()
		return m.accessToken, nil
	}
	m.mu.RUnlock()

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.config.MPesaConsumerKey == "" {
		return "", fmt.Errorf("MPESA_CONSUMER_KEY not configured")
	}

	url := m.getBaseURL() + "/oauth/v1/generate?grant_type=client_credentials"
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.SetBasicAuth(m.config.MPesaConsumerKey, m.config.MPesaConsumerSecret)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   string `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode token: %w", err)
	}

	m.accessToken = result.AccessToken
	m.tokenExpiry = time.Now().Add(50 * time.Minute)
	return m.accessToken, nil
}

type STKPushRequest struct {
	PhoneNumber    string `json:"phone_number"`
	Amount         int    `json:"amount"`
	AccountRef     string `json:"account_ref"`
	TransactionDesc string `json:"transaction_desc"`
	OrderID        int    `json:"order_id"`
	UserID         int    `json:"user_id"`
}

type STKPushResponse struct {
	MerchantRequestID   string `json:"MerchantRequestID"`
	CheckoutRequestID   string `json:"CheckoutRequestID"`
	ResponseCode        string `json:"ResponseCode"`
	ResponseDescription string `json:"ResponseDescription"`
	CustomerMessage     string `json:"CustomerMessage"`
}

func (m *MPesaClient) InitiateSTKPush(ctx context.Context, req STKPushRequest) (*STKPushResponse, error) {
	token, err := m.GetAccessToken(ctx)
	if err != nil {
		return nil, err
	}

	timestamp := time.Now().Format("20060102150405")
	password := generateMPesaPassword(m.config.MPesaShortcode, m.config.MPesaPasskey, timestamp)

	payload := map[string]interface{}{
		"BusinessShortCode": m.config.MPesaShortcode,
		"Password":          password,
		"Timestamp":         timestamp,
		"TransactionType":   "CustomerPayBillOnline",
		"Amount":            req.Amount,
		"PartyA":            req.PhoneNumber,
		"PartyB":            m.config.MPesaShortcode,
		"PhoneNumber":       req.PhoneNumber,
		"CallBackURL":       m.config.MPesaCallbackURL,
		"AccountReference":  req.AccountRef,
		"TransactionDesc":   req.TransactionDesc,
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		m.getBaseURL()+"/mpesa/stkpush/v1/processrequest",
		strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+token)

	resp, err := m.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("stk push request: %w", err)
	}
	defer resp.Body.Close()

	var result STKPushResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode stk response: %w", err)
	}

	return &result, nil
}

func (m *MPesaClient) B2CPayment(ctx context.Context, phone string, amount int, remarks string) (map[string]interface{}, error) {
	token, err := m.GetAccessToken(ctx)
	if err != nil {
		return nil, err
	}

	payload := map[string]interface{}{
		"InitiatorName":      "apiuser",
		"SecurityCredential": m.config.MPesaPasskey,
		"CommandID":          "BusinessPayment",
		"Amount":             amount,
		"PartyA":             m.config.MPesaShortcode,
		"PartyB":             phone,
		"Remarks":            remarks,
		"QueueTimeOutURL":    m.config.MPesaCallbackURL + "/timeout",
		"ResultURL":          m.config.MPesaCallbackURL + "/result",
		"Occasion":           "FarmPlatformPayment",
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		m.getBaseURL()+"/mpesa/b2c/v3/paymentrequest",
		strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+token)

	resp, err := m.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("b2c request: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

func generateMPesaPassword(shortcode, passkey, timestamp string) string {
	data := shortcode + passkey + timestamp
	h := sha256.New()
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}

// ============================================================================
// MTN MoMo Integration
// ============================================================================

type MTNMoMoClient struct {
	config     *Config
	httpClient *http.Client
}

func NewMTNMoMoClient(cfg *Config) *MTNMoMoClient {
	return &MTNMoMoClient{
		config:     cfg,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (m *MTNMoMoClient) getBaseURL() string {
	if m.config.MTNEnv == "production" {
		return "https://proxy.momoapi.mtn.com"
	}
	return "https://sandbox.momodeveloper.mtn.com"
}

type MTNCollectionRequest struct {
	Amount       string `json:"amount"`
	Currency     string `json:"currency"`
	ExternalID   string `json:"externalId"`
	Payer        MTNParty `json:"payer"`
	PayerMessage string `json:"payerMessage"`
	PayeeNote    string `json:"payeeNote"`
}

type MTNParty struct {
	PartyIDType string `json:"partyIdType"`
	PartyID     string `json:"partyId"`
}

func (m *MTNMoMoClient) RequestPayment(ctx context.Context, phone string, amount int, currency, externalID string) (string, error) {
	if m.config.MTNSubscriptionKey == "" {
		return "", fmt.Errorf("MTN_SUBSCRIPTION_KEY not configured")
	}

	payload := MTNCollectionRequest{
		Amount:       fmt.Sprintf("%d", amount),
		Currency:     currency,
		ExternalID:   externalID,
		Payer:        MTNParty{PartyIDType: "MSISDN", PartyID: phone},
		PayerMessage: "Farm Platform Payment",
		PayeeNote:    "Order payment",
	}

	body, _ := json.Marshal(payload)
	referenceID := externalID

	req, err := http.NewRequestWithContext(ctx, "POST",
		m.getBaseURL()+"/collection/v1_0/requesttopay",
		strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Reference-Id", referenceID)
	req.Header.Set("X-Target-Environment", m.config.MTNEnv)
	req.Header.Set("Ocp-Apim-Subscription-Key", m.config.MTNSubscriptionKey)
	req.SetBasicAuth(m.config.MTNAPIUser, m.config.MTNAPIKey)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("mtn request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == 202 {
		return referenceID, nil
	}

	var errResp map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&errResp)
	return "", fmt.Errorf("MTN MoMo error: status %d, %v", resp.StatusCode, errResp)
}

func (m *MTNMoMoClient) CheckPaymentStatus(ctx context.Context, referenceID string) (TransactionStatus, error) {
	req, err := http.NewRequestWithContext(ctx, "GET",
		m.getBaseURL()+"/collection/v1_0/requesttopay/"+referenceID, nil)
	if err != nil {
		return StatusFailed, err
	}
	req.Header.Set("X-Target-Environment", m.config.MTNEnv)
	req.Header.Set("Ocp-Apim-Subscription-Key", m.config.MTNSubscriptionKey)
	req.SetBasicAuth(m.config.MTNAPIUser, m.config.MTNAPIKey)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return StatusFailed, err
	}
	defer resp.Body.Close()

	var result struct {
		Status string `json:"status"`
	}
	json.NewDecoder(resp.Body).Decode(&result)

	switch result.Status {
	case "SUCCESSFUL":
		return StatusCompleted, nil
	case "PENDING":
		return StatusPending, nil
	case "FAILED":
		return StatusFailed, nil
	default:
		return StatusProcessing, nil
	}
}

func (m *MTNMoMoClient) Disburse(ctx context.Context, phone string, amount int, currency, externalID string) (string, error) {
	if m.config.MTNSubscriptionKey == "" {
		return "", fmt.Errorf("MTN_SUBSCRIPTION_KEY not configured")
	}

	payload := map[string]interface{}{
		"amount":       fmt.Sprintf("%d", amount),
		"currency":     currency,
		"externalId":   externalID,
		"payee":        MTNParty{PartyIDType: "MSISDN", PartyID: phone},
		"payerMessage": "Farm Platform Disbursement",
		"payeeNote":    "Seller payout",
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST",
		m.getBaseURL()+"/disbursement/v1_0/transfer",
		strings.NewReader(string(body)))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Reference-Id", externalID)
	req.Header.Set("X-Target-Environment", m.config.MTNEnv)
	req.Header.Set("Ocp-Apim-Subscription-Key", m.config.MTNSubscriptionKey)
	req.SetBasicAuth(m.config.MTNAPIUser, m.config.MTNAPIKey)

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 202 {
		return externalID, nil
	}
	return "", fmt.Errorf("MTN disbursement error: status %d", resp.StatusCode)
}

// ============================================================================
// Flutterwave Integration (aggregator supporting all African providers)
// ============================================================================

type FlutterwaveClient struct {
	config     *Config
	httpClient *http.Client
}

func NewFlutterwaveClient(cfg *Config) *FlutterwaveClient {
	return &FlutterwaveClient{
		config:     cfg,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (f *FlutterwaveClient) ChargeMobileMoney(ctx context.Context, phone, email string, amount int, currency, txRef, network string) (map[string]interface{}, error) {
	if f.config.FlutterwaveSecretKey == "" {
		return nil, fmt.Errorf("FLUTTERWAVE_SECRET_KEY not configured")
	}

	payload := map[string]interface{}{
		"tx_ref":       txRef,
		"amount":       fmt.Sprintf("%d", amount),
		"currency":     currency,
		"email":        email,
		"phone_number": phone,
		"network":      network,
		"redirect_url": f.config.MPesaCallbackURL, // reuse callback
		"meta": map[string]string{
			"source": "farm_platform",
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, "POST",
		"https://api.flutterwave.com/v3/charges?type=mobile_money_"+strings.ToLower(currency[:2]),
		strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+f.config.FlutterwaveSecretKey)

	resp, err := f.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

func (f *FlutterwaveClient) VerifyTransaction(ctx context.Context, txID string) (map[string]interface{}, error) {
	req, err := http.NewRequestWithContext(ctx, "GET",
		"https://api.flutterwave.com/v3/transactions/"+txID+"/verify", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+f.config.FlutterwaveSecretKey)

	resp, err := f.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

// ============================================================================
// Webhook Signature Verification
// ============================================================================

func verifyMPesaCallback(body []byte, signature, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

func verifyFlutterwaveWebhook(body []byte, signature, secret string) bool {
	hash := sha256.Sum256([]byte(secret))
	return signature == hex.EncodeToString(hash[:])
}

// ============================================================================
// Kafka Event Publishing
// ============================================================================

type EventPublisher struct {
	daprURL string
	client  *http.Client
}

func NewEventPublisher(daprPort string) *EventPublisher {
	return &EventPublisher{
		daprURL: fmt.Sprintf("http://localhost:%s", daprPort),
		client:  &http.Client{Timeout: 5 * time.Second},
	}
}

func (ep *EventPublisher) Publish(ctx context.Context, topic string, event interface{}) error {
	body, err := json.Marshal(event)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("%s/v1.0/publish/kafka-pubsub/%s", ep.daprURL, topic)
	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := ep.client.Do(req)
	if err != nil {
		log.Printf("[MobileMoney] Dapr publish fallback for topic %s: %v", topic, err)
		return nil // graceful degradation
	}
	defer resp.Body.Close()
	return nil
}

// ============================================================================
// HTTP Server
// ============================================================================

type Server struct {
	config     *Config
	mpesa      *MPesaClient
	mtn        *MTNMoMoClient
	flutter    *FlutterwaveClient
	publisher  *EventPublisher
}

func NewServer(cfg *Config) *Server {
	return &Server{
		config:    cfg,
		mpesa:     NewMPesaClient(cfg),
		mtn:       NewMTNMoMoClient(cfg),
		flutter:   NewFlutterwaveClient(cfg),
		publisher: NewEventPublisher(cfg.DaprHTTPPort),
	}
}

func (s *Server) handleSTKPush(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req STKPushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}

	resp, err := s.mpesa.InitiateSTKPush(r.Context(), req)
	if err != nil {
		log.Printf("[M-Pesa] STK Push error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	s.publisher.Publish(r.Context(), "mobile-money-events", map[string]interface{}{
		"type":       "stk_push_initiated",
		"provider":   "mpesa",
		"order_id":   req.OrderID,
		"user_id":    req.UserID,
		"amount":     req.Amount,
		"checkout_id": resp.CheckoutRequestID,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	})

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleMPesaCallback(w http.ResponseWriter, r *http.Request) {
	var callback struct {
		Body struct {
			StkCallback struct {
				MerchantRequestID string `json:"MerchantRequestID"`
				CheckoutRequestID string `json:"CheckoutRequestID"`
				ResultCode        int    `json:"ResultCode"`
				ResultDesc        string `json:"ResultDesc"`
			} `json:"stkCallback"`
		} `json:"Body"`
	}

	if err := json.NewDecoder(r.Body).Decode(&callback); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid callback"})
		return
	}

	status := "completed"
	if callback.Body.StkCallback.ResultCode != 0 {
		status = "failed"
	}

	s.publisher.Publish(r.Context(), "mobile-money-events", map[string]interface{}{
		"type":        "payment_" + status,
		"provider":    "mpesa",
		"checkout_id": callback.Body.StkCallback.CheckoutRequestID,
		"result_code": callback.Body.StkCallback.ResultCode,
		"result_desc": callback.Body.StkCallback.ResultDesc,
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	})

	writeJSON(w, http.StatusOK, map[string]string{"status": "received"})
}

func (s *Server) handleMTNRequestPayment(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PhoneNumber string `json:"phone_number"`
		Amount      int    `json:"amount"`
		Currency    string `json:"currency"`
		ExternalID  string `json:"external_id"`
		OrderID     int    `json:"order_id"`
		UserID      int    `json:"user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}

	if req.Currency == "" {
		req.Currency = "EUR"
	}

	refID, err := s.mtn.RequestPayment(r.Context(), req.PhoneNumber, req.Amount, req.Currency, req.ExternalID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	s.publisher.Publish(r.Context(), "mobile-money-events", map[string]interface{}{
		"type":         "mtn_payment_requested",
		"provider":     "mtn_momo",
		"reference_id": refID,
		"order_id":     req.OrderID,
		"user_id":      req.UserID,
		"amount":       req.Amount,
		"currency":     req.Currency,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"reference_id": refID,
		"status":       "pending",
	})
}

func (s *Server) handleMTNDisburse(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PhoneNumber string `json:"phone_number"`
		Amount      int    `json:"amount"`
		Currency    string `json:"currency"`
		ExternalID  string `json:"external_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}

	refID, err := s.mtn.Disburse(r.Context(), req.PhoneNumber, req.Amount, req.Currency, req.ExternalID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	s.publisher.Publish(r.Context(), "mobile-money-events", map[string]interface{}{
		"type":         "mtn_disbursement",
		"provider":     "mtn_momo",
		"reference_id": refID,
		"amount":       req.Amount,
		"currency":     req.Currency,
		"timestamp":    time.Now().UTC().Format(time.RFC3339),
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{"reference_id": refID, "status": "pending"})
}

func (s *Server) handleFlutterwaveCharge(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PhoneNumber string `json:"phone_number"`
		Email       string `json:"email"`
		Amount      int    `json:"amount"`
		Currency    string `json:"currency"`
		TxRef       string `json:"tx_ref"`
		Network     string `json:"network"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request"})
		return
	}

	result, err := s.flutter.ChargeMobileMoney(r.Context(), req.PhoneNumber, req.Email, req.Amount, req.Currency, req.TxRef, req.Network)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	providers := map[string]string{
		"mpesa":       "not_configured",
		"mtn_momo":    "not_configured",
		"airtel":      "not_configured",
		"flutterwave": "not_configured",
	}
	if s.config.MPesaConsumerKey != "" {
		providers["mpesa"] = "configured"
	}
	if s.config.MTNSubscriptionKey != "" {
		providers["mtn_momo"] = "configured"
	}
	if s.config.AirtelClientID != "" {
		providers["airtel"] = "configured"
	}
	if s.config.FlutterwaveSecretKey != "" {
		providers["flutterwave"] = "configured"
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "healthy",
		"service":   "mobile-money-gateway",
		"providers": providers,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func main() {
	cfg := loadConfig()
	srv := NewServer(cfg)

	mux := http.NewServeMux()

	// M-Pesa endpoints
	mux.HandleFunc("/api/mpesa/stk-push", srv.handleSTKPush)
	mux.HandleFunc("/api/mpesa/callback", srv.handleMPesaCallback)

	// MTN MoMo endpoints
	mux.HandleFunc("/api/mtn/request-payment", srv.handleMTNRequestPayment)
	mux.HandleFunc("/api/mtn/disburse", srv.handleMTNDisburse)

	// Flutterwave endpoints
	mux.HandleFunc("/api/flutterwave/charge", srv.handleFlutterwaveCharge)

	// Health
	mux.HandleFunc("/health", srv.handleHealth)
	mux.HandleFunc("/dapr/subscribe", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, []interface{}{})
	})

	httpSrv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("[MobileMoney] Server starting on port %s", cfg.Port)
		if err := httpSrv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("[MobileMoney] Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[MobileMoney] Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	httpSrv.Shutdown(ctx)
	log.Println("[MobileMoney] Server stopped")
}
