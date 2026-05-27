/**
 * Soil Moisture Monitor Component
 * 
 * Displays soil moisture levels and irrigation recommendations
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Droplets, AlertTriangle, CheckCircle2, Clock, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface SoilMoistureData {
  moisture: number;
  timestamp: Date;
  source: string;
  quality: string;
}

interface IrrigationRecommendation {
  shouldIrrigate: boolean;
  urgency: 'immediate' | 'soon' | 'monitor' | 'none';
  waterAmount: number;
  reason: string;
  nextCheckDate: Date;
  moistureStatus: 'optimal' | 'adequate' | 'critical' | 'stress';
}

interface SoilMoistureMonitorProps {
  soilMoisture: SoilMoistureData | null;
  recommendation: IrrigationRecommendation | null;
  loading?: boolean;
  onRefresh?: () => void;
}

export function SoilMoistureMonitor({
  soilMoisture,
  recommendation,
  loading,
  onRefresh,
}: SoilMoistureMonitorProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5" />
            Soil Moisture Monitor
          </CardTitle>
          <CardDescription>Loading soil moisture data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!soilMoisture || !recommendation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5" />
            Soil Moisture Monitor
          </CardTitle>
          <CardDescription>No soil moisture data available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Unable to fetch soil moisture data. This may be due to missing farm location or API configuration.
          </p>
          {onRefresh && (
            <Button onClick={onRefresh} variant="outline" size="sm">
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = () => {
    switch (recommendation.moistureStatus) {
      case 'optimal':
        return 'text-green-600';
      case 'adequate':
        return 'text-blue-600';
      case 'critical':
        return 'text-orange-600';
      case 'stress':
        return 'text-red-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusIcon = () => {
    if (recommendation.moistureStatus === 'optimal' || recommendation.moistureStatus === 'adequate') {
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    }
    return <AlertTriangle className="h-5 w-5 text-orange-600" />;
  };

  const getUrgencyBadge = () => {
    const variants: Record<string, 'default' | 'destructive' | 'secondary' | 'outline'> = {
      immediate: 'destructive',
      soon: 'default',
      monitor: 'secondary',
      none: 'outline',
    };
    return (
      <Badge variant={variants[recommendation.urgency]}>
        {recommendation.urgency === 'immediate' && '🚨 '}
        {recommendation.urgency === 'soon' && '⚠️ '}
        {recommendation.urgency === 'monitor' && '👁️ '}
        {recommendation.urgency === 'none' && '✅ '}
        {recommendation.urgency.toUpperCase()}
      </Badge>
    );
  };

  const moisturePercent = Math.round(soilMoisture.moisture * 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Droplets className="h-5 w-5" />
              Soil Moisture Monitor
            </CardTitle>
            <CardDescription>
              Real-time soil moisture and irrigation guidance
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            {getUrgencyBadge()}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Moisture Level Display */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Current Soil Moisture</p>
              <p className="text-xs text-muted-foreground">
                Source: {soilMoisture.source.toUpperCase()} • Quality: {soilMoisture.quality}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-3xl font-bold ${getStatusColor()}`}>{moisturePercent}%</p>
              <p className="text-xs text-muted-foreground capitalize">
                {recommendation.moistureStatus}
              </p>
            </div>
          </div>
          <Progress value={moisturePercent} className="h-3" />
          <p className="text-xs text-muted-foreground">
            Last updated: {format(soilMoisture.timestamp, "MMM dd, yyyy 'at' h:mm a")}
          </p>
        </div>

        {/* Irrigation Recommendation */}
        <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {recommendation.shouldIrrigate ? (
                <Droplets className="h-5 w-5 text-blue-600" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <p className="font-medium">
                {recommendation.shouldIrrigate ? 'Irrigation Needed' : 'No Irrigation Required'}
              </p>
              <p className="text-sm text-muted-foreground">{recommendation.reason}</p>
              
              {recommendation.shouldIrrigate && (
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="font-medium">Water Amount:</span>{' '}
                    <span className="text-blue-600 font-semibold">{recommendation.waterAmount} mm</span>
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Next check: {format(recommendation.nextCheckDate, "MMM dd, yyyy")}
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex gap-2">
          {onRefresh && (
            <Button onClick={onRefresh} variant="outline" size="sm" className="flex-1">
              Refresh Data
            </Button>
          )}
          {recommendation.shouldIrrigate && (
            <Button size="sm" className="flex-1">
              Log Irrigation
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
