/**
 * Satellite Imagery Service
 * 
 * Integrates with Sentinel Hub API to fetch satellite imagery and calculate vegetation indices
 * Supports NDVI, NDRE, EVI, SAVI, and other vegetation indices
 */

import axios from 'axios';

export interface FieldBoundary {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface SatelliteImageRequest {
  boundary: FieldBoundary;
  startDate: string;
  endDate: string;
  cloudCoverage?: number;
  resolution?: number;
}

export interface VegetationIndices {
  ndvi: number;
  ndre: number;
  evi: number;
  savi: number;
  gndvi: number;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
}

export interface SatelliteImageResult {
  imageUrl: string;
  thumbnailUrl: string;
  imageDate: string;
  cloudCoverage: number;
  resolution: number;
  indices: VegetationIndices;
}

/**
 * Calculate NDVI (Normalized Difference Vegetation Index)
 * NDVI = (NIR - RED) / (NIR + RED)
 * Range: -1 to 1 (healthy vegetation: 0.2 to 0.8)
 */
export function calculateNDVI(nir: number, red: number): number {
  if (nir + red === 0) return 0;
  return (nir - red) / (nir + red);
}

/**
 * Calculate NDRE (Normalized Difference Red Edge)
 * NDRE = (NIR - RedEdge) / (NIR + RedEdge)
 * Better for detecting nitrogen stress
 */
export function calculateNDRE(nir: number, redEdge: number): number {
  if (nir + redEdge === 0) return 0;
  return (nir - redEdge) / (nir + redEdge);
}

/**
 * Calculate EVI (Enhanced Vegetation Index)
 * EVI = 2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))
 * More sensitive to canopy structure
 */
export function calculateEVI(nir: number, red: number, blue: number): number {
  const denominator = nir + 6 * red - 7.5 * blue + 1;
  if (denominator === 0) return 0;
  return 2.5 * ((nir - red) / denominator);
}

/**
 * Calculate SAVI (Soil Adjusted Vegetation Index)
 * SAVI = ((NIR - RED) / (NIR + RED + L)) * (1 + L)
 * L = 0.5 for intermediate vegetation density
 */
export function calculateSAVI(nir: number, red: number, L: number = 0.5): number {
  const denominator = nir + red + L;
  if (denominator === 0) return 0;
  return ((nir - red) / denominator) * (1 + L);
}

/**
 * Calculate GNDVI (Green Normalized Difference Vegetation Index)
 * GNDVI = (NIR - GREEN) / (NIR + GREEN)
 * More sensitive to chlorophyll concentration
 */
export function calculateGNDVI(nir: number, green: number): number {
  if (nir + green === 0) return 0;
  return (nir - green) / (nir + green);
}

/**
 * Calculate statistical metrics for vegetation indices
 */
export function calculateStatistics(values: number[]): {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
} {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, stdDev: 0 };
  }

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return { mean, min, max, stdDev };
}

/**
 * Fetch satellite imagery from Sentinel Hub
 * Note: This is a mock implementation. In production, you would:
 * 1. Sign up for Sentinel Hub API access
 * 2. Configure authentication credentials
 * 3. Use their Process API to fetch imagery
 */
export async function fetchSatelliteImagery(
  request: SatelliteImageRequest
): Promise<SatelliteImageResult> {
  // Mock implementation - replace with actual Sentinel Hub API calls
  
  // In production, you would use Sentinel Hub's Process API:
  // const response = await axios.post('https://services.sentinel-hub.com/api/v1/process', {
  //   input: {
  //     bounds: {
  //       geometry: request.boundary,
  //     },
  //     data: [{
  //       type: 'sentinel-2-l2a',
  //       dataFilter: {
  //         timeRange: {
  //           from: request.startDate,
  //           to: request.endDate,
  //         },
  //         maxCloudCoverage: request.cloudCoverage || 20,
  //       },
  //     }],
  //   },
  //   output: {
  //     width: 512,
  //     height: 512,
  //     responses: [{
  //       identifier: 'default',
  //       format: { type: 'image/png' },
  //     }],
  //   },
  //   evalscript: getEvalscript('TRUE_COLOR'),
  // }, {
  //   headers: {
  //     'Authorization': `Bearer ${process.env.SENTINEL_HUB_TOKEN}`,
  //     'Content-Type': 'application/json',
  //   },
  // });

  // Mock response for demonstration
  const mockIndices: VegetationIndices = {
    ndvi: 0.65,
    ndre: 0.45,
    evi: 0.55,
    savi: 0.60,
    gndvi: 0.50,
    mean: 0.55,
    min: 0.30,
    max: 0.80,
    stdDev: 0.12,
  };

  return {
    imageUrl: '/api/mock/satellite-image.png',
    thumbnailUrl: '/api/mock/satellite-thumbnail.png',
    imageDate: new Date().toISOString(),
    cloudCoverage: 5.2,
    resolution: 10, // 10 meters per pixel (Sentinel-2)
    indices: mockIndices,
  };
}

/**
 * Generate evalscript for Sentinel Hub
 * Evalscripts define how to process satellite data
 */
function getEvalscript(type: 'TRUE_COLOR' | 'FALSE_COLOR' | 'NDVI' | 'NDRE'): string {
  const scripts = {
    TRUE_COLOR: `
      //VERSION=3
      function setup() {
        return {
          input: ["B02", "B03", "B04"],
          output: { bands: 3 }
        };
      }
      function evaluatePixel(sample) {
        return [2.5 * sample.B04, 2.5 * sample.B03, 2.5 * sample.B02];
      }
    `,
    FALSE_COLOR: `
      //VERSION=3
      function setup() {
        return {
          input: ["B03", "B04", "B08"],
          output: { bands: 3 }
        };
      }
      function evaluatePixel(sample) {
        return [2.5 * sample.B08, 2.5 * sample.B04, 2.5 * sample.B03];
      }
    `,
    NDVI: `
      //VERSION=3
      function setup() {
        return {
          input: ["B04", "B08"],
          output: { bands: 1 }
        };
      }
      function evaluatePixel(sample) {
        let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
        return [ndvi];
      }
    `,
    NDRE: `
      //VERSION=3
      function setup() {
        return {
          input: ["B05", "B08"],
          output: { bands: 1 }
        };
      }
      function evaluatePixel(sample) {
        let ndre = (sample.B08 - sample.B05) / (sample.B08 + sample.B05);
        return [ndre];
      }
    `,
  };

  return scripts[type];
}

/**
 * Fetch time-series vegetation indices for a field
 */
export async function fetchVegetationTimeSeries(
  boundary: FieldBoundary,
  startDate: string,
  endDate: string,
  interval: 'weekly' | 'monthly' = 'weekly'
): Promise<Array<{ date: string; indices: VegetationIndices }>> {
  // Mock implementation - in production, fetch multiple images over time
  const mockData = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const intervalDays = interval === 'weekly' ? 7 : 30;
  
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + intervalDays)) {
    mockData.push({
      date: date.toISOString().split('T')[0],
      indices: {
        ndvi: 0.3 + Math.random() * 0.5,
        ndre: 0.2 + Math.random() * 0.4,
        evi: 0.3 + Math.random() * 0.4,
        savi: 0.3 + Math.random() * 0.5,
        gndvi: 0.3 + Math.random() * 0.4,
        mean: 0.3 + Math.random() * 0.4,
        min: 0.1 + Math.random() * 0.2,
        max: 0.6 + Math.random() * 0.3,
        stdDev: 0.05 + Math.random() * 0.15,
      },
    });
  }

  return mockData;
}

/**
 * Interpret NDVI values
 */
export function interpretNDVI(ndvi: number): {
  status: string;
  description: string;
  color: string;
} {
  if (ndvi < 0) {
    return {
      status: 'Water/Snow',
      description: 'Non-vegetated surface (water, snow, clouds)',
      color: '#0000FF',
    };
  } else if (ndvi < 0.2) {
    return {
      status: 'Bare Soil',
      description: 'Bare soil or very sparse vegetation',
      color: '#8B4513',
    };
  } else if (ndvi < 0.4) {
    return {
      status: 'Low Vegetation',
      description: 'Sparse or stressed vegetation',
      color: '#FFD700',
    };
  } else if (ndvi < 0.6) {
    return {
      status: 'Moderate Vegetation',
      description: 'Moderate vegetation health',
      color: '#9ACD32',
    };
  } else if (ndvi < 0.8) {
    return {
      status: 'Healthy Vegetation',
      description: 'Dense, healthy vegetation',
      color: '#228B22',
    };
  } else {
    return {
      status: 'Very Dense Vegetation',
      description: 'Very dense, healthy vegetation',
      color: '#006400',
    };
  }
}

/**
 * Generate crop health recommendations based on vegetation indices
 */
export function generateRecommendations(indices: VegetationIndices): string[] {
  const recommendations: string[] = [];

  if (indices.ndvi < 0.4) {
    recommendations.push('⚠️ Low NDVI detected. Consider checking for water stress, nutrient deficiency, or pest damage.');
  }

  if (indices.ndre < 0.3) {
    recommendations.push('🌱 Low NDRE suggests nitrogen deficiency. Consider applying nitrogen fertilizer.');
  }

  if (indices.stdDev > 0.2) {
    recommendations.push('📊 High variability detected across the field. Consider zone-based management.');
  }

  if (indices.ndvi > 0.7 && indices.ndre > 0.5) {
    recommendations.push('✅ Excellent crop health! Continue current management practices.');
  }

  if (recommendations.length === 0) {
    recommendations.push('✓ Crop health appears normal. Continue monitoring regularly.');
  }

  return recommendations;
}
