import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Truck, MapPin, Thermometer, Package, Users, Route, Star, Clock } from "lucide-react";

export default function DeliveryDashboard() {
  const [activeTab, setActiveTab] = useState("zones");
  const zones = trpc.delivery.listZones.useQuery({ active: true });
  const collectionPoints = trpc.delivery.listCollectionPoints.useQuery({});
  const hubs = trpc.delivery.listHubs.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Delivery & Supply Chain</h1>
          <p className="text-muted-foreground">Manage collection points, delivery zones, and fleet operations</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <MapPin className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{zones.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Delivery Zones</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Package className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{collectionPoints.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Collection Points</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Thermometer className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">{hubs.data?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Aggregation Hubs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Truck className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">—</p>
                  <p className="text-sm text-muted-foreground">Active Drivers</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="zones">Delivery Zones</TabsTrigger>
            <TabsTrigger value="collection">Collection Points</TabsTrigger>
            <TabsTrigger value="hubs">Aggregation Hubs</TabsTrigger>
            <TabsTrigger value="tracking">Live Tracking</TabsTrigger>
          </TabsList>

          <TabsContent value="zones" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Delivery Zones</CardTitle>
                <CardDescription>Geographic zones with pricing and coverage areas</CardDescription>
              </CardHeader>
              <CardContent>
                {zones.isLoading ? (
                  <p>Loading zones...</p>
                ) : zones.data && zones.data.length > 0 ? (
                  <div className="space-y-3">
                    {zones.data.map((zone: Record<string, unknown>) => (
                      <div key={zone.id as number} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{zone.name as string}</p>
                          <p className="text-sm text-muted-foreground">{zone.city as string}, {zone.country as string}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={zone.active ? "default" : "secondary"}>
                            {zone.active ? "Active" : "Inactive"}
                          </Badge>
                          <p className="text-sm mt-1">Base: {zone.currency as string} {zone.baseFee as number}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No delivery zones configured yet</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="collection" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Collection Points</CardTitle>
                <CardDescription>Farmer produce drop-off locations</CardDescription>
              </CardHeader>
              <CardContent>
                {collectionPoints.data && collectionPoints.data.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {collectionPoints.data.map((point: Record<string, unknown>) => (
                      <div key={point.id as number} className="p-4 border rounded-lg">
                        <h3 className="font-medium">{point.name as string}</h3>
                        <p className="text-sm text-muted-foreground">{point.address as string || "No address"}</p>
                        <div className="flex gap-4 mt-2 text-sm">
                          <span>Capacity: {point.capacityTons as string} tons</span>
                          {point.contactPhone != null && <span>Tel: {String(point.contactPhone)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No collection points configured</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hubs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Aggregation Hubs</CardTitle>
                <CardDescription>Central processing and grading facilities</CardDescription>
              </CardHeader>
              <CardContent>
                {hubs.data && hubs.data.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {hubs.data.map((hub: Record<string, unknown>) => (
                      <div key={hub.id as number} className="p-4 border rounded-lg">
                        <h3 className="font-medium">{hub.name as string}</h3>
                        <div className="flex gap-2 mt-2">
                          {hub.gradingEnabled === true && <Badge>AI Grading</Badge>}
                          <Badge variant="outline">Cold: {hub.coldStorageCapacityTons as string}T</Badge>
                          <Badge variant="outline">Process: {hub.processingCapacityTons as string}T</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No aggregation hubs configured</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tracking">
            <Card>
              <CardHeader>
                <CardTitle>Live Delivery Tracking</CardTitle>
                <CardDescription>Real-time driver locations and delivery status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center h-64 border-2 border-dashed rounded-lg">
                  <div className="text-center">
                    <Truck className="h-12 w-12 mx-auto text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">Live map integration — requires active deliveries</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
