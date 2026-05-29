import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function CreditScoreDashboard() {
  const { data: history, isLoading: historyLoading } = trpc.microfinance.getCreditScoreHistory.useQuery();
  const { data: factors, isLoading: factorsLoading } = trpc.microfinance.getCreditScoreFactors.useQuery();

  const currentScore = factors?.score || 0;
  const previousScore = history && history.length > 1 ? history[1].score : currentScore;
  const scoreDiff = currentScore - previousScore;

  const getScoreColor = (score: number) => {
    if (score >= 750) return "text-green-600";
    if (score >= 650) return "text-blue-600";
    if (score >= 550) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 750) return "Excellent";
    if (score >= 650) return "Good";
    if (score >= 550) return "Fair";
    return "Poor";
  };

  const getFactorColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-blue-500";
    if (score >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getImpactBadge = (impact: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      high: "default",
      medium: "secondary",
      low: "outline",
    };
    return <Badge variant={variants[impact] || "outline"}>{impact.toUpperCase()}</Badge>;
  };

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Credit Score Dashboard</h1>
          <p className="text-muted-foreground">Monitor your creditworthiness and track improvements</p>
        </div>

        {/* Current Credit Score */}
        <Card>
          <CardHeader>
            <CardTitle>Your Credit Score</CardTitle>
            <CardDescription>Updated based on your loan and payment history</CardDescription>
          </CardHeader>
          <CardContent>
            {factorsLoading ? (
              <p>Loading credit score...</p>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className={`text-6xl font-bold ${getScoreColor(currentScore)}`}>
                      {currentScore}
                    </div>
                    <div className="mt-2 text-lg font-medium text-muted-foreground">
                      {getScoreLabel(currentScore)}
                    </div>
                  </div>
                  <div className="h-24 w-px bg-border" />
                  <div>
                    <p className="text-sm text-muted-foreground">Score Range</p>
                    <p className="text-2xl font-bold">300 - 850</p>
                    <div className="mt-2 flex items-center gap-2">
                      {scoreDiff > 0 ? (
                        <>
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-600">
                            +{scoreDiff} from last month
                          </span>
                        </>
                      ) : scoreDiff < 0 ? (
                        <>
                          <TrendingDown className="h-4 w-4 text-red-600" />
                          <span className="text-sm font-medium text-red-600">
                            {scoreDiff} from last month
                          </span>
                        </>
                      ) : (
                        <>
                          <Minus className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">No change</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-2">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {currentScore >= 650 ? "You're eligible for most loans" : "Improve your score to access better rates"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Credit Score History Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Credit Score History</CardTitle>
            <CardDescription>Your score trend over the past 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <p>Loading history...</p>
            ) : !history || history.length === 0 ? (
              <p className="text-muted-foreground">No credit history available yet</p>
            ) : (
              <div className="space-y-4">
                <div className="flex h-48 items-end gap-2">
                  {history
                    .slice()
                    .reverse()
                    .map((record, index) => {
                      const height = (record.score / 850) * 100;
                      return (
                        <div key={index} className="flex flex-1 flex-col items-center gap-2">
                          <div
                            className={`w-full rounded-t ${getScoreColor(record.score).replace("text-", "bg-")}`}
                            style={{ height: `${height}%` }}
                            title={`Score: ${record.score}`}
                          />
                          <div className="text-xs text-muted-foreground">
                            {new Date(record.calculatedAt).toLocaleDateString("en-US", {
                              month: "short",
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
                <div className="flex items-center justify-between border-t pt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {history.length} month{history.length > 1 ? "s" : ""} of history
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded bg-green-600" />
                      <span>Excellent (750+)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded bg-blue-600" />
                      <span>Good (650-749)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded bg-yellow-600" />
                      <span>Fair (550-649)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded bg-red-600" />
                      <span>Poor (&lt;550)</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Score Factors Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Score Factors</CardTitle>
            <CardDescription>What impacts your credit score</CardDescription>
          </CardHeader>
          <CardContent>
            {factorsLoading ? (
              <p>Loading factors...</p>
            ) : !factors?.factors || factors.factors.length === 0 ? (
              <p className="text-muted-foreground">No factor data available</p>
            ) : (
              <div className="space-y-6">
                {factors.factors.map((factor) => (
                  <div key={factor.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium">{factor.name}</h3>
                        {getImpactBadge(factor.impact)}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium">{factor.weight}% of score</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={factor.score} className="flex-1" />
                      <span className="w-12 text-sm font-medium">{factor.score}%</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{factor.description}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Improvement Recommendations */}
        <Card>
          <CardHeader>
            <CardTitle>Personalized Recommendations</CardTitle>
            <CardDescription>Actions you can take to improve your credit score</CardDescription>
          </CardHeader>
          <CardContent>
            {factorsLoading ? (
              <p>Loading recommendations...</p>
            ) : !factors?.recommendations || factors.recommendations.length === 0 ? (
              <p className="text-muted-foreground">No recommendations available</p>
            ) : (
              <div className="space-y-3">
                {factors.recommendations.map((recommendation, index) => (
                  <div key={index} className="flex gap-3 rounded-lg border p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{recommendation}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
