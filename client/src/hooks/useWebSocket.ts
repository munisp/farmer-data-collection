/**
 * WebSocket Hook for Real-time Updates
 * 
 * Provides real-time event updates from the server
 */

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface RealtimeEvent {
  type: 'farmer_created' | 'farmer_updated' | 'farm_created' | 'farm_updated' | 
        'crop_planted' | 'livestock_added' | 'harvest_recorded' | 'expense_logged' |
        'dashboard_update' | 'notification';
  userId: number;
  data: any;
  timestamp: string;
}

export interface WebSocketStatus {
  connected: boolean;
  socketId?: string;
}

// ============================================================================
// WebSocket Hook
// ============================================================================

export function useWebSocket() {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<WebSocketStatus>({ connected: false });
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

  useEffect(() => {
    if (!user) {
      // Disconnect if user logs out
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setStatus({ connected: false });
      }
      return;
    }

    // Connect to WebSocket server
    const socket = io({
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      console.log('[WebSocket] Connected:', socket.id);
      setStatus({ connected: true, socketId: socket.id });
      
      // Authenticate with user ID
      socket.emit('authenticate', user.id);
      
      toast.success('Real-time updates enabled', {
        description: 'You will receive live notifications',
        duration: 3000,
      });
    });

    socket.on('disconnect', () => {
      console.log('[WebSocket] Disconnected');
      setStatus({ connected: false });
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      setStatus({ connected: false });
    });

    // Welcome message
    socket.on('connected', (data) => {
      console.log('[WebSocket] Welcome:', data);
    });

    // Real-time events
    socket.on('realtime_event', (event: RealtimeEvent) => {
      console.log('[WebSocket] Received event:', event);
      setLastEvent(event);
      
      // Show toast notification for important events
      handleEventNotification(event);
    });

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [user]);

  /**
   * Handle event notifications
   */
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
      
      case 'notification':
        const notif = event.data;
        const toastType = notif.type === 'alert' ? toast.warning : 
                         notif.type === 'error' ? toast.error : toast.info;
        
        toastType(notif.title, {
          description: notif.message,
        });
        break;
    }
  };

  /**
   * Subscribe to specific channel
   */
  const subscribe = (channel: string) => {
    if (socketRef.current) {
      socketRef.current.emit('subscribe', channel);
      console.log('[WebSocket] Subscribed to:', channel);
    }
  };

  /**
   * Unsubscribe from channel
   */
  const unsubscribe = (channel: string) => {
    if (socketRef.current) {
      socketRef.current.emit('unsubscribe', channel);
      console.log('[WebSocket] Unsubscribed from:', channel);
    }
  };

  return {
    status,
    lastEvent,
    subscribe,
    unsubscribe,
    socket: socketRef.current,
  };
}

// ============================================================================
// Event-specific Hooks
// ============================================================================

/**
 * Hook for listening to specific event types
 */
export function useRealtimeEvent(
  eventType: RealtimeEvent['type'],
  callback: (data: any) => void
) {
  const { lastEvent } = useWebSocket();

  useEffect(() => {
    if (lastEvent && lastEvent.type === eventType) {
      callback(lastEvent.data);
    }
  }, [lastEvent, eventType, callback]);
}

/**
 * Hook for dashboard real-time updates
 */
export function useDashboardUpdates(onUpdate: (update: any) => void) {
  useRealtimeEvent('dashboard_update', onUpdate);
}

/**
 * Hook for farmer events
 */
export function useFarmerEvents(onFarmerEvent: (farmer: any) => void) {
  const { lastEvent } = useWebSocket();

  useEffect(() => {
    if (lastEvent && (lastEvent.type === 'farmer_created' || lastEvent.type === 'farmer_updated')) {
      onFarmerEvent(lastEvent.data);
    }
  }, [lastEvent, onFarmerEvent]);
}

/**
 * Hook for harvest events
 */
export function useHarvestEvents(onHarvestEvent: (harvest: any) => void) {
  useRealtimeEvent('harvest_recorded', onHarvestEvent);
}

/**
 * Hook for expense events
 */
export function useExpenseEvents(onExpenseEvent: (expense: any) => void) {
  useRealtimeEvent('expense_logged', onExpenseEvent);
}
