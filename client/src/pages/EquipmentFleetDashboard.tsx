import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { Link } from "wouter";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function EquipmentFleetDashboard() {
  const { formatCurrency } = useLocalization();
  const [activeTab, setActiveTab] = useState("fleet");
  const [equipment] = useState([
    { id: "EQ-1", type: "tractor", brand: "John Deere", model: "6120M", hp: 120, hours: 2450, fuel: 72, status: "operating", speed: 8.5, lat: -1.28, lon: 36.82 },
    { id: "EQ-2", type: "sprayer", brand: "AGCO", model: "RoGator 1300", hp: 280, hours: 890, fuel: 45, status: "idle", speed: 0, lat: -1.29, lon: 36.83 },
    { id: "EQ-3", type: "harvester", brand: "John Deere", model: "S780", hp: 543, hours: 1200, fuel: 88, status: "maintenance", speed: 0, lat: -1.27, lon: 36.81 },
  ]);

  const [maintenancePredictions] = useState([
    { component: "engine_oil", wearPct: 82, daysToFailure: 12, priority: "high", estimatedCost: 5000, action: "Change oil at 2500 hours" },
    { component: "air_filter", wearPct: 45, daysToFailure: 55, priority: "medium", estimatedCost: 2500, action: "Replace air filter element" },
    { component: "hydraulic_fluid", wearPct: 22, daysToFailure: 195, priority: "low", estimatedCost: 15000, action: "Flush hydraulic system" },
    { component: "tires_tracks", wearPct: 61, daysToFailure: 78, priority: "medium", estimatedCost: 45000, action: "Inspect and replace tires" },
  ]);

  const [marketplaceListings] = useState([
    { id: 1, type: "tractor", brand: "Massey Ferguson", model: "MF385", hp: 85, pricePerHa: 2500, rating: 4.7, bookings: 23, distance: 12 },
    { id: 2, type: "drone", brand: "DJI", model: "Agras T40", pricePerHa: 1500, rating: 4.9, bookings: 45, distance: 8 },
    { id: 3, type: "sprayer", brand: "Jacto", model: "Uniport 3030", hp: 200, pricePerHa: 1800, rating: 4.5, bookings: 12, distance: 25 },
  ]);

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-br from-orange-50 via-yellow-50 to-green-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">🚜 Equipment Fleet</h1>
            <p className="text-sm text-gray-600">Fleet tracking, AB guidance, autosteer, ISOBUS, predictive maintenance, EaaS marketplace</p>
          </div>
          <Link href="/"><a className="text-blue-600">← Dashboard</a></Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-orange-600">{equipment.length}</div><p className="text-sm text-gray-500">Equipment Units</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-green-600">{equipment.filter(e => e.status === "operating").length}</div><p className="text-sm text-gray-500">Currently Operating</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-red-600">{maintenancePredictions.filter(m => m.priority === "high" || m.priority === "critical").length}</div><p className="text-sm text-gray-500">Maintenance Alerts</p></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="text-3xl font-bold text-purple-600">{marketplaceListings.length}</div><p className="text-sm text-gray-500">Available for Hire</p></CardContent></Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="fleet">Fleet Tracking</TabsTrigger>
            <TabsTrigger value="guidance">AB Guidance</TabsTrigger>
            <TabsTrigger value="maintenance">Predictive Maintenance</TabsTrigger>
            <TabsTrigger value="marketplace">Equipment Marketplace</TabsTrigger>
            <TabsTrigger value="isobus">ISOBUS Tasks</TabsTrigger>
          </TabsList>

          <TabsContent value="fleet">
            <Card>
              <CardHeader><CardTitle>Equipment Fleet</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {equipment.map(eq => (
                    <div key={eq.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-semibold">{eq.brand} {eq.model}</span>
                          <span className="ml-2 text-sm text-gray-500">({eq.type}) — {eq.hp} HP</span>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          eq.status === "operating" ? "bg-green-100 text-green-800" :
                          eq.status === "maintenance" ? "bg-red-100 text-red-800" : "bg-gray-100"
                        }`}>{eq.status}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-2 text-sm text-gray-600">
                        <span>🔧 {eq.hours} hrs</span>
                        <span>⛽ {eq.fuel}%</span>
                        <span>🏎️ {eq.speed} km/h</span>
                        <span>📍 {eq.lat.toFixed(3)}, {eq.lon.toFixed(3)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="guidance">
            <Card>
              <CardHeader><CardTitle>AB Line Guidance</CardTitle><CardDescription>Set A-B points for parallel guidance lines. Compatible with AgOpenGPS autosteer.</CardDescription></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="border rounded p-3"><strong>Point A:</strong> Set at field edge start</div>
                  <div className="border rounded p-3"><strong>Point B:</strong> Set at field edge end</div>
                  <div className="border rounded p-3"><strong>Swath Width:</strong> 3-36m (auto from implement)</div>
                  <div className="border rounded p-3"><strong>Headland:</strong> 2-4 passes before interior</div>
                </div>
                <p className="mt-4 text-sm text-gray-500">AgOpenGPS integration: sub-inch RTK accuracy, section control, auto turn on headlands. Works with any tractor using a $200-500 retrofit kit.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="maintenance">
            <Card>
              <CardHeader><CardTitle>Predictive Maintenance</CardTitle><CardDescription>AI-predicted component wear and failure dates</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {maintenancePredictions.map((pred, i) => (
                    <div key={i} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold capitalize">{pred.component.replace("_", " ")}</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          pred.priority === "critical" ? "bg-red-100 text-red-800" :
                          pred.priority === "high" ? "bg-orange-100 text-orange-800" :
                          pred.priority === "medium" ? "bg-yellow-100 text-yellow-800" : "bg-green-100"
                        }`}>{pred.priority}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div className={`rounded-full h-2 ${pred.wearPct > 75 ? "bg-red-500" : pred.wearPct > 50 ? "bg-yellow-500" : "bg-green-500"}`} style={{width: `${pred.wearPct}%`}} />
                        </div>
                        <span className="text-sm">{pred.wearPct}% wear</span>
                      </div>
                      <p className="text-sm text-gray-600">{pred.action} — Est. {formatCurrency(pred.estimatedCost)}</p>
                      <p className="text-xs text-gray-400">{pred.daysToFailure} days until predicted failure</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="marketplace">
            <Card>
              <CardHeader><CardTitle>Equipment-as-a-Service</CardTitle><CardDescription>Hire nearby equipment with operators</CardDescription></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {marketplaceListings.map(listing => (
                    <div key={listing.id} className="border rounded-lg p-4 flex justify-between items-center">
                      <div>
                        <div className="font-semibold">{listing.brand} {listing.model}</div>
                        <div className="text-sm text-gray-500">{listing.type} {listing.hp ? `• ${listing.hp} HP` : ""} • {listing.distance}km away</div>
                        <div className="text-xs text-gray-400">⭐ {listing.rating} ({listing.bookings} bookings)</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">{formatCurrency(listing.pricePerHa)}/ha</div>
                        <button className="mt-1 px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">Book Now</button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="isobus">
            <Card>
              <CardHeader><CardTitle>ISOBUS Tasks (ISO 11783)</CardTitle><CardDescription>Manage implement tasks, prescription maps, and work records</CardDescription></CardHeader>
              <CardContent>
                <div className="text-sm space-y-2">
                  <p>• <strong>TaskController:</strong> Send/receive task data to implements via CAN bus</p>
                  <p>• <strong>Prescription Maps:</strong> Upload variable-rate maps for seeding, spraying, fertilizing</p>
                  <p>• <strong>Work Records:</strong> Automatic logging of what was done, where, when</p>
                  <p>• <strong>ISO-XML:</strong> Import/export task files compatible with all ISOBUS implements</p>
                  <p>• <strong>Section Control:</strong> Automatic section on/off to reduce overlap</p>
                  <p className="mt-4 text-gray-500">Compatible with: John Deere, Case IH, New Holland, Fendt, Massey Ferguson, CLAAS, Amazone, Kverneland</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
