import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, ArrowRight, TrendingUp, Shield } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

const CREDIT_URL = import.meta.env.VITE_CREDIT_SERVICE_URL || "http://localhost:8108";

interface ScoreResult {
  score: number;
  grade: string;
  risk_level: string;
  max_loan_amount: number;
  recommendations: string[];
}

export function CreditScoreWidget() {
  const { formatCurrency } = useLocalization();
  const [scoreData, setScoreData] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScore() {
      try {
        const resp = await fetch(`${CREDIT_URL}/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            farm_hectares: 3.5,
            has_boundary: true,
            crop_count: 3,
            harvest_count: 5,
            avg_yield_ratio: 0.75,
            total_loans: 3,
            repaid_ontime: 3,
            defaults: 0,
            in_cooperative: true,
            years_farming: 5,
            has_marketplace_listings: true,
            market_distance_km: 10,
            uses_mobile_app: true,
            uses_gps_tracking: true,
            uses_iot_sensors: false,
            uses_weather_alerts: true,
            has_satellite_imagery: false,
            soil_quality_score: 65,
            has_irrigation: false,
            has_drainage: false,
            has_crop_insurance: false,
            uses_drought_resistant: true,
          }),
        });
        if (resp.ok) {
          setScoreData(await resp.json());
        }
      } catch (err) {
        console.warn('[CreditScore] Service unavailable:', String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchScore();
  }, []);

  const gradeColor = (grade: string) => {
    if (grade.startsWith("A")) return "text-green-600 bg-green-100 dark:bg-green-950 dark:text-green-400";
    if (grade.startsWith("B")) return "text-blue-600 bg-blue-100 dark:bg-blue-950 dark:text-blue-400";
    if (grade.startsWith("C")) return "text-yellow-600 bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-400";
    return "text-red-600 bg-red-100 dark:bg-red-950 dark:text-red-400";
  };

  return (
    <Card className="shadow-lg dark:bg-gray-900" role="region" aria-label="Credit score summary">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-600" />
            Credit Score
          </span>
          <a href="/credit-score">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              Details <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-center py-4 text-sm text-muted-foreground">Loading...</div>
        ) : scoreData ? (
          <>
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-indigo-700 dark:text-indigo-400">
                  {scoreData.score.toFixed(0)}
                </div>
                <div className="text-xs text-muted-foreground">/100</div>
              </div>
              <Badge className={`text-lg px-3 py-1 ${gradeColor(scoreData.grade)}`}>
                {scoreData.grade}
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  Risk Level
                </span>
                <span className="capitalize font-medium">{scoreData.risk_level.replace("_", " ")}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                  Max Loan
                </span>
                <span className="font-medium">{formatCurrency(scoreData.max_loan_amount)}</span>
              </div>
            </div>
            {scoreData.recommendations.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Top Recommendation:</p>
                <p className="text-xs">{scoreData.recommendations[0]}</p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">Credit scoring service unavailable</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
