/**
 * WebSocket Hook for Real-time Updates
 *
 * Uses the ResilientConnectionManager for automatic:
 * - Exponential backoff with jitter reconnection
 * - Transport fallback: WebSocket → SSE → polling
 * - Offline message queue (IndexedDB-backed, up to 5000 messages)
 * - Bandwidth detection and adaptive protocol switching
 * - Heartbeat/keepalive (15s interval, 10s timeout)
 *
 * Designed for low-bandwidth, intermittent connectivity in rural Africa.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  useResilientConnection,
  type ConnectionStatus,
  type NetworkQuality,
} from '@/services/resilient-connectivity';

// ============================================================================
// Types
// ============================================================================

export interface RealtimeEvent {
  type: 'farmer_created' | 'farmer_updated' | 'farm_created' | 'farm_updated' | 
        'crop_planted' | 'livestock_added' | 'harvest_recorded' | 'expense_logged' |
        'dashboard_update' | 'notification';
  userId: number;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface WebSocketStatus {
  connected: boolean;
  socketId?: string;
  transport?: string;
  networkQuality?: NetworkQuality;
  queueSize?: number;
  reconnectAttempts?: number;
}

// ============================================================================
// WebSocket Hook (with Resilient Connectivity)
// ============================================================================

export function useWebSocket() {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<WebSocketStatus>({ connected: false });
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

  // Resilient connection for offline queueing and bandwidth adaptation
  const clientId = user ? `user-${user.id}-${Date.now()}` : undefined;
  const { status: resilientStatus, send: resilientSend, subscribe: resilientSubscribe } =
    useResilientConnection(clientId);

  // Map resilient status to WebSocket status
  useEffect(() => {
    setStatus(prev => ({
      ...prev,
      transport: resilientStatus.transport,
      networkQuality: resilientStatus.network.quality,
      queueSize: resilientStatus.queueSize,
      reconnectAttempts: resilientStatus.reconnectAttempts,
    }));
  }, [resilientStatus]);

  // Subscribe to resilient connection messages and forward as events
  useEffect(() => {
    const unsub = resilientSubscribe('realtime_event', (data) => {
      const event = data as RealtimeEvent;
      setLastEvent(event);
      handleEventNotification(event);
    });
    return unsub;
  }, [resilientSubscribe]);

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setStatus(prev => ({ ...prev, connected: false }));
      }
      return;
    }

    const socket = io({
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
      randomizationFactor: 0.5,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus(prev => ({ ...prev, connected: true, socketId: socket.id }));
      socket.emit('authenticate', user.id);

      // Only show toast on first connect, not reconnects
      if (!socketRef.current?.recovered) {
        toast.success('Real-time updates enabled', {
          description: 'You will receive live notifications',
          duration: 3000,
        });
      }
    });

    socket.on('disconnect', (reason) => {
      setStatus(prev => ({ ...prev, connected: false }));
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });

    socket.on('connect_error', () => {
      setStatus(prev => ({ ...prev, connected: false }));
    });

    socket.on('connected', () => {
      // Welcome message received
    });

    socket.on('realtime_event', (event: RealtimeEvent) => {
      setLastEvent(event);
      handleEventNotification(event);
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  const handleEventNotification = (event: RealtimeEvent) => {
    switch (event.type) {
      case 'farmer_created':
        toast.success('New Farmer Registered', {
          description: `${event.data.name} has been added to your records`,
        });
        break;
      
      case 'harvest_recorded':
        toast.success('Harvest Recorded', {
          description: `${event.data.quantity} kg of ${event.data.cropType} harvested`,
        });
        break;
      
      case 'expense_logged':
        toast.info('Expense Logged', {
          description: `${event.data.category}: $${event.data.amount}`,
        });
        break;
      
      case 'notification': {
        const notif = event.data as { type?: string; title?: string; message?: string };
        const toastType = notif.type === 'alert' ? toast.warning : 
                         notif.type === 'error' ? toast.error : toast.info;
        
        toastType(notif.title || 'Notification', {
          description: notif.message,
        });
        break;
      }
    }
  };

  const subscribe = useCallback((channel: string) => {
    if (socketRef.current) {
      socketRef.current.emit('subscribe', channel);
    }
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    if (socketRef.current) {
      socketRef.current.emit('unsubscribe', channel);
    }
  }, []);

  const sendQueued = useCallback(
    (channel: string, payload: unknown, priority?: 'high' | 'normal' | 'low') => {
      return resilientSend(channel, payload, priority);
    },
    [resilientSend],
  );

  return {
    status,
    lastEvent,
    subscribe,
    unsubscribe,
    socket: socketRef.current,
    sendQueued,
    networkQuality: resilientStatus.network.quality,
    isOffline: resilientStatus.state === 'offline',
    pendingMessages: resilientStatus.queueSize,
  };
}

// ============================================================================
// Event-specific Hooks
// ============================================================================

export function useRealtimeEvent(
  eventType: RealtimeEvent['type'],
  callback: (data: Record<string, unknown>) => void
) {
  const { lastEvent } = useWebSocket();

  useEffect(() => {
    if (lastEvent && lastEvent.type === eventType) {
      callback(lastEvent.data);
    }
  }, [lastEvent, eventType, callback]);
}

export function useDashboardUpdates(onUpdate: (update: Record<string, unknown>) => void) {
  useRealtimeEvent('dashboard_update', onUpdate);
}

export function useFarmerEvents(onFarmerEvent: (farmer: Record<string, unknown>) => void) {
  const { lastEvent } = useWebSocket();

  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'farmer_created' || lastEvent.type === 'farmer_updated')) {
      onFarmerEvent(lastEvent.data);
    }
  }, [lastEvent, onFarmerEvent]);
}

export function useHarvestEvents(onHarvestEvent: (harvest: Record<string, unknown>) => void) {
  useRealtimeEvent('harvest_recorded', onHarvestEvent);
}

export function useExpenseEvents(onExpenseEvent: (expense: Record<string, unknown>) => void) {
  useRealtimeEvent('expense_logged', onExpenseEvent);
}
