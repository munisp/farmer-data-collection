import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  BarChart3, TrendingUp, Droplets, DollarSign, Milk, Beef,
  Heart, Baby, ArrowUp, ArrowDown, Minus
} from "lucide-react";

function MetricCard({ icon: Icon, label, value, target, unit, color }: {
  icon: typeof Milk; label: string; value: number; target?: number; unit: string;
  color: string;
}) {
  const pct = target ? ((value / target) * 100) : null;
  const trend = pct ? (pct >= 100 ? "up" : pct >= 80 ? "neutral" : "down") : "neutral";
  const TrendIcon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-600" : "text-amber-600";

  return (
    <Card className="dairy-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          {pct !== null && (
            <div className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="w-3 h-3" />
              {pct.toFixed(0)}%
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
        <p className="text-xl font-bold text-foreground">
          {typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : value} {unit}
        </p>
        {target && (
          <div className="mt-2">
            <div className="w-full h-1.5 rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${
                  (pct ?? 0) >= 100 ? "bg-emerald-500" : (pct ?? 0) >= 80 ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Target: {target} {unit}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DairyAnalytics() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "365d">("30d");

  const analyticsQuery = trpc.dairy.getMilkAnalytics.useQuery({ period }, { retry: false });
  const dashboardQuery = trpc.dairy.getDashboardSummary.useQuery(undefined, { retry: false });

  const milk = analyticsQuery.data;
  const dash = dashboardQuery.data;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-sky-700 dark:text-sky-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Dairy Analytics</h1>
              <p className="text-sm text-muted-foreground">
                Production trends, profitability, and herd performance
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {(["7d", "30d", "90d", "365d"] as const).map(p => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p)}
                className={period === p ? "dairy-btn-primary" : ""}
              >
                {p === "7d" ? "7D" : p === "30d" ? "30D" : p === "90d" ? "90D" : "1Y"}
              </Button>
            ))}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            icon={Droplets}
            label="Total Milk Yield"
            value={milk?.totalLiters ?? 0}
            unit="L"
            color="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
          />
          <MetricCard
            icon={Milk}
            label="Avg per Session"
            value={milk?.avgLitersPerSession ?? 0}
            target={8}
            unit="L"
            color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          />
          <MetricCard
            icon={TrendingUp}
            label="Avg Fat Content"
            value={milk?.avgFatPercentage ?? 0}
            target={4.0}
            unit="%"
            color="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          />
          <MetricCard
            icon={TrendingUp}
            label="Avg Protein"
            value={milk?.avgProteinPercentage ?? 0}
            target={3.3}
            unit="%"
            color="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
          />
        </div>

        {/* Herd & Revenue */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="dairy-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Beef className="w-4 h-4 text-teal-600" />
                Herd Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Cows</span>
                <span className="font-semibold">{dash?.herd.totalCows ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Active (Milking)</span>
                <span className="font-semibold text-emerald-600">{dash?.herd.activeCows ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pregnant</span>
                <span className="font-semibold text-purple-600">{dash?.breeding.pregnantCows ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Health Alerts</span>
                <span className="font-semibold text-red-600">{dash?.health.unresolvedAlerts ?? 0}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="dairy-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Revenue (30 days)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Revenue</span>
                <span className="font-semibold">₦{((dash?.market.revenue30d ?? 0) / 100).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Liters Collected</span>
                <span className="font-semibold">{(dash?.market.litersCollected30d ?? 0).toLocaleString()} L</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Collections</span>
                <span className="font-semibold">{dash?.market.collections30d ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg ₦/Liter</span>
                <span className="font-semibold">
                  {dash?.market.litersCollected30d
                    ? `₦${((dash.market.revenue30d / dash.market.litersCollected30d) / 100).toFixed(0)}`
                    : "—"
                  }
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="dairy-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-600" />
                Production Efficiency
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Records ({period})</span>
                <span className="font-semibold">{milk?.totalRecords ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Active Cows</span>
                <span className="font-semibold">{milk?.activeCows ?? 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Liters/Cow/Day</span>
                <span className="font-semibold">
                  {milk && milk.activeCows > 0
                    ? (milk.totalLiters / milk.activeCows / (period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : 365)).toFixed(1)
                    : "—"
                  } L
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Quality Target</span>
                <Badge variant="outline" className={
                  (milk?.avgFatPercentage ?? 0) >= 3.5
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                }>
                  {(milk?.avgFatPercentage ?? 0) >= 3.5 ? "Grade A" : "Below Target"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Benchmarks */}
        <Card className="dairy-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-teal-600" />
              Industry Benchmarks
            </CardTitle>
            <CardDescription>How your farm compares to regional averages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { label: "Milk Yield/Cow/Day", yours: milk && milk.activeCows > 0 ? (milk.totalLiters / milk.activeCows / 30).toFixed(1) : "—", benchmark: "8-12 L", unit: "L" },
                { label: "Fat Content", yours: `${(milk?.avgFatPercentage ?? 0).toFixed(1)}%`, benchmark: "3.5-4.5%", unit: "" },
                { label: "Protein Content", yours: `${(milk?.avgProteinPercentage ?? 0).toFixed(1)}%`, benchmark: "3.0-3.5%", unit: "" },
              ].map(({ label, yours, benchmark }) => (
                <div key={label} className="text-center space-y-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
                  <p className="text-2xl font-bold text-foreground">{yours}</p>
                  <p className="text-xs text-muted-foreground">Benchmark: {benchmark}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
