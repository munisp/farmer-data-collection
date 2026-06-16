import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { logger } from './logger.js';
import { CircuitBreaker } from './services/circuit-breaker.js';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'farmer-realm';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'farmer-api';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET;

const keycloakBreaker = new CircuitBreaker({ name: 'keycloak', failureThreshold: 5, resetTimeoutMs: 30_000, timeoutMs: 8_000 });

// Cached service account token
let _cachedServiceToken: string | null = null;
let _tokenExpiresAt = 0;

// JWKS client for token verification
const jwksClientInstance = jwksClient({
  jwksUri: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 86400000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

/**
 * Get signing key from Keycloak JWKS
 */
function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwksClientInstance.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Keycloak user interface
 */
export interface KeycloakUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  username: string;
}

/**
 * Verify Keycloak JWT token
 */
export async function verifyKeycloakToken(token: string): Promise<KeycloakUser | null> {
  return new Promise((resolve) => {
    jwt.verify(
      token,
      getKey,
      {
        algorithms: ['RS256'],
        issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
        audience: KEYCLOAK_CLIENT_ID,
      },
      (err, decoded) => {
        if (err) {
          logger.warn('[Keycloak] Token verification failed', { error: err.message });
          resolve(null);
          return;
        }

        if (!decoded) {
          resolve(null);
          return;
        }

        const payload = decoded as Record<string, unknown>;
        const realmAccess = payload.realm_access as { roles?: string[] } | undefined;
        const user: KeycloakUser = {
          id: String(payload.sub || ''),
          email: String(payload.email || payload.preferred_username || ''),
          firstName: String(payload.given_name || ''),
          lastName: String(payload.family_name || ''),
          username: String(payload.preferred_username || payload.email || ''),
          roles: realmAccess?.roles || [],
        };

        resolve(user);
      }
    );
  });
}

/**
 * Get service account token for backend-to-backend calls
 */
export async function getServiceAccountToken(): Promise<string | null> {
  if (!KEYCLOAK_CLIENT_SECRET) {
    logger.warn('[Keycloak] Client secret not configured');
    return null;
  }

  // Return cached token if still valid (with 30s buffer)
  if (_cachedServiceToken && Date.now() < _tokenExpiresAt - 30_000) {
    return _cachedServiceToken;
  }

  try {
    const response = await keycloakBreaker.execute(() =>
      fetch(
        `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: KEYCLOAK_CLIENT_ID,
            client_secret: KEYCLOAK_CLIENT_SECRET,
          }),
          signal: AbortSignal.timeout(8000),
        }
      )
    );

    if (!response.ok) {
      logger.warn('[Keycloak] Failed to get service account token', { status: response.status });
      return null;
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    _cachedServiceToken = data.access_token;
    _tokenExpiresAt = Date.now() + data.expires_in * 1000;
    return data.access_token;
  } catch (error) {
    logger.error('[Keycloak] Error getting service account token', { error: (error as Error).message });
    return null;
  }
}

/**
 * Introspect token (validate and get user info)
 */
export async function introspectToken(token: string): Promise<Record<string, unknown> | null> {
  if (!KEYCLOAK_CLIENT_SECRET) {
    logger.warn('[Keycloak] Client secret not configured');
    return null;
  }

  try {
    const response = await keycloakBreaker.execute(() =>
      fetch(
        `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token/introspect`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token,
            client_id: KEYCLOAK_CLIENT_ID,
            client_secret: KEYCLOAK_CLIENT_SECRET,
          }),
          signal: AbortSignal.timeout(5000),
        }
      )
    );

    if (!response.ok) {
      logger.warn('[Keycloak] Token introspection failed', { status: response.status });
      return null;
    }

    const data = (await response.json()) as { active: boolean; [key: string]: unknown };
    return data.active ? data : null;
  } catch (error) {
    logger.error('[Keycloak] Error introspecting token', { error: (error as Error).message });
    return null;
  }
}

/**
 * Get user info from Keycloak
 */
export async function getUserInfo(token: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await keycloakBreaker.execute(() =>
      fetch(
        `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        }
      )
    );

    if (!response.ok) {
      logger.warn('[Keycloak] Failed to get user info', { status: response.status });
      return null;
    }

    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    logger.error('[Keycloak] Error getting user info', { error: (error as Error).message });
    return null;
  }
}

export function isKeycloakHealthy(): boolean {
  return keycloakBreaker.getState().state !== 'OPEN';
}

/**
 * Check if user has required role
 */
export function hasRole(user: KeycloakUser | null, role: string): boolean {
  if (!user) return false;
  return user.roles.includes(role);
}

/**
 * Check if user has any of the required roles
 */
export function hasAnyRole(user: KeycloakUser | null, roles: string[]): boolean {
  if (!user) return false;
  return roles.some(role => user.roles.includes(role));
}

/**
 * Check if user has all required roles
 */
export function hasAllRoles(user: KeycloakUser | null, roles: string[]): boolean {
  if (!user) return false;
  return roles.every(role => user.roles.includes(role));
}

/**
 * Keycloak configuration info
 */
export const keycloakConfig = {
  url: KEYCLOAK_URL,
  realm: KEYCLOAK_REALM,
  clientId: KEYCLOAK_CLIENT_ID,
  hasClientSecret: !!KEYCLOAK_CLIENT_SECRET,
};

logger.info('[Keycloak] Configuration loaded', { url: KEYCLOAK_URL, realm: KEYCLOAK_REALM, clientId: KEYCLOAK_CLIENT_ID, hasSecret: !!KEYCLOAK_CLIENT_SECRET });
