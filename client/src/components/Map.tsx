/**
 * MAPLIBRE GL FRONTEND INTEGRATION - PRODUCTION READY
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<maplibregl.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map;
 *   }}
 * />
 *
 * ======
 * Available Features:
 * - Markers: Use maplibregl.Marker
 * - Popups: Use maplibregl.Popup
 * - GeoJSON layers: map.addSource() + map.addLayer()
 * - Navigation controls: Built-in zoom/rotation
 * - Fullscreen: Built-in fullscreen control
 * - Scale: Built-in scale control
 * - Geolocation: Built-in geolocate control
 *
 * ======
 * Benefits over Google Maps:
 * - Free and open-source
 * - Works offline with cached tiles
 * - No API key required for basic usage
 * - Better performance with vector tiles
 * - Full customization of map styles
 */

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/utils";

// OpenStreetMap tile style (free, no API key required)
const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

// Satellite imagery style (using ESRI World Imagery)
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
    },
  },
  layers: [
    {
      id: "satellite",
      type: "raster",
      source: "satellite",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

// Terrain/Topographic style (using OpenTopoMap)
const TERRAIN_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    terrain: {
      type: "raster",
      tiles: [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    },
  },
  layers: [
    {
      id: "terrain",
      type: "raster",
      source: "terrain",
      minzoom: 0,
      maxzoom: 17,
    },
  ],
};

export type MapStyle = "osm" | "satellite" | "terrain";

const STYLES: Record<MapStyle, maplibregl.StyleSpecification> = {
  osm: OSM_STYLE,
  satellite: SATELLITE_STYLE,
  terrain: TERRAIN_STYLE,
};

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MarkerOptions {
  position: LatLng;
  color?: string;
  title?: string;
  popup?: string;
  onClick?: () => void;
}

interface MapViewProps {
  className?: string;
  initialCenter?: LatLng;
  initialZoom?: number;
  mapStyle?: MapStyle;
  showControls?: boolean;
  showScale?: boolean;
  showFullscreen?: boolean;
  showGeolocate?: boolean;
  markers?: MarkerOptions[];
  onMapReady?: (map: maplibregl.Map) => void;
  onMapClick?: (lngLat: LatLng) => void;
}

export function MapView({
  className,
  initialCenter = { lat: 0.0236, lng: 37.9062 }, // Default to Kenya (agricultural focus)
  initialZoom = 6,
  mapStyle = "osm",
  showControls = true,
  showScale = true,
  showFullscreen = true,
  showGeolocate = true,
  markers = [],
  onMapReady,
  onMapClick,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // Clear existing markers
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
  }, []);

  // Add markers to map
  const addMarkers = useCallback((mapInstance: maplibregl.Map, markerOptions: MarkerOptions[]) => {
    clearMarkers();

    markerOptions.forEach((options) => {
      const marker = new maplibregl.Marker({
        color: options.color || "#3b82f6",
      })
        .setLngLat([options.position.lng, options.position.lat])
        .addTo(mapInstance);

      if (options.popup) {
        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(options.popup);
        marker.setPopup(popup);
      }

      if (options.onClick) {
        marker.getElement().addEventListener("click", options.onClick);
      }

      markersRef.current.push(marker);
    });
  }, [clearMarkers]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: STYLES[mapStyle],
      center: [initialCenter.lng, initialCenter.lat],
      zoom: initialZoom,
      attributionControl: {},
    });

    // Add navigation controls (zoom, rotation)
    if (showControls) {
      mapInstance.addControl(new maplibregl.NavigationControl(), "top-right");
    }

    // Add scale control
    if (showScale) {
      mapInstance.addControl(
        new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }),
        "bottom-left"
      );
    }

    // Add fullscreen control
    if (showFullscreen) {
      mapInstance.addControl(new maplibregl.FullscreenControl(), "top-right");
    }

    // Add geolocation control
    if (showGeolocate) {
      mapInstance.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
        }),
        "top-right"
      );
    }

    // Handle map click
    if (onMapClick) {
      mapInstance.on("click", (e) => {
        onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
    }

    // Wait for map to load before adding markers and calling onMapReady
    mapInstance.on("load", () => {
      if (markers.length > 0) {
        addMarkers(mapInstance, markers);
      }

      if (onMapReady) {
        onMapReady(mapInstance);
      }
    });

    map.current = mapInstance;

    // Cleanup on unmount
    return () => {
      clearMarkers();
      mapInstance.remove();
      map.current = null;
    };
  }, []);

  // Update markers when they change
  useEffect(() => {
    if (map.current && markers.length > 0) {
      addMarkers(map.current, markers);
    }
  }, [markers, addMarkers]);

  // Update map style when it changes
  useEffect(() => {
    if (map.current) {
      map.current.setStyle(STYLES[mapStyle]);
    }
  }, [mapStyle]);

  return (
    <div 
      ref={mapContainer} 
      className={cn("w-full h-[500px] rounded-lg", className)} 
      style={{ minHeight: "300px" }}
    />
  );
}

// Utility functions for map operations
export const MapUtils = {
  /**
   * Calculate distance between two points in kilometers
   */
  calculateDistance(point1: LatLng, point2: LatLng): number {
    const R = 6371; // Earth's radius in km
    const dLat = ((point2.lat - point1.lat) * Math.PI) / 180;
    const dLng = ((point2.lng - point1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((point1.lat * Math.PI) / 180) *
        Math.cos((point2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  /**
   * Calculate bounds that contain all given points
   */
  getBounds(points: LatLng[]): maplibregl.LngLatBounds | null {
    if (points.length === 0) return null;

    const bounds = new maplibregl.LngLatBounds();
    points.forEach((point) => {
      bounds.extend([point.lng, point.lat]);
    });
    return bounds;
  },

  /**
   * Fit map to show all given points
   */
  fitBounds(map: maplibregl.Map, points: LatLng[], padding = 50): void {
    const bounds = MapUtils.getBounds(points);
    if (bounds) {
      map.fitBounds(bounds, { padding });
    }
  },

  /**
   * Create a GeoJSON point feature
   */
  createPointFeature(point: LatLng, properties: Record<string, unknown> = {}): GeoJSON.Feature {
    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [point.lng, point.lat],
      },
      properties,
    };
  },

  /**
   * Create a GeoJSON polygon feature from an array of points
   */
  createPolygonFeature(points: LatLng[], properties: Record<string, unknown> = {}): GeoJSON.Feature {
    const coordinates = points.map((p) => [p.lng, p.lat]);
    // Close the polygon
    if (coordinates.length > 0) {
      coordinates.push(coordinates[0]);
    }
    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [coordinates],
      },
      properties,
    };
  },
};

// Re-export maplibregl for advanced usage
export { maplibregl };

export default MapView;
