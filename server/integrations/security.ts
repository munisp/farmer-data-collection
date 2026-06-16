/**
 * Security Hardening Module
 * JWT verification, mTLS config, request sanitization.
 */
import { createHmac } from "crypto";
import { logger } from "../logger.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_ISSUER = process.env.JWT_ISSUER || "farmconnect-api";
const JWT_EXPIRY_HOURS = parseInt(process.env.JWT_EXPIRY_HOURS || "24", 10);

interface JWTPayload {
  sub: string;
  iss: string;
  iat: number;
  exp: number;
  roles: string[];
  tenantId?: string;
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

export function signJWT(payload: Omit<JWTPayload, "iss" | "iat" | "exp">): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iss: JWT_ISSUER,
    iat: now,
    exp: now + JWT_EXPIRY_HOURS * 3600,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;

    const expectedSig = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (signature !== expectedSig) {
      logger.warn("[Security] Invalid JWT signature");
      return null;
    }

    const payload: JWTPayload = JSON.parse(base64UrlDecode(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      logger.warn("[Security] Expired JWT", { sub: payload.sub });
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function hasRole(payload: JWTPayload, role: string): boolean {
  return payload.roles.includes(role) || payload.roles.includes("admin");
}

export const mTLSConfig = {
  enabled: process.env.MTLS_ENABLED === "true",
  certPath: process.env.MTLS_CERT_PATH || "/etc/ssl/certs/farmconnect.pem",
  keyPath: process.env.MTLS_KEY_PATH || "/etc/ssl/private/farmconnect-key.pem",
  caPath: process.env.MTLS_CA_PATH || "/etc/ssl/certs/farmconnect-ca.pem",
  minTlsVersion: "TLSv1.3" as const,
};

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim();
}

export function validateOrigin(origin: string | undefined): boolean {
  const allowed = (process.env.ALLOWED_ORIGINS || "http://localhost:5000,http://localhost:3000").split(",");
  return !origin || allowed.includes(origin) || allowed.includes("*");
}
