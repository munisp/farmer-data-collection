/**
 * Structured Logger (Pino-backed)
 * Production: JSON to stdout (compatible with Grafana Loki, CloudWatch, Datadog)
 * Development: Pretty-printed with timestamps
 *
 * Usage:
 *   import { logger } from './logger';
 *   logger.info('User logged in', { userId: '123', action: 'login' });
 *   logger.error('Database error', { error: err.message, query: 'SELECT...' });
 *   const childLog = logger.child({ module: 'payments' });
 */

import pino from 'pino';

const SERVICE_NAME = process.env.SERVICE_NAME || 'farmer-data-collection';
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');

const pinoLogger = pino({
  name: SERVICE_NAME,
  level: LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(NODE_ENV !== 'production' && {
    transport: {
      target: 'pino/file',
      options: { destination: 1 },
    },
  }),
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
  base: {
    service: SERVICE_NAME,
    environment: NODE_ENV,
    pid: process.pid,
  },
  redact: {
    paths: ['password', 'token', 'secret', 'authorization', 'cookie', 'creditCard'],
    censor: '[REDACTED]',
  },
});

type LogContext = Record<string, unknown> | unknown;

function toLogObject(context: LogContext): Record<string, unknown> {
  if (context === null || context === undefined) return {};
  if (typeof context === 'object' && !Array.isArray(context)) return context as Record<string, unknown>;
  if (context instanceof Error) return { error: context.message, stack: context.stack };
  return { data: context };
}

function wrapChild(p: pino.Logger) {
  return {
    debug: (message: string, context?: LogContext) => context !== undefined ? p.debug(toLogObject(context), message) : p.debug(message),
    info: (message: string, context?: LogContext) => context !== undefined ? p.info(toLogObject(context), message) : p.info(message),
    warn: (message: string, context?: LogContext) => context !== undefined ? p.warn(toLogObject(context), message) : p.warn(message),
    error: (message: string, context?: LogContext) => context !== undefined ? p.error(toLogObject(context), message) : p.error(message),
    child: (defaultContext: Record<string, unknown>) => wrapChild(p.child(defaultContext)),
    requestLogger: () => requestLoggerMiddleware,
    pino: p,
  };
}

const requestLoggerMiddleware = (
  req: { method: string; url: string; ip?: string },
  res: { statusCode: number; on: (event: string, cb: () => void) => void },
  next: () => void
) => {
  const start = Date.now();
  res.on('finish', () => {
    pinoLogger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip,
    }, 'HTTP Request');
  });
  next();
};

export const logger = {
  debug: (message: string, context?: LogContext) => context !== undefined ? pinoLogger.debug(toLogObject(context), message) : pinoLogger.debug(message),
  info: (message: string, context?: LogContext) => context !== undefined ? pinoLogger.info(toLogObject(context), message) : pinoLogger.info(message),
  warn: (message: string, context?: LogContext) => context !== undefined ? pinoLogger.warn(toLogObject(context), message) : pinoLogger.warn(message),
  error: (message: string, context?: LogContext) => context !== undefined ? pinoLogger.error(toLogObject(context), message) : pinoLogger.error(message),
  child: (defaultContext: Record<string, unknown>) => wrapChild(pinoLogger.child(defaultContext)),
  requestLogger: () => requestLoggerMiddleware,
  pino: pinoLogger,
};

export default logger;
