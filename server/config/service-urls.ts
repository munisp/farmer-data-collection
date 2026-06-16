/**
 * Centralized service URL configuration.
 * All service endpoints are env-overridable with sensible defaults.
 */

export const SERVICE_URLS = {
  // Core infrastructure
  POSTGRES_URL: process.env.DATABASE_URL || "postgresql://localhost:5432/farmconnect",
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  KAFKA_BROKERS: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),

  // Financial infrastructure
  TIGERBEETLE_URL: process.env.TIGERBEETLE_URL || "http://localhost:3004",
  MOJALOOP_HUB_URL: process.env.MOJALOOP_HUB_URL || "http://localhost:4000",

  // Auth & security
  KEYCLOAK_URL: process.env.KEYCLOAK_URL || "http://localhost:8080",
  KEYCLOAK_REALM: process.env.KEYCLOAK_REALM || "farmconnect",
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID || "farmconnect-api",
  PERMIFY_URL: process.env.PERMIFY_URL || "http://localhost:3476",
  OPENAPPSEC_URL: process.env.OPENAPPSEC_URL || "http://localhost:19400",

  // Search & analytics
  OPENSEARCH_URL: process.env.OPENSEARCH_URL || "http://localhost:9200",

  // Event streaming
  FLUVIO_URL: process.env.FLUVIO_URL || "http://localhost:9003",
  DAPR_HTTP_ENDPOINT: process.env.DAPR_HTTP_ENDPOINT || "http://localhost:3500",

  // API gateway
  APISIX_ADMIN_URL: process.env.APISIX_ADMIN_URL || "http://localhost:9180",
  APISIX_GATEWAY_URL: process.env.APISIX_GATEWAY_URL || "http://localhost:9080",

  // Polyglot microservices
  WEATHER_SERVICE_URL: process.env.WEATHER_SERVICE_URL || "http://localhost:8107",
  BLOCKCHAIN_SERVICE_URL: process.env.BLOCKCHAIN_SERVICE_URL || "http://localhost:8110",
  DELIVERY_SERVICE_URL: process.env.DELIVERY_SERVICE_URL || "http://localhost:8111",
  CEA_AI_SERVICE_URL: process.env.CEA_AI_SERVICE_URL || "http://localhost:8112",
  AQUACULTURE_POND_URL: process.env.AQUACULTURE_POND_URL || "http://localhost:8113",
  AQUACULTURE_FEED_URL: process.env.AQUACULTURE_FEED_URL || "http://localhost:8114",
  AQUACULTURE_AI_URL: process.env.AQUACULTURE_AI_URL || "http://localhost:8115",
  IOT_GATEWAY_URL: process.env.IOT_GATEWAY_URL || "http://localhost:8108",
  ML_SERVICE_URL: process.env.ML_SERVICE_URL || "http://localhost:8109",

  // New polyglot services
  CONTRACT_FARMING_URL: process.env.CONTRACT_FARMING_URL || "http://localhost:8116",
  WAREHOUSE_RECEIPT_URL: process.env.WAREHOUSE_RECEIPT_URL || "http://localhost:8117",
  CONVERSATIONAL_COMMERCE_URL: process.env.CONVERSATIONAL_COMMERCE_URL || "http://localhost:8118",

  // Legacy polyglot services
  MOBILE_MONEY_URL: process.env.MOBILE_MONEY_SERVICE_URL || "http://localhost:8090",
  COLD_CHAIN_URL: process.env.COLD_CHAIN_SERVICE_URL || "http://localhost:8092",
  PRICE_SERVICE_URL: process.env.PRICE_PREDICTION_SERVICE_URL || "http://localhost:8093",
  KYC_SERVICE_URL: process.env.KYC_SERVICE_URL || "http://localhost:8104",
  AGRI_LLM_URL: process.env.AGRI_LLM_URL || "http://localhost:8103",
  FLEET_SERVICE_URL: process.env.FLEET_SERVICE_URL || "http://localhost:8098",
  SOIL_ANALYSIS_URL: process.env.SOIL_ANALYSIS_URL || "http://localhost:8096",
  MODEL_SERVING_URL: process.env.MODEL_SERVING_URL || "http://localhost:8087",

  // External APIs
  OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY || "",
  AFRICASTALKING_API_KEY: process.env.AFRICASTALKING_API_KEY || "",
  AFRICASTALKING_USERNAME: process.env.AFRICASTALKING_USERNAME || "sandbox",
} as const;

export type ServiceName = keyof typeof SERVICE_URLS;
