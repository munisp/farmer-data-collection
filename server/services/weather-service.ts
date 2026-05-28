import { logger } from '../logger.js';
/**
 * Weather Service
 * Integrates with OpenWeatherMap API for weather data
 */

interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  description: string;
  icon: string;
  clouds: number;
  visibility: number;
  timestamp: Date;
  temp?: number;
  tempMin?: number;
  tempMax?: number;
  precipitation?: number;
}

interface ForecastData {
  date: Date;
  temperature: {
    min: number;
    max: number;
    day: number;
    night: number;
  };
  humidity: number;
  windSpeed: number;
  description: string;
  icon: string;
  pop: number; // Probability of precipitation
  rain?: number; // Rain volume in mm
}

interface WeatherAlert {
  event: string;
  start: Date;
  end: Date;
  description: string;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
}

export class WeatherService {
  private apiKey: string;
  private baseUrl = 'https://api.openweathermap.org/data/2.5';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENWEATHER_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('OpenWeatherMap API key not configured. Weather features will not work.');
    }
  }

  /**
   * Get current weather for a location
   */
  async getCurrentWeather(lat: number, lon: number): Promise<WeatherData | null> {
    if (!this.apiKey) {
      logger.error('OpenWeatherMap API key not configured');
      return null;
    }

    try {
      const url = `${this.baseUrl}/weather?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        temperature: data.main.temp,
        feelsLike: data.main.feels_like,
        humidity: data.main.humidity,
        pressure: data.main.pressure,
        windSpeed: data.wind.speed,
        windDirection: data.wind.deg,
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        clouds: data.clouds.all,
        visibility: data.visibility,
        timestamp: new Date(data.dt * 1000),
        temp: data.main.temp,
        tempMin: data.main.temp_min,
        tempMax: data.main.temp_max,
        precipitation: data.rain?.['1h'] ?? data.rain?.['3h'] ?? data.snow?.['1h'] ?? 0,
      };
    } catch (error) {
      logger.error('Error fetching current weather:', error);
      return null;
    }
  }

  /**
   * Get 5-day weather forecast
   */
  async getForecast(lat: number, lon: number): Promise<ForecastData[]> {
    if (!this.apiKey) {
      logger.error('OpenWeatherMap API key not configured');
      return [];
    }

    try {
      const url = `${this.baseUrl}/forecast?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Forecast API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Group by day and aggregate
      const dailyForecasts = new Map<string, any[]>();

      data.list.forEach((item: Record<string, any>) => {
        const date = new Date(item.dt * 1000);
        const dateKey = date.toISOString().split('T')[0];

        if (!dailyForecasts.has(dateKey)) {
          dailyForecasts.set(dateKey, []);
        }
        dailyForecasts.get(dateKey)!.push(item);
      });

      const forecasts: ForecastData[] = [];

      dailyForecasts.forEach((items, dateKey) => {
        const temps = items.map(i => i.main.temp);
        const dayItems = items.filter(i => {
          const hour = new Date(i.dt * 1000).getHours();
          return hour >= 6 && hour <= 18;
        });
        const nightItems = items.filter(i => {
          const hour = new Date(i.dt * 1000).getHours();
          return hour < 6 || hour > 18;
        });

        // Use the most common weather description
        const descriptions = items.map((i: any) => i.weather[0].description);
        const description = descriptions.sort((a: string, b: string) =>
          descriptions.filter((v: string) => v === a).length - descriptions.filter((v: string) => v === b).length
        ).pop();

        // Calculate rain volume
        const rain = items.reduce((sum: number, i: any) => sum + (i.rain?.['3h'] || 0), 0);

        forecasts.push({
          date: new Date(dateKey),
          temperature: {
            min: Math.min(...temps),
            max: Math.max(...temps),
            day: dayItems.length > 0 ? dayItems.reduce((sum, i) => sum + i.main.temp, 0) / dayItems.length : temps[0],
            night: nightItems.length > 0 ? nightItems.reduce((sum, i) => sum + i.main.temp, 0) / nightItems.length : temps[0],
          },
          humidity: items.reduce((sum: number, i: any) => sum + i.main.humidity, 0) / items.length,
          windSpeed: items.reduce((sum: number, i: any) => sum + i.wind.speed, 0) / items.length,
          description: description || items[0].weather[0].description,
          icon: items[0].weather[0].icon,
          pop: Math.max(...items.map((i: any) => i.pop || 0)),
          rain: rain > 0 ? rain : undefined,
        });
      });

      return forecasts.slice(0, 5); // Return 5 days
    } catch (error) {
      logger.error('Error fetching forecast:', error);
      return [];
    }
  }

  /**
   * Get weather alerts for a location
   */
  async getWeatherAlerts(lat: number, lon: number): Promise<WeatherAlert[]> {
    if (!this.apiKey) {
      logger.error('OpenWeatherMap API key not configured');
      return [];
    }

    try {
      // Using One Call API 3.0 for alerts (requires different endpoint)
      const url = `${this.baseUrl}/onecall?lat=${lat}&lon=${lon}&appid=${this.apiKey}&exclude=minutely,hourly,daily`;
      const response = await fetch(url);

      if (!response.ok) {
        // Alerts might not be available for all locations
        return [];
      }

      const data = await response.json();

      if (!data.alerts || data.alerts.length === 0) {
        return [];
      }

      return data.alerts.map((alert: any) => ({
        event: alert.event,
        start: new Date(alert.start * 1000),
        end: new Date(alert.end * 1000),
        description: alert.description,
        severity: this.mapSeverity(alert.tags),
      }));
    } catch (error) {
      logger.error('Error fetching weather alerts:', error);
      return [];
    }
  }

  /**
   * Get historical weather data (last 5 days)
   */
  async getHistoricalWeather(lat: number, lon: number, days: number = 5): Promise<WeatherData[]> {
    if (!this.apiKey) {
      logger.error('OpenWeatherMap API key not configured');
      return [];
    }

    const historicalData: WeatherData[] = [];

    try {
      // OpenWeatherMap historical data requires a different endpoint (Time Machine API)
      // For free tier, we'll use the 5-day forecast history workaround
      // Note: This is a limitation - true historical data requires a paid plan

      for (let i = 1; i <= Math.min(days, 5); i++) {
        const timestamp = Math.floor(Date.now() / 1000) - (i * 24 * 60 * 60);
        const url = `${this.baseUrl}/onecall/timemachine?lat=${lat}&lon=${lon}&dt=${timestamp}&appid=${this.apiKey}&units=metric`;

        const response = await fetch(url);

        if (!response.ok) {
          logger.warn(`Historical weather not available for ${i} days ago`);
          continue;
        }

        const data = await response.json();

        if (data.current) {
          historicalData.push({
            temperature: data.current.temp,
            feelsLike: data.current.feels_like,
            humidity: data.current.humidity,
            pressure: data.current.pressure,
            windSpeed: data.current.wind_speed,
            windDirection: data.current.wind_deg,
            description: data.current.weather[0].description,
            icon: data.current.weather[0].icon,
            clouds: data.current.clouds,
            visibility: data.current.visibility,
            timestamp: new Date(data.current.dt * 1000),
            temp: data.current.temp,
            tempMin: data.current.temp,
            tempMax: data.current.temp,
            precipitation: data.current.rain?.['1h'] ?? data.current.snow?.['1h'] ?? 0,
          });
        }
      }

      return historicalData.reverse(); // Oldest first
    } catch (error) {
      logger.error('Error fetching historical weather:', error);
      return [];
    }
  }

  /**
   * Map alert tags to severity levels
   */
  private mapSeverity(tags: string[]): 'minor' | 'moderate' | 'severe' | 'extreme' {
    if (!tags || tags.length === 0) return 'minor';

    if (tags.some(t => t.toLowerCase().includes('extreme'))) return 'extreme';
    if (tags.some(t => t.toLowerCase().includes('severe'))) return 'severe';
    if (tags.some(t => t.toLowerCase().includes('moderate'))) return 'moderate';

    return 'minor';
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// Export singleton instance
export const weatherService = new WeatherService();
