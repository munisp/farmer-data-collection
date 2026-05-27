import { DaprClient, DaprServer, CommunicationProtocolEnum } from '@dapr/dapr';

const DAPR_HOST = process.env.DAPR_HOST || '127.0.0.1';
const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT || '3500';
const DAPR_GRPC_PORT = process.env.DAPR_GRPC_PORT || '50001';

console.log('[Dapr] Initializing Dapr client...');
console.log(`  Host: ${DAPR_HOST}`);
console.log(`  HTTP Port: ${DAPR_HTTP_PORT}`);
console.log(`  gRPC Port: ${DAPR_GRPC_PORT}`);

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
  data: any
): Promise<void> {
  try {
    await daprClient.pubsub.publish(
      DAPR_COMPONENTS.PUBSUB,
      topic,
      data
    );
    
    console.log(`[Dapr] Published event to topic: ${topic}`);
  } catch (error) {
    console.error('[Dapr] Failed to publish event:', error);
    // Don't throw - graceful degradation
  }
}

/**
 * Subscribe to Dapr pub/sub topic
 */
export async function subscribeDaprTopic(
  topic: string,
  handler: (data: any) => Promise<void>
): Promise<void> {
  try {
    await daprServer.pubsub.subscribe(
      DAPR_COMPONENTS.PUBSUB,
      topic,
      async (data: any) => {
        try {
          console.log(`[Dapr] Received event from topic: ${topic}`);
          await handler(data);
        } catch (error) {
          console.error(`[Dapr] Error handling event from ${topic}:`, error);
        }
      }
    );
    
    console.log(`[Dapr] Subscribed to topic: ${topic}`);
  } catch (error) {
    console.error(`[Dapr] Failed to subscribe to topic ${topic}:`, error);
  }
}

/**
 * Save state via Dapr state management
 */
export async function saveState(
  key: string,
  value: any,
  metadata?: Record<string, string>
): Promise<void> {
  try {
    await daprClient.state.save(
      DAPR_COMPONENTS.STATE_STORE,
      [
        {
          key,
          value,
          metadata,
        },
      ]
    );
    
    console.log(`[Dapr] Saved state: ${key}`);
  } catch (error) {
    console.error('[Dapr] Failed to save state:', error);
    throw error;
  }
}

/**
 * Get state via Dapr state management
 */
export async function getState<T = any>(key: string): Promise<T | null> {
  try {
    const response = await daprClient.state.get(
      DAPR_COMPONENTS.STATE_STORE,
      key
    );
    
    console.log(`[Dapr] Retrieved state: ${key}`);
    return response as T;
  } catch (error) {
    console.error('[Dapr] Failed to get state:', error);
    return null;
  }
}

/**
 * Delete state via Dapr state management
 */
export async function deleteState(key: string): Promise<void> {
  try {
    await daprClient.state.delete(
      DAPR_COMPONENTS.STATE_STORE,
      key
    );
    
    console.log(`[Dapr] Deleted state: ${key}`);
  } catch (error) {
    console.error('[Dapr] Failed to delete state:', error);
    throw error;
  }
}

/**
 * Bulk get state via Dapr state management
 */
export async function bulkGetState<T = any>(
  keys: string[]
): Promise<Array<{ key: string; value: T | null }>> {
  try {
    const response = await daprClient.state.getBulk(
      DAPR_COMPONENTS.STATE_STORE,
      keys
    );
    
    console.log(`[Dapr] Retrieved bulk state: ${keys.length} keys`);
    return response.map((item) => ({
      key: item.key,
      value: item.data as T,
    }));
  } catch (error) {
    console.error('[Dapr] Failed to get bulk state:', error);
    return keys.map((key) => ({ key, value: null }));
  }
}

/**
 * Invoke another service via Dapr service invocation
 */
export async function invokeService(
  serviceId: string,
  methodName: string,
  data?: any
): Promise<any> {
  try {
    const response = await daprClient.invoker.invoke(
      serviceId,
      methodName,
      'post' as any,
      data
    );
    
    console.log(`[Dapr] Invoked service: ${serviceId}.${methodName}`);
    return response;
  } catch (error) {
    console.error(`[Dapr] Failed to invoke service ${serviceId}.${methodName}:`, error);
    throw error;
  }
}

/**
 * Get secret from Dapr secret store
 */
export async function getSecret(
  secretName: string,
  metadata?: Record<string, string>
): Promise<Record<string, string> | null> {
  try {
    const response = await daprClient.secret.get(
      DAPR_COMPONENTS.SECRET_STORE,
      secretName,
      metadata as any
    );
    
    console.log(`[Dapr] Retrieved secret: ${secretName}`);
    return response as Record<string, string>;
  } catch (error) {
    console.error(`[Dapr] Failed to get secret ${secretName}:`, error);
    return null;
  }
}

/**
 * Start Dapr server
 */
export async function startDaprServer(): Promise<void> {
  try {
    await daprServer.start();
    console.log('[Dapr] Server started successfully');
  } catch (error) {
    console.error('[Dapr] Failed to start server:', error);
    throw error;
  }
}

/**
 * Stop Dapr server
 */
export async function stopDaprServer(): Promise<void> {
  try {
    await daprServer.stop();
    console.log('[Dapr] Server stopped');
  } catch (error) {
    console.error('[Dapr] Failed to stop server:', error);
  }
}

/**
 * Health check for Dapr
 */
export async function checkDaprHealth(): Promise<boolean> {
  try {
    // Try to get state to verify Dapr is working
    await daprClient.state.get(DAPR_COMPONENTS.STATE_STORE, '_health_check');
    return true;
  } catch (error) {
    console.error('[Dapr] Health check failed:', error);
    return false;
  }
}

// Export alias for backward compatibility
export const isDaprHealthy = checkDaprHealth;

console.log('[Dapr] Client initialized');
