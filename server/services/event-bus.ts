import { Kafka, Producer, Consumer, EachMessagePayload } from "kafkajs";
import { randomUUID } from "crypto";
import { db, getDb } from "../db.js";
import { sql } from "drizzle-orm";
import { logger } from '../logger.js';

// Use Node.js built-in crypto.randomUUID() instead of uuid package
const uuidv4 = () => randomUUID();

// Core Domain Events for the Platform
// These events enable loose coupling between services and support replay/analytics

export type EventType =
  // Farmer Events
  | "farmer.registered"
  | "farmer.updated"
  | "farmer.verified"
  | "farmer.deactivated"
  // Farm Events
  | "farm.created"
  | "farm.updated"
  | "farm.harvest_recorded"
  // Loan Events
  | "loan.application_submitted"
  | "loan.approved"
  | "loan.rejected"
  | "loan.disbursed"
  | "loan.repayment_received"
  | "loan.defaulted"
  | "loan.closed"
  // Marketplace Events
  | "marketplace.listing_created"
  | "marketplace.listing_updated"
  | "marketplace.order_placed"
  | "marketplace.order_paid"
  | "marketplace.order_shipped"
  | "marketplace.order_delivered"
  | "marketplace.order_cancelled"
  // Exchange Events
  | "exchange.trader_registered"
  | "exchange.order_placed"
  | "exchange.order_filled"
  | "exchange.order_partially_filled"
  | "exchange.order_cancelled"
  | "exchange.trade_executed"
  | "exchange.settlement_completed"
  // Payment Events
  | "payment.initiated"
  | "payment.completed"
  | "payment.failed"
  | "payment.refunded"
  // Notification Events
  | "notification.sms_sent"
  | "notification.email_sent"
  | "notification.push_sent"
  // System Events
  | "system.health_check"
  | "system.error";

export interface DomainEvent<T = any> {
  eventId: string;
  eventType: EventType;
  aggregateType: string;
  aggregateId: string;
  timestamp: Date;
  version: number;
  payload: T;
  metadata: {
    correlationId?: string;
    causationId?: string;
    userId?: number;
    source: string;
  };
}

// Outbox table for transactional outbox pattern
const OUTBOX_TABLE = "event_outbox";

class EventBus {
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private handlers: Map<EventType, Array<(event: DomainEvent) => Promise<void>>> = new Map();
  private isConnected = false;

  constructor() {
    const brokers = process.env.KAFKA_BROKERS?.split(",") || ["localhost:9093"];
    
    try {
      this.kafka = new Kafka({
        clientId: "farmer-platform",
        brokers,
        retry: {
          initialRetryTime: 100,
          retries: 8,
        },
      });
    } catch (error) {
      logger.warn("Kafka not configured, using in-memory event handling");
    }
  }

  async connect(): Promise<void> {
    if (!this.kafka) {
      logger.info("EventBus: Running in local mode (no Kafka)");
      return;
    }

    try {
      this.producer = this.kafka.producer();
      await this.producer.connect();
      this.isConnected = true;
      logger.info("EventBus: Connected to Kafka");
    } catch (error) {
      logger.warn("EventBus: Failed to connect to Kafka, using local mode", error);
      this.isConnected = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
    }
    for (const consumer of Array.from(this.consumers.values())) {
      await consumer.disconnect();
    }
    this.isConnected = false;
  }

  // Publish event using transactional outbox pattern
  async publish<T>(
    eventType: EventType,
    aggregateType: string,
    aggregateId: string,
    payload: T,
    metadata: Partial<DomainEvent["metadata"]> = {}
  ): Promise<DomainEvent<T>> {
    const event: DomainEvent<T> = {
      eventId: uuidv4(),
      eventType,
      aggregateType,
      aggregateId,
      timestamp: new Date(),
      version: 1,
      payload,
      metadata: {
        source: "farmer-platform",
        ...metadata,
      },
    };

    // Store in outbox table for reliable delivery
    await this.storeInOutbox(event);

    // Try to publish immediately if Kafka is connected
    if (this.isConnected && this.producer) {
      try {
        await this.producer.send({
          topic: this.getTopicForEvent(eventType),
          messages: [
            {
              key: aggregateId,
              value: JSON.stringify(event),
              headers: {
                eventType,
                eventId: event.eventId,
                timestamp: event.timestamp.toISOString(),
              },
            },
          ],
        });

        // Mark as published in outbox
        await this.markAsPublished(event.eventId);
      } catch (error) {
        logger.error("Failed to publish event to Kafka:", error);
        // Event is still in outbox, will be retried by outbox processor
      }
    }

    // Also dispatch to local handlers
    await this.dispatchLocally(event);

    return event;
  }

  // Store event in outbox table
  private async storeInOutbox(event: DomainEvent): Promise<void> {
    try {
      await db!.execute(sql`
        INSERT INTO ${sql.raw(OUTBOX_TABLE)} (
          event_id, event_type, aggregate_type, aggregate_id,
          payload, metadata, created_at, published_at
        ) VALUES (
          ${event.eventId},
          ${event.eventType},
          ${event.aggregateType},
          ${event.aggregateId},
          ${JSON.stringify(event.payload)}::jsonb,
          ${JSON.stringify(event.metadata)}::jsonb,
          ${event.timestamp},
          NULL
        )
        ON CONFLICT (event_id) DO NOTHING
      `);
    } catch (error) {
      // Table might not exist yet, log and continue
      logger.warn("Failed to store event in outbox:", error);
    }
  }

  // Mark event as published
  private async markAsPublished(eventId: string): Promise<void> {
    try {
      await db!.execute(sql`
        UPDATE ${sql.raw(OUTBOX_TABLE)}
        SET published_at = NOW()
        WHERE event_id = ${eventId}
      `);
    } catch (error) {
      logger.warn("Failed to mark event as published:", error);
    }
  }

  // Get topic name for event type
  private getTopicForEvent(eventType: EventType): string {
    const [domain] = eventType.split(".");
    return `farmer-platform.${domain}`;
  }

  // Register event handler
  on(eventType: EventType, handler: (event: DomainEvent) => Promise<void>): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  // Dispatch event to local handlers
  private async dispatchLocally(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) || [];
    
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        logger.error(`Handler failed for event ${event.eventType}:`, error);
      }
    }
  }

  // Subscribe to events from Kafka
  async subscribe(groupId: string, topics: string[]): Promise<void> {
    if (!this.kafka) {
      logger.info("EventBus: Kafka not available, skipping subscription");
      return;
    }

    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    
    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }

    await consumer.run({
      eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
        try {
          const event: DomainEvent = JSON.parse(message.value?.toString() || "{}");
          await this.dispatchLocally(event);
        } catch (error) {
          logger.error("Failed to process message:", error);
        }
      },
    });

    this.consumers.set(groupId, consumer);
  }

  // Process unpublished events from outbox (called by cron job)
  async processOutbox(): Promise<number> {
    if (!this.isConnected || !this.producer) {
      return 0;
    }

    try {
      const result = await db!.execute(sql`
        SELECT * FROM ${sql.raw(OUTBOX_TABLE)}
        WHERE published_at IS NULL
        ORDER BY created_at ASC
        LIMIT 100
      `);

      const events = result.rows as any[];
      let published = 0;

      for (const row of events) {
        try {
          const event: DomainEvent = {
            eventId: row.event_id,
            eventType: row.event_type,
            aggregateType: row.aggregate_type,
            aggregateId: row.aggregate_id,
            timestamp: new Date(row.created_at),
            version: 1,
            payload: row.payload,
            metadata: row.metadata,
          };

          await this.producer.send({
            topic: this.getTopicForEvent(event.eventType),
            messages: [
              {
                key: event.aggregateId,
                value: JSON.stringify(event),
              },
            ],
          });

          await this.markAsPublished(event.eventId);
          published++;
        } catch (error) {
          logger.error(`Failed to publish event ${row.event_id}:`, error);
        }
      }

      return published;
    } catch (error) {
      logger.warn("Failed to process outbox:", error);
      return 0;
    }
  }
}

// Singleton instance
export const eventBus = new EventBus();

// Helper functions for common events
export const publishFarmerRegistered = (farmerId: number, data: Record<string, unknown>, userId?: number) =>
  eventBus.publish("farmer.registered", "farmer", String(farmerId), data, { userId });

export const publishLoanApproved = (loanId: number, data: Record<string, unknown>, userId?: number) =>
  eventBus.publish("loan.approved", "loan", String(loanId), data, { userId });

export const publishLoanDisbursed = (loanId: number, data: Record<string, unknown>, userId?: number) =>
  eventBus.publish("loan.disbursed", "loan", String(loanId), data, { userId });

export const publishTradeExecuted = (tradeId: number, data: Record<string, unknown>, userId?: number) =>
  eventBus.publish("exchange.trade_executed", "trade", String(tradeId), data, { userId });

export const publishPaymentCompleted = (paymentId: string, data: Record<string, unknown>, userId?: number) =>
  eventBus.publish("payment.completed", "payment", paymentId, data, { userId });

export const publishOrderPlaced = (orderId: number, data: Record<string, unknown>, userId?: number) =>
  eventBus.publish("marketplace.order_placed", "order", String(orderId), data, { userId });
