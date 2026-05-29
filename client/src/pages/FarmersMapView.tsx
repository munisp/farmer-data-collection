import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapView, MapUtils, maplibregl, type MarkerOptions, type LatLng } from "@/components/Map";
import { useDatabase } from "@/hooks/useDatabase";
import { farmers, farms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Loader2, MapPin, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

interface FarmerLocation {
  id: number;
  firstName: string;
  lastName: string;
  latitude: number;
  longitude: number;
  farmCount: number;
  address: string | null;
  village: string | null;
  phoneNumber: string | null;
}

export default function FarmersMapView() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [farmerLocations, setFarmerLocations] = useState<FarmerLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [selectedFarmer, setSelectedFarmer] = useState<FarmerLocation | null>(null);

  useEffect(() => {
    if (!isInitialized) return;
    fetchFarmerLocations();
  }, [isInitialized, db]);

  const fetchFarmerLocations = async () => {
    if (!user) return;
    try {
      setLoading(true);
      
      // Get all farms with coordinates
      const farmsData = await db
        .select()
        .from(farms)
        .where(eq(farms.userId, Number(user.id)));

      // Group by farmer and get first valid location
      const farmerMap = new Map<number, FarmerLocation>();
      
      for (const farm of farmsData) {
        if (farm.latitude && farm.longitude) {
          const lat = parseFloat(farm.latitude.toString());
          const lng = parseFloat(farm.longitude.toString());
          
          if (!isNaN(lat) && !isNaN(lng)) {
            if (!farmerMap.has(farm.farmerId)) {
              // Get farmer details
              const farmerData = await db
                .select()
                .from(farmers)
                .where(eq(farmers.id, farm.farmerId));
              
              if (farmerData.length > 0) {
                const farmer = farmerData[0];
                
                // Count farms for this farmer
                const farmerFarms = farmsData.filter((f: any) => f.farmerId === farm.farmerId);
                
                farmerMap.set(farm.farmerId, {
                  id: farmer.id,
                  firstName: farmer.firstName,
                  lastName: farmer.lastName,
                  latitude: lat,
                  longitude: lng,
                  farmCount: farmerFarms.length,
                  address: farmer.address,
                  village: farmer.village,
                  phoneNumber: farmer.phoneNumber,
                });
              }
            }
          }
        }
      }
      
      setFarmerLocations(Array.from(farmerMap.values()));
    } catch (err) {
      console.error("Failed to fetch farmer locations:", err);
    } finally {
      setLoading(false);
    }
  };

  // Convert farmer locations to MapLibre markers
  const mapMarkers: MarkerOptions[] = useMemo(() => {
    return farmerLocations.map((farmer) => ({
      position: { lat: farmer.latitude, lng: farmer.longitude },
      color: "#3b82f6",
      title: `${farmer.firstName} ${farmer.lastName}`,
      popup: `
        <div style="padding: 8px; min-width: 200px;">
          <h3 style="font-weight: bold; margin-bottom: 8px;">${farmer.firstName} ${farmer.lastName}</h3>
          ${farmer.phoneNumber ? `<p style="margin: 4px 0;"><strong>Phone:</strong> ${farmer.phoneNumber}</p>` : ''}
          ${farmer.village ? `<p style="margin: 4px 0;"><strong>Village:</strong> ${farmer.village}</p>` : ''}
          <p style="margin: 4px 0;"><strong>Farms:</strong> ${farmer.farmCount}</p>
          <a 
            href="/farmers/${farmer.id}" 
            style="display: inline-block; margin-top: 8px; padding: 6px 12px; background: #3b82f6; color: white; text-decoration: none; border-radius: 4px; cursor: pointer;"
          >
            View Details
          </a>
        </div>
      `,
      onClick: () => setSelectedFarmer(farmer),
    }));
  }, [farmerLocations]);

  const handleMapReady = (map: maplibregl.Map) => {
    setMapReady(true);
    
    // Fit bounds to show all markers
    if (farmerLocations.length > 0) {
      const points: LatLng[] = farmerLocations.map((f) => ({
        lat: f.latitude,
        lng: f.longitude,
      }));
      MapUtils.fitBounds(map, points, 50);
      
      // Ensure minimum zoom level after fitting bounds
      map.once("moveend", () => {
        if (map.getZoom() > 15) {
          map.setZoom(15);
        }
      });
    }
  };

  if (!isInitialized || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Farmers Map View</h1>
            <p className="text-muted-foreground mt-2">
              Geographic distribution of {farmerLocations.length} farmers with location data
            </p>
          </div>
          <Button onClick={() => navigate("/farmers-enhanced")}>
            <Users className="w-4 h-4 mr-2" />
            List View
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Farmers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{farmerLocations.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Farms
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {farmerLocations.reduce((sum, f) => sum + f.farmCount, 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Selected Farmer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {selectedFarmer 
                  ? `${selectedFarmer.firstName} ${selectedFarmer.lastName}`
                  : "Click a marker"}
              </div>
            </CardContent>
          </Card>
        </div>

        {farmerLocations.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>No Location Data Available</CardTitle>
              <CardDescription>
                No farmers have farm locations recorded yet. Add farms with GPS coordinates to see them on the map.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/farms")}>
                <MapPin className="w-4 h-4 mr-2" />
                Add Farm Locations
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Map View</CardTitle>
              <CardDescription>
                Click on markers to view farmer details and navigate to their profile
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[600px] rounded-lg overflow-hidden border">
                <MapView
                  className="h-full"
                  markers={mapMarkers}
                  onMapReady={handleMapReady}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
