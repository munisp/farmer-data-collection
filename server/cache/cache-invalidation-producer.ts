/**
 * Cache Invalidation Producer
 * 
 * Publishes cache invalidation events to Kafka when data changes.
 * Also directly invalidates the local L1 + L2 cache for immediate consistency.
 */

import { publishEvent, createEvent, TOPICS } from '../kafka.js';
import { cacheInvalidateEntity, cacheInvalidateByPrefix, ENTITY_CACHE_PREFIXES } from './cache-layer.js';
import { logger } from '../logger.js';

interface InvalidationEvent {
  entityType: string;
  entityId?: string | number;
  operation: 'create' | 'update' | 'delete';
  cacheKeys: string[];
  userId: number;
}

/**
 * Invalidate cache for an entity change and publish Kafka event.
 * Performs both local (immediate) and distributed (Kafka) invalidation.
 */
export async function invalidateOnChange(
  entityType: string,
  entityId: string | number | undefined,
  operation: 'create' | 'update' | 'delete',
  userId: number
): Promise<void> {
  // Build the list of cache key prefixes to invalidate
  const prefixes = ENTITY_CACHE_PREFIXES[entityType] || [entityType];
  const cacheKeys = prefixes.map(p => `cache:${p}:*`);

  // Immediate local invalidation (L1 + L2)
  try {
    await cacheInvalidateEntity(entityType, entityId);
  } catch (err) {
    logger.warn('[CacheInvalidation] Local invalidation failed', {
      entityType,
      entityId,
      error: (err as Error).message,
    });
  }

  // Publish to Kafka for distributed invalidation across other processes
  try {
    const event = createEvent(
      `CACHE_INVALIDATION_${operation.toUpperCase()}`,
      entityType,
      entityId ?? 'all',
      userId,
      { cacheKeys, operation, entityType, entityId }
    );
    await publishEvent(TOPICS.CACHE_INVALIDATION, event);
  } catch (err) {
    // Kafka publish failure is non-fatal — local cache is already invalidated
    logger.warn('[CacheInvalidation] Kafka publish failed', {
      entityType,
      error: (err as Error).message,
    });
  }
}

/**
 * Convenience wrappers for common entity types
 */
export async function invalidateFarmerCache(userId: number, farmerId?: number): Promise<void> {
  await invalidateOnChange('farmer', farmerId, 'update', userId);
}

export async function invalidateFarmCache(userId: number, farmId?: number): Promise<void> {
  await invalidateOnChange('farm', farmId, 'update', userId);
}

export async function invalidateCropCache(userId: number, cropId?: number): Promise<void> {
  await invalidateOnChange('crop', cropId, 'update', userId);
}

export async function invalidateHarvestCache(userId: number, harvestId?: number): Promise<void> {
  await invalidateOnChange('harvest', harvestId, 'update', userId);
}

export async function invalidateExpenseCache(userId: number, expenseId?: number): Promise<void> {
  await invalidateOnChange('expense', expenseId, 'update', userId);
}

export async function invalidateMarketplaceCache(userId: number): Promise<void> {
  await invalidateOnChange('marketplace', undefined, 'update', userId);
}

export async function invalidateLoanCache(userId: number, loanId?: number): Promise<void> {
  await invalidateOnChange('loan', loanId, 'update', userId);
}

export async function invalidateDeliveryCache(userId: number, deliveryId?: number): Promise<void> {
  await invalidateOnChange('delivery', deliveryId, 'update', userId);
}

export async function invalidateWeatherCache(): Promise<void> {
  await cacheInvalidateByPrefix('weather:');
  await cacheInvalidateByPrefix('weatherAlerts:');
}

export async function invalidateSensorCache(): Promise<void> {
  await cacheInvalidateByPrefix('coldChain:');
  await cacheInvalidateByPrefix('iotGateway:');
}
