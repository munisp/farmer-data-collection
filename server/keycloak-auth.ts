import jwt from "jsonwebtoken";
import { Request } from "express";
import { logger } from './logger.js';

// Keycloak configuration
const KEYCLOAK_ENABLED = process.env.KEYCLOAK_ENABLED === "true";
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || "farmer-data-collection";
const KEYCLOAK_PUBLIC_KEY = process.env.KEYCLOAK_PUBLIC_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  logger.error("[SECURITY] JWT_SECRET environment variable is not set. Using temporary development key.");
  return "dev-only-secret-do-not-use-in-production";
})();

/**
 * Keycloak token payload interface
 */
export interface KeycloakToken {
  sub: string; // Subject (user ID in Keycloak)
  email: string;
  preferred_username: string;
  given_name?: string;
  family_name?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [key: string]: {
      roles: string[];
    };
  };
  exp: number;
  iat: number;
  iss: string;
}

/**
 * Legacy JWT token payload interface
 */
export interface LegacyToken {
  userId: number;
  email: string;
  role: string;
  exp: number;
  iat: number;
}

/**
 * Unified user context interface
 */
export interface UserContext {
  userId: number | string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  source: "keycloak" | "jwt";
}

/**
 * Verify Keycloak token
 */
export async function verifyKeycloakToken(token: string): Promise<KeycloakToken | null> {
  try {
    // If public key is not configured, fetch it from Keycloak
    let publicKey = KEYCLOAK_PUBLIC_KEY;
    
    if (!publicKey) {
      // Fetch public key from Keycloak realm
      const response = await fetch(
        `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`
      );
      const realmInfo = await response.json();
      publicKey = `-----BEGIN PUBLIC KEY-----\n${realmInfo.public_key}\n-----END PUBLIC KEY-----`;
    }

    // Verify token with Keycloak public key
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
    }) as KeycloakToken;

    return decoded;
  } catch (error) {
    logger.error("[Keycloak] Token verification failed:", error);
    return null;
  }
}

/**
 * Verify legacy JWT token
 */
export function verifyLegacyToken(token: string): LegacyToken | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as LegacyToken;
    return decoded;
  } catch (error) {
    logger.error("[JWT] Token verification failed:", error);
    return null;
  }
}

/**
 * Extract and verify token from request
 * Supports both Keycloak and legacy JWT tokens
 */
export async function extractUserContext(req: Request): Promise<UserContext | null> {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);

  // If Keycloak is enabled, try Keycloak token first
  if (KEYCLOAK_ENABLED) {
    const keycloakToken = await verifyKeycloakToken(token);
    if (keycloakToken) {
      // Extract roles from Keycloak token
      const roles = keycloakToken.realm_access?.roles || [];
      const role = roles.includes("admin") ? "admin" : 
                   roles.includes("analyst") ? "analyst" : "farmer";

      return {
        userId: keycloakToken.sub,
        email: keycloakToken.email,
        role,
        firstName: keycloakToken.given_name,
        lastName: keycloakToken.family_name,
        source: "keycloak",
      };
    }
  }

  // Fallback to legacy JWT token
  const legacyToken = verifyLegacyToken(token);
  if (legacyToken) {
    return {
      userId: legacyToken.userId,
      email: legacyToken.email,
      role: legacyToken.role,
      source: "jwt",
    };
  }

  return null;
}

/**
 * Map Keycloak user to local database user
 * This is used for user migration and synchronization
 */
export interface KeycloakUserMapping {
  keycloakId: string;
  localUserId: number;
  email: string;
  syncedAt: Date;
}

/**
 * Get user ID for database queries
 * Handles both Keycloak (string) and legacy JWT (number) user IDs
 */
export function getUserIdForQuery(userContext: UserContext): number | string {
  return userContext.userId;
}

/**
 * Check if user has required role
 */
export function hasRole(userContext: UserContext, requiredRole: string): boolean {
  const roleHierarchy: { [key: string]: number } = {
    farmer: 1,
    analyst: 2,
    admin: 3,
  };

  const userRoleLevel = roleHierarchy[userContext.role] || 0;
  const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

  return userRoleLevel >= requiredRoleLevel;
}

/**
 * Middleware to extract user context from token
 */
export async function authMiddleware(req: Request): Promise<UserContext | null> {
  return await extractUserContext(req);
}

export default {
  verifyKeycloakToken,
  verifyLegacyToken,
  extractUserContext,
  getUserIdForQuery,
  hasRole,
  authMiddleware,
};
