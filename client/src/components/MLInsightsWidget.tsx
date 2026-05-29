import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, TrendingUp, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

export default function MLInsightsWidget() {
  const [, setLocation] = useLocation();

  // Get ML service health
  const { data: healthData, isLoading: healthLoading } = trpc.mlPredictions.getMLServiceHealth.useQuery();

  // Get predictions for all crops
  const { data: predictionsData, isLoading: predictionsLoading, refetch } = 
    trpc.mlPredictions.getPredictionsForAllCrops.useQuery();

  const isMLServiceHealthy = healthData?.success && 
    healthData.data.status === 'healthy' &&
    healthData.data.models.crop_yield === 'loaded';

  const predictions = predictionsData?.success ? predictionsData.data : [];
  const totalCrops = predictionsData?.total || 0;
  const successfulPredictions = predictionsData?.successful || 0;

  // Calculate total predicted yield
  const totalPredictedYield = (predictions || []).reduce((sum: number, pred) => 
    sum + (pred.prediction?.predictedYield || 0), 0
  );

  // Get average confidence
  const avgConfidence = (predictions || []).length > 0
    ? (predictions || []).reduce((sum: number, pred) => 
        sum + ((pred.prediction?.confidence || 0) * 100), 0) / (predictions || []).length
    : 0;

  if (healthLoading || predictionsLoading) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </CardContent>
      </Card>
    );
  }

  if (!isMLServiceHealthy) {
    return (
      <Card className="shadow-lg border-2 border-yellow-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            AI Insights
          </CardTitle>
          <CardDescription>ML service is currently unavailable</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-sm text-gray-600 mb-4">
              The machine learning service is not responding. Please try again later.
            </p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (totalCrops === 0) {
    return (
      <Card className="shadow-lg bg-gradient-to-br from-purple-50 to-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI Insights
          </CardTitle>
          <CardDescription>Get AI-powered predictions for your crops</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <Sparkles className="w-12 h-12 text-purple-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600 mb-4">
              Add crops to your farm to get AI-powered yield predictions
            </p>
            <Button 
              size="sm" 
              onClick={() => setLocation('/crops')}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Add Crops
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          AI Insights
        </CardTitle>
        <CardDescription>
          Predictions for {successfulPredictions} of {totalCrops} active crops
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/80 backdrop-blur rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {totalPredictedYield.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-gray-600 mt-1">Total Predicted Yield (kg)</div>
          </div>
          <div className="bg-white/80 backdrop-blur rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {avgConfidence.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-600 mt-1">Avg Confidence</div>
          </div>
        </div>

        {/* Top Predictions */}
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-700">Top Predictions:</div>
          {(predictions || []).slice(0, 3).map((pred, index: number) => (
            <div 
              key={index}
              className="bg-white/80 backdrop-blur rounded-lg p-3 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="font-medium text-sm">{pred.cropName}</div>
                {pred.variety && (
                  <div className="text-xs text-gray-500">{pred.variety}</div>
                )}
              </div>
              <div className="text-right">
                <div className="font-bold text-green-600">
                  {pred.prediction?.predictedYield?.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg
                </div>
                <div className="text-xs text-gray-500">
                  {((pred.prediction?.confidence || 0) * 100).toFixed(0)}% confidence
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => refetch()}
            className="flex-1"
          >
            <TrendingUp className="w-4 h-4 mr-1" />
            Refresh
          </Button>
          <Button 
            size="sm"
            onClick={() => setLocation('/yield-predictor')}
            className="flex-1 bg-purple-600 hover:bg-purple-700"
          >
            View Details
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        {/* Info */}
        <div className="text-xs text-center text-gray-500 pt-2 border-t">
          Powered by AI • Updated in real-time
        </div>
      </CardContent>
    </Card>
  );
}
