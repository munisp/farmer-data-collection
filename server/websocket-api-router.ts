/**
 * WebSocket API Router
 * 
 * HTTP API endpoints for broadcasting events to WebSocket clients
 * Used by Python event consumers to push real-time updates
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { getWebSocketServer, type RealtimeEvent } from './websocket-server';
import { logger } from './logger.js';

const router = Router();

// ============================================================================
// Middleware
// ============================================================================

/**
 * Verify WebSocket server is available
 */
function requireWebSocket(_req: Request, res: Response, next: NextFunction) {
  const wsServer = getWebSocketServer();
  if (!wsServer) {
    return res.status(503).json({
      success: false,
      error: 'WebSocket server not initialized',
    });
  }
  next();
}

router.use(requireWebSocket);

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * GET /api/websocket/status
 * Get WebSocket server status
 */
router.get('/status', (_req: Request, res: Response) => {
  const wsServer = getWebSocketServer()!;
  
  res.json({
    success: true,
    data: {
      connected: true,
      connectedUsers: wsServer.getConnectedUserCount(),
      totalSockets: wsServer.getTotalSocketCount(),
    },
  });
});

/**
 * POST /api/websocket/broadcast
 * Broadcast event to all connected clients
 */
router.post('/broadcast', (req: Request, res: Response) => {
  const wsServer = getWebSocketServer()!;
  const event: RealtimeEvent = req.body;
  
  if (!event || !event.type) {
    return res.status(400).json({
      success: false,
      error: 'Invalid event format',
    });
  }
  
  try {
    wsServer.broadcast(event);
    
    res.json({
      success: true,
      message: `Event ${event.type} broadcasted`,
    });
  } catch (error) {
    logger.error('[WebSocket API] Broadcast error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to broadcast event',
    });
  }
});

/**
 * POST /api/websocket/emit-to-user
 * Emit event to specific user
 */
router.post('/emit-to-user', (req: Request, res: Response) => {
  const wsServer = getWebSocketServer()!;
  const { userId, event } = req.body;
  
  if (!userId || !event || !event.type) {
    return res.status(400).json({
      success: false,
      error: 'userId and event are required',
    });
  }
  
  try {
    wsServer.emitToUser(userId, event);
    
    res.json({
      success: true,
      message: `Event ${event.type} emitted to user ${userId}`,
      userConnected: wsServer.isUserConnected(userId),
    });
  } catch (error) {
    logger.error('[WebSocket API] Emit error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to emit event',
    });
  }
});

/**
 * POST /api/websocket/dashboard-update
 * Send dashboard update to user
 */
router.post('/dashboard-update', (req: Request, res: Response) => {
  const wsServer = getWebSocketServer()!;
  const { userId, update } = req.body;
  
  if (!userId || !update) {
    return res.status(400).json({
      success: false,
      error: 'userId and update are required',
    });
  }
  
  try {
    wsServer.emitDashboardUpdate(userId, update);
    
    res.json({
      success: true,
      message: `Dashboard update sent to user ${userId}`,
    });
  } catch (error) {
    logger.error('[WebSocket API] Dashboard update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send dashboard update',
    });
  }
});

/**
 * POST /api/websocket/notification
 * Send notification to user
 */
router.post('/notification', (req: Request, res: Response) => {
  const wsServer = getWebSocketServer()!;
  const { userId, notification } = req.body;
  
  if (!userId || !notification) {
    return res.status(400).json({
      success: false,
      error: 'userId and notification are required',
    });
  }
  
  try {
    wsServer.emitNotification(userId, notification);
    
    res.json({
      success: true,
      message: `Notification sent to user ${userId}`,
    });
  } catch (error) {
    logger.error('[WebSocket API] Notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification',
    });
  }
});

/**
 * GET /api/websocket/user/:userId/connected
 * Check if user is connected
 */
router.get('/user/:userId/connected', (req: Request, res: Response) => {
  const wsServer = getWebSocketServer()!;
  const userId = parseInt(req.params.userId);
  
  if (isNaN(userId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid userId',
    });
  }
  
  res.json({
    success: true,
    data: {
      userId,
      connected: wsServer.isUserConnected(userId),
    },
  });
});

export default router;
