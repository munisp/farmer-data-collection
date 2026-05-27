import { Consumer } from 'kafkajs';
import { startCacheInvalidationConsumer } from './cache-invalidation-consumer.js';
import { startAuditTrailConsumer } from './audit-trail-consumer.js';
import { startAnalyticsConsumer } from './analytics-consumer.js';

/**
 * Consumer Manager
 * 
 * Manages all Kafka consumers lifecycle:
 * - Starts all consumers
 * - Handles graceful shutdown
 * - Provides health checks
 */

const consumers: Consumer[] = [];
let isShuttingDown = false;

export async function startAllConsumers() {
  console.log('[ConsumerManager] Starting all consumers...');

  try {
    // Start cache invalidation consumer
    const cacheConsumer = await startCacheInvalidationConsumer();
    if (cacheConsumer) {
      consumers.push(cacheConsumer);
    }

    // Start audit trail consumer
    const auditConsumer = await startAuditTrailConsumer();
    if (auditConsumer) {
      consumers.push(auditConsumer);
    }

    // Start analytics consumer
    const analyticsConsumer = await startAnalyticsConsumer();
    if (analyticsConsumer) {
      consumers.push(analyticsConsumer);
    }

    console.log(`[ConsumerManager] Started ${consumers.length} consumers successfully`);

    // Setup graceful shutdown
    setupGracefulShutdown();

    return consumers;
  } catch (error) {
    console.error('[ConsumerManager] Error starting consumers:', error);
    throw error;
  }
}

export async function stopAllConsumers() {
  if (isShuttingDown) {
    console.log('[ConsumerManager] Already shutting down...');
    return;
  }

  isShuttingDown = true;
  console.log('[ConsumerManager] Stopping all consumers...');

  try {
    await Promise.all(
      consumers.map(async (consumer) => {
        try {
          await consumer.disconnect();
        } catch (error) {
          console.error('[ConsumerManager] Error disconnecting consumer:', error);
        }
      })
    );

    console.log('[ConsumerManager] All consumers stopped');
  } catch (error) {
    console.error('[ConsumerManager] Error stopping consumers:', error);
    throw error;
  }
}

function setupGracefulShutdown() {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`[ConsumerManager] Received ${signal}, shutting down gracefully...`);
      await stopAllConsumers();
      process.exit(0);
    });
  });

  process.on('uncaughtException', async (error) => {
    console.error('[ConsumerManager] Uncaught exception:', error);
    await stopAllConsumers();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('[ConsumerManager] Unhandled rejection at:', promise, 'reason:', reason);
    await stopAllConsumers();
    process.exit(1);
  });
}

export function getConsumerHealth() {
  return {
    total: consumers.length,
    running: consumers.length,
    isShuttingDown,
  };
}
