/**
 * Spectral Index Calculator
 *
 * Client-side calculation of vegetation and crop health indices
 * from satellite imagery (Sentinel-2, Landsat 8/9, NAIP).
 * Inspired by GeoLibre's spectral index toolbox.
 */

import GeoTIFF, { fromUrl } from "geotiff";

export type SpectralIndex = "NDVI" | "NDWI" | "EVI" | "SAVI" | "NDMI" | "NDBI" | "NBR" | "GNDVI";

export interface BandLayout {
  name: string;
  red: number;    // band index (0-based)
  green: number;
  blue: number;
  nir: number;
  swir1?: number;
  swir2?: number;
  redEdge?: number;
}

export interface SpectralResult {
  index: SpectralIndex;
  width: number;
  height: number;
  data: Float32Array;
  min: number;
  max: number;
  mean: number;
  noDataCount: number;
  bbox: [number, number, number, number] | null;
}

export const BAND_LAYOUTS: Record<string, BandLayout> = {
  sentinel2: {
    name: "Sentinel-2",
    red: 3,    // B4 (665nm)
    green: 2,  // B3 (560nm)
    blue: 1,   // B2 (490nm)
    nir: 7,    // B8 (842nm)
    swir1: 10, // B11 (1610nm)
    swir2: 11, // B12 (2190nm)
    redEdge: 4, // B5 (705nm)
  },
  landsat89: {
    name: "Landsat 8/9",
    red: 3,    // B4
    green: 2,  // B3
    blue: 1,   // B2
    nir: 4,    // B5
    swir1: 5,  // B6
    swir2: 6,  // B7
  },
  naip: {
    name: "NAIP",
    red: 0,
    green: 1,
    blue: 2,
    nir: 3,
  },
};

/**
 * Calculate a spectral index from band arrays.
 */
export function calculateIndex(
  index: SpectralIndex,
  bands: Record<string, Float32Array | Float64Array>,
  width: number,
  height: number
): SpectralResult {
  const size = width * height;
  const result = new Float32Array(size);
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let validCount = 0;
  let noDataCount = 0;

  for (let i = 0; i < size; i++) {
    const red = bands.red?.[i] ?? 0;
    const green = bands.green?.[i] ?? 0;
    const nir = bands.nir?.[i] ?? 0;
    const swir1 = bands.swir1?.[i] ?? 0;
    const swir2 = bands.swir2?.[i] ?? 0;
    const blue = bands.blue?.[i] ?? 0;

    let value: number;

    switch (index) {
      case "NDVI":
        // Normalized Difference Vegetation Index
        value = nir + red === 0 ? 0 : (nir - red) / (nir + red);
        break;
      case "NDWI":
        // Normalized Difference Water Index
        value = green + nir === 0 ? 0 : (green - nir) / (green + nir);
        break;
      case "EVI":
        // Enhanced Vegetation Index
        value = nir + 6 * red - 7.5 * blue + 1 === 0
          ? 0
          : 2.5 * ((nir - red) / (nir + 6 * red - 7.5 * blue + 1));
        break;
      case "SAVI": {
        // Soil Adjusted Vegetation Index (L=0.5)
        const L = 0.5;
        value = nir + red + L === 0 ? 0 : ((nir - red) / (nir + red + L)) * (1 + L);
        break;
      }
      case "NDMI":
        // Normalized Difference Moisture Index
        value = nir + swir1 === 0 ? 0 : (nir - swir1) / (nir + swir1);
        break;
      case "NDBI":
        // Normalized Difference Built-up Index
        value = swir1 + nir === 0 ? 0 : (swir1 - nir) / (swir1 + nir);
        break;
      case "NBR":
        // Normalized Burn Ratio
        value = nir + swir2 === 0 ? 0 : (nir - swir2) / (nir + swir2);
        break;
      case "GNDVI":
        // Green NDVI
        value = nir + green === 0 ? 0 : (nir - green) / (nir + green);
        break;
      default:
        value = 0;
    }

    if (isNaN(value) || !isFinite(value)) {
      result[i] = NaN;
      noDataCount++;
    } else {
      result[i] = value;
      if (value < min) min = value;
      if (value > max) max = value;
      sum += value;
      validCount++;
    }
  }

  return {
    index,
    width,
    height,
    data: result,
    min: validCount > 0 ? min : 0,
    max: validCount > 0 ? max : 0,
    mean: validCount > 0 ? sum / validCount : 0,
    noDataCount,
    bbox: null,
  };
}

/**
 * Load a COG/GeoTIFF from URL and extract bands.
 */
export async function loadRasterBands(
  url: string,
  bandIndices: number[]
): Promise<{ bands: Record<number, Float32Array | Float64Array>; width: number; height: number; bbox: [number, number, number, number] }> {
  const tiff = await fromUrl(url);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox() as [number, number, number, number];

  const bands: Record<number, Float32Array | Float64Array> = {};
  for (const idx of bandIndices) {
    const rasters = await image.readRasters({ samples: [idx] });
    bands[idx] = rasters[0] as Float32Array | Float64Array;
  }

  return { bands, width, height, bbox };
}

/**
 * Calculate a spectral index from a COG URL.
 */
export async function calculateIndexFromCOG(
  url: string,
  index: SpectralIndex,
  layout: BandLayout
): Promise<SpectralResult> {
  const bandIndices = new Set<number>();
  bandIndices.add(layout.red);
  bandIndices.add(layout.green);
  bandIndices.add(layout.blue);
  bandIndices.add(layout.nir);
  if (layout.swir1 !== undefined) bandIndices.add(layout.swir1);
  if (layout.swir2 !== undefined) bandIndices.add(layout.swir2);

  const { bands: rawBands, width, height, bbox } = await loadRasterBands(url, Array.from(bandIndices));

  const bands: Record<string, Float32Array | Float64Array> = {
    red: rawBands[layout.red],
    green: rawBands[layout.green],
    blue: rawBands[layout.blue],
    nir: rawBands[layout.nir],
  };
  if (layout.swir1 !== undefined && rawBands[layout.swir1]) bands.swir1 = rawBands[layout.swir1];
  if (layout.swir2 !== undefined && rawBands[layout.swir2]) bands.swir2 = rawBands[layout.swir2];

  const result = calculateIndex(index, bands, width, height);
  result.bbox = bbox;
  return result;
}

/**
 * Classify an NDVI result into crop health categories.
 */
export function classifyNDVI(value: number): { label: string; color: string; description: string } {
  if (value < 0) return { label: "Water/Cloud", color: "#2196F3", description: "Water body or cloud shadow" };
  if (value < 0.1) return { label: "Bare Soil", color: "#795548", description: "Bare soil or fallow land" };
  if (value < 0.2) return { label: "Sparse Vegetation", color: "#FF9800", description: "Very sparse vegetation or stressed crops" };
  if (value < 0.4) return { label: "Moderate", color: "#CDDC39", description: "Moderate vegetation — early growth or mild stress" };
  if (value < 0.6) return { label: "Healthy", color: "#8BC34A", description: "Healthy vegetation — good crop condition" };
  if (value < 0.8) return { label: "Very Healthy", color: "#4CAF50", description: "Dense, vigorous vegetation — excellent condition" };
  return { label: "Peak Health", color: "#1B5E20", description: "Peak vegetation density — optimal growth" };
}

/**
 * Generate an NDVI color ramp for map rendering.
 */
export function ndviColorRamp(value: number): [number, number, number, number] {
  // Brown → Yellow → Light Green → Dark Green
  if (value < 0) return [33, 150, 243, 200];     // Water blue
  if (value < 0.1) return [121, 85, 72, 200];    // Brown
  if (value < 0.2) return [255, 152, 0, 200];    // Orange
  if (value < 0.3) return [205, 220, 57, 200];   // Yellow-green
  if (value < 0.5) return [139, 195, 74, 200];   // Light green
  if (value < 0.7) return [76, 175, 80, 200];    // Green
  return [27, 94, 32, 200];                        // Dark green
}

/**
 * Generate summary statistics for a spectral result.
 */
export function summarizeSpectralResult(result: SpectralResult): {
  index: SpectralIndex;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  healthDistribution: Record<string, number>;
} {
  const validValues = Array.from(result.data).filter(v => !isNaN(v) && isFinite(v));
  const mean = validValues.reduce((a, b) => a + b, 0) / validValues.length;
  const variance = validValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / validValues.length;

  const healthDistribution: Record<string, number> = {};
  if (result.index === "NDVI") {
    for (const v of validValues) {
      const { label } = classifyNDVI(v);
      healthDistribution[label] = (healthDistribution[label] || 0) + 1;
    }
    // Convert to percentages
    const total = validValues.length;
    for (const key of Object.keys(healthDistribution)) {
      healthDistribution[key] = Math.round((healthDistribution[key] / total) * 100 * 10) / 10;
    }
  }

  return {
    index: result.index,
    min: result.min,
    max: result.max,
    mean,
    stdDev: Math.sqrt(variance),
    healthDistribution,
  };
}
