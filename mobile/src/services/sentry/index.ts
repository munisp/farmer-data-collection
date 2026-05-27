import * as Sentry from '@sentry/react-native';

/**
 * Sentry Error Tracking Service
 * Captures and reports errors and crashes
 */

class SentryService {
  /**
   * Initialize Sentry
   */
  init(dsn: string, environment: string = 'production') {
    try {
      Sentry.init({
        dsn,
        environment,
        enableAutoSessionTracking: true,
        sessionTrackingIntervalMillis: 30000,
        tracesSampleRate: 1.0, // Adjust in production
        beforeSend(event, hint) {
          // Filter out sensitive data
          if (event.request) {
            delete event.request.cookies;
            delete event.request.headers;
          }
          return event;
        },
      });
    } catch (error) {
      console.error('Sentry initialization error:', error);
    }
  }

  /**
   * Capture exception
   */
  captureException(error: Error, context?: Record<string, any>) {
    try {
      if (context) {
        Sentry.setContext('additional_context', context);
      }
      Sentry.captureException(error);
    } catch (err) {
      console.error('Sentry captureException error:', err);
    }
  }

  /**
   * Capture message
   */
  captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
    try {
      Sentry.captureMessage(message, level);
    } catch (error) {
      console.error('Sentry captureMessage error:', error);
    }
  }

  /**
   * Set user context
   */
  setUser(user: { id: string; email?: string; username?: string }) {
    try {
      Sentry.setUser(user);
    } catch (error) {
      console.error('Sentry setUser error:', error);
    }
  }

  /**
   * Clear user context
   */
  clearUser() {
    try {
      Sentry.setUser(null);
    } catch (error) {
      console.error('Sentry clearUser error:', error);
    }
  }

  /**
   * Add breadcrumb
   */
  addBreadcrumb(breadcrumb: {
    message: string;
    category?: string;
    level?: Sentry.SeverityLevel;
    data?: Record<string, any>;
  }) {
    try {
      Sentry.addBreadcrumb(breadcrumb);
    } catch (error) {
      console.error('Sentry addBreadcrumb error:', error);
    }
  }

  /**
   * Set tag
   */
  setTag(key: string, value: string) {
    try {
      Sentry.setTag(key, value);
    } catch (error) {
      console.error('Sentry setTag error:', error);
    }
  }

  /**
   * Set context
   */
  setContext(name: string, context: Record<string, any>) {
    try {
      Sentry.setContext(name, context);
    } catch (error) {
      console.error('Sentry setContext error:', error);
    }
  }

  /**
   * Wrap error boundary
   */
  ErrorBoundary = Sentry.ErrorBoundary;

  /**
   * Track navigation
   */
  trackNavigation(routeName: string, params?: any) {
    try {
      this.addBreadcrumb({
        message: `Navigation to ${routeName}`,
        category: 'navigation',
        level: 'info',
        data: params,
      });
    } catch (error) {
      console.error('Sentry trackNavigation error:', error);
    }
  }

  /**
   * Track API call
   */
  trackAPICall(endpoint: string, method: string, status?: number) {
    try {
      this.addBreadcrumb({
        message: `API ${method} ${endpoint}`,
        category: 'api',
        level: status && status >= 400 ? 'error' : 'info',
        data: { endpoint, method, status },
      });
    } catch (error) {
      console.error('Sentry trackAPICall error:', error);
    }
  }

  /**
   * Track user action
   */
  trackUserAction(action: string, data?: Record<string, any>) {
    try {
      this.addBreadcrumb({
        message: action,
        category: 'user_action',
        level: 'info',
        data,
      });
    } catch (error) {
      console.error('Sentry trackUserAction error:', error);
    }
  }
}

export default new SentryService();
