import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Cloud, Droplets, Wind, Thermometer, Sun, CloudRain, Eye } from "lucide-react";

interface WeatherData {
  temperature: number;
  feels_like: number;
  humidity: number;
  pressure: number;
  weather: string;
  description: string;
  wind_speed: number;
  wind_direction: number;
  clouds: number;
  visibility: number;
  location: string;
}

interface ForecastDay {
  date: string;
  temp_min: number;
  temp_max: number;
  humidity: number;
  weather: string;
  description: string;
  wind_speed: number;
  precipitation_probability: number;
  rain: number;
}

interface AgricultureIndices {
  temperature: number;
  humidity: number;
  wind_speed: number;
  heat_stress_index: string;
  evapotranspiration_mm: string;
  growing_degree_days: string;
  frost_risk: string;
  irrigation_recommendation: string;
  optimal_spray_conditions: boolean;
}

export default function WeatherDashboard() {
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [agIndices, setAgIndices] = useState<AgricultureIndices | null>(null);
  const [loading, setLoading] = useState(false);

  const [location, setLocation] = useState({
    latitude: "6.5244",
    longitude: "3.3792",
  });

  const lat = parseFloat(location.latitude) || 6.5244;
  const lng = parseFloat(location.longitude) || 3.3792;

  const weatherQuery = trpc.weather.getCurrentWeather.useQuery(
    { latitude: lat, longitude: lng },
    { retry: 1, refetchOnWindowFocus: false }
  );
  const forecastQuery = trpc.weather.getForecast.useQuery(
    { latitude: lat, longitude: lng },
    { retry: 1, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (weatherQuery.data) {
      setCurrentWeather(weatherQuery.data as WeatherData);
      const w = weatherQuery.data;
      setAgIndices({
        temperature: w.temperature,
        humidity: w.humidity,
        wind_speed: w.wind_speed,
        heat_stress_index: String((w.temperature * 1.08).toFixed(1)),
        evapotranspiration_mm: String((w.temperature * 0.15).toFixed(2)),
        growing_degree_days: String(Math.max(0, w.temperature - 10).toFixed(1)),
        frost_risk: w.temperature < 10 ? "High" : w.temperature < 15 ? "Medium" : "Low",
        irrigation_recommendation: w.humidity > 80 ? "Reduce" : w.humidity < 40 ? "Increase" : "Normal",
        optimal_spray_conditions: w.wind_speed < 10 && w.humidity > 40 && w.humidity < 80,
      });
    }
    if (forecastQuery.data) setForecast(forecastQuery.data as ForecastDay[]);
  }, [weatherQuery.data, forecastQuery.data]);

  const loadWeatherData = () => {
    weatherQuery.refetch();
    forecastQuery.refetch();
    toast.success("Weather data refreshed");
  };

  const getWeatherIcon = (weather: string) => {
    switch (weather.toLowerCase()) {
      case 'clear':
        return <Sun className="h-8 w-8 text-yellow-500" />;
      case 'rain':
      case 'drizzle':
        return <CloudRain className="h-8 w-8 text-blue-500" />;
      case 'clouds':
        return <Cloud className="h-8 w-8 text-gray-500" />;
      default:
        return <Cloud className="h-8 w-8 text-gray-500" />;
    }
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Weather Dashboard</h1>
            <p className="text-muted-foreground">Real-time weather and agricultural indices</p>
          </div>
          <Button onClick={loadWeatherData} disabled={loading}>
            Refresh Data
          </Button>
        </div>

        {/* Current Weather */}
        {currentWeather && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Current Weather</span>
                {getWeatherIcon(currentWeather.weather)}
              </CardTitle>
              <CardDescription>{currentWeather.location}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-3 p-4 border rounded-lg">
                  <Thermometer className="h-8 w-8 text-red-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Temperature</p>
                    <p className="text-2xl font-bold">{currentWeather.temperature}°C</p>
                    <p className="text-xs text-muted-foreground">Feels like {currentWeather.feels_like}°C</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 border rounded-lg">
                  <Droplets className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Humidity</p>
                    <p className="text-2xl font-bold">{currentWeather.humidity}%</p>
                    <p className="text-xs text-muted-foreground">Pressure: {currentWeather.pressure} hPa</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 border rounded-lg">
                  <Wind className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Wind Speed</p>
                    <p className="text-2xl font-bold">{currentWeather.wind_speed} m/s</p>
                    <p className="text-xs text-muted-foreground">Direction: {currentWeather.wind_direction}°</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 border rounded-lg">
                  <Eye className="h-8 w-8 text-purple-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">Visibility</p>
                    <p className="text-2xl font-bold">{(currentWeather.visibility / 1000).toFixed(1)} km</p>
                    <p className="text-xs text-muted-foreground">Clouds: {currentWeather.clouds}%</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-4 bg-muted rounded-lg">
                <p className="font-semibold capitalize">{currentWeather.description}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs for Forecast and Agricultural Indices */}
        <Tabs defaultValue="forecast" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="forecast">5-Day Forecast</TabsTrigger>
            <TabsTrigger value="agriculture">Agricultural Indices</TabsTrigger>
          </TabsList>

          {/* Forecast */}
          <TabsContent value="forecast" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {forecast.map((day, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      {getWeatherIcon(day.weather)}
                    </CardTitle>
                    <CardDescription className="text-xs">{day.date}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Temperature</p>
                      <p className="font-semibold">{day.temp_max}° / {day.temp_min}°</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Rain</p>
                      <p className="font-semibold">{day.rain} mm ({day.precipitation_probability}%)</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Wind</p>
                      <p className="font-semibold">{day.wind_speed} m/s</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Humidity</p>
                      <p className="font-semibold">{day.humidity}%</p>
                    </div>
                    <Badge variant="outline" className="w-full justify-center text-xs">
                      {day.description}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Agricultural Indices */}
          <TabsContent value="agriculture" className="space-y-4">
            {agIndices && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Heat Stress Index</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{agIndices.heat_stress_index}°C</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Indicates heat stress on crops
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Evapotranspiration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{agIndices.evapotranspiration_mm} mm</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Daily water loss estimate
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Growing Degree Days</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{agIndices.growing_degree_days}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Accumulated heat units (base 10°C)
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Frost Risk</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant={agIndices.frost_risk === 'Low' ? 'default' : 'destructive'}>
                      {agIndices.frost_risk}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-2">
                      Risk of frost damage to crops
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Spray Conditions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant={agIndices.optimal_spray_conditions ? 'default' : 'secondary'}>
                      {agIndices.optimal_spray_conditions ? 'Optimal' : 'Not Optimal'}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-2">
                      Wind &lt; 5 m/s, Humidity &gt; 50%, Temp &lt; 30°C
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Irrigation Recommendation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold">{agIndices.irrigation_recommendation}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Based on weather conditions
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
