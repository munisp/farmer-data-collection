/**
 * Farm Boundary Editor Component
 * Allows editing existing farm boundaries by dragging polygon vertices
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Save, X, Edit, Loader2 } from "lucide-react";

interface FarmBoundaryEditorProps {
  boundaryId: number;
  initialGeometry: any; // GeoJSON geometry
  onSaved?: () => void;
  onCancel?: () => void;
}

export function FarmBoundaryEditor({
  boundaryId,
  initialGeometry,
  onSaved,
  onCancel,
}: FarmBoundaryEditorProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [polygon, setPolygon] = useState<google.maps.Polygon | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const updateBoundaryMutation = trpc.spatial.updateBoundary.useMutation();

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || map) return;

    // Calculate center from geometry
    const coords = initialGeometry.coordinates[0];
    const center = {
      lat: coords.reduce((sum: number, c: number[]) => sum + c[1], 0) / coords.length,
      lng: coords.reduce((sum: number, c: number[]) => sum + c[0], 0) / coords.length,
    };

    const googleMap = new google.maps.Map(mapRef.current, {
      center,
      zoom: 15,
      mapTypeId: "hybrid",
      mapTypeControl: true,
    });

    setMap(googleMap);
  }, [mapRef, initialGeometry]);

  // Create polygon
  useEffect(() => {
    if (!map || polygon) return;

    const coords = initialGeometry.coordinates[0].map((c: number[]) => ({
      lat: c[1],
      lng: c[0],
    }));

    const poly = new google.maps.Polygon({
      paths: coords,
      strokeColor: "#FF0000",
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: "#FF0000",
      fillOpacity: 0.35,
      editable: false,
      draggable: false,
    });

    poly.setMap(map);
    setPolygon(poly);

    // Fit bounds to polygon
    const bounds = new google.maps.LatLngBounds();
    coords.forEach((coord: google.maps.LatLngLiteral) => bounds.extend(coord));
    map.fitBounds(bounds);
  }, [map, initialGeometry, polygon]);

  const handleStartEditing = () => {
    if (polygon) {
      polygon.setEditable(true);
      polygon.setDraggable(true);
      setIsEditing(true);
      toast.info("Editing mode enabled. Drag vertices to modify the boundary.");
    }
  };

  const handleCancelEditing = () => {
    if (polygon) {
      polygon.setEditable(false);
      polygon.setDraggable(false);
      setIsEditing(false);

      // Reset to original geometry
      const coords = initialGeometry.coordinates[0].map((c: number[]) => ({
        lat: c[1],
        lng: c[0],
      }));
      polygon.setPath(coords);

      toast.info("Editing cancelled");
    }

    if (onCancel) {
      onCancel();
    }
  };

  const handleSave = async () => {
    if (!polygon) return;

    setIsSaving(true);

    try {
      // Get updated coordinates
      const path = polygon.getPath();
      const coordinates: [number, number][] = [];

      for (let i = 0; i < path.getLength(); i++) {
        const point = path.getAt(i);
        coordinates.push([point.lng(), point.lat()] as [number, number]);
      }

      // Close the polygon (first point = last point)
      if (coordinates.length > 0) {
        coordinates.push(coordinates[0]);
      }

      // Save to database
      const result = await updateBoundaryMutation.mutateAsync({
        boundaryId,
        coordinates,
      });

      const boundaryData = result as { id: number; farm_id: number; geometry: any; area_hectares: number; perimeter_m: number; name: string; description: string | null };
      toast.success(
        `Boundary updated! New area: ${Number(boundaryData.area_hectares || 0).toFixed(2)} hectares`
      );

      polygon.setEditable(false);
      polygon.setDraggable(false);
      setIsEditing(false);

      if (onSaved) {
        onSaved();
      }
    } catch (error: any) {
      console.error("Failed to save boundary:", error);
      toast.error("Failed to save boundary: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="relative">
        <div ref={mapRef} className="w-full h-[500px]" />

        {/* Control Buttons */}
        <div className="absolute top-4 right-4 flex gap-2">
          {!isEditing ? (
            <Button onClick={handleStartEditing} size="sm">
              <Edit className="w-4 h-4 mr-2" />
              Edit Boundary
            </Button>
          ) : (
            <>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                size="sm"
                variant="default"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
              <Button
                onClick={handleCancelEditing}
                disabled={isSaving}
                size="sm"
                variant="outline"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </>
          )}
        </div>

        {/* Instructions */}
        {isEditing && (
          <div className="absolute bottom-4 left-4 right-4">
            <div className="bg-blue-600 text-white p-3 rounded-lg shadow-lg">
              <p className="text-sm font-medium">
                💡 Drag the vertices (corner points) to modify the boundary shape
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
