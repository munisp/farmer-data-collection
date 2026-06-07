import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Satellite, Cloud, Bug, Tractor, TrendingUp, Map } from "lucide-react";
import { Link } from "wouter";

export default function PrecisionAgDashboard() {
  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-emerald-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Precision Agriculture</h1>
              <p className="text-sm text-gray-600">Advanced farm management tools</p>
            </div>
            <Link href="/">
              <a className="text-sm text-blue-600 hover:text-blue-800">← Back to Dashboard</a>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="bg-white hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Satellite Images</CardTitle>
              <Satellite className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">24</div>
              <p className="text-xs text-muted-foreground">Last updated 2 days ago</p>
            </CardContent>
          </Card>

          <Card className="bg-white hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Weather Alerts</CardTitle>
              <Cloud className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">3</div>
              <p className="text-xs text-muted-foreground">Active alerts</p>
            </CardContent>
          </Card>

          <Card className="bg-white hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Diagnostics</CardTitle>
              <Bug className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12</div>
              <p className="text-xs text-muted-foreground">Issues detected this month</p>
            </CardContent>
          </Card>

          <Card className="bg-white hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Equipment Tracked</CardTitle>
              <Tractor className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">8</div>
              <p className="text-xs text-muted-foreground">All active</p>
            </CardContent>
          </Card>

          <Card className="bg-white hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg NDVI</CardTitle>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0.72</div>
              <p className="text-xs text-muted-foreground">Healthy vegetation</p>
            </CardContent>
          </Card>

          <Card className="bg-white hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Fields Mapped</CardTitle>
              <Map className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">15</div>
              <p className="text-xs text-muted-foreground">Total 450 hectares</p>
            </CardContent>
          </Card>
        </div>

        {/* Feature Tabs */}
        <Tabs defaultValue="satellite" className="space-y-6">
          <TabsList className="bg-white p-1 shadow-sm">
            <TabsTrigger value="satellite" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              <Satellite className="h-4 w-4 mr-2" />
              Satellite Imagery
            </TabsTrigger>
            <TabsTrigger value="weather" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">
              <Cloud className="h-4 w-4 mr-2" />
              Weather
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
              <Bug className="h-4 w-4 mr-2" />
              AI Diagnostics
            </TabsTrigger>
            <TabsTrigger value="equipment" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              <Tractor className="h-4 w-4 mr-2" />
              Equipment
            </TabsTrigger>
            <TabsTrigger value="yield" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              <TrendingUp className="h-4 w-4 mr-2" />
              Yield Analytics
            </TabsTrigger>
          </TabsList>

          {/* Satellite Imagery Tab */}
          <TabsContent value="satellite" className="space-y-6">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Satellite Imagery & Vegetation Indices</CardTitle>
                <CardDescription>
                  Monitor crop health with NDVI, NDRE, and other vegetation indices from satellite imagery
                </CardDescription>
              </CardHeader>
              <CardContent>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                  <Link href="/field-overview">
                                    <a className="block p-6 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg hover:shadow-lg transition-shadow border-2 border-emerald-300">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Satellite className="h-5 w-5 text-emerald-600" />
                                        <h3 className="font-semibold text-lg">Field Overview (EOS-style)</h3>
                                      </div>
                                      <p className="text-sm text-gray-600">Unified dashboard with all 7 vegetation indices, weather, disease risk, scouting tasks, and activity logs for any crop</p>
                                    </a>
                                  </Link>
                                  <Link href="/satellite-imagery">
                                    <a className="block p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg hover:shadow-md transition-shadow">
                                      <h3 className="font-semibold text-lg mb-2">View Satellite Images</h3>
                                      <p className="text-sm text-gray-600">Browse and analyze satellite imagery for your fields</p>
                                    </a>
                                  </Link>
                                  <Link href="/ndvi-analysis">
                    <a className="block p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">NDVI Time Series</h3>
                      <p className="text-sm text-gray-600">Track vegetation health trends over time</p>
                    </a>
                  </Link>
                  <Link href="/field-mapping">
                    <a className="block p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Field Mapping</h3>
                      <p className="text-sm text-gray-600">Create and manage precise field boundaries</p>
                    </a>
                  </Link>
                  <Link href="/crop-health">
                    <a className="block p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Crop Health Reports</h3>
                      <p className="text-sm text-gray-600">Detailed crop health assessments and recommendations</p>
                    </a>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Weather Tab */}
          <TabsContent value="weather" className="space-y-6">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Weather Forecasting & Alerts</CardTitle>
                <CardDescription>
                  Stay informed about weather conditions and receive alerts for your farm
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Link href="/weather-forecast">
                    <a className="block p-6 bg-gradient-to-br from-sky-50 to-sky-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">7-Day Forecast</h3>
                      <p className="text-sm text-gray-600">Detailed weather predictions for your location</p>
                    </a>
                  </Link>
                  <Link href="/weather-alerts">
                    <a className="block p-6 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Active Alerts</h3>
                      <p className="text-sm text-gray-600">Severe weather warnings and recommendations</p>
                    </a>
                  </Link>
                  <Link href="/soil-moisture">
                    <a className="block p-6 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Soil Moisture Forecast</h3>
                      <p className="text-sm text-gray-600">Irrigation planning based on weather predictions</p>
                    </a>
                  </Link>
                  <Link href="/growing-degree-days">
                    <a className="block p-6 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Growing Degree Days</h3>
                      <p className="text-sm text-gray-600">Track crop development stages</p>
                    </a>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Diagnostics Tab */}
          <TabsContent value="diagnostics" className="space-y-6">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>AI-Powered Crop Diagnostics</CardTitle>
                <CardDescription>
                  Identify diseases, pests, and nutrient deficiencies using AI image analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Link href="/ai-diagnosis">
                    <a className="block p-6 bg-gradient-to-br from-red-50 to-red-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">New Diagnosis</h3>
                      <p className="text-sm text-gray-600">Upload crop images for AI analysis</p>
                    </a>
                  </Link>
                  <Link href="/diagnosis-history">
                    <a className="block p-6 bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Diagnosis History</h3>
                      <p className="text-sm text-gray-600">View past diagnoses and treatments</p>
                    </a>
                  </Link>
                  <Link href="/disease-library">
                    <a className="block p-6 bg-gradient-to-br from-rose-50 to-rose-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Disease Library</h3>
                      <p className="text-sm text-gray-600">Browse common crop diseases and pests</p>
                    </a>
                  </Link>
                  <Link href="/treatment-plans">
                    <a className="block p-6 bg-gradient-to-br from-fuchsia-50 to-fuchsia-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Treatment Plans</h3>
                      <p className="text-sm text-gray-600">Integrated pest management strategies</p>
                    </a>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Equipment Tab */}
          <TabsContent value="equipment" className="space-y-6">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Equipment Tracking & Fuel Monitoring</CardTitle>
                <CardDescription>
                  Monitor equipment location, fuel consumption, and maintenance schedules
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Link href="/equipment-tracker">
                    <a className="block p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Live Equipment Tracking</h3>
                      <p className="text-sm text-gray-600">Real-time GPS location of all equipment</p>
                    </a>
                  </Link>
                  <Link href="/fuel-monitoring">
                    <a className="block p-6 bg-gradient-to-br from-lime-50 to-lime-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Fuel Consumption</h3>
                      <p className="text-sm text-gray-600">Track fuel usage and costs</p>
                    </a>
                  </Link>
                  <Link href="/maintenance-schedule">
                    <a className="block p-6 bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Maintenance Schedule</h3>
                      <p className="text-sm text-gray-600">Plan and track equipment maintenance</p>
                    </a>
                  </Link>
                  <Link href="/equipment-analytics">
                    <a className="block p-6 bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Performance Analytics</h3>
                      <p className="text-sm text-gray-600">Equipment utilization and efficiency metrics</p>
                    </a>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Yield Analytics Tab */}
          <TabsContent value="yield" className="space-y-6">
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Yield Prediction & Analytics</CardTitle>
                <CardDescription>
                  Forecast yields and analyze crop performance with ML-powered insights
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Link href="/yield-prediction">
                    <a className="block p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Yield Forecasting</h3>
                      <p className="text-sm text-gray-600">AI-powered yield predictions</p>
                    </a>
                  </Link>
                  <Link href="/performance-analytics">
                    <a className="block p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Performance Analysis</h3>
                      <p className="text-sm text-gray-600">Compare yields across fields and seasons</p>
                    </a>
                  </Link>
                  <Link href="/yield-gap-analysis">
                    <a className="block p-6 bg-gradient-to-br from-lime-50 to-lime-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">Yield Gap Analysis</h3>
                      <p className="text-sm text-gray-600">Identify limiting factors and opportunities</p>
                    </a>
                  </Link>
                  <Link href="/roi-calculator">
                    <a className="block p-6 bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg hover:shadow-md transition-shadow">
                      <h3 className="font-semibold text-lg mb-2">ROI Calculator</h3>
                      <p className="text-sm text-gray-600">Evaluate investment scenarios</p>
                    </a>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
