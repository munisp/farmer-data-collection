import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  ShieldAlert,
  DollarSign,
  TrendingUp,
  Search,
  MoreVertical,
  Ban,
  CheckCircle,
  AlertTriangle,
  Activity,
  Database,
  Server,
  Loader2,
  FileText,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function AdminDashboard() {
  const [searchTerm, setSearchTerm] = useState("");

  const usersQuery = trpc.admin.getUsers.useQuery({ page: 1, pageSize: 10, search: searchTerm.trim() || undefined });
  const analyticsQuery = trpc.admin.getSystemAnalytics.useQuery();
  const auditLogsQuery = trpc.admin.getAuditLogs.useQuery({ page: 1, pageSize: 5 });
  const moderationOverviewQuery = trpc.moderationAnalytics.getOverview.useQuery();
  const moderationQueueQuery = trpc.moderationAnalytics.getModerationQueue.useQuery({ limit: 5, offset: 0 });

  const isLoading =
    usersQuery.isLoading ||
    analyticsQuery.isLoading ||
    auditLogsQuery.isLoading ||
    moderationOverviewQuery.isLoading ||
    moderationQueueQuery.isLoading;

  const stats = useMemo(() => {
    const analytics = analyticsQuery.data;
    const moderation = moderationOverviewQuery.data;

    return {
      totalUsers: analytics?.totals.users || 0,
      activeUsers: analytics?.activity.activeUsers || 0,
      totalListingsUnderReview: moderation?.total || 0,
      flaggedListings: moderation?.flagged || 0,
      totalRevenue: analytics?.totals.totalExpenseAmount || 0,
      monthlyGrowth: analytics?.activity.newUsersThisMonth || 0,
    };
  }, [analyticsQuery.data, moderationOverviewQuery.data]);

  const recentUsers = usersQuery.data?.users || [];
  const moderationQueue = moderationQueueQuery.data || [];
  const auditLogs = auditLogsQuery.data?.logs || [];

  const systemHealth = useMemo(() => {
    const auditTotal = auditLogsQuery.data?.total || auditLogs.length;
    const activeUsers = analyticsQuery.data?.activity.activeUsers || 0;
    const flagged = moderationOverviewQuery.data?.flagged || 0;
    const totalModeration = moderationOverviewQuery.data?.total || 1;
    const reviewHealth = totalModeration > 0 ? Math.max(5, Math.min(95, Math.round((flagged / totalModeration) * 100))) : 5;

    return {
      apiStatus: flagged > 20 ? "warning" : "healthy",
      databaseStatus: analyticsQuery.data ? "healthy" : "warning",
      storageUsage: reviewHealth,
      activeConnections: auditTotal + activeUsers,
    };
  }, [analyticsQuery.data, auditLogs.length, auditLogsQuery.data?.total, moderationOverviewQuery.data]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
      case "healthy":
      case "published":
        return "bg-green-100 text-green-800";
      case "pending":
      case "warning":
      case "flagged":
        return "bg-yellow-100 text-yellow-800";
      case "suspended":
      case "hidden":
      case "inactive":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
      case "healthy":
      case "published":
        return <CheckCircle className="w-4 h-4" />;
      case "pending":
      case "warning":
      case "flagged":
        return <AlertTriangle className="w-4 h-4" />;
      case "suspended":
      case "hidden":
      case "inactive":
        return <Ban className="w-4 h-4" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage users, review flagged marketplace content, and monitor live operational activity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.activeUsers} active in the last 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Moderation Queue</CardTitle>
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalListingsUnderReview}</div>
              <p className="text-xs text-yellow-600 mt-1">{stats.flaggedListings} flagged for review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Tracked Expense Volume</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</div>
              <p className="text-xs text-muted-foreground mt-1">Aggregated recorded expenses</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">New Users This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">+{stats.monthlyGrowth}</div>
              <p className="text-xs text-muted-foreground mt-1">Recent account growth</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Recent users from the live admin directory</CardDescription>
                  </div>
                  <Button variant="outline">View All Users</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      aria-label="Search" placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table role="table" aria-label="Data table" className="w-full">
                    <thead role="rowgroup">
                      <tr className="border-b">
                        <th className="text-left py-3 px-2">User</th>
                        <th className="text-left py-3 px-2">Role</th>
                        <th className="text-left py-3 px-2">Status</th>
                        <th className="text-left py-3 px-2">Joined</th>
                        <th className="text-right py-3 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {recentUsers.map((user: any) => {
                        const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
                        const status = user.isActive === false ? "inactive" : "active";
                        return (
                          <tr key={user.id} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-2">
                              <div>
                                <div className="font-medium">{name}</div>
                                <div className="text-sm text-muted-foreground">{user.email}</div>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <Badge variant="outline">{user.role}</Badge>
                            </td>
                            <td className="py-3 px-2">
                              <Badge className={`flex items-center gap-1 w-fit ${getStatusColor(status)}`}>
                                {getStatusIcon(status)}
                                {status}
                              </Badge>
                            </td>
                            <td className="py-3 px-2 text-sm">{formatDate(user.createdAt)}</td>
                            <td className="py-3 px-2 text-right">
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Flagged Marketplace Reviews</CardTitle>
                    <CardDescription>Live moderation queue requiring administrative attention</CardDescription>
                  </div>
                  <Badge variant="secondary">{moderationQueue.length} queued</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {moderationQueue.map((item: any) => {
                    const reviewer = [item.userFirstName, item.userLastName].filter(Boolean).join(" ") || item.userEmail || `User #${item.userId}`;
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-4 p-3 border rounded-lg">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold truncate">{item.title || `Review #${item.id}`}</h4>
                          <p className="text-sm text-muted-foreground truncate">
                            by {reviewer} • rating {item.rating}/5 • {formatDate(item.createdAt)}
                          </p>
                          <p className="text-sm mt-1 truncate">{item.comment || "No comment provided."}</p>
                        </div>
                        <div className="flex gap-2 items-center">
                          <Badge className={getStatusColor(item.status)}>{item.status}</Badge>
                          <Button size="sm" variant="outline">
                            <FileText className="w-4 h-4 mr-1" />Review
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">API Status</span>
                  <Badge className={getStatusColor(systemHealth.apiStatus)}>
                    <Server className="w-3 h-3 mr-1" />
                    {systemHealth.apiStatus}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Database</span>
                  <Badge className={getStatusColor(systemHealth.databaseStatus)}>
                    <Database className="w-3 h-3 mr-1" />
                    {systemHealth.databaseStatus}
                  </Badge>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">Moderation Load</span>
                    <span className="text-sm font-semibold">{systemHealth.storageUsage}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${systemHealth.storageUsage}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm">Observed Activity</span>
                  <span className="text-sm font-semibold">{systemHealth.activeConnections}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <Users className="w-4 h-4 mr-2" />
                  Manage Users
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <ShieldAlert className="w-4 h-4 mr-2" />
                  Review Moderation Queue
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="w-4 h-4 mr-2" />
                  View Audit Logs
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Activity className="w-4 h-4 mr-2" />
                  System Analytics
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {auditLogs.map((log: any) => (
                    <div key={log.id} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{log.eventType}</p>
                        <p className="text-muted-foreground text-xs truncate">
                          {log.entityType} #{log.entityId} • {formatDate(log.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
