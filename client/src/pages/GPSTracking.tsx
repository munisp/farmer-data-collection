import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MapPin, Navigation, Activity, TrendingUp, Plus, Trash2, Loader2, Signal, AlertTriangle } from "lucide-react";
import { MapView, maplibregl } from "@/components/Map";

export default function GPSTracking() {
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // Real tRPC queries - no mock data
  const { data: devices, isLoading: devicesLoading, refetch: refetchDevices } = trpc.gpsTracking.getDevices.useQuery();
  
  const { data: tracks, isLoading: tracksLoading } = trpc.gpsTracking.getDeviceTracks.useQuery(
    { deviceId: selectedDevice!, limit: 500 },
    { enabled: !!selectedDevice }
  );
  
  const { data: statistics } = trpc.gpsTracking.getTrackStatistics.useQuery(
    { deviceId: selectedDevice! },
    { enabled: !!selectedDevice }
  );

  // Mutations
  const registerDevice = trpc.gpsTracking.registerDevice.useMutation({
    onSuccess: () => {
      toast.success("GPS device registered successfully");
      refetchDevices();
      setIsRegisterDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to register device");
    },
  });

  const deleteDevice = trpc.gpsTracking.deleteDevice.useMutation({
    onSuccess: () => {
      toast.success("Device deleted");
      refetchDevices();
      if (selectedDevice) setSelectedDevice(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete device");
    },
  });

  // Update map markers when tracks change
  useEffect(() => {
    if (!mapRef.current || !tracks || tracks.length === 0) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add markers for each track point
    tracks.forEach((track: any, index: number) => {
      const lat = parseFloat(track.latitude);
      const lng = parseFloat(track.longitude);
      
      if (isNaN(lat) || isNaN(lng)) return;

      const el = document.createElement('div');
      el.className = 'gps-track-marker';
      el.style.width = index === 0 ? '16px' : '8px';
      el.style.height = index === 0 ? '16px' : '8px';
      el.style.backgroundColor = index === 0 ? '#22c55e' : '#3b82f6';
      el.style.borderRadius = '50%';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(`
            <div style="padding: 8px;">
              <strong>${index === 0 ? 'Latest Position' : `Point ${tracks.length - index}`}</strong><br/>
              <small>Lat: ${lat.toFixed(6)}</small><br/>
              <small>Lng: ${lng.toFixed(6)}</small><br/>
              <small>Time: ${new Date(track.timestamp).toLocaleString()}</small><br/>
              ${track.speed ? `<small>Speed: ${parseFloat(track.speed).toFixed(2)} m/s</small><br/>` : ''}
              ${track.accuracy ? `<small>Accuracy: ${parseFloat(track.accuracy).toFixed(1)}m</small>` : ''}
            </div>
          `)
        )
        .addTo(mapRef.current!);

      markersRef.current.push(marker);
    });

    // Draw polyline connecting track points
    const coordinates = tracks
      .map((t: any) => [parseFloat(t.longitude), parseFloat(t.latitude)])
      .filter((c: number[]) => !isNaN(c[0]) && !isNaN(c[1]))
      .reverse();

    if (coordinates.length > 1) {
      if (mapRef.current.getLayer('track-line')) {
        mapRef.current.removeLayer('track-line');
      }
      if (mapRef.current.getSource('track-line')) {
        mapRef.current.removeSource('track-line');
      }

      mapRef.current.addSource('track-line', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates,
          },
        },
      });

      mapRef.current.addLayer({
        id: 'track-line',
        type: 'line',
        source: 'track-line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 3,
          'line-opacity': 0.8,
        },
      });
    }

    // Fit map to track bounds
    if (coordinates.length > 0) {
      const bounds = coordinates.reduce(
        (bounds: maplibregl.LngLatBounds, coord: number[]) => bounds.extend(coord as [number, number]),
        new maplibregl.LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number])
      );
      mapRef.current.fitBounds(bounds, { padding: 50 });
    }
  }, [tracks]);

  const handleDeviceSelect = (deviceId: number) => {
    setSelectedDevice(deviceId);
  };

  const handleRegisterDevice = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    registerDevice.mutate({
      deviceId: formData.get("deviceId") as string,
      name: formData.get("name") as string,
      deviceType: formData.get("deviceType") as string || "smartphone",
    });
  };

  const handleDeleteDevice = (deviceId: number) => {
    if (confirm("Are you sure you want to delete this device and all its tracks?")) {
      deleteDevice.mutate({ deviceId });
    }
  };

  const activeDevicesCount = devices?.filter((d: any) => d.status === 'active').length || 0;
  const selectedDeviceInfo = devices?.find((d: any) => d.id === selectedDevice);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">GPS Tracking</h1>
            <p className="text-muted-foreground">Real-time device location monitoring and track history</p>
          </div>
          <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Register Device
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Register GPS Device</DialogTitle>
                <DialogDescription>Add a new GPS tracking device to your account</DialogDescription>
              </DialogHeader>
              <form aria-label="Submit form" onSubmit={handleRegisterDevice} className="space-y-4">
                <div>
                  <Label htmlFor="deviceId">Device ID</Label>
                  <Input id="deviceId" name="deviceId" placeholder="e.g., GPS-001 or device IMEI" required />
                </div>
                <div>
                  <Label htmlFor="name">Device Name</Label>
                  <Input id="name" name="name" placeholder="e.g., Tractor GPS, Field Drone" required />
                </div>
                <div>
                  <Label htmlFor="deviceType">Device Type</Label>
                  <Select name="deviceType" defaultValue="smartphone">
                    <SelectTrigger>
                      <SelectValue placeholder="Select device type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smartphone">Smartphone</SelectItem>
                      <SelectItem value="gps_tracker">GPS Tracker</SelectItem>
                      <SelectItem value="drone">Drone</SelectItem>
                      <SelectItem value="vehicle">Vehicle GPS</SelectItem>
                      <SelectItem value="handheld">Handheld Device</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsRegisterDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={registerDevice.isPending}>
                    {registerDevice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Register
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Devices</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeDevicesCount}</div>
              <p className="text-xs text-muted-foreground">Currently tracking</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tracks</CardTitle>
              <Navigation className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(statistics as any)?.total_points || 0}</div>
              <p className="text-xs text-muted-foreground">GPS points recorded</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Accuracy</CardTitle>
              <Signal className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(statistics as any)?.avg_accuracy ? `${parseFloat((statistics as any).avg_accuracy).toFixed(1)}m` : 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">GPS signal quality</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Days Tracked</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(statistics as any)?.days_tracked || 0}</div>
              <p className="text-xs text-muted-foreground">Total tracking days</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Devices List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>GPS Devices</CardTitle>
              <CardDescription>Select a device to view tracking data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {devicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !devices || devices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No GPS devices registered</p>
                  <p className="text-sm">Click "Register Device" to add one</p>
                </div>
              ) : (
                devices.map((device: any) => (
                  <div
                    key={device.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedDevice === device.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                    }`}
                    onClick={() => handleDeviceSelect(device.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{device.name}</h3>
                      <div className="flex items-center gap-2">
                        <Badge variant={device.status === 'active' ? 'default' : 'secondary'}>{device.status}</Badge>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleDeleteDevice(device.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">ID: {device.device_id}</p>
                    <p className="text-sm text-muted-foreground">Type: {device.device_type || 'Unknown'}</p>
                    {device.farm_name && <p className="text-sm text-muted-foreground">Farm: {device.farm_name}</p>}
                    {device.last_latitude && device.last_longitude && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Last: {parseFloat(device.last_latitude).toFixed(4)}, {parseFloat(device.last_longitude).toFixed(4)}
                      </p>
                    )}
                    {device.last_seen_at && (
                      <p className="text-xs text-muted-foreground">Seen: {new Date(device.last_seen_at).toLocaleString()}</p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Tracking Data */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{selectedDeviceInfo ? `Tracking: ${selectedDeviceInfo.name}` : 'Tracking Data'}</CardTitle>
              <CardDescription>{selectedDevice ? 'GPS tracks, map view, and statistics' : 'Select a device to view data'}</CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedDevice ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a GPS device to view tracking data</p>
                </div>
              ) : (
                <Tabs defaultValue="map" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="map">Map View</TabsTrigger>
                    <TabsTrigger value="tracks">GPS Tracks</TabsTrigger>
                    <TabsTrigger value="statistics">Statistics</TabsTrigger>
                  </TabsList>

                  <TabsContent value="map" className="space-y-4">
                    <div className="h-[400px] rounded-lg overflow-hidden border">
                      <MapView
                        initialCenter={{ lat: 0.0236, lng: 37.9062 }}
                        initialZoom={6}
                        onMapReady={(map) => { mapRef.current = map; }}
                        className="h-full w-full"
                      />
                    </div>
                    {tracksLoading && (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span>Loading tracks...</span>
                      </div>
                    )}
                    {!tracksLoading && (!tracks || tracks.length === 0) && (
                      <div className="text-center py-4 text-muted-foreground">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No GPS tracks recorded for this device</p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="tracks" className="space-y-4">
                    {tracksLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : !tracks || tracks.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Navigation className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No GPS tracks recorded yet</p>
                      </div>
                    ) : (
                      <div className="max-h-[400px] overflow-y-auto space-y-2">
                        {tracks.map((track: any) => (
                          <div key={track.id} className="p-3 border rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">
                                {parseFloat(track.latitude).toFixed(6)}, {parseFloat(track.longitude).toFixed(6)}
                              </span>
                              {track.activity && <Badge variant="outline">{track.activity}</Badge>}
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{new Date(track.timestamp).toLocaleString()}</span>
                              <div className="flex gap-2">
                                {track.speed && <span>Speed: {parseFloat(track.speed).toFixed(2)} m/s</span>}
                                {track.accuracy && <span>Acc: {parseFloat(track.accuracy).toFixed(1)}m</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="statistics" className="space-y-4">
                    {statistics ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div role="main" aria-label="Page content" className="p-4 border rounded-lg">
                          <p className="text-sm text-muted-foreground">Total Points</p>
                          <p className="text-2xl font-bold">{(statistics as any).total_points || 0}</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <p className="text-sm text-muted-foreground">Days Tracked</p>
                          <p className="text-2xl font-bold">{(statistics as any).days_tracked || 0}</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <p className="text-sm text-muted-foreground">Avg Accuracy</p>
                          <p className="text-2xl font-bold">{(statistics as any).avg_accuracy ? `${parseFloat((statistics as any).avg_accuracy).toFixed(1)}m` : 'N/A'}</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <p className="text-sm text-muted-foreground">Avg Speed</p>
                          <p className="text-2xl font-bold">{(statistics as any).avg_speed ? `${parseFloat((statistics as any).avg_speed).toFixed(2)} m/s` : 'N/A'}</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <p className="text-sm text-muted-foreground">Max Speed</p>
                          <p className="text-2xl font-bold">{(statistics as any).max_speed ? `${parseFloat((statistics as any).max_speed).toFixed(2)} m/s` : 'N/A'}</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                          <p className="text-sm text-muted-foreground">Devices Used</p>
                          <p className="text-2xl font-bold">{(statistics as any).devices_used || 1}</p>
                        </div>
                        {(statistics as any).first_track && (
                          <div className="p-4 border rounded-lg col-span-2">
                            <p className="text-sm text-muted-foreground">Tracking Period</p>
                            <p className="text-lg font-medium">
                              {new Date((statistics as any).first_track).toLocaleDateString()} - {new Date((statistics as any).last_track).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No statistics available</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
