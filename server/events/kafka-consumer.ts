/**
 * Kafka Event Consumer Infrastructure
 * 
 * Provides base consumer functionality for processing domain events
 * from Kafka topics with error handling and retry logic.
 */

import { Kafka, Consumer, EachMessagePayload, KafkaMessage } from 'kafkajs';
import { logger } from '../logger.js';

// ============================================================================
// Types
// ============================================================================

export interface EventHandler<T = any> {
  handle(event: T): Promise<void>;
}

export interface ConsumerConfig {
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
}

export interface DomainEvent<T = any> {
  eventId: string;
  eventType: string;
  timestamp: string;
  userId?: number;
  data: T;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Kafka Consumer Manager
// ============================================================================

export class KafkaConsumerManager {
  private kafka: Kafka;
  private consumers: Map<string, Consumer> = new Map();
  private handlers: Map<string, EventHandler[]> = new Map();
  private isConnected: boolean = false;

  constructor(brokers: string[] = ['localhost:9092']) {
    this.kafka = new Kafka({
      clientId: 'farmer-data-collection',
      brokers,
      retry: {
        initialRetryTime: 300,
        retries: 8,
      },
    });
  }

  /**
   * Register an event handler for a specific event type
   */
  registerHandler(eventType: string, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
    logger.info(`[Kafka] Registered handler for event type: ${eventType}`);
  }

  /**
   * Create and start a consumer for specified topics
   */
  async createConsumer(config: ConsumerConfig): Promise<void> {
    const { groupId, topics, fromBeginning = false } = config;

    if (this.consumers.has(groupId)) {
      logger.info(`[Kafka] Consumer ${groupId} already exists`);
      return;
    }

    const consumer = this.kafka.consumer({ groupId });
    this.consumers.set(groupId, consumer);

    try {
      await consumer.connect();
      logger.info(`[Kafka] Consumer ${groupId} connected`);

      await consumer.subscribe({ topics, fromBeginning });
      logger.info(`[Kafka] Consumer ${groupId} subscribed to topics:`, topics);

      await consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.processMessage(payload);
        },
      });

      this.isConnected = true;
      logger.info(`[Kafka] Consumer ${groupId} started successfully`);
    } catch (error) {
      logger.error(`[Kafka] Error starting consumer ${groupId}:`, error);
      throw error;
    }
  }

  /**
   * Process incoming Kafka message
   */
  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;

    try {
      const event = this.parseMessage(message);
      
      logger.info(`[Kafka] Processing event: ${event.eventType} from topic: ${topic}`);

      const handlers = this.handlers.get(event.eventType) || [];
      
      if (handlers.length === 0) {
        logger.warn(`[Kafka] No handlers registered for event type: ${event.eventType}`);
        return;
      }

      // Execute all handlers for this event type
      await Promise.all(
        handlers.map(async (handler) => {
          try {
            await handler.handle(event);
            logger.info(`[Kafka] Successfully processed event: ${event.eventType}`);
          } catch (error) {
            logger.error(`[Kafka] Handler error for event ${event.eventType}:`, error);
            // Don't throw - allow other handlers to continue
          }
        })
      );
    } catch (error) {
      logger.error(`[Kafka] Error processing message from topic ${topic}:`, error);
      // In production, you might want to send to dead letter queue
    }
  }

  /**
   * Parse Kafka message into domain event
   */
  private parseMessage(message: KafkaMessage): DomainEvent {
    if (!message.value) {
      throw new Error('Message value is null');
    }

    const value = message.value.toString();
    return JSON.parse(value);
  }

  /**
   * Stop all consumers
   */
  async disconnect(): Promise<void> {
    logger.info('[Kafka] Disconnecting all consumers...');
    
    const entries = Array.from(this.consumers.entries());
    for (const [groupId, consumer] of entries) {
      try {
        await consumer.disconnect();
        logger.info(`[Kafka] Consumer ${groupId} disconnected`);
      } catch (error) {
        logger.error(`[Kafka] Error disconnecting consumer ${groupId}:`, error);
      }
    }

    this.consumers.clear();
    this.isConnected = false;
    logger.info('[Kafka] All consumers disconnected');
  }

  /**
   * Check if consumer manager is connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Get list of active consumers
   */
  getActiveConsumers(): string[] {
    return Array.from(this.consumers.keys());
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let consumerManager: KafkaConsumerManager | null = null;

export function getConsumerManager(): KafkaConsumerManager {
  if (!consumerManager) {
    const brokers = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];
    consumerManager = new KafkaConsumerManager(brokers);
  }
  return consumerManager;
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

process.on('SIGTERM', async () => {
  logger.info('[Kafka] SIGTERM received, shutting down consumers...');
  if (consumerManager) {
    await consumerManager.disconnect();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('[Kafka] SIGINT received, shutting down consumers...');
  if (consumerManager) {
    await consumerManager.disconnect();
  }
  process.exit(0);
});
