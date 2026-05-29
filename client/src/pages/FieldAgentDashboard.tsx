import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDatabase } from "@/hooks/useDatabase";
import { farmers } from "@/db/schema";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { eq, and, gte, sql } from "drizzle-orm";
import { useLocation } from "wouter";
import {
  UserPlus,
  Users,
  Target,
  TrendingUp,
  Calendar,
  MapPin,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";

interface DailyStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  total: number;
  target: number;
}

export default function FieldAgentDashboard() {
  const { isInitialized, db } = useDatabase();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DailyStats>({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    total: 0,
    target: 20, // Daily target
  });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentFarmers, setRecentFarmers] = useState<any[]>([]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Back online - syncing data...");
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("You're offline - data will be saved locally");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check pending submissions
    const pending = localStorage.getItem("pendingFarmerSubmissions");
    if (pending) {
      setPendingCount(JSON.parse(pending).length);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    fetchStats();
  }, [isInitialized, db]);

  const fetchStats = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get all farmers for this user
      const allFarmers = await db
        .select()
        .from(farmers)
        .where(eq(farmers.userId, Number(user.id)));

      // Calculate stats
      const today = allFarmers.filter(
        (f: any) => new Date(f.registrationDate) >= todayStart
      ).length;
      const thisWeek = allFarmers.filter(
        (f: any) => new Date(f.registrationDate) >= weekStart
      ).length;
      const thisMonth = allFarmers.filter(
        (f: any) => new Date(f.registrationDate) >= monthStart
      ).length;

      setStats({
        today,
        thisWeek,
        thisMonth,
        total: allFarmers.length,
        target: 20,
      });

      // Get recent farmers (last 5)
      const recent = allFarmers
        .sort((a: any, b: any) => new Date(b.registrationDate).getTime() - new Date(a.registrationDate).getTime())
        .slice(0, 5);
      setRecentFarmers(recent);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
      toast.error("Failed to load statistics");
    } finally {
      setLoading(false);
    }
  };

  const progressPercentage = Math.min((stats.today / stats.target) * 100, 100);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Field Agent Dashboard</h1>
            <p className="text-muted-foreground mt-2">
              Track your data collection progress
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isOnline ? (
              <Badge variant="default" className="gap-2">
                <Wifi className="w-3 h-3" />
                Online
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-2">
                <WifiOff className="w-3 h-3" />
                Offline
              </Badge>
            )}
            {pendingCount > 0 && (
              <Badge variant="secondary">
                {pendingCount} pending sync
              </Badge>
            )}
          </div>
        </div>

        {/* Daily Target Progress */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Today's Progress</CardTitle>
                <CardDescription>
                  {stats.today} of {stats.target} farmers registered
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-4xl font-bold text-primary">{stats.today}</div>
                <p className="text-sm text-muted-foreground">registrations</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Target Progress</span>
                <span className="font-medium">{progressPercentage.toFixed(0)}%</span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
              {stats.today >= stats.target ? (
                <p className="text-sm text-green-600 flex items-center gap-2 mt-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Target achieved! Great work!
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-2">
                  {stats.target - stats.today} more to reach today's target
                </p>
              )}
            </div>
            <div className="mt-6">
              <Button
                onClick={() => navigate("/quick-farmer-registration")}
                className="w-full"
                size="lg"
              >
                <UserPlus className="w-5 h-5 mr-2" />
                Register New Farmer
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                This Week
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.thisWeek}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {(stats.thisWeek / 7).toFixed(1)} per day average
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.thisMonth}</div>
              <p className="text-sm text-muted-foreground mt-1">
                {((stats.thisMonth / new Date().getDate()) * 30).toFixed(0)} projected
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Total Farmers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
              <p className="text-sm text-muted-foreground mt-1">
                All time registrations
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Registrations */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Registrations</CardTitle>
            <CardDescription>Last 5 farmers you registered</CardDescription>
          </CardHeader>
          <CardContent>
            {recentFarmers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No farmers registered yet</p>
                <Button
                  className="mt-4"
                  onClick={() => navigate("/quick-farmer-registration")}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Register Your First Farmer
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentFarmers.map((farmer) => (
                  <div
                    key={farmer.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/farmers/${farmer.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {farmer.firstName} {farmer.lastName}
                        </p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {[farmer.village, farmer.district].filter(Boolean).join(", ") || "No location"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(farmer.registrationDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks for field agents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="justify-start h-auto py-4"
                onClick={() => navigate("/quick-farmer-registration")}
              >
                <UserPlus className="w-5 h-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Quick Registration</div>
                  <div className="text-xs text-muted-foreground">
                    Fast farmer data entry
                  </div>
                </div>
              </Button>

              <Button
                variant="outline"
                className="justify-start h-auto py-4"
                onClick={() => navigate("/farmers-enhanced")}
              >
                <Users className="w-5 h-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">View All Farmers</div>
                  <div className="text-xs text-muted-foreground">
                    Search and manage
                  </div>
                </div>
              </Button>

              <Button
                variant="outline"
                className="justify-start h-auto py-4"
                onClick={() => navigate("/farmers-map")}
              >
                <MapPin className="w-5 h-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">Map View</div>
                  <div className="text-xs text-muted-foreground">
                    See farmer locations
                  </div>
                </div>
              </Button>

              <Button
                variant="outline"
                className="justify-start h-auto py-4"
                onClick={() => navigate("/reports")}
              >
                <Target className="w-5 h-5 mr-3" />
                <div className="text-left">
                  <div className="font-medium">My Reports</div>
                  <div className="text-xs text-muted-foreground">
                    Performance metrics
                  </div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
