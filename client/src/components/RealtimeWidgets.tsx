/**
 * Real-time Dashboard Widgets
 * 
 * Live widgets showing WebSocket status, recent events, and active alerts
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWebSocket, type RealtimeEvent } from '@/hooks/useWebSocket';
import { 
  Activity, AlertTriangle, Bell, CheckCircle2, 
  Clock, Users, Wheat, DollarSign, XCircle 
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// ============================================================================
// WebSocket Status Widget
// ============================================================================

export function WebSocketStatusWidget() {
  const { status } = useWebSocket();
  const [eventCount, setEventCount] = useState(0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Real-time Connection</CardTitle>
        <div className="relative">
          <Activity className={cn(
            "h-4 w-4",
            status.connected ? "text-green-500" : "text-gray-400"
          )} />
          {status.connected && (
            <span className="absolute -top-1 -right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Status</span>
            <Badge variant={status.connected ? "default" : "secondary"}>
              {status.connected ? 'Connected' : 'Disconnected'}
            </Badge>
          </div>
          {status.socketId && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Socket ID</span>
              <span className="text-xs font-mono">{status.socketId.slice(0, 8)}...</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Events Received</span>
            <span className="text-xs font-semibold">{eventCount}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Recent Events Widget
// ============================================================================

export function RecentEventsWidget() {
  const { lastEvent } = useWebSocket();
  const [events, setEvents] = useState<RealtimeEvent[]>([]);

  useEffect(() => {
    if (lastEvent) {
      setEvents(prev => [lastEvent, ...prev].slice(0, 5));
    }
  }, [lastEvent]);

  const getEventIcon = (type: string) => {
    if (type.includes('farmer')) return <Users className="w-3 h-3" />;
    if (type === 'harvest_recorded') return <Wheat className="w-3 h-3" />;
    if (type === 'expense_logged') return <DollarSign className="w-3 h-3" />;
    return <Activity className="w-3 h-3" />;
  };

  const getEventColor = (type: string) => {
    if (type.includes('farmer')) return 'text-blue-500';
    if (type === 'harvest_recorded') return 'text-green-500';
    if (type === 'expense_logged') return 'text-orange-500';
    return 'text-gray-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
        <CardDescription>Latest events from your farm operations</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event, index) => (
              <div key={`${event.timestamp}-${index}`} className="flex items-start gap-3">
                <div className={cn(
                  "p-1.5 rounded-full bg-muted",
                  getEventColor(event.type)
                )}>
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {formatEventType(event.type)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(event.timestamp), 'MMM d, HH:mm')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Active Alerts Widget
// ============================================================================

interface Alert {
  id: string;
  type: 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: string;
}

export function ActiveAlertsWidget() {
  const { lastEvent } = useWebSocket();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    if (lastEvent && lastEvent.type === 'notification') {
      const alert: Alert = {
        id: `alert-${Date.now()}`,
        type: (lastEvent.data.type as 'error' | 'warning' | 'info') || 'info',
        title: (lastEvent.data.title as string) || '',
        message: (lastEvent.data.message as string) || '',
        timestamp: lastEvent.timestamp,
      };
      setAlerts(prev => [alert, ...prev].slice(0, 3));
    }
  }, [lastEvent]);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Bell className="w-4 h-4 text-blue-500" />;
    }
  };

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
        <CardDescription>Important notifications requiring attention</CardDescription>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500 opacity-50" />
            <p className="text-sm">No active alerts</p>
            <p className="text-xs mt-1">All systems normal</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {getAlertIcon(alert.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium">{alert.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {alert.message}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(alert.timestamp), 'HH:mm')}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => dismissAlert(alert.id)}
                    className="h-6 w-6 p-0"
                  >
                    <XCircle className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Live Activity Feed Widget
// ============================================================================

export function LiveActivityFeedWidget() {
  const { lastEvent } = useWebSocket();
  const [activities, setActivities] = useState<RealtimeEvent[]>([]);

  useEffect(() => {
    if (lastEvent) {
      setActivities(prev => [lastEvent, ...prev].slice(0, 10));
    }
  }, [lastEvent]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Live Activity Feed</CardTitle>
        <CardDescription>Real-time updates from all operations</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Waiting for activity...</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {activities.map((activity, index) => (
              <div
                key={`${activity.timestamp}-${index}`}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="w-2 h-2 rounded-full bg-green-500 mt-2 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{getActivityDescription(activity)}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(activity.timestamp), 'HH:mm:ss')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatEventType(type: string): string {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getActivityDescription(event: RealtimeEvent): string {
  const { type, data } = event;

  switch (type) {
    case 'farmer_created':
      return `New farmer registered: ${data.name || 'Unknown'}`;
    case 'farmer_updated':
      return `Farmer profile updated: ${data.name || 'Unknown'}`;
    case 'harvest_recorded':
      return `Harvest recorded: ${data.quantity || 0} kg of ${data.cropType || 'crop'}`;
    case 'expense_logged':
      return `Expense logged: ${data.category || 'Unknown'} - $${data.amount || 0}`;
    case 'farm_created':
      return `New farm added: ${data.name || 'Unknown'}`;
    case 'crop_planted':
      return `Crop planted: ${data.cropType || 'Unknown'}`;
    case 'dashboard_update':
      return 'Dashboard statistics updated';
    case 'notification':
      return (data.message as string) || 'New notification received';
    default:
      return `Event: ${formatEventType(type)}`;
  }
}
