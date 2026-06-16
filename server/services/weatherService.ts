/**
 * Weather Service
 * 
 * Integrates with OpenWeatherMap API for weather forecasting and alerts
 * Provides farm-specific weather data and severe weather notifications
 */

import { weatherService } from "./weather-service.js";
import { logger } from "../logger.js";

export interface WeatherForecast {
  date: string;
  temperature: {
    min: number;
    max: number;
    current: number;
  };
  precipitation: number;
  humidity: number;
  windSpeed: number;
  windDirection: string;
  condition: string;
  icon: string;
  uvIndex: number;
  pressure: number;
}

export interface WeatherAlert {
  type: 'frost' | 'heat' | 'rain' | 'wind' | 'hail' | 'drought' | 'storm';
  severity: 'advisory' | 'watch' | 'warning' | 'emergency';
  startTime: string;
  endTime: string;
  description: string;
  recommendations: string[];
}

export interface SoilMoistureForecast {
  date: string;
  moistureLevel: number;
  evapotranspiration: number;
  irrigationNeeded: boolean;
}

const WIND_DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

function degToDirection(deg: number): string {
  const index = Math.round(deg / 22.5) % 16;
  return WIND_DIRECTIONS[index];
}

/**
 * Fetch current weather for a location via OpenWeatherMap API
 */
export async function getCurrentWeather(
  latitude: number,
  longitude: number
): Promise<WeatherForecast | null> {
  const data = await weatherService.getCurrentWeather(latitude, longitude);
  if (!data) {
    logger.warn('[WeatherService] No weather data available — API key may not be configured');
    return null;
  }

  return {
    date: data.timestamp.toISOString(),
    temperature: {
      min: data.tempMin ?? data.temperature - 3,
      max: data.tempMax ?? data.temperature + 3,
      current: data.temperature,
    },
    precipitation: data.precipitation ?? 0,
    humidity: data.humidity,
    windSpeed: data.windSpeed * 3.6, // m/s → km/h
    windDirection: degToDirection(data.windDirection),
    condition: data.description,
    icon: data.icon,
    uvIndex: 0, // requires One Call API
    pressure: data.pressure,
  };
}

/**
 * Fetch 5-day weather forecast via OpenWeatherMap API
 */
export async function getWeatherForecast(
  latitude: number,
  longitude: number,
  _days: number = 5
): Promise<WeatherForecast[]> {
  const forecasts = await weatherService.getForecast(latitude, longitude);
  if (!forecasts || forecasts.length === 0) {
    logger.warn('[WeatherService] No forecast data available');
    return [];
  }

  return forecasts.map(f => ({
    date: f.date.toISOString(),
    temperature: {
      min: f.temperature.min,
      max: f.temperature.max,
      current: f.temperature.day,
    },
    precipitation: f.rain ?? 0,
    humidity: f.humidity,
    windSpeed: f.windSpeed * 3.6,
    windDirection: 'N', // forecast API doesn't give detailed wind direction per day
    condition: f.description,
    icon: f.icon,
    uvIndex: 0,
    pressure: 0,
  }));
}

/**
 * Check for weather alerts via OpenWeatherMap One Call API
 */
export async function getWeatherAlerts(
  latitude: number,
  longitude: number
): Promise<WeatherAlert[]> {
  const alerts = await weatherService.getWeatherAlerts(latitude, longitude);
  if (!alerts || alerts.length === 0) {
    return [];
  }

  return alerts.map(a => {
    const severity = mapAlertSeverity(a.severity);
    return {
      type: inferAlertType(a.event),
      severity,
      startTime: a.start.toISOString(),
      endTime: a.end.toISOString(),
      description: a.description,
      recommendations: generateAlertRecommendations(a.event, severity),
    };
  });
}

function mapAlertSeverity(sev: string): 'advisory' | 'watch' | 'warning' | 'emergency' {
  if (sev === 'extreme') return 'emergency';
  if (sev === 'severe') return 'warning';
  if (sev === 'moderate') return 'watch';
  return 'advisory';
}

function inferAlertType(event: string): WeatherAlert['type'] {
  const e = event.toLowerCase();
  if (e.includes('frost') || e.includes('freeze')) return 'frost';
  if (e.includes('heat')) return 'heat';
  if (e.includes('rain') || e.includes('flood')) return 'rain';
  if (e.includes('wind') || e.includes('gale')) return 'wind';
  if (e.includes('hail')) return 'hail';
  if (e.includes('drought')) return 'drought';
  return 'storm';
}

function generateAlertRecommendations(event: string, severity: string): string[] {
  const recs: string[] = [];
  const e = event.toLowerCase();

  if (e.includes('frost') || e.includes('freeze')) {
    recs.push('Cover sensitive crops with frost cloth');
    recs.push('Consider irrigation to raise soil temperature');
    recs.push('Harvest mature crops if possible');
  } else if (e.includes('heat')) {
    recs.push('Increase irrigation frequency');
    recs.push('Deploy shade nets for sensitive crops');
    recs.push('Avoid field work during peak heat hours');
  } else if (e.includes('rain') || e.includes('flood')) {
    recs.push('Ensure proper drainage to prevent waterlogging');
    recs.push('Postpone spraying and fertilizer application');
    recs.push('Check field drainage channels');
  } else if (e.includes('wind')) {
    recs.push('Secure loose equipment and structures');
    recs.push('Delay spraying operations until winds subside');
  } else if (e.includes('hail')) {
    recs.push('Move portable equipment to shelter');
    recs.push('Deploy hail netting if available');
  }

  if (severity === 'emergency' || severity === 'warning') {
    recs.push('Monitor local emergency broadcasts');
  }

  return recs;
}

/**
 * Calculate soil moisture forecast based on real weather forecast
 */
export async function getSoilMoistureForecast(
  latitude: number,
  longitude: number,
  currentMoisture: number,
  soilType: string = 'loam'
): Promise<SoilMoistureForecast[]> {
  const forecast = await getWeatherForecast(latitude, longitude);
  const moistureForecast: SoilMoistureForecast[] = [];

  let moisture = currentMoisture;
  
  const waterHoldingCapacity: Record<string, number> = {
    'sand': 0.8,
    'loam': 1.5,
    'clay': 2.0,
    'silt': 1.2,
  };
  const _whc = waterHoldingCapacity[soilType] ?? 1.5;

  for (const day of forecast) {
    const et = calculateEvapotranspiration(
      day.temperature.current,
      day.humidity,
      day.windSpeed,
      day.uvIndex
    );

    moisture = moisture + day.precipitation - et;
    moisture = Math.max(0, Math.min(100, moisture));

    moistureForecast.push({
      date: day.date,
      moistureLevel: Math.round(moisture * 10) / 10,
      evapotranspiration: Math.round(et * 100) / 100,
      irrigationNeeded: moisture < 40,
    });
  }

  return moistureForecast;
}

/**
 * Calculate evapotranspiration (ET0) using simplified Penman-Monteith
 */
function calculateEvapotranspiration(
  temperature: number,
  humidity: number,
  windSpeed: number,
  uvIndex: number
): number {
  const baseET = 0.0023 * (temperature + 17.8) * Math.sqrt(Math.max(5, temperature * 0.3));
  const humidityFactor = (100 - humidity) / 100;
  const windFactor = 1 + (windSpeed / 100);
  const radiationFactor = Math.max(0.3, uvIndex / 10);
  return baseET * humidityFactor * windFactor * radiationFactor;
}

/**
 * Generate farming recommendations based on real weather forecast
 */
export function generateWeatherRecommendations(
  forecast: WeatherForecast[],
  _cropType: string
): string[] {
  const recommendations: string[] = [];

  const heavyRain = forecast.find(day => day.precipitation > 20);
  if (heavyRain) {
    recommendations.push('Heavy rain expected. Postpone spraying and fertilizer application.');
    recommendations.push('Ensure proper drainage to prevent waterlogging.');
  }

  const heatWave = forecast.find(day => day.temperature.max > 35);
  if (heatWave) {
    recommendations.push('High temperatures expected. Increase irrigation frequency.');
    recommendations.push('Consider shade nets for sensitive crops.');
  }

  const frost = forecast.find(day => day.temperature.min < 5);
  if (frost) {
    recommendations.push('Frost risk detected. Protect sensitive crops.');
    recommendations.push('Consider using frost protection methods.');
  }

  const strongWind = forecast.find(day => day.windSpeed > 40);
  if (strongWind) {
    recommendations.push('Strong winds expected. Secure loose equipment and structures.');
    recommendations.push('Delay spraying operations until winds subside.');
  }

  const drySpell = forecast.every(day => day.precipitation < 2);
  if (drySpell) {
    recommendations.push('No significant rain expected. Plan irrigation schedule.');
  }

  const idealDay = forecast.find(day => 
    day.temperature.current > 15 && 
    day.temperature.current < 28 &&
    day.precipitation < 5 &&
    day.windSpeed < 20
  );
  if (idealDay) {
    recommendations.push(`Ideal conditions on ${new Date(idealDay.date).toLocaleDateString()}. Good day for field operations.`);
  }

  return recommendations;
}

/**
 * Calculate Growing Degree Days (GDD)
 */
export function calculateGDD(
  temperatureMin: number,
  temperatureMax: number,
  baseTemperature: number = 10
): number {
  const avgTemp = (temperatureMin + temperatureMax) / 2;
  return Math.max(0, avgTemp - baseTemperature);
}

/**
 * Predict harvest date based on GDD from real forecast data
 */
export async function predictHarvestDate(
  latitude: number,
  longitude: number,
  plantingDate: Date,
  cropType: string
): Promise<{ estimatedDate: Date; confidence: number }> {
  const gddRequirements: Record<string, number> = {
    'maize': 1400,
    'wheat': 1500,
    'rice': 2000,
    'soybean': 1300,
    'tomato': 1200,
    'cassava': 2400,
    'sorghum': 1300,
  };

  const requiredGDD = gddRequirements[cropType.toLowerCase()] || 1500;
  
  const forecast = await getWeatherForecast(latitude, longitude, 5);
  
  // Calculate average daily GDD from real forecast
  let totalGDD = 0;
  for (const day of forecast) {
    totalGDD += calculateGDD(day.temperature.min, day.temperature.max);
  }
  const avgDailyGDD = forecast.length > 0 ? totalGDD / forecast.length : 15; // fallback 15 GDD/day

  const daysNeeded = Math.ceil(requiredGDD / avgDailyGDD);
  const harvestDate = new Date(plantingDate);
  harvestDate.setDate(harvestDate.getDate() + daysNeeded);

  // Confidence based on forecast data availability
  const confidence = forecast.length >= 3 ? 75 : 55;

  return {
    estimatedDate: harvestDate,
    confidence,
  };
}

/**
 * Get optimal planting window based on real weather forecast
 */
export async function getOptimalPlantingWindow(
  latitude: number,
  longitude: number,
  cropType: string
): Promise<{ startDate: Date; endDate: Date; reasons: string[] }> {
  const forecast = await getWeatherForecast(latitude, longitude, 5);
  const reasons: string[] = [];

  // Find days with suitable conditions
  const suitableDays = forecast.filter(day => {
    return day.temperature.current > 15 && day.temperature.min > 5 && day.precipitation < 15;
  });

  if (suitableDays.length > 0) {
    reasons.push(`${suitableDays.length} days with suitable temperatures (>15°C)`);
    if (suitableDays.some(d => d.precipitation > 2 && d.precipitation < 15)) {
      reasons.push('Adequate rainfall expected for germination');
    }
  }

  const cropMinTemp: Record<string, number> = {
    maize: 10, rice: 15, wheat: 5, cassava: 15, sorghum: 10,
  };
  const minTemp = cropMinTemp[cropType.toLowerCase()] || 10;
  const warmDays = forecast.filter(d => d.temperature.min >= minTemp);
  if (warmDays.length >= 3) {
    reasons.push(`Soil temperature above ${minTemp}°C threshold for ${cropType}`);
  }

  reasons.push('Growing season length sufficient for maturity');

  const startDate = suitableDays.length > 0 ? new Date(suitableDays[0].date) : new Date(Date.now() + 7 * 86400000);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 21);

  return { startDate, endDate, reasons };
}
