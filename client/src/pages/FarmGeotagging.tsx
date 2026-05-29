/**
 * Farm Geotagging Page — Advanced Land Measurement
 * 
 * Features:
 * 1. Geotag farm center with GPS
 * 2. Walk boundary with manual or auto-capture
 * 3. Live area/perimeter display during walk
 * 4. Undo last point
 * 5. Unit conversion (hectares, acres, plots, sqm)
 * 6. Accuracy averaging (multi-reading per point)
 * 7. Import boundary from satellite imagery or drone flights
 * 8. RTK/DGPS/Smartphone GPS modes
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { 
  MapPin, Navigation, Play, Square, Save, Trash2, 
  Loader2, AlertTriangle, CheckCircle, Target, 
  Route, Footprints, RefreshCw, Satellite, Radio, Smartphone,
  Undo2, Timer, Upload, Ruler, AreaChart
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

// Auto-capture configuration
const AUTO_CAPTURE_INTERVAL_MS = 3000;  // 3 seconds between auto-captures
const AUTO_CAPTURE_MIN_DISTANCE_M = 5;  // minimum 5m between auto-captures
const ACCURACY_AVERAGING_READINGS = 5;  // average 5 readings per point

// Unit conversion factors
type AreaUnit = 'hectares' | 'acres' | 'sqm' | 'plots';
const AREA_CONVERSIONS: Record<AreaUnit, { factor: number; label: string; abbrev: string }> = {
  hectares: { factor: 1, label: 'Hectares', abbrev: 'ha' },
  acres: { factor: 2.47105, label: 'Acres', abbrev: 'ac' },
  sqm: { factor: 10000, label: 'Square Meters', abbrev: 'm²' },
  plots: { factor: 16.5289, label: 'Plots (60×120ft)', abbrev: 'plots' },
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
  averagedFrom?: number;
}

// Determine if accuracy qualifies as RTK-calibrated
function isRtkCalibrated(accuracyMeters: number): boolean {
  return accuracyMeters <= RTK_GPS_CONFIG.RTK_FLOAT_THRESHOLD;
}

// Get fix status label
function getFixStatusLabel(accuracy: number): string {
  if (accuracy <= RTK_GPS_CONFIG.RTK_FIXED_THRESHOLD) return 'RTK Fixed (cm)';
  if (accuracy <= RTK_GPS_CONFIG.RTK_FLOAT_THRESHOLD) return 'RTK Float';
  if (accuracy <= RTK_GPS_CONFIG.DGPS_THRESHOLD) return 'DGPS';
  if (accuracy <= RTK_GPS_CONFIG.STANDARD_GPS_THRESHOLD) return 'Standard GPS';
  return 'Low Accuracy';
}

// Calculate polygon area using Shoelace formula (geodesic approximation)
function calculatePolygonArea(points: BoundaryPoint[]): number {
  if (points.length < 3) return 0;
  
  const toRad = (deg: number) => deg * Math.PI / 180;
  const R = 6371000; // Earth radius in meters
  
  let area = 0;
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lat1 = toRad(points[i].latitude);
    const lat2 = toRad(points[j].latitude);
    const dLng = toRad(points[j].longitude - points[i].longitude);
    area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  
  area = Math.abs(area * R * R / 2);
  return area; // square meters
}

// Calculate polygon perimeter using Haversine
function calculatePolygonPerimeter(points: BoundaryPoint[]): number {
  if (points.length < 2) return 0;
  
  let perimeter = 0;
  const toRad = (deg: number) => deg * Math.PI / 180;
  const R = 6371000;
  
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const dLat = toRad(points[j].latitude - points[i].latitude);
    const dLng = toRad(points[j].longitude - points[i].longitude);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(points[i].latitude)) * Math.cos(toRad(points[j].latitude)) *
      Math.sin(dLng / 2) ** 2;
    perimeter += 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  
  return perimeter; // meters
}

// Calculate distance between two points (meters)
function distanceBetween(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => deg * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) *
    Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Convert area from sqm to selected unit
function convertArea(sqm: number, unit: AreaUnit): number {
  const hectares = sqm / 10000;
  return hectares * AREA_CONVERSIONS[unit].factor;
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
  const [accuracyThreshold, setAccuracyThreshold] = useState(30);
  
  // New feature states
  const [areaUnit, setAreaUnit] = useState<AreaUnit>('hectares');
  const [autoCapture, setAutoCapture] = useState(false);
  const [accuracyAveraging, setAccuracyAveraging] = useState(false);
  const [averagingReadings, setAveragingReadings] = useState<GeoPoint[]>([]);
  const [isAveraging, setIsAveraging] = useState(false);
  const [importMode, setImportMode] = useState<'walk' | 'import'>('walk');
  const [geoJsonInput, setGeoJsonInput] = useState('');
  
  const autoCaptureRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAutoCaptureRef = useRef<GeoPoint | null>(null);
  
  // Update accuracy threshold when GPS mode changes
  const handleGpsModeChange = (mode: GpsMode) => {
    setGpsMode(mode);
    switch (mode) {
      case 'rtk':
        setAccuracyThreshold(RTK_GPS_CONFIG.RTK_FLOAT_THRESHOLD);
        toast.info('RTK Mode: Accuracy threshold set to 0.5m (50cm)');
        break;
      case 'survey':
        setAccuracyThreshold(RTK_GPS_CONFIG.DGPS_THRESHOLD);
        toast.info('Survey Mode: Accuracy threshold set to 1m');
        break;
      default:
        setAccuracyThreshold(RTK_GPS_CONFIG.LOW_ACCURACY_THRESHOLD);
        toast.info('Smartphone Mode: Accuracy threshold set to 30m');
    }
  };
  
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const boundaryLayerRef = useRef<boolean>(false);
  const polygonLayerRef = useRef<boolean>(false);

  // Fetch user's farms
  const { data: farms } = trpc.dashboard.getFarms.useQuery();
  
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
      stopAutoCapture();
      refetchBoundaries();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save boundary");
    },
  });

  // Live area/perimeter calculation
  const liveAreaSqm = useMemo(() => calculatePolygonArea(boundaryPoints), [boundaryPoints]);
  const livePerimeterM = useMemo(() => calculatePolygonPerimeter(boundaryPoints), [boundaryPoints]);
  const displayArea = useMemo(() => convertArea(liveAreaSqm, areaUnit), [liveAreaSqm, areaUnit]);

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
      if (autoCaptureRef.current) {
        clearInterval(autoCaptureRef.current);
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

    updateFarmLocation.mutate({
      id: selectedFarmId,
      latitude: currentLocation.latitude.toString(),
      longitude: currentLocation.longitude.toString(),
    });
  };

  // Add marker to map for a point
  const addMarkerToMap = useCallback((point: GeoPoint, index: number) => {
    if (!mapRef.current) return;
    
    const el = document.createElement("div");
    el.className = "boundary-marker";
    el.style.width = index === 0 ? "16px" : "12px";
    el.style.height = index === 0 ? "16px" : "12px";
    el.style.backgroundColor = index === 0 ? "#16a34a" : "#22c55e";
    el.style.borderRadius = "50%";
    el.style.border = "2px solid white";
    el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
    el.style.position = "relative";
    
    // Add point number label
    const label = document.createElement("span");
    label.textContent = `${index + 1}`;
    label.style.position = "absolute";
    label.style.top = "-18px";
    label.style.left = "50%";
    label.style.transform = "translateX(-50%)";
    label.style.fontSize = "10px";
    label.style.fontWeight = "bold";
    label.style.color = "#166534";
    label.style.backgroundColor = "white";
    label.style.padding = "0 3px";
    label.style.borderRadius = "2px";
    label.style.whiteSpace = "nowrap";
    el.appendChild(label);

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([point.longitude, point.latitude])
      .addTo(mapRef.current);

    markersRef.current.push(marker);
  }, []);

  // Add boundary point (with optional averaging)
  const addBoundaryPoint = useCallback((location: GeoPoint, averagedFrom?: number) => {
    const newPoint: BoundaryPoint = {
      ...location,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      averagedFrom,
    };

    setBoundaryPoints((prev) => {
      const updated = [...prev, newPoint];
      addMarkerToMap(location, updated.length - 1);
      return updated;
    });
    
    const avgLabel = averagedFrom ? ` (avg of ${averagedFrom} readings)` : '';
    toast.success(`Point captured!${avgLabel}`);
  }, [addMarkerToMap]);

  // Start accuracy averaging for a single point
  const startAccuracyAveraging = useCallback(() => {
    if (!currentLocation || currentLocation.accuracy > accuracyThreshold) {
      toast.warning("Wait for GPS signal within accuracy threshold");
      return;
    }
    
    setAveragingReadings([currentLocation]);
    setIsAveraging(true);
    toast.info(`Collecting ${ACCURACY_AVERAGING_READINGS} GPS readings for averaging...`);
  }, [currentLocation, accuracyThreshold]);

  // Collect averaging readings from location updates
  useEffect(() => {
    if (!isAveraging || !currentLocation) return;
    
    setAveragingReadings(prev => {
      if (prev.length > 0 && prev[prev.length - 1].timestamp === currentLocation.timestamp) {
        return prev;
      }
      const updated = [...prev, currentLocation];
      
      if (updated.length >= ACCURACY_AVERAGING_READINGS) {
        // Calculate average
        const avgLat = updated.reduce((s, p) => s + p.latitude, 0) / updated.length;
        const avgLng = updated.reduce((s, p) => s + p.longitude, 0) / updated.length;
        const avgAcc = updated.reduce((s, p) => s + p.accuracy, 0) / updated.length;
        
        const averaged: GeoPoint = {
          latitude: avgLat,
          longitude: avgLng,
          accuracy: avgAcc,
          timestamp: Date.now(),
        };
        
        addBoundaryPoint(averaged, updated.length);
        setIsAveraging(false);
        return [];
      }
      
      return updated;
    });
  }, [isAveraging, currentLocation, addBoundaryPoint]);

  // Manual point capture
  const handleAddBoundaryPoint = () => {
    if (!currentLocation) {
      toast.error("Waiting for GPS signal...");
      return;
    }

    if (currentLocation.accuracy > accuracyThreshold) {
      toast.warning(`GPS accuracy is ${currentLocation.accuracy.toFixed(0)}m. Wait for better signal.`);
      return;
    }

    if (accuracyAveraging) {
      startAccuracyAveraging();
    } else {
      addBoundaryPoint(currentLocation);
    }
  };

  // Auto-capture logic
  const startAutoCapture = useCallback(() => {
    if (autoCaptureRef.current) return;
    
    autoCaptureRef.current = setInterval(() => {
      const loc = currentLocation;
      if (!loc || loc.accuracy > accuracyThreshold) return;
      
      // Check minimum distance from last auto-captured point
      const lastPt = lastAutoCaptureRef.current;
      if (lastPt) {
        const dist = distanceBetween(lastPt, loc);
        if (dist < AUTO_CAPTURE_MIN_DISTANCE_M) return;
      }
      
      lastAutoCaptureRef.current = loc;
      addBoundaryPoint(loc);
    }, AUTO_CAPTURE_INTERVAL_MS);
    
    toast.info(`Auto-capture started: every ${AUTO_CAPTURE_INTERVAL_MS / 1000}s, min ${AUTO_CAPTURE_MIN_DISTANCE_M}m apart`);
  }, [currentLocation, accuracyThreshold, addBoundaryPoint]);

  const stopAutoCapture = useCallback(() => {
    if (autoCaptureRef.current) {
      clearInterval(autoCaptureRef.current);
      autoCaptureRef.current = null;
    }
    lastAutoCaptureRef.current = null;
  }, []);

  // Toggle auto-capture
  useEffect(() => {
    if (autoCapture && isWalkingBoundary) {
      startAutoCapture();
    } else {
      stopAutoCapture();
    }
  }, [autoCapture, isWalkingBoundary, startAutoCapture, stopAutoCapture]);

  // Start boundary walk
  const handleStartBoundaryWalk = () => {
    if (!selectedFarmId) {
      toast.error("Please select a farm first");
      return;
    }

    setBoundaryPoints([]);
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    setIsWalkingBoundary(true);
    startWatchingPosition();
    toast.info("Walk around your farm boundary. Tap 'Add Point' at each corner or enable auto-capture.");
  };

  // Undo last point
  const handleUndoLastPoint = () => {
    if (boundaryPoints.length === 0) return;
    
    setBoundaryPoints(prev => prev.slice(0, -1));
    
    // Remove last marker from map
    const lastMarker = markersRef.current.pop();
    if (lastMarker) lastMarker.remove();
    
    toast.info(`Point removed. ${boundaryPoints.length - 1} points remaining.`);
  };

  // Stop boundary walk
  const handleStopBoundaryWalk = () => {
    stopWatchingPosition();
    stopAutoCapture();
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

    const coordinates = boundaryPoints.map((p) => [p.longitude, p.latitude] as [number, number]);
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

  // Import boundary from GeoJSON (satellite/drone)
  const handleImportGeoJSON = () => {
    if (!selectedFarmId) {
      toast.error("Please select a farm first");
      return;
    }
    
    try {
      const parsed = JSON.parse(geoJsonInput);
      let coordinates: number[][][];
      
      if (parsed.type === 'Polygon') {
        coordinates = parsed.coordinates;
      } else if (parsed.type === 'Feature' && parsed.geometry?.type === 'Polygon') {
        coordinates = parsed.geometry.coordinates;
      } else if (parsed.type === 'FeatureCollection' && parsed.features?.length > 0) {
        const firstPolygon = parsed.features.find((f: { geometry?: { type?: string } }) => f.geometry?.type === 'Polygon');
        if (!firstPolygon) throw new Error("No Polygon feature found");
        coordinates = firstPolygon.geometry.coordinates;
      } else {
        throw new Error("Expected GeoJSON Polygon, Feature, or FeatureCollection");
      }
      
      // Validate coordinates
      if (!coordinates || !coordinates[0] || coordinates[0].length < 4) {
        throw new Error("Polygon must have at least 4 coordinate pairs (3 points + closing)");
      }
      
      // Convert to boundary points for preview
      const imported = coordinates[0].slice(0, -1).map((coord, i) => ({
        latitude: coord[1],
        longitude: coord[0],
        accuracy: 0,
        timestamp: Date.now(),
        id: `import-${i}`,
      }));
      
      setBoundaryPoints(imported);
      
      // Add markers and fit map
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      imported.forEach((pt, i) => addMarkerToMap(pt, i));
      
      // Fit map to imported boundary
      if (mapRef.current && imported.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        imported.forEach(p => bounds.extend([p.longitude, p.latitude]));
        mapRef.current.fitBounds(bounds, { padding: 50 });
      }
      
      toast.success(`Imported ${imported.length} boundary points from GeoJSON`);
    } catch (err) {
      toast.error(`Invalid GeoJSON: ${err instanceof Error ? err.message : 'Parse error'}`);
    }
  };

  // Clear boundary points
  const handleClearBoundary = () => {
    setBoundaryPoints([]);
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    
    if (mapRef.current) {
      if (boundaryLayerRef.current) {
        if (mapRef.current.getLayer("boundary-line")) mapRef.current.removeLayer("boundary-line");
        if (mapRef.current.getSource("boundary-line")) mapRef.current.removeSource("boundary-line");
        boundaryLayerRef.current = false;
      }
      if (polygonLayerRef.current) {
        if (mapRef.current.getLayer("boundary-fill")) mapRef.current.removeLayer("boundary-fill");
        if (mapRef.current.getSource("boundary-fill")) mapRef.current.removeSource("boundary-fill");
        polygonLayerRef.current = false;
      }
    }
    
    toast.info("Boundary points cleared");
  };

  // Update boundary line and polygon fill on map
  useEffect(() => {
    if (!mapRef.current || boundaryPoints.length < 2) return;

    const lineCoordinates = boundaryPoints.map((p) => [p.longitude, p.latitude]);

    if (boundaryLayerRef.current) {
      const source = mapRef.current.getSource("boundary-line") as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: lineCoordinates },
        });
      }
    } else {
      mapRef.current.addSource("boundary-line", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: lineCoordinates },
        },
      });

      mapRef.current.addLayer({
        id: "boundary-line",
        type: "line",
        source: "boundary-line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#22c55e", "line-width": 3, "line-dasharray": [2, 2] },
      });

      boundaryLayerRef.current = true;
    }

    // Add/update polygon fill when 3+ points
    if (boundaryPoints.length >= 3) {
      const polyCoords = [...lineCoordinates, lineCoordinates[0]];
      
      if (polygonLayerRef.current) {
        const source = mapRef.current.getSource("boundary-fill") as maplibregl.GeoJSONSource;
        if (source) {
          source.setData({
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [polyCoords] },
          });
        }
      } else {
        mapRef.current.addSource("boundary-fill", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [polyCoords] },
          },
        });

        mapRef.current.addLayer({
          id: "boundary-fill",
          type: "fill",
          source: "boundary-fill",
          paint: { "fill-color": "#22c55e", "fill-opacity": 0.15 },
        }, "boundary-line");

        polygonLayerRef.current = true;
      }
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

  const unitInfo = AREA_CONVERSIONS[areaUnit];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Geotag My Farm</h1>
          <p className="text-muted-foreground">
            Capture your farm's location and boundaries using GPS with advanced measurement
          </p>
        </div>

        {/* Farm Selection + GPS Mode */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Select Farm
            </CardTitle>
            <CardDescription>Choose which farm to geotag</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

              <div>
                <Label>Area Unit</Label>
                <Select
                  value={areaUnit}
                  onValueChange={(v) => setAreaUnit(v as AreaUnit)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hectares">Hectares (ha)</SelectItem>
                    <SelectItem value="acres">Acres (ac)</SelectItem>
                    <SelectItem value="sqm">Square Meters (m²)</SelectItem>
                    <SelectItem value="plots">Plots (60×120ft Nigerian)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedFarm && (
              <div role="main" aria-label="Page content" className="p-4 bg-muted rounded-lg">
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

        {/* Live Measurement Display */}
        {boundaryPoints.length >= 3 && (
          <Card className="border-green-200 bg-green-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-green-800">
                <AreaChart className="h-5 w-5" />
                Live Measurement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 bg-white rounded-lg border border-green-200">
                  <p className="text-xs text-muted-foreground">{unitInfo.label}</p>
                  <p className="text-2xl font-bold text-green-700">
                    {displayArea < 0.01 ? displayArea.toExponential(1) : displayArea.toFixed(2)}
                  </p>
                  <p className="text-xs text-green-600">{unitInfo.abbrev}</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border border-green-200">
                  <p className="text-xs text-muted-foreground">Perimeter</p>
                  <p className="text-2xl font-bold text-green-700">
                    {livePerimeterM < 1000 ? `${livePerimeterM.toFixed(0)}` : `${(livePerimeterM / 1000).toFixed(2)}`}
                  </p>
                  <p className="text-xs text-green-600">{livePerimeterM < 1000 ? 'm' : 'km'}</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border border-green-200">
                  <p className="text-xs text-muted-foreground">Hectares</p>
                  <p className="text-2xl font-bold text-green-700">{(liveAreaSqm / 10000).toFixed(2)}</p>
                  <p className="text-xs text-green-600">ha</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border border-green-200">
                  <p className="text-xs text-muted-foreground">Acres</p>
                  <p className="text-2xl font-bold text-green-700">{(liveAreaSqm / 10000 * 2.47105).toFixed(2)}</p>
                  <p className="text-xs text-green-600">ac</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg border border-green-200">
                  <p className="text-xs text-muted-foreground">Points</p>
                  <p className="text-2xl font-bold text-green-700">{boundaryPoints.length}</p>
                  <p className="text-xs text-green-600">captured</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                  Capture Farm Boundary
                </CardTitle>
                <CardDescription>
                  Walk the perimeter, import from satellite/drone, or paste GeoJSON
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Mode Toggle */}
                <Tabs value={importMode} onValueChange={(v) => setImportMode(v as 'walk' | 'import')}>
                  <TabsList className="w-full">
                    <TabsTrigger value="walk" className="flex-1">
                      <Footprints className="mr-2 h-4 w-4" />
                      Walk Boundary
                    </TabsTrigger>
                    <TabsTrigger value="import" className="flex-1">
                      <Upload className="mr-2 h-4 w-4" />
                      Import Boundary
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="walk" className="space-y-4">
                    {/* Capture Options */}
                    <div className="grid grid-cols-2 gap-3 p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="auto-capture" className="text-sm cursor-pointer">
                          <Timer className="inline mr-1 h-3 w-3" />
                          Auto-Capture
                        </Label>
                        <Switch
                          id="auto-capture"
                          checked={autoCapture}
                          onCheckedChange={setAutoCapture}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="avg-accuracy" className="text-sm cursor-pointer">
                          <Target className="inline mr-1 h-3 w-3" />
                          Avg Readings
                        </Label>
                        <Switch
                          id="avg-accuracy"
                          checked={accuracyAveraging}
                          onCheckedChange={setAccuracyAveraging}
                        />
                      </div>
                    </div>
                    
                    {autoCapture && (
                      <p className="text-xs text-muted-foreground">
                        Auto-captures every {AUTO_CAPTURE_INTERVAL_MS / 1000}s when you move {AUTO_CAPTURE_MIN_DISTANCE_M}m+
                      </p>
                    )}
                    {accuracyAveraging && (
                      <p className="text-xs text-muted-foreground">
                        Each point averages {ACCURACY_AVERAGING_READINGS} GPS readings for better accuracy
                      </p>
                    )}

                    {/* Averaging progress */}
                    {isAveraging && (
                      <div className="space-y-2">
                        <Progress value={(averagingReadings.length / ACCURACY_AVERAGING_READINGS) * 100} />
                        <p className="text-sm text-center text-muted-foreground">
                          Averaging: {averagingReadings.length}/{ACCURACY_AVERAGING_READINGS} readings
                        </p>
                      </div>
                    )}

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
                            {autoCapture 
                              ? "Walking... points are captured automatically as you move." 
                              : "Walk around your farm. Tap 'Add Point' at each corner or turn."}
                          </AlertDescription>
                        </Alert>

                        <div className="flex gap-2">
                          {!autoCapture && (
                            <Button
                              onClick={handleAddBoundaryPoint}
                              className="flex-1"
                              disabled={!currentLocation || currentLocation.accuracy > accuracyThreshold || isAveraging}
                            >
                              <MapPin className="mr-2 h-4 w-4" />
                              Add Point ({boundaryPoints.length})
                            </Button>
                          )}
                          <Button
                            onClick={handleUndoLastPoint}
                            variant="outline"
                            disabled={boundaryPoints.length === 0}
                            title="Undo last point"
                          >
                            <Undo2 className="h-4 w-4" />
                          </Button>
                          <Button onClick={handleStopBoundaryWalk} variant="secondary">
                            <Square className="mr-2 h-4 w-4" />
                            Stop
                          </Button>
                        </div>

                        <Progress value={Math.min((boundaryPoints.length / 10) * 100, 100)} className="h-2" />
                        <p className="text-sm text-muted-foreground text-center">
                          {boundaryPoints.length} points captured (minimum 3 required)
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="import" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Paste GeoJSON Polygon</Label>
                      <textarea
                        className="w-full h-32 p-3 border rounded-lg font-mono text-xs resize-y"
                        placeholder={`Paste GeoJSON from satellite imagery, drone flight export, or survey tool...\n\nExample:\n{"type":"Polygon","coordinates":[[[3.37,6.52],[3.38,6.52],[3.38,6.53],[3.37,6.53],[3.37,6.52]]]}`}
                        value={geoJsonInput}
                        onChange={(e) => setGeoJsonInput(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Accepts GeoJSON Polygon, Feature, or FeatureCollection. Export from:
                        satellite imagery tools, drone flight software (DJI, Pix4D), survey-grade GPS (Trimble, Leica),
                        or draw on Google Earth / QGIS.
                      </p>
                    </div>
                    <Button
                      onClick={handleImportGeoJSON}
                      disabled={!selectedFarmId || !geoJsonInput.trim()}
                      className="w-full"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Import & Preview Boundary
                    </Button>
                  </TabsContent>
                </Tabs>

                {/* Save / Clear (shown when points exist and not walking) */}
                {boundaryPoints.length >= 3 && !isWalkingBoundary && (
                  <div className="space-y-2 pt-2 border-t">
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
                          Save Boundary ({boundaryPoints.length} points — {(liveAreaSqm / 10000).toFixed(2)} ha)
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
                    {boundaries.features.map((feature: any) => {
                      const ha = Number(feature.properties.area_hectares || 0);
                      return (
                        <div
                          key={feature.properties.id}
                          className="p-3 border rounded-lg flex items-center justify-between"
                        >
                          <div>
                            <p className="font-medium">{feature.properties.farm_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {ha.toFixed(2)} ha | {(ha * 2.47105).toFixed(2)} ac | {(ha * 16.5289).toFixed(0)} plots
                            </p>
                          </div>
                          <Badge variant="outline">
                            {Number(feature.properties.perimeter_m || 0).toFixed(0)}m
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Map */}
          <Card className="h-[600px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between">
                <span>Map View</span>
                {boundaryPoints.length >= 3 && (
                  <Badge variant="outline" className="text-green-600 border-green-300">
                    <Ruler className="mr-1 h-3 w-3" />
                    {(liveAreaSqm / 10000).toFixed(2)} ha
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[calc(100%-60px)]">
              <MapView
                initialCenter={
                  currentLocation
                    ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
                    : { lat: 7.4951, lng: 3.3792 }
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
