import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Cloud, Droplets, Wind, Sunrise, Sunset, ThermometerSun } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface WeatherWidgetProps {
  latitude: number;
  longitude: number;
  farmName?: string;
}

export function WeatherWidget({ latitude, longitude, farmName }: WeatherWidgetProps) {
  const { data: currentWeather, isLoading: weatherLoading } = trpc.weather.getCurrentWeather.useQuery({
    latitude,
    longitude,
  });

  const { data: forecast, isLoading: forecastLoading } = trpc.weather.getForecast.useQuery({
    latitude,
    longitude,
  });

  const { data: agIndices, isLoading: indicesLoading } = trpc.weather.getAgricultureIndices.useQuery({
    latitude,
    longitude,
  });

  const { data: weatherStations } = trpc.weather.getNearestWeatherStations.useQuery({
    latitude,
    longitude,
    radiusKm: 50,
  });

  const isLoading = weatherLoading || forecastLoading || indicesLoading;

  return (
    <div className="space-y-4">
      {/* Current Weather */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5" />
            Current Weather
            {farmName && <span className="text-sm font-normal text-muted-foreground">- {farmName}</span>}
          </CardTitle>
          <CardDescription>
            Real-time weather conditions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {weatherLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : currentWeather ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <ThermometerSun className="w-6 h-6 mx-auto mb-2 text-orange-600" />
                <div className="text-2xl font-bold">{currentWeather.temperature.toFixed(1)}°C</div>
                <div className="text-sm text-muted-foreground">Temperature</div>
                <div className="text-xs text-muted-foreground">Feels like {currentWeather.feels_like.toFixed(1)}°C</div>
              </div>

              <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <Droplets className="w-6 h-6 mx-auto mb-2 text-blue-600" />
                <div className="text-2xl font-bold">{currentWeather.humidity}%</div>
                <div className="text-sm text-muted-foreground">Humidity</div>
              </div>

              <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <Wind className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                <div className="text-2xl font-bold">{currentWeather.wind_speed.toFixed(1)} m/s</div>
                <div className="text-sm text-muted-foreground">Wind Speed</div>
              </div>

              <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <Cloud className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                <div className="text-2xl font-bold">{currentWeather.clouds}%</div>
                <div className="text-sm text-muted-foreground">Cloud Cover</div>
                <div className="text-xs text-muted-foreground capitalize">{currentWeather.description}</div>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground">Weather data unavailable</p>
          )}
        </CardContent>
      </Card>

      {/* Agricultural Indices */}
      {agIndices && (
        <Card>
          <CardHeader>
            <CardTitle>Agricultural Indices</CardTitle>
            <CardDescription>
              Farming-specific weather metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 border rounded-lg">
                <div className="text-sm text-muted-foreground">Growing Degree Days (GDD)</div>
                <div className="text-xl font-bold">{agIndices.growing_degree_days}</div>
                <div className="text-xs text-muted-foreground">Base 10°C</div>
              </div>

              <div className="p-3 border rounded-lg">
                <div className="text-sm text-muted-foreground">Evapotranspiration (ET₀)</div>
                <div className="text-xl font-bold">{agIndices.evapotranspiration_mm} mm/day</div>
                <div className="text-xs text-muted-foreground">Water loss estimate</div>
              </div>

              <div className="p-3 border rounded-lg">
                <div className="text-sm text-muted-foreground">Heat Stress Index</div>
                <div className="text-xl font-bold">{agIndices.heat_stress_index}</div>
                <div className="text-xs text-muted-foreground">
                  {parseFloat(agIndices.heat_stress_index) > 35 ? "⚠️ High stress" : "✓ Normal"}
                </div>
              </div>

              <div className="p-3 border rounded-lg">
                <div className="text-sm text-muted-foreground">Frost Risk</div>
                <div className="text-xl font-bold">{agIndices.frost_risk}</div>
                <div className="text-xs text-muted-foreground">
                  {agIndices.frost_risk === "High" ? "⚠️ Protect crops" : "✓ Safe"}
                </div>
              </div>

              <div className="p-3 border rounded-lg col-span-full">
                <div className="text-sm text-muted-foreground">Irrigation Recommendation</div>
                <div className="text-lg font-semibold">{agIndices.irrigation_recommendation}</div>
              </div>

              <div className="p-3 border rounded-lg col-span-full">
                <div className="text-sm text-muted-foreground">Spray Conditions</div>
                <div className="text-lg font-semibold">
                  {agIndices.optimal_spray_conditions ? (
                    <span className="text-green-600">✓ Optimal for spraying</span>
                  ) : (
                    <span className="text-orange-600">⚠️ Not ideal for spraying</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Best when: Wind &lt; 5 m/s, Humidity &gt; 50%, Temp &lt; 30°C
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 5-Day Forecast */}
      {forecast && forecast.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>5-Day Forecast</CardTitle>
            <CardDescription>
              Weather predictions for the coming days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {forecast.map((day, idx: number) => (
                <div key={idx} className="text-center p-3 border rounded-lg">
                  <div className="text-sm font-medium mb-2">
                    {new Date(day.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize mb-2">{day.description}</div>
                  <div className="flex justify-center gap-2 text-sm">
                    <span className="text-orange-600 font-semibold">{day.temp_max.toFixed(0)}°</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-blue-600">{day.temp_min.toFixed(0)}°</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    <Droplets className="w-3 h-3 inline mr-1" />
                    {day.precipitation_probability.toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nearest Weather Stations */}
      {weatherStations && weatherStations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Nearest Weather Stations</CardTitle>
            <CardDescription>
              Monitoring stations within 50km
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {weatherStations.map((station) => (
                <div key={station.id} className="flex justify-between items-center p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{station.name}</div>
                    <div className="text-sm text-muted-foreground">{station.type} Station</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-primary">{station.distance_km.toFixed(1)} km</div>
                    <div className="text-xs text-muted-foreground">{station.elevation}m elevation</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
