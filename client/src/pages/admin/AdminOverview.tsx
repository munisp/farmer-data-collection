import { trpc } from "@/lib/trpc";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Database, TrendingUp, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export default function AdminOverview() {
  const { data: analytics, isLoading } = trpc.admin.getSystemAnalytics.useQuery();

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <h1 className="text-3xl font-bold">System Overview</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!analytics) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Failed to load analytics</p>
        </div>
      </AdminLayout>
    );
  }

  const stats = [
    {
      title: "Total Users",
      value: analytics.totals.users,
      icon: Users,
      color: "text-blue-500",
    },
    {
      title: "Total Farmers",
      value: analytics.totals.farmers,
      icon: Database,
      color: "text-green-500",
    },
    {
      title: "Active Users (7d)",
      value: analytics.activity.activeUsers,
      icon: Activity,
      color: "text-purple-500",
    },
    {
      title: "New Users (Month)",
      value: analytics.activity.newUsersThisMonth,
      icon: TrendingUp,
      color: "text-orange-500",
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">System Overview</h1>
          <p className="text-muted-foreground mt-1">Monitor platform health and activity</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Data Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Data Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Farms</span>
                  <span className="font-semibold">{analytics.totals.farms}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Crops</span>
                  <span className="font-semibold">{analytics.totals.crops}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Livestock</span>
                  <span className="font-semibold">{analytics.totals.livestock}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Harvests</span>
                  <span className="font-semibold">{analytics.totals.harvests}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Expenses</span>
                  <span className="font-semibold">{analytics.totals.expenses}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Users by Role</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={analytics.usersByRole}
                    dataKey="count"
                    nameKey="role"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry) => `${entry.role}: ${entry.count}`}
                  >
                    {analytics.usersByRole.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={[
                          "hsl(var(--chart-1))",
                          "hsl(var(--chart-2))",
                          "hsl(var(--chart-3))",
                          "hsl(var(--chart-4))",
                        ][index % 4]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Financial Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Financial Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Total Expenses</span>
              <span className="text-2xl font-bold text-foreground">
                ${analytics.totals.totalExpenseAmount.toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
