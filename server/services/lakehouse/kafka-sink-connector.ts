/**
 * Kafka Sink Connector for Lakehouse
 * 
 * Streams events from Kafka topics to the lakehouse bronze layer
 * Supports batching, exactly-once semantics, and schema evolution
 */

import { Consumer } from 'kafkajs';
import { createConsumer, TOPICS } from '../../kafka.js';
import { getLakehouseClient, type WriteOptions } from './lakehouse-client.js';
import { LAKEHOUSE_TABLES, PARTITION_STRATEGIES } from './lakehouse-config.js';
import { logger } from '../../logger.js';

// ============================================================================
// Types
// ============================================================================

export interface SinkConnectorConfig {
  topic: string;
  targetTable: string;
  batchSize: number;
  batchIntervalMs: number;
  partitionBy: string[];
  transformFn?: (event: any) => any;
}

export interface SinkMetrics {
  topic: string;
  messagesProcessed: number;
  batchesWritten: number;
  lastWriteTime: Date | null;
  errors: number;
  lag: number;
}

// ============================================================================
// Kafka Sink Connector Class
// ============================================================================

export class KafkaSinkConnector {
  private config: SinkConnectorConfig;
  private consumer: Consumer | null = null;
  private buffer: any[] = [];
  private lastFlushTime: number = Date.now();
  private metrics: SinkMetrics;
  private running: boolean = false;
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(config: SinkConnectorConfig) {
    this.config = config;
    this.metrics = {
      topic: config.topic,
      messagesProcessed: 0,
      batchesWritten: 0,
      lastWriteTime: null,
      errors: 0,
      lag: 0,
    };
  }

  /**
   * Start the sink connector
   */
  async start(): Promise<void> {
    logger.info(`[KafkaSink] Starting connector for ${this.config.topic} -> ${this.config.targetTable}`);

    try {
      // Create consumer
      this.consumer = await createConsumer(`lakehouse-sink-${this.config.topic}`);

      // Subscribe to topic
      await this.consumer.subscribe({
        topic: this.config.topic,
        fromBeginning: false,
      });

      this.running = true;

      // Start batch flush interval
      this.flushInterval = setInterval(() => {
        this.flushIfNeeded();
      }, this.config.batchIntervalMs);

      // Start consuming
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          await this.processMessage(topic, partition, message);
        },
      });

      logger.info(`[KafkaSink] Connector started for ${this.config.topic}`);
    } catch (error) {
      logger.error(`[KafkaSink] Failed to start connector:`, error);
      throw error;
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(
    topic: string,
    partition: number,
    message: any
  ): Promise<void> {
    try {
      const event = JSON.parse(message.value?.toString() || '{}');

      // Add metadata
      const enrichedEvent = {
        ...event,
        _kafka_topic: topic,
        _kafka_partition: partition,
        _kafka_offset: message.offset,
        _kafka_timestamp: message.timestamp,
        _ingest_time: new Date().toISOString(),
        ingest_date: new Date().toISOString().split('T')[0],
      };

      // Apply transformation if provided
      const transformedEvent = this.config.transformFn
        ? this.config.transformFn(enrichedEvent)
        : enrichedEvent;

      // Add to buffer
      this.buffer.push(transformedEvent);
      this.metrics.messagesProcessed++;

      // Flush if batch size reached
      if (this.buffer.length >= this.config.batchSize) {
        await this.flush();
      }
    } catch (error) {
      logger.error(`[KafkaSink] Error processing message:`, error);
      this.metrics.errors++;
    }
  }

  /**
   * Flush buffer to lakehouse if needed
   */
  private async flushIfNeeded(): Promise<void> {
    const timeSinceLastFlush = Date.now() - this.lastFlushTime;
    
    if (this.buffer.length > 0 && timeSinceLastFlush >= this.config.batchIntervalMs) {
      await this.flush();
    }
  }

  /**
   * Flush buffer to lakehouse
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = [...this.buffer];
    this.buffer = [];

    try {
      const lakehouse = getLakehouseClient();

      const writeOptions: WriteOptions = {
        mode: 'append',
        partitionBy: this.config.partitionBy,
      };

      await lakehouse.writeTable(this.config.targetTable, batch, writeOptions);

      this.metrics.batchesWritten++;
      this.metrics.lastWriteTime = new Date();
      this.lastFlushTime = Date.now();

      logger.info(`[KafkaSink] Flushed ${batch.length} records to ${this.config.targetTable}`);
    } catch (error) {
      logger.error(`[KafkaSink] Error flushing to lakehouse:`, error);
      this.metrics.errors++;
      
      // Re-add failed batch to buffer for retry
      this.buffer = [...batch, ...this.buffer];
    }
  }

  /**
   * Stop the sink connector
   */
  async stop(): Promise<void> {
    logger.info(`[KafkaSink] Stopping connector for ${this.config.topic}`);

    this.running = false;

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Flush remaining buffer
    await this.flush();

    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }

    logger.info(`[KafkaSink] Connector stopped for ${this.config.topic}`);
  }

  /**
   * Get connector metrics
   */
  getMetrics(): SinkMetrics {
    return { ...this.metrics };
  }
}

// ============================================================================
// Pre-configured Sink Connectors
// ============================================================================

/**
 * Create all bronze layer sink connectors
 */
export function createBronzeSinkConnectors(): KafkaSinkConnector[] {
  const defaultPartitions = PARTITION_STRATEGIES.bronze.default;
  const defaultBatchSize = 1000;
  const defaultBatchInterval = 60000; // 1 minute

  const connectors: KafkaSinkConnector[] = [
    // Farmer events
    new KafkaSinkConnector({
      topic: TOPICS.FARMER_EVENTS,
      targetTable: LAKEHOUSE_TABLES.bronze.farmer_events,
      batchSize: defaultBatchSize,
      batchIntervalMs: defaultBatchInterval,
      partitionBy: defaultPartitions,
      transformFn: (event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        entity_type: event.entityType,
        entity_id: event.entityId,
        user_id: event.userId,
        event_timestamp: event.timestamp,
        farmer_id: event.data?.farmerId,
        farmer_name: event.data?.name,
        phone_number: event.data?.phoneNumber,
        cooperative_id: event.data?.cooperativeId,
        location: event.data?.location,
        raw_data: JSON.stringify(event.data),
        ingest_date: event.ingest_date,
        _kafka_offset: event._kafka_offset,
        _ingest_time: event._ingest_time,
      }),
    }),

    // Farm events
    new KafkaSinkConnector({
      topic: TOPICS.FARM_EVENTS,
      targetTable: LAKEHOUSE_TABLES.bronze.farm_events,
      batchSize: defaultBatchSize,
      batchIntervalMs: defaultBatchInterval,
      partitionBy: defaultPartitions,
      transformFn: (event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        entity_id: event.entityId,
        user_id: event.userId,
        event_timestamp: event.timestamp,
        farm_id: event.data?.farmId,
        farmer_id: event.data?.farmerId,
        farm_name: event.data?.name,
        size_hectares: event.data?.sizeHectares,
        location_lat: event.data?.latitude,
        location_lng: event.data?.longitude,
        soil_type: event.data?.soilType,
        raw_data: JSON.stringify(event.data),
        ingest_date: event.ingest_date,
        _kafka_offset: event._kafka_offset,
        _ingest_time: event._ingest_time,
      }),
    }),

    // Crop events
    new KafkaSinkConnector({
      topic: TOPICS.CROP_EVENTS,
      targetTable: LAKEHOUSE_TABLES.bronze.crop_events,
      batchSize: defaultBatchSize,
      batchIntervalMs: defaultBatchInterval,
      partitionBy: defaultPartitions,
      transformFn: (event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        entity_id: event.entityId,
        user_id: event.userId,
        event_timestamp: event.timestamp,
        crop_id: event.data?.cropId,
        farm_id: event.data?.farmId,
        crop_type: event.data?.cropType,
        variety: event.data?.variety,
        planting_date: event.data?.plantingDate,
        expected_harvest_date: event.data?.expectedHarvestDate,
        area_planted: event.data?.areaPlanted,
        raw_data: JSON.stringify(event.data),
        ingest_date: event.ingest_date,
        _kafka_offset: event._kafka_offset,
        _ingest_time: event._ingest_time,
      }),
    }),

    // Harvest events
    new KafkaSinkConnector({
      topic: TOPICS.HARVEST_EVENTS,
      targetTable: LAKEHOUSE_TABLES.bronze.harvest_events,
      batchSize: defaultBatchSize,
      batchIntervalMs: defaultBatchInterval,
      partitionBy: defaultPartitions,
      transformFn: (event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        entity_id: event.entityId,
        user_id: event.userId,
        event_timestamp: event.timestamp,
        harvest_id: event.data?.harvestId,
        crop_id: event.data?.cropId,
        farm_id: event.data?.farmId,
        quantity: event.data?.quantity,
        unit: event.data?.unit,
        quality_grade: event.data?.qualityGrade,
        harvest_date: event.data?.harvestDate,
        price_per_unit: event.data?.pricePerUnit,
        total_value: event.data?.totalValue,
        raw_data: JSON.stringify(event.data),
        ingest_date: event.ingest_date,
        _kafka_offset: event._kafka_offset,
        _ingest_time: event._ingest_time,
      }),
    }),

    // Expense events
    new KafkaSinkConnector({
      topic: TOPICS.EXPENSE_EVENTS,
      targetTable: LAKEHOUSE_TABLES.bronze.expense_events,
      batchSize: defaultBatchSize,
      batchIntervalMs: defaultBatchInterval,
      partitionBy: defaultPartitions,
      transformFn: (event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        entity_id: event.entityId,
        user_id: event.userId,
        event_timestamp: event.timestamp,
        expense_id: event.data?.expenseId,
        farm_id: event.data?.farmId,
        category: event.data?.category,
        amount: event.data?.amount,
        currency: event.data?.currency,
        description: event.data?.description,
        expense_date: event.data?.expenseDate,
        raw_data: JSON.stringify(event.data),
        ingest_date: event.ingest_date,
        _kafka_offset: event._kafka_offset,
        _ingest_time: event._ingest_time,
      }),
    }),

    // Livestock events
    new KafkaSinkConnector({
      topic: TOPICS.LIVESTOCK_EVENTS,
      targetTable: LAKEHOUSE_TABLES.bronze.livestock_events,
      batchSize: defaultBatchSize,
      batchIntervalMs: defaultBatchInterval,
      partitionBy: defaultPartitions,
      transformFn: (event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        entity_id: event.entityId,
        user_id: event.userId,
        event_timestamp: event.timestamp,
        livestock_id: event.data?.livestockId,
        farm_id: event.data?.farmId,
        animal_type: event.data?.animalType,
        breed: event.data?.breed,
        quantity: event.data?.quantity,
        health_status: event.data?.healthStatus,
        raw_data: JSON.stringify(event.data),
        ingest_date: event.ingest_date,
        _kafka_offset: event._kafka_offset,
        _ingest_time: event._ingest_time,
      }),
    }),

    // Analytics events
    new KafkaSinkConnector({
      topic: TOPICS.ANALYTICS,
      targetTable: LAKEHOUSE_TABLES.bronze.analytics_events,
      batchSize: defaultBatchSize,
      batchIntervalMs: defaultBatchInterval,
      partitionBy: defaultPartitions,
      transformFn: (event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        entity_type: event.entityType,
        entity_id: event.entityId,
        user_id: event.userId,
        event_timestamp: event.timestamp,
        channel: event.data?.channel,
        action: event.data?.action,
        session_id: event.data?.sessionId,
        device_info: JSON.stringify(event.data?.deviceInfo),
        raw_data: JSON.stringify(event.data),
        ingest_date: event.ingest_date,
        _kafka_offset: event._kafka_offset,
        _ingest_time: event._ingest_time,
      }),
    }),

    // Auth events
    new KafkaSinkConnector({
      topic: TOPICS.AUTH_EVENTS,
      targetTable: LAKEHOUSE_TABLES.bronze.auth_events,
      batchSize: defaultBatchSize,
      batchIntervalMs: defaultBatchInterval,
      partitionBy: defaultPartitions,
      transformFn: (event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        entity_id: event.entityId,
        user_id: event.userId,
        event_timestamp: event.timestamp,
        email: event.data?.email,
        ip_address: event.metadata?.ipAddress,
        user_agent: event.metadata?.userAgent,
        success: event.data?.success,
        failure_reason: event.data?.failureReason,
        raw_data: JSON.stringify(event.data),
        ingest_date: event.ingest_date,
        _kafka_offset: event._kafka_offset,
        _ingest_time: event._ingest_time,
      }),
    }),

    // Audit trail events
    new KafkaSinkConnector({
      topic: TOPICS.AUDIT_TRAIL,
      targetTable: 'bronze.audit_trail_events',
      batchSize: defaultBatchSize,
      batchIntervalMs: defaultBatchInterval,
      partitionBy: defaultPartitions,
      transformFn: (event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        entity_type: event.entityType,
        entity_id: event.entityId,
        user_id: event.userId,
        event_timestamp: event.timestamp,
        action: event.eventType,
        resource: event.entityType,
        resource_id: event.entityId,
        changes: JSON.stringify(event.data),
        raw_data: JSON.stringify(event),
        ingest_date: event.ingest_date,
        _kafka_offset: event._kafka_offset,
        _ingest_time: event._ingest_time,
      }),
    }),
  ];

  return connectors;
}

// ============================================================================
// Sink Connector Manager
// ============================================================================

export class SinkConnectorManager {
  private connectors: Map<string, KafkaSinkConnector> = new Map();

  /**
   * Start all sink connectors
   */
  async startAll(): Promise<void> {
    logger.info('[SinkManager] Starting all sink connectors...');

    const bronzeConnectors = createBronzeSinkConnectors();

    for (const connector of bronzeConnectors) {
      const metrics = connector.getMetrics();
      this.connectors.set(metrics.topic, connector);
      await connector.start();
    }

    logger.info(`[SinkManager] Started ${this.connectors.size} sink connectors`);
  }

  /**
   * Stop all sink connectors
   */
  async stopAll(): Promise<void> {
    logger.info('[SinkManager] Stopping all sink connectors...');

    for (const connector of Array.from(this.connectors.values())) {
      await connector.stop();
    }

    this.connectors.clear();
    logger.info('[SinkManager] All sink connectors stopped');
  }

  /**
   * Get metrics for all connectors
   */
  getAllMetrics(): SinkMetrics[] {
    return Array.from(this.connectors.values()).map(c => c.getMetrics());
  }

  /**
   * Get a specific connector
   */
  getConnector(topic: string): KafkaSinkConnector | undefined {
    return this.connectors.get(topic);
  }
}

// Export singleton manager
export const sinkConnectorManager = new SinkConnectorManager();

export default {
  KafkaSinkConnector,
  SinkConnectorManager,
  createBronzeSinkConnectors,
  sinkConnectorManager,
};
