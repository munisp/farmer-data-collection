import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, MapPin, Ruler } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { trpc } from "@/lib/trpc";
import { useDatabase } from "@/hooks/useDatabase";
import { farms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { FarmBoundaryViewer } from "@/components/FarmBoundaryViewer";
import { FarmBoundaryEditor } from "@/components/FarmBoundaryEditor";
import { WeatherWidget } from "@/components/WeatherWidget";

export default function FarmDetail() {
  const [, params] = useRoute("/farms/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const farmId = params?.id ? parseInt(params.id) : null;

  // Fetch farm data from local database
  const { db } = useDatabase();
  const [farm, setFarm] = useState<any>(null);
  const [farmLoading, setFarmLoading] = useState(true);

  useEffect(() => {
    const loadFarm = async () => {
      if (!db || !farmId) return;
      try {
        const result = await db.select().from(farms).where(eq(farms.id, farmId));
        setFarm(result[0] || null);
      } catch (error) {
        console.error("Error loading farm:", error);
      } finally {
        setFarmLoading(false);
      }
    };
    loadFarm();
  }, [db, farmId]);

  // Fetch farm boundaries
  const { data: boundaries, isLoading: boundariesLoading, refetch: refetchBoundaries } = 
    trpc.spatial.getAllBoundariesGeoJSON.useQuery(
      undefined,
      {
        enabled: !!user && !!farmId,
      }
    );

  const farmBoundary = boundaries?.features?.find(
    (f: any) => f.properties?.farm_id === farmId
  );

  const [isEditingBoundary, setIsEditingBoundary] = useState(false);

  if (!farmId) {
    return (
      <DashboardLayout>
        <div role="main" aria-label="Page content" className="p-8">
          <Card>
            <CardHeader>
              <CardTitle>Invalid Farm ID</CardTitle>
              <CardDescription>The requested farm could not be found.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setLocation("/farms")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Farms
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (farmLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!farm) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <Card>
            <CardHeader>
              <CardTitle>Farm Not Found</CardTitle>
              <CardDescription>The requested farm does not exist or you don't have permission to view it.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setLocation("/farms")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Farms
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/farms")}
              className="mb-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Farms
            </Button>
            <h1 className="text-3xl font-bold">{farm.farmName}</h1>
            <p className="text-muted-foreground">Farm Details and Boundary</p>
          </div>
        </div>

        {/* Farm Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>Farm Information</CardTitle>
            <CardDescription>Basic details about this farm</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Farm Name</p>
              <p className="font-medium">{farm.farmName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Size</p>
              <p className="font-medium">
                {farm.farmSize ? `${farm.farmSize} ${farm.farmSizeUnit}` : "Not specified"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Location</p>
              <p className="font-medium">{farm.location || "Not specified"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Coordinates</p>
              <p className="font-medium flex items-center gap-1">
                {farm.latitude && farm.longitude ? (
                  <>
                    <MapPin className="w-4 h-4" />
                    {parseFloat(farm.latitude).toFixed(6)}, {parseFloat(farm.longitude).toFixed(6)}
                  </>
                ) : (
                  "Not specified"
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Soil Type</p>
              <p className="font-medium">{farm.soilType || "Not specified"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Irrigation Type</p>
              <p className="font-medium">{farm.irrigationType || "Not specified"}</p>
            </div>
          </CardContent>
        </Card>
        {/* Weather Section */}
        {farm.latitude && farm.longitude && (
          <WeatherWidget
            latitude={parseFloat(farm.latitude)}
            longitude={parseFloat(farm.longitude)}
            farmName={farm.farm_name}
          />
        )}

        {/* Farm Boundary Section */}
        <Card>         <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Farm Boundary</CardTitle>
                <CardDescription>
                  {farmBoundary 
                    ? "View and manage the farm boundary polygon" 
                    : "No boundary defined for this farm"}
                </CardDescription>
              </div>
              {farmBoundary && (
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Ruler className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">
                      {Number(farmBoundary.properties.area_hectares || 0).toFixed(2)} ha
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Perimeter: {(Number(farmBoundary.properties.perimeter_m) / 1000).toFixed(2)} km
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {boundariesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : farmBoundary ? (
              isEditingBoundary ? (
                <FarmBoundaryEditor
                  boundaryId={Number(farmBoundary.properties.id)}
                  initialGeometry={farmBoundary.geometry}
                  onSaved={() => {
                    setIsEditingBoundary(false);
                    refetchBoundaries();
                  }}
                  onCancel={() => setIsEditingBoundary(false)}
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button
                      onClick={() => setIsEditingBoundary(true)}
                      variant="outline"
                    >
                      Edit Boundary
                    </Button>
                  </div>
                  <FarmBoundaryViewer
                    farmId={farmId}
                    initialCenter={
                      farm.latitude && farm.longitude
                        ? {
                            lat: parseFloat(farm.latitude),
                            lng: parseFloat(farm.longitude),
                          }
                        : undefined
                    }
                    onBoundaryDeleted={() => {
                      toast.success("Boundary deleted successfully");
                      refetchBoundaries();
                    }}
                  />
                </div>
              )
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  No boundary has been drawn for this farm yet.
                </p>
                <Button onClick={() => setLocation("/farms")}>
                  Go to Farms Page to Draw Boundary
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
