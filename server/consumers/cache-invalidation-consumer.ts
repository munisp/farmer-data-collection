import { createConsumer, TOPICS } from '../kafka.js';
import { getRedisClient } from '../redis.js';
import { cacheInvalidateByPrefix, cacheInvalidateEntity } from '../cache/cache-layer.js';
import { logger } from '../logger.js';

/**
 * Cache Invalidation Consumer
 * 
 * Listens to cache.invalidation topic and clears both L1 (in-memory LRU)
 * and L2 (Redis) cache when data changes occur across processes.
 */

export async function startCacheInvalidationConsumer() {
  logger.info('[CacheInvalidationConsumer] Starting...');

  try {
    const consumer = await createConsumer('cache-invalidation-group');
    
    await consumer.subscribe({
      topic: TOPICS.CACHE_INVALIDATION,
      fromBeginning: false,
    });

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const event = JSON.parse(message.value?.toString() || '{}');
          const { data } = event;

          if (!data) {
            logger.debug('[CacheInvalidationConsumer] No data in event', { eventId: event.eventId });
            return;
          }

          const { entityType, entityId, cacheKeys = [] } = data;

          // Invalidate multi-tier cache (L1 + L2)
          if (entityType) {
            await cacheInvalidateEntity(entityType, entityId);
          }

          // Also invalidate any explicit cache key patterns from the event
          if (cacheKeys.length > 0) {
            const redis = getRedisClient();
            if (redis) {
              for (const pattern of cacheKeys) {
                if (pattern.endsWith('*')) {
                  const prefix = pattern.replace('cache:', '').replace('*', '');
                  await cacheInvalidateByPrefix(prefix);
                } else {
                  await redis.del(pattern);
                }
              }
            }
          }

          logger.debug('[CacheInvalidationConsumer] Processed', {
            eventId: event.eventId,
            entityType,
            entityId,
            keysCount: cacheKeys.length,
          });
        } catch (error) {
          logger.error('[CacheInvalidationConsumer] Error processing message', {
            error: (error as Error).message,
          });
        }
      },
    });

    logger.info('[CacheInvalidationConsumer] Started successfully');
    return consumer;
  } catch (error) {
    logger.error('[CacheInvalidationConsumer] Failed to start', {
      error: (error as Error).message,
    });
    throw error;
  }
}
