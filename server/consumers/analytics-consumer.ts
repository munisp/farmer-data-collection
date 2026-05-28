import { createConsumer, TOPICS } from '../kafka.js';
import { getRedisClient } from '../redis.js';
import { logger } from '../logger.js';

/**
 * Analytics Consumer
 * 
 * Listens to analytics topic and aggregates business metrics
 * for real-time dashboards and reporting
 */

interface AnalyticsMetrics {
  totalUsers: number;
  totalFarmers: number;
  totalFarms: number;
  totalCrops: number;
  totalLivestock: number;
  totalHarvests: number;
  totalExpenses: number;
  totalRevenue: number;
  activeUsersToday: Set<string>;
  newRegistrationsToday: number;
  lastUpdated: string;
}

export async function startAnalyticsConsumer() {
  logger.info('[AnalyticsConsumer] Starting...');

  try {
    const consumer = await createConsumer('analytics-group');
    const redis = getRedisClient();
    if (!redis) {
      logger.warn('[AnalyticsConsumer] Redis unavailable — analytics consumer will skip cache writes');
    }
    
    await consumer.subscribe({
      topic: TOPICS.ANALYTICS,
      fromBeginning: false, // Only process new messages
    });

    // Initialize metrics cache
    const METRICS_KEY = 'analytics:metrics';
    const ACTIVE_USERS_KEY = 'analytics:active_users:today';
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const event = JSON.parse(message.value?.toString() || '{}');
          
          // Get current metrics
          const metricsJson = redis ? await redis.get(METRICS_KEY) : null;
          const metrics: AnalyticsMetrics = metricsJson 
            ? JSON.parse(metricsJson)
            : {
                totalUsers: 0,
                totalFarmers: 0,
                totalFarms: 0,
                totalCrops: 0,
                totalLivestock: 0,
                totalHarvests: 0,
                totalExpenses: 0,
                totalRevenue: 0,
                activeUsersToday: new Set(),
                newRegistrationsToday: 0,
                lastUpdated: new Date().toISOString(),
              };

          // Update metrics based on event type
          const { eventType, entityType, data } = event;

          if (eventType === 'CREATED') {
            switch (entityType) {
              case 'user':
                metrics.totalUsers++;
                metrics.newRegistrationsToday++;
                break;
              case 'farmer':
                metrics.totalFarmers++;
                break;
              case 'farm':
                metrics.totalFarms++;
                break;
              case 'crop':
                metrics.totalCrops++;
                break;
              case 'livestock':
                metrics.totalLivestock++;
                break;
              case 'harvest':
                metrics.totalHarvests++;
                if (data?.quantity && data?.pricePerUnit) {
                  metrics.totalRevenue += data.quantity * data.pricePerUnit;
                }
                break;
              case 'expense':
                metrics.totalExpenses++;
                if (data?.amount) {
                  metrics.totalExpenses += data.amount;
                }
                break;
            }
          } else if (eventType === 'DELETED') {
            switch (entityType) {
              case 'user':
                metrics.totalUsers = Math.max(0, metrics.totalUsers - 1);
                break;
              case 'farmer':
                metrics.totalFarmers = Math.max(0, metrics.totalFarmers - 1);
                break;
              case 'farm':
                metrics.totalFarms = Math.max(0, metrics.totalFarms - 1);
                break;
              case 'crop':
                metrics.totalCrops = Math.max(0, metrics.totalCrops - 1);
                break;
              case 'livestock':
                metrics.totalLivestock = Math.max(0, metrics.totalLivestock - 1);
                break;
              case 'harvest':
                metrics.totalHarvests = Math.max(0, metrics.totalHarvests - 1);
                break;
              case 'expense':
                metrics.totalExpenses = Math.max(0, metrics.totalExpenses - 1);
                break;
            }
          }

          // Track active users
          if (event.userId && redis) {
            await redis.sadd(ACTIVE_USERS_KEY, event.userId.toString());
            const now = new Date();
            const midnight = new Date(now);
            midnight.setHours(24, 0, 0, 0);
            const ttl = Math.floor((midnight.getTime() - now.getTime()) / 1000);
            await redis.expire(ACTIVE_USERS_KEY, ttl);
          }

          // Update last updated timestamp
          metrics.lastUpdated = new Date().toISOString();

          // Save updated metrics
          if (redis) {
            await redis.set(METRICS_KEY, JSON.stringify(metrics), 'EX', 3600);
          }

          logger.info(`[AnalyticsConsumer] Updated metrics: ${entityType} ${eventType}`);
        } catch (error) {
          logger.error('[AnalyticsConsumer] Error processing message:', error);
          // Don't throw - we don't want to stop the consumer on individual message errors
        }
      },
    });

    logger.info('[AnalyticsConsumer] Started successfully');
    return consumer;
  } catch (error) {
    logger.error('[AnalyticsConsumer] Failed to start:', error);
    throw error;
  }
}

/**
 * Get current analytics metrics from Redis
 */
export async function getAnalyticsMetrics(): Promise<AnalyticsMetrics | null> {
  try {
    const redis = getRedisClient();
    if (!redis) return null;
    const metricsJson = await redis.get('analytics:metrics');
    
    if (!metricsJson) {
      return null;
    }

    const metrics = JSON.parse(metricsJson);
    
    // Get active users count
    const activeUsersCount = await redis.scard('analytics:active_users:today');
    metrics.activeUsersToday = activeUsersCount;

    return metrics;
  } catch (error) {
    logger.error('[Analytics] Error getting metrics:', error);
    return null;
  }
}
