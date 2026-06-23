/**
 * Fleet Tracker — latlng Real-Time Object Tracking Dashboard
 *
 * Live map of tracked vehicles, cold chain units, distributors, and sensors.
 * Powered by latlng geospatial object engine with PostgreSQL fallback.
 */
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Truck, MapPin, Thermometer, Radio, Activity, Navigation,
  Battery, Wifi, Clock, AlertTriangle, Eye, BarChart3,
  Satellite, Gauge, RefreshCw,
} from "lucide-react";

type FleetTab = "map" | "fleet" | "cold_chain" | "distributors" | "sensors";

const COLLECTIONS = [
  { id: "fleet" as const, label: "Fleet Vehicles", icon: Truck, color: "text-blue-600" },
  { id: "cold_chain" as const, label: "Cold Chain", icon: Thermometer, color: "text-cyan-600" },
  { id: "distributors" as const, label: "Distributors", icon: MapPin, color: "text-purple-600" },
  { id: "farmers" as const, label: "Farmers", icon: Navigation, color: "text-green-600" },
  { id: "sensors" as const, label: "IoT Sensors", icon: Radio, color: "text-orange-600" },
] as const;

export default function FleetTracker() {
  const [activeTab, setActiveTab] = useState<FleetTab>("map");
  const [selectedCollection, setSelectedCollection] = useState<"fleet" | "cold_chain" | "distributors" | "farmers" | "sensors">("fleet");

  const status = trpc.latlng.status.useQuery();
  const stats = trpc.latlng.dashboardStats.useQuery();
  const objects = trpc.latlng.listObjects.useQuery({
    collection: selectedCollection,
    limit: 100,
  });

  const tabs = [
    { id: "map" as const, label: "Live Map", icon: MapPin },
    { id: "fleet" as const, label: "Fleet", icon: Truck },
    { id: "cold_chain" as const, label: "Cold Chain", icon: Thermometer },
    { id: "distributors" as const, label: "Distributors", icon: Navigation },
    { id: "sensors" as const, label: "Sensors", icon: Radio },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Hero Header */}
        <div className="bg-gradient-to-r from-primary to-primary-dark rounded-xl p-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <Satellite className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Fleet Tracker</h1>
              <p className="text-white/80 text-sm">
                latlng Real-Time Tracking · Geospatial Object Engine · Live Positions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4">
            <Badge variant="outline" className="text-white border-white/40">
              {status.data?.latlngConnected ? "🟢 latlng Connected" : "🔴 latlng Offline — PostgreSQL Fallback"}
            </Badge>
            <Badge variant="outline" className="text-white border-white/40">
              {stats.data?.totalTracked ?? 0} Tracked Objects
            </Badge>
            <Badge variant="outline" className="text-white border-white/40">
              {stats.data?.activeLastHour ?? 0} Active (1h)
            </Badge>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b pb-2 overflow-x-auto">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id !== "map") {
                  const collMap: Record<string, typeof selectedCollection> = {
                    fleet: "fleet", cold_chain: "cold_chain",
                    distributors: "distributors", sensors: "sensors",
                  };
                  if (collMap[tab.id]) setSelectedCollection(collMap[tab.id]);
                }
              }}
              className="flex items-center gap-1.5"
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {COLLECTIONS.map((coll) => (
            <Card key={coll.id} className={selectedCollection === coll.id ? "ring-2 ring-primary" : ""}>
              <CardContent className="p-4 text-center cursor-pointer" onClick={() => setSelectedCollection(coll.id)}>
                <coll.icon className={`w-6 h-6 mx-auto mb-2 ${coll.color}`} />
                <div className="text-2xl font-bold">
                  {stats.data?.byCollection?.[coll.id] ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">{coll.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Map Tab */}
        {activeTab === "map" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  Live Tracking Map
                </span>
                <Button variant="outline" size="sm" onClick={() => objects.refetch()}>
                  <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted rounded-lg h-96 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
                {objects.data && objects.data.length > 0 ? (
                  <div className="absolute inset-4 grid grid-cols-2 md:grid-cols-3 gap-2 overflow-y-auto">
                    {objects.data.map((obj) => (
                      <div key={obj.id} className="p-3 rounded-lg bg-background border shadow-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-sm font-medium truncate">{obj.label || obj.id}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {obj.latitude.toFixed(4)}, {obj.longitude.toFixed(4)}
                        </div>
                        {obj.speed !== null && obj.speed !== undefined && (
                          <div className="flex items-center gap-1 mt-1">
                            <Gauge className="w-3 h-3" />
                            <span className="text-xs">{obj.speed} km/h</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center z-10">
                    <Satellite className="w-12 h-12 mx-auto text-primary/30 mb-3" />
                    <h3 className="font-semibold mb-1">No Objects Tracked Yet</h3>
                    <p className="text-sm text-muted-foreground">
                      Use the API to start tracking fleet vehicles, cold chain units, and sensors.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Collection List Views */}
        {activeTab !== "map" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {COLLECTIONS.find(c => c.id === selectedCollection)?.icon &&
                    (() => { const Icon = COLLECTIONS.find(c => c.id === selectedCollection)!.icon; return <Icon className="w-5 h-5 text-primary" />; })()
                  }
                  {COLLECTIONS.find(c => c.id === selectedCollection)?.label}
                </span>
                <Badge variant="outline">{objects.data?.length ?? 0} objects</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {objects.data && objects.data.length > 0 ? (
                <div className="space-y-2">
                  {objects.data.map((obj) => (
                    <div key={obj.id} className="p-3 rounded border flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <div>
                          <span className="font-medium">{obj.label || obj.id}</span>
                          <div className="text-xs text-muted-foreground">
                            {obj.latitude.toFixed(4)}, {obj.longitude.toFixed(4)}
                            {obj.speed !== null && obj.speed !== undefined ? ` · ${obj.speed} km/h` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const f = obj.fields as Record<string, unknown> | null;
                          if (!f || typeof f !== "object") return null;
                          return (
                            <>
                              {"temperature" in f && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                  <Thermometer className="w-3 h-3" />
                                  <span>{String(f.temperature)}°C</span>
                                </Badge>
                              )}
                              {"battery" in f && (
                                <Badge variant="outline" className="flex items-center gap-1">
                                  <Battery className="w-3 h-3" />
                                  <span>{String(f.battery)}%</span>
                                </Badge>
                              )}
                            </>
                          );
                        })()}
                        <span className="text-xs text-muted-foreground">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {new Date(obj.lastUpdated).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center">
                  <Eye className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No objects in this collection.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* System Stats */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Geofence Zones</span>
              </div>
              <div className="text-2xl font-bold">{stats.data?.activeGeofences ?? 0}</div>
              <div className="text-xs text-muted-foreground">Active geofence monitoring zones</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-medium">Geofence Events</span>
              </div>
              <div className="text-2xl font-bold">{stats.data?.totalEvents ?? 0}</div>
              <div className="text-xs text-muted-foreground">Enter/exit/dwell events recorded</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium">History Points</span>
              </div>
              <div className="text-2xl font-bold">{(stats.data?.historyPoints ?? 0).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Position history data points</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
