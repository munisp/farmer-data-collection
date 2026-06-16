/**
 * H3 Hexagonal Grid Tools
 *
 * Spatial binning for demand/supply heatmaps, distributor coverage analysis,
 * and crop density mapping using Uber's H3 geospatial indexing system.
 * Inspired by GeoLibre's H3 tools.
 */

import * as h3 from "h3-js";

export interface H3Cell {
  h3Index: string;
  center: [number, number]; // [lat, lng]
  boundary: Array<[number, number]>; // [[lat, lng], ...]
  resolution: number;
}

export interface H3AggregatedCell extends H3Cell {
  count: number;
  value: number;
  features: Array<{ id: string | number; properties: Record<string, unknown> }>;
}

export interface H3GridResult {
  cells: H3AggregatedCell[];
  resolution: number;
  totalFeatures: number;
  bounds: { north: number; south: number; east: number; west: number };
  stats: {
    minCount: number;
    maxCount: number;
    meanCount: number;
    minValue: number;
    maxValue: number;
    meanValue: number;
  };
}

/**
 * Generate an H3 grid covering a bounding box.
 */
export function generateH3Grid(
  bounds: { north: number; south: number; east: number; west: number },
  resolution: number
): H3Cell[] {
  const polygon: [number, number][] = [
    [bounds.north, bounds.west],
    [bounds.north, bounds.east],
    [bounds.south, bounds.east],
    [bounds.south, bounds.west],
    [bounds.north, bounds.west],
  ];

  const hexagons = h3.polygonToCells(polygon, resolution, true);

  return hexagons.map(idx => ({
    h3Index: idx,
    center: h3.cellToLatLng(idx) as [number, number],
    boundary: h3.cellToBoundary(idx) as Array<[number, number]>,
    resolution,
  }));
}

/**
 * Bin point features into H3 hexagonal cells.
 */
export function binPointsToH3(
  points: Array<{ lat: number; lng: number; id: string | number; value?: number; properties?: Record<string, unknown> }>,
  resolution: number
): H3GridResult {
  const cellMap = new Map<string, H3AggregatedCell>();

  let north = -Infinity, south = Infinity, east = -Infinity, west = Infinity;

  for (const point of points) {
    const h3Index = h3.latLngToCell(point.lat, point.lng, resolution);

    if (!cellMap.has(h3Index)) {
      cellMap.set(h3Index, {
        h3Index,
        center: h3.cellToLatLng(h3Index) as [number, number],
        boundary: h3.cellToBoundary(h3Index) as Array<[number, number]>,
        resolution,
        count: 0,
        value: 0,
        features: [],
      });
    }

    const cell = cellMap.get(h3Index)!;
    cell.count++;
    cell.value += point.value ?? 1;
    cell.features.push({ id: point.id, properties: point.properties ?? {} });

    if (point.lat > north) north = point.lat;
    if (point.lat < south) south = point.lat;
    if (point.lng > east) east = point.lng;
    if (point.lng < west) west = point.lng;
  }

  const cells = Array.from(cellMap.values());
  const counts = cells.map(c => c.count);
  const values = cells.map(c => c.value);

  return {
    cells,
    resolution,
    totalFeatures: points.length,
    bounds: { north, south, east, west },
    stats: {
      minCount: Math.min(...counts, 0),
      maxCount: Math.max(...counts, 0),
      meanCount: counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0,
      minValue: Math.min(...values, 0),
      maxValue: Math.max(...values, 0),
      meanValue: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0,
    },
  };
}

/**
 * Convert H3 grid result to GeoJSON for MapLibre rendering.
 */
export function h3GridToGeoJSON(result: H3GridResult): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: result.cells.map(cell => ({
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [...cell.boundary.map(([lat, lng]) => [lng, lat]), [cell.boundary[0][1], cell.boundary[0][0]]],
        ],
      },
      properties: {
        h3Index: cell.h3Index,
        count: cell.count,
        value: cell.value,
        centerLat: cell.center[0],
        centerLng: cell.center[1],
      },
    })),
  };
}

/**
 * Get the optimal H3 resolution for a given map zoom level.
 */
export function zoomToH3Resolution(mapZoom: number): number {
  if (mapZoom <= 3) return 1;
  if (mapZoom <= 5) return 2;
  if (mapZoom <= 7) return 3;
  if (mapZoom <= 8) return 4;
  if (mapZoom <= 9) return 5;
  if (mapZoom <= 10) return 6;
  if (mapZoom <= 12) return 7;
  if (mapZoom <= 14) return 8;
  if (mapZoom <= 16) return 9;
  return 10;
}

/**
 * Analyze distributor coverage using H3 cells.
 * Returns cells with and without distributor coverage.
 */
export function analyzeDistributorCoverage(
  distributors: Array<{ lat: number; lng: number; id: string | number; coverageRadiusKm: number }>,
  demandPoints: Array<{ lat: number; lng: number; id: string | number; value?: number }>,
  resolution: number
): {
  coveredCells: H3AggregatedCell[];
  uncoveredCells: H3AggregatedCell[];
  coveragePercent: number;
  gapAreas: Array<{ center: [number, number]; demandCount: number }>;
} {
  // Get covered H3 cells (within distributor radius)
  const coveredSet = new Set<string>();
  for (const dist of distributors) {
    const centerH3 = h3.latLngToCell(dist.lat, dist.lng, resolution);
    const ring = h3.gridDisk(centerH3, Math.ceil(dist.coverageRadiusKm / (h3.getHexagonEdgeLengthAvg(resolution, "km") * 2)));
    ring.forEach(idx => coveredSet.add(idx));
  }

  // Bin demand points
  const demandGrid = binPointsToH3(demandPoints, resolution);

  const coveredCells: H3AggregatedCell[] = [];
  const uncoveredCells: H3AggregatedCell[] = [];

  for (const cell of demandGrid.cells) {
    if (coveredSet.has(cell.h3Index)) {
      coveredCells.push(cell);
    } else {
      uncoveredCells.push(cell);
    }
  }

  const totalDemand = demandGrid.cells.length;
  const coveragePercent = totalDemand > 0 ? Math.round((coveredCells.length / totalDemand) * 100) : 0;

  // Identify gap areas (uncovered cells with high demand)
  const gapAreas = uncoveredCells
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(cell => ({
      center: cell.center,
      demandCount: cell.count,
    }));

  return { coveredCells, uncoveredCells, coveragePercent, gapAreas };
}

/**
 * Generate a color for an H3 cell based on its value relative to min/max.
 */
export function h3ValueToColor(
  value: number,
  min: number,
  max: number,
  colorRamp: "heat" | "green" | "blue" = "heat"
): string {
  const t = max === min ? 0.5 : (value - min) / (max - min);

  switch (colorRamp) {
    case "heat":
      // Yellow → Orange → Red
      if (t < 0.5) return `rgba(255, ${Math.round(255 - t * 200)}, 0, 0.7)`;
      return `rgba(255, ${Math.round(155 - (t - 0.5) * 310)}, 0, 0.7)`;
    case "green":
      // Light green → Dark green
      return `rgba(${Math.round(200 - t * 170)}, ${Math.round(230 - t * 50)}, ${Math.round(200 - t * 170)}, 0.7)`;
    case "blue":
      // Light blue → Dark blue
      return `rgba(${Math.round(200 - t * 170)}, ${Math.round(200 - t * 100)}, ${Math.round(230 + t * 25)}, 0.7)`;
    default:
      return `rgba(255, ${Math.round(255 * (1 - t))}, 0, 0.7)`;
  }
}
