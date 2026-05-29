import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, TrendingUp, AlertCircle, Sparkles, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function YieldPredictor() {
  const [formData, setFormData] = useState({
    crop: "",
    farmSize: "",
    soilType: "",
    rainfall: "",
    temperature: "",
    fertilizer: "",
    season: "",
  });

  const [prediction, setPrediction] = useState<any>(null);

  const predictMutation = trpc.mlPredictions.predictYield.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setPrediction(data.data);
        toast.success("Yield prediction generated successfully!");
      } else {
        toast.error(data.error || "Failed to generate prediction");
      }
    },
    onError: (error) => {
      toast.error(`Prediction failed: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (!formData.crop || !formData.farmSize || !formData.soilType || 
        !formData.rainfall || !formData.temperature || !formData.fertilizer || !formData.season) {
      toast.error("Please fill in all fields");
      return;
    }

    predictMutation.mutate({
      crop: formData.crop,
      farmSize: parseFloat(formData.farmSize),
      soilType: formData.soilType,
      rainfall: parseFloat(formData.rainfall),
      temperature: parseFloat(formData.temperature),
      fertilizer: formData.fertilizer,
      season: formData.season as "Wet" | "Dry" | "Both",
    });
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "text-green-600";
    if (confidence >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 80) return "High Confidence";
    if (confidence >= 60) return "Medium Confidence";
    return "Low Confidence";
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-8 h-8 text-green-600" />
            <h1 className="text-4xl font-bold text-gray-900">AI Yield Predictor</h1>
          </div>
          <p className="text-gray-600 text-lg">
            Get accurate crop yield predictions powered by machine learning
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Input Form */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Farm Conditions</CardTitle>
              <CardDescription>
                Enter your farm details to get a yield prediction
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form aria-label="Submit form" onSubmit={handleSubmit} className="space-y-4">
                {/* Crop Type */}
                <div className="space-y-2">
                  <Label htmlFor="crop">Crop Type</Label>
                  <Select
                    value={formData.crop}
                    onValueChange={(value) => setFormData({ ...formData, crop: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select crop" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Maize">Maize</SelectItem>
                      <SelectItem value="Rice">Rice</SelectItem>
                      <SelectItem value="Cassava">Cassava</SelectItem>
                      <SelectItem value="Yam">Yam</SelectItem>
                      <SelectItem value="Beans">Beans</SelectItem>
                      <SelectItem value="Sorghum">Sorghum</SelectItem>
                      <SelectItem value="Millet">Millet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Farm Size */}
                <div className="space-y-2">
                  <Label htmlFor="farmSize">Farm Size (hectares)</Label>
                  <Input
                    id="farmSize"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g., 5.0"
                    value={formData.farmSize}
                    onChange={(e) => setFormData({ ...formData, farmSize: e.target.value })}
                  />
                </div>

                {/* Soil Type */}
                <div className="space-y-2">
                  <Label htmlFor="soilType">Soil Type</Label>
                  <Select
                    value={formData.soilType}
                    onValueChange={(value) => setFormData({ ...formData, soilType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select soil type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Loamy">Loamy</SelectItem>
                      <SelectItem value="Clay">Clay</SelectItem>
                      <SelectItem value="Sandy">Sandy</SelectItem>
                      <SelectItem value="Silt">Silt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Rainfall */}
                <div className="space-y-2">
                  <Label htmlFor="rainfall">Annual Rainfall (mm)</Label>
                  <Input
                    id="rainfall"
                    type="number"
                    step="1"
                    min="0"
                    placeholder="e.g., 800"
                    value={formData.rainfall}
                    onChange={(e) => setFormData({ ...formData, rainfall: e.target.value })}
                  />
                </div>

                {/* Temperature */}
                <div className="space-y-2">
                  <Label htmlFor="temperature">Average Temperature (°C)</Label>
                  <Input
                    id="temperature"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 28"
                    value={formData.temperature}
                    onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                  />
                </div>

                {/* Fertilizer */}
                <div className="space-y-2">
                  <Label htmlFor="fertilizer">Fertilizer Type</Label>
                  <Select
                    value={formData.fertilizer}
                    onValueChange={(value) => setFormData({ ...formData, fertilizer: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select fertilizer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NPK">NPK</SelectItem>
                      <SelectItem value="Organic">Organic</SelectItem>
                      <SelectItem value="Urea">Urea</SelectItem>
                      <SelectItem value="None">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Season */}
                <div className="space-y-2">
                  <Label htmlFor="season">Growing Season</Label>
                  <Select
                    value={formData.season}
                    onValueChange={(value) => setFormData({ ...formData, season: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select season" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Wet">Wet Season</SelectItem>
                      <SelectItem value="Dry">Dry Season</SelectItem>
                      <SelectItem value="Both">Both Seasons</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={predictMutation.isPending}
                >
                  {predictMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="mr-2 h-4 w-4" />
                      Predict Yield
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Prediction Results */}
          <div className="space-y-6">
            {prediction ? (
              <>
                {/* Main Prediction Card */}
                <Card className="shadow-lg border-2 border-green-200 bg-gradient-to-br from-green-50 to-white">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                      Predicted Yield
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-center">
                      <div className="text-5xl font-bold text-green-600">
                        {prediction.predictedYield.toLocaleString()}
                      </div>
                      <div className="text-xl text-gray-600 mt-2">
                        {prediction.unit}
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-2">
                      <div className={`text-lg font-semibold ${getConfidenceColor(prediction.confidence * 100)}`}>
                        {getConfidenceLabel(prediction.confidence * 100)}
                      </div>
                      <div className="text-gray-600">
                        ({(prediction.confidence * 100).toFixed(1)}%)
                      </div>
                    </div>

                    {prediction.recommendation && (
                      <Alert className="bg-blue-50 border-blue-200">
                        <AlertCircle className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-blue-900">
                          {prediction.recommendation}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>

                {/* Factor Analysis */}
                <Card className="shadow-lg">
                  <CardHeader>
                    <CardTitle>Factor Analysis</CardTitle>
                    <CardDescription>
                      How different factors affect your yield
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(prediction.factors).map(([factor, status]) => (
                        <div key={factor} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium capitalize">
                            {factor.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            status === 'excellent' ? 'bg-green-100 text-green-800' :
                            status === 'optimal' ? 'bg-blue-100 text-blue-800' :
                            status === 'good' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {status as string}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="shadow-lg">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Sparkles className="w-16 h-16 text-gray-300 mb-4" />
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">
                    No Prediction Yet
                  </h3>
                  <p className="text-gray-500">
                    Fill in the form and click "Predict Yield" to see your results
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Info Section */}
        <Card className="shadow-lg bg-gradient-to-r from-blue-50 to-purple-50">
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-3xl font-bold text-blue-600 mb-2">85%</div>
                <div className="text-gray-600">Average Accuracy</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-purple-600 mb-2">1000+</div>
                <div className="text-gray-600">Training Samples</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-green-600 mb-2">7</div>
                <div className="text-gray-600">Crop Types Supported</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
