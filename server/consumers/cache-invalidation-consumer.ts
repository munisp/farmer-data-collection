import { createConsumer, TOPICS } from '../kafka.js';
import { getRedisClient } from '../redis.js';

/**
 * Cache Invalidation Consumer
 * 
 * Listens to cache.invalidation topic and automatically clears Redis cache
 * when data changes occur
 */

export async function startCacheInvalidationConsumer() {
  // Redis connection will be attempted when needed

  console.log('[CacheInvalidationConsumer] Starting...');

  try {
    const consumer = await createConsumer('cache-invalidation-group');
    
    await consumer.subscribe({
      topic: TOPICS.CACHE_INVALIDATION,
      fromBeginning: false, // Only process new messages
    });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event = JSON.parse(message.value?.toString() || '{}');
          
          // Extract cache keys from event
          const cacheKeys = (event as any).cacheKeys || [];
          
          if (cacheKeys.length === 0) {
            console.log(`[CacheInvalidationConsumer] No cache keys in event ${event.eventId}`);
            return;
          }

          // Delete cache keys
          const redis = getRedisClient();
          if (!redis) return;
          const deletedCount = await redis.del(...cacheKeys);
          
          console.log(
            `[CacheInvalidationConsumer] Invalidated ${deletedCount} cache keys:`,
            cacheKeys.join(', ')
          );

          // Metrics updated via Prometheus
        } catch (error) {
          console.error('[CacheInvalidationConsumer] Error processing message:', error);
          // Don't throw - we don't want to stop the consumer on individual message errors
        }
      },
    });

    console.log('[CacheInvalidationConsumer] Started successfully');
    return consumer;
  } catch (error) {
    console.error('[CacheInvalidationConsumer] Failed to start:', error);
    throw error;
  }
}
