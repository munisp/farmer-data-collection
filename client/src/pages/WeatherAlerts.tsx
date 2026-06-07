import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Cloud, Thermometer, Wind, Droplets, AlertTriangle, Sun, CloudRain, Zap } from "lucide-react";

const WEATHER_URL = import.meta.env.VITE_WEATHER_SERVICE_URL || "http://localhost:8107";

const NIGERIAN_STATES = [
  "Oyo", "Lagos", "Kano", "Enugu", "Anambra", "Ondo", "Benue",
  "Kaduna", "Kebbi", "Sokoto", "Imo", "Kwara", "Niger", "Plateau", "Osun",
];

const CROPS = [
  "cassava", "rice", "yam", "cocoa", "maize", "groundnut",
  "oil_palm", "plantain", "tomato", "pepper",
];

interface WeatherData {
  main: { temp: number; humidity: number; pressure: number };
  wind: { speed: number; deg: number };
  weather: Array<{ main: string; description: string }>;
  name: string;
}

interface WeatherAlert {
  type: string;
  severity: string;
  message: string;
  value?: number;
  threshold?: number;
}

export default function WeatherAlerts() {
  const { formatCurrency } = useLocalization();
  const [region, setRegion] = useState("Oyo");
  const [crop, setCrop] = useState("cassava");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${WEATHER_URL}/weather/alerts?region=${region}&crop=${crop}`);
      if (resp.ok) {
        const data = await resp.json();
        setWeather(data.weather);
        setAlerts(data.alerts || []);
      }
    } catch (err) {
      console.warn('[Weather] Service unavailable, using simulated data:', String(err));
      setWeather({
        main: { temp: 28.5, humidity: 72, pressure: 1013 },
        wind: { speed: 12.3, deg: 180 },
        weather: [{ main: "Clouds", description: "scattered clouds" }],
        name: region,
      });
      setAlerts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts();
  }, [region, crop]);

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-red-500 text-white dark:bg-red-600";
      case "high": return "bg-orange-500 text-white dark:bg-orange-600";
      case "medium": return "bg-yellow-500 text-black dark:bg-yellow-600";
      default: return "bg-blue-500 text-white dark:bg-blue-600";
    }
  };

  const weatherIcon = (condition: string) => {
    switch (condition) {
      case "Thunderstorm": return <Zap className="h-8 w-8 text-yellow-500" aria-hidden="true" />;
      case "Rain": case "Drizzle": return <CloudRain className="h-8 w-8 text-blue-500" aria-hidden="true" />;
      case "Clear": return <Sun className="h-8 w-8 text-yellow-400" aria-hidden="true" />;
      default: return <Cloud className="h-8 w-8 text-gray-400" aria-hidden="true" />;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 dark:bg-slate-900 min-h-screen" role="main" aria-label="Weather Alerts Dashboard">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Weather Alerts</h1>
          <p className="text-gray-500 dark:text-gray-400">Proactive weather monitoring for your farms</p>
        </div>
        <div className="flex gap-3 flex-wrap" role="group" aria-label="Filters">
          <Select value={region} onValueChange={setRegion} aria-label="Select region">
            <SelectTrigger className="w-40 dark:bg-slate-800 dark:text-white dark:border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NIGERIAN_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s} State</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={crop} onValueChange={setCrop} aria-label="Select crop">
            <SelectTrigger className="w-40 dark:bg-slate-800 dark:text-white dark:border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CROPS.map((c) => (
                <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={fetchAlerts} disabled={loading} aria-label="Refresh weather data">
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Current Weather */}
      {weather && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="region" aria-label="Current weather conditions">
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <Thermometer className="h-6 w-6 text-red-500" aria-hidden="true" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Temperature</p>
                <p className="text-2xl font-bold dark:text-white" aria-label={`Temperature: ${weather.main.temp} degrees Celsius`}>{weather.main.temp.toFixed(1)}°C</p>
              </div>
            </CardContent>
          </Card>
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <Droplets className="h-6 w-6 text-blue-500" aria-hidden="true" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Humidity</p>
                <p className="text-2xl font-bold dark:text-white" aria-label={`Humidity: ${weather.main.humidity} percent`}>{weather.main.humidity}%</p>
              </div>
            </CardContent>
          </Card>
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <Wind className="h-6 w-6 text-teal-500" aria-hidden="true" />
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Wind</p>
                <p className="text-2xl font-bold dark:text-white" aria-label={`Wind speed: ${(weather.wind.speed * 3.6).toFixed(0)} kilometers per hour`}>{(weather.wind.speed * 3.6).toFixed(0)} km/h</p>
              </div>
            </CardContent>
          </Card>
          <Card className="dark:bg-slate-800 dark:border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              {weatherIcon(weather.weather[0]?.main || "Clouds")}
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Condition</p>
                <p className="text-lg font-semibold dark:text-white">{weather.weather[0]?.description || "N/A"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alerts */}
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <AlertTriangle className="h-5 w-5 text-orange-500" aria-hidden="true" />
            Active Alerts for {crop.replace("_", " ")} in {region}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400" role="status">
              <Sun className="h-12 w-12 mx-auto mb-3 text-green-500" aria-hidden="true" />
              <p className="font-medium">No active weather alerts</p>
              <p className="text-sm">Conditions are favorable for {crop.replace("_", " ")} in {region} State</p>
            </div>
          ) : (
            <div className="space-y-3" role="list" aria-label="Weather alerts">
              {alerts.map((alert, i) => (
                <div key={i} className="p-4 rounded-lg border dark:border-slate-600 bg-gray-50 dark:bg-slate-700" role="listitem">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={severityColor(alert.severity)}>{alert.severity.toUpperCase()}</Badge>
                        <span className="font-medium text-gray-900 dark:text-white">{alert.type.replace("_", " ")}</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{alert.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
