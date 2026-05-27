import { Consumer } from 'kafkajs';
import { createConsumer, TOPICS, KafkaEvent } from './kafka';
import { getDb } from './db';
import { auditLogs } from '../drizzle/schema.js';
import { eq } from 'drizzle-orm';

// Consumer instances
let cacheConsumer: Consumer | null = null;
let auditConsumer: Consumer | null = null;
let notificationConsumer: Consumer | null = null;

// Cache invalidation patterns
const CACHE_PATTERNS: Record<string, string[]> = {
  farmer: ['farmers:*', 'dashboard:*'],
  farm: ['farms:*', 'dashboard:*'],
  crop: ['crops:*', 'dashboard:*'],
  livestock: ['livestock:*', 'dashboard:*'],
  harvest: ['harvests:*', 'dashboard:*', 'analytics:*'],
  expense: ['expenses:*', 'dashboard:*', 'analytics:*'],
  farm_input: ['farm_inputs:*', 'dashboard:*'],
};

// Start cache invalidation consumer
export async function startCacheConsumer(): Promise<void> {
  try {
    cacheConsumer = await createConsumer('cache-invalidation-group');
    
    await cacheConsumer.subscribe({
      topics: [
        TOPICS.FARMER_EVENTS,
        TOPICS.FARM_EVENTS,
        TOPICS.CROP_EVENTS,
        TOPICS.LIVESTOCK_EVENTS,
        TOPICS.HARVEST_EVENTS,
        TOPICS.EXPENSE_EVENTS,
      ],
      fromBeginning: false,
    });

    await cacheConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event: KafkaEvent = JSON.parse(message.value?.toString() || '{}');
          
          console.log(`[Cache Consumer] Processing: ${event.entityType} ${event.eventType}`);
          
          // Get cache patterns for this entity type
          const patterns = CACHE_PATTERNS[event.entityType] || [];
          
          // In a real implementation, this would invalidate Redis/Memcached
          // For now, we just log the patterns that should be invalidated
          console.log(`[Cache Consumer] Would invalidate patterns:`, patterns);
          
          // Example: If using Redis
          // for (const pattern of patterns) {
          //   const keys = await redis.keys(pattern);
          //   if (keys.length > 0) {
          //     await redis.del(...keys);
          //   }
          // }
          
        } catch (error) {
          console.error('[Cache Consumer] Error processing message:', error);
        }
      },
    });

    console.log('[Cache Consumer] Started successfully');
  } catch (error) {
    console.error('[Cache Consumer] Failed to start:', error);
  }
}

// Start audit trail consumer
export async function startAuditConsumer(): Promise<void> {
  try {
    auditConsumer = await createConsumer('audit-trail-group');
    
    await auditConsumer.subscribe({
      topics: [
        TOPICS.FARMER_EVENTS,
        TOPICS.FARM_EVENTS,
        TOPICS.CROP_EVENTS,
        TOPICS.LIVESTOCK_EVENTS,
        TOPICS.HARVEST_EVENTS,
        TOPICS.EXPENSE_EVENTS,
        TOPICS.AUTH_EVENTS,
      ],
      fromBeginning: false,
    });

    await auditConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event: KafkaEvent = JSON.parse(message.value?.toString() || '{}');
          
          console.log(`[Audit Consumer] Logging: ${event.entityType} ${event.eventType}`);
          
          // Write to audit_logs table
          const db = await getDb();
          if (!db) {
            console.error('[Audit Consumer] Database not available');
            return;
          }
          
          await db.insert(auditLogs).values({
            eventId: event.eventId,
            eventType: event.eventType,
            entityType: event.entityType,
            entityId: event.entityId.toString(),
            userId: typeof event.userId === 'string' ? parseInt(event.userId) : event.userId,
            timestamp: new Date(event.timestamp),
            data: event.data,
            metadata: event.metadata || {},
          });
          
          console.log(`[Audit Consumer] Logged event: ${event.eventId}`);
          
        } catch (error) {
          console.error('[Audit Consumer] Error processing message:', error);
        }
      },
    });

    console.log('[Audit Consumer] Started successfully');
  } catch (error) {
    console.error('[Audit Consumer] Failed to start:', error);
  }
}

// Start notification consumer
export async function startNotificationConsumer(): Promise<void> {
  try {
    notificationConsumer = await createConsumer('notification-group');
    
    await notificationConsumer.subscribe({
      topics: [TOPICS.NOTIFICATIONS],
      fromBeginning: false,
    });

    await notificationConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event: KafkaEvent = JSON.parse(message.value?.toString() || '{}');
          
          console.log(`[Notification Consumer] Processing notification:`, event.data);
          
          // In a real implementation, this would:
          // 1. Send push notifications via Firebase/OneSignal
          // 2. Send emails via SendGrid/SES
          // 3. Send SMS via Twilio
          // 4. Store in-app notifications in database
          
          // For now, we just log
          console.log(`[Notification Consumer] Would send notification to user ${event.userId}`);
          
        } catch (error) {
          console.error('[Notification Consumer] Error processing message:', error);
        }
      },
    });

    console.log('[Notification Consumer] Started successfully');
  } catch (error) {
    console.error('[Notification Consumer] Failed to start:', error);
  }
}

// Start all consumers
export async function startAllConsumers(): Promise<void> {
  console.log('[Kafka Consumers] Starting all consumers...');
  
  await Promise.all([
    startCacheConsumer(),
    startAuditConsumer(),
    startNotificationConsumer(),
  ]);
  
  console.log('[Kafka Consumers] All consumers started');
}

// Stop all consumers
export async function stopAllConsumers(): Promise<void> {
  console.log('[Kafka Consumers] Stopping all consumers...');
  
  const disconnectPromises: Promise<void>[] = [];
  
  if (cacheConsumer) {
    disconnectPromises.push(cacheConsumer.disconnect());
  }
  
  if (auditConsumer) {
    disconnectPromises.push(auditConsumer.disconnect());
  }
  
  if (notificationConsumer) {
    disconnectPromises.push(notificationConsumer.disconnect());
  }
  
  await Promise.all(disconnectPromises);
  
  cacheConsumer = null;
  auditConsumer = null;
  notificationConsumer = null;
  
  console.log('[Kafka Consumers] All consumers stopped');
}

// Handle process termination
process.on('SIGTERM', stopAllConsumers);
process.on('SIGINT', stopAllConsumers);
