import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertCircle, BarChart3, Info } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function PriceForecast() {
  const [selectedCrop, setSelectedCrop] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [forecastDays, setForecastDays] = useState("30");
  const [forecast, setForecast] = useState<any>(null);

  const forecastMutation = trpc.mlPredictions.forecastPrice.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setForecast(data.data);
        toast.success("Price forecast generated successfully!");
      } else {
        toast.error(data.error || "Failed to generate forecast");
      }
    },
    onError: (error) => {
      toast.error(`Forecast failed: ${error.message}`);
    },
  });

  const handleForecast = () => {
    if (!selectedCrop || !selectedLocation) {
      toast.error("Please select crop and location");
      return;
    }

    forecastMutation.mutate({
      crop: selectedCrop,
      location: selectedLocation,
      forecastDays: parseInt(forecastDays),
    });
  };

  const getTrendIcon = (trend: string) => {
    if (trend.toLowerCase().includes('up') || trend.toLowerCase().includes('increasing')) {
      return <TrendingUp className="w-6 h-6 text-green-600" />;
    }
    if (trend.toLowerCase().includes('down') || trend.toLowerCase().includes('decreasing')) {
      return <TrendingDown className="w-6 h-6 text-red-600" />;
    }
    return <Minus className="w-6 h-6 text-gray-600" />;
  };

  const getTrendColor = (trend: string) => {
    if (trend.toLowerCase().includes('up') || trend.toLowerCase().includes('increasing')) {
      return "text-green-600 bg-green-50";
    }
    if (trend.toLowerCase().includes('down') || trend.toLowerCase().includes('decreasing')) {
      return "text-red-600 bg-red-50";
    }
    return "text-gray-600 bg-gray-50";
  };

  // Prepare chart data
  const chartData = forecast?.forecast?.map((item: any, index: number) => ({
    day: `Day ${index + 1}`,
    date: item.date,
    price: item.price,
    confidence: item.confidence ? item.confidence * 100 : null,
  })) || [];

  // Calculate statistics
  const avgPrice = forecast?.forecast?.reduce((sum: number, item: any) => sum + item.price, 0) / (forecast?.forecast?.length || 1) || 0;
  const maxPrice = Math.max(...(forecast?.forecast?.map((item: any) => item.price) || [0]));
  const minPrice = Math.min(...(forecast?.forecast?.map((item: any) => item.price) || [Infinity]));

  return (
    <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            <h1 className="text-4xl font-bold text-gray-900">Price Forecast Dashboard</h1>
          </div>
          <p className="text-gray-600 text-lg">
            Predict future crop prices with AI-powered forecasting
          </p>
        </div>

        {/* Controls */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Forecast Parameters</CardTitle>
            <CardDescription>
              Select crop, location, and forecast period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
              {/* Crop Selection */}
              <div className="space-y-2">
                <Label htmlFor="crop">Crop Type</Label>
                <Select value={selectedCrop} onValueChange={setSelectedCrop}>
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

              {/* Location Selection */}
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lagos">Lagos</SelectItem>
                    <SelectItem value="Kano">Kano</SelectItem>
                    <SelectItem value="Ibadan">Ibadan</SelectItem>
                    <SelectItem value="Abuja">Abuja</SelectItem>
                    <SelectItem value="Port Harcourt">Port Harcourt</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Forecast Days */}
              <div className="space-y-2">
                <Label htmlFor="days">Forecast Period</Label>
                <Select value={forecastDays} onValueChange={setForecastDays}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 Days</SelectItem>
                    <SelectItem value="14">14 Days</SelectItem>
                    <SelectItem value="30">30 Days</SelectItem>
                    <SelectItem value="60">60 Days</SelectItem>
                    <SelectItem value="90">90 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Generate Button */}
              <div className="space-y-2">
                <Label>&nbsp;</Label>
                <Button
                  onClick={handleForecast}
                  className="w-full"
                  disabled={forecastMutation.isPending}
                >
                  {forecastMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Generate Forecast
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {forecast ? (
          <>
            {/* Statistics Cards */}
            <div className="grid md:grid-cols-4 gap-4">
              <Card className="shadow-lg">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      ₦{avgPrice.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">Average Price</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      ₦{maxPrice.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">Highest Price</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      ₦{minPrice.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">Lowest Price</div>
                  </div>
                </CardContent>
              </Card>

              <Card className={`shadow-lg ${getTrendColor(forecast.trend)}`}>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      {getTrendIcon(forecast.trend)}
                      <div className="text-lg font-bold">
                        {forecast.trend}
                      </div>
                    </div>
                    <div className="text-sm mt-1">Market Trend</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Price Chart */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Price Forecast Chart</CardTitle>
                <CardDescription>
                  Predicted prices for the next {forecastDays} days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="day" 
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Price (₦)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-white p-3 border rounded-lg shadow-lg">
                              <p className="font-semibold">{payload[0].payload.date}</p>
                              <p className="text-blue-600">
                                Price: ₦{typeof payload[0].value === 'number' ? payload[0].value.toFixed(2) : payload[0].value}
                              </p>
                              {payload[0].payload.confidence && (
                                <p className="text-gray-600 text-sm">
                                  Confidence: {payload[0].payload.confidence.toFixed(1)}%
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                      name="Predicted Price (₦)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Recommendation */}
            <Card className="shadow-lg border-2 border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                  Trading Recommendation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Alert className="bg-blue-50 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-900 text-lg">
                    {forecast.recommendation}
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            {/* Data Info */}
            <Card className="shadow-lg bg-gray-50">
              <CardContent className="pt-6">
                <div className="text-center text-sm text-gray-600">
                  <p>
                    Forecast based on {forecast.historicalDataPoints || 'historical'} data points
                    from marketplace listings
                  </p>
                  <p className="mt-1 text-xs">
                    Note: Forecasts are predictions and actual prices may vary based on market conditions
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="shadow-lg">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <BarChart3 className="w-20 h-20 text-gray-300 mb-4" />
              <h3 className="text-2xl font-semibold text-gray-700 mb-2">
                No Forecast Generated
              </h3>
              <p className="text-gray-500 max-w-md">
                Select a crop, location, and forecast period, then click "Generate Forecast" to see price predictions
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
