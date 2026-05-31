import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

interface Disease {
  id: string;
  name: string;
  type: string;
  pathogen: string;
  species: string[];
  symptoms: string[];
  mortality_rate: number;
  recovery_days: number;
}

const FALLBACK_DISEASES: Disease[] = [
  { id: "columnaris", name: "Columnaris (Cotton Wool Disease)", type: "bacterial", pathogen: "Flavobacterium columnare", species: ["catfish", "tilapia", "carp", "barramundi"], symptoms: ["white patches on skin", "frayed fins", "gill necrosis", "lethargy", "loss of appetite"], mortality_rate: 0.30, recovery_days: 14 },
  { id: "ich", name: "White Spot Disease (Ich)", type: "parasitic", pathogen: "Ichthyophthirius multifiliis", species: ["catfish", "tilapia", "carp", "trout", "barramundi"], symptoms: ["white spots on body", "flashing/scratching", "clamped fins", "rapid gill movement"], mortality_rate: 0.50, recovery_days: 21 },
  { id: "eus", name: "Epizootic Ulcerative Syndrome", type: "fungal", pathogen: "Aphanomyces invadans", species: ["catfish", "tilapia", "carp", "barramundi"], symptoms: ["red spots/ulcers", "deep lesions", "necrotic tissue", "secondary infections"], mortality_rate: 0.40, recovery_days: 28 },
  { id: "saprolegnia", name: "Saprolegniasis (Water Mold)", type: "fungal", pathogen: "Saprolegnia spp.", species: ["catfish", "tilapia", "trout", "carp"], symptoms: ["cotton-like growth", "white/grey patches", "egg fungus", "gill damage"], mortality_rate: 0.20, recovery_days: 10 },
  { id: "vibriosis", name: "Vibriosis", type: "bacterial", pathogen: "Vibrio spp.", species: ["shrimp", "barramundi", "tilapia"], symptoms: ["lethargy", "dark coloration", "hemorrhages", "swollen abdomen", "mass mortality"], mortality_rate: 0.60, recovery_days: 14 },
  { id: "white_spot_shrimp", name: "White Spot Syndrome (WSSV)", type: "viral", pathogen: "White Spot Syndrome Virus", species: ["shrimp"], symptoms: ["white spots on carapace", "red discoloration", "loose shell", "rapid death"], mortality_rate: 0.90, recovery_days: 0 },
  { id: "aeromonas", name: "Motile Aeromonas Septicemia", type: "bacterial", pathogen: "Aeromonas hydrophila", species: ["catfish", "tilapia", "carp"], symptoms: ["hemorrhages", "ulcers", "ascites", "exophthalmia", "fin rot"], mortality_rate: 0.35, recovery_days: 14 },
  { id: "streptococcosis", name: "Streptococcosis", type: "bacterial", pathogen: "Streptococcus iniae / agalactiae", species: ["tilapia", "barramundi"], symptoms: ["erratic swimming", "exophthalmia", "darkening", "hemorrhages"], mortality_rate: 0.45, recovery_days: 21 },
];

const GROWTH_PHASES = [
  { species: "African Catfish (Clarias)", phases: [
    { phase: "Fry", days: "0-30", weight: "5-30g", protein: "45%", feed_rate: "10%" },
    { phase: "Fingerling", days: "30-60", weight: "30-100g", protein: "40%", feed_rate: "5%" },
    { phase: "Juvenile", days: "60-120", weight: "100-400g", protein: "35%", feed_rate: "3.5%" },
    { phase: "Grower", days: "120-180", weight: "400-1000g", protein: "32%", feed_rate: "2.5%" },
  ]},
  { species: "Nile Tilapia", phases: [
    { phase: "Fry", days: "0-28", weight: "1-15g", protein: "40%", feed_rate: "12%" },
    { phase: "Fingerling", days: "28-56", weight: "15-80g", protein: "35%", feed_rate: "5%" },
    { phase: "Juvenile", days: "56-100", weight: "80-250g", protein: "30%", feed_rate: "3%" },
    { phase: "Grower", days: "100-150", weight: "250-500g", protein: "28%", feed_rate: "2.5%" },
  ]},
  { species: "Giant Tiger Prawn", phases: [
    { phase: "Post-Larva", days: "0-30", weight: "0.01-2g", protein: "45%", feed_rate: "20%" },
    { phase: "Juvenile", days: "30-60", weight: "2-10g", protein: "40%", feed_rate: "10%" },
    { phase: "Sub-Adult", days: "60-90", weight: "10-20g", protein: "38%", feed_rate: "5%" },
    { phase: "Market", days: "90-120", weight: "20-30g", protein: "35%", feed_rate: "3%" },
  ]},
];

const HATCHERY_PROFILES = [
  { species: "Catfish", eggs_per_kg: 40000, fertilization_pct: 75, hatching_pct: 70, fry_survival_pct: 60, incubation_hours: 24, temp_c: 28 },
  { species: "Tilapia", eggs_per_kg: 3000, fertilization_pct: 90, hatching_pct: 85, fry_survival_pct: 80, incubation_hours: 72, temp_c: 28 },
  { species: "Shrimp", eggs_per_kg: 800000, fertilization_pct: 70, hatching_pct: 60, fry_survival_pct: 40, incubation_hours: 14, temp_c: 29 },
  { species: "Trout", eggs_per_kg: 2000, fertilization_pct: 92, hatching_pct: 88, fry_survival_pct: 75, incubation_hours: 720, temp_c: 10 },
  { species: "Carp", eggs_per_kg: 100000, fertilization_pct: 80, hatching_pct: 75, fry_survival_pct: 50, incubation_hours: 48, temp_c: 24 },
  { species: "Barramundi", eggs_per_kg: 500000, fertilization_pct: 65, hatching_pct: 55, fry_survival_pct: 30, incubation_hours: 18, temp_c: 28 },
];

function mortalityColor(rate: number) {
  if (rate <= 0.3) return "bg-yellow-100 text-yellow-800";
  if (rate <= 0.5) return "bg-orange-100 text-orange-800";
  return "bg-red-100 text-red-800";
}

function typeColor(type: string) {
  switch (type) {
    case "bacterial": return "bg-red-100 text-red-800";
    case "viral": return "bg-purple-100 text-purple-800";
    case "parasitic": return "bg-blue-100 text-blue-800";
    case "fungal": return "bg-green-100 text-green-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

export default function AquacultureAI() {
  const [activeTab, setActiveTab] = useState("diseases");

  const diseasesQuery = trpc.aquacultureAI.listDiseases.useQuery(undefined, {
    retry: false, staleTime: 60_000,
  });

  const diseases: Disease[] = (diseasesQuery.data as Disease[] | undefined) ?? FALLBACK_DISEASES;
  const bacterial = diseases.filter(d => d.type === "bacterial").length;
  const viral = diseases.filter(d => d.type === "viral").length;
  const fungal = diseases.filter(d => d.type === "fungal").length;
  const parasitic = diseases.filter(d => d.type === "parasitic").length;

  return (
    <div role="main" aria-label="Aquaculture AI" className="min-h-screen bg-gradient-to-br from-purple-50 via-indigo-50 to-violet-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-purple-800">Fish Health & AI</h1>
            <p className="text-sm text-gray-600">Disease diagnosis, growth prediction, hatchery management</p>
          </div>
          <div className="flex gap-2">
            <Link href="/aquaculture"><a className="text-sm text-blue-600 hover:underline">Ponds</a></Link>
            <Link href="/aquaculture/feed"><a className="text-sm text-blue-600 hover:underline">Feed & Harvest</a></Link>
            <Link href="/"><a className="text-blue-600">← Dashboard</a></Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-red-600">{bacterial}</div>
              <p className="text-sm text-gray-500">Bacterial Diseases</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-purple-600">{viral}</div>
              <p className="text-sm text-gray-500">Viral Diseases</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600">{fungal}</div>
              <p className="text-sm text-gray-500">Fungal Diseases</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">{parasitic}</div>
              <p className="text-sm text-gray-500">Parasitic Diseases</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="diseases">Disease Database</TabsTrigger>
            <TabsTrigger value="growth">Growth Models</TabsTrigger>
            <TabsTrigger value="hatchery">Hatchery Profiles</TabsTrigger>
          </TabsList>

          <TabsContent value="diseases">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {diseases.map(disease => (
                <Card key={disease.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{disease.name}</CardTitle>
                      <Badge className={typeColor(disease.type)}>{disease.type}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 italic">{disease.pathogen}</p>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-3">
                      <span className="text-xs text-gray-500 block mb-1">Affected Species:</span>
                      <div className="flex flex-wrap gap-1">
                        {disease.species.map(sp => (
                          <Badge key={sp} variant="outline" className="text-xs capitalize">{sp}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="mb-3">
                      <span className="text-xs text-gray-500 block mb-1">Symptoms:</span>
                      <div className="flex flex-wrap gap-1">
                        {disease.symptoms.map(sym => (
                          <span key={sym} className="text-xs bg-gray-100 px-2 py-0.5 rounded">{sym}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Mortality: </span>
                        <Badge className={mortalityColor(disease.mortality_rate)}>
                          {(disease.mortality_rate * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      <div>
                        <span className="text-gray-500">Recovery: </span>
                        <span className="font-medium">{disease.recovery_days > 0 ? `${disease.recovery_days} days` : "No recovery"}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="growth">
            <div className="space-y-6">
              {GROWTH_PHASES.map(gp => (
                <Card key={gp.species}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{gp.species} — Growth Phases</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3">Phase</th>
                            <th className="text-center py-2 px-3">Days</th>
                            <th className="text-center py-2 px-3">Weight Range</th>
                            <th className="text-center py-2 px-3">Protein %</th>
                            <th className="text-center py-2 px-3">Feed Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gp.phases.map(phase => (
                            <tr key={phase.phase} className="border-b hover:bg-gray-50">
                              <td className="py-2 px-3 font-medium">{phase.phase}</td>
                              <td className="text-center py-2 px-3">{phase.days}</td>
                              <td className="text-center py-2 px-3">{phase.weight}</td>
                              <td className="text-center py-2 px-3">{phase.protein}</td>
                              <td className="text-center py-2 px-3">{phase.feed_rate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 p-3 bg-indigo-50 rounded text-xs text-indigo-700">
                      Growth model: von Bertalanffy equation with temperature adjustment factor
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="hatchery">
            <Card>
              <CardHeader><CardTitle>Hatchery Production Profiles</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3">Species</th>
                        <th className="text-center py-2 px-3">Eggs/kg</th>
                        <th className="text-center py-2 px-3">Fertilization</th>
                        <th className="text-center py-2 px-3">Hatching</th>
                        <th className="text-center py-2 px-3">Fry Survival</th>
                        <th className="text-center py-2 px-3">Incubation</th>
                        <th className="text-center py-2 px-3">Temp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {HATCHERY_PROFILES.map(hp => (
                        <tr key={hp.species} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3 font-medium">{hp.species}</td>
                          <td className="text-center py-2 px-3">{hp.eggs_per_kg.toLocaleString()}</td>
                          <td className="text-center py-2 px-3">
                            <Badge className={hp.fertilization_pct >= 80 ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                              {hp.fertilization_pct}%
                            </Badge>
                          </td>
                          <td className="text-center py-2 px-3">
                            <Badge className={hp.hatching_pct >= 75 ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
                              {hp.hatching_pct}%
                            </Badge>
                          </td>
                          <td className="text-center py-2 px-3">
                            <Badge className={hp.fry_survival_pct >= 60 ? "bg-green-100 text-green-800" : hp.fry_survival_pct >= 40 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}>
                              {hp.fry_survival_pct}%
                            </Badge>
                          </td>
                          <td className="text-center py-2 px-3">{hp.incubation_hours}h</td>
                          <td className="text-center py-2 px-3">{hp.temp_c}°C</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                  <h3 className="font-semibold text-purple-800 mb-2">Hatchery Yield Estimation</h3>
                  <p className="text-sm text-purple-700">Fry Output = (Female Weight × Eggs/kg) × Fertilization Rate × Hatching Rate × Fry Survival Rate</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
