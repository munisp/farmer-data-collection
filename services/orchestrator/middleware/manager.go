package middleware

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	"github.com/dapr/go-sdk/client"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
	_ "github.com/lib/pq"
)

// Config holds all middleware connection configurations
type Config struct {
	KafkaBrokers      string
	RedisAddr         string
	DaprHTTPPort      string
	FluvioEndpoint    string
	KeycloakURL       string
	PermifyURL        string
	APISIXGateway     string
	TigerBeetleAddr   string
	LakehouseURL      string
	PostgresURL       string
}

// Manager manages all middleware connections
type Manager struct {
	Config *Config

	// Kafka
	KafkaWriter *kafka.Writer
	KafkaReader *kafka.Reader

	// Redis
	RedisClient *redis.Client

	// Dapr
	DaprClient client.Client

	// PostgreSQL
	PostgresDB *sql.DB

	// HTTP clients for external services
	KeycloakClient  *HTTPClient
	PermifyClient   *HTTPClient
	APISIXClient    *HTTPClient
	TigerBeetleClient *HTTPClient
	LakehouseClient *HTTPClient
	FluvioClient    *HTTPClient
}

// HTTPClient wraps basic HTTP client functionality
type HTTPClient struct {
	BaseURL string
	// Add auth tokens, headers, etc. as needed
}

// NewManager creates and initializes all middleware connections
func NewManager(config *Config) (*Manager, error) {
	manager := &Manager{
		Config: config,
	}

	// Initialize Kafka
	if err := manager.initKafka(); err != nil {
		return nil, fmt.Errorf("failed to initialize Kafka: %w", err)
	}

	// Initialize Redis
	if err := manager.initRedis(); err != nil {
		return nil, fmt.Errorf("failed to initialize Redis: %w", err)
	}

	// Initialize Dapr
	if err := manager.initDapr(); err != nil {
		return nil, fmt.Errorf("failed to initialize Dapr: %w", err)
	}

	// Initialize PostgreSQL
	if err := manager.initPostgres(); err != nil {
		return nil, fmt.Errorf("failed to initialize PostgreSQL: %w", err)
	}

	// Initialize HTTP clients
	manager.initHTTPClients()

	log.Println("✅ All middleware connections initialized")
	return manager, nil
}

func (m *Manager) initKafka() error {
	// Kafka Writer for producing events
	m.KafkaWriter = &kafka.Writer{
		Addr:     kafka.TCP(m.Config.KafkaBrokers),
		Topic:    "farmer-events",
		Balancer: &kafka.LeastBytes{},
	}

	// Kafka Reader for consuming events
	m.KafkaReader = kafka.NewReader(kafka.ReaderConfig{
		Brokers: []string{m.Config.KafkaBrokers},
		Topic:   "farmer-events",
		GroupID: "orchestrator-group",
	})

	log.Println("✅ Kafka initialized")
	return nil
}

func (m *Manager) initRedis() error {
	m.RedisClient = redis.NewClient(&redis.Options{
		Addr: m.Config.RedisAddr,
	})

	// Test connection
	ctx := context.Background()
	if err := m.RedisClient.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("Redis ping failed: %w", err)
	}

	log.Println("✅ Redis initialized")
	return nil
}

func (m *Manager) initDapr() error {
	daprClient, err := client.NewClient()
	if err != nil {
		return fmt.Errorf("failed to create Dapr client: %w", err)
	}
	m.DaprClient = daprClient

	log.Println("✅ Dapr initialized")
	return nil
}

func (m *Manager) initPostgres() error {
	db, err := sql.Open("postgres", m.Config.PostgresURL)
	if err != nil {
		return fmt.Errorf("failed to open PostgreSQL connection: %w", err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		return fmt.Errorf("PostgreSQL ping failed: %w", err)
	}

	m.PostgresDB = db
	log.Println("✅ PostgreSQL initialized")
	return nil
}

func (m *Manager) initHTTPClients() {
	m.KeycloakClient = &HTTPClient{BaseURL: m.Config.KeycloakURL}
	m.PermifyClient = &HTTPClient{BaseURL: m.Config.PermifyURL}
	m.APISIXClient = &HTTPClient{BaseURL: m.Config.APISIXGateway}
	m.TigerBeetleClient = &HTTPClient{BaseURL: m.Config.TigerBeetleAddr}
	m.LakehouseClient = &HTTPClient{BaseURL: m.Config.LakehouseURL}
	m.FluvioClient = &HTTPClient{BaseURL: m.Config.FluvioEndpoint}

	log.Println("✅ HTTP clients initialized")
}

// Close closes all middleware connections
func (m *Manager) Close() {
	if m.KafkaWriter != nil {
		m.KafkaWriter.Close()
	}
	if m.KafkaReader != nil {
		m.KafkaReader.Close()
	}
	if m.RedisClient != nil {
		m.RedisClient.Close()
	}
	if m.DaprClient != nil {
		m.DaprClient.Close()
	}
	if m.PostgresDB != nil {
		m.PostgresDB.Close()
	}

	log.Println("✅ All middleware connections closed")
}

// Kafka Operations
func (m *Manager) PublishEvent(ctx context.Context, key string, value []byte) error {
	return m.KafkaWriter.WriteMessages(ctx, kafka.Message{
		Key:   []byte(key),
		Value: value,
	})
}

// Redis Operations
func (m *Manager) CacheSet(ctx context.Context, key string, value interface{}) error {
	return m.RedisClient.Set(ctx, key, value, 0).Err()
}

func (m *Manager) CacheGet(ctx context.Context, key string) (string, error) {
	return m.RedisClient.Get(ctx, key).Result()
}

// Dapr State Operations
func (m *Manager) SaveState(ctx context.Context, storeName, key string, value []byte) error {
	return m.DaprClient.SaveState(ctx, storeName, key, value, nil)
}

func (m *Manager) GetState(ctx context.Context, storeName, key string) ([]byte, error) {
	item, err := m.DaprClient.GetState(ctx, storeName, key, nil)
	if err != nil {
		return nil, err
	}
	return item.Value, nil
}

// PostgreSQL Operations
func (m *Manager) QueryDB(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	return m.PostgresDB.QueryContext(ctx, query, args...)
}

func (m *Manager) ExecDB(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	return m.PostgresDB.ExecContext(ctx, query, args...)
}
