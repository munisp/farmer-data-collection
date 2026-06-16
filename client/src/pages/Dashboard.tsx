import { useEffect, useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Tractor, Sprout, Beef, TrendingUp, Receipt, DollarSign, TrendingDown, Brain, Target, ArrowRight, Activity, Zap, Satellite, Droplets, Leaf, ShoppingCart, Truck, ArrowRightLeft, CreditCard, Snowflake, Building2, Store, Mic, Warehouse, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTutorial } from "@/contexts/TutorialContext";
import { OnboardingTutorial } from "@/components/OnboardingTutorial";
import { tutorialSteps } from "@/config/tutorialSteps";
import { Loader2 } from "lucide-react";
import { WeatherCard } from "@/components/WeatherCard";
import { WeatherAlertsWidget } from "@/components/WeatherAlertsWidget";
import MLInsightsWidget from "@/components/MLInsightsWidget";
import { NearbyFarmsWidget } from "@/components/NearbyFarmsWidget";
import { WebSocketStatusWidget, RecentEventsWidget, ActiveAlertsWidget } from "@/components/RealtimeWidgets";

import { PageHeader, PageSection } from "@/components/ui/page-header";
import { StatsCard, StatsGrid } from "@/components/ui/stats-card";
import { ModernCard, CardHeader as ModernCardHeader } from "@/components/ui/modern-card";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";
import { trpc } from "@/lib/trpc";

interface Stats {
  totalFarmers: number;
  totalFarms: number;
  totalCrops: number;
  totalLivestock: number;
  totalHarvests: number;
  totalExpenses: number;
  totalRevenue: number;
  netProfit: number;
  profitMargin: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { showTutorial, completeTutorial, skipTutorial } = useTutorial();
  const { formatCurrency } = useLocalization();
  const userId = Number(user?.id || 0);

  const statsQuery = trpc.dashboard.getStats.useQuery(
    { userId },
    { enabled: userId > 0, retry: false, staleTime: 10_000 }
  );

  const activityQuery = trpc.dashboard.getRecentActivities.useQuery(
    { userId, limit: 6 },
    { enabled: userId > 0, retry: false, staleTime: 10_000 }
  );

  const stats = useMemo<Stats>(() => {
    const data = statsQuery.data;
    const totalExpensesAmount = (data?.totalExpenses || 0) / 100;
    const totalRevenue = (data?.totalHarvests || 0) * 10;
    const netProfit = totalRevenue - totalExpensesAmount;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    return {
      totalFarmers: data?.farmers || 0,
      totalFarms: data?.farms || 0,
      totalCrops: data?.crops || 0,
      totalLivestock: data?.livestock || 0,
      totalHarvests: data?.harvests || 0,
      totalExpenses: data?.expenses || 0,
      totalRevenue,
      netProfit,
      profitMargin,
    };
  }, [statsQuery.data]);

  const loading = statsQuery.isLoading && !statsQuery.data;

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-muted-foreground">Authenticating...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const statCards = [
    {
      title: "Total Farmers",
      value: stats.totalFarmers,
      description: "Registered farmers in the system",
      icon: Users,
      color: "text-blue-600",
    },
    {
      title: "Total Farms",
      value: stats.totalFarms,
      description: "Active farms being managed",
      icon: Tractor,
      color: "text-green-600",
    },
    {
      title: "Total Crops",
      value: stats.totalCrops,
      description: "Crop cultivation records",
      icon: Sprout,
      color: "text-emerald-600",
    },
    {
      title: "Total Livestock",
      value: stats.totalLivestock,
      description: "Livestock records tracked",
      icon: Beef,
      color: "text-orange-600",
    },
    {
      title: "Total Harvests",
      value: stats.totalHarvests,
      description: "Harvest records collected",
      icon: TrendingUp,
      color: "text-purple-600",
    },
    {
      title: "Total Expenses",
      value: stats.totalExpenses,
      description: "Expense records tracked",
      icon: Receipt,
      color: "text-red-600",
    },
  ];

  const financialCards = [
    {
      title: "Total Revenue",
      value: formatCurrency(stats.totalRevenue),
      description: "From harvests and sales",
      icon: DollarSign,
      color: "text-green-600",
      trend: "+5.2%",
      trendUp: true,
    },
    {
      title: "Total Expenses",
      value: formatCurrency(stats.totalExpenses > 0 ? stats.totalExpenses * 100 : 0),
      description: "Farm operational costs",
      icon: Receipt,
      color: "text-red-600",
      trend: "+3.1%",
      trendUp: true,
    },
    {
      title: "Net Profit",
      value: formatCurrency(stats.netProfit),
      description: `Margin: ${stats.profitMargin.toFixed(1)}%`,
      icon: stats.netProfit >= 0 ? TrendingUp : TrendingDown,
      color: stats.netProfit >= 0 ? "text-green-600" : "text-red-600",
      trend: stats.netProfit >= 0 ? "Profitable" : "Loss",
      trendUp: stats.netProfit >= 0,
    },
  ];

  return (
    <>
      {showTutorial && (
        <OnboardingTutorial
          steps={tutorialSteps}
          onComplete={completeTutorial}
          onSkip={skipTutorial}
        />
      )}
      <DashboardLayout>
        <div className="space-y-8 animate-fade-in">
          {/* Modern Page Header */}
          <PageHeader
            title="Dashboard"
            description="Overview of your farm data collection system"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <Activity className="w-4 h-4" />
              View Reports
            </Button>
            <Button size="sm" className="gap-2 btn-glow">
              <Zap className="w-4 h-4" />
              Quick Actions
            </Button>
          </PageHeader>

          {/* Key Metrics - Modern Stats Grid */}
          <PageSection title="Key Metrics">
            <StatsGrid columns={3}>
              {statCards.slice(0, 6).map((stat, index) => {
                const Icon = stat.icon;
                return (
                  <StatsCard
                    key={stat.title}
                    title={stat.title}
                    value={stat.value}
                    description={stat.description}
                    icon={<Icon className="w-5 h-5" />}
                    className={`stagger-${index + 1}`}
                    variant={index === 0 ? "primary" : "default"}
                  />
                );
              })}
            </StatsGrid>
          </PageSection>

          {/* Financial Overview - Modern Cards */}
          <PageSection 
            title="Financial Overview"
            action={
              <Button variant="ghost" size="sm" className="gap-1 text-primary">
                View Details <ArrowRight className="w-4 h-4" />
              </Button>
            }
          >
            <StatsGrid columns={3}>
              {financialCards.map((card, index) => {
                const Icon = card.icon;
                return (
                  <StatsCard
                    key={card.title}
                    title={card.title}
                    value={card.value}
                    description={card.description}
                    icon={<Icon className="w-5 h-5" />}
                    trend={{
                      value: card.trendUp ? 5.2 : -3.1,
                      label: card.trend,
                    }}
                    variant={card.title === "Net Profit" ? "accent" : "default"}
                    className={`stagger-${index + 1}`}
                  />
                );
              })}
            </StatsGrid>
          </PageSection>

          {/* Real-time Activity - Modern Section */}
          <PageSection title="Real-time Activity">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <WebSocketStatusWidget />
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                  <CardDescription>Latest events from your farm operations</CardDescription>
                </CardHeader>
                <CardContent>
                  {(activityQuery.data && activityQuery.data.length > 0) ? (
                    <div className="space-y-3">
                      {activityQuery.data.map((activity, index: number) => (
                        <div key={index} className="flex items-start gap-3">
                          <div className={`p-1.5 rounded-full bg-muted ${activity.type === 'harvest' ? 'text-green-500' : 'text-orange-500'}`}>
                            {activity.type === 'harvest' ? <TrendingUp className="w-3 h-3" /> : <Receipt className="w-3 h-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{activity.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(activity.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Activity className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No recent activity</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <ActiveAlertsWidget />
            </div>
          </PageSection>

          {/* Weather & AI Insights - Modern Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WeatherCard 
              latitude={7.3775} 
              longitude={3.9470} 
              locationName="Ibadan, Oyo State" 
            />
            <WeatherAlertsWidget />
            <MLInsightsWidget />
            
            {/* AI/ML Models Quick Access - Modern Card */}
            <ModernCard variant="elevated" className="bg-gradient-to-br from-primary/5 via-transparent to-accent/5">
              <ModernCardHeader
                title="AI/ML Models"
                description="Access pre-trained models for disease detection, pest identification, and yield prediction"
                icon={<Brain className="w-5 h-5" />}
              />
              <div className="space-y-3">
                <div className="flex flex-col gap-3">
                  <a href="/yield-prediction" className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 hover:from-green-500/20 hover:to-emerald-500/20 transition-colors group border border-green-500/20">
                    <div className="flex items-center gap-3">
                      <div role="main" aria-label="Page content" className="p-2 rounded-lg bg-green-500/20 text-green-600">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">Yield Prediction & Analytics</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-green-600 group-hover:text-green-500 transition-colors" />
                  </a>
                  <a href="/models" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Brain className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium">Browse Model Library</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </a>
                  <a href="/models/downloads" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-info/10 text-info">
                        <TrendingDown className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium">Manage Downloads</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </a>
                  <a href="/models/benchmarks" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-success/10 text-success">
                        <Target className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium">View Benchmarks</span>
                    </div>
                    <span className="text-xs font-medium text-success bg-success/10 px-2 py-1 rounded-full">+3.5% vs Plantix</span>
                  </a>
                </div>
                <div className="pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Model Accuracy
                    </p>
                    <span className="text-sm font-bold text-primary">92.50%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Across 10 models for Nigerian crops
                  </p>
                </div>
              </div>
            </ModernCard>

                        {/* Satellite Imagery & Precision Agriculture - New Card */}
                        <ModernCard variant="elevated" className="bg-gradient-to-br from-blue-500/5 via-transparent to-green-500/5">
                          <ModernCardHeader
                            title="Satellite Imagery & Precision Ag"
                            description="Monitor crop health with EOS-style satellite imagery and vegetation indices"
                            icon={<Satellite className="w-5 h-5" />}
                          />
                          <div className="space-y-3">
                            <div className="flex flex-col gap-3">
                              <a href="/satellite-imagery" className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-blue-500/10 to-cyan-500/10 hover:from-blue-500/20 hover:to-cyan-500/20 transition-colors group border border-blue-500/20">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 rounded-lg bg-blue-500/20 text-blue-600">
                                    <Satellite className="h-4 w-4" />
                                  </div>
                                  <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Satellite Imagery</span>
                                </div>
                                <ArrowRight className="w-4 h-4 text-blue-600 group-hover:text-blue-500 transition-colors" />
                              </a>
                              <a href="/field-overview" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                                    <Leaf className="h-4 w-4" />
                                  </div>
                                  <span className="text-sm font-medium">Field Overview (EOS)</span>
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              </a>
                              <a href="/precision-agriculture" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 rounded-lg bg-green-500/10 text-green-600">
                                    <Target className="h-4 w-4" />
                                  </div>
                                  <span className="text-sm font-medium">Precision Agriculture</span>
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              </a>
                              <a href="/weather" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600">
                                    <Droplets className="h-4 w-4" />
                                  </div>
                                  <span className="text-sm font-medium">Weather & GDD</span>
                                </div>
                                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              </a>
                            </div>
                            <div className="pt-3 border-t border-border/50">
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Vegetation Indices
                                </p>
                                <span className="text-xs font-medium text-blue-600 bg-blue-500/10 px-2 py-1 rounded-full">NDVI, NDMI, NDRE, EVI</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Sentinel-2 L2A imagery with 10m resolution
                              </p>
                            </div>
                          </div>
                        </ModernCard>

                        {/* Nearby Farms Widget */}
                        <NearbyFarmsWidget />

          {/* Marketplace & Commerce */}
          <ModernCard variant="elevated" className="bg-gradient-to-br from-green-500/5 via-transparent to-emerald-500/5">
            <ModernCardHeader
              title="Marketplace & Commerce"
              description="Buy, sell, and trade agricultural produce across Nigeria"
              icon={<ShoppingCart className="w-5 h-5" />}
            />
            <div className="space-y-3">
              <div className="flex flex-col gap-3">
                <a href="/marketplace" className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-green-500/10 to-emerald-500/10 hover:from-green-500/20 hover:to-emerald-500/20 transition-colors group border border-green-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/20 text-green-600"><ShoppingCart className="h-4 w-4" /></div>
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">Browse Marketplace</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-green-600 group-hover:text-green-500 transition-colors" />
                </a>
                <a href="/marketplace/create" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600"><Sprout className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Create Listing</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
                <a href="/group-buying" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600"><Users className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Group Buying</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
                <a href="/price-discovery" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600"><BarChart3 className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Price Discovery</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
              </div>
            </div>
          </ModernCard>

          {/* Delivery & Supply Chain */}
          <ModernCard variant="elevated" className="bg-gradient-to-br from-orange-500/5 via-transparent to-amber-500/5">
            <ModernCardHeader
              title="Delivery & Supply Chain"
              description="Manage deliveries, logistics, cold chain, and traceability"
              icon={<Truck className="w-5 h-5" />}
            />
            <div className="space-y-3">
              <div className="flex flex-col gap-3">
                <a href="/delivery" className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-orange-500/10 to-amber-500/10 hover:from-orange-500/20 hover:to-amber-500/20 transition-colors group border border-orange-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/20 text-orange-600"><Truck className="h-4 w-4" /></div>
                    <span className="text-sm font-medium text-orange-700 dark:text-orange-400">Delivery Dashboard</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-orange-600 group-hover:text-orange-500 transition-colors" />
                </a>
                <a href="/delivery/tracking" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600"><Activity className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Live Tracking</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
                <a href="/cold-chain" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600"><Snowflake className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Cold Chain Monitoring</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
                <a href="/freshness" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10 text-green-600"><Leaf className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Freshness Tracking</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
                <a href="/traceability" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600"><Target className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Produce Traceability</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
              </div>
            </div>
          </ModernCard>

          {/* Financial Services */}
          <ModernCard variant="elevated" className="bg-gradient-to-br from-purple-500/5 via-transparent to-indigo-500/5">
            <ModernCardHeader
              title="Financial Services"
              description="Payments, credit scoring, loans, and reconciliation"
              icon={<DollarSign className="w-5 h-5" />}
            />
            <div className="space-y-3">
              <div className="flex flex-col gap-3">
                <a href="/payment-reconciliation" className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-indigo-500/10 hover:from-purple-500/20 hover:to-indigo-500/20 transition-colors group border border-purple-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/20 text-purple-600"><ArrowRightLeft className="h-4 w-4" /></div>
                    <span className="text-sm font-medium text-purple-700 dark:text-purple-400">Payment Reconciliation</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-purple-600 group-hover:text-purple-500 transition-colors" />
                </a>
                <a href="/credit-score" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600"><CreditCard className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Credit Scoring</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
                <a href="/mobile-money" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10 text-green-600"><DollarSign className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Mobile Money</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
                <a href="/chama" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600"><Users className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Chama Groups & Lending</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
              </div>
            </div>
          </ModernCard>

          {/* Retail & B2B / Cooperatives */}
          <ModernCard variant="elevated" className="bg-gradient-to-br from-rose-500/5 via-transparent to-pink-500/5">
            <ModernCardHeader
              title="Retail, B2B & Cooperatives"
              description="Retail store integration, bulk ordering, and cooperative management"
              icon={<Store className="w-5 h-5" />}
            />
            <div className="space-y-3">
              <div className="flex flex-col gap-3">
                <a href="/retail/store" className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-rose-500/10 to-pink-500/10 hover:from-rose-500/20 hover:to-pink-500/20 transition-colors group border border-rose-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-rose-500/20 text-rose-600"><Store className="h-4 w-4" /></div>
                    <span className="text-sm font-medium text-rose-700 dark:text-rose-400">Retail Store Dashboard</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-rose-600 group-hover:text-rose-500 transition-colors" />
                </a>
                <a href="/cooperative-dashboard" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600"><Building2 className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Cooperative Dashboard</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
                <a href="/exchange" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600"><BarChart3 className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Commodity Exchange</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
                <a href="/aggregation-hub" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10 text-orange-600"><Warehouse className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Aggregation Hub</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
                <a href="/retail/bulk-ordering" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600"><Receipt className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Bulk Ordering & Invoices</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
              </div>
            </div>
          </ModernCard>

          {/* Voice & Accessibility */}
          <ModernCard variant="elevated" className="bg-gradient-to-br from-violet-500/5 via-transparent to-fuchsia-500/5">
            <ModernCardHeader
              title="Voice & Accessibility"
              description="Voice navigation, multilingual support, and accessible farming tools"
              icon={<Mic className="w-5 h-5" />}
            />
            <div className="space-y-3">
              <div className="flex flex-col gap-3">
                <a href="/voice-navigation" className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 hover:from-violet-500/20 hover:to-fuchsia-500/20 transition-colors group border border-violet-500/20">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-violet-500/20 text-violet-600"><Mic className="h-4 w-4" /></div>
                    <span className="text-sm font-medium text-violet-700 dark:text-violet-400">Voice Navigation</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-violet-600 group-hover:text-violet-500 transition-colors" />
                </a>
                <a href="/weather-alerts" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-600"><Droplets className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Weather Alerts</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
                <a href="/returns" className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-500/10 text-red-600"><ArrowRightLeft className="h-4 w-4" /></div>
                    <span className="text-sm font-medium">Returns & Refunds</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </a>
              </div>
            </div>
          </ModernCard>

            {/* Get Started Card - Modern Empty State */}
            {stats.totalFarmers === 0 && (
              <ModernCard variant="outline" className="border-dashed border-2">
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Users className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Get Started</h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                    Start by registering your first farmer to begin collecting farm data
                  </p>
                  <Button className="gap-2">
                    <Users className="w-4 h-4" />
                    Add First Farmer
                  </Button>
                </div>
              </ModernCard>
            )}
          </div>
        </div>
      </DashboardLayout>
    </>
  );
}
