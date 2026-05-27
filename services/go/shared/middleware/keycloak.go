package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// KeycloakUser represents a user from Keycloak
type KeycloakUser struct {
	ID        string   `json:"id"`
	Email     string   `json:"email"`
	FirstName string   `json:"first_name,omitempty"`
	LastName  string   `json:"last_name,omitempty"`
	Username  string   `json:"username"`
	Roles     []string `json:"roles"`
}

// KeycloakConfig holds Keycloak configuration
type KeycloakConfig struct {
	URL          string
	Realm        string
	ClientID     string
	ClientSecret string
}

// KeycloakClient provides Keycloak authentication operations
type KeycloakClient struct {
	config     KeycloakConfig
	httpClient *http.Client
	jwksCache  map[string]interface{}
	jwksMu     sync.RWMutex
	jwksExpiry time.Time
}

// NewKeycloakClient creates a new Keycloak client
func NewKeycloakClient(config KeycloakConfig) *KeycloakClient {
	if config.URL == "" {
		config.URL = "http://localhost:8080"
	}
	if config.Realm == "" {
		config.Realm = "farmer-realm"
	}
	if config.ClientID == "" {
		config.ClientID = "farmer-api"
	}

	return &KeycloakClient{
		config: config,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		jwksCache: make(map[string]interface{}),
	}
}

// VerifyToken verifies a JWT token and returns the user
func (c *KeycloakClient) VerifyToken(ctx context.Context, tokenString string) (*KeycloakUser, error) {
	// Parse the token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}

		// Get the key ID
		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, fmt.Errorf("missing key ID in token header")
		}

		// Get the public key from JWKS
		return c.getPublicKey(ctx, kid)
	})

	if err != nil {
		log.Printf("[Keycloak] Token verification failed: %v", err)
		return nil, err
	}

	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	// Extract claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid token claims")
	}

	// Verify issuer
	expectedIssuer := fmt.Sprintf("%s/realms/%s", c.config.URL, c.config.Realm)
	if iss, _ := claims["iss"].(string); iss != expectedIssuer {
		return nil, fmt.Errorf("invalid issuer: expected %s, got %s", expectedIssuer, iss)
	}

	// Extract user information
	user := &KeycloakUser{
		ID:       claims["sub"].(string),
		Username: getStringClaim(claims, "preferred_username"),
		Email:    getStringClaim(claims, "email"),
	}

	if user.Email == "" {
		user.Email = user.Username
	}

	user.FirstName = getStringClaim(claims, "given_name")
	user.LastName = getStringClaim(claims, "family_name")

	// Extract roles from realm_access
	if realmAccess, ok := claims["realm_access"].(map[string]interface{}); ok {
		if roles, ok := realmAccess["roles"].([]interface{}); ok {
			for _, role := range roles {
				if roleStr, ok := role.(string); ok {
					user.Roles = append(user.Roles, roleStr)
				}
			}
		}
	}

	return user, nil
}

// getPublicKey retrieves the public key from JWKS
func (c *KeycloakClient) getPublicKey(ctx context.Context, kid string) (interface{}, error) {
	c.jwksMu.RLock()
	if key, ok := c.jwksCache[kid]; ok && time.Now().Before(c.jwksExpiry) {
		c.jwksMu.RUnlock()
		return key, nil
	}
	c.jwksMu.RUnlock()

	// Fetch JWKS
	jwksURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/certs", c.config.URL, c.config.Realm)
	resp, err := c.httpClient.Get(jwksURL)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("JWKS request failed with status: %d", resp.StatusCode)
	}

	var jwks struct {
		Keys []map[string]interface{} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("failed to decode JWKS: %w", err)
	}

	// Cache the keys
	c.jwksMu.Lock()
	c.jwksExpiry = time.Now().Add(24 * time.Hour)
	for _, key := range jwks.Keys {
		if keyID, ok := key["kid"].(string); ok {
			c.jwksCache[keyID] = key
		}
	}
	c.jwksMu.Unlock()

	// Return the requested key
	c.jwksMu.RLock()
	defer c.jwksMu.RUnlock()
	if key, ok := c.jwksCache[kid]; ok {
		return key, nil
	}

	return nil, fmt.Errorf("key not found: %s", kid)
}

// GetServiceAccountToken gets a service account token for backend-to-backend calls
func (c *KeycloakClient) GetServiceAccountToken(ctx context.Context) (string, error) {
	if c.config.ClientSecret == "" {
		return "", fmt.Errorf("client secret not configured")
	}

	tokenURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token", c.config.URL, c.config.Realm)

	data := url.Values{}
	data.Set("grant_type", "client_credentials")
	data.Set("client_id", c.config.ClientID)
	data.Set("client_secret", c.config.ClientSecret)

	req, err := http.NewRequestWithContext(ctx, "POST", tokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to get service account token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token request failed with status: %d", resp.StatusCode)
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode token response: %w", err)
	}

	return tokenResp.AccessToken, nil
}

// IntrospectToken introspects a token to validate and get user info
func (c *KeycloakClient) IntrospectToken(ctx context.Context, token string) (map[string]interface{}, error) {
	if c.config.ClientSecret == "" {
		return nil, fmt.Errorf("client secret not configured")
	}

	introspectURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token/introspect", c.config.URL, c.config.Realm)

	data := url.Values{}
	data.Set("token", token)
	data.Set("client_id", c.config.ClientID)
	data.Set("client_secret", c.config.ClientSecret)

	req, err := http.NewRequestWithContext(ctx, "POST", introspectURL, strings.NewReader(data.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to introspect token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("introspection failed with status: %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode introspection response: %w", err)
	}

	// Check if token is active
	if active, ok := result["active"].(bool); !ok || !active {
		return nil, fmt.Errorf("token is not active")
	}

	return result, nil
}

// GetUserInfo gets user info from the userinfo endpoint
func (c *KeycloakClient) GetUserInfo(ctx context.Context, token string) (map[string]interface{}, error) {
	userInfoURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/userinfo", c.config.URL, c.config.Realm)

	req, err := http.NewRequestWithContext(ctx, "GET", userInfoURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get user info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("userinfo request failed with status: %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode userinfo response: %w", err)
	}

	return result, nil
}

// HasRole checks if a user has a specific role
func HasRole(user *KeycloakUser, role string) bool {
	if user == nil {
		return false
	}
	for _, r := range user.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// HasAnyRole checks if a user has any of the specified roles
func HasAnyRole(user *KeycloakUser, roles []string) bool {
	if user == nil {
		return false
	}
	for _, role := range roles {
		if HasRole(user, role) {
			return true
		}
	}
	return false
}

// HasAllRoles checks if a user has all of the specified roles
func HasAllRoles(user *KeycloakUser, roles []string) bool {
	if user == nil {
		return false
	}
	for _, role := range roles {
		if !HasRole(user, role) {
			return false
		}
	}
	return true
}

// Helper function to safely get string claims
func getStringClaim(claims jwt.MapClaims, key string) string {
	if val, ok := claims[key].(string); ok {
		return val
	}
	return ""
}
