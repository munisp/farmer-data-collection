package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// CacheService provides Redis caching with idempotency support
type CacheService struct {
	client     *redis.Client
	defaultTTL time.Duration
}

// RedisConfig holds Redis configuration
type RedisConfig struct {
	URL        string
	DefaultTTL time.Duration
}

// NewCacheService creates a new cache service
func NewCacheService(config RedisConfig) (*CacheService, error) {
	opts, err := redis.ParseURL(config.URL)
	if err != nil {
		// Fallback to simple address
		opts = &redis.Options{
			Addr: config.URL,
		}
	}

	client := redis.NewClient(opts)

	// Test connection
	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	ttl := config.DefaultTTL
	if ttl == 0 {
		ttl = 5 * time.Minute
	}

	log.Printf("[Redis] Connected to %s", config.URL)
	return &CacheService{
		client:     client,
		defaultTTL: ttl,
	}, nil
}

// Get retrieves a value from cache
func (c *CacheService) Get(ctx context.Context, key string, dest interface{}) error {
	val, err := c.client.Get(ctx, key).Result()
	if err == redis.Nil {
		return fmt.Errorf("key not found: %s", key)
	}
	if err != nil {
		return err
	}

	return json.Unmarshal([]byte(val), dest)
}

// Set stores a value in cache with TTL
func (c *CacheService) Set(ctx context.Context, key string, value interface{}, ttl ...time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal value: %w", err)
	}

	expiry := c.defaultTTL
	if len(ttl) > 0 {
		expiry = ttl[0]
	}

	return c.client.Set(ctx, key, data, expiry).Err()
}

// Delete removes a key from cache
func (c *CacheService) Delete(ctx context.Context, key string) error {
	return c.client.Del(ctx, key).Err()
}

// DeletePattern removes all keys matching a pattern
func (c *CacheService) DeletePattern(ctx context.Context, pattern string) error {
	keys, err := c.client.Keys(ctx, pattern).Result()
	if err != nil {
		return err
	}

	if len(keys) > 0 {
		if err := c.client.Del(ctx, keys...).Err(); err != nil {
			return err
		}
		log.Printf("[Cache] Deleted %d keys matching pattern: %s", len(keys), pattern)
	}

	return nil
}

// Exists checks if a key exists
func (c *CacheService) Exists(ctx context.Context, key string) (bool, error) {
	result, err := c.client.Exists(ctx, key).Result()
	if err != nil {
		return false, err
	}
	return result > 0, nil
}

// GetOrSet retrieves from cache or computes and caches the value
func (c *CacheService) GetOrSet(ctx context.Context, key string, dest interface{}, fetcher func() (interface{}, error), ttl ...time.Duration) error {
	// Try to get from cache
	err := c.Get(ctx, key, dest)
	if err == nil {
		log.Printf("[Cache] HIT: %s", key)
		return nil
	}

	// Cache miss - fetch data
	log.Printf("[Cache] MISS: %s", key)
	data, err := fetcher()
	if err != nil {
		return err
	}

	// Store in cache
	if err := c.Set(ctx, key, data, ttl...); err != nil {
		log.Printf("[Cache] Error caching %s: %v", key, err)
	}

	// Copy to destination
	jsonData, _ := json.Marshal(data)
	return json.Unmarshal(jsonData, dest)
}

// Incr increments a counter
func (c *CacheService) Incr(ctx context.Context, key string) (int64, error) {
	return c.client.Incr(ctx, key).Result()
}

// Decr decrements a counter
func (c *CacheService) Decr(ctx context.Context, key string) (int64, error) {
	return c.client.Decr(ctx, key).Result()
}

// Expire sets expiration on a key
func (c *CacheService) Expire(ctx context.Context, key string, ttl time.Duration) error {
	return c.client.Expire(ctx, key, ttl).Err()
}

// GetStats returns cache statistics
func (c *CacheService) GetStats(ctx context.Context) (map[string]interface{}, error) {
	info, err := c.client.Info(ctx, "stats").Result()
	if err != nil {
		return nil, err
	}

	dbsize, err := c.client.DBSize(ctx).Result()
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"keys": dbsize,
		"info": info,
	}, nil
}

// GetClient returns the underlying Redis client
func (c *CacheService) GetClient() *redis.Client {
	return c.client
}

// Close closes the Redis connection
func (c *CacheService) Close() error {
	return c.client.Close()
}

// RateLimiter provides rate limiting using Redis
type RateLimiter struct {
	cache      *CacheService
	maxRequests int
	window     time.Duration
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(cache *CacheService, maxRequests int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		cache:       cache,
		maxRequests: maxRequests,
		window:      window,
	}
}

// Allow checks if a request is allowed under rate limiting
func (r *RateLimiter) Allow(ctx context.Context, identifier string) (bool, int, error) {
	key := fmt.Sprintf("ratelimit:%s", identifier)

	// Increment counter
	count, err := r.cache.Incr(ctx, key)
	if err != nil {
		return false, 0, err
	}

	// Set expiry on first request
	if count == 1 {
		r.cache.Expire(ctx, key, r.window)
	}

	remaining := r.maxRequests - int(count)
	if remaining < 0 {
		remaining = 0
	}

	return count <= int64(r.maxRequests), remaining, nil
}

// Reset resets the rate limit for an identifier
func (r *RateLimiter) Reset(ctx context.Context, identifier string) error {
	key := fmt.Sprintf("ratelimit:%s", identifier)
	return r.cache.Delete(ctx, key)
}

// SessionStore provides session management using Redis
type SessionStore struct {
	cache *CacheService
	ttl   time.Duration
}

// Session represents a user session
type Session struct {
	ID        string                 `json:"id"`
	UserID    int                    `json:"user_id"`
	Data      map[string]interface{} `json:"data"`
	CreatedAt time.Time              `json:"created_at"`
	ExpiresAt time.Time              `json:"expires_at"`
}

// NewSessionStore creates a new session store
func NewSessionStore(cache *CacheService, ttl time.Duration) *SessionStore {
	if ttl == 0 {
		ttl = 24 * time.Hour
	}
	return &SessionStore{
		cache: cache,
		ttl:   ttl,
	}
}

// Create creates a new session
func (s *SessionStore) Create(ctx context.Context, userID int, data map[string]interface{}) (*Session, error) {
	sessionID := GenerateKey("session", userID, time.Now().UnixNano())

	session := &Session{
		ID:        sessionID,
		UserID:    userID,
		Data:      data,
		CreatedAt: time.Now(),
		ExpiresAt: time.Now().Add(s.ttl),
	}

	key := fmt.Sprintf("session:%s", sessionID)
	if err := s.cache.Set(ctx, key, session, s.ttl); err != nil {
		return nil, err
	}

	return session, nil
}

// Get retrieves a session
func (s *SessionStore) Get(ctx context.Context, sessionID string) (*Session, error) {
	key := fmt.Sprintf("session:%s", sessionID)
	var session Session
	if err := s.cache.Get(ctx, key, &session); err != nil {
		return nil, err
	}
	return &session, nil
}

// Update updates session data
func (s *SessionStore) Update(ctx context.Context, sessionID string, data map[string]interface{}) error {
	session, err := s.Get(ctx, sessionID)
	if err != nil {
		return err
	}

	for k, v := range data {
		session.Data[k] = v
	}

	key := fmt.Sprintf("session:%s", sessionID)
	return s.cache.Set(ctx, key, session, s.ttl)
}

// Delete deletes a session
func (s *SessionStore) Delete(ctx context.Context, sessionID string) error {
	key := fmt.Sprintf("session:%s", sessionID)
	return s.cache.Delete(ctx, key)
}

// Refresh extends session expiration
func (s *SessionStore) Refresh(ctx context.Context, sessionID string) error {
	session, err := s.Get(ctx, sessionID)
	if err != nil {
		return err
	}

	session.ExpiresAt = time.Now().Add(s.ttl)

	key := fmt.Sprintf("session:%s", sessionID)
	return s.cache.Set(ctx, key, session, s.ttl)
}
