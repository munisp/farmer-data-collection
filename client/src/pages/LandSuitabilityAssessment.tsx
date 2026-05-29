import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Leaf, 
  Droplets, 
  Thermometer, 
  Mountain, 
  DollarSign, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Info,
  Search,
  BarChart3
} from "lucide-react";

type SuitabilityCategory = 'highly_suitable' | 'suitable' | 'moderately_suitable' | 'marginally_suitable' | 'not_suitable';

interface SuitabilityResult {
  cropName: string;
  cropId: string;
  score: {
    overall: number;
    soil: number;
    climate: number;
    topography: number;
    category: SuitabilityCategory;
  };
  amendments: Array<{
    parameter: string;
    currentValue: number | string;
    requiredValue: number | string;
    recommendation: string;
    estimatedCost: number;
    priority: 'high' | 'medium' | 'low';
  }>;
  limitations: string[];
  advantages: string[];
  economics: {
    establishmentCost: number;
    yearsToFirstHarvest: number;
    expectedYield: number;
    expectedRevenue: number;
    roi5Year: number;
  };
  recommendations: string[];
}

const getSuitabilityColor = (category: SuitabilityCategory) => {
  switch (category) {
    case 'highly_suitable': return 'bg-green-500';
    case 'suitable': return 'bg-green-400';
    case 'moderately_suitable': return 'bg-yellow-500';
    case 'marginally_suitable': return 'bg-orange-500';
    case 'not_suitable': return 'bg-red-500';
  }
};

const getSuitabilityLabel = (category: SuitabilityCategory) => {
  switch (category) {
    case 'highly_suitable': return 'Highly Suitable';
    case 'suitable': return 'Suitable';
    case 'moderately_suitable': return 'Moderately Suitable';
    case 'marginally_suitable': return 'Marginally Suitable';
    case 'not_suitable': return 'Not Suitable';
  }
};

const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
  switch (priority) {
    case 'high': return 'bg-red-100 text-red-800';
    case 'medium': return 'bg-yellow-100 text-yellow-800';
    case 'low': return 'bg-green-100 text-green-800';
  }
};

export default function LandSuitabilityAssessment() {
  const [activeTab, setActiveTab] = useState("assess");
  const [selectedCrop, setSelectedCrop] = useState("");
  const [assessmentResult, setAssessmentResult] = useState<SuitabilityResult | null>(null);
  const [suitableCropsResult, setSuitableCropsResult] = useState<{ results: SuitabilityResult[]; totalCropsAnalyzed: number; suitableCrops: number } | null>(null);
  
  // Form state for soil data
  const [soilData, setSoilData] = useState({
    ph: 6.5,
    texture: "loamy",
    organicMatter: 2.5,
    drainage: "well_drained" as const,
    depth: 100,
    salinity: "low" as const,
  });
  
  // Form state for climate data
  const [climateData, setClimateData] = useState({
    avgTemperature: 27,
    minTemperature: 22,
    maxTemperature: 35,
    annualRainfall: 1500,
    avgHumidity: 70,
    hasFrost: false,
    drySeasonMonths: 3,
  });
  
  // Form state for topography data
  const [topographyData, setTopographyData] = useState({
    slope: 5,
    altitude: 200,
    floodRisk: false,
  });
  
  const [fieldAreaHa, setFieldAreaHa] = useState(1);

  // Fetch all crops
  const { data: crops } = trpc.landSuitability.getAllCrops.useQuery();

  // Fetch crop categories
  const { data: categories } = trpc.landSuitability.getCropCategories.useQuery();

  // Assess for specific crop mutation
  const assessMutation = trpc.landSuitability.assessForCrop.useMutation({
    onSuccess: (data) => {
      setAssessmentResult(data);
    },
  });

  // Find suitable crops mutation
  const findSuitableMutation = trpc.landSuitability.findSuitableCrops.useMutation({
    onSuccess: (data) => {
      setSuitableCropsResult(data);
    },
  });

  const handleAssess = () => {
    if (selectedCrop) {
      assessMutation.mutate({
        cropId: selectedCrop,
        soil: soilData,
        climate: climateData,
        topography: topographyData,
        fieldAreaHa,
      });
    }
  };

  const handleFindSuitable = () => {
    findSuitableMutation.mutate({
      soil: soilData,
      climate: climateData,
      topography: topographyData,
      fieldAreaHa,
      minScore: 40,
    });
  };

  return (
    <div role="main" aria-label="Page content" className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Leaf className="h-8 w-8 text-green-600" />
            Land Suitability Assessment
          </h1>
          <p className="text-muted-foreground mt-1">
            Determine if your land is suitable for specific crops like palm trees, cocoa, coffee, and more
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="assess">Assess for Crop</TabsTrigger>
          <TabsTrigger value="find">Find Suitable Crops</TabsTrigger>
          <TabsTrigger value="compare">Compare Crops</TabsTrigger>
        </TabsList>

        <TabsContent value="assess" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input Form */}
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Select Crop
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedCrop} onValueChange={setSelectedCrop}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a crop to assess" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((cat: { category: string; crops: Array<{ id: string; name: string }> }) => (
                        <div key={cat.category}>
                          <div className="px-2 py-1 text-sm font-semibold text-muted-foreground">
                            {cat.category}
                          </div>
                          {cat.crops.map((crop: { id: string; name: string }) => (
                            <SelectItem key={crop.id} value={crop.id}>
                              {crop.name}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Droplets className="h-5 w-5" />
                    Soil Data
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="ph">Soil pH</Label>
                      <Input
                        id="ph"
                        type="number"
                        step="0.1"
                        min="0"
                        max="14"
                        value={soilData.ph}
                        onChange={(e) => setSoilData({ ...soilData, ph: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="organicMatter">Organic Matter (%)</Label>
                      <Input
                        id="organicMatter"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={soilData.organicMatter}
                        onChange={(e) => setSoilData({ ...soilData, organicMatter: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="texture">Soil Texture</Label>
                    <Select value={soilData.texture} onValueChange={(v) => setSoilData({ ...soilData, texture: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandy">Sandy</SelectItem>
                        <SelectItem value="sandy_loam">Sandy Loam</SelectItem>
                        <SelectItem value="loamy">Loamy</SelectItem>
                        <SelectItem value="clay_loam">Clay Loam</SelectItem>
                        <SelectItem value="clay">Clay</SelectItem>
                        <SelectItem value="silty">Silty</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="drainage">Drainage</Label>
                    <Select value={soilData.drainage} onValueChange={(v: any) => setSoilData({ ...soilData, drainage: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="well_drained">Well Drained</SelectItem>
                        <SelectItem value="moderate">Moderate</SelectItem>
                        <SelectItem value="poor">Poor</SelectItem>
                        <SelectItem value="waterlogged">Waterlogged</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="depth">Soil Depth (cm)</Label>
                    <Input
                      id="depth"
                      type="number"
                      min="0"
                      value={soilData.depth}
                      onChange={(e) => setSoilData({ ...soilData, depth: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Thermometer className="h-5 w-5" />
                    Climate Data
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="avgTemp">Avg Temp (C)</Label>
                      <Input
                        id="avgTemp"
                        type="number"
                        value={climateData.avgTemperature}
                        onChange={(e) => setClimateData({ ...climateData, avgTemperature: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="rainfall">Rainfall (mm/yr)</Label>
                      <Input
                        id="rainfall"
                        type="number"
                        value={climateData.annualRainfall}
                        onChange={(e) => setClimateData({ ...climateData, annualRainfall: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="humidity">Avg Humidity (%)</Label>
                    <Input
                      id="humidity"
                      type="number"
                      min="0"
                      max="100"
                      value={climateData.avgHumidity}
                      onChange={(e) => setClimateData({ ...climateData, avgHumidity: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mountain className="h-5 w-5" />
                    Topography
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="slope">Slope (%)</Label>
                      <Input
                        id="slope"
                        type="number"
                        min="0"
                        max="100"
                        value={topographyData.slope}
                        onChange={(e) => setTopographyData({ ...topographyData, slope: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="altitude">Altitude (m)</Label>
                      <Input
                        id="altitude"
                        type="number"
                        value={topographyData.altitude}
                        onChange={(e) => setTopographyData({ ...topographyData, altitude: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="fieldArea">Field Area (hectares)</Label>
                    <Input
                      id="fieldArea"
                      type="number"
                      step="0.1"
                      min="0.01"
                      value={fieldAreaHa}
                      onChange={(e) => setFieldAreaHa(parseFloat(e.target.value) || 1)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Button 
                className="w-full" 
                size="lg"
                onClick={handleAssess}
                disabled={!selectedCrop || assessMutation.isPending}
              >
                {assessMutation.isPending ? "Analyzing..." : "Assess Land Suitability"}
              </Button>
            </div>

            {/* Results */}
            <div className="lg:col-span-2">
              {assessmentResult ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-2xl">{assessmentResult.cropName}</CardTitle>
                        <Badge className={getSuitabilityColor(assessmentResult.score.category)}>
                          {getSuitabilityLabel(assessmentResult.score.category)}
                        </Badge>
                      </div>
                      <CardDescription>
                        Overall Suitability Score: {assessmentResult.score.overall}/100
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Overall Score</span>
                            <span>{assessmentResult.score.overall}%</span>
                          </div>
                          <Progress value={assessmentResult.score.overall} className="h-3" />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Soil</span>
                              <span>{assessmentResult.score.soil}%</span>
                            </div>
                            <Progress value={assessmentResult.score.soil} className="h-2" />
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Climate</span>
                              <span>{assessmentResult.score.climate}%</span>
                            </div>
                            <Progress value={assessmentResult.score.climate} className="h-2" />
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>Topography</span>
                              <span>{assessmentResult.score.topography}%</span>
                            </div>
                            <Progress value={assessmentResult.score.topography} className="h-2" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {assessmentResult.advantages.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="h-5 w-5" />
                          Advantages
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {assessmentResult.advantages.map((adv, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                              <span>{adv}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {assessmentResult.limitations.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-orange-600">
                          <AlertTriangle className="h-5 w-5" />
                          Limitations
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {assessmentResult.limitations.map((lim, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <XCircle className="h-4 w-4 text-orange-500 mt-0.5" />
                              <span>{lim}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {assessmentResult.amendments.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Droplets className="h-5 w-5" />
                          Soil Amendments Required
                        </CardTitle>
                        <CardDescription>
                          Total estimated cost: ${assessmentResult.amendments.reduce((sum, a) => sum + a.estimatedCost, 0).toLocaleString()}/ha
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {assessmentResult.amendments.map((amendment, i) => (
                            <div key={i} className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">{amendment.parameter}</span>
                                <Badge className={getPriorityColor(amendment.priority)}>
                                  {amendment.priority} priority
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground mb-2">
                                Current: {amendment.currentValue} | Required: {amendment.requiredValue}
                              </div>
                              <p className="text-sm">{amendment.recommendation}</p>
                              <div className="text-sm font-medium mt-2">
                                Estimated cost: ${amendment.estimatedCost}/ha
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        Economic Projection
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-2xl font-bold">${assessmentResult.economics.establishmentCost.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">Establishment Cost</div>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-2xl font-bold">{assessmentResult.economics.yearsToFirstHarvest}</div>
                          <div className="text-sm text-muted-foreground">Years to Harvest</div>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-2xl font-bold">{assessmentResult.economics.expectedYield.toLocaleString()} kg</div>
                          <div className="text-sm text-muted-foreground">Expected Yield</div>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className={`text-2xl font-bold ${assessmentResult.economics.roi5Year > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {assessmentResult.economics.roi5Year > 0 ? '+' : ''}{assessmentResult.economics.roi5Year}%
                          </div>
                          <div className="text-sm text-muted-foreground">5-Year ROI</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5" />
                        Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {assessmentResult.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <TrendingUp className="h-4 w-4 text-blue-500 mt-0.5" />
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card className="h-full flex items-center justify-center min-h-[400px]">
                  <CardContent className="text-center">
                    <Leaf className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">Select a Crop to Assess</h3>
                    <p className="text-muted-foreground">
                      Choose a crop from the dropdown and enter your land data to see if it's suitable for planting.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="find" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Find Best Crops</AlertTitle>
                <AlertDescription>
                  Enter your land conditions and we'll analyze 25+ crops to find the best matches for your farm.
                </AlertDescription>
              </Alert>

              <Card>
                <CardHeader>
                  <CardTitle>Your Land Data</CardTitle>
                  <CardDescription>
                    Use the same soil, climate, and topography data from the Assess tab
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Soil pH:</span>
                      <span className="font-medium">{soilData.ph}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Texture:</span>
                      <span className="font-medium">{soilData.texture}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Rainfall:</span>
                      <span className="font-medium">{climateData.annualRainfall} mm/yr</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Temperature:</span>
                      <span className="font-medium">{climateData.avgTemperature}C</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Altitude:</span>
                      <span className="font-medium">{topographyData.altitude} m</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button 
                className="w-full" 
                size="lg"
                onClick={handleFindSuitable}
                disabled={findSuitableMutation.isPending}
              >
                {findSuitableMutation.isPending ? "Analyzing 25+ crops..." : "Find Suitable Crops"}
              </Button>
            </div>

            <div className="lg:col-span-2">
              {suitableCropsResult ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Analysis Results
                      </CardTitle>
                      <CardDescription>
                        Found {suitableCropsResult.suitableCrops} suitable crops out of {suitableCropsResult.totalCropsAnalyzed} analyzed
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <div className="grid gap-4">
                    {suitableCropsResult.results.map((result, i) => (
                      <Card key={result.cropId} className="hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="text-2xl font-bold text-muted-foreground">#{i + 1}</div>
                              <div>
                                <h3 className="font-semibold text-lg">{result.cropName}</h3>
                                <Badge className={getSuitabilityColor(result.score.category)}>
                                  {getSuitabilityLabel(result.score.category)}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl font-bold">{result.score.overall}</div>
                              <div className="text-sm text-muted-foreground">Score</div>
                            </div>
                          </div>
                          
                          <Progress value={result.score.overall} className="h-2 mb-4" />
                          
                          <div className="grid grid-cols-3 gap-4 text-center text-sm">
                            <div>
                              <div className="font-medium">${result.economics.establishmentCost.toLocaleString()}</div>
                              <div className="text-muted-foreground">Setup Cost</div>
                            </div>
                            <div>
                              <div className="font-medium">{result.economics.yearsToFirstHarvest} yrs</div>
                              <div className="text-muted-foreground">To Harvest</div>
                            </div>
                            <div>
                              <div className={`font-medium ${result.economics.roi5Year > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {result.economics.roi5Year > 0 ? '+' : ''}{result.economics.roi5Year}%
                              </div>
                              <div className="text-muted-foreground">5-Yr ROI</div>
                            </div>
                          </div>

                          {result.limitations.length > 0 && (
                            <div className="mt-4 pt-4 border-t">
                              <div className="text-sm text-muted-foreground mb-2">Key Considerations:</div>
                              <div className="flex flex-wrap gap-2">
                                {result.limitations.slice(0, 3).map((lim, j) => (
                                  <Badge key={j} variant="outline" className="text-xs">
                                    {lim.length > 50 ? lim.substring(0, 50) + '...' : lim}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <Card className="h-full flex items-center justify-center min-h-[400px]">
                  <CardContent className="text-center">
                    <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">Discover Your Best Crops</h3>
                    <p className="text-muted-foreground">
                      Click "Find Suitable Crops" to analyze 25+ crops and find the best matches for your land.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="compare">
          <Card className="min-h-[400px] flex items-center justify-center">
            <CardContent className="text-center">
              <BarChart3 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Compare Multiple Crops</h3>
              <p className="text-muted-foreground mb-4">
                Select multiple crops to compare their suitability side-by-side.
              </p>
              <p className="text-sm text-muted-foreground">
                Coming soon - Use the "Find Suitable Crops" tab to see ranked recommendations.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
