/**
 * Secrets Management Service
 * 
 * Provides a unified interface for retrieving secrets from:
 * 1. HashiCorp Vault (production)
 * 2. Kubernetes secrets (K8s deployment)
 * 3. Environment variables (development fallback)
 * 
 * Never logs secret values. Caches secrets with configurable TTL.
 */
import { logger } from '../logger.js';

interface SecretConfig {
  provider: 'vault' | 'k8s' | 'env';
  vaultAddr: string;
  vaultToken: string;
  vaultPath: string;
  cacheTtlMs: number;
  k8sSecretPath: string;
}

interface CachedSecret {
  value: string;
  expiresAt: number;
}

const config: SecretConfig = {
  provider: (process.env.SECRETS_PROVIDER as SecretConfig['provider']) || 'env',
  vaultAddr: process.env.VAULT_ADDR || 'http://localhost:8200',
  vaultToken: process.env.VAULT_TOKEN || '',
  vaultPath: process.env.VAULT_SECRET_PATH || 'secret/data/farmconnect',
  cacheTtlMs: parseInt(process.env.SECRET_CACHE_TTL_MS || '300000', 10), // 5 min default
  k8sSecretPath: process.env.K8S_SECRET_PATH || '/var/run/secrets',
};

const cache = new Map<string, CachedSecret>();

async function fetchFromVault(key: string): Promise<string | null> {
  if (!config.vaultAddr || !config.vaultToken) {
    logger.warn('[Secrets] Vault not configured, falling back to env');
    return null;
  }

  try {
    const url = `${config.vaultAddr}/v1/${config.vaultPath}`;
    const response = await fetch(url, {
      headers: { 'X-Vault-Token': config.vaultToken },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn('[Secrets] Vault returned non-200', { status: response.status, key });
      return null;
    }

    const data = await response.json() as { data?: { data?: Record<string, string> } };
    return data?.data?.data?.[key] || null;
  } catch (err) {
    logger.warn('[Secrets] Vault unreachable, using env fallback', { key });
    return null;
  }
}

async function fetchFromK8s(key: string): Promise<string | null> {
  try {
    const fs = await import('fs/promises');
    const secretFile = `${config.k8sSecretPath}/${key}`;
    const value = await fs.readFile(secretFile, 'utf-8');
    return value.trim();
  } catch (err) {
    logger.debug('[Secrets] K8s secret read failed, falling back', { key, error: String(err) });
    return null;
  }
}

function fetchFromEnv(key: string): string | null {
  return process.env[key] || null;
}

/**
 * Get a secret value by key. Uses caching to minimize external lookups.
 * Provider priority: Vault → K8s → Environment variable.
 */
export async function getSecret(key: string): Promise<string | null> {
  // Check cache first
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let value: string | null = null;

  switch (config.provider) {
    case 'vault':
      value = await fetchFromVault(key);
      if (!value) value = fetchFromEnv(key);
      break;

    case 'k8s':
      value = await fetchFromK8s(key);
      if (!value) value = fetchFromEnv(key);
      break;

    case 'env':
    default:
      value = fetchFromEnv(key);
      break;
  }

  if (value) {
    cache.set(key, { value, expiresAt: Date.now() + config.cacheTtlMs });
  }

  return value;
}

/**
 * Get multiple secrets at once (batch retrieval).
 */
export async function getSecrets(keys: string[]): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {};
  await Promise.all(
    keys.map(async (key) => {
      results[key] = await getSecret(key);
    })
  );
  return results;
}

/**
 * Invalidate a cached secret (force re-fetch on next access).
 */
export function invalidateSecret(key: string): void {
  cache.delete(key);
}

/**
 * Clear all cached secrets.
 */
export function clearSecretCache(): void {
  cache.clear();
  logger.info('[Secrets] Cache cleared');
}

/**
 * Health check for secrets provider.
 */
export async function checkSecretsHealth(): Promise<{ provider: string; healthy: boolean; cached: number }> {
  const result = { provider: config.provider, healthy: false, cached: cache.size };

  switch (config.provider) {
    case 'vault':
      try {
        const response = await fetch(`${config.vaultAddr}/v1/sys/health`, {
          signal: AbortSignal.timeout(3000),
        });
        result.healthy = response.ok;
      } catch (err) {
        logger.debug('[Secrets] Vault health check failed', { error: String(err) });
        result.healthy = false;
      }
      break;

    case 'k8s':
      try {
        const fs = await import('fs/promises');
        await fs.access(config.k8sSecretPath);
        result.healthy = true;
      } catch (err) {
        logger.debug('[Secrets] K8s secret path not accessible', { error: String(err) });
        result.healthy = false;
      }
      break;

    case 'env':
      result.healthy = true; // env vars always available
      break;
  }

  return result;
}

/**
 * Required secrets for the platform.
 * Use this to validate all required secrets are available at startup.
 */
export const REQUIRED_SECRETS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'SESSION_SECRET',
] as const;

export const OPTIONAL_SECRETS = [
  'REDIS_URL',
  'KAFKA_BROKERS',
  'KEYCLOAK_URL',
  'PERMIFY_URL',
  'OPENSEARCH_URL',
  'TIGERBEETLE_ADDRESS',
  'MOJALOOP_URL',
  'APISIX_ADMIN_KEY',
  'AFRICASTALKING_API_KEY',
  'OPENWEATHER_API_KEY',
  'AWS_S3_BUCKET',
  'FCM_SERVER_KEY',
] as const;

export async function validateRequiredSecrets(): Promise<{ valid: boolean; missing: string[] }> {
  const missing: string[] = [];

  for (const key of REQUIRED_SECRETS) {
    const value = await getSecret(key);
    if (!value) missing.push(key);
  }

  if (missing.length > 0) {
    logger.error('[Secrets] Missing required secrets', { missing });
  }

  return { valid: missing.length === 0, missing };
}
