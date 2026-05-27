import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tractor, MapPin, Fuel, Wrench, Activity, AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function EquipmentTracker() {
  const [selectedEquipment, setSelectedEquipment] = useState("tractor-1");

  const equipment = [
    {
      id: "tractor-1",
      name: "John Deere 5075E",
      type: "Tractor",
      status: "active",
      location: { lat: -1.2921, lng: 36.8219 },
      fuelLevel: 75,
      hoursUsed: 1245,
      lastMaintenance: "2024-11-15",
      nextMaintenance: "2024-12-15",
    },
    {
      id: "harvester-1",
      name: "Case IH Axial-Flow 250",
      type: "Harvester",
      status: "maintenance",
      location: { lat: -1.2925, lng: 36.8225 },
      fuelLevel: 45,
      hoursUsed: 856,
      lastMaintenance: "2024-11-28",
      nextMaintenance: "2024-12-28",
    },
    {
      id: "sprayer-1",
      name: "Hardi Navigator 3000",
      type: "Sprayer",
      status: "active",
      location: { lat: -1.2918, lng: 36.8212 },
      fuelLevel: 90,
      hoursUsed: 432,
      lastMaintenance: "2024-11-10",
      nextMaintenance: "2024-12-10",
    },
  ];

  const fuelLogs = [
    { date: "2024-12-01", equipment: "Tractor", quantity: 120, cost: 180 },
    { date: "2024-11-28", equipment: "Harvester", quantity: 95, cost: 142.5 },
    { date: "2024-11-25", equipment: "Sprayer", quantity: 45, cost: 67.5 },
  ];

  const maintenanceAlerts = [
    {
      equipment: "John Deere 5075E",
      type: "Oil Change",
      dueDate: "2024-12-15",
      priority: "medium",
    },
    {
      equipment: "Case IH Axial-Flow 250",
      type: "Hydraulic Filter",
      dueDate: "2024-12-10",
      priority: "high",
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500";
      case "maintenance": return "bg-orange-500";
      case "retired": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "low": return "text-yellow-600";
      case "medium": return "text-orange-600";
      case "high": return "text-red-600";
      default: return "text-gray-600";
    }
  };

  const selectedEq = equipment.find(e => e.id === selectedEquipment);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-lime-50 to-emerald-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Equipment Tracker</h1>
              <p className="text-sm text-gray-600">Monitor location, fuel, and maintenance</p>
            </div>
            <Link href="/precision-agriculture">
              <a className="text-sm text-blue-600 hover:text-blue-800">← Back</a>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Map & Equipment List */}
          <div className="lg:col-span-2 space-y-6">
            {/* GPS Map */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-green-600" />
                  Live Equipment Tracking
                </CardTitle>
                <CardDescription>Real-time GPS locations of all equipment</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Placeholder for map */}
                <div className="aspect-video bg-gradient-to-br from-green-100 to-emerald-200 rounded-lg flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMCIgb3BhY2l0eT0iMC4xIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
                  <div className="relative z-10 text-center">
                    <MapPin className="h-16 w-16 mx-auto mb-4 text-green-600" />
                    <p className="text-gray-700 font-semibold text-lg">GPS Tracking Map</p>
                    <p className="text-gray-600 text-sm">
                      {equipment.filter(e => e.status === "active").length} active equipment
                    </p>
                  </div>
                  
                  {/* Equipment markers */}
                  <div className="absolute top-1/4 left-1/3 bg-green-600 text-white px-2 py-1 rounded-full text-xs font-semibold shadow-lg">
                    🚜 Tractor
                  </div>
                  <div className="absolute top-1/2 right-1/3 bg-orange-600 text-white px-2 py-1 rounded-full text-xs font-semibold shadow-lg">
                    🌾 Harvester
                  </div>
                  <div className="absolute bottom-1/4 left-1/2 bg-blue-600 text-white px-2 py-1 rounded-full text-xs font-semibold shadow-lg">
                    💧 Sprayer
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Equipment List */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Equipment Fleet</CardTitle>
                <CardDescription>All registered equipment</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {equipment.map((eq) => (
                    <div
                      key={eq.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        selectedEquipment === eq.id
                          ? "border-green-500 bg-green-50"
                          : "border-gray-200 hover:border-green-300"
                      }`}
                      onClick={() => setSelectedEquipment(eq.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <Tractor className="h-5 w-5 text-green-600" />
                          <div>
                            <p className="font-semibold">{eq.name}</p>
                            <p className="text-xs text-gray-600">{eq.type}</p>
                          </div>
                        </div>
                        <Badge className={getStatusColor(eq.status)}>
                          {eq.status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-600">Fuel</p>
                          <p className="font-semibold">{eq.fuelLevel}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Hours</p>
                          <p className="font-semibold">{eq.hoursUsed}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Next Service</p>
                          <p className="font-semibold text-xs">
                            {new Date(eq.nextMaintenance).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Details & Alerts */}
          <div className="space-y-6">
            {/* Selected Equipment Details */}
            {selectedEq && (
              <Card className="bg-white">
                <CardHeader>
                  <CardTitle className="text-lg">{selectedEq.name}</CardTitle>
                  <CardDescription>{selectedEq.type}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Fuel Level */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <Fuel className="h-4 w-4 text-blue-600" />
                        Fuel Level
                      </span>
                      <span className="text-sm font-semibold">{selectedEq.fuelLevel}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${selectedEq.fuelLevel}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Usage Hours */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <Activity className="h-4 w-4 text-green-600" />
                        Usage Hours
                      </span>
                      <span className="text-sm font-semibold">{selectedEq.hoursUsed} hrs</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Next maintenance in {5000 - selectedEq.hoursUsed} hours
                    </p>
                  </div>

                  {/* Maintenance */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-orange-600" />
                        Maintenance
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Last Service:</span>
                        <span className="font-medium">
                          {new Date(selectedEq.lastMaintenance).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Next Service:</span>
                        <span className="font-medium">
                          {new Date(selectedEq.nextMaintenance).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="border-t pt-4 space-y-2">
                    <Button className="w-full" size="sm">
                      <MapPin className="h-4 w-4 mr-2" />
                      View Location History
                    </Button>
                    <Button variant="outline" className="w-full" size="sm">
                      <Fuel className="h-4 w-4 mr-2" />
                      Log Fuel
                    </Button>
                    <Button variant="outline" className="w-full" size="sm">
                      <Wrench className="h-4 w-4 mr-2" />
                      Schedule Maintenance
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Maintenance Alerts */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  Maintenance Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {maintenanceAlerts.map((alert, index) => (
                    <div key={index} className="border-b pb-3 last:border-b-0 last:pb-0">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-sm font-medium">{alert.equipment}</p>
                        <AlertCircle className={`h-4 w-4 ${getPriorityColor(alert.priority)}`} />
                      </div>
                      <p className="text-xs text-gray-600">{alert.type}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Due: {new Date(alert.dueDate).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Fuel Summary */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-lg">Fuel Summary</CardTitle>
                <CardDescription>Last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Consumed</span>
                    <span className="text-2xl font-bold">260 L</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Cost</span>
                    <span className="text-2xl font-bold">$390</span>
                  </div>
                  <div className="border-t pt-4">
                    <p className="text-xs font-medium text-gray-600 mb-2">Recent Logs</p>
                    <div className="space-y-2">
                      {fuelLogs.slice(0, 3).map((log, index) => (
                        <div key={index} className="flex justify-between text-xs">
                          <span className="text-gray-600">{log.equipment}</span>
                          <span className="font-medium">{log.quantity}L • ${log.cost}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
