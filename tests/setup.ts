/**
 * Vitest Global Setup
 * Sets required environment variables before any test module loads.
 * This prevents module-level errors from missing env vars (e.g., JWT_SECRET).
 */

// Set required environment variables before any module loads
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-vitest-only-32chars!!';
process.env.NODE_ENV = 'test';
process.env.KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
