import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MapView, type MarkerOptions, type MapStyle } from "@/components/Map";
import { trpc } from "@/lib/trpc";
import { MapPin, Search, Filter, Layers, Warehouse, Activity, Circle, Crosshair } from "lucide-react";

type ViewMode = "markers" | "heatmap" | "clusters" | "coverage";

export default function DistributorMap() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mapStyle, setMapStyle] = useState<MapStyle>("osm");
  const [viewMode, setViewMode] = useState<ViewMode>("markers");

  const distributors = trpc.distributorNetwork.listDistributors.useQuery({});

  // PostGIS spatial queries
  const heatmapData = trpc.distributorNetwork.getHeatmap.useQuery(
    { gridSizeDegrees: 0.25, metric: "count" },
    { enabled: viewMode === "heatmap" }
  );
  const clusterData = trpc.distributorNetwork.getClusters.useQuery(
    { minClusterSize: 2, maxDistanceKm: 30 },
    { enabled: viewMode === "clusters" }
  );
  const coverageData = trpc.distributorNetwork.getCoverageAnalysis.useQuery(
    { includeGaps: true },
    { enabled: viewMode === "coverage" }
  );

  const filteredDistributors = useMemo(() => {
    if (!distributors.data) return [];
    return distributors.data.filter(d => {
      const matchesSearch = searchQuery === "" ||
        d.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.warehouseAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (d.coverageRegions as string[] | null)?.some(r => r.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [distributors.data, searchQuery, statusFilter]);

  // Standard distributor markers
  const distributorMarkers: MarkerOptions[] = useMemo(() => {
    return filteredDistributors
      .filter(d => d.latitude && d.longitude)
      .map(d => {
        const color = d.status === "approved" ? "#22c55e" :
                     d.status === "pending" ? "#eab308" :
                     d.status === "suspended" ? "#ef4444" : "#3b82f6";

        return {
          position: {
            lat: Number(d.latitude),
            lng: Number(d.longitude),
          },
          color,
          title: d.businessName,
          popup: `
            <div style="min-width: 220px; font-family: system-ui, sans-serif; padding: 4px;">
              <h3 style="margin: 0 0 8px; font-size: 15px; font-weight: 700;">${d.businessName}</h3>
              <p style="margin: 0 0 6px; font-size: 12px; color: #555;">${d.warehouseAddress}</p>
              <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                <span style="background: ${color}20; color: ${color}; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500;">${d.status}</span>
                ${d.averageRating ? `<span style="font-size: 11px;">★ ${Number(d.averageRating).toFixed(1)}</span>` : ""}
              </div>
              <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
                <tr><td style="padding: 2px 0; color: #888;">Contact</td><td style="padding: 2px 0;">${d.contactPerson}</td></tr>
                <tr><td style="padding: 2px 0; color: #888;">Phone</td><td style="padding: 2px 0;">${d.phoneNumber}</td></tr>
                ${d.warehouseCapacityKg ? `<tr><td style="padding: 2px 0; color: #888;">Capacity</td><td style="padding: 2px 0;">${Number(d.warehouseCapacityKg).toLocaleString()} kg</td></tr>` : ""}
                ${d.totalSalesCount ? `<tr><td style="padding: 2px 0; color: #888;">Sales</td><td style="padding: 2px 0;">${d.totalSalesCount}</td></tr>` : ""}
              </table>
              ${(d.coverageRegions as string[] | null)?.length ? `
                <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee;">
                  <span style="font-size: 10px; color: #888;">Coverage: </span>
                  ${(d.coverageRegions as string[]).map(r => `<span style="background: #f0f0f0; padding: 1px 6px; border-radius: 8px; font-size: 10px; margin-right: 4px;">${r}</span>`).join("")}
                </div>
              ` : ""}
            </div>
          `,
        };
      });
  }, [filteredDistributors]);

  // Heatmap markers (PostGIS ST_SnapToGrid density)
  const heatmapMarkers: MarkerOptions[] = useMemo(() => {
    if (!heatmapData.data?.features) return [];
    return heatmapData.data.features.map((f: any) => {
      const intensity = f.properties.intensity;
      const color = intensity > 0.7 ? "#dc2626" : intensity > 0.4 ? "#f97316" : "#fbbf24";
      return {
        position: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
        color,
        title: `Density: ${f.properties.count} distributors`,
        popup: `
          <div style="font-family: system-ui; padding: 4px;">
            <h4 style="margin: 0 0 4px; font-size: 13px;">Grid Cell (PostGIS)</h4>
            <p style="margin: 0; font-size: 12px;"><strong>Distributors:</strong> ${f.properties.count}</p>
            <p style="margin: 0; font-size: 12px;"><strong>Intensity:</strong> ${(intensity * 100).toFixed(0)}%</p>
            <p style="margin: 4px 0 0; font-size: 10px; color: #888;">Via ST_SnapToGrid(location, 0.25°)</p>
          </div>
        `,
      };
    });
  }, [heatmapData.data]);

  // Cluster markers (PostGIS ST_ClusterDBSCAN)
  const clusterMarkers: MarkerOptions[] = useMemo(() => {
    if (!clusterData.data) return [];
    const clusterColors = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899"];
    const result: MarkerOptions[] = [];

    for (const cluster of clusterData.data.clusters) {
      const color = clusterColors[cluster.id % clusterColors.length];
      // Centroid marker
      result.push({
        position: { lat: cluster.centroid.lat, lng: cluster.centroid.lng },
        color,
        title: `Cluster #${cluster.id} (${cluster.members.length} distributors)`,
        popup: `
          <div style="font-family: system-ui; padding: 4px;">
            <h4 style="margin: 0 0 6px; font-size: 14px; font-weight: 700;">Cluster #${cluster.id}</h4>
            <p style="margin: 0 0 2px; font-size: 12px;"><strong>Members:</strong> ${cluster.members.length}</p>
            <p style="margin: 0 0 2px; font-size: 12px;"><strong>Total capacity:</strong> ${cluster.totalCapacityKg.toLocaleString()} kg</p>
            <p style="margin: 0 0 2px; font-size: 12px;"><strong>Total sales:</strong> ${cluster.totalSales}</p>
            <p style="margin: 4px 0 0; font-size: 10px; color: #888;">Via PostGIS ST_ClusterDBSCAN</p>
          </div>
        `,
      });
    }

    // Noise points (not in any cluster)
    for (const n of clusterData.data.noise) {
      result.push({
        position: { lat: n.lat, lng: n.lng },
        color: "#6b7280",
        title: `${n.businessName} (unclustered)`,
        popup: `<div style="font-family: system-ui;"><p style="margin: 0; font-size: 12px;">${n.businessName}<br/><span style="color: #888;">Not part of any cluster</span></p></div>`,
      });
    }

    return result;
  }, [clusterData.data]);

  // Choose markers based on view mode
  const markers: MarkerOptions[] = useMemo(() => {
    switch (viewMode) {
      case "heatmap": return heatmapMarkers;
      case "clusters": return clusterMarkers;
      case "coverage": return distributorMarkers; // Show markers + coverage info panel
      default: return distributorMarkers;
    }
  }, [viewMode, distributorMarkers, heatmapMarkers, clusterMarkers]);

  const center = useMemo(() => {
    const withCoords = filteredDistributors.filter(d => d.latitude && d.longitude);
    if (withCoords.length === 0) return { lat: 9.082, lng: 8.6753 };
    const avgLat = withCoords.reduce((sum, d) => sum + Number(d.latitude), 0) / withCoords.length;
    const avgLng = withCoords.reduce((sum, d) => sum + Number(d.longitude), 0) / withCoords.length;
    return { lat: avgLat, lng: avgLng };
  }, [filteredDistributors]);

  const stats = useMemo(() => {
    const all = distributors.data || [];
    return {
      total: all.length,
      approved: all.filter(d => d.status === "approved").length,
      pending: all.filter(d => d.status === "pending").length,
      suspended: all.filter(d => d.status === "suspended").length,
      withCoords: all.filter(d => d.latitude && d.longitude).length,
    };
  }, [distributors.data]);

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold dark:text-white">Distributor Map</h1>
            <p className="text-muted-foreground dark:text-gray-400">
              Geospatial view of all distributor warehouse locations
            </p>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, address, or region..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 dark:bg-gray-800 dark:border-gray-600"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("all")}
            >
              All ({stats.total})
            </Button>
            <Button
              variant={statusFilter === "approved" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("approved")}
              className="gap-1"
            >
              <div className="h-2 w-2 rounded-full bg-green-500" />
              Approved ({stats.approved})
            </Button>
            <Button
              variant={statusFilter === "pending" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("pending")}
              className="gap-1"
            >
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              Pending ({stats.pending})
            </Button>
            <Button
              variant={statusFilter === "suspended" ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter("suspended")}
              className="gap-1"
            >
              <div className="h-2 w-2 rounded-full bg-red-500" />
              Suspended ({stats.suspended})
            </Button>
          </div>
          <div className="flex gap-1">
            <Button
              variant={mapStyle === "osm" ? "default" : "outline"}
              size="sm"
              onClick={() => setMapStyle("osm")}
            >
              Street
            </Button>
            <Button
              variant={mapStyle === "satellite" ? "default" : "outline"}
              size="sm"
              onClick={() => setMapStyle("satellite")}
            >
              Satellite
            </Button>
            <Button
              variant={mapStyle === "terrain" ? "default" : "outline"}
              size="sm"
              onClick={() => setMapStyle("terrain")}
            >
              Terrain
            </Button>
          </div>
        </div>

        {/* View Mode: Markers / Heatmap / Clusters / Coverage (PostGIS + Sedona) */}
        <div className="flex gap-2 flex-wrap">
          <Button variant={viewMode === "markers" ? "default" : "outline"} size="sm" onClick={() => setViewMode("markers")} className="gap-1">
            <MapPin className="h-3.5 w-3.5" /> Markers
          </Button>
          <Button variant={viewMode === "heatmap" ? "default" : "outline"} size="sm" onClick={() => setViewMode("heatmap")} className="gap-1">
            <Activity className="h-3.5 w-3.5" /> Heatmap (PostGIS)
          </Button>
          <Button variant={viewMode === "clusters" ? "default" : "outline"} size="sm" onClick={() => setViewMode("clusters")} className="gap-1">
            <Circle className="h-3.5 w-3.5" /> Clusters (ST_ClusterDBSCAN)
          </Button>
          <Button variant={viewMode === "coverage" ? "default" : "outline"} size="sm" onClick={() => setViewMode("coverage")} className="gap-1">
            <Crosshair className="h-3.5 w-3.5" /> Coverage Analysis
          </Button>
        </div>

        {/* Map */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="p-0 overflow-hidden rounded-lg">
            {markers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground dark:text-gray-400">
                <Warehouse className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">
                  {distributors.data?.length === 0
                    ? "No distributors registered yet"
                    : filteredDistributors.length === 0
                    ? "No distributors match your filters"
                    : "No location data available"
                  }
                </p>
                <p className="text-sm mt-1">
                  {distributors.data?.length === 0
                    ? "Distributors will appear here once they register."
                    : "Try adjusting your search or filter criteria."
                  }
                </p>
              </div>
            ) : (
              <MapView
                className="h-[600px] w-full"
                initialCenter={center}
                initialZoom={filteredDistributors.length === 1 ? 12 : 6}
                mapStyle={mapStyle}
                markers={markers}
                showControls={true}
                showScale={true}
                showFullscreen={true}
                showGeolocate={true}
              />
            )}
          </CardContent>
        </Card>

        {/* Coverage Analysis Panel (PostGIS spatial analysis) */}
        {viewMode === "coverage" && coverageData.data && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white text-base">PostGIS Coverage Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <p className="text-xl font-bold dark:text-white">{coverageData.data.statistics.totalDistributors}</p>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Total Distributors</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <p className="text-xl font-bold text-green-600">{coverageData.data.statistics.uniqueCoverageKm2.toLocaleString()} km²</p>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Unique Coverage</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <p className="text-xl font-bold text-orange-500">{coverageData.data.statistics.overlapKm2.toLocaleString()} km²</p>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Overlap Area</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <p className="text-xl font-bold text-red-500">{coverageData.data.gaps?.areaKm2?.toLocaleString() || "0"} km²</p>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Uncovered Gaps</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground dark:text-gray-400 mt-3">
                Powered by PostGIS ST_Union, ST_Intersection, ST_Difference spatial operations.
                Coverage radius: 25km per distributor warehouse. Apache Sedona used for batch optimization.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Cluster Stats Panel */}
        {viewMode === "clusters" && clusterData.data && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white text-base">Spatial Clustering (PostGIS ST_ClusterDBSCAN)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <p className="text-xl font-bold text-blue-500">{clusterData.data.statistics.clusterCount}</p>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Clusters Found</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <p className="text-xl font-bold dark:text-white">{clusterData.data.statistics.clusteredCount}</p>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Clustered</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <p className="text-xl font-bold text-gray-500">{clusterData.data.statistics.noiseCount}</p>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Isolated (Noise)</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700">
                  <p className="text-xl font-bold dark:text-white">{clusterData.data.statistics.totalDistributors}</p>
                  <p className="text-xs text-muted-foreground dark:text-gray-400">Total Analyzed</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground dark:text-gray-400 mt-3">
                DBSCAN epsilon: 30km (~0.27°), min cluster size: 2. Clusters inform logistics hub placement.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stats Footer */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold dark:text-white">{stats.total}</p>
              <p className="text-xs text-muted-foreground dark:text-gray-400">Total Distributors</p>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
              <p className="text-xs text-muted-foreground dark:text-gray-400">Approved</p>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
              <p className="text-xs text-muted-foreground dark:text-gray-400">Pending</p>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold text-red-500">{stats.suspended}</p>
              <p className="text-xs text-muted-foreground dark:text-gray-400">Suspended</p>
            </CardContent>
          </Card>
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-2xl font-bold dark:text-white">{stats.withCoords}</p>
              <p className="text-xs text-muted-foreground dark:text-gray-400">On Map</p>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar list of distributors */}
        {filteredDistributors.length > 0 && (
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white text-base">
                Distributors ({filteredDistributors.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredDistributors.map(d => (
                  <div key={d.id} className="flex items-start gap-3 p-3 rounded-lg border dark:border-gray-600 dark:bg-gray-700/50">
                    <div className={`mt-1 h-3 w-3 rounded-full flex-shrink-0 ${
                      d.status === "approved" ? "bg-green-500" :
                      d.status === "pending" ? "bg-yellow-500" :
                      d.status === "suspended" ? "bg-red-500" : "bg-blue-500"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate dark:text-white">{d.businessName}</p>
                      <p className="text-xs text-muted-foreground dark:text-gray-400 truncate">{d.warehouseAddress}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {d.latitude && d.longitude && (
                          <Badge variant="outline" className="text-xs">
                            <MapPin className="h-2.5 w-2.5 mr-1" />
                            {Number(d.latitude).toFixed(2)}, {Number(d.longitude).toFixed(2)}
                          </Badge>
                        )}
                        {(d.coverageRegions as string[] | null)?.slice(0, 2).map(r => (
                          <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
