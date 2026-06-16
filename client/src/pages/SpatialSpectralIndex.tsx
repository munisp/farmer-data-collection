/**
 * Spectral Index Calculator
 *
 * NDVI, NDWI, EVI, SAVI crop health from Sentinel-2/Landsat imagery.
 * All processing runs client-side via GeoTIFF.js.
 */
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Satellite, BarChart3, Leaf, Droplets, Sun, TreePine, AlertCircle, Download } from "lucide-react";
import {
  BAND_LAYOUTS,
  classifyNDVI,
  summarizeSpectralResult,
  type SpectralIndex,
  type SpectralResult,
} from "@/lib/geolibre/spectral-index";

const INDICES: Array<{ id: SpectralIndex; name: string; description: string; icon: typeof Leaf }> = [
  { id: "NDVI", name: "NDVI", description: "Normalized Difference Vegetation Index — overall crop health", icon: Leaf },
  { id: "NDWI", name: "NDWI", description: "Normalized Difference Water Index — moisture/water content", icon: Droplets },
  { id: "EVI", name: "EVI", description: "Enhanced Vegetation Index — corrects for atmospheric/soil effects", icon: TreePine },
  { id: "SAVI", name: "SAVI", description: "Soil Adjusted Vegetation Index — sparse vegetation areas", icon: Sun },
  { id: "GNDVI", name: "GNDVI", description: "Green NDVI — chlorophyll content estimation", icon: Leaf },
  { id: "NDMI", name: "NDMI", description: "Normalized Difference Moisture Index — canopy water stress", icon: Droplets },
  { id: "NBR", name: "NBR", description: "Normalized Burn Ratio — fire damage assessment", icon: AlertCircle },
  { id: "NDBI", name: "NDBI", description: "Normalized Difference Built-up Index — urban/built areas", icon: BarChart3 },
];

const HEALTH_COLORS: Record<string, string> = {
  "Water/Cloud": "bg-blue-500",
  "Bare Soil": "bg-amber-700",
  "Sparse Vegetation": "bg-orange-500",
  "Moderate": "bg-yellow-500",
  "Healthy": "bg-lime-500",
  "Very Healthy": "bg-green-500",
  "Peak Health": "bg-green-800",
};

export default function SpatialSpectralIndex() {
  const [selectedIndex, setSelectedIndex] = useState<SpectralIndex>("NDVI");
  const [selectedLayout, setSelectedLayout] = useState("sentinel2");
  const [cogUrl, setCogUrl] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof summarizeSpectralResult> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveMutation = trpc.spatialAnalysis.saveSpectralAnalysis.useMutation();
  const history = trpc.spatialAnalysis.getSpectralHistory.useQuery({ indexType: selectedIndex, limit: 10 });

  const handleCalculate = async () => {
    if (!cogUrl) {
      setError("Please enter a COG/GeoTIFF URL");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      // Dynamic import to avoid loading GeoTIFF unless needed
      const { calculateIndexFromCOG } = await import("@/lib/geolibre/spectral-index");
      const layout = BAND_LAYOUTS[selectedLayout];
      const spectralResult = await calculateIndexFromCOG(cogUrl, selectedIndex, layout);
      const summary = summarizeSpectralResult(spectralResult);
      setResult(summary);

      // Save to server
      await saveMutation.mutateAsync({
        indexType: selectedIndex,
        mean: summary.mean,
        min: summary.min,
        max: summary.max,
        stdDev: summary.stdDev,
        healthDistribution: summary.healthDistribution,
        sourceUrl: cogUrl,
        analysisDate: new Date().toISOString().split("T")[0],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to process raster");
    } finally {
      setIsProcessing(false);
    }
  };

  // Example: show NDVI classification guide
  const ndviClasses = [0, 0.1, 0.2, 0.4, 0.6, 0.8].map(v => classifyNDVI(v));

  return (
    <DashboardLayout>
      <div className="p-4 space-y-4 dark:bg-gray-900 min-h-screen">
        <div>
          <h1 className="text-xl font-semibold dark:text-white flex items-center gap-2">
            <Satellite className="h-5 w-5 text-orange-600" />
            Spectral Index Calculator
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Calculate crop health indices from satellite imagery — processes entirely in your browser
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Index Selection */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm dark:text-white">Select Index</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {INDICES.map(idx => (
                <button
                  key={idx.id}
                  onClick={() => setSelectedIndex(idx.id)}
                  className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                    selectedIndex === idx.id
                      ? "bg-orange-50 border border-orange-200 dark:bg-orange-900 dark:border-orange-700"
                      : "bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <idx.icon className="h-3.5 w-3.5" />
                    <span className="font-medium dark:text-white">{idx.name}</span>
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 mt-0.5">{idx.description}</div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Input & Processing */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm dark:text-white">Raster Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Satellite Platform</label>
                <select
                  value={selectedLayout}
                  onChange={e => setSelectedLayout(e.target.value)}
                  className="w-full mt-1 border rounded px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  {Object.entries(BAND_LAYOUTS).map(([key, layout]) => (
                    <option key={key} value={key}>{layout.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">COG/GeoTIFF URL</label>
                <Input
                  value={cogUrl}
                  onChange={e => setCogUrl(e.target.value)}
                  placeholder="https://example.com/sentinel2.tif"
                  className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Cloud-Optimized GeoTIFF from Sentinel Hub, Planetary Computer, or other sources
                </p>
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleCalculate}
                disabled={isProcessing || !cogUrl}
              >
                {isProcessing ? (
                  <>Processing...</>
                ) : (
                  <>
                    <BarChart3 className="h-4 w-4" />
                    Calculate {selectedIndex}
                  </>
                )}
              </Button>

              {error && (
                <div className="text-xs p-2 rounded bg-red-50 text-red-700 dark:bg-red-900 dark:text-red-300">
                  <AlertCircle className="h-3 w-3 inline mr-1" />
                  {error}
                </div>
              )}

              {result && (
                <div className="border-t pt-3 space-y-3 dark:border-gray-700">
                  <div className="text-sm font-medium dark:text-white">{result.index} Results</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded">
                      <div className="text-gray-500 dark:text-gray-400">Mean</div>
                      <div className="font-mono font-medium dark:text-white">{result.mean.toFixed(4)}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded">
                      <div className="text-gray-500 dark:text-gray-400">Std Dev</div>
                      <div className="font-mono font-medium dark:text-white">{result.stdDev.toFixed(4)}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded">
                      <div className="text-gray-500 dark:text-gray-400">Min</div>
                      <div className="font-mono font-medium dark:text-white">{result.min.toFixed(4)}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded">
                      <div className="text-gray-500 dark:text-gray-400">Max</div>
                      <div className="font-mono font-medium dark:text-white">{result.max.toFixed(4)}</div>
                    </div>
                  </div>

                  {/* Health Distribution */}
                  {Object.keys(result.healthDistribution).length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Health Distribution</div>
                      {Object.entries(result.healthDistribution).map(([label, pct]) => (
                        <div key={label} className="flex items-center gap-2 mb-1">
                          <div className={`w-3 h-3 rounded ${HEALTH_COLORS[label] || "bg-gray-400"}`} />
                          <span className="text-xs dark:text-gray-300 flex-1">{label}</span>
                          <span className="text-xs font-mono dark:text-gray-300">{pct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* NDVI Guide & History */}
          <div className="space-y-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm dark:text-white">NDVI Classification Guide</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {ndviClasses.map(cls => (
                  <div key={cls.label} className="flex items-center gap-2 text-xs">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: cls.color }} />
                    <span className="font-medium dark:text-white w-32">{cls.label}</span>
                    <span className="text-gray-500 dark:text-gray-400 flex-1">{cls.description}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm dark:text-white">Analysis History</CardTitle>
              </CardHeader>
              <CardContent>
                {(history.data?.analyses || []).length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">No analyses yet</p>
                ) : (
                  <div className="space-y-2">
                    {(history.data?.analyses || []).map((a: Record<string, unknown>, i: number) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <Badge variant="outline">{a.index_type as string}</Badge>
                        <span className="font-mono dark:text-gray-300">μ={((a.mean_value as number) || 0).toFixed(3)}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {new Date(a.analysis_date as string).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
