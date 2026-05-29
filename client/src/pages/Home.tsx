import { useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import {
  Users,
  MapPin,
  TrendingUp,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  Menu,
  Bell,
  Search,
  Sprout,
  BarChart3,
  FileText,
  Loader2,
  Tractor,
  Receipt,
} from "lucide-react";

function formatRelativeDate(value: string | Date | null | undefined) {
  if (!value) return "Just now";

  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const userId = Number(user?.id || 0);

  const statsQuery = trpc.dashboard.getStats.useQuery(
    { userId },
    {
      enabled: Number.isFinite(userId) && userId > 0,
      retry: false,
      staleTime: 30_000,
      refetchOnMount: false,
    }
  );
  const activityQuery = trpc.dashboard.getRecentActivities.useQuery(
    { userId, limit: 6 },
    {
      enabled: Number.isFinite(userId) && userId > 0,
      retry: false,
      staleTime: 30_000,
      refetchOnMount: false,
    }
  );

  const stats = useMemo(() => {
    const data = statsQuery.data;
    const totalFarmers = data?.farmers || 0;
    const activeToday = (data?.harvests || 0) + (data?.expenses || 0);
    const pendingSync = 0;
    const completionBase = (data?.farms || 0) + (data?.crops || 0) + (data?.livestock || 0);
    const completionRate = completionBase > 0 ? Math.min(100, Math.round((totalFarmers / completionBase) * 100)) : 0;

    return {
      totalFarmers,
      activeToday,
      pendingSync,
      completionRate,
      farms: data?.farms || 0,
      crops: data?.crops || 0,
      livestock: data?.livestock || 0,
      totalExpenses: data?.totalExpenses || 0,
      totalHarvests: data?.totalHarvests || 0,
    };
  }, [statsQuery.data]);

  const recentActivity = useMemo(() => {
    return (activityQuery.data || []).map((activity, index: number) => ({
      id: index + 1,
      name: user?.firstName || user?.email || "Current user",
      action: activity.description,
      time: formatRelativeDate(activity.date),
      status: "synced",
      type: activity.type,
    }));
  }, [activityQuery.data, user?.email, user?.firstName]);

  const quickActions = [
    { icon: Plus, label: "Add Farmer", color: "bg-emerald-500", onClick: () => setLocation("/farmers") },
    { icon: MapPin, label: "Map View", color: "bg-blue-500", onClick: () => setLocation("/farmers-map") },
    { icon: FileText, label: "Reports", color: "bg-purple-500", onClick: () => setLocation("/reports") },
    { icon: BarChart3, label: "Analytics", color: "bg-orange-500", onClick: () => setLocation("/analytics") },
  ];

  const isQueryPending = (statsQuery.isLoading && !statsQuery.isError) ||
    (activityQuery.isLoading && !activityQuery.isError);

  if (!user) {
    return (
      <div role="main" aria-label="Page content" className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-600 mx-auto" />
          <p className="mt-3 text-sm text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-emerald-100">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                <Sprout className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900">FarmCollect</h1>
                <p className="text-xs text-gray-500">{user.firstName || user.email || "Field Agent"}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-10 w-10 relative">
              <Bell className="h-5 w-5" />
              {recentActivity.length > 0 && <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full"></span>}
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10">
              <Search className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="pb-20">
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-white rounded-full animate-pulse"></div>
              <span className="text-sm font-medium">Operational Dashboard Live</span>
            </div>
            {stats.pendingSync > 0 ? (
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                {stats.pendingSync} pending
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-white/20 text-white border-0">
                Synced
              </Badge>
            )}
          </div>
        </div>

        <div className="px-4 py-6 grid grid-cols-2 gap-3">
          <Card className="border-emerald-100 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Tracked Farmers</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalFarmers}</p>
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {stats.farms} farms recorded
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Users className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-100 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Recent Records</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.activeToday}</p>
                  <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Harvests and expenses
                  </p>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="px-4 pb-6 grid grid-cols-1 gap-3">
          <Card className="border-purple-100 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Profile Coverage</CardTitle>
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-0">
                  {stats.completionRate}%
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Based on linked farms, crops, and livestock records for the current account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={stats.completionRate} className="h-2" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <Card className="border-gray-100 shadow-sm">
              <CardContent className="p-4 text-center">
                <Tractor className="h-5 w-5 text-emerald-600 mx-auto mb-2" />
                <p className="text-xl font-bold">{stats.farms}</p>
                <p className="text-xs text-muted-foreground">Farms</p>
              </CardContent>
            </Card>
            <Card className="border-gray-100 shadow-sm">
              <CardContent className="p-4 text-center">
                <Sprout className="h-5 w-5 text-green-600 mx-auto mb-2" />
                <p className="text-xl font-bold">{stats.crops}</p>
                <p className="text-xs text-muted-foreground">Crops</p>
              </CardContent>
            </Card>
            <Card className="border-gray-100 shadow-sm">
              <CardContent className="p-4 text-center">
                <Receipt className="h-5 w-5 text-orange-600 mx-auto mb-2" />
                <p className="text-xl font-bold">{Math.round(stats.totalExpenses / 100)}</p>
                <p className="text-xs text-muted-foreground">Expense Value</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="px-4 pb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white border border-gray-100 shadow-sm active:scale-95 transition-transform"
                onClick={action.onClick}
              >
                <div className={`h-12 w-12 rounded-full ${action.color} flex items-center justify-center`}>
                  <action.icon className="h-6 w-6 text-white" />
                </div>
                <span className="text-xs font-medium text-gray-700 text-center">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-emerald-600" onClick={() => setLocation("/dashboard")}>
              View Full Dashboard
            </Button>
          </div>
          <div className="space-y-2">
            {recentActivity.map((activity) => (
              <Card key={activity.id} className="border-gray-100 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0">
                      <Users className="h-5 w-5 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{activity.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{activity.action}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-400">{activity.time}</span>
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-0 text-xs h-5">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {activity.type}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>

      <nav role="navigation" aria-label="Navigation" className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 safe-area-inset-bottom">
        <div className="flex items-center justify-around max-w-md mx-auto">
          <button className="flex flex-col items-center gap-1 py-2 px-4 text-emerald-600" onClick={() => setLocation("/")}>
            <BarChart3 className="h-5 w-5" />
            <span className="text-xs font-medium">Dashboard</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2 px-4 text-gray-400" onClick={() => setLocation("/farmers")}>
            <Users className="h-5 w-5" />
            <span className="text-xs font-medium">Farmers</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2 px-4 text-gray-400" onClick={() => setLocation("/farmers-map")}>
            <MapPin className="h-5 w-5" />
            <span className="text-xs font-medium">Map</span>
          </button>
          <button className="flex flex-col items-center gap-1 py-2 px-4 text-gray-400" onClick={() => setLocation("/reports")}>
            <FileText className="h-5 w-5" />
            <span className="text-xs font-medium">Reports</span>
          </button>
        </div>
      </nav>

      <button
        className="fixed bottom-20 right-4 h-14 w-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        onClick={() => setLocation("/farmers")}
      >
        <Plus className="h-6 w-6 text-white" />
      </button>
    </div>
  );
}
