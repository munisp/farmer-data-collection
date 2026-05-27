/**
 * Structured Logger
 * Provides structured JSON logging for production environments
 * Falls back to console methods with JSON formatting
 * 
 * Usage:
 *   import { logger } from './logger';
 *   logger.info('User logged in', { userId: '123', action: 'login' });
 *   logger.error('Database error', { error: err.message, query: 'SELECT...' });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  environment: string;
  context?: LogContext;
}

const SERVICE_NAME = process.env.SERVICE_NAME || 'farmer-data-collection';
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL as LogLevel] || LOG_LEVELS[LOG_LEVEL as LogLevel] === undefined;
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
    environment: NODE_ENV,
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  // In production, output JSON
  if (NODE_ENV === 'production') {
    return JSON.stringify(entry);
  }

  // In development, output readable format
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  return `[${entry.timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const formatted = formatLog(level, message, context);

  switch (level) {
    case 'debug':
      console.debug(formatted);
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),

  // Child logger with preset context
  child: (defaultContext: LogContext) => ({
    debug: (message: string, context?: LogContext) => log('debug', message, { ...defaultContext, ...context }),
    info: (message: string, context?: LogContext) => log('info', message, { ...defaultContext, ...context }),
    warn: (message: string, context?: LogContext) => log('warn', message, { ...defaultContext, ...context }),
    error: (message: string, context?: LogContext) => log('error', message, { ...defaultContext, ...context }),
  }),

  // Request logger middleware for Express
  requestLogger: () => {
    return (req: { method: string; url: string; ip?: string }, res: { statusCode: number; on: (event: string, cb: () => void) => void }, next: () => void) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        log('info', 'HTTP Request', {
          method: req.method,
          url: req.url,
          status: res.statusCode,
          duration: `${duration}ms`,
          ip: req.ip,
        });
      });

      next();
    };
  },
};

export default logger;
