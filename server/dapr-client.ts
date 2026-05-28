import { DaprClient, DaprServer, CommunicationProtocolEnum } from '@dapr/dapr';
import { logger } from './logger.js';

const DAPR_HOST = process.env.DAPR_HOST || '127.0.0.1';
const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT || '3500';
const DAPR_GRPC_PORT = process.env.DAPR_GRPC_PORT || '50001';

let _daprHealthy = true;
let _lastDaprHealthCheck = 0;
const DAPR_HEALTH_CACHE_MS = 15_000;

logger.info('[Dapr] Initializing', { host: DAPR_HOST, httpPort: DAPR_HTTP_PORT, grpcPort: DAPR_GRPC_PORT });

// Create Dapr client (for outbound calls)
export const daprClient = new DaprClient({
  daprHost: DAPR_HOST,
  daprPort: DAPR_HTTP_PORT,
  communicationProtocol: CommunicationProtocolEnum.HTTP,
});

// Create Dapr server (for inbound calls)
export const daprServer = new DaprServer({
  serverHost: '0.0.0.0',
  serverPort: '3001',
  clientOptions: {
    daprHost: DAPR_HOST,
    daprPort: DAPR_HTTP_PORT,
  },
});

// Dapr component names
export const DAPR_COMPONENTS = {
  PUBSUB: 'kafka-pubsub',
  STATE_STORE: 'redis-state',
  SECRET_STORE: 'local-secret-store',
} as const;

// Dapr topic names (matching Kafka topics)
export const DAPR_TOPICS = {
  FARMER_EVENTS: 'farmer.events',
  FARM_EVENTS: 'farm.events',
  CROP_EVENTS: 'crop.events',
  LIVESTOCK_EVENTS: 'livestock.events',
  HARVEST_EVENTS: 'harvest.events',
  EXPENSE_EVENTS: 'expense.events',
  AUTH_EVENTS: 'auth.events',
  CACHE_INVALIDATION: 'cache.invalidation',
  AUDIT_TRAIL: 'audit.trail',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
} as const;

/**
 * Publish event via Dapr pub/sub
 */
export async function publishDaprEvent(
  topic: string,
  data: object | string
): Promise<void> {
  try {
    await daprClient.pubsub.publish(DAPR_COMPONENTS.PUBSUB, topic, data);
    _daprHealthy = true;
    logger.debug('[Dapr] Published event', { topic });
  } catch (error) {
    _daprHealthy = false;
    logger.warn('[Dapr] Failed to publish event', { topic, error: (error as Error).message });
  }
}

/**
 * Subscribe to Dapr pub/sub topic
 */
export async function subscribeDaprTopic(
  topic: string,
  handler: (data: unknown) => Promise<void>
): Promise<void> {
  try {
    await daprServer.pubsub.subscribe(
      DAPR_COMPONENTS.PUBSUB,
      topic,
      async (data: unknown) => {
        try {
          await handler(data);
        } catch (error) {
          logger.error(`[Dapr] Error handling event from ${topic}`, { error: (error as Error).message });
        }
      }
    );
    logger.info(`[Dapr] Subscribed to topic: ${topic}`);
  } catch (error) {
    logger.error(`[Dapr] Failed to subscribe to topic ${topic}`, { error: (error as Error).message });
  }
}

/**
 * Save state via Dapr state management
 */
export async function saveState(
  key: string,
  value: unknown,
  metadata?: Record<string, string>
): Promise<void> {
  try {
    await daprClient.state.save(DAPR_COMPONENTS.STATE_STORE, [{ key, value, metadata }]);
    _daprHealthy = true;
  } catch (error) {
    _daprHealthy = false;
    logger.error('[Dapr] Failed to save state', { key, error: (error as Error).message });
    throw error;
  }
}

/**
 * Get state via Dapr state management
 */
export async function getState<T = unknown>(key: string): Promise<T | null> {
  try {
    const response = await daprClient.state.get(DAPR_COMPONENTS.STATE_STORE, key);
    _daprHealthy = true;
    return response as T;
  } catch (error) {
    _daprHealthy = false;
    logger.error('[Dapr] Failed to get state', { key, error: (error as Error).message });
    return null;
  }
}

/**
 * Delete state via Dapr state management
 */
export async function deleteState(key: string): Promise<void> {
  try {
    await daprClient.state.delete(DAPR_COMPONENTS.STATE_STORE, key);
  } catch (error) {
    logger.error('[Dapr] Failed to delete state', { key, error: (error as Error).message });
    throw error;
  }
}

/**
 * Bulk get state via Dapr state management
 */
export async function bulkGetState<T = unknown>(
  keys: string[]
): Promise<Array<{ key: string; value: T | null }>> {
  try {
    const response = await daprClient.state.getBulk(DAPR_COMPONENTS.STATE_STORE, keys);
    _daprHealthy = true;
    return response.map((item) => ({ key: item.key, value: item.data as T }));
  } catch (error) {
    _daprHealthy = false;
    logger.error('[Dapr] Failed to get bulk state', { count: keys.length, error: (error as Error).message });
    return keys.map((key) => ({ key, value: null }));
  }
}

/**
 * Invoke another service via Dapr service invocation
 */
export async function invokeService(
  serviceId: string,
  methodName: string,
  data?: object,
  retries = 2
): Promise<unknown> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await daprClient.invoker.invoke(serviceId, methodName, 'post' as any, data);
      _daprHealthy = true;
      return response;
    } catch (error) {
      lastError = error as Error;
      _daprHealthy = false;
      if (attempt < retries) {
        const delay = Math.min(500 * Math.pow(2, attempt), 5000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  logger.error(`[Dapr] Failed to invoke service ${serviceId}.${methodName} after ${retries + 1} attempts`, { error: lastError?.message });
  throw lastError;
}

/**
 * Get secret from Dapr secret store
 */
export async function getSecret(
  secretName: string,
  metadata?: Record<string, string>
): Promise<Record<string, string> | null> {
  try {
    const response = await daprClient.secret.get(DAPR_COMPONENTS.SECRET_STORE, secretName, metadata as any);
    return response as Record<string, string>;
  } catch (error) {
    logger.error(`[Dapr] Failed to get secret ${secretName}`, { error: (error as Error).message });
    return null;
  }
}

/**
 * Start Dapr server
 */
export async function startDaprServer(): Promise<void> {
  try {
    await daprServer.start();
    logger.info('[Dapr] Server started');
  } catch (error) {
    logger.error('[Dapr] Failed to start server', { error: (error as Error).message });
    throw error;
  }
}

export async function stopDaprServer(): Promise<void> {
  try {
    await daprServer.stop();
    logger.info('[Dapr] Server stopped');
  } catch (error) {
    logger.error('[Dapr] Failed to stop server', { error: (error as Error).message });
  }
}

export async function checkDaprHealth(): Promise<boolean> {
  if (Date.now() - _lastDaprHealthCheck < DAPR_HEALTH_CACHE_MS) return _daprHealthy;
  try {
    await daprClient.state.get(DAPR_COMPONENTS.STATE_STORE, '_health_check');
    _daprHealthy = true;
    _lastDaprHealthCheck = Date.now();
    return true;
  } catch (err) {
    _daprHealthy = false;
    _lastDaprHealthCheck = Date.now();
    return false;
  }
}

export function isDaprHealthy(): boolean {
  return _daprHealthy;
}
