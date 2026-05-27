/**
 * Farm Boundary Viewer Component
 * Displays existing farm boundaries on Google Maps with GeoJSON support
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Download, Upload } from "lucide-react";

interface FarmBoundaryViewerProps {
  farmId?: number;
  showAllBoundaries?: boolean;
  initialCenter?: { lat: number; lng: number };
  onBoundaryDeleted?: () => void;
}

export function FarmBoundaryViewer({
  farmId,
  showAllBoundaries = false,
  initialCenter = { lat: 6.5244, lng: 3.3792 },
  onBoundaryDeleted,
}: FarmBoundaryViewerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const { data: geoJSON, isLoading } = trpc.spatial.getAllBoundariesGeoJSON.useQuery(
    undefined,
    { enabled: showAllBoundaries }
  );

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || map) return;

    const googleMap = new google.maps.Map(mapRef.current, {
      center: initialCenter,
      zoom: 12,
      mapTypeId: "hybrid",
      mapTypeControl: true,
    });

    setMap(googleMap);
  }, [mapRef, initialCenter, map]);

  // Load GeoJSON data
  useEffect(() => {
    if (!map || !geoJSON) return;

    // Clear existing data
    map.data.forEach((feature) => {
      map.data.remove(feature);
    });

    // Add GeoJSON features
    // Google Maps accepts GeoJSON FeatureCollection or Feature objects
    // Type assertion to any is necessary as Google Maps type definitions don't export GeoJsonObject
    map.data.addGeoJson(geoJSON as any);

    // Style polygons
    map.data.setStyle({
      fillColor: "#00AA00",
      fillOpacity: 0.3,
      strokeColor: "#006600",
      strokeWeight: 2,
    });

    // Add click listener for info windows
    map.data.addListener("click", (event: any) => {
      const properties = event.feature.getProperty("properties");
      if (properties) {
        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <h3 style="font-weight: bold; margin-bottom: 4px;">${properties.name || "Unnamed Boundary"}</h3>
              <p style="margin: 2px 0;"><strong>Farm:</strong> ${properties.farm_name}</p>
              <p style="margin: 2px 0;"><strong>Area:</strong> ${properties.area_hectares?.toFixed(2)} hectares</p>
              <p style="margin: 2px 0;"><strong>Perimeter:</strong> ${(properties.perimeter_m / 1000).toFixed(2)} km</p>
            </div>
          `,
          position: event.latLng,
        });
        infoWindow.open(map);
      }
    });

    // Fit bounds to show all boundaries
    if (geoJSON.features && geoJSON.features.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      map.data.forEach((feature) => {
        feature.getGeometry()?.forEachLatLng((latLng) => {
          bounds.extend(latLng);
        });
      });
      map.fitBounds(bounds);
    }
  }, [map, geoJSON]);

  const handleExportGeoJSON = () => {
    if (!geoJSON) {
      toast.error("No boundaries to export");
      return;
    }

    const blob = new Blob([JSON.stringify(geoJSON, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `farm-boundaries-${new Date().toISOString().split("T")[0]}.geojson`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success("GeoJSON exported successfully");
  };

  const handleImportGeoJSON = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".geojson,.json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validate GeoJSON structure
        if (data.type !== "FeatureCollection" && data.type !== "Feature") {
          throw new Error("Invalid GeoJSON format");
        }

        // Batch import requires spatial.importBoundaries endpoint
        toast.info("GeoJSON import feature coming soon");
      } catch (error) {
        console.error("Error importing GeoJSON:", error);
        toast.error("Failed to import GeoJSON file");
      }
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold">Farm Boundaries</h3>
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? "Loading boundaries..."
                : `Showing ${geoJSON?.features?.length || 0} boundaries`}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleExportGeoJSON}
              variant="outline"
              size="sm"
              disabled={!geoJSON || geoJSON.features?.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export GeoJSON
            </Button>
            <Button
              onClick={handleImportGeoJSON}
              variant="outline"
              size="sm"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import GeoJSON
            </Button>
          </div>
        </div>
      </Card>

      <div
        ref={mapRef}
        className="w-full h-[600px] rounded-lg border border-border"
      />

      {geoJSON?.features && geoJSON.features.length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold mb-2">Boundary Statistics</h4>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Total Boundaries</div>
              <div className="text-2xl font-bold">{geoJSON.features.length}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Total Area</div>
              <div className="text-2xl font-bold">
                {geoJSON.features
                  .reduce((sum, f) => sum + (Number(f.properties?.area_hectares) || 0), 0)
                  .toFixed(2)}{" "}
                ha
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Average Area</div>
              <div className="text-2xl font-bold">
                {(
                  geoJSON.features.reduce((sum, f) => sum + (Number(f.properties?.area_hectares) || 0), 0) /
                  geoJSON.features.length
                ).toFixed(2)}{" "}
                ha
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
