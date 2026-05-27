package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// APISIXConfig holds APISIX configuration
type APISIXConfig struct {
	AdminURL string
	APIKey   string
}

// APISIXClient provides APISIX API gateway operations
type APISIXClient struct {
	config     APISIXConfig
	httpClient *http.Client
}

// Route represents an APISIX route
type Route struct {
	ID          string                 `json:"id,omitempty"`
	Name        string                 `json:"name"`
	URI         string                 `json:"uri"`
	Methods     []string               `json:"methods,omitempty"`
	Upstream    *Upstream              `json:"upstream,omitempty"`
	UpstreamID  string                 `json:"upstream_id,omitempty"`
	Plugins     map[string]interface{} `json:"plugins,omitempty"`
	Priority    int                    `json:"priority,omitempty"`
	Status      int                    `json:"status,omitempty"`
	Labels      map[string]string      `json:"labels,omitempty"`
}

// Upstream represents an APISIX upstream
type Upstream struct {
	ID      string                 `json:"id,omitempty"`
	Name    string                 `json:"name,omitempty"`
	Type    string                 `json:"type,omitempty"` // roundrobin, chash, ewma, least_conn
	Nodes   map[string]int         `json:"nodes,omitempty"`
	Timeout *UpstreamTimeout       `json:"timeout,omitempty"`
	Retries int                    `json:"retries,omitempty"`
	Checks  map[string]interface{} `json:"checks,omitempty"`
}

// UpstreamTimeout represents upstream timeout configuration
type UpstreamTimeout struct {
	Connect int `json:"connect,omitempty"`
	Send    int `json:"send,omitempty"`
	Read    int `json:"read,omitempty"`
}

// Consumer represents an APISIX consumer
type Consumer struct {
	Username string                 `json:"username"`
	Plugins  map[string]interface{} `json:"plugins,omitempty"`
	Labels   map[string]string      `json:"labels,omitempty"`
}

// NewAPISIXClient creates a new APISIX client
func NewAPISIXClient(config APISIXConfig) *APISIXClient {
	if config.AdminURL == "" {
		config.AdminURL = "http://localhost:9180"
	}

	return &APISIXClient{
		config: config,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *APISIXClient) doRequest(ctx context.Context, method, path string, body interface{}) (map[string]interface{}, error) {
	url := fmt.Sprintf("%s/apisix/admin%s", c.config.AdminURL, path)

	var reqBody []byte
	var err error
	if body != nil {
		reqBody, err = json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	if c.config.APIKey != "" {
		req.Header.Set("X-API-KEY", c.config.APIKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return result, fmt.Errorf("request failed with status %d: %v", resp.StatusCode, result)
	}

	return result, nil
}

// CreateRoute creates or updates a route (idempotent via PUT)
func (c *APISIXClient) CreateRoute(ctx context.Context, routeID string, route Route) error {
	route.ID = routeID
	_, err := c.doRequest(ctx, "PUT", fmt.Sprintf("/routes/%s", routeID), route)
	if err != nil {
		return fmt.Errorf("failed to create route: %w", err)
	}
	log.Printf("[APISIX] Created/updated route: %s", routeID)
	return nil
}

// GetRoute retrieves a route
func (c *APISIXClient) GetRoute(ctx context.Context, routeID string) (*Route, error) {
	result, err := c.doRequest(ctx, "GET", fmt.Sprintf("/routes/%s", routeID), nil)
	if err != nil {
		return nil, err
	}

	value, ok := result["value"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid response format")
	}

	data, _ := json.Marshal(value)
	var route Route
	if err := json.Unmarshal(data, &route); err != nil {
		return nil, err
	}

	return &route, nil
}

// DeleteRoute deletes a route
func (c *APISIXClient) DeleteRoute(ctx context.Context, routeID string) error {
	_, err := c.doRequest(ctx, "DELETE", fmt.Sprintf("/routes/%s", routeID), nil)
	if err != nil {
		return fmt.Errorf("failed to delete route: %w", err)
	}
	log.Printf("[APISIX] Deleted route: %s", routeID)
	return nil
}

// CreateUpstream creates or updates an upstream (idempotent via PUT)
func (c *APISIXClient) CreateUpstream(ctx context.Context, upstreamID string, upstream Upstream) error {
	upstream.ID = upstreamID
	_, err := c.doRequest(ctx, "PUT", fmt.Sprintf("/upstreams/%s", upstreamID), upstream)
	if err != nil {
		return fmt.Errorf("failed to create upstream: %w", err)
	}
	log.Printf("[APISIX] Created/updated upstream: %s", upstreamID)
	return nil
}

// GetUpstream retrieves an upstream
func (c *APISIXClient) GetUpstream(ctx context.Context, upstreamID string) (*Upstream, error) {
	result, err := c.doRequest(ctx, "GET", fmt.Sprintf("/upstreams/%s", upstreamID), nil)
	if err != nil {
		return nil, err
	}

	value, ok := result["value"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid response format")
	}

	data, _ := json.Marshal(value)
	var upstream Upstream
	if err := json.Unmarshal(data, &upstream); err != nil {
		return nil, err
	}

	return &upstream, nil
}

// DeleteUpstream deletes an upstream
func (c *APISIXClient) DeleteUpstream(ctx context.Context, upstreamID string) error {
	_, err := c.doRequest(ctx, "DELETE", fmt.Sprintf("/upstreams/%s", upstreamID), nil)
	if err != nil {
		return fmt.Errorf("failed to delete upstream: %w", err)
	}
	log.Printf("[APISIX] Deleted upstream: %s", upstreamID)
	return nil
}

// CreateConsumer creates or updates a consumer (idempotent via PUT)
func (c *APISIXClient) CreateConsumer(ctx context.Context, consumer Consumer) error {
	_, err := c.doRequest(ctx, "PUT", fmt.Sprintf("/consumers/%s", consumer.Username), consumer)
	if err != nil {
		return fmt.Errorf("failed to create consumer: %w", err)
	}
	log.Printf("[APISIX] Created/updated consumer: %s", consumer.Username)
	return nil
}

// GetConsumer retrieves a consumer
func (c *APISIXClient) GetConsumer(ctx context.Context, username string) (*Consumer, error) {
	result, err := c.doRequest(ctx, "GET", fmt.Sprintf("/consumers/%s", username), nil)
	if err != nil {
		return nil, err
	}

	value, ok := result["value"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid response format")
	}

	data, _ := json.Marshal(value)
	var consumer Consumer
	if err := json.Unmarshal(data, &consumer); err != nil {
		return nil, err
	}

	return &consumer, nil
}

// DeleteConsumer deletes a consumer
func (c *APISIXClient) DeleteConsumer(ctx context.Context, username string) error {
	_, err := c.doRequest(ctx, "DELETE", fmt.Sprintf("/consumers/%s", username), nil)
	if err != nil {
		return fmt.Errorf("failed to delete consumer: %w", err)
	}
	log.Printf("[APISIX] Deleted consumer: %s", username)
	return nil
}

// Common plugin configurations

// RateLimitPlugin returns a rate limiting plugin configuration
func RateLimitPlugin(rate, burst int, key string) map[string]interface{} {
	return map[string]interface{}{
		"limit-req": map[string]interface{}{
			"rate":  rate,
			"burst": burst,
			"key":   key, // "remote_addr", "consumer_name", "service_id"
		},
	}
}

// JWTAuthPlugin returns a JWT authentication plugin configuration
func JWTAuthPlugin(key, secret string) map[string]interface{} {
	return map[string]interface{}{
		"jwt-auth": map[string]interface{}{
			"key":    key,
			"secret": secret,
		},
	}
}

// KeyAuthPlugin returns a key authentication plugin configuration
func KeyAuthPlugin(key string) map[string]interface{} {
	return map[string]interface{}{
		"key-auth": map[string]interface{}{
			"key": key,
		},
	}
}

// CORSPlugin returns a CORS plugin configuration
func CORSPlugin(origins []string, methods []string) map[string]interface{} {
	return map[string]interface{}{
		"cors": map[string]interface{}{
			"allow_origins": origins,
			"allow_methods": methods,
			"allow_headers": "*",
			"max_age":       3600,
		},
	}
}

// ProxyRewritePlugin returns a proxy rewrite plugin configuration
func ProxyRewritePlugin(regexURI []string) map[string]interface{} {
	return map[string]interface{}{
		"proxy-rewrite": map[string]interface{}{
			"regex_uri": regexURI,
		},
	}
}

// IdempotencyPlugin returns an idempotency plugin configuration
func IdempotencyPlugin(headerName string, ttl int) map[string]interface{} {
	return map[string]interface{}{
		"idempotent": map[string]interface{}{
			"header_name": headerName,
			"ttl":         ttl,
		},
	}
}

// SetupFarmerAPIRoutes sets up routes for the farmer API
func (c *APISIXClient) SetupFarmerAPIRoutes(ctx context.Context, backendHost string, backendPort int) error {
	// Create upstream
	upstream := Upstream{
		Name: "farmer-api-upstream",
		Type: "roundrobin",
		Nodes: map[string]int{
			fmt.Sprintf("%s:%d", backendHost, backendPort): 1,
		},
		Timeout: &UpstreamTimeout{
			Connect: 6,
			Send:    6,
			Read:    6,
		},
		Retries: 3,
	}

	if err := c.CreateUpstream(ctx, "farmer-api", upstream); err != nil {
		return err
	}

	// Create routes
	routes := []struct {
		ID    string
		Route Route
	}{
		{
			ID: "farmer-api-trpc",
			Route: Route{
				Name:       "Farmer API tRPC",
				URI:        "/trpc/*",
				Methods:    []string{"GET", "POST"},
				UpstreamID: "farmer-api",
				Plugins: map[string]interface{}{
					"limit-req": map[string]interface{}{
						"rate":  100,
						"burst": 50,
						"key":   "remote_addr",
					},
				},
			},
		},
		{
			ID: "farmer-api-health",
			Route: Route{
				Name:       "Farmer API Health",
				URI:        "/health",
				Methods:    []string{"GET"},
				UpstreamID: "farmer-api",
			},
		},
	}

	for _, r := range routes {
		if err := c.CreateRoute(ctx, r.ID, r.Route); err != nil {
			return err
		}
	}

	log.Printf("[APISIX] Set up farmer API routes")
	return nil
}

// CheckHealth checks if APISIX is healthy
func (c *APISIXClient) CheckHealth(ctx context.Context) (bool, error) {
	url := fmt.Sprintf("%s/apisix/status", c.config.AdminURL)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return false, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, nil
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK, nil
}
