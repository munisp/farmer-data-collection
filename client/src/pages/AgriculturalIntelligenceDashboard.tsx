/**
 * Agricultural Intelligence Dashboard
 * 
 * Integrates soil moisture monitoring, GDD tracking, and pest/disease risk assessment
 */

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { CropCalendar } from "@/components/CropCalendar";
import { SoilMoistureMonitor } from "@/components/SoilMoistureMonitor";
import { PestDiseaseRiskPanel } from "@/components/PestDiseaseRiskPanel";
import GDDHistoryChart from "@/components/GDDHistoryChart";
import SoilMoistureHistoryChart from "@/components/SoilMoistureHistoryChart";
import PestDiseaseHistoryChart from "@/components/PestDiseaseHistoryChart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Sprout, Droplets, Bug } from "lucide-react";
import { toast } from "sonner";

export default function AgriculturalIntelligenceDashboard() {
  const [selectedCropId, setSelectedCropId] = useState<number | null>(null);
  const [selectedFarmId, setSelectedFarmId] = useState<number | null>(null);
  const [weatherData, setWeatherData] = useState({
    temperature: 28,
    humidity: 75,
    rainfall: 85,
  });

  const { data: crops = [], isLoading: cropsLoading } = trpc.agriculturalIntelligence.listUserCrops.useQuery();

  const normalizedCrops = useMemo(
    () => crops.map((crop) => ({
      ...crop,
      plantingDate: crop.plantingDate ? new Date(crop.plantingDate) : null,
    })),
    [crops]
  );

  // Fetch GDD status for selected crop
  const {
    data: gddStatus,
    isLoading: gddLoading,
    refetch: refetchGDD,
  } = trpc.agriculturalIntelligence.getCropGrowthStatus.useQuery(
    { cropId: selectedCropId! },
    { enabled: !!selectedCropId }
  );

  // Fetch soil moisture for selected farm
  const {
    data: soilMoistureData,
    isLoading: soilLoading,
    refetch: refetchSoil,
  } = trpc.agriculturalIntelligence.getSoilMoisture.useQuery(
    { farmId: selectedFarmId! },
    { enabled: !!selectedFarmId }
  );

  // Fetch irrigation recommendation
  const {
    data: irrigationRec,
    isLoading: irrigationLoading,
    refetch: refetchIrrigation,
  } = trpc.agriculturalIntelligence.getIrrigationRecommendation.useQuery(
    {
      farmId: selectedFarmId!,
      cropType: normalizedCrops.find(c => c.id === selectedCropId)?.cropName.toLowerCase() as any || "maize",
      soilType: "loamy",
      growthStage: "vegetative",
    },
    { enabled: !!selectedFarmId && !!selectedCropId }
  );

  // Fetch pest/disease risks
  const {
    data: pestRisks,
    isLoading: risksLoading,
    refetch: refetchRisks,
  } = trpc.agriculturalIntelligence.getCropRisks.useQuery(
    {
      cropId: selectedCropId!,
      weather: weatherData,
    },
    { enabled: !!selectedCropId }
  );

  // Fetch IPM recommendations
  const {
    data: ipmRecs,
    isLoading: ipmLoading,
  } = trpc.agriculturalIntelligence.getIPMRecommendations.useQuery(
    {
      cropId: selectedCropId!,
      weather: weatherData,
      growthStage: gddStatus?.currentStage || "vegetative",
    },
    { enabled: !!selectedCropId && !!gddStatus }
  );

  const handleRefreshAll = async () => {
    toast.info("Refreshing all data...");
    await Promise.all([
      refetchGDD(),
      refetchSoil(),
      refetchIrrigation(),
      refetchRisks(),
    ]);
    toast.success("Data refreshed successfully");
  };

  const selectedCrop = normalizedCrops.find(c => c.id === selectedCropId);

  return (
    <div role="main" aria-label="Page content" className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agricultural Intelligence</h1>
          <p className="text-muted-foreground">
            Smart farming insights powered by satellite data and weather analysis
          </p>
        </div>
        <Button onClick={handleRefreshAll} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh All
        </Button>
      </div>

      {/* Crop Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Crop</CardTitle>
          <CardDescription>Choose a crop to view intelligence data</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedCropId?.toString()}
            onValueChange={(value) => {
              const cropId = parseInt(value);
              setSelectedCropId(cropId);
              const crop = normalizedCrops.find(c => c.id === cropId);
              if (crop) {
                setSelectedFarmId(crop.farmId);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a crop" />
            </SelectTrigger>
            <SelectContent>
              {normalizedCrops.map((crop) => (
                <SelectItem key={crop.id} value={crop.id.toString()}>
                  {crop.cropName} (Planted: {crop.plantingDate ? crop.plantingDate.toLocaleDateString() : "Unknown"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedCropId && selectedCrop && (
        <>
          {/* Mobile View - Tabs */}
          <div className="lg:hidden">
            <Tabs defaultValue="gdd" className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="gdd">
                  <Sprout className="h-4 w-4 mr-2" />
                  GDD
                </TabsTrigger>
                <TabsTrigger value="moisture">
                  <Droplets className="h-4 w-4 mr-2" />
                  Moisture
                </TabsTrigger>
                <TabsTrigger value="risks">
                  <Bug className="h-4 w-4 mr-2" />
                  Risks
                </TabsTrigger>
              </TabsList>

              <TabsContent value="gdd">
                <CropCalendar
                  cropName={selectedCrop.cropName}
                  growthStatus={gddStatus || null}
                  loading={gddLoading}
                />
              </TabsContent>

              <TabsContent value="moisture">
                <SoilMoistureMonitor
                  soilMoisture={soilMoistureData || null}
                  recommendation={irrigationRec?.recommendation || null}
                  loading={soilLoading || irrigationLoading}
                  onRefresh={() => {
                    refetchSoil();
                    refetchIrrigation();
                  }}
                />
              </TabsContent>

              <TabsContent value="risks">
                <PestDiseaseRiskPanel
                  risks={pestRisks || []}
                  ipmRecommendations={ipmRecs}
                  loading={risksLoading || ipmLoading}
                  onRefresh={refetchRisks}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Desktop View - Grid */}
          <div className="hidden lg:grid lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              <CropCalendar
                cropName={selectedCrop.cropName}
                growthStatus={gddStatus || null}
                loading={gddLoading}
              />
              
              <SoilMoistureMonitor
                soilMoisture={soilMoistureData || null}
                recommendation={irrigationRec?.recommendation || null}
                loading={soilLoading || irrigationLoading}
                onRefresh={() => {
                  refetchSoil();
                  refetchIrrigation();
                }}
              />
            </div>

            {/* Right Column */}
            <div>
              <PestDiseaseRiskPanel
                risks={pestRisks || []}
                ipmRecommendations={ipmRecs}
                loading={risksLoading || ipmLoading}
                onRefresh={refetchRisks}
              />
            </div>
          </div>

          {/* Historical Tracking Charts */}
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Historical Tracking</h2>
            
            {/* GDD History */}
            <GDDHistoryChart
              data={[
                // Mock data - replace with actual historical data from database
                { date: "Nov 6", cumulativeGDD: 120, dailyGDD: 8.5, growthStage: "Emergence" },
                { date: "Nov 13", cumulativeGDD: 185, dailyGDD: 9.2, growthStage: "Vegetative" },
                { date: "Nov 20", cumulativeGDD: 248, dailyGDD: 9.0, growthStage: "Vegetative" },
                { date: "Nov 26", cumulativeGDD: 302, dailyGDD: 9.0, growthStage: "Vegetative" },
              ]}
              cropName={selectedCrop.cropName}
              targetGDD={1400}
            />

            {/* Soil Moisture History */}
            <SoilMoistureHistoryChart
              data={[
                // Mock data - replace with actual historical data from database
                { date: "Nov 6", moistureLevel: 65, temperature: 24, depth: 30 },
                { date: "Nov 13", moistureLevel: 52, temperature: 25, depth: 30 },
                { date: "Nov 20", moistureLevel: 38, temperature: 26, depth: 30 },
                { date: "Nov 26", moistureLevel: 28, temperature: 27, depth: 30 },
              ]}
              farmName={"Farm"}
              soilType="loamy"
            />

            {/* Pest/Disease Risk History */}
            <PestDiseaseHistoryChart
              data={[
                // Mock data - replace with actual historical data from database
                { date: "Nov 6", riskLevel: 45, pestType: "Fall Armyworm", temperature: 28, humidity: 70, rainfall: 20 },
                { date: "Nov 13", riskLevel: 62, pestType: "Stem Borer", temperature: 29, humidity: 75, rainfall: 35 },
                { date: "Nov 20", riskLevel: 78, pestType: "Fall Armyworm", temperature: 30, humidity: 80, rainfall: 45 },
                { date: "Nov 26", riskLevel: 85, pestType: "Leaf Blight", diseaseType: "Leaf Blight", temperature: 28, humidity: 85, rainfall: 60 },
              ]}
              farmName={"Farm"}
              cropName={selectedCrop.cropName}
            />
          </div>

          {/* Weather Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Current Weather Conditions</CardTitle>
              <CardDescription>Used for risk assessment calculations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm text-muted-foreground">Temperature</p>
                  <p className="text-2xl font-bold">{weatherData.temperature}°C</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Humidity</p>
                  <p className="text-2xl font-bold">{weatherData.humidity}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Weekly Rainfall</p>
                  <p className="text-2xl font-bold">{weatherData.rainfall}mm</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!selectedCropId && (
        <Card>
          <CardContent className="py-12 text-center">
            <Sprout className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-lg font-medium mb-2">No Crop Selected</p>
            <p className="text-sm text-muted-foreground">
              Select a crop above to view agricultural intelligence insights
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
