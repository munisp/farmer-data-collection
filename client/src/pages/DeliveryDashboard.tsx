import { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Truck, MapPin, Thermometer, Package, Users, Route, Star, Clock, Navigation, Wifi, WifiOff } from "lucide-react";
import { MapView, maplibregl } from "@/components/Map";
import { useLocalization } from "@/contexts/LocalizationContext";

const GPS_STREAMING_WS_URL = import.meta.env.VITE_GPS_STREAMING_WS_URL || 'ws://localhost:8098';

interface DriverPosition {
  driver_id: number;
  delivery_id: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number;
  heading: number;
  timestamp: string;
}

interface TrackingUpdate {
  type: string;
  position?: DriverPosition;
  eta?: { distance_m: number; est_minutes: number; avg_speed_kmh: number };
  geofence?: { delivery_id: number; distance_m: number; message: string };
}

function LiveTrackingMap({ deliveryId }: { deliveryId: number | null }) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<TrackingUpdate | null>(null);
  const [positions, setPositions] = useState<DriverPosition[]>([]);

  const connectWS = useCallback(() => {
    if (!deliveryId || wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${GPS_STREAMING_WS_URL}/ws/track/${deliveryId}`);

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const update: TrackingUpdate = JSON.parse(event.data);
        setLastUpdate(update);

        if (update.type === 'position' && update.position) {
          const pos = update.position;
          setPositions(prev => [...prev.slice(-99), pos]);

          // Update or create marker on map
          if (mapRef.current) {
            const existing = markersRef.current.get(pos.driver_id);
            if (existing) {
              existing.setLngLat([pos.longitude, pos.latitude]);
            } else {
              const el = document.createElement('div');
              el.style.width = '32px';
              el.style.height = '32px';
              el.style.backgroundImage = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23ef4444\' stroke=\'white\' stroke-width=\'1\'%3E%3Ccircle cx=\'12\' cy=\'12\' r=\'10\'/%3E%3Cpath d=\'M8 16l4-8 4 8H8z\' fill=\'white\'/%3E%3C/svg%3E")';
              el.style.backgroundSize = 'cover';

              const marker = new maplibregl.Marker({ element: el })
                .setLngLat([pos.longitude, pos.latitude])
                .setPopup(new maplibregl.Popup().setHTML(
                  `<strong>Driver ${pos.driver_id}</strong><br/>Speed: ${(pos.speed * 3.6).toFixed(1)} km/h`
                ))
                .addTo(mapRef.current);

              markersRef.current.set(pos.driver_id, marker);
            }

            mapRef.current.panTo([pos.longitude, pos.latitude]);
          }
        }

        if (update.type === 'history' && (update as any).positions) {
          setPositions((update as any).positions);
        }
      } catch (err) {
        console.debug('[Delivery] WebSocket parse error:', String(err));
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 3s
      setTimeout(connectWS, 3000);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    wsRef.current = ws;
  }, [deliveryId]);

  useEffect(() => {
    connectWS();
    return () => {
      wsRef.current?.close();
    };
  }, [connectWS]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {connected ? (
            <Badge className="bg-green-500"><Wifi className="mr-1 h-3 w-3" />Connected</Badge>
          ) : (
            <Badge variant="secondary"><WifiOff className="mr-1 h-3 w-3" />Disconnected</Badge>
          )}
          {positions.length > 0 && (
            <span className="text-sm text-muted-foreground">{positions.length} positions</span>
          )}
        </div>
        {lastUpdate?.eta && (
          <div className="text-right">
            <p className="text-sm font-medium">ETA: {lastUpdate.eta.est_minutes.toFixed(0)} min</p>
            <p className="text-xs text-muted-foreground">
              {(lastUpdate.eta.distance_m / 1000).toFixed(1)} km at {lastUpdate.eta.avg_speed_kmh.toFixed(0)} km/h
            </p>
          </div>
        )}
      </div>

      {lastUpdate?.geofence && (
        <div role="main" aria-label="Page content" className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800">
            <Navigation className="inline mr-1 h-4 w-4" />
            {lastUpdate.geofence.message}
          </p>
        </div>
      )}

      <div className="h-[400px] rounded-lg overflow-hidden">
        <MapView
          initialCenter={{ lat: 7.4951, lng: 3.3792 }}
          initialZoom={12}
          onMapReady={(map) => { mapRef.current = map; }}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}

export default function DeliveryDashboard() {
  const { formatCurrency } = useLocalization();
  const [activeTab, setActiveTab] = useState("zones");
  const [trackingDeliveryId, setTrackingDeliveryId] = useState<number | null>(null);
  const [deliveryIdInput, setDeliveryIdInput] = useState("");
  const zones = trpc.delivery.listZones.useQuery({ active: true });
  const collectionPoints = trpc.delivery.listCollectionPoints.useQuery({});
  const hubs = trpc.delivery.listHubs.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Delivery & Supply Chain</h1>
          <p className="text-muted-foreground">Manage collection points, delivery zones, and fleet operations</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <MapPin className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{zones.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Delivery Zones</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{collectionPoints.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Collection Points</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Thermometer className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">{hubs.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Aggregation Hubs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Truck className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">—</p>
                  <p className="text-sm text-muted-foreground">Active Drivers</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="zones">Delivery Zones</TabsTrigger>
            <TabsTrigger value="collection">Collection Points</TabsTrigger>
            <TabsTrigger value="hubs">Aggregation Hubs</TabsTrigger>
            <TabsTrigger value="tracking">Live Tracking</TabsTrigger>
          </TabsList>

          <TabsContent value="zones" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Delivery Zones</CardTitle>
                <CardDescription>Geographic zones with pricing and coverage areas</CardDescription>
              </CardHeader>
              <CardContent>
                {zones.isLoading ? (
                  <p>Loading zones...</p>
                ) : zones.data && zones.data.length > 0 ? (
                  <div className="space-y-3">
                    {zones.data.map((zone: Record<string, unknown>) => (
                      <div key={zone.id as number} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{zone.name as string}</p>
                          <p className="text-sm text-muted-foreground">{zone.city as string}, {zone.country as string}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={zone.active ? "default" : "secondary"}>
                            {zone.active ? "Active" : "Inactive"}
                          </Badge>
                          <p className="text-sm mt-1">Base: {formatCurrency(zone.baseFee as number)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No delivery zones configured yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="collection" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Collection Points</CardTitle>
                <CardDescription>Farmer produce drop-off locations</CardDescription>
              </CardHeader>
              <CardContent>
                {collectionPoints.data && collectionPoints.data.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {collectionPoints.data.map((point: Record<string, unknown>) => (
                      <div key={point.id as number} className="p-4 border rounded-lg">
                        <h3 className="font-medium">{point.name as string}</h3>
                        <p className="text-sm text-muted-foreground">{point.address as string || "No address"}</p>
                        <div className="flex gap-4 mt-2 text-sm">
                          <span>Capacity: {point.capacityTons as string} tons</span>
                          {point.contactPhone != null && <span>Tel: {String(point.contactPhone)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No collection points configured</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hubs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Aggregation Hubs</CardTitle>
                <CardDescription>Central processing and grading facilities</CardDescription>
              </CardHeader>
              <CardContent>
                {hubs.data && hubs.data.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {hubs.data.map((hub: Record<string, unknown>) => (
                      <div key={hub.id as number} className="p-4 border rounded-lg">
                        <h3 className="font-medium">{hub.name as string}</h3>
                        <div className="flex gap-2 mt-2">
                          {hub.gradingEnabled === true && <Badge>AI Grading</Badge>}
                          <Badge variant="outline">Cold: {hub.coldStorageCapacityTons as string}T</Badge>
                          <Badge variant="outline">Process: {hub.processingCapacityTons as string}T</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No aggregation hubs configured</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tracking">
            <Card>
              <CardHeader>
                <CardTitle>Live Delivery Tracking</CardTitle>
                <CardDescription>Real-time driver GPS positions via WebSocket (Go service on :8098)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Enter delivery ID to track..."
                    value={deliveryIdInput}
                    onChange={(e) => setDeliveryIdInput(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button
                    onClick={() => {
                      const id = parseInt(deliveryIdInput, 10);
                      if (id > 0) setTrackingDeliveryId(id);
                    }}
                    disabled={!deliveryIdInput}
                  >
                    <Navigation className="mr-2 h-4 w-4" />
                    Track
                  </Button>
                  {trackingDeliveryId && (
                    <Button variant="outline" onClick={() => setTrackingDeliveryId(null)}>
                      Stop
                    </Button>
                  )}
                </div>
                {trackingDeliveryId ? (
                  <LiveTrackingMap deliveryId={trackingDeliveryId} />
                ) : (
                  <div className="flex items-center justify-center h-64 border-2 border-dashed rounded-lg">
                    <div className="text-center">
                      <Truck className="h-12 w-12 mx-auto text-muted-foreground" />
                      <p className="mt-2 text-muted-foreground">Enter a delivery ID above to start live tracking</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
