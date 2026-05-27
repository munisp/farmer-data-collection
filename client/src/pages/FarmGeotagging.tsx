/**
 * Farm Geotagging Page
 * Allows farmers to:
 * 1. Geotag their current location as farm center
 * 2. Walk around their farm boundary and capture it
 * 3. View and edit existing boundaries
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { 
  MapPin, Navigation, Play, Square, Save, Trash2, 
  Loader2, AlertTriangle, CheckCircle, Target, 
  Route, Footprints, RefreshCw, Satellite, Radio, Smartphone
} from "lucide-react";
import { MapView, maplibregl } from "@/components/Map";

// RTK GPS Configuration
const RTK_GPS_CONFIG = {
  RTK_FIXED_THRESHOLD: 0.05,      // 5cm - RTK fixed solution
  RTK_FLOAT_THRESHOLD: 0.5,       // 50cm - RTK float solution  
  DGPS_THRESHOLD: 1.0,            // 1m - Differential GPS
  STANDARD_GPS_THRESHOLD: 10.0,   // 10m - Standard GPS
  LOW_ACCURACY_THRESHOLD: 30.0,   // 30m - Low accuracy (smartphone default)
};

// GPS Mode types
type GpsMode = 'smartphone' | 'rtk' | 'survey';

interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  fixStatus?: 'rtk_fixed' | 'rtk_float' | 'dgps' | 'autonomous' | 'no_fix';
}

interface BoundaryPoint extends GeoPoint {
  id: string;
}

// Determine if accuracy qualifies as RTK-calibrated
function isRtkCalibrated(accuracyMeters: number): boolean {
  return accuracyMeters <= RTK_GPS_CONFIG.RTK_FLOAT_THRESHOLD;
}

// Determine capture method based on accuracy
function determineCaptureMethod(accuracyMeters: number): string {
  if (accuracyMeters <= RTK_GPS_CONFIG.RTK_FIXED_THRESHOLD) return 'rtk_rover';
  if (accuracyMeters <= RTK_GPS_CONFIG.RTK_FLOAT_THRESHOLD) return 'rtk_rover';
  if (accuracyMeters <= RTK_GPS_CONFIG.DGPS_THRESHOLD) return 'survey';
  return 'smartphone';
}

// Get fix status label
function getFixStatusLabel(accuracy: number): string {
  if (accuracy <= RTK_GPS_CONFIG.RTK_FIXED_THRESHOLD) return 'RTK Fixed (cm)';
  if (accuracy <= RTK_GPS_CONFIG.RTK_FLOAT_THRESHOLD) return 'RTK Float';
  if (accuracy <= RTK_GPS_CONFIG.DGPS_THRESHOLD) return 'DGPS';
  if (accuracy <= RTK_GPS_CONFIG.STANDARD_GPS_THRESHOLD) return 'Standard GPS';
  return 'Low Accuracy';
}

export default function FarmGeotagging() {
  const [selectedFarmId, setSelectedFarmId] = useState<number | null>(null);
  const [isCapturingCenter, setIsCapturingCenter] = useState(false);
  const [isWalkingBoundary, setIsWalkingBoundary] = useState(false);
  const [boundaryPoints, setBoundaryPoints] = useState<BoundaryPoint[]>([]);
  const [currentLocation, setCurrentLocation] = useState<GeoPoint | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  
  // RTK GPS Mode support
  const [gpsMode, setGpsMode] = useState<GpsMode>('smartphone');
  const [accuracyThreshold, setAccuracyThreshold] = useState(30); // Default 30m for smartphone
  
  // Update accuracy threshold when GPS mode changes
  const handleGpsModeChange = (mode: GpsMode) => {
    setGpsMode(mode);
    switch (mode) {
      case 'rtk':
        setAccuracyThreshold(RTK_GPS_CONFIG.RTK_FLOAT_THRESHOLD); // 0.5m for RTK
        toast.info('RTK Mode: Accuracy threshold set to 0.5m (50cm)');
        break;
      case 'survey':
        setAccuracyThreshold(RTK_GPS_CONFIG.DGPS_THRESHOLD); // 1m for survey
        toast.info('Survey Mode: Accuracy threshold set to 1m');
        break;
      default:
        setAccuracyThreshold(RTK_GPS_CONFIG.LOW_ACCURACY_THRESHOLD); // 30m for smartphone
        toast.info('Smartphone Mode: Accuracy threshold set to 30m');
    }
  };
  
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const boundaryLayerRef = useRef<boolean>(false);

  // Fetch user's farms
  const { data: farms, isLoading: farmsLoading } = trpc.dashboard.getFarms.useQuery();
  
  // Fetch existing boundaries
  const { data: boundaries, refetch: refetchBoundaries } = trpc.spatial.getAllBoundariesGeoJSON.useQuery();

  // Mutations
  const updateFarmLocation = trpc.dashboard.updateFarm.useMutation({
    onSuccess: () => {
      toast.success("Farm center location saved!");
      setIsCapturingCenter(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save farm location");
    },
  });

  const createBoundary = trpc.spatial.importBoundaryFromGeoJSON.useMutation({
    onSuccess: (data) => {
      toast.success(`Boundary saved! Area: ${Number(data.area_hectares || 0).toFixed(2)} hectares`);
      setBoundaryPoints([]);
      setIsWalkingBoundary(false);
      refetchBoundaries();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save boundary");
    },
  });

  // Start watching position
  const startWatchingPosition = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const point: GeoPoint = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };
        setCurrentLocation(point);

        // Update map center
        if (mapRef.current) {
          mapRef.current.setCenter([point.longitude, point.latitude]);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        toast.error(`GPS Error: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    setWatchId(id);
  }, []);

  // Stop watching position
  const stopWatchingPosition = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
  }, [watchId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

  // Handle capturing farm center
  const handleCaptureFarmCenter = () => {
    if (!selectedFarmId) {
      toast.error("Please select a farm first");
      return;
    }

    if (!currentLocation) {
      toast.error("Waiting for GPS signal...");
      startWatchingPosition();
      setIsCapturingCenter(true);
      return;
    }

    if (currentLocation.accuracy > accuracyThreshold) {
      toast.warning(`GPS accuracy is ${currentLocation.accuracy.toFixed(0)}m. Wait for better signal (< ${accuracyThreshold}m)`);
      return;
    }

    // Save farm center location
    updateFarmLocation.mutate({
      id: selectedFarmId,
      latitude: currentLocation.latitude.toString(),
      longitude: currentLocation.longitude.toString(),
    });
  };

  // Start boundary walk
  const handleStartBoundaryWalk = () => {
    if (!selectedFarmId) {
      toast.error("Please select a farm first");
      return;
    }

    setBoundaryPoints([]);
    setIsWalkingBoundary(true);
    startWatchingPosition();
    toast.info("Walk around your farm boundary. Points will be captured automatically.");
  };

  // Add boundary point
  const handleAddBoundaryPoint = () => {
    if (!currentLocation) {
      toast.error("Waiting for GPS signal...");
      return;
    }

    if (currentLocation.accuracy > accuracyThreshold) {
      toast.warning(`GPS accuracy is ${currentLocation.accuracy.toFixed(0)}m. Wait for better signal.`);
      return;
    }

    const newPoint: BoundaryPoint = {
      ...currentLocation,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    setBoundaryPoints((prev) => [...prev, newPoint]);
    toast.success(`Point ${boundaryPoints.length + 1} captured!`);

    // Add marker to map
    if (mapRef.current) {
      const el = document.createElement("div");
      el.className = "boundary-marker";
      el.style.width = "12px";
      el.style.height = "12px";
      el.style.backgroundColor = "#22c55e";
      el.style.borderRadius = "50%";
      el.style.border = "2px solid white";
      el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([currentLocation.longitude, currentLocation.latitude])
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    }
  };

  // Stop boundary walk and save
  const handleStopBoundaryWalk = () => {
    stopWatchingPosition();
    setIsWalkingBoundary(false);

    if (boundaryPoints.length < 3) {
      toast.error("Need at least 3 points to create a boundary");
      return;
    }
  };

  // Save boundary
  const handleSaveBoundary = () => {
    if (!selectedFarmId || boundaryPoints.length < 3) {
      toast.error("Need at least 3 points to create a boundary");
      return;
    }

    // Convert points to GeoJSON polygon coordinates
    const coordinates = boundaryPoints.map((p) => [p.longitude, p.latitude] as [number, number]);
    // Close the polygon
    coordinates.push(coordinates[0]);

    createBoundary.mutate({
      farmId: selectedFarmId,
      name: `Boundary captured on ${new Date().toLocaleDateString()}`,
      geoJSON: {
        type: "Polygon",
        coordinates: [coordinates],
      },
    });
  };

  // Clear boundary points
  const handleClearBoundary = () => {
    setBoundaryPoints([]);
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    
    if (mapRef.current && boundaryLayerRef.current) {
      if (mapRef.current.getLayer("boundary-line")) {
        mapRef.current.removeLayer("boundary-line");
      }
      if (mapRef.current.getSource("boundary-line")) {
        mapRef.current.removeSource("boundary-line");
      }
      boundaryLayerRef.current = false;
    }
    
    toast.info("Boundary points cleared");
  };

  // Update boundary line on map
  useEffect(() => {
    if (!mapRef.current || boundaryPoints.length < 2) return;

    const coordinates = boundaryPoints.map((p) => [p.longitude, p.latitude]);

    if (boundaryLayerRef.current) {
      const source = mapRef.current.getSource("boundary-line") as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: coordinates,
          },
        });
      }
    } else {
      mapRef.current.addSource("boundary-line", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: coordinates,
          },
        },
      });

      mapRef.current.addLayer({
        id: "boundary-line",
        type: "line",
        source: "boundary-line",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#22c55e",
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });

      boundaryLayerRef.current = true;
    }
  }, [boundaryPoints]);

  const selectedFarm = farms?.find((f: any) => f.id === selectedFarmId);
  const accuracyColor = currentLocation
    ? currentLocation.accuracy <= 10
      ? "text-green-500"
      : currentLocation.accuracy <= 30
      ? "text-yellow-500"
      : "text-red-500"
    : "text-gray-400";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Geotag My Farm</h1>
          <p className="text-muted-foreground">
            Capture your farm's location and boundaries using GPS
          </p>
        </div>

        {/* Farm Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Select Farm
            </CardTitle>
            <CardDescription>Choose which farm to geotag</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Farm</Label>
                <Select
                  value={selectedFarmId?.toString() || ""}
                  onValueChange={(v) => setSelectedFarmId(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a farm" />
                  </SelectTrigger>
                  <SelectContent>
                    {farms?.map((farm: any) => (
                      <SelectItem key={farm.id} value={farm.id.toString()}>
                        {farm.farm_name || farm.name || `Farm ${farm.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

                            <div>
                              <Label>GPS Mode</Label>
                              <Select
                                value={gpsMode}
                                onValueChange={(v) => handleGpsModeChange(v as GpsMode)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="smartphone">
                                    <div className="flex items-center gap-2">
                                      <Smartphone className="h-4 w-4" />
                                      Smartphone GPS (30m)
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="rtk">
                                    <div className="flex items-center gap-2">
                                      <Satellite className="h-4 w-4" />
                                      RTK GPS (0.5m / 50cm)
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="survey">
                                    <div className="flex items-center gap-2">
                                      <Radio className="h-4 w-4" />
                                      Survey/DGPS (1m)
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground mt-1">
                                {gpsMode === 'rtk' && 'RTK provides centimeter-level accuracy for survey-grade boundaries'}
                                {gpsMode === 'survey' && 'Survey mode for differential GPS or professional equipment'}
                                {gpsMode === 'smartphone' && 'Standard smartphone GPS for general boundary capture'}
                              </p>
                            </div>
            </div>

            {selectedFarm && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">{selectedFarm.farmName}</p>
                <p className="text-sm text-muted-foreground">
                  Location: {selectedFarm.location || "Not set"}
                </p>
                {selectedFarm.latitude && selectedFarm.longitude && (
                  <p className="text-sm text-muted-foreground">
                    Current location: {parseFloat(selectedFarm.latitude).toFixed(6)}, {parseFloat(selectedFarm.longitude).toFixed(6)}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* GPS Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5" />
              GPS Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Latitude</p>
                <p className="text-lg font-mono">
                  {currentLocation ? currentLocation.latitude.toFixed(6) : "---"}
                </p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Longitude</p>
                <p className="text-lg font-mono">
                  {currentLocation ? currentLocation.longitude.toFixed(6) : "---"}
                </p>
              </div>
                            <div className="text-center p-4 bg-muted rounded-lg">
                              <p className="text-sm text-muted-foreground">Accuracy</p>
                              <p className={`text-lg font-mono ${accuracyColor}`}>
                                {currentLocation ? (
                                  currentLocation.accuracy < 1 
                                    ? `${(currentLocation.accuracy * 100).toFixed(0)}cm` 
                                    : `${currentLocation.accuracy.toFixed(1)}m`
                                ) : "---"}
                              </p>
                            </div>
                            <div className="text-center p-4 bg-muted rounded-lg">
                              <p className="text-sm text-muted-foreground">Fix Type</p>
                              <p className="text-lg">
                                {currentLocation ? (
                                  <Badge 
                                    variant={isRtkCalibrated(currentLocation.accuracy) ? "default" : "secondary"}
                                    className={isRtkCalibrated(currentLocation.accuracy) ? "bg-green-500" : ""}
                                  >
                                    {getFixStatusLabel(currentLocation.accuracy)}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">No Fix</Badge>
                                )}
                              </p>
                            </div>
            </div>

            <div className="mt-4 flex gap-2">
              {watchId === null ? (
                <Button onClick={startWatchingPosition} variant="outline">
                  <Play className="mr-2 h-4 w-4" />
                  Start GPS
                </Button>
              ) : (
                <Button onClick={stopWatchingPosition} variant="outline">
                  <Square className="mr-2 h-4 w-4" />
                  Stop GPS
                </Button>
              )}
              <Button onClick={() => setCurrentLocation(null)} variant="ghost">
                <RefreshCw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Actions */}
          <div className="space-y-4">
            {/* Geotag Farm Center */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Geotag Farm Center
                </CardTitle>
                <CardDescription>
                  Stand at the center of your farm and capture the location
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={handleCaptureFarmCenter}
                  disabled={!selectedFarmId || updateFarmLocation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {updateFarmLocation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <MapPin className="mr-2 h-4 w-4" />
                      Capture Farm Center
                    </>
                  )}
                </Button>

                {currentLocation && currentLocation.accuracy > accuracyThreshold && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Low GPS Accuracy</AlertTitle>
                    <AlertDescription>
                      Current accuracy is {currentLocation.accuracy.toFixed(0)}m. 
                      Wait for accuracy below {accuracyThreshold}m for better results.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* Walk Farm Boundary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Footprints className="h-5 w-5" />
                  Walk Farm Boundary
                </CardTitle>
                <CardDescription>
                  Walk around your farm perimeter to capture the boundary
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isWalkingBoundary ? (
                  <Button
                    onClick={handleStartBoundaryWalk}
                    disabled={!selectedFarmId}
                    className="w-full"
                    size="lg"
                  >
                    <Route className="mr-2 h-4 w-4" />
                    Start Boundary Walk
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <Alert>
                      <Footprints className="h-4 w-4" />
                      <AlertTitle>Walking Boundary</AlertTitle>
                      <AlertDescription>
                        Walk around your farm. Tap "Add Point" at each corner or turn.
                      </AlertDescription>
                    </Alert>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleAddBoundaryPoint}
                        className="flex-1"
                        disabled={!currentLocation || currentLocation.accuracy > accuracyThreshold}
                      >
                        <MapPin className="mr-2 h-4 w-4" />
                        Add Point ({boundaryPoints.length})
                      </Button>
                      <Button onClick={handleStopBoundaryWalk} variant="secondary">
                        <Square className="mr-2 h-4 w-4" />
                        Stop
                      </Button>
                    </div>

                    <Progress value={(boundaryPoints.length / 10) * 100} className="h-2" />
                    <p className="text-sm text-muted-foreground text-center">
                      {boundaryPoints.length} points captured (minimum 3 required)
                    </p>
                  </div>
                )}

                {boundaryPoints.length >= 3 && !isWalkingBoundary && (
                  <div className="space-y-2">
                    <Button
                      onClick={handleSaveBoundary}
                      disabled={createBoundary.isPending}
                      className="w-full"
                      variant="default"
                    >
                      {createBoundary.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving Boundary...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Boundary ({boundaryPoints.length} points)
                        </>
                      )}
                    </Button>
                    <Button onClick={handleClearBoundary} variant="outline" className="w-full">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Clear Points
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Existing Boundaries */}
            {boundaries && boundaries.features && boundaries.features.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Existing Boundaries
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {boundaries.features.map((feature: any) => (
                      <div
                        key={feature.properties.id}
                        className="p-3 border rounded-lg flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium">{feature.properties.farm_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {Number(feature.properties.area_hectares || 0).toFixed(2)} hectares
                          </p>
                        </div>
                        <Badge variant="outline">
                          {Number(feature.properties.perimeter_m || 0).toFixed(0)}m perimeter
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Map */}
          <Card className="h-[600px]">
            <CardHeader className="pb-2">
              <CardTitle>Map View</CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(100%-60px)]">
              <MapView
                initialCenter={
                  currentLocation
                    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
                    : { lat: 0.0236, lng: 37.9062 }
                }
                initialZoom={15}
                onMapReady={(map) => {
                  mapRef.current = map;
                }}
                className="h-full w-full rounded-lg"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
