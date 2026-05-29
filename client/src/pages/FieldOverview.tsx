import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle,
  ClipboardList,
  CloudRain,
  Database,
  Droplets,
  Info,
  Leaf,
  MapPin,
  Satellite,
  Target,
  Thermometer,
  Wind,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return "Not available";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

const formatDateTime = (value: string | Date | null | undefined) => {
  if (!value) return "Not available";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatNumber = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not available";
  return value.toFixed(digits);
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "Not available";
  return `${value.toFixed(1)}%`;
};

const sentenceCase = (value: string | null | undefined) => {
  if (!value) return "Not available";
  return value
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const statusBadgeClass = (value: string | null | undefined) => {
  const normalized = (value || "").toLowerCase();
  if (["excellent", "good", "healthy", "completed"].includes(normalized)) {
    return "bg-green-100 text-green-800";
  }
  if (["moderate", "medium", "in progress", "in_progress", "pending"].includes(normalized)) {
    return "bg-yellow-100 text-yellow-800";
  }
  if (["critical", "high", "urgent", "cancelled"].includes(normalized)) {
    return "bg-red-100 text-red-800";
  }
  return "bg-slate-100 text-slate-700";
};

const trendLabel = (value: string | null | undefined) => {
  if (!value || value === "unknown") return "Insufficient history";
  return sentenceCase(value);
};

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Info className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">{description}</p>
      </CardContent>
    </Card>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="h-8 w-32 rounded bg-slate-200" />
              <div className="h-3 w-20 rounded bg-slate-200" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function FieldOverview() {
  const [selectedFieldId, setSelectedFieldId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("overview");

  const { data: fields = [], isLoading: fieldsLoading, error: fieldsError } = trpc.fieldOverview.getFields.useQuery();

  useEffect(() => {
    if (!selectedFieldId && fields.length > 0) {
      setSelectedFieldId(fields[0].id);
    }
  }, [fields, selectedFieldId]);

  const selectedField = useMemo(
    () => fields.find((field) => field.id === selectedFieldId) ?? fields[0] ?? null,
    [fields, selectedFieldId]
  );

  const hasWeatherCoordinates =
    selectedField?.latitude !== null &&
    selectedField?.latitude !== undefined &&
    selectedField?.longitude !== null &&
    selectedField?.longitude !== undefined;

  const weatherInput = {
    latitude: selectedField?.latitude ?? 0,
    longitude: selectedField?.longitude ?? 0,
  };

  const fieldSelectorInput = {
    farmId: selectedField?.farmId ?? 0,
    fieldBoundaryId: selectedField?.fieldBoundaryId ?? undefined,
  };

  const vegetationQuery = trpc.fieldOverview.getVegetationSummary.useQuery(fieldSelectorInput, {
    enabled: !!selectedField,
  });

  const healthQuery = trpc.fieldOverview.getFieldHealth.useQuery(fieldSelectorInput, {
    enabled: !!selectedField,
  });

  const scoutingQuery = trpc.fieldOverview.getScoutingTasks.useQuery(
    {
      ...fieldSelectorInput,
      limit: 25,
    },
    { enabled: !!selectedField }
  );

  const activityQuery = trpc.fieldOverview.getActivityLog.useQuery(
    {
      ...fieldSelectorInput,
      limit: 25,
    },
    { enabled: !!selectedField }
  );

  const currentWeatherQuery = trpc.weather.getCurrentWeather.useQuery(weatherInput, {
    enabled: hasWeatherCoordinates,
  });

  const forecastQuery = trpc.weather.getForecast.useQuery(weatherInput, {
    enabled: hasWeatherCoordinates,
  });

  const vegetation = vegetationQuery.data;
  const fieldHealth = healthQuery.data;
  const scoutingTasks = scoutingQuery.data ?? [];
  const activityLog = activityQuery.data ?? [];
  const currentWeather = currentWeatherQuery.data;
  const forecast = forecastQuery.data ?? [];

  const overviewCards = useMemo(() => {
    const latest = vegetation?.latest;
    const latestReport = fieldHealth?.latestReport;
    return [
      {
        title: "Field Size",
        value: selectedField ? `${formatNumber(selectedField.areaHectares, 1)} ha` : "Not available",
        description: selectedField?.farmName || "No field selected",
        icon: MapPin,
      },
      {
        title: "Health Score",
        value:
          latestReport?.healthScore !== null && latestReport?.healthScore !== undefined
            ? `${formatNumber(latestReport.healthScore, 1)} / 100`
            : "No report",
        description: latestReport?.status || "No crop health report",
        icon: Leaf,
      },
      {
        title: "Latest NDVI",
        value: latest?.ndvi !== null && latest?.ndvi !== undefined ? formatNumber(latest.ndvi, 3) : "No reading",
        description: trendLabel(vegetation?.trends.ndvi),
        icon: Satellite,
      },
      {
        title: "Open Scouting Tasks",
        value: String(scoutingTasks.filter((task) => task.status !== "completed").length),
        description: `${scoutingTasks.length} total live tasks`,
        icon: ClipboardList,
      },
    ];
  }, [fieldHealth?.latestReport, scoutingTasks, selectedField, vegetation?.latest, vegetation?.trends.ndvi]);

  if (fieldsLoading) {
    return (
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Field Overview</h1>
          <p className="text-slate-600">Loading live field data from the production backend.</p>
        </div>
        <LoadingGrid />
      </div>
    );
  }

  if (fieldsError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Field Overview</h1>
          <p className="text-slate-600">The field dashboard now reads only live backend data.</p>
        </div>
        <EmptyState
          title="Unable to load your fields"
          description={fieldsError.message || "The backend could not return field data for the current user."}
        />
      </div>
    );
  }

  if (!selectedField) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Field Overview</h1>
          <p className="text-slate-600">This page now requires persisted field or farm records and does not fall back to demo content.</p>
        </div>
        <EmptyState
          title="No fields available"
          description="No farms or field boundaries were found for the authenticated user. Create or geotag a field to unlock live satellite, weather, scouting, and activity insights."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Field Overview</h1>
          <p className="text-slate-600">
            Production-backed monitoring across field health, weather, disease diagnostics, scouting, and operational activity.
          </p>
        </div>

        <div className="w-full max-w-md">
          <label className="mb-2 block text-sm font-medium text-slate-700">Selected field</label>
          <Select value={selectedField.id} onValueChange={setSelectedFieldId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a field" />
            </SelectTrigger>
            <SelectContent>
              {fields.map((field) => (
                <SelectItem key={field.id} value={field.id}>
                  {field.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-emerald-600" />
            {selectedField.name}
          </CardTitle>
          <CardDescription>{selectedField.location || selectedField.farmName}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-sm text-slate-500">Farm</p>
            <p className="font-semibold text-slate-900">{selectedField.farmName}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Crop</p>
            <p className="font-semibold text-slate-900">{sentenceCase(selectedField.cropType)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Planting Date</p>
            <p className="font-semibold text-slate-900">{formatDate(selectedField.plantingDate)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Irrigation</p>
            <p className="font-semibold text-slate-900">{sentenceCase(selectedField.irrigationType)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">{card.title}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
                    <p className="mt-1 text-sm text-slate-600">{card.description}</p>
                  </div>
                  <div className="rounded-full bg-emerald-50 p-3 text-emerald-600">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="satellite">Satellite</TabsTrigger>
          <TabsTrigger value="weather">Weather</TabsTrigger>
          <TabsTrigger value="disease">Disease Risk</TabsTrigger>
          <TabsTrigger value="scouting">Scouting</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Leaf className="h-5 w-5 text-emerald-600" />
                  Crop Health Snapshot
                </CardTitle>
                <CardDescription>Latest persisted agronomic assessment for the selected field.</CardDescription>
              </CardHeader>
              <CardContent>
                {healthQuery.isLoading ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 w-40 rounded bg-slate-200" />
                    <div className="h-4 w-full rounded bg-slate-200" />
                    <div className="h-4 w-2/3 rounded bg-slate-200" />
                  </div>
                ) : fieldHealth?.latestReport ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-500">Health status</p>
                        <p className="text-2xl font-bold text-slate-900">{fieldHealth.latestReport.status}</p>
                      </div>
                      <Badge className={statusBadgeClass(fieldHealth.latestReport.status)}>
                        {fieldHealth.latestReport.status}
                      </Badge>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                        <span>Health score</span>
                        <span>{formatNumber(fieldHealth.latestReport.healthScore, 1)} / 100</span>
                      </div>
                      <Progress value={fieldHealth.latestReport.healthScore ?? 0} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-sm text-slate-500">Growth stage</p>
                        <p className="font-medium text-slate-900">{fieldHealth.latestReport.growthStage}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Stress profile</p>
                        <p className="font-medium text-slate-900">
                          {sentenceCase(fieldHealth.latestReport.stressType)} / {sentenceCase(fieldHealth.latestReport.stressLevel)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Canopy cover</p>
                        <p className="font-medium text-slate-900">{formatPercent(fieldHealth.latestReport.canopyCover)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Biomass</p>
                        <p className="font-medium text-slate-900">
                          {fieldHealth.latestReport.biomass !== null && fieldHealth.latestReport.biomass !== undefined
                            ? `${formatNumber(fieldHealth.latestReport.biomass, 1)} kg/ha`
                            : "Not available"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Observations</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {fieldHealth.latestReport.observations || "No field observations were recorded in the latest report."}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Recommendations</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {fieldHealth.latestReport.recommendations || "No agronomic recommendation was attached to the latest report."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No crop health report"
                    description="No persisted crop health report is available for this field yet. The dashboard now surfaces an explicit empty state instead of fabricated health scores."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-blue-600" />
                  Vegetation Summary
                </CardTitle>
                <CardDescription>Latest vegetation indices stored for the selected boundary.</CardDescription>
              </CardHeader>
              <CardContent>
                {vegetationQuery.isLoading ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 w-40 rounded bg-slate-200" />
                    <div className="h-4 w-full rounded bg-slate-200" />
                    <div className="h-4 w-2/3 rounded bg-slate-200" />
                  </div>
                ) : vegetation?.latest ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div>
                        <p className="text-sm text-slate-500">Measurement date</p>
                        <p className="font-semibold text-slate-900">{formatDate(vegetation.latest.measurementDate)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Imagery count</p>
                        <p className="font-semibold text-slate-900">{vegetation.imageCount}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Latest source</p>
                        <p className="font-semibold text-slate-900">{sentenceCase(vegetation.latestImage?.satelliteSource)}</p>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      {[
                        ["NDVI", vegetation.latest.ndvi, vegetation.trends.ndvi],
                        ["NDRE", vegetation.latest.ndre, vegetation.trends.ndre],
                        ["EVI", vegetation.latest.evi, vegetation.trends.evi],
                        ["SAVI", vegetation.latest.savi, vegetation.trends.savi],
                        ["GNDVI", vegetation.latest.gndvi, vegetation.trends.gndvi],
                      ].map(([label, value, trend]) => (
                        <div key={String(label)} className="rounded-lg border p-3">
                          <p className="text-sm text-slate-500">{label}</p>
                          <p className="text-xl font-bold text-slate-900">
                            {typeof value === "number" ? formatNumber(value, 3) : "Not available"}
                          </p>
                          <p className="text-xs text-slate-500">{trendLabel(String(trend))}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No vegetation telemetry"
                    description="No vegetation index records have been stored for this field boundary yet. Satellite values are no longer synthesized from static defaults."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="satellite" className="space-y-4">
          {vegetation?.latest ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Satellite className="h-5 w-5 text-emerald-600" />
                    Latest Satellite Capture
                  </CardTitle>
                  <CardDescription>
                    {vegetation.latestImage
                      ? `Most recent ${sentenceCase(vegetation.latestImage.imageType)} imagery for the field boundary.`
                      : "Vegetation records exist, but no linked imagery metadata was found."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="text-sm text-slate-500">Capture date</p>
                      <p className="font-semibold text-slate-900">
                        {formatDate(vegetation.latestImage?.imageDate || vegetation.latest.measurementDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Cloud coverage</p>
                      <p className="font-semibold text-slate-900">
                        {vegetation.latestImage?.cloudCoverage !== null && vegetation.latestImage?.cloudCoverage !== undefined
                          ? `${formatNumber(vegetation.latestImage.cloudCoverage, 1)}%`
                          : "Not available"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Resolution</p>
                      <p className="font-semibold text-slate-900">
                        {vegetation.latestImage?.resolution !== null && vegetation.latestImage?.resolution !== undefined
                          ? `${formatNumber(vegetation.latestImage.resolution, 1)} m/px`
                          : "Not available"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Source</p>
                      <p className="font-semibold text-slate-900">{sentenceCase(vegetation.latestImage?.satelliteSource)}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {[
                      ["Mean vegetation", vegetation.latest.meanValue],
                      ["Minimum value", vegetation.latest.minValue],
                      ["Maximum value", vegetation.latest.maxValue],
                      ["Standard deviation", vegetation.latest.stdDev],
                      ["NDVI", vegetation.latest.ndvi],
                      ["NDRE", vegetation.latest.ndre],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg border p-4">
                        <p className="text-sm text-slate-500">{label}</p>
                        <p className="mt-2 text-2xl font-bold text-slate-900">
                          {typeof value === "number" ? formatNumber(value, 3) : "Not available"}
                        </p>
                      </div>
                    ))}
                  </div>

                  {vegetation.latestImage?.imageUrl ? (
                    <div className="flex flex-wrap gap-3">
                      <Button asChild variant="outline">
                        <a href={vegetation.latestImage.imageUrl} target="_blank" rel="noreferrer">
                          View Full Image
                        </a>
                      </Button>
                      {vegetation.latestImage.thumbnailUrl ? (
                        <Button asChild variant="outline">
                          <a href={vegetation.latestImage.thumbnailUrl} target="_blank" rel="noreferrer">
                            Open Thumbnail
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-purple-600" />
                    Trend Interpretation
                  </CardTitle>
                  <CardDescription>Relative movement from the prior stored vegetation sample.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(vegetation.trends).map(([indexName, trend]) => (
                    <div key={indexName} className="flex items-center justify-between rounded-lg border p-3">
                      <span className="font-medium text-slate-900">{indexName.toUpperCase()}</span>
                      <Badge className={statusBadgeClass(trend)}>{trendLabel(trend)}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          ) : (
            <EmptyState
              title="Satellite analytics unavailable"
              description="The selected field does not yet have persisted vegetation records or linked satellite imagery. This view no longer falls back to generic NDVI demonstrations."
            />
          )}
        </TabsContent>

        <TabsContent value="weather" className="space-y-4">
          {!hasWeatherCoordinates ? (
            <EmptyState
              title="Weather unavailable"
              description="The selected field does not have a stored latitude and longitude, so live weather conditions and forecasts cannot be requested yet."
            />
          ) : currentWeatherQuery.isLoading || forecastQuery.isLoading ? (
            <LoadingGrid />
          ) : currentWeather ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <Thermometer className="h-6 w-6 text-orange-500" />
                      <div>
                        <p className="text-sm text-slate-500">Temperature</p>
                        <p className="text-2xl font-bold text-slate-900">{formatNumber(currentWeather.temperature, 1)}°C</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <Droplets className="h-6 w-6 text-blue-500" />
                      <div>
                        <p className="text-sm text-slate-500">Humidity</p>
                        <p className="text-2xl font-bold text-slate-900">{currentWeather.humidity}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <Wind className="h-6 w-6 text-slate-500" />
                      <div>
                        <p className="text-sm text-slate-500">Wind Speed</p>
                        <p className="text-2xl font-bold text-slate-900">{formatNumber(currentWeather.wind_speed, 1)} m/s</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                      <CloudRain className="h-6 w-6 text-indigo-500" />
                      <div>
                        <p className="text-sm text-slate-500">Conditions</p>
                        <p className="text-xl font-bold text-slate-900">{currentWeather.weather}</p>
                        <p className="text-sm text-slate-500">{currentWeather.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-emerald-600" />
                    Five-Day Forecast
                  </CardTitle>
                  <CardDescription>Live forecast from the weather service for the field coordinates.</CardDescription>
                </CardHeader>
                <CardContent>
                  {forecast.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                      {forecast.map((entry) => (
                        <div key={entry.date} className="rounded-lg border p-4">
                          <p className="font-semibold text-slate-900">{formatDate(entry.date)}</p>
                          <p className="mt-2 text-2xl font-bold text-slate-900">{formatNumber(entry.temp_max, 0)}°</p>
                          <p className="text-sm text-slate-500">Low {formatNumber(entry.temp_min, 0)}°</p>
                          <p className="mt-2 text-sm text-slate-700">{entry.weather}</p>
                          <p className="text-sm text-slate-500">Rain probability {formatNumber(entry.precipitation_probability, 0)}%</p>
                          <p className="text-sm text-slate-500">Rainfall {formatNumber(entry.rain, 1)} mm</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="Forecast unavailable"
                      description="The weather service returned no forecast entries for the selected field coordinates."
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <EmptyState
              title="Weather response unavailable"
              description="The weather backend did not return a current conditions payload for this field."
            />
          )}
        </TabsContent>

        <TabsContent value="disease" className="space-y-4">
          {healthQuery.isLoading ? (
            <LoadingGrid />
          ) : fieldHealth?.diseaseRisks && fieldHealth.diseaseRisks.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {fieldHealth.diseaseRisks.map((risk) => (
                <Card key={risk.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                          {risk.detectedIssue}
                        </CardTitle>
                        <CardDescription>
                          {sentenceCase(risk.diagnosisType)} detected on {formatDate(risk.diagnosisDate)}
                        </CardDescription>
                      </div>
                      <Badge className={statusBadgeClass(risk.severity)}>{sentenceCase(risk.severity)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                        <span>Model confidence</span>
                        <span>{formatNumber(risk.confidence, 1)}%</span>
                      </div>
                      <Progress value={Math.max(0, Math.min(100, risk.confidence))} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-sm text-slate-500">Severity</p>
                        <p className="font-medium text-slate-900">{sentenceCase(risk.severity)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Affected area</p>
                        <p className="font-medium text-slate-900">
                          {risk.affectedArea !== null && risk.affectedArea !== undefined
                            ? `${formatNumber(risk.affectedArea, 1)} ha/%`
                            : "Not available"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Symptoms</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {risk.symptoms || "No symptoms were recorded for this diagnostic event."}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Treatment</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {risk.treatment || "No treatment recommendation was attached to this diagnostic event."}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Prevention</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {risk.preventionMeasures || "No prevention guidance was recorded."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No disease or pest diagnostics"
              description="No AI diagnostics or disease-oriented crop health report was found for the selected field. The page now shows a truthful empty state instead of static disease-risk percentages."
            />
          )}
        </TabsContent>

        <TabsContent value="scouting" className="space-y-4">
          {scoutingQuery.isLoading ? (
            <LoadingGrid />
          ) : selectedField.fieldBoundaryId === null ? (
            <EmptyState
              title="No field boundary linked"
              description="Scouting tasks are stored against field boundaries. This farm has no persisted boundary yet, so no scouting workload can be retrieved."
            />
          ) : scoutingTasks.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {scoutingTasks.map((task) => (
                <Card key={task.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <ClipboardList className="h-5 w-5 text-blue-600" />
                          {task.taskName}
                        </CardTitle>
                        <CardDescription>{sentenceCase(task.taskType)}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Badge className={statusBadgeClass(task.priority)}>{sentenceCase(task.priority)}</Badge>
                        <Badge className={statusBadgeClass(task.status)}>{sentenceCase(task.status)}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <p className="text-sm text-slate-500">Scheduled</p>
                        <p className="font-medium text-slate-900">{formatDateTime(task.scheduledDate)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Completed</p>
                        <p className="font-medium text-slate-900">{formatDateTime(task.completedDate)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Assigned To</p>
                        <p className="font-medium text-slate-900">{task.assignedTo || "Unassigned"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Images</p>
                        <p className="font-medium text-slate-900">{task.imageCount}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Observations</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {task.observations || "No scouting observations have been captured yet."}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">Recommendations</p>
                      <p className="mt-1 text-sm text-slate-700">
                        {task.recommendations || "No follow-up recommendations were recorded."}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No scouting tasks"
              description="No scouting tasks are currently stored for this field boundary. The previous generic task checklist has been removed."
            />
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          {activityQuery.isLoading ? (
            <LoadingGrid />
          ) : activityLog.length > 0 ? (
            <div className="space-y-4">
              {activityLog.map((activity) => (
                <Card key={activity.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="rounded-full bg-emerald-50 p-2 text-emerald-600">
                            {activity.status === "completed" ? <CheckCircle className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{sentenceCase(activity.taskType)}</p>
                            <p className="text-sm text-slate-500">{activity.workOrderNumber}</p>
                          </div>
                          <Badge className={statusBadgeClass(activity.status)}>{sentenceCase(activity.status)}</Badge>
                        </div>
                        <p className="text-sm text-slate-700">{activity.description}</p>
                        <p className="text-sm text-slate-500">Activity date: {formatDateTime(activity.activityDate)}</p>
                        {activity.notes ? <p className="text-sm text-slate-500">Notes: {activity.notes}</p> : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:min-w-80">
                        <div>
                          <p className="text-sm text-slate-500">Scheduled</p>
                          <p className="font-medium text-slate-900">{formatDateTime(activity.scheduledDate)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-500">Completed</p>
                          <p className="font-medium text-slate-900">{formatDateTime(activity.completedDate)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-500">Estimated Cost</p>
                          <p className="font-medium text-slate-900">
                            {activity.estimatedCost !== null && activity.estimatedCost !== undefined
                              ? `$${formatNumber(activity.estimatedCost, 2)}`
                              : "Not available"}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-500">Actual Cost</p>
                          <p className="font-medium text-slate-900">
                            {activity.actualCost !== null && activity.actualCost !== undefined
                              ? `$${formatNumber(activity.actualCost, 2)}`
                              : "Not available"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No operational activity"
              description="No work orders were found for the selected farm, so the activity log is intentionally empty instead of showing sample fertilizer, irrigation, or harvest events."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
