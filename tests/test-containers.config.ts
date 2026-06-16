/**
 * Test Containers Configuration
 *
 * Defines container setup for integration tests using Testcontainers.
 * Provides PostgreSQL, Redis, and Kafka containers for isolated testing.
 */

export interface TestContainerConfig {
  postgres: {
    image: string;
    port: number;
    database: string;
    username: string;
    password: string;
    extensions: string[];
  };
  redis: {
    image: string;
    port: number;
  };
  kafka: {
    image: string;
    port: number;
    topics: string[];
  };
}

export const testContainersConfig: TestContainerConfig = {
  postgres: {
    image: 'postgis/postgis:16-3.4',
    port: 5432,
    database: 'farmconnect_test',
    username: 'test_user',
    password: 'test_password',
    extensions: ['postgis', 'uuid-ossp', 'pg_trgm'],
  },
  redis: {
    image: 'redis:7-alpine',
    port: 6379,
  },
  kafka: {
    image: 'confluentinc/cp-kafka:7.5.0',
    port: 9092,
    topics: [
      'farmer-events',
      'loan-events',
      'payment-events',
      'notification-events',
      'audit-events',
      'iot-telemetry',
      'marketplace-events',
    ],
  },
};

/**
 * Docker Compose test override for CI environments.
 */
export const dockerComposeTestOverride = `
version: '3.8'
services:
  postgres-test:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: farmconnect_test
      POSTGRES_USER: test_user
      POSTGRES_PASSWORD: test_password
    ports:
      - "5433:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test_user -d farmconnect_test"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis-test:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  kafka-test:
    image: confluentinc/cp-kafka:7.5.0
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper-test:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    ports:
      - "9093:9092"
    depends_on:
      - zookeeper-test

  zookeeper-test:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
`;

/**
 * Environment variables for integration tests
 */
export const testEnvironment = {
  DATABASE_URL: 'postgresql://test_user:test_password@localhost:5433/farmconnect_test',
  REDIS_URL: 'redis://localhost:6380',
  KAFKA_BROKERS: 'localhost:9093',
  JWT_SECRET: 'test-jwt-secret-for-integration-tests-only-32chars!!',
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  OTEL_ENABLED: 'false',
};
