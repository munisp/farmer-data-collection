/**
 * Spatial Analytics Dashboard
 * Displays spatial analytics, heatmaps, and geospatial insights
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { MapPin, Navigation, Ruler, TrendingUp } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { BulkBoundaryImport } from "@/components/BulkBoundaryImport";

export default function SpatialAnalytics() {
  const [searchLat, setSearchLat] = useState("");
  const [searchLng, setSearchLng] = useState("");
  const [searchRadius, setSearchRadius] = useState("5000");

  const { data: totalArea } = trpc.spatial.getTotalFarmArea.useQuery();

  const [nearbyFarms, setNearbyFarms] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearchNearby = async () => {
    const lat = parseFloat(searchLat);
    const lng = parseFloat(searchLng);
    const radius = parseInt(searchRadius);

    if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
      toast.error("Please enter valid coordinates and radius");
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      toast.error("Invalid coordinates");
      return;
    }

    setIsSearching(true);
    try {
      const result = await (trpc as any).spatial.findFarmsWithinRadius.mutate({
        latitude: lat,
        longitude: lng,
        radiusMeters: radius,
      });
      setNearbyFarms(result as any[]);
      toast.success(`Found ${result.length} farms within ${radius / 1000}km`);
    } catch (error) {
      console.error("Error searching farms:", error);
      toast.error("Failed to search farms");
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSearchLat(position.coords.latitude.toFixed(6));
        setSearchLng(position.coords.longitude.toFixed(6));
        toast.success("Current location set");
      },
      (error) => {
        console.error("Error getting location:", error);
        toast.error("Failed to get current location");
      }
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Spatial Analytics</h1>
          <p className="text-muted-foreground">
            Geospatial insights and analysis of your farms
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div role="main" aria-label="Page content" className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                <MapPin className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Boundaries</div>
                <div className="text-2xl font-bold">
                  {Number(totalArea?.total_boundaries) || 0}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Ruler className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Total Area</div>
                <div className="text-2xl font-bold">
                  {Number(totalArea?.total_area_hectares || 0).toFixed(2)} ha
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Average Area</div>
                <div className="text-2xl font-bold">
                  {Number(totalArea?.avg_area_hectares || 0).toFixed(2)} ha
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-lg">
                <Navigation className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Largest Farm</div>
                <div className="text-2xl font-bold">
                  {Number(totalArea?.max_area_hectares || 0).toFixed(2)} ha
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Bulk Import */}
        <BulkBoundaryImport />

        {/* Proximity Search */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Find Nearby Farms</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <Label htmlFor="lat">Latitude</Label>
              <Input
                id="lat"
                type="number"
                step="0.000001"
                value={searchLat}
                onChange={(e) => setSearchLat(e.target.value)}
                placeholder="6.5244"
              />
            </div>
            <div>
              <Label htmlFor="lng">Longitude</Label>
              <Input
                id="lng"
                type="number"
                step="0.000001"
                value={searchLng}
                onChange={(e) => setSearchLng(e.target.value)}
                placeholder="3.3792"
              />
            </div>
            <div>
              <Label htmlFor="radius">Radius (meters)</Label>
              <Input
                id="radius"
                type="number"
                value={searchRadius}
                onChange={(e) => setSearchRadius(e.target.value)}
                placeholder="5000"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleUseCurrentLocation} variant="outline" className="flex-1">
                <Navigation className="w-4 h-4 mr-2" />
                Use Location
              </Button>
              <Button
                onClick={handleSearchNearby}
                disabled={isSearching}
                className="flex-1"
              >
                {isSearching ? "Searching..." : "Search"}
              </Button>
            </div>
          </div>

          {nearbyFarms.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold mb-3">
                Found {nearbyFarms.length} farms within {parseInt(searchRadius) / 1000}km
              </h3>
              <div className="space-y-2">
                {nearbyFarms.map((farm: any, index: number) => (
                  <Card key={index} className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-semibold">{farm.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {farm.latitude?.toFixed(6)}, {farm.longitude?.toFixed(6)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">
                          {(farm.distance_meters / 1000).toFixed(2)} km
                        </div>
                        <div className="text-sm text-muted-foreground">away</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Area Distribution */}
        {totalArea && Number(totalArea.total_boundaries) > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Farm Area Distribution</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <div className="text-sm text-muted-foreground mb-2">Smallest Farm</div>
                <div className="text-3xl font-bold text-green-600">
                  {Number(totalArea.min_area_hectares || 0).toFixed(2)} ha
                </div>
              </div>
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <div className="text-sm text-muted-foreground mb-2">Average Farm</div>
                <div className="text-3xl font-bold text-blue-600">
                  {Number(totalArea.avg_area_hectares || 0).toFixed(2)} ha
                </div>
              </div>
              <div className="text-center p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                <div className="text-sm text-muted-foreground mb-2">Largest Farm</div>
                <div className="text-3xl font-bold text-purple-600">
                  {Number(totalArea.max_area_hectares || 0).toFixed(2)} ha
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Coming Soon Features */}
        <Card className="p-6 bg-blue-50 dark:bg-blue-950">
          <h2 className="text-xl font-semibold mb-4">Coming Soon</h2>
          <ul className="space-y-2 text-sm">
            <li>📊 <strong>Farm Density Heatmap</strong> - Visualize farm concentration by region</li>
            <li>🌾 <strong>Crop Distribution Map</strong> - See what crops are grown where</li>
            <li>📈 <strong>Yield per Region Analysis</strong> - Compare productivity across areas</li>
            <li>🎯 <strong>Spatial Clustering</strong> - Identify farming zones automatically</li>
            <li>🛰️ <strong>Satellite Imagery Integration</strong> - NDVI and crop health monitoring</li>
            <li>⚡ <strong>Apache Sedona Integration</strong> - Distributed spatial analytics at scale</li>
          </ul>
        </Card>
      </div>
    </DashboardLayout>
  );
}
