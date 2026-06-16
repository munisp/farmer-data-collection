package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/joho/godotenv"
)

// Configuration
type Config struct {
	Port                string
	MojaloopAPIURL      string
	MojaloopFSPID       string
	DatabaseURL         string
	CallbackURL         string
	JWTSecret           string
	KeycloakURL         string
	KeycloakRealm       string
	KeycloakClientID    string
	PermifyURL          string
	RedisURL            string
}

// Mojaloop Party Lookup Request
type PartyLookupRequest struct {
	PartyIdType string `json:"partyIdType"` // MSISDN, ACCOUNT_ID, EMAIL, etc.
	PartyId     string `json:"partyId"`
}

// Mojaloop Party Response
type PartyResponse struct {
	Party struct {
		PartyIdInfo struct {
			PartyIdType string `json:"partyIdType"`
			PartyId     string `json:"partyId"`
			FSPId       string `json:"fspId"`
		} `json:"partyIdInfo"`
		Name              string `json:"name"`
		PersonalInfo      interface{} `json:"personalInfo,omitempty"`
		MerchantClassificationCode string `json:"merchantClassificationCode,omitempty"`
	} `json:"party"`
}

// Mojaloop Quote Request
type QuoteRequest struct {
	QuoteId       string `json:"quoteId"`
	TransactionId string `json:"transactionId"`
	Payer         struct {
		PartyIdInfo struct {
			PartyIdType string `json:"partyIdType"`
			PartyId     string `json:"partyId"`
			FSPId       string `json:"fspId"`
		} `json:"partyIdInfo"`
	} `json:"payer"`
	Payee struct {
		PartyIdInfo struct {
			PartyIdType string `json:"partyIdType"`
			PartyId     string `json:"partyId"`
			FSPId       string `json:"fspId"`
		} `json:"partyIdInfo"`
	} `json:"payee"`
	AmountType string `json:"amountType"` // SEND or RECEIVE
	Amount     struct {
		Currency string `json:"currency"`
		Amount   string `json:"amount"`
	} `json:"amount"`
	TransactionType struct {
		Scenario string `json:"scenario"` // TRANSFER, DEPOSIT, WITHDRAWAL, etc.
		Initiator string `json:"initiator"` // PAYER or PAYEE
		InitiatorType string `json:"initiatorType"` // CONSUMER, AGENT, BUSINESS, DEVICE
	} `json:"transactionType"`
	Note string `json:"note,omitempty"`
}

// Mojaloop Quote Response
type QuoteResponse struct {
	TransferAmount struct {
		Currency string `json:"currency"`
		Amount   string `json:"amount"`
	} `json:"transferAmount"`
	PayeeReceiveAmount struct {
		Currency string `json:"currency"`
		Amount   string `json:"amount"`
	} `json:"payeeReceiveAmount"`
	PayeeFspFee struct {
		Currency string `json:"currency"`
		Amount   string `json:"amount"`
	} `json:"payeeFspFee,omitempty"`
	PayeeFspCommission struct {
		Currency string `json:"currency"`
		Amount   string `json:"amount"`
	} `json:"payeeFspCommission,omitempty"`
	Expiration string `json:"expiration"`
	IlpPacket  string `json:"ilpPacket"`
	Condition  string `json:"condition"`
}

// Mojaloop Transfer Request
type TransferRequest struct {
	TransferId string `json:"transferId"`
	PayerFsp   string `json:"payerFsp"`
	PayeeFsp   string `json:"payeeFsp"`
	Amount     struct {
		Currency string `json:"currency"`
		Amount   string `json:"amount"`
	} `json:"amount"`
	IlpPacket  string `json:"ilpPacket"`
	Condition  string `json:"condition"`
	Expiration string `json:"expiration"`
}

// Mojaloop Transfer Response
type TransferResponse struct {
	TransferState string `json:"transferState"` // COMMITTED, ABORTED, RESERVED
	Fulfilment    string `json:"fulfilment,omitempty"`
	CompletedTimestamp string `json:"completedTimestamp,omitempty"`
	ExtensionList interface{} `json:"extensionList,omitempty"`
}

// Bulk Transfer Request (Mojaloop Bulk API)
type BulkTransferRequest struct {
	BulkTransferId string `json:"bulkTransferId"`
	BulkQuoteId    string `json:"bulkQuoteId"`
	PayerFsp       string `json:"payerFsp"`
	PayeeFsp       string `json:"payeeFsp"`
	IndividualTransfers []struct {
		TransferId     string `json:"transferId"`
		TransferAmount struct {
			Currency string `json:"currency"`
			Amount   string `json:"amount"`
		} `json:"transferAmount"`
		IlpPacket  string `json:"ilpPacket"`
		Condition  string `json:"condition"`
	} `json:"individualTransfers"`
	Expiration string `json:"expiration"`
}

// Bulk Transfer Response
type BulkTransferResponse struct {
	BulkTransferState string `json:"bulkTransferState"` // RECEIVED, PENDING, ACCEPTED, PROCESSING, COMPLETED, REJECTED
	CompletedTimestamp string `json:"completedTimestamp,omitempty"`
	IndividualTransferResults []struct {
		TransferId    string `json:"transferId"`
		Fulfilment    string `json:"fulfilment,omitempty"`
		ErrorInformation interface{} `json:"errorInformation,omitempty"`
	} `json:"individualTransferResults,omitempty"`
}

// Transaction Request (Merchant-initiated Request to Pay)
type TransactionRequest struct {
	TransactionRequestId string `json:"transactionRequestId"`
	Payee struct {
		PartyIdInfo struct {
			PartyIdType string `json:"partyIdType"`
			PartyId     string `json:"partyId"`
			FSPId       string `json:"fspId"`
		} `json:"partyIdInfo"`
		Name string `json:"name,omitempty"`
	} `json:"payee"`
	Payer struct {
		PartyIdType string `json:"partyIdType"`
		PartyId     string `json:"partyId"`
		FSPId       string `json:"fspId,omitempty"`
	} `json:"payer"`
	Amount struct {
		Currency string `json:"currency"`
		Amount   string `json:"amount"`
	} `json:"amount"`
	TransactionType struct {
		Scenario      string `json:"scenario"`
		Initiator     string `json:"initiator"`
		InitiatorType string `json:"initiatorType"`
	} `json:"transactionType"`
	Note string `json:"note,omitempty"`
}

// Transaction Request Response
type TransactionRequestResponse struct {
	TransactionId        string `json:"transactionId,omitempty"`
	TransactionRequestState string `json:"transactionRequestState"` // RECEIVED, PENDING, ACCEPTED, REJECTED
}

// Global config
var config Config

// Redis client for caching
var redisClient *redis.Client

// Initialize Redis client
func initRedis() {
	redisClient = redis.NewClient(&redis.Options{
		Addr:     config.RedisURL,
		Password: "",
		DB:       0,
	})

	ctx := context.Background()
	_, err := redisClient.Ping(ctx).Result()
	if err != nil {
		log.Printf("[Redis] Warning: Failed to connect to Redis: %v", err)
		log.Printf("[Redis] Caching will be disabled")
		redisClient = nil
	} else {
		log.Printf("[Redis] Connected successfully")
	}
}

// Keycloak JWT Auth Middleware
func keycloakAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		// Extract Bearer token
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
			c.Abort()
			return
		}
		token := parts[1]

		// Validate token with Keycloak
		valid, claims, err := validateKeycloakToken(token)
		if err != nil || !valid {
			log.Printf("[Auth] Token validation failed: %v", err)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// Set user info in context
		c.Set("userId", claims["sub"])
		c.Set("email", claims["email"])
		c.Set("roles", claims["realm_access"])

		c.Next()
	}
}

// Validate Keycloak token
func validateKeycloakToken(token string) (bool, map[string]interface{}, error) {
	// Call Keycloak userinfo endpoint to validate token
	url := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/userinfo", config.KeycloakURL, config.KeycloakRealm)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return false, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false, nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, nil, fmt.Errorf("token validation failed with status: %d", resp.StatusCode)
	}

	var claims map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&claims); err != nil {
		return false, nil, err
	}

	return true, claims, nil
}

// Permify Authorization Middleware
func permifyAuthzMiddleware(resource, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userId, exists := c.Get("userId")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
			c.Abort()
			return
		}

		// Check permission with Permify
		allowed, err := checkPermifyPermission(userId.(string), resource, action)
		if err != nil {
			log.Printf("[Permify] Error checking permission: %v", err)
			// Graceful degradation - allow if Permify is unavailable
			c.Next()
			return
		}

		if !allowed {
			c.JSON(http.StatusForbidden, gin.H{"error": "Permission denied"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// Check permission with Permify
func checkPermifyPermission(userId, resource, action string) (bool, error) {
	url := fmt.Sprintf("%s/v1/tenants/t1/permissions/check", config.PermifyURL)

	reqBody := map[string]interface{}{
		"metadata": map[string]interface{}{
			"schema_version": "",
			"snap_token":     "",
			"depth":          20,
		},
		"entity": map[string]interface{}{
			"type": resource,
			"id":   "*",
		},
		"permission": action,
		"subject": map[string]interface{}{
			"type": "user",
			"id":   userId,
		},
	}

	jsonData, _ := json.Marshal(reqBody)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("permify check failed with status: %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, err
	}

	can, ok := result["can"].(string)
	return ok && can == "CHECK_RESULT_ALLOWED", nil
}

// Redis cache helpers for party lookups and balances
func getCachedParty(partyIdType, partyId string) (*PartyResponse, error) {
	if redisClient == nil {
		return nil, nil
	}

	ctx := context.Background()
	key := fmt.Sprintf("mojaloop:party:%s:%s", partyIdType, partyId)

	data, err := redisClient.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil // Cache miss
	}
	if err != nil {
		return nil, err
	}

	var party PartyResponse
	if err := json.Unmarshal(data, &party); err != nil {
		return nil, err
	}

	log.Printf("[Redis] Cache hit for party %s:%s", partyIdType, partyId)
	return &party, nil
}

func cacheParty(partyIdType, partyId string, party *PartyResponse) error {
	if redisClient == nil {
		return nil
	}

	ctx := context.Background()
	key := fmt.Sprintf("mojaloop:party:%s:%s", partyIdType, partyId)

	data, err := json.Marshal(party)
	if err != nil {
		return err
	}

	// Cache for 5 minutes
	err = redisClient.Set(ctx, key, data, 5*time.Minute).Err()
	if err != nil {
		log.Printf("[Redis] Failed to cache party: %v", err)
		return err
	}

	log.Printf("[Redis] Cached party %s:%s", partyIdType, partyId)
	return nil
}

func getCachedBalance(farmerId string) (map[string]interface{}, error) {
	if redisClient == nil {
		return nil, nil
	}

	ctx := context.Background()
	key := fmt.Sprintf("tigerbeetle:balance:%s", farmerId)

	data, err := redisClient.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil // Cache miss
	}
	if err != nil {
		return nil, err
	}

	var balance map[string]interface{}
	if err := json.Unmarshal(data, &balance); err != nil {
		return nil, err
	}

	log.Printf("[Redis] Cache hit for balance %s", farmerId)
	return balance, nil
}

func cacheBalance(farmerId string, balance map[string]interface{}) error {
	if redisClient == nil {
		return nil
	}

	ctx := context.Background()
	key := fmt.Sprintf("tigerbeetle:balance:%s", farmerId)

	data, err := json.Marshal(balance)
	if err != nil {
		return err
	}

	// Cache for 30 seconds (balances change frequently)
	err = redisClient.Set(ctx, key, data, 30*time.Second).Err()
	if err != nil {
		log.Printf("[Redis] Failed to cache balance: %v", err)
		return err
	}

	log.Printf("[Redis] Cached balance for %s", farmerId)
	return nil
}

func invalidateBalanceCache(farmerId string) error {
	if redisClient == nil {
		return nil
	}

	ctx := context.Background()
	key := fmt.Sprintf("tigerbeetle:balance:%s", farmerId)

	err := redisClient.Del(ctx, key).Err()
	if err != nil {
		log.Printf("[Redis] Failed to invalidate balance cache: %v", err)
		return err
	}

	log.Printf("[Redis] Invalidated balance cache for %s", farmerId)
	return nil
}

// Initialize configuration
func initConfig() {
	// Load .env file
	godotenv.Load()

	config = Config{
		Port:             getEnv("MOJALOOP_GATEWAY_PORT", "8080"),
		MojaloopAPIURL:   getEnv("MOJALOOP_API_URL", "http://localhost:4000"),
		MojaloopFSPID:    getEnv("MOJALOOP_FSP_ID", "farmerpay"),
		DatabaseURL:      getEnv("DATABASE_URL", ""),
		CallbackURL:      getEnv("CALLBACK_URL", "http://localhost:3000/api/mojaloop/callback"),
		JWTSecret:        getEnv("JWT_SECRET", ""),
		KeycloakURL:      getEnv("KEYCLOAK_URL", "http://localhost:8180"),
		KeycloakRealm:    getEnv("KEYCLOAK_REALM", "farmer-app"),
		KeycloakClientID: getEnv("KEYCLOAK_CLIENT_ID", "mojaloop-gateway"),
		PermifyURL:       getEnv("PERMIFY_URL", "http://localhost:3476"),
		RedisURL:         getEnv("REDIS_URL", "localhost:6379"),
	}

	log.Printf("[Config] Mojaloop Gateway initialized")
	log.Printf("[Config] FSP ID: %s", config.MojaloopFSPID)
	log.Printf("[Config] API URL: %s", config.MojaloopAPIURL)
}

func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

// HTTP Client with TLS configuration
func getHTTPClient() *http.Client {
	return &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: false, // Set to true for dev/test only
			},
		},
	}
}

// Party Lookup Handler
func partyLookupHandler(c *gin.Context) {
	var req PartyLookupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[PartyLookup] Looking up %s: %s", req.PartyIdType, req.PartyId)

	// Call Mojaloop Party Lookup API
	url := fmt.Sprintf("%s/parties/%s/%s", config.MojaloopAPIURL, req.PartyIdType, req.PartyId)
	
	httpReq, err := http.NewRequest("GET", url, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	// Add Mojaloop headers
	httpReq.Header.Set("Content-Type", "application/vnd.interoperability.parties+json;version=1.0")
	httpReq.Header.Set("Accept", "application/vnd.interoperability.parties+json;version=1.0")
	httpReq.Header.Set("FSPIOP-Source", config.MojaloopFSPID)
	httpReq.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))

	client := getHTTPClient()
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("[PartyLookup] Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Mojaloop API error"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		log.Printf("[PartyLookup] Failed: %s", string(body))
		c.JSON(resp.StatusCode, gin.H{"error": "Party not found"})
		return
	}

	var partyResp PartyResponse
	if err := json.Unmarshal(body, &partyResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse response"})
		return
	}

	log.Printf("[PartyLookup] Success: %s", partyResp.Party.Name)
	c.JSON(http.StatusOK, partyResp)
}

// Quote Request Handler
func quoteRequestHandler(c *gin.Context) {
	var req QuoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[Quote] Requesting quote %s for %s %s", req.QuoteId, req.Amount.Amount, req.Amount.Currency)

	// Call Mojaloop Quote API
	url := fmt.Sprintf("%s/quotes", config.MojaloopAPIURL)
	
	jsonData, err := json.Marshal(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to marshal request"})
		return
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	// Add Mojaloop headers
	httpReq.Header.Set("Content-Type", "application/vnd.interoperability.quotes+json;version=1.0")
	httpReq.Header.Set("Accept", "application/vnd.interoperability.quotes+json;version=1.0")
	httpReq.Header.Set("FSPIOP-Source", config.MojaloopFSPID)
	httpReq.Header.Set("FSPIOP-Destination", req.Payee.PartyIdInfo.FSPId)
	httpReq.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))

	client := getHTTPClient()
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("[Quote] Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Mojaloop API error"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		log.Printf("[Quote] Failed: %s", string(body))
		c.JSON(resp.StatusCode, gin.H{"error": "Quote request failed"})
		return
	}

	var quoteResp QuoteResponse
	if err := json.Unmarshal(body, &quoteResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse response"})
		return
	}

	log.Printf("[Quote] Success: Transfer amount %s %s", quoteResp.TransferAmount.Amount, quoteResp.TransferAmount.Currency)
	c.JSON(http.StatusOK, quoteResp)
}

// Transfer Request Handler
func transferRequestHandler(c *gin.Context) {
	var req TransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[Transfer] Initiating transfer %s for %s %s", req.TransferId, req.Amount.Amount, req.Amount.Currency)

	// Call Mojaloop Transfer API
	url := fmt.Sprintf("%s/transfers", config.MojaloopAPIURL)
	
	jsonData, err := json.Marshal(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to marshal request"})
		return
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	// Add Mojaloop headers
	httpReq.Header.Set("Content-Type", "application/vnd.interoperability.transfers+json;version=1.0")
	httpReq.Header.Set("Accept", "application/vnd.interoperability.transfers+json;version=1.0")
	httpReq.Header.Set("FSPIOP-Source", req.PayerFsp)
	httpReq.Header.Set("FSPIOP-Destination", req.PayeeFsp)
	httpReq.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))

	client := getHTTPClient()
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("[Transfer] Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Mojaloop API error"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		log.Printf("[Transfer] Failed: %s", string(body))
		c.JSON(resp.StatusCode, gin.H{"error": "Transfer request failed"})
		return
	}

	var transferResp TransferResponse
	if err := json.Unmarshal(body, &transferResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse response"})
		return
	}

	log.Printf("[Transfer] Success: State %s", transferResp.TransferState)
	
	// Send callback to main application
	go sendCallback(req.TransferId, transferResp.TransferState, "")

	c.JSON(http.StatusOK, transferResp)
}

// Send callback to main application
func sendCallback(transferId, status, errorMsg string) {
	callbackData := map[string]string{
		"transferId": transferId,
		"status":     status,
		"error":      errorMsg,
	}

	jsonData, _ := json.Marshal(callbackData)
	
	resp, err := http.Post(config.CallbackURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("[Callback] Error sending callback: %v", err)
		return
	}
	defer resp.Body.Close()

	log.Printf("[Callback] Sent callback for transfer %s", transferId)
}

// Health check handler
func healthCheckHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "healthy",
		"service": "mojaloop-gateway",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"features": gin.H{
			"party_lookup":        true,
			"quotes":              true,
			"transfers":           true,
			"bulk_transfers":      true,
			"transaction_requests": true,
		},
	})
}

// Bulk Transfer Handler - for subsidy payouts, group disbursements
func bulkTransferHandler(c *gin.Context) {
	var req BulkTransferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[BulkTransfer] Initiating bulk transfer %s with %d individual transfers",
		req.BulkTransferId, len(req.IndividualTransfers))

	// Call Mojaloop Bulk Transfer API
	url := fmt.Sprintf("%s/bulkTransfers", config.MojaloopAPIURL)

	jsonData, err := json.Marshal(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to marshal request"})
		return
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	// Add Mojaloop headers for bulk transfers
	httpReq.Header.Set("Content-Type", "application/vnd.interoperability.bulkTransfers+json;version=1.0")
	httpReq.Header.Set("Accept", "application/vnd.interoperability.bulkTransfers+json;version=1.0")
	httpReq.Header.Set("FSPIOP-Source", req.PayerFsp)
	httpReq.Header.Set("FSPIOP-Destination", req.PayeeFsp)
	httpReq.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))

	client := getHTTPClient()
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("[BulkTransfer] Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Mojaloop API error"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		log.Printf("[BulkTransfer] Failed: %s", string(body))
		c.JSON(resp.StatusCode, gin.H{"error": "Bulk transfer request failed"})
		return
	}

	var bulkResp BulkTransferResponse
	if err := json.Unmarshal(body, &bulkResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse response"})
		return
	}

	log.Printf("[BulkTransfer] Success: State %s", bulkResp.BulkTransferState)

	// Send callback for bulk transfer
	go sendCallback(req.BulkTransferId, bulkResp.BulkTransferState, "")

	c.JSON(http.StatusOK, bulkResp)
}

// Transaction Request Handler - for merchant-initiated "request to pay"
func transactionRequestHandler(c *gin.Context) {
	var req TransactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("[TransactionRequest] Merchant %s requesting payment of %s %s from %s",
		req.Payee.PartyIdInfo.PartyId, req.Amount.Amount, req.Amount.Currency, req.Payer.PartyId)

	// Call Mojaloop Transaction Request API
	url := fmt.Sprintf("%s/transactionRequests", config.MojaloopAPIURL)

	jsonData, err := json.Marshal(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to marshal request"})
		return
	}

	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	// Add Mojaloop headers for transaction requests
	httpReq.Header.Set("Content-Type", "application/vnd.interoperability.transactionRequests+json;version=1.0")
	httpReq.Header.Set("Accept", "application/vnd.interoperability.transactionRequests+json;version=1.0")
	httpReq.Header.Set("FSPIOP-Source", req.Payee.PartyIdInfo.FSPId)
	if req.Payer.FSPId != "" {
		httpReq.Header.Set("FSPIOP-Destination", req.Payer.FSPId)
	}
	httpReq.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))

	client := getHTTPClient()
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("[TransactionRequest] Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Mojaloop API error"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		log.Printf("[TransactionRequest] Failed: %s", string(body))
		c.JSON(resp.StatusCode, gin.H{"error": "Transaction request failed"})
		return
	}

	var txResp TransactionRequestResponse
	if err := json.Unmarshal(body, &txResp); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse response"})
		return
	}

	log.Printf("[TransactionRequest] Success: State %s, TransactionId %s",
		txResp.TransactionRequestState, txResp.TransactionId)

	c.JSON(http.StatusOK, txResp)
}

// Settlement Window Handler - for settlement reconciliation
func settlementWindowHandler(c *gin.Context) {
	settlementWindowId := c.Param("windowId")

	log.Printf("[Settlement] Fetching settlement window %s", settlementWindowId)

	// Call Mojaloop Settlement API
	url := fmt.Sprintf("%s/settlementWindows/%s", config.MojaloopAPIURL, settlementWindowId)

	httpReq, err := http.NewRequest("GET", url, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("FSPIOP-Source", config.MojaloopFSPID)
	httpReq.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))

	client := getHTTPClient()
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("[Settlement] Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Mojaloop API error"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		log.Printf("[Settlement] Failed: %s", string(body))
		c.JSON(resp.StatusCode, gin.H{"error": "Settlement window fetch failed"})
		return
	}

	var settlementData map[string]interface{}
	if err := json.Unmarshal(body, &settlementData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse response"})
		return
	}

	log.Printf("[Settlement] Success: Window %s fetched", settlementWindowId)
	c.JSON(http.StatusOK, settlementData)
}

// Close Settlement Window Handler
func closeSettlementWindowHandler(c *gin.Context) {
	settlementWindowId := c.Param("windowId")

	log.Printf("[Settlement] Closing settlement window %s", settlementWindowId)

	// Call Mojaloop Settlement API to close window
	url := fmt.Sprintf("%s/settlementWindows/%s", config.MojaloopAPIURL, settlementWindowId)

	closeReq := map[string]interface{}{
		"state":  "CLOSED",
		"reason": "Settlement window closed via gateway",
	}
	jsonData, _ := json.Marshal(closeReq)

	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("FSPIOP-Source", config.MojaloopFSPID)
	httpReq.Header.Set("Date", time.Now().UTC().Format(http.TimeFormat))

	client := getHTTPClient()
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("[Settlement] Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Mojaloop API error"})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		log.Printf("[Settlement] Failed: %s", string(body))
		c.JSON(resp.StatusCode, gin.H{"error": "Settlement window close failed"})
		return
	}

	log.Printf("[Settlement] Success: Window %s closed", settlementWindowId)
	c.JSON(http.StatusOK, gin.H{
		"settlementWindowId": settlementWindowId,
		"state":              "CLOSED",
	})
}

func main() {
	// Initialize configuration
	initConfig()

	// Initialize Redis for caching
	initRedis()

	// Create Gin router
	router := gin.Default()

	// Public routes (no auth required)
	router.GET("/health", healthCheckHandler)

	// Protected routes with Keycloak auth and Permify authorization
	protected := router.Group("/api/v1")
	protected.Use(keycloakAuthMiddleware())
	{
		// Party Lookup - requires 'mojaloop:party:lookup' permission
		protected.POST("/party-lookup", permifyAuthzMiddleware("mojaloop", "party_lookup"), partyLookupHandler)

		// Quotes - requires 'mojaloop:quote:create' permission
		protected.POST("/quote", permifyAuthzMiddleware("mojaloop", "quote_create"), quoteRequestHandler)

		// Transfers - requires 'mojaloop:transfer:create' permission
		protected.POST("/transfer", permifyAuthzMiddleware("mojaloop", "transfer_create"), transferRequestHandler)
		protected.POST("/bulk-transfer", permifyAuthzMiddleware("mojaloop", "bulk_transfer_create"), bulkTransferHandler)

		// Transaction Requests - requires 'mojaloop:transaction_request:create' permission
		protected.POST("/transaction-request", permifyAuthzMiddleware("mojaloop", "transaction_request_create"), transactionRequestHandler)

		// Settlement - requires 'mojaloop:settlement:view' and 'mojaloop:settlement:close' permissions
		protected.GET("/settlement/:windowId", permifyAuthzMiddleware("mojaloop", "settlement_view"), settlementWindowHandler)
		protected.POST("/settlement/:windowId/close", permifyAuthzMiddleware("mojaloop", "settlement_close"), closeSettlementWindowHandler)
	}

	// Start server with graceful shutdown
	addr := fmt.Sprintf(":%s", config.Port)
	log.Printf("[Server] Mojaloop Gateway listening on %s", addr)
	log.Printf("[Server] Auth: Keycloak JWT + Permify RBAC")

	srv := &http.Server{
		Addr:         addr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Server] Failed to start: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	log.Printf("[Server] Received %v, shutting down...", sig)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("[Server] Shutdown error: %v", err)
	}
	log.Println("[Server] Mojaloop Gateway stopped")
}
