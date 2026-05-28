import crypto from "crypto";
import { Kafka, Producer, Consumer, Admin, logLevel } from 'kafkajs';
import { logger } from './logger.js';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9093').split(',');
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'farmer-app';
let _kafkaUnavailable = false;
let _lastKafkaAttempt = 0;
const KAFKA_RETRY_INTERVAL_MS = 30_000;

// Create Kafka instance
export const kafka = new Kafka({
  clientId: KAFKA_CLIENT_ID,
  brokers: KAFKA_BROKERS,
  logLevel: logLevel.INFO,
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
});

// Topic names
export const TOPICS = {
  // Data change events
  FARMER_EVENTS: 'farmer.events',
  FARM_EVENTS: 'farm.events',
  CROP_EVENTS: 'crop.events',
  LIVESTOCK_EVENTS: 'livestock.events',
  HARVEST_EVENTS: 'harvest.events',
  EXPENSE_EVENTS: 'expense.events',
  
  // Authentication events
  AUTH_EVENTS: 'auth.events',
  
  // System events
  CACHE_INVALIDATION: 'cache.invalidation',
  AUDIT_TRAIL: 'audit.trail',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  
  // Financial/Payment events (Mojaloop & TigerBeetle)
  MOJALOOP_TRANSFERS: 'mojaloop.transfers',
  MOJALOOP_QUOTES: 'mojaloop.quotes',
  MOJALOOP_PARTIES: 'mojaloop.parties',
  MOJALOOP_SETTLEMENTS: 'mojaloop.settlements',
  TIGERBEETLE_LEDGER: 'tigerbeetle.ledger',
  TIGERBEETLE_ACCOUNTS: 'tigerbeetle.accounts',
  LOAN_DISBURSEMENTS: 'loan.disbursements',
  LOAN_REPAYMENTS: 'loan.repayments',
  PAYMENT_EVENTS: 'payment.events',
} as const;

// Event types
export const EVENT_TYPES = {
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
  DELETED: 'DELETED',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  REGISTER: 'REGISTER',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  // Financial event types
  TRANSFER_INITIATED: 'TRANSFER_INITIATED',
  TRANSFER_COMPLETED: 'TRANSFER_COMPLETED',
  TRANSFER_FAILED: 'TRANSFER_FAILED',
  QUOTE_REQUESTED: 'QUOTE_REQUESTED',
  QUOTE_RECEIVED: 'QUOTE_RECEIVED',
  PARTY_LOOKUP: 'PARTY_LOOKUP',
  SETTLEMENT_CREATED: 'SETTLEMENT_CREATED',
  SETTLEMENT_CLOSED: 'SETTLEMENT_CLOSED',
  LEDGER_ENTRY_POSTED: 'LEDGER_ENTRY_POSTED',
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  DISBURSEMENT_INITIATED: 'DISBURSEMENT_INITIATED',
  DISBURSEMENT_COMPLETED: 'DISBURSEMENT_COMPLETED',
  DISBURSEMENT_FAILED: 'DISBURSEMENT_FAILED',
  REPAYMENT_RECEIVED: 'REPAYMENT_RECEIVED',
  REPAYMENT_PROCESSED: 'REPAYMENT_PROCESSED',
} as const;

// Event interface
export interface KafkaEvent<T = any> {
  eventId: string;
  eventType: string;
  entityType: string;
  entityId: string | number;
  userId: string | number;
  timestamp: string;
  data: T;
  metadata?: Record<string, unknown>;
}

// Producer singleton
let producerInstance: Producer | null = null;
let producerConnected = false;

export async function getProducer(): Promise<Producer | null> {
  if (_kafkaUnavailable && Date.now() - _lastKafkaAttempt < KAFKA_RETRY_INTERVAL_MS) return null;

  if (!producerInstance) {
    producerInstance = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
      idempotent: true,
    });
  }

  if (!producerConnected) {
    try {
      _lastKafkaAttempt = Date.now();
      await producerInstance.connect();
      producerConnected = true;
      _kafkaUnavailable = false;
      logger.info('[Kafka] Producer connected');
    } catch (error) {
      _kafkaUnavailable = true;
      logger.warn('[Kafka] Producer connection failed — degraded mode', { error: (error as Error).message });
      return null;
    }
  }

  return producerInstance;
}

export function isKafkaHealthy(): boolean {
  return producerConnected && !_kafkaUnavailable;
}

// Consumer factory with configurable retry
export async function createConsumer(groupId: string): Promise<Consumer> {
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
    retry: { initialRetryTime: 200, retries: 5 },
  });

  await consumer.connect();
  logger.info(`[Kafka] Consumer connected: ${groupId}`);

  return consumer;
}

// Admin client for topic management
let adminInstance: Admin | null = null;

export async function getAdmin(): Promise<Admin | null> {
  try {
    if (!adminInstance) {
      adminInstance = kafka.admin();
      await adminInstance.connect();
      logger.info('[Kafka] Admin client connected');
    }
    return adminInstance;
  } catch (error) {
    logger.warn('[Kafka] Admin client failed', { error: (error as Error).message });
    return null;
  }
}

// Publish event helper
export async function publishEvent<T = unknown>(
  topic: string,
  event: KafkaEvent<T>
): Promise<void> {
  try {
    const producer = await getProducer();
    if (!producer) return; // graceful degradation

    await producer.send({
      topic,
      messages: [
        {
          key: `${event.entityType}:${event.entityId}`,
          value: JSON.stringify(event),
          timestamp: new Date(event.timestamp).getTime().toString(),
          headers: {
            eventType: event.eventType,
            entityType: event.entityType,
            userId: event.userId.toString(),
          },
        },
      ],
    });

    logger.debug('[Kafka] Event published', { topic, eventType: event.eventType, entityType: event.entityType });
  } catch (error) {
    logger.error('[Kafka] Failed to publish event', { topic, error: (error as Error).message });
    // Publish to DLQ
    await publishToDlq(topic, event, error as Error);
  }
}

/**
 * Dead-letter queue: re-publish failed messages to a .dlq topic.
 */
async function publishToDlq<T = unknown>(originalTopic: string, event: KafkaEvent<T>, err: Error): Promise<void> {
  try {
    const producer = await getProducer();
    if (!producer) return;
    await producer.send({
      topic: `${originalTopic}.dlq`,
      messages: [
        {
          key: `${event.entityType}:${event.entityId}`,
          value: JSON.stringify({ originalTopic, event, error: err.message, timestamp: new Date().toISOString() }),
        },
      ],
    });
    logger.warn('[Kafka] Event sent to DLQ', { dlqTopic: `${originalTopic}.dlq`, eventId: event.eventId });
  } catch (err) {
    // DLQ publish also failed — nothing more we can do
  }
}

// Create event helper
export function createEvent<T = unknown>(
  eventType: string,
  entityType: string,
  entityId: string | number,
  userId: string | number,
  data: T,
  metadata?: Record<string, unknown>
): KafkaEvent<T> {
  return {
    eventId: `${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
    eventType,
    entityType,
    entityId,
    userId,
    timestamp: new Date().toISOString(),
    data,
    metadata,
  };
}

export async function initializeTopics(): Promise<void> {
  try {
    const admin = await getAdmin();
    if (!admin) return;

    const existingTopics = await admin.listTopics();
    const topicsToCreate = Object.values(TOPICS).filter(
      topic => !existingTopics.includes(topic)
    );

    if (topicsToCreate.length > 0) {
      await admin.createTopics({
        topics: topicsToCreate.map(topic => ({
          topic,
          numPartitions: 3,
          replicationFactor: 1,
          configEntries: [
            { name: 'retention.ms', value: '604800000' },
            { name: 'compression.type', value: 'snappy' },
          ],
        })),
      });
      logger.info('[Kafka] Created topics', { topics: topicsToCreate });
    }
  } catch (error) {
    logger.error('[Kafka] Failed to initialize topics', { error: (error as Error).message });
  }
}

export async function disconnectKafka(): Promise<void> {
  try {
    if (producerInstance && producerConnected) {
      await producerInstance.disconnect();
      producerConnected = false;
      logger.info('[Kafka] Producer disconnected');
    }
    if (adminInstance) {
      await adminInstance.disconnect();
      adminInstance = null;
      logger.info('[Kafka] Admin client disconnected');
    }
  } catch (error) {
    logger.error('[Kafka] Error during disconnect', { error: (error as Error).message });
  }
}
