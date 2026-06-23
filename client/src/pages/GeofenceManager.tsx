/**
 * Geofence Manager — latlng Geofence Zone & Event Management
 *
 * Create, monitor, and manage geofence zones for farm boundaries,
 * delivery zones, cold chain routes, and distributor coverage areas.
 */
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  Shield, MapPin, Hexagon, AlertTriangle, Bell, Fence,
  Plus, Trash2, Eye, Activity, Clock, ArrowUpRight,
  ArrowDownLeft, Radio, Target, Zap,
} from "lucide-react";

type GeoTab = "zones" | "events" | "create";

const ZONE_TYPES = [
  { id: "farm_boundary", label: "Farm Boundary", icon: Hexagon, color: "bg-green-100 text-green-700" },
  { id: "delivery_zone", label: "Delivery Zone", icon: MapPin, color: "bg-blue-100 text-blue-700" },
  { id: "cold_chain_route", label: "Cold Chain Route", icon: Target, color: "bg-cyan-100 text-cyan-700" },
  { id: "coverage_area", label: "Coverage Area", icon: Radio, color: "bg-purple-100 text-purple-700" },
  { id: "warehouse", label: "Warehouse", icon: Fence, color: "bg-orange-100 text-orange-700" },
  { id: "exclusion_zone", label: "Exclusion Zone", icon: Shield, color: "bg-red-100 text-red-700" },
];

const EVENT_ICONS: Record<string, typeof ArrowUpRight> = {
  enter: ArrowUpRight,
  exit: ArrowDownLeft,
  inside: Eye,
  outside: Radio,
  cross: Zap,
};

export default function GeofenceManager() {
  const [activeTab, setActiveTab] = useState<GeoTab>("zones");
  const [filterType, setFilterType] = useState<string>("");

  const zones = trpc.latlng.listGeofences.useQuery({
    zoneType: filterType || undefined,
  });
  const events = trpc.latlng.getGeofenceEvents.useQuery({ limit: 50 });
  const stats = trpc.latlng.dashboardStats.useQuery();

  const tabs = [
    { id: "zones" as const, label: "Zones", icon: Hexagon },
    { id: "events" as const, label: "Events", icon: Bell },
    { id: "create" as const, label: "Create Zone", icon: Plus },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Hero Header */}
        <div className="bg-gradient-to-r from-primary to-primary-dark rounded-xl p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Fence className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Geofence Manager</h1>
              <p className="text-white/80 text-sm">
                latlng Geofencing · Webhook Events · Zone Monitoring · NODWELL Detection
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <Badge variant="outline" className="text-white border-white/40">
              {stats.data?.activeGeofences ?? 0} Active Zones
            </Badge>
            <Badge variant="outline" className="text-white border-white/40">
              {stats.data?.totalEvents ?? 0} Events Recorded
            </Badge>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b pb-2">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5"
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Zones Tab */}
        {activeTab === "zones" && (
          <div className="space-y-4">
            {/* Zone Type Filter */}
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={filterType === "" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterType("")}
              >
                All
              </Button>
              {ZONE_TYPES.map((zt) => (
                <Button
                  key={zt.id}
                  variant={filterType === zt.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType(zt.id)}
                  className="flex items-center gap-1"
                >
                  <zt.icon className="w-3 h-3" />
                  {zt.label}
                </Button>
              ))}
            </div>

            {/* Zone List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Hexagon className="w-5 h-5 text-primary" />
                    Geofence Zones
                  </span>
                  <Badge variant="outline">{zones.data?.length ?? 0} zones</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {zones.data && zones.data.length > 0 ? (
                  <div className="space-y-2">
                    {zones.data.map((zone) => {
                      const zt = ZONE_TYPES.find(z => z.id === zone.zoneType);
                      return (
                        <div key={zone.id} className="p-3 rounded border flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${zt?.color || "bg-gray-100"}`}>
                              {zt?.icon && <zt.icon className="w-4 h-4" />}
                            </div>
                            <div>
                              <span className="font-medium">{zone.name}</span>
                              <div className="text-xs text-muted-foreground">
                                {zone.collection} · {(zone.detectEvents as string[])?.join(", ") || "enter, exit"}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={zone.latlngSynced ? "default" : "secondary"} className="text-xs">
                              {zone.latlngSynced ? "Synced" : "Local"}
                            </Badge>
                            <Badge variant={zone.active ? "default" : "destructive"} className="text-xs">
                              {zone.active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <Fence className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No geofence zones configured yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Events Tab */}
        {activeTab === "events" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                Geofence Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              {events.data && events.data.length > 0 ? (
                <div className="space-y-2">
                  {events.data.map((event) => {
                    const EventIcon = EVENT_ICONS[event.eventType] || Activity;
                    const isEntry = event.eventType === "enter";
                    const isExit = event.eventType === "exit";
                    return (
                      <div key={event.id} className="p-3 rounded border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            isEntry ? "bg-green-100 text-green-700" :
                            isExit ? "bg-red-100 text-red-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                            <EventIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-medium">{event.objectId}</span>
                            <span className="text-sm text-muted-foreground ml-2">
                              {event.eventType} → {event.zoneName}
                            </span>
                            <div className="text-xs text-muted-foreground">
                              {event.collection}
                              {event.latitude && ` · ${event.latitude.toFixed(4)}, ${event.longitude?.toFixed(4)}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={event.webhookDelivered ? "default" : "secondary"} className="text-xs">
                            {event.webhookDelivered ? "Delivered" : "Pending"}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(event.occurredAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 text-center">
                  <AlertTriangle className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No geofence events recorded yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Create Zone Tab */}
        {activeTab === "create" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary" />
                  Create Geofence Zone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Zone Name</label>
                    <Input placeholder="e.g., Lagos Warehouse Perimeter" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Zone Type</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {ZONE_TYPES.map((zt) => (
                        <Button key={zt.id} variant="outline" size="sm" className="flex items-center gap-1 text-xs">
                          <zt.icon className="w-3 h-3" />
                          {zt.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Detect Events</label>
                  <div className="flex gap-2 mt-1">
                    {["enter", "exit", "inside", "outside", "cross"].map((evt) => (
                      <Badge key={evt} variant="outline" className="cursor-pointer hover:bg-primary/10">
                        {evt}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Webhook URL (optional)</label>
                  <Input placeholder="https://api.farmconnect.ng/webhooks/geofence" />
                </div>

                <div>
                  <label className="text-sm font-medium">GeoJSON Geometry</label>
                  <div className="p-4 bg-muted/50 rounded border mt-1 min-h-[120px]">
                    <p className="text-sm text-muted-foreground">
                      Draw the geofence boundary on the map, or paste GeoJSON Polygon/MultiPolygon geometry.
                    </p>
                    <textarea
                      className="w-full mt-2 p-2 rounded border bg-background font-mono text-xs min-h-[80px]"
                      placeholder='{"type": "Polygon", "coordinates": [[[3.39, 6.45], [3.40, 6.45], [3.40, 6.46], [3.39, 6.46], [3.39, 6.45]]]}'
                    />
                  </div>
                </div>

                <Button className="w-full">
                  <Shield className="w-4 h-4 mr-2" />
                  Create Geofence Zone
                </Button>
              </CardContent>
            </Card>

            {/* Zone Types Explanation */}
            <div className="grid md:grid-cols-3 gap-4">
              {ZONE_TYPES.slice(0, 3).map((zt) => (
                <Card key={zt.id}>
                  <CardContent className="p-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${zt.color}`}>
                      <zt.icon className="w-5 h-5" />
                    </div>
                    <h4 className="font-medium">{zt.label}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {zt.id === "farm_boundary" && "Define farm perimeters. Get alerts when vehicles enter/leave farm areas."}
                      {zt.id === "delivery_zone" && "Set delivery coverage areas. Track when fleet vehicles enter delivery zones."}
                      {zt.id === "cold_chain_route" && "Monitor cold chain routes. NODWELL alerts when trucks stop too long."}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
