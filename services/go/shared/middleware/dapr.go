package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// DaprConfig holds Dapr configuration
type DaprConfig struct {
	Host     string
	HTTPPort string
	GRPCPort string
}

// DaprComponents defines the available Dapr components
var DaprComponents = struct {
	PubSub      string
	StateStore  string
	SecretStore string
}{
	PubSub:      "kafka-pubsub",
	StateStore:  "redis-state",
	SecretStore: "local-secret-store",
}

// DaprTopics defines the available Dapr topics (matching Kafka topics)
var DaprTopics = struct {
	FarmerEvents      string
	FarmEvents        string
	CropEvents        string
	LivestockEvents   string
	HarvestEvents     string
	ExpenseEvents     string
	AuthEvents        string
	CacheInvalidation string
	AuditTrail        string
	Notifications     string
	Analytics         string
	// Financial/Payment topics (Mojaloop & TigerBeetle)
	MojaloopTransfers    string
	MojaloopQuotes       string
	MojaloopParties      string
	MojaloopSettlements  string
	TigerBeetleLedger    string
	TigerBeetleAccounts  string
	LoanDisbursements    string
	LoanRepayments       string
	PaymentEvents        string
}{
	FarmerEvents:      "farmer.events",
	FarmEvents:        "farm.events",
	CropEvents:        "crop.events",
	LivestockEvents:   "livestock.events",
	HarvestEvents:     "harvest.events",
	ExpenseEvents:     "expense.events",
	AuthEvents:        "auth.events",
	CacheInvalidation: "cache.invalidation",
	AuditTrail:        "audit.trail",
	Notifications:     "notifications",
	Analytics:         "analytics",
	// Financial/Payment topics (Mojaloop & TigerBeetle)
	MojaloopTransfers:    "mojaloop.transfers",
	MojaloopQuotes:       "mojaloop.quotes",
	MojaloopParties:      "mojaloop.parties",
	MojaloopSettlements:  "mojaloop.settlements",
	TigerBeetleLedger:    "tigerbeetle.ledger",
	TigerBeetleAccounts:  "tigerbeetle.accounts",
	LoanDisbursements:    "loan.disbursements",
	LoanRepayments:       "loan.repayments",
	PaymentEvents:        "payment.events",
}

// DaprClient provides Dapr service mesh operations
type DaprClient struct {
	config       DaprConfig
	httpClient   *http.Client
	eventTracker *ProcessedEventsTracker
}

// NewDaprClient creates a new Dapr client
func NewDaprClient(config DaprConfig, eventTracker *ProcessedEventsTracker) *DaprClient {
	if config.Host == "" {
		config.Host = "127.0.0.1"
	}
	if config.HTTPPort == "" {
		config.HTTPPort = "3500"
	}

	return &DaprClient{
		config: config,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		eventTracker: eventTracker,
	}
}

func (c *DaprClient) baseURL() string {
	return fmt.Sprintf("http://%s:%s", c.config.Host, c.config.HTTPPort)
}

// PublishEvent publishes an event via Dapr pub/sub
func (c *DaprClient) PublishEvent(ctx context.Context, topic string, data interface{}) error {
	url := fmt.Sprintf("%s/v1.0/publish/%s/%s", c.baseURL(), DaprComponents.PubSub, topic)

	body, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal event data: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("[Dapr] Failed to publish event: %v", err)
		// Graceful degradation - don't throw
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("publish failed with status: %d", resp.StatusCode)
	}

	log.Printf("[Dapr] Published event to topic: %s", topic)
	return nil
}

// SaveState saves state via Dapr state management
func (c *DaprClient) SaveState(ctx context.Context, key string, value interface{}, metadata map[string]string) error {
	url := fmt.Sprintf("%s/v1.0/state/%s", c.baseURL(), DaprComponents.StateStore)

	stateItem := []map[string]interface{}{
		{
			"key":   key,
			"value": value,
		},
	}
	if metadata != nil {
		stateItem[0]["metadata"] = metadata
	}

	body, err := json.Marshal(stateItem)
	if err != nil {
		return fmt.Errorf("failed to marshal state: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to save state: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("save state failed with status: %d", resp.StatusCode)
	}

	log.Printf("[Dapr] Saved state: %s", key)
	return nil
}

// SaveStateWithETag saves state with optimistic concurrency (idempotent updates)
func (c *DaprClient) SaveStateWithETag(ctx context.Context, key string, value interface{}, etag string) error {
	url := fmt.Sprintf("%s/v1.0/state/%s", c.baseURL(), DaprComponents.StateStore)

	stateItem := []map[string]interface{}{
		{
			"key":   key,
			"value": value,
			"etag":  etag,
			"options": map[string]string{
				"concurrency": "first-write",
			},
		},
	}

	body, err := json.Marshal(stateItem)
	if err != nil {
		return fmt.Errorf("failed to marshal state: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to save state: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusConflict {
		return fmt.Errorf("ETag mismatch - state was modified by another process")
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("save state failed with status: %d", resp.StatusCode)
	}

	log.Printf("[Dapr] Saved state with ETag: %s", key)
	return nil
}

// GetState retrieves state via Dapr state management
func (c *DaprClient) GetState(ctx context.Context, key string) (interface{}, string, error) {
	url := fmt.Sprintf("%s/v1.0/state/%s/%s", c.baseURL(), DaprComponents.StateStore, key)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, "", err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("failed to get state: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, "", nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("get state failed with status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}

	etag := resp.Header.Get("ETag")

	var value interface{}
	if err := json.Unmarshal(body, &value); err != nil {
		// Return raw string if not JSON
		return string(body), etag, nil
	}

	log.Printf("[Dapr] Retrieved state: %s", key)
	return value, etag, nil
}

// DeleteState deletes state via Dapr state management
func (c *DaprClient) DeleteState(ctx context.Context, key string) error {
	url := fmt.Sprintf("%s/v1.0/state/%s/%s", c.baseURL(), DaprComponents.StateStore, key)

	req, err := http.NewRequestWithContext(ctx, "DELETE", url, nil)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to delete state: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("delete state failed with status: %d", resp.StatusCode)
	}

	log.Printf("[Dapr] Deleted state: %s", key)
	return nil
}

// BulkGetState retrieves multiple state values
func (c *DaprClient) BulkGetState(ctx context.Context, keys []string) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/v1.0/state/%s/bulk", c.baseURL(), DaprComponents.StateStore)

	reqBody := map[string]interface{}{
		"keys": keys,
	}
	body, _ := json.Marshal(reqBody)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to bulk get state: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("bulk get state failed with status: %d", resp.StatusCode)
	}

	var results []struct {
		Key  string      `json:"key"`
		Data interface{} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, err
	}

	resultMap := make(map[string]interface{})
	for _, item := range results {
		resultMap[item.Key] = item.Data
	}

	log.Printf("[Dapr] Retrieved bulk state: %d keys", len(keys))
	return resultMap, nil
}

// InvokeService invokes another service via Dapr service invocation
func (c *DaprClient) InvokeService(ctx context.Context, serviceID, methodName string, data interface{}) (interface{}, error) {
	url := fmt.Sprintf("%s/v1.0/invoke/%s/method/%s", c.baseURL(), serviceID, methodName)

	var body io.Reader
	if data != nil {
		jsonData, err := json.Marshal(data)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request data: %w", err)
		}
		body = bytes.NewReader(jsonData)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, body)
	if err != nil {
		return nil, err
	}
	if data != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to invoke service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("service invocation failed with status: %d", resp.StatusCode)
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return string(respBody), nil
	}

	log.Printf("[Dapr] Invoked service: %s.%s", serviceID, methodName)
	return result, nil
}

// GetSecret retrieves a secret from Dapr secret store
func (c *DaprClient) GetSecret(ctx context.Context, secretName string) (map[string]string, error) {
	url := fmt.Sprintf("%s/v1.0/secrets/%s/%s", c.baseURL(), DaprComponents.SecretStore, secretName)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get secret: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("get secret failed with status: %d", resp.StatusCode)
	}

	var result map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	log.Printf("[Dapr] Retrieved secret: %s", secretName)
	return result, nil
}

// CheckHealth checks if Dapr sidecar is healthy
func (c *DaprClient) CheckHealth(ctx context.Context) (bool, error) {
	url := fmt.Sprintf("%s/v1.0/healthz", c.baseURL())

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return false, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, nil
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNoContent, nil
}
