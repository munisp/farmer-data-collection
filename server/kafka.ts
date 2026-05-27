import { Kafka, Producer, Consumer, Admin, logLevel } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9093').split(',');
const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'farmer-app';

console.log('[Kafka] Initializing Kafka client...');
console.log(`  Brokers: ${KAFKA_BROKERS.join(', ')}`);
console.log(`  Client ID: ${KAFKA_CLIENT_ID}`);

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
  metadata?: Record<string, any>;
}

// Producer singleton
let producerInstance: Producer | null = null;
let producerConnected = false;

export async function getProducer(): Promise<Producer> {
  if (!producerInstance) {
    producerInstance = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
  }

  if (!producerConnected) {
    try {
      await producerInstance.connect();
      producerConnected = true;
      console.log('[Kafka] Producer connected successfully');
    } catch (error) {
      console.error('[Kafka] Failed to connect producer:', error);
      throw error;
    }
  }

  return producerInstance;
}

// Consumer factory
export async function createConsumer(groupId: string): Promise<Consumer> {
  const consumer = kafka.consumer({
    groupId,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  await consumer.connect();
  console.log(`[Kafka] Consumer connected: ${groupId}`);

  return consumer;
}

// Admin client for topic management
let adminInstance: Admin | null = null;

export async function getAdmin(): Promise<Admin> {
  if (!adminInstance) {
    adminInstance = kafka.admin();
    await adminInstance.connect();
    console.log('[Kafka] Admin client connected');
  }

  return adminInstance;
}

// Publish event helper
export async function publishEvent<T = any>(
  topic: string,
  event: KafkaEvent<T>
): Promise<void> {
  try {
    const producer = await getProducer();
    
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

    console.log(`[Kafka] Event published: ${topic} - ${event.eventType} - ${event.entityType}:${event.entityId}`);
  } catch (error) {
    console.error('[Kafka] Failed to publish event:', error);
    // Don't throw - we don't want to break the main flow if Kafka is down
  }
}

// Create event helper
export function createEvent<T = any>(
  eventType: string,
  entityType: string,
  entityId: string | number,
  userId: string | number,
  data: T,
  metadata?: Record<string, any>
): KafkaEvent<T> {
  return {
    eventId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    eventType,
    entityType,
    entityId,
    userId,
    timestamp: new Date().toISOString(),
    data,
    metadata,
  };
}

// Initialize topics
export async function initializeTopics(): Promise<void> {
  try {
    const admin = await getAdmin();
    
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
            { name: 'retention.ms', value: '604800000' }, // 7 days
            { name: 'compression.type', value: 'snappy' },
          ],
        })),
      });

      console.log(`[Kafka] Created topics: ${topicsToCreate.join(', ')}`);
    } else {
      console.log('[Kafka] All topics already exist');
    }
  } catch (error) {
    console.error('[Kafka] Failed to initialize topics:', error);
  }
}

// Graceful shutdown
export async function disconnectKafka(): Promise<void> {
  try {
    if (producerInstance && producerConnected) {
      await producerInstance.disconnect();
      producerConnected = false;
      console.log('[Kafka] Producer disconnected');
    }

    if (adminInstance) {
      await adminInstance.disconnect();
      adminInstance = null;
      console.log('[Kafka] Admin client disconnected');
    }
  } catch (error) {
    console.error('[Kafka] Error during disconnect:', error);
  }
}

// Handle process termination
process.on('SIGTERM', disconnectKafka);
process.on('SIGINT', disconnectKafka);

console.log('[Kafka] Client initialized');
