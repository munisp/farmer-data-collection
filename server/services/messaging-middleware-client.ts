/**
 * Messaging Middleware Client
 * 
 * Client for publishing messaging events to the Go messaging middleware service.
 * Integrates SMS, WhatsApp, and USSD services with the Kafka-based event pipeline.
 */

import axios, { AxiosInstance } from "axios";
import { logger } from '../logger.js';

// Configuration
const MIDDLEWARE_CONFIG = {
  goMiddlewareUrl: process.env.MESSAGING_MIDDLEWARE_URL || "http://localhost:8091",
  pythonAnalyticsUrl: process.env.MESSAGING_ANALYTICS_URL || "http://localhost:8092",
  enabled: process.env.MESSAGING_MIDDLEWARE_ENABLED !== "false",
  timeout: 5000,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

// Types
export type MessageChannel = "sms" | "whatsapp" | "ussd";
export type MessageStatus = "pending" | "sent" | "delivered" | "failed" | "read";
export type MessageDirection = "outbound" | "inbound";

export interface MessageEvent {
  id: string;
  channel: MessageChannel;
  direction: MessageDirection;
  phoneNumber: string;
  userId?: number;
  provider: string;
  status: MessageStatus;
  content?: string;
  templateId?: string;
  externalId?: string;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface USSDSessionEvent {
  sessionId: string;
  phoneNumber: string;
  serviceCode: string;
  step: string;
  input?: string;
  response?: string;
  isCompleted: boolean;
  action?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface ProviderHealthEvent {
  provider: string;
  channel: string;
  isHealthy: boolean;
  consecutiveFailures: number;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  totalSent: number;
  totalFailed: number;
  timestamp: Date;
}

export interface PermissionCheckResult {
  allowed: boolean;
  userId: number;
  channel: string;
  reason?: string;
}

/**
 * Messaging Middleware Client
 */
class MessagingMiddlewareClient {
  private goClient: AxiosInstance;
  private pythonClient: AxiosInstance;
  private enabled: boolean;

  constructor() {
    this.enabled = MIDDLEWARE_CONFIG.enabled;

    this.goClient = axios.create({
      baseURL: MIDDLEWARE_CONFIG.goMiddlewareUrl,
      timeout: MIDDLEWARE_CONFIG.timeout,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.pythonClient = axios.create({
      baseURL: MIDDLEWARE_CONFIG.pythonAnalyticsUrl,
      timeout: MIDDLEWARE_CONFIG.timeout,
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (this.enabled) {
      logger.info("[MessagingMiddleware] Client initialized");
      logger.info(`[MessagingMiddleware] Go middleware: ${MIDDLEWARE_CONFIG.goMiddlewareUrl}`);
      logger.info(`[MessagingMiddleware] Python analytics: ${MIDDLEWARE_CONFIG.pythonAnalyticsUrl}`);
    } else {
      logger.info("[MessagingMiddleware] Client disabled");
    }
  }

  /**
   * Check if middleware is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Publish SMS event to middleware
   */
  async publishSMSEvent(event: MessageEvent): Promise<boolean> {
    if (!this.enabled) return true;

    event.channel = "sms";
    event.timestamp = event.timestamp || new Date();

    return this.publishWithRetry(
      () => this.goClient.post("/api/messaging/sms/event", this.serializeEvent(event)),
      "SMS"
    );
  }

  /**
   * Publish WhatsApp event to middleware
   */
  async publishWhatsAppEvent(event: MessageEvent): Promise<boolean> {
    if (!this.enabled) return true;

    event.channel = "whatsapp";
    event.timestamp = event.timestamp || new Date();

    return this.publishWithRetry(
      () => this.goClient.post("/api/messaging/whatsapp/event", this.serializeEvent(event)),
      "WhatsApp"
    );
  }

  /**
   * Publish USSD session event to middleware
   */
  async publishUSSDEvent(event: USSDSessionEvent): Promise<boolean> {
    if (!this.enabled) return true;

    event.timestamp = event.timestamp || new Date();

    return this.publishWithRetry(
      () => this.goClient.post("/api/messaging/ussd/event", this.serializeUSSDEvent(event)),
      "USSD"
    );
  }

  /**
   * Update provider health status
   */
  async updateProviderHealth(event: ProviderHealthEvent): Promise<boolean> {
    if (!this.enabled) return true;

    event.timestamp = event.timestamp || new Date();

    return this.publishWithRetry(
      () => this.goClient.post("/api/messaging/provider/health", this.serializeProviderHealth(event)),
      "ProviderHealth"
    );
  }

  /**
   * Check if user has permission to send message
   */
  async checkSendPermission(
    userId: number,
    channel: MessageChannel,
    phoneNumber: string
  ): Promise<PermissionCheckResult> {
    if (!this.enabled) {
      return { allowed: true, userId, channel };
    }

    try {
      const response = await this.goClient.get("/api/messaging/permission", {
        params: { userId, channel, phoneNumber },
      });

      return response.data;
    } catch (error: unknown) {
      logger.warn(`[MessagingMiddleware] Permission check failed: ${(error instanceof Error ? error.message : String(error))}`);
      // Default to allowed if middleware is unavailable
      return { allowed: true, userId, channel, reason: "middleware_unavailable" };
    }
  }

  /**
   * Get channel metrics from Python analytics service
   */
  async getChannelMetrics(channel: MessageChannel): Promise<unknown> {
    if (!this.enabled) return null;

    try {
      const response = await this.pythonClient.get(`/api/analytics/${channel}`);
      return response.data;
    } catch (error: unknown) {
      logger.warn(`[MessagingMiddleware] Failed to get ${channel} metrics: ${(error instanceof Error ? error.message : String(error))}`);
      return null;
    }
  }

  /**
   * Get USSD funnel metrics from Python analytics service
   */
  async getUSSDFunnelMetrics(): Promise<unknown> {
    if (!this.enabled) return null;

    try {
      const response = await this.pythonClient.get("/api/analytics/ussd");
      return response.data;
    } catch (error: unknown) {
      logger.warn(`[MessagingMiddleware] Failed to get USSD metrics: ${(error instanceof Error ? error.message : String(error))}`);
      return null;
    }
  }

  /**
   * Get provider health summary from Python analytics service
   */
  async getProviderHealthSummary(): Promise<unknown> {
    if (!this.enabled) return null;

    try {
      const response = await this.pythonClient.get("/api/analytics/providers");
      return response.data;
    } catch (error: unknown) {
      logger.warn(`[MessagingMiddleware] Failed to get provider health: ${(error instanceof Error ? error.message : String(error))}`);
      return null;
    }
  }

  /**
   * Get delivery report from Python analytics service
   */
  async getDeliveryReport(params?: {
    channel?: MessageChannel;
    startDate?: Date;
    endDate?: Date;
    provider?: string;
  }): Promise<unknown> {
    if (!this.enabled) return null;

    try {
      const response = await this.pythonClient.get("/api/analytics/report", {
        params: {
          channel: params?.channel,
          start_date: params?.startDate?.toISOString(),
          end_date: params?.endDate?.toISOString(),
          provider: params?.provider,
        },
      });
      return response.data;
    } catch (error: unknown) {
      logger.warn(`[MessagingMiddleware] Failed to get delivery report: ${(error instanceof Error ? error.message : String(error))}`);
      return null;
    }
  }

  /**
   * Check middleware health
   */
  async checkHealth(): Promise<{ go: boolean; python: boolean }> {
    const results = { go: false, python: false };

    try {
      const goResponse = await this.goClient.get("/health");
      results.go = goResponse.data?.status === "healthy";
    } catch (err) {
      results.go = false;
    }

    try {
      const pythonResponse = await this.pythonClient.get("/health");
      results.python = pythonResponse.data?.status === "healthy";
    } catch (err) {
      results.python = false;
    }

    return results;
  }

  // Private helper methods

  private async publishWithRetry(
    publishFn: () => Promise<unknown>,
    eventType: string
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= MIDDLEWARE_CONFIG.retryAttempts; attempt++) {
      try {
        await publishFn();
        return true;
      } catch (error: unknown) {
        const isLastAttempt = attempt === MIDDLEWARE_CONFIG.retryAttempts;
        
        if (isLastAttempt) {
          logger.warn(`[MessagingMiddleware] Failed to publish ${eventType} event after ${attempt} attempts: ${(error instanceof Error ? error.message : String(error))}`);
          return false;
        }

        logger.warn(`[MessagingMiddleware] ${eventType} publish attempt ${attempt} failed, retrying...`);
        await this.delay(MIDDLEWARE_CONFIG.retryDelayMs * attempt);
      }
    }

    return false;
  }

  private serializeEvent(event: MessageEvent): Record<string, unknown> {
    return {
      id: event.id,
      channel: event.channel,
      direction: event.direction,
      phoneNumber: event.phoneNumber,
      userId: event.userId,
      provider: event.provider,
      status: event.status,
      content: event.content,
      templateId: event.templateId,
      externalId: event.externalId,
      errorCode: event.errorCode,
      errorMessage: event.errorMessage,
      metadata: event.metadata,
      timestamp: event.timestamp.toISOString(),
    };
  }

  private serializeUSSDEvent(event: USSDSessionEvent): Record<string, unknown> {
    return {
      sessionId: event.sessionId,
      phoneNumber: event.phoneNumber,
      serviceCode: event.serviceCode,
      step: event.step,
      input: event.input,
      response: event.response,
      isCompleted: event.isCompleted,
      action: event.action,
      durationMs: event.durationMs,
      metadata: event.metadata,
      timestamp: event.timestamp.toISOString(),
    };
  }

  private serializeProviderHealth(event: ProviderHealthEvent): Record<string, unknown> {
    return {
      provider: event.provider,
      channel: event.channel,
      isHealthy: event.isHealthy,
      consecutiveFailures: event.consecutiveFailures,
      lastSuccessAt: event.lastSuccessAt?.toISOString(),
      lastFailureAt: event.lastFailureAt?.toISOString(),
      totalSent: event.totalSent,
      totalFailed: event.totalFailed,
      timestamp: event.timestamp.toISOString(),
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let middlewareClient: MessagingMiddlewareClient | null = null;

export function getMessagingMiddlewareClient(): MessagingMiddlewareClient {
  if (!middlewareClient) {
    middlewareClient = new MessagingMiddlewareClient();
  }
  return middlewareClient;
}

// Convenience functions for direct use
export async function publishSMSEvent(event: MessageEvent): Promise<boolean> {
  return getMessagingMiddlewareClient().publishSMSEvent(event);
}

export async function publishWhatsAppEvent(event: MessageEvent): Promise<boolean> {
  return getMessagingMiddlewareClient().publishWhatsAppEvent(event);
}

export async function publishUSSDEvent(event: USSDSessionEvent): Promise<boolean> {
  return getMessagingMiddlewareClient().publishUSSDEvent(event);
}

export async function updateProviderHealth(event: ProviderHealthEvent): Promise<boolean> {
  return getMessagingMiddlewareClient().updateProviderHealth(event);
}

export async function checkSendPermission(
  userId: number,
  channel: MessageChannel,
  phoneNumber: string
): Promise<PermissionCheckResult> {
  return getMessagingMiddlewareClient().checkSendPermission(userId, channel, phoneNumber);
}
