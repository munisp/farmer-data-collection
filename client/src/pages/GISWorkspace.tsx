/**
 * GIS Workspace — Admin spatial analysis dashboard
 *
 * Embeds GeoLibre viewer + provides access to all spatial analysis tools:
 * Field Collection, Spectral Index, Vector Analysis, Raster Analysis,
 * H3 Grids, and Offline Tile Cache management.
 */
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Globe, Map, Layers, Ruler, Satellite, Database,
  Download, Grid3X3, Hexagon, PenTool, Compass, BarChart3,
  CloudOff, MapPin, Calculator, Maximize2,
} from "lucide-react";

type WorkspaceTab = "viewer" | "tools" | "collections" | "spectral" | "cache";

export default function GISWorkspace() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("viewer");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const workspaceConfig = trpc.spatialAnalysis.getGISWorkspaceConfig.useQuery();
  const fieldCollections = trpc.spatialAnalysis.getFieldCollections.useQuery();
  const spectralHistory = trpc.spatialAnalysis.getSpectralHistory.useQuery({ limit: 10 });

  const geolibreUrl = workspaceConfig.data?.geolibreEmbedUrl || "https://viewer.geolibre.app";

  const tabs = [
    { id: "viewer" as const, label: "Map Viewer", icon: Globe },
    { id: "tools" as const, label: "Analysis Tools", icon: Ruler },
    { id: "collections" as const, label: "Field Collections", icon: MapPin },
    { id: "spectral" as const, label: "Crop Health", icon: Satellite },
    { id: "cache" as const, label: "Offline Areas", icon: CloudOff },
  ];

  const analysisTools = [
    {
      name: "Vector Analysis",
      description: "Buffer, clip, dissolve, spatial join, Voronoi diagrams — all in-browser via Turf.js",
      icon: PenTool,
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      href: "/spatial-vector-analysis",
    },
    {
      name: "Raster Analysis",
      description: "Hillshade, slope, aspect, contours, zonal statistics from COG/GeoTIFF",
      icon: Layers,
      color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      href: "/spatial-raster-analysis",
    },
    {
      name: "H3 Hexagonal Grid",
      description: "Demand/supply heatmaps, distributor coverage optimization with H3 cells",
      icon: Hexagon,
      color: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
      href: "/spatial-h3-analysis",
    },
    {
      name: "Spectral Index Calculator",
      description: "NDVI, NDWI, EVI, SAVI — crop health from Sentinel-2 and Landsat imagery",
      icon: Satellite,
      color: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
      href: "/spatial-spectral-index",
    },
    {
      name: "Field Collection",
      description: "GPS capture of farm boundaries, crop observations, warehouse inspections",
      icon: MapPin,
      color: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
      href: "/spatial-field-collection",
    },
    {
      name: "DuckDB Spatial SQL",
      description: "In-browser spatial SQL queries on GeoJSON data — works offline",
      icon: Database,
      color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
      href: "/spatial-sql-workspace",
    },
    {
      name: "Offline Tile Cache",
      description: "Download basemap tiles for offline use in areas with poor connectivity",
      icon: Download,
      color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
      href: "/spatial-tile-cache",
    },
    {
      name: "Distance Matrix",
      description: "Calculate distances between farms and distributors for optimal matching",
      icon: Compass,
      color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
      href: "/spatial-distance-matrix",
    },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white dark:bg-gray-800 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Globe className="h-6 w-6 text-green-600 dark:text-green-400" />
            <div>
              <h1 className="text-lg font-semibold dark:text-white">GIS Workspace</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Spatial analysis powered by GeoLibre · MapLibre GL · PostGIS · Turf.js · H3
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Database className="h-3 w-3 mr-1" />
              {workspaceConfig.data?.enabledTools?.length || 0} tools
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b bg-gray-50 dark:bg-gray-800 dark:border-gray-700 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-green-500 text-green-700 bg-white dark:bg-gray-900 dark:text-green-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 dark:bg-gray-900">
          {activeTab === "viewer" && (
            <div className="space-y-4">
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardContent className="p-0">
                  <iframe
                    src={`${geolibreUrl}?maponly=true`}
                    className={`w-full border-0 rounded-lg ${isFullscreen ? "h-[80vh]" : "h-[500px]"}`}
                    title="GeoLibre Map Viewer"
                    allow="geolocation; fullscreen"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                </CardContent>
              </Card>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium dark:text-white">
                      <Map className="h-4 w-4 inline mr-2" />
                      Basemaps
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {(workspaceConfig.data?.basemaps || []).map(bm => (
                      <div key={bm.id} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-400" />
                        {bm.name}
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium dark:text-white">
                      <Layers className="h-4 w-4 inline mr-2" />
                      Data Layers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {(workspaceConfig.data?.layers || []).map(layer => (
                      <div key={layer.id} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-400" />
                        {layer.name}
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium dark:text-white">
                      <Grid3X3 className="h-4 w-4 inline mr-2" />
                      Quick Stats
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                    <div>Field Collections: {fieldCollections.data?.collections?.length || 0}</div>
                    <div>Spectral Analyses: {spectralHistory.data?.analyses?.length || 0}</div>
                    <div>Center: {workspaceConfig.data?.defaultCenter?.lat?.toFixed(2) || "—"}, {workspaceConfig.data?.defaultCenter?.lng?.toFixed(2) || "—"}</div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === "tools" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {analysisTools.map(tool => (
                <a key={tool.name} href={tool.href}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer dark:bg-gray-800 dark:border-gray-700 h-full">
                    <CardContent className="p-4">
                      <div className={`inline-flex p-2 rounded-lg mb-3 ${tool.color}`}>
                        <tool.icon className="h-5 w-5" />
                      </div>
                      <h3 className="font-medium text-sm dark:text-white">{tool.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tool.description}</p>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          )}

          {activeTab === "collections" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold dark:text-white">Field Collections</h2>
                <a href="/spatial-field-collection">
                  <Button size="sm" className="gap-2">
                    <MapPin className="h-4 w-4" />
                    New Collection
                  </Button>
                </a>
              </div>
              {fieldCollections.isLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading collections...</div>
              ) : (fieldCollections.data?.collections || []).length === 0 ? (
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardContent className="py-8 text-center">
                    <MapPin className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No field collections yet. Start collecting farm boundaries and crop observations.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(fieldCollections.data?.collections || []).map((col: Record<string, unknown>) => (
                    <Card key={col.id as string} className="dark:bg-gray-800 dark:border-gray-700">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium text-sm dark:text-white">{col.name as string}</h3>
                          <Badge variant="outline">{col.feature_count as number} features</Badge>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Synced: {new Date(col.synced_at as string).toLocaleDateString()}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "spectral" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold dark:text-white">Crop Health Analyses</h2>
                <a href="/spatial-spectral-index">
                  <Button size="sm" className="gap-2">
                    <Satellite className="h-4 w-4" />
                    New Analysis
                  </Button>
                </a>
              </div>
              {spectralHistory.isLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading analyses...</div>
              ) : (spectralHistory.data?.analyses || []).length === 0 ? (
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                  <CardContent className="py-8 text-center">
                    <Satellite className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No spectral analyses yet. Calculate NDVI, NDWI, EVI from satellite imagery.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(spectralHistory.data?.analyses || []).map((a: Record<string, unknown>, i: number) => (
                    <Card key={i} className="dark:bg-gray-800 dark:border-gray-700">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Badge>{a.index_type as string}</Badge>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(a.analysis_date as string).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div>
                            <div className="font-medium dark:text-white">{(a.mean_value as number)?.toFixed(3)}</div>
                            <div className="text-gray-500 dark:text-gray-400">Mean</div>
                          </div>
                          <div>
                            <div className="font-medium dark:text-white">{(a.min_value as number)?.toFixed(3)}</div>
                            <div className="text-gray-500 dark:text-gray-400">Min</div>
                          </div>
                          <div>
                            <div className="font-medium dark:text-white">{(a.max_value as number)?.toFixed(3)}</div>
                            <div className="text-gray-500 dark:text-gray-400">Max</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "cache" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold dark:text-white">Offline Tile Cache</h2>
                <a href="/spatial-tile-cache">
                  <Button size="sm" className="gap-2">
                    <Download className="h-4 w-4" />
                    Download Area
                  </Button>
                </a>
              </div>
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardContent className="py-8 text-center">
                  <CloudOff className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Pre-download map tiles for offline use in rural agricultural regions.
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Navigate to the Offline Tile Cache tool to download specific areas.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
