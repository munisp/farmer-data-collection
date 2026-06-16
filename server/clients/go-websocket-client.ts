import { logger } from '../logger.js';
/**
 * Go WebSocket Service Client
 * 
 * TypeScript client for real-time communication with Go WebSocket service.
 * Provides methods for subscribing to channels and receiving live updates.
 * 
 * Service runs on port 8081 (configured via GO_WEBSOCKET_SERVICE_URL)
 */

// ============================================================================
// Types
// ============================================================================

export type MessageType =
  | 'marketplace_update'
  | 'order_update'
  | 'message_update'
  | 'price_alert'
  | 'system_notification';

export interface WebSocketMessage {
  type: MessageType;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface WebSocketStats {
  total_clients: number;
  timestamp: number;
}

export interface WebSocketHealth {
  status: string;
  service: string;
  version: string;
  stats: WebSocketStats;
}

export type MessageHandler = (message: WebSocketMessage) => void;
export type ErrorHandler = (error: Error) => void;
export type ConnectionHandler = () => void;

// ============================================================================
// Go WebSocket Client Class
// ============================================================================

export class GoWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private clientId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private errorHandlers: ErrorHandler[] = [];
  private connectHandlers: ConnectionHandler[] = [];
  private disconnectHandlers: ConnectionHandler[] = [];
  private subscribedChannels: Set<string> = new Set();
  private isIntentionalClose = false;

  constructor(url?: string, clientId?: string) {
    const baseURL = url || process.env.GO_WEBSOCKET_SERVICE_URL || 'ws://localhost:8081';
    this.clientId = clientId || `client-${Date.now()}`;
    this.url = `${baseURL}/ws?clientId=${this.clientId}`;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          logger.info('[WebSocket] Connected to realtime service');
          this.reconnectAttempts = 0;
          
          // Resubscribe to channels after reconnection
          this.subscribedChannels.forEach(channel => {
            this.sendMessage({ action: 'subscribe', channel });
          });

          this.connectHandlers.forEach(handler => handler());
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            logger.error('[WebSocket] Failed to parse message:', error);
          }
        };

        this.ws.onerror = (event) => {
          const error = new Error('WebSocket error occurred');
          logger.error('[WebSocket] Error:', error);
          this.errorHandlers.forEach(handler => handler(error));
          reject(error);
        };

        this.ws.onclose = () => {
          logger.info('[WebSocket] Connection closed');
          this.disconnectHandlers.forEach(handler => handler());

          if (!this.isIntentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnect();
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isIntentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Reconnect to WebSocket server
   */
  private reconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    logger.info(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      this.connect().catch(error => {
        logger.error('[WebSocket] Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel: string): void {
    this.subscribedChannels.add(channel);
    this.sendMessage({ action: 'subscribe', channel });
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string): void {
    this.subscribedChannels.delete(channel);
    this.sendMessage({ action: 'unsubscribe', channel });
  }

  /**
   * Send a message to the server
   */
  private sendMessage(message: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      logger.warn('[WebSocket] Cannot send message, connection not open');
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: WebSocketMessage): void {
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => handler(message));
    }

    // Also call wildcard handlers
    const wildcardHandlers = this.messageHandlers.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach(handler => handler(message));
    }
  }

  /**
   * Register a message handler for a specific message type
   */
  on(messageType: MessageType | '*', handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(messageType) || [];
    handlers.push(handler);
    this.messageHandlers.set(messageType, handlers);
  }

  /**
   * Remove a message handler
   */
  off(messageType: MessageType | '*', handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(messageType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Register an error handler
   */
  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Register a connect handler
   */
  onConnect(handler: ConnectionHandler): void {
    this.connectHandlers.push(handler);
  }

  /**
   * Register a disconnect handler
   */
  onDisconnect(handler: ConnectionHandler): void {
    this.disconnectHandlers.push(handler);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getState(): string {
    if (!this.ws) return 'CLOSED';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'OPEN';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
        return 'CLOSED';
      default:
        return 'UNKNOWN';
    }
  }
}

// ============================================================================
// Marketplace WebSocket Helper
// ============================================================================

export class MarketplaceWebSocket extends GoWebSocketClient {
  constructor() {
    super(undefined, `marketplace-${Date.now()}`);
  }

  /**
   * Subscribe to marketplace updates
   */
  subscribeToMarketplace(): void {
    this.subscribe('marketplace');
  }

  /**
   * Subscribe to order updates for a specific user
   */
  subscribeToOrders(userId: number): void {
    this.subscribe(`orders:${userId}`);
  }

  /**
   * Subscribe to messages for a specific user
   */
  subscribeToMessages(userId: number): void {
    this.subscribe(`messages:${userId}`);
  }

  /**
   * Subscribe to price alerts for a specific crop
   */
  subscribeToPriceAlerts(cropType: string): void {
    this.subscribe(`price:${cropType}`);
  }

  /**
   * Handle marketplace updates
   */
  onMarketplaceUpdate(handler: (data: Record<string, unknown>) => void): void {
    this.on('marketplace_update', (message) => {
      handler(message.data);
    });
  }

  /**
   * Handle order updates
   */
  onOrderUpdate(handler: (data: Record<string, unknown>) => void): void {
    this.on('order_update', (message) => {
      handler(message.data);
    });
  }

  /**
   * Handle message updates
   */
  onMessageUpdate(handler: (data: Record<string, unknown>) => void): void {
    this.on('message_update', (message) => {
      handler(message.data);
    });
  }

  /**
   * Handle price alerts
   */
  onPriceAlert(handler: (data: Record<string, unknown>) => void): void {
    this.on('price_alert', (message) => {
      handler(message.data);
    });
  }
}

// ============================================================================
// HTTP Client for Broadcasting (Server-side)
// ============================================================================

export class WebSocketBroadcaster {
  private baseURL: string;

  constructor(baseURL?: string) {
    this.baseURL = baseURL || process.env.GO_WEBSOCKET_SERVICE_URL || 'http://localhost:8081';
  }

  /**
   * Broadcast a message to all clients or specific channel
   */
  async broadcast(
    type: MessageType,
    data: Record<string, unknown>,
    channel?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseURL}/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          data,
          channel,
        }),
      });

      if (!response.ok) {
        throw new Error(`Broadcast failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[Broadcaster] Failed to broadcast:', error);
      throw error;
    }
  }

  /**
   * Get WebSocket service stats
   */
  async getStats(): Promise<WebSocketStats> {
    try {
      const response = await fetch(`${this.baseURL}/api/stats`);
      
      if (!response.ok) {
        throw new Error(`Failed to get stats: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[Broadcaster] Failed to get stats:', error);
      throw error;
    }
  }

  /**
   * Check WebSocket service health
   */
  async healthCheck(): Promise<WebSocketHealth> {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[Broadcaster] Health check failed:', error);
      throw error;
    }
  }
}

// ============================================================================
// Singleton Instances
// ============================================================================

/**
 * Singleton broadcaster instance for server-side use
 * 
 * Usage:
 * ```typescript
 * import { webSocketBroadcaster } from './clients/go-websocket-client';
 * 
 * await webSocketBroadcaster.broadcast('marketplace_update', {
 *   listingId: 123,
 *   action: 'created',
 * }, 'marketplace');
 * ```
 */
export const webSocketBroadcaster = new WebSocketBroadcaster();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a marketplace WebSocket client (client-side)
 */
export function createMarketplaceWebSocket(): MarketplaceWebSocket {
  return new MarketplaceWebSocket();
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}
