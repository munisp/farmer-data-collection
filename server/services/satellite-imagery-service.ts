/**
 * Satellite Imagery Service
 * Integrates with Sentinel Hub for crop health monitoring and farm analysis
 */

import axios, { AxiosInstance } from 'axios';

interface SentinelHubConfig {
  clientId: string;
  clientSecret: string;
  instanceId: string;
  baseUrl?: string;
}

interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

interface FarmPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface ImageryRequest {
  bbox?: BoundingBox;
  geometry?: FarmPolygon;
  timeRange: {
    from: string;
    to: string;
  };
  width?: number;
  height?: number;
  maxCloudCoverage?: number;
}

interface NDVIResult {
  date: string;
  meanNDVI: number;
  minNDVI: number;
  maxNDVI: number;
  healthCategory: 'excellent' | 'good' | 'moderate' | 'poor' | 'critical';
  cloudCoverage: number;
}

interface CropHealthAnalysis {
  farmId: string;
  analysisDate: string;
  overallHealth: 'excellent' | 'good' | 'moderate' | 'poor' | 'critical';
  ndviTimeSeries: NDVIResult[];
  anomalies: Array<{
    type: 'drought_stress' | 'pest_damage' | 'nutrient_deficiency' | 'waterlogging';
    severity: 'low' | 'medium' | 'high';
    affectedArea: number; // percentage
    location: { lat: number; lon: number };
  }>;
  recommendations: string[];
  estimatedYield: {
    prediction: number;
    unit: string;
    confidence: number;
  };
}

interface WeatherData {
  date: string;
  temperature: { min: number; max: number; avg: number };
  precipitation: number;
  humidity: number;
  soilMoisture?: number;
}

export class SatelliteImageryService {
  private client: AxiosInstance;
  private config: SentinelHubConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(config: SentinelHubConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://services.sentinel-hub.com',
      timeout: 60000,
    });
  }

  // Get OAuth access token
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const response = await axios.post(
      'https://services.sentinel-hub.com/oauth/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;

    return this.accessToken as string;
  }

  // Get NDVI (Normalized Difference Vegetation Index) for a farm
  async getNDVI(request: ImageryRequest): Promise<NDVIResult[]> {
    const token = await this.getAccessToken();

    const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: [{
            bands: ["B04", "B08", "CLM"],
            units: "DN"
          }],
          output: {
            bands: 1,
            sampleType: "FLOAT32"
          }
        };
      }

      function evaluatePixel(sample) {
        if (sample.CLM > 0) {
          return [-9999]; // Cloud mask
        }
        let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
        return [ndvi];
      }
    `;

    const requestBody = {
      input: {
        bounds: request.geometry 
          ? { geometry: request.geometry }
          : { bbox: [request.bbox!.minLon, request.bbox!.minLat, request.bbox!.maxLon, request.bbox!.maxLat] },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: request.timeRange,
            maxCloudCoverage: request.maxCloudCoverage || 30,
          },
        }],
      },
      output: {
        width: request.width || 512,
        height: request.height || 512,
        responses: [{
          identifier: 'default',
          format: { type: 'image/tiff' },
        }],
      },
      evalscript,
    };

    const response = await this.client.post('/api/v1/process', requestBody, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    });

    // Process NDVI data (simplified - in production would parse GeoTIFF)
    const ndviResults = this.processNDVIResponse(response.data, request.timeRange);
    return ndviResults;
  }

  // Process NDVI response (simplified)
  private processNDVIResponse(data: ArrayBuffer, timeRange: { from: string; to: string }): NDVIResult[] {
    // In production, this would parse the GeoTIFF and calculate statistics
    // For now, return simulated results based on typical agricultural patterns
    
    const results: NDVIResult[] = [];
    const startDate = new Date(timeRange.from);
    const endDate = new Date(timeRange.to);
    
    // Generate weekly NDVI values
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      // Deterministic seasonal NDVI variation based on day-of-year
      const dayOfYear = Math.floor((currentDate.getTime() - new Date(currentDate.getFullYear(), 0, 0).getTime()) / 86400000);
      const seasonalFactor = Math.sin((dayOfYear / 365) * 2 * Math.PI - Math.PI / 2) * 0.3 + 0.5;
      // Deterministic variation based on week number for reproducibility
      const weekNum = Math.floor(dayOfYear / 7);
      const variation = ((weekNum % 7) - 3) * 0.015;
      
      const meanNDVI = Math.max(0, Math.min(1, seasonalFactor + variation));
      
      results.push({
        date: currentDate.toISOString().split('T')[0],
        meanNDVI: Math.round(meanNDVI * 1000) / 1000,
        minNDVI: Math.max(0, meanNDVI - 0.15),
        maxNDVI: Math.min(1, meanNDVI + 0.15),
        healthCategory: this.getNDVIHealthCategory(meanNDVI),
        cloudCoverage: Math.round(10 + (weekNum % 5) * 4),
      });

      currentDate.setDate(currentDate.getDate() + 7);
    }

    return results;
  }

  // Get health category from NDVI value
  private getNDVIHealthCategory(ndvi: number): NDVIResult['healthCategory'] {
    if (ndvi >= 0.7) return 'excellent';
    if (ndvi >= 0.5) return 'good';
    if (ndvi >= 0.3) return 'moderate';
    if (ndvi >= 0.15) return 'poor';
    return 'critical';
  }

  // Get true color imagery
  async getTrueColorImage(request: ImageryRequest): Promise<Buffer> {
    const token = await this.getAccessToken();

    const evalscript = `
      //VERSION=3
      function setup() {
        return {
          input: [{
            bands: ["B04", "B03", "B02"],
            units: "DN"
          }],
          output: {
            bands: 3,
            sampleType: "AUTO"
          }
        };
      }

      function evaluatePixel(sample) {
        return [sample.B04 * 2.5, sample.B03 * 2.5, sample.B02 * 2.5];
      }
    `;

    const requestBody = {
      input: {
        bounds: request.geometry 
          ? { geometry: request.geometry }
          : { bbox: [request.bbox!.minLon, request.bbox!.minLat, request.bbox!.maxLon, request.bbox!.maxLat] },
        data: [{
          type: 'sentinel-2-l2a',
          dataFilter: {
            timeRange: request.timeRange,
            maxCloudCoverage: request.maxCloudCoverage || 20,
          },
        }],
      },
      output: {
        width: request.width || 1024,
        height: request.height || 1024,
        responses: [{
          identifier: 'default',
          format: { type: 'image/png' },
        }],
      },
      evalscript,
    };

    const response = await this.client.post('/api/v1/process', requestBody, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    });

    return Buffer.from(response.data);
  }

  // Analyze crop health for a farm
  async analyzeCropHealth(
    farmId: string,
    geometry: FarmPolygon,
    cropType: string
  ): Promise<CropHealthAnalysis> {
    // Get NDVI time series for the last 3 months
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);

    const ndviTimeSeries = await this.getNDVI({
      geometry,
      timeRange: {
        from: startDate.toISOString().split('T')[0],
        to: endDate.toISOString().split('T')[0],
      },
      maxCloudCoverage: 30,
    });

    // Calculate overall health
    const recentNDVI = ndviTimeSeries.slice(-4); // Last 4 weeks
    const avgNDVI = recentNDVI.reduce((sum, r) => sum + r.meanNDVI, 0) / recentNDVI.length;
    const overallHealth = this.getNDVIHealthCategory(avgNDVI);

    // Detect anomalies
    const anomalies = this.detectAnomalies(ndviTimeSeries, geometry);

    // Generate recommendations
    const recommendations = this.generateRecommendations(overallHealth, anomalies, cropType);

    // Estimate yield
    const estimatedYield = this.estimateYield(avgNDVI, cropType, geometry);

    return {
      farmId,
      analysisDate: new Date().toISOString(),
      overallHealth,
      ndviTimeSeries,
      anomalies,
      recommendations,
      estimatedYield,
    };
  }

  // Detect anomalies in NDVI time series
  private detectAnomalies(
    ndviTimeSeries: NDVIResult[],
    geometry: FarmPolygon
  ): CropHealthAnalysis['anomalies'] {
    const anomalies: CropHealthAnalysis['anomalies'] = [];

    if (ndviTimeSeries.length < 2) return anomalies;

    // Check for sudden NDVI drops (potential pest damage or disease)
    for (let i = 1; i < ndviTimeSeries.length; i++) {
      const drop = ndviTimeSeries[i - 1].meanNDVI - ndviTimeSeries[i].meanNDVI;
      if (drop > 0.15) {
        anomalies.push({
          type: 'pest_damage',
          severity: drop > 0.25 ? 'high' : drop > 0.2 ? 'medium' : 'low',
          affectedArea: Math.round(drop * 100),
          location: this.getCentroid(geometry),
        });
      }
    }

    // Check for consistently low NDVI (drought stress)
    const recentNDVI = ndviTimeSeries.slice(-4);
    const avgRecent = recentNDVI.reduce((sum, r) => sum + r.meanNDVI, 0) / recentNDVI.length;
    if (avgRecent < 0.3) {
      anomalies.push({
        type: 'drought_stress',
        severity: avgRecent < 0.15 ? 'high' : avgRecent < 0.25 ? 'medium' : 'low',
        affectedArea: Math.round((0.5 - avgRecent) * 100),
        location: this.getCentroid(geometry),
      });
    }

    // Check for very high NDVI with low variation (potential waterlogging)
    const variance = this.calculateVariance(ndviTimeSeries.map(r => r.meanNDVI));
    if (avgRecent > 0.8 && variance < 0.01) {
      anomalies.push({
        type: 'waterlogging',
        severity: 'low',
        affectedArea: 15,
        location: this.getCentroid(geometry),
      });
    }

    return anomalies;
  }

  // Calculate variance
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  // Get centroid of polygon
  private getCentroid(geometry: FarmPolygon): { lat: number; lon: number } {
    const coords = geometry.coordinates[0];
    const sumLat = coords.reduce((sum, c) => sum + c[1], 0);
    const sumLon = coords.reduce((sum, c) => sum + c[0], 0);
    return {
      lat: sumLat / coords.length,
      lon: sumLon / coords.length,
    };
  }

  // Generate recommendations based on analysis
  private generateRecommendations(
    health: CropHealthAnalysis['overallHealth'],
    anomalies: CropHealthAnalysis['anomalies'],
    cropType: string
  ): string[] {
    const recommendations: string[] = [];

    // Health-based recommendations
    switch (health) {
      case 'critical':
        recommendations.push('Urgent: Inspect field immediately for signs of disease, pest infestation, or severe water stress.');
        recommendations.push('Consider emergency irrigation if drought conditions are present.');
        break;
      case 'poor':
        recommendations.push('Schedule field inspection within the next 3-5 days.');
        recommendations.push('Review recent fertilizer applications and consider soil testing.');
        break;
      case 'moderate':
        recommendations.push('Monitor crop development closely over the next 2 weeks.');
        recommendations.push('Ensure irrigation schedule is adequate for current growth stage.');
        break;
      case 'good':
        recommendations.push('Continue current management practices.');
        recommendations.push('Plan for upcoming harvest preparation.');
        break;
      case 'excellent':
        recommendations.push('Crop is performing well. Maintain current practices.');
        break;
    }

    // Anomaly-based recommendations
    for (const anomaly of anomalies) {
      switch (anomaly.type) {
        case 'drought_stress':
          recommendations.push(`Drought stress detected (${anomaly.severity} severity). Increase irrigation frequency.`);
          break;
        case 'pest_damage':
          recommendations.push(`Possible pest damage detected (${anomaly.severity} severity). Scout affected areas for insects or disease.`);
          break;
        case 'nutrient_deficiency':
          recommendations.push(`Nutrient deficiency suspected. Consider foliar application of micronutrients.`);
          break;
        case 'waterlogging':
          recommendations.push(`Waterlogging risk detected. Improve drainage in affected areas.`);
          break;
      }
    }

    // Crop-specific recommendations
    if (cropType.toLowerCase().includes('maize') || cropType.toLowerCase().includes('corn')) {
      recommendations.push('For maize: Ensure adequate nitrogen availability during vegetative growth.');
    } else if (cropType.toLowerCase().includes('wheat')) {
      recommendations.push('For wheat: Monitor for fungal diseases during humid conditions.');
    } else if (cropType.toLowerCase().includes('rice')) {
      recommendations.push('For rice: Maintain optimal water levels in paddies.');
    }

    return recommendations;
  }

  // Estimate yield based on NDVI
  private estimateYield(
    avgNDVI: number,
    cropType: string,
    geometry: FarmPolygon
  ): CropHealthAnalysis['estimatedYield'] {
    // Calculate area in hectares (simplified)
    const areaHa = this.calculateArea(geometry);

    // Base yields per hectare (kg) for different crops
    const baseYields: Record<string, number> = {
      maize: 5000,
      wheat: 3500,
      rice: 6000,
      beans: 2000,
      sorghum: 3000,
      default: 4000,
    };

    const baseYield = baseYields[cropType.toLowerCase()] || baseYields.default;
    
    // NDVI-based yield adjustment (0.3-0.8 NDVI maps to 50%-120% of base yield)
    const yieldFactor = 0.5 + (avgNDVI - 0.3) * 1.4;
    const adjustedYield = baseYield * Math.max(0.3, Math.min(1.3, yieldFactor));

    return {
      prediction: Math.round(adjustedYield * areaHa),
      unit: 'kg',
      confidence: Math.min(0.9, 0.5 + avgNDVI * 0.5),
    };
  }

  // Calculate polygon area in hectares (simplified)
  private calculateArea(geometry: FarmPolygon): number {
    const coords = geometry.coordinates[0];
    let area = 0;
    
    for (let i = 0; i < coords.length - 1; i++) {
      area += coords[i][0] * coords[i + 1][1];
      area -= coords[i + 1][0] * coords[i][1];
    }
    
    area = Math.abs(area) / 2;
    
    // Convert from degrees to hectares (approximate)
    const latMid = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
    const metersPerDegree = 111320 * Math.cos(latMid * Math.PI / 180);
    const areaM2 = area * metersPerDegree * metersPerDegree;
    
    return areaM2 / 10000; // Convert to hectares
  }

  // Get historical weather data for a location
  async getWeatherHistory(
    lat: number,
    lon: number,
    days: number = 30
  ): Promise<WeatherData[]> {
    // In production, this would call a weather API
    // For now, return simulated data
    const data: WeatherData[] = [];
    const endDate = new Date();
    
    for (let i = days; i >= 0; i--) {
      const date = new Date(endDate);
      date.setDate(date.getDate() - i);
      
      // Simulate seasonal temperature variation
      const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
      const seasonalTemp = 25 + Math.sin((dayOfYear / 365) * 2 * Math.PI) * 10;
      
      // Deterministic weather based on day-of-year
      const dayVar = dayOfYear % 7;
      const isRainySeason = dayOfYear >= 90 && dayOfYear <= 300;

      data.push({
        date: date.toISOString().split('T')[0],
        temperature: {
          min: Math.round(seasonalTemp - 5 + dayVar * 0.4),
          max: Math.round(seasonalTemp + 5 + dayVar * 0.4),
          avg: Math.round(seasonalTemp + dayVar * 0.3),
        },
        precipitation: isRainySeason && dayVar < 2 ? Math.round(5 + dayVar * 4) : 0,
        humidity: Math.round(isRainySeason ? 75 + dayVar * 2 : 55 + dayVar * 3),
        soilMoisture: Math.round(isRainySeason ? 55 + dayVar * 3 : 35 + dayVar * 3),
      });
    }

    return data;
  }
}

// Factory function
export function createSatelliteImageryService(config?: Partial<SentinelHubConfig>): SatelliteImageryService {
  const defaultConfig: SentinelHubConfig = {
    clientId: process.env.SENTINEL_HUB_CLIENT_ID || '',
    clientSecret: process.env.SENTINEL_HUB_CLIENT_SECRET || '',
    instanceId: process.env.SENTINEL_HUB_INSTANCE_ID || '',
  };
  return new SatelliteImageryService({ ...defaultConfig, ...config });
}

export const satelliteImageryService = createSatelliteImageryService();

export default SatelliteImageryService;

