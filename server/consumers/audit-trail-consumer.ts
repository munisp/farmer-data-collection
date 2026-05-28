import { createConsumer, getProducer, TOPICS } from '../kafka.js';
import { getDb } from '../db.js';
import { auditLogs } from '../../drizzle/schema.js';
import { logger } from '../logger.js';

/**
 * Audit Trail Consumer
 * 
 * Listens to audit.trail topic and writes all events to audit_logs table
 * for compliance, debugging, and analytics
 */

export async function startAuditTrailConsumer() {
  logger.info('[AuditTrailConsumer] Starting...');

  try {
    const consumer = await createConsumer('audit-trail-group');
    const db = await getDb();
    
    await consumer.subscribe({
      topic: TOPICS.AUDIT_TRAIL,
      fromBeginning: false, // Only process new messages
    });

    // Batch processing for better performance
    const batchSize = 100;
    const batchTimeout = 5000; // 5 seconds
    let batch: any[] = [];
    let batchTimer: NodeJS.Timeout | null = null;

    const flushBatch = async () => {
      if (batch.length === 0) return;

      const currentBatch = [...batch];
      batch = [];

      try {
        if (db) {
          await db.insert(auditLogs).values(currentBatch);
          logger.info(`[AuditTrailConsumer] Wrote ${currentBatch.length} audit logs to database`);
        } else {
          logger.warn('[AuditTrailConsumer] Database not available, skipping batch');
        }
      } catch (error) {
        logger.error('[AuditTrailConsumer] Error writing batch:', error);
        
        // Implement dead letter queue for failed messages
        try {
          const producer = await getProducer();
          
          // Send each failed message to DLQ
          if (producer) for (const failedLog of currentBatch) {
            await producer.send({
              topic: 'audit-trail-dlq',
              messages: [
                {
                  key: failedLog.eventId,
                  value: JSON.stringify({
                    originalLog: failedLog,
                    error: error instanceof Error ? error.message : String(error),
                    failedAt: new Date().toISOString(),
                  }),
                },
              ],
            });
          }
          
          logger.info(`[AuditTrailConsumer] Sent ${currentBatch.length} failed messages to DLQ`);
        } catch (dlqError) {
          logger.error('[AuditTrailConsumer] Failed to send messages to DLQ:', dlqError);
          // Last resort: write to error log file
          logger.error('[AuditTrailConsumer] Failed batch data:', JSON.stringify(currentBatch));
        }
      }
    };

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event = JSON.parse(message.value?.toString() || '{}');
          
          // Prepare audit log entry
          const auditLog = {
            eventId: event.eventId,
            eventType: event.eventType,
            entityType: event.entityType,
            entityId: event.entityId.toString(),
            userId: parseInt(event.userId),
            timestamp: new Date(event.timestamp),
            data: event.data,
            metadata: event.metadata,
          };

          // Add to batch
          batch.push(auditLog);

          // Flush if batch is full
          if (batch.length >= batchSize) {
            if (batchTimer) {
              clearTimeout(batchTimer);
              batchTimer = null;
            }
            await flushBatch();
          } else {
            // Set timer to flush batch after timeout
            if (!batchTimer) {
              batchTimer = setTimeout(async () => {
                batchTimer = null;
                await flushBatch();
              }, batchTimeout);
            }
          }
        } catch (error) {
          logger.error('[AuditTrailConsumer] Error processing message:', error);
          // Don't throw - we don't want to stop the consumer on individual message errors
        }
      },
    });

    // Flush remaining batch on shutdown
    process.on('SIGTERM', async () => {
      logger.info('[AuditTrailConsumer] Flushing remaining batch on shutdown...');
      await flushBatch();
    });

    logger.info('[AuditTrailConsumer] Started successfully');
    return consumer;
  } catch (error) {
    logger.error('[AuditTrailConsumer] Failed to start:', error);
    throw error;
  }
}
