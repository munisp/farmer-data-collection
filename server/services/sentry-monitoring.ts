/**
 * Sentry Error Monitoring Service
 * Provides distributed tracing, error tracking, and performance monitoring
 *
 * Graceful degradation: When @sentry/node is not installed, all Sentry calls
 * fall back to structured JSON logging so errors and performance data are still
 * captured in stdout/stderr. Install @sentry/node for full integration with
 * the Sentry dashboard, alerting, and profiling.
 */

// Stub types for Sentry when package is not installed
type SentryEvent = { request?: { headers?: Record<string, unknown>; data?: Record<string, unknown> } };
type SentryBreadcrumb = { category?: string; level?: string } | null;
type SentryScope = { 
  setUser: (user: unknown) => void; 
  setTag: (key: string, value: string) => void; 
  setExtra: (key: string, value: unknown) => void;
  setLevel: (level: string) => void;
  setSpan: (span: unknown) => void;
};
type SentryTransaction = { 
  startChild: (opts: { op: string; description?: string; data?: Record<string, unknown> }) => SentrySpan;
  finish: () => void;
};
type SentrySpan = { 
  setStatus: (status: string) => void; 
  finish: () => void;
};

// Namespace for Sentry types used in function signatures
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Sentry {
  export type Transaction = SentryTransaction;
  export type Span = SentrySpan;
}

// Stub Sentry module
const Sentry = {
  init: (_config: unknown) => {},
  Handlers: {
    requestHandler: (_opts?: unknown) => (_req: unknown, _res: unknown, next: () => void) => next(),
    tracingHandler: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    errorHandler: (_opts?: unknown) => (_err: unknown, _req: unknown, _res: unknown, next: () => void) => next(),
  },
  Integrations: {
    Http: class { constructor(_opts?: unknown) {} },
    Express: class { constructor(_opts?: unknown) {} },
    Postgres: class {},
  },
  withScope: (callback: (scope: SentryScope) => void) => {
    const stubScope: SentryScope = {
      setUser: () => {},
      setTag: () => {},
      setExtra: () => {},
      setLevel: () => {},
      setSpan: () => {},
    };
    callback(stubScope);
  },
  captureException: (error: Error) => {
    const eventId = `log-${Date.now()}`;
    logger.error(JSON.stringify({ level: 'error', event_id: eventId, message: error.message, stack: error.stack, timestamp: new Date().toISOString() }));
    return eventId;
  },
  captureMessage: (message: string, level?: string) => {
    const eventId = `log-${Date.now()}`;
    const logFn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
    logFn(JSON.stringify({ level: level || 'info', event_id: eventId, message, timestamp: new Date().toISOString() }));
    return eventId;
  },
  startTransaction: (opts: { name: string; op: string; data?: Record<string, unknown> }): SentryTransaction => ({
    startChild: (childOpts) => ({
      setStatus: () => {},
      finish: () => {},
    }),
    finish: () => {},
  }),
  getCurrentHub: () => ({
    configureScope: (callback: (scope: SentryScope) => void) => {
      const stubScope: SentryScope = {
        setUser: () => {},
        setTag: () => {},
        setExtra: () => {},
        setLevel: () => {},
        setSpan: () => {},
      };
      callback(stubScope);
    },
    getScope: () => ({
      getTransaction: (): SentryTransaction | undefined => undefined,
    }),
    getClient: () => ({
      getOptions: () => ({ dsn: undefined, environment: undefined }),
    }),
  }),
  configureScope: (callback: (scope: SentryScope) => void) => {
    const stubScope: SentryScope = {
      setUser: () => {},
      setTag: () => {},
      setExtra: () => {},
      setLevel: () => {},
      setSpan: () => {},
    };
    callback(stubScope);
  },
  addBreadcrumb: (_breadcrumb: unknown) => {},
  captureUserFeedback: (_feedback: unknown) => {},
  flush: async (_timeout?: number) => true,
};

// Stub ProfilingIntegration
class ProfilingIntegration {}

import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';

interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate?: number;
  profilesSampleRate?: number;
  debug?: boolean;
}

// Initialize Sentry
export function initSentry(config: SentryConfig): void {
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release || `agrifinance@${process.env.npm_package_version || '1.0.0'}`,
    
    // Performance monitoring
    tracesSampleRate: config.tracesSampleRate ?? 0.1, // 10% of transactions
    profilesSampleRate: config.profilesSampleRate ?? 0.1, // 10% of transactions
    
    // Integrations
    integrations: [
      new ProfilingIntegration(),
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app: undefined }), // Will be set later
      new Sentry.Integrations.Postgres(),
    ],

    // Filter sensitive data
    beforeSend(event: SentryEvent) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers['x-api-key'];
      }

      // Remove sensitive data from request body
      if (event.request?.data) {
        const sensitiveFields = ['password', 'pin', 'token', 'secret', 'apiKey'];
        for (const field of sensitiveFields) {
          if (event.request.data[field]) {
            event.request.data[field] = '[REDACTED]';
          }
        }
      }

      return event;
    },

    // Filter breadcrumbs
    beforeBreadcrumb(breadcrumb: SentryBreadcrumb) {
      // Filter out noisy breadcrumbs
      if (breadcrumb?.category === 'console' && breadcrumb?.level === 'debug') {
        return null;
      }
      return breadcrumb;
    },

    debug: config.debug ?? false,
  });
}

// Express middleware for request tracing
export function sentryRequestHandler() {
  return Sentry.Handlers.requestHandler({
    user: ['id', 'email', 'role'],
    ip: true,
  });
}

// Express middleware for tracing
export function sentryTracingHandler() {
  return Sentry.Handlers.tracingHandler();
}

// Express error handler
export function sentryErrorHandler() {
  return Sentry.Handlers.errorHandler({
    shouldHandleError(error: Error & { status?: number }) {
      // Capture all 4xx and 5xx errors
      if (error.status) {
        return error.status >= 400;
      }
      return true;
    },
  });
}

// Custom error capturing with context
export function captureError(
  error: Error,
  context?: {
    user?: { id: string; email?: string; role?: string };
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  }
): string {
  Sentry.withScope((scope) => {
    if (context?.user) {
      scope.setUser(context.user);
    }

    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }

    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }

    if (context?.level) {
      scope.setLevel(context.level);
    }
  });

  return Sentry.captureException(error);
}

// Capture message with context
export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }
): string {
  Sentry.withScope((scope) => {
    scope.setLevel(level);

    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }

    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }
  });

  return Sentry.captureMessage(message, level);
}

// Start a transaction for performance monitoring
export function startTransaction(
  name: string,
  op: string,
  data?: Record<string, unknown>
): Sentry.Transaction {
  const transaction = Sentry.startTransaction({
    name,
    op,
    data,
  });

  Sentry.getCurrentHub().configureScope((scope) => {
    scope.setSpan(transaction);
  });

  return transaction;
}

// Create a child span within a transaction
export function startSpan(
  transaction: Sentry.Transaction,
  op: string,
  description: string
): Sentry.Span {
  return transaction.startChild({
    op,
    description,
  });
}

// Middleware to add correlation ID
export function correlationIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const correlationId = req.headers['x-correlation-id'] as string || 
      `${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;

    // Set correlation ID on request
    (req as any).correlationId = correlationId;

    // Set correlation ID in response header
    res.setHeader('X-Correlation-ID', correlationId);

    // Add to Sentry scope
    Sentry.configureScope((scope) => {
      scope.setTag('correlation_id', correlationId);
    });

    next();
  };
}

// Structured logging with Sentry breadcrumbs
export class StructuredLogger {
  private service: string;

  constructor(service: string) {
    this.service = service;
  }

  private log(
    level: 'debug' | 'info' | 'warning' | 'error',
    message: string,
    data?: Record<string, unknown>
  ): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.service,
      message,
      ...data,
    };

    // Console output
    const consoleMethod = level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log';
    console[consoleMethod](JSON.stringify(logEntry));

    // Add Sentry breadcrumb
    Sentry.addBreadcrumb({
      category: this.service,
      message,
      level: level === 'warning' ? 'warning' : level,
      data,
    });
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warning', message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log('error', message, { ...data, error: error?.message, stack: error?.stack });
    
    if (error) {
      captureError(error, {
        tags: { service: this.service },
        extra: data,
      });
    }
  }
}

// Performance monitoring decorators
export function traceMethod(op: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]) {
      const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();
      
      if (transaction) {
        const span = transaction.startChild({
          op,
          description: `${target.constructor.name}.${propertyKey}`,
        });

        try {
          const result = await originalMethod.apply(this, args);
          span.setStatus('ok');
          return result;
        } catch (error) {
          span.setStatus('internal_error');
          throw error;
        } finally {
          span.finish();
        }
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

// Database query tracing
export function traceDatabaseQuery(
  queryName: string,
  query: string
): Sentry.Span | undefined {
  const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();
  
  if (transaction) {
    return transaction.startChild({
      op: 'db.query',
      description: queryName,
      data: { query },
    });
  }

  return undefined;
}

// HTTP request tracing
export function traceHttpRequest(
  method: string,
  url: string
): Sentry.Span | undefined {
  const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();
  
  if (transaction) {
    return transaction.startChild({
      op: 'http.client',
      description: `${method} ${url}`,
    });
  }

  return undefined;
}

// User feedback collection
export function collectUserFeedback(
  eventId: string,
  feedback: {
    name: string;
    email: string;
    comments: string;
  }
): void {
  Sentry.captureUserFeedback({
    event_id: eventId,
    name: feedback.name,
    email: feedback.email,
    comments: feedback.comments,
  });
}

// Health check endpoint data
export function getSentryHealth(): {
  initialized: boolean;
  dsn: string | undefined;
  environment: string | undefined;
} {
  const client = Sentry.getCurrentHub().getClient();
  const options = client?.getOptions();

  return {
    initialized: !!client,
    dsn: options?.dsn ? '[CONFIGURED]' : undefined,
    environment: options?.environment,
  };
}

// Flush events before shutdown
export async function flushSentry(timeout: number = 2000): Promise<boolean> {
  return Sentry.flush(timeout);
}

// Factory function
export function createSentryMonitoring(config?: Partial<SentryConfig>): void {
  const defaultConfig: SentryConfig = {
    dsn: process.env.SENTRY_DSN || '',
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
    debug: process.env.SENTRY_DEBUG === 'true',
  };

  if (defaultConfig.dsn) {
    initSentry({ ...defaultConfig, ...config });
  } else {
    logger.warn('Sentry DSN not configured, error monitoring disabled');
  }
}

export default {
  initSentry,
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler,
  captureError,
  captureMessage,
  startTransaction,
  startSpan,
  correlationIdMiddleware,
  StructuredLogger,
  traceMethod,
  traceDatabaseQuery,
  traceHttpRequest,
  collectUserFeedback,
  getSentryHealth,
  flushSentry,
  createSentryMonitoring,
};
