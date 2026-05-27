package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// IdempotencyService provides idempotent operation handling
type IdempotencyService struct {
	redis *redis.Client
	ttl   time.Duration
}

// IdempotencyResult represents the result of an idempotent operation
type IdempotencyResult struct {
	Key       string      `json:"key"`
	Status    string      `json:"status"` // "new", "processing", "completed", "failed"
	Result    interface{} `json:"result,omitempty"`
	Error     string      `json:"error,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
}

// NewIdempotencyService creates a new idempotency service
func NewIdempotencyService(redisClient *redis.Client, ttl time.Duration) *IdempotencyService {
	if ttl == 0 {
		ttl = 24 * time.Hour // Default 24 hour TTL
	}
	return &IdempotencyService{
		redis: redisClient,
		ttl:   ttl,
	}
}

// GenerateKey generates a deterministic idempotency key from business identifiers
func GenerateKey(prefix string, identifiers ...interface{}) string {
	data := fmt.Sprintf("%s:", prefix)
	for _, id := range identifiers {
		data += fmt.Sprintf("%v:", id)
	}
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:16]) // Use first 16 bytes for shorter key
}

// GenerateTransferID generates a deterministic transfer ID for TigerBeetle
// This ensures the same logical transfer always gets the same ID
func GenerateTransferID(farmerId int, entityType string, entityId int, sequence int) uint64 {
	key := fmt.Sprintf("transfer:%d:%s:%d:%d", farmerId, entityType, entityId, sequence)
	hash := sha256.Sum256([]byte(key))
	// Use first 8 bytes as uint64
	var id uint64
	for i := 0; i < 8; i++ {
		id = (id << 8) | uint64(hash[i])
	}
	return id
}

// GenerateAccountID generates a deterministic account ID for TigerBeetle
func GenerateAccountID(farmerId int, accountType int) uint64 {
	return uint64(farmerId)*10000 + uint64(accountType)
}

// TryAcquire attempts to acquire an idempotency lock
// Returns (isNew, existingResult, error)
func (s *IdempotencyService) TryAcquire(ctx context.Context, key string) (bool, *IdempotencyResult, error) {
	idempKey := fmt.Sprintf("idempotency:%s", key)

	// Try to get existing result
	existing, err := s.redis.Get(ctx, idempKey).Result()
	if err == nil {
		// Key exists - return existing result
		var result IdempotencyResult
		if err := json.Unmarshal([]byte(existing), &result); err != nil {
			return false, nil, fmt.Errorf("failed to unmarshal existing result: %w", err)
		}
		return false, &result, nil
	}
	if err != redis.Nil {
		return false, nil, fmt.Errorf("redis error: %w", err)
	}

	// Key doesn't exist - try to acquire lock with SETNX
	now := time.Now()
	newResult := IdempotencyResult{
		Key:       key,
		Status:    "processing",
		CreatedAt: now,
		UpdatedAt: now,
	}
	data, _ := json.Marshal(newResult)

	// Use SETNX to atomically set if not exists
	success, err := s.redis.SetNX(ctx, idempKey, data, s.ttl).Result()
	if err != nil {
		return false, nil, fmt.Errorf("failed to acquire lock: %w", err)
	}

	if !success {
		// Another process acquired the lock - get their result
		existing, err := s.redis.Get(ctx, idempKey).Result()
		if err != nil {
			return false, nil, fmt.Errorf("failed to get concurrent result: %w", err)
		}
		var result IdempotencyResult
		if err := json.Unmarshal([]byte(existing), &result); err != nil {
			return false, nil, fmt.Errorf("failed to unmarshal concurrent result: %w", err)
		}
		return false, &result, nil
	}

	return true, nil, nil
}

// Complete marks an idempotent operation as completed with result
func (s *IdempotencyService) Complete(ctx context.Context, key string, result interface{}) error {
	idempKey := fmt.Sprintf("idempotency:%s", key)

	completedResult := IdempotencyResult{
		Key:       key,
		Status:    "completed",
		Result:    result,
		UpdatedAt: time.Now(),
	}
	data, _ := json.Marshal(completedResult)

	return s.redis.Set(ctx, idempKey, data, s.ttl).Err()
}

// Fail marks an idempotent operation as failed
func (s *IdempotencyService) Fail(ctx context.Context, key string, errMsg string) error {
	idempKey := fmt.Sprintf("idempotency:%s", key)

	failedResult := IdempotencyResult{
		Key:       key,
		Status:    "failed",
		Error:     errMsg,
		UpdatedAt: time.Now(),
	}
	data, _ := json.Marshal(failedResult)

	return s.redis.Set(ctx, idempKey, data, s.ttl).Err()
}

// Release releases an idempotency lock (for cleanup on error before completion)
func (s *IdempotencyService) Release(ctx context.Context, key string) error {
	idempKey := fmt.Sprintf("idempotency:%s", key)
	return s.redis.Del(ctx, idempKey).Err()
}

// ProcessedEventsTracker tracks processed Kafka/Fluvio events for exactly-once semantics
type ProcessedEventsTracker struct {
	redis *redis.Client
	ttl   time.Duration
}

// NewProcessedEventsTracker creates a new event tracker
func NewProcessedEventsTracker(redisClient *redis.Client, ttl time.Duration) *ProcessedEventsTracker {
	if ttl == 0 {
		ttl = 7 * 24 * time.Hour // Default 7 day TTL for event deduplication
	}
	return &ProcessedEventsTracker{
		redis: redisClient,
		ttl:   ttl,
	}
}

// IsProcessed checks if an event has already been processed
func (t *ProcessedEventsTracker) IsProcessed(ctx context.Context, eventID string) (bool, error) {
	key := fmt.Sprintf("processed_event:%s", eventID)
	exists, err := t.redis.Exists(ctx, key).Result()
	if err != nil {
		return false, err
	}
	return exists > 0, nil
}

// MarkProcessed marks an event as processed
func (t *ProcessedEventsTracker) MarkProcessed(ctx context.Context, eventID string) error {
	key := fmt.Sprintf("processed_event:%s", eventID)
	return t.redis.Set(ctx, key, time.Now().Unix(), t.ttl).Err()
}

// DistributedLock provides distributed locking for non-atomic operations
type DistributedLock struct {
	redis  *redis.Client
	key    string
	value  string
	ttl    time.Duration
}

// NewDistributedLock creates a new distributed lock
func NewDistributedLock(redisClient *redis.Client, resource string, ttl time.Duration) *DistributedLock {
	return &DistributedLock{
		redis: redisClient,
		key:   fmt.Sprintf("lock:%s", resource),
		value: fmt.Sprintf("%d-%d", time.Now().UnixNano(), time.Now().UnixNano()%1000000),
		ttl:   ttl,
	}
}

// Acquire attempts to acquire the lock
func (l *DistributedLock) Acquire(ctx context.Context) (bool, error) {
	return l.redis.SetNX(ctx, l.key, l.value, l.ttl).Result()
}

// Release releases the lock (only if we own it)
func (l *DistributedLock) Release(ctx context.Context) error {
	// Use Lua script to atomically check and delete
	script := `
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("del", KEYS[1])
		else
			return 0
		end
	`
	_, err := l.redis.Eval(ctx, script, []string{l.key}, l.value).Result()
	return err
}

// Extend extends the lock TTL (for long-running operations)
func (l *DistributedLock) Extend(ctx context.Context, ttl time.Duration) error {
	script := `
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("pexpire", KEYS[1], ARGV[2])
		else
			return 0
		end
	`
	_, err := l.redis.Eval(ctx, script, []string{l.key}, l.value, ttl.Milliseconds()).Result()
	return err
}
