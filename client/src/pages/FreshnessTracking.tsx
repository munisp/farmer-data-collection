import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Snowflake, Thermometer, Clock, Award, AlertTriangle, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function FreshnessTracking() {
  const [orderId, setOrderId] = useState<number | null>(null);
  const [searchId, setSearchId] = useState("");

  const freshness = trpc.orderFulfillment.getOrderFreshness.useQuery(
    { orderId: orderId! },
    { enabled: !!orderId, retry: false },
  );

  const sellerReport = trpc.orderFulfillment.getSellerFreshnessReport.useQuery(
    { days: 30 },
    { retry: false },
  );

  const handleSearch = () => {
    const id = parseInt(searchId);
    if (id > 0) setOrderId(id);
  };

  const gradeColors: Record<string, string> = {
    "A+": "text-green-700 bg-green-100",
    "A": "text-green-600 bg-green-50",
    "B": "text-yellow-600 bg-yellow-50",
    "C": "text-orange-600 bg-orange-50",
    "F": "text-red-600 bg-red-50",
  };

  const report = sellerReport.data;

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="p-6 max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Snowflake className="h-6 w-6" /> Freshness Tracking
        </h1>
        <p className="text-muted-foreground">Track cold chain compliance and produce freshness from farm to delivery</p>

        {/* Seller Freshness Report */}
        {report && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <Award className="h-8 w-8 mx-auto text-green-600 mb-2" />
                <p className="text-2xl font-bold">{report.avgScore || "N/A"}</p>
                <p className="text-sm text-muted-foreground">Avg Freshness Score</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Snowflake className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                <p className="text-2xl font-bold">{report.totalDeliveries}</p>
                <p className="text-sm text-muted-foreground">Total Deliveries (30d)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-red-600 mb-2" />
                <p className="text-2xl font-bold">{report.coldChainBreaches || 0}</p>
                <p className="text-sm text-muted-foreground">Cold Chain Breaches</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm font-medium mb-2">Grade Distribution</p>
                {Object.entries(report.gradeDistribution || {}).map(([grade, count]) => (
                  <div key={grade} className="flex items-center justify-between text-sm">
                    <span className={`px-2 py-0.5 rounded ${gradeColors[grade] || ""}`}>{grade}</span>
                    <span>{count as number}</span>
                  </div>
                ))}
                {Object.keys(report.gradeDistribution || {}).length === 0 && (
                  <p className="text-muted-foreground text-sm">No data yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Order Freshness Lookup */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Check Order Freshness</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter Order ID..."
                value={searchId}
                onChange={e => setSearchId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
              />
              <Button onClick={handleSearch}>Search</Button>
            </div>

            {freshness.data && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-4">
                  <span className={`text-3xl font-bold px-4 py-2 rounded ${gradeColors[freshness.data.freshnessGrade || ""] || ""}`}>
                    {freshness.data.freshnessGrade}
                  </span>
                  <div>
                    <p className="text-lg font-semibold">Score: {freshness.data.freshnessScore}/100</p>
                    <p className="text-sm text-muted-foreground">
                      Shelf life: ~{freshness.data.estimatedShelfLifeHours || 0} hours remaining
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-blue-50 rounded">
                    <Thermometer className="h-4 w-4 text-blue-600 mb-1" />
                    <p className="text-sm text-muted-foreground">Avg Temp</p>
                    <p className="font-semibold">{freshness.data.avgTemperature}°C</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded">
                    <Thermometer className="h-4 w-4 text-red-600 mb-1" />
                    <p className="text-sm text-muted-foreground">Max Temp</p>
                    <p className="font-semibold">{freshness.data.maxTemperature}°C</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded">
                    <Thermometer className="h-4 w-4 text-green-600 mb-1" />
                    <p className="text-sm text-muted-foreground">Min Temp</p>
                    <p className="font-semibold">{freshness.data.minTemperature}°C</p>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded">
                    <Clock className="h-4 w-4 text-yellow-600 mb-1" />
                    <p className="text-sm text-muted-foreground">Transit Time</p>
                    <p className="font-semibold">{freshness.data.totalTransitMinutes || 0} min</p>
                  </div>
                </div>
                {(freshness.data.coldChainBreaches || 0) > 0 && (
                  <div className="p-3 bg-red-100 rounded flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <p className="text-sm text-red-800">{freshness.data.coldChainBreaches} cold chain breach(es) detected during transit</p>
                  </div>
                )}
              </div>
            )}

            {orderId && !freshness.data && !freshness.isLoading && (
              <p className="mt-4 text-muted-foreground">No freshness data available for this order</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
