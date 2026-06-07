import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Camera, Bug, Leaf, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function AIDiagnostics() {
  const [analyzing, setAnalyzing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<any>(null);

  const handleImageUpload = () => {
    setAnalyzing(true);
    
    // Simulate AI analysis
    setTimeout(() => {
      setDiagnosis({
        issue: "Late Blight (Phytophthora infestans)",
        type: "disease",
        confidence: 87,
        severity: "high",
        affectedArea: 25,
        symptoms: [
          "Dark brown to black lesions on leaves",
          "White fungal growth on leaf undersides",
          "Rapid leaf death and defoliation",
        ],
        treatment: [
          "Apply fungicides containing chlorothalonil or copper",
          "Remove and destroy infected plants immediately",
          "Improve air circulation around plants",
          "Avoid overhead irrigation to reduce leaf wetness",
        ],
        prevention: [
          "Use disease-resistant varieties",
          "Ensure proper plant spacing for air circulation",
          "Apply preventive fungicides during humid conditions",
          "Practice crop rotation with non-host crops",
        ],
      });
      setAnalyzing(false);
      toast.success("Analysis complete!");
    }, 2000);
  };

  const recentDiagnoses = [
    {
      id: 1,
      date: "2024-12-01",
      issue: "Aphid Infestation",
      severity: "moderate",
      field: "North Field",
      status: "treated",
    },
    {
      id: 2,
      date: "2024-11-28",
      issue: "Nitrogen Deficiency",
      severity: "low",
      field: "South Field",
      status: "in_progress",
    },
    {
      id: 3,
      date: "2024-11-25",
      issue: "Powdery Mildew",
      severity: "moderate",
      field: "East Field",
      status: "treated",
    },
  ];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "low": return "bg-yellow-500";
      case "moderate": return "bg-orange-500";
      case "high": return "bg-red-500";
      case "critical": return "bg-red-700";
      default: return "bg-gray-500";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "treated": return "bg-green-500";
      case "in_progress": return "bg-blue-500";
      case "pending": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-rose-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">AI Crop Diagnostics</h1>
              <p className="text-sm text-gray-600">Identify diseases, pests, and deficiencies with AI</p>
            </div>
            <Link href="/precision-agriculture">
              <a className="text-sm text-blue-600 hover:text-blue-800">← Back</a>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-red-600" />
                  Upload Crop Image
                </CardTitle>
                <CardDescription>
                  Take a photo or upload an image of the affected crop for AI analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-red-400 transition-colors cursor-pointer">
                  <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">
                    PNG, JPG up to 10MB • Best results with close-up images
                  </p>
                  <div className="mt-4 flex gap-2 justify-center">
                    <Button onClick={handleImageUpload} disabled={analyzing}>
                      <Upload className="h-4 w-4 mr-2" />
                      {analyzing ? "Analyzing..." : "Upload Image"}
                    </Button>
                    <Button variant="outline" onClick={handleImageUpload} disabled={analyzing}>
                      <Camera className="h-4 w-4 mr-2" />
                      Take Photo
                    </Button>
                  </div>
                </div>

                {/* Tips */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900 mb-1">Tips for Best Results</p>
                      <ul className="text-xs text-blue-800 space-y-1">
                        <li>• Take photos in good natural lighting</li>
                        <li>• Focus on the affected area (leaves, stems, or fruit)</li>
                        <li>• Include multiple angles if possible</li>
                        <li>• Ensure the image is clear and in focus</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Diagnosis Results */}
            {diagnosis && (
              <Card className="bg-white">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Bug className="h-5 w-5 text-red-600" />
                      Diagnosis Results
                    </CardTitle>
                    <Badge className={getSeverityColor(diagnosis.severity)}>
                      {diagnosis.severity.toUpperCase()}
                    </Badge>
                  </div>
                  <CardDescription>AI Model: PlantDisease-CNN-v2.1</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Issue Identified */}
                    <div>
                      <h3 className="font-semibold text-lg mb-2">{diagnosis.issue}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>Type: <span className="font-medium capitalize">{diagnosis.type}</span></span>
                        <span>Confidence: <span className="font-medium">{diagnosis.confidence}%</span></span>
                        <span>Affected Area: <span className="font-medium">{diagnosis.affectedArea}%</span></span>
                      </div>
                    </div>

                    {/* Tabs for Details */}
                    <Tabs defaultValue="symptoms" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="symptoms">Symptoms</TabsTrigger>
                        <TabsTrigger value="treatment">Treatment</TabsTrigger>
                        <TabsTrigger value="prevention">Prevention</TabsTrigger>
                      </TabsList>

                      <TabsContent value="symptoms" className="mt-4">
                        <ul className="space-y-2">
                          {diagnosis.symptoms.map((symptom: string, index: number) => (
                            <li key={index} className="flex items-start gap-2 text-sm">
                              <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                              <span>{symptom}</span>
                            </li>
                          ))}
                        </ul>
                      </TabsContent>

                      <TabsContent value="treatment" className="mt-4">
                        <ul className="space-y-2">
                          {diagnosis.treatment.map((step: string, index: number) => (
                            <li key={index} className="flex items-start gap-2 text-sm">
                              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </TabsContent>

                      <TabsContent value="prevention" className="mt-4">
                        <ul className="space-y-2">
                          {diagnosis.prevention.map((measure: string, index: number) => (
                            <li key={index} className="flex items-start gap-2 text-sm">
                              <Leaf className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                              <span>{measure}</span>
                            </li>
                          ))}
                        </ul>
                      </TabsContent>
                    </Tabs>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4 border-t">
                      <Button className="flex-1">
                        Save Diagnosis
                      </Button>
                      <Button variant="outline" className="flex-1">
                        Create Treatment Plan
                      </Button>
                      <Button variant="outline">
                        Share
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-lg">Diagnosis Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-gray-600">This Month</span>
                    <span className="text-2xl font-bold">12</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-red-600 h-2 rounded-full" style={{ width: "60%" }}></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-xs text-gray-600">Diseases</p>
                    <p className="text-xl font-semibold">7</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Pests</p>
                    <p className="text-xl font-semibold">3</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Deficiencies</p>
                    <p className="text-xl font-semibold">2</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Treated</p>
                    <p className="text-xl font-semibold text-green-600">8</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Diagnoses */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-lg">Recent Diagnoses</CardTitle>
                <CardDescription>Last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentDiagnoses.map((item) => (
                    <div key={item.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-sm font-medium">{item.issue}</p>
                        <Badge className={getSeverityColor(item.severity)} variant="outline">
                          {item.severity}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>{item.field}</span>
                        <Badge className={getStatusColor(item.status)} variant="outline">
                          {item.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(item.date).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Disease Library */}
            <Card className="bg-white">
              <CardHeader>
                <CardTitle className="text-lg">Disease Library</CardTitle>
                <CardDescription>Browse common issues</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <Bug className="h-4 w-4 mr-2" />
                    Common Diseases
                  </Button>
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <Bug className="h-4 w-4 mr-2" />
                    Pest Gallery
                  </Button>
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <Leaf className="h-4 w-4 mr-2" />
                    Nutrient Deficiencies
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
