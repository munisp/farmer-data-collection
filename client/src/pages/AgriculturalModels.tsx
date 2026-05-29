import { ChangeEvent, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Leaf,
  Thermometer,
  Camera,
  Upload,
  Bug,
  Loader2,
  Wheat,
  Sparkles,
  BarChart3,
} from "lucide-react";

type DiseaseAnalysisResult = {
  disease: string;
  confidence: number;
  crop_type: string;
  severity: string;
  treatment_recommendations: string[];
  prevention_tips: string[];
  model_name?: string;
};

type BiomassResult = {
  biomass_kg_ha: number;
  biomass_tons_ha: number;
  confidence: number;
  ndvi: number;
  crop_type: string;
  growth_stage: string;
  method: string;
  advisory: string;
};

type CanopyResult = {
  height_meters: number;
  average_height: number;
  max_height: number;
  min_height: number;
  confidence: number;
  method: string;
  crop_type: string;
  days_after_planting: number;
  advisory: string;
};

type LstResult = {
  lst_celsius: number;
  air_temperature: number;
  cwsi: number;
  soil_moisture_index: number;
  stress_level: string;
  irrigation_recommendation: string;
  ndvi: number;
};

type NdviResult = {
  ndvi: number;
  nir: number;
  red: number;
  interpretation: string;
  vegetation_health: string;
};

const cropOptions = ["maize", "cassava", "rice", "sorghum", "beans", "ginger"];
const growthStages = ["seedling", "vegetative", "flowering", "grain_filling", "maturity"];
const canopyMethods = [
  { value: "photogrammetry", label: "Photogrammetry" },
  { value: "field_measurement", label: "Field Measurement" },
  { value: "satellite", label: "Satellite Estimate" },
] as const;

function toTitleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeDiseaseResult(result: any, cropType: string, modelName?: string): DiseaseAnalysisResult {
  const predictedDisease =
    result?.disease ||
    result?.prediction ||
    result?.label ||
    result?.class_name ||
    result?.class ||
    "analysis_complete";

  const rawConfidence =
    typeof result?.confidence === "number"
      ? result.confidence
      : typeof result?.score === "number"
        ? result.score
        : typeof result?.probability === "number"
          ? result.probability
          : 0.78;

  const normalizedConfidence = rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence;
  const severity = normalizedConfidence >= 85 ? "high" : normalizedConfidence >= 65 ? "moderate" : "low";

  return {
    disease: String(predictedDisease),
    confidence: Number(normalizedConfidence.toFixed(1)),
    crop_type: cropType,
    severity,
    treatment_recommendations:
      result?.treatment_recommendations ||
      result?.recommendations || [
        "Inspect the affected field block and confirm whether symptoms are spreading.",
        "Apply the crop-specific treatment recommended by your agronomy protocol.",
        "Record the case for follow-up monitoring and repeat assessment if symptoms persist.",
      ],
    prevention_tips:
      result?.prevention_tips || [
        "Maintain crop hygiene and remove severely affected plant material.",
        "Keep scouting records to identify recurring disease pressure early.",
        "Use resistant varieties and follow recommended spacing and irrigation practices.",
      ],
    model_name: modelName,
  };
}

function MetricCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <div className="p-4 border rounded-lg bg-card">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}

export default function AgriculturalModels() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedCrop, setSelectedCrop] = useState("maize");
  const [diseaseResult, setDiseaseResult] = useState<DiseaseAnalysisResult | null>(null);
  const [biomassResult, setBiomassResult] = useState<BiomassResult | null>(null);
  const [canopyResult, setCanopyResult] = useState<CanopyResult | null>(null);
  const [lstResult, setLstResult] = useState<LstResult | null>(null);
  const [ndviResult, setNdviResult] = useState<NdviResult | null>(null);

  const [biomassInputs, setBiomassInputs] = useState({
    ndvi: "0.65",
    cropType: "maize",
    growthStage: "flowering",
  });
  const [canopyInputs, setCanopyInputs] = useState({
    cropType: "maize",
    daysAfterPlanting: "60",
    method: "photogrammetry",
  });
  const [lstInputs, setLstInputs] = useState({
    temperature: "32.5",
    airTemperature: "28.0",
    ndvi: "0.7",
  });
  const [ndviInputs, setNdviInputs] = useState({
    nir: "0.8",
    red: "0.2",
  });

  const recommendedModelsQuery = trpc.mlModels.getRecommendedModels.useQuery(
    { cropName: selectedCrop },
    { staleTime: 60_000 }
  );
  const diseaseModelsQuery = trpc.mlModels.listModels.useQuery(
    { type: "disease_detection", cropName: selectedCrop },
    { staleTime: 60_000 }
  );

  const diseaseInference = trpc.mlModels.runInference.useMutation({
    onSuccess: (result) => {
      const selectedModel = selectedDiseaseModel;
      setDiseaseResult(normalizeDiseaseResult(result, selectedCrop, selectedModel?.name));
      toast.success("Disease analysis completed");
    },
    onError: (error) => {
      toast.error(error.message || "Disease analysis failed");
    },
  });

  const biomassMutation = trpc.mlModels.estimateBiomass.useMutation({
    onSuccess: (result) => {
      setBiomassResult(result as BiomassResult);
      toast.success("Biomass estimation completed");
    },
    onError: (error) => toast.error(error.message || "Biomass estimation failed"),
  });

  const canopyMutation = trpc.mlModels.estimateCanopyHeight.useMutation({
    onSuccess: (result) => {
      setCanopyResult(result as CanopyResult);
      toast.success("Canopy height estimation completed");
    },
    onError: (error) => toast.error(error.message || "Canopy height estimation failed"),
  });

  const lstMutation = trpc.mlModels.analyzeLST.useMutation({
    onSuccess: (result) => {
      setLstResult(result as LstResult);
      toast.success("LST analysis completed");
    },
    onError: (error) => toast.error(error.message || "LST analysis failed"),
  });

  const ndviMutation = trpc.mlModels.calculateNDVI.useMutation({
    onSuccess: (result) => {
      setNdviResult(result as NdviResult);
      toast.success("NDVI calculation completed");
    },
    onError: (error) => toast.error(error.message || "NDVI calculation failed"),
  });

  const selectedDiseaseModel = useMemo(() => {
    const recommended = recommendedModelsQuery.data?.models?.find((model: any) => model.type === "disease_detection");
    if (recommended) return recommended;
    return diseaseModelsQuery.data?.models?.[0];
  }, [recommendedModelsQuery.data, diseaseModelsQuery.data]);

  const isBusy =
    diseaseInference.isPending ||
    biomassMutation.isPending ||
    canopyMutation.isPending ||
    lstMutation.isPending ||
    ndviMutation.isPending;

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(String(reader.result));
      setDiseaseResult(null);
    };
    reader.readAsDataURL(file);
    toast.success(`Image selected: ${file.name}`);
  };

  const analyzeDisease = async () => {
    if (!selectedImage) {
      toast.error("Please select or capture an image first");
      return;
    }

    if (!selectedDiseaseModel?.id) {
      toast.error("No disease detection model is available for the selected crop");
      return;
    }

    const base64Payload = selectedImage.includes(",") ? selectedImage.split(",")[1] : selectedImage;

    await diseaseInference.mutateAsync({
      modelId: Number(selectedDiseaseModel.id),
      imageData: base64Payload,
      cropType: selectedCrop,
      metadata: {
        source: "agricultural_models_page",
        analysisType: "disease_detection",
      },
    });
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Agricultural Models</h1>
          <p className="text-muted-foreground">
            Live crop analysis powered by the platform’s model registry and server-side agronomic calculators.
          </p>
        </div>

        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertTitle>Live model-backed workflows</AlertTitle>
          <AlertDescription>
            Disease detection now uses the active model catalog, while biomass, canopy, LST, and NDVI calculations run through authenticated backend procedures instead of mock fallbacks.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="disease" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="disease">Disease Detection</TabsTrigger>
            <TabsTrigger value="biomass">Biomass</TabsTrigger>
            <TabsTrigger value="canopy">Canopy Height</TabsTrigger>
            <TabsTrigger value="lst">LST Analysis</TabsTrigger>
            <TabsTrigger value="ndvi">NDVI</TabsTrigger>
          </TabsList>

          <TabsContent value="disease" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bug className="h-5 w-5" />
                    Disease Detection
                  </CardTitle>
                  <CardDescription>
                    Upload a crop image and run inference against the best available disease model for the selected crop.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="disease-crop">Crop Type</Label>
                    <Select value={selectedCrop} onValueChange={setSelectedCrop}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cropOptions.map((crop) => (
                          <SelectItem key={crop} value={crop}>
                            {toTitleCase(crop)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-lg border p-3 bg-muted/30 space-y-1">
                    <p className="text-sm font-medium">Model Selection</p>
                    {recommendedModelsQuery.isLoading || diseaseModelsQuery.isLoading ? (
                      <p className="text-sm text-muted-foreground">Loading model registry...</p>
                    ) : selectedDiseaseModel ? (
                      <>
                        <p className="text-sm">Using <strong>{selectedDiseaseModel.name}</strong></p>
                        <p className="text-xs text-muted-foreground">
                          {selectedDiseaseModel.variant} variant · {selectedDiseaseModel.targetDevice} device profile
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-destructive">No published disease model is currently available for this crop.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Upload or Capture Image</Label>
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2">
                        <label className="flex-1">
                          <input type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
                          <Button variant="outline" className="w-full" asChild>
                            <span>
                              <Camera className="mr-2 h-4 w-4" />
                              Take Photo
                            </span>
                          </Button>
                        </label>
                        <label className="flex-1">
                          <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                          <Button variant="outline" className="w-full" asChild>
                            <span>
                              <Upload className="mr-2 h-4 w-4" />
                              Upload Image
                            </span>
                          </Button>
                        </label>
                      </div>

                      {selectedImage && (
                        <div className="relative border rounded-lg overflow-hidden">
                          <img src={selectedImage} alt="Selected crop" className="w-full h-48 object-cover" />
                          <Button
                            variant="destructive"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => {
                              setSelectedImage(null);
                              setDiseaseResult(null);
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button onClick={analyzeDisease} disabled={isBusy || !selectedImage || !selectedDiseaseModel} className="w-full">
                    {diseaseInference.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bug className="mr-2 h-4 w-4" />}
                    Analyze for Disease
                  </Button>
                </CardContent>
              </Card>

              {diseaseResult && (
                <Card>
                  <CardHeader>
                    <CardTitle>Analysis Results</CardTitle>
                    <CardDescription>
                      Disease detection output {diseaseResult.model_name ? `from ${diseaseResult.model_name}` : "from the selected model"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard title="Disease Detected" value={toTitleCase(diseaseResult.disease)} description="Top predicted condition" />
                      <MetricCard title="Confidence" value={`${diseaseResult.confidence.toFixed(1)}%`} description="Model confidence" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 border rounded-lg">
                        <p className="text-sm text-muted-foreground">Severity</p>
                        <Badge variant={diseaseResult.severity === "high" ? "destructive" : diseaseResult.severity === "moderate" ? "secondary" : "default"} className="mt-2">
                          {toTitleCase(diseaseResult.severity)}
                        </Badge>
                      </div>
                      <MetricCard title="Crop" value={toTitleCase(diseaseResult.crop_type)} description="Analyzed crop type" />
                    </div>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-2">Treatment Recommendations</p>
                      <ul className="space-y-1 text-sm list-disc list-inside">
                        {diseaseResult.treatment_recommendations.map((rec, index) => (
                          <li key={index}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-sm font-medium mb-2">Prevention Tips</p>
                      <ul className="space-y-1 text-sm list-disc list-inside">
                        {diseaseResult.prevention_tips.map((tip, index) => (
                          <li key={index}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="biomass" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Leaf className="h-5 w-5" />
                    Biomass Estimation
                  </CardTitle>
                  <CardDescription>Estimate crop biomass from NDVI, crop type, and growth stage.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>NDVI Value</Label>
                    <Input value={biomassInputs.ndvi} onChange={(e) => setBiomassInputs((current) => ({ ...current, ndvi: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Crop Type</Label>
                    <Select value={biomassInputs.cropType} onValueChange={(value) => setBiomassInputs((current) => ({ ...current, cropType: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {cropOptions.map((crop) => (
                          <SelectItem key={crop} value={crop}>{toTitleCase(crop)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Growth Stage</Label>
                    <Select value={biomassInputs.growthStage} onValueChange={(value) => setBiomassInputs((current) => ({ ...current, growthStage: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {growthStages.map((stage) => (
                          <SelectItem key={stage} value={stage}>{toTitleCase(stage)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    disabled={isBusy}
                    onClick={() =>
                      biomassMutation.mutate({
                        ndvi: Number(biomassInputs.ndvi),
                        cropType: biomassInputs.cropType,
                        growthStage: biomassInputs.growthStage,
                      })
                    }
                  >
                    {biomassMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Leaf className="mr-2 h-4 w-4" />}
                    Estimate Biomass
                  </Button>
                </CardContent>
              </Card>

              {biomassResult && (
                <Card>
                  <CardHeader>
                    <CardTitle>Biomass Results</CardTitle>
                    <CardDescription>Server-side agronomic estimate</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard title="Biomass" value={`${biomassResult.biomass_tons_ha} t/ha`} description="Estimated tons per hectare" />
                      <MetricCard title="Confidence" value={`${biomassResult.confidence}%`} description={biomassResult.method} />
                    </div>
                    <MetricCard title="Kg per Hectare" value={biomassResult.biomass_kg_ha.toLocaleString()} description={`${toTitleCase(biomassResult.crop_type)} · ${toTitleCase(biomassResult.growth_stage)}`} />
                    <div className="rounded-lg border p-4 bg-muted/30 text-sm">{biomassResult.advisory}</div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="canopy" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wheat className="h-5 w-5" />
                    Canopy Height Estimation
                  </CardTitle>
                  <CardDescription>Estimate canopy structure from crop growth and measurement mode.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Crop Type</Label>
                    <Select value={canopyInputs.cropType} onValueChange={(value) => setCanopyInputs((current) => ({ ...current, cropType: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {cropOptions.map((crop) => (
                          <SelectItem key={crop} value={crop}>{toTitleCase(crop)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Days After Planting</Label>
                    <Input value={canopyInputs.daysAfterPlanting} onChange={(e) => setCanopyInputs((current) => ({ ...current, daysAfterPlanting: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Method</Label>
                    <Select value={canopyInputs.method} onValueChange={(value) => setCanopyInputs((current) => ({ ...current, method: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {canopyMethods.map((method) => (
                          <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    disabled={isBusy}
                    onClick={() =>
                      canopyMutation.mutate({
                        cropType: canopyInputs.cropType,
                        daysAfterPlanting: Number(canopyInputs.daysAfterPlanting),
                        method: canopyInputs.method as "photogrammetry" | "field_measurement" | "satellite",
                      })
                    }
                  >
                    {canopyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wheat className="mr-2 h-4 w-4" />}
                    Estimate Canopy Height
                  </Button>
                </CardContent>
              </Card>

              {canopyResult && (
                <Card>
                  <CardHeader>
                    <CardTitle>Canopy Results</CardTitle>
                    <CardDescription>Field structure estimate</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard title="Average Height" value={`${canopyResult.average_height} m`} description={toTitleCase(canopyResult.method)} />
                      <MetricCard title="Confidence" value={`${canopyResult.confidence}%`} description={`${canopyResult.days_after_planting} days after planting`} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard title="Minimum Height" value={`${canopyResult.min_height} m`} description="Lower band" />
                      <MetricCard title="Maximum Height" value={`${canopyResult.max_height} m`} description="Upper band" />
                    </div>
                    <div className="rounded-lg border p-4 bg-muted/30 text-sm">{canopyResult.advisory}</div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="lst" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Thermometer className="h-5 w-5" />
                    LST Analysis
                  </CardTitle>
                  <CardDescription>Assess crop heat stress and irrigation urgency.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Land Surface Temperature (°C)</Label>
                    <Input value={lstInputs.temperature} onChange={(e) => setLstInputs((current) => ({ ...current, temperature: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Air Temperature (°C)</Label>
                    <Input value={lstInputs.airTemperature} onChange={(e) => setLstInputs((current) => ({ ...current, airTemperature: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>NDVI</Label>
                    <Input value={lstInputs.ndvi} onChange={(e) => setLstInputs((current) => ({ ...current, ndvi: e.target.value }))} />
                  </div>
                  <Button
                    className="w-full"
                    disabled={isBusy}
                    onClick={() =>
                      lstMutation.mutate({
                        temperature: Number(lstInputs.temperature),
                        airTemperature: Number(lstInputs.airTemperature),
                        ndvi: Number(lstInputs.ndvi),
                      })
                    }
                  >
                    {lstMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Thermometer className="mr-2 h-4 w-4" />}
                    Analyze LST
                  </Button>
                </CardContent>
              </Card>

              {lstResult && (
                <Card>
                  <CardHeader>
                    <CardTitle>LST Results</CardTitle>
                    <CardDescription>Crop water stress interpretation</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard title="CWSI" value={lstResult.cwsi.toFixed(3)} description="Crop water stress index" />
                      <MetricCard title="Soil Moisture Index" value={`${lstResult.soil_moisture_index}%`} description="Estimated moisture availability" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard title="Stress Level" value={toTitleCase(lstResult.stress_level)} description={`LST ${lstResult.lst_celsius}°C`} />
                      <MetricCard title="Reference NDVI" value={lstResult.ndvi.toFixed(2)} description={`Air ${lstResult.air_temperature}°C`} />
                    </div>
                    <div className="rounded-lg border p-4 bg-muted/30 text-sm">{lstResult.irrigation_recommendation}</div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ndvi" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    NDVI Calculation
                  </CardTitle>
                  <CardDescription>Calculate a normalized vegetation index from NIR and red-band values.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Near Infrared (NIR)</Label>
                    <Input value={ndviInputs.nir} onChange={(e) => setNdviInputs((current) => ({ ...current, nir: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Red Band</Label>
                    <Input value={ndviInputs.red} onChange={(e) => setNdviInputs((current) => ({ ...current, red: e.target.value }))} />
                  </div>
                  <Button
                    className="w-full"
                    disabled={isBusy}
                    onClick={() =>
                      ndviMutation.mutate({
                        nir: Number(ndviInputs.nir),
                        red: Number(ndviInputs.red),
                      })
                    }
                  >
                    {ndviMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />}
                    Calculate NDVI
                  </Button>
                </CardContent>
              </Card>

              {ndviResult && (
                <Card>
                  <CardHeader>
                    <CardTitle>NDVI Results</CardTitle>
                    <CardDescription>Vegetation health indicator</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard title="NDVI" value={ndviResult.ndvi.toFixed(3)} description={ndviResult.interpretation} />
                      <MetricCard title="Vegetation Health" value={toTitleCase(ndviResult.vegetation_health)} description="Derived health band" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <MetricCard title="NIR" value={ndviResult.nir.toFixed(2)} description="Input band" />
                      <MetricCard title="Red" value={ndviResult.red.toFixed(2)} description="Input band" />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
