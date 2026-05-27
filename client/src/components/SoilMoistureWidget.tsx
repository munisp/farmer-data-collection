import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Droplets, AlertTriangle, CheckCircle, Info, TrendingDown, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

interface SoilMoistureWidgetProps {
  latitude: number;
  longitude: number;
  farmName: string;
  cropType?: string;
  growthStage?: string;
  soilType?: string;
}

export function SoilMoistureWidget({
  latitude,
  longitude,
  farmName,
  cropType = "maize",
  growthStage = "vegetative",
  soilType = "loam",
}: SoilMoistureWidgetProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Fetch current soil moisture
  const { data: moistureData, isLoading: moistureLoading, refetch: refetchMoisture } = 
    (trpc as any).agriculturalIntelligence.getSoilMoisture.useQuery({
      latitude,
      longitude,
    });

  // Fetch irrigation recommendation
  const { data: recommendationData, isLoading: recommendationLoading, refetch: refetchRecommendation } = 
    (trpc as any).agriculturalIntelligence.getIrrigationRecommendation.useQuery({
      latitude,
      longitude,
      cropType,
      growthStage,
      soilType,
    });

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchMoisture(), refetchRecommendation()]);
      toast.success("Soil moisture data updated");
    } catch (error) {
      toast.error("Failed to refresh soil moisture data");
    }
  };

  if (moistureLoading || recommendationLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-blue-500" />
            <CardTitle>Soil Moisture</CardTitle>
          </div>
          <CardDescription>Loading soil moisture data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!moistureData?.data || !recommendationData?.recommendation) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-blue-500" />
            <CardTitle>Soil Moisture</CardTitle>
          </div>
          <CardDescription>Unable to load soil moisture data</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Soil moisture data is currently unavailable for this location.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={handleRefresh}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const soilMoisture = moistureData.data;
  const recommendation = recommendationData.recommendation;

  // Get urgency color and icon
  const getUrgencyStyle = (urgency: string) => {
    switch (urgency) {
      case "critical":
        return { color: "destructive", icon: AlertTriangle, text: "Critical" };
      case "high":
        return { color: "destructive", icon: AlertTriangle, text: "High" };
      case "medium":
        return { color: "default", icon: Info, text: "Medium" };
      case "low":
        return { color: "secondary", icon: CheckCircle, text: "Low" };
      case "none":
        return { color: "secondary", icon: CheckCircle, text: "Optimal" };
      default:
        return { color: "secondary", icon: Info, text: "Unknown" };
    }
  };

  const urgencyStyle = getUrgencyStyle(recommendation.urgency);
  const UrgencyIcon = urgencyStyle.icon;

  // Get moisture level percentage
  const surfaceMoisturePercent = (soilMoisture.surfaceMoisture * 100).toFixed(1);
  const rootZoneMoisturePercent = (soilMoisture.rootZoneMoisture * 100).toFixed(1);

  // Get quality badge color
  const getQualityColor = (quality: string) => {
    switch (quality) {
      case "high":
        return "default";
      case "medium":
        return "secondary";
      case "low":
        return "outline";
      default:
        return "outline";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-blue-500" />
            <CardTitle>Soil Moisture</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            Refresh
          </Button>
        </div>
        <CardDescription>
          Real-time soil moisture monitoring for {farmName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Moisture Levels */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Surface (0-5cm)</span>
              <Badge variant={getQualityColor(soilMoisture.quality)}>
                {soilMoisture.dataSource}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{surfaceMoisturePercent}%</div>
              {parseFloat(surfaceMoisturePercent) < 20 ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingUp className="h-4 w-4 text-green-500" />
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  parseFloat(surfaceMoisturePercent) < 20
                    ? "bg-red-500"
                    : parseFloat(surfaceMoisturePercent) < 30
                    ? "bg-yellow-500"
                    : "bg-green-500"
                }`}
                style={{ width: `${Math.min(parseFloat(surfaceMoisturePercent), 100)}%` }}
              ></div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Root Zone (0-60cm)</span>
              <span className="text-xs text-muted-foreground">
                {new Date(soilMoisture.date).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{rootZoneMoisturePercent}%</div>
              {parseFloat(rootZoneMoisturePercent) < 25 ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingUp className="h-4 w-4 text-green-500" />
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  parseFloat(rootZoneMoisturePercent) < 25
                    ? "bg-red-500"
                    : parseFloat(rootZoneMoisturePercent) < 35
                    ? "bg-yellow-500"
                    : "bg-green-500"
                }`}
                style={{ width: `${Math.min(parseFloat(rootZoneMoisturePercent), 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Irrigation Recommendation */}
        <div className="border-t pt-4">
          <div className="flex items-start gap-3">
            <UrgencyIcon className={`h-5 w-5 mt-0.5 ${
              recommendation.urgency === "critical" || recommendation.urgency === "high"
                ? "text-red-500"
                : recommendation.urgency === "medium"
                ? "text-yellow-500"
                : "text-green-500"
            }`} />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {recommendation.shouldIrrigate ? "Irrigation Needed" : "No Irrigation Needed"}
                </span>
                <Badge variant={urgencyStyle.color as any}>
                  {urgencyStyle.text} Priority
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {recommendation.reason}
              </p>
              {recommendation.shouldIrrigate && (
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="font-medium">Amount:</span>{" "}
                    <span className="text-blue-600 font-semibold">
                      {recommendation.recommendedAmount} mm
                    </span>
                  </div>
                  <div>
                    <span className="font-medium">Next Check:</span>{" "}
                    {new Date(recommendation.nextCheckDate).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Additional Details Toggle */}
        <div className="border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full"
          >
            {showDetails ? "Hide Details" : "Show Details"}
          </Button>
          
          {showDetails && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-medium">Soil Temperature:</span>{" "}
                  {soilMoisture.soilTemperature}°C
                </div>
                <div>
                  <span className="font-medium">Data Quality:</span>{" "}
                  <Badge variant={getQualityColor(soilMoisture.quality)}>
                    {soilMoisture.quality}
                  </Badge>
                </div>
                <div>
                  <span className="font-medium">Crop Type:</span> {cropType}
                </div>
                <div>
                  <span className="font-medium">Growth Stage:</span> {growthStage}
                </div>
                <div>
                  <span className="font-medium">Soil Type:</span> {soilType}
                </div>
                <div>
                  <span className="font-medium">Data Source:</span> {soilMoisture.dataSource}
                </div>
              </div>
              
              <div className="bg-blue-50 p-3 rounded-md">
                <p className="text-xs text-blue-900">
                  <strong>💡 Tip:</strong> Soil moisture data is updated every 2-3 days from NASA SMAP satellite. 
                  For real-time monitoring, consider installing soil moisture sensors in your field.
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
