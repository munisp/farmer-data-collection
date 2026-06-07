import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf, FlaskConical, MapPin, TrendingUp, AlertTriangle, CheckCircle, XCircle, Loader2, Sprout } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

interface LabReadings {
  ph: string;
  nitrogen_ppm: string;
  phosphorus_ppm: string;
  potassium_ppm: string;
  organic_matter_pct: string;
  cec_meq_100g: string;
  moisture_pct: string;
}

interface LocationData {
  latitude: string;
  longitude: string;
  elevation_m: string;
  annual_rainfall_mm: string;
  avg_temperature_c: string;
  ndvi: string;
}

interface Recommendation {
  action: string;
  description: string;
  confidence: number;
}

interface LabInterpretation {
  value: number;
  unit: string;
  status: string;
  optimal_range: string;
}

interface CropSuitability {
  crop: string;
  suitability: string;
  note?: string;
}

interface SoilResult {
  health_score: number;
  health_category: string;
  fertility_class: string;
  fertility_confidence: number;
  recommendations: Recommendation[];
  lab_interpretation: Record<string, LabInterpretation>;
  crop_suitability: CropSuitability[];
  inference_ms: number;
  modalities_used: {
    photo: boolean;
    lab_readings: boolean;
    location: boolean;
  };
}

const defaultLabReadings: LabReadings = {
  ph: "6.5",
  nitrogen_ppm: "50",
  phosphorus_ppm: "25",
  potassium_ppm: "150",
  organic_matter_pct: "3.0",
  cec_meq_100g: "18",
  moisture_pct: "30",
};

const defaultLocation: LocationData = {
  latitude: "",
  longitude: "",
  elevation_m: "",
  annual_rainfall_mm: "",
  avg_temperature_c: "",
  ndvi: "",
};

function getStatusColor(status: string): string {
  switch (status) {
    case "optimal": return "text-green-600";
    case "low": return "text-red-600";
    case "high": return "text-amber-600";
    default: return "text-muted-foreground";
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "optimal": return <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> Optimal</Badge>;
    case "low": return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Low</Badge>;
    case "high": return <Badge variant="secondary" className="bg-amber-100 text-amber-800"><AlertTriangle className="w-3 h-3 mr-1" /> High</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

function getHealthColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function getHealthBg(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function getSuitabilityColor(suitability: string): string {
  switch (suitability) {
    case "high": return "bg-green-100 text-green-800 border-green-200";
    case "moderate": return "bg-amber-100 text-amber-800 border-amber-200";
    case "low": return "bg-red-100 text-red-800 border-red-200";
    case "recommended": return "bg-blue-100 text-blue-800 border-blue-200";
    default: return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

const ML_SERVICE_URL = import.meta.env.VITE_ML_SERVICE_URL || "http://localhost:8096";

export default function SoilAnalysis() {
  const [labReadings, setLabReadings] = useState<LabReadings>(defaultLabReadings);
  const [locationData, setLocationData] = useState<LocationData>(defaultLocation);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [result, setResult] = useState<SoilResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLabChange = (field: keyof LabReadings, value: string) => {
    setLabReadings(prev => ({ ...prev, [field]: value }));
  };

  const handleLocationChange = (field: keyof LocationData, value: string) => {
    setLocationData(prev => ({ ...prev, [field]: value }));
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, number> = {
        ph: parseFloat(labReadings.ph),
        nitrogen_ppm: parseFloat(labReadings.nitrogen_ppm),
        phosphorus_ppm: parseFloat(labReadings.phosphorus_ppm),
        potassium_ppm: parseFloat(labReadings.potassium_ppm),
        organic_matter_pct: parseFloat(labReadings.organic_matter_pct),
        cec_meq_100g: parseFloat(labReadings.cec_meq_100g),
        moisture_pct: parseFloat(labReadings.moisture_pct),
      };

      if (includeLocation) {
        if (locationData.latitude) payload.latitude = parseFloat(locationData.latitude);
        if (locationData.longitude) payload.longitude = parseFloat(locationData.longitude);
        if (locationData.elevation_m) payload.elevation_m = parseFloat(locationData.elevation_m);
        if (locationData.annual_rainfall_mm) payload.annual_rainfall_mm = parseFloat(locationData.annual_rainfall_mm);
        if (locationData.avg_temperature_c) payload.avg_temperature_c = parseFloat(locationData.avg_temperature_c);
        if (locationData.ndvi) payload.ndvi = parseFloat(locationData.ndvi);
      }

      const response = await fetch(`${ML_SERVICE_URL}/predict/soil`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail?.[0]?.msg || "Analysis failed");
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze soil");
    } finally {
      setLoading(false);
    }
  };

  const handleGetGPS = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationData(prev => ({
            ...prev,
            latitude: pos.coords.latitude.toFixed(6),
            longitude: pos.coords.longitude.toFixed(6),
            elevation_m: pos.coords.altitude?.toFixed(0) || "",
          }));
          setIncludeLocation(true);
        },
        () => setError("Could not get GPS location")
      );
    }
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Leaf className="w-7 h-7 text-green-600" />
              Soil Analysis
            </h1>
            <p className="text-muted-foreground mt-1">
              AI-powered soil health assessment with actionable recommendations
            </p>
          </div>
        </div>

        <Tabs defaultValue="input">
          <TabsList>
            <TabsTrigger value="input">
              <FlaskConical className="w-4 h-4 mr-1" /> Input Readings
            </TabsTrigger>
            <TabsTrigger value="results" disabled={!result}>
              <TrendingUp className="w-4 h-4 mr-1" /> Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="input" className="space-y-4">
            {/* Lab Readings Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="w-5 h-5" />
                  Lab / Test Kit Readings
                </CardTitle>
                <CardDescription>
                  Enter values from your soil test kit or laboratory analysis.
                  Supports pH meters, N/P/K test kits, and CEC measurements.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="ph">pH (0-14)</Label>
                    <Input id="ph" type="number" step="0.1" min="0" max="14"
                      value={labReadings.ph}
                      onChange={(e) => handleLabChange("ph", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Optimal: 6.0–7.0</p>
                  </div>
                  <div>
                    <Label htmlFor="nitrogen">Nitrogen (ppm)</Label>
                    <Input id="nitrogen" type="number" step="1" min="0"
                      value={labReadings.nitrogen_ppm}
                      onChange={(e) => handleLabChange("nitrogen_ppm", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Optimal: 40–120 ppm</p>
                  </div>
                  <div>
                    <Label htmlFor="phosphorus">Phosphorus (ppm)</Label>
                    <Input id="phosphorus" type="number" step="1" min="0"
                      value={labReadings.phosphorus_ppm}
                      onChange={(e) => handleLabChange("phosphorus_ppm", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Optimal: 15–60 ppm</p>
                  </div>
                  <div>
                    <Label htmlFor="potassium">Potassium (ppm)</Label>
                    <Input id="potassium" type="number" step="1" min="0"
                      value={labReadings.potassium_ppm}
                      onChange={(e) => handleLabChange("potassium_ppm", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Optimal: 100–250 ppm</p>
                  </div>
                  <div>
                    <Label htmlFor="organic-matter">Organic Matter (%)</Label>
                    <Input id="organic-matter" type="number" step="0.1" min="0" max="100"
                      value={labReadings.organic_matter_pct}
                      onChange={(e) => handleLabChange("organic_matter_pct", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Optimal: 2.0–6.0%</p>
                  </div>
                  <div>
                    <Label htmlFor="cec">CEC (meq/100g)</Label>
                    <Input id="cec" type="number" step="0.1" min="0"
                      value={labReadings.cec_meq_100g}
                      onChange={(e) => handleLabChange("cec_meq_100g", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Optimal: 10–30 meq/100g</p>
                  </div>
                  <div>
                    <Label htmlFor="moisture">Moisture (%)</Label>
                    <Input id="moisture" type="number" step="1" min="0" max="100"
                      value={labReadings.moisture_pct}
                      onChange={(e) => handleLabChange("moisture_pct", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Optimal: 20–60%</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Location Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5" />
                      Location & Satellite Data
                    </CardTitle>
                    <CardDescription>
                      Optional — adds GPS, elevation, weather, and NDVI context for better predictions.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="include-location"
                      checked={includeLocation}
                      onChange={(e) => setIncludeLocation(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="include-location" className="text-sm">Include location</Label>
                  </div>
                </div>
              </CardHeader>
              {includeLocation && (
                <CardContent>
                  <div className="flex justify-end mb-3">
                    <Button variant="outline" size="sm" onClick={handleGetGPS}>
                      <MapPin className="w-4 h-4 mr-1" /> Auto-detect GPS
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="lat">Latitude</Label>
                      <Input id="lat" type="number" step="0.000001"
                        value={locationData.latitude}
                        onChange={(e) => handleLocationChange("latitude", e.target.value)}
                        placeholder="-1.290000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lon">Longitude</Label>
                      <Input id="lon" type="number" step="0.000001"
                        value={locationData.longitude}
                        onChange={(e) => handleLocationChange("longitude", e.target.value)}
                        placeholder="36.820000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="elev">Elevation (m)</Label>
                      <Input id="elev" type="number" step="1"
                        value={locationData.elevation_m}
                        onChange={(e) => handleLocationChange("elevation_m", e.target.value)}
                        placeholder="1795"
                      />
                    </div>
                    <div>
                      <Label htmlFor="rain">Annual Rainfall (mm)</Label>
                      <Input id="rain" type="number" step="1"
                        value={locationData.annual_rainfall_mm}
                        onChange={(e) => handleLocationChange("annual_rainfall_mm", e.target.value)}
                        placeholder="869"
                      />
                    </div>
                    <div>
                      <Label htmlFor="temp">Avg Temperature (°C)</Label>
                      <Input id="temp" type="number" step="0.1"
                        value={locationData.avg_temperature_c}
                        onChange={(e) => handleLocationChange("avg_temperature_c", e.target.value)}
                        placeholder="17.6"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ndvi">NDVI (0-1)</Label>
                      <Input id="ndvi" type="number" step="0.01" min="0" max="1"
                        value={locationData.ndvi}
                        onChange={(e) => handleLocationChange("ndvi", e.target.value)}
                        placeholder="0.55"
                      />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Analyze Button */}
            <div className="flex items-center gap-4">
              <Button onClick={handleAnalyze} disabled={loading} size="lg">
                {loading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                ) : (
                  <><Leaf className="w-4 h-4 mr-2" /> Analyze Soil</>
                )}
              </Button>
              {error && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {error}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="results" className="space-y-4">
            {result && (
              <>
                {/* Health Score Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <div className={`text-5xl font-bold ${getHealthColor(result.health_score)}`}>
                        {result.health_score.toFixed(1)}
                      </div>
                      <p className="text-lg font-medium mt-1 capitalize">{result.health_category}</p>
                      <div className="w-full bg-muted rounded-full h-3 mt-3">
                        <div
                          className={`h-3 rounded-full ${getHealthBg(result.health_score)}`}
                          style={{ width: `${result.health_score}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Health Score (0–100)</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6 text-center">
                      <div className="text-3xl font-bold capitalize">
                        {result.fertility_class.replace(/_/g, " ")}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Confidence: {(result.fertility_confidence * 100).toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">Fertility Classification</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6 text-center">
                      <div className="text-3xl font-bold">{result.inference_ms.toFixed(1)}ms</div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Modalities: {[
                          result.modalities_used.photo && "Photo",
                          result.modalities_used.lab_readings && "Lab",
                          result.modalities_used.location && "GPS",
                        ].filter(Boolean).join(" + ")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">Inference Time</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Lab Interpretation */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FlaskConical className="w-5 h-5" />
                      Lab Interpretation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {Object.entries(result.lab_interpretation).map(([key, interp]) => (
                        <div key={key} className="p-3 rounded-lg border bg-card">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium capitalize">
                              {key.replace(/_/g, " ").replace("ppm", "").replace("pct", "").replace("meq 100g", "")}
                            </span>
                            {getStatusBadge(interp.status)}
                          </div>
                          <div className={`text-lg font-bold ${getStatusColor(interp.status)}`}>
                            {interp.value} {interp.unit}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Optimal: {interp.optimal_range}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Recommendations */}
                {result.recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        Recommendations ({result.recommendations.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {result.recommendations.map((rec, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-amber-50/50">
                            <div className="min-w-[60px] text-center">
                              <div className="text-lg font-bold text-amber-600">
                                {(rec.confidence * 100).toFixed(0)}%
                              </div>
                              <p className="text-[10px] text-muted-foreground">confidence</p>
                            </div>
                            <div>
                              <p className="font-medium capitalize">{rec.action.replace(/_/g, " ")}</p>
                              <p className="text-sm text-muted-foreground">{rec.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {result.recommendations.length === 0 && (
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                      <p className="text-lg font-medium">Soil is in excellent condition</p>
                      <p className="text-sm text-muted-foreground">No corrective actions needed. Maintain current practices.</p>
                    </CardContent>
                  </Card>
                )}

                {/* Crop Suitability */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sprout className="w-5 h-5 text-green-600" />
                      Crop Suitability ({result.crop_suitability.length} crops)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {result.crop_suitability.map((crop) => (
                        <div
                          key={crop.crop}
                          className={`p-3 rounded-lg border text-center ${getSuitabilityColor(crop.suitability)}`}
                        >
                          <p className="font-medium capitalize">{crop.crop}</p>
                          <p className="text-xs capitalize">{crop.suitability}</p>
                          {crop.note && (
                            <p className="text-[10px] mt-1 opacity-75">{crop.note}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
