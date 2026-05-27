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

// PermifyConfig holds Permify configuration
type PermifyConfig struct {
	URL      string
	TenantID string
}

// PermifyClient provides fine-grained authorization using Permify (Zanzibar-style)
type PermifyClient struct {
	config     PermifyConfig
	httpClient *http.Client
	cache      *CacheService
}

// NewPermifyClient creates a new Permify client
func NewPermifyClient(config PermifyConfig, cache *CacheService) *PermifyClient {
	if config.URL == "" {
		config.URL = "http://localhost:3476"
	}
	if config.TenantID == "" {
		config.TenantID = "default"
	}

	return &PermifyClient{
		config: config,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		cache: cache,
	}
}

// Entity represents a resource entity
type Entity struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// Subject represents a subject (user or entity)
type Subject struct {
	Type     string `json:"type"`
	ID       string `json:"id"`
	Relation string `json:"relation,omitempty"`
}

// Tuple represents a relationship tuple
type Tuple struct {
	Entity   Entity  `json:"entity"`
	Relation string  `json:"relation"`
	Subject  Subject `json:"subject"`
}

// CheckPermissionRequest represents a permission check request
type CheckPermissionRequest struct {
	TenantID   string `json:"tenant_id"`
	Entity     Entity `json:"entity"`
	Permission string `json:"permission"`
	Subject    Subject `json:"subject"`
}

// CheckPermissionResponse represents a permission check response
type CheckPermissionResponse struct {
	Can bool `json:"can"`
}

// CheckPermission checks if a subject has permission on an entity
func (c *PermifyClient) CheckPermission(ctx context.Context, userID interface{}, resource string, resourceID interface{}, action string) (bool, error) {
	// Try cache first
	cacheKey := fmt.Sprintf("permify:check:%v:%s:%v:%s", userID, resource, resourceID, action)
	if c.cache != nil {
		var cached bool
		if err := c.cache.Get(ctx, cacheKey, &cached); err == nil {
			log.Printf("[Permify] Cache HIT: %s", cacheKey)
			return cached, nil
		}
	}

	// Build request
	reqBody := map[string]interface{}{
		"tenant_id": c.config.TenantID,
		"metadata": map[string]interface{}{
			"schema_version": "",
			"snap_token":     "",
			"depth":          20,
		},
		"entity": map[string]interface{}{
			"type": resource,
			"id":   fmt.Sprintf("%v", resourceID),
		},
		"permission": action,
		"subject": map[string]interface{}{
			"type": "user",
			"id":   fmt.Sprintf("%v", userID),
		},
	}

	body, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("%s/v1/tenants/%s/permissions/check", c.config.URL, c.config.TenantID)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("[Permify] Permission check failed: %v", err)
		// Fail closed - deny access on error
		return false, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[Permify] Permission check returned status: %d", resp.StatusCode)
		return false, nil
	}

	var result struct {
		Can string `json:"can"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, err
	}

	allowed := result.Can == "CHECK_RESULT_ALLOWED"

	// Cache the result
	if c.cache != nil {
		c.cache.Set(ctx, cacheKey, allowed, 5*time.Minute)
	}

	log.Printf("[Permify] Permission check: user=%v resource=%s:%v action=%s allowed=%v", userID, resource, resourceID, action, allowed)
	return allowed, nil
}

// CreateRelationship creates a relationship tuple (idempotent)
func (c *PermifyClient) CreateRelationship(ctx context.Context, entity Entity, relation string, subject Subject) error {
	reqBody := map[string]interface{}{
		"tenant_id": c.config.TenantID,
		"metadata": map[string]interface{}{
			"schema_version": "",
		},
		"tuples": []map[string]interface{}{
			{
				"entity":   entity,
				"relation": relation,
				"subject":  subject,
			},
		},
	}

	body, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("%s/v1/tenants/%s/relationships/write", c.config.URL, c.config.TenantID)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to create relationship: %w", err)
	}
	defer resp.Body.Close()

	// Treat "already exists" as success (idempotent)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusConflict {
		return fmt.Errorf("create relationship failed with status: %d", resp.StatusCode)
	}

	// Invalidate cache
	if c.cache != nil {
		pattern := fmt.Sprintf("permify:check:*:%s:%s:*", entity.Type, entity.ID)
		c.cache.DeletePattern(ctx, pattern)
	}

	log.Printf("[Permify] Created relationship: %s:%s -> %s -> %s:%s", entity.Type, entity.ID, relation, subject.Type, subject.ID)
	return nil
}

// DeleteRelationship deletes a relationship tuple
func (c *PermifyClient) DeleteRelationship(ctx context.Context, entity Entity, relation string, subject Subject) error {
	reqBody := map[string]interface{}{
		"tenant_id": c.config.TenantID,
		"filter": map[string]interface{}{
			"entity": map[string]interface{}{
				"type": entity.Type,
				"ids":  []string{entity.ID},
			},
			"relation": relation,
			"subject": map[string]interface{}{
				"type":     subject.Type,
				"ids":      []string{subject.ID},
				"relation": subject.Relation,
			},
		},
	}

	body, _ := json.Marshal(reqBody)
	url := fmt.Sprintf("%s/v1/tenants/%s/relationships/delete", c.config.URL, c.config.TenantID)

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to delete relationship: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("delete relationship failed with status: %d", resp.StatusCode)
	}

	// Invalidate cache
	if c.cache != nil {
		pattern := fmt.Sprintf("permify:check:*:%s:%s:*", entity.Type, entity.ID)
		c.cache.DeletePattern(ctx, pattern)
	}

	log.Printf("[Permify] Deleted relationship: %s:%s -> %s -> %s:%s", entity.Type, entity.ID, relation, subject.Type, subject.ID)
	return nil
}

// Helper functions for common permission patterns

// GrantFarmerAccess grants a user access to a farmer record
func (c *PermifyClient) GrantFarmerAccess(ctx context.Context, userID int, farmerID int, role string) error {
	return c.CreateRelationship(ctx,
		Entity{Type: "farmer", ID: fmt.Sprintf("%d", farmerID)},
		role,
		Subject{Type: "user", ID: fmt.Sprintf("%d", userID)},
	)
}

// RevokeFarmerAccess revokes a user's access to a farmer record
func (c *PermifyClient) RevokeFarmerAccess(ctx context.Context, userID int, farmerID int, role string) error {
	return c.DeleteRelationship(ctx,
		Entity{Type: "farmer", ID: fmt.Sprintf("%d", farmerID)},
		role,
		Subject{Type: "user", ID: fmt.Sprintf("%d", userID)},
	)
}

// CanViewFarmer checks if a user can view a farmer record
func (c *PermifyClient) CanViewFarmer(ctx context.Context, userID int, farmerID int) (bool, error) {
	return c.CheckPermission(ctx, userID, "farmer", farmerID, "view")
}

// CanEditFarmer checks if a user can edit a farmer record
func (c *PermifyClient) CanEditFarmer(ctx context.Context, userID int, farmerID int) (bool, error) {
	return c.CheckPermission(ctx, userID, "farmer", farmerID, "edit")
}

// CanDeleteFarmer checks if a user can delete a farmer record
func (c *PermifyClient) CanDeleteFarmer(ctx context.Context, userID int, farmerID int) (bool, error) {
	return c.CheckPermission(ctx, userID, "farmer", farmerID, "delete")
}

// GrantLoanAccess grants a user access to a loan record
func (c *PermifyClient) GrantLoanAccess(ctx context.Context, userID int, loanID int, role string) error {
	return c.CreateRelationship(ctx,
		Entity{Type: "loan", ID: fmt.Sprintf("%d", loanID)},
		role,
		Subject{Type: "user", ID: fmt.Sprintf("%d", userID)},
	)
}

// CanApproveLoan checks if a user can approve a loan
func (c *PermifyClient) CanApproveLoan(ctx context.Context, userID int, loanID int) (bool, error) {
	return c.CheckPermission(ctx, userID, "loan", loanID, "approve")
}

// CanDisburseLoan checks if a user can disburse a loan
func (c *PermifyClient) CanDisburseLoan(ctx context.Context, userID int, loanID int) (bool, error) {
	return c.CheckPermission(ctx, userID, "loan", loanID, "disburse")
}
