/**
 * WebSocket Server with Socket.IO
 * 
 * Provides real-time updates to connected clients for:
 * - Farmer registrations
 * - Harvest records
 * - Expense logs
 * - Dashboard statistics
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

export interface RealtimeEvent {
  type: 'farmer_created' | 'farmer_updated' | 'farm_created' | 'farm_updated' | 
        'crop_planted' | 'livestock_added' | 'harvest_recorded' | 'expense_logged' |
        'dashboard_update' | 'notification';
  userId: number;
  data: object;
  timestamp: string;
}

export interface DashboardUpdate {
  totalFarmers?: number;
  totalFarms?: number;
  totalHarvests?: number;
  totalExpenses?: number;
  recentActivity?: unknown[];
}

// ============================================================================
// WebSocket Server
// ============================================================================

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173']
)
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin?: string) {
  if (!origin) return true;
  if (!isProduction) {
    if (origin.includes('manusvm.computer') || origin.includes('manus.computer')) {
      return true;
    }
    if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return true;
    }
  }
  return allowedOrigins.includes(origin);
}

export class WebSocketServer {
  private io: SocketIOServer;
  private connectedUsers: Map<number, Set<string>> = new Map();

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (isAllowedOrigin(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by WebSocket CORS'));
          }
        },
        methods: ['GET', 'POST'],
        credentials: true,
      },
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
    logger.info('[WebSocket] Server initialized');
  }

  /**
   * Set up Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      logger.info(`[WebSocket] Client connected: ${socket.id}`);

      // Handle user authentication
      socket.on('authenticate', (userId: number) => {
        this.authenticateUser(socket.id, userId);
        socket.join(`user:${userId}`);
        logger.info(`[WebSocket] User ${userId} authenticated with socket ${socket.id}`);
      });

      // Handle subscription to specific channels
      socket.on('subscribe', (channel: string) => {
        socket.join(channel);
        logger.info(`[WebSocket] Socket ${socket.id} subscribed to ${channel}`);
      });

      // Handle unsubscribe
      socket.on('unsubscribe', (channel: string) => {
        socket.leave(channel);
        logger.info(`[WebSocket] Socket ${socket.id} unsubscribed from ${channel}`);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket.id);
        logger.info(`[WebSocket] Client disconnected: ${socket.id}`);
      });

      // Send welcome message
      socket.emit('connected', {
        message: 'Connected to real-time server',
        socketId: socket.id,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Authenticate user and track connection
   */
  private authenticateUser(socketId: string, userId: number): void {
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId)!.add(socketId);
  }

  /**
   * Handle socket disconnect
   */
  private handleDisconnect(socketId: string): void {
    // Remove socket from all user connections
    const entries = Array.from(this.connectedUsers.entries());
    for (const [userId, sockets] of entries) {
      if (sockets.has(socketId)) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          this.connectedUsers.delete(userId);
        }
      }
    }
  }

  /**
   * Broadcast event to specific user
   */
  public emitToUser(userId: number, event: RealtimeEvent): void {
    this.io.to(`user:${userId}`).emit('realtime_event', event);
    logger.info(`[WebSocket] Emitted ${event.type} to user ${userId}`);
  }

  /**
   * Broadcast event to all connected clients
   */
  public broadcast(event: RealtimeEvent): void {
    this.io.emit('realtime_event', event);
    logger.info(`[WebSocket] Broadcasted ${event.type} to all clients`);
  }

  /**
   * Emit dashboard update to user
   */
  public emitDashboardUpdate(userId: number, update: DashboardUpdate): void {
    const event: RealtimeEvent = {
      type: 'dashboard_update',
      userId,
      data: update,
      timestamp: new Date().toISOString(),
    };
    this.emitToUser(userId, event);
  }

  /**
   * Emit notification to user
   */
  public emitNotification(userId: number, notification: object): void {
    const event: RealtimeEvent = {
      type: 'notification',
      userId,
      data: notification,
      timestamp: new Date().toISOString(),
    };
    this.emitToUser(userId, event);
  }

  /**
   * Emit farmer created event
   */
  public emitFarmerCreated(userId: number, farmer: object): void {
    const event: RealtimeEvent = {
      type: 'farmer_created',
      userId,
      data: farmer,
      timestamp: new Date().toISOString(),
    };
    this.emitToUser(userId, event);
  }

  /**
   * Emit harvest recorded event
   */
  public emitHarvestRecorded(userId: number, harvest: object): void {
    const event: RealtimeEvent = {
      type: 'harvest_recorded',
      userId,
      data: harvest,
      timestamp: new Date().toISOString(),
    };
    this.emitToUser(userId, event);
  }

  /**
   * Emit expense logged event
   */
  public emitExpenseLogged(userId: number, expense: object): void {
    const event: RealtimeEvent = {
      type: 'expense_logged',
      userId,
      data: expense,
      timestamp: new Date().toISOString(),
    };
    this.emitToUser(userId, event);
  }

  /**
   * Get connected user count
   */
  public getConnectedUserCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Get total socket count
   */
  public getTotalSocketCount(): number {
    return this.io.sockets.sockets.size;
  }

  /**
   * Check if user is connected
   */
  public isUserConnected(userId: number): boolean {
    return this.connectedUsers.has(userId) && 
           this.connectedUsers.get(userId)!.size > 0;
  }

  /**
   * Get server instance
   */
  public getIO(): SocketIOServer {
    return this.io;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let wsServer: WebSocketServer | null = null;

export function initWebSocketServer(httpServer: HTTPServer): WebSocketServer {
  if (!wsServer) {
    wsServer = new WebSocketServer(httpServer);
  }
  return wsServer;
}

export function getWebSocketServer(): WebSocketServer | null {
  return wsServer;
}
