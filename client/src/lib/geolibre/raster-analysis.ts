/**
 * Raster Analysis Tools
 *
 * Client-side raster processing for terrain analysis, slope/aspect,
 * hillshade, contour generation, and zonal statistics.
 * Inspired by GeoLibre's Raster menu.
 */

import { fromUrl } from "geotiff";

export interface RasterData {
  data: Float32Array;
  width: number;
  height: number;
  bbox: [number, number, number, number];
  noDataValue: number;
  resolution: { x: number; y: number };
}

export interface ZonalStats {
  zoneId: string | number;
  count: number;
  min: number;
  max: number;
  mean: number;
  sum: number;
  stdDev: number;
}

/**
 * Load a single-band raster from a COG URL.
 */
export async function loadRaster(url: string, bandIndex: number = 0): Promise<RasterData> {
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox() as [number, number, number, number];
  const rasters = await image.readRasters({ samples: [bandIndex] });
  const data = new Float32Array(rasters[0] as ArrayLike<number>);

  const fileDir = image.fileDirectory as unknown as Record<string, unknown>;
  const gdalNoData = fileDir["GDAL_NODATA"];
  const noDataValue = gdalNoData ? parseFloat(String(gdalNoData)) : -9999;

  return {
    data,
    width,
    height,
    bbox,
    noDataValue,
    resolution: {
      x: (bbox[2] - bbox[0]) / width,
      y: (bbox[3] - bbox[1]) / height,
    },
  };
}

/**
 * Calculate hillshade from a DEM raster.
 * Azimuth: sun direction in degrees (0=N, 90=E, 180=S, 270=W)
 * Altitude: sun angle above horizon in degrees (0-90)
 */
export function calculateHillshade(
  dem: RasterData,
  azimuth: number = 315,
  altitude: number = 45
): RasterData {
  const { width, height, data, noDataValue } = dem;
  const result = new Float32Array(width * height);

  const azRad = (azimuth * Math.PI) / 180;
  const altRad = (altitude * Math.PI) / 180;
  const cellSize = dem.resolution.x * 111319.9; // degrees → meters

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const z = data[idx];
      if (z === noDataValue) {
        result[idx] = noDataValue;
        continue;
      }

      // 3x3 neighborhood
      const a = data[(y - 1) * width + (x - 1)];
      const b = data[(y - 1) * width + x];
      const c = data[(y - 1) * width + (x + 1)];
      const d = data[y * width + (x - 1)];
      const f = data[y * width + (x + 1)];
      const g = data[(y + 1) * width + (x - 1)];
      const h = data[(y + 1) * width + x];
      const ii = data[(y + 1) * width + (x + 1)];

      // Slope components (Horn's method)
      const dzdx = ((c + 2 * f + ii) - (a + 2 * d + g)) / (8 * cellSize);
      const dzdy = ((g + 2 * h + ii) - (a + 2 * b + c)) / (8 * cellSize);

      const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      const aspectRad = Math.atan2(dzdy, -dzdx);

      result[idx] = Math.max(0, Math.min(255,
        255 * (
          Math.cos(altRad) * Math.cos(slopeRad) +
          Math.sin(altRad) * Math.sin(slopeRad) * Math.cos(azRad - aspectRad)
        )
      ));
    }
  }

  return { ...dem, data: result };
}

/**
 * Calculate slope from a DEM raster (in degrees).
 */
export function calculateSlope(dem: RasterData): RasterData {
  const { width, height, data, noDataValue } = dem;
  const result = new Float32Array(width * height);
  const cellSize = dem.resolution.x * 111319.9;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (data[idx] === noDataValue) {
        result[idx] = noDataValue;
        continue;
      }

      const a = data[(y - 1) * width + (x - 1)];
      const b = data[(y - 1) * width + x];
      const c = data[(y - 1) * width + (x + 1)];
      const d = data[y * width + (x - 1)];
      const f = data[y * width + (x + 1)];
      const g = data[(y + 1) * width + (x - 1)];
      const h = data[(y + 1) * width + x];
      const ii = data[(y + 1) * width + (x + 1)];

      const dzdx = ((c + 2 * f + ii) - (a + 2 * d + g)) / (8 * cellSize);
      const dzdy = ((g + 2 * h + ii) - (a + 2 * b + c)) / (8 * cellSize);

      result[idx] = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * (180 / Math.PI);
    }
  }

  return { ...dem, data: result };
}

/**
 * Calculate aspect from a DEM raster (compass direction of slope, in degrees).
 */
export function calculateAspect(dem: RasterData): RasterData {
  const { width, height, data, noDataValue } = dem;
  const result = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (data[idx] === noDataValue) {
        result[idx] = noDataValue;
        continue;
      }

      const a = data[(y - 1) * width + (x - 1)];
      const b = data[(y - 1) * width + x];
      const c = data[(y - 1) * width + (x + 1)];
      const d = data[y * width + (x - 1)];
      const f = data[y * width + (x + 1)];
      const g = data[(y + 1) * width + (x - 1)];
      const h = data[(y + 1) * width + x];
      const ii = data[(y + 1) * width + (x + 1)];

      const dzdx = ((c + 2 * f + ii) - (a + 2 * d + g)) / 8;
      const dzdy = ((g + 2 * h + ii) - (a + 2 * b + c)) / 8;

      let aspect = Math.atan2(dzdy, -dzdx) * (180 / Math.PI);
      if (aspect < 0) aspect += 360;

      result[idx] = aspect;
    }
  }

  return { ...dem, data: result };
}

/**
 * Generate contour lines from a DEM raster.
 * Returns GeoJSON LineStrings at the specified interval.
 */
export function generateContours(
  dem: RasterData,
  interval: number = 50
): GeoJSON.FeatureCollection {
  const { width, height, data, bbox, noDataValue } = dem;
  const features: GeoJSON.Feature[] = [];

  // Find min/max elevation
  let minElev = Infinity;
  let maxElev = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== noDataValue && isFinite(data[i])) {
      if (data[i] < minElev) minElev = data[i];
      if (data[i] > maxElev) maxElev = data[i];
    }
  }

  const startElev = Math.ceil(minElev / interval) * interval;
  const pixelToLng = (x: number) => bbox[0] + (x / width) * (bbox[2] - bbox[0]);
  const pixelToLat = (y: number) => bbox[3] - (y / height) * (bbox[3] - bbox[1]);

  // March through each contour level using marching squares
  for (let elev = startElev; elev <= maxElev; elev += interval) {
    const segments: Array<[[number, number], [number, number]]> = [];

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const tl = data[y * width + x];
        const tr = data[y * width + x + 1];
        const bl = data[(y + 1) * width + x];
        const br = data[(y + 1) * width + x + 1];

        if ([tl, tr, bl, br].some(v => v === noDataValue || !isFinite(v))) continue;

        // Marching squares case
        let caseIndex = 0;
        if (tl >= elev) caseIndex |= 8;
        if (tr >= elev) caseIndex |= 4;
        if (br >= elev) caseIndex |= 2;
        if (bl >= elev) caseIndex |= 1;

        if (caseIndex === 0 || caseIndex === 15) continue;

        // Linear interpolation along edges
        const lerp = (v1: number, v2: number) => {
          if (v1 === v2) return 0.5;
          return (elev - v1) / (v2 - v1);
        };

        const top: [number, number] = [pixelToLng(x + lerp(tl, tr)), pixelToLat(y)];
        const right: [number, number] = [pixelToLng(x + 1), pixelToLat(y + lerp(tr, br))];
        const bottom: [number, number] = [pixelToLng(x + lerp(bl, br)), pixelToLat(y + 1)];
        const left: [number, number] = [pixelToLng(x), pixelToLat(y + lerp(tl, bl))];

        // Generate segments based on case
        switch (caseIndex) {
          case 1: case 14: segments.push([left, bottom]); break;
          case 2: case 13: segments.push([bottom, right]); break;
          case 3: case 12: segments.push([left, right]); break;
          case 4: case 11: segments.push([top, right]); break;
          case 6: case 9: segments.push([top, bottom]); break;
          case 7: case 8: segments.push([top, left]); break;
          case 5:
            segments.push([left, top]);
            segments.push([bottom, right]);
            break;
          case 10:
            segments.push([top, right]);
            segments.push([left, bottom]);
            break;
        }
      }
    }

    if (segments.length > 0) {
      // Group connected segments into lines
      const lines = groupSegmentsIntoLines(segments);
      for (const line of lines) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: line },
          properties: { elevation: elev },
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}

function groupSegmentsIntoLines(
  segments: Array<[[number, number], [number, number]]>
): Array<Array<[number, number]>> {
  const lines: Array<Array<[number, number]>> = [];
  const used = new Set<number>();
  const EPS = 1e-8;

  const close = (a: [number, number], b: [number, number]) =>
    Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const line: Array<[number, number]> = [segments[i][0], segments[i][1]];

    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue;
        if (close(line[line.length - 1], segments[j][0])) {
          line.push(segments[j][1]);
          used.add(j);
          extended = true;
        } else if (close(line[line.length - 1], segments[j][1])) {
          line.push(segments[j][0]);
          used.add(j);
          extended = true;
        }
      }
    }

    if (line.length >= 2) lines.push(line);
  }

  return lines;
}

/**
 * Calculate zonal statistics for raster values within polygon zones.
 */
export function calculateZonalStats(
  raster: RasterData,
  zones: GeoJSON.FeatureCollection<GeoJSON.Polygon>,
  zoneIdField: string = "id"
): ZonalStats[] {
  const results: ZonalStats[] = [];
  const { width, height, data, bbox, noDataValue } = raster;
  const pixelWidth = (bbox[2] - bbox[0]) / width;
  const pixelHeight = (bbox[3] - bbox[1]) / height;

  for (const zone of zones.features) {
    const zoneId = zone.properties?.[zoneIdField] ?? "unknown";
    const zoneBbox = getBBox(zone);
    const values: number[] = [];

    // Sample raster pixels within zone
    const xStart = Math.max(0, Math.floor((zoneBbox[0] - bbox[0]) / pixelWidth));
    const xEnd = Math.min(width - 1, Math.ceil((zoneBbox[2] - bbox[0]) / pixelWidth));
    const yStart = Math.max(0, Math.floor((bbox[3] - zoneBbox[3]) / pixelHeight));
    const yEnd = Math.min(height - 1, Math.ceil((bbox[3] - zoneBbox[1]) / pixelHeight));

    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        const lng = bbox[0] + x * pixelWidth + pixelWidth / 2;
        const lat = bbox[3] - y * pixelHeight - pixelHeight / 2;
        const val = data[y * width + x];

        if (val === noDataValue || !isFinite(val)) continue;

        // Point-in-polygon check
        if (isPointInPolygon(lng, lat, zone.geometry.coordinates[0] as Array<[number, number]>)) {
          values.push(val);
        }
      }
    }

    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / values.length;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;

      results.push({
        zoneId,
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        mean,
        sum,
        stdDev: Math.sqrt(variance),
      });
    }
  }

  return results;
}

function getBBox(feature: GeoJSON.Feature): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const coords = (feature.geometry as GeoJSON.Polygon).coordinates[0];
  for (const [lng, lat] of coords as Array<[number, number]>) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}

function isPointInPolygon(x: number, y: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Classify slope for land suitability assessment.
 */
export function classifySlopeForFarming(slopeDegrees: number): {
  label: string;
  color: string;
  suitability: string;
} {
  if (slopeDegrees < 2) return { label: "Flat (0-2°)", color: "#4CAF50", suitability: "Excellent — all crops" };
  if (slopeDegrees < 5) return { label: "Gentle (2-5°)", color: "#8BC34A", suitability: "Good — most crops, minimal erosion risk" };
  if (slopeDegrees < 10) return { label: "Moderate (5-10°)", color: "#CDDC39", suitability: "Fair — terracing recommended" };
  if (slopeDegrees < 15) return { label: "Steep (10-15°)", color: "#FF9800", suitability: "Marginal — tree crops, contour farming" };
  if (slopeDegrees < 25) return { label: "Very Steep (15-25°)", color: "#F44336", suitability: "Poor — forestry or pasture only" };
  return { label: "Extreme (>25°)", color: "#B71C1C", suitability: "Unsuitable — conservation land" };
}
