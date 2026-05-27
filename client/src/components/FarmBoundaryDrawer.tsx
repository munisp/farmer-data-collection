/**
 * Farm Boundary Drawing Component
 * Allows farmers to draw their farm boundaries on Google Maps
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface FarmBoundaryDrawerProps {
  farmId: number;
  initialCenter?: { lat: number; lng: number };
  onBoundarySaved?: (boundaryId: number) => void;
}

export function FarmBoundaryDrawer({
  farmId,
  initialCenter = { lat: 6.5244, lng: 3.3792 }, // Lagos, Nigeria
  onBoundarySaved,
}: FarmBoundaryDrawerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [drawingManager, setDrawingManager] = useState<google.maps.drawing.DrawingManager | null>(null);
  const [currentPolygon, setCurrentPolygon] = useState<google.maps.Polygon | null>(null);
  const [boundaryName, setBoundaryName] = useState("");
  const [area, setArea] = useState<number | null>(null);

  const importMutation = trpc.spatial.importBoundaryFromGeoJSON.useMutation();

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || map) return;

    const googleMap = new google.maps.Map(mapRef.current, {
      center: initialCenter,
      zoom: 15,
      mapTypeId: "hybrid", // Satellite view for better boundary drawing
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: google.maps.ControlPosition.TOP_CENTER,
      },
    });

    setMap(googleMap);
  }, [mapRef, initialCenter, map]);

  // Initialize drawing manager
  useEffect(() => {
    if (!map || drawingManager) return;

    const manager = new google.maps.drawing.DrawingManager({
      drawingMode: google.maps.drawing.OverlayType.POLYGON,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [google.maps.drawing.OverlayType.POLYGON],
      },
      polygonOptions: {
        fillColor: "#00FF00",
        fillOpacity: 0.3,
        strokeWeight: 2,
        strokeColor: "#00AA00",
        editable: true,
        draggable: false,
      },
    });

    manager.setMap(map);
    setDrawingManager(manager);

    // Listen for polygon complete
    google.maps.event.addListener(manager, "polygoncomplete", (polygon: google.maps.Polygon) => {
      // Remove previous polygon if exists
      if (currentPolygon) {
        currentPolygon.setMap(null);
      }

      setCurrentPolygon(polygon);

      // Calculate area
      const areaMeters = google.maps.geometry.spherical.computeArea(polygon.getPath());
      const areaHectares = areaMeters / 10000;
      setArea(areaHectares);

      // Stop drawing mode
      manager.setDrawingMode(null);

      toast.success(`Boundary drawn! Area: ${areaHectares.toFixed(2)} hectares`);
    });

    return () => {
      if (manager) {
        google.maps.event.clearListeners(manager, "polygoncomplete");
        manager.setMap(null);
      }
    };
  }, [map, drawingManager, currentPolygon]);

  const handleSave = async () => {
    if (!currentPolygon) {
      toast.error("Please draw a boundary first");
      return;
    }

    if (!boundaryName.trim()) {
      toast.error("Please enter a boundary name");
      return;
    }

    try {
      // Get coordinates from polygon
      const path = currentPolygon.getPath();
      const coordinates: [number, number][] = path.getArray().map((latLng) => [
        latLng.lng(),
        latLng.lat(),
      ] as [number, number]);

      // Close the polygon (first point = last point)
      coordinates.push(coordinates[0]);

      // Save to database
      const result = await importMutation.mutateAsync({
        farmId,
        name: boundaryName,
        geoJSON: {
          type: "Polygon" as const,
          coordinates: [coordinates],
        },
      });

      const boundaryData = result as { id: number; area_hectares: number; perimeter_m: number };
      toast.success(`Boundary saved! Area: ${Number(boundaryData.area_hectares || 0).toFixed(2)} hectares`);

      // Reset form
      setBoundaryName("");
      setArea(null);
      currentPolygon.setMap(null);
      setCurrentPolygon(null);

      // Callback
      if (onBoundarySaved && boundaryData.id) {
        onBoundarySaved(Number(boundaryData.id));
      }
    } catch (error) {
      console.error("Error saving boundary:", error);
      toast.error("Failed to save boundary");
    }
  };

  const handleClear = () => {
    if (currentPolygon) {
      currentPolygon.setMap(null);
      setCurrentPolygon(null);
      setArea(null);
      toast.info("Boundary cleared");
    }
  };

  const handleStartDrawing = () => {
    if (drawingManager) {
      drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Draw Farm Boundary</h3>
            <p className="text-sm text-muted-foreground">
              Click on the map to draw the boundary of your farm. Click the first point again to close the polygon.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="boundaryName">Boundary Name</Label>
              <Input
                id="boundaryName"
                value={boundaryName}
                onChange={(e) => setBoundaryName(e.target.value)}
                placeholder="e.g., North Field"
              />
            </div>

            {area !== null && (
              <div>
                <Label>Calculated Area</Label>
                <div className="text-2xl font-bold text-green-600">
                  {area.toFixed(2)} ha
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleStartDrawing}
              variant="outline"
              disabled={!!currentPolygon}
            >
              Start Drawing
            </Button>
            <Button
              onClick={handleClear}
              variant="outline"
              disabled={!currentPolygon}
            >
              Clear
            </Button>
            <Button
              onClick={handleSave}
              disabled={!currentPolygon || !boundaryName.trim() || importMutation.isPending}
            >
              {importMutation.isPending ? "Saving..." : "Save Boundary"}
            </Button>
          </div>
        </div>
      </Card>

      <div
        ref={mapRef}
        className="w-full h-[600px] rounded-lg border border-border"
      />

      <Card className="p-4 bg-blue-50 dark:bg-blue-950">
        <h4 className="font-semibold mb-2">Tips for Drawing Boundaries:</h4>
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li>Use satellite view for better accuracy</li>
          <li>Click to add points along your farm boundary</li>
          <li>Click the first point again to close the polygon</li>
          <li>You can edit the boundary by dragging the points</li>
          <li>Area is calculated automatically in hectares</li>
        </ul>
      </Card>
    </div>
  );
}
