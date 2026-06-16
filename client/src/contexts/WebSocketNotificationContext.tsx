import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "./AuthContext";
import {
  ResilientConnectionManager,
  type ConnectionStatus,
  type NetworkQuality,
  detectNetworkQuality,
} from "@/services/resilient-connectivity";

// ============================================================================
// Types
// ============================================================================

interface WebSocketMessage {
  type: string;
  channel?: string;
  timestamp: number;
  data: Record<string, unknown>;
}

interface WebSocketContextType {
  isConnected: boolean;
  networkQuality: NetworkQuality;
  queueSize: number;
  transport: string;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
  send: (channel: string, payload: unknown, priority?: "high" | "normal" | "low") => void;
}

// ============================================================================
// Context
// ============================================================================

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export function useWebSocketNotifications() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocketNotifications must be used within WebSocketProvider");
  }
  return context;
}

// Re-export for backward compatibility
export { useWebSocketNotifications as useWebSocket };

// ============================================================================
// Provider with Resilient Connectivity
// ============================================================================

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { user, isAuthenticated } = useAuth();
  const managerRef = useRef<ResilientConnectionManager | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>("high");
  const [queueSize, setQueueSize] = useState(0);
  const [transport, setTransport] = useState<string>("none");
  const [subscribedChannels, setSubscribedChannels] = useState<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);

  // Initialize resilient connection manager
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || "ws://localhost:8081";

    const manager = new ResilientConnectionManager({
      wsUrl,
      heartbeatInterval: 15000,
      heartbeatTimeout: 10000,
      reconnectBaseDelay: 1000,
      reconnectMaxDelay: 60000,
      bandwidthAdaptive: true,
      enableOfflineQueue: true,
    });

    managerRef.current = manager;

    // Status change handler
    const unsub = manager.onStatusChange((status: ConnectionStatus) => {
      setIsConnected(status.state === "connected");
      setNetworkQuality(status.network.quality);
      setQueueSize(status.queueSize);
      setTransport(status.transport);
    });

    // Connect with client ID
    const clientId = `user-${user.id}-${Date.now()}`;
    manager.connect(clientId);

    // Subscribe to message channels
    manager.onMessage("marketplace_update", (data) =>
      handleMarketplaceUpdate(data as Record<string, unknown>));
    manager.onMessage("order_update", (data) =>
      handleOrderUpdate(data as Record<string, unknown>));
    manager.onMessage("message_update", (data) =>
      handleMessageUpdate(data as Record<string, unknown>));
    manager.onMessage("price_alert", (data) =>
      handlePriceAlert(data as Record<string, unknown>));
    manager.onMessage("system_notification", (data) =>
      handleSystemNotification(data as Record<string, unknown>));

    // Also maintain raw WebSocket for backward compatibility
    connectRawWebSocket(wsUrl, clientId);

    return () => {
      unsub();
      manager.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [isAuthenticated, user]);

  // Raw WebSocket with exponential backoff reconnection
  const connectRawWebSocket = useCallback((wsUrl: string, clientId: string) => {
    try {
      const websocket = new WebSocket(`${wsUrl}/ws?clientId=${clientId}`);

      websocket.onopen = () => {
        setIsConnected(true);
        reconnectAttemptRef.current = 0;

        // Resubscribe to channels after reconnection
        subscribedChannels.forEach(channel => {
          websocket.send(JSON.stringify({ action: "subscribe", channel }));
        });
      };

      websocket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          if (message.type === "pong") return;
          handleMessage(message);
        } catch (err) {
          console.debug('[WebSocket] Non-JSON message received:', String(err));
        }
      };

      websocket.onerror = () => {
        // Error handling is done in onclose
      };

      websocket.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Exponential backoff with jitter
        const attempt = reconnectAttemptRef.current;
        const baseDelay = 1000;
        const maxDelay = 60000;
        const exponential = baseDelay * Math.pow(2, attempt);
        const capped = Math.min(exponential, maxDelay);
        const jitter = capped * (0.75 + Math.random() * 0.5);
        reconnectAttemptRef.current++;

        reconnectTimerRef.current = setTimeout(() => {
          if (navigator.onLine) {
            connectRawWebSocket(wsUrl, clientId);
          }
        }, jitter);
      };

      wsRef.current = websocket;
    } catch (err) {
      console.warn('[WebSocket] Connection failed, using resilient fallback:', String(err));
    }
  }, [subscribedChannels]);

  // Handle incoming messages
  const handleMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case "marketplace_update":
        handleMarketplaceUpdate(message.data);
        break;
      case "order_update":
        handleOrderUpdate(message.data);
        break;
      case "message_update":
        handleMessageUpdate(message.data);
        break;
      case "price_alert":
        handlePriceAlert(message.data);
        break;
      case "system_notification":
        handleSystemNotification(message.data);
        break;
    }
  };

  const handleMarketplaceUpdate = (data: Record<string, unknown>) => {
    if (data.action === "created") {
      toast.success("New Listing Available!", {
        description: `${data.crop || "Product"} - ${data.price || "N/A"}`,
        action: { label: "View", onClick: () => (window.location.href = "/marketplace") },
      });
    } else if (data.action === "updated") {
      toast.info("Listing Updated", {
        description: `Listing #${data.listingId} has been updated`,
      });
    } else if (data.action === "deleted") {
      toast("Listing Removed", {
        description: `Listing #${data.listingId} is no longer available`,
      });
    }
  };

  const handleOrderUpdate = (data: Record<string, unknown>) => {
    toast(`Order ${data.status}`, {
      description: `Order #${data.orderId} - ${data.message || "Status updated"}`,
      action: { label: "View Order", onClick: () => (window.location.href = "/my-orders") },
    });
  };

  const handleMessageUpdate = (data: Record<string, unknown>) => {
    toast("New Message", {
      description: `${data.senderName || "Someone"}: ${data.preview || "Sent you a message"}`,
      action: { label: "View", onClick: () => (window.location.href = "/messages") },
    });
  };

  const handlePriceAlert = (data: Record<string, unknown>) => {
    toast("Price Alert", {
      description: `${data.crop}: ${data.currentPrice} (${data.change})`,
      action: { label: "View Forecast", onClick: () => (window.location.href = "/price-forecast") },
    });
  };

  const handleSystemNotification = (data: Record<string, unknown>) => {
    if (data.message === "pong") return;
    toast.info("System Notification", {
      description: (data.message as string) || "System update",
    });
  };

  const subscribe = useCallback((channel: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "subscribe", channel }));
    }
    setSubscribedChannels(prev => new Set(prev).add(channel));
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "unsubscribe", channel }));
    }
    setSubscribedChannels(prev => {
      const next = new Set(prev);
      next.delete(channel);
      return next;
    });
  }, []);

  const send = useCallback(
    (channel: string, payload: unknown, priority?: "high" | "normal" | "low") => {
      managerRef.current?.send(channel, payload, priority || "normal");
    },
    [],
  );

  // Auto-subscribe to user-specific channels
  useEffect(() => {
    if (!isConnected || !user) return;
    subscribe(`orders:${user.id}`);
    subscribe(`messages:${user.id}`);
    subscribe("marketplace");
    return () => {
      unsubscribe(`orders:${user.id}`);
      unsubscribe(`messages:${user.id}`);
      unsubscribe("marketplace");
    };
  }, [isConnected, user, subscribe, unsubscribe]);

  const value: WebSocketContextType = {
    isConnected,
    networkQuality,
    queueSize,
    transport,
    subscribe,
    unsubscribe,
    send,
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}
