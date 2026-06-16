/**
 * Offline Tile Cache Manager
 *
 * Download basemap tiles for offline use in rural areas.
 * Pre-defined Nigerian agricultural regions available.
 */
import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  CloudOff, Download, Trash2, MapPin, HardDrive,
  Clock, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import {
  downloadOfflineArea,
  estimateTileCount,
  loadAllAreas,
  deleteOfflineArea,
  getCacheStats,
  NIGERIAN_FARM_REGIONS,
  type CachedArea,
  type DownloadProgress,
} from "@/lib/geolibre/tile-cache";

export default function SpatialTileCache() {
  const [cachedAreas, setCachedAreas] = useState<CachedArea[]>([]);
  const [cacheStats, setCacheStats] = useState<{
    totalAreas: number; totalTiles: number; totalSizeMB: number;
  } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [customName, setCustomName] = useState("");
  const [customBounds, setCustomBounds] = useState({ north: 10, south: 8, east: 9, west: 7 });
  const [zoomRange, setZoomRange] = useState({ min: 8, max: 14 });
  const [error, setError] = useState<string | null>(null);

  const registerMutation = trpc.spatialAnalysis.registerCachedArea.useMutation();

  useEffect(() => {
    loadAllAreas().then(setCachedAreas).catch(() => {});
    getCacheStats().then(setCacheStats).catch(() => {});
  }, []);

  const estimate = estimateTileCount(customBounds, zoomRange.min, zoomRange.max);

  const handleDownload = async (
    name: string,
    bounds: { north: number; south: number; east: number; west: number },
    minZoom: number,
    maxZoom: number
  ) => {
    setDownloading(true);
    setProgress(null);
    setError(null);

    try {
      const area = await downloadOfflineArea(name, bounds, minZoom, maxZoom, (p) => {
        setProgress(p);
      });

      // Register on server
      try {
        await registerMutation.mutateAsync({
          areaId: area.id,
          name: area.name,
          boundsNorth: bounds.north,
          boundsSouth: bounds.south,
          boundsEast: bounds.east,
          boundsWest: bounds.west,
          minZoom,
          maxZoom,
          tileCount: area.downloadedCount,
          sizeBytes: area.sizeBytes,
        });
      } catch {
        // Server registration is optional
      }

      const areas = await loadAllAreas();
      setCachedAreas(areas);
      const stats = await getCacheStats();
      setCacheStats(stats);
      setProgress(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async (areaId: string) => {
    await deleteOfflineArea(areaId);
    const areas = await loadAllAreas();
    setCachedAreas(areas);
    const stats = await getCacheStats();
    setCacheStats(stats);
  };

  return (
    <DashboardLayout>
      <div className="p-4 space-y-4 dark:bg-gray-900 min-h-screen">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold dark:text-white flex items-center gap-2">
              <CloudOff className="h-5 w-5 text-red-600" />
              Offline Tile Cache
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Pre-download map tiles for offline use in areas with poor connectivity
            </p>
          </div>
          {cacheStats && (
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1">
                <HardDrive className="h-3 w-3" />
                {cacheStats.totalSizeMB} MB cached
              </Badge>
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" />
                {cacheStats.totalAreas} areas
              </Badge>
            </div>
          )}
        </div>

        {/* Download Progress */}
        {downloading && progress && (
          <Card className="border-blue-200 dark:border-blue-800 dark:bg-gray-800">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="text-sm font-medium dark:text-white">Downloading tiles...</span>
                </div>
                <span className="text-sm dark:text-gray-300">{progress.percent}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>{progress.downloadedTiles} / {progress.totalTiles} tiles</span>
                <span>{(progress.bytesDownloaded / 1024 / 1024).toFixed(1)} MB</span>
                {progress.failedTiles > 0 && (
                  <span className="text-red-500">{progress.failedTiles} failed</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-red-200 dark:border-red-800 dark:bg-gray-800">
            <CardContent className="py-3">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pre-defined Regions */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm dark:text-white">
                <MapPin className="h-4 w-4 inline mr-1" />
                Nigerian Agricultural Regions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {NIGERIAN_FARM_REGIONS.map(region => {
                const est = estimateTileCount(region.bounds, region.defaultZoom.min, region.defaultZoom.max);
                return (
                  <div key={region.name} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div>
                      <div className="text-sm font-medium dark:text-white">{region.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ~{est.totalTiles} tiles · ~{est.estimatedSizeMB} MB
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={downloading}
                      onClick={() => handleDownload(
                        region.name,
                        region.bounds,
                        region.defaultZoom.min,
                        region.defaultZoom.max
                      )}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Custom Area */}
          <div className="space-y-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm dark:text-white">Custom Area</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Area Name</label>
                  <Input
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    placeholder="My Farm Region"
                    className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["north", "south", "east", "west"] as const).map(dir => (
                    <div key={dir}>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 capitalize">{dir}</label>
                      <Input
                        type="number"
                        step={0.1}
                        value={customBounds[dir]}
                        onChange={e => setCustomBounds(prev => ({ ...prev, [dir]: parseFloat(e.target.value) || 0 }))}
                        className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Min Zoom</label>
                    <Input
                      type="number"
                      min={1}
                      max={18}
                      value={zoomRange.min}
                      onChange={e => setZoomRange(prev => ({ ...prev, min: parseInt(e.target.value) || 1 }))}
                      className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Max Zoom</label>
                    <Input
                      type="number"
                      min={1}
                      max={18}
                      value={zoomRange.max}
                      onChange={e => setZoomRange(prev => ({ ...prev, max: parseInt(e.target.value) || 1 }))}
                      className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    />
                  </div>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                  Estimated: ~{estimate.totalTiles} tiles · ~{estimate.estimatedSizeMB} MB
                </div>
                <Button
                  className="w-full gap-2"
                  disabled={downloading || !customName}
                  onClick={() => handleDownload(customName, customBounds, zoomRange.min, zoomRange.max)}
                >
                  <Download className="h-4 w-4" />
                  Download Custom Area
                </Button>
              </CardContent>
            </Card>

            {/* Cached Areas */}
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm dark:text-white">Cached Areas</CardTitle>
              </CardHeader>
              <CardContent>
                {cachedAreas.length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                    No cached areas yet. Download a region above.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {cachedAreas.map(area => (
                      <div key={area.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div>
                          <div className="text-sm font-medium dark:text-white flex items-center gap-1">
                            {area.status === "complete" ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            ) : (
                              <Clock className="h-3 w-3 text-yellow-500" />
                            )}
                            {area.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {area.downloadedCount} tiles · {(area.sizeBytes / 1024 / 1024).toFixed(1)} MB
                            · Expires {new Date(area.expiresAt).toLocaleDateString()}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleDelete(area.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
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
