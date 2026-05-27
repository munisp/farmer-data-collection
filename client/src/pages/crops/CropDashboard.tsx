import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useParams, useLocation } from "wouter";

type CropData = {
  name: string;
  icon: string;
  journeys: string[];
};

type CropMap = {
  [key: string]: CropData;
};

export default function CropDashboard() {
  const params = useParams<{ cropId: string }>();
  const [, setLocation] = useLocation();
  const cropId = params.cropId || "";

  const cropMap: CropMap = {
    ginger: { name: "Ginger", icon: "🫚", journeys: ["Complete Season", "Export", "Climate Insurance"] },
    palm: { name: "Palm Oil", icon: "🌴", journeys: ["Cooperative", "Outgrower", "Biodiesel"] },
    cocoa: { name: "Cocoa", icon: "🍫", journeys: ["Export Certification", "Fair Trade", "Agroforestry"] },
    cassava: { name: "Cassava", icon: "🥔", journeys: ["Value Chain", "Garri Processing", "Ethanol"] },
    yam: { name: "Yam", icon: "🍠", journeys: ["Festival Supply", "Seed Production", "Flour Processing"] },
    rice: { name: "Rice", icon: "🌾", journeys: ["Irrigation Optimization", "Parboiled", "Organic Premium"] },
    maize: { name: "Maize", icon: "🌽", journeys: ["Livestock Feed", "Poultry Integration", "Sweet Corn"] },
    soybean: { name: "Soybean", icon: "🫘", journeys: ["Export Aggregation", "Soy Milk", "Tofu"] },
    groundnut: { name: "Groundnut", icon: "🥜", journeys: ["Oil Processing", "Peanut Butter", "Confectionery"] },
    cotton: { name: "Cotton", icon: "☁️", journeys: ["Textile Integration", "Organic Premium"] },
  };

  const cropData = cropMap[cropId] || { name: "Unknown", icon: "❓", journeys: [] };

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="text-6xl">{cropData.icon}</div>
        <div>
          <h1 className="text-3xl font-bold">{cropData.name} Dashboard</h1>
          <p className="text-muted-foreground">Manage your {cropData.name.toLowerCase()} farming operations</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Active Crops</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">0</div>
            <p className="text-sm text-muted-foreground">Currently growing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Harvest</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">0 tons</div>
            <p className="text-sm text-muted-foreground">This season</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">₦0</div>
            <p className="text-sm text-muted-foreground">Total earnings</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Available Journeys</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {cropData.journeys.map((journey: string, idx: number) => (
              <Card key={idx} className="p-4 cursor-pointer hover:bg-accent" onClick={() => setLocation(`/journeys/${cropId}/${idx}`)}>
                <h3 className="font-semibold mb-2">{journey}</h3>
                <p className="text-sm text-muted-foreground">Click to start this journey</p>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button onClick={() => setLocation("/harvests/new")}>Record New Harvest</Button>
        <Button variant="outline" onClick={() => setLocation("/expenses/new")}>Add Expense</Button>
        <Button variant="outline" onClick={() => setLocation("/marketplace")}>Browse Marketplace</Button>
      </div>
    </div>
  );
}
