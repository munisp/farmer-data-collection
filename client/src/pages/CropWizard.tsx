import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter";

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
  const [, setLocation] = useLocation();
  const [selectedCrop, setSelectedCrop] = useState<string | null>(null);

  return (
    <div role="main" aria-label="Page content" className="container mx-auto py-8">
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
            onClick={() => setLocation(`/crops/${selectedCrop}`)}
          >
            Continue with {CROPS.find(c => c.id === selectedCrop)?.name}
          </Button>
        </div>
      )}
    </div>
  );
}
