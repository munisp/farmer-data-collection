import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar,
  Download,
  Droplets,
  Info,
  Leaf,
  RefreshCw,
  Satellite,
  TrendingUp,
} from "lucide-react";

type PolygonBoundary = {
  type: "Polygon";
  coordinates: number[][][];
};

const isPolygonBoundary = (value: unknown): value is PolygonBoundary => {
  if (!value || typeof value !== "object") return false;
  const boundary = value as { type?: unknown; coordinates?: unknown };
  return boundary.type === "Polygon" && Array.isArray(boundary.coordinates);
};

const getHealthColor = (status: string) => {
  switch (status) {
    case "excellent":
      return "bg-green-100 text-green-800 border-green-300";
    case "good":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "moderate":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "poor":
    case "critical":
      return "bg-red-100 text-red-800 border-red-300";
    default:
      return "bg-slate-100 text-slate-700 border-slate-300";
  }
};

const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return "Not available";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="bg-white">
      <CardContent className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Info className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function SatelliteImagery() {
  const [selectedFieldId, setSelectedFieldId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [imageType, setImageType] = useState<"ndvi" | "ndmi" | "ndre" | "evi">("ndvi");

  const fieldsQuery = trpc.fieldOverview.getFields.useQuery();
  const serviceHealthQuery = trpc.satelliteImagery.getServiceHealth.useQuery(undefined, {
    staleTime: 30 * 1000,
  });

  const liveFields = useMemo(
    () => (fieldsQuery.data ?? []).filter((field) => isPolygonBoundary(field.boundary)),
    [fieldsQuery.data]
  );

  useEffect(() => {
    if (!selectedFieldId && liveFields.length > 0) {
      setSelectedFieldId(liveFields[0].id);
    }
  }, [liveFields, selectedFieldId]);

  const selectedField = useMemo(
    () => liveFields.find((field) => field.id === selectedFieldId) ?? liveFields[0] ?? null,
    [liveFields, selectedFieldId]
  );

  const availableDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - index * 5);
        return date.toISOString().split("T")[0];
      }),
    []
  );

  const startDate = useMemo(() => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 14);
    return date.toISOString().split("T")[0];
  }, [selectedDate]);

  const timeSeriesStartDate = useMemo(() => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 90);
    return date.toISOString().split("T")[0];
  }, [selectedDate]);

  const vegetationMetaQuery = trpc.fieldOverview.getVegetationSummary.useQuery(
    {
      farmId: selectedField?.farmId ?? 0,
      fieldBoundaryId: selectedField?.fieldBoundaryId ?? undefined,
    },
    { enabled: !!selectedField }
  );

  const imageryQuery = trpc.satelliteImagery.getVegetationIndices.useQuery(
    {
      fieldId: selectedField?.farmId ?? 0,
      boundary: selectedField?.boundary as PolygonBoundary,
      startDate,
      endDate: selectedDate,
      indices: ["NDVI", "NDMI", "NDRE", "EVI"],
      maxCloudCover: 30,
      cropType: selectedField?.cropType || undefined,
    },
    {
      enabled: !!selectedField,
      staleTime: 5 * 60 * 1000,
    }
  );

  const timeSeriesQuery = trpc.satelliteImagery.getTimeSeries.useQuery(
    {
      fieldId: selectedField?.farmId ?? 0,
      boundary: selectedField?.boundary as PolygonBoundary,
      startDate: timeSeriesStartDate,
      endDate: selectedDate,
      index: imageType.toUpperCase() as "NDVI" | "NDMI" | "NDRE" | "EVI",
      intervalDays: 7,
    },
    {
      enabled: !!selectedField,
      staleTime: 5 * 60 * 1000,
    }
  );

  const waterStressQuery = trpc.satelliteImagery.getWaterStressAssessment.useQuery(
    {
      fieldId: selectedField?.farmId ?? 0,
      boundary: selectedField?.boundary as PolygonBoundary,
      date: selectedDate,
    },
    { enabled: !!selectedField }
  );

  const nitrogenQuery = trpc.satelliteImagery.getNitrogenAssessment.useQuery(
    {
      fieldId: selectedField?.farmId ?? 0,
      boundary: selectedField?.boundary as PolygonBoundary,
      cropType: selectedField?.cropType || "unknown",
      date: selectedDate,
    },
    { enabled: !!selectedField }
  );

  const healthStatus = imageryQuery.data?.health_assessment?.status || "unknown";
  const indices = imageryQuery.data?.indices;
  const recommendations = [
    imageryQuery.data?.health_assessment?.recommendation,
    waterStressQuery.data?.irrigationRecommendation,
    nitrogenQuery.data?.fertilizerRecommendation,
  ].filter((value): value is string => Boolean(value));

  if (fieldsQuery.isLoading) {
    return (
      <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-br from-blue-50 via-green-50 to-emerald-50">
        <main className="container mx-auto px-4 py-8">
          <p className="text-slate-600">Loading live field geometry for satellite analysis.</p>
        </main>
      </div>
    );
  }

  if (liveFields.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-green-50 to-emerald-50">
        <main className="container mx-auto px-4 py-8">
          <EmptyState
            title="No mapped fields available"
            description="Satellite imagery requires a persisted polygon boundary. No live field boundaries were found for the current user, and the page no longer falls back to sample geometry."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-green-50 to-emerald-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Satellite Imagery</h1>
                <p className="text-sm text-gray-600">Live vegetation analysis for your persisted field boundaries</p>
              </div>
              {serviceHealthQuery.data ? (
                <Badge variant="outline" className={getHealthColor(serviceHealthQuery.data.status)}>
                  {serviceHealthQuery.data.status === "healthy" ? "Live Satellite Service" : serviceHealthQuery.data.status}
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300">
                  <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                  Checking service...
                </Badge>
              )}
            </div>
            <Link href="/precision-agriculture">
              <a className="text-sm text-blue-600 hover:text-blue-800">← Back</a>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-6 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Satellite className="h-5 w-5 text-blue-600" />
              Image Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Select Field</label>
                <Select value={selectedField?.id || ""} onValueChange={setSelectedFieldId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a field" />
                  </SelectTrigger>
                  <SelectContent>
                    {liveFields.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.name} ({field.areaHectares.toFixed(1)} ha)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Image Date</label>
                <Select value={selectedDate} onValueChange={setSelectedDate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDates.map((date) => (
                      <SelectItem key={date} value={date}>
                        {formatDate(date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Index</label>
                <Select value={imageType} onValueChange={(value) => setImageType(value as "ndvi" | "ndmi" | "ndre" | "evi")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ndvi">NDVI</SelectItem>
                    <SelectItem value="ndmi">NDMI</SelectItem>
                    <SelectItem value="ndre">NDRE</SelectItem>
                    <SelectItem value="evi">EVI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button variant="outline" onClick={() => imageryQuery.refetch()} className="w-full" disabled={imageryQuery.isLoading}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${imageryQuery.isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-white">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Latest Satellite Asset</CardTitle>
                    <CardDescription>
                      {vegetationMetaQuery.data?.latestImage
                        ? `${formatDate(vegetationMetaQuery.data.latestImage.imageDate)} · ${vegetationMetaQuery.data.latestImage.satelliteSource}`
                        : `No persisted image asset available for ${selectedField?.name}`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {vegetationMetaQuery.data?.latestImage?.imageUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={vegetationMetaQuery.data.latestImage.imageUrl} target="_blank" rel="noreferrer">
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {vegetationMetaQuery.data?.latestImage?.thumbnailUrl || vegetationMetaQuery.data?.latestImage?.imageUrl ? (
                  <div className="overflow-hidden rounded-lg border bg-slate-50">
                    <img
                      src={vegetationMetaQuery.data.latestImage.thumbnailUrl || vegetationMetaQuery.data.latestImage.imageUrl}
                      alt={`${imageType.toUpperCase()} imagery for ${selectedField?.name}`}
                      className="aspect-video w-full object-cover"
                    />
                  </div>
                ) : (
                  <EmptyState
                    title="No persisted image preview"
                    description="The backend returned vegetation statistics for this field, but there is no stored thumbnail or image asset to render for the selected period."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                  {imageType.toUpperCase()} Time Series
                </CardTitle>
                <CardDescription>Three-month live trend from the satellite service.</CardDescription>
              </CardHeader>
              <CardContent>
                {timeSeriesQuery.data?.time_series && timeSeriesQuery.data.time_series.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div>
                        <p className="text-xs text-slate-500">Mean</p>
                        <p className="text-sm font-semibold text-emerald-700">{timeSeriesQuery.data.statistics.mean?.toFixed(3) || "---"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Std Dev</p>
                        <p className="text-sm font-semibold text-orange-700">{timeSeriesQuery.data.statistics.std?.toFixed(3) || "---"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Trend</p>
                        <p className="text-sm font-semibold text-slate-900">{timeSeriesQuery.data.statistics.trend_direction}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Valid Points</p>
                        <p className="text-sm font-semibold text-slate-900">{timeSeriesQuery.data.valid_points}</p>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      {timeSeriesQuery.data.time_series.slice(-10).map((point) => (
                        <div key={`${point.date}-${point.value}`} className="flex items-center justify-between rounded border p-3 text-sm">
                          <span>{formatDate(point.date)}</span>
                          <span className="font-semibold">{point.value.toFixed(3)}</span>
                          <span className="text-slate-500">{point.quality}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No time series available"
                    description="The satellite service did not return a live time series for the selected field and index."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-lg">Vegetation Indices</CardTitle>
                <CardDescription>Current live field statistics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-1">
                      <Leaf className="h-4 w-4 text-green-600" />
                      NDVI
                    </span>
                    <Badge variant="outline" className={getHealthColor(healthStatus)}>{healthStatus}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">Mean {indices?.NDVI?.mean?.toFixed(3) || "---"}</p>
                  <p className="text-sm text-slate-600">Range {indices?.NDVI?.min?.toFixed(2) || "---"} – {indices?.NDVI?.max?.toFixed(2) || "---"}</p>
                </div>

                <div className="border-t pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-1">
                      <Droplets className="h-4 w-4 text-blue-600" />
                      NDMI
                    </span>
                    {waterStressQuery.data ? <Badge variant="outline">{waterStressQuery.data.waterStressLevel} stress</Badge> : null}
                  </div>
                  <p className="text-sm text-slate-600">Mean {indices?.NDMI?.mean?.toFixed(3) || waterStressQuery.data?.ndmi?.toFixed(3) || "---"}</p>
                  <p className="text-sm text-slate-600">Recommendation {waterStressQuery.data?.irrigationRecommendation || "Not available"}</p>
                </div>

                <div className="border-t pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">NDRE</span>
                    {nitrogenQuery.data ? <Badge variant="outline">{nitrogenQuery.data.nitrogenStatus}</Badge> : null}
                  </div>
                  <p className="text-sm text-slate-600">Mean {indices?.NDRE?.mean?.toFixed(3) || nitrogenQuery.data?.ndre?.toFixed(3) || "---"}</p>
                  <p className="text-sm text-slate-600">Fertilizer guidance {nitrogenQuery.data?.fertilizerRecommendation || "Not available"}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-lg">Recommendations</CardTitle>
                <CardDescription>Live guidance derived from satellite analyses</CardDescription>
              </CardHeader>
              <CardContent>
                {recommendations.length > 0 ? (
                  <ul className="space-y-3 text-sm text-slate-700">
                    {recommendations.map((recommendation, index) => (
                      <li key={`${index}-${recommendation}`} className="rounded border p-3">{recommendation}</li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="No recommendations yet"
                    description="No live recommendation payload was returned for the current imagery window."
                  />
                )}
              </CardContent>
            </Card>

            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" size="sm" asChild>
                  <Link href="/field-overview"><a><Calendar className="mr-2 h-4 w-4" />Open Field Overview</a></Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm" asChild>
                  <a href={vegetationMetaQuery.data?.latestImage?.imageUrl || "#"} target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" />Download Latest Asset
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
