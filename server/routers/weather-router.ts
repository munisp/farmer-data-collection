import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc-base";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { getMockCurrentWeather, getMockForecast, getMockAgricultureIndices } from "../services/mock-weather-service.js";

/**
 * Weather Router
 * Integrates weather data for farms using OpenWeatherMap API
 * 
 * Setup:
 * 1. Register at https://openweathermap.org/api
 * 2. Get free API key (60 calls/minute, 1,000,000 calls/month)
 * 3. Add OPENWEATHER_API_KEY to environment variables
 */

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || "";
const OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5";

export const weatherRouter = router({
  /**
   * Get current weather for a farm location
   */
  getCurrentWeather: protectedProcedure
    .input(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
      })
    )
    .query(async ({ input }: { input: { latitude: number; longitude: number } }) => {
      // Use mock service if API key not configured
      if (!OPENWEATHER_API_KEY) {
        console.log('[Weather] Using mock service (no API key configured)');
        if (input.latitude && input.longitude) {
          return getMockCurrentWeather(input.latitude, input.longitude);
        }
        throw new Error("Coordinates required for mock weather data");
      }

      const response = await fetch(
        `${OPENWEATHER_BASE_URL}/weather?lat=${input.latitude}&lon=${input.longitude}&appid=${OPENWEATHER_API_KEY}&units=metric`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch weather data");
      }

      const data = await response.json();

      return {
        temperature: data.main.temp,
        feels_like: data.main.feels_like,
        humidity: data.main.humidity,
        pressure: data.main.pressure,
        weather: data.weather[0].main,
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        wind_speed: data.wind.speed,
        wind_direction: data.wind.deg,
        clouds: data.clouds.all,
        visibility: data.visibility,
        sunrise: data.sys.sunrise,
        sunset: data.sys.sunset,
        location: data.name,
      };
    }),

  /**
   * Get 5-day weather forecast for a farm location
   */
  getForecast: protectedProcedure
    .input(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
      })
    )
    .query(async ({ input }: { input: { latitude: number; longitude: number } }) => {
      // Use mock service if API key not configured
      if (!OPENWEATHER_API_KEY) {
        console.log('[Weather] Using mock forecast service (no API key configured)');
        return getMockForecast(input.latitude, input.longitude);
      }

      const response = await fetch(
        `${OPENWEATHER_BASE_URL}/forecast?lat=${input.latitude}&lon=${input.longitude}&appid=${OPENWEATHER_API_KEY}&units=metric`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch forecast data");
      }

      const data = await response.json();

      // Group forecast by day
      const dailyForecasts: any[] = [];
      const processedDates = new Set();

      data.list.forEach((item: any) => {
        const date = new Date(item.dt * 1000).toISOString().split("T")[0];

        if (!processedDates.has(date)) {
          processedDates.add(date);
          dailyForecasts.push({
            date,
            temp_min: item.main.temp_min,
            temp_max: item.main.temp_max,
            humidity: item.main.humidity,
            weather: item.weather[0].main,
            description: item.weather[0].description,
            icon: item.weather[0].icon,
            wind_speed: item.wind.speed,
            precipitation_probability: item.pop * 100,
            rain: item.rain?.["3h"] || 0,
          });
        }
      });

      return dailyForecasts.slice(0, 5);
    }),

  /**
   * Find nearest weather stations to a farm
   * Note: This is a simplified version. For production, use a dedicated weather station database.
   */
  getNearestWeatherStations: protectedProcedure
    .input(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
        radiusKm: z.number().default(50),
      })
    )
    .query(async ({ input }: { input: { latitude: number; longitude: number; radiusKm: number } }) => {
      // Mock weather station data
      // In production, replace with actual weather station database
      const mockStations = [
        {
          id: 1,
          name: "Lagos Airport Weather Station",
          latitude: 6.5774,
          longitude: 3.3213,
          type: "Airport",
          elevation: 41,
        },
        {
          id: 2,
          name: "Ikeja Meteorological Station",
          latitude: 6.5833,
          longitude: 3.3500,
          type: "Meteorological",
          elevation: 38,
        },
        {
          id: 3,
          name: "Ikorodu Agricultural Station",
          latitude: 6.6186,
          longitude: 3.5106,
          type: "Agricultural",
          elevation: 15,
        },
      ];

      // Calculate distances
      const stationsWithDistance = mockStations.map((station) => {
        const distance = calculateDistance(
          input.latitude,
          input.longitude,
          station.latitude,
          station.longitude
        );

        return {
          ...station,
          distance_km: distance,
        };
      });

      // Filter by radius and sort by distance
      return stationsWithDistance
        .filter((s) => s.distance_km <= input.radiusKm)
        .sort((a, b) => a.distance_km - b.distance_km);
    }),

  /**
   * Get weather alerts for a location
   */
  getWeatherAlerts: protectedProcedure
    .input(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
      })
    )
    .query(async ({ input }: { input: { latitude: number; longitude: number } }) => {
      // Use mock service if API key not configured
      if (!OPENWEATHER_API_KEY) {
        console.log('[Weather] Using mock service (no API key configured)');
        if (input.latitude && input.longitude) {
          return getMockCurrentWeather(input.latitude, input.longitude);
        }
        throw new Error("Coordinates required for mock weather data");
      }

      // Use One Call API for alerts (requires paid subscription)
      // For free tier, return empty alerts
      return {
        alerts: [],
        message: "Weather alerts require OpenWeather One Call API subscription",
      };
    }),

  /**
   * Get agricultural weather indices for a farm
   */
  getAgricultureIndices: protectedProcedure
    .input(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
      })
    )
    .query(async ({ input }: { input: { latitude: number; longitude: number } }) => {
      // Use mock service if API key not configured
      if (!OPENWEATHER_API_KEY) {
        console.log('[Weather] Using mock agriculture indices (no API key configured)');
        return getMockAgricultureIndices(input.latitude, input.longitude);
      }

      // Get current weather
      const weatherResponse = await fetch(
        `${OPENWEATHER_BASE_URL}/weather?lat=${input.latitude}&lon=${input.longitude}&appid=${OPENWEATHER_API_KEY}&units=metric`
      );

      if (!weatherResponse.ok) {
        throw new Error("Failed to fetch weather data");
      }

      const weather = await weatherResponse.json();

      // Calculate agricultural indices
      const temp = weather.main.temp;
      const humidity = weather.main.humidity;
      const windSpeed = weather.wind.speed;

      // Heat Stress Index (simplified)
      const heatStressIndex = temp + 0.5 * humidity / 100 * (temp - 14);

      // Evapotranspiration estimate (simplified Penman equation)
      const et0 = 0.0023 * (temp + 17.8) * Math.sqrt(weather.main.temp_max - weather.main.temp_min) * 0.408;

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
    }),
  /**
   * Get historical weather data for a location (simulated for demo)
   * In production, integrate with historical weather API (e.g., Open-Meteo, Visual Crossing)
   */
  getHistoricalWeather: protectedProcedure
    .input(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      })
    )
    .query(async ({ input }) => {
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      const days: any[] = [];
      
      // Generate simulated historical data
      const current = new Date(start);
      while (current <= end) {
        const dayOfYear = Math.floor((current.getTime() - new Date(current.getFullYear(), 0, 0).getTime()) / 86400000);
        
        // Simulate seasonal temperature variation (tropical climate)
        const baseTemp = 27 + 5 * Math.sin(2 * Math.PI * (dayOfYear - 80) / 365);
        const tempMin = baseTemp - 5 + (Math.random() - 0.5) * 4;
        const tempMax = baseTemp + 5 + (Math.random() - 0.5) * 4;
        const tempAvg = (tempMin + tempMax) / 2;
        
        // Simulate rainfall (rainy season April-October)
        const isRainySeason = dayOfYear >= 90 && dayOfYear <= 300;
        const rainProbability = isRainySeason ? 0.6 : 0.2;
        const rainfall = Math.random() < rainProbability ? Math.random() * 30 : 0;
        
        // Simulate humidity
        const humidity = isRainySeason ? 70 + Math.random() * 20 : 50 + Math.random() * 20;
        
        days.push({
          date: current.toISOString().split('T')[0],
          temp_min: Math.round(tempMin * 10) / 10,
          temp_max: Math.round(tempMax * 10) / 10,
          temp_avg: Math.round(tempAvg * 10) / 10,
          rainfall_mm: Math.round(rainfall * 10) / 10,
          humidity: Math.round(humidity),
          solar_radiation: Math.round((5 + Math.random() * 3) * 10) / 10, // MJ/m²/day
        });
        
        current.setDate(current.getDate() + 1);
      }
      
      // Calculate summary statistics
      const totalRainfall = days.reduce((sum, d) => sum + d.rainfall_mm, 0);
      const avgTemp = days.reduce((sum, d) => sum + d.temp_avg, 0) / days.length;
      const rainyDays = days.filter(d => d.rainfall_mm > 0).length;
      
      return {
        location: { latitude: input.latitude, longitude: input.longitude },
        period: { start: input.startDate, end: input.endDate },
        days,
        summary: {
          total_rainfall_mm: Math.round(totalRainfall * 10) / 10,
          avg_temperature: Math.round(avgTemp * 10) / 10,
          rainy_days: rainyDays,
          dry_days: days.length - rainyDays,
        },
      };
    }),

  /**
   * Calculate Growing Degree Days (GDD) for a crop
   * GDD = max(0, (Tmax + Tmin) / 2 - Tbase)
   */
  getGrowingDegreeDays: protectedProcedure
    .input(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
        plantingDate: z.string(),
        cropType: z.string(),
        baseTemperature: z.number().optional(), // Default varies by crop
      })
    )
    .query(async ({ input }) => {
      // Crop-specific base temperatures
      const cropBaseTemps: Record<string, number> = {
        maize: 10,
        corn: 10,
        rice: 10,
        wheat: 0,
        sorghum: 10,
        cassava: 15,
        oil_palm: 18,
        cocoa: 18,
        coffee: 10,
        banana: 14,
        tomato: 10,
        potato: 7,
        default: 10,
      };
      
      // Crop-specific GDD requirements for maturity
      const cropGDDRequirements: Record<string, { vegetative: number; flowering: number; maturity: number }> = {
        maize: { vegetative: 400, flowering: 800, maturity: 1400 },
        corn: { vegetative: 400, flowering: 800, maturity: 1400 },
        rice: { vegetative: 500, flowering: 900, maturity: 1500 },
        wheat: { vegetative: 300, flowering: 600, maturity: 1200 },
        sorghum: { vegetative: 350, flowering: 700, maturity: 1300 },
        cassava: { vegetative: 600, flowering: 1200, maturity: 2400 },
        oil_palm: { vegetative: 1000, flowering: 2000, maturity: 4000 },
        cocoa: { vegetative: 800, flowering: 1600, maturity: 3200 },
        coffee: { vegetative: 600, flowering: 1200, maturity: 2400 },
        banana: { vegetative: 500, flowering: 1000, maturity: 1800 },
        tomato: { vegetative: 300, flowering: 600, maturity: 1100 },
        potato: { vegetative: 250, flowering: 500, maturity: 900 },
        default: { vegetative: 400, flowering: 800, maturity: 1400 },
      };
      
      const baseTemp = input.baseTemperature || cropBaseTemps[input.cropType.toLowerCase()] || cropBaseTemps.default;
      const gddRequirements = cropGDDRequirements[input.cropType.toLowerCase()] || cropGDDRequirements.default;
      
      const plantingDate = new Date(input.plantingDate);
      const today = new Date();
      const daysSincePlanting = Math.floor((today.getTime() - plantingDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Generate daily GDD values
      const dailyGDD: { date: string; gdd: number; cumulative: number }[] = [];
      let cumulativeGDD = 0;
      
      const current = new Date(plantingDate);
      while (current <= today && dailyGDD.length <= daysSincePlanting) {
        const dayOfYear = Math.floor((current.getTime() - new Date(current.getFullYear(), 0, 0).getTime()) / 86400000);
        
        // Simulate temperature
        const baseAvgTemp = 27 + 5 * Math.sin(2 * Math.PI * (dayOfYear - 80) / 365);
        const tempMin = baseAvgTemp - 5 + (Math.random() - 0.5) * 2;
        const tempMax = baseAvgTemp + 5 + (Math.random() - 0.5) * 2;
        
        // Calculate GDD for this day
        const avgTemp = (tempMin + tempMax) / 2;
        const dailyGDDValue = Math.max(0, avgTemp - baseTemp);
        cumulativeGDD += dailyGDDValue;
        
        dailyGDD.push({
          date: current.toISOString().split('T')[0],
          gdd: Math.round(dailyGDDValue * 10) / 10,
          cumulative: Math.round(cumulativeGDD * 10) / 10,
        });
        
        current.setDate(current.getDate() + 1);
      }
      
      // Determine growth stage
      let growthStage = 'germination';
      let stageProgress = 0;
      
      if (cumulativeGDD >= gddRequirements.maturity) {
        growthStage = 'maturity';
        stageProgress = 100;
      } else if (cumulativeGDD >= gddRequirements.flowering) {
        growthStage = 'grain_fill';
        stageProgress = Math.round(((cumulativeGDD - gddRequirements.flowering) / (gddRequirements.maturity - gddRequirements.flowering)) * 100);
      } else if (cumulativeGDD >= gddRequirements.vegetative) {
        growthStage = 'flowering';
        stageProgress = Math.round(((cumulativeGDD - gddRequirements.vegetative) / (gddRequirements.flowering - gddRequirements.vegetative)) * 100);
      } else {
        growthStage = 'vegetative';
        stageProgress = Math.round((cumulativeGDD / gddRequirements.vegetative) * 100);
      }
      
      // Estimate days to maturity
      const avgDailyGDD = cumulativeGDD / Math.max(1, daysSincePlanting);
      const remainingGDD = Math.max(0, gddRequirements.maturity - cumulativeGDD);
      const estimatedDaysToMaturity = Math.ceil(remainingGDD / avgDailyGDD);
      
      return {
        cropType: input.cropType,
        plantingDate: input.plantingDate,
        baseTemperature: baseTemp,
        daysSincePlanting,
        cumulativeGDD: Math.round(cumulativeGDD * 10) / 10,
        growthStage,
        stageProgress,
        gddRequirements,
        estimatedDaysToMaturity,
        estimatedHarvestDate: new Date(today.getTime() + estimatedDaysToMaturity * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        dailyGDD: dailyGDD.slice(-30), // Last 30 days
        recommendation: getGrowthStageRecommendation(growthStage, input.cropType),
      };
    }),

  /**
   * Get weather-based disease risk assessment
   * Combines weather conditions with crop-specific disease thresholds
   */
  getDiseaseRiskFromWeather: protectedProcedure
    .input(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
        cropType: z.string(),
        daysAhead: z.number().min(1).max(14).default(7),
      })
    )
    .query(async ({ input }) => {
      // Get current weather conditions (simulated)
      const temp = 25 + Math.random() * 10;
      const humidity = 60 + Math.random() * 30;
      const rainfall = Math.random() * 20;
      
      // Disease risk thresholds by crop
      const diseaseRisks: Record<string, { name: string; tempRange: [number, number]; humidityMin: number; risk: string }[]> = {
        maize: [
          { name: 'Northern Leaf Blight', tempRange: [18, 27], humidityMin: 90, risk: 'high' },
          { name: 'Gray Leaf Spot', tempRange: [22, 30], humidityMin: 85, risk: 'medium' },
          { name: 'Rust', tempRange: [15, 25], humidityMin: 80, risk: 'medium' },
        ],
        rice: [
          { name: 'Blast', tempRange: [20, 28], humidityMin: 85, risk: 'high' },
          { name: 'Bacterial Leaf Blight', tempRange: [25, 35], humidityMin: 80, risk: 'medium' },
          { name: 'Sheath Blight', tempRange: [28, 32], humidityMin: 90, risk: 'high' },
        ],
        oil_palm: [
          { name: 'Basal Stem Rot', tempRange: [25, 32], humidityMin: 80, risk: 'high' },
          { name: 'Bud Rot', tempRange: [20, 28], humidityMin: 90, risk: 'medium' },
        ],
        cocoa: [
          { name: 'Black Pod', tempRange: [20, 28], humidityMin: 85, risk: 'high' },
          { name: 'Swollen Shoot', tempRange: [25, 32], humidityMin: 70, risk: 'medium' },
        ],
        default: [
          { name: 'Fungal Disease', tempRange: [20, 30], humidityMin: 80, risk: 'medium' },
        ],
      };
      
      const cropDiseases = diseaseRisks[input.cropType.toLowerCase()] || diseaseRisks.default;
      
      // Assess risk for each disease
      const risks = cropDiseases.map(disease => {
        const tempInRange = temp >= disease.tempRange[0] && temp <= disease.tempRange[1];
        const humidityHigh = humidity >= disease.humidityMin;
        
        let riskLevel = 'low';
        let riskScore = 0;
        
        if (tempInRange && humidityHigh) {
          riskLevel = 'high';
          riskScore = 80 + Math.random() * 20;
        } else if (tempInRange || humidityHigh) {
          riskLevel = 'medium';
          riskScore = 40 + Math.random() * 30;
        } else {
          riskLevel = 'low';
          riskScore = Math.random() * 30;
        }
        
        return {
          disease: disease.name,
          riskLevel,
          riskScore: Math.round(riskScore),
          conditions: {
            temperature: Math.round(temp * 10) / 10,
            humidity: Math.round(humidity),
            optimalTempRange: disease.tempRange,
            humidityThreshold: disease.humidityMin,
          },
          recommendation: riskLevel === 'high' 
            ? `Apply preventive fungicide. Monitor closely for ${disease.name} symptoms.`
            : riskLevel === 'medium'
            ? `Scout fields for early signs of ${disease.name}. Prepare fungicide if needed.`
            : `Low risk. Continue regular monitoring.`,
        };
      });
      
      // Overall risk assessment
      const maxRisk = risks.reduce((max, r) => r.riskScore > max.riskScore ? r : max, risks[0]);
      
      return {
        cropType: input.cropType,
        location: { latitude: input.latitude, longitude: input.longitude },
        currentConditions: {
          temperature: Math.round(temp * 10) / 10,
          humidity: Math.round(humidity),
          rainfall_mm: Math.round(rainfall * 10) / 10,
        },
        overallRisk: maxRisk.riskLevel,
        diseases: risks,
        forecast: `Disease pressure is ${maxRisk.riskLevel} for the next ${input.daysAhead} days based on weather conditions.`,
      };
    }),
});

/**
 * Get growth stage specific recommendations
 */
function getGrowthStageRecommendation(stage: string, cropType: string): string {
  const recommendations: Record<string, Record<string, string>> = {
    vegetative: {
      maize: 'Apply nitrogen fertilizer. Ensure adequate soil moisture. Scout for early pest damage.',
      rice: 'Maintain water level at 5-10cm. Apply nitrogen fertilizer at tillering stage.',
      oil_palm: 'Apply NPK fertilizer. Maintain circle weeding. Monitor for pest damage.',
      default: 'Focus on vegetative growth. Apply nitrogen fertilizer as needed.',
    },
    flowering: {
      maize: 'Critical water stage. Ensure irrigation. Apply foliar micronutrients if needed.',
      rice: 'Maintain water level. Apply potassium fertilizer. Scout for stem borers.',
      oil_palm: 'Maintain fertilizer schedule. Monitor for bunch rot.',
      default: 'Critical growth stage. Ensure adequate water and nutrients.',
    },
    grain_fill: {
      maize: 'Maintain soil moisture. Scout for ear diseases. Prepare for harvest.',
      rice: 'Gradually reduce water. Monitor for grain filling. Scout for diseases.',
      oil_palm: 'Monitor bunch development. Prepare for harvest scheduling.',
      default: 'Monitor crop development. Prepare for harvest.',
    },
    maturity: {
      maize: 'Check grain moisture. Schedule harvest when moisture reaches 20-25%.',
      rice: 'Drain field. Harvest when 80% of grains are golden yellow.',
      oil_palm: 'Harvest bunches when 10+ loose fruits on ground.',
      default: 'Crop is ready for harvest. Monitor quality indicators.',
    },
  };
  
  const cropKey = cropType.toLowerCase();
  return recommendations[stage]?.[cropKey] || recommendations[stage]?.default || 'Continue monitoring crop development.';
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
