import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'farmer-realm';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'farmer-api';
const KEYCLOAK_CLIENT_SECRET = process.env.KEYCLOAK_CLIENT_SECRET;

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
function getKey(header: any, callback: (err: Error | null, key?: string) => void) {
  jwksClientInstance.getSigningKey(header.kid, (err: Error | null, key: any) => {
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
      (err, decoded: any) => {
        if (err) {
          console.error('[Keycloak] Token verification failed:', err.message);
          resolve(null);
          return;
        }

        if (!decoded) {
          resolve(null);
          return;
        }

        // Extract user information from token
        const user: KeycloakUser = {
          id: decoded.sub,
          email: decoded.email || decoded.preferred_username,
          firstName: decoded.given_name,
          lastName: decoded.family_name,
          username: decoded.preferred_username || decoded.email,
          roles: decoded.realm_access?.roles || [],
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
    console.error('[Keycloak] Client secret not configured');
    return null;
  }

  try {
    const response = await fetch(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: KEYCLOAK_CLIENT_ID,
          client_secret: KEYCLOAK_CLIENT_SECRET,
        }),
      }
    );

    if (!response.ok) {
      console.error('[Keycloak] Failed to get service account token:', response.statusText);
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('[Keycloak] Error getting service account token:', error);
    return null;
  }
}

/**
 * Introspect token (validate and get user info)
 */
export async function introspectToken(token: string): Promise<any | null> {
  if (!KEYCLOAK_CLIENT_SECRET) {
    console.error('[Keycloak] Client secret not configured');
    return null;
  }

  try {
    const response = await fetch(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token/introspect`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token,
          client_id: KEYCLOAK_CLIENT_ID,
          client_secret: KEYCLOAK_CLIENT_SECRET,
        }),
      }
    );

    if (!response.ok) {
      console.error('[Keycloak] Token introspection failed:', response.statusText);
      return null;
    }

    const data = await response.json();
    
    if (!data.active) {
      return null;
    }

    return data;
  } catch (error) {
    console.error('[Keycloak] Error introspecting token:', error);
    return null;
  }
}

/**
 * Get user info from Keycloak
 */
export async function getUserInfo(token: string): Promise<any | null> {
  try {
    const response = await fetch(
      `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      console.error('[Keycloak] Failed to get user info:', response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[Keycloak] Error getting user info:', error);
    return null;
  }
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

console.log('[Keycloak] Configuration loaded:');
console.log(`  URL: ${KEYCLOAK_URL}`);
console.log(`  Realm: ${KEYCLOAK_REALM}`);
console.log(`  Client ID: ${KEYCLOAK_CLIENT_ID}`);
console.log(`  Client Secret: ${KEYCLOAK_CLIENT_SECRET ? 'Configured' : 'Not configured'}`);
