import crypto from "crypto";
/**
 * Persistent Message Queue Service
 * 
 * Provides durable message queuing for SMS/WhatsApp with:
 * - Redis-backed persistence
 * - Automatic retry with exponential backoff
 * - Dead letter queue for failed messages
 * - Provider failover support
 * - Circuit breaker pattern
 * - Metrics and monitoring
 */

import { Redis } from "ioredis";
import { EventEmitter } from "events";
import { logger } from '../logger.js';

// Message types
export type MessageChannel = "sms" | "whatsapp" | "ussd";
export type MessageStatus = "pending" | "processing" | "sent" | "delivered" | "failed" | "dead_letter";
export type SMSProvider = "africas_talking" | "twilio";
export type WhatsAppProvider = "meta" | "twilio";

// Queue message structure
export interface QueuedMessage {
  id: string;
  channel: MessageChannel;
  to: string;
  content: string;
  templateId?: string;
  templateParams?: Record<string, string>;
  metadata?: Record<string, unknown>;
  priority: "high" | "normal" | "low";
  status: MessageStatus;
  provider?: string;
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: number;
  nextRetryAt?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  sentAt?: number;
  deliveredAt?: number;
  idempotencyKey: string;
}

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// Circuit breaker state
export interface CircuitBreakerState {
  provider: string;
  state: "closed" | "open" | "half_open";
  failures: number;
  lastFailureAt?: number;
  openedAt?: number;
  halfOpenAttempts: number;
}

// Queue statistics
export interface QueueStats {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  deadLetter: number;
  totalProcessed: number;
  avgProcessingTimeMs: number;
  successRate: number;
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 300000, // 5 minutes
  backoffMultiplier: 2,
};

// Circuit breaker configuration
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 1 minute
  halfOpenMaxAttempts: 3,
};

// Redis keys
const REDIS_KEYS = {
  queue: "msg:queue",
  processing: "msg:processing",
  deadLetter: "msg:dead_letter",
  idempotency: "msg:idempotency",
  circuitBreaker: "msg:circuit_breaker",
  stats: "msg:stats",
  metrics: "msg:metrics",
};

export class MessageQueueService extends EventEmitter {
  private redis: Redis;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private stats: QueueStats = {
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    deadLetter: 0,
    totalProcessed: 0,
    avgProcessingTimeMs: 0,
    successRate: 100,
  };

  constructor(redisUrl?: string) {
    super();
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.redis.on("error", (err) => {
      logger.error("[MessageQueue] Redis error:", err);
      this.emit("error", err);
    });

    this.redis.on("connect", () => {
      logger.info("[MessageQueue] Redis connected");
      this.emit("connected");
    });

    // Initialize circuit breakers for providers
    this.initializeCircuitBreakers();
  }

  private initializeCircuitBreakers(): void {
    const providers = ["africas_talking", "twilio", "meta"];
    providers.forEach((provider) => {
      this.circuitBreakers.set(provider, {
        provider,
        state: "closed",
        failures: 0,
        halfOpenAttempts: 0,
      });
    });
  }

  /**
   * Enqueue a message for delivery
   */
  async enqueue(message: Omit<QueuedMessage, "id" | "status" | "attempts" | "createdAt" | "updatedAt">): Promise<string> {
    // Generate idempotency key if not provided
    const idempotencyKey = message.idempotencyKey || this.generateIdempotencyKey(message);

    // Check for duplicate
    const existing = await this.redis.get(`${REDIS_KEYS.idempotency}:${idempotencyKey}`);
    if (existing) {
      logger.info(`[MessageQueue] Duplicate message detected: ${idempotencyKey}`);
      return existing;
    }

    const id = this.generateMessageId();
    const now = Date.now();

    const queuedMessage: QueuedMessage = {
      ...message,
      id,
      status: "pending",
      attempts: 0,
      maxAttempts: message.maxAttempts || DEFAULT_RETRY_CONFIG.maxAttempts,
      createdAt: now,
      updatedAt: now,
      idempotencyKey,
    };

    // Store message and add to queue
    const pipeline = this.redis.pipeline();
    pipeline.set(`msg:${id}`, JSON.stringify(queuedMessage));
    pipeline.zadd(REDIS_KEYS.queue, now, id);
    pipeline.setex(`${REDIS_KEYS.idempotency}:${idempotencyKey}`, 86400, id); // 24 hour TTL
    pipeline.hincrby(REDIS_KEYS.stats, "pending", 1);
    await pipeline.exec();

    this.emit("enqueued", queuedMessage);
    logger.info(`[MessageQueue] Message enqueued: ${id} (${message.channel} to ${message.to})`);

    return id;
  }

  /**
   * Enqueue SMS message
   */
  async enqueueSMS(
    to: string,
    content: string,
    options?: {
      templateId?: string;
      templateParams?: Record<string, string>;
      priority?: "high" | "normal" | "low";
      metadata?: Record<string, unknown>;
    }
  ): Promise<string> {
    return this.enqueue({
      channel: "sms",
      to,
      content,
      templateId: options?.templateId,
      templateParams: options?.templateParams,
      priority: options?.priority || "normal",
      metadata: options?.metadata,
      maxAttempts: DEFAULT_RETRY_CONFIG.maxAttempts,
      idempotencyKey: this.generateIdempotencyKey({ channel: "sms", to, content }),
    });
  }

  /**
   * Enqueue WhatsApp message
   */
  async enqueueWhatsApp(
    to: string,
    content: string,
    options?: {
      templateId?: string;
      templateParams?: Record<string, string>;
      priority?: "high" | "normal" | "low";
      metadata?: Record<string, unknown>;
    }
  ): Promise<string> {
    return this.enqueue({
      channel: "whatsapp",
      to,
      content,
      templateId: options?.templateId,
      templateParams: options?.templateParams,
      priority: options?.priority || "normal",
      metadata: options?.metadata,
      maxAttempts: DEFAULT_RETRY_CONFIG.maxAttempts,
      idempotencyKey: this.generateIdempotencyKey({ channel: "whatsapp", to, content }),
    });
  }

  /**
   * Start processing queue
   */
  startProcessing(intervalMs: number = 1000): void {
    if (this.processingInterval) {
      return;
    }

    logger.info(`[MessageQueue] Starting queue processing (interval: ${intervalMs}ms)`);
    this.isProcessing = true;

    this.processingInterval = setInterval(async () => {
      if (!this.isProcessing) return;
      await this.processNextBatch();
    }, intervalMs);
  }

  /**
   * Stop processing queue
   */
  stopProcessing(): void {
    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    logger.info("[MessageQueue] Queue processing stopped");
  }

  /**
   * Process next batch of messages
   */
  private async processNextBatch(batchSize: number = 10): Promise<void> {
    const now = Date.now();

    // Get messages ready for processing (score <= now for retry timing)
    const messageIds = await this.redis.zrangebyscore(REDIS_KEYS.queue, 0, now, "LIMIT", 0, batchSize);

    if (messageIds.length === 0) {
      return;
    }

    for (const messageId of messageIds) {
      await this.processMessage(messageId);
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(messageId: string): Promise<void> {
    const startTime = Date.now();

    // Move to processing set
    await this.redis.zrem(REDIS_KEYS.queue, messageId);
    await this.redis.sadd(REDIS_KEYS.processing, messageId);

    // Get message
    const messageJson = await this.redis.get(`msg:${messageId}`);
    if (!messageJson) {
      await this.redis.srem(REDIS_KEYS.processing, messageId);
      return;
    }

    const message: QueuedMessage = JSON.parse(messageJson);
    message.status = "processing";
    message.attempts++;
    message.lastAttemptAt = startTime;
    message.updatedAt = startTime;

    await this.redis.set(`msg:${messageId}`, JSON.stringify(message));

    try {
      // Select provider with failover
      const provider = await this.selectProvider(message.channel);
      if (!provider) {
        throw new Error("No available provider (all circuit breakers open)");
      }

      message.provider = provider;

      // Send message
      const result = await this.sendMessage(message, provider);

      if (result.success) {
        // Success
        message.status = "sent";
        message.sentAt = Date.now();
        message.updatedAt = Date.now();

        await this.redis.set(`msg:${messageId}`, JSON.stringify(message));
        await this.redis.srem(REDIS_KEYS.processing, messageId);

        // Update stats
        await this.updateStats("sent", Date.now() - startTime);

        // Record success for circuit breaker
        this.recordSuccess(provider);

        this.emit("sent", message);
        logger.info(`[MessageQueue] Message sent: ${messageId} via ${provider}`);
      } else {
        throw new Error(result.error || "Send failed");
      }
    } catch (error: unknown) {
      logger.error(`[MessageQueue] Message failed: ${messageId}`, (error instanceof Error ? error.message : String(error)));

      // Record failure for circuit breaker
      if (message.provider) {
        this.recordFailure(message.provider);
      }

      message.error = (error instanceof Error ? error.message : String(error));
      message.updatedAt = Date.now();

      if (message.attempts >= message.maxAttempts) {
        // Move to dead letter queue
        message.status = "dead_letter";
        await this.redis.set(`msg:${messageId}`, JSON.stringify(message));
        await this.redis.srem(REDIS_KEYS.processing, messageId);
        await this.redis.zadd(REDIS_KEYS.deadLetter, Date.now(), messageId);

        await this.updateStats("deadLetter", Date.now() - startTime);

        this.emit("dead_letter", message);
        logger.info(`[MessageQueue] Message moved to dead letter: ${messageId}`);
      } else {
        // Schedule retry with exponential backoff
        const delay = this.calculateRetryDelay(message.attempts);
        message.status = "pending";
        message.nextRetryAt = Date.now() + delay;

        await this.redis.set(`msg:${messageId}`, JSON.stringify(message));
        await this.redis.srem(REDIS_KEYS.processing, messageId);
        await this.redis.zadd(REDIS_KEYS.queue, message.nextRetryAt, messageId);

        await this.updateStats("failed", Date.now() - startTime);

        this.emit("retry", message);
        logger.info(`[MessageQueue] Message scheduled for retry: ${messageId} (attempt ${message.attempts}/${message.maxAttempts}, delay ${delay}ms)`);
      }
    }
  }

  /**
   * Select provider with failover and circuit breaker
   */
  private async selectProvider(channel: MessageChannel): Promise<string | null> {
    let providers: string[];

    switch (channel) {
      case "sms":
        providers = ["africas_talking", "twilio"];
        break;
      case "whatsapp":
        providers = ["meta", "twilio"];
        break;
      default:
        return null;
    }

    // Try each provider in order
    for (const provider of providers) {
      const circuitBreaker = this.circuitBreakers.get(provider);
      if (!circuitBreaker) continue;

      // Check circuit breaker state
      if (circuitBreaker.state === "closed") {
        return provider;
      }

      if (circuitBreaker.state === "half_open") {
        if (circuitBreaker.halfOpenAttempts < CIRCUIT_BREAKER_CONFIG.halfOpenMaxAttempts) {
          circuitBreaker.halfOpenAttempts++;
          return provider;
        }
        continue;
      }

      if (circuitBreaker.state === "open") {
        // Check if reset timeout has passed
        if (circuitBreaker.openedAt && Date.now() - circuitBreaker.openedAt > CIRCUIT_BREAKER_CONFIG.resetTimeoutMs) {
          circuitBreaker.state = "half_open";
          circuitBreaker.halfOpenAttempts = 1;
          logger.info(`[MessageQueue] Circuit breaker half-open: ${provider}`);
          return provider;
        }
      }
    }

    return null;
  }

  /**
   * Record success for circuit breaker
   */
  private recordSuccess(provider: string): void {
    const circuitBreaker = this.circuitBreakers.get(provider);
    if (!circuitBreaker) return;

    if (circuitBreaker.state === "half_open") {
      // Reset to closed
      circuitBreaker.state = "closed";
      circuitBreaker.failures = 0;
      circuitBreaker.halfOpenAttempts = 0;
      logger.info(`[MessageQueue] Circuit breaker closed: ${provider}`);
    }

    circuitBreaker.failures = 0;
  }

  /**
   * Record failure for circuit breaker
   */
  private recordFailure(provider: string): void {
    const circuitBreaker = this.circuitBreakers.get(provider);
    if (!circuitBreaker) return;

    circuitBreaker.failures++;
    circuitBreaker.lastFailureAt = Date.now();

    if (circuitBreaker.state === "half_open") {
      // Back to open
      circuitBreaker.state = "open";
      circuitBreaker.openedAt = Date.now();
      logger.info(`[MessageQueue] Circuit breaker re-opened: ${provider}`);
    } else if (circuitBreaker.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      // Open circuit breaker
      circuitBreaker.state = "open";
      circuitBreaker.openedAt = Date.now();
      logger.info(`[MessageQueue] Circuit breaker opened: ${provider} (${circuitBreaker.failures} failures)`);
      this.emit("circuit_breaker_open", provider);
    }
  }

  /**
   * Send message via provider
   */
  private async sendMessage(message: QueuedMessage, provider: string): Promise<{ success: boolean; error?: string; messageId?: string }> {
    // Import services dynamically to avoid circular dependencies
    const { smsService } = await import("./sms.service.js");
    const { whatsappService } = await import("./whatsapp.service.js");

    try {
      if (message.channel === "sms") {
        const result = await smsService.sendSMS(
          { to: message.to, message: message.content },
          provider as SMSProvider
        );
        return result;
      } else if (message.channel === "whatsapp") {
        const result = await whatsappService.sendTextMessage(
          message.to,
          message.content,
          provider as WhatsAppProvider
        );
        return result;
      }

      return { success: false, error: "Unknown channel" };
    } catch (error: unknown) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = DEFAULT_RETRY_CONFIG.initialDelayMs * Math.pow(DEFAULT_RETRY_CONFIG.backoffMultiplier, attempt - 1);
    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.min(delay + jitter, DEFAULT_RETRY_CONFIG.maxDelayMs);
  }

  /**
   * Update statistics
   */
  private async updateStats(type: "sent" | "failed" | "deadLetter", processingTimeMs: number): Promise<void> {
    const pipeline = this.redis.pipeline();

    switch (type) {
      case "sent":
        pipeline.hincrby(REDIS_KEYS.stats, "sent", 1);
        pipeline.hincrby(REDIS_KEYS.stats, "pending", -1);
        break;
      case "failed":
        pipeline.hincrby(REDIS_KEYS.stats, "failed", 1);
        break;
      case "deadLetter":
        pipeline.hincrby(REDIS_KEYS.stats, "dead_letter", 1);
        pipeline.hincrby(REDIS_KEYS.stats, "pending", -1);
        break;
    }

    pipeline.hincrby(REDIS_KEYS.stats, "total_processed", 1);
    pipeline.hincrbyfloat(REDIS_KEYS.stats, "total_processing_time", processingTimeMs);

    await pipeline.exec();
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<QueueStats> {
    const stats = await this.redis.hgetall(REDIS_KEYS.stats);
    const pending = await this.redis.zcard(REDIS_KEYS.queue);
    const processing = await this.redis.scard(REDIS_KEYS.processing);
    const deadLetter = await this.redis.zcard(REDIS_KEYS.deadLetter);

    const totalProcessed = parseInt(stats.total_processed || "0", 10);
    const totalProcessingTime = parseFloat(stats.total_processing_time || "0");
    const sent = parseInt(stats.sent || "0", 10);

    return {
      pending,
      processing,
      sent,
      failed: parseInt(stats.failed || "0", 10),
      deadLetter,
      totalProcessed,
      avgProcessingTimeMs: totalProcessed > 0 ? totalProcessingTime / totalProcessed : 0,
      successRate: totalProcessed > 0 ? (sent / totalProcessed) * 100 : 100,
    };
  }

  /**
   * Get circuit breaker states
   */
  getCircuitBreakerStates(): CircuitBreakerState[] {
    return Array.from(this.circuitBreakers.values());
  }

  /**
   * Get message by ID
   */
  async getMessage(messageId: string): Promise<QueuedMessage | null> {
    const messageJson = await this.redis.get(`msg:${messageId}`);
    return messageJson ? JSON.parse(messageJson) : null;
  }

  /**
   * Get dead letter messages
   */
  async getDeadLetterMessages(limit: number = 100): Promise<QueuedMessage[]> {
    const messageIds = await this.redis.zrange(REDIS_KEYS.deadLetter, 0, limit - 1);
    const messages: QueuedMessage[] = [];

    for (const id of messageIds) {
      const message = await this.getMessage(id);
      if (message) {
        messages.push(message);
      }
    }

    return messages;
  }

  /**
   * Retry dead letter message
   */
  async retryDeadLetter(messageId: string): Promise<boolean> {
    const message = await this.getMessage(messageId);
    if (!message || message.status !== "dead_letter") {
      return false;
    }

    // Reset message for retry
    message.status = "pending";
    message.attempts = 0;
    message.error = undefined;
    message.updatedAt = Date.now();

    await this.redis.set(`msg:${messageId}`, JSON.stringify(message));
    await this.redis.zrem(REDIS_KEYS.deadLetter, messageId);
    await this.redis.zadd(REDIS_KEYS.queue, Date.now(), messageId);

    logger.info(`[MessageQueue] Dead letter message requeued: ${messageId}`);
    return true;
  }

  /**
   * Generate message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${crypto.randomUUID().slice(0, 9)}`;
  }

  /**
   * Generate idempotency key
   */
  private generateIdempotencyKey(data: Record<string, unknown>): string {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256");
    hash.update(JSON.stringify(data) + Date.now().toString().slice(0, -4)); // 10-second window
    return hash.digest("hex").substring(0, 32);
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    this.stopProcessing();
    await this.redis.quit();
  }
}

// Singleton instance
let messageQueueInstance: MessageQueueService | null = null;

export function getMessageQueue(): MessageQueueService {
  if (!messageQueueInstance) {
    messageQueueInstance = new MessageQueueService();
  }
  return messageQueueInstance;
}

export default MessageQueueService;
