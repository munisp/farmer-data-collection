/**
 * Mock Weather Service
 * Provides realistic weather data for testing without requiring external API keys
 */

export interface MockWeatherData {
  temperature: number;
  feels_like: number;
  humidity: number;
  pressure: number;
  weather: string;
  description: string;
  icon: string;
  wind_speed: number;
  wind_direction: number;
  clouds: number;
  visibility: number;
  sunrise: number;
  sunset: number;
  location: string;
}

export interface MockForecastDay {
  date: string;
  temp_min: number;
  temp_max: number;
  humidity: number;
  weather: string;
  description: string;
  icon: string;
  wind_speed: number;
  precipitation_probability: number;
  rain: number;
}

/**
 * Generate mock current weather based on location
 */
export function getMockCurrentWeather(latitude: number, longitude: number): MockWeatherData {
  // Use latitude/longitude to generate consistent but varied data
  const seed = Math.abs(latitude + longitude);
  const baseTemp = 20 + (seed % 15); // 20-35°C range
  const hour = new Date().getHours();
  
  // Temperature varies by time of day
  const tempVariation = Math.sin((hour - 6) * Math.PI / 12) * 5;
  const temperature = parseFloat((baseTemp + tempVariation).toFixed(1));
  
  return {
    temperature,
    feels_like: parseFloat((temperature + (seed % 3)).toFixed(1)),
    humidity: 50 + Math.floor(seed % 40), // 50-90%
    pressure: 1010 + Math.floor(seed % 20), // 1010-1030 hPa
    weather: getWeatherCondition(seed),
    description: getWeatherDescription(seed),
    icon: getWeatherIcon(seed),
    wind_speed: parseFloat((2 + (seed % 8)).toFixed(1)), // 2-10 m/s
    wind_direction: Math.floor(seed * 137.5) % 360, // 0-360 degrees
    clouds: Math.floor(seed % 100), // 0-100%
    visibility: 8000 + Math.floor(seed % 2000), // 8-10 km
    sunrise: Math.floor(Date.now() / 1000) - ((hour - 6) * 3600), // 6 AM
    sunset: Math.floor(Date.now() / 1000) + ((18 - hour) * 3600), // 6 PM
    location: getLocationName(latitude, longitude),
  };
}

/**
 * Generate mock 5-day forecast
 */
export function getMockForecast(latitude: number, longitude: number): MockForecastDay[] {
  const seed = Math.abs(latitude + longitude);
  const baseTemp = 20 + (seed % 15);
  const forecast: MockForecastDay[] = [];
  
  for (let i = 0; i < 5; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    const daySeed = seed + i * 13;
    const tempVariation = Math.sin(i * Math.PI / 5) * 3;
    
    forecast.push({
      date: dateStr,
      temp_min: parseFloat((baseTemp + tempVariation - 3).toFixed(1)),
      temp_max: parseFloat((baseTemp + tempVariation + 5).toFixed(1)),
      humidity: 50 + Math.floor(daySeed % 40),
      weather: getWeatherCondition(daySeed),
      description: getWeatherDescription(daySeed),
      icon: getWeatherIcon(daySeed),
      wind_speed: parseFloat((2 + (daySeed % 8)).toFixed(1)),
      precipitation_probability: Math.floor(daySeed % 100),
      rain: parseFloat(((daySeed % 20) / 10).toFixed(1)),
    });
  }
  
  return forecast;
}

/**
 * Generate mock agricultural indices
 */
export function getMockAgricultureIndices(latitude: number, longitude: number) {
  const weather = getMockCurrentWeather(latitude, longitude);
  const temp = weather.temperature;
  const humidity = weather.humidity;
  const windSpeed = weather.wind_speed;
  
  // Heat Stress Index (simplified)
  const heatStressIndex = temp + 0.5 * humidity / 100 * (temp - 14);
  
  // Evapotranspiration estimate (simplified Penman equation)
  const et0 = 0.0023 * (temp + 17.8) * Math.sqrt(Math.abs(temp - 15)) * 0.408;
  
  // Growing Degree Days (base 10°C)
  const gdd = Math.max(0, temp - 10);
  
  // Frost Risk
  const frostRisk = temp < 5 ? "High" : temp < 10 ? "Moderate" : "Low";
  
  // Irrigation Recommendation
  let irrigationRecommendation = "Normal";
  if (temp > 35 && humidity < 40) {
    irrigationRecommendation = "Increase irrigation";
  } else if (temp < 20 && humidity > 80) {
    irrigationRecommendation = "Reduce irrigation";
  }
  
  return {
    temperature: temp,
    humidity,
    wind_speed: windSpeed,
    heat_stress_index: heatStressIndex.toFixed(1),
    evapotranspiration_mm: et0.toFixed(2),
    growing_degree_days: gdd.toFixed(1),
    frost_risk: frostRisk,
    irrigation_recommendation: irrigationRecommendation,
    optimal_spray_conditions: windSpeed < 5 && humidity > 50 && temp < 30,
  };
}

/**
 * Helper: Get weather condition based on seed
 */
function getWeatherCondition(seed: number): string {
  const conditions = ["Clear", "Clouds", "Rain", "Drizzle", "Thunderstorm", "Mist"];
  return conditions[Math.floor(seed % conditions.length)];
}

/**
 * Helper: Get weather description
 */
function getWeatherDescription(seed: number): string {
  const descriptions = [
    "clear sky",
    "few clouds",
    "scattered clouds",
    "broken clouds",
    "light rain",
    "moderate rain",
    "light drizzle",
    "mist",
    "thunderstorm with rain",
  ];
  return descriptions[Math.floor(seed % descriptions.length)];
}

/**
 * Helper: Get weather icon code
 */
function getWeatherIcon(seed: number): string {
  const icons = ["01d", "02d", "03d", "04d", "09d", "10d", "11d", "13d", "50d"];
  return icons[Math.floor(seed % icons.length)];
}

/**
 * Helper: Get location name based on coordinates
 */
function getLocationName(latitude: number, longitude: number): string {
  // Simple mock location names based on coordinates
  if (latitude > 0 && longitude > 0) return "Northern Farm Region";
  if (latitude > 0 && longitude < 0) return "Western Farm Region";
  if (latitude < 0 && longitude > 0) return "Eastern Farm Region";
  return "Southern Farm Region";
}

/**
 * Store weather data to database
 */
export async function storeWeatherData(
  db: any,
  userId: number,
  farmId: number | null,
  latitude: number,
  longitude: number,
  weatherData: MockWeatherData
) {
  const { sql } = await import("drizzle-orm");
  
  await db.execute(sql`
    INSERT INTO weather_data (
      user_id, farm_id, latitude, longitude, timestamp,
      temperature, feels_like, humidity, pressure,
      wind_speed, wind_direction, cloud_cover, visibility,
      weather_condition, weather_description,
      sunrise, sunset, source
    ) VALUES (
      ${userId}, ${farmId}, ${latitude}, ${longitude}, NOW(),
      ${weatherData.temperature}, ${weatherData.feels_like},
      ${weatherData.humidity}, ${weatherData.pressure},
      ${weatherData.wind_speed}, ${weatherData.wind_direction},
      ${weatherData.clouds}, ${weatherData.visibility},
      ${weatherData.weather}, ${weatherData.description},
      to_timestamp(${weatherData.sunrise}), to_timestamp(${weatherData.sunset}),
      'mock'
    )
  `);
}
