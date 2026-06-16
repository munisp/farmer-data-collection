/**
 * Field Collection Engine
 *
 * GPS/map-tap capture for farm boundaries, crop observations, and field photos.
 * Inspired by GeoLibre's Field Collection tool.
 * Works offline — stores collected features in IndexedDB and syncs when online.
 */

export type GeometryType = "Point" | "LineString" | "Polygon";

export interface FieldFormSchema {
  id: string;
  name: string;
  fields: FieldDefinition[];
}

export interface FieldDefinition {
  name: string;
  type: "text" | "number" | "date" | "choice" | "photo";
  label: string;
  required: boolean;
  choices?: string[];
}

export interface CollectedFeature {
  id: string;
  type: "Feature";
  geometry: {
    type: GeometryType;
    coordinates: number[] | number[][] | number[][][];
  };
  properties: Record<string, unknown>;
  metadata: {
    collectedAt: string;
    collectedBy: string;
    accuracy: number | null;
    altitude: number | null;
    formId: string;
    synced: boolean;
    photos: string[];
  };
}

export interface FieldCollection {
  id: string;
  name: string;
  formSchema: FieldFormSchema;
  features: CollectedFeature[];
  createdAt: string;
  updatedAt: string;
}

const DB_NAME = "farmconnect_field_collection";
const DB_VERSION = 1;
const STORE_NAME = "collections";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Capture current GPS position with accuracy metadata.
 */
export function captureGPSPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

/**
 * Create a point feature from GPS coordinates.
 */
export async function capturePointFromGPS(
  formId: string,
  userId: string,
  properties: Record<string, unknown>
): Promise<CollectedFeature> {
  const position = await captureGPSPosition();
  return {
    id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [position.coords.longitude, position.coords.latitude],
    },
    properties,
    metadata: {
      collectedAt: new Date().toISOString(),
      collectedBy: userId,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      formId,
      synced: false,
      photos: [],
    },
  };
}

/**
 * Create a point feature from map tap (manual placement).
 */
export function capturePointFromMapTap(
  lng: number,
  lat: number,
  formId: string,
  userId: string,
  properties: Record<string, unknown>
): CollectedFeature {
  return {
    id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [lng, lat],
    },
    properties,
    metadata: {
      collectedAt: new Date().toISOString(),
      collectedBy: userId,
      accuracy: null,
      altitude: null,
      formId,
      synced: false,
      photos: [],
    },
  };
}

/**
 * Build a polygon from a series of GPS points (walk-the-boundary).
 */
export function buildPolygonFromPoints(
  points: Array<[number, number]>,
  formId: string,
  userId: string,
  properties: Record<string, unknown>
): CollectedFeature {
  // Close the polygon ring
  const ring = [...points];
  if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0]);
  }

  return {
    id: `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [ring],
    },
    properties,
    metadata: {
      collectedAt: new Date().toISOString(),
      collectedBy: userId,
      accuracy: null,
      altitude: null,
      formId,
      synced: false,
      photos: [],
    },
  };
}

/**
 * Save a collection to IndexedDB for offline persistence.
 */
export async function saveCollection(collection: FieldCollection): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(collection);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Load all collections from IndexedDB.
 */
export async function loadCollections(): Promise<FieldCollection[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Export a collection as GeoJSON FeatureCollection.
 */
export function exportAsGeoJSON(collection: FieldCollection): string {
  const fc = {
    type: "FeatureCollection" as const,
    features: collection.features.map(f => ({
      type: "Feature" as const,
      geometry: f.geometry,
      properties: {
        ...f.properties,
        _collectedAt: f.metadata.collectedAt,
        _collectedBy: f.metadata.collectedBy,
        _accuracy: f.metadata.accuracy,
      },
    })),
  };
  return JSON.stringify(fc, null, 2);
}

/**
 * Get unsynced features count across all collections.
 */
export async function getUnsyncedCount(): Promise<number> {
  const collections = await loadCollections();
  return collections.reduce(
    (sum, c) => sum + c.features.filter(f => !f.metadata.synced).length,
    0
  );
}

/**
 * Pre-built form schemas for common agricultural field collection.
 */
export const FARM_FORM_SCHEMAS: FieldFormSchema[] = [
  {
    id: "farm-boundary",
    name: "Farm Boundary",
    fields: [
      { name: "farm_name", type: "text", label: "Farm Name", required: true },
      { name: "farmer_id", type: "text", label: "Farmer ID", required: true },
      { name: "area_hectares", type: "number", label: "Estimated Area (ha)", required: false },
      { name: "primary_crop", type: "choice", label: "Primary Crop", required: true, choices: ["Maize", "Rice", "Cassava", "Cocoa", "Groundnuts", "Millet", "Sorghum", "Yam", "Tomatoes", "Other"] },
      { name: "soil_type", type: "choice", label: "Soil Type", required: false, choices: ["Clay", "Sandy", "Loam", "Silt", "Laterite"] },
      { name: "photo", type: "photo", label: "Farm Photo", required: false },
    ],
  },
  {
    id: "crop-observation",
    name: "Crop Observation",
    fields: [
      { name: "crop_type", type: "choice", label: "Crop", required: true, choices: ["Maize", "Rice", "Cassava", "Cocoa", "Groundnuts", "Millet", "Tomatoes", "Other"] },
      { name: "growth_stage", type: "choice", label: "Growth Stage", required: true, choices: ["Seedling", "Vegetative", "Flowering", "Fruiting", "Mature", "Harvest Ready"] },
      { name: "health_status", type: "choice", label: "Health", required: true, choices: ["Healthy", "Mild Stress", "Moderate Stress", "Severe Stress", "Dead"] },
      { name: "pest_observed", type: "text", label: "Pest/Disease Observed", required: false },
      { name: "notes", type: "text", label: "Notes", required: false },
      { name: "photo", type: "photo", label: "Photo", required: false },
    ],
  },
  {
    id: "warehouse-inspection",
    name: "Warehouse Inspection",
    fields: [
      { name: "warehouse_name", type: "text", label: "Warehouse Name", required: true },
      { name: "capacity_tons", type: "number", label: "Capacity (tons)", required: true },
      { name: "current_stock_tons", type: "number", label: "Current Stock (tons)", required: false },
      { name: "condition", type: "choice", label: "Condition", required: true, choices: ["Excellent", "Good", "Fair", "Poor", "Condemned"] },
      { name: "cold_chain", type: "choice", label: "Cold Chain Available", required: true, choices: ["Yes", "No"] },
      { name: "date_inspected", type: "date", label: "Inspection Date", required: true },
      { name: "photo", type: "photo", label: "Photo", required: false },
    ],
  },
];
