/**
 * Crop Calendar Component
 * 
 * Displays crop development timeline with GDD tracking, growth stages,
 * and harvest date predictions.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Calendar, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface CropGrowthStatus {
  cropType: string;
  plantingDate: Date;
  currentDate: Date;
  daysAfterPlanting: number;
  cumulativeGDD: number;
  gddToMaturity: number;
  percentComplete: number;
  currentStage: string;
  nextStage: string | null;
  gddToNextStage: number;
  estimatedHarvestDate: Date;
  daysToHarvest: number;
  isOnTrack: boolean;
  recommendations: string[];
}

interface CropCalendarProps {
  cropName: string;
  growthStatus: CropGrowthStatus | null;
  loading?: boolean;
}

export function CropCalendar({ cropName, growthStatus, loading }: CropCalendarProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Crop Calendar
          </CardTitle>
          <CardDescription>Loading growth status...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-4 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
            <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!growthStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Crop Calendar
          </CardTitle>
          <CardDescription>No growth data available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Planting date not set or insufficient weather data for GDD calculation.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = () => {
    if (growthStatus.isOnTrack) {
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    }
    return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
  };

  const getProgressColor = () => {
    if (growthStatus.percentComplete < 30) return "bg-blue-500";
    if (growthStatus.percentComplete < 70) return "bg-green-500";
    if (growthStatus.percentComplete < 90) return "bg-yellow-500";
    return "bg-orange-500";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Crop Calendar - {cropName}
            </CardTitle>
            <CardDescription>
              Growing Degree Days (GDD) tracking and harvest prediction
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <Badge variant={growthStatus.isOnTrack ? "default" : "secondary"}>
              {growthStatus.isOnTrack ? "On Track" : "Needs Attention"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Timeline Overview */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Planting Date</p>
            <p className="text-lg font-semibold">{format(growthStatus.plantingDate, "MMM dd, yyyy")}</p>
            <p className="text-xs text-muted-foreground">
              {growthStatus.daysAfterPlanting} days ago
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Current Stage</p>
            <p className="text-lg font-semibold capitalize">{growthStatus.currentStage}</p>
            {growthStatus.nextStage && (
              <p className="text-xs text-muted-foreground">
                Next: {growthStatus.nextStage} ({growthStatus.gddToNextStage} GDD)
              </p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Est. Harvest</p>
            <p className="text-lg font-semibold">{format(growthStatus.estimatedHarvestDate, "MMM dd, yyyy")}</p>
            <p className="text-xs text-muted-foreground">
              {growthStatus.daysToHarvest} days remaining
            </p>
          </div>
        </div>

        <Separator />

        {/* GDD Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Growing Degree Days</p>
              <p className="text-xs text-muted-foreground">
                {growthStatus.cumulativeGDD} / {growthStatus.gddToMaturity} GDD accumulated
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{growthStatus.percentComplete}%</p>
              <p className="text-xs text-muted-foreground">Complete</p>
            </div>
          </div>
          <Progress value={growthStatus.percentComplete} className="h-3" />
        </div>

        <Separator />

        {/* Growth Stages Timeline */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Development Timeline</p>
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-border ml-2" />
            <div className="space-y-4 pl-8">
              {/* Emergence */}
              <div className="relative">
                <div className="absolute -left-6 top-1 h-4 w-4 rounded-full bg-green-500 border-2 border-background" />
                <div>
                  <p className="text-sm font-medium">Emergence</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>

              {/* Vegetative */}
              <div className="relative">
                <div
                  className={`absolute -left-6 top-1 h-4 w-4 rounded-full border-2 border-background ${
                    growthStatus.currentStage === "vegetative" ||
                    growthStatus.percentComplete > 40
                      ? "bg-green-500"
                      : "bg-muted"
                  }`}
                />
                <div>
                  <p className="text-sm font-medium">Vegetative Growth</p>
                  <p className="text-xs text-muted-foreground">
                    {growthStatus.currentStage === "vegetative"
                      ? "In Progress"
                      : growthStatus.percentComplete > 40
                      ? "Completed"
                      : "Upcoming"}
                  </p>
                </div>
              </div>

              {/* Flowering */}
              <div className="relative">
                <div
                  className={`absolute -left-6 top-1 h-4 w-4 rounded-full border-2 border-background ${
                    growthStatus.currentStage === "flowering" ||
                    growthStatus.percentComplete > 70
                      ? "bg-green-500"
                      : "bg-muted"
                  }`}
                />
                <div>
                  <p className="text-sm font-medium">Flowering</p>
                  <p className="text-xs text-muted-foreground">
                    {growthStatus.currentStage === "flowering"
                      ? "In Progress"
                      : growthStatus.percentComplete > 70
                      ? "Completed"
                      : "Upcoming"}
                  </p>
                </div>
              </div>

              {/* Grain Fill / Maturity */}
              <div className="relative">
                <div
                  className={`absolute -left-6 top-1 h-4 w-4 rounded-full border-2 border-background ${
                    growthStatus.percentComplete > 90 ? "bg-green-500" : "bg-muted"
                  }`}
                />
                <div>
                  <p className="text-sm font-medium">Maturity</p>
                  <p className="text-xs text-muted-foreground">
                    {growthStatus.percentComplete > 90 ? "Completed" : "Upcoming"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {growthStatus.recommendations.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recommendations
              </p>
              <ul className="space-y-2">
                {growthStatus.recommendations.map((rec, index) => (
                  <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
