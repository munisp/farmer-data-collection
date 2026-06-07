import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Link } from "wouter";

type FlightPlan = {
  id: string;
  farmId: number;
  flightType: string;
  droneModel: string;
  estimatedAreaHa: number;
  estimatedTimeM: number;
  batteries: number;
  status: string;
  waypointCount: number;
};

type DroneStatus = {
  droneId: string;
  model: string;
  status: string;
  batteryPct: number;
  lat: number;
  lon: number;
};

export default function DroneFlightDashboard() {
  const [activeTab, setActiveTab] = useState("planning");
  const [flightPlans] = useState<FlightPlan[]>([
    { id: "FP-1-001", farmId: 1, flightType: "survey", droneModel: "DJI Agras T40", estimatedAreaHa: 12.5, estimatedTimeM: 18, batteries: 1, status: "planned", waypointCount: 84 },
    { id: "FP-1-002", farmId: 1, flightType: "spray", droneModel: "DJI Agras T40", estimatedAreaHa: 8.2, estimatedTimeM: 25, batteries: 4, status: "completed", waypointCount: 156 },
  ]);
  const [drones] = useState<DroneStatus[]>([
    { droneId: "DRONE-001", model: "DJI Agras T40", status: "idle", batteryPct: 85, lat: -1.28, lon: 36.82 },
    { droneId: "DRONE-002", model: "DJI Mavic 3M", status: "idle", batteryPct: 92, lat: -1.29, lon: 36.83 },
  ]);

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-br from-blue-50 via-green-50 to-blue-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">🛩️ Drone Operations</h1>
            <p className="text-sm text-gray-600">Flight planning, spray prescriptions, NDVI imagery</p>
          </div>
          <Link href="/"><a className="text-blue-600">← Dashboard</a></Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-blue-600">{drones.length}</div><p className="text-sm text-gray-500">Registered Drones</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-green-600">{flightPlans.filter(f => f.status === "completed").length}</div><p className="text-sm text-gray-500">Completed Flights</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-purple-600">{flightPlans.reduce((s, f) => s + f.estimatedAreaHa, 0).toFixed(1)} ha</div><p className="text-sm text-gray-500">Total Area Covered</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-orange-600">{drones.filter(d => d.status === "flying" || d.status === "spraying").length}</div><p className="text-sm text-gray-500">Active Flights</p></CardContent></Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="planning">Flight Planning</TabsTrigger>
            <TabsTrigger value="fleet">Fleet Status</TabsTrigger>
            <TabsTrigger value="imagery">NDVI Imagery</TabsTrigger>
            <TabsTrigger value="spray">Spray Prescriptions</TabsTrigger>
          </TabsList>

          <TabsContent value="planning">
            <Card>
              <CardHeader><CardTitle>Flight Plans</CardTitle><CardDescription>Generate survey and spray flight plans from farm boundaries</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {flightPlans.map(plan => (
                    <div key={plan.id} className="border rounded-lg p-4 flex justify-between items-center">
                      <div>
                        <div className="font-semibold">{plan.id} — {plan.flightType.toUpperCase()}</div>
                        <div className="text-sm text-gray-500">{plan.droneModel} • {plan.estimatedAreaHa} ha • {plan.estimatedTimeM} min • {plan.batteries} batteries • {plan.waypointCount} waypoints</div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${plan.status === "completed" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                        {plan.status}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fleet">
            <Card>
              <CardHeader><CardTitle>Drone Fleet</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {drones.map(drone => (
                    <div key={drone.droneId} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold">{drone.droneId}</span>
                        <span className={`px-2 py-1 rounded text-xs ${drone.status === "idle" ? "bg-gray-100" : "bg-green-100 text-green-800"}`}>{drone.status}</span>
                      </div>
                      <p className="text-sm text-gray-600">{drone.model}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div className="bg-green-500 rounded-full h-2" style={{width: `${drone.batteryPct}%`}} />
                        </div>
                        <span className="text-xs text-gray-500">{drone.batteryPct}%</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">📍 {drone.lat.toFixed(4)}, {drone.lon.toFixed(4)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="imagery">
            <Card>
              <CardHeader><CardTitle>NDVI Imagery</CardTitle><CardDescription>Processed drone imagery with crop health analysis</CardDescription></CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <p className="text-lg">Upload drone imagery for NDVI processing</p>
                  <p className="text-sm mt-2">Supports: RGB, Multispectral, Thermal • Engines: OpenDroneMap, Pix4D, DroneDeploy</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="spray">
            <Card>
              <CardHeader><CardTitle>Spray Prescriptions</CardTitle><CardDescription>Variable-rate spray maps from NDVI analysis</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <p>• Low NDVI (&lt;0.3): Heavy application — 15 L/ha</p>
                  <p>• Moderate NDVI (0.3-0.5): Moderate — 10 L/ha</p>
                  <p>• Good NDVI (0.5-0.7): Light — 5 L/ha</p>
                  <p>• Healthy NDVI (&gt;0.7): Maintenance — 2 L/ha</p>
                  <p className="mt-4 text-gray-500">Generate prescriptions from the NDVI imagery tab, then upload to DJI Agras for variable-rate spraying.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
