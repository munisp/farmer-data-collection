import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { RefreshCw, Download, TrendingUp, TrendingDown, Users, MessageSquare, DollarSign, Activity } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";

export default function Analytics() {
  const { user, isLoading: authLoading } = useAuth();
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0], // today
  });
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [showComparison, setShowComparison] = useState(false);

  // Fetch dashboard summary
  const { data: dashboard, isLoading, refetch } = trpc.analytics.getDashboardSummary.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // Fetch real-time metrics
  const { data: realtime, refetch: refetchRealtime } = trpc.analytics.getRealTimeMetrics.useQuery(undefined, {
    enabled: autoRefresh,
    refetchInterval: autoRefresh ? 30000 : false, // Refresh every 30 seconds when enabled
  });

  // Fetch historical trends
  const { data: trends, refetch: refetchTrends } = trpc.analytics.getHistoricalTrends.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    granularity,
  });

  // Calculate previous period dates for comparison
  const getPreviousPeriod = () => {
    const current = new Date(dateRange.endDate).getTime() - new Date(dateRange.startDate).getTime();
    const previousEnd = new Date(new Date(dateRange.startDate).getTime() - 24 * 60 * 60 * 1000);
    const previousStart = new Date(previousEnd.getTime() - current);
    return {
      currentStart: dateRange.startDate,
      currentEnd: dateRange.endDate,
      previousStart: previousStart.toISOString().split('T')[0],
      previousEnd: previousEnd.toISOString().split('T')[0],
    };
  };

  // Fetch period comparison
  const { data: comparison } = trpc.analytics.getPeriodComparison.useQuery(getPreviousPeriod(), {
    enabled: showComparison,
  });

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        refetch();
        refetchRealtime();
      }, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refetch, refetchRealtime]);

  const handleRefresh = () => {
    refetch();
    refetchRealtime();
    refetchTrends();
    toast.success("Dashboard refreshed");
  };

  const handleExport = () => {
    if (!dashboard) return;
    
    const csvData = [
      ["Analytics Dashboard Export"],
      ["Date Range", `${dateRange.startDate} to ${dateRange.endDate}`],
      [""],
      ["Overview"],
      ["Total Users", dashboard.overview.totalUsers],
      ["Active Users", dashboard.overview.activeUsers],
      ["Total Messages", dashboard.overview.totalMessages],
      ["Total Cost", `$${dashboard.overview.totalCost.toFixed(2)}`],
      [""],
      ["Channel Metrics"],
      ["Channel", "Total Messages", "Unique Users", "Success Rate", "Avg Response Time", "Cost Per Message", "Total Cost"],
      ...dashboard.channels.map(c => [
        c.channel,
        c.totalMessages,
        c.uniqueUsers,
        `${(c.successRate * 100).toFixed(1)}%`,
        `${c.avgResponseTime.toFixed(0)}ms`,
        `$${c.costPerMessage.toFixed(4)}`,
        `$${c.totalCost.toFixed(2)}`,
      ]),
    ];

    const csv = csvData.map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${dateRange.startDate}-to-${dateRange.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Analytics exported to CSV");
  };

  if (authLoading || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!dashboard) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <p className="text-muted-foreground">No analytics data available</p>
        </div>
      </DashboardLayout>
    );
  }

  // Prepare chart data
  const channelData = dashboard.channels.map(c => ({
    name: c.channel.toUpperCase(),
    messages: c.totalMessages,
    users: c.uniqueUsers,
    cost: c.totalCost,
    successRate: c.successRate * 100,
  }));

  const engagementData = [
    { name: "DAU", value: dashboard.engagement.dau, color: "#10b981" },
    { name: "WAU", value: dashboard.engagement.wau, color: "#3b82f6" },
    { name: "MAU", value: dashboard.engagement.mau, color: "#8b5cf6" },
  ];

  const featureData = dashboard.features.map(f => ({
    name: f.feature,
    usage: f.usageCount,
    users: f.uniqueUsers,
    successRate: f.successRate * 100,
  }));

  const costData = dashboard.costs.map(c => ({
    name: c.channel.toUpperCase(),
    totalCost: c.totalCost,
    costPerUser: c.costPerUser,
    roi: c.roi * 100,
  }));

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'];

  return (
    <DashboardLayout>
      <div role="main" aria-label="Page content" className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
            <p className="text-muted-foreground">Multi-channel usage metrics and insights</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <Activity className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
              {autoRefresh ? "Auto-Refresh ON" : "Auto-Refresh OFF"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Date Range Filter */}
        <Card>
          <CardHeader>
            <CardTitle>Date Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Start Date</label>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">End Date</label>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => refetch()}>Apply</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.overview.totalUsers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {dashboard.overview.activeUsers} active ({((dashboard.overview.activeUsers / dashboard.overview.totalUsers) * 100).toFixed(1)}%)
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.overview.totalMessages.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Across all channels
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${dashboard.overview.totalCost.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                ${(dashboard.overview.totalCost / dashboard.overview.totalMessages).toFixed(4)} per message
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Engagement Rate</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {((dashboard.overview.activeUsers / dashboard.overview.totalUsers) * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {dashboard.engagement.avgActionsPerSession.toFixed(1)} actions per session
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Real-Time Metrics */}
        {realtime && (
          <Card>
            <CardHeader>
              <CardTitle>Real-Time Activity (Last 5 Minutes)</CardTitle>
              <CardDescription>Live metrics updated every 30 seconds</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Users</p>
                  <p className="text-2xl font-bold">{realtime.activeUsers}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Messages/Min</p>
                  <p className="text-2xl font-bold">{realtime.messagesPerMinute.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Response Time</p>
                  <p className="text-2xl font-bold">{realtime.avgResponseTime.toFixed(0)}ms</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Channel Metrics Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Channel Usage Comparison</CardTitle>
            <CardDescription>Messages and users by channel</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={channelData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="messages" fill="#10b981" name="Messages" />
                <Bar dataKey="users" fill="#3b82f6" name="Unique Users" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* User Engagement Chart */}
        <Card>
          <CardHeader>
            <CardTitle>User Engagement Metrics</CardTitle>
            <CardDescription>Daily, Weekly, and Monthly Active Users</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={engagementData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {engagementData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">Day 1 Retention</p>
                <p className="text-xl font-bold">{(dashboard.engagement.retention.day1 * 100).toFixed(1)}%</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">Day 7 Retention</p>
                <p className="text-xl font-bold">{(dashboard.engagement.retention.day7 * 100).toFixed(1)}%</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">Day 30 Retention</p>
                <p className="text-xl font-bold">{(dashboard.engagement.retention.day30 * 100).toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feature Popularity Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Feature Popularity</CardTitle>
            <CardDescription>Most used features by farmers</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={featureData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={150} />
                <Tooltip />
                <Legend />
                <Bar dataKey="usage" fill="#8b5cf6" name="Total Usage" />
                <Bar dataKey="users" fill="#f59e0b" name="Unique Users" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cost Analysis Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Analysis by Channel</CardTitle>
            <CardDescription>Total cost and ROI comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="totalCost" fill="#ef4444" name="Total Cost ($)" />
                <Bar yAxisId="right" dataKey="roi" fill="#10b981" name="ROI (%)" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4">
              <h4 className="font-semibold mb-2">Cost Breakdown</h4>
              <div className="space-y-2">
                {costData.map((channel, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-sm">{channel.name}</span>
                    <div className="flex gap-4">
                      <span className="text-sm text-muted-foreground">
                        ${channel.totalCost.toFixed(2)} total
                      </span>
                      <span className="text-sm text-muted-foreground">
                        ${channel.costPerUser.toFixed(4)} per user
                      </span>
                      <span className={`text-sm font-medium ${channel.roi > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {channel.roi > 0 ? <TrendingUp className="h-4 w-4 inline" /> : <TrendingDown className="h-4 w-4 inline" />}
                        {channel.roi.toFixed(1)}% ROI
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Historical Trends Section */}
        {trends && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Historical Trends</h2>
              <div className="flex gap-2">
                <Button
                  variant={granularity === 'daily' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGranularity('daily')}
                >
                  Daily
                </Button>
                <Button
                  variant={granularity === 'weekly' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGranularity('weekly')}
                >
                  Weekly
                </Button>
                <Button
                  variant={granularity === 'monthly' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGranularity('monthly')}
                >
                  Monthly
                </Button>
              </div>
            </div>

            {/* Message Volume Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Message Volume Trend</CardTitle>
                <CardDescription>Track message activity over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trends.messageVolume}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="value" stroke="#10b981" name="Messages" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* User Growth Trend */}
            <Card>
              <CardHeader>
                <CardTitle>User Growth Trend</CardTitle>
                <CardDescription>New user registrations over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trends.userGrowth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="value" stroke="#3b82f6" name="New Users" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Cost Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Cost Trend</CardTitle>
                <CardDescription>Total messaging costs over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trends.costTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="value" stroke="#ef4444" name="Cost ($)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Engagement Rate Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Engagement Rate Trend</CardTitle>
                <CardDescription>Active user percentage over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trends.engagementRate}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="value" stroke="#8b5cf6" name="Engagement (%)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}

        {/* Period Comparison Section */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Period Comparison</h2>
          <Button
            variant={showComparison ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowComparison(!showComparison)}
          >
            {showComparison ? 'Hide' : 'Show'} Comparison
          </Button>
        </div>

        {showComparison && comparison && (
          <Card>
            <CardHeader>
              <CardTitle>Current vs Previous Period</CardTitle>
              <CardDescription>
                Comparing {dateRange.startDate} to {dateRange.endDate} vs previous period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {comparison.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-semibold">{item.metric}</h4>
                      <div className="flex gap-4 mt-2">
                        <div>
                          <p className="text-sm text-muted-foreground">Current</p>
                          <p className="text-lg font-bold">{item.currentValue.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Previous</p>
                          <p className="text-lg">{item.previousValue.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`flex items-center gap-1 ${item.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {item.changePercent >= 0 ? (
                          <TrendingUp className="h-5 w-5" />
                        ) : (
                          <TrendingDown className="h-5 w-5" />
                        )}
                        <span className="text-2xl font-bold">
                          {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.change >= 0 ? '+' : ''}{item.change.toFixed(0)} change
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
