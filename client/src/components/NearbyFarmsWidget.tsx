import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, Navigation, Search } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

export function NearbyFarmsWidget() {
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [radiusKm, setRadiusKm] = useState<string>("5");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Query nearby farms
  const { data: nearbyFarms, isLoading, refetch } = trpc.spatial.findFarmsWithinRadius.useQuery(
    {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      radiusMeters: parseFloat(radiusKm) * 1000, // Convert km to meters
    },
    {
      enabled: searchEnabled && !!latitude && !!longitude && !!radiusKm,
    }
  );

  // Get current location
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setGettingLocation(false);
        toast.success("Location acquired successfully");
      },
      (error) => {
        setGettingLocation(false);
        toast.error("Failed to get location: " + error.message);
      }
    );
  };

  const handleSearch = () => {
    if (!latitude || !longitude || !radiusKm) {
      toast.error("Please enter latitude, longitude, and radius");
      return;
    }
    setSearchEnabled(true);
    refetch();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Find Nearby Farms
        </CardTitle>
        <CardDescription>
          Search for farms within a specified radius of a location
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Form */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="latitude">Latitude</Label>
            <Input
              id="latitude"
              type="number"
              step="0.000001"
              placeholder="6.5244"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="longitude">Longitude</Label>
            <Input
              id="longitude"
              type="number"
              step="0.000001"
              placeholder="3.3792"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="radius">Radius (km)</Label>
            <Input
              id="radius"
              type="number"
              step="0.1"
              min="0.1"
              max="100"
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={getCurrentLocation}
            disabled={gettingLocation}
            className="flex-1"
          >
            {gettingLocation ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Getting Location...
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4 mr-2" />
                Use My Location
              </>
            )}
          </Button>
          <Button onClick={handleSearch} disabled={isLoading} className="flex-1">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Search
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {searchEnabled && !isLoading && nearbyFarms && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">
                Found {nearbyFarms.length} farm{nearbyFarms.length !== 1 ? "s" : ""}
              </h4>
              {nearbyFarms.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  Within {radiusKm} km
                </span>
              )}
            </div>

            {nearbyFarms.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No farms found within the specified radius. Try increasing the search radius.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {nearbyFarms.map((farm: any) => (
                  <div
                    key={farm.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex-1">
                      <Link href={`/farms/${farm.id}`}>
                        <a className="font-medium hover:text-primary hover:underline">
                          {farm.name}
                        </a>
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {farm.latitude && farm.longitude && (
                          <>
                            {parseFloat(farm.latitude).toFixed(4)}, {parseFloat(farm.longitude).toFixed(4)}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {(farm.distance_meters / 1000).toFixed(2)} km
                      </p>
                      <p className="text-xs text-muted-foreground">away</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
