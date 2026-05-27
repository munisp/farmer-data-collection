export interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  icon: string;
  forecast: ForecastDay[];
}

export interface ForecastDay {
  date: string;
  maxTemp: number;
  minTemp: number;
  condition: string;
  icon: string;
}

/**
 * Fetch weather data from Open-Meteo API
 * @param latitude - Location latitude
 * @param longitude - Location longitude
 * @returns Weather data including current conditions and 7-day forecast
 */
export async function fetchWeatherData(
  latitude: number,
  longitude: number
): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch weather data');
  }

  const data = await response.json();

  return {
    temperature: Math.round(data.current.temperature_2m),
    condition: getWeatherCondition(data.current.weather_code),
    humidity: data.current.relative_humidity_2m,
    windSpeed: Math.round(data.current.wind_speed_10m),
    icon: getWeatherIcon(data.current.weather_code),
    forecast: data.daily.time.map((date: string, index: number) => ({
      date,
      maxTemp: Math.round(data.daily.temperature_2m_max[index]),
      minTemp: Math.round(data.daily.temperature_2m_min[index]),
      condition: getWeatherCondition(data.daily.weather_code[index]),
      icon: getWeatherIcon(data.daily.weather_code[index]),
    })),
  };
}

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: 'Clear',
    1: 'Mainly Clear',
    2: 'Partly Cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Foggy',
    51: 'Light Drizzle',
    53: 'Drizzle',
    55: 'Heavy Drizzle',
    61: 'Light Rain',
    63: 'Rain',
    65: 'Heavy Rain',
    71: 'Light Snow',
    73: 'Snow',
    75: 'Heavy Snow',
    77: 'Snow Grains',
    80: 'Light Showers',
    81: 'Showers',
    82: 'Heavy Showers',
    85: 'Light Snow Showers',
    86: 'Snow Showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with Hail',
    99: 'Thunderstorm with Hail',
  };
  return conditions[code] || 'Unknown';
}

function getWeatherIcon(code: number): string {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 55) return '🌦️';
  if (code >= 61 && code <= 65) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code >= 85 && code <= 86) return '🌨️';
  if (code >= 95 && code <= 99) return '⛈️';
  return '🌡️';
}
