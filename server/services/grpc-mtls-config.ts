/**
 * gRPC mTLS Configuration
 * Provides mutual TLS configuration for secure inter-service gRPC communication.
 * 
 * Environment variables:
 *   GRPC_TLS_ENABLED=true
 *   GRPC_CA_CERT_PATH=/etc/certs/ca.pem
 *   GRPC_CLIENT_CERT_PATH=/etc/certs/client.pem
 *   GRPC_CLIENT_KEY_PATH=/etc/certs/client-key.pem
 *   GRPC_SERVER_CERT_PATH=/etc/certs/server.pem
 *   GRPC_SERVER_KEY_PATH=/etc/certs/server-key.pem
 */

import { logger } from "../logger.js";

export interface GrpcTlsConfig {
  enabled: boolean;
  caCertPath: string;
  clientCertPath: string;
  clientKeyPath: string;
  serverCertPath: string;
  serverKeyPath: string;
  minVersion: string;
  cipherSuites: string[];
}

export function getGrpcTlsConfig(): GrpcTlsConfig {
  const enabled = process.env.GRPC_TLS_ENABLED === 'true';
  
  if (enabled) {
    logger.info('[gRPC-mTLS] Mutual TLS enabled for inter-service communication');
  }
  
  return {
    enabled,
    caCertPath: process.env.GRPC_CA_CERT_PATH ?? '/etc/certs/ca.pem',
    clientCertPath: process.env.GRPC_CLIENT_CERT_PATH ?? '/etc/certs/client.pem',
    clientKeyPath: process.env.GRPC_CLIENT_KEY_PATH ?? '/etc/certs/client-key.pem',
    serverCertPath: process.env.GRPC_SERVER_CERT_PATH ?? '/etc/certs/server.pem',
    serverKeyPath: process.env.GRPC_SERVER_KEY_PATH ?? '/etc/certs/server-key.pem',
    minVersion: 'TLSv1.3',
    cipherSuites: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_128_GCM_SHA256',
    ],
  };
}

// Extended service registry including all polyglot services
export const GRPC_SERVICE_REGISTRY = {
  // Delivery & Logistics (Go)
  'delivery-service': { port: 9091, proto: 'DeliveryService', healthCheck: '/grpc.health.v1.Health/Check' },
  'mobile-money-service': { port: 9090, proto: 'MobileMoneyService', healthCheck: '/grpc.health.v1.Health/Check' },
  // Cold Chain & IoT (Python)
  'cold-chain-service': { port: 9092, proto: 'ColdChainService', healthCheck: '/grpc.health.v1.Health/Check' },
  // ML Services (Python)
  'ml-inference-service': { port: 9096, proto: 'MLInferenceService', healthCheck: '/grpc.health.v1.Health/Check' },
  'price-prediction-service': { port: 9093, proto: 'PricePredictionService', healthCheck: '/grpc.health.v1.Health/Check' },
  // Tokenization (Go)
  'tokenization-service': { port: 9094, proto: 'TokenizationService', healthCheck: '/grpc.health.v1.Health/Check' },
  // Equipment & Fleet (Go)
  'equipment-fleet-service': { port: 9098, proto: 'EquipmentFleetService', healthCheck: '/grpc.health.v1.Health/Check' },
  // Blockchain Provenance (Go)
  'blockchain-provenance-service': { port: 9110, proto: 'BlockchainProvenanceService', healthCheck: '/grpc.health.v1.Health/Check' },
  // Urban Delivery (Rust)
  'urban-delivery-service': { port: 9111, proto: 'UrbanDeliveryService', healthCheck: '/grpc.health.v1.Health/Check' },
  // CEA AI (Python)
  'cea-ai-service': { port: 9112, proto: 'CeaAIService', healthCheck: '/grpc.health.v1.Health/Check' },
  // Aquaculture (Go, Rust, Python)
  'aquaculture-pond-service': { port: 9113, proto: 'AquaculturePondService', healthCheck: '/grpc.health.v1.Health/Check' },
  'aquaculture-feed-service': { port: 9114, proto: 'AquacultureFeedService', healthCheck: '/grpc.health.v1.Health/Check' },
  'aquaculture-ai-service': { port: 9115, proto: 'AquacultureAIService', healthCheck: '/grpc.health.v1.Health/Check' },
  // Contract Farming (Go)
  'contract-farming-service': { port: 9116, proto: 'ContractFarmingService', healthCheck: '/grpc.health.v1.Health/Check' },
  // Warehouse Receipt (Rust)
  'warehouse-receipt-service': { port: 9117, proto: 'WarehouseReceiptService', healthCheck: '/grpc.health.v1.Health/Check' },
  // Conversational Commerce (Python)
  'conversational-commerce-service': { port: 9118, proto: 'ConversationalCommerceService', healthCheck: '/grpc.health.v1.Health/Check' },
} as const;

export type GrpcServiceName = keyof typeof GRPC_SERVICE_REGISTRY;

export function getServiceGrpcPort(name: GrpcServiceName): number {
  return GRPC_SERVICE_REGISTRY[name].port;
}

export function getAllGrpcServices(): Array<{ name: string; port: number; proto: string }> {
  return Object.entries(GRPC_SERVICE_REGISTRY).map(([name, config]) => ({
    name,
    port: config.port,
    proto: config.proto,
  }));
}
