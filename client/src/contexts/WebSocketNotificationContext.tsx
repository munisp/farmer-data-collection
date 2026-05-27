import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "./AuthContext";

// ============================================================================
// Types
// ============================================================================

interface WebSocketMessage {
  type: string;
  timestamp: number;
  data: any;
}

interface WebSocketContextType {
  isConnected: boolean;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
}

// ============================================================================
// Context
// ============================================================================

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within WebSocketProvider");
  }
  return context;
}

// ============================================================================
// Provider
// ============================================================================

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { user, isAuthenticated } = useAuth();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [subscribedChannels, setSubscribedChannels] = useState<Set<string>>(new Set());

  // Connect to WebSocket server
  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || 'ws://localhost:8081';
    const clientId = `user-${user.id}-${Date.now()}`;
    const websocket = new WebSocket(`${wsUrl}/ws?clientId=${clientId}`);

    websocket.onopen = () => {
      console.log('[WebSocket] Connected');
      setIsConnected(true);
      
      // Resubscribe to channels after reconnection
      subscribedChannels.forEach(channel => {
        websocket.send(JSON.stringify({ action: 'subscribe', channel }));
      });
    };

    websocket.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    };

    websocket.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
    };

    websocket.onclose = () => {
      console.log('[WebSocket] Disconnected');
      setIsConnected(false);
      
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        console.log('[WebSocket] Attempting to reconnect...');
        setWs(null);
      }, 5000);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, [isAuthenticated, user]);

  // Handle incoming messages
  const handleMessage = (message: WebSocketMessage) => {
    console.log('[WebSocket] Received:', message);

    switch (message.type) {
      case 'marketplace_update':
        handleMarketplaceUpdate(message.data);
        break;
      case 'order_update':
        handleOrderUpdate(message.data);
        break;
      case 'message_update':
        handleMessageUpdate(message.data);
        break;
      case 'price_alert':
        handlePriceAlert(message.data);
        break;
      case 'system_notification':
        handleSystemNotification(message.data);
        break;
      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  };

  // Marketplace update handler
  const handleMarketplaceUpdate = (data: any) => {
    if (data.action === 'created') {
      toast.success('🌾 New Listing Available!', {
        description: `${data.crop || 'Product'} - ₦${data.price || 'N/A'}`,
        action: {
          label: 'View',
          onClick: () => window.location.href = '/marketplace',
        },
      });
    } else if (data.action === 'updated') {
      toast.info('📝 Listing Updated', {
        description: `Listing #${data.listingId} has been updated`,
      });
    } else if (data.action === 'deleted') {
      toast('🗑️ Listing Removed', {
        description: `Listing #${data.listingId} is no longer available`,
      });
    }
  };

  // Order update handler
  const handleOrderUpdate = (data: any) => {
    const statusEmojis: Record<string, string> = {
      pending: '⏳',
      confirmed: '✅',
      processing: '📦',
      shipped: '🚚',
      delivered: '🎉',
      cancelled: '❌',
    };
    const statusEmoji = statusEmojis[data.status] || '📋';

    toast(`${statusEmoji} Order ${data.status}`, {
      description: `Order #${data.orderId} - ${data.message || 'Status updated'}`,
      action: {
        label: 'View Order',
        onClick: () => window.location.href = '/my-orders',
      },
    });
  };

  // Message update handler
  const handleMessageUpdate = (data: any) => {
    toast('💬 New Message', {
      description: `${data.senderName || 'Someone'}: ${data.preview || 'Sent you a message'}`,
      action: {
        label: 'View',
        onClick: () => window.location.href = '/messages',
      },
    });
  };

  // Price alert handler
  const handlePriceAlert = (data: any) => {
    const trendEmoji = data.trend === 'up' ? '📈' : data.trend === 'down' ? '📉' : '➡️';
    
    toast(`${trendEmoji} Price Alert`, {
      description: `${data.crop}: ₦${data.currentPrice} (${data.change})`,
      action: {
        label: 'View Forecast',
        onClick: () => window.location.href = '/price-forecast',
      },
    });
  };

  // System notification handler
  const handleSystemNotification = (data: any) => {
    if (data.message === 'pong') {
      // Ignore pong messages
      return;
    }

    toast.info('ℹ️ System Notification', {
      description: data.message || 'System update',
    });
  };

  // Subscribe to a channel
  const subscribe = (channel: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot subscribe, not connected');
      return;
    }

    console.log('[WebSocket] Subscribing to:', channel);
    ws.send(JSON.stringify({ action: 'subscribe', channel }));
    setSubscribedChannels(prev => new Set(prev).add(channel));
  };

  // Unsubscribe from a channel
  const unsubscribe = (channel: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot unsubscribe, not connected');
      return;
    }

    console.log('[WebSocket] Unsubscribing from:', channel);
    ws.send(JSON.stringify({ action: 'unsubscribe', channel }));
    setSubscribedChannels(prev => {
      const newSet = new Set(prev);
      newSet.delete(channel);
      return newSet;
    });
  };

  // Auto-subscribe to user-specific channels
  useEffect(() => {
    if (!isConnected || !user) return;

    // Subscribe to user's orders
    subscribe(`orders:${user.id}`);

    // Subscribe to user's messages
    subscribe(`messages:${user.id}`);

    // Subscribe to marketplace updates
    subscribe('marketplace');

    return () => {
      // Cleanup subscriptions
      unsubscribe(`orders:${user.id}`);
      unsubscribe(`messages:${user.id}`);
      unsubscribe('marketplace');
    };
  }, [isConnected, user]);

  const value: WebSocketContextType = {
    isConnected,
    subscribe,
    unsubscribe,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}
