/**
 * Security Headers Middleware
 * Adds comprehensive security headers to all HTTP responses.
 * Follows OWASP security guidelines.
 */

import type { Request, Response, NextFunction } from "express";

export interface SecurityHeadersConfig {
  enableHSTS: boolean;
  enableCSP: boolean;
  enableCORS: boolean;
  allowedOrigins: string[];
  reportUri?: string;
}

const defaultConfig: SecurityHeadersConfig = {
  enableHSTS: process.env.NODE_ENV === 'production',
  enableCSP: true,
  enableCORS: true,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3000').split(','),
  reportUri: process.env.CSP_REPORT_URI,
};

export function securityHeaders(config: Partial<SecurityHeadersConfig> = {}) {
  const cfg = { ...defaultConfig, ...config };

  return (req: Request, res: Response, next: NextFunction) => {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // XSS Protection (legacy browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');

    // Remove server fingerprint
    res.removeHeader('X-Powered-By');
    res.setHeader('Server', 'FarmConnect');

    // HSTS (only in production with TLS)
    if (cfg.enableHSTS) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Content Security Policy
    if (cfg.enableCSP) {
      const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss: https:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ];
      if (cfg.reportUri) {
        csp.push(`report-uri ${cfg.reportUri}`);
      }
      res.setHeader('Content-Security-Policy', csp.join('; '));
    }

    // CORS
    if (cfg.enableCORS) {
      const origin = req.headers.origin;
      if (origin && cfg.allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID, X-Trace-ID');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
    }

    // Cache control for API responses
    if (req.path.startsWith('/api') || req.path.startsWith('/trpc')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    next();
  };
}

/**
 * Rate limiting configuration per endpoint category
 */
export const RATE_LIMIT_TIERS = {
  public: { windowMs: 60_000, maxRequests: 100 },
  authenticated: { windowMs: 60_000, maxRequests: 500 },
  financial: { windowMs: 60_000, maxRequests: 30 },
  admin: { windowMs: 60_000, maxRequests: 1000 },
  webhook: { windowMs: 60_000, maxRequests: 200 },
} as const;

/**
 * Input sanitization for common attack vectors
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Strip angle brackets (XSS)
    .replace(/javascript:/gi, '') // Strip javascript: protocol
    .replace(/on\w+=/gi, '') // Strip inline event handlers
    .replace(/data:text\/html/gi, '') // Strip data URI HTML
    .trim();
}

/**
 * Validate that a request has required security context
 */
export function validateRequestSecurity(req: Request): { valid: boolean; reason?: string } {
  // Check for request ID (tracing)
  const requestId = req.headers['x-request-id'];
  if (!requestId && process.env.REQUIRE_REQUEST_ID === 'true') {
    return { valid: false, reason: 'Missing X-Request-ID header' };
  }

  // Check content-type on POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('application/json') && !contentType?.includes('multipart/form-data')) {
      return { valid: false, reason: 'Invalid Content-Type for mutation request' };
    }
  }

  return { valid: true };
}
