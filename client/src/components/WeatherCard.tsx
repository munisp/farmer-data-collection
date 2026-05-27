import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchWeatherData, type WeatherData } from "@/lib/weatherApi";
import { Loader2 } from "lucide-react";

interface WeatherCardProps {
  latitude: number;
  longitude: number;
  locationName?: string;
}

export function WeatherCard({ latitude, longitude, locationName = "Farm Location" }: WeatherCardProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadWeather() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchWeatherData(latitude, longitude);
        if (mounted) {
          setWeather(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load weather');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadWeather();

    return () => {
      mounted = false;
    };
  }, [latitude, longitude]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weather</CardTitle>
          <CardDescription>{locationName}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !weather) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weather</CardTitle>
          <CardDescription>{locationName}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error || 'Unable to load weather data'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weather</CardTitle>
        <CardDescription>{locationName}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Current Weather */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-4xl font-bold">{weather.temperature}°C</div>
              <div className="text-sm text-muted-foreground">{weather.condition}</div>
            </div>
            <div className="text-6xl">{weather.icon}</div>
          </div>

          {/* Additional Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Humidity</div>
              <div className="font-medium">{weather.humidity}%</div>
            </div>
            <div>
              <div className="text-muted-foreground">Wind Speed</div>
              <div className="font-medium">{weather.windSpeed} km/h</div>
            </div>
          </div>

          {/* 7-Day Forecast */}
          <div className="space-y-2">
            <div className="text-sm font-medium">7-Day Forecast</div>
            <div className="space-y-1">
              {weather.forecast.slice(0, 7).map((day) => (
                <div key={day.date} className="flex items-center justify-between text-sm">
                  <div className="text-muted-foreground">
                    {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{day.icon}</span>
                    <span className="font-medium">{day.maxTemp}°</span>
                    <span className="text-muted-foreground">{day.minTemp}°</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
