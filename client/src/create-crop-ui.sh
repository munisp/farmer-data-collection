#!/bin/bash

# Create Crop Selection Wizard
cat > pages/CropWizard.tsx << 'EOF'
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "wouter";

const CROPS = [
  { id: "ginger", name: "Ginger", icon: "🫚", color: "bg-yellow-500" },
  { id: "palm", name: "Palm Oil", icon: "🌴", color: "bg-green-600" },
  { id: "cocoa", name: "Cocoa", icon: "🍫", color: "bg-brown-600" },
  { id: "cassava", name: "Cassava", icon: "🥔", color: "bg-amber-700" },
  { id: "yam", name: "Yam", icon: "🍠", color: "bg-purple-600" },
  { id: "rice", name: "Rice", icon: "🌾", color: "bg-green-500" },
  { id: "maize", name: "Maize", icon: "🌽", color: "bg-yellow-600" },
  { id: "soybean", name: "Soybean", icon: "🫘", color: "bg-green-700" },
  { id: "groundnut", name: "Groundnut", icon: "🥜", color: "bg-orange-600" },
  { id: "cotton", name: "Cotton", icon: "☁️", color: "bg-blue-100" },
];

export default function CropWizard() {
  const [, navigate] = useNavigate();
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null);

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-2">Select Your Crop</h1>
      <p className="text-muted-foreground mb-8">
        Choose the crop you want to manage and we'll guide you through the best practices
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {CROPS.map((crop) => (
          <Card
            key={crop.id}
            className={`p-6 cursor-pointer transition-all hover:scale-105 ${
              selectedCrop === crop.id ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setSelectedCrop(crop.id)}
          >
            <div className="text-center">
              <div className="text-5xl mb-2">{crop.icon}</div>
              <div className="font-semibold">{crop.name}</div>
            </div>
          </Card>
        ))}
      </div>

      {selectedCrop && (
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={() => navigate(`/crops/${selectedCrop}`)}
          >
            Continue with {CROPS.find(c => c.id === selectedCrop)?.name}
          </Button>
        </div>
      )}
    </div>
  );
}
EOF

# Create Generic Crop Dashboard Template
cat > pages/crops/CropDashboard.tsx << 'EOF'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useParams, useNavigate } from "wouter";

export default function CropDashboard() {
  const params = useParams();
  const [, navigate] = useNavigate();
  const cropId = params.cropId;

  const cropData = {
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
  }[cropId] || { name: "Unknown", icon: "❓", journeys: [] };

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
            {cropData.journeys.map((journey, idx) => (
              <Card key={idx} className="p-4 cursor-pointer hover:bg-accent" onClick={() => navigate(`/journeys/${cropId}/${idx}`)}>
                <h3 className="font-semibold mb-2">{journey}</h3>
                <p className="text-sm text-muted-foreground">Click to start this journey</p>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button onClick={() => navigate("/harvests/new")}>Record New Harvest</Button>
        <Button variant="outline" onClick={() => navigate("/expenses/new")}>Add Expense</Button>
        <Button variant="outline" onClick={() => navigate("/marketplace")}>Browse Marketplace</Button>
      </div>
    </div>
  );
}
EOF

# Create Journey Tracking Page
cat > pages/journeys/JourneyTracker.tsx << 'EOF'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useParams } from "wouter";

export default function JourneyTracker() {
  const params = useParams();
  const { cropId, journeyId } = params;

  const journeySteps = [
    { id: 1, name: "Land Preparation", status: "completed", progress: 100 },
    { id: 2, name: "Planting", status: "completed", progress: 100 },
    { id: 3, name: "Fertilizer Application", status: "in_progress", progress: 60 },
    { id: 4, name: "Pest Control", status: "pending", progress: 0 },
    { id: 5, name: "Harvest", status: "pending", progress: 0 },
    { id: 6, name: "Post-Harvest Processing", status: "pending", progress: 0 },
    { id: 7, name: "Marketing & Sale", status: "pending", progress: 0 },
  ];

  const overallProgress = journeySteps.reduce((sum, step) => sum + step.progress, 0) / journeySteps.length;

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-2">Journey Progress</h1>
      <p className="text-muted-foreground mb-8">Track your farming journey from planting to sale</p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Overall Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={overallProgress} className="mb-2" />
          <p className="text-sm text-muted-foreground">{Math.round(overallProgress)}% complete</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {journeySteps.map((step) => (
          <Card key={step.id} className={step.status === "in_progress" ? "border-primary" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {step.id}. {step.name}
                </CardTitle>
                <span className={`px-3 py-1 rounded-full text-sm ${
                  step.status === "completed" ? "bg-green-100 text-green-800" :
                  step.status === "in_progress" ? "bg-blue-100 text-blue-800" :
                  "bg-gray-100 text-gray-800"
                }`}>
                  {step.status.replace("_", " ")}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <Progress value={step.progress} className="mb-4" />
              {step.status === "in_progress" && (
                <Button size="sm">Continue Step</Button>
              )}
              {step.status === "pending" && (
                <Button size="sm" variant="outline" disabled>Not Started</Button>
              )}
              {step.status === "completed" && (
                <Button size="sm" variant="ghost">View Details</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
EOF

echo "PWA crop UI created successfully!"
