import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { TrendingUp, TrendingDown, Bell, BarChart3, Target } from "lucide-react";

export default function PriceAlertsDashboard() {
  const [crop, setCrop] = useState("maize");
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split("T")[0];
  });

  const overview = trpc.priceAlerts.getMarketOverview.useQuery();
  const prediction = trpc.priceAlerts.predictPrice.useQuery(
    { crop, targetDate },
    { enabled: !!crop && !!targetDate }
  );
  const priceSeries = trpc.priceAlerts.predictPriceSeries.useQuery(
    { crop, weeks: 12 },
    { enabled: !!crop }
  );
  const myAlerts = trpc.priceAlerts.getMyAlerts.useQuery();
  const supportedCrops = trpc.priceAlerts.getSupportedCrops.useQuery();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Price Intelligence & Alerts</h1>
          <p className="text-muted-foreground">AI-powered price predictions and SMS/push price alerts</p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Market Overview</TabsTrigger>
            <TabsTrigger value="predict">Price Prediction</TabsTrigger>
            <TabsTrigger value="alerts">My Alerts</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>East Africa Market Overview</CardTitle>
                <CardDescription>Current prices and next-month trends</CardDescription>
              </CardHeader>
              <CardContent>
                {overview.data && (overview.data as Record<string, unknown>).crops ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {((overview.data as Record<string, unknown>).crops as Array<Record<string, unknown>>).map((crop) => (
                      <div key={crop.crop as string} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium capitalize">{crop.crop as string}</h3>
                          {crop.next_month_trend === "up" ? (
                            <TrendingUp className="h-5 w-5 text-green-500" />
                          ) : crop.next_month_trend === "down" ? (
                            <TrendingDown className="h-5 w-5 text-red-500" />
                          ) : (
                            <BarChart3 className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                        <p className="text-2xl font-bold mt-1">
                          {crop.currency as string} {Math.round(crop.current_price as number)}
                        </p>
                        <p className="text-sm">per {crop.unit as string}</p>
                        <Badge className="mt-2" variant={
                          (crop.next_month_change_pct as number) > 0 ? "default" : "destructive"
                        }>
                          {(crop.next_month_change_pct as number) > 0 ? "+" : ""}{crop.next_month_change_pct as number}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Loading market data...</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="predict" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Price Prediction</CardTitle>
                  <CardDescription>ML-powered forecast for crop prices</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Crop</label>
                    <Input value={crop} onChange={e => setCrop(e.target.value)} placeholder="maize, tomatoes, coffee..." />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Target Date</label>
                    <Input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
                  </div>
                  {prediction.data && !("error" in prediction.data) && (
                    <div role="main" aria-label="Page content" className="p-4 border rounded-lg bg-blue-50">
                      <h4 className="font-bold text-lg">
                        {(prediction.data as Record<string, unknown>).currency as string}{" "}
                        {(prediction.data as Record<string, unknown>).predicted_price as number}
                        <span className="text-sm font-normal"> / {(prediction.data as Record<string, unknown>).unit as string}</span>
                      </h4>
                      <p className="text-sm mt-1">
                        Range: {((prediction.data as Record<string, unknown>).price_range as Record<string, number>)?.low} –{" "}
                        {((prediction.data as Record<string, unknown>).price_range as Record<string, number>)?.high}
                      </p>
                      <p className="text-sm">Confidence: {Math.round(((prediction.data as Record<string, unknown>).confidence as number) * 100)}%</p>
                      <div className="mt-3 p-2 bg-white rounded">
                        <Badge variant={(prediction.data as Record<string, unknown>).recommendation === "HOLD" ? "default" : "destructive"}>
                          {(prediction.data as Record<string, unknown>).recommendation as string}
                        </Badge>
                        <p className="text-sm mt-1">{(prediction.data as Record<string, unknown>).recommendation_reason as string}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>12-Week Price Forecast</CardTitle>
                  <CardDescription>Weekly price predictions for {crop}</CardDescription>
                </CardHeader>
                <CardContent>
                  {priceSeries.data && (priceSeries.data as Record<string, unknown>).predictions ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm font-medium border-b pb-2">
                        <span>Best sell date: {(priceSeries.data as Record<string, unknown>).best_sell_date as string}</span>
                        <span>Best price: {(priceSeries.data as Record<string, unknown>).best_sell_price as number}</span>
                      </div>
                      {((priceSeries.data as Record<string, unknown>).predictions as Array<Record<string, unknown>>).map((p, i) => {
                        const maxPrice = (priceSeries.data as Record<string, unknown>).max_price as number;
                        const minPrice = (priceSeries.data as Record<string, unknown>).min_price as number;
                        const width = maxPrice > minPrice ? ((p.price as number - minPrice) / (maxPrice - minPrice) * 100) : 50;
                        return (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="w-24 text-muted-foreground">{p.date as string}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-4">
                              <div className="bg-blue-500 rounded-full h-4" style={{ width: `${width}%` }} />
                            </div>
                            <span className="w-16 text-right font-medium">{Math.round(p.price as number)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p>Loading forecast...</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="alerts">
            <Card>
              <CardHeader>
                <CardTitle>My Price Alerts</CardTitle>
                <CardDescription>Get notified via SMS when prices hit your thresholds</CardDescription>
              </CardHeader>
              <CardContent>
                {myAlerts.data && myAlerts.data.length > 0 ? (
                  <div className="space-y-3">
                    {myAlerts.data.map((alert: Record<string, unknown>) => (
                      <div key={alert.id as number} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Bell className="h-5 w-5" />
                          <div>
                            <p className="font-medium capitalize">{alert.crop as string}</p>
                            <p className="text-sm text-muted-foreground">
                              Alert when price goes {alert.alertType as string} {alert.currency as string} {alert.threshold as number}
                            </p>
                          </div>
                        </div>
                        <Badge>{alert.notificationChannel as string}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Bell className="h-12 w-12 mx-auto text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">No price alerts configured</p>
                    <Button className="mt-4">Create Alert</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
