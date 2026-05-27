/**
 * Sentry Error Monitoring Integration
 * Provides error tracking and performance monitoring
 * 
 * When SENTRY_DSN is not set, provides no-op implementations
 * to allow code to run without Sentry installed.
 * 
 * To enable Sentry:
 * 1. Install: pnpm add @sentry/node
 * 2. Set SENTRY_DSN environment variable
 * 3. Optionally set SENTRY_ENVIRONMENT and SENTRY_RELEASE
 * 
 * Usage:
 *   import { initSentry, captureException, captureMessage } from './sentry';
 *   
 *   // Initialize at app startup
 *   initSentry();
 *   
 *   // Capture errors
 *   try { ... } catch (err) { captureException(err); }
 *   
 *   // Capture messages
 *   captureMessage('User completed onboarding', 'info');
 */

import { logger } from './logger.js';

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || 'unknown';

let sentryInitialized = false;

// Sentry module interface (subset of @sentry/node)
interface SentryLike {
  init: (options: {
    dsn: string;
    environment: string;
    release: string;
    tracesSampleRate: number;
    integrations: unknown[];
  }) => void;
  captureException: (error: unknown, options?: { extra?: Record<string, unknown> }) => void;
  captureMessage: (message: string, options?: { level?: string; extra?: Record<string, unknown> }) => void;
  setUser: (user: { id: string; email?: string; username?: string } | null) => void;
  addBreadcrumb: (breadcrumb: {
    category?: string;
    message: string;
    level?: string;
    data?: Record<string, unknown>;
  }) => void;
}

let SentryModule: SentryLike | null = null;

/**
 * Initialize Sentry error monitoring
 * Call this at application startup
 */
export async function initSentry(): Promise<void> {
  if (!SENTRY_DSN) {
    logger.info('Sentry DSN not configured, error monitoring disabled');
    return;
  }

  try {
    // Dynamic import to avoid errors when @sentry/node is not installed
    // Use Function constructor to avoid TypeScript static analysis of the import
    const dynamicImport = new Function('modulePath', 'return import(modulePath)');
    SentryModule = await dynamicImport('@sentry/node').catch(() => null) as SentryLike | null;
    
    if (!SentryModule) {
      logger.warn('Sentry module not available - install @sentry/node to enable');
      return;
    }
    
    SentryModule.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      release: SENTRY_RELEASE,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      integrations: [],
    });

    sentryInitialized = true;
    logger.info('Sentry initialized', { environment: SENTRY_ENVIRONMENT, release: SENTRY_RELEASE });
  } catch (error) {
    logger.warn('Failed to initialize Sentry - @sentry/node may not be installed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Capture an exception and send to Sentry
 */
export function captureException(error: Error | unknown, context?: Record<string, unknown>): void {
  // Always log locally
  logger.error('Exception captured', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });

  // Send to Sentry if initialized
  if (sentryInitialized && SentryModule) {
    SentryModule.captureException(error, {
      extra: context,
    });
  }
}

/**
 * Capture a message and send to Sentry
 */
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  context?: Record<string, unknown>
): void {
  // Always log locally
  const logLevel = level === 'fatal' ? 'error' : level === 'warning' ? 'warn' : level;
  logger[logLevel as 'error' | 'warn' | 'info' | 'debug'](message, context);

  // Send to Sentry if initialized
  if (sentryInitialized && SentryModule) {
    SentryModule.captureMessage(message, {
      level,
      extra: context,
    });
  }
}

/**
 * Set user context for Sentry
 */
export function setUser(user: { id: string; email?: string; username?: string } | null): void {
  if (sentryInitialized && SentryModule) {
    SentryModule.setUser(user);
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
  category?: string;
  message: string;
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  data?: Record<string, unknown>;
}): void {
  if (sentryInitialized && SentryModule) {
    SentryModule.addBreadcrumb(breadcrumb);
  }
}

/**
 * Express error handler middleware for Sentry
 * Add this after all routes but before other error handlers
 */
export function sentryErrorHandler() {
  return (err: Error, req: { method: string; url: string; body?: unknown }, res: { statusCode: number }, next: (err?: Error) => void) => {
    captureException(err, {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
    });
    next(err);
  };
}

/**
 * Check if Sentry is enabled and initialized
 */
export function isSentryEnabled(): boolean {
  return sentryInitialized;
}

export default {
  initSentry,
  captureException,
  captureMessage,
  setUser,
  addBreadcrumb,
  sentryErrorHandler,
  isSentryEnabled,
};
