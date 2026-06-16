/**
 * H3 Hexagonal Grid Analysis
 *
 * Demand/supply heatmaps, distributor coverage optimization
 * using Uber's H3 geospatial indexing system.
 */
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Hexagon, MapPin, BarChart3, Target, Eye, TrendingUp } from "lucide-react";
import {
  binPointsToH3,
  h3GridToGeoJSON,
  zoomToH3Resolution,
  analyzeDistributorCoverage,
  h3ValueToColor,
  type H3GridResult,
} from "@/lib/geolibre/h3-grid";

type AnalysisMode = "density" | "coverage" | "demand";

export default function SpatialH3Analysis() {
  const [mode, setMode] = useState<AnalysisMode>("density");
  const [resolution, setResolution] = useState(5);
  const [analysisResult, setAnalysisResult] = useState<H3GridResult | null>(null);
  const [coverageResult, setCoverageResult] = useState<{
    coveragePercent: number;
    gapAreas: Array<{ center: [number, number]; demandCount: number }>;
  } | null>(null);

  const distributorsQuery = trpc.spatialAnalysis.getH3CoverageAnalysis.useQuery({ resolution });

  const handleAnalyze = () => {
    const distData = distributorsQuery.data?.distributors || [];
    if (distData.length === 0) return;

    const points = (distData as Array<Record<string, unknown>>).map((d, i) => ({
      lat: d.latitude as number,
      lng: d.longitude as number,
      id: (d.id as string) || String(i),
      value: (d.warehouse_capacity as number) || 1,
    }));

    const result = binPointsToH3(points, resolution);
    setAnalysisResult(result);

    if (mode === "coverage") {
      const distPoints = (distData as Array<Record<string, unknown>>).map((d, i) => ({
        lat: d.latitude as number,
        lng: d.longitude as number,
        id: (d.id as string) || String(i),
        coverageRadiusKm: 25,
      }));
      // Use distributor locations as both supply and demand points for demo
      const coverage = analyzeDistributorCoverage(distPoints, points, resolution);
      setCoverageResult({
        coveragePercent: coverage.coveragePercent,
        gapAreas: coverage.gapAreas,
      });
    }
  };

  const geojsonData = useMemo(() => {
    if (!analysisResult) return null;
    return h3GridToGeoJSON(analysisResult);
  }, [analysisResult]);

  return (
    <DashboardLayout>
      <div className="p-4 space-y-4 dark:bg-gray-900 min-h-screen">
        <div>
          <h1 className="text-xl font-semibold dark:text-white flex items-center gap-2">
            <Hexagon className="h-5 w-5 text-purple-600" />
            H3 Hexagonal Grid Analysis
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Spatial binning for demand/supply heatmaps and distributor coverage optimization
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Controls */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm dark:text-white">Analysis Mode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {([
                { id: "density" as const, label: "Distributor Density", icon: BarChart3, desc: "Count distributors per hexagonal cell" },
                { id: "coverage" as const, label: "Coverage Analysis", icon: Target, desc: "Show covered vs uncovered areas" },
                { id: "demand" as const, label: "Demand Mapping", icon: TrendingUp, desc: "Map demand hotspots from partnership data" },
              ]).map(m => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`w-full text-left p-3 rounded-lg text-sm transition-colors ${
                    mode === m.id
                      ? "bg-purple-50 border border-purple-200 dark:bg-purple-900 dark:border-purple-700"
                      : "bg-gray-50 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <m.icon className="h-4 w-4" />
                    <span className="font-medium dark:text-white">{m.label}</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{m.desc}</div>
                </button>
              ))}

              <div className="border-t pt-3 dark:border-gray-700">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  H3 Resolution (1=coarse, 10=fine)
                </label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={resolution}
                    onChange={e => setResolution(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono dark:text-white w-6 text-center">{resolution}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Res {resolution} ≈ {resolution <= 3 ? "country" : resolution <= 5 ? "regional" : resolution <= 7 ? "city" : "neighborhood"} scale
                </p>
              </div>

              <Button className="w-full gap-2" onClick={handleAnalyze} disabled={distributorsQuery.isLoading}>
                <Hexagon className="h-4 w-4" />
                Run Analysis
              </Button>
            </CardContent>
          </Card>

          {/* Results */}
          <Card className="lg:col-span-2 dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm dark:text-white flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Analysis Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!analysisResult ? (
                <div className="text-center py-12">
                  <Hexagon className="h-12 w-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Select a mode and click "Run Analysis" to generate H3 hexagonal grid results
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                    {distributorsQuery.data?.distributors
                      ? `${(distributorsQuery.data.distributors as unknown[]).length} distributors available`
                      : "Loading distributor data..."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Hex Cells</div>
                      <div className="text-lg font-semibold dark:text-white">{analysisResult.cells.length}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Total Features</div>
                      <div className="text-lg font-semibold dark:text-white">{analysisResult.totalFeatures}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Max per Cell</div>
                      <div className="text-lg font-semibold dark:text-white">{analysisResult.stats.maxCount}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                      <div className="text-xs text-gray-500 dark:text-gray-400">Avg per Cell</div>
                      <div className="text-lg font-semibold dark:text-white">{analysisResult.stats.meanCount.toFixed(1)}</div>
                    </div>
                  </div>

                  {/* Coverage Results */}
                  {coverageResult && (
                    <div className="bg-purple-50 dark:bg-purple-900 p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium dark:text-white">Coverage</span>
                        <Badge variant={coverageResult.coveragePercent > 70 ? "default" : "destructive"}>
                          {coverageResult.coveragePercent}%
                        </Badge>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3">
                        <div
                          className="bg-purple-600 h-2 rounded-full"
                          style={{ width: `${coverageResult.coveragePercent}%` }}
                        />
                      </div>
                      {coverageResult.gapAreas.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                            Top Gap Areas (need distributors)
                          </div>
                          {coverageResult.gapAreas.slice(0, 5).map((gap, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs mb-1">
                              <MapPin className="h-3 w-3 text-red-500" />
                              <span className="font-mono dark:text-gray-300">
                                {gap.center[0].toFixed(2)}, {gap.center[1].toFixed(2)}
                              </span>
                              <Badge variant="outline" className="text-xs">{gap.demandCount} demand</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cell Table */}
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white dark:bg-gray-800">
                        <tr className="border-b dark:border-gray-700">
                          <th className="text-left py-2 px-2 text-gray-600 dark:text-gray-400">H3 Index</th>
                          <th className="text-left py-2 px-2 text-gray-600 dark:text-gray-400">Center</th>
                          <th className="text-right py-2 px-2 text-gray-600 dark:text-gray-400">Count</th>
                          <th className="text-right py-2 px-2 text-gray-600 dark:text-gray-400">Value</th>
                          <th className="text-left py-2 px-2 text-gray-600 dark:text-gray-400">Density</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysisResult.cells.slice(0, 20).map(cell => (
                          <tr key={cell.h3Index} className="border-b dark:border-gray-700">
                            <td className="py-1.5 px-2 font-mono dark:text-gray-300 truncate max-w-[120px]">
                              {cell.h3Index}
                            </td>
                            <td className="py-1.5 px-2 dark:text-gray-300">
                              {cell.center[0].toFixed(2)}, {cell.center[1].toFixed(2)}
                            </td>
                            <td className="py-1.5 px-2 text-right dark:text-gray-300">{cell.count}</td>
                            <td className="py-1.5 px-2 text-right dark:text-gray-300">{cell.value.toFixed(0)}</td>
                            <td className="py-1.5 px-2">
                              <div
                                className="w-full h-3 rounded"
                                style={{
                                  backgroundColor: h3ValueToColor(
                                    cell.count,
                                    analysisResult.stats.minCount,
                                    analysisResult.stats.maxCount,
                                    "heat"
                                  ),
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* GeoJSON Export */}
                  {geojsonData && (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(geojsonData, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `h3-analysis-res${resolution}.geojson`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        Export GeoJSON
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
