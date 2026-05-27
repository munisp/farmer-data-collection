/**
 * Weather Service
 * 
 * Integrates with OpenWeatherMap API for weather forecasting and alerts
 * Provides farm-specific weather data and severe weather notifications
 */

import axios from 'axios';

export interface WeatherForecast {
  date: string;
  temperature: {
    min: number;
    max: number;
    current: number;
  };
  precipitation: number; // mm
  humidity: number; // percentage
  windSpeed: number; // km/h
  windDirection: string;
  condition: string;
  icon: string;
  uvIndex: number;
  pressure: number; // hPa
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
  moistureLevel: number; // percentage
  evapotranspiration: number; // mm
  irrigationNeeded: boolean;
}

/**
 * Fetch current weather for a location
 */
export async function getCurrentWeather(
  latitude: number,
  longitude: number
): Promise<WeatherForecast> {
  // Mock implementation - replace with actual OpenWeatherMap API
  
  // In production:
  // const apiKey = process.env.OPENWEATHER_API_KEY;
  // const response = await axios.get(
  //   `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`
  // );

  return {
    date: new Date().toISOString(),
    temperature: {
      min: 18,
      max: 28,
      current: 24,
    },
    precipitation: 0,
    humidity: 65,
    windSpeed: 12,
    windDirection: 'NE',
    condition: 'Partly Cloudy',
    icon: '02d',
    uvIndex: 7,
    pressure: 1013,
  };
}

/**
 * Fetch 7-day weather forecast
 */
export async function getWeatherForecast(
  latitude: number,
  longitude: number,
  days: number = 7
): Promise<WeatherForecast[]> {
  // Mock implementation
  
  // In production:
  // const apiKey = process.env.OPENWEATHER_API_KEY;
  // const response = await axios.get(
  //   `https://api.openweathermap.org/data/2.5/forecast/daily?lat=${latitude}&lon=${longitude}&cnt=${days}&appid=${apiKey}&units=metric`
  // );

  const forecast: WeatherForecast[] = [];
  const conditions = ['Clear', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Rain'];
  const icons = ['01d', '02d', '03d', '10d', '09d'];

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    
    const conditionIndex = Math.floor(Math.random() * conditions.length);
    
    forecast.push({
      date: date.toISOString(),
      temperature: {
        min: 15 + Math.random() * 5,
        max: 25 + Math.random() * 8,
        current: 20 + Math.random() * 8,
      },
      precipitation: Math.random() * 20,
      humidity: 50 + Math.random() * 30,
      windSpeed: 5 + Math.random() * 15,
      windDirection: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(Math.random() * 8)],
      condition: conditions[conditionIndex],
      icon: icons[conditionIndex],
      uvIndex: Math.floor(Math.random() * 11),
      pressure: 1000 + Math.random() * 30,
    });
  }

  return forecast;
}

/**
 * Check for weather alerts
 */
export async function getWeatherAlerts(
  latitude: number,
  longitude: number
): Promise<WeatherAlert[]> {
  // Mock implementation
  
  // In production, use OpenWeatherMap's One Call API:
  // const apiKey = process.env.OPENWEATHER_API_KEY;
  // const response = await axios.get(
  //   `https://api.openweathermap.org/data/3.0/onecall?lat=${latitude}&lon=${longitude}&appid=${apiKey}`
  // );
  // return response.data.alerts || [];

  const alerts: WeatherAlert[] = [];

  // Simulate frost alert
  const now = new Date();
  if (Math.random() > 0.7) {
    alerts.push({
      type: 'frost',
      severity: 'warning',
      startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString(),
      description: 'Frost expected overnight. Temperatures may drop to 0-2°C.',
      recommendations: [
        'Cover sensitive crops with frost cloth',
        'Consider irrigation to raise soil temperature',
        'Harvest mature crops if possible',
      ],
    });
  }

  return alerts;
}

/**
 * Calculate soil moisture forecast based on weather
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
  
  // Soil water holding capacity (mm/cm depth)
  const waterHoldingCapacity = {
    'sand': 0.8,
    'loam': 1.5,
    'clay': 2.0,
  }[soilType] || 1.5;

  for (const day of forecast) {
    // Calculate evapotranspiration (simplified Penman-Monteith)
    const et = calculateEvapotranspiration(
      day.temperature.current,
      day.humidity,
      day.windSpeed,
      day.uvIndex
    );

    // Update moisture
    moisture = moisture + day.precipitation - et;
    moisture = Math.max(0, Math.min(100, moisture));

    const irrigationThreshold = 40; // Irrigate when moisture < 40%
    
    moistureForecast.push({
      date: day.date,
      moistureLevel: moisture,
      evapotranspiration: et,
      irrigationNeeded: moisture < irrigationThreshold,
    });
  }

  return moistureForecast;
}

/**
 * Calculate evapotranspiration (ET0) using simplified formula
 */
function calculateEvapotranspiration(
  temperature: number,
  humidity: number,
  windSpeed: number,
  uvIndex: number
): number {
  // Simplified Penman-Monteith equation
  // ET0 (mm/day) ≈ 0.0023 × (Tmean + 17.8) × (Tmax - Tmin)^0.5 × Ra
  
  // This is a very simplified version for demonstration
  const baseET = 0.0023 * (temperature + 17.8) * Math.sqrt(5);
  const humidityFactor = (100 - humidity) / 100;
  const windFactor = 1 + (windSpeed / 100);
  const radiationFactor = uvIndex / 10;

  return baseET * humidityFactor * windFactor * radiationFactor;
}

/**
 * Generate farming recommendations based on weather forecast
 */
export function generateWeatherRecommendations(
  forecast: WeatherForecast[],
  cropType: string
): string[] {
  const recommendations: string[] = [];

  // Check for heavy rain
  const heavyRain = forecast.find(day => day.precipitation > 20);
  if (heavyRain) {
    recommendations.push('🌧️ Heavy rain expected. Postpone spraying and fertilizer application.');
    recommendations.push('💧 Ensure proper drainage to prevent waterlogging.');
  }

  // Check for high temperatures
  const heatWave = forecast.find(day => day.temperature.max > 35);
  if (heatWave) {
    recommendations.push('🌡️ High temperatures expected. Increase irrigation frequency.');
    recommendations.push('☀️ Consider shade nets for sensitive crops.');
  }

  // Check for frost
  const frost = forecast.find(day => day.temperature.min < 5);
  if (frost) {
    recommendations.push('❄️ Frost risk detected. Protect sensitive crops.');
    recommendations.push('🔥 Consider using frost protection methods.');
  }

  // Check for high winds
  const strongWind = forecast.find(day => day.windSpeed > 40);
  if (strongWind) {
    recommendations.push('💨 Strong winds expected. Secure loose equipment and structures.');
    recommendations.push('🌾 Delay spraying operations until winds subside.');
  }

  // Check for dry spell
  const drySpell = forecast.every(day => day.precipitation < 2);
  if (drySpell) {
    recommendations.push('🏜️ No significant rain expected. Plan irrigation schedule.');
  }

  // Ideal conditions
  const idealDay = forecast.find(day => 
    day.temperature.current > 15 && 
    day.temperature.current < 28 &&
    day.precipitation < 5 &&
    day.windSpeed < 20
  );
  if (idealDay) {
    recommendations.push(`✅ Ideal conditions on ${new Date(idealDay.date).toLocaleDateString()}. Good day for field operations.`);
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
 * Predict harvest date based on GDD accumulation
 */
export async function predictHarvestDate(
  latitude: number,
  longitude: number,
  plantingDate: Date,
  cropType: string
): Promise<{ estimatedDate: Date; confidence: number }> {
  // GDD requirements for different crops
  const gddRequirements: Record<string, number> = {
    'maize': 1400,
    'wheat': 1500,
    'rice': 2000,
    'soybean': 1300,
    'tomato': 1200,
  };

  const requiredGDD = gddRequirements[cropType.toLowerCase()] || 1500;
  
  const forecast = await getWeatherForecast(latitude, longitude, 90);
  
  let accumulatedGDD = 0;
  let harvestDate = new Date(plantingDate);
  
  for (const day of forecast) {
    const dailyGDD = calculateGDD(day.temperature.min, day.temperature.max);
    accumulatedGDD += dailyGDD;
    
    if (accumulatedGDD >= requiredGDD) {
      harvestDate = new Date(day.date);
      break;
    }
  }

  // Confidence decreases with forecast distance
  const daysToHarvest = Math.floor((harvestDate.getTime() - plantingDate.getTime()) / (1000 * 60 * 60 * 24));
  const confidence = Math.max(50, 100 - (daysToHarvest / 90) * 50);

  return {
    estimatedDate: harvestDate,
    confidence,
  };
}

/**
 * Get optimal planting window based on weather patterns
 */
export async function getOptimalPlantingWindow(
  latitude: number,
  longitude: number,
  cropType: string
): Promise<{ startDate: Date; endDate: Date; reasons: string[] }> {
  // This would analyze historical weather patterns
  // For now, return a mock response
  
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(now.getDate() + 7);
  
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 21);

  return {
    startDate,
    endDate,
    reasons: [
      'Soil temperature will be optimal (>15°C)',
      'Frost risk will be minimal',
      'Adequate rainfall expected for germination',
      'Growing season length sufficient for maturity',
    ],
  };
}
