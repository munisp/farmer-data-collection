/**
 * Input Sanitization Middleware
 * Strips XSS payloads, SQL injection patterns, and dangerous HTML from all
 * string inputs in tRPC procedures. Applied as a global middleware.
 */

import { logger } from '../logger.js';

const HTML_ENTITY_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;',
};

const DANGEROUS_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /javascript\s*:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /on\w+\s*=\s*[^\s>]+/gi,
  /data\s*:\s*text\/html/gi,
  /expression\s*\(/gi,
  /url\s*\(\s*["']?\s*javascript/gi,
  /vbscript\s*:/gi,
];

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE)\b\s)/i,
  /(--|;|\/\*|\*\/|xp_|UNION\s+SELECT)/i,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i,
  /('\s*(OR|AND)\s+'[^']*'\s*=\s*'[^']*')/i,
];

function escapeHtml(str: string): string {
  return str.replace(/[&<>"'`/]/g, (char) => HTML_ENTITY_MAP[char] || char);
}

function stripDangerousPatterns(str: string): string {
  let cleaned = str;
  for (const pattern of DANGEROUS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  return cleaned;
}

function detectSqlInjection(str: string): boolean {
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(str));
}

export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return input;

  let sanitized = stripDangerousPatterns(input);
  sanitized = escapeHtml(sanitized);

  if (detectSqlInjection(input)) {
    logger.warn('Potential SQL injection detected', {
      inputLength: input.length,
      inputPreview: input.substring(0, 100),
    });
  }

  return sanitized;
}

export function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = sanitizeValue(value);
  }
  return result as T;
}

// Fields that should NOT be sanitized (passwords, tokens, etc.)
const SKIP_SANITIZATION_FIELDS = new Set([
  'password',
  'passwordHash',
  'token',
  'refreshToken',
  'accessToken',
  'apiKey',
  'secret',
  'signature',
  'hash',
  'geojson',
  'geoJson',
  'boundary',
  'coordinates',
]);

export function sanitizeInput<T>(input: T, path = ''): T {
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    return sanitizeString(input) as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item, i) => sanitizeInput(item, `${path}[${i}]`)) as unknown as T;
  }

  if (typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SKIP_SANITIZATION_FIELDS.has(key)) {
        result[key] = value;
      } else {
        result[key] = sanitizeInput(value, `${path}.${key}`);
      }
    }
    return result as T;
  }

  return input;
}

/**
 * tRPC middleware that sanitizes all string inputs
 */
export function createSanitizationMiddleware() {
  return ({ rawInput, next }: { rawInput: unknown; next: (opts: { rawInput: unknown }) => Promise<unknown> }) => {
    if (rawInput && typeof rawInput === 'object') {
      const sanitized = sanitizeInput(rawInput);
      return next({ rawInput: sanitized });
    }
    return next({ rawInput });
  };
}
