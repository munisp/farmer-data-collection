/**
 * CSRF Protection Middleware
 * Protects against Cross-Site Request Forgery attacks
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

interface CSRFConfig {
  cookieName?: string;
  headerName?: string;
  secretLength?: number;
  cookieOptions?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    path?: string;
    maxAge?: number;
  };
  ignoreMethods?: string[];
  ignorePaths?: string[];
}

const defaultConfig: CSRFConfig = {
  cookieName: '_csrf',
  headerName: 'x-csrf-token',
  secretLength: 32,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  ignorePaths: [
    '/api/webhooks/', // Webhooks have their own signature verification
    '/api/health',
    '/api/trpc/auth.login', // Login doesn't need CSRF (no session yet)
    '/api/trpc/auth.register',
  ],
};

// Token generation and validation
class CSRFTokenManager {
  private secretLength: number;

  constructor(secretLength: number = 32) {
    this.secretLength = secretLength;
  }

  generateSecret(): string {
    return crypto.randomBytes(this.secretLength).toString('hex');
  }

  generateToken(secret: string): string {
    const salt = crypto.randomBytes(8).toString('hex');
    const hash = crypto
      .createHmac('sha256', secret)
      .update(salt)
      .digest('hex');
    return `${salt}.${hash}`;
  }

  validateToken(token: string, secret: string): boolean {
    if (!token || !secret) return false;

    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [salt, hash] = parts;
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(salt)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(hash),
        Buffer.from(expectedHash)
      );
    } catch (err) {
      return false;
    }
  }
}

// CSRF middleware factory
export function createCSRFProtection(config: CSRFConfig = {}) {
  const mergedConfig = { ...defaultConfig, ...config };
  const tokenManager = new CSRFTokenManager(mergedConfig.secretLength);

  // Middleware to generate and set CSRF token
  const generateToken = (req: Request, res: Response, next: NextFunction) => {
    // Get or create secret from cookie
    let secret = req.cookies?.[mergedConfig.cookieName!];
    
    if (!secret) {
      secret = tokenManager.generateSecret();
      res.cookie(mergedConfig.cookieName!, secret, mergedConfig.cookieOptions || {});
    }

    // Generate token and attach to request
    const token = tokenManager.generateToken(secret);
    (req as any).csrfToken = () => token;

    // Also set token in response header for SPA clients
    res.setHeader('X-CSRF-Token', token);

    next();
  };

  // Middleware to validate CSRF token
  const validateToken = (req: Request, res: Response, next: NextFunction) => {
    // Skip validation for safe methods
    if (mergedConfig.ignoreMethods?.includes(req.method)) {
      return next();
    }

    // Skip validation for ignored paths
    const path = req.path;
    if (mergedConfig.ignorePaths?.some(p => path.startsWith(p))) {
      return next();
    }

    // Get secret from cookie
    const secret = req.cookies?.[mergedConfig.cookieName!];
    if (!secret) {
      return res.status(403).json({
        error: 'CSRF Error',
        message: 'Missing CSRF secret. Please refresh the page.',
      });
    }

    // Get token from header or body
    const token = 
      req.headers[mergedConfig.headerName!] as string ||
      req.body?._csrf ||
      req.query?._csrf as string;

    if (!token) {
      return res.status(403).json({
        error: 'CSRF Error',
        message: 'Missing CSRF token.',
      });
    }

    // Validate token
    if (!tokenManager.validateToken(token, secret)) {
      return res.status(403).json({
        error: 'CSRF Error',
        message: 'Invalid CSRF token. Please refresh the page.',
      });
    }

    next();
  };

  return {
    generateToken,
    validateToken,
    // Combined middleware
    protect: [generateToken, validateToken],
  };
}

// Double Submit Cookie pattern for stateless CSRF protection
export function createDoubleSubmitCSRF(config: CSRFConfig = {}) {
  const mergedConfig = { ...defaultConfig, ...config };

  return {
    // Set the CSRF cookie
    setCookie: (req: Request, res: Response, next: NextFunction) => {
      if (!req.cookies?.[mergedConfig.cookieName!]) {
        const token = crypto.randomBytes(32).toString('hex');
        res.cookie(mergedConfig.cookieName!, token, {
          ...mergedConfig.cookieOptions,
          httpOnly: false, // Must be readable by JavaScript
        });
      }
      next();
    },

    // Validate that header matches cookie
    validate: (req: Request, res: Response, next: NextFunction) => {
      if (mergedConfig.ignoreMethods?.includes(req.method)) {
        return next();
      }

      if (mergedConfig.ignorePaths?.some(p => req.path.startsWith(p))) {
        return next();
      }

      const cookieToken = req.cookies?.[mergedConfig.cookieName!];
      const headerToken = req.headers[mergedConfig.headerName!] as string;

      if (!cookieToken || !headerToken) {
        return res.status(403).json({
          error: 'CSRF Error',
          message: 'Missing CSRF token.',
        });
      }

      // Use timing-safe comparison
      try {
        const isValid = crypto.timingSafeEqual(
          Buffer.from(cookieToken),
          Buffer.from(headerToken)
        );

        if (!isValid) {
          return res.status(403).json({
            error: 'CSRF Error',
            message: 'CSRF token mismatch.',
          });
        }
      } catch (err) {
        return res.status(403).json({
          error: 'CSRF Error',
          message: 'Invalid CSRF token format.',
        });
      }

      next();
    },
  };
}

// Origin/Referer validation for additional protection
export function validateOrigin(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const origin = req.headers.origin;
    const referer = req.headers.referer;

    // Check origin header first
    if (origin) {
      if (allowedOrigins.includes(origin)) {
        return next();
      }
      return res.status(403).json({
        error: 'Origin Error',
        message: 'Request origin not allowed.',
      });
    }

    // Fall back to referer header
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
        if (allowedOrigins.includes(refererOrigin)) {
          return next();
        }
      } catch (err) {
        // Invalid referer URL
      }
      return res.status(403).json({
        error: 'Origin Error',
        message: 'Request referer not allowed.',
      });
    }

    // No origin or referer - could be a direct API call
    // Allow if request has valid auth token (API clients)
    if (req.headers.authorization) {
      return next();
    }

    res.status(403).json({
      error: 'Origin Error',
      message: 'Missing origin header.',
    });
  };
}

// Export default CSRF protection
export const csrf = createCSRFProtection();
export const doubleSubmitCSRF = createDoubleSubmitCSRF();

export default csrf;
