import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  Milk, Beef, Heart, TrendingUp, ArrowRight, AlertTriangle,
  Calendar, DollarSign, BarChart3, Activity, Users, Truck,
  ShieldCheck, Store, Syringe, Baby, ClipboardList
} from "lucide-react";
import { useLocation } from "wouter";

/* ── SmartAlex-inspired circular icon ─────────────────────────── */
function DairyIcon({ icon: Icon, color = "teal", size = "md" }: {
  icon: typeof Milk;
  color?: "teal" | "amber" | "green" | "red" | "blue" | "purple";
  size?: "sm" | "md" | "lg";
}) {
  const colors = {
    teal: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    blue: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  };
  const sizes = { sm: "w-8 h-8 p-1.5", md: "w-12 h-12 p-2.5", lg: "w-16 h-16 p-3.5" };
  return (
    <div className={`rounded-full flex items-center justify-center ${colors[color]} ${sizes[size]}`}>
      <Icon className="w-full h-full" />
    </div>
  );
}

/* ── Before/After comparison row (SmartAlex style) ──────────── */
function TransformationRow({ label, before, after }: {
  label: string; before: string; after: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
      <div className="flex-1 text-right">
        <span className="text-xs text-red-500 dark:text-red-400 line-through">{before}</span>
      </div>
      <div className="flex flex-col items-center gap-0.5 min-w-[100px]">
        <span className="text-xs font-semibold text-foreground">{label}</span>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1">
        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{after}</span>
      </div>
    </div>
  );
}

/* ── KPI stat card ──────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, subtext, color = "teal" }: {
  icon: typeof Milk; label: string; value: string | number; subtext?: string;
  color?: "teal" | "amber" | "green" | "red" | "blue" | "purple";
}) {
  return (
    <Card className="dairy-card">
      <CardContent className="p-4 flex items-center gap-4">
        <DairyIcon icon={Icon} color={color} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DairyDashboard() {
  const [, navigate] = useLocation();
  const dashboardQuery = trpc.dairy.getDashboardSummary.useQuery(undefined, {
    retry: false,
  });

  const data = dashboardQuery.data;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">

        {/* ── Hero Banner (SmartAlex warm gradient) ─── */}
        <div className="dairy-hero rounded-2xl p-6 md:p-8 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <DairyIcon icon={Milk} color="teal" size="lg" />
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">
                  Dairy Management
                </h1>
                <p className="text-white/80 text-sm md:text-base">
                  Transforming dairy farming from guesswork into a professional, profitable industry
                </p>
              </div>
            </div>
          </div>
          {/* Decorative cow silhouette */}
          <div className="absolute right-4 bottom-2 opacity-10 text-white">
            <Beef className="w-32 h-32" />
          </div>
        </div>

        {/* ── KPI Stats Row ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Beef}
            label="Total Herd"
            value={data?.herd.totalCows ?? "—"}
            subtext={`${data?.herd.activeCows ?? 0} active`}
            color="teal"
          />
          <StatCard
            icon={Milk}
            label="Milk (30d)"
            value={data ? `${data.milk.totalLiters30d.toLocaleString()}L` : "—"}
            subtext={`${data?.milk.avgPerSession.toFixed(1) ?? 0}L avg/session`}
            color="blue"
          />
          <StatCard
            icon={DollarSign}
            label="Revenue (30d)"
            value={data ? `₦${(data.market.revenue30d / 100).toLocaleString()}` : "—"}
            subtext={`${data?.market.collections30d ?? 0} collections`}
            color="green"
          />
          <StatCard
            icon={AlertTriangle}
            label="Health Alerts"
            value={data?.health.unresolvedAlerts ?? "—"}
            subtext={`${data?.breeding.pregnantCows ?? 0} pregnant`}
            color={data?.health.unresolvedAlerts ? "red" : "amber"}
          />
        </div>

        {/* ── Tabbed Content ─── */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="dairy-tabs">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transformation">Value Chain</TabsTrigger>
            <TabsTrigger value="quicklinks">Quick Links</TabsTrigger>
          </TabsList>

          {/* ── Tab: Overview ─── */}
          <TabsContent value="overview">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Left: Challenges */}
              <Card className="dairy-card dairy-challenge-bg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="w-5 h-5" />
                    The Fragmentation Challenge
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <DairyIcon icon={TrendingUp} color="amber" size="sm" />
                    <div>
                      <p className="font-semibold text-sm text-foreground">Low Milk Productivity</p>
                      <p className="text-xs text-muted-foreground">
                        Weak breeding and feeding practices keep milk yields below potential.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <DairyIcon icon={ClipboardList} color="amber" size="sm" />
                    <div>
                      <p className="font-semibold text-sm text-foreground">Data Blind Spots</p>
                      <p className="text-xs text-muted-foreground">
                        Manual record-keeping prevents informed management decisions.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <DairyIcon icon={Users} color="amber" size="sm" />
                    <div>
                      <p className="font-semibold text-sm text-foreground">Disconnected Value Chain</p>
                      <p className="text-xs text-muted-foreground">
                        Lack of communication between farmers, suppliers, and buyers.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Right: Solutions */}
              <Card className="dairy-card dairy-solution-bg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-teal-800 dark:text-teal-200">
                    <ShieldCheck className="w-5 h-5" />
                    The Digital Solution
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <DairyIcon icon={BarChart3} color="teal" size="sm" />
                    <div>
                      <p className="font-semibold text-sm text-foreground">Data-Driven Herd Management</p>
                      <p className="text-xs text-muted-foreground">
                        Digital tracking of health, breeding, and daily milk production.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <DairyIcon icon={Store} color="teal" size="sm" />
                    <div>
                      <p className="font-semibold text-sm text-foreground">Integrated Supplier Marketplace</p>
                      <p className="text-xs text-muted-foreground">
                        Connect to verified feed, vet drugs, and breeding service providers.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <DairyIcon icon={Truck} color="teal" size="sm" />
                    <div>
                      <p className="font-semibold text-sm text-foreground">Direct Market Connectivity</p>
                      <p className="text-xs text-muted-foreground">
                        Links to buyers and processors for transparent pricing and reliable supply.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tab: Value Chain Transformation (SmartAlex before/after) ─── */}
          <TabsContent value="transformation">
            <Card className="dairy-card max-w-xl mx-auto">
              <CardHeader className="text-center">
                <CardTitle>Dairy Value Chain Transformation</CardTitle>
                <CardDescription>Before vs. After digital adoption</CardDescription>
              </CardHeader>
              <CardContent>
                <TransformationRow
                  label="Record Keeping"
                  before="Manual or None"
                  after="Digital & Automated"
                />
                <TransformationRow
                  label="Advisory Access"
                  before="Expensive / Inaccessible"
                  after="Direct Expert Connection"
                />
                <TransformationRow
                  label="Market Access"
                  before="Reliant on Middleman"
                  after="Direct Processor Links"
                />
                <TransformationRow
                  label="Breeding"
                  before="Untracked / Random"
                  after="AI-Tracked, Optimized"
                />
                <TransformationRow
                  label="Health Monitoring"
                  before="Reactive / Late"
                  after="Proactive Alerts"
                />
                <TransformationRow
                  label="Milk Quality"
                  before="No Testing"
                  after="Graded & Certified"
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Quick Links ─── */}
          <TabsContent value="quicklinks">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[
                { href: "/dairy-herd", icon: Beef, label: "Herd Management", desc: "Cow profiles & tracking", color: "teal" as const },
                { href: "/dairy-milk", icon: Milk, label: "Milk Production", desc: "Daily recording & analytics", color: "blue" as const },
                { href: "/dairy-breeding", icon: Baby, label: "Breeding Records", desc: "AI, pregnancy & calving", color: "purple" as const },
                { href: "/dairy-health", icon: Heart, label: "Health Monitoring", desc: "Vaccinations & treatments", color: "red" as const },
                { href: "/dairy-suppliers", icon: Store, label: "Supplier Marketplace", desc: "Feed, drugs & services", color: "amber" as const },
                { href: "/dairy-market", icon: Truck, label: "Market & Processors", desc: "Sell milk, schedule pickup", color: "green" as const },
                { href: "/dairy-analytics", icon: BarChart3, label: "Analytics", desc: "Yield trends & profitability", color: "blue" as const },
                { href: "/dairy-collection", icon: Calendar, label: "Milk Collection", desc: "Schedule & track pickups", color: "teal" as const },
              ].map(({ href, icon: ItemIcon, label, desc, color }) => (
                <Card
                  key={href}
                  className="dairy-card cursor-pointer hover:shadow-md transition-shadow group"
                  onClick={() => navigate(href)}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-3">
                    <DairyIcon icon={ItemIcon} color={color} size="lg" />
                    <div>
                      <p className="font-semibold text-sm text-foreground group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                        {label}
                      </p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
