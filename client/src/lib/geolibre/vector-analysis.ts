/**
 * Vector Analysis Tools
 *
 * Client-side spatial analysis using Turf.js — buffer, spatial join, clip,
 * dissolve, centroid, convex hull, bounding box, simplify, and more.
 * Inspired by GeoLibre's Vector menu.
 * All operations run in-browser without server dependencies.
 */

import * as turf from "@turf/turf";

export type VectorOperation =
  | "buffer"
  | "centroid"
  | "convexHull"
  | "bbox"
  | "dissolve"
  | "simplify"
  | "clip"
  | "intersection"
  | "difference"
  | "union"
  | "spatialJoin"
  | "pointsInPolygon"
  | "voronoi"
  | "tin";

export interface VectorAnalysisResult {
  operation: VectorOperation;
  input: GeoJSON.FeatureCollection;
  output: GeoJSON.FeatureCollection;
  stats: {
    inputFeatureCount: number;
    outputFeatureCount: number;
    executionTimeMs: number;
  };
}

/**
 * Buffer features by a given distance.
 */
export function bufferFeatures(
  fc: GeoJSON.FeatureCollection,
  distance: number,
  units: "kilometers" | "meters" | "miles" = "kilometers"
): VectorAnalysisResult {
  const start = performance.now();
  const buffered = turf.buffer(fc, distance, { units });
  const output = buffered ?? turf.featureCollection([]);
  return {
    operation: "buffer",
    input: fc,
    output: output as GeoJSON.FeatureCollection,
    stats: {
      inputFeatureCount: fc.features.length,
      outputFeatureCount: (output as GeoJSON.FeatureCollection).features?.length ?? 0,
      executionTimeMs: performance.now() - start,
    },
  };
}

/**
 * Calculate centroids of all features.
 */
export function calculateCentroids(fc: GeoJSON.FeatureCollection): VectorAnalysisResult {
  const start = performance.now();
  const centroids = turf.featureCollection(
    fc.features.map(f => {
      const c = turf.centroid(f);
      c.properties = { ...f.properties };
      return c;
    })
  );
  return {
    operation: "centroid",
    input: fc,
    output: centroids,
    stats: {
      inputFeatureCount: fc.features.length,
      outputFeatureCount: centroids.features.length,
      executionTimeMs: performance.now() - start,
    },
  };
}

/**
 * Calculate convex hull of a feature collection.
 */
export function convexHull(fc: GeoJSON.FeatureCollection): VectorAnalysisResult {
  const start = performance.now();
  const hull = turf.convex(fc);
  const output = hull ? turf.featureCollection([hull]) : turf.featureCollection([]);
  return {
    operation: "convexHull",
    input: fc,
    output,
    stats: {
      inputFeatureCount: fc.features.length,
      outputFeatureCount: output.features.length,
      executionTimeMs: performance.now() - start,
    },
  };
}

/**
 * Calculate bounding box of a feature collection.
 */
export function boundingBox(fc: GeoJSON.FeatureCollection): VectorAnalysisResult {
  const start = performance.now();
  const envelope = turf.bboxPolygon(turf.bbox(fc));
  const output = turf.featureCollection([envelope]);
  return {
    operation: "bbox",
    input: fc,
    output,
    stats: {
      inputFeatureCount: fc.features.length,
      outputFeatureCount: 1,
      executionTimeMs: performance.now() - start,
    },
  };
}

/**
 * Dissolve overlapping polygons.
 */
export function dissolveFeatures(
  fc: GeoJSON.FeatureCollection,
  propertyName?: string
): VectorAnalysisResult {
  const start = performance.now();
  const dissolved = propertyName
    ? turf.dissolve(fc as GeoJSON.FeatureCollection<GeoJSON.Polygon>, { propertyName })
    : turf.dissolve(fc as GeoJSON.FeatureCollection<GeoJSON.Polygon>);
  return {
    operation: "dissolve",
    input: fc,
    output: dissolved,
    stats: {
      inputFeatureCount: fc.features.length,
      outputFeatureCount: dissolved.features.length,
      executionTimeMs: performance.now() - start,
    },
  };
}

/**
 * Simplify geometries using Douglas-Peucker algorithm.
 */
export function simplifyFeatures(
  fc: GeoJSON.FeatureCollection,
  tolerance: number = 0.01,
  highQuality: boolean = true
): VectorAnalysisResult {
  const start = performance.now();
  const simplified = turf.simplify(fc, { tolerance, highQuality });
  return {
    operation: "simplify",
    input: fc,
    output: simplified as GeoJSON.FeatureCollection,
    stats: {
      inputFeatureCount: fc.features.length,
      outputFeatureCount: (simplified as GeoJSON.FeatureCollection).features.length,
      executionTimeMs: performance.now() - start,
    },
  };
}

/**
 * Clip features to a polygon boundary.
 */
export function clipFeatures(
  fc: GeoJSON.FeatureCollection,
  clipPolygon: GeoJSON.Feature<GeoJSON.Polygon>
): VectorAnalysisResult {
  const start = performance.now();
  const clipped: GeoJSON.Feature[] = [];

  for (const feature of fc.features) {
    try {
      const geomType = feature.geometry.type;
      if (geomType === "Polygon" || geomType === "MultiPolygon") {
        const result = turf.intersect(
          turf.featureCollection([feature as GeoJSON.Feature<GeoJSON.Polygon>, clipPolygon])
        );
        if (result) {
          result.properties = { ...feature.properties };
          clipped.push(result);
        }
      } else if (geomType === "Point") {
        if (turf.booleanPointInPolygon(feature as GeoJSON.Feature<GeoJSON.Point>, clipPolygon)) {
          clipped.push(feature);
        }
      } else if (geomType === "LineString" || geomType === "MultiLineString") {
        // Line clipping — keep the feature if it intersects
        const line = feature as GeoJSON.Feature<GeoJSON.LineString>;
        const bbox = turf.bbox(clipPolygon);
        const lineBbox = turf.bbox(line);
        if (lineBbox[0] <= bbox[2] && lineBbox[2] >= bbox[0] && lineBbox[1] <= bbox[3] && lineBbox[3] >= bbox[1]) {
          clipped.push(feature);
        }
      }
    } catch {
      // Skip invalid geometries
    }
  }

  const output = turf.featureCollection(clipped);
  return {
    operation: "clip",
    input: fc,
    output,
    stats: {
      inputFeatureCount: fc.features.length,
      outputFeatureCount: clipped.length,
      executionTimeMs: performance.now() - start,
    },
  };
}

/**
 * Spatial join — attach properties from polygon layer to point layer.
 */
export function spatialJoin(
  points: GeoJSON.FeatureCollection<GeoJSON.Point>,
  polygons: GeoJSON.FeatureCollection<GeoJSON.Polygon>
): VectorAnalysisResult {
  const start = performance.now();
  const joined = turf.tag(points, polygons, "joined_id", "joined_id");
  return {
    operation: "spatialJoin",
    input: points,
    output: joined,
    stats: {
      inputFeatureCount: points.features.length,
      outputFeatureCount: joined.features.length,
      executionTimeMs: performance.now() - start,
    },
  };
}

/**
 * Count points within each polygon.
 */
export function pointsInPolygon(
  points: GeoJSON.FeatureCollection<GeoJSON.Point>,
  polygons: GeoJSON.FeatureCollection<GeoJSON.Polygon>
): VectorAnalysisResult {
  const start = performance.now();
  const result = turf.collect(polygons, points, "value", "collectedValues");
  // Add count property
  for (const feature of result.features) {
    const collected = feature.properties?.collectedValues as unknown[];
    feature.properties = {
      ...feature.properties,
      pointCount: collected?.length ?? 0,
    };
  }
  return {
    operation: "pointsInPolygon",
    input: points,
    output: result as unknown as GeoJSON.FeatureCollection,
    stats: {
      inputFeatureCount: points.features.length,
      outputFeatureCount: result.features.length,
      executionTimeMs: performance.now() - start,
    },
  };
}

/**
 * Generate Voronoi polygons from points (Thiessen polygons for coverage areas).
 */
export function voronoiDiagram(
  points: GeoJSON.FeatureCollection<GeoJSON.Point>,
  clipBbox?: [number, number, number, number]
): VectorAnalysisResult {
  const start = performance.now();
  const bbox = clipBbox ?? turf.bbox(points) as [number, number, number, number];
  // Add margin to bbox
  const margin = 0.1;
  const expandedBbox: [number, number, number, number] = [
    bbox[0] - margin, bbox[1] - margin, bbox[2] + margin, bbox[3] + margin
  ];
  const voronoi = turf.voronoi(points, { bbox: expandedBbox });
  return {
    operation: "voronoi",
    input: points,
    output: voronoi as GeoJSON.FeatureCollection,
    stats: {
      inputFeatureCount: points.features.length,
      outputFeatureCount: voronoi.features.length,
      executionTimeMs: performance.now() - start,
    },
  };
}

/**
 * Calculate area statistics for polygon features.
 */
export function calculateAreaStats(
  fc: GeoJSON.FeatureCollection
): { totalAreaHa: number; avgAreaHa: number; minAreaHa: number; maxAreaHa: number; features: Array<{ id: unknown; areaHa: number }> } {
  const areas = fc.features
    .filter(f => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
    .map(f => ({
      id: f.properties?.id ?? f.id,
      areaHa: turf.area(f) / 10000, // m² → hectares
    }));

  const areaValues = areas.map(a => a.areaHa);
  return {
    totalAreaHa: areaValues.reduce((a, b) => a + b, 0),
    avgAreaHa: areaValues.length > 0 ? areaValues.reduce((a, b) => a + b, 0) / areaValues.length : 0,
    minAreaHa: Math.min(...areaValues, 0),
    maxAreaHa: Math.max(...areaValues, 0),
    features: areas,
  };
}

/**
 * Calculate distance matrix between two sets of points.
 */
export function distanceMatrix(
  origins: Array<{ id: string; lat: number; lng: number }>,
  destinations: Array<{ id: string; lat: number; lng: number }>,
  units: "kilometers" | "meters" | "miles" = "kilometers"
): Array<{ originId: string; destinationId: string; distance: number }> {
  const results: Array<{ originId: string; destinationId: string; distance: number }> = [];

  for (const origin of origins) {
    for (const dest of destinations) {
      const from = turf.point([origin.lng, origin.lat]);
      const to = turf.point([dest.lng, dest.lat]);
      const distance = turf.distance(from, to, { units });
      results.push({ originId: origin.id, destinationId: dest.id, distance });
    }
  }

  return results.sort((a, b) => a.distance - b.distance);
}
