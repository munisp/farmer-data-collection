/**
 * Mutation Invalidation Middleware
 * 
 * Automatically invalidates relevant caches after mutations succeed.
 * Uses the procedure path to determine which entity caches to clear.
 */

import { middleware } from '../_core/trpc-init.js';
import { cacheInvalidateByPrefix, ENTITY_CACHE_PREFIXES } from './cache-layer.js';
import { publishEvent, createEvent, TOPICS } from '../kafka.js';
import { logger } from '../logger.js';

// Map procedure path prefixes to entity types for auto-invalidation
const MUTATION_ENTITY_MAP: Record<string, string[]> = {
  'coreFarms': ['farm', 'farmer'],
  'coreLivestock': ['livestock'],
  'coreCrops': ['crop'],
  'coreHarvests': ['harvest'],
  'coreExpenses': ['expense'],
  'coreFarmInputs': ['farm'],
  'coreEquipment': ['farm'],
  'marketplace': ['marketplace'],
  'marketplaceEnhancements': ['marketplace'],
  'delivery': ['delivery'],
  'coldChain': ['sensor'],
  'subscription': ['subscription'],
  'cooperative': ['cooperative'],
  'chama': ['chama'],
  'microfinance': ['loan'],
  'loanApplication': ['loan'],
  'creditScoring': ['loan'],
  'mobileMoney': ['loan'],
  'escrow': ['loan'],
  'priceAlerts': ['marketplace'],
  'weatherAlerts': ['weather'],
  'weather': ['weather'],
  'notification': ['farmer'],
  'farmerFeatures': ['farmer'],
  'admin': ['farmer'],
  'adminDashboard': ['farmer'],
  'kyc': ['farmer'],
  'soilAnalysis': ['farm'],
  'financialEnhancements': ['loan'],
  'equipmentFleet': ['farm'],
  'drone': ['farm'],
  'iotGateway': ['sensor'],
  'traceability': ['crop'],
  'inventoryEnhancements': ['crop'],
  'traceabilityEnhancements': ['crop'],
  'sms': ['farmer'],
};

/**
 * tRPC middleware that auto-invalidates caches after a mutation succeeds.
 */
export const mutationInvalidationMiddleware = middleware(async ({ path, type, ctx, next }) => {
  // Only act on mutations
  if (type !== 'mutation') {
    return next();
  }

  const result = await next();

  // Only invalidate on success
  if (result.ok) {
    // Determine entity types from the procedure path
    const routerName = path.split('.')[0];
    const entityTypes = MUTATION_ENTITY_MAP[routerName];

    if (entityTypes && entityTypes.length > 0) {
      const userId = (ctx as any)?.user?.id || 0;

      // Fire-and-forget invalidation (don't block the response)
      setImmediate(async () => {
        try {
          for (const entityType of entityTypes) {
            const prefixes = ENTITY_CACHE_PREFIXES[entityType] || [entityType];
            for (const prefix of prefixes) {
              await cacheInvalidateByPrefix(`${prefix}:`);
            }
          }

          // Publish Kafka invalidation event for other processes
          const cacheKeys = entityTypes.flatMap(et =>
            (ENTITY_CACHE_PREFIXES[et] || [et]).map(p => `cache:${p}:*`)
          );

          const event = createEvent(
            'CACHE_INVALIDATION_MUTATION',
            entityTypes[0],
            'all',
            userId,
            { cacheKeys, operation: 'mutation', path, entityTypes }
          );
          await publishEvent(TOPICS.CACHE_INVALIDATION, event);
        } catch (err) {
          logger.warn('[MutationInvalidation] Background invalidation failed', {
            path,
            error: (err as Error).message,
          });
        }
      });
    }
  }

  return result;
});
