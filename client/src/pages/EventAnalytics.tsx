import { trpc } from "@/lib/trpc";
/**
 * Event Analytics Dashboard
 * 
 * Displays real-time event streams, trends, and statistics
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWebSocket, useRealtimeEvent } from '@/hooks/useWebSocket';
import { 
  Activity, TrendingUp, Users, Wheat, DollarSign, 
  Calendar, Filter, Download, RefreshCw 
} from 'lucide-react';
import { format } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface EventRecord {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface EventStats {
  totalEvents: number;
  farmerEvents: number;
  harvestEvents: number;
  expenseEvents: number;
}

// ============================================================================
// Event Analytics Dashboard
// ============================================================================

export default function EventAnalytics() {
  const { status, lastEvent } = useWebSocket();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [stats, setStats] = useState<EventStats>({
    totalEvents: 0,
    farmerEvents: 0,
    harvestEvents: 0,
    expenseEvents: 0,
  });
  const [filter, setFilter] = useState<string>('all');

  // Listen for real-time events
  useEffect(() => {
    if (lastEvent) {
      const newEvent: EventRecord = {
        id: `${Date.now()}-${Math.random()}`,
        type: lastEvent.type,
        timestamp: lastEvent.timestamp,
        data: lastEvent.data,
      };

      setEvents(prev => [newEvent, ...prev].slice(0, 100)); // Keep last 100 events

      // Update stats
      setStats(prev => ({
        totalEvents: prev.totalEvents + 1,
        farmerEvents: prev.farmerEvents + (lastEvent.type.includes('farmer') ? 1 : 0),
        harvestEvents: prev.harvestEvents + (lastEvent.type === 'harvest_recorded' ? 1 : 0),
        expenseEvents: prev.expenseEvents + (lastEvent.type === 'expense_logged' ? 1 : 0),
      }));
    }
  }, [lastEvent]);

  // Filter events
  const filteredEvents = events.filter(event => {
    if (filter === 'all') return true;
    if (filter === 'farmer') return event.type.includes('farmer');
    if (filter === 'harvest') return event.type === 'harvest_recorded';
    if (filter === 'expense') return event.type === 'expense_logged';
    return true;
  });

  return (
    <div role="main" aria-label="Page content" className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Event Analytics</h1>
          <p className="text-muted-foreground">
            Real-time event streams and analytics
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <Badge variant={status.connected ? "default" : "secondary"}>
            <Activity className="w-3 h-3 mr-1" />
            {status.connected ? 'Live' : 'Offline'}
          </Badge>
          
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button variant="outline" size="sm" onClick={() => setEvents([])}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEvents}</div>
            <p className="text-xs text-muted-foreground">
              All event types
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Farmer Events</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.farmerEvents}</div>
            <p className="text-xs text-muted-foreground">
              Registrations & updates
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Harvest Events</CardTitle>
            <Wheat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.harvestEvents}</div>
            <p className="text-xs text-muted-foreground">
              Harvest records
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expense Events</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.expenseEvents}</div>
            <p className="text-xs text-muted-foreground">
              Financial records
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Event Feed */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Real-time Event Feed</CardTitle>
              <CardDescription>
                Live stream of events as they happen
              </CardDescription>
            </div>
            
            {/* Filter Tabs */}
            <Tabs value={filter} onValueChange={setFilter} className="w-auto">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="farmer">Farmers</TabsTrigger>
                <TabsTrigger value="harvest">Harvests</TabsTrigger>
                <TabsTrigger value="expense">Expenses</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>No events yet. Events will appear here in real-time.</p>
              {!status.connected && (
                <p className="text-sm mt-2">
                  Waiting for connection...
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filteredEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Event Timeline</CardTitle>
          <CardDescription>
            Visual timeline of events over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {events.slice(0, 10).map((event, index) => (
              <div key={event.id} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full ${
                    event.type.includes('farmer') ? 'bg-blue-500' :
                    event.type === 'harvest_recorded' ? 'bg-green-500' :
                    event.type === 'expense_logged' ? 'bg-orange-500' :
                    'bg-gray-500'
                  }`} />
                  {index < events.slice(0, 10).length - 1 && (
                    <div className="w-0.5 h-12 bg-border" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{formatEventType(event.type)}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(event.timestamp), 'HH:mm:ss')}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {getEventDescription(event)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Event Card Component
// ============================================================================

function EventCard({ event }: { event: EventRecord }) {
  const getEventIcon = (type: string) => {
    if (type.includes('farmer')) return <Users className="w-4 h-4" />;
    if (type === 'harvest_recorded') return <Wheat className="w-4 h-4" />;
    if (type === 'expense_logged') return <DollarSign className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  };

  const getEventColor = (type: string) => {
    if (type.includes('farmer')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
    if (type === 'harvest_recorded') return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
    if (type === 'expense_logged') return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300';
  };

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className={`p-2 rounded-lg ${getEventColor(event.type)}`}>
        {getEventIcon(event.type)}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-medium truncate">{formatEventType(event.type)}</h4>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {format(new Date(event.timestamp), 'MMM d, HH:mm:ss')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {getEventDescription(event)}
        </p>
        {event.data && (
          <div className="mt-2 text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
            {JSON.stringify(event.data, null, 2).slice(0, 200)}
            {JSON.stringify(event.data).length > 200 && '...'}
          </div>
        )}
      </div>
    </div>
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

function getEventDescription(event: EventRecord): string {
  const { type, data } = event;

  switch (type) {
    case 'farmer_created':
      return `New farmer registered: ${data.name || 'Unknown'}`;
    case 'farmer_updated':
      return `Farmer profile updated: ${data.name || 'Unknown'}`;
    case 'harvest_recorded':
      return `Harvest: ${data.quantity || 0} kg of ${data.cropType || 'crop'}`;
    case 'expense_logged':
      return `Expense: ${data.category || 'Unknown'} - $${data.amount || 0}`;
    case 'farm_created':
      return `New farm added: ${data.name || 'Unknown'}`;
    case 'crop_planted':
      return `Crop planted: ${data.cropType || 'Unknown'}`;
    default:
      return `Event: ${type}`;
  }
}
