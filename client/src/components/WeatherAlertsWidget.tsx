import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cloud, Thermometer, Droplets, Wind, AlertTriangle, ArrowRight } from "lucide-react";

const WEATHER_URL = import.meta.env.VITE_WEATHER_SERVICE_URL || "http://localhost:8107";

interface WeatherData {
  main: { temp: number; humidity: number };
  wind: { speed: number };
  weather: Array<{ main: string; description: string }>;
}

interface WeatherAlert {
  type: string;
  severity: string;
  message: string;
}

export function WeatherAlertsWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWeather() {
      try {
        const resp = await fetch(`${WEATHER_URL}/weather/alerts?region=Oyo&crop=cassava`);
        if (resp.ok) {
          const data = await resp.json();
          setWeather(data.weather);
          setAlerts(data.alerts || []);
        }
      } catch (err) {
        console.warn('[Weather] Service unavailable:', String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchWeather();
  }, []);

  const severityColor = (s: string) => {
    switch (s) {
      case "critical": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "high": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "medium": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default: return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    }
  };

  if (loading) {
    return (
      <Card className="dark:bg-slate-800 dark:border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg dark:text-white">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Weather Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4" />
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-slate-800 dark:border-slate-700" role="region" aria-label="Weather alerts summary">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg dark:text-white">
            <AlertTriangle className="h-5 w-5 text-orange-500" aria-hidden="true" />
            Weather Alerts — Oyo State
          </CardTitle>
          <a href="/weather-alerts">
            <Button variant="ghost" size="sm" className="text-xs dark:text-gray-300">
              View All <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {weather && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-muted/50 dark:bg-slate-700">
              <Thermometer className="h-4 w-4 mx-auto mb-1 text-red-500" aria-hidden="true" />
              <p className="text-sm font-semibold dark:text-white">{weather.main.temp}°C</p>
              <p className="text-xs text-muted-foreground">Temp</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50 dark:bg-slate-700">
              <Droplets className="h-4 w-4 mx-auto mb-1 text-blue-500" aria-hidden="true" />
              <p className="text-sm font-semibold dark:text-white">{weather.main.humidity}%</p>
              <p className="text-xs text-muted-foreground">Humidity</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/50 dark:bg-slate-700">
              <Wind className="h-4 w-4 mx-auto mb-1 text-cyan-500" aria-hidden="true" />
              <p className="text-sm font-semibold dark:text-white">{weather.wind.speed} km/h</p>
              <p className="text-xs text-muted-foreground">Wind</p>
            </div>
          </div>
        )}

        {alerts.length > 0 ? (
          <div className="space-y-2">
            {alerts.slice(0, 3).map((alert, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 dark:bg-slate-700/50">
                <Badge className={severityColor(alert.severity)}>{alert.severity}</Badge>
                <p className="text-xs text-muted-foreground dark:text-gray-400 flex-1">{alert.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-2">
            <Cloud className="h-6 w-6 mx-auto mb-1 text-green-500" aria-hidden="true" />
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">No active alerts</p>
            <p className="text-xs text-muted-foreground">Conditions are favorable for farming</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
