import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Target, Calendar, DollarSign, AlertCircle } from "lucide-react";
import { Link } from "wouter";

import DashboardLayout from "@/components/DashboardLayout";
export default function YieldPrediction() {
  const yieldPredictionQuery = trpc.predictiveAnalytics.predictYield.useQuery({ farmId: 1, cropType: "maize", plantingDate: new Date().toISOString().split("T")[0], areaHectares: 1 }, { retry: 1 });
  const yieldPredictionData = yieldPredictionQuery.data ?? null;

  const [selectedField, setSelectedField] = useState("field-1");
  const [selectedCrop, setSelectedCrop] = useState("maize");

  const fields = [
    { id: "field-1", name: "North Field", area: 45.2, crop: "Maize" },
    { id: "field-2", name: "South Field", area: 38.5, crop: "Wheat" },
    { id: "field-3", name: "East Field", area: 52.1, crop: "Soybeans" },
  ];

  const prediction = {
    predictedYield: 5850,
    confidence: 82,
    minYield: 4680,
    maxYield: 7020,
    unit: "kg/ha",
    estimatedHarvestDate: "2025-03-15",
    totalProduction: 264570, // kg
    estimatedRevenue: 132285, // USD
  };

  const factors = [
    { name: "Weather Conditions", contribution: 30, status: "favorable" },
    { name: "Soil Quality", contribution: 20, status: "good" },
    { name: "Management Practices", contribution: 35, status: "excellent" },
    { name: "Historical Performance", contribution: 15, status: "average" },
  ];

  const recommendations = [
    {
      title: "Optimal Conditions",
      description: "Weather and soil conditions are favorable for good yield",
      priority: "low",
    },
    {
      title: "Continue Current Practices",
      description: "Management practices are contributing positively to yield potential",
      priority: "low",
    },
    {
      title: "Monitor NDVI",
      description: "Track vegetation health weekly to catch any stress early",
      priority: "medium",
    },
  ];

  const historicalYields = [
    { year: 2020, yield: 4800, season: "Spring" },
    { year: 2021, yield: 5200, season: "Spring" },
    { year: 2022, yield: 4950, season: "Spring" },
    { year: 2023, yield: 5400, season: "Spring" },
    { year: 2024, yield: 5650, season: "Spring" },
  ];

  const yieldGap = {
    actual: 5650,
    potential: 8500,
    gap: 33.5,
    limitingFactors: [
      { factor: "Water Stress", impact: 15, solution: "Install drip irrigation" },
      { factor: "Nutrient Deficiency", impact: 12, solution: "Soil-test based fertilization" },
      { factor: "Weed Competition", impact: 6, solution: "Improve weed control" },
    ],
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "low": return "bg-green-100 dark:bg-green-900 text-green-800";
      case "medium": return "bg-yellow-100 dark:bg-yellow-900 text-yellow-800";
      case "high": return "bg-red-100 dark:bg-red-900 text-red-800";
      default: return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100";
    }
  };

  // Loading & error states
  if (yieldPredictionQuery.isPending) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">Loading...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (yieldPredictionQuery.isError) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-destructive font-medium mb-2">Failed to load data</p>
            <button onClick={() => yieldPredictionQuery.refetch()} className="text-sm text-primary hover:underline">
              Try again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-green-50">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 shadow-sm dark:shadow-gray-900/20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Yield Prediction & Analytics</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">AI-powered yield forecasting and performance analysis</p>
            </div>
            <Link href="/precision-agriculture">
              <a className="text-sm text-blue-600 hover:text-blue-800">← Back</a>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Field Selection */}
        <Card className="mb-6 bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-600" />
              Select Field & Crop
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Field</label>
                <Select value={selectedField} onValueChange={setSelectedField}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.name} - {field.crop} ({field.area} ha)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Crop Type</label>
                <Select value={selectedCrop} onValueChange={setSelectedCrop}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maize">Maize</SelectItem>
                    <SelectItem value="wheat">Wheat</SelectItem>
                    <SelectItem value="soybeans">Soybeans</SelectItem>
                    <SelectItem value="rice">Rice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Prediction Card */}
          <div className="lg:col-span-2 space-y-6">
            {/* Yield Forecast */}
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                  Yield Forecast
                </CardTitle>
                <CardDescription>AI-powered prediction based on multiple factors</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Predicted Yield */}
                  <div className="text-center p-6 bg-gradient-to-br from-emerald-50 to-green-100 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Predicted Yield</p>
                    <p className="text-4xl font-bold text-emerald-700">
                      {prediction.predictedYield.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{prediction.unit}</p>
                    <Badge className="mt-3 bg-emerald-600">
                      {prediction.confidence}% Confidence
                    </Badge>
                  </div>

                  {/* Yield Range */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600 dark:text-gray-300">Minimum</span>
                        <span className="font-semibold">{prediction.minYield.toLocaleString()} {prediction.unit}</span>
                      </div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-600 dark:text-gray-300">Expected</span>
                        <span className="font-semibold text-emerald-600">{prediction.predictedYield.toLocaleString()} {prediction.unit}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-300">Maximum</span>
                        <span className="font-semibold">{prediction.maxYield.toLocaleString()} {prediction.unit}</span>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex items-center gap-2 text-sm mb-2">
                        <Calendar className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                        <span className="text-gray-600 dark:text-gray-300">Est. Harvest Date:</span>
                      </div>
                      <p className="font-semibold">
                        {new Date(prediction.estimatedHarvestDate).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex items-center gap-2 text-sm mb-2">
                        <DollarSign className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                        <span className="text-gray-600 dark:text-gray-300">Est. Revenue:</span>
                      </div>
                      <p className="font-semibold text-green-600">
                        ${prediction.estimatedRevenue.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contributing Factors */}
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle>Contributing Factors</CardTitle>
                <CardDescription>Impact on predicted yield</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {factors.map((factor, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{factor.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {factor.status}
                          </Badge>
                          <span className="text-sm font-semibold">{factor.contribution}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-emerald-600 h-2 rounded-full transition-all"
                          style={{ width: `${factor.contribution}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Historical Performance */}
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle>Historical Performance</CardTitle>
                <CardDescription>Past 5 seasons</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {historicalYields.map((record, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-lg">
                      <div>
                        <p className="font-medium">{record.year} {record.season}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">{record.yield.toLocaleString()} kg/ha</p>
                      </div>
                      {index > 0 && (
                        <div className="flex items-center gap-1">
                          {record.yield > historicalYields[index - 1].yield ? (
                            <>
                              <TrendingUp className="h-4 w-4 text-green-600" />
                              <span className="text-sm text-green-600 font-medium">
                                +{((record.yield - historicalYields[index - 1].yield) / historicalYields[index - 1].yield * 100).toFixed(1)}%
                              </span>
                            </>
                          ) : (
                            <>
                              <TrendingDown className="h-4 w-4 text-red-600" />
                              <span className="text-sm text-red-600 font-medium">
                                {((record.yield - historicalYields[index - 1].yield) / historicalYields[index - 1].yield * 100).toFixed(1)}%
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Yield Gap Analysis */}
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle>Yield Gap Analysis</CardTitle>
                <CardDescription>Potential for improvement</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Current Yield</span>
                    <span className="font-semibold">{yieldGap.actual} kg/ha</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Potential Yield</span>
                    <span className="font-semibold">{yieldGap.potential} kg/ha</span>
                  </div>
                  <div className="flex justify-between mb-4">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Yield Gap</span>
                    <span className="font-bold text-orange-600">{yieldGap.gap}%</span>
                  </div>
                  
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                    <div
                      className="bg-emerald-600 h-4 rounded-full"
                      style={{ width: `${(yieldGap.actual / yieldGap.potential) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">Limiting Factors</p>
                  <div className="space-y-3">
                    {yieldGap.limitingFactors.map((factor, index) => (
                      <div key={index} className="border-l-4 border-orange-500 pl-3">
                        <div className="flex items-start justify-between mb-1">
                          <p className="text-sm font-medium">{factor.factor}</p>
                          <Badge variant="outline" className="text-xs">
                            -{factor.impact}%
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300">💡 {factor.solution}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Recommendations */}
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-lg">Recommendations</CardTitle>
                <CardDescription>Actions to optimize yield</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recommendations.map((rec, index) => (
                    <div key={index} className={`p-3 rounded-lg ${getPriorityColor(rec.priority)}`}>
                      <p className="text-sm font-medium mb-1">{rec.title}</p>
                      <p className="text-xs">{rec.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-lg">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">Total Production</p>
                  <p className="text-2xl font-bold">{(prediction.totalProduction / 1000).toFixed(1)} tons</p>
                </div>
                <div className="border-t pt-4">
                  <p className="text-xs text-gray-600 dark:text-gray-300">Avg Yield (5 years)</p>
                  <p className="text-2xl font-bold">
                    {Math.round(historicalYields.reduce((sum, r) => sum + r.yield, 0) / historicalYields.length)} kg/ha
                  </p>
                </div>
                <div className="border-t pt-4">
                  <p className="text-xs text-gray-600 dark:text-gray-300">Yield Trend</p>
                  <div className="flex items-center gap-2 mt-1">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    <p className="text-xl font-bold text-green-600">+17.7%</p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">vs 5-year average</p>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader>
                <CardTitle className="text-lg">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" size="sm">
                  Generate Full Report
                </Button>
                <Button variant="outline" className="w-full" size="sm">
                  Compare with Other Fields
                </Button>
                <Button variant="outline" className="w-full" size="sm">
                  Export Data
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  
    </DashboardLayout>);
}
