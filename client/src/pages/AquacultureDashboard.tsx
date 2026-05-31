import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

const POND_TYPES = [
  { id: "earthen", label: "Earthen Pond", desc: "Traditional dug-out ponds with natural bottom" },
  { id: "concrete", label: "Concrete Tank", desc: "Lined tanks for intensive culture" },
  { id: "cage", label: "Cage Culture", desc: "Floating cages in open water bodies" },
  { id: "ras", label: "RAS", desc: "Recirculating Aquaculture System — indoor" },
  { id: "plastic_tank", label: "Plastic Tank", desc: "Above-ground mobile/tarpaulin tanks" },
  { id: "raceway", label: "Raceway", desc: "Flow-through channels for cold-water species" },
];

function wqi(params: { ph: number; do_mg_l: number; temp_c: number; ammonia_mg_l: number; nitrite_mg_l: number; turbidity_ntu: number }) {
  const phScore = params.ph >= 6.5 && params.ph <= 8.5 ? 100 : params.ph >= 6 && params.ph <= 9 ? 70 : 30;
  const doScore = params.do_mg_l >= 5 ? 100 : params.do_mg_l >= 3 ? 70 : 30;
  const tempScore = params.temp_c >= 24 && params.temp_c <= 30 ? 100 : params.temp_c >= 18 && params.temp_c <= 34 ? 70 : 30;
  const ammoniaScore = params.ammonia_mg_l <= 0.02 ? 100 : params.ammonia_mg_l <= 0.05 ? 70 : 30;
  const nitriteScore = params.nitrite_mg_l <= 0.05 ? 100 : params.nitrite_mg_l <= 0.1 ? 70 : 30;
  const turbidityScore = params.turbidity_ntu <= 20 ? 100 : params.turbidity_ntu <= 40 ? 70 : 30;
  return Math.round(phScore * 0.2 + doScore * 0.3 + tempScore * 0.2 + ammoniaScore * 0.15 + nitriteScore * 0.1 + turbidityScore * 0.05);
}

function wqiColor(score: number) {
  if (score >= 80) return "text-green-600 bg-green-50";
  if (score >= 60) return "text-yellow-600 bg-yellow-50";
  return "text-red-600 bg-red-50";
}

function wqiLabel(score: number) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Acceptable";
  return "Critical";
}

const FALLBACK_THRESHOLDS: Array<Record<string, unknown>> = [
  { species: "catfish", ph_min: 6.5, ph_max: 8.5, do_min: 3.0, temp_min: 25, temp_max: 32, ammonia_max: 0.05, nitrite_max: 0.1, turbidity_max: 30, salinity_min: 0, salinity_max: 5 },
  { species: "tilapia", ph_min: 6.5, ph_max: 9.0, do_min: 4.0, temp_min: 25, temp_max: 30, ammonia_max: 0.02, nitrite_max: 0.1, turbidity_max: 25, salinity_min: 0, salinity_max: 36 },
  { species: "shrimp", ph_min: 7.5, ph_max: 8.5, do_min: 5.0, temp_min: 26, temp_max: 32, ammonia_max: 0.01, nitrite_max: 0.05, turbidity_max: 15, salinity_min: 15, salinity_max: 35 },
  { species: "trout", ph_min: 6.5, ph_max: 8.0, do_min: 7.0, temp_min: 10, temp_max: 18, ammonia_max: 0.01, nitrite_max: 0.05, turbidity_max: 10, salinity_min: 0, salinity_max: 5 },
  { species: "carp", ph_min: 6.5, ph_max: 9.0, do_min: 3.0, temp_min: 20, temp_max: 28, ammonia_max: 0.05, nitrite_max: 0.1, turbidity_max: 40, salinity_min: 0, salinity_max: 5 },
  { species: "barramundi", ph_min: 7.0, ph_max: 8.5, do_min: 5.0, temp_min: 26, temp_max: 32, ammonia_max: 0.02, nitrite_max: 0.1, turbidity_max: 20, salinity_min: 0, salinity_max: 35 },
];

const DEMO_PONDS = [
  { id: 1, name: "Catfish Pond A", type: "earthen", species: "catfish", area_m2: 500, depth_m: 1.5, stocked: 2000, water: { ph: 7.2, do_mg_l: 5.1, temp_c: 28, ammonia_mg_l: 0.03, nitrite_mg_l: 0.04, turbidity_ntu: 18 } },
  { id: 2, name: "Tilapia Tank B", type: "concrete", species: "tilapia", area_m2: 200, depth_m: 1.2, stocked: 1500, water: { ph: 7.8, do_mg_l: 4.5, temp_c: 27, ammonia_mg_l: 0.02, nitrite_mg_l: 0.06, turbidity_ntu: 15 } },
  { id: 3, name: "Shrimp RAS C", type: "ras", species: "shrimp", area_m2: 100, depth_m: 0.8, stocked: 5000, water: { ph: 8.1, do_mg_l: 6.2, temp_c: 29, ammonia_mg_l: 0.01, nitrite_mg_l: 0.03, turbidity_ntu: 8 } },
  { id: 4, name: "Trout Raceway D", type: "raceway", species: "trout", area_m2: 300, depth_m: 1.0, stocked: 800, water: { ph: 7.0, do_mg_l: 8.5, temp_c: 14, ammonia_mg_l: 0.01, nitrite_mg_l: 0.02, turbidity_ntu: 5 } },
];

export default function AquacultureDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const speciesQuery = trpc.aquaculturePond.listSpeciesThresholds.useQuery(undefined, {
    retry: false, staleTime: 60_000,
  });

  const rawData = speciesQuery.data as { thresholds?: Array<Record<string, unknown>> } | undefined;
  const thresholds = rawData?.thresholds ?? [];
  const totalStock = DEMO_PONDS.reduce((s, p) => s + p.stocked, 0);
  const avgWqi = Math.round(DEMO_PONDS.reduce((s, p) => s + wqi(p.water), 0) / DEMO_PONDS.length);

  return (
    <div role="main" aria-label="Aquaculture Dashboard" className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-teal-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-blue-800">Aquaculture Dashboard</h1>
            <p className="text-sm text-gray-600">Pond management, water quality monitoring, species profiles</p>
          </div>
          <div className="flex gap-2">
            <Link href="/aquaculture/feed"><a className="text-sm text-blue-600 hover:underline">Feed & Harvest</a></Link>
            <Link href="/aquaculture/ai"><a className="text-sm text-blue-600 hover:underline">AI & Disease</a></Link>
            <Link href="/"><a className="text-blue-600">← Dashboard</a></Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">{DEMO_PONDS.length}</div>
              <p className="text-sm text-gray-500">Active Ponds</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-teal-600">{totalStock.toLocaleString()}</div>
              <p className="text-sm text-gray-500">Total Stock</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className={`text-3xl font-bold ${avgWqi >= 80 ? "text-green-600" : avgWqi >= 60 ? "text-yellow-600" : "text-red-600"}`}>{avgWqi}</div>
              <p className="text-sm text-gray-500">Avg Water Quality Index</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-purple-600">{thresholds.length || 6}</div>
              <p className="text-sm text-gray-500">Species Supported</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Pond Overview</TabsTrigger>
            <TabsTrigger value="water">Water Quality</TabsTrigger>
            <TabsTrigger value="species">Species Profiles</TabsTrigger>
            <TabsTrigger value="types">Pond Types</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {DEMO_PONDS.map(pond => {
                const score = wqi(pond.water);
                return (
                  <Card key={pond.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">{pond.name}</CardTitle>
                        <Badge variant="outline" className={wqiColor(score)}>WQI: {score} — {wqiLabel(score)}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-gray-500">Type:</span> <span className="font-medium capitalize">{pond.type}</span></div>
                        <div><span className="text-gray-500">Species:</span> <span className="font-medium capitalize">{pond.species}</span></div>
                        <div><span className="text-gray-500">Area:</span> <span className="font-medium">{pond.area_m2} m²</span></div>
                        <div><span className="text-gray-500">Depth:</span> <span className="font-medium">{pond.depth_m} m</span></div>
                        <div><span className="text-gray-500">Stocked:</span> <span className="font-medium">{pond.stocked.toLocaleString()}</span></div>
                        <div><span className="text-gray-500">Volume:</span> <span className="font-medium">{(pond.area_m2 * pond.depth_m).toFixed(0)} m³</span></div>
                      </div>
                      <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2 text-xs text-gray-600">
                        <div>pH: <span className="font-semibold text-gray-800">{pond.water.ph}</span></div>
                        <div>DO: <span className="font-semibold text-gray-800">{pond.water.do_mg_l} mg/L</span></div>
                        <div>Temp: <span className="font-semibold text-gray-800">{pond.water.temp_c}°C</span></div>
                        <div>NH₃: <span className="font-semibold text-gray-800">{pond.water.ammonia_mg_l} mg/L</span></div>
                        <div>NO₂: <span className="font-semibold text-gray-800">{pond.water.nitrite_mg_l} mg/L</span></div>
                        <div>Turb: <span className="font-semibold text-gray-800">{pond.water.turbidity_ntu} NTU</span></div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="water">
            <Card>
              <CardHeader><CardTitle>Water Quality Readings</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Pond</th>
                        <th className="text-center py-2 px-3">pH</th>
                        <th className="text-center py-2 px-3">DO (mg/L)</th>
                        <th className="text-center py-2 px-3">Temp (°C)</th>
                        <th className="text-center py-2 px-3">NH₃ (mg/L)</th>
                        <th className="text-center py-2 px-3">NO₂ (mg/L)</th>
                        <th className="text-center py-2 px-3">Turbidity</th>
                        <th className="text-center py-2 px-3">WQI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_PONDS.map(pond => {
                        const score = wqi(pond.water);
                        return (
                          <tr key={pond.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium">{pond.name}</td>
                            <td className="text-center py-2 px-3">{pond.water.ph}</td>
                            <td className="text-center py-2 px-3">{pond.water.do_mg_l}</td>
                            <td className="text-center py-2 px-3">{pond.water.temp_c}</td>
                            <td className="text-center py-2 px-3">{pond.water.ammonia_mg_l}</td>
                            <td className="text-center py-2 px-3">{pond.water.nitrite_mg_l}</td>
                            <td className="text-center py-2 px-3">{pond.water.turbidity_ntu}</td>
                            <td className="text-center py-2 px-3">
                              <Badge variant="outline" className={wqiColor(score)}>{score}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h3 className="font-semibold text-blue-800 mb-2">Water Quality Index (WQI) Formula</h3>
                  <p className="text-sm text-blue-700">WQI = pH(20%) + DO(30%) + Temp(20%) + NH₃(15%) + NO₂(10%) + Turbidity(5%)</p>
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="text-green-700">80-100: Excellent</span>
                    <span className="text-yellow-700">60-79: Acceptable</span>
                    <span className="text-red-700">&lt;60: Critical</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="species">
            <Card>
              <CardHeader><CardTitle>Species Water Quality Thresholds</CardTitle></CardHeader>
              <CardContent>
                {speciesQuery.isLoading ? (
                  <p className="text-gray-500">Loading species data from server...</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-3">Species</th>
                          <th className="text-center py-2 px-3">pH Range</th>
                          <th className="text-center py-2 px-3">Min DO</th>
                          <th className="text-center py-2 px-3">Temp Range</th>
                          <th className="text-center py-2 px-3">Max NH₃</th>
                          <th className="text-center py-2 px-3">Max NO₂</th>
                          <th className="text-center py-2 px-3">Max Turbidity</th>
                          <th className="text-center py-2 px-3">Salinity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(thresholds.length > 0 ? thresholds : FALLBACK_THRESHOLDS).map((s) => (
                          <tr key={String(s.species)} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium capitalize">{String(s.species)}</td>
                            <td className="text-center py-2 px-3">{String(s.ph_min)}-{String(s.ph_max)}</td>
                            <td className="text-center py-2 px-3">{String(s.do_min)} mg/L</td>
                            <td className="text-center py-2 px-3">{String(s.temp_min)}-{String(s.temp_max)}°C</td>
                            <td className="text-center py-2 px-3">{String(s.ammonia_max)} mg/L</td>
                            <td className="text-center py-2 px-3">{String(s.nitrite_max)} mg/L</td>
                            <td className="text-center py-2 px-3">{String(s.turbidity_max)} NTU</td>
                            <td className="text-center py-2 px-3">{String(s.salinity_min)}-{String(s.salinity_max)} ppt</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="types">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {POND_TYPES.map(pt => (
                <Card key={pt.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{pt.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600">{pt.desc}</p>
                    <div className="mt-2">
                      <Badge variant="outline" className="text-xs">{pt.id}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
