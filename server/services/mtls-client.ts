/**
 * mTLS-Enabled HTTP Client
 *
 * Wraps Node.js https.Agent with mutual TLS certificates for
 * inter-service communication. Falls back to plain HTTP when
 * mTLS certificates are not configured (development mode).
 *
 * Environment variables:
 *   MTLS_ENABLED=true|false
 *   MTLS_CA_CERT=/path/to/ca.crt
 *   <SERVICE>_TLS_CERT=/path/to/server.crt
 *   <SERVICE>_TLS_KEY=/path/to/server.key
 */

import https from "node:https";
import fs from "node:fs";
import { logger } from '../logger.js';

interface MtlsConfig {
  caCert: string;
  clientCert: string;
  clientKey: string;
}

const mtlsEnabled = process.env.MTLS_ENABLED === "true";
const caCertPath = process.env.MTLS_CA_CERT ?? "";

function loadCert(path: string): string | undefined {
  try {
    return fs.readFileSync(path, "utf-8");
  } catch (err) {
    return undefined;
  }
}

function getServiceEnvPrefix(serviceName: string): string {
  return serviceName.toUpperCase().replace(/-/g, "_");
}

export function createMtlsAgent(serviceName: string): https.Agent | undefined {
  if (!mtlsEnabled) return undefined;

  const prefix = getServiceEnvPrefix(serviceName);
  const certPath = process.env[`${prefix}_TLS_CERT`] ?? "";
  const keyPath = process.env[`${prefix}_TLS_KEY`] ?? "";

  const ca = loadCert(caCertPath);
  const cert = loadCert(certPath);
  const key = loadCert(keyPath);

  if (!ca || !cert || !key) {
    logger.warn(`[mTLS] Missing certificates for ${serviceName}, falling back to plain HTTP`);
    return undefined;
  }

  return new https.Agent({
    ca,
    cert,
    key,
    rejectUnauthorized: true,
    minVersion: "TLSv1.3",
  });
}

export function getMtlsStatus(): {
  enabled: boolean;
  services: Array<{ name: string; configured: boolean }>;
} {
  const services = [
    "delivery-service",
    "mobile-money-service",
    "cold-chain-service",
    "ml-inference-service",
    "tokenization-service",
    "price-prediction-service",
    "equipment-fleet-service",
    "kyc-service",
    "agri-llm-service",
  ];

  return {
    enabled: mtlsEnabled,
    services: services.map((name) => {
      const prefix = getServiceEnvPrefix(name);
      const certPath = process.env[`${prefix}_TLS_CERT`] ?? "";
      const keyPath = process.env[`${prefix}_TLS_KEY`] ?? "";
      return {
        name,
        configured: !!(caCertPath && certPath && keyPath),
      };
    }),
  };
}
