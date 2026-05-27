import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDatabase } from "@/hooks/useDatabase";
import { farmers, farms, crops, livestock, harvests, expenses } from "@/db/schema";
import { count, eq } from "drizzle-orm";
import { Users, Tractor, Sprout, Beef, TrendingUp, Receipt, DollarSign, TrendingDown, Brain, Target, ArrowRight, Activity, Zap, Satellite, Droplets, Leaf } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTutorial } from "@/contexts/TutorialContext";
import { OnboardingTutorial } from "@/components/OnboardingTutorial";
import { tutorialSteps } from "@/config/tutorialSteps";
import { Loader2 } from "lucide-react";
import { WeatherCard } from "@/components/WeatherCard";
import MLInsightsWidget from "@/components/MLInsightsWidget";
import { NearbyFarmsWidget } from "@/components/NearbyFarmsWidget";
import { WebSocketStatusWidget, RecentEventsWidget, ActiveAlertsWidget } from "@/components/RealtimeWidgets";
import { PageHeader, PageSection } from "@/components/ui/page-header";
import { StatsCard, StatsGrid } from "@/components/ui/stats-card";
import { ModernCard, CardHeader as ModernCardHeader } from "@/components/ui/modern-card";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";

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
  const { isInitialized, error, db } = useDatabase();
  const { user } = useAuth();
  const { showTutorial, completeTutorial, skipTutorial } = useTutorial();
  const { formatCurrency } = useLocalization();
  const [stats, setStats] = useState<Stats>({
    totalFarmers: 0,
    totalFarms: 0,
    totalCrops: 0,
    totalLivestock: 0,
    totalHarvests: 0,
    totalExpenses: 0,
    totalRevenue: 0,
    netProfit: 0,
    profitMargin: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadTimeout, setLoadTimeout] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoadTimeout(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isInitialized || !user) return;

    const fetchStats = async () => {
      try {
        const [farmerCount, farmCount, cropCount, livestockCount, harvestCount, expenseCount] = await Promise.all([
          db.select({ count: count() }).from(farmers).where(eq(farmers.userId, Number(user.id))),
          db.select({ count: count() }).from(farms).where(eq(farms.userId, Number(user.id))),
          db.select({ count: count() }).from(crops).where(eq(crops.userId, Number(user.id))),
          db.select({ count: count() }).from(livestock).where(eq(livestock.userId, Number(user.id))),
          db.select({ count: count() }).from(harvests).where(eq(harvests.userId, Number(user.id))),
          db.select({ count: count() }).from(expenses).where(eq(expenses.userId, Number(user.id))),
        ]);

        // Calculate financial metrics
        const expensesData = await db.select().from(expenses).where(eq(expenses.userId, Number(user.id)));
        const totalExpensesAmount = expensesData.reduce((sum: number, exp: any) => sum + exp.amount, 0) / 100;

        const harvestsData = await db
          .select({
            quantity: harvests.quantity,
            pricePerUnit: crops.pricePerUnit,
          })
          .from(harvests)
          .innerJoin(crops, eq(harvests.cropId, crops.id))
          .where(eq(harvests.userId, Number(user.id)));

        const totalRevenue = harvestsData.reduce((sum: number, h: any) => {
          const quantity = parseFloat(h.quantity as string) || 0;
          const price = (h.pricePerUnit || 1000) / 100;
          return sum + (quantity * price);
        }, 0);

        const netProfit = totalRevenue - totalExpensesAmount;
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        setStats({
          totalFarmers: farmerCount[0]?.count || 0,
          totalFarms: farmCount[0]?.count || 0,
          totalCrops: cropCount[0]?.count || 0,
          totalLivestock: livestockCount[0]?.count || 0,
          totalHarvests: harvestCount[0]?.count || 0,
          totalExpenses: expenseCount[0]?.count || 0,
          totalRevenue,
          netProfit,
          profitMargin,
        });
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [isInitialized, db]);

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Database Error</CardTitle>
              <CardDescription>Failed to initialize the database</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if ((!isInitialized || loading) && !loadTimeout) {
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
              <RecentEventsWidget />
              <ActiveAlertsWidget />
            </div>
          </PageSection>

          {/* Weather & AI Insights - Modern Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WeatherCard 
              latitude={40.7128} 
              longitude={-74.0060} 
              locationName="Default Location" 
            />
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
                      <div className="p-2 rounded-lg bg-green-500/20 text-green-600">
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
