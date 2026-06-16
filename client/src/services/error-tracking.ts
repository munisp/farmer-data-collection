/**
 * Production-Ready Error Tracking Service
 * Provides comprehensive error tracking, performance monitoring, and analytics
 * Can be configured to use Sentry, custom backend, or console logging
 */

export interface ErrorContext {
  userId?: string;
  userEmail?: string;
  feature?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 's' | 'bytes' | 'count';
  tags?: Record<string, string>;
}

export interface AnalyticsEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp?: number;
}

type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

class ErrorTrackingService {
  private isInitialized = false;
  private userId: string | null = null;
  private userEmail: string | null = null;
  private errorQueue: Array<{ error: Error; context: ErrorContext; severity: ErrorSeverity }> = [];
  private analyticsQueue: AnalyticsEvent[] = [];
  private performanceQueue: PerformanceMetric[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the error tracking service
   */
  init(config?: { 
    dsn?: string; 
    environment?: string;
    release?: string;
    sampleRate?: number;
  }): void {
    if (this.isInitialized) return;

    const environment = config?.environment || import.meta.env.MODE || 'development';
    const release = config?.release || import.meta.env.VITE_APP_VERSION || '1.0.0';

    // Set up global error handlers
    this.setupGlobalErrorHandlers();

    // Set up performance observer
    this.setupPerformanceObserver();

    // Start flush interval for batched reporting
    this.flushInterval = setInterval(() => this.flush(), 30000);

    this.isInitialized = true;
    console.warn(`[ErrorTracking] Initialized for ${environment} (${release})`);
  }

  /**
   * Set user context for error tracking
   */
  setUser(userId: string, email?: string, additionalData?: Record<string, unknown>): void {
    this.userId = userId;
    this.userEmail = email || null;
    console.warn(`[ErrorTracking] User context set: ${userId}`);
  }

  /**
   * Clear user context (on logout)
   */
  clearUser(): void {
    this.userId = null;
    this.userEmail = null;
    console.warn('[ErrorTracking] User context cleared');
  }

  /**
   * Capture an error with context
   */
  captureError(error: Error, context?: ErrorContext, severity: ErrorSeverity = 'error'): void {
    const enrichedContext: ErrorContext = {
      ...context,
      userId: context?.userId || this.userId || undefined,
      userEmail: context?.userEmail || this.userEmail || undefined,
    };

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error(`[ErrorTracking] ${severity.toUpperCase()}:`, error, enrichedContext);
    }

    // Queue for batch reporting
    this.errorQueue.push({ error, context: enrichedContext, severity });

    // Immediately flush fatal errors
    if (severity === 'fatal') {
      this.flush();
    }
  }

  /**
   * Capture a message (non-error)
   */
  captureMessage(message: string, context?: ErrorContext, severity: ErrorSeverity = 'info'): void {
    const error = new Error(message);
    error.name = 'CapturedMessage';
    this.captureError(error, context, severity);
  }

  /**
   * Track an analytics event
   */
  trackEvent(name: string, properties?: Record<string, unknown>): void {
    const event: AnalyticsEvent = {
      name,
      properties: {
        ...properties,
        userId: this.userId,
        timestamp: Date.now(),
        url: window.location.pathname,
        userAgent: navigator.userAgent,
      },
      timestamp: Date.now(),
    };

    if (import.meta.env.DEV) {
      console.warn(`[Analytics] Event: ${name}`, properties);
    }

    this.analyticsQueue.push(event);
  }

  /**
   * Track a performance metric
   */
  trackPerformance(metric: PerformanceMetric): void {
    if (import.meta.env.DEV) {
      console.warn(`[Performance] ${metric.name}: ${metric.value}${metric.unit}`);
    }

    this.performanceQueue.push({
      ...metric,
      tags: {
        ...metric.tags,
        userId: this.userId || 'anonymous',
      },
    });
  }

  /**
   * Start a performance transaction
   */
  startTransaction(name: string, operation: string): PerformanceTransaction {
    return new PerformanceTransaction(name, operation, this);
  }

  /**
   * Set up global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Unhandled errors
    window.addEventListener('error', (event) => {
      this.captureError(event.error || new Error(event.message), {
        feature: 'global',
        action: 'unhandled_error',
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      }, 'error');
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error 
        ? event.reason 
        : new Error(String(event.reason));
      
      this.captureError(error, {
        feature: 'global',
        action: 'unhandled_rejection',
      }, 'error');
    });

    // Network errors
    window.addEventListener('offline', () => {
      this.trackEvent('network_offline');
    });

    window.addEventListener('online', () => {
      this.trackEvent('network_online');
    });
  }

  /**
   * Set up performance observer for Core Web Vitals
   */
  private setupPerformanceObserver(): void {
    if (!('PerformanceObserver' in window)) return;

    // Largest Contentful Paint (LCP)
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.trackPerformance({
          name: 'lcp',
          value: lastEntry.startTime,
          unit: 'ms',
          tags: { type: 'web_vital' },
        });
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {
      // LCP not supported
    }

    // First Input Delay (FID)
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          this.trackPerformance({
            name: 'fid',
            value: entry.processingStart - entry.startTime,
            unit: 'ms',
            tags: { type: 'web_vital' },
          });
        });
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
    } catch (e) {
      // FID not supported
    }

    // Cumulative Layout Shift (CLS)
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        this.trackPerformance({
          name: 'cls',
          value: clsValue,
          unit: 'count',
          tags: { type: 'web_vital' },
        });
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
    } catch (e) {
      // CLS not supported
    }

    // Navigation timing
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          this.trackPerformance({
            name: 'ttfb',
            value: navigation.responseStart - navigation.requestStart,
            unit: 'ms',
            tags: { type: 'navigation' },
          });
          this.trackPerformance({
            name: 'dom_interactive',
            value: navigation.domInteractive,
            unit: 'ms',
            tags: { type: 'navigation' },
          });
          this.trackPerformance({
            name: 'dom_complete',
            value: navigation.domComplete,
            unit: 'ms',
            tags: { type: 'navigation' },
          });
        }
      }, 0);
    });
  }

  /**
   * Flush queued data to backend
   */
  async flush(): Promise<void> {
    if (this.errorQueue.length === 0 && this.analyticsQueue.length === 0 && this.performanceQueue.length === 0) {
      return;
    }

    const errors = [...this.errorQueue];
    const analytics = [...this.analyticsQueue];
    const performance = [...this.performanceQueue];

    this.errorQueue = [];
    this.analyticsQueue = [];
    this.performanceQueue = [];

    // In production, send to backend
    if (import.meta.env.PROD) {
      try {
        await fetch('/api/telemetry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            errors: errors.map(e => ({
              message: e.error.message,
              stack: e.error.stack,
              name: e.error.name,
              context: e.context,
              severity: e.severity,
              timestamp: Date.now(),
            })),
            analytics,
            performance,
          }),
        });
      } catch (error) {
        // Re-queue on failure
        this.errorQueue.push(...errors);
        this.analyticsQueue.push(...analytics);
        this.performanceQueue.push(...performance);
        console.warn('[ErrorTracking] Failed to flush telemetry:', error);
      }
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
    this.isInitialized = false;
  }
}

/**
 * Performance transaction for measuring operation duration
 */
class PerformanceTransaction {
  private startTime: number;
  private spans: Array<{ name: string; startTime: number; endTime: number | undefined }> = [];

  constructor(
    private name: string,
    private operation: string,
    private tracker: ErrorTrackingService
  ) {
    this.startTime = performance.now();
  }

  startSpan(name: string): () => void {
    const span: { name: string; startTime: number; endTime: number | undefined } = {
      name,
      startTime: performance.now(),
      endTime: undefined,
    };
    this.spans.push(span);
    return () => {
      span.endTime = performance.now();
    };
  }

  finish(): void {
    const duration = performance.now() - this.startTime;
    this.tracker.trackPerformance({
      name: `transaction_${this.name}`,
      value: duration,
      unit: 'ms',
      tags: { operation: this.operation },
    });

    this.spans.forEach(span => {
      if (span.endTime) {
        this.tracker.trackPerformance({
          name: `span_${span.name}`,
          value: span.endTime - span.startTime,
          unit: 'ms',
          tags: { transaction: this.name },
        });
      }
    });
  }
}

// Export singleton instance
export const errorTracking = new ErrorTrackingService();

// React hook for error tracking
export function useErrorTracking() {
  return {
    captureError: errorTracking.captureError.bind(errorTracking),
    captureMessage: errorTracking.captureMessage.bind(errorTracking),
    trackEvent: errorTracking.trackEvent.bind(errorTracking),
    trackPerformance: errorTracking.trackPerformance.bind(errorTracking),
    startTransaction: errorTracking.startTransaction.bind(errorTracking),
  };
}

// Initialize on import
if (typeof window !== 'undefined') {
  errorTracking.init();
}

export default errorTracking;
