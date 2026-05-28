/**
 * Environment Configuration & Validation
 * Validates all required env vars at startup using Zod.
 * Fail fast if critical secrets are missing.
 */
import { z } from "zod";
import { logger } from './logger.js';

const envSchema = z.object({
  // Core
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  SERVICE_NAME: z.string().default("farmer-data-collection"),
  SERVICE_VERSION: z.string().default("1.0.0"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DEFAULT_CURRENCY: z.enum(["NGN", "GHS", "KES", "UGX", "TZS", "USD", "EUR", "GBP"]).default("NGN"),

  // Database
  DATABASE_URL: z.string().url().optional(),
  DATABASE_HOST: z.string().default("localhost"),
  DATABASE_PORT: z.coerce.number().default(5432),
  DATABASE_NAME: z.string().default("farmer_data"),
  DATABASE_USER: z.string().default("postgres"),
  DATABASE_PASSWORD: z.string().default("postgres"),
  DATABASE_POOL_SIZE: z.coerce.number().default(20),
  DATABASE_REPLICA_HOSTS: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_POOL_IDLE_TIMEOUT: z.coerce.number().default(30000),
  DB_CONNECT_TIMEOUT: z.coerce.number().default(5000),
  DB_STATEMENT_TIMEOUT: z.coerce.number().default(30000),

  // Authentication
  JWT_SECRET: z.string().min(16).optional(),
  KEYCLOAK_URL: z.string().url().optional(),
  KEYCLOAK_REALM: z.string().default("farmer-data-collection"),
  KEYCLOAK_CLIENT_ID: z.string().optional(),
  KEYCLOAK_CLIENT_SECRET: z.string().optional(),
  KEYCLOAK_PUBLIC_KEY: z.string().optional(),
  KEYCLOAK_ENABLED: z.string().default("false"),
  KEYCLOAK_ADMIN_USERNAME: z.string().optional(),
  KEYCLOAK_ADMIN_PASSWORD: z.string().optional(),

  // Authorization (Permify)
  PERMIFY_ENDPOINT: z.string().url().optional(),

  // Redis
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_URL: z.string().optional(),

  // Kafka
  KAFKA_BROKERS: z.string().default("localhost:9093"),
  KAFKA_CLIENT_ID: z.string().default("farmer-data-collection"),

  // Microservices — Go
  GO_IMAGE_SERVICE_URL: z.string().url().optional(),
  GO_WEBSOCKET_SERVICE_URL: z.string().url().optional(),
  TILE_CACHE_URL: z.string().url().optional(),
  DELIVERY_SERVICE_URL: z.string().url().optional(),
  FLEET_SERVICE_URL: z.string().url().optional(),
  COLD_CHAIN_SERVICE_URL: z.string().url().optional(),
  CACHE_SERVICE_URL: z.string().url().optional(),

  // Microservices — Rust
  SPATIAL_QUERY_SERVICE_URL: z.string().url().optional(),
  SEARCH_SERVICE_URL: z.string().url().optional(),
  WAF_SERVICE_URL: z.string().url().optional(),
  FLUVIO_SERVICE_URL: z.string().url().optional(),

  // Microservices — Python
  GEOCODING_SERVICE_URL: z.string().url().optional(),
  ML_SERVICE_URL: z.string().url().optional(),
  PYTHON_ML_SERVICE_URL: z.string().url().optional(),
  AI_DIAGNOSTICS_URL: z.string().url().optional(),
  WEATHER_SERVICE_URL: z.string().url().optional(),
  CREDIT_SCORING_SERVICE_URL: z.string().url().optional(),
  VOICE_SERVICE_URL: z.string().url().optional(),
  SATELLITE_SERVICE_URL: z.string().url().optional(),

  // Feature Flags (Dapr)
  DAPR_HOST: z.string().default("localhost"),
  DAPR_HTTP_PORT: z.coerce.number().default(3500),
  DAPR_GRPC_PORT: z.coerce.number().default(50001),
  FEATURE_FLAGS_SERVICE_URL: z.string().url().optional(),

  // Payments
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  MOBILE_MONEY_SERVICE_URL: z.string().url().optional(),

  // TigerBeetle
  TIGERBEETLE_CLUSTER_ID: z.string().default("0"),
  TIGERBEETLE_REPLICA_ADDRESSES: z.string().default("3000"),
  TIGERBEETLE_ADDRESS: z.string().optional(),
  TIGERBEETLE_ADDRESSES: z.string().optional(),
  TIGERBEETLE_SERVICE_URL: z.string().url().optional(),

  // Mojaloop
  MOJALOOP_API_URL: z.string().url().optional(),
  MOJALOOP_FSP_ID: z.string().default("farmer-fsp"),
  MOJALOOP_GATEWAY_URL: z.string().url().optional(),
  MOJALOOP_HOST: z.string().optional(),
  MOJALOOP_SERVICE_URL: z.string().url().optional(),

  // OpenSearch
  OPENSEARCH_URL: z.string().url().optional(),
  OPENSEARCH_USERNAME: z.string().optional(),
  OPENSEARCH_PASSWORD: z.string().optional(),

  // Temporal
  TEMPORAL_ADDRESS: z.string().optional(),

  // Lakehouse
  LAKEHOUSE_STORAGE_TYPE: z.string().default("s3"),
  LAKEHOUSE_STORAGE_ENDPOINT: z.string().optional(),
  LAKEHOUSE_BUCKET: z.string().optional(),
  LAKEHOUSE_ACCESS_KEY: z.string().optional(),
  LAKEHOUSE_SECRET_KEY: z.string().optional(),
  LAKEHOUSE_REGION: z.string().default("us-east-1"),
  LAKEHOUSE_TABLE_FORMAT: z.string().default("iceberg"),
  LAKEHOUSE_CATALOG_TYPE: z.string().default("rest"),
  LAKEHOUSE_CATALOG_URI: z.string().optional(),
  LAKEHOUSE_WAREHOUSE: z.string().optional(),
  LAKEHOUSE_QUERY_ENGINE: z.string().default("trino"),
  LAKEHOUSE_QUERY_CONNECTION: z.string().optional(),
  LAKEHOUSE_SERVICE_URL: z.string().url().optional(),
  LAKEHOUSE_USE_SSL: z.string().default("true"),
  LAKEHOUSE_MAX_CONNECTIONS: z.coerce.number().default(10),

  // S3
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // External APIs
  OPENWEATHER_API_KEY: z.string().optional(),
  EXCHANGE_RATE_API_KEY: z.string().optional(),
  EXCHANGE_RATE_API_URL: z.string().optional(),
  SENTINEL_HUB_CLIENT_ID: z.string().optional(),
  SENTINEL_HUB_CLIENT_SECRET: z.string().optional(),
  SENTINEL_HUB_INSTANCE_ID: z.string().optional(),
  COPERNICUS_API_KEY: z.string().optional(),
  NASA_EARTHDATA_API_KEY: z.string().optional(),
  LEAF_API_KEY: z.string().optional(),
  LEAF_API_URL: z.string().optional(),

  // SMS/Comms
  AFRICASTALKING_API_KEY: z.string().optional(),
  AFRICASTALKING_USERNAME: z.string().optional(),
  AFRICASTALKING_SENDER_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),

  // WhatsApp Business
  META_WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  META_WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_API_URL: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: z.string().default("false"),
  EMAIL_FROM: z.string().optional(),
  EMAIL_FROM_NAME: z.string().optional(),
  EMAIL_PROVIDER: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  ENABLE_EMAIL_NOTIFICATIONS: z.string().default("false"),
  ENABLE_SMS_NOTIFICATIONS: z.string().default("false"),

  // Observability
  SENTRY_DSN: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().default(0.1),
  SENTRY_PROFILES_SAMPLE_RATE: z.coerce.number().default(0.1),
  SENTRY_DEBUG: z.string().default("false"),
  JAEGER_ENDPOINT: z.string().optional(),
  ENABLE_TRACING: z.string().default("false"),

  // gRPC services
  GRPC_COLD_CHAIN_SERVICE_ADDR: z.string().optional(),
  GRPC_DELIVERY_SERVICE_ADDR: z.string().optional(),
  GRPC_EQUIPMENT_FLEET_SERVICE_ADDR: z.string().optional(),
  GRPC_ML_INFERENCE_SERVICE_ADDR: z.string().optional(),
  GRPC_MOBILE_MONEY_SERVICE_ADDR: z.string().optional(),
  GRPC_PRICE_PREDICTION_SERVICE_ADDR: z.string().optional(),
  GRPC_TOKENIZATION_SERVICE_ADDR: z.string().optional(),

  // LLM/AI
  LLM_PROVIDER: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_ENDPOINT: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_TEMPERATURE: z.coerce.number().default(0.7),
  LLM_MAX_TOKENS: z.coerce.number().default(2048),
  AGRI_LLM_URL: z.string().optional(),
  OLLAMA_SERVICE_URL: z.string().optional(),

  // Embedding
  EMBEDDING_MODEL: z.string().optional(),
  EMBEDDING_ENDPOINT: z.string().optional(),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(384),

  // CDN
  CDN_ENABLED: z.string().default("false"),
  CDN_DOMAIN: z.string().optional(),
  CDN_URL: z.string().optional(),
  CDN_PROVIDER: z.string().optional(),
  CDN_PATH_PREFIX: z.string().optional(),
  CDN_SIGN_URLS: z.string().default("false"),
  CDN_EXPIRATION_SECONDS: z.coerce.number().default(3600),
  CDN_PURGE_ENDPOINT: z.string().optional(),
  CDN_PURGE_API_KEY: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),

  // mTLS
  MTLS_ENABLED: z.string().default("false"),
  MTLS_CA_CERT: z.string().optional(),

  // CORS
  ALLOWED_ORIGINS: z.string().optional(),

  // Misc
  USSD_USE_REDIS: z.string().default("false"),
  IMAGE_SERVICE_URL: z.string().url().optional(),
  MODEL_SERVING_URL: z.string().url().optional(),
  REALTIME_SERVICE_URL: z.string().url().optional(),
  MESSAGING_MIDDLEWARE_URL: z.string().url().optional(),
  MESSAGING_MIDDLEWARE_ENABLED: z.string().default("false"),
  MESSAGING_ANALYTICS_URL: z.string().url().optional(),
  KYC_SERVICE_URL: z.string().url().optional(),
  LOAN_ORCHESTRATOR_URL: z.string().url().optional(),
  LOAN_WORKER_URL: z.string().url().optional(),
  DRONE_SERVICE_URL: z.string().url().optional(),
  PRICE_PREDICTION_SERVICE_URL: z.string().url().optional(),
  ENABLE_SEDONA_SCHEDULER: z.string().default("false"),

  // ERP
  ERPNEXT_URL: z.string().optional(),
  ERPNEXT_API_KEY: z.string().optional(),
  ERPNEXT_API_SECRET: z.string().optional(),
  ERPNEXT_ENCRYPTION_KEY: z.string().optional(),

  // AWS
  AWS_REGION: z.string().default("us-east-1"),

  // OpenAppSec
  OPENAPPSEC_URL: z.string().url().optional(),
  OPENAPPSEC_TOKEN: z.string().optional(),

  // Vite (client)
  VITE_APP_URL: z.string().optional(),
  VITE_FRONTEND_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function validateEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`
    );
    logger.error("Environment validation failed:\n" + missing.join("\n"));
    // In production, fail hard. In dev, warn and continue with defaults.
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
    // Parse with defaults for dev
    _env = envSchema.parse({
      ...process.env,
      // Fill required fields with dev defaults
      JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-in-production-min16chars",
    });
    return _env;
  }

  _env = result.data;
  return _env;
}

export function getEnv(): Env {
  if (!_env) return validateEnv();
  return _env;
}
