import { resilientPost, resilientGet } from './resilient-http.js';

const SPATIAL_URL = process.env.SPATIAL_QUERY_SERVICE_URL || 'http://localhost:8099';
const SERVICE_NAME = 'spatial-query';

export interface FarmResult {
  id: number;
  farm_id: number;
  farm_name: string | null;
  area_hectares: number | null;
  perimeter_m: number | null;
  distance_m: number | null;
  centroid_lat: number | null;
  centroid_lng: number | null;
}

export interface DistanceResult {
  distance_m: number;
  distance_km: number;
}

export interface AreaResult {
  area_sqm: number;
  area_hectares: number;
  area_acres: number;
  perimeter_m: number;
  num_points: number;
}

export interface HeatmapCell {
  lat: number;
  lng: number;
  count: number;
  total_area_ha: number;
}

export async function findFarmsWithinRadius(
  latitude: number,
  longitude: number,
  radiusM: number,
  limit: number = 50,
): Promise<{ farms: FarmResult[]; count: number }> {
  return await resilientPost(SERVICE_NAME, `${SPATIAL_URL}/spatial/farms-within-radius`, {
    latitude,
    longitude,
    radius_m: radiusM,
    limit,
  });
}

export async function findNearestFarms(
  latitude: number,
  longitude: number,
  limit: number = 10,
): Promise<{ farms: FarmResult[]; count: number }> {
  return await resilientPost(SERVICE_NAME, `${SPATIAL_URL}/spatial/nearest-farms`, {
    latitude,
    longitude,
    limit,
  });
}

export async function checkPointInFarm(
  latitude: number,
  longitude: number,
): Promise<{ is_inside: boolean; inside_farms: Array<{ id: number; farm_id: number; farm_name: string }> }> {
  return await resilientPost(SERVICE_NAME, `${SPATIAL_URL}/spatial/point-in-farm`, {
    latitude,
    longitude,
  });
}

export async function detectOverlappingBoundaries(): Promise<{ overlaps: Array<{ boundary_a: number; farm_a: number; boundary_b: number; farm_b: number; overlap_hectares: number }>; count: number }> {
  return await resilientPost(SERVICE_NAME, `${SPATIAL_URL}/spatial/overlapping-boundaries`, {});
}

export async function getGeodesicDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): Promise<DistanceResult> {
  return await resilientPost<DistanceResult>(SERVICE_NAME, `${SPATIAL_URL}/spatial/distance`, {
    lat1,
    lng1,
    lat2,
    lng2,
  });
}

export async function calculatePolygonArea(
  coordinates: [number, number][],
): Promise<AreaResult> {
  return await resilientPost<AreaResult>(SERVICE_NAME, `${SPATIAL_URL}/spatial/area`, {
    coordinates: coordinates.map(([lng, lat]) => [lng, lat]),
  });
}

export async function getBufferZone(
  farmId: number,
  bufferM: number,
): Promise<{ farm_id: number; buffer_m: number; buffer_geojson: string; buffer_area_ha: number }> {
  return await resilientPost(SERVICE_NAME, `${SPATIAL_URL}/spatial/buffer`, {
    farm_id: farmId,
    buffer_m: bufferM,
  });
}

export async function getDensityHeatmap(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
  gridSize: number = 20,
): Promise<{ cells: HeatmapCell[]; count: number }> {
  return await resilientPost(SERVICE_NAME, `${SPATIAL_URL}/spatial/density-heatmap`, {
    min_lat: minLat,
    max_lat: maxLat,
    min_lng: minLng,
    max_lng: maxLng,
    grid_size: gridSize,
  });
}

export async function getSpatialServiceHealth(): Promise<{ status: string; database: string; features: string[] }> {
  return await resilientGet(SERVICE_NAME, `${SPATIAL_URL}/health`);
}
