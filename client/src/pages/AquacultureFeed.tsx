import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

interface SpeciesProfile {
  name: string;
  scientific_name: string;
  market_weight_g: number;
  grow_out_days: number;
  optimal_fcr: number;
  max_density_per_m3: number;
  optimal_protein_pct: number;
  feed_rate_pct: number;
  optimal_temp_min: number;
  optimal_temp_max: number;
  growth_rate_g_day: number;
  survival_rate_pct: number;
  market_price_per_kg: number;
  currency: string;
}

const FALLBACK_SPECIES: SpeciesProfile[] = [
  { name: "African Catfish (Clarias)", scientific_name: "Clarias gariepinus", market_weight_g: 1000, grow_out_days: 180, optimal_fcr: 1.2, max_density_per_m3: 100, optimal_protein_pct: 35, feed_rate_pct: 3.0, optimal_temp_min: 25, optimal_temp_max: 32, growth_rate_g_day: 5.5, survival_rate_pct: 85, market_price_per_kg: 1800, currency: "NGN" },
  { name: "Nile Tilapia", scientific_name: "Oreochromis niloticus", market_weight_g: 500, grow_out_days: 150, optimal_fcr: 1.5, max_density_per_m3: 80, optimal_protein_pct: 30, feed_rate_pct: 2.5, optimal_temp_min: 25, optimal_temp_max: 30, growth_rate_g_day: 3.3, survival_rate_pct: 90, market_price_per_kg: 2000, currency: "NGN" },
  { name: "Giant Tiger Prawn", scientific_name: "Penaeus monodon", market_weight_g: 30, grow_out_days: 120, optimal_fcr: 1.8, max_density_per_m3: 25, optimal_protein_pct: 40, feed_rate_pct: 5.0, optimal_temp_min: 26, optimal_temp_max: 32, growth_rate_g_day: 0.25, survival_rate_pct: 75, market_price_per_kg: 5000, currency: "NGN" },
  { name: "Rainbow Trout", scientific_name: "Oncorhynchus mykiss", market_weight_g: 350, grow_out_days: 270, optimal_fcr: 1.3, max_density_per_m3: 40, optimal_protein_pct: 42, feed_rate_pct: 2.0, optimal_temp_min: 10, optimal_temp_max: 18, growth_rate_g_day: 1.3, survival_rate_pct: 88, market_price_per_kg: 3500, currency: "NGN" },
  { name: "Common Carp", scientific_name: "Cyprinus carpio", market_weight_g: 800, grow_out_days: 240, optimal_fcr: 1.6, max_density_per_m3: 60, optimal_protein_pct: 28, feed_rate_pct: 2.5, optimal_temp_min: 20, optimal_temp_max: 28, growth_rate_g_day: 3.3, survival_rate_pct: 92, market_price_per_kg: 1500, currency: "NGN" },
  { name: "Barramundi", scientific_name: "Lates calcarifer", market_weight_g: 600, grow_out_days: 180, optimal_fcr: 1.4, max_density_per_m3: 50, optimal_protein_pct: 45, feed_rate_pct: 3.0, optimal_temp_min: 26, optimal_temp_max: 32, growth_rate_g_day: 3.3, survival_rate_pct: 82, market_price_per_kg: 4000, currency: "NGN" },
];

const DEMO_STOCKING = [
  { id: 1, pond: "Catfish Pond A", species: "catfish", quantity: 2000, avg_weight_g: 5, date: "2025-01-15", supplier: "Lagos Hatchery", batch: "CAT-2025-001" },
  { id: 2, pond: "Tilapia Tank B", species: "tilapia", quantity: 1500, avg_weight_g: 3, date: "2025-02-01", supplier: "Ibadan Fingerlings", batch: "TIL-2025-001" },
  { id: 3, pond: "Shrimp RAS C", species: "shrimp", quantity: 5000, avg_weight_g: 0.5, date: "2025-02-15", supplier: "Coastal Aqua Hatchery", batch: "SHR-2025-001" },
];

const DEMO_FEED_LOG = [
  { id: 1, pond: "Catfish Pond A", date: "2025-05-27", type: "floating_pellets", protein_pct: 35, amount_kg: 45, cost_per_kg: 850, batch: "CAT-2025-001" },
  { id: 2, pond: "Tilapia Tank B", date: "2025-05-27", type: "floating_pellets", protein_pct: 30, amount_kg: 28, cost_per_kg: 780, batch: "TIL-2025-001" },
  { id: 3, pond: "Shrimp RAS C", date: "2025-05-27", type: "sinking_crumble", protein_pct: 40, amount_kg: 12, cost_per_kg: 1200, batch: "SHR-2025-001" },
  { id: 4, pond: "Catfish Pond A", date: "2025-05-26", type: "floating_pellets", protein_pct: 35, amount_kg: 44, cost_per_kg: 850, batch: "CAT-2025-001" },
  { id: 5, pond: "Tilapia Tank B", date: "2025-05-26", type: "floating_pellets", protein_pct: 30, amount_kg: 27, cost_per_kg: 780, batch: "TIL-2025-001" },
];

const DEMO_HARVEST = [
  { id: 1, pond: "Catfish Pond A", species: "catfish", quantity: 1700, total_weight_kg: 1530, avg_weight_g: 900, grade_a_pct: 60, grade_b_pct: 30, grade_c_pct: 10, date: "2025-07-15", price_per_kg: 1800 },
  { id: 2, pond: "Tilapia Tank B", species: "tilapia", quantity: 1350, total_weight_kg: 607, avg_weight_g: 450, grade_a_pct: 55, grade_b_pct: 35, grade_c_pct: 10, date: "2025-07-01", price_per_kg: 2000 },
];

function fcrColor(fcr: number, optimal: number) {
  const ratio = fcr / optimal;
  if (ratio <= 1.1) return "text-green-600 bg-green-50";
  if (ratio <= 1.3) return "text-yellow-600 bg-yellow-50";
  return "text-red-600 bg-red-50";
}

export default function AquacultureFeed() {
  const [activeTab, setActiveTab] = useState("species");

  const speciesQuery = trpc.aquacultureFeed.listSpecies.useQuery(undefined, {
    retry: false, staleTime: 60_000,
  });

  const species: SpeciesProfile[] = (speciesQuery.data as SpeciesProfile[] | undefined) ?? FALLBACK_SPECIES;
  const totalFeedToday = DEMO_FEED_LOG.filter(f => f.date === "2025-05-27").reduce((s, f) => s + f.amount_kg, 0);
  const totalFeedCost = DEMO_FEED_LOG.filter(f => f.date === "2025-05-27").reduce((s, f) => s + f.amount_kg * f.cost_per_kg, 0);
  const totalHarvestRevenue = DEMO_HARVEST.reduce((s, h) => s + h.total_weight_kg * h.price_per_kg, 0);

  return (
    <div role="main" aria-label="Aquaculture Feed & Harvest" className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-amber-800">Feed & Harvest Management</h1>
            <p className="text-sm text-gray-600">Feed tracking, FCR optimization, stocking records, harvest analytics</p>
          </div>
          <div className="flex gap-2">
            <Link href="/aquaculture"><a className="text-sm text-blue-600 hover:underline">Ponds</a></Link>
            <Link href="/aquaculture/ai"><a className="text-sm text-blue-600 hover:underline">AI & Disease</a></Link>
            <Link href="/"><a className="text-blue-600">← Dashboard</a></Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-amber-600">{species.length}</div>
              <p className="text-sm text-gray-500">Species Profiles</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-orange-600">{totalFeedToday} kg</div>
              <p className="text-sm text-gray-500">Feed Today</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600">{(totalFeedCost / 1000).toFixed(0)}K</div>
              <p className="text-sm text-gray-500">Feed Cost (NGN)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">{(totalHarvestRevenue / 1_000_000).toFixed(1)}M</div>
              <p className="text-sm text-gray-500">Harvest Revenue (NGN)</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="species">Species Profiles</TabsTrigger>
            <TabsTrigger value="feed">Feed Log</TabsTrigger>
            <TabsTrigger value="stocking">Stocking Records</TabsTrigger>
            <TabsTrigger value="harvest">Harvest Data</TabsTrigger>
          </TabsList>

          <TabsContent value="species">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {species.map((sp) => (
                <Card key={sp.name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{sp.name}</CardTitle>
                    <p className="text-xs text-gray-500 italic">{sp.scientific_name}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-y-1 text-sm">
                      <div className="text-gray-500">Market Weight</div>
                      <div className="font-medium">{sp.market_weight_g}g</div>
                      <div className="text-gray-500">Grow-out</div>
                      <div className="font-medium">{sp.grow_out_days} days</div>
                      <div className="text-gray-500">Optimal FCR</div>
                      <div className="font-medium">{sp.optimal_fcr}</div>
                      <div className="text-gray-500">Max Density</div>
                      <div className="font-medium">{sp.max_density_per_m3}/m³</div>
                      <div className="text-gray-500">Protein</div>
                      <div className="font-medium">{sp.optimal_protein_pct}%</div>
                      <div className="text-gray-500">Feed Rate</div>
                      <div className="font-medium">{sp.feed_rate_pct}% BW/day</div>
                      <div className="text-gray-500">Growth Rate</div>
                      <div className="font-medium">{sp.growth_rate_g_day} g/day</div>
                      <div className="text-gray-500">Survival</div>
                      <div className="font-medium">{sp.survival_rate_pct}%</div>
                      <div className="text-gray-500">Temp Range</div>
                      <div className="font-medium">{sp.optimal_temp_min}-{sp.optimal_temp_max}°C</div>
                      <div className="text-gray-500">Price</div>
                      <div className="font-medium">{sp.market_price_per_kg.toLocaleString()} {sp.currency}/kg</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="feed">
            <Card>
              <CardHeader><CardTitle>Daily Feed Log</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Date</th>
                        <th className="text-left py-2 px-3">Pond</th>
                        <th className="text-left py-2 px-3">Feed Type</th>
                        <th className="text-center py-2 px-3">Protein %</th>
                        <th className="text-center py-2 px-3">Amount (kg)</th>
                        <th className="text-center py-2 px-3">Cost/kg</th>
                        <th className="text-center py-2 px-3">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_FEED_LOG.map(f => (
                        <tr key={f.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3">{f.date}</td>
                          <td className="py-2 px-3 font-medium">{f.pond}</td>
                          <td className="py-2 px-3 capitalize">{f.type.replace(/_/g, " ")}</td>
                          <td className="text-center py-2 px-3">{f.protein_pct}%</td>
                          <td className="text-center py-2 px-3">{f.amount_kg}</td>
                          <td className="text-center py-2 px-3">{f.cost_per_kg.toLocaleString()}</td>
                          <td className="text-center py-2 px-3 font-medium">{(f.amount_kg * f.cost_per_kg).toLocaleString()} NGN</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stocking">
            <Card>
              <CardHeader><CardTitle>Stocking Records</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {DEMO_STOCKING.map(s => (
                    <Card key={s.id} className="bg-blue-50 border-blue-200">
                      <CardContent className="pt-4">
                        <div className="font-semibold text-blue-800 mb-2">{s.pond}</div>
                        <div className="grid grid-cols-2 gap-1 text-sm">
                          <div className="text-gray-500">Species</div>
                          <div className="capitalize font-medium">{s.species}</div>
                          <div className="text-gray-500">Quantity</div>
                          <div className="font-medium">{s.quantity.toLocaleString()}</div>
                          <div className="text-gray-500">Avg Weight</div>
                          <div className="font-medium">{s.avg_weight_g}g</div>
                          <div className="text-gray-500">Date</div>
                          <div className="font-medium">{s.date}</div>
                          <div className="text-gray-500">Supplier</div>
                          <div className="font-medium text-xs">{s.supplier}</div>
                          <div className="text-gray-500">Batch</div>
                          <div><Badge variant="outline" className="text-xs">{s.batch}</Badge></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="harvest">
            <Card>
              <CardHeader><CardTitle>Harvest Records</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Pond</th>
                        <th className="text-left py-2 px-3">Species</th>
                        <th className="text-center py-2 px-3">Count</th>
                        <th className="text-center py-2 px-3">Total (kg)</th>
                        <th className="text-center py-2 px-3">Avg (g)</th>
                        <th className="text-center py-2 px-3">Grade A</th>
                        <th className="text-center py-2 px-3">Grade B</th>
                        <th className="text-center py-2 px-3">Grade C</th>
                        <th className="text-center py-2 px-3">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_HARVEST.map(h => (
                        <tr key={h.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium">{h.pond}</td>
                          <td className="py-2 px-3 capitalize">{h.species}</td>
                          <td className="text-center py-2 px-3">{h.quantity.toLocaleString()}</td>
                          <td className="text-center py-2 px-3">{h.total_weight_kg.toLocaleString()}</td>
                          <td className="text-center py-2 px-3">{h.avg_weight_g}</td>
                          <td className="text-center py-2 px-3"><Badge className="bg-green-100 text-green-800">{h.grade_a_pct}%</Badge></td>
                          <td className="text-center py-2 px-3"><Badge className="bg-yellow-100 text-yellow-800">{h.grade_b_pct}%</Badge></td>
                          <td className="text-center py-2 px-3"><Badge className="bg-red-100 text-red-800">{h.grade_c_pct}%</Badge></td>
                          <td className="text-center py-2 px-3 font-medium">{(h.total_weight_kg * h.price_per_kg / 1_000_000).toFixed(2)}M NGN</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-6 p-4 bg-amber-50 rounded-lg">
                  <h3 className="font-semibold text-amber-800 mb-2">Harvest Grading</h3>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-700">Grade A: Above market weight</span>
                    <span className="text-yellow-700">Grade B: 70-100% market weight</span>
                    <span className="text-red-700">Grade C: Below 70% market weight</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
